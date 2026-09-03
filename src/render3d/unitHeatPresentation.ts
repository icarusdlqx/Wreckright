import { Vector3 } from 'three';
import { radiusFor } from '../render/shape';
import type { MechLocation } from '../schema/common';
import type { MechEntity } from '../sim/types';
import type { DamageSplit } from './damageLedger';
import type { HeatVentPool } from './heatVentPool';
import { flashHullLocation, setHullHeatGlow } from './hullSurface';
import { locationWorldAnchor } from './locationAnchors';
import type { EntityView } from './unitViewFactory';

const VENT_ANCHOR = new Vector3();
const VENT_THRESHOLD = 0.5;
const GLOW_THRESHOLD = 0.85;

/**
 * Reactor heat is drawn from the entity every frame rather than from an
 * event: past half capacity the torso vents steam at a rate that climbs with
 * the heat fraction, and near shutdown the hull itself starts to glow.
 */
export function presentUnitHeat(
  view: EntityView,
  entity: MechEntity,
  deltaSeconds: number,
  vents: HeatVentPool,
  placed: boolean,
  lowFx: boolean,
): void {
  if (!view.model.root.visible || entity.destroyed) return;
  const fraction = entity.heatCapacity > 0 ? entity.heat / entity.heatCapacity : 0;
  const glow = fraction <= GLOW_THRESHOLD ? 0 : (fraction - GLOW_THRESHOLD) / (1 - GLOW_THRESHOLD);
  setHullHeatGlow(view.surface, view.anchors, glow);
  if (lowFx || fraction <= VENT_THRESHOLD || !placed) {
    view.vent.clock = 0;
    return;
  }
  const rate = 1 + (fraction - VENT_THRESHOLD) * 8;
  view.vent.clock += Math.max(0, deltaSeconds) * rate;
  if (view.vent.clock < 1) return;
  if (!locationWorldAnchor(view.anchors, 'centre_torso', VENT_ANCHOR)) {
    view.vent.clock = 0;
    return;
  }
  const size = radiusFor(entity.tonnage) * 0.09;
  while (view.vent.clock >= 1) {
    view.vent.clock -= 1;
    view.vent.count += 1;
    vents.spawn(
      VENT_ANCHOR.x, VENT_ANCHOR.y + size, VENT_ANCHOR.z, entity.id * 13 + view.vent.count, size,
    );
  }
}

/** Armour flashes cold; the share that reached the frame warms the flash. */
export function flashUnitLocation(
  view: EntityView,
  location: MechLocation,
  split: DamageSplit,
  damage: number,
): void {
  const total = split.armour + split.structure;
  // Without a ledger reading, a heavier hit is more likely to have found the frame.
  const structureShare = split.known && total > 0
    ? split.structure / total
    : Math.min(1, damage / 25);
  flashHullLocation(
    view.surface,
    view.anchors,
    location,
    0.35 + Math.min(0.65, damage / 22),
    structureShare,
    0.22 + Math.min(0.3, damage / 60),
  );
}
