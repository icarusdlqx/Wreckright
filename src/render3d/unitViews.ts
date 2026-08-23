import { Scene, Vector3 } from 'three';
import { LOCATIONS } from '../schema/common';
import { radiusFor } from '../render/shape';
import { findEntity, isOperational, type EntityId, type MechEntity, type Vec2, type World } from '../sim/types';
import type { SimEvent } from '../sim/events';
import type { TacticalCamera, Viewport } from './camera';
import { ContactShadowLayer } from './contactShadows';
import { locationWorldAnchor } from './locationAnchors';
import { advanceWeaponRecoil, triggerWeaponRecoil } from './weaponModels';
import { advanceHullRecoil, triggerHullRecoil } from './machineCulture';
import { advanceStartupSequence } from './startupLights';
import { presentMachinePowerEvent, synchronizeMachinePower } from './unitCultureEvents';
import { UnitPicking } from './unitPicking';
import { applyModelDetail } from './modelDetail';
import {
  battlefieldDetailForDistance,
  type ModelDetail,
} from './renderQuality';
import { setMachineMotionLowFx } from './machineMotion';
import { DetachedPartPool } from './detachedPartPool';
import { canPresentEntity } from './visibilityPresentation';
import { fallbackFallAxis, impactFallAxis, modelDamageSignature,
  sealedTargetOffset, writeInterpolatedPose } from './unitVisualState';
import { createEntityView, disposeEntityView, type EntityView } from './unitViewFactory';

export type { EntityView } from './unitViewFactory';

export interface Interpolated {
  x: number;
  y: number;
  facing: number;
  torso: number;
}

interface MotionSample {
  prev: Interpolated;
  cur: Interpolated;
}

/** Owns model rebuilds and the two sim samples used for smooth rendering. */
export class UnitViews {
  private readonly views = new Map<EntityId, EntityView>();
  private readonly samples = new Map<EntityId, MotionSample>();
  private readonly interpolated = new Map<EntityId, Interpolated>();
  private readonly mountCycles = new Map<string, number>();
  private readonly placed = new Set<EntityId>();
  private readonly shadows: ContactShadowLayer;
  private readonly picking: UnitPicking;
  private readonly detachedParts: DetachedPartPool;
  private readonly fallAxes = new Map<EntityId, ReturnType<typeof fallbackFallAxis>>();
  private readonly presentedPowerEvents = new Map<EntityId, 'shutdown' | 'restart'>();
  private detail: ModelDetail = 'structure';
  private lowFx = false;

  constructor(
    private readonly scene: Scene,
    heightAt: (x: number, y: number) => number,
    private readonly reducedMotion = false,
  ) {
    this.shadows = new ContactShadowLayer(heightAt);
    this.picking = new UnitPicking(heightAt, (entity) => this.at(entity), (id) => this.views.get(id));
    this.detachedParts = new DetachedPartPool(scene, heightAt, reducedMotion);
    scene.add(this.shadows.mesh);
  }

  dispose(): void {
    for (const id of [...this.views.keys()]) this.retire(id);
    this.scene.remove(this.shadows.mesh);
    this.shadows.dispose();
    this.detachedParts.dispose();
    this.samples.clear();
    this.interpolated.clear();
    this.mountCycles.clear();
    this.placed.clear();
    this.fallAxes.clear();
    this.presentedPowerEvents.clear();
  }

  beginFrame(deltaSeconds = 0): void {
    this.shadows.begin();
    this.detachedParts.advance(deltaSeconds);
    this.placed.clear();
    for (const view of this.views.values()) {
      advanceHullRecoil(view.model.hullRecoil, deltaSeconds);
      if (view.model.root.visible) advanceStartupSequence(view.model, deltaSeconds, this.reducedMotion);
      for (const weapon of view.model.weapons) {
        if (weapon.slide.userData.disabledWeapon === true) continue;
        advanceWeaponRecoil(weapon, deltaSeconds, this.reducedMotion, this.lowFx);
      }
    }
  }

  setRenderQuality(distance: number, lowFx: boolean): void {
    const detail = battlefieldDetailForDistance(distance, lowFx, this.detail);
    if (detail === this.detail && lowFx === this.lowFx) return;
    this.detail = detail;
    this.lowFx = lowFx;
    this.detachedParts.setLowFx(lowFx);
    for (const view of this.views.values()) {
      applyModelDetail(view.model.root, detail);
      setMachineMotionLowFx(view.model.machineMotion, lowFx);
    }
  }

  markPlaced(id: EntityId, _at?: Interpolated): void {
    this.placed.add(id);
  }

  placeShadow(entity: MechEntity, at: Interpolated, lift: number): void {
    this.shadows.place(at, radiusFor(entity.tonnage), at.facing, lift);
  }

  finishFrame(): void {
    this.shadows.commit();
    this.presentedPowerEvents.clear();
  }

  consumeEvents(world: World, events: readonly SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'projectile_hit') {
        if (
          canPresentEntity(world, event.targetId) &&
          canPresentEntity(world, event.shooterId)
        ) this.rememberImpact(event.targetId, event.shooterId);
      } else if (event.type === 'critical_hit' && event.shooterId !== null) {
        if (
          canPresentEntity(world, event.entityId) &&
          canPresentEntity(world, event.shooterId)
        ) this.rememberImpact(event.entityId, event.shooterId);
      } else if (event.type === 'knocked_down' && event.attackerId !== null) {
        if (
          canPresentEntity(world, event.entityId) &&
          canPresentEntity(world, event.attackerId)
        ) this.rememberImpact(event.entityId, event.attackerId);
      } else if (event.type === 'location_destroyed') {
        const view = this.views.get(event.entityId);
        if (
          canPresentEntity(world, event.entityId) &&
          view?.model.faction === 'linewrought' &&
          this.canLocate(event.entityId)
        ) {
          this.detachedParts.spawn(view.model.root, event.location, event.entityId + event.tick);
        }
      } else if (event.type === 'shutdown' || event.type === 'restart') {
        const view = this.views.get(event.entityId);
        if (canPresentEntity(world, event.entityId) && this.wasPresented(event.entityId)) {
          presentMachinePowerEvent(view?.model, event.type, this.reducedMotion);
          this.presentedPowerEvents.set(event.entityId, event.type);
        } else if (view !== undefined) {
          const entity = findEntity(world, event.entityId);
          if (entity !== null) synchronizeMachinePower(view.model, entity.shutdownRemaining <= 0);
        }
      }
    }
  }

  snapshot(world: World): void {
    for (const entity of world.entities) {
      const presentable = canPresentEntity(world, entity.id);
      if (!presentable) {
        this.conceal(entity);
        if (!isOperational(entity)) this.retire(entity.id);
      }
      if (!this.shouldTrack(world, entity)) continue;
      const existing = this.samples.get(entity.id);
      if (existing === undefined) {
        const cur: Interpolated = {
          x: entity.pos.x,
          y: entity.pos.y,
          facing: entity.facing,
          torso: entity.torsoOffset,
        };
        this.samples.set(entity.id, { prev: { ...cur }, cur });
        continue;
      }
      const { prev, cur } = existing;
      prev.x = cur.x;
      prev.y = cur.y;
      prev.facing = cur.facing;
      prev.torso = cur.torso;
      cur.x = entity.pos.x;
      cur.y = entity.pos.y;
      cur.facing = entity.facing;
      cur.torso = entity.torsoOffset;
    }
  }

  interpolate(world: World, alpha: number): void {
    for (const entity of world.entities) {
      if (!this.shouldTrack(world, entity)) continue;
      let slot = this.interpolated.get(entity.id);
      if (slot === undefined) {
        slot = { x: 0, y: 0, facing: 0, torso: 0 };
        this.interpolated.set(entity.id, slot);
      }

      const sample = this.samples.get(entity.id);
      if (sample === undefined) {
        slot.x = entity.pos.x;
        slot.y = entity.pos.y;
        slot.facing = entity.facing;
        slot.torso = entity.torsoOffset;
        continue;
      }
      const faction = world.catalog.chassis.get(entity.chassisId)?.faction ?? 'linewrought';
      writeInterpolatedPose(slot, sample, alpha, faction);
      if (faction === 'aurelian') slot.torso = sealedTargetOffset(world, entity, slot);
    }
  }

  at(entity: MechEntity): Interpolated {
    return this.interpolated.get(entity.id) ?? {
      x: entity.pos.x,
      y: entity.pos.y,
      facing: entity.facing,
      torso: entity.torsoOffset,
    };
  }

  positionOf(id: EntityId): Vec2 | null {
    return this.interpolated.get(id) ?? this.samples.get(id)?.cur ?? null;
  }

  currentPositionOf(id: EntityId): Vec2 | null {
    return this.samples.get(id)?.cur ?? this.interpolated.get(id) ?? null;
  }

  canLocate(id: EntityId): boolean {
    const view = this.views.get(id);
    return view !== undefined && view.model.root.visible && this.placed.has(id);
  }

  /** True only when the previous rendered frame exposed this exact model. */
  wasPresented(id: EntityId): boolean {
    const view = this.views.get(id);
    return view !== undefined && view.model.root.visible && this.placed.has(id);
  }

  /** Death falls require a live model the player saw before the terminal event. */
  wasPresentedLive(id: EntityId): boolean {
    const view = this.views.get(id);
    return this.wasPresented(id) && view?.terminal === false;
  }

  canAnimateTerminalEvent(world: World, id: EntityId): boolean {
    return canPresentEntity(world, id) && this.wasPresentedLive(id);
  }

  locationOf(id: EntityId, location: (typeof LOCATIONS)[number], out: Vector3): boolean {
    const view = this.views.get(id);
    if (view === undefined || !this.canLocate(id)) return false;
    return locationWorldAnchor(view.anchors, location, out);
  }

  /** Chooses the physical copy that fired when a design carries duplicate weapon ids. */
  fireMount(id: EntityId, weaponId: string, muzzle: Vector3, breech?: Vector3): boolean {
    const view = this.views.get(id);
    if (view === undefined || !view.model.root.visible || !this.placed.has(id)) return false;

    let count = 0;
    for (const rig of view.model.weapons) {
      if (rig.weaponId === weaponId && rig.slide.userData.disabledWeapon !== true) count += 1;
    }
    if (count === 0) return false;

    const key = `${id}:${weaponId}`;
    const wanted = (this.mountCycles.get(key) ?? 0) % count;
    let seen = 0;
    for (const rig of view.model.weapons) {
      if (rig.weaponId !== weaponId || rig.slide.userData.disabledWeapon === true) continue;
      if (seen !== wanted) {
        seen += 1;
        continue;
      }
      rig.muzzle.getWorldPosition(muzzle);
      if (breech !== undefined) rig.breech.getWorldPosition(breech);
      triggerWeaponRecoil(rig);
      if (view.model.faction === 'linewrought') {
        if (!this.reducedMotion) triggerHullRecoil(view.model.hullRecoil, view.model.culture, rig.travel);
      }
      this.mountCycles.set(key, (wanted + 1) % count);
      return true;
    }
    return false;
  }

  viewFor(world: World, entity: MechEntity): EntityView {
    const chassis = world.catalog.chassis.get(entity.chassisId);
    const faction = chassis?.faction ?? 'linewrought';
    const signature = modelDamageSignature(entity, faction);
    const existing = this.views.get(entity.id);
    if (existing !== undefined && existing.signature === signature) return existing;

    if (existing !== undefined) {
      this.scene.remove(existing.model.root, existing.ring, existing.hoverRing);
      disposeEntityView(existing);
    }
    const view = createEntityView(world, entity, this.detail, this.lowFx, this.fallAxes.get(entity.id));
    if (view.signature !== signature) throw new Error('entity view signature mismatch');
    this.scene.add(view.model.root, view.ring, view.hoverRing);
    this.views.set(entity.id, view);
    return view;
  }

  /** Returns a model only after the current visibility boundary admits it. */
  present(world: World, entity: MechEntity): EntityView | null {
    const existing = this.views.get(entity.id);
    if (!canPresentEntity(world, entity.id)) {
      this.conceal(entity);
      if (!isOperational(entity)) this.retire(entity.id);
      return null;
    }

    const returning = existing !== undefined && !existing.model.root.visible;
    const view = this.viewFor(world, entity);
    if (returning && this.presentedPowerEvents.has(entity.id)) {
      if (view !== existing) {
        const event = this.presentedPowerEvents.get(entity.id);
        if (event !== undefined) presentMachinePowerEvent(view.model, event, this.reducedMotion);
      }
    } else if (returning) {
      synchronizeMachinePower(view.model, entity.shutdownRemaining <= 0);
    }
    view.model.root.visible = true;
    return view;
  }

  /** Releases every entity-keyed render record and its owned Three resources. */
  retire(id: EntityId): void {
    const view = this.views.get(id);
    if (view !== undefined) {
      this.scene.remove(view.model.root, view.ring, view.hoverRing);
      disposeEntityView(view);
    }
    this.views.delete(id);
    this.samples.delete(id);
    this.interpolated.delete(id);
    this.placed.delete(id);
    this.fallAxes.delete(id);
    this.presentedPowerEvents.delete(id);
    const prefix = `${id}:`;
    for (const key of this.mountCycles.keys()) if (key.startsWith(prefix)) this.mountCycles.delete(key);
  }

  screenBodyOf(
    entity: MechEntity,
    camera: TacticalCamera,
    viewport: Viewport,
  ): { x: number; y: number; radius: number } {
    return this.picking.screenBodyOf(entity, camera, viewport);
  }

  entityAtScreen(
    world: World,
    screen: Vec2,
    radiusPixels: number,
    camera: TacticalCamera,
    viewport: Viewport,
    wanted: (entity: MechEntity) => boolean,
  ): MechEntity | null {
    return this.picking.entityAtScreen(world, screen, radiusPixels, camera, viewport, wanted);
  }

  private shouldTrack(world: World, entity: MechEntity): boolean {
    return this.views.has(entity.id) || canPresentEntity(world, entity.id);
  }

  private conceal(entity: MechEntity): void {
    const view = this.views.get(entity.id);
    if (view !== undefined) {
      synchronizeMachinePower(view.model, entity.shutdownRemaining <= 0);
      view.model.root.visible = false;
      view.ring.visible = false;
      view.hoverRing.visible = false;
    }
    this.placed.delete(entity.id);
    this.presentedPowerEvents.delete(entity.id);
  }

  private rememberImpact(targetId: EntityId, attackerId: EntityId): void {
    if (!this.canLocate(targetId) || !this.canLocate(attackerId)) return;
    const target = this.interpolated.get(targetId) ?? this.samples.get(targetId)?.cur;
    const attacker = this.interpolated.get(attackerId) ?? this.samples.get(attackerId)?.cur;
    if (target === undefined || attacker === undefined) return;
    const axis = impactFallAxis(target, attacker);
    if (axis === null) return;
    this.fallAxes.set(targetId, axis);
    const view = this.views.get(targetId);
    if (view !== undefined) view.model.terminalFallAxis = axis;
  }
}
