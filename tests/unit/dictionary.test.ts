import { describe, it, expect } from 'vitest';
import { lookupDictionary, getDictionary } from '../../src/content/nlp/dictionary';

describe('lookupDictionary', () => {
  it('finds direct entries', () => {
    const entry = lookupDictionary('travel');
    expect(entry).toBeDefined();
    expect(entry?.translation).toBe('viajar');
  });

  it('finds via lemma (travels → travel)', () => {
    const entry = lookupDictionary('travels');
    // "travels" shouldn't be a direct hit; it should find "travel" via lemma
    expect(entry).toBeDefined();
    if (entry) {
      expect(entry.token).toBe('travels'); // surface form preserved
      expect(entry.lemmaOf).toBe('travel');
    }
  });

  it('is case-insensitive', () => {
    const upper = lookupDictionary('TRAVEL');
    const lower = lookupDictionary('travel');
    expect(upper?.translation).toBe(lower?.translation);
  });

  it('sanitizes XML placeholders', () => {
    // "because" was historically tainted — verify the sanitizer works
    const entry = lookupDictionary('because');
    expect(entry).toBeDefined();
    expect(entry?.translation).not.toContain('<g');
    expect(entry?.translation).toBe('porque');
  });

  it('finds MWE entries', () => {
    const entry = lookupDictionary('give up');
    expect(entry).toBeDefined();
    expect(entry?.type).toBe('phrase');
    expect(entry?.translation).toBeTruthy();
  });

  it('MWE entries have full metadata', () => {
    const entry = lookupDictionary('figure out');
    expect(entry).toBeDefined();
    expect(entry?.phonetic).toBeTruthy();
    expect(entry?.monolingual).toBeTruthy();
    expect(entry?.examples).toBeDefined();
    expect(entry!.examples!.length).toBeGreaterThan(0);
  });

  it('returns undefined for completely unknown words', () => {
    const entry = lookupDictionary('xyzzyplugh');
    expect(entry).toBeUndefined();
  });
});

describe('getDictionary', () => {
  it('returns the English dictionary', () => {
    const dict = getDictionary('en');
    expect(Object.keys(dict).length).toBeGreaterThan(1500);
  });

  it('returns empty for unsupported language', () => {
    const dict = getDictionary('ja');
    expect(Object.keys(dict).length).toBe(0);
  });
});
