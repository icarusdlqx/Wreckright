import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { TORSO_LOCATIONS, type Design } from '../../schema/design';
import { armourFacesForDesign } from '../../sim/designArmour';
import { LOCATIONS } from '../../schema/common';
import { computeLoadout } from '../../sim/loadout';
import { ArmourWorkbench, armourPreviewEndHandlers } from './ArmourWorkbench';
import {
  applyRearArmourPreset,
  applyRememberedArmourPosture,
  designArmourLocations,
  isArmourUnderMedian,
  selectedRearArmourPreset,
  setLocationPaidArmour,
  setPaidArmourTotal,
  setTorsoRearArmour,
  spendRemainingTonnage,
  stockArmourMediansForClass,
} from './armourWorkbenchModel';

function stock(id: string): Design {
  const design = catalog.designs.get(id);
  if (design === undefined) throw new Error(`missing design ${id}`);
  return structuredClone(design);
}

function render(id: string): string {
  const design = stock(id);
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) throw new Error(`missing chassis ${design.chassisId}`);
  return renderToStaticMarkup(createElement(ArmourWorkbench, {
    catalog,
    chassis,
    design,
    loadout: computeLoadout(catalog, design),
    onApply: () => undefined,
  }));
}

function elementWithTestId(html: string, testId: string, closingTag: string): string {
  const start = html.lastIndexOf('<', html.indexOf(`data-testid="${testId}"`));
  if (start < 0) throw new Error(`missing ${testId}`);
  const end = html.indexOf(closingTag, start);
  return html.slice(start, end + closingTag.length);
}

describe('armour workbench model', () => {
  it('finds stock medians by class without counting inactive frame locations', () => {
    const medians = stockArmourMediansForClass(catalog, 'medium');

    expect(medians.left_torso).toBe(49.5);
    expect(medians.right_torso).toBe(49.5);
    expect(medians.left_arm).toBe(35);
    expect(medians.right_arm).toBe(35);
    expect(medians.left_leg).toBe(46);
    expect(medians.right_leg).toBe(46);
  });

  it('returns null for a location with no active stock cohort', () => {
    const inactiveArms = new Map(
      ['drover_carrier', 'redoubt_emplacement'].map((id) => [id, stock(id)]),
    );
    const medians = stockArmourMediansForClass(
      { ...catalog, designs: inactiveArms },
      'medium',
    );

    expect(medians.left_arm).toBeNull();
    expect(medians.right_arm).toBeNull();
    expect(medians.left_torso).toBe(54);
  });

  it('only marks armour strictly below a stock median', () => {
    expect(isArmourUnderMedian(49, 49.5)).toBe(true);
    expect(isArmourUnderMedian(49.5, 49.5)).toBe(false);
    expect(isArmourUnderMedian(50, 49.5)).toBe(false);
    expect(isArmourUnderMedian(0, null)).toBe(false);
  });

  it('spreads an exact paid total over active locations without mutation or rounding loss', () => {
    const original = stock('sentinel_brawler');
    const before = structuredClone(original);
    const next = setPaidArmourTotal(catalog, original, 137);

    expect(original).toEqual(before);
    expect(Object.values(next.armour).reduce((sum, points) => sum + points, 0)).toBe(137);
    for (const location of designArmourLocations(catalog, next)) {
      const faces = armourFacesForDesign(catalog.rules.construction, next, location);
      expect(faces.front + faces.rear, location).toBe(next.armour[location]);
    }
  });

  it('never allocates paid armour to vehicle or emplacement ghost locations', () => {
    const courser = setPaidArmourTotal(catalog, stock('courser_patrol'), 40);
    expect(courser.armour.left_arm).toBe(0);
    expect(courser.armour.right_arm).toBe(0);
    expect(courser.armour.left_leg).toBeGreaterThan(0);

    const redoubt = spendRemainingTonnage(catalog, stock('redoubt_emplacement'));
    for (const location of ['left_arm', 'right_arm', 'left_leg', 'right_leg'] as const) {
      expect(redoubt.armour[location], location).toBe(0);
    }
  });

  it('moves exact torso points rearward without changing paid armour', () => {
    const design = stock('sentinel_brawler');
    const paidBefore = Object.values(design.armour).reduce((sum, points) => sum + points, 0);
    const otherRear = armourFacesForDesign(
      catalog.rules.construction,
      design,
      'left_torso',
    ).rear;
    const next = setTorsoRearArmour(catalog, design, 'centre_torso', 9);
    const faces = armourFacesForDesign(
      catalog.rules.construction,
      next,
      'centre_torso',
    );

    expect(faces.rear).toBe(9);
    expect(faces.front + faces.rear).toBe(next.armour.centre_torso);
    expect(next.rearArmour?.left_torso).toBe(otherRear);
    expect(Object.values(next.armour).reduce((sum, points) => sum + points, 0)).toBe(paidBefore);
  });

  it('uses authored presets and recognises legacy balanced designs', () => {
    const design = stock('sentinel_brawler');
    expect(selectedRearArmourPreset(catalog, design)).toBe('balanced');

    const guarded = applyRearArmourPreset(catalog, design, 'rear_guard');
    expect(selectedRearArmourPreset(catalog, guarded)).toBe('rear_guard');
    for (const location of TORSO_LOCATIONS) {
      const faces = armourFacesForDesign(catalog.rules.construction, guarded, location);
      expect(faces.front + faces.rear, location).toBe(guarded.armour[location]);
    }

    const respread = setPaidArmourTotal(catalog, guarded, 137);
    expect(selectedRearArmourPreset(catalog, respread)).toBe('rear_guard');
  });

  it('keeps exact rear allocation legal when one paid location shrinks', () => {
    let design = applyRearArmourPreset(catalog, stock('sentinel_brawler'), 'rear_guard');
    design = setLocationPaidArmour(catalog, design, 'centre_torso', 2);
    expect(design.armour.centre_torso).toBe(2);
    expect(design.rearArmour?.centre_torso).toBeLessThanOrEqual(2);
  });

  it('spends every affordable armour point instead of stranding fractional tons', () => {
    const design = stock('sentinel_brawler');
    for (const location of LOCATIONS) design.armour[location] = 0;
    design.mounts.push({ weaponId: 'ac5', location: 'left_leg' });
    const before = computeLoadout(catalog, design);
    const chassis = catalog.chassis.get(design.chassisId);
    if (chassis === undefined) throw new Error('missing Sentinel chassis');
    const nonArmourWeight = before.usedWeight - before.armourWeight;
    const affordable = Math.floor(
      Math.max(0, chassis.tonnage - nonArmourWeight)
        * catalog.rules.construction.armourPointsPerTon,
    );

    const next = spendRemainingTonnage(catalog, design);
    expect(Object.values(next.armour).reduce((sum, points) => sum + points, 0)).toBe(affordable);
  });

  it('treats rounded preset collisions as ambiguous and reapplies explicit posture intent', () => {
    const guarded = applyRearArmourPreset(catalog, stock('sentinel_brawler'), 'rear_guard');
    const empty = setPaidArmourTotal(catalog, guarded, 0);
    expect(selectedRearArmourPreset(catalog, empty)).toBeNull();

    const grown = applyRememberedArmourPosture(
      catalog,
      setPaidArmourTotal(catalog, empty, 137),
      'rear_guard',
    );
    expect(selectedRearArmourPreset(catalog, grown)).toBe('rear_guard');
  });
});

describe('armour workbench presentation', () => {
  it('makes totals, tradeoffs, exact faces, and the advanced disclosure readable', () => {
    const html = render('sentinel_brawler');
    expect(html).toContain('aria-labelledby="armour-workbench-title"');
    expect(html).toContain('Total paid armour');
    expect(html).toContain('tons of plate');
    expect(html).toContain('Front-facing');
    expect(html).toContain('thinner if flanked');
    expect(html).toContain('Balanced');
    expect(html).toContain('Rear guard');
    expect(html).toContain('Torso front');
    expect(html).toContain('Torso rear');
    expect(html).toContain('data-testid="armour-paper-doll"');
    expect(html.match(/data-testid="armour-doll-(?!slider)[^"]+"/g)).toHaveLength(8);
    expect(html).toContain('data-testid="armour-doll-slider"');
    expect(html).toContain('data-testid="armour-plate-weight"');
    expect(html).toContain('Advanced location armour');
    expect(html).toContain('Rear controls move existing torso plate');
    expect(html.match(/data-testid="rear-armour-/g)).toHaveLength(3);
    expect(html.match(/aria-pressed="(?:true|false)"/g)).toHaveLength(11);
    expect(html).toContain('<legend>Protection posture</legend>');
    expect(html).toContain('aria-label="Centre torso rear armour"');
    expect(html).toContain('aria-label="Head paid armour"');

    const balanced = elementWithTestId(html, 'armour-preset-balanced', '</button>');
    expect(balanced).toContain('aria-pressed="true"');
    expect(elementWithTestId(html, 'armour-total', '>')).toContain('aria-valuetext=');
    expect(html.match(/data-history-transaction="armour"/g)).toHaveLength(13);
  });

  it('ends a streamed armour preview on pointer, keyboard, cancellation, or blur', () => {
    let endings = 0;
    const handlers = armourPreviewEndHandlers(() => { endings += 1; });

    handlers.onPointerUp();
    handlers.onPointerCancel();
    handlers.onKeyUp();
    handlers.onBlur();

    expect(endings).toBe(4);
  });

  it('only renders armour controls reachable through each frame hit table', () => {
    const courser = render('courser_patrol');
    expect(courser).not.toContain('data-testid="armour-left_arm"');
    expect(courser).not.toContain('data-testid="armour-right_arm"');
    expect(courser).toContain('data-testid="armour-left_leg"');

    const redoubt = render('redoubt_emplacement');
    expect(redoubt).not.toContain('data-testid="armour-left_arm"');
    expect(redoubt).not.toContain('data-testid="armour-left_leg"');
    expect(redoubt).toContain('data-testid="armour-centre_torso"');
  });

  it('keeps touch targets and narrow layouts usable', () => {
    const css = readFileSync(new URL('./armourWorkbench.css', import.meta.url), 'utf8');
    expect(css).toContain('min-height: 44px;');
    expect(css).toContain('touch-action: pan-y;');
    expect(css).toContain('cursor: ew-resize;');
    expect(css).toContain('@media (max-width: 420px)');
    expect(css).toContain('(pointer: coarse) and (max-width: 1100px)');
    expect(css).toMatch(
      /@media \(max-width: 420px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\)/,
    );
  });
});
