import { part } from './parts';
import { finishIron, ironArm, ironCab, ironLegs, ironPlate, ironShoulder, IRON_SHIELD } from './plans-ironwork-parts';
import type { BlueprintPart, Plan } from './types';

/** A convoy guard's shoulder roll-cage surrounds a compact, raised driving cab. */
export const rivetIronworkPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  ironLegs(parts, b, 0.72, 1.02);
  parts.push(
    part('centre_torso', 'box', [-b.long * 0.1, -b.tall * 0.15, 0], [b.long * 0.65, b.tall * 0.75, b.wide * 0.8], 'deep'),
    ironPlate('centre_torso', [b.long * 0.26, -b.tall * 0.21, 0], [b.long * 0.46, b.tall * 0.6, b.wide * 0.9]),
    part('centre_torso', 'box', [-b.long * 0.24, b.tall * 0.7, 0], [0.14, 0.12, b.wide * 1.36], 'deep'),
  );
  ironCab(parts, b, b.long * 0.22, b.tall * 0.4, b.long * 0.68, b.tall * 0.58, b.wide * 0.7);
  const left = ironArm(parts, b, -1, b.tall * 0.16, b.tall * 1.17, b.shoulder * 1.12, 0.26);
  const right = ironArm(parts, b, 1, b.tall * 0.16, b.tall * 1.17, b.shoulder * 1.12, 0.29);
  const leftTorso = ironShoulder(parts, 'left_torso', [-b.long * 0.17, b.tall * 0.35, -b.wide * 0.65],
    [b.long * 0.73, b.tall * 0.78, b.wide * 0.4]);
  const rightTorso = ironShoulder(parts, 'right_torso', [-b.long * 0.19, b.tall * 0.35, b.wide * 0.65],
    [b.long * 0.6, b.tall * 0.75, b.wide * 0.38], 'accent');
  parts.push(ironPlate('left_arm', [b.long * 0.1, -b.tall * 0.47, -b.shoulder * 1.22],
    [b.long * 0.65, b.tall * 0.67, 0.25], 'plate', IRON_SHIELD));
  return finishIron(parts, b, b.tall * 0.87, { left_arm: left, right_arm: right,
    left_torso: leftTorso, right_torso: rightTorso, centre_torso: [b.long * 0.5, -b.tall * 0.2, 0],
    head: [b.long * 0.56, b.tall * 0.58, 0] });
};

/** A low battery carriage exposes its raised crossbeam between the launcher shoulders. */
export const trestleIronworkPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  ironLegs(parts, b, 0.81, 1.04);
  parts.push(
    ironPlate('centre_torso', [b.long * 0.04, -b.tall * 0.18, 0], [b.long * 0.84, b.tall * 0.6, b.wide * 0.74]),
    part('centre_torso', 'box', [-b.long * 0.16, b.tall * 0.5, 0], [b.long * 0.42, b.tall * 0.25, b.wide * 1.74], 'deep'),
    part('centre_torso', 'limb', [-b.long * 0.24, b.tall * 0.12, 0], [0.2, b.tall * 0.64, 0.22], 'accent', -0.2),
  );
  ironCab(parts, b, b.long * 0.48, b.tall * 0.08, b.long * 0.76, b.tall * 0.53, b.wide * 0.64);
  const left = ironArm(parts, b, -1, 0, b.tall * 0.85, b.shoulder * 1.15, 0.27);
  const right = ironArm(parts, b, 1, 0, b.tall * 0.85, b.shoulder * 1.15, 0.2);
  const leftTorso = ironShoulder(parts, 'left_torso', [-b.long * 0.14, b.tall * 0.5, -b.wide * 0.74],
    [b.long * 0.89, b.tall * 0.69, b.wide * 0.47], 'accent');
  const rightTorso = ironShoulder(parts, 'right_torso', [-b.long * 0.14, b.tall * 0.5, b.wide * 0.74],
    [b.long * 0.89, b.tall * 0.69, b.wide * 0.47]);
  return finishIron(parts, b, b.tall * 0.91, { left_arm: left, right_arm: right,
    left_torso: leftTorso, right_torso: rightTorso, centre_torso: [b.long * 0.5, -b.tall * 0.2, 0],
    head: [b.long * 0.86, b.tall * 0.25, 0] });
};
