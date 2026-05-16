/// <reference types="chrome" />

import type {
  AiEnrichment,
  AnkiMapping,
  CaptureSettings,
  CreateCardRequest,
  CreateCardResponse,
  FieldSource,
} from '../shared/types';
import { DEFAULT_CAPTURE } from '../shared/store';
import { ankiConnect, dataUrlToBase64, type AnkiMedia } from './anki-connect';
import { translateToken } from './translate';
import { extractAudioClip, getAudioCaptureStatus } from './audio-capture-manager';
import { getDB, type PendingNoteRow } from '../shared/db';
import { enrichWithAi, getAiSettings, getResolvedNativeLang } from './ai-enrich';
import { generateTtsAudio } from './tts';

interface ResolveContext {
  request: CreateCardRequest;
  mapping: AnkiMapping;
  translation: string;
  bilingual: string;
  monolingual: string;
  phonetic: string;
  ai: AiEnrichment | null;
}

function safeFilename(base: string, ext: string): string {
  const slug =
    base
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'kivara';
  return `kivara_${slug}_${Date.now()}.${ext}`;
}

function extForMime(mime: string): string {
  if (/wav|wave/.test(mime)) return 'wav';
  if (/mp3|mpeg/.test(mime)) return 'mp3';
  if (/ogg/.test(mime)) return 'ogg';
  if (/mp4|m4a|aac/.test(mime)) return 'm4a';
  return 'webm';
}

function resolveField(field: string, source: FieldSource, ctx: ResolveContext): string {
  switch (source) {
    case 'selection':
      return ctx.request.token;
    case 'cue':
      return ctx.request.sentence;
    case 'translate':
      return ctx.translation || ctx.bilingual || '';
    case 'dictionary': {
      const f = field.toLowerCase();
      if (/phon|ipa|pronun/.test(f)) return ctx.phonetic;
      if (/mono|definition|definición/.test(f)) return ctx.monolingual;
      return ctx.bilingual || ctx.translation;
    }
    case 'ai-definition':
      return ctx.ai?.contextualDefinition ?? '';
    case 'ai-synonyms':
      return ctx.ai?.synonyms.join(', ') ?? '';
    case 'ai-collocations':
      return ctx.ai?.collocations.join(', ') ?? '';
    case 'ai-nuance':
      return ctx.ai?.nuancedTranslation ?? '';
    case 'ai-register':
      return ctx.ai?.register ?? '';
    case 'tts':
      // The wrapper below tries to fill this field with an audio file. If TTS
      // generation fails we leave the raw text here so Anki can fall back to
      // its built-in `{{tts <lang>:Field}}` template (configured in the model).
      return ctx.request.sentence;
    case 'manual':
    case 'frame':
    case 'tabCapture':
      // Media fields — the value is appended by AnkiConnect via `picture`/`audio` arrays.
      return '';
    default:
      return '';
  }
}

async function resolveAudio(
  request: CreateCardRequest,
  capture: CaptureSettings,
): Promise<{ dataUrl: string; mime: string } | null> {
  // Prefer the explicit audio attached by the caller (e.g. content script
  // already extracted via VAD).
  if (request.audio) {
    const mime = /data:([^;]+)/.exec(request.audio)?.[1] ?? 'audio/webm';
    return { dataUrl: request.audio, mime };
  }

  // Otherwise, ask the offscreen recorder for a slice covering the cue range.
  const status = getAudioCaptureStatus();
  if (!status.active) return null;
  if (request.cueStart == null || request.cueEnd == null) return null;

  // The cue times in the request are video-time (ms). The offscreen recorder
  // stores wall-clock timestamps. We translate by treating "now" as the
  // current cue end + post-roll: the user just hit save while the cue was
  // visible, so the rolling buffer covers it.
  const now = Date.now();
  const duration = Math.max(500, request.cueEnd - request.cueStart);
  const preRoll = Math.max(0, capture.preRoll ?? DEFAULT_CAPTURE.preRoll);
  const postRoll = Math.max(0, capture.postRoll ?? DEFAULT_CAPTURE.postRoll);
  const start = now - duration - preRoll;
  const end = now + postRoll;

  // VAD-on-extract trims the WebM/Opus chunk down to actual speech and
  // re-encodes as 16 kHz mono WAV — Anki plays it, file size is small and
  // the same PCM is what Whisper.cpp will consume in the ASR fallback path.
  const useVad = capture.endDetect === 'vad';
  const clip = await extractAudioClip(start, end, {
    format: 'wav',
    useVad,
    preRollMs: preRoll,
    postRollMs: postRoll,
  });
  if (!clip.ok || !clip.dataUrl) return null;
  return { dataUrl: clip.dataUrl, mime: clip.mimeType || 'audio/wav' };
}

export async function createCardFromRequest(
  request: CreateCardRequest,
  mapping: AnkiMapping,
  capture: CaptureSettings = DEFAULT_CAPTURE,
): Promise<CreateCardResponse> {
  const warnings: string[] = [];
  const dictionaryHit = await translateToken(request.token, request.language ?? 'en');

  // Optional AI enrichment — gated by the user's premium settings.
  let aiData: AiEnrichment | null = null;
  try {
    const aiSettings = await getAiSettings();
    if (aiSettings.enrichOnSave && aiSettings.provider !== 'disabled') {
      const nativeLang = await getResolvedNativeLang(aiSettings);
      const result = await enrichWithAi({
        token: request.token,
        sentence: request.sentence,
        sourceLang: request.language ?? 'en',
        nativeLang,
        platform: request.platform,
      });
      if (result.ok) aiData = result.data;
      else warnings.push(`IA no respondió: ${result.error}`);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'AI failure';
    warnings.push(`IA no respondió: ${reason}`);
  }

  const ctx: ResolveContext = {
    request,
    mapping,
    translation: dictionaryHit?.translation ?? '',
    bilingual: dictionaryHit?.bilingual ?? dictionaryHit?.translation ?? '',
    monolingual: dictionaryHit?.monolingual ?? '',
    phonetic: dictionaryHit?.phonetic ?? '',
    ai: aiData,
  };

  const fieldMapping = Object.entries(mapping.fieldSources ?? {});
  const fields: Record<string, string> = {};

  if (fieldMapping.length === 0) {
    // No explicit mapping yet → fall back to common defaults to keep the card useful.
    fields.Front = request.token;
    fields.Back = [request.sentence, ctx.translation].filter(Boolean).join('<br><br>');
  } else {
    for (const [field, source] of fieldMapping) {
      fields[field] = resolveField(field, source, ctx);
    }
  }

  // Frame
  const pictures: AnkiMedia[] = [];
  if (request.frame) {
    const frameField = fieldMapping.find(([, s]) => s === 'frame')?.[0];
    if (frameField) {
      const filename = safeFilename(request.token, 'jpg');
      try {
        await ankiConnect.storeMediaFile(filename, dataUrlToBase64(request.frame), mapping.ankiUrl);
        pictures.push({ filename, data: dataUrlToBase64(request.frame), fields: [frameField] });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'frame';
        warnings.push(`No se pudo guardar el frame: ${reason}`);
      }
    }
  }

  // Audio — a field can be sourced from the live tab capture (preferred when
  // available) or from a remote TTS provider as a fallback.
  const audios: AnkiMedia[] = [];
  const tabCaptureField = fieldMapping.find(([, s]) => s === 'tabCapture')?.[0];
  const ttsField = fieldMapping.find(([, s]) => s === 'tts')?.[0];
  const audioField = tabCaptureField ?? ttsField;
  let attachedAudio = false;
  if (audioField) {
    const resolved = await resolveAudio(request, capture);
    if (resolved) {
      const filename = safeFilename(request.token, extForMime(resolved.mime));
      try {
        await ankiConnect.storeMediaFile(
          filename,
          dataUrlToBase64(resolved.dataUrl),
          mapping.ankiUrl,
        );
        audios.push({
          filename,
          data: dataUrlToBase64(resolved.dataUrl),
          fields: [audioField],
        });
        attachedAudio = true;
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'audio';
        warnings.push(`No se pudo guardar el audio: ${reason}`);
      }
    } else if (tabCaptureField && getAudioCaptureStatus().active === false) {
      warnings.push('La captura de audio no está activa — no se adjuntó audio.');
    }
  }

  // TTS field with no live audio — try the OpenAI TTS endpoint. If it works,
  // attach an MP3 file; otherwise leave the text in the field so Anki's
  // template `{{tts <lang>:Field}}` can still synthesise on review.
  if (ttsField && !attachedAudio) {
    const ttsText = fields[ttsField] || request.sentence;
    if (ttsText) {
      try {
        const tts = await generateTtsAudio(ttsText, request.language ?? 'en');
        if (tts.ok) {
          const filename = safeFilename(request.token, extForMime(tts.mime));
          const data = dataUrlToBase64(tts.dataUrl);
          await ankiConnect.storeMediaFile(filename, data, mapping.ankiUrl);
          audios.push({ filename, data, fields: [ttsField] });
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'tts';
        warnings.push(`TTS no respondió: ${reason}`);
      }
    }
  }

  try {
    const noteId = await ankiConnect.addNote(
      {
        deckName: mapping.deckName,
        modelName: mapping.modelName,
        fields,
        tags: ['kivara-lingo', request.platform ?? 'web'].filter(Boolean) as string[],
        picture: pictures.length ? pictures : undefined,
        audio: audios.length ? audios : undefined,
        options: { allowDuplicate: false },
      },
      mapping.ankiUrl,
    );
    // Record success in dedup ledger.
    try {
      await getDB().saved_notes.put({
        token: request.token,
        language: request.language ?? 'en',
        sentence: request.sentence,
        ankiNoteId: noteId,
        createdAt: Date.now(),
      });
    } catch {
      // best-effort — ignore IndexedDB errors
    }
    return { ok: true, noteId, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'addNote failed';
    // Queue for retry by the alarm.
    try {
      await getDB().pending_notes.add({
        request,
        retries: 0,
        lastError: message,
        createdAt: Date.now(),
        nextAttemptAt: Date.now() + 60_000,
      });
    } catch {
      // ignore
    }
    return { ok: false, error: message, warnings };
  }
}

/** Drain the pending queue. Called by `chrome.alarms`. */
export async function retryPendingNotes(
  mapping: AnkiMapping,
  capture: CaptureSettings = DEFAULT_CAPTURE,
): Promise<{ retried: number; succeeded: number }> {
  const db = getDB();
  const now = Date.now();
  let retried = 0;
  let succeeded = 0;
  let rows: PendingNoteRow[] = [];
  try {
    rows = await db.pending_notes.where('nextAttemptAt').belowOrEqual(now).toArray();
  } catch {
    return { retried: 0, succeeded: 0 };
  }
  for (const row of rows) {
    if (!row.id) continue;
    retried += 1;
    const result = await createCardFromRequest(row.request, mapping, capture);
    if (result.ok) {
      try {
        await db.pending_notes.delete(row.id);
        succeeded += 1;
      } catch {
        // ignore
      }
    } else {
      const nextRetries = row.retries + 1;
      const backoffMs = Math.min(60_000 * 30, 60_000 * Math.pow(2, nextRetries));
      try {
        await db.pending_notes.update(row.id, {
          retries: nextRetries,
          lastError: result.error ?? 'unknown',
          nextAttemptAt: Date.now() + backoffMs,
        });
      } catch {
        // ignore
      }
    }
  }
  return { retried, succeeded };
}
