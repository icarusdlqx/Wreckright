import { describe, expect, it } from 'vitest';
import { catalog } from '../../tests/support';
import { acceptContract, advanceDays, abandonContract, resolveMission, startCampaign, standDownCampaign } from './campaign';
import { prepareDeployment, type DeployablePair } from './deployment';
import { assign, availableHires, availableXp, hirePilot, raiseSkill } from './roster';
import { isPilotAvailable } from './types';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { assessSolvency } from './solvency';
import { needsCrewStandDown, standDownCost } from './crewRecovery';
import { employerHistories } from './employers';
import type { BattleResult, UnitResult } from '../sim/world';

function result(pair: DeployablePair, missionId: string, override: Partial<UnitResult> = {}): BattleResult {
  return {
    seed: 'crew-mission', missionId, missionStatus: 'failure', missionReason: 'objectives-failed',
    objectives: [], ticks: 1, durationSeconds: 0.05, winner: 1, decided: true, weapons: [],
    units: [{
      id: 1, team: 0, name: pair.mech.design.name, designId: pair.mech.design.id,
      pilotId: pair.pilot.templateId, alive: true, killMethod: null, pilotDead: false,
      pilotWounds: 0, pilotEjected: false, withdrew: false, legged: false,
      damageDealt: 400, damageTaken: 0, shotsFired: 30, shotsHit: 20, ammoSpent: 0,
      heatPeak: 20, kills: 1, condition: pair.mech.condition, ...override,
    }],
  };
}

function fresh() {
  const state = startCampaign(catalog, 'border_dispute', 'crew-recovery', 'veteran');
  state.cbills = 10_000_000;
  expect(acceptContract(catalog, state, 'militia_raid', 'standard').ok).toBe(true);
  return state;
}

describe('campaign crew recovery and career', () => {
  it('sits out exactly the following resolved deployment, across save/reload and long travel', () => {
    const state = fresh();
    const deployment = prepareDeployment(catalog, state);
    const wounded = deployment.lance[0]!;
    const report = resolveMission(catalog, state, result(wounded, deployment.missionId, { pilotWounds: 2 }), [wounded]);
    expect(report.outcome.pilotReports[0]?.fate).toBe('injured');
    expect(wounded.pilot.recoveryMissions).toBe(1);
    expect(isPilotAvailable(state, wounded.pilot)).toBe(false);
    advanceDays(catalog, state, 40);
    expect(isPilotAvailable(state, wounded.pilot)).toBe(false);

    const restored = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    const pilot = restored.pilots.find((entry) => entry.id === wounded.pilot.id)!;
    expect(pilot.recoveryMissions).toBe(1);
    expect(acceptContract(catalog, restored, 'militia_raid', 'standard').ok).toBe(true);
    abandonContract(catalog, restored);
    expect(pilot.recoveryMissions).toBe(1);
    expect(acceptContract(catalog, restored, 'militia_raid', 'standard').ok).toBe(true);
    const next = prepareDeployment(catalog, restored);
    expect(next.lance.some((pair) => pair.pilot.id === pilot.id)).toBe(false);
    const covering = next.lance[0]!;
    resolveMission(catalog, restored, result(covering, next.missionId, { pilotWounds: 1 }), [covering]);
    expect(isPilotAvailable(restored, pilot)).toBe(true);
    expect(pilot.recoveryMissions).toBe(0);
    expect(covering.pilot.recoveryMissions).toBe(1);
    expect(() => resolveMission(catalog, restored, result(covering, next.missionId), [covering])).toThrow('no active contract');
    expect(covering.pilot.recoveryMissions).toBe(1);
  });

  it('can hire a reserve into a wounded crew member’s machine', () => {
    const state = fresh();
    for (const pilot of state.pilots) pilot.recoveryMissions = 1;
    const recovery = assessSolvency(catalog, state);
    expect(recovery.plan?.pilotName).not.toBeNull();
    expect(recovery.action).not.toBe('wait');
    const hire = hirePilot(catalog, state, availableHires(catalog, state)[0]!.id);
    expect(hire.ok).toBe(true);
    const deployment = prepareDeployment(catalog, state);
    expect(deployment.lance).toHaveLength(1);
    expect(deployment.lance[0]?.pilot.id).toBe(hire.pilot?.id);
  });

  it('keeps a casualty permanently unavailable and cannot rehire or assign the same person', () => {
    const state = fresh();
    const deployment = prepareDeployment(catalog, state);
    const pair = deployment.lance[0]!;
    resolveMission(catalog, state, result(pair, deployment.missionId, {
      alive: false, pilotDead: true, killMethod: 'head',
    }), [pair]);
    expect(pair.pilot.dead).toBe(true);
    assign(state, pair.pilot.id, state.mechs[1]!.id);
    expect(pair.pilot.mechId).toBeNull();
    expect(hirePilot(catalog, state, pair.pilot.templateId).ok).toBe(false);
    const loaded = deserialiseCampaign(serialiseCampaign(state), catalog).state!;
    expect(isPilotAvailable(loaded, loaded.pilots.find((pilot) => pilot.id === pair.pilot.id)!)).toBe(false);
  });

  it('only awards deployment XP to participants and carries trained skills into the next battle', () => {
    const state = fresh();
    const deployment = prepareDeployment(catalog, state);
    const pair = deployment.lance[0]!;
    const reserve = state.pilots.find((pilot) => pilot.id !== pair.pilot.id)!;
    const before = pair.pilot.sensors;
    const report = resolveMission(catalog, state, result(pair, deployment.missionId, {
      damageDealt: 2_000, shotsHit: 100, kills: 10,
    }), [pair]);
    expect(report.outcome.pilotReports.map((pilot) => pilot.pilotId)).toEqual([pair.pilot.id]);
    expect(report.outcome.pilotReports.some((pilot) => pilot.pilotId === reserve.id)).toBe(false);
    expect(pair.pilot.sensors).toBe(before);
    const bank = availableXp(pair.pilot);
    expect(raiseSkill(catalog, pair.pilot, 'sensors').ok).toBe(true);
    expect(availableXp(pair.pilot)).toBeLessThan(bank);
    expect(acceptContract(catalog, state, 'militia_raid', 'standard').ok).toBe(true);
    const next = prepareDeployment(catalog, state);
    expect(next.entries.find((entry) => entry.pilot?.id === pair.pilot.templateId)?.pilot?.sensors).toBe(before + 1);
  });

  it('preserves campaign difficulty and safely defaults older saved campaigns', () => {
    const state = fresh();
    const saved = JSON.parse(serialiseCampaign(state));
    expect(deserialiseCampaign(JSON.stringify(saved), catalog).state?.difficulty).toBe('veteran');
    delete saved.state.difficulty;
    delete saved.state.difficultyConfigured;
    for (const pilot of saved.state.pilots) delete pilot.recoveryMissions;
    const older = deserialiseCampaign(JSON.stringify(saved), catalog).state!;
    expect(older.difficulty).toBe('regular');
    expect(older.difficultyConfigured).toBe(true);
    expect(older.pilots.every((pilot) => pilot.recoveryMissions === 0)).toBe(true);
    expect(() => startCampaign(catalog, 'border_dispute', 'bad', 'impossible')).toThrow('unknown campaign difficulty');
  });

  it.each(['no money', 'empty register'])('can forfeit a real contract when all are wounded with %s', (caseName) => {
    const state = fresh();
    for (const pilot of state.pilots) pilot.recoveryMissions = 1;
    const local = caseName === 'empty register' ? {
      ...catalog,
      campaigns: new Map([...catalog.campaigns].map(([id, campaign]) => [id, { ...campaign, hiringPoolPilotIds: [] }])),
    } : catalog;
    if (caseName === 'no money') state.cbills = 0;
    expect(needsCrewStandDown(local, state)).toBe(true);
    expect(assessSolvency(local, state).action).toBe('stand_down');
    const cost = standDownCost(local, state)!;
    const beforeMoney = state.cbills;
    const beforeXp = state.pilots.map((pilot) => pilot.xp);
    const beforeStore = structuredClone(state.store);
    const day = state.day;
    const payroll = 0;
    expect(standDownCampaign(local, state).ok).toBe(true);
    expect(state.day).toBe(day + 1);
    expect(state.cbills).toBe(beforeMoney - cost.fee - payroll);
    expect(state.pilots.map((pilot) => pilot.xp)).toEqual(beforeXp);
    expect(state.pilots.every((pilot) => isPilotAvailable(state, pilot))).toBe(true);
    expect(state.store).toEqual(beforeStore);
    expect(state.history).toHaveLength(1);
    expect(state.history[0]).toMatchObject({ won: false, payout: 0, pilotReports: [], salvagedItems: [], salvagedChassis: [] });
    const history = employerHistories(local.campaigns.get(state.campaignId)!, state.history, state.employerFailures);
    expect(history.reduce((sum, employer) => sum + employer.failed, 0)).toBe(1);
    expect(standDownCampaign(local, state).ok).toBe(false);
    expect(state.history).toHaveLength(1);
  });

  it('refuses recovery shortcuts while any healthy pilot or affordable replacement is available', () => {
    const state = fresh();
    for (const pilot of state.pilots) pilot.recoveryMissions = 1;
    expect(standDownCampaign(catalog, state).ok).toBe(false);
    state.cbills = 0;
    state.pilots[0]!.recoveryMissions = 0;
    state.pilots[0]!.mechId = null;
    for (const mech of state.mechs) mech.design.mounts = [];
    expect(standDownCampaign(catalog, state).ok).toBe(false);
    expect(state.pilots[1]!.recoveryMissions).toBe(1);
    expect(state.history).toHaveLength(0);
  });
});
