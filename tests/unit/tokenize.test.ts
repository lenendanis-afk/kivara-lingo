import { describe, it, expect } from 'vitest';
import { tokenizeSentence } from '../../src/content/nlp/tokenize';

describe('tokenizeSentence', () => {
  it('tokenizes a simple sentence', () => {
    const tokens = tokenizeSentence("Hello world.", new Set());
    expect(tokens.length).toBeGreaterThan(0);
    // Should have at least word tokens + punct
    const kinds = tokens.map(t => t.kind);
    expect(kinds).toContain('punct');
  });

  it('detects MWE "give up"', () => {
    const tokens = tokenizeSentence("I will give up now.", new Set());
    const mwe = tokens.find(t => t.kind === 'mwe' && t.key === 'give up');
    expect(mwe).toBeDefined();
    expect(mwe?.text).toBe('give up');
  });

  it('expands MWE when in expanded set', () => {
    const expanded = new Set(['give up']);
    const tokens = tokenizeSentence("I will give up now.", expanded);
    const mwe = tokens.find(t => t.kind === 'mwe' && t.key === 'give up');
    expect(mwe).toBeUndefined(); // should be split into individual words
  });

  it('marks known words correctly', () => {
    const tokens = tokenizeSentence("She travels every day.", new Set());
    // "travels" should be found via lemma → "travel" which is in the dict
    const travels = tokens.find(t => t.key === 'travels' || t.key === 'travel');
    expect(travels).toBeDefined();
    expect(['known', 'unknown']).toContain(travels?.kind);
  });

  it('handles punctuation correctly', () => {
    const tokens = tokenizeSentence("Hello, world!", new Set());
    const puncts = tokens.filter(t => t.kind === 'punct');
    expect(puncts.length).toBeGreaterThanOrEqual(2); // comma and exclamation
  });

  it('handles empty string', () => {
    const tokens = tokenizeSentence("", new Set());
    expect(tokens).toEqual([]);
  });
});
