/// <reference types="chrome" />

import type { TtsResponse } from '../shared/types';
import { speakViaOffscreen } from './audio-capture-manager';
import { getAiSettings } from './ai-enrich';

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

/**
 * Result of generating TTS as a downloadable audio file (for attaching to an
 * Anki note). Only the OpenAI tts-1 path is wired right now — see
 * IMPLEMENTATION.md §8 for the rationale (Gemini lacks a stable public TTS,
 * Anthropic doesn't ship TTS, and `speechSynthesis` cannot be captured to a
 * blob inside an MV3 offscreen document).
 */
export type GenerateTtsResult =
  | { ok: true; dataUrl: string; mime: string }
  | { ok: false; error: string };

const OPENAI_TTS_TIMEOUT_MS = 8000;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Generate a playable audio file for the given text using a remote TTS API.
 *
 * Cost reference (as of 2025): OpenAI `tts-1` is roughly USD 0.015 per 1 000
 * characters; `tts-1-hd` is roughly USD 0.030 per 1 000 characters. Cards
 * average <100 chars so a thousand cards cost well under USD 2.
 *
 * Falls back to `{ ok: false }` so the orchestrator can leave the text in the
 * field (and rely on Anki's `{{tts <lang>:Field}}` template if configured).
 */
export async function generateTtsAudio(text: string, _lang: string): Promise<GenerateTtsResult> {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'empty text' };

  const ai = await getAiSettings();
  if (ai.provider !== 'openai' || !ai.apiKey) {
    return {
      ok: false,
      error: 'TTS audio requires OpenAI provider + API key',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TTS_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'alloy',
        input: trimmed,
        response_format: 'mp3',
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'OpenAI TTS network error',
    };
  }
  clearTimeout(timeout);
  if (!resp.ok) {
    return { ok: false, error: `OpenAI TTS ${resp.status}` };
  }
  try {
    const blob = await resp.blob();
    const dataUrl = await blobToDataUrl(blob);
    return { ok: true, dataUrl, mime: blob.type || 'audio/mpeg' };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'OpenAI TTS body read failed',
    };
  }
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
