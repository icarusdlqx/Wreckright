import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import { snapshotUnit } from './snapshot';
import { CalledShotTarget } from './CalledShotTarget';
import { PaperDoll } from './PaperDoll';

describe('called-shot target inspection', () => {
  it('offers optical hostile armour with explicit target selection, leaving an ordinary armour view read-only', () => {
    const world = playerWorld();
    const enemy = world.entities.find((entity) => entity.team !== world.playerTeam)!;
    world.vision!.visible.add(enemy.id);
    world.vision!.identified.add(enemy.id);
    const snapshot = snapshotUnit(world, enemy);
    const html = renderToStaticMarkup(createElement(CalledShotTarget, { enemies: [snapshot], currentTargetId: enemy.id,
      location: 'left_leg', onAim: () => undefined, onCancel: () => undefined }));
    expect(html).toContain('Called shot · hostile armour');
    expect(html).toContain('data-testid="called-shot-hostile"');
    expect(html).toContain('direct the selected lance');
    expect(html).not.toContain('disabled=""');
    const armour = renderToStaticMarkup(createElement(PaperDoll, { locations: snapshot.locations }));
    expect((armour.match(/disabled=""/g) ?? []).length).toBe(8);
  });

  it('offers no body sections when no live optical target is available', () => {
    const world = playerWorld();
    const enemy = snapshotUnit(world, world.entities.find((entity) => entity.team !== world.playerTeam)!);
    const html = renderToStaticMarkup(createElement(CalledShotTarget, { enemies: [{ ...enemy, identified: false }], currentTargetId: enemy.id,
      location: null, onAim: () => undefined, onCancel: () => undefined }));
    expect(html).toContain('Optical contact required');
    expect(html).not.toContain('data-testid="paper-doll"');
  });
});
