import { Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { LOCATIONS } from '../schema/common';
import type { Weapon } from '../schema/weapon';
import { teamColour, UI } from '../render/palette';
import { DEFAULT_SILHOUETTE, radiusFor } from '../render/shape';
import type { MechEntity, World } from '../sim/types';
import { damageWearTier } from './damageLedger';
import { collectLocationAnchors, type LocationAnchors } from './locationAnchors';
import { buildMechModel, disposeModel, type MechModel } from './mechModel';
import { setMachineMotionLowFx } from './machineMotion';
import { applyModelDetail } from './modelDetail';
import type { ModelDetail } from './renderQuality';
import { setStartupPowered } from './startupLights';
import { fallbackFallAxis, modelDamageSignature, type TerminalFallAxis } from './unitVisualState';

export interface EntityView {
  model: MechModel;
  signature: number;
  terminal: boolean;
  ring: Mesh;
  hoverRing: Mesh;
  anchors: LocationAnchors;
}

const DEFAULT_VISUAL: Weapon['visual'] = {
  style: 'beam',
  colour: '#ffffff',
  width: 2,
  arc: 0,
};

function selectionRing(
  radius: number,
  colour: number,
  inner: number,
  outer: number,
  opacity: number,
): Mesh {
  const ring = new Mesh(
    new RingGeometry(radius * inner, radius * outer, 28),
    new MeshBasicMaterial({ color: colour, transparent: true, opacity }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  return ring;
}

export function createEntityView(
  world: World,
  entity: MechEntity,
  detail: ModelDetail,
  lowFx: boolean,
  fallAxis: TerminalFallAxis | undefined,
): EntityView {
  const chassis = world.catalog.chassis.get(entity.chassisId);
  const faction = chassis?.faction ?? 'linewrought';
  const wear = {} as Partial<Record<(typeof LOCATIONS)[number], ReturnType<typeof damageWearTier>>>;
  for (const location of LOCATIONS) wear[location] = damageWearTier(entity.locations[location]);
  const mounts = entity.weapons
    .filter((mount) => faction === 'aurelian' || !mount.destroyed)
    .map((mount) => {
      const weapon = world.catalog.weapons.get(mount.weaponId);
      return {
        weaponId: mount.weaponId,
        location: mount.location,
        type: weapon?.type ?? ('energy' as const),
        tonnage: weapon?.tonnage ?? 1,
        projectiles: weapon?.projectiles ?? 1,
        recoil: weapon?.recoil ?? 0,
        visual: weapon?.visual ?? DEFAULT_VISUAL,
        destroyed: mount.destroyed,
      };
    });

  const model = buildMechModel(
    chassis?.silhouette ?? DEFAULT_SILHOUETTE,
    chassis?.traits ?? [],
    entity.tonnage,
    teamColour(entity.team),
    entity.destroyed,
    mounts,
    new Set(LOCATIONS.filter((location) => entity.locations[location].destroyed)),
    chassis?.hardpoints,
    chassis?.id ?? null,
    wear,
    faction,
  );
  applyModelDetail(model.root, detail);
  setMachineMotionLowFx(model.machineMotion, lowFx);
  if (faction === 'aurelian') setStartupPowered(model, entity.shutdownRemaining <= 0);
  model.terminalFallAxis = fallAxis ?? fallbackFallAxis(entity.id);

  const radius = radiusFor(entity.tonnage);
  const ring = selectionRing(radius, UI.selection, 1.2, 1.42, 0.9);
  const hoverRing = selectionRing(
    radius,
    entity.team === world.playerTeam ? UI.friendly : UI.hostile,
    1.5,
    1.66,
    0.85,
  );
  model.root.userData.entityId = entity.id;
  return {
    model,
    signature: modelDamageSignature(entity, faction),
    terminal: entity.destroyed || entity.withdrawn,
    ring,
    hoverRing,
    anchors: collectLocationAnchors(model.root),
  };
}

export function disposeEntityView(view: EntityView): void {
  disposeModel(view.model.root);
  for (const ring of [view.ring, view.hoverRing]) {
    ring.geometry.dispose();
    const materials = Array.isArray(ring.material) ? ring.material : [ring.material];
    for (const material of materials) material.dispose();
  }
}
