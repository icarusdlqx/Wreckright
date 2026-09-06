import { BoxGeometry, ConeGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import type { MapLandmark } from '../schema/mapLandmarks';
import { mergePropParts, type PropPart } from './propGeometryParts';

const CREAM = 0xe8d6b2;
const DARK = 0x39575d;
const SIGNAL = 0xd68d3f;
const TEAL = 0x699f98;
const box = (colour: number, position: [number, number, number], scale: [number, number, number]): PropPart =>
  ({ geometry: new BoxGeometry(1, 1, 1), colour, position, scale });

/** Every silhouette stays inside its single blocked tile, including roof overhangs. */
export function createLandmarkGeometry(kind: MapLandmark['kind']): BufferGeometry {
  const parts: PropPart[] = [];
  if (kind === 'relay') {
    parts.push(
      box(CREAM, [0, 0.14, 0], [0.78, 0.28, 0.76]),
      box(DARK, [0, 0.3, 0], [0.83, 0.06, 0.8]),
      box(TEAL, [0, 0.6, 0.03], [0.13, 0.62, 0.13]),
      { geometry: new CylinderGeometry(0.38, 0.22, 0.16, 10, 1, false), colour: CREAM,
        position: [0, 0.99, 0], rotation: [0.65, 0, 0] },
      { geometry: new CylinderGeometry(0.31, 0.17, 0.165, 10, 1, false), colour: TEAL,
        position: [0, 1.035, 0.035], rotation: [0.65, 0, 0] },
      box(SIGNAL, [0, 0.18, -0.385], [0.6, 0.075, 0.025]),
    );
  } else if (kind === 'silos') {
    parts.push(box(DARK, [0, 0.055, 0], [0.9, 0.11, 0.82]));
    for (const x of [-0.21, 0.21]) {
      parts.push(
        { geometry: new CylinderGeometry(0.18, 0.18, 0.84, 10), colour: CREAM, position: [x, 0.53, 0] },
        { geometry: new ConeGeometry(0.18, 0.2, 10), colour: TEAL, position: [x, 1.05, 0] },
        { geometry: new CylinderGeometry(0.184, 0.184, 0.07, 10), colour: SIGNAL, position: [x, 0.74, 0] },
        box(DARK, [x, 0.12, -0.22], [0.13, 0.22, 0.1]),
      );
    }
  } else if (kind === 'gantry') {
    parts.push(
      box(DARK, [0, 0.06, 0], [0.9, 0.12, 0.86]),
      box(SIGNAL, [-0.33, 0.55, 0], [0.15, 1, 0.55]),
      box(SIGNAL, [0.33, 0.55, 0], [0.15, 1, 0.55]),
      box(TEAL, [0, 1.02, 0], [0.84, 0.16, 0.58]),
      box(DARK, [0.02, 0.78, 0], [0.07, 0.36, 0.08]),
      box(CREAM, [0.02, 0.59, 0], [0.18, 0.08, 0.16]),
      box(CREAM, [0, 0.23, 0.27], [0.68, 0.3, 0.22]),
    );
  } else {
    parts.push(
      { geometry: new ConeGeometry(0.44, 1.15, 5), colour: 0x667578, position: [0.02, 0.56, 0], rotation: [0, 0.3, 0] },
      { geometry: new ConeGeometry(0.22, 0.69, 4), colour: 0xcaa680, position: [-0.22, 0.33, 0.17], rotation: [0, 0.9, 0] },
      box(0xe1c59c, [0.03, 0.66, 0.06], [0.2, 0.045, 0.24]),
    );
  }
  return mergePropParts(parts);
}
