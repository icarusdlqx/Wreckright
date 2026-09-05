import { Color, InstancedMesh, Matrix4, MeshBasicMaterial, Scene, Vector3 } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { playerWorld, testWorld } from '../../tests/support';
import { BattleEffects } from './battleEffects';
import { TacticalCamera } from './camera';
import { impactBearing } from './impactBearing';
import { TracerLayer } from './tracers';

const layers: TracerLayer[] = [];
function layer(): TracerLayer { const result = new TracerLayer(); layers.push(result); return result; }
function batch(value: TracerLayer, name: string): InstancedMesh {
  const found = value.group.getObjectByName(`shot-${name}`);
  if (!(found instanceof InstancedMesh)) throw new Error(`missing ${name} batch`);
  return found;
}
function matrix(mesh: InstancedMesh, index = 0): Matrix4 { const result = new Matrix4(); mesh.getMatrixAt(index, result); return result; }
function visible(mesh: InstancedMesh): number {
  let result = 0;
  for (let index = 0; index < mesh.count; index += 1) if (new Vector3().setFromMatrixScale(matrix(mesh, index)).lengthSq() > 0) result += 1;
  return result;
}
afterEach(() => { layers.forEach((entry) => entry.dispose()); layers.length = 0; vi.restoreAllMocks(); });

describe('weapon-specific pooled impacts', () => {
  it('separates directional plate chips, contact rings and round blast lobes', () => {
    const ballistic = layer(); const energy = layer(); const missile = layer();
    ballistic.burst({ x: 10, y: 20 }, 8, 'hit', 0xffffff, 1, 'ballistic', 0);
    energy.burst({ x: 10, y: 20 }, 8, 'hit', 0x78c9ff, 1, 'energy');
    missile.burst({ x: 10, y: 20 }, 8, 'hit', 0xffaa66, 1, 'missile');
    expect(visible(batch(ballistic, 'burst'))).toBe(6);
    const chip = new Vector3().setFromMatrixScale(matrix(batch(ballistic, 'burst')));
    expect(Math.max(chip.x, chip.y, chip.z) / Math.min(chip.x, chip.y, chip.z)).toBeGreaterThan(4);
    const colours = batch(ballistic, 'burst').instanceColor!;
    expect([colours.getX(0), colours.getY(0), colours.getZ(0)]).not.toEqual([colours.getX(1), colours.getY(1), colours.getZ(1)]);
    expect(batch(energy, 'contact-flare').geometry.type).toBe('RingGeometry');
    expect(visible(batch(energy, 'contact-flare'))).toBe(2);
    expect(visible(batch(energy, 'blast-lobes'))).toBe(0);
    expect(batch(missile, 'blast-lobes').geometry.type).toBe('SphereGeometry');
    expect(visible(batch(missile, 'blast-lobes'))).toBe(4);
    expect(visible(batch(missile, 'contact-flare'))).toBe(1);
    expect(missile.stats().families.smoke.active).toBe(1);
    for (const entry of [ballistic, energy, missile]) expect(entry.stats().families.burst.active).toBe(1);
  });

  it('moves ballistic chips along the visible impact bearing while reduced motion stays anchored', () => {
    const east = layer(); const west = layer(); const reduced = layer();
    reduced.setPresentationMode(false, true);
    east.burst({ x: 0, y: 0 }, 0, 'hit', 0xffffff, 1, 'ballistic', 0);
    west.burst({ x: 0, y: 0 }, 0, 'hit', 0xffffff, 1, 'ballistic', Math.PI);
    reduced.burst({ x: 0, y: 0 }, 0, 'hit', 0xffffff, 1, 'ballistic', 0);
    for (const entry of [east, west, reduced]) entry.update(.1);
    expect(new Vector3().setFromMatrixPosition(matrix(batch(east, 'burst'))).x).toBeGreaterThan(0);
    expect(new Vector3().setFromMatrixPosition(matrix(batch(west, 'burst'))).x).toBeLessThan(0);
    expect(new Vector3().setFromMatrixPosition(matrix(batch(reduced, 'burst'))).toArray()).toEqual([0, 14, 0]);
  });

  it('clears every alternate shape on expiry and reuse without allocating more geometry', () => {
    const value = layer();
    const children = [...value.group.children];
    const geometries = children.filter((node): node is InstancedMesh => node instanceof InstancedMesh).map((mesh) => mesh.geometry);
    for (let index = 0; index < 300; index += 1) {
      value.burst({ x: index, y: 0 }, 0, 'hit', 0xffffff, 1, index % 2 === 0 ? 'energy' : 'missile');
    }
    expect(value.stats().families.burst.active).toBe(128);
    expect(value.group.children).toEqual(children);
    expect(children.filter((node): node is InstancedMesh => node instanceof InstancedMesh).map((mesh) => mesh.geometry)).toEqual(geometries);
    value.update(3);
    expect(value.stats().active).toBe(0);
    expect(visible(batch(value, 'contact-flare'))).toBe(0);
    expect(visible(batch(value, 'blast-lobes'))).toBe(0);
    value.burst({ x: 0, y: 0 }, 0, 'terminal', 0xffffff, 1);
    expect(visible(batch(value, 'burst'))).toBe(8);
    expect(visible(batch(value, 'contact-flare'))).toBe(0);
  });

  it('protects terminal slots from weapon impacts and footfall decoration', () => {
    const value = layer();
    for (let index = 0; index < 128; index += 1) value.burst({ x: index, y: 0 }, 0, 'terminal', 0xffffff);
    value.burst({ x: 0, y: 0 }, 0, 'hit', 0xffffff, 1, 'energy');
    value.burst({ x: 0, y: 0 }, 0, 'hit', 0xffffff, 1, 'missile');
    value.footfall({ x: 0, y: 0 }, 0, 'water', 1);
    expect(value.stats().families.burst).toMatchObject({ active: 128, dropped: 3, evicted: 0 });
    expect(visible(batch(value, 'contact-flare'))).toBe(0);
    expect(visible(batch(value, 'blast-lobes'))).toBe(0);
  });

  it('retains essential low-FX impacts while suppressing extra shapes, dust and steam', () => {
    const value = layer(); value.setPresentationMode(true, false);
    value.burst({ x: 0, y: 0 }, 0, 'hit', 0xffffff, 1, 'missile');
    value.footfall({ x: 0, y: 0 }, 0, 'water', 1);
    value.footfall({ x: 0, y: 0 }, 0, 'rough', 1);
    value.ventSteam(new Vector3(4, 20, 8));
    expect(value.stats().families.burst.active).toBe(1);
    expect(value.stats().families.smoke.active).toBe(0);
    expect(batch(value, 'contact-flare').visible).toBe(false);
    expect(batch(value, 'blast-lobes').visible).toBe(false);
    expect(visible(batch(value, 'burst'))).toBeGreaterThan(0);
  });

  it('places water and dust at the sole and fades copied vent anchors with per-instance alpha', () => {
    const water = layer(); const dust = layer(); const steam = layer();
    water.footfall({ x: 4, y: 8 }, 3, 'water', 1);
    dust.footfall({ x: 4, y: 8 }, 3, 'rough', 1);
    const anchor = new Vector3(7, 35, 11);
    steam.ventSteam(anchor); anchor.set(100, 100, 100);
    expect(new Vector3().setFromMatrixPosition(matrix(batch(water, 'contact-flare'))).y).toBeCloseTo(3.3);
    expect(new Vector3().setFromMatrixPosition(matrix(batch(dust, 'smoke'))).y).toBeCloseTo(3.4);
    expect(new Vector3().setFromMatrixPosition(matrix(batch(steam, 'smoke'))).toArray()).toEqual([7, 35, 11]);
    const smoke = batch(steam, 'smoke');
    const opacity = smoke.geometry.getAttribute('smokeOpacity');
    const before = opacity.getX(0);
    const colour = smoke.instanceColor!.getX(0);
    steam.update(.2);
    expect(opacity.getX(0)).toBeLessThan(before);
    expect(smoke.instanceColor!.getX(0)).toBe(colour);
    const shader = { vertexShader: '#include <color_vertex>', fragmentShader: '#include <color_fragment>' };
    (smoke.material as MeshBasicMaterial).onBeforeCompile(shader as never, {} as never);
    expect(shader.fragmentShader).toContain('diffuseColor.a *= vSmokeOpacity');
  });
});

describe('impact routing and privacy', () => {
  it('uses the optional exterior contact for the hit and reflects debris out from the plate', () => {
    const burst = vi.spyOn(TracerLayer.prototype, 'burst');
    const contactOf = vi.fn((_id: number, _location: string, _bearing: number, out: Vector3) => { out.set(82, 38, 0); return true; });
    const world = testWorld('surface-impact-anchor');
    const effects = new BattleEffects(new Scene(), new Color(), new TacticalCamera(false), () => 0,
      (id) => ({ x: id === 1 ? 0 : 90, y: 0 }), () => false,
      { anchorOf: (_id, _location, out) => { out.set(90, 38, 0); return true; }, contactOf });
    try {
      effects.consume(world, [{ type: 'projectile_hit', tick: 3, shooterId: 1, targetId: 2,
        weaponId: 'ac5', location: 'centre_torso', damage: 12, arc: 'front' }]);
      expect(contactOf).toHaveBeenCalledWith(2, 'centre_torso', 0, expect.any(Vector3));
      expect(burst.mock.calls[0]?.[0]).toEqual({ x: 82, y: 0 });
      expect(burst.mock.calls[0]?.[1]).toBe(24);
      expect(burst.mock.calls[0]?.[6]).toBe(Math.PI);
    } finally { effects.destroy(); }
  });

  it('routes weapon family without moving the resolved component anchor', () => {
    const burst = vi.spyOn(TracerLayer.prototype, 'burst');
    const world = testWorld('family-impact-anchor');
    const effects = new BattleEffects(new Scene(), new Color(), new TacticalCamera(false), () => 0,
      (id) => id === 1 ? { x: 0, y: 0 } : { x: 90, y: 70 }, () => false,
      { anchorOf: (_id, _location, out) => { out.set(91, 38, 73); return true; } });
    try {
      for (const weaponId of ['ac5', 'medium_laser', 'lrm10']) effects.consume(world, [{
        type: 'projectile_hit', tick: 3, shooterId: 1, targetId: 2, weaponId,
        location: 'left_arm', damage: 12, arc: 'front',
      }]);
      expect(burst.mock.calls.map((call) => call[5])).toEqual(['ballistic', 'energy', 'missile']);
      expect(burst.mock.calls.every((call) => call[0].x === 91 && call[0].y === 73 && call[1] === 24)).toBe(true);
    } finally { effects.destroy(); }
  });

  it('does not resolve a hidden shooter or encode its identity in the debris direction', () => {
    const world = playerWorld('private-impact-direction');
    const target = world.entities.find((entity) => entity.team === world.playerTeam)!;
    const enemies = world.entities.filter((entity) => entity.team !== world.playerTeam);
    for (const enemy of enemies) world.vision!.visible.delete(enemy.id);
    const positionOf = vi.fn(() => ({ x: 500, y: 600 }));
    const event = { type: 'projectile_hit' as const, tick: 9, shooterId: enemies[0]!.id, targetId: target.id,
      weaponId: 'ac5', location: 'left_arm' as const, damage: 4, arc: 'front' as const };
    const first = impactBearing(world, event, target.pos, positionOf);
    const second = impactBearing(world, { ...event, shooterId: enemies[1]!.id }, target.pos, positionOf);
    expect(first).toBe(second);
    expect(positionOf).not.toHaveBeenCalled();
  });

  it('passes only the public target-side bearing to surface contact and never resolves an unseen target', () => {
    const world = playerWorld('private-surface-contact');
    const target = world.entities.find((entity) => entity.team === world.playerTeam)!;
    const enemies = world.entities.filter((entity) => entity.team !== world.playerTeam);
    for (const enemy of enemies) world.vision!.visible.delete(enemy.id);
    const positionOf = vi.fn(() => ({ x: 500, y: 600 }));
    const contactOf = vi.fn(() => false);
    const effects = new BattleEffects(new Scene(), new Color(), new TacticalCamera(false), () => 0,
      positionOf, () => false, { anchorOf: (_id, _location, out) => { out.set(20, 30, 40); return true; }, contactOf });
    const event = { type: 'projectile_hit' as const, tick: 9, shooterId: enemies[0]!.id, targetId: target.id,
      weaponId: 'ac5', location: 'left_arm' as const, damage: 4, arc: 'front' as const };
    try {
      effects.consume(world, [event, { ...event, shooterId: enemies[1]!.id }, { ...event, targetId: enemies[0]!.id }]);
      expect(contactOf).toHaveBeenCalledTimes(2);
      expect(contactOf.mock.calls[0]).toEqual(contactOf.mock.calls[1]);
      expect(positionOf).not.toHaveBeenCalled();
    } finally { effects.destroy(); }
  });
});
