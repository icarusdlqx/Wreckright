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
    expect(model.designs.find((design) => design.value === current.id)?.label).toBe(identity);
  });
});
