import { describe, expect, it } from 'vitest';
import { TRAINING_LESSONS } from './TrainingCoach';
import { playerWorld } from '../../tests/support';
import { snapshotUnit } from './snapshot';

describe('training coach contact lesson', () => {
  it('distinguishes hollow sensor tracks from targetable optical contacts', () => {
    const lesson = TRAINING_LESSONS[2];

    for (const copy of [lesson.instruction, lesson.touch]) {
      expect(copy).toContain('hollow ◇ sensor track');
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
