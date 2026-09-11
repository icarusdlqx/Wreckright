import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import provenance from '../../assets/machines/provenance.json';
import { loadCatalog } from '../../schema/load';
import { MachinePortrait, machinePortraitSource } from './MachinePortrait';

const catalog = loadCatalog();

describe('catalogue identification artwork', () => {
  it('keeps every rendered portrait tied to its current standard equipment', () => {
    expect(provenance.visualVersion).toBe(2);
    expect(provenance.portraits).toHaveLength(catalog.chassis.size);
    for (const chassis of catalog.chassis.values()) {
      const design = [...catalog.designs.values()].find(candidate => candidate.chassisId === chassis.id)!;
      const portrait = provenance.portraits.find(candidate => candidate.id === chassis.id)!;
      expect(portrait.designId, chassis.name).toBe(design.id);
      expect(portrait.mounts, chassis.name).toEqual(design.mounts.map(({ weaponId, location }) => ({ weaponId, location })));
      expect([portrait.width, portrait.height], chassis.name).toEqual([640, 720]);
      expect(machinePortraitSource(chassis.id), chassis.name).toBeTruthy();
    }
  });

  it('identifies static equipment art without implying that a custom refit changes the portrait', () => {
    const chassis = catalog.chassis.get('sentinel_snl2')!;
    const html = renderToStaticMarkup(createElement(MachinePortrait, { chassis }));
    expect(html).toContain('Sentinel chassis portrait');
    expect(html).toContain('Chassis portrait · standard equipment');
    expect(html).not.toContain('canvas');
  });
});
