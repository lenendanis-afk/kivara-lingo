/**
 * Yomitan-compatible dictionary pack importer + lookup.
 *
 * A Yomitan pack is a ZIP file with this layout:
 *
 *   index.json                        — metadata (title, revision, format, …)
 *   term_bank_1.json                  — array of 8-tuples, see below
 *   term_bank_2.json                  — …
 *   …
 *   term_meta_bank_1.json             — optional frequency / pitch data
 *   kanji_bank_1.json                 — optional (JP only)
 *
 * Each term_bank entry is the 8-tuple:
 *   [ expression, reading, definitionTags, deinflectionRules,
 *     popularity, definitions, sequence, termTags ]
 *
 * `definitions` is either:
 *   • an array of plain strings (older "format: 1" packs), or
 *   • an array of structured "content" objects (format >= 3, with
 *     {type: "structured-content", content: [...]} entries).
 *
 * We store each entry as a `DictTermRow` and surface lookups via
 * `lookupYomitanTerm()` which returns the highest-popularity hit across all
 * enabled packs.
 *
 * Reference: https://github.com/yomidevs/yomitan/blob/master/docs/dictionaries.md
 */
import { unzipSync, strFromU8 } from 'fflate';
import { getDB } from '../../shared/db';
import type { DictPackRow, DictTermRow } from '../../shared/db';
import type { DictionaryEntry } from '../../shared/types';
import { lemmaCandidates } from './lemma';

/** Yomitan term_bank entry tuple. */
export type YomitanTermTuple = [
  expression: string,
  reading: string,
  definitionTags: string | null,
  deinflectionRules: string,
  popularity: number,
  definitions: unknown[],
  sequence: number,
  termTags: string | null,
];

export interface YomitanIndex {
  title?: string;
  revision?: string;
  format?: number;
  version?: number;
  author?: string;
  description?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface ImportResult {
  ok: true;
  pack: DictPackRow;
  termsImported: number;
}

export interface ImportError {
  ok: false;
  error: string;
}

/** Cheap deterministic id derived from title + revision. */
function packId(title: string, revision: string): string {
  const input = `${title}|${revision}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return `pack-${(hash >>> 0).toString(16)}`;
}

/**
 * Parse a `.zip` Yomitan pack and write its entries into IndexedDB.
 *
 * Importing the same (title, revision) twice will overwrite the previous
 * entries (the pack id is deterministic, so we delete-then-insert the term
 * rows atomically in a transaction).
 */
export async function importYomitanPack(
  zipBytes: ArrayBuffer | Uint8Array,
): Promise<ImportResult | ImportError> {
  let files: Record<string, Uint8Array>;
  try {
    const bytes = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes);
    files = unzipSync(bytes);
  } catch (err) {
    return { ok: false, error: `Could not unzip pack: ${(err as Error).message}` };
  }

  // index.json may live at the root OR inside a folder (some packs ship as
  // "pack-name/index.json"). Find whichever path ends with "index.json".
  const indexEntry = Object.entries(files).find(([name]) => name.endsWith('index.json'));
  if (!indexEntry) {
    return { ok: false, error: 'Missing index.json in pack' };
  }
  const indexPrefix = indexEntry[0].replace(/index\.json$/, '');
  let index: YomitanIndex;
  try {
    index = JSON.parse(strFromU8(indexEntry[1])) as YomitanIndex;
  } catch (err) {
    return { ok: false, error: `Bad index.json: ${(err as Error).message}` };
  }

  const title = (index.title || '').trim();
  const revision = (index.revision || '').trim();
  if (!title) return { ok: false, error: 'index.json missing "title"' };
  if (!revision) return { ok: false, error: 'index.json missing "revision"' };
  const format = Number(index.format ?? index.version ?? 1);
  const sourceLang = index.sourceLanguage || 'en';
  const targetLang = index.targetLanguage || 'es';
  const id = packId(title, revision);

  // Parse every term_bank_*.json file under the same prefix.
  const termBankFiles = Object.entries(files)
    .filter(([name]) => name.startsWith(indexPrefix) && /term_bank_\d+\.json$/.test(name))
    .sort();
  if (termBankFiles.length === 0) {
    return { ok: false, error: 'No term_bank_*.json files in pack' };
  }

  const termRows: DictTermRow[] = [];
  for (const [name, bytes] of termBankFiles) {
    try {
      const arr = JSON.parse(strFromU8(bytes)) as YomitanTermTuple[];
      for (const t of arr) {
        if (!Array.isArray(t) || t.length < 6) continue;
        const expression = String(t[0] ?? '')
          .trim()
          .toLowerCase();
        if (!expression) continue;
        const reading = String(t[1] ?? '').trim();
        const definitionTags = (t[2] as string | null) ?? undefined;
        const popularity = Number(t[4] ?? 0) || 0;
        const definitions = Array.isArray(t[5]) ? t[5] : [];
        const termTags = (t[7] as string | null) ?? undefined;
        termRows.push({
          packId: id,
          expression,
          reading: reading || undefined,
          definitions,
          popularity,
          definitionTags: definitionTags || undefined,
          termTags: termTags || undefined,
        });
      }
    } catch (err) {
      return { ok: false, error: `Could not parse ${name}: ${(err as Error).message}` };
    }
  }

  if (termRows.length === 0) {
    return { ok: false, error: 'Pack contains zero usable terms' };
  }

  const pack: DictPackRow = {
    id,
    title,
    revision,
    format,
    sourceLang,
    targetLang,
    termCount: termRows.length,
    enabled: true,
    author: index.author,
    description: index.description,
    createdAt: Date.now(),
  };

  const db = getDB();
  // Atomic replace: delete any existing terms for this pack id, then insert
  // the fresh batch in one transaction so we never have a half-imported pack.
  await db.transaction('rw', db.dict_packs, db.dict_terms, async () => {
    await db.dict_terms.where('packId').equals(id).delete();
    // Chunk inserts — IndexedDB throws when single-batch bulks are too large
    // (~30 MB), and big Yomitan packs (Jitendex etc.) can ship 500k+ terms.
    const CHUNK = 5000;
    for (let i = 0; i < termRows.length; i += CHUNK) {
      await db.dict_terms.bulkAdd(termRows.slice(i, i + CHUNK));
    }
    await db.dict_packs.put(pack);
  });

  return { ok: true, pack, termsImported: termRows.length };
}

/** Delete a pack and all of its term rows. */
export async function deleteYomitanPack(id: string): Promise<void> {
  const db = getDB();
  await db.transaction('rw', db.dict_packs, db.dict_terms, async () => {
    await db.dict_terms.where('packId').equals(id).delete();
    await db.dict_packs.delete(id);
  });
}

/** Toggle a pack's `enabled` flag without touching its terms. */
export async function setPackEnabled(id: string, enabled: boolean): Promise<void> {
  await getDB().dict_packs.update(id, { enabled });
}

/** List installed packs (in install order). */
export async function listYomitanPacks(): Promise<DictPackRow[]> {
  return getDB().dict_packs.orderBy('createdAt').toArray();
}

/**
 * Look up a term across all *enabled* packs in the given source language.
 *
 * Returns the highest-popularity match (ties broken by pack install order).
 * Lemma-aware: if the literal token has no hit, we walk lemma candidates and
 * return the first match so "running" can find "run".
 */
export async function lookupYomitanTerm(
  token: string,
  lang = 'en',
): Promise<{ entry: DictionaryEntry; pack: DictPackRow } | undefined> {
  const db = getDB();
  // 1. List enabled packs for the right source language.
  const allPacks = await db.dict_packs.where('enabled').equals(1 as unknown as number).toArray()
    .catch(async () =>
      // older Dexie indexes booleans as 0/1 — fall back to scan if the index
      // returns nothing (some Chrome versions reject the boolean cast above).
      (await db.dict_packs.toArray()).filter((p) => p.enabled),
    );
  const packs = allPacks.filter((p) => p.sourceLang === lang || p.sourceLang.startsWith(lang));
  if (packs.length === 0) return undefined;
  const packIds = new Set(packs.map((p) => p.id));

  // 2. Try literal then lemma candidates.
  const candidates = lang === 'en' ? lemmaCandidates(token) : [token.trim().toLowerCase()];
  for (let i = 0; i < candidates.length; i += 1) {
    const exp = candidates[i];
    if (!exp) continue;
    const rows = await db.dict_terms.where('expression').equals(exp).toArray();
    const filtered = rows.filter((r) => packIds.has(r.packId));
    if (filtered.length === 0) continue;
    // Highest popularity wins; ties broken by earliest install.
    filtered.sort((a, b) => {
      if (a.popularity !== b.popularity) return b.popularity - a.popularity;
      const pa = packs.findIndex((p) => p.id === a.packId);
      const pb = packs.findIndex((p) => p.id === b.packId);
      return pa - pb;
    });
    const hit = filtered[0];
    const pack = packs.find((p) => p.id === hit.packId)!;
    return {
      pack,
      entry: dictTermToEntry(token, hit, i > 0 ? exp : undefined),
    };
  }
  return undefined;
}

/**
 * Flatten a Yomitan term row into our internal `DictionaryEntry` shape so the
 * popover doesn't need to know about Yomitan internals.
 *
 * Yomitan definitions can be:
 *   • plain strings (legacy format 1)                   → joined with " · "
 *   • structured-content objects (format 3)             → text extracted recursively
 *   • {type:"text", text:"…"} singletons                → text used directly
 *   • {type:"image", …}                                 → ignored
 *
 * We surface the first sense as `monolingual` and the rest as `bilingual` so
 * the popover renders meaningfully even when the pack doesn't ship explicit
 * fields.
 */
function dictTermToEntry(
  surfaceToken: string,
  row: DictTermRow,
  lemmaOf?: string,
): DictionaryEntry {
  const senses = row.definitions.map(extractDefinitionText).filter((s) => s.length > 0);
  const translation = senses[0] ?? '—';
  const bilingual = senses.length > 1 ? senses.slice(1, 4).join(' · ') : undefined;
  return {
    token: surfaceToken,
    type: 'word',
    phonetic: row.reading || undefined,
    translation,
    bilingual,
    monolingual: senses.length === 1 ? undefined : senses[0],
    examples: undefined,
    lemmaOf,
  };
}

/**
 * Walk a Yomitan definition entry and pull plain text out of it.
 *
 * Yomitan's structured-content can nest arbitrarily; we do a depth-first
 * collect of every `.text` leaf plus any "tag === 'span' / 'div'" wrappers.
 */
function extractDefinitionText(d: unknown): string {
  if (typeof d === 'string') return d.trim();
  if (!d || typeof d !== 'object') return '';
  const obj = d as { type?: string; text?: string; content?: unknown; structuredContent?: unknown };
  if (obj.type === 'text' && obj.text) return obj.text.trim();
  if (obj.text) return obj.text.trim();
  if (obj.type === 'structured-content' && obj.content) {
    return extractDefinitionText(obj.content);
  }
  if (obj.structuredContent) {
    return extractDefinitionText(obj.structuredContent);
  }
  if (Array.isArray(obj)) {
    return (obj as unknown[]).map(extractDefinitionText).filter(Boolean).join(' ');
  }
  if (Array.isArray(obj.content)) {
    return (obj.content as unknown[]).map(extractDefinitionText).filter(Boolean).join(' ');
  }
  return '';
}
