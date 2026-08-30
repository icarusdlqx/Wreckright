import { describe, expect, it } from 'vitest';
import { playerWorld } from '../../tests/support';
import type { ContactSnapshot } from './store';
import { buildCommanderViewModel } from './commanderViewModel';

function combatants(world: ReturnType<typeof playerWorld>) {
  const playerTeam = world.playerTeam ?? 0;
  const friendlies = world.entities.filter((entity) => entity.team === playerTeam);
  const hostiles = world.entities.filter((entity) => entity.team !== playerTeam);
  if (friendlies.length < 2 || hostiles.length < 3 || world.vision === null) {
    throw new Error('commander fixture needs two friendlies, three hostiles and player vision');
  }
  world.vision.visible.clear();
  world.vision.detected.clear();
  world.vision.tracks.clear();
  return { playerTeam, friendlies, hostiles, vision: world.vision };
}

function contact(
  id: number,
  team: number,
  position: { x: number; y: number },
  current = true,
): ContactSnapshot {
  return {
    id,
    team,
    label: 'Heavy mech',
    position,
    approximateRange: 450,
    current,
    source: 'sensor',
  };
}

describe('commander view model', () => {
  it('maps the whole field, zones, operational friendlies and optical hostiles', () => {
    const world = playerWorld('commander-whole-field');
    const { playerTeam, friendlies, hostiles, vision } = combatants(world);
    const selected = friendlies[0]!;
    const stoppedFriendly = friendlies[1]!;
    const optical = hostiles[0]!;
    const stoppedHostile = hostiles[1]!;

    selected.pos = { x: 132, y: 756 };
    selected.facing = -Math.PI / 4;
    stoppedFriendly.destroyed = true;
    optical.pos = { x: 612, y: 324 };
    optical.facing = Math.PI * 0.75;
    vision.visible.add(optical.id);
    stoppedHostile.destroyed = true;
    vision.visible.add(stoppedHostile.id);
    world.zones.splice(0, world.zones.length, {
      id: 'relay',
      name: 'Relay Station',
      x: 444,
      y: 492,
      radius: 70,
      owner: 1,
      captureSeconds: 8,
      resourcePoints: 350,
      contender: playerTeam,
      progress: 3,
      contested: true,
      heldSeconds: {},
    });

    const model = buildCommanderViewModel(world, {
      playerTeam,
      selection: [selected.id],
      contacts: [],
    });

    expect(model).toMatchObject({
      width: world.terrain.width * world.terrain.tileSize,
      height: world.terrain.height * world.terrain.tileSize,
      tileSize: world.terrain.tileSize,
      zones: [{
        id: 'relay',
        name: 'Relay Station',
        position: { x: 444, y: 492 },
        radius: 70,
        owner: 1,
        contender: playerTeam,
        progress: 3,
        captureSeconds: 8,
        contested: true,
      }],
    });
    expect(model.chits).toContainEqual({
      id: selected.id,
      team: playerTeam,
      kind: 'friendly',
      position: selected.pos,
      facing: -Math.PI / 4,
      selected: true,
    });
    expect(model.chits).toContainEqual({
      id: optical.id,
      team: optical.team,
      kind: 'optical',
      position: optical.pos,
      facing: Math.PI * 0.75,
      selected: false,
    });
    expect(model.chits.map((chit) => chit.id)).not.toContain(stoppedFriendly.id);
    expect(model.chits.map((chit) => chit.id)).not.toContain(stoppedHostile.id);
    expect(model.chits.map((chit) => chit.id)).not.toContain(hostiles[2]!.id);
  });

  it('copies current and remembered markers without consulting hidden hostile state', () => {
    const world = playerWorld('commander-contact-privacy');
    const { playerTeam, friendlies, hostiles } = combatants(world);
    const hidden = hostiles[0]!;
    hidden.name = 'SECRET HULL';
    hidden.pilot.name = 'SECRET PILOT';
    hidden.pos = { x: 913.125, y: 877.875 };
    hidden.facing = 2.3456789;
    hidden.orders.move = { to: { x: 811.25, y: 733.75 }, run: true };
    hidden.path = [{ x: 799.5, y: 701.5 }];
    const current = contact(hidden.id, hidden.team, { x: 504, y: 312 });
    const remembered = contact(hostiles[1]!.id, hostiles[1]!.team, { x: 552, y: 360 }, false);

    const model = buildCommanderViewModel(world, {
      playerTeam,
      selection: [friendlies[0]!.id, hidden.id],
      contacts: [remembered, current],
    });

    expect(model.contacts).toEqual([
      { ...current, position: { x: 504, y: 312 } },
      { ...remembered, position: { x: 552, y: 360 } },
    ].sort((left, right) => left.id - right.id));
    expect(model.contacts.find((entry) => entry.id === hidden.id)?.position).not.toBe(current.position);
    expect(model.chits.map((chit) => chit.id)).not.toContain(hidden.id);
    expect(model.routes.map((route) => route.entityId)).not.toContain(hidden.id);
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain('SECRET HULL');
    expect(serialized).not.toContain('SECRET PILOT');
    expect(serialized).not.toContain('913.125');
    expect(serialized).not.toContain('877.875');
    expect(serialized).not.toContain('2.3456789');
    expect(serialized).not.toContain('811.25');
    expect(serialized).not.toContain('733.75');
    expect(serialized).not.toContain('799.5');

    hidden.pos = { x: 101.25, y: 202.75 };
    hidden.facing = -1.9876;
    const rebuilt = buildCommanderViewModel(world, {
      playerTeam,
      selection: [],
      contacts: [current],
    });
    expect(rebuilt.contacts[0]?.position).toEqual({ x: 504, y: 312 });
    expect(rebuilt.chits.map((chit) => chit.id)).not.toContain(hidden.id);
  });

  it('promotes an optical contact to an exact chit without drawing both', () => {
    const world = playerWorld('commander-optical-promotion');
    const { playerTeam, hostiles, vision } = combatants(world);
    const hostile = hostiles[0]!;
    const staleContact = contact(hostile.id, hostile.team, { x: 24, y: 24 });
    vision.visible.add(hostile.id);

    const model = buildCommanderViewModel(world, {
      playerTeam,
      selection: [],
      contacts: [staleContact],
    });

    expect(model.chits).toContainEqual(expect.objectContaining({
      id: hostile.id,
      kind: 'optical',
      position: hostile.pos,
    }));
    expect(model.contacts).toEqual([]);
  });

  it('draws active paths and queued legs only for selected operational friendlies', () => {
    const world = playerWorld('commander-selected-routes');
    const { playerTeam, friendlies, hostiles } = combatants(world);
    const selected = friendlies[0]!;
    const unselected = friendlies[1]!;
    const hostile = hostiles[0]!;
    selected.pos = { x: 100, y: 120 };
    selected.orders.move = { to: { x: 300, y: 320 }, run: false, engage: true };
    selected.path = [
      { x: 100, y: 120 },
      { x: 180, y: 220 },
      { x: 300, y: 320 },
    ];
    selected.pathIndex = 1;
    selected.orders.queue = [
      { to: { x: 420, y: 280 }, run: true },
      { to: { x: 500, y: 200 }, run: false, engage: true },
    ];
    unselected.orders.move = { to: { x: 600, y: 600 }, run: true };
    hostile.orders.move = { to: { x: 50, y: 50 }, run: true };

    const model = buildCommanderViewModel(world, {
      playerTeam,
      selection: [selected.id, hostile.id],
      contacts: [],
    });

    expect(model.routes).toEqual([{
      entityId: selected.id,
      active: {
        points: [
          { x: 100, y: 120 },
          { x: 180, y: 220 },
          { x: 300, y: 320 },
        ],
        run: false,
        engage: true,
      },
      queued: [
        {
          points: [{ x: 300, y: 320 }, { x: 420, y: 280 }],
          run: true,
          engage: false,
        },
        {
          points: [{ x: 420, y: 280 }, { x: 500, y: 200 }],
          run: false,
          engage: true,
        },
      ],
    }]);

    selected.destroyed = true;
    expect(buildCommanderViewModel(world, {
      playerTeam,
      selection: [selected.id],
      contacts: [],
    }).routes).toEqual([]);
  });
});
