import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { showsUnitHealth, unitIntegrity, UnitHealthBars } from './unitHealthBars';

class ElementStub {
  className = '';
  style = { transform: '' };
  children: ElementStub[] = [];
  parent: ElementStub | null = null;
  attributes = new Map<string, string>();
  setAttribute(key: string, value: string): void { this.attributes.set(key, value); }
  appendChild(child: ElementStub): void { child.parent = this; this.children.push(child); }
  remove(): void {
    if (this.parent !== null) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
}

describe('compact unit health bars', () => {
  it('counts remaining armour and structure, excludes lost locations and follows repairs', () => {
    const world = playerWorld('unit-health');
    const mech = world.entities[0]!;
    expect(unitIntegrity(mech)).toBe(1);
    const original = mech.locations.left_arm.armour;
    mech.locations.left_arm.armour = 0;
    const damaged = unitIntegrity(mech);
    expect(damaged).toBeLessThan(1);
    mech.locations.left_arm.armour = original;
    expect(unitIntegrity(mech)).toBe(1);
    mech.locations.left_arm.destroyed = true;
    expect(unitIntegrity(mech)).toBeLessThan(damaged);
  });

  it('discloses enemy health only in optical view and removes wreck bars', () => {
    const world = playerWorld('health-visibility');
    const enemy = world.entities.find((entity) => entity.team !== world.playerTeam)!;
    world.vision!.visible.delete(enemy.id);
    expect(showsUnitHealth(world, enemy)).toBe(false);
    world.vision!.visible.add(enemy.id);
    expect(showsUnitHealth(world, enemy)).toBe(true);
    enemy.destroyed = true;
    expect(showsUnitHealth(world, enemy)).toBe(false);
  });

  it('reuses visible bars and immediately removes hidden positions instead of edge-clamping them', () => {
    const world = playerWorld('health-dom');
    const friendly = world.entities.find((entity) => entity.team === world.playerTeam)!;
    const enemy = world.entities.find((entity) => entity.team !== world.playerTeam)!;
    world.vision!.visible.add(enemy.id);
    const host = new ElementStub();
    const bars = new UnitHealthBars(host as unknown as HTMLElement,
      { createElement: () => new ElementStub() as unknown as HTMLElement });
    const root = host.children[0]!;
    const at = () => ({ x: 150, y: 150, radius: 12 });
    const draw = () => bars.draw(world, new Set([friendly.id]), null, at, 800, 600);
    draw();
    const first = root.children.find((child) => child.attributes.get('data-entity-id') === String(friendly.id));
    expect(first?.className).toContain('unit-health-friendly unit-health-focused');
    expect(root.children.every((child) => !child.className.split(' ').includes('hostile'))).toBe(true);
    draw();
    expect(root.children).toContain(first);
    expect(root.children.some((child) => child.attributes.get('data-entity-id') === String(enemy.id))).toBe(true);
    world.vision!.visible.delete(enemy.id);
    draw();
    expect(root.children.some((child) => child.attributes.get('data-entity-id') === String(enemy.id))).toBe(false);
    bars.draw(world, new Set(), null, () => ({ x: -50, y: 10, radius: 12 }), 800, 600);
    expect(root.children).toHaveLength(0);
    bars.destroy();
    expect(host.children).toHaveLength(0);
  });
});
