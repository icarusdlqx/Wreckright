import { BoxGeometry, ConeGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import type { PropTheme, SceneryFamily } from '../schema/map';
import { mergePropParts, type PropPart } from './propGeometryParts';

const box = (
  colour: number,
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  rotation?: readonly [number, number, number],
): PropPart => ({ geometry: new BoxGeometry(1, 1, 1), colour, position, scale, rotation });

function legacyBuilding(theme: PropTheme): BufferGeometry {
  const industrial = theme === 'industrial';
  const wall = industrial ? 0xd2bc95 : theme === 'shale' ? 0xc9a780 : 0xead6ab;
  const roof = theme === 'shale' ? 0x65716e : 0x45646b;
  const parts: PropPart[] = [
    box(wall, [0, 0.38, 0], [1, 0.76, 1]),
    box(roof, [0, 0.76, 0], [1.02, 0.075, 1.02]),
    box(0x31464b, [0.08, 0.27, -0.502], [0.34, 0.54, 0.025]),
    box(0xebaa51, [0.08, 0.58, -0.514], [0.52, 0.07, 0.045]),
    box(roof, [-0.504, 0.44, 0.04], [0.025, 0.16, 0.52]),
  ];
  if (industrial) {
    parts.push(
      box(0x70988d, [-0.18, 0.84, 0.08], [0.55, 0.18, 0.62]),
      { geometry: new CylinderGeometry(0.07, 0.09, 0.5, 6), colour: 0x8b6954,
        position: [0.27, 0.95, -0.22] },
    );
  } else {
    parts.push(
      { geometry: new ConeGeometry(1, 1, 4), colour: roof,
        position: [0, 0.875, 0], rotation: [0, Math.PI / 4, 0],
        scale: [Math.SQRT1_2, 0.25, Math.SQRT1_2] },
    );
  }
  return mergePropParts(parts);
}

function workshopBuilding(): BufferGeometry {
  return mergePropParts([
    box(0xb48755, [-0.08, 0.34, 0.02], [0.86, 0.68, 0.9]),
    box(0x183f42, [-0.1, 0.7, 0.02], [0.92, 0.08, 0.96]),
    box(0xd05f32, [0.35, 0.52, 0.08], [0.16, 0.4, 0.52]),
    box(0x23606a, [-0.34, 0.36, -0.462], [0.22, 0.38, 0.03]),
    box(0xe0a441, [0.08, 0.52, -0.478], [0.42, 0.075, 0.035]),
    box(0x405358, [0.37, 0.16, -0.25], [0.28, 0.3, 0.22], [0, 0.08, 0]),
    box(0x315358, [-0.38, 0.84, 0.13], [0.16, 0.34, 0.16], [0, 0, -0.07]),
    box(0x739193, [-0.38, 1.01, 0.13], [0.27, 0.055, 0.27], [0, 0, -0.07]),
  ]);
}

function civicBuilding(): BufferGeometry {
  return mergePropParts([
    box(0xe7dfcb, [0, 0.32, 0], [0.92, 0.64, 0.86]),
    box(0x224f67, [0, 0.66, 0], [0.96, 0.075, 0.9]),
    box(0xeee0b5, [0, 0.74, 0], [0.74, 0.09, 0.68]),
    box(0x8cbaa9, [-0.29, 0.37, -0.441], [0.18, 0.36, 0.025]),
    box(0x8cbaa9, [0, 0.37, -0.441], [0.18, 0.36, 0.025]),
    box(0x8cbaa9, [0.29, 0.37, -0.441], [0.18, 0.36, 0.025]),
    box(0xd89435, [0, 0.59, -0.455], [0.72, 0.055, 0.035]),
    box(0x33464c, [0.39, 0.18, 0.27], [0.14, 0.36, 0.2]),
  ]);
}

export function createBuildingGeometry(
  theme: PropTheme,
  family?: SceneryFamily,
): BufferGeometry {
  if (family === 'linewrought_workshop') return workshopBuilding();
  if (family === 'aurelian_civic') return civicBuilding();
  return legacyBuilding(theme);
}

export function createYardGeometry(family: SceneryFamily): BufferGeometry {
  if (family === 'linewrought_workshop') {
    return mergePropParts([
      box(0x244a4d, [-0.22, 0.12, 0], [0.5, 0.24, 0.68], [0, 0.14, 0.02]),
      box(0xc65d32, [0.24, 0.16, 0.08], [0.32, 0.32, 0.5], [0, -0.1, -0.03]),
      { geometry: new CylinderGeometry(0.11, 0.11, 0.72, 7), colour: 0xb79b69,
        position: [0.02, 0.13, -0.32], rotation: [0, 0, Math.PI / 2] },
      box(0xe0a441, [-0.23, 0.255, -0.18], [0.28, 0.035, 0.04]),
    ]);
  }
  return mergePropParts([
    box(0xded8c8, [0, 0.055, 0], [0.82, 0.11, 0.7]),
    box(0x28556b, [0, 0.14, 0], [0.54, 0.08, 0.42]),
    box(0xb89a58, [0, 0.23, 0], [0.22, 0.1, 0.22]),
    box(0xd89435, [0, 0.335, 0], [0.08, 0.11, 0.08]),
    box(0x8cbaa9, [0, 0.415, 0], [0.16, 0.05, 0.16]),
  ]);
}
