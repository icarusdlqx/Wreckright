const ABBA_BLOCK_COUNT = 16;
const VALID_FRAME_LIMIT_MS = 1_000;
const TARGET_FRAME_MS = 1_000 / 60;
const LIGHT_NAME_PREFIXES = ['running-light:', 'startup-light:', 'power-seam:'];

function rank(values, quantile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1))] ?? 0;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function summariseNightPerf(samples) {
  const frame = samples.map((sample) => sample.frameMs);
  const other = samples.map((sample) => (
    Math.max(0, sample.frameMs - sample.simMs - sample.drawMs)
  ));
  return {
    count: samples.length,
    frameMedian: median(frame),
    frameP90: rank(frame, 0.9),
    otherMedian: median(other),
    otherP90: rank(other, 0.9),
    drawCalls: [...new Set(samples.map((sample) => sample.drawCalls))],
  };
}

export function summariseNightContrasts(contrasts) {
  return {
    count: contrasts.frame.length,
    frameMedian: median(contrasts.frame),
    frameP90: rank(contrasts.frame, 0.9),
    otherMedian: median(contrasts.other),
    otherP90: rank(contrasts.other, 0.9),
  };
}

export function summariseNightValues(values) {
  return {
    count: values.length,
    median: median(values),
    p90: rank(values, 0.9),
  };
}

export function sameList(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sameSceneResources(left, right) {
  return left.nodeCount === right.nodeCount &&
    left.domNodeCount === right.domNodeCount &&
    left.gpuGeometries === right.gpuGeometries &&
    left.gpuTextures === right.gpuTextures &&
    sameList(left.nodeIds, right.nodeIds) &&
    sameList(left.geometryIds, right.geometryIds) &&
    sameList(left.materialIds, right.materialIds) &&
    sameList(left.textureIds, right.textureIds);
}

export function resourceCounts(resources) {
  return {
    nodes: resources.nodeCount,
    domNodes: resources.domNodeCount,
    geometries: resources.geometryIds.length,
    materials: resources.materialIds.length,
    textures: resources.textureIds.length,
    gpuGeometries: resources.gpuGeometries,
    gpuTextures: resources.gpuTextures,
  };
}

export async function inspectNightScene(page, fixture) {
  return page.evaluate(({ friendlyIds, enemyIds, prefixes }) => {
    const { engine, world } = globalThis.__wreckright;
    const renderer = engine.renderer;
    const nodeIds = [];
    const geometryIds = new Set();
    const materialIds = new Set();
    const textureIds = new Set();
    const pointLights = [];
    const roots = new Map();

    const visibleInScene = (node) => {
      let current = node;
      while (current !== null) {
        if (!current.visible) return false;
        current = current.parent;
      }
      return true;
    };

    renderer.scene.traverse((node) => {
      nodeIds.push(node.uuid);
      if (friendlyIds.includes(node.userData.entityId)) roots.set(node.userData.entityId, node);
      if (node.isPointLight === true) {
        pointLights.push({
          uuid: node.uuid,
          visible: visibleInScene(node),
          castShadow: node.castShadow,
          intensity: node.intensity,
        });
      }
      if (node.geometry?.uuid !== undefined) geometryIds.add(node.geometry.uuid);
      const materials = node.material === undefined
        ? []
        : Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        materialIds.add(material.uuid);
        for (const value of Object.values(material)) {
          if (value?.isTexture === true && value.uuid !== undefined) textureIds.add(value.uuid);
        }
      }
    });

    const runningLights = friendlyIds.map((id) => {
      const root = roots.get(id);
      let visible = 0;
      let total = 0;
      root?.traverse((node) => {
        if (!prefixes.some((prefix) => node.name.startsWith(prefix))) return;
        total += 1;
        if (visibleInScene(node)) visible += 1;
      });
      return { id, total, visible };
    });

    const pickableEnemyIds = [];
    for (const id of enemyIds) {
      const enemy = world.entities.find((entity) => entity.id === id);
      if (enemy === undefined) continue;
      const body = renderer.screenBodyOf(enemy);
      const picked = renderer.entityAtScreen(
        world,
        { x: body.x, y: body.y },
        Math.max(8, body.radius),
        (entity) => entity.id === id,
      );
      if (picked?.id === id) pickableEnemyIds.push(id);
    }

    const gpu = renderer.renderStats;
    return {
      pointLights: pointLights.sort((left, right) => left.uuid.localeCompare(right.uuid)),
      runningLights,
      pickableEnemyIds,
      resources: {
        nodeCount: nodeIds.length,
        domNodeCount: document.querySelectorAll('*').length,
        nodeIds: nodeIds.sort(),
        geometryIds: [...geometryIds].sort(),
        materialIds: [...materialIds].sort(),
        textureIds: [...textureIds].sort(),
        gpuGeometries: gpu.geometries,
        gpuTextures: gpu.textures,
      },
    };
  }, { ...fixture, prefixes: LIGHT_NAME_PREFIXES });
}

export async function measureNightAlphaStrike(page, events) {
  return page.evaluate(async ({ volley, blockCount, targetFrameMs, validLimit }) => {
    const { engine, world } = globalThis.__wreckright;
    const perf = engine.perf;
    const emptySamples = { activation: [], following: [], setup: [] };
    if (perf === null) {
      return {
        error: 'performance overlay unavailable',
        quiet: emptySamples,
        active: emptySamples,
        contrasts: null,
      };
    }
    const renderer = engine.renderer;
    const effects = renderer.effects;
    if (effects === undefined) {
      return {
        error: 'battle effects unavailable',
        quiet: emptySamples,
        active: emptySamples,
        contrasts: null,
      };
    }

    const quiet = { activation: [], following: [], setup: [] };
    const active = { activation: [], following: [], setup: [] };
    const contrasts = {
      activation: { frame: [], other: [] },
      following: { frame: [], other: [] },
    };
    const normalisation = {
      targetFrameMs,
      scales: { activation: [], following: [] },
    };
    let capture = null;
    let measurementError = null;
    const originalRecord = perf.record;
    const hadOwnRecord = Object.prototype.hasOwnProperty.call(perf, 'record');
    const worldBefore = JSON.stringify({ tick: world.tick, entities: world.entities });

    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const nextValidSample = () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        capture = null;
        reject(new Error('frame sampling timed out'));
      }, 5_000);
      capture = {
        resolve: (sample) => {
          clearTimeout(timer);
          resolve(sample);
        },
      };
    });
    const setVolley = (firing) => {
      effects.advance(2);
      if (firing) renderer.consumeEvents(world, volley);
    };
    const sampleState = async (firing) => {
      effects.advance(2);
      const setupStart = performance.now();
      renderer.consumeEvents(world, firing ? volley : []);
      const setupMs = performance.now() - setupStart;
      // frameMs is measured from the preceding rAF start, while drawMs belongs
      // to the current draw. The first sample after this mutation therefore
      // mixes the preceding state with the new one; drain it before labelling
      // two complete intervals that both follow draws of the requested state.
      const transition = await nextValidSample();
      const activationWindow = await nextValidSample();
      const followingWindow = await nextValidSample();
      // PerfSample records the interval ending at this rAF next to the work
      // performed during this rAF. Re-pair each interval with the draw that
      // actually preceded it so frame, draw, other, and draw-call telemetry
      // describe the same rendered state.
      const activation = { ...transition, frameMs: activationWindow.frameMs };
      const following = { ...activationWindow, frameMs: followingWindow.frameMs };
      return { activation, following, setupMs };
    };
    const otherMs = (sample) => Math.max(0, sample.frameMs - sample.simMs - sample.drawMs);

    perf.record = (sample) => {
      originalRecord.call(perf, sample);
      if (capture === null || sample.frameMs <= 0 || sample.frameMs >= validLimit) return;
      const pending = capture;
      capture = null;
      pending.resolve({
        frameMs: sample.frameMs,
        simMs: sample.simMs,
        drawMs: sample.drawMs,
        drawCalls: sample.drawCalls,
      });
    };

    try {
      if (getComputedStyle(document.querySelector('.perf-overlay')).display === 'none') perf.toggle();
      // Prime both cached light-count programs before measuring their contrast.
      setVolley(false);
      await nextFrame();
      await nextFrame();
      setVolley(true);
      await nextFrame();
      await nextFrame();

      for (let block = 0; block < blockCount; block += 1) {
        const pattern = block % 2 === 0
          ? [false, true, true, false]
          : [true, false, false, true];
        const blockSamples = [];
        for (const firing of pattern) {
          const samples = await sampleState(firing);
          blockSamples.push({ firing, samples });
          const destination = firing ? active : quiet;
          destination.activation.push(samples.activation);
          destination.following.push(samples.following);
          destination.setup.push(samples.setupMs);
        }
        for (const phase of ['activation', 'following']) {
          const activeEntries = blockSamples.filter((entry) => entry.firing);
          const quietEntries = blockSamples.filter((entry) => !entry.firing);
          const activeSamples = activeEntries.map((entry) => entry.samples[phase]);
          const quietSamples = quietEntries.map((entry) => entry.samples[phase]);
          const activeFrameMean = (activeSamples[0].frameMs + activeSamples[1].frameMs) / 2;
          const quietFrameMean = (quietSamples[0].frameMs + quietSamples[1].frameMs) / 2;
          const activeOtherMean = (otherMs(activeSamples[0]) + otherMs(activeSamples[1])) / 2;
          const quietOtherMean = (otherMs(quietSamples[0]) + otherMs(quietSamples[1])) / 2;
          const scale = Math.max(1, quietFrameMean / targetFrameMs);
          const setupContrast = phase === 'activation'
            ? (activeEntries[0].samples.setupMs + activeEntries[1].samples.setupMs -
              quietEntries[0].samples.setupMs - quietEntries[1].samples.setupMs) / 2
            : 0;
          // SwiftShader can run far below 60Hz in shared CI. Express the same
          // active-minus-quiet budget at a 60Hz-equivalent rate, without
          // relaxing it on a runner already meeting the target frame time.
          contrasts[phase].frame.push(
            (activeFrameMean - quietFrameMean) / scale + setupContrast,
          );
          contrasts[phase].other.push(
            (activeOtherMean - quietOtherMean) / scale + setupContrast,
          );
          normalisation.scales[phase].push(scale);
        }
      }
    } catch (error) {
      measurementError = error instanceof Error ? error.message : String(error);
    } finally {
      capture = null;
      if (hadOwnRecord) perf.record = originalRecord;
      else delete perf.record;
      effects.advance(2);
      renderer.consumeEvents(world, volley);
    }

    return {
      error: measurementError,
      quiet,
      active,
      contrasts,
      normalisation,
      simUnchanged: worldBefore === JSON.stringify({ tick: world.tick, entities: world.entities }),
    };
  }, {
    volley: events,
    blockCount: ABBA_BLOCK_COUNT,
    targetFrameMs: TARGET_FRAME_MS,
    validLimit: VALID_FRAME_LIMIT_MS,
  });
}

export async function repeatNightVolley(page, events, times) {
  await page.evaluate(({ volley, repeats }) => {
    const { engine, world } = globalThis.__wreckright;
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      engine.renderer.consumeEvents(world, volley.map((event, index) => ({
        ...event,
        tick: world.tick + (repeat + 1) * 1_000 + index,
      })));
    }
  }, { volley: events, repeats: times });
  await page.waitForTimeout(80);
}

export async function lowFxNightVolley(page, events) {
  const result = await page.evaluate((volley) => {
    const { engine, world } = globalThis.__wreckright;
    engine.renderer.setLowFx(true);
    engine.renderer.consumeEvents(world, volley);
    const visiblePointLights = engine.renderer.scene.children.filter((node) => (
      node.isPointLight === true && node.visible
    )).length;
    engine.renderer.setLowFx(false);
    return visiblePointLights;
  }, events);
  await page.waitForTimeout(80);
  return result;
}

export const NIGHT_PERF_BLOCK_COUNT = ABBA_BLOCK_COUNT;
