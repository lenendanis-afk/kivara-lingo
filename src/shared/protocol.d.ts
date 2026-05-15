import 'webext-bridge';
import type { ProtocolWithReturn } from 'webext-bridge';
import type {
  CreateCardRequest,
  CreateCardResponse,
  AnkiPingResponse,
  AnkiListsResponse,
  AnkiFieldsResponse,
} from './types';

declare module 'webext-bridge' {
  export interface ProtocolMap {
    CREATE_CARD: ProtocolWithReturn<CreateCardRequest, CreateCardResponse>;
    ANKI_PING: ProtocolWithReturn<{ url?: string }, AnkiPingResponse>;
    ANKI_DECKS: ProtocolWithReturn<{ url?: string }, AnkiListsResponse>;
    ANKI_MODELS: ProtocolWithReturn<{ url?: string }, AnkiListsResponse>;
    ANKI_FIELDS: ProtocolWithReturn<{ url?: string; modelName: string }, AnkiFieldsResponse>;
    START_AUDIO_CAPTURE: ProtocolWithReturn<{ tabId?: number }, { ok: boolean }>;
    STOP_AUDIO_CAPTURE: ProtocolWithReturn<Record<string, never>, { ok: boolean }>;
  }
}
