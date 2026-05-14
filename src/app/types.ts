export interface SubtitleStyles {
  fontSize: number;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: 'top' | 'middle' | 'bottom';
  verticalOffset: number; // 0..100, % vertical (centro del subtítulo)
  fontWeight: 'normal' | 'bold' | '900';
  textShadow: number; // 0..100 intensidad de sombra (0 = off)
}

export type FieldSource =
  | 'selection'
  | 'cue'
  | 'dictionary'
  | 'translate'
  | 'frame'
  | 'tabCapture'
  | 'tts'
  | 'manual';

export interface AnkiMapping {
  ankiUrl: string;
  deckName: string;
  modelName: string;
  /** key = nombre exacto del campo en Anki, value = fuente */
  fieldSources: Record<string, FieldSource>;
}
