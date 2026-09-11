import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { visiblePriorityTargets } from './priorityTargets';

function fixture() {
  const world = playerWorld('priority-target-privacy');
  const friendly = world.entities.find((entity) => entity.team === world.playerTeam)!;
  const hostile = world.entities.find((entity) => entity.team !== world.playerTeam)!;
  world.vision!.visible.add(hostile.id);
  return { world, friendly, hostile };
}

describe('explicit target presentation', () => {
  it('shows only the selected friendly units\' explicit orders, even before a tick', () => {
    const { world, friendly, hostile } = fixture();
    friendly.targetId = hostile.id;
    const selected = new Set([friendly.id]);
    expect([...visiblePriorityTargets(world, selected)]).toEqual([]);
    friendly.orders.attack = { targetId: hostile.id, calledShot: null };
    expect([...visiblePriorityTargets(world, selected)]).toEqual([[hostile.id, 'priority']]);
    expect([...visiblePriorityTargets(world, new Set())]).toEqual([]);
    expect(world.tick).toBe(0);
  });

  it('acknowledges inspecting a visible enemy without pretending an attack was ordered', () => {
    const { world, hostile } = fixture();
    expect([...visiblePriorityTargets(world, new Set([hostile.id]))]).toEqual([[hostile.id, 'inspection']]);
  });

  it('deduplicates focus fire and gives explicit targeting priority over inspection', () => {
    const { world, friendly, hostile } = fixture();
    const other = world.entities.find((entity) => entity.team === world.playerTeam && entity !== friendly)!;
    for (const entity of [friendly, other]) entity.orders.attack = { targetId: hostile.id, calledShot: null };
    expect([...visiblePriorityTargets(world, new Set([friendly.id, other.id, hostile.id]))])
      .toEqual([[hostile.id, 'priority']]);
  });

  it('immediately removes exact target acknowledgement under fog, including live sensor tracks', () => {
    const { world, friendly, hostile } = fixture();
    friendly.orders.attack = { targetId: hostile.id, calledShot: null };
    const selected = new Set([friendly.id, hostile.id]);
    expect(visiblePriorityTargets(world, selected).size).toBe(1);
    world.vision!.visible.delete(hostile.id);
    world.vision!.detected.add(hostile.id);
    hostile.pos = { x: 123.456, y: 789.012 };
    expect([...visiblePriorityTargets(world, selected)]).toEqual([]);
    expect(world.tick).toBe(0);
    world.vision!.visible.add(hostile.id);
    hostile.destroyed = true;
    expect([...visiblePriorityTargets(world, selected)]).toEqual([]);
  });

  it('fails closed without player optics and excludes enemy orders and disabled shooters', () => {
    const { world, friendly, hostile } = fixture();
    hostile.orders.attack = { targetId: friendly.id, calledShot: null };
    friendly.orders.attack = { targetId: hostile.id, calledShot: null };
    friendly.destroyed = true;
    expect(visiblePriorityTargets(world, new Set([friendly.id])).size).toBe(0);
    friendly.destroyed = false;
    world.vision = null;
    expect(visiblePriorityTargets(world, new Set([friendly.id, hostile.id])).size).toBe(0);
  });
});
