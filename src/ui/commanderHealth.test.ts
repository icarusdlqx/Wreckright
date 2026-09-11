import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerWorld, spawnDesign } from '../../tests/support';
import { unitIntegrity } from '../render/unitIntegrity';
import { CommanderHealthBar } from './CommanderHealthBar';
import { buildCommanderViewModel } from './commanderViewModel';

describe('commander health readouts', () => {
  it('shows remaining integrity on friendly and optical mechs and removes enemy health when optics end', () => {
    const world = playerWorld('commander-health');
    const friendly = world.entities.find((entity) => entity.team === 0)!;
    const enemy = world.entities.find((entity) => entity.team === 1)!;
    friendly.locations.left_arm.armour = 0;
    enemy.locations.right_arm.destroyed = true;
    world.vision!.visible.clear();
    world.vision!.visible.add(enemy.id);
    const input = { playerTeam: 0, selection: [], contacts: [] };
    const visible = buildCommanderViewModel(world, input);
    expect(visible.chits.find((chit) => chit.id === friendly.id)?.integrity).toBe(unitIntegrity(friendly));
    expect(visible.chits.find((chit) => chit.id === enemy.id)?.integrity).toBe(unitIntegrity(enemy));
    expect(unitIntegrity(enemy)).toBeLessThan(1);
    world.vision!.visible.delete(enemy.id);
    const hidden = buildCommanderViewModel(world, { ...input, contacts: [{
      id: enemy.id, team: 1, label: 'Sensor contact', position: { x: 100, y: 200 },
      approximateRange: 400, current: true, source: 'sensor',
    }] });
    expect(hidden.chits.some((chit) => chit.id === enemy.id)).toBe(false);
    expect(hidden.contacts[0]).not.toHaveProperty('integrity');
    expect(hidden.contacts[0]?.position).toEqual({ x: 100, y: 200 });
  });

  it('keeps vehicles as tactical chits without presenting them as mech health readouts', () => {
    const world = playerWorld('commander-support-frame');
    const vehicle = spawnDesign(world, 'courser_patrol', 0);
    const model = buildCommanderViewModel(world, { playerTeam: 0, selection: [], contacts: [] });
    expect(model.chits.find((chit) => chit.id === vehicle.id)?.integrity).toBeNull();
  });

  it('renders a fixed-stroke strip without text or pointer interception, and no strip for unknown health', () => {
    const markup = renderToStaticMarkup(createElement(CommanderHealthBar, { integrity: .5, markerSize: 40 }));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/vector-effect="non-scaling-stroke"/g)).toHaveLength(2);
    expect(markup).not.toContain('<text');
    expect(renderToStaticMarkup(createElement(CommanderHealthBar, { integrity: null, markerSize: 40 }))).toBe('');
  });
});
