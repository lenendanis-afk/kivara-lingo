/**
 * Heuristic auto-mapper from an Anki field name to a Kivara `FieldSource`.
 *
 * Used by both the onboarding wizard (first-run setup) and the Cards tab
 * (re-mapping after model changes). Centralised here so a regex tweak is
 * picked up by both call sites — having two slightly different detectors
 * caused real bugs (the previous onboarding hint table missed `Front` /
 * `Back` / `Sentence` patterns the CardsTab matched).
 *
 * Regex order matters: more specific patterns (audio sub-types,
 * "monolingual" inside "definition") come before broader ones to avoid
 * false matches. Patterns are case-insensitive and matched against the
 * lowercased + trimmed field name.
 */
import type { FieldSource } from './types';

export function detectFieldSource(fieldName: string): FieldSource {
  const n = fieldName.toLowerCase().trim();
  // Audio first — most specific.
  if (/audio/.test(n)) {
    if (/word|palabra|term/.test(n)) return 'word-audio';
    return 'sentence-audio'; // default: cue/sentence audio
  }
  if (/picture|image|imagen|frame|screenshot/.test(n)) return 'frame';
  if (/phon|ipa|pronun/.test(n)) return 'phonetic';
  if (/monoling|definition|definición|meaning|sentido/.test(n)) return 'monolingual';
  if (/biling/.test(n)) return 'bilingual';
  if (/example|ejemplo/.test(n)) return 'examples';
  if (/translation|traduccion|traducción|native|spanish|español/.test(n)) return 'translation';
  if (/sentence|frase|context|cue|reverso|extra/.test(n)) return 'cue';
  if (/word|palabra|term|anverso|texto|front/.test(n)) return 'selection';
  return 'manual';
}

/**
 * Build a complete `fieldSources` mapping for the given Anki fields by
 * applying `detectFieldSource` to each one, while preserving any explicit
 * user choices that already exist in `existing`.
 *
 * @param fields    AnkiConnect field names (`modelFieldNames` response)
 * @param existing  Current `mapping.fieldSources` to honour as overrides
 * @returns         Fresh mapping ready to assign to `ankiMapping.fieldSources`
 */
export function autoMapFields(
  fields: string[],
  existing: Record<string, FieldSource> = {},
): Record<string, FieldSource> {
  const next: Record<string, FieldSource> = {};
  for (const field of fields) {
    next[field] = existing[field] ?? detectFieldSource(field);
  }
  return next;
}
