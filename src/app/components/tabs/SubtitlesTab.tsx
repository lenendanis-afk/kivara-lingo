import React from 'react';
import { SubtitleStyles } from '../../types';
import { Type, Palette, AlignVerticalSpaceBetween, RotateCcw } from 'lucide-react';

const DEFAULT_STYLES: SubtitleStyles = {
  fontSize: 32,
  color: '#FCD34D',
  backgroundColor: '#000000',
  backgroundOpacity: 60,
  position: 'bottom',
  verticalOffset: 85,
  fontWeight: 'bold',
  textShadow: 80,
};

interface SubtitlesTabProps {
  styles: SubtitleStyles;
  setStyles: (styles: SubtitleStyles) => void;
}

export function SubtitlesTab({ styles, setStyles }: SubtitlesTabProps) {
  const updateStyle = (key: keyof SubtitleStyles, value: any) => {
    setStyles({ ...styles, [key]: value });
  };

  const isDefault =
    styles.fontSize === DEFAULT_STYLES.fontSize &&
    styles.color === DEFAULT_STYLES.color &&
    styles.backgroundColor === DEFAULT_STYLES.backgroundColor &&
    styles.backgroundOpacity === DEFAULT_STYLES.backgroundOpacity &&
    styles.position === DEFAULT_STYLES.position &&
    styles.verticalOffset === DEFAULT_STYLES.verticalOffset &&
    styles.fontWeight === DEFAULT_STYLES.fontWeight &&
    styles.textShadow === DEFAULT_STYLES.textShadow;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* `pb-6` is enough scroll room when the panel snaps to the viewport
          bottom (no taskbar overlap). Previously `pb-12` left a visible
          empty zinc-950 strip below the last section. */}
      <div className="p-3 pb-6 space-y-3">

        {/* Header bar with reset */}
        <div className="flex items-center justify-between px-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-500">
            Estilo del subtítulo
          </span>
          <button
            onClick={() => setStyles(DEFAULT_STYLES)}
            disabled={isDefault}
            className={`flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-all ${
              isDefault
                ? 'border-zinc-200 dark:border-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10'
            }`}
            title="Restablecer todos los valores"
          >
            <RotateCcw size={10} className={isDefault ? '' : 'group-hover:-rotate-90 transition-transform'} />
            Restablecer
          </button>
        </div>


        {/* Tipografía */}
        <Section icon={<Type size={10} />} title="Tipografía">
          <Row label="Tamaño" value={`${styles.fontSize}px`}>
            <input
              type="range"
              min="16" max="64"
              value={styles.fontSize}
              onChange={(e) => updateStyle('fontSize', parseInt(e.target.value))}
              className="sl-range w-full"
            />
          </Row>

          <Row label="Color">
            <div className="flex gap-1.5">
              {['#FFFFFF', '#FCD34D', '#A7F3D0', '#FECACA', '#E9D5FF'].map(color => (
                <button
                  key={color}
                  onClick={() => updateStyle('color', color)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ring-2 ring-inset ${
                    styles.color === color
                      ? 'border-indigo-500 dark:border-indigo-400 ring-indigo-500/30 dark:ring-indigo-400/30 scale-110'
                      : 'border-zinc-400 dark:border-zinc-300 ring-zinc-500/30 dark:ring-white/25 hover:border-zinc-500 dark:hover:border-white'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Color ${color}`}
                  title={color}
                />
              ))}
            </div>
          </Row>

          <Row label="Peso">
            <SegmentedControl
              options={[{ v: 'normal', l: 'Normal' }, { v: 'bold', l: 'Bold' }, { v: '900', l: 'Black' }]}
              value={styles.fontWeight}
              onChange={(v) => updateStyle('fontWeight', v)}
            />
          </Row>

          <Row label="Sombra" value={styles.textShadow > 0 ? `${styles.textShadow}%` : 'Off'}>
            <input
              type="range"
              min={0} max={100} step={5}
              value={styles.textShadow}
              onChange={(e) => updateStyle('textShadow', parseInt(e.target.value))}
              className="sl-range w-full"
            />
          </Row>
        </Section>

        {/* Fondo */}
        <Section icon={<Palette size={10} />} title="Fondo">
          <Row label="Color">
            <div className="flex gap-1.5">
              {['#000000', '#18181B', '#1E3A8A', '#831843'].map(color => (
                <button
                  key={color}
                  onClick={() => updateStyle('backgroundColor', color)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ring-2 ring-inset ${
                    styles.backgroundColor === color
                      ? 'border-indigo-500 dark:border-indigo-400 ring-indigo-500/30 dark:ring-indigo-400/30 scale-110'
                      : 'border-zinc-400 dark:border-zinc-300 ring-zinc-500/30 dark:ring-white/25 hover:border-zinc-500 dark:hover:border-white'
                  }`}
                  style={{ backgroundColor: color }}
                  aria-label={`Fondo ${color}`}
                  title={color}
                />
              ))}
            </div>
          </Row>

          <Row label="Opacidad" value={`${styles.backgroundOpacity}%`}>
            <input
              type="range"
              min="0" max="100"
              value={styles.backgroundOpacity}
              onChange={(e) => updateStyle('backgroundOpacity', parseInt(e.target.value))}
              className="sl-range w-full"
            />
          </Row>
        </Section>

        {/* Posición */}
        <Section icon={<AlignVerticalSpaceBetween size={10} />} title="Posición">
          <Row label="Preset">
            <SegmentedControl
              options={[
                { v: 'top', l: 'Arriba' },
                { v: 'middle', l: 'Medio' },
                { v: 'bottom', l: 'Abajo' },
              ]}
              value={styles.position}
              onChange={(v) => {
                const offset = v === 'top' ? 15 : v === 'middle' ? 50 : 85;
                setStyles({ ...styles, position: v, verticalOffset: offset });
              }}
            />
          </Row>
          <Row label="Altura" value={`${styles.verticalOffset ?? 85}%`}>
            <div className="relative">
              <input
                type="range"
                min={5} max={95} step={1}
                value={styles.verticalOffset ?? 85}
                onChange={(e) => {
                  const offset = parseInt(e.target.value);
                  const preset: SubtitleStyles['position'] =
                    offset <= 25 ? 'top' : offset >= 75 ? 'bottom' : 'middle';
                  setStyles({ ...styles, verticalOffset: offset, position: preset });
                }}
                className="sl-range w-full relative z-10"
              />
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 pointer-events-none h-2">
                {[15, 50, 85].map(p => (
                  <span
                    key={p}
                    className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-zinc-300 dark:bg-zinc-600"
                    style={{ left: `${((p - 5) / 90) * 100}%` }}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[9px] text-zinc-400 dark:text-zinc-500 mt-0.5 px-0.5">
                <span>Arriba</span><span>Medio</span><span>Abajo</span>
              </div>
            </div>
          </Row>
        </Section>
      </div>
    </div>
  );
}

/* ---------- shared (matches CardsTab/SettingsTab look) ---------- */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-50/60 dark:bg-zinc-900/60 border-b border-zinc-100 dark:border-zinc-800/60 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {icon}{title}
      </div>
      <div className="p-2.5 space-y-2.5">{children}</div>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
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

