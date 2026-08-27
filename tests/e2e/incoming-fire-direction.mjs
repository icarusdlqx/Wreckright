export async function checkIncomingFireDirection({ page, check, shots }) {
  const prepared = await page.evaluate(() => {
    const { engine, world, useGame } = globalThis.__wreckright;
    const targetId = useGame.getState().selection[0];
    const target = world.entities.find((entity) => entity.id === targetId);
    if (target === undefined || world.vision === null) return null;
    const shooter = world.entities
      .filter((entity) => entity.team !== target.team && !entity.destroyed)
      .sort(
        (a, b) =>
          Math.hypot(b.pos.x - target.pos.x, b.pos.y - target.pos.y) -
          Math.hypot(a.pos.x - target.pos.x, a.pos.y - target.pos.y),
      )[0];
    const pool = engine.presentation.incomingFire;
    const root = document.querySelector('.incoming-fire-directions');
    if (shooter === undefined || pool === null || root === null) return null;
    const camera = engine.renderer.camera;
    const saved = {
      target: { ...camera.target },
      distance: camera.distance,
      shooterWasVisible: world.vision.visible.has(shooter.id),
      shooterId: shooter.id,
    };
    camera.centreOn(target.pos);
    camera.distance = camera.minDistance;
    camera.update(engine.renderer.viewport);
    world.vision.visible.add(shooter.id);
    const body = engine.renderer.screenBodyOf(shooter);
    const viewport = engine.renderer.viewport;
    const offScreen =
      body.x + body.radius < 0 || body.x - body.radius > viewport.width ||
      body.y + body.radius < 0 || body.y - body.radius > viewport.height;
    const event = {
      type: 'projectile_hit', tick: world.tick, shooterId: shooter.id,
      targetId: target.id, weaponId: 'ac5', location: 'centre_torso', damage: 8, arc: 'front',
    };
    pool.consume(world, [event], useGame.getState().selection);
    return {
      saved,
      offScreen,
      body,
      viewport,
      poolNodes: pool.nodeCount,
      domSlots: root.children.length,
      active: pool.activeCount,
      visible: Array.from(root.children).some((node) => !node.hidden),
    };
  });

  check(
    'an off-screen visible shooter raises one directional edge tick',
    prepared?.offScreen === true && prepared.active === 1 && prepared.visible === true,
    JSON.stringify(prepared),
  );

  const sustained = await page.evaluate(async (shooterId) => {
    const { engine, world, useGame } = globalThis.__wreckright;
    const targetId = useGame.getState().selection[0];
    const target = world.entities.find((entity) => entity.id === targetId);
    const shooter = world.entities.find((entity) => entity.id === shooterId);
    const pool = engine.presentation.incomingFire;
    const root = document.querySelector('.incoming-fire-directions');
    if (target === undefined || shooter === undefined || pool === null || root === null) return null;
    const identities = Array.from(root.children);
    const event = {
      type: 'projectile_hit', tick: world.tick, shooterId: shooter.id,
      targetId: target.id, weaponId: 'ac5', location: 'centre_torso', damage: 8, arc: 'front',
    };
    const events = [event];
    const selection = useGame.getState().selection;
    const perf = engine.perf;
    if (perf === null) return null;
    const cpuSampleCount = 96;
    const rawBlockCount = 48;
    const rawSampleCount = rawBlockCount * 4;
    const maxAttemptsPerSample = 96;
    const emptyEvents = [];
    const cpuDeltas = new Float64Array(cpuSampleCount);
    const rawValues = new Float64Array(rawSampleCount);
    const rawCaptured = new Uint8Array(rawSampleCount);
    let capture = -1;
    let measurementError = null;
    const hadOwnRecord = Object.prototype.hasOwnProperty.call(perf, 'record');
    const originalRecord = perf.record;
    const renderer = engine.renderer;
    const camera = renderer.camera;
    const hadOwnBodyOf = Object.prototype.hasOwnProperty.call(renderer, 'screenBodyOf');
    const hadOwnDirectionOf = Object.prototype.hasOwnProperty.call(camera, 'screenDirection');
    const originalBodyOf = renderer.screenBodyOf;
    const originalDirectionOf = camera.screenDirection;
    let bodyCalls = 0;
    let directionCalls = 0;
    const offer = () => {
      event.tick += 1;
      for (let index = 0; index < 8; index += 1) pool.consume(world, events, selection);
    };
    const idle = () => {
      for (let index = 0; index < 8; index += 1) pool.consume(world, emptyEvents, selection);
    };
    const timed = (fire) => {
      const started = performance.now();
      if (fire) offer();
      else idle();
      return performance.now() - started;
    };
    const cool = async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (pool.activeCount !== 0) throw new Error('incoming-fire cue did not expire');
    };
    const fireAt = (sampleIndex) => {
      const position = sampleIndex % 4;
      return Math.floor(sampleIndex / 4) % 2 === 0
        ? position === 1 || position === 2
        : position === 0 || position === 3;
    };
    const runRawSamples = () => new Promise((resolve, reject) => {
      let sampleIndex = 0;
      let attempts = 0;
      const next = () => {
        try {
          if (rawCaptured[sampleIndex] === 1) {
            sampleIndex += 1;
            attempts = 0;
          }
          if (sampleIndex >= rawSampleCount) {
            capture = -1;
            resolve();
            return;
          }
          if (attempts >= maxAttemptsPerSample) {
            capture = -1;
            reject(new Error(`sample ${sampleIndex + 1} exceeded the frame-attempt budget`));
            return;
          }
          if (fireAt(sampleIndex)) offer();
          else idle();
          // The engine records before this test callback. Label the next
          // sample so each offered volley is charged to the right window.
          capture = sampleIndex;
          attempts += 1;
          requestAnimationFrame(next);
        } catch (error) {
          capture = -1;
          reject(error);
        }
      };
      requestAnimationFrame(next);
    });
    perf.spike = null;
    perf.spikeCount = 0;
    perf.lateCount = 0;
    perf.clock = 0;
    perf.history.length = 0;
    perf.textTimer = 0;
    engine.perf.toggle();
    perf.record = (sample) => {
      const sampleIndex = capture;
      if (sampleIndex >= 0 && rawCaptured[sampleIndex] === 0 && sample.frameMs < 1_000) {
        rawValues[sampleIndex] = Math.max(0, sample.frameMs - sample.simMs - sample.drawMs);
        rawCaptured[sampleIndex] = 1;
      }
      originalRecord.call(perf, sample);
    };
    try {
      renderer.screenBodyOf = function countedBodyOf(entity) {
        bodyCalls += 1;
        return originalBodyOf.call(this, entity);
      };
      camera.screenDirection = function countedDirectionOf(point, viewport, out) {
        directionCalls += 1;
        return originalDirectionOf.call(this, point, viewport, out);
      };
      try {
        offer();
      } finally {
        if (hadOwnBodyOf) renderer.screenBodyOf = originalBodyOf;
        else delete renderer.screenBodyOf;
        if (hadOwnDirectionOf) camera.screenDirection = originalDirectionOf;
        else delete camera.screenDirection;
      }
      for (let index = 0; index < 8; index += 1) {
        if (index % 2 === 0) {
          idle();
          offer();
        } else {
          offer();
          idle();
        }
      }
      for (let index = 0; index < cpuSampleCount; index += 1) {
        let quiet;
        let fire;
        if (index % 2 === 0) {
          quiet = timed(false);
          fire = timed(true);
        } else {
          fire = timed(true);
          quiet = timed(false);
        }
        cpuDeltas[index] = fire - quiet;
      }
      await cool();
      perf.spike = null;
      perf.spikeCount = 0;
      perf.lateCount = 0;
      perf.clock = 0;
      perf.history.length = 0;
      perf.textTimer = 0;
      offer();
      await runRawSamples();
    } catch (error) {
      measurementError = error instanceof Error ? error.message : String(error);
    } finally {
      capture = -1;
      if (hadOwnRecord) perf.record = originalRecord;
      else delete perf.record;
    }
    const nearestRank = (sample, quantile) =>
      sample[Math.min(sample.length - 1, Math.max(0, Math.ceil(sample.length * quantile) - 1))] ?? 0;
    const sortedCpuDeltas = Array.from(cpuDeltas).sort((left, right) => left - right);
    const rawContrasts = new Float64Array(rawBlockCount);
    for (let block = 0; block < rawBlockCount; block += 1) {
      const base = block * 4;
      const first = rawValues[base] ?? 0;
      const second = rawValues[base + 1] ?? 0;
      const third = rawValues[base + 2] ?? 0;
      const fourth = rawValues[base + 3] ?? 0;
      rawContrasts[block] = block % 2 === 0
        ? (second + third - first - fourth) / 2
        : (first + fourth - second - third) / 2;
    }
    const sortedRawContrasts = Array.from(rawContrasts).sort((left, right) => left - right);
    const middle = rawBlockCount / 2;
    const rawMedian = ((sortedRawContrasts[middle - 1] ?? Number.POSITIVE_INFINITY) +
      (sortedRawContrasts[middle] ?? Number.POSITIVE_INFINITY)) / 2;
    offer();
    const active = pool.activeCount;
    await new Promise((resolve) => setTimeout(resolve, 120));
    return {
      error: measurementError,
      cpu: {
        count: sortedCpuDeltas.length,
        p95: nearestRank(sortedCpuDeltas, 0.95),
      },
      frame: {
        count: sortedRawContrasts.length,
        median: rawMedian,
        p90: nearestRank(sortedRawContrasts, 0.9),
        p95: nearestRank(sortedRawContrasts, 0.95),
      },
      coalescing: { bodyCalls, directionCalls },
      complete: rawCaptured.every((captured) => captured === 1),
      stableNodes:
        root.children.length === identities.length &&
        identities.every((node, index) => root.children[index] === node),
      active,
      poolNodes: pool.nodeCount,
      domSlots: root.children.length,
    };
  }, prepared?.saved.shooterId ?? null);

  check(
    'sustained incoming fire keeps the fixed six-slot DOM pool',
    sustained?.stableNodes === true && sustained.poolNodes === 7 && sustained.domSlots === 6,
    JSON.stringify(sustained),
  );
  check(
    'same-tick volleys project one incoming-fire cue',
    sustained?.coalescing.bodyCalls === 1 && sustained.coalescing.directionCalls === 1,
    JSON.stringify(sustained),
  );
  check(
    sustained === null
      ? 'sustained incoming fire stays inside its CPU budget'
      : `sustained incoming fire stays inside its CPU budget (p95 ${sustained.cpu.p95.toFixed(2)}ms; frame-other ABBA median ${sustained.frame.median.toFixed(2)}ms telemetry)`,
    sustained !== null &&
      sustained.error === null &&
      sustained.complete === true &&
      sustained.cpu.p95 <= 1,
    JSON.stringify(sustained),
  );
  await page.screenshot({ path: `${shots}/03-incoming-fire.png` });

  await page.evaluate(async (saved) => {
    if (saved === null) return;
    const { engine, world } = globalThis.__wreckright;
    if (!saved.shooterWasVisible) world.vision?.visible.delete(saved.shooterId);
    engine.renderer.camera.distance = saved.distance;
    engine.renderer.camera.centreOn(saved.target);
    engine.renderer.camera.update(engine.renderer.viewport);
    engine.perf.toggle();
    await new Promise((resolve) => setTimeout(resolve, 900));
    void engine.presentation.incomingFire.activeCount;
  }, prepared?.saved ?? null);
}
