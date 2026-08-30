import { LineBasicMaterial } from 'three';

export interface RouteMarkerCapacities {
  readonly lineSegments: number;
  readonly directionMarks: number;
  readonly labelSegments: number;
}

export interface RouteMarkerStats {
  readonly routes: number;
  readonly activeLegs: number;
  readonly queuedLegs: number;
  readonly lineSegments: number;
  readonly chevrons: number;
  readonly wedges: number;
  readonly labels: number;
  readonly labelTexts: readonly string[];
  readonly dropped: number;
  readonly phase: number;
  readonly capacities: RouteMarkerCapacities;
}

export const GLYPH_SCALE = 1.4;
export const GLYPH_ADVANCE = 4;
export const GLYPH_SEGMENTS = new Float32Array([
  0, 5, 3, 5, 3, 5, 3, 2.5, 3, 2.5, 3, 0, 0, 0, 3, 0,
  0, 2.5, 0, 0, 0, 5, 0, 2.5, 0, 2.5, 3, 2.5,
]);
export const DIGIT_MASKS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

export function approximateEtaText(seconds: number): string {
  return `~${Math.min(999, Math.max(0, Math.ceil(seconds)))}s`;
}

export function glyphSegmentCount(character: string): number {
  if (character === '~') return 2;
  const digit = character === 's' ? 5 : Number.parseInt(character, 10);
  let mask = DIGIT_MASKS[digit] ?? 0;
  let count = 0;
  while (mask !== 0) {
    count += mask & 1;
    mask >>= 1;
  }
  return count;
}

export function routeLineMaterial(opacity: number, depthTest: boolean): LineBasicMaterial {
  return new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    depthTest,
    depthWrite: false,
    toneMapped: false,
  });
}
