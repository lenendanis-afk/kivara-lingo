/**
 * ISOLATED-world side of the MAIN-world subtitle interceptor.
 *
 * Listens for `window.postMessage` events that the MAIN-world script posts,
 * collects them into a cue track and exposes a tiny API the platform adapters
 * use to drive `onCueChange`.
 */
import type { RawCue } from './parsers';

const EVENT = 'kivara-lingo:subtitle-track';

export interface InterceptedTrack {
  url: string;
  cues: RawCue[];
}

type TrackListener = (track: InterceptedTrack) => void;

const listeners = new Set<TrackListener>();
const seenUrls = new Set<string>();
let lastTrack: InterceptedTrack | null = null;

function isOurMessage(payload: unknown): payload is { source: string; url: string; cues: RawCue[] } {
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
  // De-dup identical track downloads — but always replace `lastTrack` so a new
  // track (different timestamps) immediately drives the active cue selector.
  if (seenUrls.has(url) && lastTrack?.url === url) return;
  seenUrls.add(url);
  lastTrack = { url, cues };
  listeners.forEach((l) => {
    try {
      l(lastTrack as InterceptedTrack);
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
