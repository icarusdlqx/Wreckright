/**
 * Repeatable render and lifecycle check for a real deployed skirmish.
 *
 * Run against Vite so the development-only __wreckright handle is available:
 *   npm run dev -- --host 127.0.0.1 --port 5199
 *   npm run perf:probe
 *
 * Useful overrides: BASE_URL, PERF_MISSION, PERF_RUNS, PERF_SAMPLE_MS,
 * PERF_EXTENDED_SECONDS, PERF_REDEPLOYS and PERF_REPORT_DIR.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, platform, release, totalmem, arch } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { lifecycleResult, performanceMarkdown, performanceSummary, round } from './perf-report.mjs';

const missionId = process.env.PERF_MISSION ?? process.argv[2] ?? 'skirmish_foundry_district';
const battleCode = process.env.PERF_BATTLE_CODE ?? 'performance-foundry-0001';
const baseUrl = new URL(process.env.BASE_URL ?? process.argv[3] ?? 'http://127.0.0.1:5199/');
const runs = positiveInteger('PERF_RUNS', 3);
const sampleMs = positiveInteger('PERF_SAMPLE_MS', 3_000);
const extendedSeconds = positiveInteger('PERF_EXTENDED_SECONDS', 90);
const redeploys = positiveInteger('PERF_REDEPLOYS', 4);
const reportDir = resolve(process.env.PERF_REPORT_DIR ?? 'reports/performance');
const executablePath = process.env.CHROMIUM_PATH ?? process.env.PLAYWRIGHT_CHROMIUM;
if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('BASE_URL must be an HTTP URL');

function positiveInteger(name, fallback) {
  const parsed = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

const browser = await chromium.launch({
  headless: true,
  ...(executablePath === undefined ? {} : { executablePath }),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});
await mkdir(reportDir, { recursive: true });

const errors = [];
const repeatRuns = [];
let environment = null;
let stress;
let lifecycle;

function watchPage(page, label) {
  page.on('pageerror', (error) => errors.push(`${label} pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`);
  });
}

async function preparePage(label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(40_000);
  watchPage(page, label);
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ironline.training', JSON.stringify({ version: 1, step: 0, status: 'skipped' }));
    localStorage.setItem('ironline.muted', '1');
    const NativeAudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    globalThis.__perfAudio = { created: 0, closed: 0, contexts: [] };
    const listenerIds = new WeakMap();
    const targetIds = new WeakMap();
    const activeListeners = new Set();
    let nextListenerId = 1;
    let nextTargetId = 1;
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const trackedTarget = (target) => target === globalThis || target === document
      || target instanceof HTMLCanvasElement;
    const listenerKey = (target, type, listener, options) => {
      if ((typeof listener !== 'function' && typeof listener !== 'object') || listener === null) return null;
      if (!targetIds.has(target)) targetIds.set(target, nextTargetId++);
      if (!listenerIds.has(listener)) listenerIds.set(listener, nextListenerId++);
      const capture = typeof options === 'boolean' ? options : options?.capture === true;
      const kind = target === globalThis ? 'window' : target === document ? 'document' : 'canvas';
      return `${kind}:${targetIds.get(target)}:${type}:${listenerIds.get(listener)}:${capture ? 1 : 0}`;
    };
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (trackedTarget(this)) {
        const key = listenerKey(this, type, listener, options);
        if (key !== null) activeListeners.add(key);
      }
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      if (trackedTarget(this)) {
        const key = listenerKey(this, type, listener, options);
        if (key !== null) activeListeners.delete(key);
      }
      return originalRemove.call(this, type, listener, options);
    };
    globalThis.__perfListeners = {
      snapshot: () => {
        const byTarget = { window: 0, document: 0, canvas: 0 };
        for (const key of activeListeners) byTarget[key.slice(0, key.indexOf(':'))] += 1;
        return { active: activeListeners.size, byTarget };
      },
    };
    if (NativeAudioContext !== undefined) {
      const TrackedAudioContext = class extends NativeAudioContext {
        constructor(...args) {
          super(...args);
          globalThis.__perfAudio.created += 1;
          globalThis.__perfAudio.contexts.push(new WeakRef(this));
        }
        close() {
          globalThis.__perfAudio.closed += 1;
          return super.close();
        }
      };
      globalThis.AudioContext = TrackedAudioContext;
      if (globalThis.webkitAudioContext !== undefined) globalThis.webkitAudioContext = TrackedAudioContext;
    }
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  return { context, page, cdp };
}

async function deploy(page) {
  await page.goto(baseUrl.href, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('home-screen').waitFor();
  await page.getByTestId('home-skirmish').click();
  await page.getByTestId('briefing').waitFor();
  await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().ready === true);
  const optionExists = await page.getByTestId('briefing-mission-picker').locator(`option[value="${missionId}"]`).count();
  if (optionExists !== 1) throw new Error(`Mission ${missionId} is not selectable from Skirmish`);
  if (await page.getByTestId('briefing-mission-picker').inputValue() !== missionId) {
    await page.getByTestId('briefing-mission-picker').selectOption(missionId);
  }
  await page.waitForFunction((id) => globalThis.__wreckright?.world.mission.id === id
    && globalThis.__wreckright.useGame.getState().ready === true, missionId);
  await page.getByTestId('briefing-battle-code').fill(battleCode);
  await page.getByTestId('briefing-battle-code').press('Tab');
  if (!await page.getByTestId('briefing-deploy').isEnabled()) {
    throw new Error(`Deploy is disabled: ${await page.getByTestId('briefing').innerText()}`);
  }
  await page.getByTestId('briefing-deploy').click();
  await page.waitForFunction((id) => globalThis.__wreckright?.world.mission.id === id
    && globalThis.__wreckright.useGame.getState().briefingSeen === true, missionId);
  await page.locator('.viewport canvas:not(.perf-overlay)').waitFor();
  await page.waitForTimeout(250);
}

async function stageCrowdedCombat(page) {
  return page.evaluate(() => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const team = world.playerTeam ?? 0;
    const friendlies = world.entities.filter((entity) => entity.team === team && !entity.destroyed);
    const enemies = world.entities.filter((entity) => entity.team !== team && !entity.destroyed);
    if (friendlies.length < 3 || enemies.length < 3) {
      throw new Error(`Crowded fixture requires at least 3v3, found ${friendlies.length}v${enemies.length}`);
    }
    const centre = { x: world.terrain.width * world.terrain.tileSize * .5,
      y: world.terrain.height * world.terrain.tileSize * .5 };
    friendlies.forEach((entity, index) => {
      entity.pos = { x: centre.x - 55, y: centre.y + (index - (friendlies.length - 1) / 2) * 30 };
      entity.facing = 0;
      entity.path.length = 0;
    });
    enemies.forEach((entity, index) => {
      entity.pos = { x: centre.x + 55, y: centre.y + (index - (enemies.length - 1) / 2) * 30 };
      entity.facing = Math.PI;
      entity.path.length = 0;
    });
    if (world.vision !== null) {
      world.vision.tiles.fill(1);
      world.vision.explored.fill(1);
      for (const enemy of enemies) world.vision.visible.add(enemy.id);
      engine.renderer.fog.update(world.terrain, world.vision);
    }
    useGame.getState().setSelection(friendlies.map((entity) => entity.id));
    engine.orderAttack(enemies[0].id, null);
    engine.renderer.snapshot(world);
    engine.renderer.camera.skipDropIn();
    engine.renderer.camera.centreOn(centre);
    engine.setSpeed(4);
    return { friendlies: friendlies.length, enemies: enemies.length, entities: world.entities.length };
  });
}

async function sampleFrames(page, milliseconds) {
  return page.evaluate((duration) => new Promise((resolveSample) => {
    const { engine, world } = globalThis.__wreckright;
    const started = performance.now();
    let previous = started;
    let frames = 0;
    const frameTimes = [];
    let peakCalls = 0;
    let peakTriangles = 0;
    const tick = (now) => {
      frames += 1;
      frameTimes.push(now - previous);
      previous = now;
      const stats = engine.renderer.renderStats;
      peakCalls = Math.max(peakCalls, stats.calls);
      peakTriangles = Math.max(peakTriangles, stats.triangles);
      if (now - started < duration) requestAnimationFrame(tick);
      else {
        frameTimes.sort((left, right) => left - right);
        const percentile = (fraction) => frameTimes[Math.min(frameTimes.length - 1,
          Math.floor(frameTimes.length * fraction))] ?? 0;
        resolveSample({
          fps: Math.round((frames / (now - started)) * 1000),
          p95FrameMs: Math.round(percentile(.95) * 10) / 10,
          peakDrawCalls: peakCalls,
          peakTriangles,
          ticksAdvanced: world.tick,
          finished: world.finished,
        });
      }
    };
    requestAnimationFrame(tick);
  }), milliseconds);
}

async function rendererSnapshot(page, cdp, label) {
  await cdp.send('HeapProfiler.collectGarbage');
  await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
  const client = await cdp.send('Performance.getMetrics');
  const metrics = Object.fromEntries(client.metrics.map(({ name, value }) => [name, value]));
  return page.evaluate(({ label, processMetrics }) => {
    const { engine, world } = globalThis.__wreckright;
    const geometries = new Set();
    const materials = new Set();
    const textures = new Set();
    let sceneObjects = 0;
    engine.renderer.scene.traverse((node) => {
      sceneObjects += 1;
      if (node.geometry !== undefined) geometries.add(node.geometry);
      const owned = node.material === undefined ? [] : Array.isArray(node.material) ? node.material : [node.material];
      for (const material of owned) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value?.isTexture === true) textures.add(value);
        }
      }
    });
    const contexts = globalThis.__perfAudio.contexts.map((reference) => reference.deref())
      .filter((context) => context !== undefined);
    const stats = engine.renderer.renderStats;
    const trackedListeners = globalThis.__perfListeners.snapshot();
    return {
      label,
      mission: world.mission.id,
      entities: world.entities.length,
      sceneObjects,
      sceneGeometries: geometries.size,
      sceneMaterials: materials.size,
      sceneTextures: textures.size,
      gpuGeometries: stats.geometries,
      gpuTextures: stats.textures,
      programs: engine.renderer.renderer.info.programs?.length ?? 0,
      jsHeapMb: Math.round((processMetrics.JSHeapUsedSize ?? 0) / 104857.6) / 10,
      domNodes: processMetrics.Nodes ?? 0,
      browserEventListeners: processMetrics.JSEventListeners ?? 0,
      trackedEventListeners: trackedListeners.active,
      trackedListenersByTarget: trackedListeners.byTarget,
      documents: processMetrics.Documents ?? 0,
      audioCreated: globalThis.__perfAudio.created,
      audioClosed: globalThis.__perfAudio.closed,
      audioLive: contexts.filter((context) => context.state !== 'closed').length,
    };
  }, { label, processMetrics: metrics });
}

async function advanceSimulation(page, seconds) {
  const steps = seconds * 20;
  return page.evaluate(async (count) => {
    const { engine, world } = globalThis.__wreckright;
    const startedTick = world.tick;
    engine.setPaused(true);
    for (let advanced = 0; advanced < count && !world.finished; advanced += 10) {
      for (let offset = 0; offset < Math.min(10, count - advanced) && !world.finished; offset += 1) engine.forceStep();
      await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    }
    engine.renderer.snapshot(world);
    return { secondsRequested: count / 20, secondsAdvanced: (world.tick - startedTick) * world.dt,
      finished: world.finished };
  }, steps);
}

async function restart(page) {
  const previousId = await page.evaluate(() => {
    globalThis.__perfPreviousEngine = globalThis.__wreckright.engine;
    return globalThis.__wreckright.world.mission.id;
  });
  const sheet = page.getByTestId('desktop-menu-sheet');
  if (!await sheet.isVisible()) await page.getByTestId('desktop-menu-toggle').click();
  await page.getByTestId('restart-battle').click();
  await page.waitForFunction((id) => globalThis.__wreckright !== undefined
    && globalThis.__wreckright.engine !== globalThis.__perfPreviousEngine
    && globalThis.__wreckright.world.mission.id === id
    && globalThis.__wreckright.useGame.getState().briefingSeen === true, previousId);
  await page.evaluate(() => { delete globalThis.__perfPreviousEngine; });
  await page.waitForTimeout(1_100);
}

async function readEnvironment(page) {
  const browserEnvironment = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      userAgent: navigator.userAgent,
      viewport: `${innerWidth}x${innerHeight}`,
      devicePixelRatio,
      webglVersion: gl?.getParameter(gl.VERSION) ?? 'unavailable',
      webglVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl?.getParameter(gl.VENDOR) ?? 'unavailable',
      webglRenderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER) ?? 'unavailable',
    };
  });
  return {
    measuredAt: new Date().toISOString(),
    browser: browser.version(),
    host: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown',
      logicalCpus: cpus().length, memoryGb: round(totalmem() / 1073741824) },
    ...browserEnvironment,
  };
}

try {
  for (let run = 1; run <= runs; run += 1) {
    const target = await preparePage(`repeat ${run}`);
    try {
      await deploy(target.page);
      const fixture = await stageCrowdedCombat(target.page);
      await advanceSimulation(target.page, 2);
      if (environment === null) environment = await readEnvironment(target.page);
      repeatRuns.push({ run, fixture, ...(await sampleFrames(target.page, sampleMs)),
        resources: await rendererSnapshot(target.page, target.cdp, `repeat-${run}`) });
    } finally { await target.context.close(); }
  }

  const target = await preparePage('stress');
  try {
    await deploy(target.page);
    const fixture = await stageCrowdedCombat(target.page);
    const liveCombat = await sampleFrames(target.page, sampleMs);
    const beforeExtended = await rendererSnapshot(target.page, target.cdp, 'before-extended');
    const simulation = await advanceSimulation(target.page, extendedSeconds);
    const afterExtended = await rendererSnapshot(target.page, target.cdp, 'after-extended');
    await target.page.screenshot({ path: resolve(reportDir, 'crowded-combat.png') });
    stress = { fixture, liveCombat, simulation, beforeExtended, afterExtended };

    const cycles = [afterExtended];
    for (let cycle = 1; cycle <= redeploys; cycle += 1) {
      await restart(target.page);
      await stageCrowdedCombat(target.page);
      await sampleFrames(target.page, Math.min(1_000, sampleMs));
      cycles.push(await rendererSnapshot(target.page, target.cdp, `redeploy-${cycle}`));
    }
    lifecycle = lifecycleResult(cycles);
  } finally { await target.context.close(); }
} finally {
  await browser.close();
}

const settings = { runs, sampleMs, extendedSeconds, redeploys };
const summary = performanceSummary({ mission: missionId, settings, runs: repeatRuns, errors, lifecycle });
const report = { summary, environment, repeatRuns, stress, lifecycle };
await writeFile(resolve(reportDir, 'performance.json'), `${JSON.stringify(report, null, 2)}\n`);
const markdown = performanceMarkdown({ summary, repeatRuns, stress, lifecycle, environment });
await writeFile(resolve(reportDir, 'README.md'), markdown);

console.log(markdown.trim());
if (!summary.passed) {
  if (errors.length > 0) console.error(errors.slice(0, 6).join('\n'));
  process.exitCode = 1;
}
