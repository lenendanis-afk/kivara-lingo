import React from 'react';
import { Volume2, ChevronsLeftRight, Link2, Search, Plus, Eye, BookOpen, Check } from 'lucide-react';
import type { DictionaryEntry } from '../../shared/types';
import { lookupDictionary } from '../nlp/dictionary';

type SegmentMeta = DictionaryEntry;

interface WordPopoverProps {
  visible: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  token: string;
  kind: 'mwe' | 'known' | 'unknown' | 'punct';
  isExpanded: boolean;
  isSaved: boolean;
  parentMWE: string | null;
  onToggleExpand: () => void;
  onRejoinParent: (parent: string) => void;
  onSave: (e: React.MouseEvent, token: string) => void;
}

function lookup(token: string): SegmentMeta {
  return (
    lookupDictionary(token) ?? {
      token,
      type: token.includes(' ') ? 'phrase' : 'word',
      translation: '—',
    }
  );
}

const LEVEL_COLOR: Record<string, string> = {
  A1: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25',
  A2: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25',
  B1: 'text-sky-300 bg-sky-500/10 ring-sky-500/25',
  B2: 'text-sky-300 bg-sky-500/10 ring-sky-500/25',
  C1: 'text-amber-300 bg-amber-500/10 ring-amber-500/25',
  C2: 'text-amber-300 bg-amber-500/10 ring-amber-500/25',
};

export function WordPopover({
  visible, onMouseEnter, onMouseLeave, token, kind, isExpanded, isSaved, parentMWE, onToggleExpand, onRejoinParent, onSave,
}: WordPopoverProps) {
  if (!visible) return null;
  const meta = lookup(token);
  const isMWE = kind === 'mwe';

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 z-30"
      style={{
        pointerEvents: 'auto',
        textShadow: 'none',
        fontSize: '13px',
        fontWeight: 400,
        letterSpacing: 'normal',
        lineHeight: 1.4,
        color: '#ffffff',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        textAlign: 'left',
        width: '280px',
        maxWidth: 'min(320px, calc(100vw - 32px))',
        zIndex: 2147483646,
      }}
    >
      <div
        className="rounded-xl overflow-hidden text-left border"
        style={{
          backgroundColor: 'rgba(24, 24, 27, 0.97)',
          borderColor: 'rgba(82, 82, 91, 0.6)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          boxShadow:
            '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
        }}
      >

        <div className="flex items-start justify-between gap-3 px-3 pt-2.5 pb-2 border-b border-zinc-800/60">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={(e) => e.stopPropagation()}
              className="w-6 h-6 rounded-full bg-indigo-500/15 hover:bg-indigo-500/25 ring-1 ring-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0 transition-colors"
              title="Reproducir pronunciación"
            >
              <Volume2 size={11} />
            </button>
            <div className="flex items-baseline gap-1.5 min-w-0 flex-wrap">
              <span className="text-white font-semibold text-sm leading-tight normal-case">{meta.token}</span>
              {isMWE && (
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/10 ring-1 ring-amber-500/25 px-1 py-px rounded shrink-0">
                  MWE
                </span>
              )}
              {meta.level && (
                <span className={`text-[9px] font-bold uppercase tracking-wider ring-1 px-1 py-px rounded shrink-0 `}>
                  {meta.level}
                </span>
              )}
              {isSaved && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/25 px-1 py-px rounded shrink-0">
                  <Check size={9} strokeWidth={3} /> En tu mazo
                </span>
              )}
            </div>
          </div>
          {meta.phonetic && (
            <span className="font-mono text-[11px] text-zinc-300 bg-zinc-800/70 px-1.5 py-0.5 rounded shrink-0 leading-tight normal-case">
              {meta.phonetic}
            </span>
          )}
        </div>

        <div className="px-3 py-2 space-y-1.5">
          <div className="text-[13px] text-white leading-snug normal-case">{meta.translation}</div>
          {meta.bilingual && (
            <div className="text-[11px] text-zinc-400 leading-snug normal-case">{meta.bilingual}</div>
          )}
          {meta.monolingual && (
            <div className="text-[11px] text-zinc-400 italic leading-snug border-l-2 border-zinc-700 pl-2 mt-1.5 normal-case">
              "{meta.monolingual}"
            </div>
          )}
        </div>

        {isMWE && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[10px] font-medium text-zinc-400 hover:text-indigo-300 bg-zinc-900/60 border-t border-zinc-800/60 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <ChevronsLeftRight size={10} />
              <span className="normal-case">{isExpanded ? 'Unir como expresión' : 'Ver palabras por separado'}</span>
            </span>
            <span className="flex items-center gap-1 text-[9px] text-zinc-500 normal-case">
              <span>o</span>
              <kbd className="font-sans font-semibold text-[9px] text-zinc-400 bg-zinc-800/80 border border-zinc-700 rounded px-1 py-px">scroll</kbd>
            </span>
          </button>
        )}

        {parentMWE && !isMWE && (
          <button
            onClick={(e) => { e.stopPropagation(); onRejoinParent(parentMWE); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 border-t border-amber-500/20 transition-colors"
          >
            <Link2 size={10} />
            <span className="normal-case">Unir con "{parentMWE}"</span>
          </button>
        )}

        <div className="flex items-stretch border-t border-zinc-800/60 bg-zinc-900/40">
          <PopoverAction icon={<BookOpen size={11} />} label="Definir" />
          <PopoverDivider />
          <PopoverAction icon={<Search size={11} />} label="Buscar" />
          <PopoverDivider />
          {isSaved ? (
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 transition-colors normal-case"
              title="Esta tarjeta ya está en tu mazo"
            >
              <Eye size={12} /> Ver en Anki
            </button>
          ) : (
            <button
              onClick={(e) => onSave(e, meta.token)}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors normal-case"
            >
              <Plus size={12} /> Guardar
            </button>
          )}
        </div>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45 bg-zinc-900/95 border-r border-b border-zinc-700/60" />
    </div>
  );
}

function PopoverAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={(e) => e.stopPropagation()}
      className="flex-1 flex items-center justify-center gap-1 px-2 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800/50 transition-colors"
    >
      {icon}{label}
    </button>
  );
}

function PopoverDivider() {
  return <div className="w-px bg-zinc-800/80" />;
}
