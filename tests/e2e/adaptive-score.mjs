const SCORE_SOURCE_COUNT = 4;
const SCORE_RETARGET_INTERVAL_MS = 125;
const SCORE_START_FREQUENCIES = [0.72, 43.65, 65.41, 87.31];

function watchPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function installAudioProbe(page) {
  await page.addInitScript(() => {
    class ProbeParam {
      constructor(context, name) {
        this.context = context;
        this.name = name;
        this.value = 0;
      }
      record(method, value, at = null, timeConstant = null) {
        this.value = value;
        this.context.automation.push({ method, name: this.name, value, at, timeConstant });
      }
      setValueAtTime(value, at) { this.record('set', value, at); }
      linearRampToValueAtTime(value, at) { this.record('linear', value, at); }
      exponentialRampToValueAtTime(value, at) { this.record('exponential', value, at); }
      setTargetAtTime(value, at, timeConstant) {
        this.record('target', value, at, timeConstant);
      }
      cancelScheduledValues(at) {
        this.context.automation.push({ method: 'cancel', name: this.name, at });
      }
    }

    class ProbeNode {
      constructor(context, kind) {
        this.context = context;
        this.kind = kind;
        this.id = context.nodes.length;
        context.nodes.push(this);
      }
      connect(destination) { return destination; }
    }

    class ProbeSource extends ProbeNode {
      constructor(context, kind) {
        super(context, kind);
        this.starts = [];
        this.stops = [];
        this.active = false;
      }
      start(when = 0) {
        this.starts.push(when);
        this.active = true;
      }
      stop(when = 0) {
        this.stops.push(when);
        this.active = false;
      }
    }

    class ProbeOscillator extends ProbeSource {
      constructor(context) {
        super(context, 'oscillator');
        this.type = 'sine';
        this.frequency = new ProbeParam(context, `source-${this.id}-frequency`);
        this.startFrequency = null;
      }
      start(when = 0) {
        this.startFrequency = this.frequency.value;
        super.start(when);
      }
    }

    class ProbeBufferSource extends ProbeSource {
      constructor(context) {
        super(context, 'buffer');
        this.buffer = null;
        this.loop = false;
      }
    }

    class ProbeGain extends ProbeNode {
      constructor(context) {
        super(context, 'gain');
        this.gain = new ProbeParam(context, `gain-${this.id}`);
      }
    }

    class ProbeFilter extends ProbeNode {
      constructor(context) {
        super(context, 'filter');
        this.type = 'lowpass';
        this.frequency = new ProbeParam(context, `filter-${this.id}-frequency`);
        this.Q = new ProbeParam(context, `filter-${this.id}-q`);
      }
    }

    class ProbeCompressor extends ProbeNode {
      constructor(context) {
        super(context, 'compressor');
        this.threshold = new ProbeParam(context, `compressor-${this.id}-threshold`);
        this.ratio = new ProbeParam(context, `compressor-${this.id}-ratio`);
      }
    }

    const contexts = [];
    class ProbeContext {
      constructor() {
        this.openedAt = performance.now();
        this.sampleRate = 8;
        this.nodes = [];
        this.sources = [];
        this.gains = [];
        this.automation = [];
        this.closeCalls = 0;
        this.resumeCalls = 0;
        this.state = 'running';
        this.destination = new ProbeNode(this, 'destination');
        contexts.push(this);
      }
      get currentTime() { return 5 + (performance.now() - this.openedAt) / 1000; }
      createDynamicsCompressor() { return new ProbeCompressor(this); }
      createBuffer(_channels, length) {
        const data = new Float32Array(length);
        return { getChannelData: () => data };
      }
      createBufferSource() {
        const source = new ProbeBufferSource(this);
        this.sources.push(source);
        return source;
      }
      createOscillator() {
        const source = new ProbeOscillator(this);
        this.sources.push(source);
        return source;
      }
      createGain() {
        const gain = new ProbeGain(this);
        this.gains.push(gain);
        return gain;
      }
      createBiquadFilter() { return new ProbeFilter(this); }
      close() {
        this.closeCalls += 1;
        this.state = 'closed';
        return Promise.resolve();
      }
      resume() {
        this.resumeCalls += 1;
        this.state = 'running';
        return Promise.resolve();
      }
    }

    const sourceView = (source) => ({
      id: source.id,
      kind: source.kind,
      active: source.active,
      startFrequency: source.startFrequency ?? null,
      starts: [...source.starts],
      stops: [...source.stops],
    });
    const scoreFrequencies = [0.72, 43.65, 65.41, 87.31];
    const isScoreSource = (source) => source.kind === 'oscillator'
      && scoreFrequencies.some((frequency) => Math.abs(frequency - source.startFrequency) < 0.0001);
    globalThis.__audioProbe = {
      snapshot: () => contexts.map((context) => ({
        state: context.state,
        closeCalls: context.closeCalls,
        nodes: context.nodes.length,
        activeSources: context.sources.filter((source) => source.active).length,
        master: context.gains[0]?.gain.value ?? null,
        targets: context.automation.filter((entry) => entry.method === 'target').length,
        sources: context.sources.map(sourceView),
        scoreSources: context.sources.filter(isScoreSource).map(sourceView),
      })),
    };
    globalThis.AudioContext = ProbeContext;
    globalThis.webkitAudioContext = ProbeContext;
  });
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

const probe = (page) => page.evaluate(() => globalThis.__audioProbe.snapshot());

async function unlock(page) {
  await page.locator('.viewport canvas:not(.perf-overlay)').click({ position: { x: 40, y: 40 } });
}

async function restart(page) {
  const priorContextCount = (await probe(page)).length;
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

export async function runAdaptiveScoreChecks({ browser, url, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = watchPage(page);
  try {
    await installAudioProbe(page);
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('ironline.training', JSON.stringify({ version: 1, step: 0, status: 'skipped' }));
    });
    await page.goto(url);
    await page.waitForSelector('[data-testid="home-screen"]');
    await page.locator('[data-testid="home-skirmish"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().briefingSeen === true);
    await pause(page);
    await unlock(page);
    await page.waitForFunction(() => globalThis.__audioProbe.snapshot().length === 1);

    const initial = (await probe(page))[0];
    check(
      'adaptive score starts one fixed four-source graph',
      initial.scoreSources.length === SCORE_SOURCE_COUNT
        && initial.scoreSources.every((source) => source.kind === 'oscillator'
          && source.starts.length === 1 && source.stops.length === 0 && source.active)
        && JSON.stringify(initial.scoreSources.map((source) => source.startFrequency).sort((a, b) => a - b))
          === JSON.stringify([...SCORE_START_FREQUENCIES].sort((a, b) => a - b)),
      JSON.stringify(initial),
    );

    await page.evaluate(() => {
      const { engine, world } = globalThis.__wreckright;
      world.events.push({
        type: 'support_called', tick: world.tick, team: world.playerTeam ?? 0,
        call: 'sensor_probe', x: 0, y: 0, cost: 0,
      });
      engine.forceStep();
    });
    const moving = (await probe(page))[0];
    check(
      'an engine-routed pressure event retargets the pulse without allocating nodes',
      moving.nodes === initial.nodes && moving.targets > initial.targets,
      JSON.stringify({ before: initial, after: moving }),
    );

    await openMenu(page);
    await page.locator('[data-testid="mute-button"]').click();
    const mutedBefore = (await probe(page))[0];
    await new Promise((resolve) => setTimeout(resolve, SCORE_RETARGET_INTERVAL_MS + 25));
    await page.evaluate(() => {
      const { engine, world } = globalThis.__wreckright;
      const ally = world.entities.find((entity) => entity.team === world.playerTeam);
      const enemy = world.entities.find((entity) => entity.team !== world.playerTeam);
      const weapon = ally?.weapons[0];
      if (ally === undefined || enemy === undefined || weapon === undefined) throw new Error('missing score fixture');
      const event = {
        type: 'weapon_fired', tick: world.tick, shooterId: ally.id,
        targetId: enemy.id, weaponId: weapon.weaponId,
      };
      world.events.push(...Array.from({ length: 8 }, () => ({ ...event })));
      engine.forceStep();
    });
    const mutedAfter = (await probe(page))[0];
    check(
      'mute zeros the master while the score arc keeps tracking',
      mutedBefore.master === 0 && mutedAfter.master === 0
        && mutedAfter.nodes === mutedBefore.nodes && mutedAfter.targets > mutedBefore.targets
        && (await page.locator('[data-testid="mute-button"]').innerText()) === 'Sound off'
        && (await page.evaluate(() => localStorage.getItem('ironline.muted'))) === '1',
      JSON.stringify({ before: mutedBefore, after: mutedAfter }),
    );
    await page.locator('[data-testid="mute-button"]').click();
    check('unmute restores the shared master without restarting sources',
      (await probe(page))[0].master === 0.5 && (await probe(page))[0].sources.length === mutedAfter.sources.length);

    const pausedTick = await page.evaluate(() => globalThis.__wreckright.world.tick);
    const pausedGraph = (await probe(page))[0];
    await new Promise((resolve) => setTimeout(resolve, 250));
    const heldGraph = (await probe(page))[0];
    check(
      'pause holds simulation intensity and the same score sources',
      (await page.evaluate(() => globalThis.__wreckright.world.tick)) === pausedTick
        && heldGraph.targets === pausedGraph.targets
        && JSON.stringify(heldGraph.scoreSources) === JSON.stringify(pausedGraph.scoreSources),
    );
    await page.locator('[data-testid="pause-button"]').click();
    await page.waitForFunction((tick) => globalThis.__wreckright.world.tick > tick, pausedTick);
    await pause(page);
    check('resume keeps the score graph instead of rebuilding it',
      JSON.stringify((await probe(page))[0].scoreSources.map((source) => source.id))
        === JSON.stringify(pausedGraph.scoreSources.map((source) => source.id)));

    for (let battle = 1; battle < 10; battle += 1) {
      await restart(page);
      await pause(page);
      await unlock(page);
      await page.waitForFunction((count) => globalThis.__audioProbe.snapshot().length === count, battle + 1);
      const contexts = await probe(page);
      check(`adaptive score battle ${battle} closes the prior context`,
        contexts[battle - 1].state === 'closed' && contexts[battle - 1].closeCalls === 1);
    }
    await restart(page);
    const lifetime = await probe(page);
    const scoreSources = lifetime.flatMap((entry) => entry.scoreSources);
    const openContexts = lifetime.filter((entry) => entry.state !== 'closed').length;
    const activeSources = lifetime.reduce((sum, entry) => sum + entry.activeSources, 0);
    check(
      'ten consecutive battles leave zero open contexts or active sources',
      lifetime.length === 10
        && openContexts === 0 && activeSources === 0
        && lifetime.every((entry) => entry.closeCalls === 1)
        && scoreSources.length === 10 * SCORE_SOURCE_COUNT
        && scoreSources.every((source) => source.starts.length === 1 && source.stops.length === 1
          && Number.isFinite(source.stops[0]) && !source.active)
        && lifetime.every((entry) => entry.sources.every((source) => source.stops.length === 1)),
      JSON.stringify({ contexts: lifetime.length, scoreSources: scoreSources.length,
        nodesCreated: lifetime.reduce((sum, entry) => sum + entry.nodes, 0),
        openContexts, activeSources }),
    );
    check('adaptive score fixture reports no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}
