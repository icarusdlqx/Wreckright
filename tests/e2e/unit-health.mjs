const fieldBar = (id) => `.unit-health-bar[data-entity-id="${id}"]`;
const commanderBar = (id) => `.commander-chit[data-commander-id="${id}"] .commander-health`;

async function fieldReadout(page, id) {
  return page.locator(fieldBar(id)).evaluate((bar) => {
    const bounds = bar.getBoundingClientRect();
    const fill = bar.querySelector('span');
    const scale = new DOMMatrixReadOnly(getComputedStyle(fill).transform).a;
    return { width: bounds.width, height: bounds.height, scale, classes: bar.className.split(' ') };
  });
}

/** Isolated presentation fixture, not a substitute for playing a mission to completion. */
export async function runUnitHealthChecks({ browser, url, shots, check }) {
  process.stdout.write('\nunit health readouts\n');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  try {
    await page.goto(url);
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing-mission-picker').selectOption('skirmish_ridge');
    await page.waitForFunction(() => {
      const test = globalThis.__ironmuster;
      return test?.world.mission.id === 'skirmish_ridge' && test.useGame.getState().ready;
    });
    await page.getByTestId('briefing-deploy').click();
    await page.getByTestId('briefing').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => {
      const test = globalThis.__ironmuster;
      return test?.useGame.getState().ready && test.useGame.getState().briefingSeen &&
        test.world === test.engine.world && test.world.vision !== null;
    });

    const fixture = await page.evaluate(() => {
      const { world, useGame, engine } = globalThis.__ironmuster;
      useGame.getState().patch({ paused: true });
      const isMech = (entity) => world.catalog.chassis.get(entity.chassisId)?.frame === 'mech';
      const friendly = world.entities.find((entity) => entity.team === world.playerTeam && isMech(entity));
      const enemy = world.entities.find((entity) => entity.team !== world.playerTeam && isMech(entity));
      if (friendly === undefined || enemy === undefined) throw new Error('Health fixture requires two opposing mechs.');
      friendly.pos = { x: 400, y: 500 };
      enemy.pos = { x: 480, y: 500 };
      world.vision.visible.clear();
      world.vision.visible.add(enemy.id);
      world.vision.tiles.fill(1);
      world.tick += 1;
      enemy.locations.left_arm.destroyed = true;
      enemy.locations.right_torso.armour = 0;
      friendly.locations.right_arm.destroyed = true;
      // Both interpolation samples must describe the fixture rather than the original deployment.
      engine.renderer.snapshot(world);
      engine.renderer.snapshot(world);
      engine.renderer.camera.skipDropIn();
      engine.renderer.camera.centreOn({ x: 440, y: 500 });
      useGame.getState().patch({ tick: useGame.getState().tick + 1 });
      return { friendlyId: friendly.id, enemyId: enemy.id, enemyTeam: enemy.team };
    });
    for (const [side, id] of [['friendly', fixture.friendlyId], ['optical enemy', fixture.enemyId]]) {
      await page.locator(fieldBar(id)).waitFor();
      const measured = await fieldReadout(page, id);
      check(`${side} field health bar remains compact without contact-card CSS`,
        measured.width >= 25 && measured.width <= 40 && measured.height > 0 && measured.height <= 8 &&
        !measured.classes.includes('hostile'));
      check(`${side} field health bar displays partial integrity after damage`, measured.scale > 0 && measured.scale < .99);
    }
    await page.screenshot({ path: `${shots}/unit-health-field.png` });

    await page.getByTestId('commander-toggle').click();
    await page.getByTestId('commander-view').waitFor();
    for (const [side, id] of [['friendly', fixture.friendlyId], ['optical enemy', fixture.enemyId]]) {
      // Horizontal SVG paths have zero geometric height; their non-scaling stroke is still visible.
      await page.locator(commanderBar(id)).waitFor({ state: 'attached' });
      const strip = await page.locator(commanderBar(id)).evaluate((bar) => {
        const track = bar.querySelector('.commander-health-track');
        const fill = bar.querySelector('.commander-health-fill');
        return { total: track.getTotalLength(), remaining: fill.getTotalLength(),
          stroke: Number.parseFloat(getComputedStyle(fill).strokeWidth), vectorEffect: fill.getAttribute('vector-effect') };
      });
      check(`${side} Commander health strip shows damage with a small constant stroke`,
        strip.remaining > 0 && strip.remaining < strip.total && strip.stroke >= 2 && strip.stroke <= 3 &&
        strip.vectorEffect === 'non-scaling-stroke');
    }
    await page.screenshot({ path: `${shots}/unit-health-commander.png` });

    await page.evaluate(({ enemyId, enemyTeam }) => {
      const { world, useGame } = globalThis.__ironmuster;
      world.vision.visible.delete(enemyId);
      useGame.getState().patch({ tick: useGame.getState().tick + 1, contacts: [{
        id: enemyId, team: enemyTeam, label: 'Sensor contact', position: { x: 500, y: 360 },
        approximateRange: 400, current: true, source: 'sensor',
      }] });
    }, fixture);
    await page.getByTestId(`commander-contact-${fixture.enemyId}`).waitFor();
    await page.locator(fieldBar(fixture.enemyId)).waitFor({ state: 'detached' });
    await page.locator(commanderBar(fixture.enemyId)).waitFor({ state: 'detached' });
    check('losing optics removes exact enemy health from both field and Commander views',
      await page.locator(fieldBar(fixture.enemyId)).count() === 0 && await page.locator(commanderBar(fixture.enemyId)).count() === 0);
    check('live sensor-only contacts do not reveal enemy health', await page.locator('.commander-contact .commander-health').count() === 0);
    await page.screenshot({ path: `${shots}/unit-health-sensor-privacy.png` });

    await page.evaluate(({ enemyId }) => {
      const { world, useGame } = globalThis.__ironmuster;
      world.vision.visible.add(enemyId);
      useGame.getState().patch({ tick: useGame.getState().tick + 1, contacts: [] });
    }, fixture);
    await page.locator(fieldBar(fixture.enemyId)).waitFor();
    await page.locator(commanderBar(fixture.enemyId)).waitFor({ state: 'attached' });
    check('regaining optics restores the surviving enemy health bars', true);
    await page.evaluate(({ enemyId }) => {
      const { world, useGame } = globalThis.__ironmuster;
      world.entities.find((entity) => entity.id === enemyId).destroyed = true;
      useGame.getState().patch({ tick: useGame.getState().tick + 1 });
    }, fixture);
    await page.locator(fieldBar(fixture.enemyId)).waitFor({ state: 'detached' });
    await page.locator(commanderBar(fixture.enemyId)).waitFor({ state: 'detached' });
    check('destroying a visible mech removes both previously displayed health bars',
      await page.locator(fieldBar(fixture.enemyId)).count() === 0 && await page.locator(commanderBar(fixture.enemyId)).count() === 0);
    check('health readout journey has no page errors', errors.length === 0);
  } finally {
    await context.close();
  }
}
