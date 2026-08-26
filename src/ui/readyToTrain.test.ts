import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { startCampaign } from '../campaign/campaign';
import { readyToTrain } from './pilotProgression';

describe('ready to train', () => {
  it('stays quiet for a fresh company and lights up once XP is banked', () => {
    const state = startCampaign(catalog, 'border_dispute', 'train-test');
    const pilot = state.pilots[0];
    expect(pilot).toBeDefined();
    if (pilot === undefined) return;

    expect(readyToTrain(catalog, pilot)).toBe(false);

    // More than any first skill level could cost.
    pilot.xp = 100_000;
    expect(readyToTrain(catalog, pilot)).toBe(true);

    pilot.dead = true;
    expect(readyToTrain(catalog, pilot)).toBe(false);
  });
});
