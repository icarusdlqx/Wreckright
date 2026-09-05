import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { snapshotUnit } from './snapshot';
import { selectionReadiness } from './selectionReadiness';

describe('selected machine immediate readiness', () => {
  const standing = { alive: true, destroyed: false, shutdownRemaining: 0, downRemaining: 0, staggered: false, holdingFire: false, motion: 'idle' };
  it('prioritises inability to act over held fire and motion', () => {
    expect(selectionReadiness({ ...standing, shutdownRemaining: 3.2, downRemaining: 2, holdingFire: true })).toEqual({ label: 'Reactor shutdown · 4s', tone: 'danger' });
    expect(selectionReadiness({ ...standing, downRemaining: 1.5, holdingFire: true })).toEqual({ label: 'Recovering footing · 2s', tone: 'warn' });
    expect(selectionReadiness({ ...standing, alive: false, destroyed: true, shutdownRemaining: 3 }).label).toBe('Machine lost');
  });
  it('keeps held fire explicit and distinguishes ordinary movement', () => {
    expect(selectionReadiness({ ...standing, holdingFire: true }).label).toBe('Weapons held');
    expect(selectionReadiness(standing).label).toBe('Standing by');
    expect(selectionReadiness({ ...standing, motion: 'running' })).toEqual({ label: 'running', tone: 'normal' });
  });

  it.each(['withdrawn', 'ejected', 'pilot-killed'] as const)(
    'does not report an intact %s machine as destroyed', (reason) => {
      const world = playerWorld(`readiness-${reason}`);
      const entity = world.entities.find((candidate) => candidate.team === world.playerTeam)!;
      if (reason === 'withdrawn') entity.withdrawn = true;
      else if (reason === 'ejected') entity.pilot.ejected = true;
      else entity.pilot.dead = true;
      const unit = snapshotUnit(world, entity);
      expect(unit.alive).toBe(false);
      expect(unit.destroyed).toBe(false);
      expect(selectionReadiness(unit)).toEqual({ label: 'Out of action', tone: 'warn' });
      entity.destroyed = true;
      expect(selectionReadiness(snapshotUnit(world, entity)))
        .toEqual({ label: 'Machine lost', tone: 'danger' });
    },
  );
});
