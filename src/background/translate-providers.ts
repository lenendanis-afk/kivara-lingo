/// <reference types="chrome" />

import type { TranslateProvider, TranslateSettings } from '../shared/types';

export interface ProviderResult {
  ok: true;
  translatedText: string;
  provider: TranslateProvider;
}

export interface ProviderError {
  ok: false;
  error: string;
  provider: TranslateProvider;
}

const TIMEOUT_MS = 5000;

function withTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

/**
 * Normalize Kivara's BCP-47 codes to whatever each provider expects.
 *  - DeepL upper-cases target codes and uses "EN-US" / "PT-BR" instead of "en" / "pt".
 *  - Google accepts plain lowercase or BCP-47.
 *  - LibreTranslate uses two-letter codes.
 */
function toDeeplCode(code: string, opts: { isTarget: boolean }): string {
  const c = code.toLowerCase();
  const base = c.split('-')[0];
  if (opts.isTarget) {
    if (c === 'en' || c === 'en-us') return 'EN-US';
    if (c === 'en-gb') return 'EN-GB';
    if (c === 'pt' || c === 'pt-br') return 'PT-BR';
    if (c === 'pt-pt') return 'PT-PT';
    return base.toUpperCase();
  }
  return base.toUpperCase();
}

function toTwoLetter(code: string): string {
  return code.toLowerCase().split('-')[0];
}

async function callDeepL(
  text: string,
  source: string,
  target: string,
  token: string,
): Promise<ProviderResult | ProviderError> {
  if (!token) return { ok: false, error: 'DeepL token missing', provider: 'deepl' };
  // Free vs Pro token: free keys end with ":fx"
  const host = token.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  const body = new URLSearchParams();
  body.append('text', text);
  body.append('source_lang', toDeeplCode(source, { isTarget: false }));
  body.append('target_lang', toDeeplCode(target, { isTarget: true }));
  try {
    const res = await withTimeout(`${host}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      return { ok: false, error: `DeepL ${res.status}`, provider: 'deepl' };
    }
    const json = (await res.json()) as { translations?: Array<{ text: string }> };
    const translated = json.translations?.[0]?.text?.trim();
    if (!translated) return { ok: false, error: 'DeepL empty response', provider: 'deepl' };
    return { ok: true, translatedText: translated, provider: 'deepl' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'DeepL error', provider: 'deepl' };
  }
}

async function callGoogle(
  text: string,
  source: string,
  target: string,
  token: string,
): Promise<ProviderResult | ProviderError> {
  if (!token) return { ok: false, error: 'Google token missing', provider: 'google' };
  const url = new URL('https://translation.googleapis.com/language/translate/v2');
  url.searchParams.set('key', token);
  try {
    const res = await withTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: toTwoLetter(source),
        target: toTwoLetter(target),
        format: 'text',
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `Google ${res.status}`, provider: 'google' };
    }
    const json = (await res.json()) as {
      data?: { translations?: Array<{ translatedText: string }> };
    };
    const translated = json.data?.translations?.[0]?.translatedText?.trim();
    if (!translated) return { ok: false, error: 'Google empty response', provider: 'google' };
    return { ok: true, translatedText: translated, provider: 'google' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Google error', provider: 'google' };
  }
}

async function callLibreTranslate(
  text: string,
  source: string,
  target: string,
  baseUrl: string,
  token: string,
): Promise<ProviderResult | ProviderError> {
  const host = (baseUrl || 'https://libretranslate.com').replace(/\/+$/, '');
  try {
    const res = await withTimeout(`${host}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: toTwoLetter(source),
        target: toTwoLetter(target),
        format: 'text',
        api_key: token || undefined,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `LibreTranslate ${res.status}`, provider: 'libretranslate' };
    }
    const json = (await res.json()) as { translatedText?: string };
    if (!json.translatedText) {
      return { ok: false, error: 'LibreTranslate empty response', provider: 'libretranslate' };
    }
    return { ok: true, translatedText: json.translatedText.trim(), provider: 'libretranslate' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'LibreTranslate error',
      provider: 'libretranslate',
    };
  }
}

/** Dispatch to the configured provider. */
export async function callProvider(
  text: string,
  source: string,
  target: string,
  settings: TranslateSettings,
): Promise<ProviderResult | ProviderError> {
  switch (settings.provider) {
    case 'deepl':
      return callDeepL(text, source, target, settings.deeplToken);
    case 'google':
      return callGoogle(text, source, target, settings.googleToken);
    case 'libretranslate':
      return callLibreTranslate(
        text,
        source,
        target,
        settings.libreTranslateUrl,
        settings.libreTranslateToken,
      );
    case 'offline':
    default:
      return { ok: false, error: 'offline provider', provider: 'offline' };
  }
}
