const FORCE_STEP_LIMIT = 2_000;

function labelled(prefix, text) {
  return prefix === '' ? text : `${prefix} ${text}`;
}

async function activate(locator, touch) {
  if (touch) await locator.tap();
  else await locator.click();
}

async function selectShortRangeTrainer(page, touch) {
  const id = await page.evaluate(() => {
    const { useGame } = globalThis.__wreckright;
    const state = useGame.getState();
    const candidates = state.units.filter(
      (unit) => unit.team === state.playerTeam && unit.alive,
    );
    candidates.sort((left, right) => {
      const reach = (unit) => Math.max(0, ...unit.weapons.map((weapon) => weapon.longRange));
      return reach(left) - reach(right) || left.id - right.id;
    });
    if (candidates[0] === undefined) throw new Error('training lance is missing');
    return candidates[0].id;
  });
  await activate(page.locator(`[data-testid="lance-card-${id}"]`), touch);
  await page.waitForFunction(
    (selectedId) => globalThis.__wreckright.useGame.getState().selection[0] === selectedId,
    id,
  );
}

async function gateScreenPoint(page) {
  return page.evaluate(() => {
    const { engine, world } = globalThis.__wreckright;
    const zone = world.zones.find((candidate) => candidate.id === 'range_gate');
    const canvas = document.querySelector('.viewport canvas:not(.perf-overlay)');
    if (zone === undefined || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('training gate or battlefield canvas is missing');
    }
    engine.renderer.camera.skipDropIn();
    engine.renderer.camera.centreOn(zone);
    engine.renderer.camera.update(engine.renderer.viewport);
    const height = engine.renderer.terrain.heightAt(zone.x, zone.y);
    const screen = engine.renderer.camera.worldToScreen(zone, engine.renderer.viewport, height);
    const bounds = canvas.getBoundingClientRect();
    return { x: bounds.left + screen.x, y: bounds.top + screen.y };
  });
}

async function issueGateMove(page, touch) {
  const move = page.locator('[data-testid="command-move"]');
  await activate(move, touch);
  const gate = await gateScreenPoint(page);
  if (touch) await page.touchscreen.tap(gate.x, gate.y);
  else await page.mouse.click(gate.x, gate.y);
  await page.waitForFunction(() => {
    const { useGame, world } = globalThis.__wreckright;
    const selected = new Set(useGame.getState().selection);
    return world.entities.some(
      (entity) => entity.team === world.playerTeam && selected.has(entity.id) && entity.orders.move !== null,
    );
  });
}

async function stepUntilSensorOpticalOrGate(page) {
  return page.evaluate((limit) => {
    const { engine, world } = globalThis.__wreckright;
    const playerTeam = world.playerTeam ?? 0;
    const gate = world.zones.find((zone) => zone.id === 'range_gate');
    if (gate === undefined || world.vision === null) throw new Error('training vision or gate is missing');

    const state = () => {
      const sensor = world.entities.find(
        (entity) =>
          entity.team !== playerTeam &&
          !entity.destroyed &&
          !entity.withdrawn &&
          world.vision.detected.has(entity.id) &&
          !world.vision.visible.has(entity.id),
      );
      return {
        sensorId: sensor?.id ?? null,
        gateOwned: gate.owner === playerTeam,
        opticalIds: world.entities
          .filter((entity) => entity.team !== playerTeam && world.vision.visible.has(entity.id))
          .map((entity) => entity.id),
      };
    };

    for (let step = 0; step < limit; step += 1) {
      const current = state();
      if (
        current.sensorId !== null ||
        current.opticalIds.length > 0 ||
        current.gateOwned
      ) return current;
      engine.forceStep();
    }
    throw new Error(`training gate was not reached within ${limit} forced steps`);
  }, FORCE_STEP_LIMIT);
}

async function stepUntilOpticalOrReveal(page) {
  return page.evaluate((limit) => {
    const { engine, world } = globalThis.__wreckright;
    const playerTeam = world.playerTeam ?? 0;
    const gate = world.zones.find((zone) => zone.id === 'range_gate');
    const trigger = world.triggers.find((candidate) => candidate.id === 'range_open');
    if (gate === undefined || trigger === undefined || world.vision === null) {
      throw new Error('training reveal state is missing');
    }

    for (let step = 0; step < limit; step += 1) {
      const target = world.entities.find(
        (entity) => entity.team !== playerTeam && world.vision.visible.has(entity.id),
      );
      const revealed = world.reveals.some(
        (reveal) => reveal.team === playerTeam && reveal.kind === 'optical',
      );
      if (target !== undefined) {
        return {
          targetId: target.id,
          playerTeam,
          gateOwner: gate.owner,
          triggerFired: trigger.fired,
          revealed,
        };
      }
      if (trigger.fired > 0) {
        // The reveal is authored at the end of a simulation tick. One bounded
        // refresh promotes it to optical visibility without marching onward
        // into autonomous combat before the player can use the contact card.
        engine.forceStep();
        const promoted = world.entities.find(
          (entity) => entity.team !== playerTeam && world.vision.visible.has(entity.id),
        );
        if (promoted === undefined) {
          throw new Error('range_open fired without publishing an optical contact');
        }
        return {
          targetId: promoted.id,
          playerTeam,
          gateOwner: gate.owner,
          triggerFired: trigger.fired,
          revealed: world.reveals.some(
            (reveal) => reveal.team === playerTeam && reveal.kind === 'optical',
          ),
        };
      }
      engine.forceStep();
    }
    throw new Error(`scripted optical contact did not appear within ${limit} forced steps`);
  }, FORCE_STEP_LIMIT);
}

async function investigateSensorIfPresent({ page, check, prefix, touch, sensorId }) {
  if (sensorId === null) {
    const opticalCount = await page.locator('button[data-testid^="hostile-"]').count();
    check(
      labelled(prefix, 'has no targetable optical hostile before the range-gate reveal'),
      opticalCount === 0,
      `optical cards ${opticalCount}`,
    );
    return false;
  }

  if (touch) await page.locator('[data-testid="mobile-tab-contacts"]').tap();
  const sensor = page.locator(`[data-testid="sensor-contact-${sensorId}"]`);
  await sensor.waitFor({ state: 'visible' });
  const ariaLabel = (await sensor.getAttribute('aria-label'))?.toLowerCase() ?? '';
  const sensorText = (await sensor.innerText()).toLowerCase();
  const accessible =
    ariaLabel.includes('not a firing solution') && sensorText.includes('investigate track');
  await activate(sensor, touch);
  await page.waitForFunction(() => {
    const { useGame, world } = globalThis.__wreckright;
    const selected = new Set(useGame.getState().selection);
    return world.entities.some(
      (entity) =>
        entity.team === world.playerTeam &&
        selected.has(entity.id) &&
        entity.orders.move?.engage === true &&
        entity.orders.attack === null &&
        entity.targetId === null,
    );
  });
  check(
    labelled(prefix, 'treats a hollow sensor contact as investigate-only, never as a target'),
    accessible,
  );
  if (touch) await page.locator('[data-testid="mobile-tab-orders"]').tap();
  return true;
}

/** Completes lessons 2 and 3 through the same controls a player uses. */
export async function engageTrainingOpticalContact({ page, check, prefix = '', touch = false }) {
  // The short-range trainer reaches the gate before its own weapons can turn
  // the scripted reveal into an automatic shot. Selection and every order
  // remain real UI interactions.
  await selectShortRangeTrainer(page, touch);
  await issueGateMove(page, touch);
  check(labelled(prefix, 'Move control plots the initial route to the range gate'), true);
  await page.waitForSelector('[data-testid="command-attack"]');
  const contactsAvailable = touch
    ? (await page.locator('[data-testid="mobile-tab-contacts"]').count()) === 1
    : (await page.locator('[data-testid="hostile-bar"]').count()) === 1;
  check(
    labelled(prefix, 'engage lesson adds contacts and Attack without advanced heat controls'),
    contactsAvailable && (await page.locator('[data-testid="command-hold_fire"]').count()) === 0,
  );

  const beforeReveal = await stepUntilSensorOpticalOrGate(page);
  const investigated = beforeReveal.opticalIds.length === 0
    ? await investigateSensorIfPresent({
      page,
      check,
      prefix,
      touch,
      sensorId: beforeReveal.sensorId,
    })
    : false;
  if (investigated) await issueGateMove(page, touch);

  const optical = beforeReveal.opticalIds[0] === undefined
    ? await stepUntilOpticalOrReveal(page)
    : {
      targetId: beforeReveal.opticalIds[0],
      playerTeam: await page.evaluate(() => globalThis.__wreckright.world.playerTeam ?? 0),
      gateOwner: null,
      triggerFired: 0,
      revealed: false,
    };
  await page.waitForFunction(
    (targetId) => globalThis.__wreckright.useGame.getState().enemies.some((enemy) => enemy.id === targetId),
    optical.targetId,
  );
  if (touch) await page.locator('[data-testid="mobile-tab-contacts"]').tap();
  const hostile = page.locator(`[data-testid="hostile-${optical.targetId}"]`);
  await hostile.waitFor({ state: 'visible' });
  const opticalLabel = await hostile.getAttribute('aria-label');
  const lessonBeforeOrder = await page.locator('[data-testid="training-coach"]').innerText();
  check(
    labelled(prefix, 'force stepping reaches a real optical hostile card'),
    opticalLabel?.startsWith('Optical contact:') === true &&
      (optical.triggerFired === 0 ||
        (optical.gateOwner === optical.playerTeam && optical.revealed)),
    JSON.stringify(optical),
  );
  check(
    labelled(prefix, 'automatic fire control does not complete the explicit Engage lesson'),
    lessonBeforeOrder.includes('3 · Engage'),
    lessonBeforeOrder,
  );
  await activate(hostile, touch);
  await page.waitForFunction((targetId) => {
    const { useGame, world } = globalThis.__wreckright;
    const selected = new Set(useGame.getState().selection);
    return world.entities.some(
      (entity) =>
        entity.team === world.playerTeam &&
        selected.has(entity.id) &&
        entity.orders.attack?.targetId === targetId,
    );
  }, optical.targetId);
  check(labelled(prefix, 'optical hostile card assigns the target through the UI'), true);

  if (touch) {
    await page.waitForSelector('[data-testid="mobile-tab-unit"]');
    await page.locator('[data-testid="mobile-tab-unit"]').tap();
  }
  await page.waitForSelector('[data-testid="training-heat-readout"]');
  return optical.targetId;
}
