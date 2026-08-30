import { setTimeout as sleep } from 'node:timers/promises';
import { closeDesktopBattleMenu, clearControlFocus } from './input-safety.mjs';

function closePoint(left, right, tolerance = 0.05) {
  return Math.abs(left.x - right.x) <= tolerance && Math.abs(left.y - right.y) <= tolerance;
}

async function samplePaintBudget(page) {
  await page.evaluate(() => {
    const originalRaf = window.requestAnimationFrame.bind(window);
    const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
    const probe = { calls: 0, frames: [], paints: [] };
    globalThis.__minimapPaintProbe = probe;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (this.canvas instanceof HTMLCanvasElement && this.canvas.dataset.testid === 'minimap') {
        probe.calls += 1;
      }
      return originalDrawImage.apply(this, args);
    };
    window.requestAnimationFrame = (callback) => originalRaf((now) => {
      if (probe.frames.at(-1) !== now) probe.frames.push(now);
      const callsBefore = probe.calls;
      const started = performance.now();
      callback(now);
      const calls = probe.calls - callsBefore;
      if (calls > 0) probe.paints.push({ at: now, calls, duration: performance.now() - started });
    });
    globalThis.__stopMinimapPaintProbe = () => {
      window.requestAnimationFrame = originalRaf;
      CanvasRenderingContext2D.prototype.drawImage = originalDrawImage;
    };
  });
  await page.waitForFunction(
    () => globalThis.__minimapPaintProbe?.paints.length >= 12,
    { timeout: 5_000 },
  );
  return page.evaluate(() => {
    const probe = globalThis.__minimapPaintProbe;
    globalThis.__stopMinimapPaintProbe?.();
    const paints = probe.paints.slice(0, 12);
    const durations = paints.map((paint) => paint.duration).sort((a, b) => a - b);
    const intervals = paints.slice(1).map((paint, index) => paint.at - paints[index].at);
    const elapsed = paints.at(-1).at - paints[0].at;
    const availableFrames = probe.frames.filter(
      (at) => at >= paints[0].at && at <= paints.at(-1).at,
    );
    delete globalThis.__minimapPaintProbe;
    delete globalThis.__stopMinimapPaintProbe;
    return {
      calls: paints.map((paint) => paint.calls),
      intervals,
      hz: ((paints.length - 1) * 1_000) / elapsed,
      availableHz: ((availableFrames.length - 1) * 1_000) / elapsed,
      p95: durations[Math.floor((durations.length - 1) * 0.95)],
    };
  });
}

export async function runMinimapControlChecks({ page, check, shots }) {
  process.stdout.write('\nminimap control\n');
  await closeDesktopBattleMenu(page);
  const minimap = page.locator('[data-testid="minimap"]');
  const initial = await page.evaluate(() => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const paused = useGame.getState().paused;
    if (!paused) engine.togglePause();
    return {
      paused,
      camera: { target: { ...engine.renderer.camera.target }, distance: engine.renderer.camera.distance },
      selection: [...useGame.getState().selection],
      orders: world.entities
        .filter((entity) => entity.team === useGame.getState().playerTeam)
        .map((entity) => ({
          id: entity.id,
          move: entity.orders.move === null ? null : { ...entity.orders.move.to },
          queue: entity.orders.queue.map((order) => ({ ...order.to })),
        })),
    };
  });
  await page.waitForFunction(() => globalThis.__wreckright.useGame.getState().paused);

  check(
    'minimap exposes one keyboard-reachable canvas control',
    (await minimap.count()) === 1 &&
      (await minimap.getAttribute('role')) === 'application' &&
      (await minimap.getAttribute('tabindex')) === '0' &&
      /click or drag/i.test((await minimap.getAttribute('aria-label')) ?? ''),
  );
  await minimap.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  check(
    'minimap accepts keyboard focus with a visible focus treatment',
    await minimap.evaluate((canvas) =>
      document.activeElement === canvas && getComputedStyle(canvas).outlineStyle !== 'none'
    ),
  );

  const box = await minimap.boundingBox();
  if (box === null) throw new Error('minimap has no bounds');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const centred = await page.evaluate(() => ({ ...globalThis.__wreckright.engine.renderer.camera.target }));
  check(
    'clicking the minimap jumps the field camera',
    closePoint(centred, { x: 480, y: 480 }),
    JSON.stringify(centred),
  );

  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 3 });
  const liveDrag = await page.evaluate(() => ({ ...globalThis.__wreckright.engine.renderer.camera.target }));
  check(
    'dragging the minimap pans live before pointer release',
    liveDrag.x > centred.x && liveDrag.y > centred.y,
  );
  check(
    'minimap owns the active drag through pointer capture',
    await minimap.evaluate((canvas) => canvas.hasPointerCapture(1) && canvas.classList.contains('dragging')),
  );
  await page.mouse.move(box.x + box.width + 70, box.y + box.height * 0.7, { steps: 2 });
  const captured = await page.evaluate(() => ({ ...globalThis.__wreckright.engine.renderer.camera.target }));
  await page.mouse.up();
  await page.mouse.move(box.x - 60, box.y - 40);
  await sleep(80);
  const released = await page.evaluate(() => ({ ...globalThis.__wreckright.engine.renderer.camera.target }));
  check(
    'captured drag reaches outside the canvas and ends cleanly',
    captured.x > liveDrag.x && closePoint(captured, released) &&
      !(await minimap.evaluate((canvas) => canvas.classList.contains('dragging'))),
  );

  await minimap.focus();
  await page.evaluate(() => globalThis.__wreckright.engine.renderer.camera.centreOn({ x: 480, y: 480 }));
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.keyboard.down('ArrowRight');
  await sleep(220);
  await page.keyboard.up('ArrowRight');
  const keyed = await page.evaluate(() => ({
    target: { ...globalThis.__wreckright.engine.renderer.camera.target },
    scroll: scrollY,
  }));
  check(
    'a held minimap arrow moves north-up by one two-tile step only',
    closePoint(keyed.target, { x: 528, y: 480 }) && keyed.scroll === scrollBefore,
  );

  const paint = await samplePaintBudget(page);
  check(
    'minimap retains its 10Hz two-blit canvas budget',
    paint.calls.length === 12 &&
      paint.calls.every((calls) => calls === 2) &&
      paint.intervals.every((interval) => interval >= 90) &&
      paint.hz >= Math.min(8, paint.availableHz * 0.8) &&
      paint.hz <= 12 &&
      paint.p95 < 8,
    JSON.stringify(paint),
  );
  check(
    'minimap keeps one stable visible canvas',
    (await page.locator('canvas.minimap').count()) === 1 && (await minimap.isVisible()),
  );

  await page.evaluate(() => {
    const originalArc = CanvasRenderingContext2D.prototype.arc;
    globalThis.__minimapPulseArcs = [];
    CanvasRenderingContext2D.prototype.arc = function (x, y, radius, ...rest) {
      if (this.canvas instanceof HTMLCanvasElement && this.canvas.dataset.testid === 'minimap') {
        globalThis.__minimapPulseArcs.push({ x, y, radius });
      }
      return originalArc.call(this, x, y, radius, ...rest);
    };
    globalThis.__restoreMinimapArc = () => {
      CanvasRenderingContext2D.prototype.arc = originalArc;
    };

    const { engine, world } = globalThis.__wreckright;
    const vision = world.vision;
    const hostile = world.entities.find((entity) => entity.team !== world.playerTeam);
    const south = world.zones.find((zone) => zone.id === 'south_post');
    if (vision === null || hostile === undefined || south === undefined) {
      throw new Error('minimap visual fixture is incomplete');
    }
    let syntheticId = 1_000_000;
    while (world.entities.some((entity) => entity.id === syntheticId) || vision.tracks.has(syntheticId)) {
      syntheticId += 1;
    }
    globalThis.__minimapVisualRestore = {
      target: { ...engine.renderer.camera.target },
      distance: engine.renderer.camera.distance,
      reducedMotion: engine.renderer.camera.reducedMotion,
      southOwner: south.owner,
      tiles: vision.tiles.slice(),
      explored: vision.explored.slice(),
      syntheticId,
      syntheticTrack: {
        team: hostile.team,
        frame: hostile.frame,
        chassisClass: hostile.chassisClass,
      },
    };
    engine.renderer.camera.centreOn({ x: 480, y: 480 });
    engine.renderer.camera.distance = 300;
    engine.renderer.camera.reducedMotion = true;
    south.owner = 0;
    vision.tiles.fill(1);
    vision.explored.fill(1);
  });
  try {
    await sleep(220);
    await page.evaluate(() => {
      const { world } = globalThis.__wreckright;
      const vision = world.vision;
      const restore = globalThis.__minimapVisualRestore;
      if (vision === null || restore === undefined) throw new Error('minimap contact fixture was lost');
      vision.detected.add(restore.syntheticId);
      vision.tracks.set(restore.syntheticId, {
        id: restore.syntheticId,
        ...restore.syntheticTrack,
        pos: { x: 300, y: 300 },
        tick: world.tick,
        source: 'sensor',
      });
    });
    await page.waitForFunction(() =>
      globalThis.__minimapPulseArcs?.some(
        (arc) => Math.abs(arc.x - 50) < 0.1 && Math.abs(arc.y - 50) < 0.1 && arc.radius === 9,
      )
    );
    await minimap.focus();
    await minimap.screenshot({ path: `${shots}/09-minimap-control-close.png` });
    await page.screenshot({ path: `${shots}/09-minimap-control.png` });
    check(
      'new-contact pulse stays on the coarse presented point under reduced motion',
      await page.evaluate(() => globalThis.__minimapPulseArcs.some(
        (arc) => Math.abs(arc.x - 50) < 0.1 && Math.abs(arc.y - 50) < 0.1 && arc.radius === 9,
      )),
    );
  } finally {
    await page.evaluate((restoreCamera) => {
      const { engine, world } = globalThis.__wreckright;
      const vision = world.vision;
      const restore = globalThis.__minimapVisualRestore;
      const south = world.zones.find((zone) => zone.id === 'south_post');
      if (vision !== null && restore !== undefined) {
        vision.tiles.set(restore.tiles);
        vision.explored.set(restore.explored);
        vision.detected.delete(restore.syntheticId);
        vision.tracks.delete(restore.syntheticId);
      }
      if (south !== undefined && restore !== undefined) south.owner = restore.southOwner;
      engine.renderer.camera.reducedMotion = restore?.reducedMotion ?? false;
      engine.renderer.camera.distance = restoreCamera.distance;
      engine.renderer.camera.centreOn(restoreCamera.target);
      globalThis.__restoreMinimapArc?.();
      delete globalThis.__minimapPulseArcs;
      delete globalThis.__restoreMinimapArc;
      delete globalThis.__minimapVisualRestore;
    }, initial.camera);
    // Let the removed synthetic pulse expire before later visual fixtures run.
    await sleep(1_450);
    if (!initial.paused) {
      await page.evaluate(() => globalThis.__wreckright.engine.togglePause());
      await page.waitForFunction(() => !globalThis.__wreckright.useGame.getState().paused);
    }
  }

  const unchanged = await page.evaluate(() => {
    const { useGame, world } = globalThis.__wreckright;
    return {
      selection: [...useGame.getState().selection],
      orders: world.entities
        .filter((entity) => entity.team === useGame.getState().playerTeam)
        .map((entity) => ({
          id: entity.id,
          move: entity.orders.move === null ? null : { ...entity.orders.move.to },
          queue: entity.orders.queue.map((order) => ({ ...order.to })),
        })),
    };
  });
  check(
    'minimap camera controls never alter selection or orders',
    JSON.stringify(unchanged) === JSON.stringify({
      selection: initial.selection,
      orders: initial.orders,
    }),
  );
  await clearControlFocus(page);
}
