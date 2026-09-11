import { describe, expect, it } from 'vitest';
import { TRAINING_LESSONS, observeTrainingSignals } from './TrainingCoach';
import { playerWorld } from '../../tests/support';
import { snapshotUnit } from './snapshot';

describe('training coach contact lesson', () => {
  it('distinguishes red sensor dots from targetable optical contacts', () => {
    const lesson = TRAINING_LESSONS[2];

    for (const copy of [lesson.instruction, lesson.touch]) {
      expect(copy).toContain('red ● sensor dot');
      expect(copy).toMatch(/named (optical )?contact/);
      expect(copy).toContain('to engage');
      expect(copy).toContain('Indirect missiles');
    }
    expect(lesson.instruction).toContain('live sensor return');
    expect(lesson.touch).toContain('live sensor returns');
  });

  it('distinguishes a standing attack order from automatic target acquisition', () => {
    const world = playerWorld();
    const friendly = world.entities.find((entity) => entity.team === world.playerTeam);
    const hostile = world.entities.find((entity) => entity.team !== world.playerTeam);
    expect(friendly).toBeDefined();
    expect(hostile).toBeDefined();
    if (friendly === undefined || hostile === undefined) return;

    world.vision?.visible.add(hostile.id);
    friendly.targetId = hostile.id;
    expect(snapshotUnit(world, friendly).hasAttackOrder).toBe(false);

    friendly.orders.attack = { targetId: hostile.id, calledShot: null };
    expect(snapshotUnit(world, friendly).hasAttackOrder).toBe(true);
  });
});


describe('range gate lesson', () => {
  it('waits for the named gate objective rather than movement elsewhere', () => {
    const world = playerWorld();
    const friendly = world.entities.find((entity) => entity.team === world.playerTeam)!;
    const unit = { ...snapshotUnit(world, friendly), hasMoveOrder: true, motion: 'walk' as const };
    const initial = { selected: false, moved: false, engaged: false, heated: false };
    const state = { units: [unit], selection: [unit.id], playerTeam: world.playerTeam!, objectives: [] };
    expect(observeTrainingSignals(state, initial, 1).moved).toBe(false);
    expect(observeTrainingSignals({ ...state, objectives: [{ id: 'cross_range_gate', label: 'Gate', required: true, status: 'complete', progress: 1 }] }, initial, 1).moved).toBe(true);
  });
});
