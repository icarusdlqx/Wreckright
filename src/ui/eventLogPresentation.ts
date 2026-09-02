import { canPresentEntity } from '../render3d/visibilityPresentation';
import type { SimEvent } from '../sim/events';
import { tileVisible } from '../sim/sensors';
import { findEntity, type MechEntity, type World } from '../sim/types';
import { authoredDesignName, stripSerialDesignation } from './designLabel';

function namedEntity(world: World, id: number) {
  if (!canPresentEntity(world, id)) return null;
  return findEntity(world, id);
}

function entityName(world: World, entity: MechEntity): string {
  return authoredDesignName(world.catalog, { id: entity.designId, name: entity.name });
}

function supportWasObserved(world: World, team: number, x: number, y: number): boolean {
  const vision = world.vision;
  if (vision === null || team === vision.team) return true;
  const tile = world.terrain.toTile({ x, y });
  if (!world.terrain.inBounds(tile.column, tile.row)) return false;
  return tileVisible(vision, tile.row * world.terrain.width + tile.column);
}

/** Returns only log copy the player's current optical picture is allowed to support. */
export function eventLogLine(world: World, event: SimEvent): string | null {
  switch (event.type) {
    case 'mech_destroyed': {
      const entity = namedEntity(world, event.entityId);
      return entity === null ? null : `${entityName(world, entity)} destroyed — ${event.method}`;
    }
    case 'ammo_explosion': {
      const entity = namedEntity(world, event.entityId);
      return entity === null
        ? null
        : `${entityName(world, entity)} ammo detonation in ${event.location}`;
    }
    case 'critical_hit': {
      const entity = namedEntity(world, event.entityId);
      if (entity === null) return null;
      const where = event.location.replace(/_/g, ' ');
      return event.component === null
        ? `Critical hit on ${entityName(world, entity)} — ${where}`
        : `Critical hit on ${entityName(world, entity)} — ${where} ${event.component} wrecked`;
    }
    case 'location_destroyed': {
      const entity = namedEntity(world, event.entityId);
      return entity === null
        ? null
        : `${entityName(world, entity)} lost its ${event.location.replace(/_/g, ' ')}`;
    }
    case 'shutdown': {
      const entity = namedEntity(world, event.entityId);
      return entity === null ? null : `${entityName(world, entity)} shut down from heat`;
    }
    case 'knocked_down': {
      const entity = namedEntity(world, event.entityId);
      return entity === null ? null : `${entityName(world, entity)} goes down`;
    }
    case 'stood_up': {
      const entity = namedEntity(world, event.entityId);
      return entity === null ? null : `${entityName(world, entity)} back on its feet`;
    }
    case 'pilot_injured': {
      const entity = namedEntity(world, event.entityId);
      return entity === null ? null : `${entity.pilot.name} hurt in the fall`;
    }
    case 'mission_message':
      return stripSerialDesignation(event.text);
    case 'zone_captured': {
      const zone = world.zones.find((entry) => entry.id === event.zoneId);
      return `${zone?.name ?? 'Zone'} taken by team ${event.team} (+${event.resourcePoints} RP)`;
    }
    case 'objective_settled': {
      const objective = world.objectives.find((entry) => entry.id === event.objectiveId);
      return `${objective?.label ?? 'Objective'}: ${event.status}`;
    }
    case 'unit_spawned': {
      const entity = namedEntity(world, event.entityId);
      return entity === null ? null : `${entityName(world, entity)} arrives on the field`;
    }
    case 'support_resolved': {
      if (event.call === 'sensor_probe') {
        if (world.vision !== null && event.team !== world.vision.team) return null;
        const count = event.contactCount ?? 0;
        return count === 0
        ? 'Sensor sweep — nothing in range'
          : `Sensor sweep — ${count} contact${count === 1 ? '' : 's'}`;
      }
      return supportWasObserved(world, event.team, event.x, event.y)
        ? `${event.call.replace(/_/g, ' ')} on target`
        : null;
    }
    case 'mission_ended':
      return `Mission ${event.status} — ${event.reason}`;
    case 'battle_ended':
      return event.winner === null
        ? 'Battle ended — draw'
        : `Battle ended — team ${event.winner} wins`;
    default:
      return null;
  }
}
