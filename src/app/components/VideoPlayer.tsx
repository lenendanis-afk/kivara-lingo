import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, Maximize, SkipForward, Subtitles as SubtitlesIcon, Settings, Plus, Volume1, Copy, Check, AudioLines, Camera, Search, BookOpen, Quote, ChevronsLeftRight, GraduationCap, BookOpenCheck, Eye, Link2 } from 'lucide-react';
import { SubtitleStyles } from '../types';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface SegmentMeta {
  token: string;
  type: 'phrase' | 'word';
  phonetic?: string;
  translation: string;
  bilingual?: string;
  monolingual?: string;
  level?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
}

interface VideoPlayerProps {
  subtitleStyles: SubtitleStyles;
  mockData: {
    targetSentence: string;
    nativeSentence: string;
    word: string;
    translation?: string;
    phonetic?: string;
    bilingual?: string;
    monolingual?: string;
  };
  onSaveCard: (token?: string) => void;
}

/* Mock MWE registry (en producción: bundle local mwes.json + CEFR) */
const SEGMENT_REGISTRY: Record<string, SegmentMeta> = {
  'these days': {
    token: 'these days', type: 'phrase',
    phonetic: '/ðiːz deɪz/',
    translation: 'estos días, en la actualidad',
    bilingual: '(adv.) en la actualidad, hoy en día',
    monolingual: 'In the present period of time.',
  },
  'these': {
    token: 'these', type: 'word', level: 'A1',
    phonetic: '/ðiːz/',
    translation: 'estos, estas',
    bilingual: '(det. pl.) estos / estas',
    monolingual: 'Plural of "this"; referring to nearby items.',
  },
  'days': {
    token: 'days', type: 'word', level: 'A1',
    phonetic: '/deɪz/',
    translation: 'días',
    bilingual: '(sust. pl.) días, jornadas',
    monolingual: 'Plural of "day"; periods of 24 hours.',
  },
  'doesn\'t': {
    token: "doesn't", type: 'word', level: 'A1',
    phonetic: '/ˈdʌzənt/',
    translation: 'no (3ª pers.)',
    bilingual: '(aux. neg.) does + not',
    monolingual: 'Negative form of "does".',
  },
  'travel': {
    token: 'travel', type: 'word', level: 'A2',
    phonetic: '/ˈtrævəl/',
    translation: 'viajar',
    bilingual: '(verbo) viajar, desplazarse',
    monolingual: 'To go from one place to another.',
  },
  'much': {
    token: 'much', type: 'word', level: 'A1',
    phonetic: '/mʌtʃ/',
    translation: 'mucho',
    bilingual: '(adv.) en gran cantidad',
    monolingual: 'A large amount or to a great degree.',
  },
};

/* Greedy tokenizer: detecta MWEs primero, luego palabras sueltas */
type Token = { text: string; key: string; kind: 'mwe' | 'known' | 'unknown' | 'punct' };

function tokenizeSentence(sentence: string, expanded: Set<string> = new Set()): Token[] {
  const raw = sentence.match(/[\w']+|[^\w\s]+|\s+/g) ?? [];
  const words: { text: string; idx: number }[] = [];
  raw.forEach((t, idx) => { if (/[\w']/.test(t)) words.push({ text: t, idx }); });

  const wordKey = new Map<number, Token>();
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let len = Math.min(4, words.length - i); len >= 2; len--) {
      const phrase = words.slice(i, i + len).map(w => w.text).join(' ').toLowerCase();
      if (SEGMENT_REGISTRY[phrase]?.type === 'phrase' && !expanded.has(phrase)) {
        const text = words.slice(i, i + len).map(w => w.text).join(' ');
        wordKey.set(words[i].idx, { text, key: phrase, kind: 'mwe' });
        for (let k = 1; k < len; k++) wordKey.set(words[i + k].idx, { text: '', key: '', kind: 'mwe' });
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const w = words[i];
      const lower = w.text.toLowerCase();
      const known = !!SEGMENT_REGISTRY[lower];
      wordKey.set(w.idx, { text: w.text, key: lower, kind: known ? 'known' : 'unknown' });
      i++;
    }
  }

  const tokens: Token[] = [];
  raw.forEach((t, idx) => {
    if (/^\s+$/.test(t)) tokens.push({ text: t, key: `_sp${idx}`, kind: 'punct' });
    else if (/^[^\w\s]+$/.test(t)) tokens.push({ text: t, key: `_p${idx}`, kind: 'punct' });
    else {
      const tok = wordKey.get(idx);
      if (tok && tok.text) tokens.push(tok);
    }
  });
  return tokens;
}

export function VideoPlayer({ subtitleStyles, mockData, onSaveCard }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [captureState, setCaptureState] = useState<'idle' | 'screenshot' | 'audio'>('idle');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [expandedMWEs, setExpandedMWEs] = useState<Set<string>>(new Set());
  const [altExpandedKey, setAltExpandedKey] = useState<string | null>(null);
  const [mode, setMode] = useState<'learning' | 'reading'>('learning');
  const [savedTokens, setSavedTokens] = useState<Set<string>>(new Set(['much']));
  const hoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const wordHoverTimeout = useRef<NodeJS.Timeout | null>(null);
  const hoveredKeyRef = useRef<string | null>(null);
  useEffect(() => { hoveredKeyRef.current = hoveredKey; }, [hoveredKey]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      e.preventDefault(); // evita que el navegador active la barra de menú
      const hk = hoveredKeyRef.current;
      if (hk && SEGMENT_REGISTRY[hk]?.type === 'phrase') setAltExpandedKey(hk);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== 'Alt' && e.altKey) return;
      if (e.key === 'Alt') e.preventDefault();
      setAltExpandedKey(null);
    };
    const blur = () => setAltExpandedKey(null);
    const visibility = () => { if (document.hidden) setAltExpandedKey(null); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  const handleTokenEnter = (key: string) => {
    if (wordHoverTimeout.current) clearTimeout(wordHoverTimeout.current);
    setHoveredKey(key);
  };
  const handleTokenLeave = () => {
    wordHoverTimeout.current = setTimeout(() => setHoveredKey(null), 180);
  };

  const effectiveExpanded = React.useMemo(() => {
    if (!altExpandedKey) return expandedMWEs;
    const next = new Set(expandedMWEs);
    next.add(altExpandedKey);
    return next;
  }, [expandedMWEs, altExpandedKey]);

  const tokens = React.useMemo(
    () => tokenizeSentence(mockData.targetSentence, effectiveExpanded),
    [mockData.targetSentence, effectiveExpanded]
  );

  const toggleExpandMWE = (key: string) => {
    setExpandedMWEs(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    setHoveredKey(null);
  };

  const rejoinAllMWEs = () => { setExpandedMWEs(new Set()); setHoveredKey(null); };

  const findParentMWE = (wordKey: string): string | null => {
    for (const phrase of expandedMWEs) {
      if (phrase.split(' ').includes(wordKey.toLowerCase())) return phrase;
    }
    return null;
  };

  const handleSaveToken = (e: React.MouseEvent, token: string) => {
    handleCreateCard(e, token);
    setSavedTokens(prev => new Set(prev).add(token.toLowerCase()));
  };

  const handleMouseEnter = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimeout.current = setTimeout(() => {
      setIsHovered(false);
    }, 200);
  };

  const handleCreateCard = (e: React.MouseEvent, token?: string) => {
    e.stopPropagation();
    setCaptureState('screenshot');
    setTimeout(() => {
      setCaptureState('audio');
      setTimeout(() => {
        setCaptureState('idle');
        onSaveCard(token);
      }, 1600);
    }, 220);
  };

  // Convert opacity (0-100) to hex or rgba
  const bgOpacity = (subtitleStyles.backgroundOpacity / 100);
  const bgColor = subtitleStyles.backgroundColor;

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0,0,0';
  };

  const backgroundColorWithOpacity = `rgba(${hexToRgb(bgColor)}, ${bgOpacity})`;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(mockData.targetSentence).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl group border border-zinc-800 flex flex-col">
      {/* Fake Video Content */}
      <div className="absolute inset-0 z-0 opacity-80">
        <ImageWithFallback 
          src="https://images.unsplash.com/photo-1626814026160-2237a95fc5a0?q=80&w=2070&auto=format&fit=crop" 
          alt="Movie Scene" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20"></div>
      </div>

      {/* Onboarding hint — only in learning mode */}
      {mode === 'learning' && !isHovered && captureState === 'idle' && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-zinc-900/70 backdrop-blur-md border border-white/10 text-white/85 text-xs px-3 py-1.5 rounded-full pointer-events-none shadow-lg animate-in fade-in slide-in-from-top-2 duration-500">
          Pasa el ratón sobre los subtítulos para interactuar
        </div>
      )}

      {/* Capture: soft indigo glow + scene dim, fluid transition */}
      {captureState !== 'idle' && (
        <div
          className="absolute inset-0 z-40 pointer-events-none transition-all duration-500 ease-out"
          style={{
            background:
              captureState === 'screenshot'
                ? 'radial-gradient(circle at center, rgba(99,102,241,0.25), rgba(0,0,0,0.35))'
                : 'rgba(9, 9, 11, 0.55)',
            backdropFilter: captureState === 'audio' ? 'blur(4px)' : 'blur(0px)',
          }}
        />
      )}

      {captureState === 'audio' && (
        <div className="absolute inset-0 z-50 flex items-end justify-center pb-8 pointer-events-none">
          <div className="bg-zinc-900/90 backdrop-blur-xl border border-zinc-700/60 rounded-xl px-4 py-3 flex items-center gap-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/15 ring-1 ring-indigo-400/30 flex items-center justify-center shrink-0">
              <AudioLines size={18} className="text-indigo-300" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-white text-xs font-semibold">Capturando audio</span>
                <span className="text-[9px] uppercase tracking-wider font-bold text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded">VAD</span>
              </div>
              <div className="flex gap-[3px] items-end h-3">
                {[0.5, 1, 0.7, 0.4, 0.85, 0.6, 0.9, 0.5].map((h, i) => (
                  <span
                    key={i}
                    className="w-[2px] bg-indigo-400 rounded-full animate-pulse"
                    style={{
                      height: `${h * 12}px`,
                      animationDuration: `${0.9 + (i % 3) * 0.15}s`,
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-zinc-400 ml-1 pl-3 border-l border-zinc-700/60">
              <Camera size={11} className="text-emerald-400" />
              <span>Frame ✓</span>
            </div>
          </div>
        </div>
      )}

      {/* Subtitles Overlay — verticalOffset 0..100 controls vertical center */}
      <div
        className="absolute inset-x-0 z-10 flex flex-col items-center px-8 transition-all duration-300"
        style={{
          top: `${subtitleStyles.verticalOffset ?? (subtitleStyles.position === 'top' ? 15 : subtitleStyles.position === 'middle' ? 50 : 85)}%`,
          transform: 'translateY(-50%)',
        }}
      >
        {/* The interactive subtitle container */}
        <div 
          className="relative flex flex-col items-center"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Invisible bridge to prevent mouse leave gap */}
          <div className="absolute -top-14 w-full h-14 bg-transparent z-0"></div>

          {/* Sentence-level toolbar — utilities only (word/MWE save lives in popover) */}
          <div className={`absolute -top-12 z-10 flex items-center gap-1 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/60 p-1 rounded-lg shadow-xl transition-all duration-300 transform ${
            isHovered && hoveredKey === null && mode === 'learning' ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'
          }`}>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 px-2">Frase</span>
            <div className="w-px h-3.5 bg-zinc-700/80" />
            <button className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700/50 rounded-md transition-colors" title="Reproducir audio de la frase">
              <Volume1 size={14} />
            </button>
            <button onClick={handleCopy} className="p-1.5 text-zinc-300 hover:text-white hover:bg-zinc-700/50 rounded-md transition-colors" title="Copiar texto">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
            <div className="w-px h-3.5 bg-zinc-700/80" />
            <button
              onClick={(e) => handleCreateCard(e, mockData.targetSentence)}
              className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-medium px-2 py-1 rounded transition-colors"
              title="Guardar la frase completa como tarjeta"
            >
              <Quote size={11} /> Guardar frase
            </button>
            <div className="w-px h-3.5 bg-zinc-700/80" />
            <span className="text-[9px] text-zinc-500 px-2 hidden sm:flex items-center gap-1">
              <kbd className="font-sans font-semibold text-[9px] text-zinc-400 bg-zinc-800 border border-zinc-700 rounded px-1 py-px">Scroll</kbd>
              <span>sobre la expresión para separarla</span>
            </span>
          </div>

          {/* Subtitle Text */}
          <div 
            className="text-center rounded-md px-4 py-2 transition-all duration-300 cursor-pointer"
            style={{
              fontSize: `${subtitleStyles.fontSize}px`,
              color: subtitleStyles.color,
              backgroundColor: (mode === 'learning' && isHovered) ? 'rgba(0,0,0,0.8)' : backgroundColorWithOpacity,
              fontWeight: subtitleStyles.fontWeight,
              textShadow: (() => {
                const s = subtitleStyles.textShadow;
                if (s <= 0) return 'none';
                const a = (s / 100).toFixed(2);
                const blur = Math.max(2, Math.round(s / 18));
                return `2px 2px ${blur}px rgba(0,0,0,${a}), -1px -1px 0 rgba(0,0,0,${a}), 1px -1px 0 rgba(0,0,0,${a}), -1px 1px 0 rgba(0,0,0,${a}), 1px 1px 0 rgba(0,0,0,${a})`;
              })(),
              transform: (mode === 'learning' && isHovered) ? 'scale(1.05)' : 'scale(1)',
              boxShadow: (mode === 'learning' && isHovered) ? '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : 'none'
            }}
          >
            {/* Tokenized sentence — MWEs / known words / saved / unknown */}
            {mode === 'reading' ? (
              <span>{mockData.targetSentence}</span>
            ) : (
              <span>
                {tokens.map((tok, i) => {
                  if (tok.kind === 'punct') return <React.Fragment key={tok.key + i}>{tok.text}</React.Fragment>;
                  const isTokHovered = hoveredKey === tok.key;
                  const isSaved = savedTokens.has(tok.key.toLowerCase());
                  const colorClass = isTokHovered
                    ? 'text-white bg-indigo-600 shadow-[0_2px_8px_rgba(99,102,241,0.45)]'
                    : isSaved
                    ? 'text-emerald-300 border-b-2 border-emerald-400/70 hover:bg-emerald-400/10'
                    : tok.kind === 'mwe'
                    ? 'text-amber-300 border-b-2 border-amber-400 border-dotted hover:bg-amber-400/15'
                    : tok.kind === 'known'
                    ? 'border-b border-zinc-300/40 border-dashed hover:text-white hover:bg-white/10'
                    : 'opacity-90';
                  const parentForSplit = tok.kind !== 'mwe' ? findParentMWE(tok.key) : null;
                  const wheelable = tok.kind === 'mwe' || !!parentForSplit;
                  const handleWheel = (e: React.WheelEvent) => {
                    if (!wheelable) return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.deltaY > 0 && tok.kind === 'mwe') {
                      // scroll down → separar
                      setExpandedMWEs(prev => { const n = new Set(prev); n.add(tok.key); return n; });
                    } else if (e.deltaY < 0 && parentForSplit) {
                      // scroll up sobre palabra de MWE separado → unir
                      setExpandedMWEs(prev => { const n = new Set(prev); n.delete(parentForSplit); return n; });
                      setHoveredKey(null);
                    }
                  };
                  return (
                    <span key={tok.key + i} className="relative inline-block">
                      <span
                        onMouseEnter={() => tok.kind !== 'unknown' && handleTokenEnter(tok.key)}
                        onMouseLeave={handleTokenLeave}
                        onWheel={handleWheel}
                        className={`relative rounded px-0.5 transition-all duration-150 ${tok.kind !== 'unknown' ? 'cursor-help' : ''} ${colorClass}`}
                      >
                        {tok.text}
                        {isSaved && !isTokHovered && (
                          <Check size={9} className="inline-block ml-0.5 -mt-1 text-emerald-400" strokeWidth={3} />
                        )}
                      </span>
                      {isTokHovered && tok.kind !== 'unknown' && (
                        <WordPopover
                          visible={true}
                          onMouseEnter={() => handleTokenEnter(tok.key)}
                          onMouseLeave={handleTokenLeave}
                          token={tok.text}
                          kind={tok.kind}
                          isExpanded={expandedMWEs.has(tok.key)}
                          isSaved={isSaved}
                          parentMWE={tok.kind !== 'mwe' ? findParentMWE(tok.key) : null}
                          onToggleExpand={() => toggleExpandMWE(tok.key)}
                          onRejoinParent={(parent) => {
                            setExpandedMWEs(prev => { const n = new Set(prev); n.delete(parent); return n; });
                            setHoveredKey(null);
                          }}
                          onSave={(e, token) => handleSaveToken(e, token)}
                        />
                      )}
                    </span>
                  );
                })}
              </span>
            )}
            
            {/* Native Translation (Shows on Hover) — hidden in reading mode */}
            {mode === 'learning' && (
              <div className={`mt-2 text-[0.65em] opacity-90 transition-all duration-300 overflow-hidden ${isHovered ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
                <span className="text-zinc-300">{mockData.nativeSentence}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Player Controls (Mock) */}
      <div className="absolute bottom-0 inset-x-0 p-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/90 to-transparent flex flex-col gap-2">
        <div className="w-full h-1 bg-white/30 rounded-full cursor-pointer relative">
          <div className="absolute top-0 left-0 h-full bg-indigo-500 w-1/3 rounded-full"></div>
          <div className="absolute top-1/2 -translate-y-1/2 left-1/3 w-3 h-3 bg-white rounded-full shadow"></div>
        </div>
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsPlaying(!isPlaying)} className="hover:text-indigo-400 transition-colors">
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </button>
            <button className="hover:text-indigo-400 transition-colors"><SkipForward size={20} fill="currentColor" /></button>
            <div className="flex items-center gap-2 group/volume">
              <Volume2 size={20} />
              <div className="w-16 h-1 bg-white/30 rounded-full hidden group-hover/volume:block">
                <div className="w-2/3 h-full bg-white rounded-full"></div>
              </div>
            </div>
            <span className="text-sm font-medium">14:02 / 45:30</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="hover:text-indigo-400 transition-colors relative">
              <SubtitlesIcon size={20} />
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full"></div>
            </button>
            <button className="hover:text-indigo-400 transition-colors"><Settings size={20} /></button>
            <button className="hover:text-indigo-400 transition-colors"><Maximize size={20} /></button>
          </div>
        </div>
      </div>
      
      {/* Extension badge + mode toggle */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-1.5">
        {expandedMWEs.size > 0 && mode === 'learning' && (
          <button
            onClick={rejoinAllMWEs}
            className="bg-amber-500/15 backdrop-blur-md text-amber-200 text-[11px] font-medium px-2 py-1 rounded-full shadow-lg flex items-center gap-1 hover:bg-amber-500/25 transition-colors border border-amber-400/30"
            title="Volver a juntar todas las expresiones"
          >
            <Link2 size={11} /> Unir expresiones
          </button>
        )}
        <button
          onClick={() => setMode(mode === 'learning' ? 'reading' : 'learning')}
          className="group/badge w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md ring-1 ring-white/10 hover:ring-white/20 flex items-center justify-center transition-all"
          title={mode === 'learning' ? 'Kivara Lingo · Aprendizaje (clic para Lectura)' : 'Kivara Lingo · Lectura (clic para Aprendizaje)'}
        >
          {mode === 'learning' ? (
            <span className="relative flex items-center justify-center">
              <span className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400/40 animate-ping" style={{ animationDuration: '2.4s' }} />
              <GraduationCap size={13} className="text-indigo-300/90 group-hover/badge:text-indigo-200" strokeWidth={2} />
            </span>
          ) : (
            <BookOpenCheck size={13} className="text-zinc-400 group-hover/badge:text-zinc-200" strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
}

/* ---------- Word hover popover (single source: tokenization in-sentence) ---------- */
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
  return SEGMENT_REGISTRY[token.toLowerCase()] ?? {
    token, type: token.includes(' ') ? 'phrase' : 'word', translation: '—',
  };
}

const LEVEL_COLOR: Record<string, string> = {
  A1: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25',
  A2: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25',
  B1: 'text-sky-300 bg-sky-500/10 ring-sky-500/25',
  B2: 'text-sky-300 bg-sky-500/10 ring-sky-500/25',
  C1: 'text-amber-300 bg-amber-500/10 ring-amber-500/25',
  C2: 'text-amber-300 bg-amber-500/10 ring-amber-500/25',
};

function WordPopover({
  visible, onMouseEnter, onMouseLeave, token, kind, isExpanded, isSaved, parentMWE, onToggleExpand, onRejoinParent, onSave,
}: WordPopoverProps) {
  if (!visible) return null;
  const meta = lookup(token);
  const isMWE = kind === 'mwe';

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="absolute left-1/2 -translate-x-1/2 bottom-full mb-3 w-72 z-30 animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-150"
      style={{
        pointerEvents: 'auto',
        textShadow: 'none',
        fontSize: '13px',
        fontWeight: 400,
        letterSpacing: 'normal',
        lineHeight: 1.4,
        color: '#fff',
      }}
    >
      <div className="bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/60 rounded-xl shadow-2xl overflow-hidden text-left">

        {/* Header: word + level/MWE + phonetic */}
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
                <span className={`text-[9px] font-bold uppercase tracking-wider ring-1 px-1 py-px rounded shrink-0 ${LEVEL_COLOR[meta.level]}`}>
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

        {/* Glosses */}
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

        {/* MWE drill-down disclosure */}
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

        {/* Rejoin parent MWE — when this word is part of a split expression */}
        {parentMWE && !isMWE && (
          <button
            onClick={(e) => { e.stopPropagation(); onRejoinParent(parentMWE); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-medium text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/15 border-t border-amber-500/20 transition-colors"
          >
            <Link2 size={10} />
            <span className="normal-case">Unir con "{parentMWE}"</span>
          </button>
        )}

        {/* Action row */}
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

      {/* Arrow */}
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
