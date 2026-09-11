import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../schema/load';
import { LOCATIONS } from '../../schema/common';
import { LoadoutMap } from './LoadoutMap';

const catalog = loadCatalog();
const render = (design: Parameters<typeof LoadoutMap>[0]['design']) =>
  renderToStaticMarkup(createElement(LoadoutMap, { catalog, design }));

describe('fitted weapon map', () => {
  it('shows every actual stock weapon with its artwork, metrics and eight location capacities', () => {
    const walkers = [...catalog.chassis.values()].filter((chassis) => chassis.frame === 'mech');
    expect(walkers).toHaveLength(16);
    for (const chassis of walkers) {
      const design = [...catalog.designs.values()].find((candidate) => candidate.chassisId === chassis.id)!;
      const html = render(design);
      expect((html.match(/data-kind="weapon"/g) ?? []).length).toBe(design.mounts.length);
      expect((html.match(/class="weapon-glyph/g) ?? []).length).toBe(design.mounts.length);
      for (const location of LOCATIONS) {
        expect(html).toContain(`data-location="${location}"`);
      }
      expect((html.match(/data-testid="rack-capacity"/g) ?? []).length).toBe(8);
      expect(html).toContain('damage/s');
      expect(html).toContain('m range');
      expect(html).toContain('heat/s');
    }
  });

  it('follows an edited weapon location and warns when its ammunition is removed', () => {
    const design = structuredClone(catalog.designs.get('cairn_battery')!);
    const weapon = design.mounts.find((mount) => catalog.weapons.get(mount.weaponId)!.ammoPerTon !== null)!;
    weapon.location = 'head';
    design.ammo = [];
    const html = render(design);
    const head = html.slice(html.indexOf('data-location="head"'), html.indexOf('</section>'));
    expect(head).toContain(`data-part-id="${weapon.weaponId}"`);
    expect(head).toContain('Needs ammunition — no matching bin fitted');
    expect(html).not.toContain('shared rounds on this mech');
  });

  it('shows the saved firing mode and its actual damage rate', () => {
    const design = structuredClone(catalog.designs.get('sentinel_brawler')!);
    design.mounts = [{ weaponId: 'lbx_ac10', location: 'right_arm', modeId: 'slug' }];
    const slug = render(design);
    expect(slug).toContain('Slug mode');
    expect(slug).toContain('4.4 damage/s');
    design.mounts[0]!.modeId = 'cluster';
    const cluster = render(design);
    expect(cluster).toContain('Cluster mode');
    expect(cluster).toContain('4 damage/s');
    expect(cluster).not.toContain('4.4 damage/s');
  });

  it('accounts for ammunition and equipment boxes as well as weapons', () => {
    const design = catalog.designs.get('cairn_battery')!;
    const html = render(design);
    expect((html.match(/data-kind="ammo"/g) ?? []).length).toBe(design.ammo.length);
    expect((html.match(/data-kind="equipment"/g) ?? []).length).toBe(design.equipment.length);
    const expected = design.mounts.reduce((sum, mount) => sum + catalog.weapons.get(mount.weaponId)!.slots, 0)
      + design.ammo.reduce((sum, bin) => sum + Math.max(1, Math.round(bin.tons * catalog.rules.construction.ammoSlotsPerTon)), 0)
      + design.equipment.reduce((sum, fit) => sum + catalog.equipment.get(fit.equipmentId)!.slots, 0);
    const shown = [...html.matchAll(/data-box-count="(\d+)"/g)].reduce((sum, match) => sum + Number(match[1]), 0);
    expect(shown).toBe(expected);
    expect(html).toContain('rounds in this bin');
  });
});
