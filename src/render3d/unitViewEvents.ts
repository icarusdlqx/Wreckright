import type { MechLocation } from '../schema/common';
import type { SimEvent } from '../sim/events';
import { findEntity, type EntityId, type World } from '../sim/types';
import { DamageLedger, type DamageSplit } from './damageLedger';
import { triggerStaggerJolt } from './machineCulture';
import { presentMachinePowerEvent, synchronizeMachinePower } from './unitCultureEvents';
import type { EntityView } from './unitViewFactory';
import { canPresentEntity } from './visibilityPresentation';

type HitEvent = Extract<SimEvent, { type: 'projectile_hit' }>;

/** The slice of UnitViews that event routing needs. */
export interface UnitViewEventHost {
  readonly reducedMotion: boolean;
  viewOf(id: EntityId): EntityView | undefined;
  canLocate(id: EntityId): boolean;
  wasPresented(id: EntityId): boolean;
  rememberImpact(targetId: EntityId, attackerId: EntityId): void;
  shedLocation(view: EntityView, location: MechLocation, seed: number): void;
  notePowerEvent(id: EntityId, event: 'shutdown' | 'restart'): void;
  flashLocation(view: EntityView, location: MechLocation, split: DamageSplit, damage: number): void;
}

/**
 * Routes struck-model reactions: which way it falls later, which plate lights
 * now, which limb leaves, and the lurch of a stagger. The ledger is what tells
 * an armour hit from a structure hit, since the world here is already post-step.
 */
export class UnitViewEventRouter {
  private ledger: DamageLedger | null = null;
  private readonly split: DamageSplit = { armour: 0, structure: 0, known: false };

  consume(host: UnitViewEventHost, world: World, events: readonly SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'projectile_hit') {
        this.presentHit(host, world, event);
      } else if (event.type === 'critical_hit' && event.shooterId !== null) {
        if (
          canPresentEntity(world, event.entityId) &&
          canPresentEntity(world, event.shooterId)
        ) host.rememberImpact(event.entityId, event.shooterId);
      } else if (event.type === 'knocked_down' && event.attackerId !== null) {
        if (
          canPresentEntity(world, event.entityId) &&
          canPresentEntity(world, event.attackerId)
        ) host.rememberImpact(event.entityId, event.attackerId);
      } else if (event.type === 'staggered') {
        const view = host.viewOf(event.entityId);
        if (view !== undefined && canPresentEntity(world, event.entityId) && host.wasPresented(event.entityId)) {
          if (!host.reducedMotion) triggerStaggerJolt(view.model.hullRecoil, view.model.culture);
        }
      } else if (event.type === 'location_destroyed') {
        const view = host.viewOf(event.entityId);
        if (
          view !== undefined &&
          canPresentEntity(world, event.entityId) &&
          view.model.faction === 'linewrought' &&
          host.canLocate(event.entityId)
        ) {
          host.shedLocation(view, event.location, event.entityId + event.tick);
        }
      } else if (event.type === 'shutdown' || event.type === 'restart') {
        const view = host.viewOf(event.entityId);
        if (canPresentEntity(world, event.entityId) && host.wasPresented(event.entityId)) {
          presentMachinePowerEvent(view?.model, event.type, host.reducedMotion);
          host.notePowerEvent(event.entityId, event.type);
        } else if (view !== undefined) {
          const entity = findEntity(world, event.entityId);
          if (entity !== null) synchronizeMachinePower(view.model, entity.shutdownRemaining <= 0);
        }
      }
    }
    if (this.ledger === null) this.ledger = new DamageLedger(world);
    else this.ledger.sync(world);
  }

  private presentHit(host: UnitViewEventHost, world: World, event: HitEvent): void {
    if (!canPresentEntity(world, event.targetId)) return;
    if (canPresentEntity(world, event.shooterId)) host.rememberImpact(event.targetId, event.shooterId);
    const view = host.viewOf(event.targetId);
    if (view === undefined || !host.canLocate(event.targetId)) return;
    if (this.ledger === null) this.ledger = new DamageLedger(world);
    this.ledger.classify(world, event, this.split);
    host.flashLocation(view, event.location, this.split, event.damage);
  }
}
