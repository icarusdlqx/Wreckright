import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';

const lineMain = [
  ['line_maintenance', 'line_workshop_belt', 205, 4],
  ['recovery_window', 'line_recovery_cut', 140, 3],
  ['workshop_defence', 'line_workshop_belt', 205, 5],
  ['sealed_contact', 'ridge_pass', 215, 5],
  ['rules_break', 'line_workshop_belt', 220, 5],
  ['conduit_breach', 'shale_steps', 240, 5],
  ['depot_road', 'barrow_archive', 225, 5],
  ['depot_take', 'barrow_archive', 255, 5],
  ['depot_burn', 'barrow_archive', 255, 5],
] as const;

describe('campaign encounter identity', () => {
  it.each(lineMain)('%s uses its authored place and deployment profile', (id, mapId, tonnes, units) => {
    const mission = catalog.missions.get(id)!;
    expect(mission.mapId).toBe(mapId);
    expect(mission.dropTonnage).toBe(tonnes);
    expect(mission.maxPlayerUnits).toBe(units);
  });

  it('gives the Linewrought finales different plans without mandatory extermination', () => {
    const take = catalog.missions.get('depot_take')!;
    const burn = catalog.missions.get('depot_burn')!;
    expect(take.objectives.map(objective => objective.type)).toEqual(['capture_zones', 'hold_zones', 'survive']);
    expect(burn.objectives.map(objective => objective.type)).toEqual(['capture_zones', 'hold_zones', 'survive']);
    expect(take.objectives.flatMap(objective => objective.zoneIds)).not.toEqual(burn.objectives.flatMap(objective => objective.zoneIds));
    expect(take.triggers.some(trigger => trigger.id === 'cooling_attack')).toBe(true);
    expect(burn.triggers.some(trigger => trigger.id === 'purge_response')).toBe(true);
  });

  it('lets recovery, transfer and Broken Wreckright end with enemies alive', () => {
    for (const id of ['recovery_window', 'rules_break', 'depot_take', 'depot_burn']) {
      expect(catalog.missions.get(id)?.objectives.some(objective => objective.type === 'destroy_all')).toBe(false);
    }
  });
});
