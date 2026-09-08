import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { startCampaign, acceptContract, prepareDeployment } from './campaign';
import { claimDemoSupplies, demoSupplyKey, hasDemoSupplies } from './demoSupplies';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { storeCount } from './types';
import { applyCampaignRewards, earnedCampaignRewards } from './missionRewards';
import { rewardBattle } from './missionRewardFixtures';
import { checkIntegrity } from '../schema/integrity';
import type { ContentIssue } from '../schema/load';

const FACTIONS = ['border_dispute', 'aurelian_recall'] as const;

describe('demo equipment and campaign progression', () => {
  it.each(FACTIONS)('gives %s a varied crate once without charging time or credits', (id) => {
    const state = startCampaign(catalog, id, 'demo-crate');
    const campaign = catalog.campaigns.get(id)!;
    expect(state.store.filter(item => item.kind === 'weapon')).toHaveLength(12);
    expect(hasDemoSupplies(catalog, state)).toBe(true);
    expect(state.cbills).toBe(campaign.startingCbills);
    expect(state.day).toBe(campaign.startingDay);
    const before = serialiseCampaign(state);
    expect(claimDemoSupplies(catalog, state)).toBe(false);
    expect(serialiseCampaign(state)).toBe(before);
    const factions = new Set(state.store.filter(item => item.kind === 'weapon').map(item => catalog.weapons.get(item.itemId)?.faction));
    expect(factions.size).toBe(2);
    expect(storeCount(state, 'weapon', 'gauss_rifle')).toBe(0);
    expect(storeCount(state, 'weapon', 'er_ppc')).toBe(0);
    expect(storeCount(state, 'weapon', 'heavy_large_laser')).toBe(0);
  });

  it.each(FACTIONS)('lets an older %s company collect the same crate without overwriting stores or duplicating after reload', (id) => {
    const state = startCampaign(catalog, id, 'old-demo');
    state.claimedRewardIds = [];
    state.store = [{ kind: 'weapon', itemId: 'medium_laser', count: 3 }];
    state.day = 9;
    const funds = state.cbills;
    expect(claimDemoSupplies(catalog, state)).toBe(true);
    expect(storeCount(state, 'weapon', 'medium_laser')).toBe(5);
    expect(state.day).toBe(9);
    expect(state.cbills).toBe(funds);
    const restored = deserialiseCampaign(serialiseCampaign(state)).state!;
    expect(restored).not.toBeNull();
    const before = serialiseCampaign(restored);
    expect(claimDemoSupplies(catalog, restored)).toBe(false);
    expect(serialiseCampaign(restored)).toBe(before);
    expect(restored.claimedRewardIds.filter(key => key === demoSupplyKey(catalog, restored))).toHaveLength(1);
  });

  it.each([
    ['border_dispute', 'pass_skirmish', 'er_medium_laser'],
    ['border_dispute', 'shale_overwatch_node', 'gauss_rifle'],
    ['aurelian_recall', 'sarn_inventory', 'er_ppc'],
    ['aurelian_recall', 'quarry_receipt', 'heavy_large_laser'],
  ])('awards %s / %s equipment after a completed contract and only once', (id, nodeId, weaponId) => {
    const state = startCampaign(catalog, id!, 'equipment-progression');
    const node = catalog.campaigns.get(id!)!.nodes.find(entry => entry.id === nodeId)!;
    state.completedNodes = [...node.requires];
    expect(acceptContract(catalog, state, nodeId!, 'standard').ok).toBe(true);
    const deployment = prepareDeployment(catalog, state);
    const battle = rewardBattle(deployment.missionId, deployment.lance);
    const failed = earnedCampaignRewards(catalog, state, state.contract!, { ...battle, missionStatus: 'failure' }, deployment.lance.length);
    expect(failed).toEqual([]);
    const grants = earnedCampaignRewards(catalog, state, state.contract!, battle, deployment.lance.length);
    expect(grants.some(grant => grant.reward.items?.some(item => item.itemId === weaponId))).toBe(true);
    const before = storeCount(state, 'weapon', weaponId!);
    applyCampaignRewards(catalog, state, grants);
    expect(storeCount(state, 'weapon', weaponId!)).toBeGreaterThan(before);
    const claimed = serialiseCampaign(state);
    expect(applyCampaignRewards(catalog, state, grants)).toEqual([]);
    expect(serialiseCampaign(state)).toBe(claimed);
  });

  it('rejects invalid supply content before granting anything and leaves finished companies alone', () => {
    const state = startCampaign(catalog, 'border_dispute', 'invalid-crate');
    state.claimedRewardIds = [];
    const campaign = structuredClone(catalog.campaigns.get(state.campaignId)!);
    campaign.demoSupplies!.items.push({ kind: 'weapon', itemId: 'missing', count: 1 });
    const content = { ...catalog, campaigns: new Map(catalog.campaigns).set(campaign.id, campaign) };
    const issues: ContentIssue[] = [];
    checkIntegrity(content, issues);
    expect(issues.some(issue => issue.path.startsWith('demoSupplies'))).toBe(true);
    const before = serialiseCampaign(state);
    expect(() => claimDemoSupplies(content, state)).toThrow('Invalid demo supply crate');
    expect(serialiseCampaign(state)).toBe(before);
    state.finished = true;
    expect(claimDemoSupplies(catalog, state)).toBe(false);
  });
});
