import { describe, expect, it } from 'vitest';
import { WeaponSchema } from '../schema/weapon';
import type { Catalog } from '../schema/load';
import type { Design } from '../schema/design';
import { spawnDesign, testWorld, unitOf } from '../../tests/support';
import { roleOf } from './ai/roles';
import { expectedDps } from './ai/utility';
import { updateWeapons } from './combat';
import { eventsOfType } from './events';
import { applyHeatGovernor } from './governor';
import { computeHeatProfile } from './loadout';
import { hitPreview } from './preview';
import { updateTeamVisions } from './sensors';
import type { MechEntity, World } from './types';
import { setWeaponMode, weaponFireProfile } from './weaponModes';

function lbx(catalog: Catalog) {
  const weapon = catalog.weapons.get('lbx_ac10');
  if (weapon === undefined) throw new Error('missing LB-X cannon');
  return weapon;
}

function syntheticCatalog(catalog: Catalog): Catalog {
  const base = lbx(catalog);
  const synthetic = WeaponSchema.parse({
    ...structuredClone(base),
    modes: [
      { id: 'steady', name: 'Steady', damage: base.damage },
      {
        id: 'overdrive',
        name: 'Overdrive',
        damage: 24,
        accuracy: 0.55,
        heat: 12,
        cooldown: 0.75,
      },
    ],
  });
  return {
    ...catalog,
    weapons: new Map(catalog.weapons).set(synthetic.id, synthetic),
  };
}

function lbxDuel(seed: string, synthetic = false): {
  world: World;
  shooter: MechEntity;
  target: MechEntity;
} {
  const world = testWorld(seed);
  const shooter = spawnDesign(world, 'redoubt_emplacement', 0, { x: 500, y: 500 });
  const target = unitOf(world, 'falchion_duellist');
  target.pos = { x: 600, y: 500 };
  shooter.pos = { x: 500, y: 500 };
  shooter.facing = 0;
  shooter.sightRange = 2_000;
  shooter.targetId = target.id;
  shooter.weapons = shooter.weapons.filter((mount) => mount.weaponId === 'lbx_ac10');
  shooter.ammoBins = shooter.ammoBins.filter((bin) => bin.weaponId === 'lbx_ac10');
  world.entities = [shooter, target];
  if (synthetic) world.catalog = syntheticCatalog(world.catalog);
  updateTeamVisions(world);
  return { world, shooter, target };
}

function selectedMount(shooter: MechEntity) {
  const mount = shooter.weapons[0];
  if (mount === undefined) throw new Error('missing LB-X mount');
  return mount;
}

function designInMode(catalog: Catalog, modeId: string): Design {
  const design = structuredClone(catalog.designs.get('redoubt_emplacement'));
  if (design === undefined) throw new Error('missing Redoubt design');
  const mount = design.mounts.find((candidate) => candidate.weaponId === 'lbx_ac10');
  if (mount === undefined) throw new Error('missing LB-X design mount');
  mount.modeId = modeId;
  return design;
}

describe('active weapon fire profiles', () => {
  it('fires cluster and slug as distinct, snapshotted volleys for one round each', () => {
    const { world, shooter } = lbxDuel('fire-mode-volley');
    const weapon = lbx(world.catalog);
    const mount = selectedMount(shooter);
    const bin = shooter.ammoBins[0];
    if (bin === undefined) throw new Error('missing LB-X ammunition');
    const cluster = weaponFireProfile(weapon, 'cluster');
    const slug = weaponFireProfile(weapon, 'slug');

    expect(cluster).toMatchObject({ damage: 1.2, projectiles: 10, heat: 2, cooldown: 3 });
    expect(slug).toMatchObject({ damage: 13.2, projectiles: 1, heat: 2, cooldown: 3 });

    expect(setWeaponMode(weapon, mount, 'cluster')).toBe(true);
    const rounds = bin.rounds;
    updateWeapons(world, shooter);
    const inFlight = [...world.projectiles];

    expect(inFlight).toHaveLength(10);
    expect(inFlight.every((projectile) => projectile.damage === 1.2)).toBe(true);
    expect(bin.rounds).toBe(rounds - 1);
    expect(mount.cooldown).toBe(3);
    expect(mount.cycleDuration).toBe(3);
    expect(eventsOfType(world.events, 'weapon_fired').at(-1)?.modeId).toBe('cluster');

    expect(setWeaponMode(weapon, mount, 'slug')).toBe(true);
    expect(inFlight).toHaveLength(10);
    expect(inFlight.every((projectile) => projectile.damage === 1.2)).toBe(true);
    world.projectiles = [];
    mount.cooldown = 0;
    updateWeapons(world, shooter);

    expect(world.projectiles).toHaveLength(1);
    expect(world.projectiles[0]?.damage).toBe(13.2);
    expect(bin.rounds).toBe(rounds - 2);
    expect(shooter.heat).toBe(4);
    expect(eventsOfType(world.events, 'weapon_fired').at(-1)?.modeId).toBe('slug');
  });

  it('uses partial overrides in previews and AI assessment', () => {
    const { world, shooter, target } = lbxDuel('fire-mode-consumers', true);
    const mount = selectedMount(shooter);

    mount.modeId = 'steady';
    const steadyPreview = hitPreview(world, shooter, target)?.weapons[0]?.chance;
    const steadyDps = expectedDps(world, shooter, target, 100);

    mount.modeId = 'overdrive';
    const overdrivePreview = hitPreview(world, shooter, target)?.weapons[0]?.chance;
    const overdriveDps = expectedDps(world, shooter, target, 100);

    expect(overdrivePreview ?? 1).toBeLessThan(steadyPreview ?? 0);
    expect(overdriveDps).toBeGreaterThan(steadyDps);

    shooter.weapons.push(...Array.from({ length: 6 }, (_, index) => ({
      ...mount,
      index: index + 1,
      weaponId: 'flamer',
      group: 1,
      modeId: null,
      cycleDuration: 1.5,
    })));
    mount.modeId = 'steady';
    expect(roleOf(world, shooter).role).toBe('skirmisher');
    mount.modeId = 'overdrive';
    expect(roleOf(world, shooter).role).toBe('sniper');
  });

  it('prices selected design modes in heat planning', () => {
    const catalog = syntheticCatalog(testWorld('fire-mode-loadout').catalog);
    const steady = designInMode(catalog, 'steady');
    const overdrive = designInMode(catalog, 'overdrive');

    expect(computeHeatProfile(catalog, overdrive).heatPerSecond).toBeGreaterThan(
      computeHeatProfile(catalog, steady).heatPerSecond,
    );
  });

  it('lets the governor retain an efficient mode and shed a hot one deterministically', () => {
    const configure = (seed: string, modeId: string): { world: World; shooter: MechEntity } => {
      const { world, shooter } = lbxDuel(seed, true);
      const mount = selectedMount(shooter);
      mount.modeId = modeId;
      mount.cooldown = 10;
      shooter.heat = shooter.heatCapacity * 0.8;
      shooter.groupIntent.fill(false);
      shooter.groupEnabled.fill(false);
      shooter.groupIntent[mount.group - 1] = true;
      return { world, shooter };
    };
    const steady = configure('fire-mode-governor', 'steady');
    const overdrive = configure('fire-mode-governor', 'overdrive');

    applyHeatGovernor(steady.world, steady.shooter, false);
    applyHeatGovernor(overdrive.world, overdrive.shooter, false);

    expect(steady.shooter.groupEnabled[1]).toBe(true);
    expect(overdrive.shooter.groupEnabled[1]).toBe(false);
    const replay = configure('fire-mode-governor', 'overdrive');
    applyHeatGovernor(replay.world, replay.shooter, false);
    expect(replay.shooter.groupEnabled).toEqual(overdrive.shooter.groupEnabled);
  });
});
