import { BoxGeometry, ConeGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import type { MapLandmark } from '../schema/mapLandmarks';
import type { SceneryFamily } from '../schema/map';
import { mergePropParts, type PropPart } from './propGeometryParts';

interface LandmarkPalette { cream: number; dark: number; signal: number; teal: number }

function palette(family?: SceneryFamily): LandmarkPalette {
  if (family === 'linewrought_workshop') {
    return { cream: 0xb88b58, dark: 0x173f42, signal: 0xd35f31, teal: 0x3f7580 };
  }
  if (family === 'aurelian_civic') {
    return { cream: 0xe7dfcb, dark: 0x224f67, signal: 0xd89435, teal: 0x8cbaa9 };
  }
  return { cream: 0xe8d6b2, dark: 0x39575d, signal: 0xd68d3f, teal: 0x699f98 };
}
const box = (colour: number, position: [number, number, number], scale: [number, number, number]): PropPart =>
  ({ geometry: new BoxGeometry(1, 1, 1), colour, position, scale });

/** Every silhouette stays inside its single blocked tile, including roof overhangs. */
export function createLandmarkGeometry(
  kind: MapLandmark['kind'],
  family?: SceneryFamily,
): BufferGeometry {
  const { cream, dark, signal, teal } = palette(family);
  const parts: PropPart[] = [];
  if (kind === 'relay') {
    parts.push(
      box(cream, [0, 0.14, 0], [0.78, 0.28, 0.76]),
      box(dark, [0, 0.3, 0], [0.83, 0.06, 0.8]),
      box(teal, [0, 0.6, 0.03], [0.13, 0.62, 0.13]),
      { geometry: new CylinderGeometry(0.38, 0.22, 0.16, 10, 1, false), colour: cream,
        position: [0, 0.99, 0], rotation: [0.65, 0, 0] },
      { geometry: new CylinderGeometry(0.31, 0.17, 0.165, 10, 1, false), colour: teal,
        position: [0, 1.035, 0.035], rotation: [0.65, 0, 0] },
      box(signal, [0, 0.18, -0.385], [0.6, 0.075, 0.025]),
    );
  } else if (kind === 'silos') {
    parts.push(box(dark, [0, 0.055, 0], [0.9, 0.11, 0.82]));
    for (const x of [-0.21, 0.21]) {
      parts.push(
        { geometry: new CylinderGeometry(0.18, 0.18, 0.84, 10), colour: cream, position: [x, 0.53, 0] },
        { geometry: new ConeGeometry(0.18, 0.2, 10), colour: teal, position: [x, 1.05, 0] },
        { geometry: new CylinderGeometry(0.184, 0.184, 0.07, 10), colour: signal, position: [x, 0.74, 0] },
        box(dark, [x, 0.12, -0.22], [0.13, 0.22, 0.1]),
      );
    }
  } else if (kind === 'gantry') {
    parts.push(
      box(dark, [0, 0.06, 0], [0.9, 0.12, 0.86]),
      box(signal, [-0.33, 0.55, 0], [0.15, 1, 0.55]),
      box(signal, [0.33, 0.55, 0], [0.15, 1, 0.55]),
      box(teal, [0, 1.02, 0], [0.84, 0.16, 0.58]),
      box(dark, [0.02, 0.78, 0], [0.07, 0.36, 0.08]),
      box(cream, [0.02, 0.59, 0], [0.18, 0.08, 0.16]),
      box(cream, [0, 0.23, 0.27], [0.68, 0.3, 0.22]),
    );
  } else {
    parts.push(
      { geometry: new ConeGeometry(0.44, 1.15, 5), colour: dark, position: [0.02, 0.56, 0], rotation: [0, 0.3, 0] },
      { geometry: new ConeGeometry(0.22, 0.69, 4), colour: signal, position: [-0.22, 0.33, 0.17], rotation: [0, 0.9, 0] },
      box(cream, [0.03, 0.66, 0.06], [0.2, 0.045, 0.24]),
    );
  }
  return mergePropParts(parts);
}
