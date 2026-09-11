import type { MechLocation } from '../../schema/common';
import { armoured, detailed, part, shaped } from './parts';
import { PROFILES } from './profiles';
import { profileSection, shoulderConnection } from './connections';
import type { BlueprintPart, Bones, HardpointMap, Plan, Profile, Tone } from './types';

export const IRON_CAB: Profile = [
  [-0.5, -0.5], [0.32, -0.5], [0.5, -0.16], [0.28, 0.5], [-0.42, 0.5],
];
export const IRON_SHIELD: Profile = [
  [-0.5, -0.38], [0.3, -0.5], [0.5, -0.18], [0.42, 0.5], [-0.5, 0.38],
];

export function ironPlate(location: MechLocation, at: [number, number, number],
  size: [number, number, number], tone: Tone = 'plate', profile: Profile = IRON_CAB): BlueprintPart {
  return armoured(location, profile, at, size, tone,
    { front: 0.78, rear: 0.96, top: 0.86, bottom: 0.96, edge: 0.035 });
}

/** Open load paths survive the tactical LOD; small fasteners do not carry identity. */
export function ironLegs(parts: BlueprintPart[], b: Bones, boot: number, bulk = 1): void {
  for (const side of [-1, 1]) {
    const location = side < 0 ? 'left_leg' : 'right_leg';
    const z = side * b.spread;
    const thigh = Math.hypot(b.hip - b.kneeHeight, b.knee);
    const shin = Math.hypot(b.kneeHeight, b.knee);
    const upperTilt = Math.atan2(b.knee, b.hip - b.kneeHeight);
    const lowerTilt = -Math.atan2(b.knee, b.kneeHeight);
    const girth = b.thigh * bulk;
    const jointed = (piece: BlueprintPart, joint: 'hip' | 'knee' | 'ankle'): BlueprintPart => ({ ...piece, joint });
    parts.push(
      jointed(part(location, 'limb', [b.knee * 0.5, (b.hip + b.kneeHeight) / 2, z],
        [girth * 0.66, thigh, girth * 0.72], 'deep', upperTilt), 'hip'),
      jointed(ironPlate(location, [b.knee * 0.34 + girth * 0.22, b.hip - thigh * 0.25, z],
        [girth * 1.35, thigh * 0.5, girth * 1.24]), 'hip'),
      jointed(part(location, 'cylinder', [b.knee, b.kneeHeight, z],
        [girth * 1.12, girth * 0.82, girth * 1.12], 'deep', Math.PI / 2), 'knee'),
      jointed(part(location, 'limb', [b.knee * 0.46 - girth * 0.18, b.kneeHeight * 0.5, z],
        [girth * 0.54, shin * 0.91, girth * 0.8], 'deep', lowerTilt), 'knee'),
      jointed(part(location, 'limb', [b.knee * 0.5 + girth * 0.34, b.kneeHeight * 0.5, z],
        [girth * 0.2, shin * 0.92, girth * 0.76], 'accent', lowerTilt - 0.16), 'knee'),
      jointed(ironPlate(location, [b.knee * 0.25 + girth * 0.12, b.kneeHeight * 0.25, z],
        [girth * 1.18, shin * 0.3, girth * 1.2], side < 0 ? 'accent' : 'plate'), 'knee'),
      jointed(shaped(location, PROFILES.foot, [boot * 0.25, 0.1, z],
        [boot, 0.2, girth * 1.55], 'deep'), 'ankle'),
      jointed(ironPlate(location, [boot * 0.38, 0.2, z],
        [boot * 0.65, 0.14, girth * 1.44]), 'ankle'),
    );
  }
  parts.push(part(null, 'box', [0, b.hip, 0], [b.long * 0.4, 0.22, b.spread * 2.18], 'deep'));
}

export function ironCab(parts: BlueprintPart[], b: Bones, x: number, y: number,
  length: number, height: number, width: number): void {
  parts.push(
    ironPlate('head', [x, y, 0], [length, height, width]),
    shaped('head', PROFILES.canopy, [x + length * 0.38, y + height * 0.12, 0],
      [length * 0.18, height * 0.46, width * 0.68], 'glass'),
    part('centre_torso', 'box', [x - length * 0.16, y - height * 0.48, 0],
      [length * 0.6, b.tall * 0.16, width * 0.68], 'deep'),
  );
}

export function ironArm(parts: BlueprintPart[], b: Bones, side: number,
  y: number, length: number, out: number, girth: number): [number, number, number] {
  const location = side < 0 ? 'left_arm' : 'right_arm';
  const z = side * out;
  parts.push(
    part(location, 'cylinder', [-b.long * 0.08, y, z],
      [girth * 1.3, girth, girth * 1.3], 'deep', Math.PI / 2),
    part(location, 'limb', [-b.long * 0.03, y - length * 0.36, z],
      [girth * 0.7, length * 0.72, girth * 0.84], 'deep', -0.08),
    ironPlate(location, [b.long * 0.08, y - length * 0.7, z],
      [girth * 1.65, length * 0.4, girth * 1.5], side > 0 ? 'accent' : 'plate'),
  );
  return [b.long * 0.08 + girth * 0.7, y - length * 0.7, z];
}

export function ironShoulder(parts: BlueprintPart[], location: 'left_torso' | 'right_torso',
  at: [number, number, number], size: [number, number, number], tone: Tone = 'plate'): [number, number, number] {
  const carrier = ironPlate(location, at, size, tone);
  parts.push(
    carrier,
    part(location, 'box', [at[0] + size[0] * 0.42, at[1], at[2]],
      [0.06, size[1] * 0.58, size[2] * 0.64], 'deep'),
  );
  shoulderConnection(parts, carrier);
  return [at[0] + size[0] * 0.49, at[1], at[2]];
}

/** Each rebuild has four readable repairs and six close inspection fittings. */
export function ironDetails(parts: BlueprintPart[], b: Bones): void {
  const body = parts.find((piece) => piece.location === 'centre_torso' && piece.detail === 'structure')!;
  for (const location of ['left_torso', 'right_torso'] as const) {
    const carrier = parts.find((piece) => piece.location === location && piece.profile !== undefined)!;
    const x = carrier.at[0] - carrier.size[0] * 0.1;
    const y = profileSection(carrier, 0, x)[1];
    parts.push(detailed(part(location, 'box', [x, y + 0.005, carrier.at[2]],
      [carrier.size[0] * 0.2, 0.06, carrier.size[2] * 0.38], location === 'left_torso' ? 'plate' : 'accent'), 'surface'));
  }
  for (const side of [-1, 1]) {
    const x = body.at[0] + side * body.size[0] * 0.12;
    const y = profileSection(body, 0, x)[1];
    parts.push(detailed(part('centre_torso', 'box', [x, y - 0.005, side * body.size[2] * 0.23],
      [body.size[0] * 0.2, 0.06, body.size[2] * 0.22], side < 0 ? 'plate' : 'accent'), 'surface'));
  }
  for (let index = 0; index < 6; index += 1) {
    const rivet = Math.min(0.045, b.long * 0.07);
    const y = body.at[1] + ((index % 3) - 1) * body.size[1] * 0.22;
    const x = profileSection(body, 1, y)[1];
    parts.push(detailed(part('centre_torso', 'cylinder',
      [x, y, (index < 3 ? -1 : 1) * body.size[2] * 0.23],
      [rivet, 0.04, rivet], 'accent', Math.PI / 2), 'hero'));
  }
}

export function finishIron(parts: BlueprintPart[], b: Bones, crown: number,
  hardpoints: ReturnType<Plan>['hardpoints'], _fit?: HardpointMap): ReturnType<Plan> {
  ironDetails(parts, b);
  return { parts, hardpoints, crown };
}
