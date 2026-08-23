import { Color, InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { testWorld } from '../../tests/support';
import type { Weapon } from '../schema/weapon';
import type { SimEvent } from '../sim/events';
import { BattleEffects } from './battleEffects';
import { TacticalCamera } from './camera';
import { TracerLayer } from './tracers';

function missileVisual(): Weapon['visual'] {
  return { style: 'missile', colour: '#ffffff', width: 2, arc: 24 };
}

function missileMesh(layer: TracerLayer): InstancedMesh {
  return layer.group.getObjectByName('shot-missile') as InstancedMesh;
}

function positionAt(mesh: InstancedMesh, index = 0): Vector3 {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new Vector3().setFromMatrixPosition(matrix);
}

describe('terminal projectile presentation', () => {
  it('freezes an impact at its endpoint instead of replaying its flight on update(0)', () => {
    const layer = new TracerLayer();
    const engagement = { shooterId: 7, targetId: 9, weaponId: 'lrm20' };
    layer.fire(
      new Vector3(0, 14, 0),
      { x: 100, y: 0 },
      missileVisual(),
      1,
      100,
      0xffffff,
      () => 0,
      engagement,
      1,
    );
    layer.update(0.25);
    expect(positionAt(missileMesh(layer)).x).toBeCloseTo(25);

    const endpoint = new Vector3(260, 22, 18);
    expect(layer.resolveProjectile(engagement, endpoint)).toBe(true);
    const endpointOf = vi.fn((_id: number, out: Vector3) => {
      out.set(900, 900, 900);
      return true;
    });
    layer.update(0, endpointOf);

    expect(endpointOf).not.toHaveBeenCalled();
    expect(positionAt(missileMesh(layer)).toArray()).toEqual(endpoint.toArray());
    layer.update(0.025, endpointOf);
    expect(positionAt(missileMesh(layer)).toArray()).toEqual(endpoint.toArray());
    layer.update(0.025, endpointOf);
    expect(layer.stats().families.missile.active).toBe(0);
    layer.dispose();
  });

  it('lands every unresolved salvo round once when its target terminates', () => {
    const layer = new TracerLayer();
    const engagement = { shooterId: 1, targetId: 2, weaponId: 'lrm20' };
    layer.fire(
      new Vector3(0, 14, 0),
      { x: 600, y: 40 },
      missileVisual(),
      20,
      300,
      0xffffff,
      () => 0,
      engagement,
      2,
    );

    expect(layer.resolveOutstanding(2, new Vector3(300, 24, 60))).toBe(6);
    expect(layer.resolveOutstanding(2, new Vector3(900, 24, 60))).toBe(0);
    expect(positionAt(missileMesh(layer), 0).x).toBeCloseTo(291);
    expect(positionAt(missileMesh(layer), 5).x).toBeCloseTo(309);

    const endpointOf = vi.fn(() => true);
    layer.update(0, endpointOf);
    expect(endpointOf).not.toHaveBeenCalled();
    expect(positionAt(missileMesh(layer), 0).x).toBeCloseTo(291);
    layer.dispose();
  });

  it('settles a saturated fixed pool without allocating or double-resolving', () => {
    const layer = new TracerLayer();
    for (let volley = 0; volley < 20; volley += 1) {
      layer.fire(
        new Vector3(0, 14, 0),
        { x: 600, y: volley },
        missileVisual(),
        20,
        300,
        0xffffff,
        () => 0,
        { shooterId: volley, targetId: volley % 2, weaponId: 'lrm20' },
        2,
      );
    }

    expect(layer.stats().families.missile.active).toBe(120);
    expect(layer.resolveOutstanding(0)).toBe(60);
    expect(layer.resolveOutstanding(0)).toBe(0);
    expect(layer.resolveOutstanding(null)).toBe(60);
    layer.update(0.05);
    expect(layer.stats().families.missile.active).toBe(0);
    layer.dispose();
  });

  it('uses only a rendered endpoint for terminal events and settles all at battle end', () => {
    const world = testWorld('terminal-projectile-events');
    const resolve = vi.spyOn(TracerLayer.prototype, 'resolveOutstanding');
    const effects = new BattleEffects(
      new Scene(),
      new Color(0x101820),
      new TacticalCamera(false),
      () => 0,
      () => ({ x: 120, y: 80 }),
      (_id, _weaponId, muzzle) => {
        muzzle.set(10, 14, 20);
        return true;
      },
      {
        anchorOf: (_id, _location, out) => {
          out.set(400, 24, 500);
          return true;
        },
        canLocate: () => false,
      },
    );
    const events: SimEvent[] = [
      { type: 'mech_destroyed', tick: 2, entityId: 2, method: 'centre_torso' },
      { type: 'battle_ended', tick: 2, winner: 0 },
    ];

    effects.consume(world, events);

    expect(resolve).toHaveBeenCalledWith(2, undefined);
    expect(resolve).toHaveBeenCalledWith(null);
    effects.destroy();
  });
});
