import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeGrid, OPEN_LEGEND, playerWorld, unitOf } from '../../tests/support';
import { currentSensorTrack, effectiveSensorRange, updateTeamVisions, visionFor } from '../sim/sensors';
import type { AudioDirector } from './audio';
import { useSelectionAbilities, type EngineOrderContext } from './engineOrders';
import { minimapBlips } from './minimapPresentation';
import { snapshotUnits } from './snapshot';
import { useGame } from './store';

beforeEach(() => useGame.setState({ log: [] }));

function fixture() {
  const world = playerWorld('paused-mech-sensor-sweep');
  const scout = unitOf(world, 'hornet_spotter');
  const target = unitOf(world, 'halberd_prime');
  for (const entity of world.entities) if (entity !== scout && entity !== target) entity.destroyed = true;
  world.terrain = makeGrid({ legend: OPEN_LEGEND, tiles: ['.'.repeat(200)], tileSize: 24 });
  scout.pos = { x: 12, y: 12 };
  scout.ability.id = 'sensor_sweep';
  scout.sightRange = 0;
  target.signature = 1;
  target.sightRange = 0;
  target.sensorRange = 0;
  target.pos = { x: scout.pos.x + effectiveSensorRange(world, scout) * 1.5, y: 12 };
  updateTeamVisions(world);
  const context: EngineOrderContext = { world, selectedEntities: () => [scout.id],
    audio: { order: vi.fn() } as unknown as AudioDirector };
  return { world, scout, target, context };
}

describe('mech sensor activation while the battle clock is paused', () => {
  it('refreshes a newly reached classified return immediately without advancing time, movement or random rolls', () => {
    const { world, scout, target, context } = fixture();
    const before = { tick: world.tick, rng: world.rng.save(), position: { ...target.pos } };
    expect(world.vision!.detected.has(target.id)).toBe(false);
    useSelectionAbilities(context);
    expect(world.tick).toBe(before.tick);
    expect(world.rng.save()).toEqual(before.rng);
    expect(target.pos).toEqual(before.position);
    expect(world.vision!.detected.has(target.id)).toBe(true);
    expect(world.vision!.visible.has(target.id)).toBe(false);
    expect(world.vision!.identified.has(target.id)).toBe(false);
    expect(currentSensorTrack(world.vision, target)).toMatchObject({
      id: target.id, chassisClass: target.chassisClass, frame: target.frame, source: 'sensor',
    });
    expect(currentSensorTrack(world.vision, target)?.pos).not.toEqual(target.pos);
    expect(Object.keys(currentSensorTrack(world.vision, target) ?? {}).sort()).toEqual([
      'chassisClass', 'frame', 'id', 'pos', 'source', 'team', 'tick',
    ]);
    expect(visionFor(world, target.team)?.detected.has(scout.id)).toBe(false);
    const snapshot = snapshotUnits(world, scout.team);
    expect(snapshot.contacts).toHaveLength(1);
    expect(snapshot.contacts[0]).toMatchObject({ id: target.id, current: true, source: 'sensor' });
    expect(snapshot.enemies).toEqual([]);
    expect(minimapBlips(world).find(blip => blip.id === target.id)).toMatchObject({ kind: 'sensor' });
    const tile = world.terrain.toTile(target.pos);
    expect(world.vision!.tiles[tile.row * world.terrain.width + tile.column]).toBe(0);
  });

  it('detects across an opaque wall while keeping the hostile and terrain optically hidden', () => {
    const { world, scout, target, context } = fixture();
    world.terrain = makeGrid({ legend: OPEN_LEGEND, tiles: ['.bb' + '.'.repeat(197)], tileSize: 24 });
    scout.sightRange = 3000;
    updateTeamVisions(world);
    expect(world.vision!.visible.has(target.id)).toBe(false);
    useSelectionAbilities(context);
    expect(currentSensorTrack(world.vision, target)).not.toBeNull();
    expect(world.vision!.visible.has(target.id)).toBe(false);
    expect(world.vision!.identified.has(target.id)).toBe(false);
  });

  it('does not renew the scan or cooldown when a second request is refused', () => {
    const { world, scout, target, context } = fixture();
    useSelectionAbilities(context);
    const ability = { ...scout.ability };
    const track = currentSensorTrack(world.vision, target);
    target.pos.x += 200;
    useSelectionAbilities(context);
    expect(scout.ability).toEqual(ability);
    expect(currentSensorTrack(world.vision, target)).toBe(track);
    expect(useGame.getState().log[0]).toBe('Nothing ready to call on yet.');
  });

  it('does not refresh contacts for unrelated pilot abilities or a shut-down scout', () => {
    const { world, scout, target, context } = fixture();
    target.pos.x = scout.pos.x + effectiveSensorRange(world, scout) / 2;
    scout.ability.id = 'steady_aim';
    useSelectionAbilities(context);
    expect(world.vision!.detected.has(target.id)).toBe(false);
    scout.ability.id = 'sensor_sweep';
    scout.ability.readyAtTick = world.tick;
    scout.shutdownRemaining = 1;
    useSelectionAbilities(context);
    expect(world.vision!.detected.has(target.id)).toBe(false);
  });
});
