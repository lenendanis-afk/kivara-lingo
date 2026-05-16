import React, { useState } from 'react';
import {
  Keyboard, EyeOff, ChevronDown, Mic, Image as ImageIcon, Wand2,
  SlidersHorizontal, BookOpen, Languages, Volume2, Sparkles,
} from 'lucide-react';
import { useKivaraStore } from '../../../shared/store';
import type { AiProvider, TranslateProvider } from '../../../shared/types';
import { DictPacksSection } from './DictPacksSection';

export function SettingsTab() {
  const {
    capture, setCapture, cleanup, setCleanup, mode, setMode,
    translate, setTranslate, asr, setAsr, ai, setAi,
  } = useKivaraStore();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const autoMode = capture.autoMode;
  const setAutoMode = (v: boolean) => setCapture({ ...capture, autoMode: v });
  const audioSource = capture.audioSource;
  const setAudioSource = (v: typeof capture.audioSource) => setCapture({ ...capture, audioSource: v });
  const frameMoment = capture.frameMoment;
  const setFrameMoment = (v: typeof capture.frameMoment) => setCapture({ ...capture, frameMoment: v });
  const endDetect = capture.endDetect;
  const setEndDetect = (v: typeof capture.endDetect) => setCapture({ ...capture, endDetect: v });
  const bufferSize = capture.bufferSize;
  const setBufferSize = (v: number) => setCapture({ ...capture, bufferSize: v });
  const hideUI = cleanup.hideUI;
  const setHideUI = (v: boolean) => setCleanup({ ...cleanup, hideUI: v });
  const hideShadows = cleanup.hideShadows;
  const setHideShadows = (v: boolean) => setCleanup({ ...cleanup, hideShadows: v });

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* `pb-12` reserves enough scroll room so the last "Atajos" row stays
          fully readable even when the OS taskbar overlaps the bottom of the
          panel in dock-to-side mode. */}
      <div className="p-3 pb-12 space-y-3">

        {/* Captura */}
        <Section
          icon={<Wand2 size={10} />}
          title="Captura"
          headerRight={autoMode ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 normal-case tracking-normal">
              <SoftDot /> auto
            </span>
          ) : (
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-500 normal-case tracking-normal">manual</span>
          )}
        >
          <Row label="Modo Automático">
            <Toggle on={autoMode} onChange={setAutoMode} />
          </Row>

          {autoMode && (
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-500 -my-0.5">
              <InlineMeta icon={<Mic size={9} />} text="VAD · 30s" />
              <InlineMeta icon={<ImageIcon size={9} />} text="Centro" />
              <InlineMeta icon={<EyeOff size={9} />} text="UI off" />
            </div>
          )}

          {!autoMode && (
            <div className="space-y-2 pt-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <Row label="Fuente audio">
                <SegmentedControl
                  options={[{ v: 'tab', l: 'Pestaña' }, { v: 'mic', l: 'Mic' }]}
                  value={audioSource}
                  onChange={setAudioSource}
                />
              </Row>
              <Row label="Buffer rolling" value={`${bufferSize}s`}>
                <input
                  type="range" min={10} max={60} step={5} value={bufferSize}
                  onChange={(e) => setBufferSize(Number(e.target.value))}
                  className="sl-range w-full"
                />
              </Row>
              <Row label="Fin de frase">
                <SegmentedControl
                  options={[{ v: 'vad', l: 'VAD' }, { v: 'cue', l: 'Cue exacto' }]}
                  value={endDetect}
                  onChange={setEndDetect}
                />
              </Row>
              <Row label="Momento del frame">
                <SegmentedControl
                  options={[
                    { v: 'start', l: 'Inicio' },
                    { v: 'center', l: 'Centro' },
                    { v: 'end', l: 'Final' },
                  ]}
                  value={frameMoment}
                  onChange={setFrameMoment}
                />
              </Row>
            </div>
          )}
        </Section>

        {/* Modo */}
        <Section icon={<BookOpen size={10} />} title="Modo" headerRight={null}>
          <Row label="Modo Lectura">
            <Toggle on={mode === 'reading'} onChange={(v) => setMode(v ? 'reading' : 'learning')} />
          </Row>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-snug -mt-0.5">
            En lectura ocultamos los popovers; sigues viendo los subtítulos estilizados.
          </p>
        </Section>

        {/* Traducción */}
        <Section
          icon={<Languages size={10} />}
          title="Traducción"
          headerRight={
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-500 normal-case tracking-normal">
              {translate.mode === 'chain' ? 'cadena' : translate.provider}
            </span>
          }
        >
          <Row label="Modo">
            <SegmentedControl
              options={[
                { v: 'chain', l: 'Cadena' },
                { v: 'single', l: 'Único' },
              ]}
              value={translate.mode}
              onChange={(v) => setTranslate({ ...translate, mode: v as 'chain' | 'single' })}
            />
          </Row>
          {translate.mode === 'chain' && (
            <>
              <Row label="Usar nivel free">
                <Toggle
                  on={translate.tiersEnabled.free}
                  onChange={(v) =>
                    setTranslate({
                      ...translate,
                      tiersEnabled: { ...translate.tiersEnabled, free: v },
                    })
                  }
                />
              </Row>
              <Row label="Usar nivel premium">
                <Toggle
                  on={translate.tiersEnabled.premium}
                  onChange={(v) =>
                    setTranslate({
                      ...translate,
                      tiersEnabled: { ...translate.tiersEnabled, premium: v },
                    })
                  }
                />
              </Row>
              <p className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-snug -mt-0.5">
                Orden: diccionario offline → free (MyMemory, Lingva) → premium (DeepL,
                Google, LibreTranslate). Los premium sin API key se saltean automáticamente.
              </p>
            </>
          )}
          {translate.mode === 'single' && (
            <Row label="Proveedor">
              <select
                value={translate.provider}
                onChange={(e) =>
                  setTranslate({ ...translate, provider: e.target.value as TranslateProvider })
                }
                className="sl-select w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
              >
                <option value="offline">Offline (diccionario local)</option>
                <option value="mymemory">MyMemory (free)</option>
                <option value="lingva">Lingva (free)</option>
                <option value="libretranslate">LibreTranslate</option>
                <option value="deepl">DeepL</option>
                <option value="google">Google Cloud Translate</option>
              </select>
            </Row>
          )}
          <Row label="Idioma destino">
            <input
              type="text"
              value={translate.targetLanguage}
              onChange={(e) => setTranslate({ ...translate, targetLanguage: e.target.value.trim() || 'es' })}
              placeholder="es"
              className="sl-input w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
            />
          </Row>
          {/* MyMemory email (raises 5k → 50k chars/day) */}
          <Row label="Email MyMemory (opcional)">
            <input
              type="email"
              value={translate.myMemoryEmail}
              onChange={(e) => setTranslate({ ...translate, myMemoryEmail: e.target.value })}
              placeholder="ej. you@example.com — sube cuota a 50 000 chars/día"
              className="sl-input w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
            />
          </Row>
          <Row label="Lingva URL">
            <input
              type="text"
              value={translate.lingvaUrl}
              onChange={(e) => setTranslate({ ...translate, lingvaUrl: e.target.value })}
              placeholder="https://lingva.thedaviddelta.com"
              className="sl-input w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
            />
          </Row>
          <Row label="DeepL API token">
            <input
              type="password"
              value={translate.deeplToken}
              onChange={(e) => setTranslate({ ...translate, deeplToken: e.target.value })}
              placeholder="xxxxxxxx:fx para Free, sin :fx para Pro"
              className="sl-input w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
            />
          </Row>
          <Row label="Google Cloud API key">
            <input
              type="password"
              value={translate.googleToken}
              onChange={(e) => setTranslate({ ...translate, googleToken: e.target.value })}
              placeholder="AIza..."
              className="sl-input w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
            />
          </Row>
          <Row label="LibreTranslate URL">
            <input
              type="text"
              value={translate.libreTranslateUrl}
              onChange={(e) => setTranslate({ ...translate, libreTranslateUrl: e.target.value })}
              placeholder="https://libretranslate.com o http://localhost:5000"
              className="sl-input w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
            />
          </Row>
          <Row label="LibreTranslate key (opcional)">
            <input
              type="password"
              value={translate.libreTranslateToken}
              onChange={(e) => setTranslate({ ...translate, libreTranslateToken: e.target.value })}
              placeholder="déjalo vacío para instancias públicas o self-host"
              className="sl-input w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
            />
          </Row>
          <Row label="Caché (días)" value={`${translate.cacheTtlDays}d`}>
            <input
              type="range" min={1} max={90} step={1} value={translate.cacheTtlDays}
              onChange={(e) => setTranslate({ ...translate, cacheTtlDays: Number(e.target.value) })}
              className="sl-range w-full"
            />
          </Row>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-snug -mt-0.5">
            El diccionario offline siempre se consulta primero. Los proveedores externos solo se usan si la palabra no aparece allí, y las respuestas se cachean en IndexedDB.
          </p>
        </Section>

        {/* Diccionarios offline (Yomitan packs) */}
        <DictPacksSection />

        {/* IA (premium) */}
        <Section
          icon={<Sparkles size={10} />}
          title="IA (premium)"
          headerRight={
            <span className="text-[10px] font-medium text-zinc-500 dark:text-zinc-500 normal-case tracking-normal">
              {ai.provider === 'disabled' ? 'off' : ai.provider}
            </span>
          }
        >
          <Row label="Proveedor">
            <select
              value={ai.provider}
              onChange={(e) => setAi({ ...ai, provider: e.target.value as AiProvider })}
              className="sl-select w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
            >
              <option value="disabled">Desactivado</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="google-ai">Google Gemini</option>
            </select>
          </Row>
          {ai.provider !== 'disabled' && (
            <>
              <Row label="API key">
                <input
                  type="password"
                  value={ai.apiKey}
                  onChange={(e) => setAi({ ...ai, apiKey: e.target.value })}
                  placeholder="sk-... / Anthropic / Gemini API key"
                  className="sl-input w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
                />
              </Row>
              <Row label="Modelo">
                <input
                  type="text"
                  value={ai.model}
                  onChange={(e) => setAi({ ...ai, model: e.target.value })}
                  placeholder={
                    ai.provider === 'openai' ? 'gpt-4o-mini'
                    : ai.provider === 'anthropic' ? 'claude-3-5-haiku-latest'
                    : 'gemini-1.5-flash'
                  }
                  className="sl-input w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
                />
              </Row>
              <Row label="Idioma nativo (opcional)">
                <input
                  type="text"
                  value={ai.nativeLanguage ?? ''}
                  onChange={(e) => setAi({ ...ai, nativeLanguage: e.target.value.trim() || undefined })}
                  placeholder={`(usa ${translate.targetLanguage})`}
                  className="sl-input w-full text-[11px] px-2 py-1 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200"
                />
              </Row>
              <Row label="Enriquecer al guardar">
                <Toggle on={ai.enrichOnSave} onChange={(v) => setAi({ ...ai, enrichOnSave: v })} />
              </Row>
              <Row label="Enriquecer en hover">
                <Toggle on={ai.enrichOnHover} onChange={(v) => setAi({ ...ai, enrichOnHover: v })} />
              </Row>
              <Row label="Caché (días)" value={`${ai.cacheTtlDays}d`}>
                <input
                  type="range" min={1} max={90} step={1} value={ai.cacheTtlDays}
                  onChange={(e) => setAi({ ...ai, cacheTtlDays: Number(e.target.value) })}
                  className="sl-range w-full"
                />
              </Row>
              {!ai.apiKey && (
                <p className="text-[10px] text-red-600 dark:text-red-400 leading-snug -mt-0.5">
                  Falta la API key — las llamadas IA se omitirán hasta que la añadas.
                </p>
              )}
              <p className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-snug -mt-0.5">
                Las respuestas se cachean en IndexedDB con TTL configurable. El proveedor recibe
                la palabra y la frase del cue; sin tracking adicional. OpenAI tts-1 (audio) cuesta
                ~USD 0.015 / 1 000 caracteres.
              </p>
            </>
          )}
        </Section>

        {/* ASR */}
        <Section icon={<Volume2 size={10} />} title="Transcripción on-device">
          <Row label="Habilitar ASR (Whisper)">
            <Toggle on={asr.enabled} onChange={(v) => setAsr({ ...asr, enabled: v })} />
          </Row>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-snug -mt-0.5">
            Cuando una plataforma no expone subtítulos (ej. video sin captions), se ejecuta Whisper.cpp localmente en WebAssembly. El modelo se descarga la primera vez (~75 MB) y queda cacheado en el navegador.
          </p>
        </Section>

        {/* Limpieza visual */}
        <Section icon={<EyeOff size={10} />} title="Limpieza visual">
          <Row label="Ocultar UI del player">
            <Toggle on={hideUI} onChange={setHideUI} />
          </Row>
          <Row label="Sin sombras / gradientes">
            <Toggle on={hideShadows} onChange={setHideShadows} />
          </Row>
        </Section>

        {/* Sincronización fina (collapsible) */}
        <Section
          icon={<SlidersHorizontal size={10} />}
          title="Sincronización fina"
          collapsible
          open={showAdvanced}
          onToggle={() => setShowAdvanced(!showAdvanced)}
        >
          <CompactSlider label="Pre-roll"   defaultValue={300} max={1500} unit="ms" />
          <CompactSlider label="Post-roll"  defaultValue={400} max={1500} unit="ms" />
          <CompactSlider label="Fusión cues" defaultValue={300} max={1000} unit="ms" />
          <p className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-snug pt-1">
            {autoMode
              ? 'El Modo Auto ya optimiza estos valores. Ajusta solo si tu plataforma desincroniza.'
              : 'Compensa lag entre subtítulo y audio.'}
          </p>
        </Section>

        {/* Atajos */}
        <Section icon={<Keyboard size={10} />} title="Atajos">
          <div className="-my-1">
            {[
              { l: 'Guardar tarjeta',    keys: ['Ctrl', 'S'] },
              { l: 'Toggle subtítulos',  keys: ['Alt', 'C'] },
              { l: 'Repetir frase',      keys: ['Alt', 'R'] },
              { l: 'Re-capturar frame',  keys: ['Alt', 'V'] },
              { l: 'Separar / unir expresión',  keys: ['Scroll', 'hover'] },
            ].map(s => (
              <div key={s.l} className="flex items-center justify-between py-1 text-[11px]">
                <span className="text-zinc-600 dark:text-zinc-400">{s.l}</span>
                <span className="flex items-center gap-1">
                  {s.keys.map((k, i) => (
                    <React.Fragment key={k}>
                      {i > 0 && <span className="text-zinc-400 dark:text-zinc-600 text-[9px]">+</span>}
                      <kbd className="font-sans font-semibold text-[10px] text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded px-1.5 py-[1px]">
                        {k}
                      </kbd>
                    </React.Fragment>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ---------- shared components (mirror SubtitlesTab) ---------- */

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

function InlineMeta({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400">
      {icon}{text}
    </span>
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

function SegmentedControl<T extends string>({ options, value, onChange }: {
  options: { v: T; l: string }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div className="flex bg-zinc-100 dark:bg-zinc-800/70 rounded-md p-0.5">
      {options.map(opt => (
        <button
          key={opt.v}
          onClick={() => onChange(opt.v)}
          className={`flex-1 text-[11px] font-medium px-2 py-1 rounded transition-all ${
            value === opt.v
              ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          {opt.l}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${on ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
    >
      {/* Inline `transform` is used instead of a Tailwind utility because the
          panel renders inside a Shadow DOM with a separately scanned content
          set; `translate-x-4` was being purged from the bundle, which made
          the knob change color without ever sliding. */}
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200"
        style={{ transform: on ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function SoftDot() {
  return (
    <span className="relative inline-flex w-2 h-2">
      <span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" style={{ animationDuration: '2.4s' }} />
      <span className="relative inline-flex rounded-full w-2 h-2 bg-emerald-500" />
    </span>
  );
}

function CompactSlider({ label, defaultValue, max, unit }: { label: string; defaultValue: number; max: number; unit: string }) {
  const [v, setV] = useState(defaultValue);
  return (
    <Row label={label} value={`${v}${unit}`}>
      <input
        type="range"
        min={0} max={max} step={50} value={v}
        onChange={(e) => setV(Number(e.target.value))}
        className="sl-range w-full"
      />
    </Row>
  );
}
