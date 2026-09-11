import { part } from './parts';
import { finishIron, ironArm, ironCab, ironLegs, ironPlate, ironShoulder, IRON_SHIELD } from './plans-ironwork-parts';
import type { BlueprintPart, Plan } from './types';

/** A high bridge joins two magazines above the small protected fire-control cabin. */
export const cairnIronworkPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  ironLegs(parts, b, 0.88, 1.04);
  parts.push(
    ironPlate('centre_torso', [-b.long * 0.08, -b.tall * 0.18, 0], [b.long * 0.84, b.tall * 0.52, b.wide * 0.7]),
    part('centre_torso', 'box', [-b.long * 0.28, b.tall * 0.54, 0], [0.24, 0.18, b.wide * 2.06], 'deep'),
  );
  for (const side of [-1, 1]) {
    parts.push(part('centre_torso', 'limb', [-b.long * 0.25, b.tall * 0.13, side * b.wide * 0.28],
      [0.16, b.tall * 0.87, 0.17], 'deep', -0.14));
  }
  ironCab(parts, b, b.long * 0.45, b.tall * 0.08, b.long * 0.72, b.tall * 0.55, b.wide * 0.6);
  const left = ironArm(parts, b, -1, -b.tall * 0.05, b.tall * 0.64, b.shoulder * 1.17, 0.21);
  const right = ironArm(parts, b, 1, -b.tall * 0.05, b.tall * 0.64, b.shoulder * 1.17, 0.21);
  const leftTorso = ironShoulder(parts, 'left_torso', [-b.long * 0.18, b.tall * 0.64, -b.wide * 0.86],
    [b.long * 1.0, b.tall * 1.22, b.wide * 0.5], 'accent');
  const rightTorso = ironShoulder(parts, 'right_torso', [-b.long * 0.18, b.tall * 0.64, b.wide * 0.86],
    [b.long * 1.0, b.tall * 1.22, b.wide * 0.5]);
  return finishIron(parts, b, b.tall * 1.32, { left_arm: left, right_arm: right,
    left_torso: leftTorso, right_torso: rightTorso, centre_torso: [b.long * 0.46, -b.tall * 0.19, 0],
    head: [b.long * 0.81, b.tall * 0.29, 0] });
};

/** The line anchor is a squat suspended frame with a full-height left arm shield. */
export const bulwarkIronworkPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  ironLegs(parts, b, 1.03, 1.26);
  parts.push(
    part('centre_torso', 'box', [-b.long * 0.04, -b.tall * 0.18, 0], [b.long * 0.76, b.tall * 0.93, b.wide * 0.92], 'deep'),
    ironPlate('centre_torso', [b.long * 0.3, -b.tall * 0.08, 0], [b.long * 0.45, b.tall * 0.86, b.wide * 1.0]),
    ironPlate('centre_torso', [-b.long * 0.34, b.tall * 0.42, 0], [b.long * 0.62, b.tall * 0.54, b.wide * 0.88], 'accent'),
  );
  ironCab(parts, b, b.long * 0.26, b.tall * 0.5, b.long * 0.68, b.tall * 0.44, b.wide * 0.62);
  const left = ironArm(parts, b, -1, b.tall * 0.15, b.tall * 1.22, b.shoulder * 1.2, 0.35);
  const right = ironArm(parts, b, 1, b.tall * 0.15, b.tall * 1.14, b.shoulder * 1.2, 0.34);
  parts.push(ironPlate('left_arm', [b.long * 0.19, -b.tall * 0.39, -b.shoulder * 1.38],
    [b.long * 1.04, b.tall * 1.62, 0.3], 'plate', IRON_SHIELD));
  const leftTorso = ironShoulder(parts, 'left_torso', [-b.long * 0.11, b.tall * 0.4, -b.wide * 0.68],
    [b.long * 0.81, b.tall * 0.87, b.wide * 0.46]);
  const rightTorso = ironShoulder(parts, 'right_torso', [-b.long * 0.12, b.tall * 0.34, b.wide * 0.68],
    [b.long * 0.7, b.tall * 0.8, b.wide * 0.43], 'accent');
  return finishIron(parts, b, b.tall * 0.9, { left_arm: left, right_arm: right,
    left_torso: leftTorso, right_torso: rightTorso, centre_torso: [b.long * 0.53, -b.tall * 0.06, 0],
    head: [b.long * 0.6, b.tall * 0.68, 0] });
};
