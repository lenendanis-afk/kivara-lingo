/**
 * Language detection for subtitle text using `franc-min` (trigram-based).
 *
 * Why this matters: HBO Max, Netflix and some GenericHTML5 adapters don't
 * always tag captions with a BCP-47 language — they leave the `language`
 * field blank or set it to a generic `'und'`. Without proper detection the
 * tokenizer defaults to English rules and the dictionary lookup misses
 * every word, making the overlay useless on non-English content.
 *
 * `franc-min` is ~180 kB (trigram model for 82 languages) and runs in
 * <1 ms on typical subtitle-length text (≤200 chars). We cache the result
 * per cue text to avoid redundant trigram scans on repeat renders.
 *
 * Caveat: franc returns ISO 639-3 codes (`eng`, `spa`, …). We map to
 * ISO 639-1 (`en`, `es`) because that's what the rest of the system uses
 * (dictionary lookup, translate providers, BCP-47 tags in HTML/WebVTT).
 */

import { francAll } from 'franc-min';

/**
 * LRU-ish cache — keeps the last N detection results keyed by the first
 * 100 chars of the text. Since subtitle cues rarely exceed 2-3 lines and
 * the same line may be re-rendered on every React tick, this avoids calling
 * franc on every render. Max 64 entries — negligible memory.
 */
const cache = new Map<string, string>();
const MAX_CACHE = 64;

/**
 * Subset of ISO 639-3 → ISO 639-1 mappings covering the languages
 * relevant to streaming content. franc-min supports ~82 languages; we map
 * the ones most likely to appear as subtitles. Unknown codes fall through
 * as `'und'` (undetermined).
 */
const ISO3_TO_ISO1: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  fra: 'fr',
  deu: 'de',
  ita: 'it',
  por: 'pt',
  nld: 'nl',
  rus: 'ru',
  jpn: 'ja',
  zho: 'zh',
  kor: 'ko',
  ara: 'ar',
  hin: 'hi',
  tur: 'tr',
  pol: 'pl',
  swe: 'sv',
  nor: 'no',
  dan: 'da',
  fin: 'fi',
  ell: 'el',
  heb: 'he',
  tha: 'th',
  vie: 'vi',
  ind: 'id',
  ukr: 'uk',
  ces: 'cs',
  ron: 'ro',
  hun: 'hu',
  cat: 'ca',
};

function iso3ToIso1(code: string): string {
  return ISO3_TO_ISO1[code] ?? 'und';
}

/**
 * Detect the language of a subtitle line.
 *
 * @param text  — the raw cue text (HTML already stripped by the adapter).
 * @param hint  — optional BCP-47 hint from the adapter (`cue.language`).
 *   If provided and non-empty, we trust it unconditionally — it's cheaper
 *   than running the detector and more accurate for short lines (franc
 *   needs ≥10 chars for reliable detection).
 * @returns ISO 639-1 code (`'en'`, `'es'`, …) or `'und'` if detection
 *   fails / text is too short.
 */
export function detectLanguage(text: string, hint?: string | null): string {
  // 1) Trust the adapter's hint when present (WebVTT Language: header,
  //    TTML xml:lang, URL-derived BCP-47 tag, etc).
  if (hint && hint !== 'und') {
    // Normalise to two-letter code (strip region: `en-US` → `en`).
    return hint.split(/[-_]/)[0].toLowerCase();
  }

  // 2) Short text is unreliable for trigram analysis — fall back to
  //    English, which covers the vast majority of streaming content
  //    missing language metadata.
  const trimmed = text.trim();
  if (trimmed.length < 10) return 'en';

  // 3) Cache check.
  const cacheKey = trimmed.slice(0, 100);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  // 4) Run franc.
  const results = francAll(trimmed, { minLength: 10, only: Object.keys(ISO3_TO_ISO1) });
  const top = results[0];
  const detected = top && top[1] > 0.5 ? iso3ToIso1(top[0]) : 'en';

  // 5) Store in cache (evict oldest if full).
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(cacheKey, detected);

  return detected;
}

/**
 * Clear the detection cache — useful for tests or when the user switches
 * to a different video (where the language distribution may be totally
 * different from the previous one).
 */
export function clearDetectionCache(): void {
  cache.clear();
}
