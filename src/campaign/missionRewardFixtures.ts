import { catalog } from '../../tests/support';
import type { CampaignReward } from '../schema/campaignRewards';
import { acceptContract, startCampaign } from './campaign';
import { prepareDeployment, type DeployablePair } from './deployment';
import type { BattleResult } from '../sim/world';

/** Kept independent of the current opening route so content tuning cannot change the test's contract. */
export function rewardFixture(rewards: CampaignReward[] = []) {
  const campaign = catalog.campaigns.get('border_dispute')!;
  const first = campaign.nodes.find((node) => node.id === 'militia_raid')!;
  const mission = catalog.missions.get(first.missionId)!;
  const content = { ...catalog,
    campaigns: new Map([...catalog.campaigns, [campaign.id, { ...campaign, nodes: campaign.nodes.map((node) => node.id === first.id ? { ...node, rewards } : node) }]]),
    missions: new Map([...catalog.missions, [mission.id, { ...mission, dropTonnage: 2000, maxPlayerUnits: 5,
      objectives: [
        { id: 'survey', label: 'Survey the road', type: 'survive' as const, team: 0, required: true, zoneIds: [], holdSeconds: 1, resourcePoints: 0 },
        { id: 'cache', label: 'Secure the cache', type: 'survive' as const, team: 0, required: false, zoneIds: [], holdSeconds: 1, resourcePoints: 0 },
        { id: 'enemy_cache', label: 'Enemy objective', type: 'survive' as const, team: 1, required: false, zoneIds: [], holdSeconds: 1, resourcePoints: 0 },
      ],
    }]]),
  };
  const state = startCampaign(content, campaign.id, 'mission-rewards');
  const result = acceptContract(content, state, first.id, 'standard');
  if (!result.ok) throw new Error(result.reason ?? 'fixture contract failed');
  const deployment = prepareDeployment(content, state);
  return { content, state, deployment };
}

export function rewardBattle(missionId: string, pairs: DeployablePair[], overrides: Partial<BattleResult> = {}): BattleResult {
  return { seed: 'mission-rewards', missionId, missionStatus: 'success', missionReason: 'all objectives complete',
    objectives: [
      { id: 'survey', label: 'Survey the road', required: true, status: 'complete', progress: 1 },
      { id: 'cache', label: 'Secure the cache', required: false, status: 'complete', progress: 1 },
    ], ticks: 100, durationSeconds: 5, winner: 0, decided: true, weapons: [],
    units: pairs.map((pair, index) => ({
      id: index + 1, team: 0, name: pair.mech.design.name, designId: pair.mech.design.id, pilotId: pair.pilot.templateId,
      alive: true, killMethod: null, pilotDead: false, pilotWounds: 0, pilotEjected: false, withdrew: false, legged: false,
      damageDealt: 0, damageTaken: 0, shotsFired: 0, shotsHit: 0, ammoSpent: 0, heatPeak: 0, kills: 0,
      condition: structuredClone(pair.mech.condition),
    })), ...overrides };
}
