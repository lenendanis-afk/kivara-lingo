import React, { useState, useEffect } from 'react';
import { VideoPlayer } from './components/VideoPlayer';
import { ExtensionPanel } from './components/ExtensionPanel';
import { SubtitleStyles, AnkiMapping } from './types';
import { Toaster, toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isPopupMode, setIsPopupMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const [subtitleStyles, setSubtitleStyles] = useState<SubtitleStyles>({
    fontSize: 32,
    color: '#FCD34D',
    backgroundColor: '#000000',
    backgroundOpacity: 60,
    position: 'bottom',
    verticalOffset: 85,
    fontWeight: 'bold',
    textShadow: 80,
  });

  const [ankiMapping, setAnkiMapping] = useState<AnkiMapping>({
    ankiUrl: 'http://127.0.0.1:8765',
    deckName: 'Vocabulario Inglés',
    modelName: 'KivaraLingo',
    fieldSources: {},
  });

  const mockData = {
    targetSentence: "These days, Nicola doesn't travel much.",
    nativeSentence: "Estos días, Nicola no viaja mucho.",
    word: "these days",
    translation: "estos días",
    phonetic: "/ðiːz deɪz/",
    bilingual: "(noun) estos días",
    monolingual: "Used to refer to the present time period.",
  };

  const handleSaveCard = (token?: string) => {
    const saved = token ?? mockData.word;
    toast.custom((id) => (
      <div className="flex items-center gap-2.5 bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/60 rounded-lg shadow-2xl px-3 py-2.5 min-w-[280px]">
        <div className="w-7 h-7 rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/30 flex items-center justify-center shrink-0">
          <CheckCircle2 size={14} className="text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-white leading-tight">Tarjeta guardada</div>
          <div className="text-[10px] text-zinc-400 leading-tight mt-0.5 truncate">
            <span className="font-mono text-indigo-300">{saved}</span>
            <span className="text-zinc-500"> → </span>
            {ankiMapping.deckName}
          </div>
        </div>
        <button onClick={() => toast.dismiss(id)} className="text-[10px] font-medium text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded transition-colors shrink-0">
          OK
        </button>
      </div>
    ), { duration: 3200 });
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col font-sans text-zinc-900 dark:text-zinc-100">
      <Toaster position="top-center" theme={isDarkMode ? 'dark' : 'light'} />
      
      {/* Navbar (Mock Browser) */}
      <div className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-4 justify-between shrink-0 z-40 relative">
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <div className="bg-zinc-800 text-zinc-400 text-xs px-4 py-1.5 rounded-md flex items-center gap-2 w-64">
            <span className="text-zinc-500">🔒</span> max.com/watch/a1b2c3d4
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Extension icon mock */}
          <div className="relative group">
            <button
              onClick={() => setIsPanelOpen(!isPanelOpen)}
              className={`w-8 h-8 rounded flex items-center justify-center transition-colors ${
                isPanelOpen ? 'bg-indigo-600 text-white shadow-[0_0_15px_rgba(79,70,229,0.5)]' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Kivara Lingo">
                <rect x="3" y="6" width="18" height="13" rx="2.5" />
                <line x1="7" y1="12" x2="13" y2="12" />
                <line x1="7" y1="15.5" x2="11" y2="15.5" />
                <circle cx="17.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <div className="absolute top-full right-0 mt-2 bg-zinc-800 text-xs text-zinc-300 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Kivara Lingo
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Main Workspace (Video) */}
        <div className={`flex-1 flex flex-col bg-zinc-100 dark:bg-zinc-950 p-6 md:p-12 overflow-y-auto transition-all ${isPanelOpen && !isPopupMode ? 'pr-0 md:pr-12' : ''}`}>
          <div className="max-w-6xl mx-auto w-full space-y-8">
            <header className="space-y-2 text-zinc-500 dark:text-zinc-400">
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Viendo: Game of Thrones</h1>
              <p className="text-sm">T1 E1 • Winter is Coming</p>
            </header>
            
            <VideoPlayer 
              subtitleStyles={subtitleStyles}
              mockData={mockData}
              onSaveCard={handleSaveCard}
            />
            
            <div className="bg-indigo-900/20 border border-indigo-500/30 rounded-lg p-4 max-w-2xl">
              <h4 className="text-indigo-400 font-semibold text-sm mb-1 flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
                Cómo funciona este prototipo
              </h4>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Pasa el ratón sobre los subtítulos en el reproductor. Aparecerá un menú que te permite <strong>crear una tarjeta de Anki instantáneamente</strong>. El panel lateral (pestaña "Cards") define cómo se mapean los datos capturados hacia los campos de tu mazo.
              </p>
            </div>
          </div>
        </div>

        {/* Extension Panel (Docked or Popup) */}
        {isPanelOpen && !isPopupMode && (
          <div className="w-[400px] shrink-0 bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl h-full animate-in slide-in-from-right duration-300">
             <ExtensionPanel 
                isPopupMode={false} 
                togglePopupMode={() => setIsPopupMode(true)} 
                isDarkMode={isDarkMode}
                toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
                styles={subtitleStyles}
                setStyles={setSubtitleStyles}
                mapping={ankiMapping}
                setMapping={setAnkiMapping}
                mockData={mockData}
              />
          </div>
        )}
        
        {isPanelOpen && isPopupMode && (
          <div className="fixed inset-0 pointer-events-none z-50">
            <div className="pointer-events-auto">
              <ExtensionPanel 
                  isPopupMode={true} 
                  togglePopupMode={() => setIsPopupMode(false)} 
                  isDarkMode={isDarkMode}
                  toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
                  styles={subtitleStyles}
                  setStyles={setSubtitleStyles}
                  mapping={ankiMapping}
                  setMapping={setAnkiMapping}
                  mockData={mockData}
                />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
