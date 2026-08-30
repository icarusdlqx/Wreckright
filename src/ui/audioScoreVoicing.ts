import { canPresentEntity } from '../render3d/visibilityPresentation';
import type { Faction } from '../schema/faction';
import { isOperational, type World } from '../sim/types';

export interface ScoreVoicing {
  readonly rootHz: number;
  readonly fifthHz: number;
  readonly pulseHz: number;
  readonly fullHz: number;
  readonly droneCutoffHz: number;
  readonly droneQ: number;
  readonly pulseCutoffHz: number;
  readonly pulseQ: number;
  readonly fullCutoffHz: number;
  readonly fullQ: number;
  readonly rootLevel: number;
  readonly fifthLevel: number;
  readonly pulseLevel: number;
}

/** Harmonic endpoints. Oscillator shapes stay fixed while these values morph. */
export const SCORE_CULTURE_VOICINGS: Readonly<Record<Faction, ScoreVoicing>> = {
  linewrought: {
    rootHz: 43.65,
    fifthHz: 65.41,
    pulseHz: 87.31,
    fullHz: 103.83,
    droneCutoffHz: 190,
    droneQ: 0.7,
    pulseCutoffHz: 520,
    pulseQ: 0.9,
    fullCutoffHz: 420,
    fullQ: 0.85,
    rootLevel: 0.56,
    fifthLevel: 0.22,
    pulseLevel: 0.34,
  },
  aurelian: {
    rootHz: 46.25,
    fifthHz: 69.3,
    pulseHz: 103.83,
    fullHz: 130.81,
    droneCutoffHz: 260,
    droneQ: 1.4,
    pulseCutoffHz: 880,
    pulseQ: 2.1,
    fullCutoffHz: 1400,
    fullQ: 2.8,
    rootLevel: 0.46,
    fifthLevel: 0.3,
    pulseLevel: 0.28,
  },
};

/**
 * Equal-weight culture share for machines whose exact identities the player
 * can currently know. Sensor returns never disclose a hostile chassis.
 */
export function battleCultureShare(world: World): number | null {
  let aurelian = 0;
  let linewrought = 0;

  for (const entity of world.entities) {
    if (!isOperational(entity) || !canPresentEntity(world, entity.id)) continue;
    const faction = world.catalog.chassis.get(entity.chassisId)?.faction;
    if (faction === 'aurelian') aurelian += 1;
    if (faction === 'linewrought') linewrought += 1;
  }

  const eligible = aurelian + linewrought;
  return eligible === 0 ? null : aurelian / eligible;
}

/** Culture-continuous voice: musical ratios in log space, levels and Q linearly. */
export function scoreVoicingAt(aurelianShare: number): ScoreVoicing {
  const share = clampShare(aurelianShare);
  const linewrought = SCORE_CULTURE_VOICINGS.linewrought;
  const aurelian = SCORE_CULTURE_VOICINGS.aurelian;
  if (share === 0) return linewrought;
  if (share === 1) return aurelian;

  return {
    rootHz: geometricMix(linewrought.rootHz, aurelian.rootHz, share),
    fifthHz: geometricMix(linewrought.fifthHz, aurelian.fifthHz, share),
    pulseHz: geometricMix(linewrought.pulseHz, aurelian.pulseHz, share),
    fullHz: geometricMix(linewrought.fullHz, aurelian.fullHz, share),
    droneCutoffHz: geometricMix(
      linewrought.droneCutoffHz,
      aurelian.droneCutoffHz,
      share,
    ),
    droneQ: linearMix(linewrought.droneQ, aurelian.droneQ, share),
    pulseCutoffHz: geometricMix(
      linewrought.pulseCutoffHz,
      aurelian.pulseCutoffHz,
      share,
    ),
    pulseQ: linearMix(linewrought.pulseQ, aurelian.pulseQ, share),
    fullCutoffHz: geometricMix(linewrought.fullCutoffHz, aurelian.fullCutoffHz, share),
    fullQ: linearMix(linewrought.fullQ, aurelian.fullQ, share),
    rootLevel: linearMix(linewrought.rootLevel, aurelian.rootLevel, share),
    fifthLevel: linearMix(linewrought.fifthLevel, aurelian.fifthLevel, share),
    pulseLevel: linearMix(linewrought.pulseLevel, aurelian.pulseLevel, share),
  };
}

function clampShare(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function geometricMix(from: number, to: number, share: number): number {
  return from * (to / from) ** share;
}

function linearMix(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}
