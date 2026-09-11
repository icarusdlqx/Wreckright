import { Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { callSupport } from '../sim/support';
import { updateTeamVisions } from '../sim/sensors';
import { MarkerLayer } from './markerLayer';

const view = { selection: new Set<number>(), orderMode: null, supportRadius: null, supportRun: null, routes: [] };

describe('field sensor dots', () => {
  it('renders sanitized moving red dots above fog, freezes hollow memory and removes markers on optical contact', () => {
    const world = playerWorld('sensor-field-marker');
    for (const entity of world.entities) {
      entity.sensorRange = entity.sightRange = 0;
      entity.pos = entity.team === 0 ? { x: 40, y: 40 } : { x: 600, y: 600 };
    }
    world.resources.set(0, 10000);
    updateTeamVisions(world);
    const enemy = world.entities.find((entity) => entity.team === 1)!;
    callSupport(world, 0, 'sensor_probe', enemy.pos);
    const layer = new MarkerLayer(() => 15, () => { throw new Error('must not read model positions'); });
    layer.draw(world, view);
    const marker = layer.group.getObjectByName(`sensor-contact-${enemy.id}`)!;
    expect(marker.visible).toBe(true);
    expect(marker.userData.current).toBe(true);
    const dot = marker.children[0] as Mesh;
    expect(dot.visible).toBe(true);
    expect((dot.material as MeshBasicMaterial).color.getHex()).toBe(0xff4655);
    expect((dot.material as MeshBasicMaterial).depthTest).toBe(false);
    expect(dot.renderOrder).toBeGreaterThan(2);
    expect(marker.position.x).toBe(world.vision!.tracks.get(enemy.id)!.pos.x);
    enemy.pos = { x: 901, y: 901 };
    world.tick += 1;
    updateTeamVisions(world);
    layer.draw(world, view);
    expect(marker.position.x).toBe(world.vision!.tracks.get(enemy.id)!.pos.x);
    expect(marker.position.x).not.toBe(enemy.pos.x);
    world.tick = world.reveals[0]!.expiresTick - 1;
    updateTeamVisions(world);
    world.tick += 1;
    updateTeamVisions(world);
    enemy.pos = { x: 700, y: 700 };
    const rememberedX = marker.position.x;
    layer.draw(world, view);
    expect(marker.userData.current).toBe(false);
    expect(dot.visible).toBe(false);
    expect(marker.children[1]!.visible).toBe(true);
    expect(marker.position.x).toBe(rememberedX);
    world.vision!.visible.add(enemy.id);
    layer.draw(world, view);
    expect(layer.group.getObjectByName(`sensor-contact-${enemy.id}`)?.visible ?? false).toBe(false);
    layer.dispose();
  });
});
