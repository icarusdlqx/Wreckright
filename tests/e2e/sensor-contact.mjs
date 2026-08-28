export async function verifySensorProbe({ page, check, mission, canvasBox }) {
  const probeSetup = await page.evaluate(() => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const wasPaused = useGame.getState().paused;
    // Isolate the probe from ordinary observer movement while comparing the
    // optical fog buffers. forceStep still advances the two deterministic
    // support/vision ticks below, but the browser clock cannot add extra ones.
    useGame.getState().patch({ paused: true });
    const playerTeam = useGame.getState().playerTeam;
    const friendly = world.entities.find((entity) => (
      entity.team === playerTeam && !entity.destroyed && !entity.withdrawn &&
      entity.weapons.some((mount) => (
        !mount.destroyed &&
        world.catalog.weapons.get(mount.weaponId)?.tags.includes('indirect_fire') === true
      ))
    ));
    const enemy = world.entities.find((entity) => (
      entity.team !== playerTeam && !entity.destroyed && !entity.withdrawn
    ));
    if (friendly === undefined || enemy === undefined || world.vision === null) {
      throw new Error('probe regression needs two operational sides and player vision');
    }
    for (const entity of world.entities) {
      if (entity.team !== playerTeam) continue;
      entity.sightRange = 1;
      entity.sensorRange = 0;
      entity.orders.move = null;
      entity.orders.queue.length = 0;
      entity.path.length = 0;
    }
    const extentX = world.terrain.width * world.terrain.tileSize;
    const east = enemy.pos.x + 360 < extentX;
    friendly.pos = { x: enemy.pos.x + (east ? 360 : -360), y: enemy.pos.y };
    friendly.facing = east ? Math.PI : 0;
    friendly.torsoOffset = 0;
    friendly.heat = 0;
    friendly.shutdownRemaining = 0;
    friendly.downRemaining = 0;
    friendly.jump = null;
    friendly.targetId = null;
    friendly.calledShot = null;
    friendly.orders.attack = null;
    for (const mount of friendly.weapons) mount.cooldown = 0;
    for (const bin of friendly.ammoBins) {
      bin.destroyed = false;
      bin.rounds = Math.max(10, bin.rounds);
    }
    for (let group = 0; group < friendly.groupEnabled.length; group += 1) {
      friendly.groupEnabled[group] = true;
      friendly.groupIntent[group] = true;
    }
    enemy.controller = 'orders';
    enemy.orders.move = null;
    enemy.path.length = 0;
    for (const other of world.entities) {
      if (other.team === playerTeam || other.id === enemy.id) continue;
      other.pos = { x: 24, y: 24 + other.id * 2 };
      other.orders.move = null;
      other.path.length = 0;
    }
    useGame.getState().setSelection([friendly.id]);
    engine.renderer.camera.centreOn(enemy.pos);
    engine.renderer.camera.update(engine.renderer.viewport);
    engine.forceStep();
    world.vision.visible.delete(enemy.id);
    world.vision.detected.delete(enemy.id);
    world.vision.tracks.delete(enemy.id);
    // Only the ground the probe sweeps is evidence about the probe. The lance
    // keeps its own small footprint alive on the far side of the map, and a
    // metre of settling there rewrites tiles this assertion never meant to
    // watch — so snapshot the sweep, not the whole board.
    const sweepRadius = world.rules.support.sensor_probe.radius;
    const grid = world.terrain;
    const centre = grid.toTile(enemy.pos);
    const span = Math.ceil(sweepRadius / grid.tileSize) + 1;
    const watched = [];
    for (let row = centre.row - span; row <= centre.row + span; row += 1) {
      for (let column = centre.column - span; column <= centre.column + span; column += 1) {
        if (!grid.inBounds(column, row)) continue;
        watched.push(row * grid.width + column);
      }
    }
    globalThis.__probeFogBefore = {
      watched,
      tiles: watched.map((index) => world.vision.tiles[index]),
      explored: watched.map((index) => world.vision.explored[index]),
    };
    const screen = engine.renderer.camera.worldToScreen(enemy.pos, engine.renderer.viewport, 0);
    // Read the balance here rather than trusting a figure captured earlier in
    // the run: objectives and zone captures award RP mid-mission, so the only
    // reading the probe can be measured against is the one taken once the sim
    // is already paused. `callSupport` debits at the click, before either tick
    // below, so nothing can move this number but the probe itself.
    const rpBefore = world.resources.get(world.playerTeam ?? 0);
    return { enemyId: enemy.id, friendlyId: friendly.id, screen, wasPaused, rpBefore };
  });
  const revealsBefore = await page.evaluate(() => globalThis.__wreckright.world.reveals.length);
  await page.locator('[data-testid="support-sensor_probe"]').click();
  await page.mouse.click(
    canvasBox.x + probeSetup.screen.x,
    canvasBox.y + probeSetup.screen.y,
  );
  const sensorOutcome = await page.evaluate((enemyId) => {
    const { engine, world } = globalThis.__wreckright;
    // The debit lands with the call, so bank it before the resolution ticks:
    // once the sim advances again a zone can claim and credit the same purse.
    const rp = world.resources.get(world.playerTeam ?? 0);
    engine.forceStep();
    engine.forceStep();
    const before = globalThis.__probeFogBefore;
    delete globalThis.__probeFogBefore;
    const track = world.vision?.tracks.get(enemyId);
    return {
      reveals: world.reveals.length,
      rp,
      detected: world.vision?.detected.has(enemyId) ?? false,
      visible: world.vision?.visible.has(enemyId) ?? false,
      track: track === undefined ? null : {
        id: track.id,
        frame: track.frame,
        chassisClass: track.chassisClass,
        position: track.pos,
      },
      log: globalThis.__wreckright.useGame.getState().log.find(
        (line) => line.startsWith('Sensor sweep —'),
      ) ?? null,
      // An empty window would make every() pass on nothing at all.
      watchedTiles: before === undefined ? 0 : before.watched.length,
      fogUnchanged:
        before !== undefined &&
        before.watched.length > 0 &&
        before.watched.every((tile, index) => before.tiles[index] === world.vision?.tiles[tile]) &&
        before.watched.every(
          (tile, index) => before.explored[index] === world.vision?.explored[tile],
        ),
    };
  }, probeSetup.enemyId);
  check(
    'the sensor probe spends RP, classifies a coarse contact, and leaves optical fog unchanged',
    sensorOutcome.reveals > revealsBefore &&
      sensorOutcome.rp === probeSetup.rpBefore - mission.sensorCost &&
      sensorOutcome.detected &&
      !sensorOutcome.visible &&
      sensorOutcome.track?.id === probeSetup.enemyId &&
      sensorOutcome.log?.includes('contact') &&
      sensorOutcome.fogUnchanged,
    JSON.stringify(sensorOutcome),
  );
  const sensorCard = page.locator(`[data-testid="sensor-contact-${probeSetup.enemyId}"]`);
  await sensorCard.waitFor({ state: 'visible' });
  await page.waitForFunction((friendlyId) => {
    const current = globalThis.__wreckright.useGame.getState();
    return current.selection.includes(friendlyId) &&
      current.units.some((unit) => unit.id === friendlyId && unit.alive);
  }, probeSetup.friendlyId);
  const sensorCardState = {
    label: await sensorCard.getAttribute('aria-label'),
    text: await sensorCard.innerText(),
    disabled: await sensorCard.isDisabled(),
  };
  const sweepReadout = await page.locator('[data-testid="sensor-sweep-readout"]').innerText();
  check(
    'the coarse sensor card exposes the authored indirect penalty and sweep countdown',
    sensorCardState.label?.startsWith('Sensor contact:') &&
      sensorCardState.text.includes(`${mission.sensorAccuracyPercent}%`) &&
      /\d+s remaining/.test(sweepReadout) &&
      !sensorCardState.disabled,
    JSON.stringify({ sensorCardState, sweepReadout }),
  );
  await sensorCard.click();
  const indirect = await page.evaluate(({ friendlyId, wasPaused }) => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const selected = world.entities.find((entity) => entity.id === friendlyId);
    if (selected === undefined) throw new Error('selected indirect carrier disappeared');
    const indirectIds = new Set(selected.weapons.flatMap((mount) => (
      world.catalog.weapons.get(mount.weaponId)?.tags.includes('indirect_fire') === true
        ? [mount.weaponId]
        : []
    )));
    const ammoBefore = selected.ammoBins
      .filter((bin) => indirectIds.has(bin.weaponId))
      .reduce((total, bin) => total + bin.rounds, 0);
    const recorded = [];
    const renderer = engine.renderer;
    const hadOwn = Object.hasOwn(renderer, 'consumeEvents');
    const original = renderer.consumeEvents;
    renderer.consumeEvents = function capture(resolvedWorld, events) {
      recorded.push(...events);
      return original.call(this, resolvedWorld, events);
    };
    try {
      for (let step = 0; step < 60; step += 1) {
        engine.forceStep();
        if (recorded.some((event) => (
          event.type === 'weapon_fired' && event.shooterId === selected.id
        ))) break;
      }
    } finally {
      if (hadOwn) renderer.consumeEvents = original;
      else delete renderer.consumeEvents;
      useGame.getState().patch({ paused: wasPaused });
    }
    const fired = recorded.filter((event) => (
      event.type === 'weapon_fired' && event.shooterId === selected.id
    ));
    const ammoAfter = selected.ammoBins
      .filter((bin) => indirectIds.has(bin.weaponId))
      .reduce((total, bin) => total + bin.rounds, 0);
    return {
      attack: selected.orders.attack,
      targetId: selected.targetId,
      move: selected.orders.move,
      ammoBefore,
      ammoAfter,
      fired: fired.map((event) => ({
        weaponId: event.weaponId,
        indirect: world.catalog.weapons.get(event.weaponId)?.tags.includes('indirect_fire') === true,
      })),
    };
  }, { friendlyId: probeSetup.friendlyId, wasPaused: probeSetup.wasPaused });
  check(
    'a current coarse return fires supplied indirect mounts while direct weapons stay blind',
    indirect.attack?.targetId === probeSetup.enemyId &&
      indirect.targetId === probeSetup.enemyId &&
      indirect.move === null &&
      indirect.ammoAfter < indirect.ammoBefore &&
      indirect.fired.length > 0 &&
      indirect.fired.every((event) => event.indirect),
    JSON.stringify(indirect),
  );
}
