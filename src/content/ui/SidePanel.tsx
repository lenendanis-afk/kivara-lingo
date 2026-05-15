import React, { useState } from 'react';
import { Subtitles, LayoutGrid, Settings, X, ExternalLink, Moon, Sun } from 'lucide-react';
import { KivaraLingoLogo } from '../../app/components/KivaraLingoLogo';
import { SubtitlesTab } from '../../app/components/tabs/SubtitlesTab';
import { CardsTab } from '../../app/components/tabs/CardsTab';
import { SettingsTab } from '../../app/components/tabs/SettingsTab';
import { SubtitleStyles, AnkiMapping } from '../../app/types';

interface SidePanelProps {
  isPopupMode: boolean;
  togglePopupMode: () => void;
  onClose: () => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  styles: SubtitleStyles;
  setStyles: (styles: SubtitleStyles) => void;
  mapping: AnkiMapping;
  setMapping: (mapping: AnkiMapping) => void;
  mockData: any;
}

export function SidePanel({ 
  isPopupMode, 
  togglePopupMode,
  onClose,
  isDarkMode,
  toggleDarkMode,
  styles,
  setStyles,
  mapping,
  setMapping,
  mockData
}: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<'subtitles' | 'cards' | 'settings'>('cards');

  return (
    <div
      className={`flex flex-col bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden ${
        isPopupMode
          ? 'w-[360px] h-[600px] rounded-xl fixed top-24 right-8 z-50 border border-zinc-200 dark:border-zinc-800'
          : 'w-[400px] h-full rounded-none border-l border-zinc-200 dark:border-zinc-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/50 backdrop-blur">
        <KivaraLingoLogo size={18} isDark={isDarkMode} />
        <div className="flex items-center gap-1">
          <button 
            onClick={toggleDarkMode}
            className="p-1.5 text-zinc-400 hover:text-amber-500 dark:hover:text-amber-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md transition-colors"
            title="Toggle theme"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button 
            onClick={togglePopupMode}
            className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-md transition-colors"
            title={isPopupMode ? "Dock to side" : "Open as popup window"}
          >
            {isPopupMode ? <LayoutGrid size={16} /> : <ExternalLink size={16} />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
            title="Cerrar panel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tabs Nav */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800/60 bg-white dark:bg-zinc-950">
        {[
          { id: 'subtitles', label: 'Subtitles', icon: Subtitles },
          { id: 'cards', label: 'Cards', icon: LayoutGrid },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-all relative ${
              activeTab === tab.id 
                ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/5' 
                : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-600 dark:bg-indigo-500"></div>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'subtitles' && (
          <SubtitlesTab styles={styles} setStyles={setStyles} />
        )}
        {activeTab === 'cards' && (
          <CardsTab mapping={mapping} setMapping={setMapping} mockData={mockData} />
        )}
        {activeTab === 'settings' && (
          <SettingsTab />
        )}
      </div>
    </div>
  );
}
