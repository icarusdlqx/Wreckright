import { Color, Scene, Vector3 } from 'three';
import type { Weapon } from '../schema/weapon';
import type { MechLocation } from '../schema/common';
import type { SimEvent } from '../sim/events';
import { findEntity, type EntityId, type Vec2, type World } from '../sim/types';
import type { TacticalCamera, Viewport } from './camera';
import { CombatReadouts } from './combatReadouts';
import { JetLayer, ScarLayer, SmokeLayer } from './effects';
import { measureReadoutLayout } from './readoutSafeArea';
import { TracerLayer, type ShotBurstKind } from './tracers';
import { MechanicalDischargeLayer } from './mechanicalEffects';
import { MuzzleFlashPool } from './muzzleFlashPool';
import {
  canPresentIncomingCue,
  canPresentWeaponFlight,
  incomingCueFlightSeconds,
  incomingCueOrigin,
  missCueAngle,
  missCueDistance,
  projectileFlightSeconds,
  weaponEventColour,
} from './battleEventPresentation';
import { canPresentEntity } from './visibilityPresentation';

type DestructiveEvent = Extract<SimEvent, { type: 'mech_destroyed' | 'ammo_explosion' }>;

function destructiveLocation(event: DestructiveEvent): MechLocation {
  return event.type === 'ammo_explosion'
    ? event.location
    : event.method === 'head' ? 'head' : 'centre_torso';
}

export interface BattleFeedbackBindings {
  anchorOf: (id: EntityId, location: MechLocation, out: Vector3) => boolean;
  canLocate?: (id: EntityId) => boolean;
  currentPositionOf?: (id: EntityId) => Vec2 | null;
  readouts?: {
    host: HTMLElement;
    world: World;
    viewport: () => Viewport;
  };
}

const DEFAULT_SHOT: Weapon['visual'] = {
  style: 'beam',
  colour: '#ffffff',
  width: 2,
  arc: 0,
};

const CRITICAL_COLOUR = 0xffd07a;
const AMMO_COLOUR = 0xffa34f;
const TERMINAL_COLOUR = 0xff6b38;
const FLASH_CAPACITY = 10;

/** Combat effects and camera recoil share one clock and one fixed budget. */
export class BattleEffects {
  private readonly tracers = new TracerLayer();
  private readonly jets = new JetLayer();
  private readonly smoke: SmokeLayer;
  private readonly scars = new ScarLayer();
  private readonly mechanical = new MechanicalDischargeLayer();
  private readonly flashes: MuzzleFlashPool;
  private shakeAmplitude = 0;
  private shakeTime = 0;
  private elapsed = 0;
  private readonly muzzle = new Vector3();
  private readonly breech = new Vector3();
  private readonly effectPoint = new Vector3();
  private readonly effectAt: Vec2 = { x: 0, y: 0 };
  private readonly anchorOf: BattleFeedbackBindings['anchorOf'] | null;
  private readonly canLocate: BattleFeedbackBindings['canLocate'];
  private readonly currentPositionOf: (id: EntityId) => Vec2 | null;
  private readonly readouts: CombatReadouts | null;
  private lowFx = false;
  private destroyed = false;
  constructor(
    private readonly scene: Scene,
    fogColour: Color,
    private readonly camera: TacticalCamera,
    private readonly heightAt: (x: number, y: number) => number,
    private readonly positionOf: (id: EntityId) => Vec2 | null,
    private readonly muzzleOf: (
      id: EntityId,
      weaponId: string,
      out: Vector3,
      breech: Vector3,
    ) => boolean,
    feedback: BattleFeedbackBindings | null = null,
  ) {
    this.smoke = new SmokeLayer(fogColour);
    this.flashes = new MuzzleFlashPool(scene, FLASH_CAPACITY);
    this.anchorOf = feedback?.anchorOf ?? null;
    this.canLocate = feedback?.canLocate;
    this.currentPositionOf = feedback?.currentPositionOf ?? positionOf;
    const readouts = feedback?.readouts;
    this.readouts = readouts === undefined
      ? null
      : new CombatReadouts(
          readouts.host,
          readouts.world,
          camera.reducedMotion,
          (id, location, out) => this.locationOf(id, location, out),
          (at) => camera.worldToScreen(
            { x: at.x, y: at.z },
            readouts.viewport(),
            at.y,
          ),
          undefined,
          () => measureReadoutLayout(readouts.host),
        );
    scene.add(
      this.tracers.group,
      this.jets.group,
      this.smoke.mesh,
      this.scars.mesh,
      this.mechanical.casings,
      this.mechanical.vents,
    );
    this.tracers.setPresentationMode(false, camera.reducedMotion);
    this.jets.setPresentationMode(false, camera.reducedMotion);
  }
  setPresentationMode(lowFx: boolean): void {
    if (this.destroyed) return;
    this.lowFx = lowFx;
    this.tracers.setPresentationMode(lowFx, this.camera.reducedMotion);
    this.jets.setPresentationMode(lowFx, this.camera.reducedMotion);
  }
  beginFrame(deltaSeconds: number): void {
    if (this.destroyed) return;
    this.elapsed += deltaSeconds;
    this.jets.begin();
  }
  finishFrame(deltaSeconds: number): void {
    if (this.destroyed) return;
    this.shakeTime += deltaSeconds;
    this.shakeAmplitude *= Math.exp(-deltaSeconds * 7);
    if (this.shakeAmplitude < 0.02) this.shakeAmplitude = 0;
    if (this.camera.reducedMotion) {
      this.shakeAmplitude = 0;
      this.camera.shake.set(0, 0, 0);
    } else {
      const t = this.shakeTime;
      this.camera.shake.set(
        Math.sin(t * 61) * this.shakeAmplitude,
        Math.sin(t * 47 + 1.3) * this.shakeAmplitude * 0.6,
        Math.cos(t * 53 + 0.7) * this.shakeAmplitude,
      );
    }

    this.jets.commit();
    this.readouts?.advance(deltaSeconds);
  }
  advance(deltaSeconds: number): void {
    if (this.destroyed) return;
    this.flashes.advance(deltaSeconds);
    this.tracers.update(deltaSeconds, this.resolveLiveEndpoint);
    this.mechanical.update(deltaSeconds);
    this.smoke.update(deltaSeconds);
  }
  consume(world: World, events: readonly SimEvent[]): void {
    if (this.destroyed) return;
    this.readouts?.consume(world, events);
    for (const event of events) {
      if (event.type === 'mech_destroyed' || event.type === 'ammo_explosion') {
        if (!canPresentEntity(world, event.entityId)) continue;
        const location = destructiveLocation(event);
        if (this.locationOf(event.entityId, location, this.effectPoint)) {
          this.toGroundPoint(this.effectPoint);
          this.addShake(6 * this.nearness(this.effectAt));
          if (event.type === 'mech_destroyed') {
            const entity = findEntity(world, event.entityId);
            const scale = 1 + Math.min(1.2, (entity?.tonnage ?? 50) / 100);
            this.tracers.burst(
              this.effectAt,
              this.effectPoint.y - 14,
              'terminal',
              TERMINAL_COLOUR,
              scale,
            );
            this.smoke.start(this.effectAt, this.effectPoint.y - 6);
            this.scars.mark(this.effectAt, this.heightAt(this.effectAt.x, this.effectAt.y), 22, 0.55);
          } else {
            this.tracers.burst(
              this.effectAt,
              this.effectPoint.y - 14,
              'ammo',
              AMMO_COLOUR,
              0.8 + Math.min(1, event.damage / 60),
            );
            this.tracers.spawnSmoke(this.effectAt, this.effectPoint.y - 14);
          }
        }
        continue;
      }

      if (event.type === 'critical_hit' || event.type === 'location_destroyed') {
        if (!canPresentEntity(world, event.entityId)) continue;
        if (this.locationOf(event.entityId, event.location, this.effectPoint)) {
          this.toGroundPoint(this.effectPoint);
          this.emitBurst('critical', CRITICAL_COLOUR, event.type === 'location_destroyed' ? 1.5 : 1);
        }
        continue;
      }

      if (event.type === 'projectile_miss') {
        if (!canPresentEntity(world, event.targetId)) continue;
        const target = this.currentPositionOf(event.targetId);
        if (target === null) continue;
        const angle = missCueAngle(event);
        const distance = missCueDistance(event);
        this.effectAt.x = target.x + Math.cos(angle) * distance;
        this.effectAt.y = target.y + Math.sin(angle) * distance;
        const weapon = world.catalog.weapons.get(event.weaponId);
        this.effectPoint.set(
          this.effectAt.x,
          this.heightAt(this.effectAt.x, this.effectAt.y),
          this.effectAt.y,
        );
        this.tracers.resolveProjectile(event, this.effectPoint);
        this.tracers.burst(
          this.effectAt,
          this.heightAt(this.effectAt.x, this.effectAt.y) - 14,
          'miss',
          weaponEventColour(weapon),
          0.8,
        );
        continue;
      }

      if (event.type === 'jump_landed') {
        if (!canPresentEntity(world, event.entityId)) continue;
        this.addShake(1.4 * this.nearness({ x: event.x, y: event.y }));
        continue;
      }

      if (event.type !== 'weapon_fired' && event.type !== 'projectile_hit') continue;

      const weapon = world.catalog.weapons.get(event.weaponId);
      const colour = weaponEventColour(weapon);

      if (event.type === 'projectile_hit') {
        if (!canPresentEntity(world, event.targetId)) continue;
        if (this.locationOf(event.targetId, event.location, this.effectPoint)) {
          this.tracers.resolveProjectile(event, this.effectPoint);
          this.toGroundPoint(this.effectPoint);
          this.emitBurst('hit', colour, 0.75 + Math.min(1.25, event.damage / 18));
          const damage = weapon?.damage ?? 5;
          this.scars.mark(
            this.effectAt,
            this.heightAt(this.effectAt.x, this.effectAt.y),
            3 + Math.min(9, damage * 0.35),
            weapon?.type === 'energy' ? 1 : 0.25,
          );
          if (event.damage >= 14) this.addShake(1.6 * this.nearness(this.effectAt));
        }
        continue;
      }

      const target = this.positionOf(event.targetId);
      if (target === null) continue;
      if (canPresentIncomingCue(world, event)) {
        incomingCueOrigin(event, target, this.heightAt, this.muzzle);
        this.tracers.fire(
          this.muzzle, target, weapon?.visual ?? DEFAULT_SHOT,
          weapon?.projectiles ?? 1, weapon?.velocity ?? null, colour, this.heightAt,
          event,
          projectileFlightSeconds(world, event, weapon),
          incomingCueFlightSeconds(weapon),
        );
        continue;
      }
      if (!canPresentWeaponFlight(world, event)) continue;
      const shooter = this.positionOf(event.shooterId);

      this.breech.set(Number.NaN, Number.NaN, Number.NaN);
      if (!this.muzzleOf(event.shooterId, event.weaponId, this.muzzle, this.breech)) {
        if (shooter === null) continue;
        this.muzzle.set(shooter.x, this.heightAt(shooter.x, shooter.y) + 14, shooter.y);
      }
      if (!Number.isFinite(this.breech.x)) this.breech.copy(this.muzzle);

      this.tracers.fire(
        this.muzzle,
        target,
        weapon?.visual ?? DEFAULT_SHOT,
        weapon?.projectiles ?? 1,
        weapon?.velocity ?? null,
        colour,
        this.heightAt,
        event,
        projectileFlightSeconds(world, event, weapon),
      );
      if (weapon?.type === 'ballistic' && !this.camera.reducedMotion && !this.lowFx) {
        const shooterEntity = findEntity(world, event.shooterId);
        const heft = 0.5 + Math.min(1, weapon.tonnage / 14);
        this.mechanical.fire(
          this.breech,
          (shooterEntity?.facing ?? 0) + (shooterEntity?.torsoOffset ?? 0),
          heft,
          weapon.visual.style !== 'slug',
          this.heightAt(this.breech.x, this.breech.z),
        );
      }
      if (!this.lowFx) this.muzzleLight(this.muzzle, colour, weapon?.damage ?? 5);
    }

    // Impact events get first claim; retired rounds then land at a render-safe endpoint.
    for (const event of events) {
      if (event.type === 'mech_destroyed') {
        if (!canPresentEntity(world, event.entityId)) continue;
        const located = this.canLocate?.(event.entityId) === true &&
          this.locationOf(event.entityId, destructiveLocation(event), this.effectPoint);
        this.tracers.resolveOutstanding(event.entityId, located ? this.effectPoint : undefined);
      } else if (event.type === 'unit_withdrew') {
        if (canPresentEntity(world, event.entityId)) {
          this.tracers.resolveOutstanding(event.entityId);
        }
      } else if (event.type === 'battle_ended') {
        this.tracers.resolveOutstanding(null);
      }
    }
  }

  land(at: Vec2, colour: number, shake: number): void {
    if (this.destroyed) return;
    this.tracers.impact(at, this.heightAt(at.x, at.y) + 2, colour);
    this.addShake(shake * this.nearness(at));
  }

  plume(key: number, at: Vector3, throttle: number): void {
    if (this.destroyed) return;
    this.jets.plume(key, at, throttle, this.elapsed);
  }

  spawnSmoke(at: Vec2): void {
    if (this.destroyed) return;
    this.tracers.spawnSmoke(at, this.heightAt(at.x, at.y));
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.readouts?.destroy();
    this.scene.remove(
      this.tracers.group,
      this.jets.group,
      this.smoke.mesh,
      this.scars.mesh,
      this.mechanical.casings,
      this.mechanical.vents,
    );
    this.tracers.dispose();
    this.jets.dispose();
    this.smoke.dispose();
    this.scars.dispose();
    this.mechanical.dispose();
    this.flashes.destroy();
    this.camera.shake.set(0, 0, 0);
  }

  private locationOf(id: EntityId, location: MechLocation, out: Vector3): boolean {
    if (this.anchorOf?.(id, location, out) === true) return true;
    if (this.anchorOf !== null && this.canLocate !== undefined && !this.canLocate(id)) return false;
    const at = this.currentPositionOf(id);
    if (at === null) return false;
    out.set(at.x, this.heightAt(at.x, at.y) + 14, at.y);
    return true;
  }

  private toGroundPoint(at: Vector3): void {
    this.effectAt.x = at.x; this.effectAt.y = at.z;
  }
  private emitBurst(kind: ShotBurstKind, colour: number, scale: number): void {
    this.tracers.burst(this.effectAt, this.effectPoint.y - 14, kind, colour, scale);
  }

  private nearness(at: Vec2): number {
    const distance = Math.hypot(at.x - this.camera.target.x, at.y - this.camera.target.y);
    return Math.max(0, 1 - distance / 700);
  }

  private addShake(magnitude: number): void {
    if (this.camera.reducedMotion) return;
    this.shakeAmplitude = Math.min(9, this.shakeAmplitude + magnitude);
  }

  private muzzleLight(at: Vector3, colour: number, damage: number): void {
    this.flashes.trigger(at, colour, damage);
  }

  private readonly resolveLiveEndpoint = (id: EntityId, out: Vector3): boolean => {
    if (this.canLocate !== undefined && !this.canLocate(id)) return false;
    const at = this.positionOf(id);
    if (at === null) return false;
    out.set(at.x, this.heightAt(at.x, at.y) + 14, at.y);
    return true;
  };

}
