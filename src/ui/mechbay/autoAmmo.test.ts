import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Design } from '../../schema/design';
import { bestAmmoLocation } from './autoFit';
import { evaluateEdit } from './editPreview';

function sentinel(): Design {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel fixture');
  return structuredClone(design);
}

/** The two steps the bay now performs for the player, in the order it does them. */
function fitWithFeed(design: Design, weaponId: string, location: 'left_torso' | 'left_arm') {
  const install = evaluateEdit(catalog, design, { type: 'install_weapon', weaponId, location });
  if (install.status !== 'needs_ammo') return { install, stow: null, berth: null };

  const berth = bestAmmoLocation(catalog, install.nextDesign, install.continuation.locations);
  if (berth === null) return { install, stow: null, berth: null };

  return {
    install,
    berth,
    stow: evaluateEdit(catalog, install.nextDesign, {
      type: 'add_ammo',
      weaponId: install.continuation.weaponId,
      location: berth,
    }),
  };
}

describe('fitting a gun that needs feeding', () => {
  it('asks for an ammunition bin rather than accepting a dry gun', () => {
    const install = evaluateEdit(catalog, sentinel(), {
      type: 'install_weapon',
      weaponId: 'srm2',
      location: 'left_torso',
    });
    expect(install.status).toBe('needs_ammo');
    if (install.status !== 'needs_ammo') return;
    expect(install.continuation.weaponId).toBe('srm2');
    expect(install.continuation.locations.length).toBeGreaterThan(0);
  });

  it('stows the first ton automatically and lands on a fed gun', () => {
    const { install, stow, berth } = fitWithFeed(sentinel(), 'srm2', 'left_torso');

    expect(install.status).toBe('needs_ammo');
    expect(berth).not.toBeNull();
    expect(stow?.status).toBe('applied');

    const fed = stow?.nextDesign;
    expect(fed?.mounts.some((mount) => mount.weaponId === 'srm2')).toBe(true);
    expect(fed?.ammo.some((bin) => bin.weaponId === 'srm2' && bin.tons > 0)).toBe(true);
  });

  it('clears the dry-weapon complaint the bare mount would have left', () => {
    const { install, stow } = fitWithFeed(sentinel(), 'srm2', 'left_torso');

    // The gun alone is a dry mount; that is precisely the blocker players used
    // to have to clear by hand, so assert it was there before crediting the fix.
    expect(install.report.issues.map((issue) => issue.code)).toContain('dry_weapon');
    expect((stow?.report.issues ?? []).map((issue) => issue.code)).not.toContain('dry_weapon');
  });

  it('does not ask for a bin when the gun feeds itself', () => {
    const install = evaluateEdit(catalog, sentinel(), {
      type: 'install_weapon',
      weaponId: 'medium_laser',
      location: 'centre_torso',
    });
    expect(install.status).not.toBe('needs_ammo');
  });
});
