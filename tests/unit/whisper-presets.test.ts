import { describe, it, expect } from 'vitest';
import { WHISPER_MODEL_PRESETS, modelKeyForUrl } from '../../src/shared/whisper-presets';

describe('whisper-presets', () => {
  it('has 4 model presets', () => {
    expect(Object.keys(WHISPER_MODEL_PRESETS)).toHaveLength(4);
  });

  it('all presets have required fields', () => {
    for (const [key, preset] of Object.entries(WHISPER_MODEL_PRESETS)) {
      expect(preset.label).toBeTruthy();
      expect(preset.sizeBytes).toBeGreaterThan(0);
      expect(preset.url).toMatch(/^https:\/\//);
      expect(preset.url).toContain(key === 'medium' ? 'medium' : key);
    }
  });

  it('modelKeyForUrl resolves known URLs', () => {
    expect(modelKeyForUrl(WHISPER_MODEL_PRESETS.tiny.url)).toBe('tiny');
    expect(modelKeyForUrl(WHISPER_MODEL_PRESETS.base.url)).toBe('base');
    expect(modelKeyForUrl(WHISPER_MODEL_PRESETS.small.url)).toBe('small');
    expect(modelKeyForUrl(WHISPER_MODEL_PRESETS.medium.url)).toBe('medium');
  });

  it('modelKeyForUrl returns null for unknown URLs', () => {
    expect(modelKeyForUrl('https://example.com/custom-model.bin')).toBeNull();
  });
});
