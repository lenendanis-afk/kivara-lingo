/// <reference types="chrome" />

import { onMessage } from 'webext-bridge/background';
import type {
  AnkiMapping,
  CreateCardRequest,
  CreateCardResponse,
  AnkiPingResponse,
  AnkiListsResponse,
  AnkiFieldsResponse,
  AudioCaptureStatus,
  AudioClipResponse,
  TranslateRequest,
  TranslateResponse,
  TtsSpeakRequest,
  TtsResponse,
} from '../shared/types';
import { ankiConnect } from './anki-connect';
import { createCardFromRequest, retryPendingNotes } from './capture-orchestrator';
import { DEFAULT_ANKI_MAPPING } from '../shared/store';
import {
  startAudioCapture,
  stopAudioCapture,
  extractAudioClip,
  getAudioCaptureStatus,
} from './audio-capture-manager';
import { translateText } from './translate';
import { speak } from './tts';

console.log('[Kivara Lingo] service worker booting');

const STORE_KEY = 'kivara-lingo-state';
const RETRY_ALARM = 'kivara-lingo-retry-pending';

async function loadMapping(): Promise<AnkiMapping> {
  try {
    const raw = await chrome.storage.sync.get(STORE_KEY);
    const value = raw[STORE_KEY];
    if (typeof value !== 'string') return DEFAULT_ANKI_MAPPING;
    const parsed = JSON.parse(value);
    const mapping = parsed?.state?.ankiMapping ?? parsed?.ankiMapping;
    if (mapping && typeof mapping === 'object') {
      return { ...DEFAULT_ANKI_MAPPING, ...mapping };
    }
  } catch (err) {
    console.warn('[Kivara Lingo] could not read mapping', err);
  }
  return DEFAULT_ANKI_MAPPING;
}

async function loadCaptureBufferSec(): Promise<number> {
  try {
    const raw = await chrome.storage.sync.get(STORE_KEY);
    const value = raw[STORE_KEY];
    if (typeof value !== 'string') return 30;
    const parsed = JSON.parse(value);
    const cap = parsed?.state?.capture ?? parsed?.capture;
    if (cap && typeof cap.bufferSize === 'number') return Math.max(5, cap.bufferSize);
  } catch {
    // ignore
  }
  return 30;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asJson<T>(value: T): any {
  return value as unknown as any;
}

onMessage('CREATE_CARD', async ({ data }) => {
  const request = data as unknown as CreateCardRequest;
  const mapping = await loadMapping();
  const response: CreateCardResponse = await createCardFromRequest(request, mapping);
  if (response.ok) {
    console.log('[Kivara Lingo] note created:', response.noteId);
  } else {
    console.warn('[Kivara Lingo] note failed:', response.error);
  }
  return asJson(response);
});

onMessage('ANKI_PING', async ({ data }) => {
  const url = (data as { url?: string } | undefined)?.url;
  const result = await ankiConnect.ping(url);
  const out: AnkiPingResponse = result.ok
    ? { ok: true, version: result.version }
    : { ok: false, error: result.error };
  return asJson(out);
});

onMessage('ANKI_DECKS', async ({ data }) => {
  const url = (data as { url?: string } | undefined)?.url;
  try {
    const [decks, models] = await Promise.all([
      ankiConnect.deckNames(url),
      ankiConnect.modelNames(url),
    ]);
    const out: AnkiListsResponse = { decks, models };
    return asJson(out);
  } catch (err) {
    console.warn('[Kivara Lingo] ANKI_DECKS failed', err);
    return asJson({ decks: [], models: [] } satisfies AnkiListsResponse);
  }
});

onMessage('ANKI_MODELS', async ({ data }) => {
  const url = (data as { url?: string } | undefined)?.url;
  try {
    const models = await ankiConnect.modelNames(url);
    return asJson({ decks: [], models } satisfies AnkiListsResponse);
  } catch (err) {
    console.warn('[Kivara Lingo] ANKI_MODELS failed', err);
    return asJson({ decks: [], models: [] } satisfies AnkiListsResponse);
  }
});

onMessage('ANKI_FIELDS', async ({ data }) => {
  const { url, modelName } = (data as { url?: string; modelName?: string }) ?? {};
  if (!modelName) return asJson({ fields: [] } satisfies AnkiFieldsResponse);
  try {
    const fields = await ankiConnect.modelFieldNames(modelName, url);
    const out: AnkiFieldsResponse = { fields };
    return asJson(out);
  } catch (err) {
    console.warn('[Kivara Lingo] ANKI_FIELDS failed', err);
    return asJson({ fields: [] } satisfies AnkiFieldsResponse);
  }
});

onMessage('ANKI_CREATE_DECK', async ({ data }) => {
  const { url, deckName } = (data as { url?: string; deckName: string }) ?? {};
  if (!deckName) return asJson({ ok: false, error: 'deckName missing' });
  try {
    await ankiConnect.createDeck(deckName, url);
    return asJson({ ok: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'failed';
    return asJson({ ok: false, error: reason });
  }
});

onMessage('START_AUDIO_CAPTURE', async ({ data }) => {
  let tabId = (data as { tabId?: number } | undefined)?.tabId;
  if (tabId == null) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = tab?.id;
    } catch {
      // ignore
    }
  }
  if (tabId == null) {
    return asJson({ ok: false, error: 'No active tab' });
  }
  const bufferSec = await loadCaptureBufferSec();
  const result = await startAudioCapture(tabId, bufferSec);
  return asJson(result);
});

onMessage('STOP_AUDIO_CAPTURE', async () => {
  await stopAudioCapture();
  return asJson({ ok: true });
});

onMessage('AUDIO_CAPTURE_STATUS', async () => {
  const status: AudioCaptureStatus = getAudioCaptureStatus();
  return asJson(status);
});

onMessage('EXTRACT_AUDIO_CLIP', async ({ data }) => {
  const { startMs, endMs } = (data as { startMs: number; endMs: number }) ?? {};
  if (typeof startMs !== 'number' || typeof endMs !== 'number') {
    return asJson({ ok: false, error: 'startMs/endMs required' } satisfies AudioClipResponse);
  }
  const result = await extractAudioClip(startMs, endMs);
  return asJson(result);
});

onMessage('TRANSLATE', async ({ data }) => {
  const request = data as unknown as TranslateRequest;
  const response: TranslateResponse = await translateText(request);
  return asJson(response);
});

onMessage('TTS_SPEAK', async ({ data }) => {
  const { text, lang } = (data as TtsSpeakRequest) ?? { text: '', lang: 'en' };
  const response: TtsResponse = await speak(text, lang);
  return asJson(response);
});

async function broadcastToActive(message: { type: string; [k: string]: unknown }) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // ignore: no content script on this tab
  }
}

chrome.commands.onCommand.addListener(async (command: string) => {
  console.log('[Kivara Lingo] command:', command);
  await broadcastToActive({ type: 'RUN_COMMAND', command });
});

// First-run onboarding: open the onboarding page when the user first installs.
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Kivara Lingo] installed / updated', details.reason);
  if (details.reason === 'install') {
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('src/onboarding/index.html'),
      });
    } catch (err) {
      console.warn('[Kivara Lingo] could not open onboarding', err);
    }
  }
  // Set up periodic retry of any queued AnkiConnect notes.
  await chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
});

// Re-create the alarm on every SW wake-up — alarms persist across SW restarts
// but `onInstalled` only fires once.
chrome.runtime.onStartup.addListener(async () => {
  await chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== RETRY_ALARM) return;
  try {
    const mapping = await loadMapping();
    const { retried, succeeded } = await retryPendingNotes(mapping);
    if (retried > 0) {
      console.log('[Kivara Lingo] retry pending notes', { retried, succeeded });
    }
  } catch (err) {
    console.warn('[Kivara Lingo] retry alarm failed', err);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'TOGGLE_PANEL_FROM_POPUP') {
    void broadcastToActive({ type: 'TOGGLE_PANEL' });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
