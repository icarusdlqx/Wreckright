import type { Weapon } from '../schema/weapon';

export type ShotBurstKind = 'hit' | 'miss' | 'critical' | 'ammo' | 'terminal' | 'shell';
export type InternalBurstKind = ShotBurstKind | 'muzzle';

/** The impact language a weapon speaks; every authored style maps onto one. */
export type ShotBurstFamily = 'energy' | 'arc' | 'flame' | 'kinetic' | 'missile' | 'generic';

export interface BurstProfile {
  life: number;
  particles: number;
  size: number;
  grow: number;
  rise: number;
  spread: number;
  opacity: number;
  /** Size of one central glow sphere relative to the sparks; zero draws none. */
  core: number;
  /** How hard the sparks drop back toward the ground over the burst's life. */
  fall: number;
}

export function burstFamilyOf(style: Weapon['visual']['style'] | undefined): ShotBurstFamily {
  switch (style) {
    case 'beam':
    case 'pulse':
      return 'energy';
    case 'bolt':
      return 'arc';
    case 'flame':
      return 'flame';
    case 'tracer':
    case 'slug':
    case 'burst':
      return 'kinetic';
    case 'missile':
      return 'missile';
    default:
      return 'generic';
  }
}

const GENERIC: Readonly<Record<InternalBurstKind, BurstProfile>> = Object.freeze({
  muzzle: {
    life: 0.15, particles: 1, size: 1, grow: 1.8, rise: 0, spread: 0, opacity: 0.85, core: 0, fall: 0,
  },
  hit: {
    life: 0.3, particles: 3, size: 0.9, grow: 2.6, rise: 4, spread: 2.4, opacity: 0.9, core: 0, fall: 0,
  },
  miss: {
    life: 0.4, particles: 3, size: 0.65, grow: 1.8, rise: 7, spread: 3.2, opacity: 0.7, core: 0, fall: 0,
  },
  critical: {
    life: 0.62, particles: 6, size: 1.05, grow: 2.8, rise: 9, spread: 5.2, opacity: 1, core: 0, fall: 0,
  },
  ammo: {
    life: 0.55, particles: 5, size: 0.8, grow: 2.5, rise: 8, spread: 5, opacity: 0.95, core: 0, fall: 0,
  },
  terminal: {
    life: 1.1, particles: 8, size: 1.35, grow: 3.6, rise: 13, spread: 10, opacity: 1, core: 0, fall: 0,
  },
  // An artillery shell throws a column of earth and a short fireball at its base.
  shell: {
    life: 1.1, particles: 7, size: 2.1, grow: 1.6, rise: 26, spread: 12, opacity: 1, core: 1.7, fall: 9,
  },
});

/**
 * A laser splashes, a PPC crackles, a flamer licks, a shell spalls and a missile
 * pops. Each family keeps the hit read short; damage scales it afterwards.
 */
const HIT: Readonly<Record<ShotBurstFamily, BurstProfile>> = Object.freeze({
  energy: {
    life: 0.24, particles: 2, size: 0.7, grow: 1.4, rise: 2, spread: 1.6, opacity: 0.95, core: 2, fall: 0,
  },
  arc: {
    life: 0.34, particles: 6, size: 0.55, grow: 1.2, rise: 5, spread: 4.6, opacity: 1, core: 1.9, fall: 0,
  },
  flame: {
    life: 0.5, particles: 5, size: 1.1, grow: 3.4, rise: 9, spread: 2.2, opacity: 0.75, core: 0, fall: 0,
  },
  kinetic: {
    life: 0.36, particles: 7, size: 0.45, grow: 0.6, rise: 8, spread: 5.4, opacity: 0.95, core: 1.3, fall: 14,
  },
  missile: {
    life: 0.42, particles: 4, size: 0.85, grow: 2.2, rise: 6, spread: 3.6, opacity: 0.9, core: 1.8, fall: 3,
  },
  generic: GENERIC.hit,
});

/** A miss is the same language spoken quietly: fewer sparks, into the dirt. */
const MISS: Readonly<Record<ShotBurstFamily, BurstProfile>> = Object.freeze({
  energy: {
    life: 0.3, particles: 1, size: 0.55, grow: 1.6, rise: 3, spread: 1.2, opacity: 0.7, core: 1.6, fall: 0,
  },
  arc: {
    life: 0.36, particles: 4, size: 0.42, grow: 1, rise: 5, spread: 4, opacity: 0.85, core: 1.2, fall: 0,
  },
  flame: {
    life: 0.42, particles: 3, size: 0.9, grow: 2.6, rise: 7, spread: 2, opacity: 0.6, core: 0, fall: 0,
  },
  kinetic: {
    life: 0.44, particles: 4, size: 0.5, grow: 1.4, rise: 9, spread: 3.4, opacity: 0.7, core: 0, fall: 10,
  },
  missile: {
    life: 0.46, particles: 3, size: 0.75, grow: 2.2, rise: 8, spread: 3.2, opacity: 0.8, core: 1.8, fall: 4,
  },
  generic: GENERIC.miss,
});

export function burstProfile(kind: InternalBurstKind, family: ShotBurstFamily): BurstProfile {
  if (kind === 'hit') return HIT[family];
  if (kind === 'miss') return MISS[family];
  return GENERIC[kind];
}
