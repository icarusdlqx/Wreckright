import { checkSensorFieldTracking } from './sensor-field-tracking.mjs';
const state = page => page.evaluate(() => {
  const { world, useGame } = globalThis.__wreckright;
  return { tick: world.tick, rng: world.rng.save(), contacts: useGame.getState().contacts,
    enemies: useGame.getState().enemies, fog: `${world.vision.tiles}|${world.vision.explored}`,
    positions: world.entities.map(entity => ({ id: entity.id, pos: entity.pos })) };
});

/** Diagnostic placement, not a played mission: real sensor equipment and command handlers remain in use. */
async function arrange(page, url) {
  return page.evaluate(async url => {
    const { engine, world, useGame } = globalThis.__wreckright;
    const sensors = await import(new URL('src/sim/sensors.ts', url).href);
    const { createMech } = await import(new URL('src/sim/entity.ts', url).href);
    engine.setPaused(true);
    const scout = world.entities.find(entity => entity.team === world.playerTeam && !entity.destroyed);
    const enemy = world.entities.find(entity => entity.team !== world.playerTeam && !entity.destroyed);
    if (!scout || !enemy || !world.vision) throw new Error('Sensor review needs operational opposing units');
    world.projectiles = [];
    world.reveals = [];
    world.support.pending = [];
    for (const entity of world.entities) {
      entity.destroyed = entity !== scout && entity !== enemy;
      entity.controller = 'orders'; entity.targetId = null; entity.calledShot = null;
      entity.orders.attack = null; entity.orders.move = null; entity.orders.queue = [];
      entity.path = []; entity.motion = 'stationary'; entity.intendedMotion = 'stationary';
      entity.groupEnabled.fill(false); entity.groupIntent.fill(false); entity.sightRange = 0;
    }
    scout.ability = { id: 'sensor_sweep', readyAtTick: world.tick, activeUntilTick: -1 };
    scout.shutdownRemaining = 0; scout.downRemaining = 0;
    scout.pos = world.terrain.tileCentre(1, world.terrain.height - 2);
    const reach = sensors.effectiveSensorRange(world, scout);
    let position = null;
    for (let row = 0; row < world.terrain.height && position === null; row++) {
      for (let column = 0; column < world.terrain.width; column++) {
        if (!world.terrain.passable(column, row)) continue;
        const point = world.terrain.tileCentre(column, row);
        const distance = Math.hypot(point.x - scout.pos.x, point.y - scout.pos.y);
        const detection = reach * enemy.signature * world.terrain.typeAt(column, row).signatureFactor;
        if (distance > detection * 1.1 && distance < detection * 1.8) { position = point; break; }
      }
    }
    if (position === null) throw new Error('No authored terrain point between normal and boosted sensor reach');
    enemy.pos = position;
    sensors.updateTeamVisions(world);
    world.vision.tracks.clear(); world.vision.ghosts.clear();
    world.resources.set(world.playerTeam, world.rules.support.sensor_probe.cost * 3);
    useGame.getState().setSelection([scout.id]);
    engine.renderer.snapshot(world); engine.presentation.publish(null);
    engine.renderer.camera.centreOn(enemy.pos); engine.renderer.camera.update(engine.renderer.viewport);
    const design = world.catalog.designs.get('votive_picket');
    const parameters = { id: 900, team: world.playerTeam, designId: design.id, pilotId: 'petra_lindqvist',
      spawn: scout.pos, facingDegrees: 0 };
    const fitted = createMech(world.catalog, world.rules, { ...parameters, design });
    const plain = createMech(world.catalog, world.rules, { ...parameters,
      design: { ...design, equipment: design.equipment.filter(fit => fit.equipmentId !== 'active_probe') } });
    return { scoutId: scout.id, enemyId: enemy.id, enemyName: enemy.name, pilotName: enemy.pilot.name,
      scannerRatio: sensors.effectiveSensorRange(world, fitted) / sensors.effectiveSensorRange(world, plain),
      expectedRatio: world.catalog.equipment.get('active_probe').stats.sensor_range_factor,
      passiveInactive: fitted.ability.activeUntilTick < world.tick, reach, sensorRange: scout.sensorRange };
  }, url);
}

/** Called by the existing headless harness; this module never launches a browser. */
export async function runSensorActivationChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true, reducedMotion: 'reduce' });
  context.setDefaultTimeout(25_000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => {
    localStorage.setItem('ironline.muted', '1');
    localStorage.setItem('ironline.training', JSON.stringify({ version: 1, step: 0, status: 'skipped' }));
  });
  const shot = name => shots ? page.screenshot({ path: `${shots}/sensor-activation-${name}.png` }) : Promise.resolve();
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.locator('[data-testid="home-skirmish"]').click();
    await page.locator('[data-testid="briefing"]').waitFor();
    await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().ready);
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().briefingSeen);
    const fixture = await arrange(page, url);
    const before = await state(page);
    check('diagnostic sensor target begins beyond normal electronic reach',
      !before.contacts.some(contact => contact.id === fixture.enemyId)
      && !before.enemies.some(enemy => enemy.id === fixture.enemyId));
    await page.locator('[data-testid="command-ability"]').click();
    await page.locator('[data-testid="mech-sensor-sweep-readout"]').waitFor();
    await page.locator(`[data-testid="sensor-contact-${fixture.enemyId}"]`).waitFor();
    const after = await state(page);
    check('real Sensor Sweep command publishes coarse contacts while time, positions and random rolls stay fixed',
      after.tick === before.tick && JSON.stringify(after.rng) === JSON.stringify(before.rng)
      && JSON.stringify(after.positions) === JSON.stringify(before.positions)
      && after.contacts.some(contact => contact.id === fixture.enemyId && contact.current));
    const contactText = await page.locator(`[data-testid="sensor-contact-${fixture.enemyId}"]`).textContent();
    check('paused mech scan grants no optical identity, pilot name or fog reveal',
      after.fog === before.fog && !after.enemies.some(enemy => enemy.id === fixture.enemyId)
      && !contactText.includes(fixture.enemyName) && !contactText.includes(fixture.pilotName));
    const sweepText = await page.locator('[data-testid="mech-sensor-sweep-readout"]').textContent();
    const abilityButton = page.locator('[data-testid="command-ability"]');
    const abilityBefore = await page.evaluate(id => {
      const { world, useGame } = globalThis.__wreckright;
      return { clocks: world.entities.find(entity => entity.id === id).ability,
        readout: useGame.getState().units.find(unit => unit.id === id).ability };
    }, fixture.scoutId);
    const abilityText = await abilityButton.textContent();
    // The button stays actionable to explain a refusal; cooldown is enforced by the command handler.
    await abilityButton.click();
    const abilityAfter = await page.evaluate(id => globalThis.__wreckright.world.entities.find(entity => entity.id === id).ability, fixture.scoutId);
    check('pilot sweep shows its active range and rejects reuse without restarting its cooldown',
      /instrument range/.test(sweepText) && /ACTIVE/.test(abilityText)
      && !abilityBefore.readout.ready && abilityBefore.readout.activeRemaining > 0 && abilityBefore.readout.cooldownRemaining > 0
      && JSON.stringify(abilityBefore.clocks) === JSON.stringify(abilityAfter),
      JSON.stringify({ sweepText, abilityText, abilityBefore, abilityAfter }));
    await page.locator('[data-testid="unit-details-toggle"]').click();
    await page.locator('[data-testid="tactical-details"] summary').click();
    const profile = await page.locator('.machine-profile').textContent();
    check('Deep Scanner is a measurable passive equipment bonus with an explicit automatic-sensor explanation',
      Math.abs(fixture.scannerRatio - fixture.expectedRatio) < 1e-8 && fixture.passiveInactive
      && /Sensors work automatically/.test(profile) && /without a separate activation/.test(profile));
    await shot('mech-desktop');
    const details = page.locator('[data-testid="tactical-details"][open] > summary');
    if (await details.isVisible()) await details.click();
    await page.locator('[data-testid="unit-details-toggle"]').click();

    const probe = await page.evaluate(async url => {
      const { engine, world } = globalThis.__wreckright;
      for (const entity of world.entities) if (entity.team === world.playerTeam) entity.sensorRange = 0;
      const sensors = await import(new URL('src/sim/sensors.ts', url).href);
      sensors.updateTeamVisions(world); world.vision.tracks.clear(); world.vision.ghosts.clear();
      engine.presentation.publish(null);
      const enemy = world.entities.find(entity => entity.team !== world.playerTeam && !entity.destroyed);
      return { screen: engine.renderer.camera.worldToScreen(enemy.pos, engine.renderer.viewport, 0),
        cost: world.rules.support.sensor_probe.cost, rp: world.resources.get(world.playerTeam) };
    }, url);
    const probeBefore = await state(page);
    const probeButton = page.locator('[data-testid="support-sensor_probe"]');
    if (!(await probeButton.isVisible())) await page.locator('[data-testid="support-toggle"]').click();
    await probeButton.click();
    const canvas = await page.locator('.viewport canvas:not(.perf-overlay)').boundingBox();
    await page.mouse.click(canvas.x + probe.screen.x, canvas.y + probe.screen.y);
    await page.locator(`[data-testid="sensor-contact-${fixture.enemyId}"]`).waitFor();
    const probeAfter = await state(page);
    const paid = await page.evaluate(() => {
      const { world } = globalThis.__wreckright;
      return world.resources.get(world.playerTeam);
    });
    check('real support-probe placement detects immediately while paused and charges exactly once',
      probeAfter.tick === probeBefore.tick && paid === probe.rp - probe.cost
      && probeAfter.contacts.some(contact => contact.id === fixture.enemyId && contact.current)
      && probeAfter.fog === probeBefore.fog && JSON.stringify(probeAfter.rng) === JSON.stringify(probeBefore.rng));
    await shot('probe-desktop');
    // Restore the real equipment range after isolating the probe, before reviewing normal HUD layout.
    await page.evaluate(fixture => {
      const { engine, world } = globalThis.__wreckright;
      world.entities.find(entity => entity.id === fixture.scoutId).sensorRange = fixture.sensorRange;
      engine.presentation.publish(null);
    }, fixture);
    for (const [layout, width, height] of [['mobile', 390, 844], ['mobile-landscape', 844, 390]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(id => globalThis.__wreckright.useGame.getState().setSelection([id]), fixture.scoutId);
      await page.locator('[data-testid="mobile-tab-orders"]').click();
      const move = page.locator('[data-testid="command-move"]');
      const geometry = await page.locator('[data-testid="sensor-sweep-readout"]').evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const overlaps = [...document.querySelectorAll('[data-testid="paused-banner"], [data-testid="minimap"], .mobile-topbar, [data-testid="mobile-dock"]')]
          .filter(other => { const box = other.getBoundingClientRect(); return box.width > 0 && box.height > 0
            && bounds.left < box.right && bounds.right > box.left && bounds.top < box.bottom && bounds.bottom > box.top; })
          .map(other => other.getAttribute('data-testid') ?? other.className);
        return { fits: bounds.left >= 0 && bounds.right <= innerWidth && element.scrollWidth <= element.clientWidth,
          overflow: document.documentElement.scrollWidth > innerWidth, overlaps };
      });
      check(`${layout}: sensor readout clears pause, minimap, top chrome and commands`,
        geometry.fits && !geometry.overflow && geometry.overlaps.length === 0 && await move.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.height >= 44 && element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        }), JSON.stringify(geometry));
      await page.evaluate(() => globalThis.__wreckright.useGame.getState().setOrderMode(null));
      await move.click();
      check(`${layout}: orders remain usable while sensor coverage is displayed`,
        await page.evaluate(() => globalThis.__wreckright.useGame.getState().orderMode === 'move'));
      await shot(layout);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => { for (const entity of globalThis.__wreckright.world.entities) if (entity.team === globalThis.__wreckright.world.playerTeam) entity.sensorRange = 0; });
    await checkSensorFieldTracking({ page, url, id: fixture.enemyId, check, shot });
    check('sensor activation review has no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) { await shot('error').catch(() => {}); throw error; }
  finally { await context.close(); }
}
