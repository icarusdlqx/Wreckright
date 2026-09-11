/** Reproducible clean/costly campaign ledgers built from the live campaign systems. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getCatalog } from '../src/schema/load';
import type { UnitResult, BattleResult } from '../src/sim/world';
import { acceptContract, advanceDays, availableNodes, negotiationOptions, resolveMission, startCampaign } from '../src/campaign/campaign';
import { deploymentPlan, prepareDeployment, type DeployablePair } from '../src/campaign/deployment';
import { buyPart, partMarketListings, storeItemValueOf } from '../src/campaign/market';
import { estimateRepair, pristineCondition, startRepair } from '../src/campaign/repair';
import { campaignRouteForRevision } from '../src/campaign/campaignRoute';

const catalog = getCatalog();
const output = process.env.ECONOMY_AUDIT_OUT ?? 'docs/review/release-audit/campaign-economy.md';
type Scenario = 'clean' | 'costly';
type RoutePlan = 'main only' | 'with optional work';

function mainNodeIds(campaignId: string): Set<string> {
  const campaign = catalog.campaigns.get(campaignId)!;
  const route = campaignRouteForRevision(campaign, campaign.contentRevision)!;
  const byId = new Map(route.nodes.map((node) => [node.id, node]));
  const ids = new Set<string>();
  const visit = (id: string): void => {
    if (ids.has(id)) return;
    ids.add(id);
    for (const required of byId.get(id)?.requires ?? []) visit(required);
  };
  visit(route.victoryNodeId);
  return ids;
}

function playerUnit(pair: DeployablePair, id: number, scenario: Scenario): UnitResult {
  const condition = structuredClone(pair.mech.condition);
  if (scenario === 'costly') {
    for (const part of Object.values(condition)) {
      part.armour = Math.floor(part.armour / 2);
      part.rearArmour = Math.floor(part.rearArmour / 2);
    }
    if (id === 1) condition.left_arm = { armour: 0, rearArmour: 0, internal: 0, destroyed: true };
  }
  return {
    id, team: 0, name: pair.mech.design.name, designId: pair.mech.design.id,
    pilotId: pair.pilot.templateId, alive: true, killMethod: null, pilotDead: false,
    pilotWounds: 0, pilotEjected: false, withdrew: false, legged: false,
    damageDealt: 300, damageTaken: scenario === 'clean' ? 0 : 250, shotsFired: 24,
    shotsHit: 14, ammoSpent: 4, heatPeak: 28, kills: id === 1 ? 1 : 0, condition,
  };
}

function enemyUnit(missionId: string, id: number): UnitResult | null {
  const mission = catalog.missions.get(missionId);
  const source = mission?.lances.find((lance) => lance.team !== 0)?.units[0];
  const design = source === undefined ? undefined : catalog.designs.get(source.designId);
  const pilot = source === undefined ? undefined : catalog.pilots.get(source.pilotId);
  if (design === undefined || pilot === undefined) return null;
  const condition = pristineCondition(catalog, design);
  condition.centre_torso = { armour: 0, rearArmour: 0, internal: 0, destroyed: true };
  return {
    id, team: 1, name: design.name, designId: design.id, pilotId: pilot.id,
    alive: false, killMethod: 'centre_torso', pilotDead: false, pilotWounds: 1,
    pilotEjected: false, withdrew: false, legged: false, damageDealt: 100,
    damageTaken: 500, shotsFired: 10, shotsHit: 4, ammoSpent: 2, heatPeak: 20,
    kills: 0, condition,
  };
}

function victory(missionId: string, lance: DeployablePair[], scenario: Scenario): BattleResult {
  const mission = catalog.missions.get(missionId);
  const players = lance.map((pair, index) => playerUnit(pair, index + 1, scenario));
  const enemy = enemyUnit(missionId, players.length + 1);
  return {
    seed: `economy:${scenario}:${missionId}`, missionId, missionStatus: 'success',
    missionReason: 'objectives-complete', ticks: 1, durationSeconds: 0.05,
    winner: 0, decided: true, weapons: [], units: enemy === null ? players : [...players, enemy],
    objectives: (mission?.objectives ?? []).map((objective) => ({
      id: objective.id, label: objective.label, required: objective.required,
      status: 'complete', progress: 1,
    })),
  };
}

function run(campaignId: string, scenario: Scenario, routePlan: RoutePlan) {
  const state = startCampaign(catalog, campaignId, `release-economy:${campaignId}:${scenario}`, 'regular');
  const opening = state.cbills;
  const missions = [];
  const main = mainNodeIds(campaignId);
  for (let number = 1; number <= 16 && !state.finished; number += 1) {
    const campaign = catalog.campaigns.get(campaignId)!;
    const available = new Set(availableNodes(catalog, state).map((node) => node.id));
    const node = campaign.nodes.find((candidate) => available.has(candidate.id)
      && (routePlan === 'with optional work' || main.has(candidate.id)));
    if (node === undefined) break;
    const standard = negotiationOptions(catalog, node).find((term) => term.id === 'standard')
      ?? negotiationOptions(catalog, node)[0];
    if (standard === undefined || !acceptContract(catalog, state, node.id, standard.id).ok) throw new Error(`Could not accept ${node.id}`);
    const deployment = prepareDeployment(catalog, state);
    const before = state.cbills;
    const result = resolveMission(catalog, state, victory(node.missionId, deployment.lance, scenario), deployment.lance, false);
    const afterSettlement = state.cbills;
    let repairCost = 0;
    for (const mech of state.mechs) {
      if (mech.status === 'hulk') continue;
      const quote = estimateRepair(catalog, mech);
      if (quote.days === 0 || quote.cost > state.cbills) continue;
      if (startRepair(catalog, state, mech).ok) repairCost += quote.cost;
    }
    const lastReady = state.mechs.reduce((day, mech) => Math.max(day, mech.readyOnDay), state.day);
    if (lastReady > state.day) advanceDays(catalog, state, lastReady - state.day, false);
    const listing = partMarketListings(catalog, state).sort((a, b) => a.price - b.price)[0];
    const purchase = listing !== undefined && listing.price <= state.cbills && buyPart(catalog, state, listing.id).ok
      ? `${listing.name} (${listing.price})` : 'none';
    const salvageValue = result.outcome.salvagedItems.reduce((total, item) => total + storeItemValueOf(catalog, item), 0);
    const next = availableNodes(catalog, state).find((candidate) => routePlan === 'with optional work' || main.has(candidate.id));
    const nextMission = next === undefined ? undefined : catalog.missions.get(next.missionId);
    const ready = nextMission === undefined ? { mechs: 0, pilots: state.pilots.filter((pilot) => !pilot.dead).length }
      : prepareSafe(state, nextMission.id);
    if (nextMission !== undefined && ready.mechs === 0) {
      throw new Error(`${campaignId} cannot field the next main cap after ${node.id}`);
    }
    missions.push({ number, mission: node.name, before, payout: result.outcome.payout,
      payroll: Math.max(0, before + result.outcome.payout - afterSettlement),
      salvage: `${result.outcome.salvagedItems.reduce((sum, item) => sum + item.count, 0)} parts (${salvageValue} value)`,
      rewards: result.outcome.campaignRewards?.map((reward) => reward.label).join('; ') || 'none',
      repairCost, purchase, after: state.cbills,
      ready: `${ready.mechs} mechs / ${ready.pilots} pilots`,
      next: nextMission === undefined ? 'campaign complete' : `${next.name}: ${nextMission.dropTonnage ?? 'open'}t / ${nextMission.maxPlayerUnits ?? 'open'}` });
  }
  if (!state.finished || !state.won) throw new Error(`${campaignId} ${routePlan} did not reach its ending`);
  return { campaignId, faction: catalog.campaigns.get(campaignId)?.presentation.title ?? campaignId,
    scenario, routePlan, opening, missions, closing: state.cbills };
}

function prepareSafe(state: ReturnType<typeof startCampaign>, missionId: string): { mechs: number; pilots: number } {
  const plan = deploymentPlan(catalog, state, missionId);
  return { mechs: plan.pairs.length, pilots: state.pilots.filter((pilot) => !pilot.dead && pilot.injuredUntilDay <= state.day).length };
}

const ledgers = ['border_dispute', 'aurelian_recall'].flatMap((campaignId) =>
  (['main only', 'with optional work'] as const).flatMap((routePlan) =>
    (['clean', 'costly'] as const).map((scenario) => run(campaignId, scenario, routePlan))));
const lines = ['# Campaign economy audit', '',
  'Each ledger follows a deterministic playable route on standard terms. Main-only runs skip every optional posting; optional-work runs take available side postings before continuing. Clean runs return without damage; costly runs return at half armour and replace one arm. Payouts, salvage, repairs, payroll, market stock and campaign rewards all use live game systems.', ''];
for (const ledger of ledgers) {
  lines.push(`## ${ledger.faction} — ${ledger.routePlan} — ${ledger.scenario} victories`, '',
    `Opening funds: **${ledger.opening.toLocaleString()} C** · Closing funds: **${ledger.closing.toLocaleString()} C**`, '',
    '| # | Mission | Before | Payout | Payroll | Salvage | Guaranteed reward | Repairs | Purchase | After | Ready crew | Next cap |',
    '| --- | --- | ---: | ---: | ---: | --- | --- | ---: | --- | ---: | --- | --- |',
    ...ledger.missions.map((entry) => `| ${entry.number} | ${entry.mission} | ${entry.before} | ${entry.payout} | ${entry.payroll} | ${entry.salvage} | ${entry.rewards} | ${entry.repairCost} | ${entry.purchase} | ${entry.after} | ${entry.ready} | ${entry.next} |`), '');
}
lines.push('## Reading the result', '',
  '- Linewrought begins with more working capital and can replenish its locally supplied catalogue through the yard.',
  '- Aurelian Stock pays more to restore advanced frames and relies on mission grants or salvage for scarce proprietary parts.',
  '- The costly route is the solvency check: repairs remain consequential without making the next authored deployment impossible.',
  '- A failed authored contract returns to the board after the configured recovery delay and charge. A company can sell surplus equipment or hulls, use Linewrought side work where available, or rebuild one retained hulk; retirement still requires an explicit decision.',
  '- Cross-faction salvage keeps its original heat, ammunition and replacement constraints. Guaranteed milestone weapons add usable combinations without removing the broad demo crate.', '');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${lines.join('\n').trimEnd()}\n`);
console.log(output);
for (const ledger of ledgers) console.log(`${ledger.faction} ${ledger.routePlan} ${ledger.scenario}: ${ledger.missions.length} missions, ${ledger.opening} -> ${ledger.closing}`);
