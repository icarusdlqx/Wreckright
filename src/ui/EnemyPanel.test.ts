import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LOCATIONS, type MechLocation } from '../schema/common';
import { EnemyPanel } from './EnemyPanel';
import type { LocationSnapshot, TimedActionSnapshot, UnitSnapshot } from './store';

function location(armour: number, internal: number, destroyed = false): LocationSnapshot {
  return {
    armour,
    armourMax: 40,
    hasRearArmourFace: false,
    rearArmour: 0,
    rearArmourMax: 0,
    internal,
    internalMax: 20,
    destroyed,
  };
}

function hostile(): UnitSnapshot {
  const locations = Object.fromEntries(
    LOCATIONS.map((entry) => [entry, location(20, 20)]),
  ) as Record<MechLocation, LocationSnapshot>;
  locations.left_leg = location(0, 0, true);
  return {
    id: 9,
    team: 1,
    identity: 'Courser — 30t Light · Patrol · Linewrought',
    name: 'Courser',
    pilotName: 'Kestrel pilot',
    pilotSkills: { gunnery: 3, piloting: 3, sensors: 3 },
    pilotTraits: [],
    tonnage: 30,
    alive: true,
    destroyed: false,
    killMethod: null,
    heat: 4,
    heatCapacity: 30,
    shutdownRemaining: 0,
    downRemaining: 0,
    staggered: false,
    motion: 'walk',
    targetId: null,
    targetName: null,
    targetRange: null,
    rangeToLance: 212,
    lostLocations: ['left_leg'],
    locations,
    weapons: [],
    groupEnabled: [],
    holdingFire: false,
    heatSafety: false,
    ability: idle(),
    alpha: idle(),
    stability: { value: 0, staggerAt: 22, knockdownAt: 40, footingRemaining: 0 },
    reactor: {
      alphaHeat: 0,
      projectedFraction: 0,
      projectedBand: '',
      projectedTone: 'ok',
      governorHoldAt: 0,
      governorResumeAt: 0,
      shedGroups: [],
    },
    hasMoveOrder: false,
    hasAttackOrder: false,
    jumpRange: 0,
    jumpCooldown: 0,
  } as unknown as UnitSnapshot;
}

function idle(): TimedActionSnapshot {
  return { label: '', note: '', ready: true, activeRemaining: 0, cooldownRemaining: 0 };
}

describe('enemy panel', () => {
  it('reads the hostile’s integrity, range and lost sections off the snapshot', () => {
    const markup = renderToStaticMarkup(
      createElement(EnemyPanel, {
        engine: null,
        enemy: hostile(),
        canOrder: true,
        onDismiss: () => undefined,
        onCalledShot: () => undefined,
      }),
    );
    expect(markup).toContain('data-testid="enemy-panel"');
    expect(markup).toContain('Courser — 30t Light');
    // 7 intact locations × 40 = 280 of 320 armour; 7 × 20 of 160 structure.
    expect(markup).toContain('armour 44%');
    expect(markup).toContain('structure 88%');
    expect(markup).toContain('212m');
    expect(markup).toContain('lost left leg');
    expect(markup).toContain('data-testid="enemy-panel-attack"');
    expect(markup).toContain('Legs cripple the machine');
  });

  it('shows condition only when the player has nothing that can shoot', () => {
    const markup = renderToStaticMarkup(
      createElement(EnemyPanel, {
        engine: null,
        enemy: hostile(),
        canOrder: false,
        onDismiss: () => undefined,
        onCalledShot: () => undefined,
      }),
    );
    expect(markup).not.toContain('data-testid="enemy-panel-attack"');
    expect(markup).not.toContain('call the shot');
  });
});
