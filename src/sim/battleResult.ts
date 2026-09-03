import { LOCATIONS, type MechLocation } from '../schema/common';
import type { RngSeed } from './rng';
import { isOperational, type World } from './types';

export interface UnitCondition {
  armour: number;
  rearArmour: number;
  internal: number;
  destroyed: boolean;
}

export interface UnitResult {
  id: number;
  team: number;
  name: string;
  designId: string;
  pilotId: string;
  alive: boolean;
  killMethod: string | null;
  pilotDead: boolean;
  pilotWounds: number;
  pilotEjected: boolean;
  withdrew: boolean;
  legged: boolean;
  damageDealt: number;
  damageTaken: number;
  shotsFired: number;
  shotsHit: number;
  ammoSpent: number;
  heatPeak: number;
  kills: number;
  condition: Record<MechLocation, UnitCondition>;
}

export interface ObjectiveResult {
  id: string;
  label: string;
  required: boolean;
  status: string;
  progress: number;
}

export interface BattleResult {
  seed: RngSeed;
  missionId: string;
  missionStatus: 'active' | 'success' | 'failure';
  missionReason: string | null;
  objectives: ObjectiveResult[];
  ticks: number;
  durationSeconds: number;
  winner: number | null;
  decided: boolean;
  units: UnitResult[];
  weapons: { weaponId: string; shots: number; hits: number; damage: number; heat: number }[];
}

export function toResult(world: World, seed: RngSeed, maxTicks: number): BattleResult {
  return {
    seed,
    missionId: world.mission.id,
    missionStatus: world.missionStatus,
    missionReason: world.missionReason,
    objectives: world.objectives.map((objective) => ({
      id: objective.id,
      label: objective.label,
      required: objective.required,
      status: objective.status,
      progress: objective.progress,
    })),
    ticks: world.tick,
    durationSeconds: world.tick * world.dt,
    winner: world.winner,
    decided: world.finished && world.tick < maxTicks,
    units: world.entities.map((entity) => ({
      id: entity.id,
      team: entity.team,
      name: entity.name,
      designId: entity.designId,
      pilotId: entity.pilot.id,
      // A conceded mech is out of the fight but came through whole: it is
      // alive here, with `killMethod` 'legged' saying why it stopped.
      alive: isOperational(entity) || entity.disabled,
      killMethod: entity.killMethod,
      pilotDead: entity.pilot.dead,
      pilotWounds: entity.pilot.wounds,
      pilotEjected: entity.pilot.ejected,
      withdrew: entity.withdrawn,
      legged: entity.locations.left_leg.destroyed && entity.locations.right_leg.destroyed,
      damageDealt: entity.stats.damageDealt,
      damageTaken: entity.stats.damageTaken,
      shotsFired: entity.stats.shotsFired,
      shotsHit: entity.stats.shotsHit,
      ammoSpent: entity.stats.ammoSpent,
      heatPeak: entity.stats.heatPeak,
      kills: entity.stats.kills,
      condition: Object.fromEntries(
        LOCATIONS.map((location) => [
          location,
          // Whole points, rounded in the mech's favour: the campaign invoices
          // repairs off these, and nobody bills for a third of a plate.
          {
            armour: Math.ceil(entity.locations[location].armour),
            rearArmour: Math.ceil(entity.locations[location].rearArmour),
            internal: Math.ceil(entity.locations[location].internal),
            destroyed: entity.locations[location].destroyed,
          },
        ]),
      ) as Record<MechLocation, UnitCondition>,
    })),
    weapons: [...world.weaponStats.entries()]
      .map(([weaponId, stat]) => ({ weaponId, ...stat }))
      .sort((a, b) => a.weaponId.localeCompare(b.weaponId)),
  };
}
