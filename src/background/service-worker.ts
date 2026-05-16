/// <reference types="chrome" />

import { onMessage } from 'webext-bridge/background';
import type {
  AiEnrichRequest,
  AiEnrichResponse,
  AnkiMapping,
  CaptureSettings,
  CreateCardRequest,
  CreateCardResponse,
  AnkiPingResponse,
  AnkiListsResponse,
  AnkiFieldsResponse,
  AudioCaptureStatus,
  AudioClipResponse,
  ResolveWordRequest,
  ResolveWordResponse,
  ResolveWordWave,
  TranscribeRequest,
  TranscribeResponse,
  TranslateRequest,
  TranslateResponse,
  TtsSpeakRequest,
  TtsResponse,
} from '../shared/types';
import { ankiConnect } from './anki-connect';
import { createCardFromRequest, retryPendingNotes } from './capture-orchestrator';
import { DEFAULT_ANKI_MAPPING, DEFAULT_CAPTURE } from '../shared/store';
import {
  startAudioCapture,
  stopAudioCapture,
  extractAudioClip,
  transcribeAudioClip,
  getAudioCaptureStatus,
} from './audio-capture-manager';
import { translateText } from './translate';
import { speak } from './tts';
import { enrichWithAi, getAiSettings, getResolvedNativeLang } from './ai-enrich';
import { lookupDictionary } from '../content/nlp/dictionary';
import { lookupYomitanTerm } from '../content/nlp/yomitan';

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

async function loadCaptureSettings(): Promise<CaptureSettings> {
  try {
    const raw = await chrome.storage.sync.get(STORE_KEY);
    const value = raw[STORE_KEY];
    if (typeof value !== 'string') return DEFAULT_CAPTURE;
    const parsed = JSON.parse(value);
    const cap = parsed?.state?.capture ?? parsed?.capture;
    if (cap && typeof cap === 'object') {
      return { ...DEFAULT_CAPTURE, ...cap };
    }
  } catch {
    // ignore
  }
  return DEFAULT_CAPTURE;
}

async function loadCaptureBufferSec(): Promise<number> {
  const cap = await loadCaptureSettings();
  return Math.max(5, cap.bufferSize ?? DEFAULT_CAPTURE.bufferSize);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asJson<T>(value: T): any {
  return value as unknown as any;
}

onMessage('CREATE_CARD', async ({ data }) => {
  const request = data as unknown as CreateCardRequest;
  const [mapping, capture] = await Promise.all([loadMapping(), loadCaptureSettings()]);
  const response: CreateCardResponse = await createCardFromRequest(request, mapping, capture);
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
  const capture = await loadCaptureSettings();
  const result = await extractAudioClip(startMs, endMs, {
    format: 'wav',
    useVad: capture.endDetect === 'vad',
    preRollMs: capture.preRoll,
    postRollMs: capture.postRoll,
  });
  return asJson(result);
});

onMessage('TRANSCRIBE_AUDIO_CLIP', async ({ data }) => {
  const req = (data as TranscribeRequest) ?? { startMs: 0, endMs: 0 };
  if (typeof req.startMs !== 'number' || typeof req.endMs !== 'number') {
    const err: TranscribeResponse = { ok: false, error: 'startMs/endMs required' };
    return asJson(err);
  }
  const capture = await loadCaptureSettings();
  const result = await transcribeAudioClip(req.startMs, req.endMs, {
    useVad: req.useVad ?? capture.endDetect === 'vad',
    preRollMs: req.preRollMs ?? capture.preRoll,
    postRollMs: req.postRollMs ?? capture.postRoll,
    language: req.language,
    whisperConfig: req.whisperConfig,
  });
  const response: TranscribeResponse = result.transcription.ok
    ? {
        ok: true,
        text: result.transcription.text,
        segments: result.transcription.segments,
        language: result.transcription.language,
        clip: result.clip,
      }
    : {
        ok: false,
        error: result.transcription.error,
        transient: result.transcription.transient,
      };
  return asJson(response);
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

onMessage('AI_ENRICH', async ({ data }) => {
  const request = data as unknown as AiEnrichRequest;
  const response: AiEnrichResponse = await enrichWithAi(request);
  return asJson(response);
});

/**
 * Three-wave token resolution for the popover. Performs the local dictionary
 * lookup synchronously, falls back to the remote translator when needed, and
 * (if requested) calls the AI provider. The waves are returned as an array so
 * the consumer can render them progressively without needing port-based
 * streaming — in practice the popover already has a 200 ms-ish dictionary
 * spinner so this single round-trip is acceptable.
 */
onMessage('RESOLVE_WORD', async ({ data }) => {
  const req = data as unknown as ResolveWordRequest;
  const waves: ResolveWordWave[] = [];
  const sourceLang = req.sourceLang || 'en';
  const token = (req.token ?? '').trim();
  const sentence = req.sentence ?? '';
  if (!token) {
    const empty: ResolveWordResponse = { ok: true, waves: [{ stage: 'local', entry: null }] };
    return asJson(empty);
  }

  // 1. Bundled dictionary (fast, sync).
  let local = lookupDictionary(token, sourceLang);

  // 2. User-installed Yomitan packs (async IndexedDB lookup). We only consult
  //    them on a bundle miss to avoid the round-trip when the popover can
  //    already render the curated entry.
  let yomitanPackTitle: string | null = null;
  if (!local) {
    try {
      const hit = await lookupYomitanTerm(token, sourceLang);
      if (hit) {
        local = hit.entry;
        yomitanPackTitle = hit.pack.title;
      }
    } catch (err) {
      // Pack lookup errors are non-fatal — fall through to remote.
      console.warn('[Kivara Lingo] yomitan lookup failed', err);
    }
  }
  waves.push({ stage: 'local', entry: local ?? null });
  // Emit a synthetic 'remote' wave so the popover shows "via <pack>" without
  // hitting the network when a Yomitan pack already covered the word.
  if (local && yomitanPackTitle) {
    waves.push({
      stage: 'remote',
      translation: local.translation,
      provider: `pack:${yomitanPackTitle}`,
      cached: false,
    });
  }

  if (!local) {
    try {
      const remote = await translateText({ text: token, sourceLang });
      if (remote.ok && remote.translatedText) {
        waves.push({
          stage: 'remote',
          translation: remote.translatedText,
          provider: remote.provider ?? 'offline',
          cached: remote.cached ?? false,
        });
      } else if (!remote.ok) {
        waves.push({ stage: 'error', scope: 'remote', message: remote.error ?? 'translate failed' });
      }
    } catch (err) {
      waves.push({
        stage: 'error',
        scope: 'remote',
        message: err instanceof Error ? err.message : 'translate threw',
      });
    }
  }

  if (req.includeAi) {
    const settings = await getAiSettings();
    if (settings.provider !== 'disabled' && settings.apiKey && settings.enrichOnHover) {
      const nativeLang = await getResolvedNativeLang(settings);
      try {
        const ai = await enrichWithAi({
          token,
          sentence,
          sourceLang,
          nativeLang,
        });
        if (ai.ok) waves.push({ stage: 'ai', data: ai.data });
        else waves.push({ stage: 'error', scope: 'ai', message: ai.error });
      } catch (err) {
        waves.push({
          stage: 'error',
          scope: 'ai',
          message: err instanceof Error ? err.message : 'AI threw',
        });
      }
    }
  }

  const response: ResolveWordResponse = { ok: true, waves };
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
    const [mapping, capture] = await Promise.all([loadMapping(), loadCaptureSettings()]);
    const { retried, succeeded } = await retryPendingNotes(mapping, capture);
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
