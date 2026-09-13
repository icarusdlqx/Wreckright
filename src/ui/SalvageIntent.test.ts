import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog, playerWorld } from '../../tests/support';
import { snapshotUnit } from './snapshot';
import { salvageAimAdvice, SalvageIntent } from './SalvageIntent';

function target() {
  const world = playerWorld();
  const enemy = world.entities.find(entity => entity.team !== world.playerTeam)!;
  world.vision!.visible.add(enemy.id);
  world.vision!.identified.add(enemy.id);
  return snapshotUnit(world, enemy);
}

describe('tactical salvage intent', () => {
  it('shows conditional hull odds from the current rules and never guarantees a capture', () => {
    const observed = target();
    const html = renderToStaticMarkup(createElement(SalvageIntent, { catalog, target: observed, location: 'left_leg' }));
    expect(html).toContain(`${Math.round(catalog.rules.salvage.chassisRecoveryByOutcome.legged * 100)}%`);
    expect(html).toContain('One lost leg alone is not a capture');
    expect(html).toContain('win through another objective');
    expect(html).toContain('can still fire and count toward elimination objectives');
    expect(html).toContain('before contract share');
    expect(html).toContain('skirmishes keep no salvage');
    observed.locations.left_leg.destroyed = true;
    expect(salvageAimAdvice(observed, 'right_leg')).toContain('remaining leg');
    observed.locations.right_leg.destroyed = true;
    expect(salvageAimAdvice(observed, 'centre_torso')).toContain('Preserve its core');
  });

  it('describes a head kill as a risk to the pilot rather than a guaranteed death', () => {
    expect(catalog.rules.damage.headDestroyedEjectionChance).toBeGreaterThan(0);
    const advice = salvageAimAdvice(target(), 'head');
    expect(advice).toContain('risks killing its pilot');
    expect(advice).toContain('ejection is possible');
  });

  it('explains the gun that will be silenced without leaking sensor-only identity', () => {
    const observed = target();
    const weapon = observed.weapons.find(weapon => !weapon.destroyed && weapon.location !== 'head' && weapon.location !== 'centre_torso')!;
    expect(salvageAimAdvice(observed, weapon.location)).toContain(weapon.name);
    observed.identified = false;
    expect(renderToStaticMarkup(createElement(SalvageIntent, { catalog, target: observed }))).toBe('');
    observed.identified = true;
    observed.alive = false;
    expect(renderToStaticMarkup(createElement(SalvageIntent, { catalog, target: observed }))).toBe('');
  });
});
