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
    const capacity = 256;
    const quietValues = new Float64Array(capacity);
    const fireValues = new Float64Array(capacity);
    let phase = 0;
    let quietCount = 0;
    let fireCount = 0;
    const originalRecord = perf.record.bind(perf);
    perf.record = (sample) => {
      const other = Math.max(0, sample.frameMs - sample.simMs - sample.drawMs);
      if (phase === 1 && quietCount < capacity) quietValues[quietCount++] = other;
      if (phase === 2 && fireCount < capacity) fireValues[fireCount++] = other;
      originalRecord(sample);
    };
    const frames = (count, offer = false) => new Promise((resolve) => {
      let seen = 0;
      const next = () => {
        if (offer) {
          event.tick += 1;
          for (let index = 0; index < 8; index += 1) pool.consume(world, events, selection);
        }
        seen += 1;
        if (seen >= count) resolve();
        else requestAnimationFrame(next);
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
    await frames(30);
    phase = 1;
    await frames(92);
    phase = 2;
    await frames(90, true);
    await frames(2);
    phase = 0;
    perf.record = originalRecord;
    const summary = (values, count) => {
      const sample = Array.from(values.slice(0, count)).sort((left, right) => left - right);
      const at = (quantile) =>
        sample[Math.min(sample.length - 1, Math.floor(sample.length * quantile))] ?? 0;
      return { count: sample.length, p95: at(0.95), p99: at(0.99) };
    };
    return {
      quiet: summary(quietValues, quietCount),
      fire: summary(fireValues, fireCount),
      stableNodes:
        root.children.length === identities.length &&
        identities.every((node, index) => root.children[index] === node),
      active: pool.activeCount,
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
    sustained === null
      ? 'sustained incoming fire keeps perf other flat'
      : `sustained incoming fire keeps perf other flat (${sustained.quiet.p95.toFixed(2)} → ${sustained.fire.p95.toFixed(2)}ms p95)`,
    sustained !== null &&
      sustained.quiet.count >= 80 &&
      sustained.fire.count >= 80 &&
      sustained.fire.p95 <= sustained.quiet.p95 + 1,
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
