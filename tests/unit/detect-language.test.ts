import { describe, it, expect } from 'vitest';
import { detectLanguage, clearDetectionCache } from '../../src/content/nlp/detect-language';

describe('detectLanguage', () => {
  beforeEach(() => clearDetectionCache());

  it('returns hint when provided', () => {
    expect(detectLanguage('anything', 'es-MX')).toBe('es');
    expect(detectLanguage('anything', 'en-US')).toBe('en');
    expect(detectLanguage('anything', 'fr')).toBe('fr');
  });

  it('returns "en" for very short text without hint', () => {
    expect(detectLanguage('Hi there', null)).toBe('en');
    expect(detectLanguage('OK', undefined)).toBe('en');
  });

  it('detects English text', () => {
    const result = detectLanguage(
      'These days, nobody really travels much anymore. It is what it is.',
      null,
    );
    expect(result).toBe('en');
  });

  it('detects Spanish text', () => {
    const result = detectLanguage(
      'Estos días nadie viaja mucho. Las cosas son como son y no hay nada que hacer al respecto.',
      null,
    );
    expect(result).toBe('es');
  });

  it('detects French text', () => {
    const result = detectLanguage(
      "Je ne comprends pas pourquoi il fait toujours la même chose chaque jour sans changer.",
      null,
    );
    expect(result).toBe('fr');
  });

  it('caches results', () => {
    const text = 'This is a sufficiently long English sentence for trigram analysis to work properly.';
    const first = detectLanguage(text, null);
    const second = detectLanguage(text, null);
    expect(first).toBe(second);
  });
});
