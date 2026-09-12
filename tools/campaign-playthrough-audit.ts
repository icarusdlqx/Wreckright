/** Full live-simulation campaign routes used by the release verification. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  acceptContract,
  advanceDays,
  availableNodes,
  negotiationOptions,
  runMission,
  startCampaign,
  standDownCampaign,
} from '../src/campaign/campaign';
import { fitFromStore, planFit } from '../src/campaign/refit';
import { estimateRepair, startRepair } from '../src/campaign/repair';
import { availableHires, hirePilot } from '../src/campaign/roster';
import { deserialiseCampaign, serialiseCampaign } from '../src/campaign/save';
import { isPilotAvailable, type CampaignState } from '../src/campaign/types';
import { needsCrewStandDown } from '../src/campaign/crewRecovery';
import { getCatalog } from '../src/schema/load';

const catalog = getCatalog();
const output = process.env.CAMPAIGN_PLAYTHROUGH_OUT ??
  'docs/review/release-audit/campaign-playthrough.md';
let lastFailure = 'not started';
const failedAttempts: string[] = [];

interface RouteDefinition {
  campaignId: string;
  ending: string;
  nodes: string[];
}

interface MissionRecord {
  nodeId: string;
  missionId: string;
  won: boolean;
  seconds: number;
  casualties: string[];
  lost: string[];
  day: number;
  cbills: number;
}

interface RouteRecord {
  route: RouteDefinition;
  seed: string;
  missions: MissionRecord[];
  refit: string;
  closingCbills: number;
}

const lineSpine = [
  'militia_raid', 'recovery_window', 'workshop_defence', 'pass_skirmish',
  'foundry_sweep_node', 'shale_overwatch_node', 'ridge_hold',
];
const aurelianSpine = [
  'first_warrant', 'cutbank_attestation', 'sarn_inventory', 'root_exchange',
  'quarry_receipt', 'conduit_injunction', 'barrow_warrant',
];
const routes: RouteDefinition[] = [
  { campaignId: 'border_dispute', ending: 'depot_burn', nodes: [...lineSpine, 'depot_burn'] },
  { campaignId: 'border_dispute', ending: 'depot_take', nodes: [...lineSpine, 'depot_take'] },
  { campaignId: 'aurelian_recall', ending: 'continuance_export', nodes: [...aurelianSpine, 'continuance_export'] },
  { campaignId: 'aurelian_recall', ending: 'local_stewardship', nodes: [...aurelianSpine, 'local_stewardship'] },
];

function restore(state: CampaignState): CampaignState {
  const result = deserialiseCampaign(serialiseCampaign(state), catalog);
  if (result.state === null) throw new Error(result.error ?? 'campaign save did not reload');
  return result.state;
}

function oppositeFactionRefit(state: CampaignState): string {
  const companyFaction = catalog.campaigns.get(state.campaignId)?.presentation.faction;
  for (const stock of state.store) {
    if (stock.kind !== 'weapon' || stock.count < 1) continue;
    const weapon = catalog.weapons.get(stock.itemId);
    if (weapon === undefined || weapon.faction === companyFaction) continue;
    for (const mech of state.mechs) {
      const plan = planFit(catalog, mech.design, weapon.id);
      if (plan === null) continue;
      const result = fitFromStore(catalog, state, mech, weapon.id);
      if (!result.ok) throw new Error(result.reason ?? 'opposing faction refit failed');
      return `${weapon.name} fitted to ${mech.design.name} ${result.location ?? ''}`.trim();
    }
  }
  throw new Error(`${state.campaignId} has no usable opposing faction demo weapon`);
}

function recoverCompany(state: CampaignState): void {
  for (const mech of state.mechs) {
    const estimate = estimateRepair(catalog, mech);
    if (estimate.days > 0 && estimate.cost <= state.cbills) startRepair(catalog, state, mech);
  }
  const readyDay = state.mechs.reduce(
    (day, mech) => mech.status === 'repairing' ? Math.max(day, mech.readyOnDay) : day,
    state.day,
  );
  if (readyDay > state.day) advanceDays(catalog, state, readyDay - state.day);
  const readyMechs = state.mechs.filter((mech) => mech.status !== 'hulk' && mech.readyOnDay <= state.day).length;
  while (state.pilots.filter((pilot) => isPilotAvailable(state, pilot)).length < readyMechs) {
    const recruit = availableHires(catalog, state)[0];
    if (recruit === undefined || !hirePilot(catalog, state, recruit.id).ok) break;
  }
  state.deploymentSelection = null;
  state.deploymentSeats = null;
}

function attempt(route: RouteDefinition, seed: string): RouteRecord | null {
  let state = startCampaign(catalog, route.campaignId, seed, 'regular');
  const refit = oppositeFactionRefit(state);
  state = restore(state);
  const missions: MissionRecord[] = [];
  for (const nodeId of route.nodes) {
    let won = false;
    for (let retry = 0; retry < 4 && !won; retry += 1) {
      recoverCompany(state);
      const node = availableNodes(catalog, state).find((candidate) => candidate.id === nodeId);
      if (node === undefined) {
        lastFailure = `${nodeId}: contract unavailable`;
        return null;
      }
      const terms = negotiationOptions(catalog, node).find((option) => option.id === 'fee_first')
        ?? negotiationOptions(catalog, node)[0];
      if (terms === undefined || !acceptContract(catalog, state, nodeId, terms.id).ok) {
        lastFailure = `${nodeId}: contract could not be accepted`;
        return null;
      }
      if (needsCrewStandDown(catalog, state)) {
        const recovery = standDownCampaign(catalog, state);
        if (!recovery.ok) { lastFailure = recovery.reason; return null; }
        console.log(`${seed}: ${nodeId}: forfeited a contract to recover the entirely wounded crew`);
        state = restore(state);
        continue;
      }
      let result;
      try {
        result = runMission(catalog, state);
      } catch (error) {
        lastFailure = `${nodeId}: ${error instanceof Error ? error.message : String(error)}`;
        return null;
      }
      missions.push({
        nodeId,
        missionId: result.battle.missionId,
        won: result.outcome.won,
        seconds: result.battle.durationSeconds,
        casualties: result.outcome.pilotCasualties,
        lost: result.outcome.mechsLost,
        day: state.day,
        cbills: state.cbills,
      });
      state = restore(state);
      won = result.outcome.won;
      if (!won) {
        const objectives = result.battle.objectives
          .filter((objective) => objective.required)
          .map((objective) => `${objective.id}=${objective.status}`)
          .join(', ');
        lastFailure = `${nodeId}: ${result.battle.missionReason} (${objectives})`;
      }
    }
    if (!won) return null;
  }
  if (!state.finished || !state.won || !state.completedNodes.includes(route.ending)) {
    lastFailure = `${route.ending}: route did not close`;
    return null;
  }
  return { route, seed, missions, refit, closingCbills: state.cbills };
}

function verify(route: RouteDefinition): RouteRecord {
  const attempts = Number(process.env.CAMPAIGN_PLAYTHROUGH_ATTEMPTS ?? 32);
  for (let index = 0; index < attempts; index += 1) {
    const seed = `release-live-${route.ending}-${index}`;
    const result = attempt(route, seed);
    if (result !== null) return result;
    failedAttempts.push(`${seed}: ${lastFailure}`);
    if (process.env.CAMPAIGN_PLAYTHROUGH_TRACE === '1') console.log(`${seed}: ${lastFailure}`);
  }
  throw new Error(`${route.campaignId}/${route.ending} did not finish in the bounded seed set`);
}

const selectedRoutes = process.env.CAMPAIGN_ENDING === undefined
  ? routes
  : routes.filter((route) => route.ending === process.env.CAMPAIGN_ENDING);
if (selectedRoutes.length === 0) throw new Error('CAMPAIGN_ENDING does not name a route');
const records = selectedRoutes.map(verify);
const lines = [
  '# Campaign live playthrough',
  '',
  'These routes use the real tactical battle simulation and campaign settlement. Each operation begins with repairs and relief hiring when needed, and every field report is saved and reloaded before the next contract. Optional contracts are deliberately skipped; a failed main contract is repaired and retried through the normal recovery rules.',
  '',
];
for (const record of records) {
  const faction = catalog.campaigns.get(record.route.campaignId)?.presentation.title ?? record.route.campaignId;
  lines.push(
    `## ${faction} — ${record.route.ending}`,
    '',
    `Seed: \`${record.seed}\` · Cross-faction refit: ${record.refit} · Closing funds: ${record.closingCbills.toLocaleString()} C`,
    '',
    '| # | Operation | Result | Battle time | Casualties | Lost machines | Day | Funds |',
    '| --- | --- | --- | ---: | --- | --- | ---: | ---: |',
    ...record.missions.map((mission, index) =>
      `| ${index + 1} | ${mission.nodeId} (${mission.missionId}) | ${mission.won ? 'win' : 'loss'} | ${mission.seconds.toFixed(1)}s | ${mission.casualties.join(', ') || 'none'} | ${mission.lost.join(', ') || 'none'} | ${mission.day} | ${mission.cbills} |`),
    '',
  );
}
lines.push(
  '## Unsuccessful attempts', '',
  'This is a bounded completion audit, not an unbeaten first-attempt playthrough or a difficulty study. Failed runs are retained below rather than hidden by the seed search.', '',
  ...failedAttempts.map(failure => `- ${failure}`), '',
  '## Coverage',
  '',
  '- Both factions complete their eight-operation main routes with optional work skipped.',
  '- Both endings for each faction are resolved from a real battle.',
  '- Opposing-faction weapons are fitted through the same campaign store and refit code used by the mechbay.',
  '- The modified loadout and every later campaign state survive JSON export and import.',
  '- Damage, injuries, deaths and lost equipment remain whatever the tactical simulation produces; the company must repair and recover before the next drop.',
  '',
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, lines.join('\n'));
console.log(output);
for (const record of records) {
  const wins = record.missions.filter((mission) => mission.won).length;
  console.log(`${record.route.campaignId}/${record.route.ending}: ${record.seed}, ${wins} wins from ${record.missions.length} live battles, ${record.closingCbills} C`);
}
