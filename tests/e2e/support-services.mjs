/** Real UI support calls on a stationary diagnostic field; animation frames are sampled explicitly. */
export async function runSupportServicesChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(25000);
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  const shot = name => shots ? page.screenshot({ path: `${shots}/support-${name}.png` }) : Promise.resolve();
  const open = async call => {
    const button = page.locator(`[data-testid="support-${call}"]`);
    if (!(await button.isVisible())) await page.locator('[data-testid="support-toggle"]').click();
    await button.click();
  };
  const groundClick = async point => {
    const at = await page.evaluate(point => {
      const renderer = globalThis.__wreckright.engine.renderer;
      const at = renderer.camera.worldToScreen(point, renderer.viewport, renderer.terrain.heightAt(point.x, point.y));
      const rect = renderer.canvas.getBoundingClientRect(); return { x: at.x + rect.x, y: at.y + rect.y };
    }, point);
    await page.mouse.click(at.x, at.y);
  };
  const advance = steps => page.evaluate(steps => { for (let i = 0; i < steps; i++) globalThis.__wreckright.engine.forceStep(); }, steps);
  const visible = name => page.evaluate(name => {
    const object = globalThis.__wreckright.engine.renderer.scene.getObjectByName(name);
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return object !== undefined;
  }, name);
  const waitVisible = name => page.waitForFunction(name => {
    const object = globalThis.__wreckright.engine.renderer.scene.getObjectByName(name);
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    return object !== undefined;
  }, name);
  try {
    await page.goto(url); await page.locator('[data-testid="home-skirmish"]').click();
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.waitForFunction(() => Boolean(globalThis.__wreckright));
    const fixture = await page.evaluate(() => {
      const { engine, world, useGame } = globalThis.__wreckright;
      engine.setPaused(true);
      for (const entity of world.entities) {
        entity.controller = 'orders'; entity.orders.move = null; entity.orders.attack = null;
        entity.orders.queue = []; entity.path = []; entity.targetId = null;
        entity.groupEnabled.fill(false); entity.groupIntent.fill(false);
      }
      const ally = world.entities.find(entity => entity.team === 0);
      ally.locations.centre_torso.armour = Math.max(0, ally.locations.centre_torso.armour - 100);
      const at = { ...ally.pos };
      const enemy = world.entities.find(entity => entity.team !== 0);
      enemy.pos = { x: at.x + 120, y: at.y + 45 };
      world.resources.set(0, 5000); useGame.getState().patch({ resourcePoints: 5000 });
      engine.renderer.camera.centreOn(at); engine.renderer.camera.distance = 410; engine.renderer.camera.update(engine.renderer.viewport);
      engine.forceStep();
      return { at, allyId: ally.id, enemyId: enemy.id, airAt: { ...enemy.pos },
        armour: ally.locations.centre_torso.armour, truckCost: world.rules.support.repair_truck.cost,
        airCost: world.rules.support.air_strike.cost, truckDelay: Math.round(world.rules.support.repair_truck.delaySeconds / world.dt),
        airDelay: Math.round(world.rules.support.air_strike.delaySeconds / world.dt),
        duration: Math.round(world.rules.support.repair_truck.durationSeconds / world.dt), dt: world.dt };
    });
    await open('repair_truck'); await groundClick(fixture.at);
    await page.locator('[data-testid="support-status"]').waitFor();
    check('repair UI accepts one real target and explains paused dispatch', await page.evaluate(cost => {
      const { world } = globalThis.__wreckright;
      return world.support.pending.filter(call => call.call === 'repair_truck').length === 1 && world.resources.get(0) === 5000 - cost;
    }, fixture.truckCost) && /Paused — resume to dispatch/.test(await page.locator('[data-testid="support-status"]').innerText()));
    await shot('repair-queued');
    await advance(fixture.truckDelay - Math.round(.65 / fixture.dt));
    await waitVisible('repair-airlift-0');
    check('truck arrives visibly before healing begins', await visible('repair-airlift-0')
      && await page.evaluate(() => globalThis.__wreckright.world.support.trucks.length === 0));
    await shot('repair-arrival');
    await advance(Math.round(.65 / fixture.dt) + 22);
    await page.waitForFunction(() => globalThis.__wreckright.engine.renderer.scene.getObjectByName('support-repair-link-0-0')?.visible);
    const active = await page.evaluate(id => {
      const { engine, world } = globalThis.__wreckright;
      const truck = world.support.trucks[0]; const vehicle = engine.renderer.scene.getObjectByName('repair-vehicle-0');
      return { armour: world.entities.find(entity => entity.id === id).locations.centre_torso.armour,
        restored: truck.repairedArmour, offset: Math.hypot(vehicle.position.x, vehicle.position.z), expires: truck.expiresTick };
    }, fixture.allyId);
    check('visible service vehicle parks beside the mech and restores real armour', active.armour > fixture.armour && active.restored > 0 && active.offset > 20, JSON.stringify(active));
    await page.locator('[data-testid="support-status"] summary').click();
    check('service report distinguishes armour repair from internal or weapon repairs', /Armour only; internals, destroyed parts, weapons and ammunition stay unchanged/.test(await page.locator('[data-testid="support-status"]').innerText()));
    await shot('repair-working');
    await page.locator('[data-testid="support-status"] summary').click();
    await page.setViewportSize({ width: 390, height: 844 });
    await shot('repair-mobile');
    check('phone service status does not cover command controls', await page.locator('[data-testid="command-move"]').evaluate(button => {
      const rect = button.getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44 && button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }) && await page.locator('[data-testid="support-status"]').evaluate(element => element.scrollWidth <= element.clientWidth));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(expires => { const { engine, world } = globalThis.__wreckright; while (world.tick < expires) engine.forceStep(); engine.renderer.supportEffects.draw(world, .3); }, active.expires);
    check('truck stops service and lifts away when its time expires', await visible('repair-airlift-0') && !(await visible('support-repair-link-0-0'))
      && await page.evaluate(() => globalThis.__wreckright.world.support.trucks.length === 0));
    await shot('repair-departure');
    await page.evaluate(() => globalThis.__wreckright.engine.renderer.supportEffects.draw(globalThis.__wreckright.world, 1.3));
    check('departed service vehicle is removed from presentation', !(await visible('support-repair-truck-0')));

    const enemyBefore = await page.evaluate(({ id, point }) => {
      const { engine, world } = globalThis.__wreckright;
      engine.renderer.camera.centreOn(point); engine.renderer.camera.update(engine.renderer.viewport);
      const enemy = world.entities.find(entity => entity.id === id);
      return Object.values(enemy.locations).reduce((sum, location) => sum + location.armour + location.rearArmour, 0);
    }, { id: fixture.enemyId, point: fixture.airAt });
    await open('air_strike'); await groundClick(fixture.airAt);
    await page.waitForFunction(() => globalThis.__wreckright.world.support.pending.some(call => call.call === 'air_strike'));
    check('airstrike request spends once and shows an inbound ETA', await page.evaluate(({ truckCost, airCost }) => globalThis.__wreckright.world.resources.get(0) === 5000 - truckCost - airCost, fixture)
      && /Air Strike.*to arrival/.test(await page.locator('[data-testid="support-status"]').innerText()));
    await advance(fixture.airDelay - Math.round(.75 / fixture.dt));
    await waitVisible('support-air-approach-0');
    check('aircraft approaches the marked lane before impact', await visible('support-air-approach-0'));
    await shot('air-approach');
    await advance(Math.round(.75 / fixture.dt) + 1);
    await page.evaluate(() => globalThis.__wreckright.engine.renderer.supportEffects.draw(globalThis.__wreckright.world, .3));
    const enemyAfter = await page.evaluate(id => Object.values(globalThis.__wreckright.world.entities.find(entity => entity.id === id).locations)
      .reduce((sum, location) => sum + location.armour + location.rearArmour, 0), fixture.enemyId);
    check('aircraft pass and impacts correspond to real strike damage', await visible('support-aircraft-0') && enemyAfter < enemyBefore, `${enemyBefore} → ${enemyAfter}`);
    await shot('air-impact');
    await page.evaluate(() => globalThis.__wreckright.engine.renderer.supportEffects.draw(globalThis.__wreckright.world, 4));
    check('aircraft departs while bounded impact scars remain', !(await visible('support-aircraft-0')) && await visible('support-air-scar-0-0'));
    check('support service journey has no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) { await shot('error').catch(() => {}); throw error; }
  finally { await context.close(); }
}
