import { BoxGeometry, InstancedMesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import {
  baseShotSlot,
  SHOT_PRIORITY,
  ShotPoolCore,
} from './shotPoolCore';

describe('priority-aware shot pool admission', () => {
  it('never lets decoration overwrite terminal cues', () => {
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 2);
    const pool = new ShotPoolCore(mesh, 2, 1, baseShotSlot);

    expect(pool.acquire(SHOT_PRIORITY.terminal)).not.toBeNull();
    expect(pool.acquire(SHOT_PRIORITY.terminal)).not.toBeNull();
    expect(pool.acquire(SHOT_PRIORITY.decoration)).toBeNull();
    expect(pool.snapshot()).toMatchObject({ active: 2, dropped: 1, evicted: 0 });

    expect(pool.acquire(SHOT_PRIORITY.terminal)).not.toBeNull();
    expect(pool.snapshot()).toMatchObject({ active: 2, dropped: 1, evicted: 1 });
  });

  it('evicts the oldest lowest-priority cue deterministically', () => {
    const mesh = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 3);
    const pool = new ShotPoolCore(mesh, 3, 1, baseShotSlot);
    const first = pool.acquire(SHOT_PRIORITY.decoration);
    const protectedCue = pool.acquire(SHOT_PRIORITY.critical);
    const second = pool.acquire(SHOT_PRIORITY.decoration);

    const replacement = pool.acquire(SHOT_PRIORITY.standard);
    expect(replacement).toBe(first);
    expect(replacement).not.toBe(second);
    expect(protectedCue?.active).toBe(true);
  });
});
