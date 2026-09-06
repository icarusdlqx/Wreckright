import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { WeaponReplacementDialog } from './WeaponReplacementDialog';
import { evaluateWeaponReplacement } from './weaponReplacement';

function render(weaponId: string, overweight = false): string {
  const source = structuredClone(catalog.designs.get('sentinel_brawler'));
  if (source === undefined) throw new Error('missing Sentinel');
  source.mounts = [{ weaponId: 'machine_gun', location: 'right_torso' }];
  source.ammo = [{ weaponId: 'machine_gun', location: 'left_torso', tons: 2 }];
  if (overweight) source.heatSinks = 50;
  return renderToStaticMarkup(createElement(WeaponReplacementDialog, {
    catalog, request: { source, weaponId, index: 0 }, stocked: true, error: null,
    preview: evaluateWeaponReplacement(catalog, source, 0, weaponId),
    onConfirm: () => undefined, onCancel: () => undefined,
  }));
}

describe('weapon replacement review', () => {
  it('names the exact change and all its consequences in an accessible confirmation dialog', () => {
    const html = render('medium_laser');
    expect(html).toContain('role="dialog" aria-modal="true"');
    expect(html).toContain('aria-labelledby="bay-replacement-title"');
    expect(html).toContain('data-testid="bay-replacement-cancel"');
    expect(html).toContain('data-testid="bay-replacement-confirm"');
    expect(html).toContain('Right Torso · replacement preview');
    expect(html).toContain('Whole machine weight');
    expect(html).toContain('Weapon heat each second');
    expect(html).toContain('Net heat each second');
    expect(html).toContain('Return 1 Machine Gun to stores. Use 1 spare Medium Laser.');
    expect(html).toContain('Remove 2t Machine Gun ammunition in left torso.');
    expect(html).toContain('Undo restores the old weapon, ammo and spare counts.');
    expect(html).not.toContain('disabled=""');
  });

  it('disables confirmation for a blocked swap and explains weight without claiming it is saveable', () => {
    const blocked = render('gauss_rifle');
    expect(blocked).toContain('data-testid="bay-replacement-refusal"');
    expect(blocked).toContain('data-testid="bay-replacement-confirm" disabled=""');
    expect(blocked).not.toContain('Return 1 Machine Gun');
    const overweight = render('medium_laser', true);
    expect(overweight).toContain('overweight. Remove weight before saving or applying the refit.');
  });
});
