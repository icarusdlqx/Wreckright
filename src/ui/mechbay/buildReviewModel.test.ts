import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import type { Design } from '../../schema/design';
import { validateDesign } from '../../schema/designValidation';
import { computeHeatProfile, computeLoadout } from '../../sim/loadout';
import { buildReviewSummary } from './buildReviewModel';

function stock(): Design {
  const design = catalog.designs.get('sentinel_brawler');
  if (design === undefined) throw new Error('missing Sentinel design');
  return structuredClone(design);
}

describe('build review model', () => {
  it('summarises a legal build from the same construction and heat outputs used by the bay', () => {
    const design = stock();
    const before = structuredClone(design);
    const loadout = computeLoadout(catalog, design);
    const heat = computeHeatProfile(catalog, design);
    const review = buildReviewSummary(catalog, design, loadout, heat);

    expect(design).toEqual(before);
    expect(review.legal).toBe(true);
    expect(review.issueCount).toBe(0);
    expect(review.issueGroups).toEqual([]);
    expect(review.nextTab).toBeNull();
    expect(review.nextAction).toContain('Ready to commit');
    expect(review.metrics.map((metric) => metric.label)).toEqual([
      'Tonnage',
      'Slots',
      'Armour',
      'Cooling',
    ]);
    expect(review.metrics.find((metric) => metric.id === 'tonnage')?.value)
      .toBe(`${loadout.usedWeight.toFixed(1)} / ${loadout.tonnage}t`);
    expect(review.metrics.find((metric) => metric.id === 'cooling')?.detail)
      .toContain(design.heatSinks.toString());
  });

  it('groups weapons and shared ammunition bins by catalogued item', () => {
    const design = stock();
    const review = buildReviewSummary(
      catalog,
      design,
      computeLoadout(catalog, design),
      computeHeatProfile(catalog, design),
    );

    expect(review.weapons.find((line) => line.id === 'medium_laser')).toEqual({
      id: 'medium_laser',
      label: 'Medium Laser ×3',
      detail: 'Left arm, Centre torso',
    });
    expect(review.ammunition.find((line) => line.id === 'ac5')?.detail)
      .toMatch(/^1t · \d+ rounds · 1 bin · Right torso$/);
  });

  it('keeps structured validator issues grouped with a concrete correction and destination', () => {
    const design = stock();
    design.ammo = [{ weaponId: 'medium_laser', location: 'head', tons: 1 }];
    const chassis = catalog.chassis.get(design.chassisId);
    if (chassis === undefined) throw new Error('missing Sentinel chassis');
    design.armour.head = chassis.armourMax.head + 1;
    const review = buildReviewSummary(
      catalog,
      design,
      computeLoadout(catalog, design),
      computeHeatProfile(catalog, design),
    );

    expect(review.legal).toBe(false);
    expect(review.issueCount).toBeGreaterThanOrEqual(4);
    expect(review.issueGroups.map((group) => group.component)).toEqual([
      'weapon',
      'ammo',
      'equipment',
      'armour',
    ]);
    const ammoIssue = review.issueGroups
      .find((group) => group.component === 'ammo')?.issues[0];
    expect(ammoIssue).toMatchObject({
      code: 'energy_ammo',
      source: 'loadout',
      component: 'ammo',
      location: 'head',
      locationLabel: 'Head',
    });
    expect(ammoIssue?.action).toContain('Remove this bin');
    expect(review.nextTab).toBe('loadout');
    expect(review.nextAction).toContain('Open Loadout');
  });

  it('routes cooling and armour-only corrections to the systems workspace', () => {
    const design = stock();
    const chassis = catalog.chassis.get(design.chassisId);
    if (chassis === undefined) throw new Error('missing Sentinel chassis');
    design.armour.head = chassis.armourMax.head + 1;
    const review = buildReviewSummary(
      catalog,
      design,
      computeLoadout(catalog, design),
      computeHeatProfile(catalog, design),
    );

    expect(review.issueGroups.map((group) => group.component)).toEqual(['armour']);
    expect(review.nextTab).toBe('armour');
    expect(review.nextAction).toContain('Open Armour & Cooling');
  });

  it('does not count advisory notes as build-blocking issues', () => {
    const design = stock();
    const containment = design.equipment.find((fit) => fit.equipmentId === 'case');
    if (containment === undefined) throw new Error('missing containment fixture');
    containment.location = 'head';
    const chassis = catalog.chassis.get(design.chassisId);
    if (chassis === undefined) throw new Error('missing Sentinel chassis');
    design.armour.head = chassis.armourMax.head + 1;
    const review = buildReviewSummary(
      catalog,
      design,
      computeLoadout(catalog, design),
      computeHeatProfile(catalog, design),
    );
    const blockingCount = validateDesign(catalog, design).issues
      .filter((issue) => issue.severity === 'error').length;

    expect(review.legal).toBe(false);
    expect(review.issueCount).toBeGreaterThan(blockingCount);
    expect(review.verdictDetail).toBe(
      `${blockingCount} ${blockingCount === 1 ? 'issue blocks' : 'issues block'} this loadout.`,
    );
  });
});
