import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { computeLoadout } from '../../sim/loadout';
import type { MechLocation } from '../../schema/common';
import { LocationCard, type DropPayload } from './LocationCard';

function render(location: MechLocation, armed: DropPayload | null = null, compatible = false): string {
  const design = catalog.designs.get('sentinel_brawler');
  const chassis = catalog.chassis.get('sentinel_snl2');
  if (design === undefined || chassis === undefined) throw new Error('missing Sentinel fixture');
  return renderToStaticMarkup(createElement(LocationCard, {
    catalog,
    chassis,
    design,
    location,
    usage: computeLoadout(catalog, design).perLocation[location],
    compatible,
    armed,
    onDrop: () => undefined,
    onRemoveMount: () => undefined,
    onRemoveAmmo: () => undefined,
    onRemoveEquipment: () => undefined,
  }));
}

function cellCount(html: string, marker: string): number {
  const section = html.slice(html.indexOf(marker));
  const upTo = section.indexOf('</li>');
  return (section.slice(0, upTo).match(/rack-cell[" ]/g) ?? []).length;
}

describe('the rack', () => {
  it('gives every fitted part one cell per slot it takes', () => {
    // The Sentinel's left torso carries an SRM-6 (2 slots) and its ammo bin.
    const html = render('left_torso');
    expect(html).toContain('rack-cells');
    const srm = catalog.weapons.get('srm6');
    expect(srm).toBeDefined();
    expect(cellCount(html, 'inspect-weapon-')).toBe(srm?.slots ?? 0);
  });

  it('draws the free room as hollow cells with the count as caption', () => {
    const html = render('head');
    const free = html.slice(html.indexOf('free-slots-head'));
    expect(free).toContain('rack-cell');
    expect(free).toContain('slot free');
    expect(free).not.toContain('rack-cell--incoming');
  });

  it('previews the held part\'s footprint in the free cells', () => {
    const html = render('centre_torso', { kind: 'weapon', id: 'medium_laser' }, true);
    const free = html.slice(html.indexOf('free-slots-centre_torso'));
    const incoming = (free.slice(0, free.indexOf('</li>')).match(/rack-cell--incoming/g) ?? []).length;
    expect(incoming).toBe(catalog.weapons.get('medium_laser')?.slots ?? 0);
  });

  it('previews nothing where the held part cannot go', () => {
    const html = render('centre_torso', { kind: 'weapon', id: 'medium_laser' }, false);
    const free = html.slice(html.indexOf('free-slots-centre_torso'));
    expect(free.slice(0, free.indexOf('</li>'))).not.toContain('rack-cell--incoming');
  });
});
