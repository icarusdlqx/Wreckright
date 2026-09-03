import { afterEach, describe, expect, it, vi } from 'vitest';
import { testWorld, unitOf } from '../../tests/support';
import { machineCulture } from '../render3d/machineCulture';
import type { AudioGraph } from './audioGraph';

const voices = vi.hoisted(() => ({ collapse: vi.fn() }));
const weapons = vi.hoisted(() => ({ destruction: vi.fn() }));

vi.mock('./audioVoices', async (importOriginal) => ({
  ...await importOriginal<typeof import('./audioVoices')>(),
  playCollapse: voices.collapse,
}));
vi.mock('./audioWeapons', async (importOriginal) => ({
  ...await importOriginal<typeof import('./audioWeapons')>(),
  playDestruction: weapons.destruction,
}));

import { AudioDirector } from './audio';

function activeAudio(): AudioDirector {
  const audio = new AudioDirector();
  (audio as unknown as { graph: AudioGraph }).graph = {
    close: vi.fn(),
    duckScore: vi.fn(),
  } as unknown as AudioGraph;
  return audio;
}

afterEach(() => {
  voices.collapse.mockReset();
  weapons.destruction.mockReset();
});

describe('terminal audio synchronization', () => {
  it('uses only the terminal landing for a fatal same-tick knockdown', () => {
    const world = testWorld('fatal-knockdown-audio');
    const entity = unitOf(world, 'hornet_spotter');
    const faction = world.catalog.chassis.get(entity.chassisId)?.faction ?? 'linewrought';
    entity.downRemaining = world.rules.stability.downSeconds;
    const audio = activeAudio();

    audio.consume(world, [
      { type: 'knocked_down', tick: world.tick, entityId: entity.id, attackerId: 2 },
      { type: 'mech_destroyed', tick: world.tick, entityId: entity.id, method: 'centre_torso' },
    ], 4);

    expect(weapons.destruction).toHaveBeenCalledOnce();
    expect(voices.collapse).toHaveBeenCalledOnce();
    expect(voices.collapse.mock.calls[0]?.[3])
      .toBeCloseTo(machineCulture(faction).terminalFallSeconds / 4);
    audio.destroy();
  });

  it('does not land an already-downed hull a second time on destruction', () => {
    const world = testWorld('downed-destruction-audio');
    const entity = unitOf(world, 'hornet_spotter');
    entity.downRemaining = 2;
    const audio = activeAudio();

    audio.consume(world, [
      { type: 'mech_destroyed', tick: world.tick, entityId: entity.id, method: 'centre_torso' },
    ], 2);

    expect(weapons.destruction).toHaveBeenCalledOnce();
    expect(voices.collapse).not.toHaveBeenCalled();
    audio.destroy();
  });

  it('lands a reduced-motion terminal fall immediately at 1x', () => {
    const world = testWorld('reduced-terminal-audio');
    const entity = unitOf(world, 'hornet_spotter');
    const audio = activeAudio();

    audio.consume(world, [
      { type: 'mech_destroyed', tick: world.tick, entityId: entity.id, method: 'centre_torso' },
    ], 1, true);

    expect(weapons.destruction).toHaveBeenCalledOnce();
    expect(voices.collapse).toHaveBeenCalledOnce();
    expect(voices.collapse.mock.calls[0]?.[3]).toBe(0);
    audio.destroy();
  });
});
