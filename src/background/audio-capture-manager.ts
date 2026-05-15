/// <reference types="chrome" />

/**
 * Service-worker side of audio capture.
 *
 * Responsibilities:
 *  - Create / close the offscreen document.
 *  - Resolve a `streamId` from `chrome.tabCapture.getMediaStreamId` and ship
 *    it to the offscreen worker.
 *  - Proxy `EXTRACT_AUDIO_CLIP` requests from content / orchestrator into
 *    the offscreen worker and return the produced clip as a data URL.
 */
import type { AudioCaptureStatus, AudioClipResponse } from '../shared/types';

const OFFSCREEN_URL = 'src/offscreen/index.html';

let activeTabId: number | null = null;
let activeMimeType: string | undefined;
let lastError: string | undefined;

async function hasOffscreenDocument(): Promise<boolean> {
  // chrome.offscreen.hasDocument was renamed; both exist in different versions
  const api = chrome.offscreen as unknown as {
    hasDocument?: () => Promise<boolean>;
  };
  if (typeof api.hasDocument === 'function') {
    try {
      return await api.hasDocument();
    } catch {
      // fall back to runtime.getContexts
    }
  }
  const runtimeApi = chrome.runtime as unknown as {
    getContexts?: (opts: { contextTypes: string[] }) => Promise<Array<unknown>>;
  };
  if (typeof runtimeApi.getContexts === 'function') {
    try {
      const contexts = await runtimeApi.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      return contexts.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['USER_MEDIA' as chrome.offscreen.Reason],
    justification: 'Recording tab audio so it can be attached to Anki cards.',
  });
}

async function closeOffscreen(): Promise<void> {
  if (!(await hasOffscreenDocument())) return;
  try {
    await chrome.offscreen.closeDocument();
  } catch (err) {
    console.warn('[Kivara Lingo] closeOffscreen failed', err);
  }
}

function getStreamId(tabId: number): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      if (!streamId) {
        reject(new Error('tabCapture returned an empty stream id'));
        return;
      }
      resolve(streamId);
    });
  });
}

interface OffscreenResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

function sendToOffscreen<T = unknown>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response as T);
    });
  });
}

export async function startAudioCapture(
  tabId: number,
  bufferSizeSec: number,
): Promise<{ ok: boolean; mimeType?: string; error?: string }> {
  try {
    await ensureOffscreen();
    const streamId = await getStreamId(tabId);
    const result = await sendToOffscreen<OffscreenResponse & { mimeType?: string }>({
      type: 'OFFSCREEN_START_AUDIO_CAPTURE',
      streamId,
      bufferSizeSec,
    });
    if (!result?.ok) {
      lastError = result?.error || 'offscreen reported failure';
      return { ok: false, error: lastError };
    }
    activeTabId = tabId;
    activeMimeType = result.mimeType;
    lastError = undefined;
    return { ok: true, mimeType: activeMimeType };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    lastError = reason;
    activeTabId = null;
    activeMimeType = undefined;
    // Best effort: shut the offscreen doc back down if we failed to start.
    void closeOffscreen();
    return { ok: false, error: reason };
  }
}

export async function stopAudioCapture(): Promise<void> {
  try {
    if (await hasOffscreenDocument()) {
      await sendToOffscreen({ type: 'OFFSCREEN_STOP_AUDIO_CAPTURE' });
    }
  } catch (err) {
    console.warn('[Kivara Lingo] failed to stop offscreen', err);
  } finally {
    await closeOffscreen();
    activeTabId = null;
    activeMimeType = undefined;
  }
}

export async function extractAudioClip(
  startMs: number,
  endMs: number,
): Promise<AudioClipResponse> {
  if (activeTabId == null) {
    return { ok: false, error: 'Audio capture is not active for this tab.' };
  }
  try {
    const result = await sendToOffscreen<AudioClipResponse>({
      type: 'OFFSCREEN_EXTRACT_AUDIO_CLIP',
      startMs,
      endMs,
    });
    return result;
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown';
    return { ok: false, error: reason };
  }
}

export function getAudioCaptureStatus(): AudioCaptureStatus {
  return {
    active: activeTabId != null,
    tabId: activeTabId,
    mimeType: activeMimeType,
    error: lastError,
  };
}
