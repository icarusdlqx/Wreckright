export async function verifySensorProbe({ page, check, mission, canvasBox }) {
  const probeSetup = await page.evaluate(() => {
    const { engine, useGame, world } = globalThis.__ironline;
    const playerTeam = useGame.getState().playerTeam;
    const friendly = world.entities.find((entity) => (
      entity.team === playerTeam && !entity.destroyed && !entity.withdrawn
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
      entity.orders.move = null;
      entity.orders.queue.length = 0;
      entity.path.length = 0;
    }
    useGame.getState().setSelection([friendly.id]);
    engine.renderer.camera.centreOn(enemy.pos);
    engine.renderer.camera.update(engine.renderer.viewport);
    engine.forceStep();
    world.vision.visible.delete(enemy.id);
    world.vision.detected.delete(enemy.id);
    world.vision.tracks.delete(enemy.id);
    globalThis.__probeFogBefore = {
      tiles: Array.from(world.vision.tiles),
      explored: Array.from(world.vision.explored),
    };
    const screen = engine.renderer.camera.worldToScreen(enemy.pos, engine.renderer.viewport, 0);
    return { enemyId: enemy.id, friendlyId: friendly.id, screen };
  });
  const revealsBefore = await page.evaluate(() => globalThis.__ironline.world.reveals.length);
  await page.locator('[data-testid="support-sensor_probe"]').click();
  await page.mouse.click(
    canvasBox.x + probeSetup.screen.x,
    canvasBox.y + probeSetup.screen.y,
  );
  const sensorOutcome = await page.evaluate((enemyId) => {
    const { engine, world } = globalThis.__ironline;
    engine.forceStep();
    engine.forceStep();
    const before = globalThis.__probeFogBefore;
    delete globalThis.__probeFogBefore;
    const track = world.vision?.tracks.get(enemyId);
    return {
      reveals: world.reveals.length,
      rp: world.resources.get(world.playerTeam ?? 0),
      detected: world.vision?.detected.has(enemyId) ?? false,
      visible: world.vision?.visible.has(enemyId) ?? false,
      track: track === undefined ? null : {
        id: track.id,
        frame: track.frame,
        chassisClass: track.chassisClass,
        position: track.pos,
      },
      fogUnchanged:
        before !== undefined &&
        before.tiles.every((value, index) => value === world.vision?.tiles[index]) &&
        before.explored.every((value, index) => value === world.vision?.explored[index]),
    };
  }, probeSetup.enemyId);
  check(
    'the sensor probe spends RP, classifies a coarse contact, and leaves optical fog unchanged',
    sensorOutcome.reveals > revealsBefore &&
      sensorOutcome.rp === mission.rp - mission.sensorCost &&
      sensorOutcome.detected &&
      !sensorOutcome.visible &&
      sensorOutcome.track?.id === probeSetup.enemyId &&
      sensorOutcome.fogUnchanged,
    JSON.stringify(sensorOutcome),
  );
  const sensorCard = page.locator(`[data-testid="sensor-contact-${probeSetup.enemyId}"]`);
  await sensorCard.waitFor({ state: 'visible' });
  await page.waitForFunction((friendlyId) => {
    const current = globalThis.__ironline.useGame.getState();
    return current.selection.includes(friendlyId) &&
      current.units.some((unit) => unit.id === friendlyId && unit.alive);
  }, probeSetup.friendlyId);
  const sensorCardState = {
    label: await sensorCard.getAttribute('aria-label'),
    text: await sensorCard.innerText(),
    disabled: await sensorCard.isDisabled(),
  };
  check(
    'the coarse sensor card offers an accessible Investigate order rather than targeting',
    sensorCardState.label?.startsWith('Investigate sensor contact:') &&
      sensorCardState.text.toLowerCase().includes('investigate track') &&
      !sensorCardState.disabled,
    JSON.stringify(sensorCardState),
  );
  await sensorCard.click();
  const investigation = await page.evaluate(() => {
    const { useGame, world } = globalThis.__ironline;
    const selected = world.entities.find((entity) => useGame.getState().selection.includes(entity.id));
    return {
      engage: selected?.orders.move?.engage === true,
      attack: selected?.orders.attack ?? null,
    };
  });
  check(
    'Investigate attack-moves to the coarse area without retaining a hidden target',
    investigation.engage && investigation.attack === null,
    JSON.stringify(investigation),
  );
}
