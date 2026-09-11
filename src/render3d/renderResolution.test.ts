import { describe, expect, it } from 'vitest';
import { renderPixelRatio } from './renderResolution';

describe('bounded high-resolution rendering', () => {
  it('keeps small Retina viewports and bay previews at full 2x density', () => {
    expect(renderPixelRatio(2, false, 1280, 720)).toBe(2);
    expect(renderPixelRatio(3, false, 500, 400)).toBe(2);
    expect(renderPixelRatio(1, false, 1280, 720)).toBe(1);
  });
  it('bounds large drawing buffers while keeping low effects at its old density', () => {
    const ratio = renderPixelRatio(3, false, 2560, 1440);
    expect(ratio * ratio * 2560 * 1440).toBeLessThanOrEqual(6_000_001);
    expect(ratio).toBeGreaterThan(1);
    expect(renderPixelRatio(3, true, 1280, 720)).toBe(1);
    expect(renderPixelRatio(Number.NaN, false)).toBe(1);
    expect(renderPixelRatio(0, false)).toBe(1);
  });
});
