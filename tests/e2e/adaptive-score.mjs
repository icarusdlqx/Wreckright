import {
  advanceAudioClock,
  audioProbe,
  includesValues,
  installAudioProbe,
  newTargets,
  scoreFrequencyTargets,
} from './audio-probe.mjs';

const SCORE_SOURCE_COUNT = 5;
const SCORE_START_FREQUENCIES = [0.72, 43.65, 65.41, 87.31, 103.83];
const LINE_PITCHES = [43.65, 65.41, 87.31, 103.83];
const AURELIAN_PITCHES = [46.25, 69.30, 103.83, 130.81];
const MIDPOINT_PITCHES = LINE_PITCHES.map((value, index) =>
  Math.sqrt(value * AURELIAN_PITCHES[index]));

function watchPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function openMenu(page) {
  const sheet = page.locator('[data-testid="desktop-menu-sheet"]');
  if (!(await sheet.isVisible())) await page.locator('[data-testid="desktop-menu-toggle"]').click();
  await sheet.waitFor({ state: 'visible' });
}

async function pause(page) {
  if (!(await page.evaluate(() => globalThis.__wreckright.useGame.getState().paused))) {
    await page.locator('[data-testid="pause-button"]').click();
  }
  await page.waitForSelector('[data-testid="paused-banner"]');
}

async function unlock(page) {
  await page.locator('.viewport canvas:not(.perf-overlay)').click({ position: { x: 40, y: 40 } });
}

async function restart(page) {
  const priorContextCount = (await audioProbe(page)).length;
  await page.evaluate(() => { globalThis.__scorePreviousEngine = globalThis.__wreckright.engine; });
  await openMenu(page);
  await page.locator('[data-testid="restart-battle"]').click();
  await page.waitForFunction(() => (
    globalThis.__wreckright?.engine !== globalThis.__scorePreviousEngine
    && globalThis.__wreckright.useGame.getState().briefingSeen === true
  ));
  await page.waitForFunction((count) => (
    globalThis.__audioProbe.snapshot().slice(0, count)
      .every((context) => context.state === 'closed' && context.closeCalls === 1)
  ), priorContextCount);
  await page.evaluate(() => { delete globalThis.__scorePreviousEngine; });
  await page.waitForSelector('.viewport canvas:not(.perf-overlay)');
}

async function stageQuietBattle(page) {
  return page.evaluate(() => {
    const { engine, world } = globalThis.__wreckright;
    const playerTeam = world.playerTeam;
    const chassisFor = (faction) => [...world.catalog.chassis.values()]
      .find((chassis) => chassis.faction === faction)?.id;
    const linewrought = chassisFor('linewrought');
    const aurelian = chassisFor('aurelian');
    if (playerTeam === null || linewrought === undefined || aurelian === undefined) {
      throw new Error('missing adaptive-score culture fixture');
    }
    for (const entity of world.entities) {
      entity.chassisId = linewrought;
      entity.autopilot = false;
      entity.controller = 'orders';
      entity.posture = 'hold_position';
      entity.targetId = null;
      entity.orders.move = null;
      entity.orders.attack = null;
      entity.orders.queue.length = 0;
      entity.path.length = 0;
      entity.pathIndex = 0;
      entity.motion = 'stationary';
      entity.intendedMotion = 'stationary';
      entity.groupEnabled.fill(false);
      entity.groupIntent.fill(false);
      entity.sensorRange = 1;
      entity.sightRange = 1;
    }
    world.reveals.length = 0;
    world.projectiles.length = 0;
    world.vision?.visible.clear();
    world.vision?.detected.clear();
    engine.setPaused(true);
    globalThis.__scoreFixture = { playerTeam, linewrought, aurelian };
    return {
      friendlies: world.entities.filter((entity) => entity.team === playerTeam).length,
      enemies: world.entities.filter((entity) => entity.team !== playerTeam).length,
    };
  });
}

async function setFaction(page, side, faction) {
  await page.evaluate(({ wantedSide, wantedFaction }) => {
    const { world } = globalThis.__wreckright;
    const fixture = globalThis.__scoreFixture;
    const chassisId = fixture[wantedFaction];
    for (const entity of world.entities) {
      const friendly = entity.team === fixture.playerTeam;
      if (wantedSide === 'all' || (wantedSide === 'friendly') === friendly) {
        entity.chassisId = chassisId;
      }
    }
  }, { wantedSide: side, wantedFaction: faction });
}

async function pushHiddenFire(page) {
  await page.evaluate(() => {
    const { engine, world } = globalThis.__wreckright;
    const fixture = globalThis.__scoreFixture;
    const shooter = world.entities.find((entity) => entity.team !== fixture.playerTeam);
    const target = world.entities.find((entity) => entity.team === fixture.playerTeam);
    const weapon = shooter?.weapons.find((mount) => world.catalog.weapons.has(mount.weaponId));
    if (shooter === undefined || target === undefined || weapon === undefined) {
      throw new Error('missing adaptive-score firing fixture');
    }
    world.events.push({
      type: 'weapon_fired', tick: world.tick, shooterId: shooter.id,
      targetId: target.id, weaponId: weapon.weaponId,
    });
    engine.forceStep();
  });
}

async function revealEnemies(page, kind) {
  return page.evaluate((revealKind) => {
    const { engine, world } = globalThis.__wreckright;
    const fixture = globalThis.__scoreFixture;
    world.reveals.length = 0;
    world.reveals.push({
      team: fixture.playerTeam, kind: revealKind, x: 512, y: 512,
      radius: 2_000, expiresTick: world.tick + 1_000,
    });
    engine.forceStep();
    const enemies = world.entities.filter((entity) => entity.team !== fixture.playerTeam);
    return {
      detected: enemies.filter((entity) => world.vision?.detected.has(entity.id)).length,
      visible: enemies.filter((entity) => world.vision?.visible.has(entity.id)).length,
      enemies: enemies.length,
    };
  }, kind);
}

function cultureTargets(before, after) {
  const targets = newTargets(before, after);
  return {
    pitches: scoreFrequencyTargets(before, after),
    filters: targets.filter((entry) => /^filter-\d+-frequency$/.test(entry.name))
      .map((entry) => entry.value),
    resonance: targets.filter((entry) => /^filter-\d+-q$/.test(entry.name))
      .map((entry) => entry.value),
    gains: targets.filter((entry) => /^gain-\d+$/.test(entry.name))
      .map((entry) => entry.value),
  };
}

const sameSourceIds = (left, right) => JSON.stringify(left.scoreSources.map((source) => source.id))
  === JSON.stringify(right.scoreSources.map((source) => source.id));

export async function runAdaptiveScoreChecks({ browser, url, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = watchPage(page);
  try {
    await installAudioProbe(page, SCORE_SOURCE_COUNT);
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('ironline.training', JSON.stringify({ version: 1, step: 0, status: 'skipped' }));
    });
    await page.goto(url);
    await page.waitForSelector('[data-testid="home-screen"]');
    await page.locator('[data-testid="home-skirmish"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    await page.locator('[data-testid="briefing-faction-picker"]').selectOption('linewrought');
    await page.waitForFunction(() => {
      const wreckright = globalThis.__wreckright;
      if (wreckright === undefined) return false;
      const { useGame, world } = wreckright;
      return useGame.getState().ready === true && world.entities
        .filter((entity) => entity.team === world.playerTeam)
        .every((entity) => world.catalog.chassis.get(entity.chassisId)?.faction === 'linewrought');
    });
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().briefingSeen === true);
    await pause(page);
    await unlock(page);
    await page.waitForFunction(() => globalThis.__audioProbe.snapshot().length === 1);

    const initial = (await audioProbe(page))[0];
    const fixedGraphs = [initial.counts];
    check(
      'adaptive score starts one fixed five-source graph',
      initial.scoreSources.length === SCORE_SOURCE_COUNT
        && initial.scoreSources.every((source) => source.kind === 'oscillator'
          && source.starts.length === 1 && source.stops.length === 0 && source.active)
        && includesValues(initial.scoreSources.map((source) => source.startFrequency), SCORE_START_FREQUENCIES),
      JSON.stringify(initial),
    );

    const roster = await stageQuietBattle(page);
    await advanceAudioClock(page);
    const sensorState = await revealEnemies(page, 'sensor');
    const sensorBefore = (await audioProbe(page))[0];
    await setFaction(page, 'hostile', 'aurelian');
    await advanceAudioClock(page);
    await pushHiddenFire(page);
    const sensorAfter = (await audioProbe(page))[0];
    const sensorDelta = newTargets(sensorBefore, sensorAfter);
    const sensorCultureDelta = cultureTargets(sensorBefore, sensorAfter);
    check('sensor-only hostile culture changes do not leak identity into the score',
      sensorState.detected === roster.enemies && sensorState.visible === 0
        && sensorDelta.length === 0 && sensorCultureDelta.pitches.length === 0,
      JSON.stringify({ sensorState, sensorDelta, sensorCultureDelta }));

    await page.evaluate(() => {
      const { engine, world } = globalThis.__wreckright;
      world.reveals.length = 0;
      world.events.push({ type: 'battle_ended', tick: world.tick, winner: null });
      engine.forceStep();
    });
    const hiddenBefore = (await audioProbe(page))[0];
    await setFaction(page, 'hostile', 'linewrought');
    await advanceAudioClock(page);
    await pushHiddenFire(page);
    const hiddenAfter = (await audioProbe(page))[0];
    const hiddenState = await page.evaluate(() => ({
      visible: globalThis.__wreckright.world.vision?.visible.size ?? 0,
      detected: globalThis.__wreckright.world.vision?.detected.size ?? 0,
    }));
    const hiddenDelta = newTargets(hiddenBefore, hiddenAfter);
    const hiddenCultureDelta = cultureTargets(hiddenBefore, hiddenAfter);
    check('hidden hostile fire and culture do not leak into score automation',
      hiddenState.visible === 0 && hiddenState.detected === 0
        && hiddenDelta.length === 0 && hiddenCultureDelta.pitches.length === 0,
      JSON.stringify({ hiddenState, hiddenDelta, hiddenCultureDelta }));

    const seeded = hiddenAfter;
    await advanceAudioClock(page);
    await page.evaluate(() => {
      const { engine, world } = globalThis.__wreckright;
      world.events.push({
        type: 'support_called', tick: world.tick, team: world.playerTeam ?? 0,
        call: 'sensor_probe', x: 0, y: 0, cost: 0,
      });
      engine.forceStep();
    });
    const moving = (await audioProbe(page))[0];
    check('an engine-routed pressure event retargets the pulse without allocating nodes',
      moving.counts.nodes === initial.counts.nodes && moving.targets > seeded.targets,
      JSON.stringify({ before: seeded, after: moving }));
    check('low activity leaves the full battle layer dormant',
      !newTargets(seeded, moving).some((entry) => /^gain-\d+$/.test(entry.name)
        && entry.value > 0.03 && entry.value <= 0.111));

    await setFaction(page, 'hostile', 'aurelian');
    await advanceAudioClock(page);
    const opticalState = await revealEnemies(page, 'optical');
    const optical = (await audioProbe(page))[0];
    const midpoint = cultureTargets(moving, optical);
    check('optical reveal admits hostile culture at the exact half-roster voicing',
      roster.friendlies === roster.enemies && opticalState.visible === roster.enemies
        && optical.targets > moving.targets
        && includesValues(midpoint.pitches, MIDPOINT_PITCHES, 0.01),
      JSON.stringify({ opticalState, midpoint }));

    await setFaction(page, 'all', 'aurelian');
    await advanceAudioClock(page);
    await page.evaluate(() => globalThis.__wreckright.engine.forceStep());
    const aurelian = (await audioProbe(page))[0];
    const aurelianVoice = cultureTargets(optical, aurelian);
    check('Aurelian roster reaches its authored pitch, filter, resonance and gain endpoint',
      includesValues(aurelianVoice.pitches, AURELIAN_PITCHES)
        && includesValues(aurelianVoice.filters, [260, 880, 1_400])
        && includesValues(aurelianVoice.resonance, [1.4, 2.1, 2.8])
        && includesValues(aurelianVoice.gains, [0.46, 0.3, 0.28]),
      JSON.stringify(aurelianVoice));

    await setFaction(page, 'all', 'linewrought');
    await advanceAudioClock(page);
    await page.evaluate(() => globalThis.__wreckright.engine.forceStep());
    const linewrought = (await audioProbe(page))[0];
    const lineVoice = cultureTargets(aurelian, linewrought);
    check('Linewrought roster returns to its authored pitch, filter, resonance and gain endpoint',
      includesValues(lineVoice.pitches, LINE_PITCHES)
        && includesValues(lineVoice.filters, [190, 520, 420])
        && includesValues(lineVoice.resonance, [0.7, 0.9, 0.85])
        && includesValues(lineVoice.gains, [0.56, 0.22, 0.34]),
      JSON.stringify(lineVoice));

    await openMenu(page);
    await page.locator('[data-testid="mute-button"]').click();
    const mutedBefore = (await audioProbe(page))[0];
    await advanceAudioClock(page);
    await page.evaluate(() => {
      const { engine, world } = globalThis.__wreckright;
      const fixture = globalThis.__scoreFixture;
      const ally = world.entities.find((entity) => entity.team === fixture.playerTeam);
      const enemy = world.entities.find((entity) => entity.team !== fixture.playerTeam);
      const weapon = ally?.weapons.find((mount) => world.catalog.weapons.has(mount.weaponId));
      if (ally === undefined || enemy === undefined || weapon === undefined) throw new Error('missing score volley');
      const event = {
        type: 'weapon_fired', tick: world.tick, shooterId: ally.id,
        targetId: enemy.id, weaponId: weapon.weaponId,
      };
      world.events.push(...Array.from({ length: 16 }, () => ({ ...event })));
      engine.forceStep();
    });
    const mutedAfter = (await audioProbe(page))[0];
    const fullTargets = newTargets(mutedBefore, mutedAfter)
      .filter((entry) => /^gain-\d+$/.test(entry.name) && entry.value > 0.08 && entry.value <= 0.111);
    check('sustained engine-routed fire activates the full layer without allocating nodes',
      fullTargets.length === 1 && mutedAfter.counts.nodes === mutedBefore.counts.nodes,
      JSON.stringify(fullTargets));
    check('mute zeros the master while the full score arc keeps tracking',
      mutedBefore.master === 0 && mutedAfter.master === 0 && mutedAfter.targets > mutedBefore.targets
        && sameSourceIds(mutedBefore, mutedAfter)
        && (await page.locator('[data-testid="mute-button"]').innerText()) === 'Sound off'
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '1');
    await page.locator('[data-testid="mute-button"]').click();
    check('unmute restores the shared master without restarting score sources',
      (await audioProbe(page))[0].master === 0.5 && sameSourceIds(mutedAfter, (await audioProbe(page))[0]));

    const pausedTick = await page.evaluate(() => globalThis.__wreckright.world.tick);
    const pausedGraph = (await audioProbe(page))[0];
    await advanceAudioClock(page, 0.5);
    const heldGraph = (await audioProbe(page))[0];
    check('pause holds simulation intensity and the same score sources',
      (await page.evaluate(() => globalThis.__wreckright.world.tick)) === pausedTick
        && heldGraph.targets === pausedGraph.targets && sameSourceIds(heldGraph, pausedGraph));
    await page.locator('[data-testid="pause-button"]').click();
    await page.waitForFunction((tick) => globalThis.__wreckright.world.tick > tick, pausedTick);
    await pause(page);
    check('resume keeps the score graph instead of rebuilding it',
      sameSourceIds((await audioProbe(page))[0], pausedGraph));

    for (let battle = 1; battle < 10; battle += 1) {
      await restart(page);
      await pause(page);
      await unlock(page);
      await page.waitForFunction((count) => globalThis.__audioProbe.snapshot().length === count, battle + 1);
      const contexts = await audioProbe(page);
      fixedGraphs.push(contexts[battle].counts);
      check(`adaptive score battle ${battle} closes the prior context`,
        contexts[battle - 1].state === 'closed' && contexts[battle - 1].closeCalls === 1);
    }
    await restart(page);
    const lifetime = await audioProbe(page);
    const scoreSources = lifetime.flatMap((entry) => entry.scoreSources);
    const starts = scoreSources.reduce((sum, source) => sum + source.starts.length, 0);
    const stops = scoreSources.reduce((sum, source) => sum + source.stops.length, 0);
    const openContexts = lifetime.filter((entry) => entry.state !== 'closed').length;
    const activeSources = lifetime.reduce((sum, entry) => sum + entry.activeSources, 0);
    check('ten consecutive battles create identical fixed graphs and exactly 50 score lifetimes',
      lifetime.length === 10 && openContexts === 0 && activeSources === 0
        && lifetime.every((entry) => entry.closeCalls === 1)
        && fixedGraphs.every((counts) => JSON.stringify(counts) === JSON.stringify(fixedGraphs[0]))
        && scoreSources.length === 50 && starts === 50 && stops === 50
        && scoreSources.every((source) => !source.active && source.stops.length === 1),
      JSON.stringify({ contexts: lifetime.length, fixedGraphs, starts, stops, openContexts, activeSources }));
    check('adaptive score fixture reports no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}
