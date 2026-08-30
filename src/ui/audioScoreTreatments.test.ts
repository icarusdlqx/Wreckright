import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { startFreshCampaign } from '../campaign/freshness';
import { fullLayerLevel } from './audioScoreGraph';
import {
  STRATEGIC_SCORE_TREATMENTS,
  campaignCultureShare,
  factionCultureShare,
  knownDesignCultureShare,
} from './audioScoreTreatments';

describe('strategic score treatments', () => {
  it('keeps the campaign on the drone and the bay on a restrained pulse', () => {
    const campaign = STRATEGIC_SCORE_TREATMENTS.campaign;
    const mechbay = STRATEGIC_SCORE_TREATMENTS.mechbay;
    expect(campaign).toEqual({ intensity: 0, level: 0.6 });
    expect(mechbay).toEqual({ intensity: 0.3, level: 0.72 });
    expect(mechbay.intensity).toBeGreaterThan(campaign.intensity);
    expect(fullLayerLevel(campaign.intensity)).toBe(0);
    expect(fullLayerLevel(mechbay.intensity)).toBe(0);
  });

  it('derives known design culture without inventing an employer faction', () => {
    const linewrought = catalog.designs.get('drover_carrier');
    const aurelian = catalog.designs.get('wisp_scout');
    if (linewrought === undefined || aurelian === undefined) {
      throw new Error('score treatment test needs both cultures');
    }
    expect(knownDesignCultureShare(catalog, [linewrought])).toBe(0);
    expect(knownDesignCultureShare(catalog, [aurelian])).toBe(1);
    expect(knownDesignCultureShare(catalog, [linewrought, aurelian, aurelian]))
      .toBeCloseTo(2 / 3);
    expect(knownDesignCultureShare(catalog, [{ chassisId: 'unknown' }])).toBeNull();
    expect(factionCultureShare('linewrought')).toBe(0);
    expect(factionCultureShare('aurelian')).toBe(1);
  });

  it('excludes campaign hulks while retaining ready and repairing machines', () => {
    const state = startFreshCampaign(
      catalog,
      'border_dispute',
      () => 'score-treatment-roster',
      () => undefined,
    );
    const aurelianDesign = catalog.designs.get('wisp_scout');
    if (aurelianDesign === undefined || state.mechs[0] === undefined) {
      throw new Error('campaign needs an Aurelian fixture');
    }
    state.mechs[0].design = structuredClone(aurelianDesign);
    const cultures = state.mechs.map((mech) =>
      catalog.chassis.get(mech.design.chassisId)?.faction ?? null);
    expect(cultures).toContain('linewrought');
    expect(cultures).toContain('aurelian');
    const expected = cultures.filter((faction) => faction === 'aurelian').length / cultures.length;
    expect(campaignCultureShare(catalog, state)).toBeCloseTo(expected);

    const aurelian = state.mechs.find((mech) =>
      catalog.chassis.get(mech.design.chassisId)?.faction === 'aurelian');
    if (aurelian === undefined) throw new Error('campaign lost its Aurelian fixture');
    aurelian.status = 'hulk';
    expect(campaignCultureShare(catalog, state)).toBeLessThan(expected);
  });
});
