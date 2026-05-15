/**
 * IndexedDB schema for Kivara Lingo (via Dexie).
 *
 * Tables:
 *  - saved_notes: dedup ledger of cards that successfully made it into Anki
 *  - pending_notes: queue of requests that couldn't reach AnkiConnect; retried by alarm
 *  - translation_cache: provider responses keyed by (text, source, target, provider)
 *  - media_cache: optional dedup hashes for audio/frame blobs (kept small)
 */
import Dexie, { type Table } from 'dexie';
import type { CreateCardRequest } from './types';

export interface SavedNoteRow {
  id?: number;
  /** The token (word or MWE) the user saved */
  token: string;
  /** ISO BCP-47 language tag of the source */
  language: string;
  /** Full sentence (cue text) when the card was made — helps dedup near-misses */
  sentence: string;
  /** AnkiConnect-assigned note id */
  ankiNoteId: number;
  createdAt: number;
}

export interface PendingNoteRow {
  id?: number;
  request: CreateCardRequest;
  retries: number;
  lastError: string | null;
  createdAt: number;
  nextAttemptAt: number;
}

export interface TranslationRow {
  /** composite key: `${provider}|${source}|${target}|${text.toLowerCase()}` */
  key: string;
  provider: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  translatedText: string;
  expiresAt: number;
  createdAt: number;
}

export interface MediaCacheRow {
  /** SHA-256 hex of the underlying bytes */
  hash: string;
  /** 'audio' or 'frame' */
  kind: 'audio' | 'frame';
  /** Anki filename stored on the server */
  ankiFilename: string;
  createdAt: number;
}

class KivaraDB extends Dexie {
  saved_notes!: Table<SavedNoteRow, number>;
  pending_notes!: Table<PendingNoteRow, number>;
  translation_cache!: Table<TranslationRow, string>;
  media_cache!: Table<MediaCacheRow, string>;

  constructor() {
    super('kivara-lingo');
    this.version(1).stores({
      saved_notes: '++id, &[token+language+sentence], ankiNoteId, createdAt',
      pending_notes: '++id, nextAttemptAt, createdAt',
      translation_cache: '&key, [provider+sourceLang+targetLang], expiresAt',
      media_cache: '&hash, kind, createdAt',
    });
  }
}

let _db: KivaraDB | null = null;

/** Lazy singleton — Dexie throws if instantiated outside of an `indexedDB` environment. */
export function getDB(): KivaraDB {
  if (!_db) _db = new KivaraDB();
  return _db;
}

export function translationCacheKey(
  provider: string,
  source: string,
  target: string,
  text: string,
): string {
  return `${provider}|${source}|${target}|${text.trim().toLowerCase()}`;
}
