import { LOCATIONS, type MechLocation } from '../schema/common';
import { roleOf } from '../sim/ai/roles';
import { canJump, isHoldingFire } from '../sim/orders';
import { isIdentifiedBy, isSightedBy, type ContactTrack } from '../sim/sensors';
import { findEntity, isOperational, isStaggered, type MechEntity, type World } from '../sim/types';
import type { ContactSnapshot, LocationSnapshot, UnitSnapshot, WeaponSnapshot } from './store';
import {
  abilityReadout,
  alphaReadout,
  reactorReadout,
  stabilityReadout,
} from './combatTelemetry';

function locationsOf(entity: MechEntity): Record<MechLocation, LocationSnapshot> {
  const entries = LOCATIONS.map((location) => {
    const state = entity.locations[location];
    return [
      location,
      {
        armour: state.armour,
        armourMax: state.armourMax,
        hasRearArmourFace: state.hasRearArmourFace,
        rearArmour: state.rearArmour,
        rearArmourMax: state.rearArmourMax,
        internal: state.internal,
        internalMax: state.internalMax,
        destroyed: state.destroyed,
      } satisfies LocationSnapshot,
    ];
  });
  return Object.fromEntries(entries) as Record<MechLocation, LocationSnapshot>;
}

function weaponsOf(world: World, entity: MechEntity): WeaponSnapshot[] {
  return entity.weapons.map((mount) => {
    const weapon = world.catalog.weapons.get(mount.weaponId);
    const bin = entity.ammoBins.find((entry) => entry.weaponId === mount.weaponId && !entry.destroyed);
    return {
      index: mount.index,
      name: weapon?.name ?? mount.weaponId,
      group: mount.group,
      cooldown: mount.cooldown,
      cooldownMax: weapon?.cooldown ?? 1,
      destroyed: mount.destroyed,
      rounds: weapon?.ammoPerTon === null ? null : (bin?.rounds ?? 0),
      shortRange: weapon?.range.short ?? 0,
      longRange: weapon?.range.long ?? 0,
      location: mount.location,
    };
  });
}

/** Metres to the closest machine on a given team, or null if that side is gone. */
function rangeToTeam(world: World, entity: MechEntity, team: number): number | null {
  let best: number | null = null;
  for (const other of world.entities) {
    if (other.team !== team || !isOperational(other)) continue;
    const range = Math.hypot(other.pos.x - entity.pos.x, other.pos.y - entity.pos.y);
    if (best === null || range < best) best = range;
  }
  return best;
}

function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function frameClass(entity: MechEntity): string {
  if (entity.frame === 'turret') return 'Emplacement';
  return `${titleCase(entity.chassisClass)} ${entity.frame}`;
}

export function snapshotUnit(world: World, entity: MechEntity): UnitSnapshot {
  const target = findEntity(world, entity.targetId);
  const presentedTarget = target !== null && isSightedBy(world.vision, target) ? target : null;
  const playerTeam = world.playerTeam ?? 0;
  const chassis = world.catalog.chassis.get(entity.chassisId);
  return {
    id: entity.id,
    team: entity.team,
    name: entity.name,
    pilotName: entity.pilot.name,
    pilotSkills: {
      gunnery: entity.pilot.gunnery,
      piloting: entity.pilot.piloting,
      sensors: entity.pilot.sensors,
    },
    pilotTraits: [...entity.pilot.traits],
    tonnage: entity.tonnage,
    alive: isOperational(entity),
    destroyed: entity.destroyed,
    killMethod: entity.killMethod,
    heat: entity.heat,
    heatCapacity: entity.heatCapacity,
    shutdownRemaining: entity.shutdownRemaining,
    downRemaining: entity.downRemaining,
    staggered: isStaggered(entity, world.rules.stability.staggerThreshold),
    motion: entity.motion,
    targetId: presentedTarget?.id ?? null,
    targetName: presentedTarget === null ? null : presentedTarget.name,
    targetRange:
      presentedTarget === null
        ? null
        : Math.hypot(presentedTarget.pos.x - entity.pos.x, presentedTarget.pos.y - entity.pos.y),
    rangeToLance: entity.team === playerTeam ? null : rangeToTeam(world, entity, playerTeam),
    lostLocations: LOCATIONS.filter((location) => entity.locations[location].destroyed),
    locations: locationsOf(entity),
    weapons: weaponsOf(world, entity),
    groupEnabled: [...entity.groupEnabled],
    holdingFire: isHoldingFire(entity),
    heatSafety: entity.heatSafety,
    ability: abilityReadout(world, entity),
    alpha: alphaReadout(world, entity),
    stability: stabilityReadout(world, entity),
    reactor: reactorReadout(world, entity),
    hasMoveOrder: entity.orders.move !== null,
    hasAttackOrder: entity.team === playerTeam && entity.orders.attack !== null,
    jumpRange: entity.jumpRange,
    jumpCooldown: entity.jumpCooldown,
    canJump: canJump(entity),
    posture: entity.posture,
    identified: isIdentifiedBy(world.vision, entity),
    sensorRange: entity.sensorRange,
    sightRange: entity.sightRange,
    signature: entity.signature,
    chassisTraits: (chassis?.traits ?? []).flatMap((id) => {
      const trait = world.rules.traits.entries[id];
      return trait === undefined ? [] : [{ label: trait.label, note: trait.note }];
    }),
    role: titleCase(roleOf(world, entity).role),
    frameClass: frameClass(entity),
    chassisSummary: chassis?.summary ?? '',
  };
}

function contactLabel(track: ContactTrack): string {
  if (track.frame === 'turret') return 'Emplacement contact';
  const weight = `${track.chassisClass[0]?.toUpperCase() ?? ''}${track.chassisClass.slice(1)}`;
  return `${weight} ${track.frame}`;
}

function approximateRangeToTeam(world: World, at: ContactTrack['pos'], team: number): number | null {
  let best: number | null = null;
  for (const friendly of world.entities) {
    if (friendly.team !== team || !isOperational(friendly)) continue;
    const range = Math.hypot(friendly.pos.x - at.x, friendly.pos.y - at.y);
    if (best === null || range < best) best = range;
  }
  return best === null ? null : Math.round(best / 50) * 50;
}

/** Current electronic returns, serialized without consulting the hidden entity. */
export function snapshotContacts(world: World, playerTeam: number): ContactSnapshot[] {
  const vision = world.vision;
  if (vision === null) return [];
  const contacts: ContactSnapshot[] = [];
  for (const track of vision.tracks.values()) {
    if (
      track.team === playerTeam ||
      vision.visible.has(track.id) ||
      vision.observedHulks.has(track.id)
    ) continue;
    contacts.push({
      id: track.id,
      team: track.team,
      label: contactLabel(track),
      position: { x: track.pos.x, y: track.pos.y },
      approximateRange: approximateRangeToTeam(world, track.pos, playerTeam),
      current: vision.detected.has(track.id),
      source: 'sensor',
    });
  }
  return contacts.sort((a, b) => a.id - b.id);
}

export function snapshotUnits(world: World, playerTeam: number): {
  units: UnitSnapshot[];
  enemies: UnitSnapshot[];
  contacts: ContactSnapshot[];
} {
  const units: UnitSnapshot[] = [];
  const enemies: UnitSnapshot[] = [];

  for (const entity of world.entities) {
    if (entity.team === playerTeam) {
      units.push(snapshotUnit(world, entity));
      continue;
    }
    if (world.vision !== null && !world.vision.visible.has(entity.id)) continue;
    enemies.push(snapshotUnit(world, entity));
  }

  return { units, enemies, contacts: snapshotContacts(world, playerTeam) };
}
