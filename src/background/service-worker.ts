/// <reference types="chrome" />

import { onMessage } from 'webext-bridge/background';
import type {
  AnkiMapping,
  CreateCardRequest,
  CreateCardResponse,
  AnkiPingResponse,
  AnkiListsResponse,
  AnkiFieldsResponse,
} from '../shared/types';
import { ankiConnect } from './anki-connect';
import { createCardFromRequest } from './capture-orchestrator';
import { DEFAULT_ANKI_MAPPING } from '../shared/store';

console.log('[Kivara Lingo] service worker booting');

const STORE_KEY = 'kivara-lingo-state';

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

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Kivara Lingo] installed / updated');
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'TOGGLE_PANEL_FROM_POPUP') {
    void broadcastToActive({ type: 'TOGGLE_PANEL' });
    sendResponse({ ok: true });
    return true;
  }
  return false;
});
