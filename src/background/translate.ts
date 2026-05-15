/// <reference types="chrome" />

import { lookupDictionary } from '../content/nlp/dictionary';
import type {
  DictionaryEntry,
  TranslateRequest,
  TranslateResponse,
  TranslateSettings,
} from '../shared/types';
import { DEFAULT_TRANSLATE } from '../shared/store';
import { callProvider } from './translate-providers';
import { getDB, translationCacheKey } from '../shared/db';

const STORE_KEY = 'kivara-lingo-state';

let inflight: Promise<unknown> | null = null;
let lastCallAt = 0;
const DEBOUNCE_MS = 200;

/** Read the persisted Zustand store from chrome.storage.sync. */
async function loadSettings(): Promise<TranslateSettings> {
  try {
    const raw = await chrome.storage.sync.get(STORE_KEY);
    const value = raw[STORE_KEY];
    if (typeof value !== 'string') return DEFAULT_TRANSLATE;
    const parsed = JSON.parse(value);
    const t = parsed?.state?.translate ?? parsed?.translate;
    if (t && typeof t === 'object') {
      return { ...DEFAULT_TRANSLATE, ...t };
    }
  } catch (err) {
    console.warn('[Kivara Lingo] could not read translate settings', err);
  }
  return DEFAULT_TRANSLATE;
}

/**
 * Phase 1 surface: returns a DictionaryEntry-ish blob assembled either from
 * the bundled dictionary or from the live translation provider.
 */
export async function translateToken(
  token: string,
  lang = 'en',
): Promise<DictionaryEntry | null> {
  // Always try the local dictionary first — it has phonetics and definitions.
  const entry = lookupDictionary(token, lang);
  if (entry) return entry;

  // Fall back to remote provider for unknown tokens.
  const settings = await loadSettings();
  if (settings.provider === 'offline') return null;

  const remote = await translateText({
    text: token,
    sourceLang: lang,
    targetLang: settings.targetLanguage,
  });
  if (!remote.ok || !remote.translatedText) return null;
  return {
    token,
    type: token.includes(' ') ? 'phrase' : 'word',
    translation: remote.translatedText,
    bilingual: remote.translatedText,
  };
}

/**
 * Translate arbitrary text. Used both internally (translateToken fallback)
 * and by the popup/options panel to translate the full sentence.
 *
 * Caches results in IndexedDB so repeated lookups for the same word/phrase
 * don't hit DeepL/Google quotas.
 */
export async function translateText(req: TranslateRequest): Promise<TranslateResponse> {
  const text = req.text.trim();
  if (!text) return { ok: true, translatedText: '', provider: 'offline', cached: false };

  const settings = await loadSettings();
  const target = req.targetLang || settings.targetLanguage;
  const provider = settings.provider;

  if (provider === 'offline') {
    return { ok: false, error: 'Translation provider is set to offline.', provider: 'offline' };
  }

  // Cache lookup
  const cacheKey = translationCacheKey(provider, req.sourceLang, target, text);
  try {
    const cached = await getDB().translation_cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ok: true,
        translatedText: cached.translatedText,
        provider,
        cached: true,
      };
    }
  } catch (err) {
    console.warn('[Kivara Lingo] translation cache read failed', err);
  }

  // Debounce: at most one outbound call every DEBOUNCE_MS to respect free-tier
  // quotas.
  const sinceLast = Date.now() - lastCallAt;
  if (sinceLast < DEBOUNCE_MS) {
    await new Promise((r) => setTimeout(r, DEBOUNCE_MS - sinceLast));
  }
  lastCallAt = Date.now();

  const work = (async () => {
    const result = await callProvider(text, req.sourceLang, target, settings);
    if (!result.ok) return result;
    const ttl = (settings.cacheTtlDays || 30) * 24 * 60 * 60 * 1000;
    try {
      await getDB().translation_cache.put({
        key: cacheKey,
        provider,
        sourceLang: req.sourceLang,
        targetLang: target,
        sourceText: text,
        translatedText: result.translatedText,
        expiresAt: Date.now() + ttl,
        createdAt: Date.now(),
      });
    } catch (err) {
      console.warn('[Kivara Lingo] translation cache write failed', err);
    }
    return result;
  })();

  inflight = work;
  try {
    const result = (await work) as Awaited<ReturnType<typeof callProvider>>;
    if (result.ok) {
      return {
        ok: true,
        translatedText: result.translatedText,
        provider: result.provider,
        cached: false,
      };
    }
    return { ok: false, error: result.error, provider: result.provider };
  } finally {
    if (inflight === work) inflight = null;
  }
}
