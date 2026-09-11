import type { LandscapeGeometry } from './landscapeGeometry';

export type LandscapeIdentity = 'ridge' | 'foundry' | 'quarry' | 'floodworks' | 'shale' | 'causeway';

export function landscapeIdentity(mapId: string): LandscapeIdentity {
  switch (mapId) {
    case 'foundry_district': return 'foundry';
    case 'blackglass_quarry': return 'quarry';
    case 'cutbank_exchange': return 'floodworks';
    case 'shale_steps': return 'shale';
    case 'causeway': return 'causeway';
    default: return 'ridge';
  }
}

const IVORY = 0xc9c0a2;
const DARK = 0x425b60;
const RUST = 0xbc7853;

/** Public horizon landmarks live beyond the simulation rectangle, never in unexplored tiles. */
export function addLandmarks(builder: LandscapeGeometry, identity: LandscapeIdentity, width: number, depth: number): void {
  const unit = Math.min(width, depth) / 960;
  const x = width * (identity === 'floodworks' ? .36 : .67);
  const z = depth + 175 * unit;
  const box = (dx: number, y: number, dz: number, w: number, h: number, d: number, colour: number): void => {
    builder.box([x + dx * unit, y * unit, z + dz * unit], [w * unit, h * unit, d * unit], colour);
  };
  const foundationWidth = identity === 'ridge' || identity === 'shale' ? 210 : 720;
  builder.mesa([x, -144, z], [foundationWidth * unit, 144, 270 * unit],
    identity === 'quarry' ? 0x9a917a : 0x879179);

  if (identity === 'foundry') {
    box(0, 37, 0, 380, 74, 100, IVORY);
    box(0, 80, 0, 402, 14, 116, DARK);
    for (const offset of [-135, -55, 25]) {
      box(offset, 125, 32, 25, 118, 32, RUST);
      box(offset, 189, 32, 33, 12, 40, DARK);
      box(offset + 15, 43, -57, 42, 45, 12, DARK);
    }
    box(100, 133, 0, 12, 112, 16, IVORY);
    box(210, 97, 0, 12, 184, 16, IVORY);
    box(151, 193, 0, 150, 16, 20, RUST);
    box(153, 181, 0, 150, 8, 27, DARK);
  } else if (identity === 'quarry') {
    for (let step = 0; step < 4; step += 1) {
      box(-35, 14 + step * 21, 55 + step * 32, 470 - step * 65, 28, 135, step % 2 === 0 ? 0x777b70 : 0xa8987e);
    }
    box(105, 88, -20, 88, 90, 75, IVORY);
    box(105, 139, -20, 101, 14, 84, RUST);
    box(-50, 56, -38, 255, 14, 24, DARK);
    for (const offset of [-160, -65, 35]) box(offset, 28, -38, 11, 56, 18, RUST);
    box(170, 108, -20, 10, 148, 16, DARK);
    box(141, 188, -20, 84, 12, 18, RUST);
  } else if (identity === 'causeway' || identity === 'floodworks') {
    for (const offset of [-170, -70, 30, 130]) {
      box(offset, 33, 0, 35, 96, 88, IVORY);
      box(offset + 50, 18, 18, 65, 49, 16, 0x57847d);
      box(offset, 87, 0, 18, 18, 95, DARK);
    }
    box(-20, 82, 0, 382, 12, 31, IVORY);
    box(-175, 121, 0, 77, 67, 52, IVORY);
    box(-175, 127, -27, 62, 18, 4, DARK);
    box(-175, 158, 0, 92, 10, 62, RUST);
  } else {
    // One unmistakable survey station lets the player remember which pass they crossed.
    box(0, 15, 0, 105, 30, 57, IVORY);
    box(0, 34, 0, 122, 10, 64, DARK);
    box(27, 83, 0, 9, 92, 13, RUST);
    box(27, 132, 0, 65, 12, 15, IVORY);
    box(27, 151, 0, 4, 27, 6, DARK);
    if (identity === 'shale') {
      box(-63, 69, 0, 7, 102, 10, DARK);
      box(-63, 126, 0, 42, 9, 20, RUST);
    }
  }
}
