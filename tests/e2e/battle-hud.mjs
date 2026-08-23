export async function openTactics(page) {
  const drawer = page.locator('[data-testid="tactics-drawer"]');
  if (!(await drawer.isVisible())) await page.locator('[data-testid="tactics-toggle"]').click();
  await drawer.waitFor({ state: 'visible' });
}

async function openSupport(page) {
  const drawer = page.locator('[data-testid="support-palette"] .support-drawer');
  if (!(await drawer.isVisible())) await page.locator('[data-testid="support-toggle"]').click();
  await drawer.waitFor({ state: 'visible' });
}

export async function runDesktopSupportChecks({ page, check, state, mission, shots }) {
  check(
    'support drawer is closed by default',
    (await page.locator('[data-testid="support-toggle"]').getAttribute('aria-expanded')) === 'false' &&
      !(await page.locator('[data-testid="support-palette"] .support-drawer').isVisible()) &&
      !(await page.locator('[data-testid="support-air_strike"]').isVisible()),
  );
  await openSupport(page);
  const supportDrawerGeometry = await page.evaluate(() => {
    const drawer = document.querySelector('[data-testid="support-palette"] .support-drawer');
    const toggle = document.querySelector('[data-testid="support-toggle"]');
    if (!(drawer instanceof HTMLElement) || !(toggle instanceof HTMLElement)) {
      throw new Error('desktop support drawer is incomplete');
    }
    const drawerRect = drawer.getBoundingClientRect();
    const toggleRect = toggle.getBoundingClientRect();
    const hit = document.elementFromPoint(drawerRect.right - 8, drawerRect.top + 8);
    return {
      rightAligned: Math.abs(drawerRect.right - toggleRect.right) <= 2,
      aboveToggle: drawerRect.bottom <= toggleRect.top + 1,
      inViewport:
        drawerRect.left >= 0 &&
        drawerRect.top >= 0 &&
        drawerRect.right <= innerWidth &&
        drawerRect.bottom <= innerHeight,
      hit: hit !== null && drawer.contains(hit),
    };
  });
  check(
    'desktop support drawer opens above its right-hand control without losing pointer hits',
    Object.values(supportDrawerGeometry).every(Boolean),
    JSON.stringify(supportDrawerGeometry),
  );

  // A mission reserve replaces the probe rather than growing a fourth button.
  check('exactly three support calls are offered', (await page.locator('.support-call').count()) === 3);
  check(
    'the authored reserve reaches the support palette',
    (await page.locator('[data-testid="support-reinforcement"]').count()) === 1 &&
      (await page.locator('[data-testid="support-air_strike"]').count()) === 1 &&
      (await page.locator('[data-testid="support-repair_truck"]').count()) === 1 &&
      (await page.locator('[data-testid="support-sensor_probe"]').count()) === 0,
  );
  await page.locator('[data-testid="support-reinforcement"]').hover();
  const reserveCopy = `${await page.locator('[data-testid="support-reinforcement"]').innerText()} ${await page.locator('.support-detail').innerText()}`;
  check(
    'support cost and effect are visible without a tooltip',
    reserveCopy.includes(`${mission.reserveCost} RP`) && reserveCopy.includes('Drop one mission reserve'),
    reserveCopy,
  );

  const rpText = async () =>
    Number((await page.locator('[data-testid="resource-points"]').innerText()).replace(/[^0-9]/g, ''));
  const rpBefore = await rpText();
  const canvasBox = await page.locator('.viewport canvas:not(.perf-overlay)').boundingBox();
  if (canvasBox === null) throw new Error('battle canvas missing');

  // Report rather than hang: a disabled button times the click out after
  // thirty seconds and kills the run, which says nothing about why.
  // The truck costs 500, so the mission pool has to cover it — the check
  // follows the authored value rather than pinning a number that will drift.
  check(
    'the mission resource points reached the HUD',
    rpBefore === mission.rp && mission.rp >= 500,
    `${rpBefore} RP in the palette, ${mission.rp} in the world`,
  );

  if (!(await state(page)).paused) await page.locator('[data-testid="pause-button"]').click();

  // A failed click is recoverable: leave the call armed, explain why, and let
  // the player pick another point after the underlying condition changes.
  await page.locator('[data-testid="support-repair_truck"]').click();
  await page.evaluate(() => {
    const { useGame, world } = globalThis.__ironline;
    world.resources.set(useGame.getState().playerTeam, 0);
    useGame.getState().patch({ resourcePoints: 0 });
  });
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.55, canvasBox.y + canvasBox.height * 0.4);
  const rejectedSupport = await page.evaluate(() => {
    const { useGame, world } = globalThis.__ironline;
    const current = useGame.getState();
    return {
      mode: current.supportMode,
      pending: world.support.pending.length,
      reason: current.log[0] ?? '',
    };
  });
  check(
    'a rejected mouse placement stays armed and records the refusal',
    rejectedSupport.mode === 'repair_truck' &&
      rejectedSupport.pending === 0 &&
      /needs .* RP/i.test(rejectedSupport.reason),
    JSON.stringify(rejectedSupport),
  );
  await page.evaluate((resourcePoints) => {
    const { useGame, world } = globalThis.__ironline;
    world.resources.set(useGame.getState().playerTeam, resourcePoints);
    useGame.getState().setSupportMode(null);
    useGame.getState().patch({ resourcePoints });
  }, mission.rp);

  await openSupport(page);
  await page.locator('[data-testid="support-air_strike"]').click();
  check('picking a support call arms it', (await state(page)).supportMode === 'air_strike');
  const laneStart = {
    x: canvasBox.x + canvasBox.width * 0.58,
    y: canvasBox.y + canvasBox.height * 0.38,
  };
  await page.mouse.move(laneStart.x, laneStart.y);
  await page.mouse.down();
  await page.mouse.move(laneStart.x + 90, laneStart.y + 32, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const pendingAir = await page.evaluate(() => {
    const { engine, world } = globalThis.__ironline;
    let lanes = 0;
    engine.renderer.scene.traverse((object) => {
      if (object.name.startsWith('support-air-pending-') && object.visible) lanes += 1;
    });
    return {
      pending: world.support.pending.filter((entry) => entry.call === 'air_strike').length,
      rp: world.resources.get(world.playerTeam ?? 0),
      lanes,
    };
  });
  check(
    'the accepted air strike shows its pending lane and spends resource points',
    pendingAir.pending === 1 && pendingAir.lanes === 1 && pendingAir.rp === mission.rp - mission.airCost,
    JSON.stringify(pendingAir),
  );
  await page.screenshot({ path: `${shots}/09-support-lane.png` });

  const resolvedAir = await page.evaluate((delaySeconds) => {
    const { engine, world } = globalThis.__ironline;
    const steps = Math.ceil(delaySeconds / world.dt) + 1;
    for (let step = 0; step < steps; step += 1) engine.forceStep();
    return world.support.pending.filter((entry) => entry.call === 'air_strike').length;
  }, mission.airDelay);
  await page.waitForTimeout(80);
  const airVisuals = await page.evaluate(() => {
    const scene = globalThis.__ironline.engine.renderer.scene;
    const visibleThroughParents = (object) => {
      let current = object;
      while (current !== null) {
        if (!current.visible) return false;
        current = current.parent;
      }
      return true;
    };
    let aircraft = 0;
    let scars = 0;
    scene.traverse((object) => {
      if (!visibleThroughParents(object)) return;
      if (object.name.startsWith('support-aircraft-')) aircraft += 1;
      if (object.name.startsWith('support-air-scar-')) scars += 1;
    });
    return { aircraft, scars };
  });
  check('the air strike resolves after its delay', resolvedAir === 0);
  check(
    'the resolved air strike renders an aircraft and all impact scars',
    airVisuals.aircraft >= 1 && airVisuals.scars === mission.airShots,
    JSON.stringify(airVisuals),
  );

  const repairTarget = await page.evaluate((resourcePoints) => {
    const { engine, useGame, world } = globalThis.__ironline;
    world.resources.set(useGame.getState().playerTeam, resourcePoints);
    useGame.getState().patch({ resourcePoints });
    const entity = world.entities
      .filter((candidate) => candidate.team === useGame.getState().playerTeam && !candidate.destroyed)
      .sort((left, right) => right.tonnage - left.tonnage)[0];
    if (entity === undefined) throw new Error('friendly repair target missing');
    const plate = Object.entries(entity.locations).find(
      ([, location]) => !location.destroyed && location.rearArmour > 10,
    );
    if (plate === undefined) throw new Error('friendly repair plate missing');
    const [location, plateState] = plate;
    plateState.rearArmour = Math.max(0, plateState.rearArmour - 24);
    engine.renderer.camera.centreOn(entity.pos);
    engine.renderer.camera.update(engine.renderer.viewport);
    return { id: entity.id, location, armour: plateState.rearArmour };
  }, mission.rp);
  await page.waitForTimeout(50);
  const repairPoint = await page.evaluate((id) => {
    const body = globalThis.__ironline.engine.renderer.screenBodyOf(
      globalThis.__ironline.world.entities.find((entity) => entity.id === id),
    );
    return { x: body.x, y: body.y };
  }, repairTarget.id);
  await openSupport(page);
  await page.locator('[data-testid="support-repair_truck"]').click({ timeout: 5_000 });
  check('the repair truck arms from the support drawer', (await state(page)).supportMode === 'repair_truck');
  await openSupport(page);
  check(
    'the armed call explains placement in the palette',
    (await page.locator('.support-detail').innerText()).includes('Armed'),
  );
  await page.locator('[data-testid="support-toggle"]').click();
  await page.mouse.move(canvasBox.x + repairPoint.x, canvasBox.y + repairPoint.y);
  await page.screenshot({ path: `${shots}/09-support-radius.png` });
  await page.mouse.click(canvasBox.x + repairPoint.x, canvasBox.y + repairPoint.y);

  const afterCall = await page.evaluate(() => {
    const { world } = globalThis.__ironline;
    return { rp: world.resources.get(0), pending: world.support.pending.length };
  });
  check(
    'calling the truck spends resource points',
    afterCall.rp === mission.rp - mission.truckCost,
    `${mission.rp} → ${afterCall.rp}`,
  );
  check('the call is queued with a delay', afterCall.pending === 1);
  await page.waitForFunction(
    (before) => Number(document.querySelector('[data-testid="resource-points"]')?.textContent?.replace(/[^0-9]/g, '')) < before,
    rpBefore,
  );
  check('the HUD reflects the spend', (await rpText()) < rpBefore);
  await page.screenshot({ path: `${shots}/09-support.png` });

  const resolvedTruck = await page.evaluate(({ delaySeconds, id, location }) => {
    const { engine, world } = globalThis.__ironline;
    const steps = Math.ceil(delaySeconds / world.dt) + Math.ceil(1 / world.dt);
    for (let step = 0; step < steps; step += 1) engine.forceStep();
    const entity = world.entities.find((candidate) => candidate.id === id);
    if (entity === undefined) throw new Error('friendly repair target vanished');
    return {
      armour: entity.locations[location].rearArmour,
      pending: world.support.pending.filter((entry) => entry.call === 'repair_truck').length,
      trucks: world.support.trucks.length,
    };
  }, { delaySeconds: mission.truckDelay, id: repairTarget.id, location: repairTarget.location });
  await page.waitForTimeout(80);
  const truckVisuals = await page.evaluate(() => {
    const scene = globalThis.__ironline.engine.renderer.scene;
    let trucks = 0;
    let radii = 0;
    let links = 0;
    scene.traverse((object) => {
      if (!object.visible || object.parent?.visible === false) return;
      if (object.name.startsWith('support-repair-truck-')) trucks += 1;
      if (object.name.startsWith('support-repair-radius-')) radii += 1;
      if (object.name.startsWith('support-repair-link-')) links += 1;
    });
    return { trucks, radii, links };
  });
  check('the call resolves after its delay', resolvedTruck.pending === 0 && resolvedTruck.trucks === 1);
  check(
    'the active repair truck renders its rig, radius and repair link',
    truckVisuals.trucks === 1 && truckVisuals.radii === 1 && truckVisuals.links >= 1,
    JSON.stringify(truckVisuals),
  );
  check(
    'the repair truck restores actual rear armour inside its radius',
    resolvedTruck.armour > repairTarget.armour,
    `${repairTarget.armour} → ${resolvedTruck.armour}`,
  );

  const supportOutcome = await page.evaluate(async ({ airAccepted, truckAccepted }) => {
    const { engine } = globalThis.__ironline;
    const world = engine.world;
    const mod = await import('/src/sim/support.ts');
    world.resources.set(0, 20000);
    const enemy = world.entities.find((entity) => entity.team === 1 && !entity.destroyed);
    const point = enemy ? { x: enemy.pos.x, y: enemy.pos.y } : { x: 500, y: 500 };
    const results = {
      air_strike: airAccepted,
      repair_truck: truckAccepted,
      reinforcement: mod.callSupport(world, 0, 'reinforcement', point, 0).ok,
    };
    // Resolution and damage are pinned by the sim's own mission tests;
    // here it is enough that every offered call is accepted and resolves.
    for (let step = 0; step < 400 && !world.finished; step += 1) engine.forceStep();
    return { results, pending: world.support.pending.length };
  }, {
    airAccepted: pendingAir.pending === 1,
    truckAccepted: afterCall.pending === 1,
  });
  check(
    'air strike, repair truck and reinforcement were all accepted',
    Object.values(supportOutcome.results).every(Boolean),
    JSON.stringify(supportOutcome.results),
  );
  check('every accepted call resolved', supportOutcome.pending === 0);

  await page.waitForFunction(() => globalThis.__ironline.useGame.getState().reservesLeft === 0);
  await page.evaluate((resourcePoints) => {
    const { useGame, world } = globalThis.__ironline;
    world.resources.set(useGame.getState().playerTeam, resourcePoints);
    useGame.getState().patch({ resourcePoints });
  }, mission.rp);
  await page.waitForSelector('[data-testid="support-sensor_probe"]', { state: 'attached' });
  await openSupport(page);
  check(
    'the spent reserve gives its slot back to the sensor probe',
    (await page.locator('[data-testid="support-sensor_probe"]').isVisible()) &&
      (await page.locator('[data-testid="support-reinforcement"]').count()) === 0,
  );
  const revealsBefore = await page.evaluate(() => globalThis.__ironline.world.reveals.length);
  await page.locator('[data-testid="support-sensor_probe"]').click();
  await page.mouse.click(canvasBox.x + canvasBox.width * 0.52, canvasBox.y + canvasBox.height * 0.38);
  const sensorOutcome = await page.evaluate(() => {
    const { engine, world } = globalThis.__ironline;
    engine.forceStep();
    return {
      reveals: world.reveals.length,
      rp: world.resources.get(world.playerTeam ?? 0),
    };
  });
  check(
    'the sensor probe spends RP and creates a live sweep through the UI',
    sensorOutcome.reveals > revealsBefore && sensorOutcome.rp === mission.rp - mission.sensorCost,
    JSON.stringify(sensorOutcome),
  );
}
