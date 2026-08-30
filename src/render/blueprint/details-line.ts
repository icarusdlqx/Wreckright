import { PROFILES } from './profiles';
import { bolted, detailed, part, shaped } from './parts';
import type { BlueprintPart, Bones } from './types';

function surface(piece: BlueprintPart): BlueprintPart {
  return detailed(piece, 'surface');
}

function hero(piece: BlueprintPart): BlueprintPart {
  return detailed(piece, 'hero');
}

function gadflyDetails(b: Bones): BlueprintPart[] {
  const headX = b.long * 0.78;
  const headY = b.tall * 0.22;
  // The four battlefield pieces are deliberately unmatched: a dorsal repair,
  // two different nacelle jobs and a raised weld strap.
  const parts: BlueprintPart[] = [
    surface(shaped('centre_torso', PROFILES.pauldron,
      [-b.long * 0.18, b.tall * 0.43, -b.wide * 0.1],
      [b.long * 0.38, b.tall * 0.12, b.wide * 0.36], 'accent', b.pitch)),
    surface(part('left_torso', 'cylinder',
      [-b.long * 0.28, b.tall * 0.08, -b.wide * 1.06],
      [0.18, b.long * 0.22, 0.18], 'accent', Math.PI / 2)),
    surface(part('centre_torso', 'box',
      [b.long * 0.34, b.tall * 0.06, b.wide * 0.2],
      [0.09, b.tall * 0.72, b.wide * 0.14], 'accent', b.pitch)),
    surface(part('right_torso', 'box',
      [b.long * 0.08, b.tall * 0.08, b.wide * 1.04],
      [b.long * 0.14, b.tall * 0.3, b.wide * 0.14], 'accent', b.pitch)),
  ];

  for (const side of [-1, 1]) {
    const torso = side < 0 ? 'left_torso' : 'right_torso';
    parts.push(
      hero(part('head', 'box',
        [headX + b.long * 0.02, headY + 0.12, side * b.wide * 0.19],
        [b.long * 0.34, 0.045, 0.045], 'trim', b.pitch)),
      hero(part(torso, 'box',
        [-b.long * 0.05, b.tall * 0.45, side * b.wide * 0.96],
        [b.long * 0.2, 0.06, b.wide * 0.1], 'accent', b.pitch)),
    );
  }
  parts.push(
    hero(part('head', 'box',
      [headX + b.long * 0.39, headY + 0.03, 0],
      [0.07, 0.07, 0.07], 'glass', b.pitch)),
    hero(part('centre_torso', 'box',
      [-b.long * 0.18, -b.tall * 0.39, -b.wide * 0.16],
      [b.long * 0.18, 0.045, b.wide * 0.16], 'trim', b.pitch)),
  );
  return parts;
}

function droverDetails(b: Bones): BlueprintPart[] {
  const deck = b.hip * 0.92;
  // Unequal skirt patches and loose deck stores keep the carrier shop-built.
  const parts: BlueprintPart[] = [
    surface(bolted(shaped('left_leg', PROFILES.skirt,
      [b.long * 0.08, b.hip * 0.62, -b.spread * 1.12],
      [b.long * 1.08, 0.14, b.thigh * 0.34], 'plate'))),
    surface(bolted(part('right_leg', 'box',
      [-b.long * 0.2, b.hip * 0.54, b.spread * 1.1],
      [b.long * 0.58, 0.11, b.thigh * 0.24], 'accent'))),
    surface(bolted(part('centre_torso', 'box',
      [-b.long * 0.14, deck + b.tall * 0.52, -b.wide * 0.58],
      [b.long * 0.74, b.tall * 0.26, b.wide * 0.24], 'accent'))),
    surface(bolted(part('centre_torso', 'cylinder',
      [-b.long * 0.82, deck + b.tall * 0.3, b.wide * 0.38],
      [0.18, b.wide * 0.52, 0.18], 'accent', Math.PI / 2))),
  ];
  for (const side of [-1, 1]) {
    const location = side < 0 ? 'left_leg' : 'right_leg';
    parts.push(
      hero(bolted(part('centre_torso', 'box',
        [-b.long * 0.1, deck + b.tall * 0.48, side * b.wide * 0.48],
        [b.long * 0.7, 0.05, 0.05], 'trim'))),
      hero(bolted(part('centre_torso', 'box',
        [-b.long * 0.72, b.hip * 0.46, side * b.wide * 0.5],
        [0.12, 0.12, 0.12], 'accent'))),
      hero(bolted(shaped(location, PROFILES.skirt,
        [b.long * 0.48, b.hip * 0.42, side * b.spread * 1.08],
        [0.18, 0.18, b.thigh * 0.22], 'plate'))),
    );
  }
  return parts;
}

function bulwarkDetails(b: Bones): BlueprintPart[] {
  const shieldZ = -b.shoulder * 1.39;
  // The shield has been plated twice; the free arm carries the field kit.
  const parts: BlueprintPart[] = [
    surface(shaped('left_arm', PROFILES.shield,
      [b.long * 0.38, -b.tall * 0.18, shieldZ - b.wide * 0.2],
      [b.long * 0.24, b.tall * 1.08, b.wide * 0.18], 'accent', b.pitch)),
    surface(part('left_arm', 'box',
      [b.long * 0.08, -b.tall * 0.54, shieldZ - b.wide * 0.3],
      [b.long * 0.62, b.tall * 0.13, b.wide * 0.2], 'plate', b.pitch)),
    surface(part('centre_torso', 'box',
      [b.long * 0.42, b.tall * 0.18, -b.wide * 0.24],
      [0.12, b.tall * 0.78, b.wide * 0.16], 'accent', b.pitch)),
    surface(shaped('right_arm', PROFILES.block,
      [-b.long * 0.16, -b.tall * 0.38, b.shoulder * 1.2],
      [b.long * 0.38, b.tall * 0.48, b.wide * 0.32], 'accent', b.pitch)),
  ];

  for (const y of [-0.68, -0.18, 0.28, 0.66]) {
    parts.push(hero(part('left_arm', 'cylinder',
      [b.long * 0.4, b.tall * y, shieldZ - 0.21],
      [0.09, 0.06, 0.09], 'trim', Math.PI / 2)));
  }
  parts.push(
    hero(shaped('head', PROFILES.pauldron,
      [b.long * 0.35, b.tall * 0.47, 0],
      [b.long * 0.36, 0.06, b.wide * 0.72], 'trim', b.pitch)),
    hero(part('centre_torso', 'box',
      [b.long * 0.48, -b.tall * 0.08, b.wide * 0.18],
      [0.05, b.tall * 0.28, b.wide * 0.22], 'accent', b.pitch)),
  );
  return parts;
}

function colossusDetails(b: Bones): BlueprintPart[] {
  // A siege survivor wears four unrelated jobs rather than paired trim.
  const parts: BlueprintPart[] = [
    surface(shaped('left_torso', PROFILES.block,
      [-b.long * 0.34, b.tall * 0.14, -b.wide * 0.88],
      [b.long * 0.5, b.tall * 0.7, b.wide * 0.2], 'accent', b.pitch)),
    surface(part('centre_torso', 'box',
      [b.long * 0.48, b.tall * 0.22, b.wide * 0.13],
      [0.12, b.tall * 0.9, b.wide * 0.13], 'accent', b.pitch)),
    surface(shaped('right_torso', PROFILES.carriage,
      [-b.long * 0.48, b.tall * 0.43, b.wide * 0.9],
      [b.long * 0.42, b.tall * 0.3, b.wide * 0.28], 'plate', b.pitch)),
    surface(part('left_torso', 'box',
      [b.long * 0.16, -b.tall * 0.34, -b.wide * 0.82],
      [b.long * 0.66, b.tall * 0.14, b.wide * 0.2], 'accent', b.pitch)),
  ];
  for (const side of [-1, 1]) {
    const torso = side < 0 ? 'left_torso' : 'right_torso';
    parts.push(
      hero(part(torso, 'box',
        [-b.long * 0.12, b.tall * 0.52, side * b.wide * 0.82],
        [b.long * 0.24, 0.12, b.wide * 0.16], 'trim', b.pitch)),
      hero(part(torso, 'box',
        [b.long * 0.37, -b.tall * 0.12, side * b.wide * 0.6],
        [0.05, b.tall * 0.34, b.wide * 0.22], 'plate', b.pitch)),
    );
  }
  parts.push(
    hero(part('head', 'box',
      [b.long * 0.68, b.tall * 0.56, 0],
      [0.045, 0.08, b.wide * 0.34], 'accent')),
    hero(part('centre_torso', 'box',
      [-b.long * 0.52, -b.tall * 0.22, b.wide * 0.24],
      [b.long * 0.18, b.tall * 0.24, b.wide * 0.18], 'deep')),
  );
  return parts;
}

export function lineSignatureDetails(identity: string, b: Bones): BlueprintPart[] | null {
  if (identity === 'hornet_hnt2') return gadflyDetails(b);
  if (identity === 'drover_dvr2') return droverDetails(b);
  if (identity === 'bulwark_bwk3') return bulwarkDetails(b);
  if (identity === 'colossus_cls1') return colossusDetails(b);
  return null;
}
