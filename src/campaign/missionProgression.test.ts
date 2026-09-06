import { describe, expect, it } from 'vitest';
import { resolveMission } from './campaign';
import { awardSharedMissionXp } from './missionProgression';
import { rewardBattle, rewardFixture } from './missionRewardFixtures';
import { deserialiseCampaign, serialiseCampaign } from './save';
import { traitFactor } from './roster';

describe('shared mission progression', () => {
  it('pays a non-firing scout for shared mission progress and leaves reserves unchanged', () => {
    const { content, state, deployment } = rewardFixture();
    const participants = deployment.lance.slice(0, 2);
    const battle = rewardBattle(deployment.missionId, participants);
    battle.units[1]!.damageDealt = 400;
    const rules = content.rules.economy.xp;
    const shared = rules.sharedMissionWin + rules.perRequiredObjective + rules.perOptionalObjective;
    const reserve = state.pilots.find((pilot) => !participants.some((pair) => pair.pilot.id === pilot.id))!;
    const reserveXp = reserve.xp;
    const run = resolveMission(content, state, battle, participants, false);
    expect(run.outcome.pilotReports).toHaveLength(2);
    expect(run.outcome.pilotReports.map((report) => report.sharedXp)).toEqual([shared, shared]);
    expect(run.outcome.pilotReports[0]!.xp).toBe(Math.round((rules.missionSurvival + rules.missionWin)
      * traitFactor(content, participants[0]!.pilot, 'xpFactor')) + shared);
    expect(run.outcome.pilotReports[1]!.xp).toBeGreaterThan(run.outcome.pilotReports[0]!.xp);
    expect(reserve.xp).toBe(reserveXp);
    expect(run.outcome.pilotReports[0]?.serviceNotes?.join(' ')).toContain('Deployed with the team');
    expect(run.outcome.pilotReports[0]?.serviceNotes?.join(' ')).toContain('Returned without firing a shot');
    expect(run.outcome.objectiveReports?.some((objective) => objective.status === 'complete')).toBe(true);
    expect(deserialiseCampaign(serialiseCampaign(state), content).state?.history.at(-1)?.pilotReports[0]?.serviceNotes)
      .toEqual(run.outcome.pilotReports[0]?.serviceNotes);
    const after = JSON.stringify(state);
    expect(() => resolveMission(content, state, battle, participants, false)).toThrow('no active contract');
    expect(JSON.stringify(state)).toBe(after);
  });

  it('counts distinct authored player objectives and caps the entire operation across retries', () => {
    const { content, state, deployment } = rewardFixture();
    const contract = state.contract!;
    const battle = rewardBattle(deployment.missionId, deployment.lance, { missionStatus: 'failure' });
    battle.objectives.push(...Array.from({ length: 20 }, () => ({ ...battle.objectives[0]! })),
      { id: 'enemy_cache', label: 'Enemy objective', required: false, status: 'complete', progress: 1 },
      { id: 'invented', label: 'Untracked objective', required: true, status: 'complete', progress: 1 });
    const bounded = { ...content, rules: { ...content.rules, economy: { ...content.rules.economy,
      xp: { ...content.rules.economy.xp, sharedObjectiveCap: 50 } } } };
    expect(awardSharedMissionXp(bounded, state, contract, battle, 1)).toBe(50);
    expect(state.sharedXpClaims).toHaveLength(2);
    const restored = deserialiseCampaign(serialiseCampaign(state), bounded).state!;
    restored.history = [];
    expect(awardSharedMissionXp(bounded, restored, restored.contract!, battle, 1)).toBe(0);
    expect(awardSharedMissionXp(bounded, restored, restored.contract!, { ...battle, missionStatus: 'success' }, 1))
      .toBe(content.rules.economy.xp.sharedMissionWin);
    expect(awardSharedMissionXp(bounded, restored, restored.contract!, { ...battle, missionStatus: 'success' }, 1)).toBe(0);
  });

  it('ignores forfeits, absent participants, unfinished battles and another mission’s results', () => {
    const { content, state, deployment } = rewardFixture();
    const before = JSON.stringify(state);
    const battle = rewardBattle(deployment.missionId, deployment.lance);
    expect(awardSharedMissionXp(content, state, state.contract!, battle, 0)).toBe(0);
    expect(awardSharedMissionXp(content, state, state.contract!, { ...battle, missionStatus: 'active' }, 1)).toBe(0);
    expect(awardSharedMissionXp(content, state, state.contract!, { ...battle, missionId: 'training_ground' }, 1)).toBe(0);
    expect(() => resolveMission(content, state, { ...battle, missionId: 'training_ground' }, deployment.lance, false)).toThrow('does not match');
    expect(JSON.stringify(state)).toBe(before);
  });
});
