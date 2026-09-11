import { part } from './parts';
import { finishMonolith, MONOLITH_CAP, monolithArm, monolithHead, monolithLegs, monolithPlate, monolithShoulder } from './plans-monolith-parts';
import type { BlueprintPart, Plan } from './types';

/** The mobile relay sits below one broad, continuous shoulder roof. */
export const wardenMonolithPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  monolithLegs(parts, b, 0.75, 1.04);
  parts.push(
    monolithPlate('centre_torso', [-b.long * 0.1, -b.tall * 0.12, 0],
      [b.long * 0.75, b.tall * 0.91, b.wide * 0.8], 'deep'),
    monolithPlate('centre_torso', [-b.long * 0.02, b.tall * 0.29, 0],
      [b.long * 1.13, b.tall * 0.48, b.wide * 1.14], 'plate', MONOLITH_CAP),
    monolithPlate('centre_torso', [b.long * 0.26, -b.tall * 0.24, 0],
      [b.long * 0.41, b.tall * 0.67, b.wide * 0.57]),
  );
  const head = monolithHead(parts, b.long * 0.54, b.tall * 0.1, b.tall * 0.34, b.wide * 0.26);
  const left = monolithArm(parts, b, -1, b.tall * 0.08, b.tall * 1.12, b.shoulder * 1.13, 0.32);
  const right = monolithArm(parts, b, 1, b.tall * 0.08, b.tall * 1.12, b.shoulder * 1.13, 0.32);
  const leftTorso = monolithShoulder(parts, -1, [-b.long * 0.08, b.tall * 0.32, -b.wide * 0.79],
    [b.long * 0.95, b.tall * 0.58, b.wide * 0.54]);
  const rightTorso = monolithShoulder(parts, 1, [-b.long * 0.08, b.tall * 0.32, b.wide * 0.79],
    [b.long * 0.95, b.tall * 0.58, b.wide * 0.54]);
  return finishMonolith(parts, b, b.tall * 0.65, { head, centre_torso: [b.long * 0.5, -b.tall * 0.26, 0],
    left_arm: left, right_arm: right, left_torso: leftTorso, right_torso: rightTorso });
};

/** High outside pylons bracket a low central optical slit on the fast heavy. */
export const halberdMonolithPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  monolithLegs(parts, b, 0.8, 1.07);
  parts.push(
    part('centre_torso', 'box', [-b.long * 0.13, -b.tall * 0.05, 0], [b.long * 0.75, b.tall * 0.84, b.wide * 0.7], 'deep'),
    monolithPlate('centre_torso', [b.long * 0.13, b.tall * 0.1, 0],
      [b.long * 0.94, b.tall * 0.72, b.wide * 0.94], 'plate', MONOLITH_CAP),
  );
  const head = monolithHead(parts, b.long * 0.57, b.tall * 0.13, b.tall * 0.35, b.wide * 0.23);
  const left = monolithArm(parts, b, -1, b.tall * 0.22, b.tall * 1.44, b.shoulder * 1.15, 0.37);
  const right = monolithArm(parts, b, 1, b.tall * 0.22, b.tall * 1.44, b.shoulder * 1.15, 0.37);
  const leftTorso = monolithShoulder(parts, -1, [-b.long * 0.14, b.tall * 0.72, -b.wide * 0.75],
    [b.long * 0.94, b.tall * 1.54, b.wide * 0.5]);
  const rightTorso = monolithShoulder(parts, 1, [-b.long * 0.14, b.tall * 0.72, b.wide * 0.75],
    [b.long * 0.94, b.tall * 1.54, b.wide * 0.5]);
  return finishMonolith(parts, b, b.tall * 1.55, { head, centre_torso: [b.long * 0.58, -b.tall * 0.2, 0],
    left_arm: left, right_arm: right, left_torso: leftTorso, right_torso: rightTorso });
};
