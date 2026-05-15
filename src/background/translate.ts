import { lookupDictionary } from '../content/nlp/dictionary';
import type { DictionaryEntry } from '../shared/types';

/**
 * Phase 1: dictionary-only lookup. Phase 2 will add LibreTranslate / DeepL.
 */
export async function translateToken(token: string, lang = 'en'): Promise<DictionaryEntry | null> {
  const entry = lookupDictionary(token, lang);
  return entry ?? null;
}
