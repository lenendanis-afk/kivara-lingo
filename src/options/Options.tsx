import { useEffect } from 'react';
import { SidePanel } from '../content/ui/SidePanel';
import { useKivaraStore } from '../shared/store';

export function Options() {
  const {
    isDarkMode,
    subtitleStyles,
    ankiMapping,
    setIsDarkMode,
    setSubtitleStyles,
    setAnkiMapping,
  } = useKivaraStore();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const mockData = {
    targetSentence: "These days, Nicola doesn't travel much.",
    nativeSentence: 'Estos días, Nicola no viaja mucho.',
    word: 'these days',
    translation: 'estos días',
    phonetic: '/ðiːz deɪz/',
    bilingual: '(noun) estos días',
    monolingual: 'Used to refer to the present time period.',
  };

  return (
    <div
      className={`min-h-screen ${isDarkMode ? 'dark bg-zinc-950' : 'bg-zinc-50'} flex items-center justify-center p-8`}
      style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
    >
      <div className="w-[420px] h-[820px] shadow-2xl overflow-hidden rounded-xl">
        <SidePanel
          isPopupMode={false}
          togglePopupMode={() => {}}
          onClose={() => {}}
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
  );
}
