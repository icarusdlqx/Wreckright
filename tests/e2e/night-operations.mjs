import {
  inspectNightScene,
  lowFxNightVolley,
  measureNightAlphaStrike,
  NIGHT_PERF_BLOCK_COUNT,
  repeatNightVolley,
  resourceCounts,
  sameList,
  sameSceneResources,
  summariseNightContrasts,
  summariseNightPerf,
  summariseNightValues,
} from './night-operations-runtime.mjs';

function watchPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function openNightBattle(page, url) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'ironline.training',
      JSON.stringify({ version: 1, step: 0, status: 'skipped' }),
    );
  });
  await page.goto(url);
  await page.waitForSelector('[data-testid="home-screen"]');
  await page.locator('[data-testid="home-skirmish"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
  await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().ready === true);

  await page.locator('[data-testid="briefing-mission-picker"]').selectOption('causeway_night');
  await page.waitForFunction(() => (
    globalThis.__wreckright?.world.mission.id === 'causeway_night' &&
    globalThis.__wreckright.useGame.getState().ready === true
  ));

  const faction = page.locator('[data-testid="briefing-faction-picker"]');
  if (await faction.inputValue() !== 'linewrought') {
    await faction.selectOption('linewrought');
    await page.waitForFunction(() => (
      globalThis.__wreckright?.world.mission.id === 'causeway_night' &&
      globalThis.__wreckright.useGame.getState().ready === true
    ));
  }

  await page.locator('[data-testid="briefing-deploy"]').click();
  await page.waitForFunction(() => (
    globalThis.__wreckright?.world.mission.id === 'causeway_night' &&
    globalThis.__wreckright.useGame.getState().briefingSeen === true
  ));
  await page.waitForSelector('.viewport canvas:not(.perf-overlay)');

  // The authored lances begin far apart, so this admits the startup/running-light
  // presentation without allowing a combat exchange before the fixture freezes.
  await page.waitForTimeout(800);
}

async function prepareFixture(page) {
  const fixture = await page.evaluate(() => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const state = useGame.getState();
    const friendlies = world.entities
      .filter((entity) => entity.team === state.playerTeam && !entity.destroyed && !entity.withdrawn)
      .slice(0, 4);
    const enemies = world.entities
      .filter((entity) => entity.team !== state.playerTeam && !entity.destroyed && !entity.withdrawn)
      .slice(0, 4);
    if (friendlies.length !== 4 || enemies.length !== 4) {
      throw new Error(`night fixture needs 4v4, found ${friendlies.length}v${enemies.length}`);
    }

    const friendlyPositions = [[360, 390], [360, 450], [420, 390], [420, 450]];
    const enemyPositions = [[580, 390], [580, 450], [640, 390], [640, 450]];
    for (let index = 0; index < friendlies.length; index += 1) {
      const entity = friendlies[index];
      const position = friendlyPositions[index];
      entity.pos = { x: position[0], y: position[1] };
      entity.facing = 0;
      entity.torsoOffset = 0;
    }
    for (let index = 0; index < enemies.length; index += 1) {
      const entity = enemies[index];
      const position = enemyPositions[index];
      entity.pos = { x: position[0], y: position[1] };
      entity.facing = Math.PI;
      entity.torsoOffset = 0;
      world.vision?.visible.add(entity.id);
    }

    engine.setPaused(true);
    state.setSelection(friendlies.map((entity) => entity.id));
    engine.renderer.snapshot(world);
    engine.presentation.publish(null);
    engine.renderer.camera.distance = 330;
    engine.renderer.camera.centreOn({ x: 500, y: 420 });
    engine.renderer.camera.update(engine.renderer.viewport);

    const targetId = enemies[0].id;
    const events = friendlies.flatMap((entity) => entity.weapons
      .filter((mount) => !mount.destroyed)
      .map((mount, index) => ({
        type: 'weapon_fired',
        tick: world.tick + entity.id * 100 + index + 1,
        shooterId: entity.id,
        targetId,
        weaponId: mount.weaponId,
        modeId: mount.modeId,
      })));

    return {
      atmosphereId: world.atmosphere.id,
      friendlyIds: friendlies.map((entity) => entity.id),
      enemyIds: enemies.map((entity) => entity.id),
      events,
      shooterCount: new Set(events.map((event) => event.shooterId)).size,
      tick: world.tick,
    };
  });
  await page.waitForTimeout(120);
  return fixture;
}

export async function runNightOperationsChecks({ browser, url, shots, check }) {
  process.stdout.write('\nnight operations\n');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = watchPage(page);

  try {
    await openNightBattle(page, url);
    const fixture = await prepareFixture(page);
    check('night fixture loads the moonlit atmosphere', fixture.atmosphereId === 'moonlit_night');
    check(
      'night fixture stages a four-machine alpha volley',
      fixture.friendlyIds.length === 4 &&
        fixture.enemyIds.length === 4 &&
        fixture.shooterCount === 4 &&
        fixture.events.length >= 12,
      JSON.stringify({
        friendlies: fixture.friendlyIds.length,
        enemies: fixture.enemyIds.length,
        shooters: fixture.shooterCount,
        shots: fixture.events.length,
      }),
    );

    const quiet = await inspectNightScene(page, fixture);
    check(
      'night mechs carry visible running lights',
      quiet.runningLights.length === 4 && quiet.runningLights.every((rig) => rig.visible > 0),
      JSON.stringify(quiet.runningLights),
    );
    check(
      'all staged enemies remain pickable in darkness',
      sameList([...quiet.pickableEnemyIds].sort((a, b) => a - b), [...fixture.enemyIds].sort((a, b) => a - b)),
      JSON.stringify(quiet.pickableEnemyIds),
    );
    check(
      'muzzle-light pool starts as exactly four dormant unshadowed lights',
      quiet.pointLights.length === 4 &&
        quiet.pointLights.every((light) => !light.visible && !light.castShadow && light.intensity === 0),
      JSON.stringify(quiet.pointLights),
    );
    await page.screenshot({ path: `${shots}/16-night-operations-quiet.png` });

    const measured = await measureNightAlphaStrike(page, fixture.events);
    const emptySamples = { activation: [], following: [], setup: [] };
    const emptyContrasts = {
      activation: { frame: [], other: [] },
      following: { frame: [], other: [] },
    };
    const quietSamples = measured.quiet ?? emptySamples;
    const activeSamples = measured.active ?? emptySamples;
    const contrasts = measured.contrasts ?? emptyContrasts;
    const quietPerf = {
      activation: summariseNightPerf(quietSamples.activation),
      following: summariseNightPerf(quietSamples.following),
    };
    const activePerf = {
      activation: summariseNightPerf(activeSamples.activation),
      following: summariseNightPerf(activeSamples.following),
    };
    const contrast = {
      activation: summariseNightContrasts(contrasts.activation),
      following: summariseNightContrasts(contrasts.following),
    };
    const setup = {
      quiet: summariseNightValues(quietSamples.setup),
      active: summariseNightValues(activeSamples.setup),
    };
    const otherMedianLimit = 18;
    const frameMedianLimit = 20;
    // Two missed 60 Hz refreshes is the overlay's standing late-frame line.
    const p90Limit = 34;
    const perfDetail = JSON.stringify({
      error: measured.error,
      quiet: quietPerf,
      active: activePerf,
      setup,
      contrast,
      budgets: {
        units: '60Hz-equivalent ms',
        normalisedToMs: measured.normalisation?.targetFrameMs ?? null,
        scales: measured.normalisation?.scales ?? null,
        otherMedian: otherMedianLimit,
        frameMedian: frameMedianLimit,
        frameAndOtherP90: p90Limit,
      },
    });
    const phases = ['activation', 'following'];
    const phaseCountsHold = phases.every((phase) => (
      contrast[phase].count === NIGHT_PERF_BLOCK_COUNT &&
      quietPerf[phase].count === NIGHT_PERF_BLOCK_COUNT * 2 &&
      activePerf[phase].count === NIGHT_PERF_BLOCK_COUNT * 2
    ));
    const phaseBudgetsHold = phases.every((phase) => (
      contrast[phase].otherMedian <= otherMedianLimit &&
      contrast[phase].frameMedian <= frameMedianLimit &&
      contrast[phase].otherP90 <= p90Limit &&
      contrast[phase].frameP90 <= p90Limit
    ));
    check(
      `alpha activation and lighting stay inside their ABBA 60Hz-equivalent frame budgets (activation ${contrast.activation.frameMedian.toFixed(1)}ms; following ${contrast.following.frameMedian.toFixed(1)}ms median contrast)`,
      measured.error === null &&
        phaseCountsHold &&
        phaseBudgetsHold,
      perfDetail,
    );
    check(
      'alpha presentation stays inside its fixed two-draw budget',
      phases.every((phase) => (
        quietPerf[phase].drawCalls.length === 1 &&
        activePerf[phase].drawCalls.length === 1 &&
        activePerf[phase].drawCalls[0] >= quietPerf[phase].drawCalls[0] &&
        activePerf[phase].drawCalls[0] <= quietPerf[phase].drawCalls[0] + 2
      )),
      perfDetail,
    );
    check('render-only alpha fixture leaves simulation state unchanged', measured.simUnchanged === true);

    const alpha = await inspectNightScene(page, fixture);
    check(
      'an alpha volley lights exactly the four pooled flashes',
      alpha.pointLights.length === 4 &&
        alpha.pointLights.every((light) => light.visible && !light.castShadow && light.intensity > 0),
      JSON.stringify(alpha.pointLights),
    );
    await page.screenshot({ path: `${shots}/16-night-operations-alpha.png` });

    await repeatNightVolley(page, fixture.events, 8);
    const repeated = await inspectNightScene(page, fixture);
    check(
      'repeated volleys retain the same four light identities',
      sameList(
        quiet.pointLights.map((light) => light.uuid),
        repeated.pointLights.map((light) => light.uuid),
      ) && repeated.pointLights.filter((light) => light.visible).length === 4,
      JSON.stringify(repeated.pointLights),
    );
    check(
      'repeated volleys allocate no scene or renderer resources',
      sameSceneResources(alpha.resources, repeated.resources),
      JSON.stringify({
        firstActive: resourceCounts(alpha.resources),
        repeated: resourceCounts(repeated.resources),
      }),
    );

    const lowFxLights = await lowFxNightVolley(page, fixture.events);
    check('low FX suppresses pooled muzzle lighting', lowFxLights === 0, String(lowFxLights));
    check('night-operations flow reports no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}
