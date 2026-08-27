import { Color, Matrix4, Scene, type InstancedMesh } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld, testWorld } from '../../tests/support';
import type { SimEvent } from '../sim/events';
import { SUPPORT_CALLS } from '../sim/support';
import { BattleEffects } from './battleEffects';
import { BattlefieldWear } from './battlefieldWear';
import { TacticalCamera } from './camera';

const MATRIX = new Matrix4();

function placements(mesh: InstancedMesh): number[][] {
  const placed: number[][] = [];
  for (let slot = 0; slot < mesh.count; slot += 1) {
    mesh.getMatrixAt(slot, MATRIX);
    if (MATRIX.getMaxScaleOnAxis() <= 0.001) continue;
    placed.push([
      MATRIX.elements[12] ?? Number.NaN,
      MATRIX.elements[13] ?? Number.NaN,
      MATRIX.elements[14] ?? Number.NaN,
      MATRIX.getMaxScaleOnAxis(),
    ]);
  }
  return placed;
}

function feedback(scene: Scene): BattleEffects {
  return new BattleEffects(
    scene,
    new Color(0x101820),
    new TacticalCamera(false),
    (x, y) => 2 + (x + y) / 1_000,
    () => ({ x: 120, y: 80 }),
    () => false,
    {
      anchorOf: (_id, _location, out) => {
        out.set(17, 31, 29);
        return true;
      },
      currentPositionOf: () => ({ x: 120, y: 80 }),
    },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('battlefield memory events', () => {
  it('routes a visible ammunition explosion into a lasting crater', () => {
    const ammo = vi.spyOn(BattlefieldWear.prototype, 'ammo');
    const scene = new Scene();
    const active = feedback(scene);
    const event: SimEvent = {
      type: 'ammo_explosion',
      tick: 5,
      entityId: 2,
      location: 'right_torso',
      damage: 25,
    };

    active.consume(testWorld('ammo-crater'), [event]);

    expect(ammo).toHaveBeenCalledTimes(1);
    const call = ammo.mock.calls[0];
    expect(call === undefined ? null : [call[0].x, call[0].y, call[1]])
      .toEqual([17, 29, 25]);
    const scars = scene.getObjectByName('scars') as InstancedMesh | undefined;
    const crater = scars === undefined ? undefined : placements(scars)[0];
    expect(crater?.[0]).toBeCloseTo(17);
    expect(crater?.[1]).toBeCloseTo(2.396);
    expect(crater?.[2]).toBeCloseTo(29);
    expect(crater?.[3]).toBeGreaterThan(10);
    active.destroy();
  });

  it('routes player artillery with its authored shot count and scatter', () => {
    const artillery = vi.spyOn(BattlefieldWear.prototype, 'artillery');
    const world = playerWorld('player-artillery-craters');
    const team = world.playerTeam;
    if (team === null) throw new Error('player world has no team');
    const active = feedback(new Scene());
    const event: SimEvent = {
      type: 'support_resolved',
      tick: 81,
      team,
      call: 'artillery_strike',
      x: 410,
      y: 260,
    };

    active.consume(world, [event]);

    expect(artillery).toHaveBeenCalledTimes(1);
    const call = artillery.mock.calls[0];
    expect(call === undefined ? null : [
      call[0].x,
      call[0].y,
      call[1],
      call[2],
      call[3],
      call[4],
    ]).toEqual([
      410,
      260,
      81,
      team,
      world.rules.support.artillery_strike.shots,
      world.rules.support.artillery_strike.scatter,
    ]);
    active.destroy();
  });

  it('keeps hidden enemy impacts private but records visible enemy artillery', () => {
    const ammo = vi.spyOn(BattlefieldWear.prototype, 'ammo');
    const artillery = vi.spyOn(BattlefieldWear.prototype, 'artillery');
    const world = playerWorld('private-battlefield-memory');
    const vision = world.vision;
    const team = world.playerTeam;
    const hidden = world.entities.find((entity) => entity.team !== team);
    if (vision === null || team === null || hidden === undefined) {
      throw new Error('player world is incomplete');
    }
    vision.visible.delete(hidden.id);
    const impact = world.terrain.tileCentre(1, 1);
    const impactCell = world.terrain.toTile(impact);
    const cell = impactCell.row * world.terrain.width + impactCell.column;
    vision.tiles[cell] = 0;
    const active = feedback(new Scene());
    const hiddenEvents: SimEvent[] = [
      {
        type: 'ammo_explosion', tick: 4, entityId: hidden.id,
        location: 'left_torso', damage: 30,
      },
      {
        type: 'support_resolved', tick: 5, team: hidden.team,
        call: 'artillery_strike', x: impact.x, y: impact.y,
      },
    ];

    active.consume(world, hiddenEvents);
    expect(ammo).not.toHaveBeenCalled();
    expect(artillery).not.toHaveBeenCalled();

    vision.tiles[cell] = 1;
    active.consume(world, [{
      type: 'support_resolved', tick: 6, team: hidden.team,
      call: 'artillery_strike', x: impact.x, y: impact.y,
    }]);
    expect(artillery).toHaveBeenCalledTimes(1);

    const nonArtillery = SUPPORT_CALLS
      .filter((call) => call !== 'artillery_strike')
      .map((call, index): SimEvent => ({
        type: 'support_resolved', tick: 7 + index, team,
        call, x: impact.x, y: impact.y,
      }));
    active.consume(world, nonArtillery);

    expect(ammo).not.toHaveBeenCalled();
    expect(artillery).toHaveBeenCalledTimes(1);
    active.destroy();
  });
});

describe('battlefield memory pools', () => {
  it('lays the same bounded artillery cluster for the same resolved event', () => {
    const heightAt = (x: number, y: number) => (x - y) / 500;
    const first = new BattlefieldWear(new Color(0x101820), heightAt);
    const second = new BattlefieldWear(new Color(0x101820), heightAt);
    const shifted = new BattlefieldWear(new Color(0x101820), heightAt);
    const centre = { x: 410, y: 260 };
    const otherCentre = { x: 450, y: 260 };

    first.artillery(centre, 81, 0, 5, 34);
    second.artillery(centre, 81, 0, 5, 34);
    shifted.artillery(otherCentre, 81, 0, 5, 34);

    const firstCluster = placements(first.scars.mesh);
    const secondCluster = placements(second.scars.mesh);
    expect(firstCluster).toEqual(secondCluster);
    expect(firstCluster).toHaveLength(5);
    expect(new Set(firstCluster.map(([x, , z]) => `${x}:${z}`)).size).toBeGreaterThan(1);
    for (const [x = Number.NaN, , z = Number.NaN] of firstCluster) {
      expect(Math.hypot(x - centre.x, z - centre.y)).toBeLessThanOrEqual(34.001);
    }
    const offsets = firstCluster.map(([x = 0, , z = 0]) => [x - centre.x, z - centre.y]);
    const shiftedOffsets = placements(shifted.scars.mesh)
      .map(([x = 0, , z = 0]) => [x - otherCentre.x, z - otherCentre.y]);
    expect(shiftedOffsets).not.toEqual(offsets);
    first.dispose();
    second.dispose();
    shifted.dispose();
  });

  it('keeps scene, meshes and instance attributes fixed under event churn', () => {
    const scene = new Scene();
    const active = feedback(scene);
    const world = playerWorld('battlefield-memory-stress');
    const team = world.playerTeam;
    const ally = world.entities.find((entity) => entity.team === team);
    const enemy = world.entities.find((entity) => entity.team !== team);
    if (team === null || ally === undefined || enemy === undefined) {
      throw new Error('player world is incomplete');
    }
    const smoke = scene.getObjectByName('wreck-smoke') as InstancedMesh | undefined;
    const scars = scene.getObjectByName('scars') as InstancedMesh | undefined;
    if (smoke === undefined || scars === undefined) throw new Error('wear meshes missing');
    const children = [...scene.children];
    const smokeIdentity = {
      geometry: smoke.geometry,
      material: smoke.material,
      matrix: smoke.instanceMatrix,
      matrixBuffer: smoke.instanceMatrix.array,
      colours: smoke.instanceColor,
      colourBuffer: smoke.instanceColor?.array,
    };
    const scarIdentity = {
      geometry: scars.geometry,
      material: scars.material,
      matrix: scars.instanceMatrix,
      matrixBuffer: scars.instanceMatrix.array,
      colours: scars.instanceColor,
      colourBuffer: scars.instanceColor?.array,
    };
    const add = vi.spyOn(scene, 'add');
    const events: SimEvent[] = [];
    for (let index = 0; index < 600; index += 1) {
      events.push(
        {
          type: 'projectile_hit', tick: index, shooterId: enemy.id,
          targetId: ally.id, weaponId: 'ac5', location: 'centre_torso',
          damage: 8, arc: 'front',
        },
        {
          type: 'ammo_explosion', tick: index, entityId: ally.id,
          location: 'centre_torso', damage: 25,
        },
        {
          type: 'support_resolved', tick: index, team,
          call: 'artillery_strike', x: 300 + index, y: 400 - index,
        },
      );
    }

    active.consume(world, events);

    expect(scene.children).toHaveLength(children.length);
    for (let index = 0; index < children.length; index += 1) {
      expect(scene.children[index]).toBe(children[index]);
    }
    expect(add).not.toHaveBeenCalled();
    expect(smoke.geometry).toBe(smokeIdentity.geometry);
    expect(smoke.material).toBe(smokeIdentity.material);
    expect(smoke.instanceMatrix).toBe(smokeIdentity.matrix);
    expect(smoke.instanceMatrix.array).toBe(smokeIdentity.matrixBuffer);
    expect(smoke.instanceColor).toBe(smokeIdentity.colours);
    expect(smoke.instanceColor?.array).toBe(smokeIdentity.colourBuffer);
    expect(scars.geometry).toBe(scarIdentity.geometry);
    expect(scars.material).toBe(scarIdentity.material);
    expect(scars.instanceMatrix).toBe(scarIdentity.matrix);
    expect(scars.instanceMatrix.array).toBe(scarIdentity.matrixBuffer);
    expect(scars.instanceColor).toBe(scarIdentity.colours);
    expect(scars.instanceColor?.array).toBe(scarIdentity.colourBuffer);
    expect(smoke.count).toBeLessThanOrEqual(smoke.instanceMatrix.count);
    expect(scars.count).toBeLessThanOrEqual(scars.instanceMatrix.count);
    active.destroy();
  });

  it('disposes once and ignores every later battlefield event', () => {
    const wear = new BattlefieldWear(new Color(0x101820), () => 3);
    const smokeDispose = vi.fn();
    const scarDispose = vi.fn();
    wear.smoke.mesh.geometry.addEventListener('dispose', smokeDispose);
    wear.scars.mesh.geometry.addEventListener('dispose', scarDispose);
    wear.wreck(1, { x: 10, y: 20 }, 4);
    wear.ammo({ x: 30, y: 40 }, 25);
    wear.artillery({ x: 50, y: 60 }, 8, 0, 5, 34);

    wear.dispose();
    wear.dispose();
    wear.wreck(2, { x: 70, y: 80 }, 4);
    wear.ammo({ x: 90, y: 100 }, 25);
    wear.artillery({ x: 110, y: 120 }, 9, 0, 5, 34);
    wear.update(60);

    expect(smokeDispose).toHaveBeenCalledTimes(1);
    expect(scarDispose).toHaveBeenCalledTimes(1);
    expect(wear.smoke.activeColumns).toBe(0);
    expect(wear.smoke.mesh.count).toBe(0);
    expect(wear.scars.scarCount).toBe(0);
    expect(wear.scars.craterCount).toBe(0);
    expect(wear.scars.mesh.count).toBe(0);
  });
});
