import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LOCATIONS } from '../schema/common';
import { CommandPalette } from './CommandPalette';
import { LanceBar, WeaponGroups } from './Panels';
import type { LocationSnapshot, UnitSnapshot } from './store';

const LOCATION: LocationSnapshot = {
  armour: 10,
  armourMax: 10,
  hasRearArmourFace: false,
  rearArmour: 0,
  rearArmourMax: 0,
  internal: 8,
  internalMax: 8,
  destroyed: false,
};

const UNIT: UnitSnapshot = {
  id: 7,
  team: 0,
  identity: 'Halberd — 75t Heavy · Heavy striker · Aurelian Stock',
  name: 'Halberd',
  pilotName: 'Kessa Vale',
  pilotSkills: { gunnery: 3, piloting: 3, sensors: 3 },
  pilotTraits: [],
  tonnage: 55,
  alive: true,
  destroyed: false,
  killMethod: null,
  heat: 0,
  heatCapacity: 30,
  shutdownRemaining: 0,
  downRemaining: 0,
  staggered: false,
  motion: 'stationary',
  targetId: null,
  targetName: null,
  targetRange: null,
  rangeToLance: 0,
  lostLocations: [],
  locations: Object.fromEntries(
    LOCATIONS.map((location) => [location, { ...LOCATION }]),
  ) as UnitSnapshot['locations'],
  weapons: [
    {
      index: 0,
      name: 'Medium Laser',
      modeId: null,
      modeName: null,
      nextModeId: null,
      nextModeName: null,
      group: 1,
      cooldown: 0,
      cooldownMax: 2,
      destroyed: false,
      rounds: null,
      shortRange: 180,
      longRange: 360,
      location: 'right_arm',
    },
    {
      index: 1,
      name: 'Autocannon',
      modeId: null,
      modeName: null,
      nextModeId: null,
      nextModeName: null,
      group: 2,
      cooldown: 0,
      cooldownMax: 3,
      destroyed: false,
      rounds: 12,
      shortRange: 240,
      longRange: 540,
      location: 'left_arm',
    },
  ],
  groupEnabled: [true, false, true, true],
  holdingFire: false,
  heatSafety: false,
  ability: { label: 'Ability', note: 'Ready.', ready: true, activeRemaining: 0, cooldownRemaining: 0 },
  alpha: { label: 'Alpha Strike', note: 'Ready.', ready: true, activeRemaining: 0, cooldownRemaining: 0 },
  stability: { value: 0, staggerAt: 10, knockdownAt: 20, footingRemaining: 0 },
  reactor: {
    alphaHeat: 0,
    projectedFraction: 0,
    projectedBand: 'cold',
    projectedTone: 'ok',
    governorHoldAt: 0.8,
    governorResumeAt: 0.5,
    shedGroups: [],
  },
  hasMoveOrder: false,
  hasAttackOrder: false,
  jumpRange: 0,
  jumpCooldown: 0,
  canJump: false,
  posture: 'hold_position',
  identified: true,
  sensorRange: 600,
  sightRange: 300,
  signature: 0.85,
  chassisTraits: [],
  role: 'Brawler',
  frameClass: 'Heavy mech',
  chassisSummary: 'A close-range line breaker with heavy armour and limited reach.',
};

function buttonTag(markup: string, testId: string): string {
  return markup.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? '';
}

describe('battle control state semantics', () => {
  it('exposes the active command state to assistive controls', () => {
    const markup = renderToStaticMarkup(
      createElement(CommandPalette, {
        orderMode: 'move',
        enabled: true,
        holdingFire: false,
        heatSafety: false,
        ability: UNIT.ability,
        alpha: UNIT.alpha,
        jump: null,
        posture: UNIT.posture,
        onCommand: () => undefined,
      }),
    );

    expect(buttonTag(markup, 'command-move')).toContain('aria-pressed="true"');
    expect(buttonTag(markup, 'command-run')).toContain('aria-pressed="false"');
    expect(buttonTag(markup, 'command-hold_position')).toContain('aria-pressed="true"');
  });

  it('omits commands the current training lesson has not introduced', () => {
    const markup = renderToStaticMarkup(
      createElement(CommandPalette, {
        orderMode: null,
        enabled: true,
        holdingFire: false,
        heatSafety: false,
        ability: UNIT.ability,
        alpha: UNIT.alpha,
        jump: null,
        posture: UNIT.posture,
        visibleCommandIds: new Set(['move']),
        onCommand: () => undefined,
      }),
    );

    expect(markup).toContain('data-testid="command-move"');
    expect(markup).not.toContain('data-testid="command-attack"');
    expect(markup).not.toContain('data-testid="command-hold_fire"');
  });

  it('keeps routine orders visible and puts specialist tactics in one disclosure', () => {
    const markup = renderToStaticMarkup(
      createElement(CommandPalette, {
        orderMode: null,
        enabled: true,
        holdingFire: false,
        heatSafety: false,
        ability: UNIT.ability,
        alpha: UNIT.alpha,
        jump: null,
        posture: UNIT.posture,
        leading: createElement('span', { 'data-testid': 'formation-control' }, 'Formation'),
        onCommand: () => undefined,
      }),
    );
    const tacticsIndex = markup.indexOf('data-testid="tactics-toggle"');

    expect(markup).toContain('aria-label="Open tactics and formation controls"');
    expect(markup.indexOf('data-testid="command-move"')).toBeLessThan(tacticsIndex);
    expect(markup.indexOf('data-testid="command-hold_position"')).toBeLessThan(tacticsIndex);
    expect(markup.indexOf('data-testid="command-ability"')).toBeLessThan(tacticsIndex);
    expect(markup.indexOf('data-testid="formation-control"')).toBeGreaterThan(tacticsIndex);
    expect(markup.indexOf('data-testid="command-run"')).toBeGreaterThan(tacticsIndex);
    expect(markup.indexOf('data-testid="command-called_shot"')).toBeGreaterThan(tacticsIndex);
    expect(markup.indexOf('data-testid="command-hold_fire"')).toBeGreaterThan(tacticsIndex);
    expect(markup.indexOf('data-testid="command-alpha_strike"')).toBeGreaterThan(tacticsIndex);
    expect(markup.indexOf('data-testid="command-heat_safety"')).toBeGreaterThan(tacticsIndex);
    expect(markup).not.toContain('data-testid="command-jump"');
  });

  it('only presents contextual ability and jump controls when the selected mech has them', () => {
    const basicMarkup = renderToStaticMarkup(
      createElement(CommandPalette, {
        orderMode: null,
        enabled: true,
        holdingFire: false,
        heatSafety: false,
        ability: null,
        alpha: null,
        jump: null,
        posture: '',
        onCommand: () => undefined,
      }),
    );
    const jumperMarkup = renderToStaticMarkup(
      createElement(CommandPalette, {
        orderMode: null,
        enabled: true,
        holdingFire: false,
        heatSafety: false,
        ability: UNIT.ability,
        alpha: UNIT.alpha,
        jump: { ready: true, range: 180, cooldown: 0 },
        posture: '',
        onCommand: () => undefined,
      }),
    );

    expect(basicMarkup).not.toContain('data-testid="command-ability"');
    expect(basicMarkup).not.toContain('data-testid="command-alpha_strike"');
    expect(basicMarkup).not.toContain('data-testid="command-jump"');
    expect(jumperMarkup).toContain('data-testid="command-ability"');
    expect(jumperMarkup).toContain('data-testid="command-alpha_strike"');
    expect(jumperMarkup).toContain('data-testid="command-jump"');
  });

  it('leaves authored training controls flat instead of hiding them in Tactics', () => {
    const markup = renderToStaticMarkup(
      createElement(CommandPalette, {
        orderMode: null,
        enabled: true,
        holdingFire: false,
        heatSafety: false,
        ability: UNIT.ability,
        alpha: UNIT.alpha,
        jump: null,
        posture: '',
        visibleCommandIds: new Set(['move', 'hold_fire', 'heat_safety']),
        onCommand: () => undefined,
      }),
    );

    expect(markup).toContain('data-testid="command-move"');
    expect(markup).toContain('data-testid="command-hold_fire"');
    expect(markup).toContain('data-testid="command-heat_safety"');
    expect(markup).not.toContain('data-testid="tactics-toggle"');
  });

  it('exposes weapon toggles and lance selection as pressed states', () => {
    const weapons = renderToStaticMarkup(
      createElement(WeaponGroups, { unit: UNIT, onToggleGroup: () => undefined }),
    );
    const lance = renderToStaticMarkup(
      createElement(LanceBar, {
        units: [UNIT, { ...UNIT, id: 8, pilotName: 'Dorn Hess' }],
        selection: [UNIT.id],
        onSelect: () => undefined,
      }),
    );

    expect(buttonTag(weapons, 'group-1')).toContain('aria-pressed="true"');
    expect(buttonTag(weapons, 'group-2')).toContain('aria-pressed="false"');
    expect(buttonTag(lance, 'lance-card-7')).toContain('aria-pressed="true"');
    expect(buttonTag(lance, 'lance-card-8')).toContain('aria-pressed="false"');
    expect(lance).toContain('Halberd — 75t Heavy · Heavy striker · Aurelian Stock');
  });

  it('presents a friendly fire mode as an action and a hostile mode as read-only', () => {
    const modalWeapon = {
      ...UNIT.weapons[0]!,
      name: 'Canister Cannon',
      modeId: 'cluster',
      modeName: 'Cluster',
      nextModeId: 'slug',
      nextModeName: 'Slug',
    };
    const modalUnit = { ...UNIT, weapons: [modalWeapon] };
    const friendly = renderToStaticMarkup(
      createElement(WeaponGroups, {
        unit: modalUnit,
        playerTeam: 0,
        onToggleGroup: () => undefined,
        onSetWeaponMode: () => undefined,
      }),
    );
    const hostile = renderToStaticMarkup(
      createElement(WeaponGroups, {
        unit: { ...modalUnit, team: 1 },
        playerTeam: 0,
        onToggleGroup: () => undefined,
        onSetWeaponMode: () => undefined,
      }),
    );

    const action = buttonTag(friendly, 'weapon-mode-0');
    expect(action).toContain(
      'aria-label="Canister Cannon mode Cluster. Switch to Slug"',
    );
    expect(action).not.toContain('aria-pressed');
    expect(friendly).toContain('>Cluster</button>');
    expect(buttonTag(hostile, 'weapon-mode-0')).toBe('');
    expect(hostile).toContain('class="weapon-mode-readout"');
    expect(hostile).toContain('>Cluster</span>');
  });

  it('disables the fire-mode action when its mount is destroyed', () => {
    const weapon = {
      ...UNIT.weapons[0]!,
      name: 'Canister Cannon',
      modeId: 'cluster',
      modeName: 'Cluster',
      nextModeId: 'slug',
      nextModeName: 'Slug',
      destroyed: true,
    };
    const markup = renderToStaticMarkup(
      createElement(WeaponGroups, {
        unit: { ...UNIT, weapons: [weapon] },
        playerTeam: 0,
        onToggleGroup: () => undefined,
        onSetWeaponMode: () => undefined,
      }),
    );

    expect(buttonTag(markup, 'weapon-mode-0')).toContain('disabled=""');
  });
});
