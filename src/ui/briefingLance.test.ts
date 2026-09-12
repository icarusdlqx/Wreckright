import { describe, expect, it, vi } from 'vitest';
import { catalog } from '../../tests/support';
import { briefingLanceFor } from './briefingLance';

describe('briefing lance identity', () => {
  it('resolves both stock choices and embedded legacy stock names through the design id', () => {
    const current = catalog.designs.get('hornet_spotter');
    if (current === undefined) throw new Error('missing Gadfly fixture');
    const legacy = structuredClone(current);
    legacy.name = "Gadfly GAD-2 'Spotter'";

    const model = briefingLanceFor(
      catalog,
      'skirmish_ridge',
      [{ designId: null, design: legacy, pilotId: 'kessa_vale' }],
      vi.fn(),
      vi.fn(),
    );
    const identity = 'Gadfly — 35t Light · Forward spotter · Linewrought';

    expect(model.berths[0]?.customLabel).toBe(identity);
    expect(model.designs.find((design) => design.value === current.id)?.label).toBe(`${identity} · Prime`);
    expect(model.berths[0]?.machine).toMatchObject({ name: 'Gadfly', chassisId: current.chassisId,
      identity, weaponCount: current.mounts.length });
  });

  it('keeps pilot identity and the displayed tier skills together without changing authored pilots', () => {
    const pilot = catalog.pilots.get('kessa_vale')!;
    const model = briefingLanceFor(catalog, 'skirmish_ridge', [
      { designId: 'hornet_spotter', pilotId: pilot.id },
      { designId: null, empty: true, pilotId: 'dorn_hess' },
    ], vi.fn(), vi.fn(), 'elite');
    const delta = catalog.rules.difficulty.tiers.elite!.skillDelta;
    expect(model.berths[0]?.pilot).toMatchObject({ id: pilot.id, name: pilot.name, traits: pilot.traits,
      gunnery: Math.max(1, Math.min(5, pilot.gunnery + delta)) });
    expect(model.berths[1]?.machine).toBeNull();
    expect(model.berths[1]?.tonnage).toBe(0);
    expect(catalog.pilots.get(pilot.id)).toBe(pilot);
  });

  it('exposes the edited equipment while pilot assignment preserves that exact loadout', () => {
    const design = structuredClone(catalog.designs.get('hornet_spotter')!);
    design.mounts = design.mounts.slice(1);
    const onLance = vi.fn();
    const onCustomise = vi.fn();
    const model = briefingLanceFor(catalog, 'skirmish_ridge', [
      { designId: null, design, pilotId: 'kessa_vale' },
    ], onLance, onCustomise);
    expect(model.berths[0]?.machine?.weaponCount).toBe(design.mounts.length);
    model.onPilot(0, 'dorn_hess');
    expect(onLance).toHaveBeenLastCalledWith([{ designId: null, design, pilotId: 'dorn_hess' }]);
    model.onCustomise(0);
    expect(onCustomise).toHaveBeenCalledWith(0);
  });
});
