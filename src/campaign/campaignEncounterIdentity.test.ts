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


const aurelianMain = [
  ['raid_ridge', 'aurelian_landing_apron', 215, 4],
  ['authority_custody_posts', 'aurelian_civic_exchange', 210, 5],
  ['switchyard_watch', 'aurelian_civic_exchange', 175, 5],
  ['authority_root_exchange', 'aurelian_service_terraces', 100, 2],
  ['authority_quarry_receipt', 'blackglass_quarry', 225, 5],
  ['authority_conduit_injunction', 'aurelian_service_terraces', 230, 5],
  ['authority_barrow_warrant', 'barrow_archive', 240, 5],
  ['authority_continuance_export', 'barrow_archive', 250, 5],
  ['authority_local_stewardship', 'barrow_archive', 250, 5],
] as const;

describe('campaign encounter identity', () => {
  it.each(lineMain)('%s uses its authored place and deployment profile', (id, mapId, tonnes, units) => {
    const mission = catalog.missions.get(id)!;
    expect(mission.mapId).toBe(mapId);
    expect(mission.dropTonnage).toBe(tonnes);
    expect(mission.maxPlayerUnits).toBe(units);
  });

  it.each(aurelianMain)('%s uses its distinct Aurelian operation profile', (id, mapId, tonnes, units) => {
    const mission = catalog.missions.get(id)!;
    expect(mission.mapId).toBe(mapId);
    expect(mission.dropTonnage).toBe(tonnes);
    expect(mission.maxPlayerUnits).toBe(units);
  });

  it('keeps Aurelian recon, transfer and endings objective-led', () => {
    for (const id of ['custody_survey', 'custody_resupply', 'authority_root_exchange',
      'authority_quarry_receipt', 'authority_continuance_export', 'authority_local_stewardship']) {
      expect(catalog.missions.get(id)?.objectives.some(objective => objective.type === 'destroy_all'), id).toBe(false);
    }
    expect(catalog.missions.get('authority_root_exchange')?.maxPlayerUnits).toBe(2);
    expect(catalog.missions.get('authority_continuance_export')?.objectives.flatMap(o => o.zoneIds))
      .not.toEqual(catalog.missions.get('authority_local_stewardship')?.objectives.flatMap(o => o.zoneIds));
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

  it('lets recovery, transfer and Broken Code end with enemies alive', () => {
    for (const id of ['recovery_window', 'rules_break', 'depot_take', 'depot_burn']) {
      expect(catalog.missions.get(id)?.objectives.some(objective => objective.type === 'destroy_all')).toBe(false);
    }
  });
});
