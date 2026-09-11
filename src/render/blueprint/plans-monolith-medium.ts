import { part } from './parts';
import { finishMonolith, monolithArm, monolithHead, monolithLegs, monolithPlate, monolithShoulder } from './plans-monolith-parts';
import type { BlueprintPart, Plan } from './types';

/** The two tall chest stones protect a narrow optical channel between them. */
export const sentinelMonolithPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  monolithLegs(parts, b, 0.68, 1.05);
  parts.push(part('centre_torso', 'box', [-b.long * 0.1, b.tall * 0.14, 0],
    [b.long * 0.72, b.tall * 1.15, b.wide * 0.76], 'deep'));
  for (const side of [-1, 1]) {
    parts.push(monolithPlate('centre_torso', [b.long * 0.08, b.tall * 0.28, side * b.wide * 0.26],
      [b.long * 0.86, b.tall * 1.55, b.wide * 0.38]));
  }
  const head = monolithHead(parts, b.long * 0.45, b.tall * 0.42, b.tall * 0.54, b.wide * 0.28);
  const left = monolithArm(parts, b, -1, b.tall * 0.1, b.tall * 1.2, b.shoulder * 1.12, 0.32);
  const right = monolithArm(parts, b, 1, b.tall * 0.1, b.tall * 1.2, b.shoulder * 1.12, 0.32);
  const shoulders = [-1, 1].map((side) => monolithShoulder(parts, side,
    [-b.long * 0.15, b.tall * 0.12, side * b.wide * 0.7], [b.long * 0.65, b.tall * 0.95, b.wide * 0.36]));
  return finishMonolith(parts, b, b.tall * 1.08, { head, centre_torso: [b.long * 0.5, -b.tall * 0.28, 0],
    left_arm: left, right_arm: right, left_torso: shoulders[0]!, right_torso: shoulders[1]! });
};

/** An open waist and long blade sleeves separate the interceptor from the line hull. */
export const falchionMonolithPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  monolithLegs(parts, b, 0.56, 0.86);
  parts.push(monolithPlate('centre_torso', [-b.long * 0.1, -b.tall * 0.1, 0],
    [b.long * 0.56, b.tall * 1.1, b.wide * 0.52], 'deep'));
  for (const side of [-1, 1]) {
    parts.push(monolithPlate('centre_torso', [b.long * 0.15, b.tall * 0.24, side * b.wide * 0.19],
      [b.long * 1.1, b.tall * 1.4, b.wide * 0.3]));
  }
  const head = monolithHead(parts, b.long * 0.57, b.tall * 0.52, b.tall * 0.48, b.wide * 0.24);
  const left = monolithArm(parts, b, -1, b.tall * 0.26, b.tall * 1.65, b.shoulder * 1.07, 0.27);
  const right = monolithArm(parts, b, 1, b.tall * 0.26, b.tall * 1.65, b.shoulder * 1.07, 0.27);
  const shoulders = [-1, 1].map((side) => monolithShoulder(parts, side,
    [-b.long * 0.28, b.tall * 0.54, side * b.wide * 0.68], [b.long * 0.75, b.tall * 0.52, b.wide * 0.32]));
  return finishMonolith(parts, b, b.tall * 1.0, { head, centre_torso: [b.long * 0.58, -b.tall * 0.2, 0],
    left_arm: left, right_arm: right, left_torso: shoulders[0]!, right_torso: shoulders[1]! });
};
