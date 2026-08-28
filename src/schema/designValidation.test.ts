import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { startCampaign } from '../campaign/campaign';
import { applyRefit } from '../campaign/refit';
import { designIssues } from '../ui/mechbay/editor';
import type { Design } from './design';
import { validateDesign } from './designValidation';
import { checkIntegrity } from './integrity';
import type { Catalog, ContentIssue } from './load';

function clone(id: string): Design {
  const design = catalog.designs.get(id);
  if (design === undefined) throw new Error(`missing design ${id}`);
  return structuredClone(design);
}

describe('shared design legality', () => {
  it('locates an impossible rear allocation on the exact torso field', () => {
    const design = clone('sentinel_brawler');
    design.rearArmour = {
      centre_torso: design.armour.centre_torso + 1,
      left_torso: 0,
      right_torso: 0,
    };

    expect(validateDesign(catalog, design).issues).toContainEqual(expect.objectContaining({
      code: 'rear_armour',
      severity: 'error',
      source: 'schema',
      component: 'armour',
      location: 'centre_torso',
      path: ['rearArmour', 'centre_torso'],
    }));
  });

  it('locates armour assigned to a frame location its hit tables cannot reach', () => {
    const design = clone('courser_patrol');
    design.armour.left_arm = 1;

    expect(validateDesign(catalog, design).issues).toContainEqual(expect.objectContaining({
      code: 'armour',
      severity: 'error',
      source: 'loadout',
      component: 'armour',
      location: 'left_arm',
      path: ['armour', 'left_arm'],
    }));
  });

  it('treats a zero-ton bin as dead and rejects its dry gun', () => {
    const design = clone('sentinel_brawler');
    const bin = design.ammo.find((entry) => entry.weaponId === 'ac5');
    if (bin === undefined) throw new Error('missing AC/5 bin');
    bin.tons = 0;

    const report = validateDesign(catalog, design);
    expect(report.valid).toBe(false);
    expect(report.loadout.valid).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'dry_weapon',
      severity: 'error',
      source: 'loadout',
      component: 'weapon',
      location: 'right_arm',
      path: ['mounts'],
    }));
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'ineffective_equipment',
      severity: 'warning',
      component: 'equipment',
      location: 'right_torso',
      path: ['equipment', 0, 'location'],
    }));
  });

  it('warns about misplaced blast containment without making the build illegal', () => {
    const design = clone('sentinel_brawler');
    const containment = design.equipment.find((fit) => fit.equipmentId === 'case');
    if (containment === undefined) throw new Error('missing containment fixture');
    containment.location = 'head';

    const report = validateDesign(catalog, design);
    expect(report.valid).toBe(true);
    expect(report.loadout.valid).toBe(true);
    expect(report.issues).toContainEqual({
      code: 'ineffective_equipment',
      severity: 'warning',
      source: 'loadout',
      component: 'equipment',
      location: 'head',
      path: ['equipment', 0, 'location'],
      message: 'Blowout Cell only protects ammunition in the same location; no ammunition is fitted there',
    });
    expect(designIssues(catalog, design)).toEqual([]);
  });

  it('rejects ammunition whose weapon is not mounted', () => {
    const design = clone('sentinel_brawler');
    design.ammo.push({ weaponId: 'streak_srm6', location: 'right_torso', tons: 1 });

    expect(validateDesign(catalog, design).issues).toContainEqual(expect.objectContaining({
      code: 'orphan_ammo',
      severity: 'error',
      component: 'ammo',
      location: 'right_torso',
      path: ['ammo'],
    }));
  });

  it('rejects ammunition allocated to an energy weapon', () => {
    const design = clone('sentinel_brawler');
    design.ammo.push({ weaponId: 'medium_laser', location: 'left_torso', tons: 1 });

    expect(validateDesign(catalog, design).issues).toContainEqual(expect.objectContaining({
      code: 'energy_ammo',
      severity: 'error',
      component: 'ammo',
      location: 'left_torso',
      path: ['ammo'],
    }));
  });

  it('locates an unknown fire mode on the exact mount field', () => {
    const design = clone('redoubt_emplacement');
    const mount = design.mounts.find((entry) => entry.weaponId === 'lbx_ac10');
    if (mount === undefined) throw new Error('missing Canister Cannon mount');
    mount.modeId = 'field_improvisation';
    const index = design.mounts.indexOf(mount);

    expect(validateDesign(catalog, design).issues).toContainEqual(expect.objectContaining({
      code: 'unknown_weapon_mode',
      severity: 'error',
      source: 'schema',
      component: 'weapon',
      location: 'centre_torso',
      path: ['mounts', index, 'modeId'],
    }));
  });

  it('retains loadout and schema failures in one report', () => {
    const design = clone('sentinel_brawler');
    design.name = '';
    design.armour.head += 1;

    const report = validateDesign(catalog, design);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'armour', source: 'loadout', component: 'armour' }),
      expect.objectContaining({ code: 'invalid_schema', source: 'schema', component: 'identity' }),
    ]));
  });

  it('keeps integrity, editor and campaign refit on the same legality result', () => {
    const state = startCampaign(catalog, 'border_dispute', 'design-parity');
    const mech = state.mechs.find((entry) => entry.design.ammo.length > 0);
    if (mech === undefined) throw new Error('campaign has no ammo-fed starting design');
    const next = structuredClone(mech.design);
    const weaponId = next.ammo[0]?.weaponId;
    if (weaponId === undefined) throw new Error('campaign design has no ammo bin');
    next.ammo = next.ammo.filter((entry) => entry.weaponId !== weaponId);

    const report = validateDesign(catalog, next);
    const messages = report.issues.map((issue) => issue.message);
    const blockingMessages = report.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => issue.message);
    expect(report.valid).toBe(false);
    expect(designIssues(catalog, next)).toEqual(blockingMessages);

    const designs = new Map(catalog.designs);
    designs.set(next.id, next);
    const authored: ContentIssue[] = [];
    checkIntegrity({ ...catalog, designs } satisfies Catalog, authored);
    expect(
      authored
        .filter((issue) => issue.file === `designs/${next.id}.json`)
        .map((issue) => issue.message),
    ).toEqual(messages);

    const result = applyRefit(catalog, state, mech, next);
    expect(result).toEqual({
      ok: false,
      reason: blockingMessages[0],
      location: report.issues.find((issue) => issue.severity === 'error')?.location ?? null,
    });
  });
});
