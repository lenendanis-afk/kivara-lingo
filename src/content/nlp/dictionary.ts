import enDict from '../../assets/dictionaries/en.json';
import enMwes from '../../assets/mwes/en.json';
import type { DictionaryEntry } from '../../shared/types';
import { lemmaCandidates } from './lemma';

/**
 * Merged dictionary: the bundled single-word entries (`en.json`) plus the
 * MWE registry (`mwes/en.json`). The MWE registry is generated offline from
 * OpenSubtitles frequency data and adds ~150 common phrasal verbs + idioms
 * that the original hand-curated dictionary didn't cover.
 *
 * The spread order means: if a key exists in both (e.g. `"these days"`), the
 * `enDict` version wins — it has richer metadata (phonetics, examples).
 * The `enMwes` version is used only when a phrase isn't already in `enDict`.
 */
const mergedEnDict: Record<string, DictionaryEntry> = {
  ...(enMwes as Record<string, DictionaryEntry>),
  ...(enDict as Record<string, DictionaryEntry>),
};

const DICTIONARIES: Record<string, Record<string, DictionaryEntry>> = {
  en: mergedEnDict,
};

/**
 * Strip TMX/XLIFF placeholder tags (`<g id="…">…</g>`) and any other stray
 * HTML/XML markup from a translation string. The bundled dictionary was
 * bootstrapped from MyMemory's API; for a handful of entries the response
 * leaked their internal placeholders into the saved JSON. We also defend
 * against future leaks from remote providers (some of them — notably
 * LibreTranslate and Google when source contains markup — return tagged
 * responses).
 */
function sanitizeText(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return value;
  // Detect Wiktionary template/JSON artifact leaks — these appear as
  // `/Template:IPAchar"},..."params":{"1":{"wt":"/` instead of a real
  // IPA string. If found, return undefined so the popover falls back to
  // the remote lookup or hides the field entirely.
  if (value.includes('Template:') || value.includes('"params"')) {
    return undefined;
  }
  if (!value.includes('<')) return value;
  const stripped = value
    // Drop any `<...>` tag entirely. Translation fields are plain text —
    // they shouldn't ever carry real markup.
    .replace(/<[^>]+>/g, '')
    // Collapse the whitespace the tag removal leaves behind.
    .replace(/\s{2,}/g, ' ')
    .trim();
  return stripped || value;
}

function sanitizeEntry(entry: DictionaryEntry): DictionaryEntry {
  // Only allocate a new object when one of the text fields actually
  // contains markup — the vast majority of entries pass through untouched.
  const t = sanitizeText(entry.translation);
  const b = sanitizeText(entry.bilingual);
  const m = sanitizeText(entry.monolingual);
  const p = sanitizeText(entry.phonetic);
  if (
    t === entry.translation &&
    b === entry.bilingual &&
    m === entry.monolingual &&
    p === entry.phonetic
  ) {
    return entry;
  }
  return {
    ...entry,
    translation: t ?? entry.translation,
    bilingual: b,
    monolingual: m,
    phonetic: p,
  };
}

/**
 * Returns the entry for a token in a given language, or undefined.
 *
 * Lookup order:
 *   1. Literal lowercased token.
 *   2. Lemma candidates (only for EN — `lemmaCandidates()` returns just the
 *      literal for other languages so this is a no-op there).
 *
 * When the hit comes from a lemma we return a *shallow copy* with the
 * original surface form on `token` so the popover header reads naturally and
 * the resolved lemma is exposed on the optional `lemmaOf` field.
 */
export function lookupDictionary(token: string, lang = 'en'): DictionaryEntry | undefined {
  const dict = DICTIONARIES[lang];
  if (!dict) return undefined;
  const key = token.trim().toLowerCase();
  const direct = dict[key];
  if (direct) return sanitizeEntry(direct);

  // Lemma fallback (EN only — see lemma.ts).
  if (lang !== 'en') return undefined;
  const candidates = lemmaCandidates(token);
  for (let i = 1; i < candidates.length; i++) {
    const hit = dict[candidates[i]];
    if (hit) return sanitizeEntry({ ...hit, token, lemmaOf: candidates[i] });
  }
  return undefined;
}

export function getDictionary(lang = 'en'): Record<string, DictionaryEntry> {
  return DICTIONARIES[lang] ?? {};
}
