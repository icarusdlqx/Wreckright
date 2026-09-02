import { describe, expect, it } from 'vitest';
import type { Design } from '../schema/design';
import { getCatalog, type Catalog } from '../schema/load';
import {
  authoredDesignName,
  designIdentityLabel,
  designLabel,
  machineDisplayName,
  replaceSerialDesignation,
  stripSerialDesignation,
} from './designLabel';

function gadflyCatalog(): { catalog: Catalog; design: Design } {
  const catalog = getCatalog();
  const design = catalog.designs.get('hornet_spotter');
  if (design === undefined) throw new Error('missing hornet_spotter fixture');
  return { catalog, design };
}

describe('design labels', () => {
  it('resolves a saved stock design through its stable id', () => {
    const { catalog, design } = gadflyCatalog();
    const saved = {
      ...design,
      name: "Gadfly GAD-2 'Spotter'",
      chassisId: 'stale-chassis-id',
    };

    expect(authoredDesignName(catalog, saved)).toBe('Gadfly');
    expect(machineDisplayName(catalog, saved)).toBe('Gadfly');
    expect(designLabel(catalog, saved)).toBe('Gadfly — 35t Light');
    expect(designIdentityLabel(catalog, saved)).toBe(
      'Gadfly — 35t Light · Forward spotter · Linewrought',
    );
  });

  it('keeps the passed name for a custom design while using its known chassis identity', () => {
    const { catalog, design } = gadflyCatalog();
    const custom = { ...design, id: 'custom-gadfly', name: 'Scrap Moth' };

    expect(authoredDesignName(catalog, custom)).toBe('Scrap Moth');
    expect(designIdentityLabel(catalog, custom)).toBe(
      'Scrap Moth — 35t Light · Forward spotter · Linewrought',
    );
  });

  it('keeps a callsign when siblings share a chassis', () => {
    const { catalog, design } = gadflyCatalog();
    const spotter = { ...design, name: "Gadfly 'Spotter'" };
    const sibling = { ...design, id: 'hornet_raider', name: "Gadfly 'Raider'" };
    const siblingCatalog = {
      ...catalog,
      designs: new Map(catalog.designs).set(spotter.id, spotter).set(sibling.id, sibling),
    };

    expect(machineDisplayName(siblingCatalog, spotter)).toBe("Gadfly 'Spotter'");
    expect(designIdentityLabel(siblingCatalog, sibling)).toBe(
      "Gadfly 'Raider' — 35t Light · Forward spotter · Linewrought",
    );
  });

  it('removes only a legacy model code from unkeyed display text', () => {
    expect(stripSerialDesignation("Gadfly GAD-2 'Spotter' disabled, then withdrew.")).toBe(
      "Gadfly 'Spotter' disabled, then withdrew.",
    );
    expect(stripSerialDesignation('A-10 and hand-built stay intact.')).toBe(
      'A-10 and hand-built stay intact.',
    );
    expect(replaceSerialDesignation('Each GAD-2 continues a recovered root.', 'Gadfly')).toBe(
      'Each Gadfly continues a recovered root.',
    );
  });

  it('falls back to the resolved name when chassis content is unavailable', () => {
    const { catalog, design } = gadflyCatalog();
    const orphan = { ...design, id: 'custom-orphan', name: 'Orphan', chassisId: 'missing' };

    expect(designLabel(catalog, orphan)).toBe('Orphan');
    expect(designIdentityLabel(catalog, orphan)).toBe('Orphan');
  });
});
