/// <reference types="chrome" />

import type { TtsResponse } from '../shared/types';

/**
 * Speak a single word via `chrome.tts`. The platform supplies system voices
 * and handles output, so this works without internet and without grabbing
 * mic permissions.
 *
 * For full-sentence audio we prefer the actor's real voice via tabCapture —
 * see `audio-capture-manager.ts`. This file only covers the word-level case
 * (vocab popover, individual saved word).
 */
export async function speak(text: string, lang: string): Promise<TtsResponse> {
  return new Promise<TtsResponse>((resolve) => {
    if (!text.trim()) {
      resolve({ ok: true });
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
