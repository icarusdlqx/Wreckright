import { audioProbe, installAudioProbe } from './audio-probe.mjs';

const SCORE_SOURCE_COUNT = 5;

function watchPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function openBattle(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = watchPage(page);
  await installAudioProbe(page, SCORE_SOURCE_COUNT);
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
  await page.locator('[data-testid="briefing-deploy"]').click();
  await page.waitForSelector('.viewport canvas:not(.perf-overlay)');
  await page.locator('[data-testid="pause-button"]').click();
  await page.locator('.viewport canvas:not(.perf-overlay)').click({ position: { x: 40, y: 40 } });
  await page.waitForFunction(() => globalThis.__audioProbe.snapshot().length === 1);
  await page.evaluate(() => {
    const { engine, world } = globalThis.__wreckright;
    for (const entity of world.entities) {
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
      entity.heat = 0;
      entity.sensorRange = 1;
      entity.sightRange = 1;
    }
    world.reveals.length = 0;
    world.vision?.visible.clear();
    world.vision?.detected.clear();
    engine.setPaused(true);
  });
  return { context, page, errors };
}

async function emitMoment(page, kind) {
  const before = (await audioProbe(page))[0];
  await page.evaluate((moment) => {
    const { engine, world } = globalThis.__wreckright;
    const ally = world.entities.find((entity) => entity.team === world.playerTeam);
    if (ally === undefined) throw new Error('missing last-silent-moments ally');
    const event = moment === 'ability_used'
      ? { type: moment, tick: world.tick, entityId: ally.id, abilityId: 'coolant_flush' }
      : moment === 'alpha_strike' || moment === 'stood_up' || moment === 'pilot_ejected'
        ? { type: moment, tick: world.tick, entityId: ally.id }
        : moment === 'unit_withdrew'
          ? { type: moment, tick: world.tick, entityId: ally.id, team: ally.team }
          : { type: 'mission_message', tick: world.tick, text: 'Hold this ground.' };
    world.events.push(event);
    engine.forceStep();
  }, kind);
  const after = (await audioProbe(page))[0];
  return { before, after, sources: after.sources.slice(before.sources.length) };
}

function sourceSignature(sources) {
  return JSON.stringify(sources.map((source) => ({
    kind: source.kind,
    frequency: source.startFrequency,
    start: source.starts[0],
    stop: source.stops[0],
  })));
}

async function renderWorstCaseMix(page) {
  return page.evaluate(async () => {
    const voices = await import('/src/ui/audioVoices.ts');
    const sampleRate = 48_000;
    const context = new OfflineAudioContext(1, sampleRate * 2, sampleRate);
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 8;
    compressor.connect(context.destination);
    const master = context.createGain();
    master.gain.value = 0.5;
    master.connect(compressor);

    const noise = context.createBuffer(1, sampleRate, sampleRate);
    const noiseData = noise.getChannelData(0);
    let seed = 0x12345678;
    for (let index = 0; index < noiseData.length; index += 1) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      noiseData[index] = ((seed >>> 0) / 4_294_967_295) * 2 - 1;
    }

    const bus = {
      begin(placement) {
        if (placement.level <= 0.01) return null;
        const out = context.createGain();
        out.gain.value = Math.min(1, placement.level);
        if (placement.distance === null) {
          out.connect(master);
        } else {
          const air = context.createBiquadFilter();
          air.type = 'lowpass';
          air.frequency.value = Math.max(600, 18_000 - placement.distance * 22);
          out.connect(air).connect(master);
        }
        return { context, noise, now: 0.05, out, random: () => 0.25 };
      },
    };

    voices.playAbility(bus, 'coolant', 4);
    voices.playAlphaStrike(bus, 4);
    voices.playMissionMessage(bus);
    voices.playLifecycleMoment(bus, 'stood_up', { level: 1, distance: 0 });
    voices.playLifecycleMoment(bus, 'pilot_ejected', { level: 1, distance: 0 });
    voices.playLifecycleMoment(bus, 'unit_withdrew', { level: 1, distance: 0 });
    voices.playHeatWarning(bus, 3);

    const rendered = await context.startRendering();
    const samples = rendered.getChannelData(0);
    let peak = 0;
    let clipped = 0;
    let squares = 0;
    for (const sample of samples) {
      const magnitude = Math.abs(sample);
      peak = Math.max(peak, magnitude);
      if (magnitude >= 1) clipped += 1;
      squares += sample * sample;
    }
    return {
      peak,
      clipped,
      rms: Math.sqrt(squares / samples.length),
      samples: samples.length,
    };
  });
}

export async function runLastSilentMomentsChecks({ browser, url, check }) {
  const { context, page, errors } = await openBattle(browser, url);
  try {
    const initial = (await audioProbe(page))[0];
    const signatures = [];
    for (const moment of [
      'ability_used',
      'alpha_strike',
      'stood_up',
      'pilot_ejected',
      'unit_withdrew',
      'mission_message',
    ]) {
      const result = await emitMoment(page, moment);
      signatures.push(sourceSignature(result.sources));
      check(
        `${moment} has a finite screen-off voice`,
        result.sources.length > 0
          && result.sources.every((source) => !source.active && source.stops.length === 1
            && Number.isFinite(source.stops[0]))
          && result.after.activeSources === initial.activeSources,
        JSON.stringify(result.sources),
      );
    }

    const beforeHeat = (await audioProbe(page))[0];
    await page.evaluate(() => {
      const { engine, world } = globalThis.__wreckright;
      const ally = world.entities.find((entity) => entity.team === world.playerTeam);
      if (ally === undefined) throw new Error('missing heat-warning ally');
      ally.heat = ally.heatCapacity * 0.95;
      // Observe the warning directly. A simulation tick at this heat can also
      // roll a shutdown or ammo explosion, adding an unrelated source.
      engine.audio.consume(world, []);
    });
    const afterHeat = (await audioProbe(page))[0];
    const heatSources = afterHeat.sources.slice(beforeHeat.sources.length);
    signatures.push(sourceSignature(heatSources));
    check(
      'rising heat reaches a finite high-tier warning',
      heatSources.length === 3
        && heatSources.every((source) => !source.active && source.stops.length === 1)
        && afterHeat.activeSources === initial.activeSources,
      JSON.stringify(heatSources),
    );
    check(
      'all seven silent moments have distinct procedural signatures',
      new Set(signatures).size === signatures.length,
      JSON.stringify(signatures),
    );

    const beforeHidden = (await audioProbe(page))[0];
    await page.evaluate(() => {
      const { engine, world } = globalThis.__wreckright;
      const enemy = world.entities.find((entity) => entity.team !== world.playerTeam);
      if (enemy === undefined || world.vision === null) throw new Error('missing hidden enemy fixture');
      // The heat-warning fixture left an ally at 95% heat. forceStep also
      // advances thermal rolls; a friendly shutdown is unrelated to privacy.
      for (const entity of world.entities) {
        if (entity.team === world.playerTeam) entity.heat = 0;
      }
      world.vision.visible.delete(enemy.id);
      world.vision.detected.delete(enemy.id);
      world.events.push(
        { type: 'stood_up', tick: world.tick, entityId: enemy.id },
        { type: 'pilot_ejected', tick: world.tick, entityId: enemy.id },
        { type: 'unit_withdrew', tick: world.tick, entityId: enemy.id, team: enemy.team },
      );
      engine.forceStep();
    });
    const afterHidden = (await audioProbe(page))[0];
    const hiddenSources = afterHidden.sources.slice(beforeHidden.sources.length);
    check(
      'hidden hostile lifecycle moments do not leak through audio',
      afterHidden.sources.length === beforeHidden.sources.length,
      JSON.stringify({ sourceDelta: hiddenSources.length, signature: sourceSignature(hiddenSources) }),
    );

    const menu = page.locator('[data-testid="desktop-menu-sheet"]');
    if (!(await menu.isVisible())) await page.locator('[data-testid="desktop-menu-toggle"]').click();
    await page.locator('[data-testid="mute-button"]').click();
    const mutedBefore = (await audioProbe(page))[0];
    await page.evaluate(() => {
      const { engine, world } = globalThis.__wreckright;
      const ally = world.entities.find((entity) => entity.team === world.playerTeam);
      if (ally === undefined) throw new Error('missing muted-audio ally');
      world.events.push(
        { type: 'stood_up', tick: world.tick, entityId: ally.id },
        { type: 'pilot_ejected', tick: world.tick, entityId: ally.id },
        { type: 'unit_withdrew', tick: world.tick, entityId: ally.id, team: ally.team },
        { type: 'mission_message', tick: world.tick, text: 'Muted dispatch.' },
      );
      engine.forceStep();
    });
    const mutedAfter = (await audioProbe(page))[0];
    check(
      'mute suppresses every one-shot without rebuilding the graph',
      mutedBefore.master === 0 && mutedAfter.master === 0
        && mutedAfter.sources.length === mutedBefore.sources.length,
    );

    const nativeMix = await renderWorstCaseMix(page);
    check(
      'the worst simultaneous seven-cue mix renders with real headroom and no clipped sample',
      nativeMix.samples === 96_000
        && Number.isFinite(nativeMix.peak)
        && Number.isFinite(nativeMix.rms)
        && nativeMix.rms > 0
        && nativeMix.peak < 0.9
        && nativeMix.clipped === 0,
      JSON.stringify(nativeMix),
    );

    await page.evaluate(() => globalThis.__wreckright.engine.audio.destroy());
    await page.waitForFunction(() => {
      const graph = globalThis.__audioProbe.snapshot()[0];
      return graph.state === 'closed' && graph.closeCalls === 1 && graph.activeSources === 0;
    });
    const closed = (await audioProbe(page))[0];
    check(
      'destroy closes the one context with no active or unstopped source',
      closed.activeSources === 0 && closed.sources.every((source) => source.stops.length === 1),
      JSON.stringify(closed.counts),
    );
    check('last-silent-moments fixture reports no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}
