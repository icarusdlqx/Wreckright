import { describe, expect, it } from 'vitest';
import { createPropGeometry } from './propGeometry';

describe('illustrated building geometry', () => {
  it.each(['alpine', 'shale', 'causeway', 'industrial'] as const)(
    'keeps %s detail inside one bounded instanced building mesh', (theme) => {
      const geometry = createPropGeometry('block', theme);
      geometry.computeBoundingBox();
      expect(geometry.groups).toHaveLength(0);
      expect(geometry.getAttribute('position').count / 3).toBeLessThan(110);
      expect(geometry.boundingBox?.min.x).toBeGreaterThanOrEqual(-0.55);
      expect(geometry.boundingBox?.max.x).toBeLessThanOrEqual(0.55);
      expect(geometry.boundingBox?.min.z).toBeGreaterThanOrEqual(-0.55);
      expect(geometry.boundingBox?.max.z).toBeLessThanOrEqual(0.55);
      expect(geometry.boundingBox?.max.y).toBeLessThanOrEqual(1.21);
      geometry.dispose();
    },
  );
});
