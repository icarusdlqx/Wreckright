import type { SimEvent } from '../sim/events';
import type { Projectile, World } from '../sim/types';
import { missCueAngle, missCueDistance } from './battleEventPresentation';
import { weaponFiringPresentation } from './weaponFiringPresentation';

type Fired = Extract<SimEvent, { type: 'weapon_fired' }>;

export interface ShotRoundOutcome {
  readonly hit: boolean;
  /** Ground offset from the target where a missed round ends, in world metres. */
  readonly missX: number;
  readonly missY: number;
}

export interface ShotOutcome {
  readonly rounds: readonly ShotRoundOutcome[];
}

interface SettledVolley {
  readonly hits: boolean[];
  cursor: number;
}

const HIT: ShotRoundOutcome = Object.freeze({ hit: true, missX: 0, missY: 0 });

function engagementKey(event: { shooterId: number; targetId: number; weaponId: string }): string {
  return `${event.shooterId}:${event.targetId}:${event.weaponId}`;
}

function missedRound(tick: number, targetId: number, weaponId: string): ShotRoundOutcome {
  const cue = { tick, targetId, weaponId };
  const angle = missCueAngle(cue);
  const distance = missCueDistance(cue);
  return { hit: false, missX: Math.cos(angle) * distance, missY: Math.sin(angle) * distance };
}

/**
 * The simulation decides at launch whether each round lands. Reading that
 * decision lets a miss fly at the dirt from the start instead of at the hull
 * and then jumping sideways when its miss event arrives.
 *
 * Travelling rounds are still in the world's projectile list when their
 * firing event is presented; each is claimed once so a later volley of the
 * same gun at the same target never inherits an earlier round. Instant weapons
 * resolve inside the firing tick, so their outcome is read off the hit and
 * miss events delivered in the same batch.
 */
export class ShotOutcomeIndex {
  private readonly claimed = new WeakSet<Projectile>();
  private readonly settled = new Map<string, SettledVolley>();

  begin(events: readonly SimEvent[]): void {
    this.settled.clear();
    for (const event of events) {
      if (event.type !== 'projectile_hit' && event.type !== 'projectile_miss') continue;
      const key = `${engagementKey(event)}@${event.tick}`;
      const volley = this.settled.get(key);
      if (volley === undefined) this.settled.set(key, { hits: [event.type === 'projectile_hit'], cursor: 0 });
      else volley.hits.push(event.type === 'projectile_hit');
    }
  }

  take(world: World, event: Fired): ShotOutcome | null {
    const weapon = world.catalog.weapons.get(event.weaponId);
    if (weapon === undefined) return null;
    const rounds = weaponFiringPresentation(weapon, event.modeId).projectiles;
    if (weapon.velocity === null) return this.takeSettled(event, rounds);

    const outcome: ShotRoundOutcome[] = [];
    for (const projectile of world.projectiles) {
      if (outcome.length >= rounds) break;
      if (
        projectile.shooterId !== event.shooterId ||
        projectile.targetId !== event.targetId ||
        projectile.weaponId !== event.weaponId ||
        projectile.impactTick < event.tick ||
        this.claimed.has(projectile)
      ) continue;
      this.claimed.add(projectile);
      outcome.push(
        projectile.hit
          ? HIT
          : missedRound(projectile.impactTick, projectile.targetId, projectile.weaponId),
      );
    }
    return outcome.length === 0 ? null : { rounds: outcome };
  }

  private takeSettled(event: Fired, rounds: number): ShotOutcome | null {
    const volley = this.settled.get(`${engagementKey(event)}@${event.tick}`);
    if (volley === undefined || volley.cursor >= volley.hits.length) return null;
    const outcome: ShotRoundOutcome[] = [];
    while (outcome.length < rounds && volley.cursor < volley.hits.length) {
      const hit = volley.hits[volley.cursor] === true;
      volley.cursor += 1;
      outcome.push(hit ? HIT : missedRound(event.tick, event.targetId, event.weaponId));
    }
    return { rounds: outcome };
  }
}
