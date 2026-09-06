import { describe, expect, it } from 'vitest';
import { resolveMission } from './campaign';
import { rewardBattle, rewardFixture } from './missionRewardFixtures';

describe('authoritative settlement boundary', () => {
  it('rejects an unfinished result before changing the contract, crew or claim ledger', () => {
    const { content, state, deployment } = rewardFixture();
    const battle = rewardBattle(deployment.missionId, deployment.lance, {
      missionStatus: 'active', winner: null, decided: false,
    });
    const before = JSON.stringify(state);
    expect(() => resolveMission(content, state, battle, deployment.lance, false)).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects another deployment’s pilot records even when the mission identifier matches', () => {
    const { content, state, deployment } = rewardFixture([{
      id: 'supplied_laser', label: 'Supply receipt',
      items: [{ kind: 'weapon', itemId: 'medium_laser', count: 1 }],
    }]);
    const battle = rewardBattle(deployment.missionId, deployment.lance);
    battle.units[0]!.pilotId = 'corin_dast';
    const before = JSON.stringify(state);
    expect(() => resolveMission(content, state, battle, deployment.lance, false)).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('accepts a completed timed objective even though the result was not decided before its clock', () => {
    const { content, state, deployment } = rewardFixture();
    const battle = rewardBattle(deployment.missionId, deployment.lance, { decided: false });
    const outcome = resolveMission(content, state, battle, deployment.lance, false).outcome;
    expect(outcome.won).toBe(true);
    expect(state.contract).toBeNull();
  });

  it.each(['design', 'missing', 'duplicate', 'foreign_roster'] as const)('rejects %s deployment corruption before mutation', (fault) => {
    const { content, state, deployment } = rewardFixture();
    const battle = rewardBattle(deployment.missionId, deployment.lance);
    const lance = [...deployment.lance];
    if (fault === 'design') battle.units[0]!.designId = 'sentinel_brawler';
    if (fault === 'missing') battle.units.pop();
    if (fault === 'duplicate') lance[1] = lance[0]!;
    if (fault === 'foreign_roster') lance[0] = structuredClone(lance[0]!);
    const before = JSON.stringify(state);
    expect(() => resolveMission(content, state, battle, lance, false)).toThrow();
    expect(JSON.stringify(state)).toBe(before);
  });
});
