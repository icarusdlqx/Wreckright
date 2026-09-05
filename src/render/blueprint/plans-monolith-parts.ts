import type { MechLocation } from '../../schema/common';
import { armoured, detailed, part, shaped } from './parts';
import { PROFILES } from './profiles';
import { profileSection, shoulderConnection } from './connections';
import type { BlueprintPart, Bones, Plan, Profile, Tone } from './types';

export const MONOLITH_FIN: Profile = [
  [-0.5, -0.44], [0.22, -0.5], [0.5, -0.24], [0.34, 0.5], [-0.32, 0.44],
];
export const MONOLITH_CAP: Profile = [
  [-0.5, -0.32], [0.2, -0.5], [0.5, -0.12], [0.34, 0.34], [-0.24, 0.5], [-0.5, 0.18],
];

export function monolithPlate(location: MechLocation, at: [number, number, number],
  size: [number, number, number], tone: Tone = 'plate', profile: Profile = MONOLITH_FIN): BlueprintPart {
  return armoured(location, profile, at, size, tone,
    { front: 0.78, rear: 0.94, top: 0.82, bottom: 0.7, edge: 0.022 });
}

/** Layered closed shells meet over every pivot, without exposed factory bearings. */
export function monolithLegs(parts: BlueprintPart[], b: Bones, boot: number, bulk: number): void {
  for (const side of [-1, 1]) {
    const location = side < 0 ? 'left_leg' : 'right_leg';
    const z = side * b.spread;
    const thigh = Math.hypot(b.hip - b.kneeHeight, b.knee);
    const shin = Math.hypot(b.kneeHeight, b.knee);
    const upperTilt = Math.atan2(b.knee, b.hip - b.kneeHeight);
    const lowerTilt = -Math.atan2(b.knee, b.kneeHeight);
    const girth = b.thigh * bulk;
    parts.push(
      { ...part(location, 'limb', [b.knee * 0.5, (b.hip + b.kneeHeight) / 2, z],
        [girth * 1.22, thigh * 1.17, girth], 'plate', upperTilt), joint: 'hip' },
      { ...monolithPlate(location, [b.knee, b.kneeHeight, z],
        [girth * 1.3, girth * 1.22, girth * 1.16], 'deep', MONOLITH_CAP), joint: 'knee' },
      { ...part(location, 'limb', [b.knee * 0.46, b.kneeHeight * 0.52, z],
        [girth, shin * 1.17, girth * 1.28], 'plate', lowerTilt), joint: 'knee' },
      { ...shaped(location, PROFILES.foot, [boot * 0.24, 0.1, z],
        [boot, 0.2, girth * 1.36], 'plate'), joint: 'ankle' },
    );
  }
  parts.push(part(null, 'box', [0, b.hip, 0], [b.long * 0.36, 0.24, b.spread * 2.1], 'deep'));
  for (const side of [-1, 1]) {
    parts.push(shaped(null, PROFILES.skirt, [b.long * 0.05, b.hip - 0.12, side * b.spread],
      [b.long * 0.5, 0.44, b.thigh * bulk * 1.14], 'plate'));
  }
}

export function monolithHead(parts: BlueprintPart[], x: number, y: number,
  height: number, width: number): [number, number, number] {
  parts.push(
    monolithPlate('head', [x, y, 0], [0.24, height, width], 'deep'),
    part('head', 'box', [x + 0.125, y + height * 0.03, 0],
      [0.035, height * 0.62, width * 0.24], 'glass'),
  );
  return [x + 0.16, y + height * 0.26, 0];
}

export function monolithArm(parts: BlueprintPart[], b: Bones, side: number,
  y: number, length: number, out: number, girth: number): [number, number, number] {
  const location = side < 0 ? 'left_arm' : 'right_arm';
  const z = side * out;
  parts.push(
    monolithPlate(location, [-b.long * 0.04, y - length * 0.2, z],
      [girth * 0.76, length * 0.62, girth * 0.86], 'deep'),
    monolithPlate(location, [b.long * 0.12, y - length * 0.62, z],
      [girth * 1.34, length * 0.82, girth * 1.1]),
  );
  return [b.long * 0.12 + girth * 0.54, y - length * 0.61, z];
}

export function monolithShoulder(parts: BlueprintPart[], side: number,
  at: [number, number, number], size: [number, number, number], profile: Profile = MONOLITH_CAP): [number, number, number] {
  const location = side < 0 ? 'left_torso' : 'right_torso';
  const carrier = monolithPlate(location, at, size, 'plate', profile);
  parts.push(carrier);
  shoulderConnection(parts, carrier);
  return [at[0] + size[0] * 0.48, at[1] - size[1] * 0.12, at[2]];
}

/** Flush marks remain subordinate to the large armour planes at every distance. */
export function finishMonolith(parts: BlueprintPart[], b: Bones, crown: number,
  hardpoints: ReturnType<Plan>['hardpoints']): ReturnType<Plan> {
  const body = parts.find((piece) => piece.location === 'centre_torso' && piece.detail === 'structure')!;
  for (const side of [-1, 1]) {
    const location = side < 0 ? 'left_torso' : 'right_torso';
    const carrier = parts.find((piece) => piece.location === location && piece.profile !== undefined)!;
    const x = carrier.at[0] + carrier.size[0] * 0.13;
    const y = profileSection(carrier, 0, x)[1];
    const bodyX = body.at[0] - body.size[0] * 0.18;
    const bodyY = profileSection(body, 0, bodyX)[1];
    parts.push(
      detailed(part(location, 'box', [x, y - 0.012, carrier.at[2]],
        [carrier.size[0] * 0.16, 0.04, carrier.size[2] * 0.42], 'accent'), 'surface'),
      detailed(part('centre_torso', 'box', [bodyX, bodyY - 0.012, side * body.size[2] * 0.23],
        [body.size[0] * 0.15, 0.04, body.size[2] * 0.09], 'accent'), 'surface'),
    );
    for (let index = 0; index < 3; index += 1) {
      const stripX = carrier.at[0] - carrier.size[0] * (0.04 + index * 0.09);
      const stripY = profileSection(carrier, 0, stripX)[1];
      parts.push(detailed(part(location, 'box',
        [stripX, stripY - 0.006, carrier.at[2]],
        [b.long * 0.025, 0.02, carrier.size[2] * 0.5], 'accent'), 'hero'));
    }
  }
  return { parts, hardpoints, crown };
}
