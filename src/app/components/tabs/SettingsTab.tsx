import React, { useState } from 'react';
import {
  Keyboard, EyeOff, ChevronDown, Mic, Image as ImageIcon, Wand2,
  SlidersHorizontal,
} from 'lucide-react';

type AudioSource = 'tab' | 'mic';
type FrameMoment = 'start' | 'center' | 'end';
type EndDetect = 'vad' | 'cue';

export function SettingsTab() {
  const [autoMode, setAutoMode] = useState(true);
  const [hideUI, setHideUI] = useState(true);
  const [hideShadows, setHideShadows] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [audioSource, setAudioSource] = useState<AudioSource>('tab');
  const [frameMoment, setFrameMoment] = useState<FrameMoment>('center');
  const [endDetect, setEndDetect] = useState<EndDetect>('vad');
  const [bufferSize, setBufferSize] = useState(30);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-y-auto">
      <div className="p-3 space-y-3">

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
      onClick={() => onChange(!on)}
      className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${on ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
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
