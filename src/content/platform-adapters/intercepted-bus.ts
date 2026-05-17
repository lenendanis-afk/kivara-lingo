/**
 * ISOLATED-world side of the MAIN-world subtitle interceptor.
 *
 * Listens for `window.postMessage` events that the MAIN-world script posts,
 * collects them into language-keyed tracks and exposes a tiny API the
 * platform adapters use to drive `onCueChange`.
 *
 * Multiple language tracks may arrive in any order (the player loads them
 * in parallel as the user picks an audio/subtitle pair). We keep:
 *   - `lastTrack`     — the most recently seen track of any language. Used
 *                       by the adapter as the "primary" caption source so
 *                       legacy behaviour is preserved.
 *   - `tracksByLang`  — every track we've seen, keyed by primary subtag
 *                       (`es`, `en`, ...). Used by Tier B to pull the
 *                       native-language dual caption.
 */
import type { RawCue } from './parsers';

const EVENT = 'kivara-lingo:subtitle-track';

export interface InterceptedTrack {
  url: string;
  cues: RawCue[];
  language: string | null;
}

type TrackListener = (track: InterceptedTrack) => void;

const listeners = new Set<TrackListener>();
const seenUrls = new Set<string>();
const tracksByLang = new Map<string, InterceptedTrack>();
let lastTrack: InterceptedTrack | null = null;

function isOurMessage(
  payload: unknown,
): payload is { source: string; url: string; cues: RawCue[]; language?: unknown } {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as { source?: unknown; url?: unknown; cues?: unknown };
  return p.source === EVENT && typeof p.url === 'string' && Array.isArray(p.cues);
}

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!isOurMessage(event.data)) return;
  const url = event.data.url;
  const cues = event.data.cues;
  if (!cues.length) return;
  const language =
    typeof event.data.language === 'string' && event.data.language ? event.data.language : null;

  // De-dup identical track downloads — but always replace `lastTrack` so a
  // new track (different timestamps) immediately drives the active cue
  // selector. For language-keyed lookups we also store on the latest URL.
  const alreadySeen = seenUrls.has(url) && lastTrack?.url === url;
  if (alreadySeen) return;
  seenUrls.add(url);

  const next: InterceptedTrack = { url, cues, language };
  lastTrack = next;
  if (language) {
    // Normalize to a 2-letter primary subtag so `es`, `es-419`, `es-ES`
    // and `ES` all collide on the same key. Lookup uses the same rule.
    const key = language.trim().toLowerCase().split(/[-_]/)[0];
    if (key) tracksByLang.set(key, next);
  }

  listeners.forEach((l) => {
    try {
      l(next);
    } catch (err) {
      console.warn('[Kivara Lingo] track listener threw', err);
    }
  });
});

export function onTrack(listener: TrackListener): () => void {
  listeners.add(listener);
  // Replay last track if we already have one — adapters can mount late.
  if (lastTrack) {
    try {
      listener(lastTrack);
    } catch {
      // ignore
    }
  }
  return () => listeners.delete(listener);
}

export function getLastTrack(): InterceptedTrack | null {
  return lastTrack;
}

/**
 * Return the most recently seen track for a given primary language subtag
 * (`es`, `en`, ...). Returns `null` when no track for that language has
 * been intercepted yet.
 */
export function getTrackByLanguage(lang: string): InterceptedTrack | null {
  const key = lang.trim().toLowerCase().split(/[-_]/)[0];
  if (!key) return null;
  return tracksByLang.get(key) ?? null;
}

/** List of language codes seen so far. */
export function getKnownLanguages(): string[] {
  return Array.from(tracksByLang.keys());
}
