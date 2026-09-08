import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

/** Deterministic presentation fixture: placement/visibility are staged; attack clicks use real controls. */
export async function runTargetFeedbackChecks({ browser, url, shots, check }) {
  for (const width of [1440, 792]) {
    const compact = width === 792;
    const context = await browser.newContext({ viewport: { width, height: compact ? 830 : 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url);
      await page.getByTestId('home-skirmish').click();
      await page.getByTestId('briefing-mission-picker').selectOption('skirmish_ridge');
      await page.waitForFunction(() => globalThis.__wreckright?.world.mission.id === 'skirmish_ridge'
        && globalThis.__wreckright.useGame.getState().ready);
      await page.getByTestId('briefing-deploy').click();
      await page.getByTestId('briefing').waitFor({ state: 'hidden' });
      if (!await page.evaluate(() => globalThis.__wreckright.useGame.getState().paused)) {
        await page.getByTestId('pause-button').click();
      }
      const fixture = await page.evaluate(() => {
        const { world, engine, useGame } = globalThis.__wreckright;
        const friendly = world.entities.find(unit => unit.team === world.playerTeam);
        const enemy = world.entities.find(unit => unit.team !== world.playerTeam);
        friendly.pos = { x: 410, y: 500 }; enemy.pos = { x: 490, y: 500 };
        world.vision.visible.clear(); world.vision.visible.add(enemy.id); world.vision.tiles.fill(1);
        world.tick += 1;
        engine.renderer.snapshot(world); engine.renderer.snapshot(world);
        engine.renderer.camera.skipDropIn(); engine.renderer.camera.centreOn({ x: 450, y: 500 });
        engine.renderer.camera.distance = 220;
        useGame.getState().patch({ selection: [friendly.id], orderMode: null, supportMode: null, tick: world.tick });
        return { friendly: friendly.id, enemy: enemy.id, enemyTeam: enemy.team, tick: world.tick,
          name: world.catalog.designs.get(enemy.designId).name };
      });
      const bracket = page.locator(`.field-target-bracket[data-entity-id="${fixture.enemy}"]`);
      const receipt = page.getByTestId('command-receipt');
      const canvas = page.locator('canvas').first();
      // Both interpolation samples already reflect the fixture; allow the renderer to place its body.
      await page.waitForFunction(id => !!document.querySelector(`.unit-health-bar[data-entity-id="${id}"]`), fixture.enemy);
      const targetPoint = await page.evaluate(id => {
        const { engine, world } = globalThis.__wreckright;
        const body = engine.renderer.screenBodyOf(world.entities.find(unit => unit.id === id));
        return { x: body.x, y: body.y };
      }, fixture.enemy);
      await canvas.click({ position: targetPoint });
      await page.waitForFunction(id => globalThis.__wreckright.world.entities.find(unit => unit.id === id)?.orders.attack !== null, fixture.friendly);
      await bracket.waitFor();
      check(`${width}: a paused field click confirms the target in the dock`,
        (await receipt.innerText()).includes(`Priority target: ${fixture.name}`)
        && await receipt.getAttribute('role') === 'status'
        && await page.evaluate(tick => globalThis.__wreckright.world.tick === tick && globalThis.__wreckright.useGame.getState().paused, fixture.tick));
      const marker = await bracket.evaluate(element => ({
        corners: element.children.length, width: element.getBoundingClientRect().width,
        pointer: getComputedStyle(element).pointerEvents, focus: element.dataset.focus,
      }));
      check(`${width}: field target has four thin non-intercepting corners`,
        marker.corners === 4 && marker.width >= 36 && marker.width <= 144 && marker.pointer === 'none' && marker.focus === 'priority');
      await page.screenshot({ path: `${shots}/target-field-${width}.png` });

      const toggle = page.getByTestId(compact ? 'mobile-commander-toggle' : 'commander-toggle');
      await toggle.click();
      await page.getByTestId('commander-view').waitFor();
      const commander = page.getByTestId(`commander-target-${fixture.enemy}`);
      await commander.waitFor({ state: 'attached' });
      check(`${width}: Commander preserves the explicit target with constant-width brackets`,
        await commander.evaluate(element => getComputedStyle(element).strokeWidth === '2px'
          && getComputedStyle(element).vectorEffect === 'non-scaling-stroke'
          && element.dataset.focus === 'priority'));
      // Clear only the selected order to verify the following visible Commander click sets it afresh.
      await page.evaluate(id => { globalThis.__wreckright.world.entities.find(unit => unit.id === id).orders.attack = null; }, fixture.friendly);
      await page.getByTestId(`commander-chit-${fixture.enemy}`).locator('.commander-chit-hit').click();
      check(`${width}: a paused Commander target click is acknowledged without losing friendly selection`,
        (await receipt.innerText()).includes(`Priority target: ${fixture.name}`)
        && await page.evaluate(f => {
          const { world, useGame } = globalThis.__wreckright;
          return world.tick === f.tick && useGame.getState().selection[0] === f.friendly
            && world.entities.find(unit => unit.id === f.friendly).orders.attack?.targetId === f.enemy;
        }, fixture));
      await page.screenshot({ path: `${shots}/target-commander-${width}.png` });

      await page.evaluate(f => {
        const { world, useGame } = globalThis.__wreckright;
        world.vision.visible.delete(f.enemy);
        world.vision.detected.add(f.enemy);
        const enemy = world.entities.find(unit => unit.id === f.enemy);
        enemy.pos = { x: 777, y: 333 };
        useGame.getState().patch({ tick: useGame.getState().tick + 1, contacts: [{
          id: f.enemy, team: f.enemyTeam, label: 'Sensor contact', position: { x: 720, y: 360 },
          approximateRange: 400, current: true, source: 'sensor',
        }] });
      }, fixture);
      await bracket.waitFor({ state: 'detached' });
      await commander.waitFor({ state: 'detached' });
      check(`${width}: fog removes exact brackets from both views while the coarse sensor dot remains`,
        await page.getByTestId(`commander-contact-${fixture.enemy}`).count() === 1
        && await page.locator('.commander-contact .commander-target-brackets').count() === 0
        && await page.getByTestId(`commander-chit-${fixture.enemy}`).count() === 0);
      await page.screenshot({ path: `${shots}/target-fog-${width}.png` });

      await page.evaluate(f => {
        const { world, useGame } = globalThis.__wreckright;
        world.vision.visible.add(f.enemy);
        world.entities.find(unit => unit.id === f.enemy).pos = { x: 490, y: 500 };
        useGame.getState().patch({ selection: [], contacts: [], tick: useGame.getState().tick + 1 });
      }, fixture);
      const chit = page.getByTestId(`commander-chit-${fixture.enemy}`).locator('.commander-chit-hit');
      await chit.click({ button: 'right' });
      check(`${width}: attack without a friendly selection gives a visible explanation`,
        (await receipt.innerText()).includes('Select a friendly mech first.'));
      await chit.click();
      await page.waitForFunction(id => document.querySelector(`[data-testid="commander-target-${id}"]`)?.getAttribute('data-focus') === 'inspection', fixture.enemy);
      check(`${width}: selecting an enemy for inspection gives distinct visible acknowledgement`,
        await commander.getAttribute('data-focus') === 'inspection');
      await receipt.waitFor({ state: 'detached', timeout: 7_000 });
      check(`${width}: command receipt expires while simulation remains paused`,
        await page.evaluate(tick => globalThis.__wreckright.world.tick === tick && globalThis.__wreckright.useGame.getState().paused, fixture.tick));
      check(`${width}: targeting journey has no page errors`, errors.length === 0, errors.join('\n'));
    } finally { await context.close(); }
  }
}

if (process.argv[1]?.endsWith('target-feedback.mjs')) {
  const shots = process.env.SHOT_DIR ?? 'reports/economy-command-flow/targets';
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let checks = 0;
  const failures = [];
  try {
    await runTargetFeedbackChecks({ browser, url: process.env.BASE_URL ?? 'http://127.0.0.1:5250/', shots,
      check(name, ok, detail = '') { checks++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures.push(`${name}: ${detail}`); } });
    if (failures.length) throw new Error(failures.join('\n'));
    console.log(`${checks}/${checks} target feedback checks passed`);
  } finally { await browser.close(); }
}
