import { part } from './parts';
import { finishMonolith, MONOLITH_CAP, monolithArm, monolithHead, monolithLegs, monolithPlate, monolithShoulder } from './plans-monolith-parts';
import type { BlueprintPart, Plan } from './types';

/** The long-range assault is a tall, three-part tower rather than a wider medium. */
export const obsequyMonolithPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  monolithLegs(parts, b, 0.85, 1.16);
  parts.push(part('centre_torso', 'box', [-b.long * 0.17, b.tall * 0.22, 0],
    [b.long * 0.84, b.tall * 1.51, b.wide * 0.74], 'deep'));
  for (const side of [-1, 1]) {
    parts.push(monolithPlate('centre_torso', [b.long * 0.15, b.tall * 0.35, side * b.wide * 0.22],
      [b.long * 0.91, b.tall * 1.84, b.wide * 0.34]));
  }
  const head = monolithHead(parts, b.long * 0.57, b.tall * 0.67, b.tall * 0.65, b.wide * 0.25);
  const left = monolithArm(parts, b, -1, b.tall * 0.36, b.tall * 1.5, b.shoulder * 1.18, 0.42);
  const right = monolithArm(parts, b, 1, b.tall * 0.36, b.tall * 1.5, b.shoulder * 1.18, 0.42);
  const leftTorso = monolithShoulder(parts, -1, [-b.long * 0.2, b.tall * 0.47, -b.wide * 0.72],
    [b.long * 0.8, b.tall * 1.24, b.wide * 0.44]);
  const rightTorso = monolithShoulder(parts, 1, [-b.long * 0.2, b.tall * 0.47, b.wide * 0.72],
    [b.long * 0.8, b.tall * 1.24, b.wide * 0.44]);
  return finishMonolith(parts, b, b.tall * 1.32, { head, centre_torso: [b.long * 0.56, -b.tall * 0.3, 0],
    left_arm: left, right_arm: right, left_torso: leftTorso, right_torso: rightTorso });
};

/** Two huge side vaults and a pendant keel create the broad support silhouette. */
export const pallvaultMonolithPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  monolithLegs(parts, b, 1.06, 1.24);
  parts.push(
    part('centre_torso', 'box', [-b.long * 0.1, -b.tall * 0.08, 0], [b.long * 0.91, b.tall * 0.84, b.wide * 0.82], 'deep'),
    monolithPlate('centre_torso', [b.long * 0.02, b.tall * 0.41, 0],
      [b.long * 1.2, b.tall * 0.52, b.wide * 1.07], 'plate', MONOLITH_CAP),
    monolithPlate('centre_torso', [b.long * 0.3, -b.tall * 0.25, 0],
      [b.long * 0.53, b.tall * 1.16, b.wide * 0.6]),
  );
  const head = monolithHead(parts, b.long * 0.59, b.tall * 0.1, b.tall * 0.43, b.wide * 0.24);
  const left = monolithArm(parts, b, -1, b.tall * 0.07, b.tall * 1.19, b.shoulder * 1.35, 0.47);
  const right = monolithArm(parts, b, 1, b.tall * 0.07, b.tall * 1.19, b.shoulder * 1.35, 0.47);
  const leftTorso = monolithShoulder(parts, -1, [-b.long * 0.07, b.tall * 0.39, -b.wide * 0.87],
    [b.long * 1.13, b.tall * 0.87, b.wide * 0.68]);
  const rightTorso = monolithShoulder(parts, 1, [-b.long * 0.07, b.tall * 0.39, b.wide * 0.87],
    [b.long * 1.13, b.tall * 0.87, b.wide * 0.68]);
  return finishMonolith(parts, b, b.tall * 0.87, { head, centre_torso: [b.long * 0.58, -b.tall * 0.3, 0],
    left_arm: left, right_arm: right, left_torso: leftTorso, right_torso: rightTorso });
};
