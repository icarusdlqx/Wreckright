import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { testWorld, unitOf } from '../../tests/support';
import { PaperDoll } from './PaperDoll';
import { snapshotUnit } from './snapshot';

describe('PaperDoll rear armour presentation', () => {
  it('keeps a zero-point torso rear face visible without adding one to a leg', () => {
    const world = testWorld('paper-doll-zero-rear');
    const unit = unitOf(world, 'sentinel_brawler');
    unit.locations.centre_torso.rearArmour = 0;
    unit.locations.centre_torso.rearArmourMax = 0;

    const locations = snapshotUnit(world, unit).locations;
    const markup = renderToStaticMarkup(createElement(PaperDoll, { locations }));

    expect(locations.centre_torso.hasRearArmourFace).toBe(true);
    expect(locations.left_leg.hasRearArmourFace).toBe(false);
    expect(markup).toContain('data-testid="doll-rear-centre_torso"');
    expect(markup).toContain('rear 0/0');
    expect(markup).not.toContain('data-testid="doll-rear-left_leg"');
    expect(markup).not.toContain('NaN');
  });
});
