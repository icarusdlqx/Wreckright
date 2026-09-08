import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { TargetBrackets } from './targetBrackets';

class ElementStub {
  className = '';
  style = { transform: '', width: '', height: '' };
  children: ElementStub[] = [];
  parent: ElementStub | null = null;
  attributes = new Map<string, string>();
  setAttribute(key: string, value: string): void { this.attributes.set(key, value); }
  appendChild(child: ElementStub): void { child.parent = this; this.children.push(child); }
  remove(): void {
    if (this.parent !== null) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
}

describe('field target bracket layer', () => {
  it('anchors thin corners immediately, reuses them and removes lost targets while paused', () => {
    const world = playerWorld('target-bracket-dom');
    const friendly = world.entities.find((entity) => entity.team === world.playerTeam)!;
    const hostile = world.entities.find((entity) => entity.team !== world.playerTeam)!;
    world.vision!.visible.add(hostile.id);
    const host = new ElementStub();
    const layer = new TargetBrackets(host as unknown as HTMLElement,
      { createElement: () => new ElementStub() as unknown as HTMLElement });
    const root = host.children[0]!;
    const selected = new Set([friendly.id]);
    const draw = () => layer.draw(world, selected, () => ({ x: 150, y: 100, radius: 20 }), 800, 600);
    draw();
    expect(root.children).toHaveLength(0);
    friendly.orders.attack = { targetId: hostile.id, calledShot: null };
    draw();
    const marker = root.children[0]!;
    expect(marker.attributes.get('data-focus')).toBe('priority');
    expect(marker.style).toMatchObject({ width: '54px', height: '54px', transform: 'translate(123px, 73px)' });
    expect(marker.children).toHaveLength(4);
    draw();
    expect(root.children).toEqual([marker]);
    world.vision!.visible.delete(hostile.id);
    draw();
    expect(root.children).toHaveLength(0);
    expect(world.tick).toBe(0);
    layer.destroy();
    expect(host.children).toHaveLength(0);
  });

  it('does not edge-clamp hidden offscreen positions or retain completed targets', () => {
    const world = playerWorld('target-bracket-offscreen');
    const hostile = world.entities.find((entity) => entity.team !== world.playerTeam)!;
    world.vision!.visible.add(hostile.id);
    const host = new ElementStub();
    const layer = new TargetBrackets(host as unknown as HTMLElement,
      { createElement: () => new ElementStub() as unknown as HTMLElement });
    const root = host.children[0]!;
    const selected = new Set([hostile.id]);
    layer.draw(world, selected, () => ({ x: 100, y: 100, radius: 5 }), 800, 600);
    expect(root.children[0]?.attributes.get('data-focus')).toBe('inspection');
    expect(root.children[0]?.style.width).toBe('36px');
    layer.draw(world, selected, () => ({ x: -10, y: 100, radius: 5 }), 800, 600);
    expect(root.children).toHaveLength(0);
    hostile.pilot.ejected = true;
    layer.draw(world, selected, () => ({ x: 100, y: 100, radius: 5 }), 800, 600);
    expect(root.children).toHaveLength(0);
    layer.destroy();
  });
});
