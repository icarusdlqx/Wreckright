/** Run with vite-node so the same validated JSON catalogue as the game is loaded. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadCatalog } from '../src/schema/load';
import { pilotAtDifficulty } from '../src/sim/pilotDifficulty';
import { computeLoadout } from '../src/sim/loadout';
import { runBattle, type LanceEntry } from '../src/sim/world';

const catalog = loadCatalog();
const suite = process.env.FACTION_AUDIT_SUITE ?? 'reported';
const seeds = Number(process.env.FACTION_AUDIT_SEEDS ?? 6);
const output = process.env.FACTION_AUDIT_OUT ?? `reports/faction-balance/${suite}-current.json`;
if (!Number.isInteger(seeds) || seeds < 2 || seeds % 2 !== 0) {
  throw new Error('Use an even seed count of at least two so both spawn sides are represented.');
}
interface Match {
  label: string;
  line: string[];
  aurelian: string[];
  lineExperience?: string;
  aurelianExperience?: string;
}
const reported: Match = {
  label: 'reported-200-v-225',
  line: ['cairn_battery', 'cairn_battery', 'bulwark_assault'],
  aurelian: ['halberd_prime', 'halberd_prime', 'halberd_prime'],
};
const duels: Match[] = [
  ['prybar_courier', 'wisp_scout'], ['hornet_spotter', 'votive_picket'],
  ['rivet_escort', 'sentinel_brawler'], ['trestle_battery', 'falchion_duellist'],
  ['cairn_battery', 'warden_lancer'], ['bulwark_assault', 'halberd_prime'],
  ['rampart_breaker', 'obsequy_vigil'], ['colossus_siege', 'pallvault_procession'],
].map(([line, aurelian]) => {
  if (line === undefined || aurelian === undefined) throw new Error('incomplete audit pairing');
  return { label: `${line}-v-${aurelian}`, line: [line], aurelian: [aurelian] };
});
const teams: Match[] = [
  { ...reported, label: 'equal-200', aurelian: ['halberd_prime', 'halberd_prime', 'falchion_duellist'] },
  { ...reported, label: 'equal-225', line: ['rampart_breaker', 'bulwark_assault', 'bulwark_assault'] },
  { ...reported, label: 'line-veteran-aurelian-green', lineExperience: 'veteran', aurelianExperience: 'green' },
];
const matches = suite === 'reported' ? [reported] : suite === 'duels' ? duels : suite === 'teams' ? teams : null;
if (matches === null) throw new Error('Choose reported, duels or teams.');
const arenas = suite === 'reported' ? ['ridge', 'open180', 'open360'] : suite === 'duels' ? ['open180', 'open360'] : ['ridge', 'open180'];
const source = catalog.missions.get('skirmish_ridge');
const pilot = catalog.pilots.get('kessa_vale');
if (source === undefined || pilot === undefined) throw new Error('missing audit content');

function lance(ids: string[], experience = 'regular'): LanceEntry[] {
  const tier = catalog.rules.difficulty.tiers[experience];
  if (tier === undefined || pilot === undefined) throw new Error('missing audit pilot tier');
  return ids.map(id => {
    const design = catalog.designs.get(id);
    if (design === undefined) throw new Error(`missing ${id}`);
    const loadout = computeLoadout(catalog, design);
    if (!loadout.valid) throw new Error(`${id} is not legal: ${JSON.stringify(loadout.issues)}`);
    return { design, pilot: pilotAtDifficulty(pilot, 0, 0, undefined, tier.skillDelta) };
  });
}
const summaries = [];
for (const match of matches) for (const arena of arenas) {
  const mission = structuredClone(source);
  mission.startingResourcePoints = 0;
  const maps = new Map(catalog.maps);
  if (arena !== 'ridge') {
    const originalMap = catalog.maps.get(mission.mapId);
    if (originalMap === undefined) throw new Error('missing audit map');
    const map = structuredClone(originalMap);
    map.id = 'faction_audit';
    map.tiles = map.tiles.map(row => '.'.repeat(row.length));
    map.legend = { '.': 'open' };
    delete map.elevation;
    mission.mapId = map.id;
    maps.set(map.id, map);
    const gap = arena === 'open180' ? 180 : 360;
    for (const team of mission.lances) team.units.forEach((unit, index) => {
      unit.spawn = { x: 480 + (team.team === 0 ? -gap / 2 : gap / 2), y: 430 + index * 45 };
      unit.facingDegrees = team.team === 0 ? 0 : 180;
    });
  }
  const lab = { ...catalog, maps, missions: new Map(catalog.missions).set(mission.id, mission) };
  const line = lance(match.line, match.lineExperience);
  const aurelian = lance(match.aurelian, match.aurelianExperience);
  const runs = [];
  for (let index = 0; index < seeds; index += 1) {
    const lineTeam = index % 2;
    const battle = runBattle(lab, {
      seed: `faction:${index}`, missionId: mission.id, playerTeam: 0,
      playerLance: lineTeam === 0 ? line : aurelian,
      enemyLance: lineTeam === 0 ? aurelian : line,
      playerController: 'tactical', enemyController: 'tactical',
      playerDifficulty: 'regular', difficulty: 'regular',
    });
    runs.push({ lineTeam, ...battle });
  }
  const summary = {
    match, arena, seeds,
    lineWins: runs.filter(run => run.winner === run.lineTeam).length,
    aurelianWins: runs.filter(run => run.winner === 1 - run.lineTeam).length,
    draws: runs.filter(run => run.winner === null).length,
    timeouts: runs.filter(run => !run.decided).length,
    runs,
  };
  summaries.push(summary);
  console.log(`${match.label} / ${arena}: Linewrought ${summary.lineWins}, Aurelian ${summary.aurelianWins}, draws ${summary.draws}, timeouts ${summary.timeouts}`);
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ suite, seeds, controller: 'regular tactical both sides', supportPoints: 0, summaries }, null, 2) + '\n');
