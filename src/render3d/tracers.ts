import { Group, Vector3 } from 'three';
import type { Weapon } from '../schema/weapon';
import type { Vec2 } from '../sim/types';
import { disposeObjectResources } from './sceneResources';
import { ShotBurstPool, type ShotBurstFamily, type ShotBurstKind } from './shotBurstPool';
import type { ShotOutcome } from './shotOutcomes';
import {
  InstantShotPool,
  ProjectileShotPool,
  type ProjectileEndpointResolver,
  type ProjectileEngagement,
  type TrailEmitter,
} from './shotPools';
import type { ShotPoolSnapshot } from './shotPoolCore';
import { SmokeShotPool } from './smokeShotPool';

export type { ShotBurstFamily, ShotBurstKind };

export type TracerPoolFamily =
  | 'beam'
  | 'pulse'
  | 'bolt'
  | 'charge'
  | 'flame'
  | 'shell'
  | 'slug'
  | 'missile'
  | 'burst'
  | 'smoke';

export interface TracerPoolStats {
  readonly capacity: number;
  readonly active: number;
  readonly families: Readonly<Record<TracerPoolFamily, ShotPoolSnapshot>>;
}

const IMPACT_HEIGHT = 14;
const DEFAULT_PROJECTILE_SPEED = 620;
const BEAM_LIFE = 0.22;
const FLASH_LIFE = 0.3;
const MISSILE_ROUNDS = 24;
const CANISTER_ROUNDS = 12;
const TRAIL_INTERVAL = 0.12;

const CAPACITY = Object.freeze({
  beam: 20,
  pulse: 12,
  bolt: 12,
  charge: 16,
  flame: 12,
  shell: 64,
  slug: 48,
  missile: 128,
  burst: 128,
  smoke: 72,
});

/** Authored style survives the catalogue while all hot-path storage stays fixed. */
export class TracerLayer {
  readonly group = new Group();
  private readonly beam = new InstantShotPool('beam', CAPACITY.beam, 1);
  private readonly pulse = new InstantShotPool('pulse', CAPACITY.pulse, 5);
  private readonly bolt = new InstantShotPool('bolt', CAPACITY.bolt, 9);
  private readonly charge = new ProjectileShotPool('charge', 'bolt', CAPACITY.charge);
  private readonly flame = new InstantShotPool('flame', CAPACITY.flame, 8);
  private readonly shell = new ProjectileShotPool('shell', 'tracer', CAPACITY.shell);
  private readonly slug = new ProjectileShotPool('slug', 'slug', CAPACITY.slug);
  private readonly missile = new ProjectileShotPool('missile', 'missile', CAPACITY.missile);
  private readonly bursts = new ShotBurstPool(CAPACITY.burst);
  private readonly smoke = new SmokeShotPool(CAPACITY.smoke);
  private readonly missPoint = new Vector3();
  private lowFx = false;
  private reducedMotion = false;
  private disposed = false;
  private readonly missileTrail: TrailEmitter = {
    interval: TRAIL_INTERVAL,
    emit: (x, y, z, width) => {
      // Additive smoke reads by brightness, so a dim grey keeps the ribbon faint.
      this.smoke.spawnAt(x, y, z, this.lifeScale(), {
        scale: 0.06 + width * 0.02,
        life: 0.45,
        rise: 1.5,
        grow: 1.8,
        colour: 0x3a3f44,
      });
    },
  };

  constructor() {
    this.group.add(
      this.bursts.mesh,
      this.beam.mesh,
      this.pulse.mesh,
      this.bolt.mesh,
      this.charge.mesh,
      this.flame.mesh,
      this.shell.mesh,
      this.slug.mesh,
      this.missile.mesh,
      this.smoke.mesh,
    );
  }

  setPresentationMode(lowFx: boolean, reducedMotion: boolean): void {
    if (this.disposed) return;
    this.lowFx = lowFx;
    this.reducedMotion = reducedMotion;
  }

  fire(
    from: Vector3,
    to: Vec2,
    visual: Weapon['visual'],
    projectiles: number,
    velocity: number | null,
    colour: number,
    heightAt: (x: number, y: number) => number,
    engagement: ProjectileEngagement | null = null,
    flightSeconds: number | null = null,
    visibleFlightSeconds: number | null = null,
    outcome: ShotOutcome | null = null,
  ): void {
    if (this.disposed) return;
    const endY = heightAt(to.x, to.y) + IMPACT_HEIGHT;
    const lifeScale = this.lifeScale();
    const detailScale = this.detailScale();
    const delayed = flightSeconds !== null && visibleFlightSeconds !== null &&
      visibleFlightSeconds < flightSeconds;
    if (!delayed && !this.lowFx && !this.reducedMotion) {
      this.bursts.muzzle(
        from,
        colour,
        Math.max(0.55, visual.width * 0.34),
        lifeScale,
        detailScale,
      );
    }

    if (visual.style === 'beam' || visual.style === 'pulse' || visual.style === 'bolt' || visual.style === 'flame') {
      // An instant weapon carries one round; a known miss ends it in the ground beside the target.
      const end = this.missPoint.set(to.x, endY, to.y);
      const first = outcome?.rounds[0];
      if (first !== undefined && !first.hit) {
        end.x += first.missX;
        end.z += first.missY;
        end.y = heightAt(end.x, end.z);
      }
      if (visual.style === 'beam') {
        this.beam.spawn(from, end.x, end.y, end.z, colour, visual.width, BEAM_LIFE * lifeScale, 1);
      } else if (visual.style === 'pulse') {
        this.pulse.spawn(
          from, end.x, end.y, end.z, colour, visual.width,
          BEAM_LIFE * 1.35 * lifeScale, detailScale,
        );
      } else if (visual.style === 'bolt' && visual.speed !== undefined) {
        this.charge.spawn(from, end.x, end.y, end.z, {
          arc: 0, velocity: visual.speed, width: visual.width * 0.6, colour,
        });
      } else if (visual.style === 'bolt') {
        this.bolt.spawn(
          from, end.x, end.y, end.z, colour, visual.width,
          BEAM_LIFE * 1.15 * lifeScale, detailScale,
        );
      } else {
        this.flame.spawn(
          from, end.x, end.y, end.z, colour, visual.width,
          FLASH_LIFE * lifeScale, detailScale,
        );
      }
      return;
    }

    const authoredRounds = roundCount(visual.style, projectiles);
    const shownRounds = this.lowFx
      ? 1
      : this.reducedMotion
        ? Math.min(2, authoredRounds)
        : authoredRounds;
    const pool = visual.style === 'missile'
      ? this.missile
      : visual.style === 'slug'
        ? this.slug
        : this.shell;
    const trails = visual.style === 'missile' && !this.lowFx && !this.reducedMotion;
    for (let shot = 0; shot < shownRounds; shot += 1) {
      const spread = shownRounds === 1 ? 0 : (shot / (shownRounds - 1) - 0.5) * 18;
      const lateralSpread = spread * (shot % 2 === 0 ? 0.6 : -0.6);
      const arc = visual.arc + (visual.style === 'missile' ? shot * Math.min(4, visual.width) : 0);
      const round = outcome?.rounds[shot];
      const missed = round !== undefined && !round.hit;
      // A miss keeps a little of its salvo spread so a volley does not stack on one point.
      const offsetX = missed ? round.missX + spread * 0.35 : spread;
      const offsetZ = missed ? round.missY + lateralSpread * 0.35 : lateralSpread;
      const offsetY = missed
        ? heightAt(to.x + offsetX, to.y + offsetZ) - endY
        : 0;
      pool.spawn(from, to.x + offsetX, endY + offsetY, to.y + offsetZ, {
        arc,
        velocity: velocity ?? DEFAULT_PROJECTILE_SPEED,
        width: visual.width,
        colour,
        engagement,
        targetOffsetX: offsetX,
        targetOffsetY: offsetY,
        targetOffsetZ: offsetZ,
        flightSeconds,
        visibleFlightSeconds,
        missed,
        trail: trails && shot % 3 === 0,
      });
    }
  }

  impact(at: Vec2, ground: number, colour: number): void {
    this.burst(at, ground, 'hit', colour, 1);
  }

  burst(
    at: Vec2,
    ground: number,
    kind: ShotBurstKind,
    colour: number,
    scale = 1,
    family: ShotBurstFamily = 'generic',
    delay = 0,
  ): void {
    if (this.disposed) return;
    const lifeScale = this.lifeScale();
    this.bursts.spawn(at, ground, kind, colour, scale, lifeScale, this.detailScale(), family, delay);
    if (this.lowFx || kind !== 'hit') return;
    // Burning families leave something hanging in the air after the flash.
    if (family === 'missile') {
      this.smoke.spawn(at, ground, lifeScale, { scale: 0.32 * scale, life: 0.9, rise: 6, grow: 2 });
    } else if (family === 'flame') {
      this.smoke.spawn(at, ground, lifeScale, { scale: 0.42 * scale, life: 1.3, rise: 9, grow: 2.4, colour: 0x4a4a4c });
    }
  }

  spawnSmoke(at: Vec2, ground: number, scale = 1): void {
    if (this.disposed) return;
    this.smoke.spawn(at, ground, this.lifeScale(), { scale });
  }

  update(deltaSeconds: number, endpointOf?: ProjectileEndpointResolver): void {
    if (this.disposed) return;
    this.beam.update(deltaSeconds);
    this.pulse.update(deltaSeconds);
    this.bolt.update(deltaSeconds);
    this.charge.update(deltaSeconds);
    this.flame.update(deltaSeconds);
    this.shell.update(deltaSeconds, endpointOf);
    this.slug.update(deltaSeconds, endpointOf);
    this.missile.update(deltaSeconds, endpointOf, this.missileTrail);
    this.bursts.update(deltaSeconds);
    this.smoke.update(deltaSeconds);
  }

  resolveProjectile(engagement: ProjectileEngagement, endpoint: Vector3, missed = false): boolean {
    if (this.disposed) return false;
    return this.shell.resolve(engagement, endpoint, missed)
      || this.slug.resolve(engagement, endpoint, missed)
      || this.missile.resolve(engagement, endpoint, missed);
  }

  resolveOutstanding(targetId: number | null, endpoint?: Vector3): number {
    if (this.disposed) return 0;
    return this.shell.resolveOutstanding(targetId, endpoint)
      + this.slug.resolveOutstanding(targetId, endpoint)
      + this.missile.resolveOutstanding(targetId, endpoint);
  }

  stats(): TracerPoolStats {
    const families = {
      beam: this.beam.snapshot(),
      pulse: this.pulse.snapshot(),
      bolt: this.bolt.snapshot(),
      charge: this.charge.snapshot(),
      flame: this.flame.snapshot(),
      shell: this.shell.snapshot(),
      slug: this.slug.snapshot(),
      missile: this.missile.snapshot(),
      burst: this.bursts.snapshot(),
      smoke: this.smoke.snapshot(),
    };
    let capacity = 0;
    let active = 0;
    for (const family of Object.values(families)) {
      capacity += family.capacity;
      active += family.active;
    }
    return { capacity, active, families };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.beam.clear();
    this.pulse.clear();
    this.bolt.clear();
    this.charge.clear();
    this.flame.clear();
    this.shell.clear();
    this.slug.clear();
    this.missile.clear();
    this.bursts.clear();
    this.smoke.clear();
    disposeObjectResources(this.group);
    this.group.clear();
  }

  private detailScale(): number {
    if (this.lowFx) return 0.34;
    if (this.reducedMotion) return 0.55;
    return 1;
  }

  private lifeScale(): number {
    if (this.lowFx) return 0.6;
    if (this.reducedMotion) return 0.75;
    return 1;
  }
}

/** A salvo draws every tube it carries; canister rounds stay a readable handful. */
function roundCount(style: Weapon['visual']['style'], projectiles: number): number {
  if (style === 'missile') return Math.max(1, Math.min(MISSILE_ROUNDS, projectiles));
  if (style === 'burst') return Math.max(1, Math.min(CANISTER_ROUNDS, projectiles));
  if (style === 'tracer' && projectiles > 1) return Math.min(CANISTER_ROUNDS, projectiles);
  return 1;
}
