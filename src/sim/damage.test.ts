import { beforeEach, describe, expect, it } from 'vitest';
import { spawnDesign, testWorld, unitOf } from '../../tests/support';
import { applyDamage, destroyLocation, detonateAmmoBin } from './damage';
import { eventsOfType } from './events';
import { isImmobile, isOperational, type AmmoBin, type MechEntity, type World } from './types';

let world: World;
let mech: MechEntity;

function pointOnTerrain(worldAt: World, terrainId: string): { x: number; y: number } {
  for (let row = 0; row < worldAt.terrain.height; row += 1) {
    for (let column = 0; column < worldAt.terrain.width; column += 1) {
      if (worldAt.terrain.idAt(column, row) === terrainId) {
        return worldAt.terrain.tileCentre(column, row);
      }
    }
  }
  throw new Error(`mission has no ${terrainId} tile`);
}

beforeEach(() => {
  world = testWorld('damage');
  mech = unitOf(world, 'sentinel_brawler');
});

describe('applyDamage', () => {
  it('strips armour before internal structure', () => {
    const arm = mech.locations.left_arm;
    const absorbed = applyDamage(world, mech, 'left_arm', 10);

    expect(absorbed).toBe(10);
    expect(arm.armour).toBe(arm.armourMax - 10);
    expect(arm.internal).toBe(arm.internalMax);
  });

  it('spills into internal structure once armour is gone', () => {
    const arm = mech.locations.left_arm;
    applyDamage(world, mech, 'left_arm', arm.armourMax + 5);

    expect(arm.armour).toBe(0);
    expect(arm.internal).toBe(arm.internalMax - 5);
    expect(arm.destroyed).toBe(false);
  });

  it('returns only the damage the mech could actually absorb', () => {
    const arm = mech.locations.left_arm;
    const capacity = arm.armourMax + arm.internalMax;
    const torso = mech.locations.left_torso;
    const overkill = capacity + torso.armourMax + torso.internalMax + 1000;

    const absorbed = applyDamage(world, mech, 'left_arm', overkill);
    expect(absorbed).toBeLessThan(overkill);
    expect(absorbed).toBeGreaterThan(capacity);
  });

  it('destroys a location and transfers the excess inwards', () => {
    const arm = mech.locations.left_arm;
    const torso = mech.locations.left_torso;
    applyDamage(world, mech, 'left_arm', arm.armourMax + arm.internalMax + 12);

    expect(arm.destroyed).toBe(true);
    expect(torso.armour).toBe(torso.armourMax - 12);
  });

  it('routes damage onward when the struck location is already gone', () => {
    destroyLocation(world, mech, 'left_arm');
    const torso = mech.locations.left_torso;
    applyDamage(world, mech, 'left_arm', 9);
    expect(torso.armour).toBe(torso.armourMax - 9);
  });

  it('routes a rear hit through a rear-capable torso with zero rear plate', () => {
    const torso = mech.locations.centre_torso;
    torso.armour = 30;
    torso.rearArmour = 0;
    torso.rearArmourMax = 0;
    const internalBefore = torso.internal;

    expect(torso.hasRearArmourFace).toBe(true);
    const absorbed = applyDamage(world, mech, 'centre_torso', 5, 'rear');

    expect(torso.armour).toBe(30);
    expect(torso.internal).toBe(internalBefore - absorbed);
  });

  it('keeps rear fire on a one-faced leg against its front plate', () => {
    const leg = mech.locations.left_leg;
    const armourBefore = leg.armour;
    const internalBefore = leg.internal;

    expect(leg.hasRearArmourFace).toBe(false);
    expect(leg.rearArmourMax).toBe(0);
    const absorbed = applyDamage(world, mech, 'left_leg', 5, 'rear');

    expect(leg.armour).toBe(armourBefore - absorbed);
    expect(leg.internal).toBe(internalBefore);
  });

  it('stops at the centre torso rather than looping', () => {
    const absorbed = applyDamage(world, mech, 'centre_torso', 100_000);
    expect(absorbed).toBeLessThan(100_000);
    expect(mech.destroyed).toBe(true);
  });
});

describe('location destruction', () => {
  it('destroys the weapons carried in that location', () => {
    const armWeapons = mech.weapons.filter((mount) => mount.location === 'left_arm');
    expect(armWeapons.length).toBeGreaterThan(0);

    destroyLocation(world, mech, 'left_arm');
    expect(armWeapons.every((mount) => mount.destroyed)).toBe(true);
    expect(mech.weapons.some((mount) => !mount.destroyed)).toBe(true);
  });

  it('kills the mech when the centre torso goes', () => {
    destroyLocation(world, mech, 'centre_torso');
    expect(mech.destroyed).toBe(true);
    expect(mech.killMethod).toBe('centre_torso');
    expect(isOperational(mech)).toBe(false);
  });

  it('takes the pilot out when the head goes', () => {
    destroyLocation(world, mech, 'head');
    expect(mech.destroyed).toBe(true);
    expect(mech.killMethod).toBe('head');
    expect(mech.pilot.dead || mech.pilot.ejected).toBe(true);
  });

  it('immobilises but does not destroy a mech that loses both legs', () => {
    destroyLocation(world, mech, 'left_leg');
    expect(isImmobile(mech)).toBe(false);

    destroyLocation(world, mech, 'right_leg');
    expect(isImmobile(mech)).toBe(true);
    expect(mech.destroyed).toBe(false);
    expect(isOperational(mech)).toBe(true);
  });

  it('is idempotent', () => {
    destroyLocation(world, mech, 'left_arm');
    const events = eventsOfType(world.events, 'location_destroyed').length;
    destroyLocation(world, mech, 'left_arm');
    expect(eventsOfType(world.events, 'location_destroyed').length).toBe(events);
  });
});

describe('ammo explosions', () => {
  /** Strips the blowout cell off the Sentinel's missile bin so it can go up. */
  function bareBin(entity: MechEntity): AmmoBin {
    const bin = entity.ammoBins.find((entry) => entry.location === 'left_torso');
    if (bin === undefined) throw new Error('the Sentinel carries its missiles in the left torso');
    bin.protectedByCase = false;
    return bin;
  }

  it('ships the stock Sentinel and Cairn with every bin in a blowout cell', () => {
    const cairn = spawnDesign(world, 'cairn_battery');
    for (const entity of [mech, cairn]) {
      expect(entity.ammoBins.length).toBeGreaterThan(0);
      for (const bin of entity.ammoBins) expect(bin.protectedByCase, bin.location).toBe(true);
    }
  });

  it('blows through the plate inboard of a breached bin rather than straight into the core', () => {
    const bin = bareBin(mech);
    mech.pos = pointOnTerrain(world, 'forest');

    const core = mech.locations.centre_torso;
    const armourBefore = core.armour;
    const internalBefore = core.internal;
    const takenBefore = mech.stats.damageTaken;

    destroyLocation(world, mech, bin.location);

    const blasts = eventsOfType(world.events, 'ammo_explosion');
    expect(blasts).toHaveLength(1);
    expect(core.armour).toBeLessThan(armourBefore);
    expect(core.internal).toBe(internalBefore);
    expect(mech.destroyed).toBe(false);
    expect(mech.stats.damageTaken - takenBefore).toBeCloseTo(armourBefore - core.armour, 6);
    expect(world.fire.pendingIgnitions.map((request) => request.source)).toContain('ammo_explosion');
  });

  it('cores the mech by ammo explosion only once the blast gets through, and books only that', () => {
    const bin = bareBin(mech);
    const core = mech.locations.centre_torso;
    core.armour = 0;
    core.rearArmour = 0;
    core.internal = 5;
    const takenBefore = mech.stats.damageTaken;

    destroyLocation(world, mech, bin.location);

    expect(mech.destroyed).toBe(true);
    expect(mech.killMethod).toBe('ammo_explosion');
    expect(mech.stats.damageTaken - takenBefore).toBeCloseTo(5, 6);
  });

  it('strips the plate of an intact location a cooked-off bin sits in first', () => {
    const bin = bareBin(mech);
    const side = mech.locations[bin.location];
    const armourBefore = side.armour;
    const core = mech.locations.centre_torso;
    const coreBefore = { armour: core.armour, internal: core.internal };

    detonateAmmoBin(world, mech, bin);

    expect(side.armour).toBeLessThan(armourBefore);
    expect(core.armour).toBe(coreBefore.armour);
    expect(core.internal).toBe(coreBefore.internal);
    expect(bin.destroyed).toBe(true);
    expect(bin.rounds).toBe(0);
  });

  it('contains the blast when CASE is fitted', () => {
    const scout = unitOf(world, 'hornet_spotter');
    const bin = scout.ammoBins.find((entry) => entry.protectedByCase);
    expect(bin).toBeDefined();
    scout.pos = pointOnTerrain(world, 'forest');

    const core = scout.locations.centre_torso;
    const before = core.internal;

    destroyLocation(world, scout, bin?.location ?? 'right_torso');

    expect(eventsOfType(world.events, 'ammo_explosion').length).toBe(0);
    expect(core.internal).toBe(before);
    expect(bin?.rounds).toBe(0);
    expect(world.fire.pendingIgnitions).toHaveLength(0);
  });

  it('caps explosion damage at the rules ceiling', () => {
    const bin = bareBin(mech);
    destroyLocation(world, mech, bin.location);

    const explosions = eventsOfType(world.events, 'ammo_explosion');
    expect(explosions.length).toBeGreaterThan(0);
    for (const explosion of explosions) {
      expect(explosion.damage).toBeLessThanOrEqual(world.rules.damage.ammoExplosionCap);
    }
  });
});

describe('volatile mounts', () => {
  it('dumps a Gauss rifle into the centre torso when its mount is breached', () => {
    const siege = spawnDesign(world, 'colossus_siege');
    const gauss = siege.weapons.find((mount) => mount.weaponId === 'gauss_rifle');
    expect(gauss).toBeDefined();
    if (gauss === undefined) return;
    siege.pos = pointOnTerrain(world, 'forest');

    const before = siege.locations.centre_torso.internal;
    destroyLocation(world, siege, gauss.location);

    const blasts = eventsOfType(world.events, 'ammo_explosion').filter(
      (event) => event.entityId === siege.id,
    );
    expect(blasts.length).toBeGreaterThan(0);
    expect(siege.locations.centre_torso.internal).toBeLessThan(before);
    expect(world.fire.pendingIgnitions).toHaveLength(0);
  });

  it('leaves an ordinary mount to fail quietly', () => {
    const brawler = unitOf(world, 'sentinel_brawler');
    const mount = brawler.weapons.find((entry) => entry.weaponId !== 'gauss_rifle');
    expect(mount).toBeDefined();
    if (mount === undefined) return;

    const before = brawler.locations.centre_torso.internal;
    destroyLocation(world, brawler, mount.location);

    expect(mount.destroyed).toBe(true);
    // Any drop here would be an ammo bin going up, not the gun itself.
    const blasts = eventsOfType(world.events, 'ammo_explosion');
    if (blasts.length === 0) expect(brawler.locations.centre_torso.internal).toBe(before);
  });
});
