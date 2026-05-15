/// <reference types="chrome" />

const DEFAULT_URL = 'http://127.0.0.1:8765';
const DEFAULT_VERSION = 6;
const DEFAULT_TIMEOUT_MS = 4000;

export class AnkiConnectError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'AnkiConnectError';
  }
}

async function invoke<T = unknown>(
  action: string,
  params: Record<string, unknown> = {},
  url: string = DEFAULT_URL,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, version: DEFAULT_VERSION, params }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeout);
    const reason = err instanceof Error ? err.message : String(err);
    throw new AnkiConnectError(`No se pudo contactar AnkiConnect (${reason}). ¿Está Anki abierto?`, 'NETWORK');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new AnkiConnectError(`AnkiConnect respondió ${response.status}.`, 'HTTP');
  }

  const json = (await response.json()) as { result: T; error: string | null };
  if (json.error) throw new AnkiConnectError(json.error, 'ANKI');
  return json.result;
}

export interface AnkiNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags?: string[];
  audio?: AnkiMedia[];
  picture?: AnkiMedia[];
  options?: {
    allowDuplicate?: boolean;
    duplicateScope?: 'deck' | 'collection';
    duplicateScopeOptions?: {
      deckName?: string;
      checkChildren?: boolean;
      checkAllModels?: boolean;
    };
  };
}

export interface AnkiMedia {
  filename: string;
  data: string; // base64
  fields: string[];
}

export const ankiConnect = {
  async ping(url?: string): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
    try {
      const version = await invoke<number>('version', {}, url ?? DEFAULT_URL, 2000);
      return { ok: true, version };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      return { ok: false, error: message };
    }
  },

  async deckNames(url?: string): Promise<string[]> {
    return invoke<string[]>('deckNames', {}, url ?? DEFAULT_URL);
  },

  async modelNames(url?: string): Promise<string[]> {
    return invoke<string[]>('modelNames', {}, url ?? DEFAULT_URL);
  },

  async modelFieldNames(modelName: string, url?: string): Promise<string[]> {
    return invoke<string[]>('modelFieldNames', { modelName }, url ?? DEFAULT_URL);
  },

  async addNote(note: AnkiNote, url?: string): Promise<number> {
    return invoke<number>('addNote', { note }, url ?? DEFAULT_URL);
  },

  async storeMediaFile(filename: string, dataBase64: string, url?: string): Promise<string> {
    return invoke<string>('storeMediaFile', { filename, data: dataBase64 }, url ?? DEFAULT_URL);
  },

  async createDeck(deck: string, url?: string): Promise<number> {
    return invoke<number>('createDeck', { deck }, url ?? DEFAULT_URL);
  },
};

/** Strip the `data:...;base64,` prefix from a data URL. */
export function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx === -1 ? dataUrl : dataUrl.slice(idx + 1);
}
