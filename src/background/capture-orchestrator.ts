/// <reference types="chrome" />

import type {
  AnkiMapping,
  CreateCardRequest,
  CreateCardResponse,
  FieldSource,
} from '../shared/types';
import { ankiConnect, dataUrlToBase64, type AnkiMedia } from './anki-connect';
import { translateToken } from './translate';

interface ResolveContext {
  request: CreateCardRequest;
  mapping: AnkiMapping;
  translation: string;
  bilingual: string;
  monolingual: string;
  phonetic: string;
}

function safeFilename(base: string, ext: string): string {
  const slug = base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'kivara';
  return `kivara_${slug}_${Date.now()}.${ext}`;
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
    case 'tts':
      // Phase 2: dictionary or 3rd-party TTS. Empty for now.
      return '';
    case 'manual':
    case 'frame':
    case 'tabCapture':
      // Media fields — the value is appended by AnkiConnect via `picture`/`audio` arrays.
      // Returning an empty string here ensures the field exists but does not duplicate data.
      return '';
    default:
      return '';
  }
}

export async function createCardFromRequest(
  request: CreateCardRequest,
  mapping: AnkiMapping,
): Promise<CreateCardResponse> {
  const warnings: string[] = [];

  const dictionaryHit = await translateToken(request.token, request.language ?? 'en');
  const ctx: ResolveContext = {
    request,
    mapping,
    translation: dictionaryHit?.translation ?? '',
    bilingual: dictionaryHit?.bilingual ?? dictionaryHit?.translation ?? '',
    monolingual: dictionaryHit?.monolingual ?? '',
    phonetic: dictionaryHit?.phonetic ?? '',
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

  const pictures: AnkiMedia[] = [];
  const audios: AnkiMedia[] = [];

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

  if (request.audio) {
    const audioField = fieldMapping.find(([, s]) => s === 'tabCapture' || s === 'tts')?.[0];
    if (audioField) {
      const ext = request.audio.includes('audio/mp3') ? 'mp3' : 'webm';
      const filename = safeFilename(request.token, ext);
      try {
        await ankiConnect.storeMediaFile(filename, dataUrlToBase64(request.audio), mapping.ankiUrl);
        audios.push({ filename, data: dataUrlToBase64(request.audio), fields: [audioField] });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'audio';
        warnings.push(`No se pudo guardar el audio: ${reason}`);
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
    return { ok: true, noteId, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'addNote failed';
    return { ok: false, error: message, warnings };
  }
}
