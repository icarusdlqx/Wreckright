import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playerWorld, unitOf } from '../../tests/support';
import { visiblePriorityTargets } from '../render/priorityTargets';
import { visionFor } from '../sim/sensors';
import type { AudioDirector } from './audio';
import { acknowledgeCommand, clearCommandReceipt, readCommandReceipt, subscribeCommandReceipt } from './commandReceiptState';
import { attackSelection, engageContactSelection, type EngineOrderContext } from './engineOrders';
import { useGame } from './store';

function fixture() {
  const world = playerWorld('target-command-receipt');
  const shooter = unitOf(world, 'bulwark_assault');
  const target = world.entities.find((entity) => entity.team !== shooter.team)!;
  const context: EngineOrderContext = {
    world, selectedEntities: () => [shooter.id], audio: { order: vi.fn() } as unknown as AudioDirector,
  };
  return { world, shooter, target, context };
}

beforeEach(() => { clearCommandReceipt(); useGame.setState({ paused: true, log: [] }); });

describe('immediate command receipts', () => {
  it('confirms priority targeting before the next simulation tick', () => {
    const { world, shooter, target, context } = fixture();
    world.vision!.visible.add(target.id);
    attackSelection(context, target.id, null);
    expect(readCommandReceipt()).toMatchObject({
      tone: 'confirmed', text: `Priority target: ${world.catalog.designs.get(target.designId)!.name} · 1 mech`,
    });
    expect(visiblePriorityTargets(world, new Set([shooter.id])).get(target.id)).toBe('priority');
    expect(world.tick).toBe(0);
    expect(useGame.getState().paused).toBe(true);
  });

  it('explains no selection without reporting an accepted attack', () => {
    const { target, context } = fixture();
    attackSelection({ ...context, selectedEntities: () => [] }, target.id, null);
    expect(readCommandReceipt()).toMatchObject({ tone: 'attention', text: 'Select a friendly mech first.' });
  });

  it('keeps an indirect contact receipt coarse and never reveals a target bracket', () => {
    const { world, shooter, target, context } = fixture();
    const vision = visionFor(world, shooter.team)!;
    vision.visible.clear();
    vision.detected.add(target.id);
    vision.tracks.set(target.id, {
      id: target.id, team: target.team, frame: target.frame, chassisClass: target.chassisClass,
      pos: { x: 504, y: 312 }, tick: world.tick, source: 'sensor',
    });
    engageContactSelection(context, target.id, { x: 504, y: 312 });
    expect(readCommandReceipt()?.text).toBe('Sensor target confirmed · 1 firing');
    expect(visiblePriorityTargets(world, new Set([shooter.id])).size).toBe(0);
    expect(readCommandReceipt()?.text).not.toContain(world.catalog.designs.get(target.designId)!.name);
  });

  it('replaces receipts and ignores an obsolete timeout instead of dismissing the latest order', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCommandReceipt(listener);
    acknowledgeCommand('First target');
    const old = readCommandReceipt()!;
    acknowledgeCommand('Second target');
    clearCommandReceipt(old.id);
    expect(readCommandReceipt()?.text).toBe('Second target');
    expect(listener).toHaveBeenCalledTimes(2);
    clearCommandReceipt();
    expect(readCommandReceipt()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
