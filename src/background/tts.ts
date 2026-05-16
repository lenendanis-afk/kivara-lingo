/// <reference types="chrome" />

import type { TtsResponse } from '../shared/types';
import { speakViaOffscreen } from './audio-capture-manager';

/**
 * Speak a single word.
 *
 *  - First try `chrome.tts` — it's the canonical extension API, uses
 *    system voices, works offline and doesn't require a DOM context.
 *  - If `chrome.tts` is unavailable (e.g. non-Chromium browsers via
 *    polyfill) or returns an error (e.g. no installed voice for the
 *    requested BCP-47 tag), fall back to `speechSynthesis` via the
 *    offscreen document. The Web Speech API is supported in every
 *    evergreen browser and uses whatever voices the OS ships with.
 *
 * For full-sentence audio we prefer the actor's real voice via
 * tabCapture — see `audio-capture-manager.ts`. This file only covers
 * the word-level case (vocab popover, individual saved word).
 */
export async function speak(text: string, lang: string): Promise<TtsResponse> {
  if (!text.trim()) return { ok: true };

  const chromeTtsResult = await tryChromeTts(text, lang);
  if (chromeTtsResult.ok) return chromeTtsResult;

  // chrome.tts failed → fall through to SpeechSynthesis in offscreen.
  const fallback = await speakViaOffscreen(text, lang);
  if (fallback.ok) return fallback;

  // Surface whichever error is more useful to the user.
  return {
    ok: false,
    error: fallback.error || chromeTtsResult.error || 'tts unavailable',
  };
}

function tryChromeTts(text: string, lang: string): Promise<TtsResponse> {
  return new Promise<TtsResponse>((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.tts || typeof chrome.tts.speak !== 'function') {
      resolve({ ok: false, error: 'chrome.tts unavailable' });
      return;
    }
    try {
      chrome.tts.stop();
      chrome.tts.speak(text, {
        lang,
        rate: 0.95,
        enqueue: false,
        onEvent: (event) => {
          if (event.type === 'end') resolve({ ok: true });
          if (event.type === 'error') {
            resolve({ ok: false, error: event.errorMessage ?? 'tts error' });
          }
        },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'tts unavailable';
      resolve({ ok: false, error: reason });
    }
  });
}
