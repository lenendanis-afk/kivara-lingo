import enDict from '../../assets/dictionaries/en.json';
import type { DictionaryEntry } from '../../shared/types';

const DICTIONARIES: Record<string, Record<string, DictionaryEntry>> = {
  en: enDict as Record<string, DictionaryEntry>,
};

/** Returns the entry for a token in a given language, or undefined. */
export function lookupDictionary(token: string, lang = 'en'): DictionaryEntry | undefined {
  const dict = DICTIONARIES[lang];
  if (!dict) return undefined;
  const key = token.trim().toLowerCase();
  return dict[key];
}

export function getDictionary(lang = 'en'): Record<string, DictionaryEntry> {
  return DICTIONARIES[lang] ?? {};
}
