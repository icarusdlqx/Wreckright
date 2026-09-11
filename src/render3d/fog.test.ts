import { BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { FogLayer } from './fog';

describe('atmospheric shroud', () => {
  it('keeps every unknown tile opaque even beside a fully visible tile', () => {
    const world = playerWorld('opaque-shroud-edge');
    const vision = world.vision!;
    vision.tiles.fill(0); vision.explored.fill(0);
    const width = world.terrain.width;
    const visible = width + 1, remembered = width + 2;
    vision.tiles[visible] = 1; vision.explored[visible] = 1;
    vision.explored[remembered] = 1;
    const fog = new FogLayer(world.terrain, () => 0);
    fog.update(world.terrain, vision);
    const colours = fog.mesh.geometry.getAttribute('color') as BufferAttribute;
    for (let cell = 0; cell < vision.tiles.length; cell += 1) {
      if (cell === visible || cell === remembered) continue;
      for (let vertex = 0; vertex < 5; vertex += 1) expect(colours.getW(cell * 5 + vertex)).toBe(1);
    }
    expect(colours.getW(visible * 5 + 4)).toBe(0);
    expect(colours.getW(remembered * 5 + 4)).toBeCloseTo(0.62);
    expect(colours.getY(0)).toBeGreaterThan(colours.getX(0));
    expect(colours.getZ(0)).toBeGreaterThan(0);
    fog.dispose();
  });

  it('does not rebuild buffers or upload unchanged visibility, and hides in observer mode', () => {
    const world = playerWorld('static-shroud');
    const fog = new FogLayer(world.terrain, () => 0);
    fog.update(world.terrain, world.vision);
    const colours = fog.mesh.geometry.getAttribute('color') as BufferAttribute;
    const version = colours.version;
    fog.update(world.terrain, world.vision);
    expect(colours.version).toBe(version);
    fog.update(world.terrain, null);
    expect(fog.mesh.visible).toBe(false);
    fog.dispose();
  });
});


describe('shroud render budget', () => {
  it('switches between two and four triangles per tile using the same resident resources', () => {
    const world = playerWorld('shroud-low-fx-budget');
    const fog = new FogLayer(world.terrain, () => 0);
    const geometry = fog.mesh.geometry;
    const index = geometry.index!;
    const positions = geometry.getAttribute('position');
    const colours = geometry.getAttribute('color');
    const material = fog.mesh.material;
    const cells = world.terrain.width * world.terrain.height;
    expect(geometry.drawRange).toEqual({ start: cells * 6, count: cells * 12 });
    fog.setLowFx(true);
    expect(geometry.drawRange).toEqual({ start: 0, count: cells * 6 });
    for (let offset = 0; offset < geometry.drawRange.count; offset += 1) {
      expect(index.getX(offset) % 5).toBeLessThan(4);
    }
    for (let toggle = 0; toggle < 20; toggle += 1) fog.setLowFx(toggle % 2 === 0);
    expect(geometry.drawRange).toEqual({ start: cells * 6, count: cells * 12 });
    expect(fog.mesh.geometry).toBe(geometry);
    expect(geometry.index).toBe(index);
    expect(geometry.getAttribute('position')).toBe(positions);
    expect(geometry.getAttribute('color')).toBe(colours);
    expect(fog.mesh.material).toBe(material);
    fog.dispose();
  });

  it('keeps unknown ground opaque in both draw ranges', () => {
    const world = playerWorld('shroud-mode-privacy');
    const vision = world.vision!;
    vision.tiles.fill(0); vision.explored.fill(0); vision.tiles[41] = 1;
    const fog = new FogLayer(world.terrain, () => 0);
    fog.update(world.terrain, vision);
    const geometry = fog.mesh.geometry, colours = geometry.getAttribute('color');
    for (const low of [true, false]) {
      fog.setLowFx(low);
      const { start, count } = geometry.drawRange;
      for (let offset = start; offset < start + count; offset += 1) {
        const vertex = geometry.index!.getX(offset);
        if (Math.floor(vertex / 5) !== 41) expect(colours.getW(vertex)).toBe(1);
      }
    }
    fog.dispose();
  });
});
