import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { MechEntity } from '../sim/types';
import { edgeArrowPlacement, OffscreenUnitArrows } from './offscreenUnitArrows';

class FakeStyle {
  left = '';
  top = '';
  color = '';
  transform = '';
  cssText = '';
}

class FakeElement {
  className = '';
  hidden = false;
  readonly style = new FakeStyle();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;

  appendChild(child: FakeElement): FakeElement {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  setAttribute(): void {}

  remove(): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }
}

const VIEWPORT = { width: 1_000, height: 600 };

function harness(
  bodyOf: (entity: MechEntity) => { x: number; y: number; radius: number },
  capacity = 12,
): { host: FakeElement; arrows: OffscreenUnitArrows } {
  const host = new FakeElement();
  const arrows = new OffscreenUnitArrows(
    host as unknown as HTMLElement,
    bodyOf,
    (entity, out) => {
      const body = bodyOf(entity);
      out.x = body.x - VIEWPORT.width / 2;
      out.y = body.y - VIEWPORT.height / 2;
    },
    () => VIEWPORT,
    capacity,
    { createElement: () => new FakeElement() } as unknown as Document,
  );
  return { host, arrows };
}

describe('edge arrow placement', () => {
  it('pins a bearing to the edge it points at, inset from the border', () => {
    const right = edgeArrowPlacement({ x: 600, y: 0 }, VIEWPORT, 20);
    expect(right.x).toBe(980);
    expect(right.y).toBe(300);
    expect(right.degrees).toBe(0);

    const down = edgeArrowPlacement({ x: 0, y: 900 }, VIEWPORT, 20);
    expect(down.x).toBe(500);
    expect(down.y).toBe(580);
    expect(down.degrees).toBe(90);
  });

  it('does not produce a non-finite position for a zero bearing', () => {
    const centre = edgeArrowPlacement({ x: 0, y: 0 }, VIEWPORT);
    expect(Number.isFinite(centre.x) && Number.isFinite(centre.y)).toBe(true);
  });
});

describe('off-screen unit arrows', () => {
  it('shows an arrow only for machines outside the view', () => {
    const world = playerWorld('arrows');
    const off = world.entities.filter((entity) => entity.team === 0).map((entity) => entity.id);
    const { arrows } = harness((entity) =>
      off.includes(entity.id) ? { x: 1_400, y: 300, radius: 20 } : { x: 500, y: 300, radius: 20 },
    );

    arrows.update(world);

    expect(arrows.activeCount).toBe(off.length);
  });

  it('places the player\'s own machines before hostiles when the pool is short', () => {
    const world = playerWorld('arrows-priority');
    const mine = world.entities.filter((entity) => entity.team === 0).length;
    const { host, arrows } = harness(() => ({ x: -300, y: 300, radius: 20 }), mine);

    arrows.update(world);

    const root = host.children[0];
    const shown = root?.children.filter((child) => !child.hidden) ?? [];
    expect(shown.length).toBe(mine);
    const colours = new Set(shown.map((child) => child.style.color));
    expect(colours.size).toBe(1);
  });

  it('hides everything while the view is hidden and clears up on destroy', () => {
    const world = playerWorld('arrows-hidden');
    const { host, arrows } = harness(() => ({ x: -300, y: 300, radius: 20 }));

    arrows.update(world, false);
    expect(arrows.activeCount).toBe(0);
    expect(host.children[0]?.hidden).toBe(true);

    arrows.destroy();
    expect(host.children.length).toBe(0);
  });
});
