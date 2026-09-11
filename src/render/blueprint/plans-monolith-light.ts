import { part } from './parts';
import { finishMonolith, monolithArm, monolithHead, monolithLegs, monolithPlate, monolithShoulder } from './plans-monolith-parts';
import type { BlueprintPart, Plan } from './types';

/** The survey machine is a low arrow split around one deeply buried optical strip. */
export const vesperMonolithPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  monolithLegs(parts, b, 0.47, 0.84);
  parts.push(part('centre_torso', 'box', [-b.long * 0.12, -b.tall * 0.08, 0],
    [b.long * 0.7, b.tall * 0.55, b.wide * 0.58], 'deep'));
  for (const side of [-1, 1]) {
    parts.push(monolithPlate('centre_torso', [b.long * 0.19, b.tall * 0.12, side * b.wide * 0.24],
      [b.long * 1.28, b.tall * 0.9, b.wide * 0.35]));
  }
  const head = monolithHead(parts, b.long * 0.68, b.tall * 0.12, b.tall * 0.42, b.wide * 0.24);
  const left = monolithArm(parts, b, -1, b.tall * 0.04, b.tall * 1.03, b.shoulder * 1.14, 0.18);
  const right = monolithArm(parts, b, 1, b.tall * 0.04, b.tall * 1.03, b.shoulder * 1.14, 0.18);
  const leftTorso = monolithShoulder(parts, -1, [-b.long * 0.24, b.tall * 0.03, -b.wide * 0.65],
    [b.long * 0.68, b.tall * 0.4, b.wide * 0.34]);
  const rightTorso = monolithShoulder(parts, 1, [-b.long * 0.24, b.tall * 0.03, b.wide * 0.65],
    [b.long * 0.68, b.tall * 0.4, b.wide * 0.34]);
  return finishMonolith(parts, b, b.tall * 0.61, { head, centre_torso: [b.long * 0.52, -b.tall * 0.24, 0],
    left_arm: left, right_arm: right, left_torso: leftTorso, right_torso: rightTorso });
};

/** A pair of upright sensor stones distinguishes the picket from the low survey hull. */
export const votiveMonolithPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  monolithLegs(parts, b, 0.56, 0.98);
  parts.push(monolithPlate('centre_torso', [-b.long * 0.09, -b.tall * 0.01, 0],
    [b.long * 0.72, b.tall * 0.87, b.wide * 0.67], 'deep'));
  for (const side of [-1, 1]) {
    parts.push(monolithPlate('centre_torso', [b.long * 0.15, b.tall * 0.41, side * b.wide * 0.24],
      [b.long * 0.78, b.tall * 1.7, b.wide * 0.34]));
  }
  const head = monolithHead(parts, b.long * 0.5, b.tall * 0.49, b.tall * 0.62, b.wide * 0.23);
  const left = monolithArm(parts, b, -1, b.tall * 0.2, b.tall * 1.28, b.shoulder * 1.18, 0.22);
  const right = monolithArm(parts, b, 1, b.tall * 0.2, b.tall * 1.28, b.shoulder * 1.18, 0.22);
  const leftTorso = monolithShoulder(parts, -1, [-b.long * 0.13, b.tall * 0.24, -b.wide * 0.72],
    [b.long * 0.66, b.tall * 0.66, b.wide * 0.35]);
  const rightTorso = monolithShoulder(parts, 1, [-b.long * 0.13, b.tall * 0.24, b.wide * 0.72],
    [b.long * 0.66, b.tall * 0.66, b.wide * 0.35]);
  return finishMonolith(parts, b, b.tall * 1.29, { head, centre_torso: [b.long * 0.4, -b.tall * 0.18, 0],
    left_arm: left, right_arm: right, left_torso: leftTorso, right_torso: rightTorso });
};
