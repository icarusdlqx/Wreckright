import { part } from './parts';
import { finishIron, ironArm, ironCab, ironLegs, ironPlate, ironShoulder, IRON_SHIELD } from './plans-ironwork-parts';
import type { BlueprintPart, Plan } from './types';

/** A single low mantlet carries the forward mass of the breach machine. */
export const rampartIronworkPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  ironLegs(parts, b, 1.06, 1.26);
  parts.push(
    part('centre_torso', 'box', [-b.long * 0.13, -b.tall * 0.06, 0], [b.long * 0.85, b.tall * 0.94, b.wide * 0.85], 'deep'),
    ironPlate('centre_torso', [b.long * 0.3, -b.tall * 0.02, 0], [b.long * 0.58, b.tall * 1.12, b.wide * 1.34], 'plate', IRON_SHIELD),
    ironPlate('centre_torso', [-b.long * 0.3, b.tall * 0.41, 0], [b.long * 0.58, b.tall * 0.57, b.wide * 0.8], 'accent'),
  );
  ironCab(parts, b, b.long * 0.04, b.tall * 0.6, b.long * 0.6, b.tall * 0.4, b.wide * 0.54);
  const left = ironArm(parts, b, -1, b.tall * 0.18, b.tall * 0.98, b.shoulder * 1.18, 0.38);
  const right = ironArm(parts, b, 1, b.tall * 0.18, b.tall * 0.98, b.shoulder * 1.18, 0.4);
  const leftTorso = ironShoulder(parts, 'left_torso', [b.long * 0.02, b.tall * 0.35, -b.wide * 0.72],
    [b.long * 0.92, b.tall * 0.88, b.wide * 0.48], 'accent');
  const rightTorso = ironShoulder(parts, 'right_torso', [b.long * 0.06, b.tall * 0.28, b.wide * 0.72],
    [b.long * 0.86, b.tall * 0.77, b.wide * 0.45]);
  return finishIron(parts, b, b.tall * 0.85, { left_arm: left, right_arm: right,
    left_torso: leftTorso, right_torso: rightTorso, centre_torso: [b.long * 0.6, -b.tall * 0.18, 0],
    head: [b.long * 0.34, b.tall * 0.75, 0] });
};

/** A working gantry and a deep reactor chest make the largest survivor tower over the line. */
export const colossusIronworkPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  ironLegs(parts, b, 1.12, 1.32);
  parts.push(
    part('centre_torso', 'box', [-b.long * 0.16, b.tall * 0.08, 0], [b.long * 0.9, b.tall * 1.25, b.wide * 0.87], 'deep'),
    ironPlate('centre_torso', [b.long * 0.24, -b.tall * 0.08, 0], [b.long * 0.5, b.tall * 1.09, b.wide * 0.86]),
    part('centre_torso', 'box', [-b.long * 0.39, b.tall * 0.935 + 0.045, 0], [0.19, 0.15, b.wide * 1.2], 'accent'),
  );
  for (const side of [-1, 1]) {
    parts.push(ironPlate('centre_torso', [-b.long * 0.39, b.tall * 0.42, side * b.wide * 0.3],
      [b.long * 0.36, b.tall * 1.03, b.wide * 0.28], side < 0 ? 'accent' : 'plate'));
  }
  ironCab(parts, b, b.long * 0.34, b.tall * 0.68, b.long * 0.78, b.tall * 0.49, b.wide * 0.65);
  const left = ironArm(parts, b, -1, b.tall * 0.32, b.tall * 1.39, b.shoulder * 1.23, 0.43);
  const right = ironArm(parts, b, 1, b.tall * 0.32, b.tall * 1.39, b.shoulder * 1.23, 0.4);
  const leftTorso = ironShoulder(parts, 'left_torso', [-b.long * 0.08, b.tall * 0.61, -b.wide * 0.76],
    [b.long * 0.99, b.tall * 0.94, b.wide * 0.51]);
  const rightTorso = ironShoulder(parts, 'right_torso', [-b.long * 0.08, b.tall * 0.56, b.wide * 0.76],
    [b.long * 0.89, b.tall * 0.98, b.wide * 0.49], 'accent');
  return finishIron(parts, b, b.tall * 1.18, { left_arm: left, right_arm: right,
    left_torso: leftTorso, right_torso: rightTorso, centre_torso: [b.long * 0.5, -b.tall * 0.08, 0],
    head: [b.long * 0.73, b.tall * 0.86, 0] });
};
