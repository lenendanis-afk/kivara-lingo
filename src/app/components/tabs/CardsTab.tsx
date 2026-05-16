import React, { useEffect, useMemo, useState } from 'react';
import { sendMessage } from 'webext-bridge/content-script';
import { AnkiMapping, FieldSource } from '../../types';
import type { AnkiListsResponse, AnkiFieldsResponse, AnkiPingResponse } from '../../../shared/types';
import {
  RefreshCw, RotateCcw, Volume2, Camera, Wand2, Layers,
  ChevronDown, Loader2, AlertCircle, Server, Database, FileText, Plug,
} from 'lucide-react';

interface CardsTabProps {
  mapping: AnkiMapping;
  setMapping: (mapping: AnkiMapping) => void;
  mockData: {
    targetSentence: string;
    nativeSentence: string;
    word: string;
    translation: string;
    phonetic?: string;
    bilingual?: string;
    monolingual?: string;
  };
}

const FALLBACK_DECKS = ['Vocabulario Inglés', 'Default'];
const FALLBACK_MODELS = ['KivaraLingo', 'Basic'];
const FALLBACK_FIELDS: Record<string, string[]> = {
  'KivaraLingo': ['word', 'phonetic', 'sentence', 'translation', 'bilingual', 'monolingual', 'picture', 'sentence audio', 'word audio'],
  'Basic': ['Front', 'Back'],
};

function detectSource(fieldName: string): FieldSource {
  const n = fieldName.toLowerCase().trim();
  if (/audio/.test(n)) return /sentence|frase|cue/.test(n) ? 'tabCapture' : 'dictionary';
  if (/picture|image|imagen|frame|screenshot/.test(n)) return 'frame';
  if (/phon|ipa|pronun/.test(n)) return 'dictionary';
  if (/translation|traduccion|traducción|native|spanish|español/.test(n)) return 'translate';
  if (/bilingual|monolingual|definition|definición|meaning|sentido/.test(n)) return 'dictionary';
  if (/sentence|frase|context|cue|reverso|extra/.test(n)) return 'cue';
  if (/word|palabra|term|anverso|texto|front/.test(n)) return 'selection';
  return 'manual';
}

const SOURCE_META: Record<FieldSource, { label: string; color: string; description: string }> = {
  selection:  { label: 'Selección',   color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',     description: 'Palabra seleccionada' },
  cue:        { label: 'Subtítulo',   color: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',                 description: 'Frase del cue activo' },
  dictionary: { label: 'Diccionario', color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',         description: 'Free Dictionary API' },
  translate:  { label: 'Traducción',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', description: 'DeepL / Google' },
  frame:      { label: 'Frame',       color: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-300',             description: 'Escena limpia + subtítulo' },
  tabCapture: { label: 'tabCapture',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',             description: 'Audio de pestaña + VAD' },
  tts:        { label: 'TTS',         color: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300',                description: 'Text-to-speech fallback' },
  manual:     { label: 'Manual',      color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',                description: 'Lo escribes tú' },
};

const SOURCE_OPTIONS: FieldSource[] = ['selection','cue','dictionary','translate','frame','tabCapture','tts','manual'];

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';

export function CardsTab({ mapping, setMapping, mockData }: CardsTabProps) {
  const [conn, setConn] = useState<ConnectionState>('idle');
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const [previewOpen, setPreviewOpen] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [decks, setDecks] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [fieldsByModel, setFieldsByModel] = useState<Record<string, string[]>>({});

  const ankiFields = useMemo(
    () => fieldsByModel[mapping.modelName] ?? FALLBACK_FIELDS[mapping.modelName] ?? [],
    [fieldsByModel, mapping.modelName],
  );

  async function refreshAnki() {
    setConn('connecting');
    try {
      const ping = (await sendMessage('ANKI_PING', { url: mapping.ankiUrl }, 'background')) as AnkiPingResponse;
      if (!ping?.ok) {
        setConn('error');
        setDecks([]);
        setModels([]);
        return;
      }
      const lists = (await sendMessage('ANKI_DECKS', { url: mapping.ankiUrl }, 'background')) as AnkiListsResponse;
      setDecks(lists.decks ?? []);
      setModels(lists.models ?? []);
      if (lists.models?.length) {
        await Promise.all(
          lists.models.map(async (m) => {
            const res = (await sendMessage(
              'ANKI_FIELDS',
              { url: mapping.ankiUrl, modelName: m },
              'background',
            )) as AnkiFieldsResponse;
            setFieldsByModel((prev) => ({ ...prev, [m]: res.fields ?? [] }));
          }),
        );
      }
      setConn('connected');
    } catch {
      setConn('error');
    }
  }

  useEffect(() => {
    void refreshAnki();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (conn !== 'connected' || ankiFields.length === 0) return;
    const next: Record<string, FieldSource> = {};
    let changed = false;
    ankiFields.forEach(f => {
      next[f] = mapping.fieldSources[f] ?? detectSource(f);
      if (mapping.fieldSources[f] !== next[f]) changed = true;
    });
    if (changed || Object.keys(mapping.fieldSources).length !== ankiFields.length) {
      setMapping({ ...mapping, fieldSources: next });
    }
  }, [mapping.modelName, conn]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = () => {
    void refreshAnki();
  };

  const setSource = (field: string, src: FieldSource) => {
    setMapping({ ...mapping, fieldSources: { ...mapping.fieldSources, [field]: src } });
  };

  const applyAutoPreset = () => {
    const next: Record<string, FieldSource> = {};
    ankiFields.forEach(f => { next[f] = detectSource(f); });
    setMapping({ ...mapping, fieldSources: next });
  };

  const allAuto = ankiFields.length > 0 && ankiFields.every(f => mapping.fieldSources[f] === detectSource(f));
  const mappedCount = ankiFields.filter(f => mapping.fieldSources[f] && mapping.fieldSources[f] !== 'manual').length;

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* `pb-6` keeps the last mapping row readable above the docked
          preview (which has its own `border-t`). */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 pb-6 space-y-3">

        {/* Conexión */}
        <Section
          icon={<Plug size={10} />}
          title="Conexión"
          collapsible
          open={setupOpen}
          onToggle={() => setSetupOpen(!setupOpen)}
          headerRight={
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 normal-case tracking-normal">
              <ConnDot state={conn} />
              {conn === 'connected' && <span className="text-emerald-600 dark:text-emerald-400">activo</span>}
              {conn === 'connecting' && <span className="text-amber-600 dark:text-amber-400">conectando…</span>}
              {conn === 'error' && <span className="text-rose-600 dark:text-rose-400">sin conexión</span>}
              {conn === 'idle' && <span>inactivo</span>}
            </span>
          }
        >
          <Row label={<span className="flex items-center gap-1"><Server size={10} className="text-zinc-400" />Endpoint</span>}>
            <div className="flex gap-1.5">
              <input
                value={mapping.ankiUrl}
                onChange={(e) => setMapping({ ...mapping, ankiUrl: e.target.value })}
                className="sl-input sl-mono flex-1 min-w-0"
                placeholder="http://127.0.0.1:8765"
              />
              <button
                onClick={handleConnect}
                className="text-[10px] font-semibold px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors flex items-center gap-1"
              >
                {conn === 'connecting' ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                Probar
              </button>
            </div>
          </Row>

          <Row label={<span className="flex items-center gap-1"><Database size={10} className="text-zinc-400" />Mazo</span>}>
            <select
              value={mapping.deckName}
              onChange={(e) => setMapping({ ...mapping, deckName: e.target.value })}
              disabled={conn !== 'connected'}
              className="sl-select"
            >
              {conn === 'connected'
                ? (decks.length ? decks : FALLBACK_DECKS).map(d => <option key={d}>{d}</option>)
                : <option>Sin conexión</option>}
            </select>
          </Row>

          <Row label={<span className="flex items-center gap-1"><FileText size={10} className="text-zinc-400" />Note type</span>}>
            <select
              value={mapping.modelName}
              onChange={(e) => setMapping({ ...mapping, modelName: e.target.value, fieldSources: {} })}
              disabled={conn !== 'connected'}
              className="sl-select"
            >
              {conn === 'connected'
                ? (models.length ? models : FALLBACK_MODELS).map(n => <option key={n}>{n}</option>)
                : <option>Sin conexión</option>}
            </select>
          </Row>
        </Section>

        {/* Mapeo de campos */}
        <Section
          icon={<Layers size={10} />}
          title={<>Mapeo · <span className="font-mono normal-case">{mapping.modelName}</span></>}
          headerRight={
            <span className="text-[10px] font-mono tabular-nums text-zinc-400 dark:text-zinc-500">
              {mappedCount}/{ankiFields.length}
            </span>
          }
        >
          {conn === 'connected' && ankiFields.length > 0 && !allAuto && (
            <button
              onClick={applyAutoPreset}
              className="w-full flex items-center gap-1.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/25 rounded-md px-2 py-1.5 transition-colors"
            >
              <Wand2 size={11} /> Restaurar auto-mapeo
            </button>
          )}

          {conn === 'connected' && ankiFields.length > 0 && allAuto && (
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 dark:text-zinc-500 px-1">
              <Wand2 size={10} className="text-indigo-400" />
              <span>Auto-mapeo activo · detectado por nombre</span>
            </div>
          )}

          {conn !== 'connected' && (
            <EmptyState icon={<AlertCircle size={13} />} text="Conéctate a AnkiConnect para ver los campos." />
          )}

          {conn === 'connected' && ankiFields.length === 0 && (
            <EmptyState icon={<AlertCircle size={13} />} text="Este note type no tiene campos." />
          )}

          {conn === 'connected' && ankiFields.map((field) => {
            const src = mapping.fieldSources[field] ?? detectSource(field);
            const meta = SOURCE_META[src];
            const isOpen = editingField === field;
            const auto = src === detectSource(field);
            return (
              <div key={field} className="rounded-md bg-zinc-50/70 dark:bg-zinc-800/30 border border-zinc-200/60 dark:border-zinc-800/70 overflow-hidden">
                <button
                  onClick={() => setEditingField(isOpen ? null : field)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <span className="flex-1 min-w-0 flex items-center gap-1.5 text-left">
                    <span className="text-[11px] font-mono font-medium text-zinc-800 dark:text-zinc-200 leading-tight truncate">
                      {field}
                    </span>
                    {auto && <Wand2 size={8} className="text-indigo-400/70 shrink-0" />}
                  </span>
                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.color}`}>
                    {meta.label}
                  </span>
                  <ChevronDown size={10} className={`text-zinc-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                  <div className="border-t border-zinc-200/60 dark:border-zinc-800/60 p-1.5 bg-white dark:bg-zinc-900 animate-in slide-in-from-top-1 duration-150 space-y-1">
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-500 px-1 leading-snug">
                      {meta.description}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {SOURCE_OPTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => setSource(field, s)}
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-medium transition-colors ${
                            src === s
                              ? `${SOURCE_META[s].color} border-current`
                              : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                          }`}
                        >
                          {SOURCE_META[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      </div>

      {/* Preview Anki — docked & collapsible.
          `shrink-0` keeps it visible above the scroll area, but the user can
          collapse it to free vertical space (especially in popup mode where
          the panel is only 600px tall). */}
      <div className="bg-zinc-50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
        <button
          onClick={() => setPreviewOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-zinc-100/60 dark:hover:bg-zinc-900/60 transition-colors"
          title={previewOpen ? 'Ocultar preview' : 'Mostrar preview'}
        >
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <Layers size={10} className="text-indigo-500" /> Preview
          </span>
          <span className="flex items-center gap-1.5">
            {previewOpen && (
              <span
                role="group"
                onClick={(e) => e.stopPropagation()}
                className="flex bg-zinc-200/80 dark:bg-zinc-800/80 rounded-md p-0.5"
              >
                {(['front', 'back'] as const).map((side) => (
                  <span
                    key={side}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setPreviewSide(side); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setPreviewSide(side);
                      }
                    }}
                    className={`text-[9px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded transition-all cursor-pointer ${
                      previewSide === side
                        ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {side === 'front' ? 'Frente' : 'Reverso'}
                  </span>
                ))}
              </span>
            )}
            <ChevronDown
              size={12}
              className={`text-zinc-400 transition-transform ${previewOpen ? 'rotate-180' : ''}`}
            />
          </span>
        </button>

        {previewOpen && (
          <div className="px-3 pb-3 pt-1 max-h-[40vh] overflow-y-auto">
            <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-3 shadow-md overflow-hidden">
              <button
                onClick={() => setPreviewSide(previewSide === 'front' ? 'back' : 'front')}
                className="absolute top-1.5 right-2 text-zinc-500 hover:text-indigo-400 hover:rotate-180 transition-all duration-300 z-10"
                title="Voltear"
              >
                <RotateCcw size={11} />
              </button>
              {previewSide === 'front' ? <FrontTemplate mockData={mockData} /> : <BackTemplate mockData={mockData} />}
            </div>

            <div className="flex items-center justify-between gap-2 mt-2 px-0.5">
              <div className="flex items-center gap-1">
                <QualityBadge icon={<Volume2 size={9} />} label="Audio" detail="VAD" />
                <QualityBadge icon={<Camera size={9} />} label="Frame" detail="centro" />
              </div>
              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 font-mono">
                {mappedCount}/{ankiFields.length} · 14KB
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- shared (matches SubtitlesTab/SettingsTab) ---------- */

function Section({
  icon, title, children, collapsible, open, onToggle, headerRight,
}: {
  icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode;
  collapsible?: boolean; open?: boolean; onToggle?: () => void;
  headerRight?: React.ReactNode;
}) {
  const header = (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 bg-zinc-50/60 dark:bg-zinc-900/60 border-b border-zinc-100 dark:border-zinc-800/60">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {icon}{title}
      </span>
      <span className="flex items-center gap-1.5">
        {headerRight}
        {collapsible && (
          <ChevronDown size={12} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </span>
    </div>
  );
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {collapsible
        ? <button onClick={onToggle} className="w-full text-left hover:bg-zinc-100/40 dark:hover:bg-zinc-800/40 transition-colors">{header}</button>
        : header}
      {(!collapsible || open) && (
        <div className="p-2.5 space-y-2">{children}</div>
      )}
    </div>
  );
}

function Row({ label, value, children }: { label: React.ReactNode; value?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">{label}</label>
        {value && (
          <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
            {value}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ConnDot({ state }: { state: ConnectionState }) {
  const color =
    state === 'connected' ? 'bg-emerald-500'
    : state === 'connecting' ? 'bg-amber-500'
    : state === 'error' ? 'bg-rose-500'
    : 'bg-zinc-400';
  return (
    <span className="relative inline-flex w-2 h-2">
      {state === 'connected' && (
        <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" style={{ animationDuration: '2.4s' }} />
      )}
      <span className={`relative inline-flex w-2 h-2 rounded-full ${color}`} />
    </span>
  );
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 p-3 text-center text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-col items-center gap-1">
      <span className="text-zinc-400">{icon}</span>
      {text}
    </div>
  );
}

function FrontTemplate({ mockData }: { mockData: CardsTabProps['mockData'] }) {
  return (
    <div className="font-sans text-zinc-100 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-2xl font-bold text-white leading-tight">{mockData.word}</div>
          <div className="text-[11px] font-mono text-zinc-400 mt-0.5 inline-block bg-zinc-800/70 px-1.5 py-0.5 rounded">
            {mockData.phonetic ?? '/ipa/'}
          </div>
        </div>
        <button className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
          <Volume2 size={12} />
        </button>
      </div>
    </div>
  );
}

function BackTemplate({ mockData }: { mockData: CardsTabProps['mockData'] }) {
  return (
    <div className="font-sans text-zinc-100 space-y-2 animate-in fade-in zoom-in-95 duration-200">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-bold text-white leading-tight">{mockData.word}</div>
          <div className="text-[10px] font-mono text-zinc-400">{mockData.phonetic ?? '/ipa/'}</div>
        </div>
        <button className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
          <Volume2 size={10} />
        </button>
      </div>
      <div className="h-px bg-zinc-700" />
      <div className="text-[11px] text-zinc-200 bg-zinc-800/60 rounded px-2 py-1">
        <span className="italic text-zinc-400">(noun)</span> {mockData.translation}
      </div>
      <div className="relative rounded-md overflow-hidden border border-zinc-700 bg-zinc-950 h-24">
        <img
          src="https://images.unsplash.com/photo-1574923930958-9b653a0e5148?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=80"
          alt="Escena"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute bottom-1 left-0 right-0 flex justify-center px-2">
          <span
            className="text-[10px] font-bold text-yellow-300 px-1.5 py-0.5 rounded leading-tight text-center"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)' }}
          >
            {mockData.targetSentence}
          </span>
        </div>
        <span className="absolute top-1 right-1 text-[8px] font-mono uppercase tracking-wider bg-black/60 text-emerald-300 px-1 py-0.5 rounded">
          clean
        </span>
      </div>
      <div className="text-[10px] text-zinc-300 bg-zinc-800/40 rounded px-2 py-1 italic">
        {mockData.monolingual ?? 'Definición monolingüe.'}
      </div>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-zinc-100 leading-snug">{mockData.targetSentence}</div>
          <div className="text-[10px] text-zinc-500 italic leading-snug">{mockData.nativeSentence}</div>
        </div>
        <button className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
          <Volume2 size={10} />
        </button>
      </div>
    </div>
  );
}

function QualityBadge({ icon, label, detail }: { icon: React.ReactNode; label: string; detail: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200/70 dark:border-emerald-500/20">
      {icon}<span className="font-semibold">{label}</span><span className="opacity-70">· {detail}</span>
    </span>
  );
}
