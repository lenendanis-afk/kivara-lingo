import React, { useEffect, useMemo, useState } from 'react';
import { sendMessage } from 'webext-bridge/popup';
import {
  CheckCircle2, AlertTriangle, Loader2, Play, ChevronRight, ChevronLeft, ExternalLink,
} from 'lucide-react';
import { KivaraLingoLogo } from '../app/components/KivaraLingoLogo';
import { useKivaraStore } from '../shared/store';
import type {
  AnkiPingResponse,
  AnkiListsResponse,
  AnkiFieldsResponse,
  FieldSource,
} from '../shared/types';

type StepId = 'welcome' | 'anki' | 'mapping' | 'demo' | 'done';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'welcome', label: 'Bienvenida' },
  { id: 'anki', label: 'Anki' },
  { id: 'mapping', label: 'Mapeo' },
  { id: 'demo', label: 'Demo' },
];

const DEMO_URL = 'https://www.youtube.com/watch?v=arj7oStGLkU';

const FIELD_HINTS: Array<{ key: string; label: string; suggestions: RegExp[] }> = [
  { key: 'token', label: 'Palabra / token', suggestions: [/word/i, /front/i, /palabra/i, /token/i] },
  { key: 'sentence', label: 'Frase completa', suggestions: [/sentence/i, /context/i, /frase/i] },
  { key: 'translation', label: 'Traducción', suggestions: [/back/i, /translation/i, /traducci/i, /es/i] },
  { key: 'phonetic', label: 'Fonética / IPA', suggestions: [/phon/i, /ipa/i, /pron/i] },
  { key: 'frame', label: 'Captura (frame)', suggestions: [/image/i, /picture/i, /frame/i, /screenshot/i] },
  { key: 'audio', label: 'Audio', suggestions: [/audio/i, /sound/i, /sentence audio/i] },
];

const FIELD_TO_SOURCE: Record<string, FieldSource> = {
  token: 'selection',
  sentence: 'cue',
  translation: 'translate',
  phonetic: 'dictionary',
  frame: 'frame',
  audio: 'tabCapture',
};

function fieldSourceToAnkiField(hintKey: string, fieldSources: Record<string, FieldSource>): string {
  const src = FIELD_TO_SOURCE[hintKey] ?? 'manual';
  for (const [field, s] of Object.entries(fieldSources)) {
    if (s === src) return field;
  }
  return '';
}

export function Onboarding() {
  const {
    isDarkMode, setIsDarkMode,
    ankiMapping, setAnkiMapping,
    onboarding, setOnboarding,
  } = useKivaraStore();

  const [step, setStep] = useState<StepId>('welcome');
  const [ping, setPing] = useState<{ status: 'idle' | 'pinging' | 'ok' | 'error'; version?: number; error?: string }>({ status: 'idle' });
  const [decks, setDecks] = useState<string[] | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [fields, setFields] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const url = ankiMapping.ankiUrl;

  async function runPing() {
    setPing({ status: 'pinging' });
    try {
      const r = (await sendMessage('ANKI_PING', { url }, 'background')) as AnkiPingResponse;
      if (r.ok) setPing({ status: 'ok', version: r.version });
      else setPing({ status: 'error', error: r.error });
    } catch (err) {
      setPing({ status: 'error', error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  async function loadDecks() {
    setBusy(true);
    try {
      const r = (await sendMessage('ANKI_DECKS', { url }, 'background')) as AnkiListsResponse;
      if (r.decks) setDecks(r.decks);
    } finally {
      setBusy(false);
    }
  }

  async function loadModels() {
    setBusy(true);
    try {
      const r = (await sendMessage('ANKI_MODELS', { url }, 'background')) as AnkiListsResponse;
      if (r.models) setModels(r.models);
    } finally {
      setBusy(false);
    }
  }

  async function loadFields(modelName: string) {
    setBusy(true);
    try {
      const r = (await sendMessage('ANKI_FIELDS', { url, modelName }, 'background')) as AnkiFieldsResponse;
      if (r.fields?.length) {
        setFields(r.fields);
        const suggested: Record<string, FieldSource> = {};
        for (const hint of FIELD_HINTS) {
          const match = r.fields.find((f) => hint.suggestions.some((s) => s.test(f)));
          if (match) suggested[match] = FIELD_TO_SOURCE[hint.key] ?? 'manual';
        }
        setAnkiMapping({
          ...ankiMapping,
          modelName,
          fieldSources: { ...ankiMapping.fieldSources, ...suggested },
        });
      }
    } finally {
      setBusy(false);
    }
  }

  function next() {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx >= 0 && idx + 1 < STEPS.length) setStep(STEPS[idx + 1].id);
    else complete();
  }

  function prev() {
    const idx = STEPS.findIndex((s) => s.id === step);
    if (idx > 0) setStep(STEPS[idx - 1].id);
  }

  function complete() {
    setOnboarding({ completed: true, completedAt: Date.now() });
    setStep('done');
    try {
      chrome.tabs.create({ url: DEMO_URL });
    } catch {
      // ignore (not running inside extension context, e.g. dev preview)
    }
  }

  const progress = useMemo(() => {
    const idx = STEPS.findIndex((s) => s.id === step);
    return idx < 0 ? 100 : Math.round(((idx + 1) / STEPS.length) * 100);
  }, [step]);

  return (
    <div
      className={`min-h-screen w-full ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'} flex flex-col`}
      style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
    >
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/70 backdrop-blur px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <KivaraLingoLogo size={22} isDark={isDarkMode} />
          <span className="text-sm font-semibold">Kivara Lingo · Configuración inicial</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{progress}% completo</span>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            Tema {isDarkMode ? 'claro' : 'oscuro'}
          </button>
        </div>
      </header>

      <div className="h-1 bg-zinc-200 dark:bg-zinc-800">
        <div
          className="h-1 bg-indigo-500 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main className="flex-1 px-6 py-10 max-w-3xl w-full mx-auto">
        {step === 'welcome' && (
          <Section title="Bienvenido a Kivara Lingo" subtitle="Aprende idiomas mientras ves Netflix, HBO, Disney+, Prime y YouTube.">
            <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-300">
              <p>Esta configuración rápida (≈ 1 minuto) hace tres cosas:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Verifica que <strong>Anki</strong> esté abierto y AnkiConnect responda.</li>
                <li>Te deja elegir el <strong>mazo</strong> y el <strong>modelo de notas</strong>.</li>
                <li>Sugiere automáticamente el <strong>mapeo de campos</strong> (palabra, frase, traducción, foto, audio).</li>
              </ul>
              <p className="text-zinc-500 dark:text-zinc-400">
                Si no tienes Anki instalado todavía, instálalo desde{' '}
                <a className="text-indigo-500 hover:underline" href="https://apps.ankiweb.net" target="_blank" rel="noreferrer">
                  apps.ankiweb.net
                </a>{' '}
                y añade el complemento <em>AnkiConnect</em> (código 2055492159).
              </p>
            </div>
          </Section>
        )}

        {step === 'anki' && (
          <Section title="Conexión con Anki" subtitle="AnkiConnect se ejecuta en http://127.0.0.1:8765 cuando Anki está abierto.">
            <Row label="URL de AnkiConnect">
              <input
                type="text"
                value={url}
                onChange={(e) => setAnkiMapping({ ...ankiMapping, ankiUrl: e.target.value })}
                className="sl-input w-full text-sm px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
              />
            </Row>
            <div className="flex items-center gap-3">
              <button
                onClick={runPing}
                disabled={ping.status === 'pinging'}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {ping.status === 'pinging' ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Probar conexión
              </button>
              {ping.status === 'ok' && (
                <span className="inline-flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 size={14} /> Conectado a AnkiConnect v{ping.version}
                </span>
              )}
              {ping.status === 'error' && (
                <span className="inline-flex items-center gap-1 text-[12px] text-rose-600 dark:text-rose-400">
                  <AlertTriangle size={14} /> {ping.error || 'No responde'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Si no responde: abre Anki, ve a <em>Tools → Add-ons → AnkiConnect → Config</em> y comprueba que <code>webBindAddress</code> es <code>127.0.0.1</code>.
            </p>
          </Section>
        )}

        {step === 'mapping' && (
          <Section title="Mazo, modelo y campos" subtitle="Elegimos dónde guardar tus tarjetas y cómo nombrar cada campo.">
            <Row label="Mazo destino">
              <div className="flex gap-2">
                <input
                  type="text"
                  list="deck-options"
                  value={ankiMapping.deckName}
                  onChange={(e) => setAnkiMapping({ ...ankiMapping, deckName: e.target.value })}
                  className="sl-input flex-1 text-sm px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                />
                <datalist id="deck-options">
                  {(decks || []).map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
                <button
                  onClick={loadDecks}
                  disabled={busy}
                  className="px-3 py-2 text-[12px] rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                >
                  Cargar lista
                </button>
              </div>
            </Row>

            <Row label="Modelo de nota">
              <div className="flex gap-2">
                <select
                  value={ankiMapping.modelName}
                  onChange={(e) => {
                    const m = e.target.value;
                    setAnkiMapping({ ...ankiMapping, modelName: m });
                    if (m) loadFields(m);
                  }}
                  className="sl-select flex-1 text-sm px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                >
                  <option value="">— Selecciona un modelo —</option>
                  {(models || [ankiMapping.modelName]).filter(Boolean).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button
                  onClick={loadModels}
                  disabled={busy}
                  className="px-3 py-2 text-[12px] rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                >
                  Cargar
                </button>
              </div>
            </Row>

            {fields && fields.length > 0 && (
              <div className="space-y-2 mt-3">
                <p className="text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
                  Mapeo de campos
                </p>
                {FIELD_HINTS.map((hint) => (
                  <Row key={hint.key} label={hint.label}>
                    <select
                      value={fieldSourceToAnkiField(hint.key, ankiMapping.fieldSources)}
                      onChange={(e) => {
                        const src: FieldSource = FIELD_TO_SOURCE[hint.key] ?? 'manual';
                        const updated = { ...ankiMapping.fieldSources };
                        // Remove any old mapping for this source
                        for (const [k, v] of Object.entries(updated)) {
                          if (v === src) delete updated[k];
                        }
                        if (e.target.value) updated[e.target.value] = src;
                        setAnkiMapping({ ...ankiMapping, fieldSources: updated });
                      }}
                      className="sl-select w-full text-sm px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                    >
                      <option value="">— No mapear —</option>
                      {fields.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </Row>
                ))}
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Los campos sin mapear se ignoran al crear la tarjeta.
                </p>
              </div>
            )}
          </Section>
        )}

        {step === 'demo' && (
          <Section title="¡Prueba en YouTube!" subtitle="Vamos a abrir un video corto para que veas la extensión en acción.">
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900 space-y-3">
              <p className="text-sm">
                Al pulsar <strong>Empezar</strong> abriremos {' '}
                <a className="text-indigo-500 hover:underline" href={DEMO_URL} target="_blank" rel="noreferrer">
                  este video <ExternalLink size={10} className="inline" />
                </a>{' '}
                en una pestaña nueva. Deberías ver los subtítulos estilizados, hover sobre cualquier palabra y un botón "Guardar" en el panel lateral.
              </p>
              <ul className="text-[12px] text-zinc-600 dark:text-zinc-400 list-disc pl-5 space-y-1">
                <li>Hover sobre una palabra → popover con traducción.</li>
                <li>Click "Guardar" → crea la nota en Anki con frame + audio (si activaste captura).</li>
                <li>Para activar la captura de audio: clic en el icono de la extensión → "Activar captura".</li>
              </ul>
            </div>
          </Section>
        )}

        {step === 'done' && (
          <Section title="Listo" subtitle="Onboarding completado.">
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              Ya puedes cerrar esta pestaña. Cuando quieras volver a este asistente, ve a <em>chrome://extensions</em> → Detalles → "Opciones" o haz clic derecho en el icono → "Opciones".
            </p>
          </Section>
        )}

        <div className="flex items-center justify-between mt-8">
          <button
            onClick={prev}
            disabled={step === 'welcome' || step === 'done'}
            className="inline-flex items-center gap-1 text-sm px-3 py-2 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30"
          >
            <ChevronLeft size={14} /> Atrás
          </button>
          {step !== 'done' ? (
            <button
              onClick={next}
              className="inline-flex items-center gap-1 text-sm px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-500"
            >
              {step === 'demo' ? 'Empezar' : 'Siguiente'} <ChevronRight size={14} />
            </button>
          ) : (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Completado el {onboarding.completedAt ? new Date(onboarding.completedAt).toLocaleString() : ''}
            </span>
          )}
        </div>
      </main>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <header>
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{subtitle}</p>}
      </header>
      <div className="space-y-3 pt-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[12px] font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
      {children}
    </div>
  );
}
