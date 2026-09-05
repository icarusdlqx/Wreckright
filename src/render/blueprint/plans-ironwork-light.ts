import { part } from './parts';
import { finishIron, ironArm, ironCab, ironLegs, ironPlate, ironShoulder } from './plans-ironwork-parts';
import type { BlueprintPart, Plan } from './types';

/** An open lifting frame makes the spotter recognizable even without weapons. */
export const gadflyIronworkPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  ironLegs(parts, b, 0.72, 0.96);
  parts.push(
    ironPlate('centre_torso', [-b.long * 0.06, -b.tall * 0.16, 0], [b.long * 0.82, b.tall * 0.56, b.wide * 0.84]),
    part('centre_torso', 'box', [-b.long * 0.1, b.tall * 0.02, 0], [b.long * 0.46, b.tall * 0.62, b.wide * 0.7], 'deep'),
  );
  const braceLength = b.tall * 1.24;
  const braceTilt = 0.38;
  const braceX = -b.long * 0.22;
  const braceY = b.tall * 0.6;
  for (const side of [-1, 1]) {
    parts.push(part('centre_torso', 'limb', [braceX, braceY, side * b.wide * 0.27],
      [0.085, braceLength, 0.085], 'accent', braceTilt));
  }
  const beamX = braceX - Math.sin(braceTilt) * braceLength / 2;
  const beamY = braceY + Math.cos(braceTilt) * braceLength / 2;
  parts.push(part('centre_torso', 'box', [beamX, beamY, 0], [0.14, 0.12, b.wide * 0.68], 'deep'));
  ironCab(parts, b, b.long * 0.56, b.tall * 0.12, 0.8, b.tall * 0.48, b.wide * 0.7);
  const left = ironArm(parts, b, -1, b.tall * 0.04, b.tall * 0.9, b.shoulder * 1.12, 0.17);
  const right = ironArm(parts, b, 1, b.tall * 0.04, b.tall * 0.9, b.shoulder * 1.12, 0.17);
  const leftTorso = ironShoulder(parts, 'left_torso', [-b.long * 0.18, b.tall * 0.14, -b.wide * 0.68],
    [b.long * 0.55, b.tall * 0.48, b.wide * 0.4]);
  const rightTorso = ironShoulder(parts, 'right_torso', [-b.long * 0.1, b.tall * 0.12, b.wide * 0.68],
    [b.long * 0.42, b.tall * 0.42, b.wide * 0.34], 'accent');
  return finishIron(parts, b, beamY + 0.06, { left_arm: left, right_arm: right,
    left_torso: leftTorso, right_torso: rightTorso, centre_torso: [b.long * 0.48, -b.tall * 0.16, 0],
    head: [b.long * 0.96, b.tall * 0.25, 0] });
};

/** The lightest shop frame is a compact upright cabin on bare running gear. */
export const prybarIronworkPlan: Plan = (b) => {
  const parts: BlueprintPart[] = [];
  ironLegs(parts, b, 0.56, 0.86);
  parts.push(
    part('centre_torso', 'box', [-b.long * 0.08, -b.tall * 0.12, 0], [b.long * 0.48, b.tall * 0.7, b.wide * 0.66], 'deep'),
    ironPlate('centre_torso', [b.long * 0.19, -b.tall * 0.22, 0], [b.long * 0.38, b.tall * 0.35, b.wide * 0.86], 'accent'),
    part('centre_torso', 'limb', [-b.long * 0.24, b.tall * 0.66, 0], [0.1, b.tall * 0.94, 0.1], 'deep'),
  );
  ironCab(parts, b, b.long * 0.26, b.tall * 0.4, b.long * 0.8, b.tall * 0.64, b.wide * 0.88);
  const left = ironArm(parts, b, -1, 0, b.tall * 1.05, b.shoulder * 1.22, 0.14);
  const right = ironArm(parts, b, 1, 0, b.tall * 1.05, b.shoulder * 1.22, 0.14);
  const leftTorso = ironShoulder(parts, 'left_torso', [-b.long * 0.12, 0, -b.wide * 0.6],
    [b.long * 0.46, b.tall * 0.4, b.wide * 0.3]);
  const rightTorso = ironShoulder(parts, 'right_torso', [-b.long * 0.22, b.tall * 0.2, b.wide * 0.6],
    [b.long * 0.48, b.tall * 0.64, b.wide * 0.32], 'accent');
  return finishIron(parts, b, b.tall * 1.16, { left_arm: left, right_arm: right,
    left_torso: leftTorso, right_torso: rightTorso, centre_torso: [b.long * 0.38, -b.tall * 0.24, 0],
    head: [b.long * 0.66, b.tall * 0.68, 0] });
};
