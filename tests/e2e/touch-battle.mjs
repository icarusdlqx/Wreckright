function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function orderSnapshot(page) {
  return page.evaluate(() => {
    const { useGame, world } = globalThis.__wreckright;
    const state = useGame.getState();
    return {
      selection: [...state.selection],
      orders: world.entities
        .filter((entity) => entity.team === state.playerTeam)
        .map((entity) => ({
          id: entity.id,
          move: entity.orders.move,
          attack: entity.orders.attack,
        })),
    };
  });
}

async function cameraSnapshot(page) {
  return page.evaluate(() => {
    const camera = globalThis.__wreckright.engine.renderer.camera;
    return { target: { ...camera.target }, distance: camera.distance };
  });
}

async function fieldGesturePoints(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.viewport canvas:not(.perf-overlay)');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('battle canvas missing');
    const bounds = canvas.getBoundingClientRect();
    const top = document.querySelector('[data-testid="topbar"]')?.getBoundingClientRect().bottom;
    const bottom = document.querySelector('[data-testid="mobile-dock"]')?.getBoundingClientRect().top;
    const fieldTop = Math.max(bounds.top, top ?? bounds.top);
    const fieldBottom = Math.min(bounds.bottom, bottom ?? bounds.bottom);
    const y = fieldTop + (fieldBottom - fieldTop) * 0.52;
    return {
      panFrom: { x: bounds.left + bounds.width * 0.62, y },
      panTo: { x: bounds.left + bounds.width * 0.42, y: y + 24 },
      pinchFrom: [
        { x: bounds.left + bounds.width * 0.42, y },
        { x: bounds.left + bounds.width * 0.62, y },
      ],
      pinchTo: [
        { x: bounds.left + bounds.width * 0.34, y: y - 8 },
        { x: bounds.left + bounds.width * 0.70, y: y + 8 },
      ],
    };
  });
}

async function dispatchTouch(page, frames) {
  const session = await page.context().newCDPSession(page);
  try {
    for (const frame of frames) {
      await session.send('Input.dispatchTouchEvent', frame);
    }
  } finally {
    await session.detach();
  }
}

function touchPoint(point, id) {
  return { ...point, id, radiusX: 2, radiusY: 2, force: 1 };
}

async function panField(page) {
  const points = await fieldGesturePoints(page);
  await dispatchTouch(page, [
    { type: 'touchStart', touchPoints: [touchPoint(points.panFrom, 1)] },
    { type: 'touchMove', touchPoints: [touchPoint(points.panTo, 1)] },
    { type: 'touchEnd', touchPoints: [] },
  ]);
}

async function pinchField(page) {
  const points = await fieldGesturePoints(page);
  await dispatchTouch(page, [
    {
      type: 'touchStart',
      touchPoints: points.pinchFrom.map((point, index) => touchPoint(point, index + 1)),
    },
    {
      type: 'touchMove',
      touchPoints: points.pinchTo.map((point, index) => touchPoint(point, index + 1)),
    },
    { type: 'touchEnd', touchPoints: [] },
  ]);
}

async function cancelTouch(page) {
  const points = await fieldGesturePoints(page);
  await dispatchTouch(page, [
    { type: 'touchStart', touchPoints: [touchPoint(points.panFrom, 1)] },
    { type: 'touchCancel', touchPoints: [] },
  ]);
}

async function minimapGesturePoints(page) {
  return page.locator('[data-testid="minimap"]').evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect();
    const point = (x, y) => ({
      x: bounds.left + bounds.width * x,
      y: bounds.top + bounds.height * y,
    });
    return {
      dragFrom: point(0.25, 0.25),
      dragTo: point(0.7, 0.6),
      cancelFrom: point(0.35, 0.7),
      recovery: point(0.75, 0.3),
    };
  });
}

async function dragMinimapLive(page) {
  const points = await minimapGesturePoints(page);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint(points.dragFrom, 7)],
    });
    const pressed = await cameraSnapshot(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [touchPoint(points.dragTo, 7)],
    });
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="minimap"]')?.classList.contains('dragging')
    );
    const live = await cameraSnapshot(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() =>
      !document.querySelector('[data-testid="minimap"]')?.classList.contains('dragging')
    );
    return { pressed, live, ended: await cameraSnapshot(page) };
  } finally {
    await session.detach();
  }
}

async function cancelMinimapTouch(page) {
  const points = await minimapGesturePoints(page);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [touchPoint(points.cancelFrom, 8)],
    });
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="minimap"]')?.classList.contains('dragging')
    );
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.waitForFunction(() =>
      !document.querySelector('[data-testid="minimap"]')?.classList.contains('dragging')
    );
  } finally {
    await session.detach();
  }

  const cancelled = await cameraSnapshot(page);
  await page.touchscreen.tap(points.recovery.x, points.recovery.y);
  return {
    cancelled,
    recovered: await cameraSnapshot(page),
    dragging: await page.locator('[data-testid="minimap"]').evaluate((canvas) =>
      canvas.classList.contains('dragging')
    ),
  };
}

async function tapMinimapAt(page, point) {
  const box = await page.locator('[data-testid="minimap"]').boundingBox();
  const size = await page.evaluate(() => {
    const terrain = globalThis.__wreckright.world.terrain;
    return {
      width: terrain.width * terrain.tileSize,
      height: terrain.height * terrain.tileSize,
    };
  });
  if (box === null) throw new Error('minimap missing');
  await page.touchscreen.tap(
    box.x + (point.x / size.width) * box.width,
    box.y + (point.y / size.height) * box.height,
  );
}

async function battlefieldPoint(page, point) {
  return page.evaluate((worldPoint) => {
    const { engine } = globalThis.__wreckright;
    const canvas = document.querySelector('.viewport canvas:not(.perf-overlay)');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('battle canvas missing');
    const bounds = canvas.getBoundingClientRect();
    const height = engine.renderer.terrain.heightAt(worldPoint.x, worldPoint.y);
    const screen = engine.renderer.camera.worldToScreen(
      worldPoint,
      engine.renderer.viewport,
      height,
    );
    return { x: bounds.left + screen.x, y: bounds.top + screen.y };
  }, point);
}

async function entityPoint(page, id) {
  return page.evaluate((entityId) => {
    const { engine, world } = globalThis.__wreckright;
    const canvas = document.querySelector('.viewport canvas:not(.perf-overlay)');
    const entity = world.entities.find((candidate) => candidate.id === entityId);
    if (!(canvas instanceof HTMLCanvasElement) || entity === undefined) {
      throw new Error('target body missing');
    }
    const bounds = canvas.getBoundingClientRect();
    const body = engine.renderer.screenBodyOf(entity);
    return { x: bounds.left + body.x, y: bounds.top + body.y };
  }, id);
}

export async function verifyTouchDockControls({ page, check, prefix }) {
  await page.locator('[data-testid="mobile-tab-support"]').tap();
  check(
    `${prefix} support tab embeds the three calls without another drawer`,
    (await page.locator('[data-testid="mobile-tray-support"] [data-testid="support-palette"]').isVisible()) &&
      (await page.locator('[data-testid="mobile-tray-support"] .support-call').count()) === 3 &&
      (await page.locator('[data-testid="mobile-tray-support"] [data-testid="support-toggle"]').count()) === 0,
  );

  await page.locator('[data-testid="mobile-tab-orders"]').tap();
  check(
    `${prefix} keeps advanced orders behind Tactics`,
    (await page.locator('[data-testid="tactics-toggle"]').isVisible()) &&
      !(await page.locator('[data-testid="command-hold_fire"]').isVisible()),
  );
  await page.locator('[data-testid="tactics-toggle"]').tap();
  check(
    `${prefix} Tactics reveals advanced orders and formation`,
    (await page.locator('[data-testid="command-hold_fire"]').isVisible()) &&
      (await page.locator('.tactics-formation').isVisible()),
  );
  await page.locator('[data-testid="tactics-toggle"]').tap();

  check(
    `${prefix} hides Queue and Cancel until an order is armed`,
    (await page.locator('[data-testid="mobile-queue"]').count()) === 0 &&
      (await page.locator('[data-testid="mobile-cancel"]').count()) === 0,
  );
  await page.locator('[data-testid="command-move"]').tap();
  check(
    `${prefix} order palette arms a move and reveals route actions`,
    (await page.evaluate(() => globalThis.__wreckright.useGame.getState().orderMode)) === 'move' &&
      (await page.locator('[data-testid="command-move"]').getAttribute('aria-pressed')) === 'true' &&
      (await page.locator('[data-testid="mobile-queue"]').isVisible()) &&
      (await page.locator('[data-testid="mobile-cancel"]').isVisible()),
  );
  await page.locator('[data-testid="mobile-queue"]').tap();
  check(
    `${prefix} queue mode arms from the dock`,
    await page.evaluate(() => globalThis.__wreckright.useGame.getState().queueOrders),
  );
  await page.locator('[data-testid="mobile-cancel"]').tap();
  check(
    `${prefix} cancel clears the route and hides transient actions`,
    !(await page.evaluate(() => globalThis.__wreckright.useGame.getState().queueOrders)) &&
      (await page.evaluate(() => globalThis.__wreckright.useGame.getState().orderMode)) === null &&
      (await page.locator('[data-testid="mobile-queue"]').count()) === 0 &&
      (await page.locator('[data-testid="mobile-cancel"]').count()) === 0,
  );

  await page.locator('[data-testid="command-move"]').tap();
  await page.locator('[data-testid="mobile-queue"]').tap();
  await page.locator('[data-testid="command-attack"]').tap();
  check(
    `${prefix} switching to a target order clears queued routing`,
    !(await page.evaluate(() => globalThis.__wreckright.useGame.getState().queueOrders)) &&
      (await page.evaluate(() => globalThis.__wreckright.useGame.getState().orderMode)) === 'attack' &&
      (await page.locator('[data-testid="mobile-queue"]').count()) === 0 &&
      (await page.locator('[data-testid="mobile-cancel"]').isVisible()),
  );
  await page.locator('[data-testid="mobile-cancel"]').tap();
  check(
    `${prefix} cancel clears an armed order`,
    (await page.evaluate(() => globalThis.__wreckright.useGame.getState().orderMode)) === null &&
      (await page.locator('[data-testid="command-attack"]').getAttribute('aria-pressed')) === 'false' &&
      (await page.locator('[data-testid="mobile-queue"]').count()) === 0 &&
      (await page.locator('[data-testid="mobile-cancel"]').count()) === 0,
  );
}

export async function verifyTouchNavigation({ page, check, prefix }) {
  const firstLance = page.locator('[data-testid="lance-bar"] button').first();
  await firstLance.tap();
  const beforeDoubleTap = await orderSnapshot(page);
  await firstLance.tap();
  await firstLance.tap();
  check(
    `${prefix} repeated lance-card taps only select`,
    same(await orderSnapshot(page), beforeDoubleTap),
  );

  const beforePan = await cameraSnapshot(page);
  await panField(page);
  const afterPan = await cameraSnapshot(page);
  check(
    `${prefix} touch drag pans the battlefield`,
    Math.hypot(
      afterPan.target.x - beforePan.target.x,
      afterPan.target.y - beforePan.target.y,
    ) > 1,
  );

  await page.locator('[data-testid="centre-selection"]').tap();
  const centred = await page.evaluate(() => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const selected = new Set(useGame.getState().selection);
    const units = world.entities.filter((entity) => selected.has(entity.id));
    const centre = units.reduce(
      (sum, entity) => ({ x: sum.x + entity.pos.x, y: sum.y + entity.pos.y }),
      { x: 0, y: 0 },
    );
    return {
      count: units.length,
      camera: { ...engine.renderer.camera.target },
      centre: { x: centre.x / units.length, y: centre.y / units.length },
      tolerance: world.terrain.tileSize * 4,
    };
  });
  check(
    `${prefix} centre action finds the selection`,
    centred.count > 0 &&
      Math.hypot(centred.camera.x - centred.centre.x, centred.camera.y - centred.centre.y) <
        centred.tolerance,
  );

  const beforeMinimap = await orderSnapshot(page);
  const minimapDrag = await dragMinimapLive(page);
  check(
    `${prefix} minimap touch drag pans live before touch-end`,
    Math.hypot(
      minimapDrag.live.target.x - minimapDrag.pressed.target.x,
      minimapDrag.live.target.y - minimapDrag.pressed.target.y,
    ) > 1 &&
      Math.hypot(
        minimapDrag.ended.target.x - minimapDrag.live.target.x,
        minimapDrag.ended.target.y - minimapDrag.live.target.y,
      ) < 0.1,
  );

  const minimapCancel = await cancelMinimapTouch(page);
  check(
    `${prefix} minimap touch cancellation releases the next gesture`,
    !minimapCancel.dragging &&
      Math.hypot(
        minimapCancel.recovered.target.x - minimapCancel.cancelled.target.x,
        minimapCancel.recovered.target.y - minimapCancel.cancelled.target.y,
      ) > 1,
  );
  check(
    `${prefix} minimap touch gestures do not select or order`,
    same(await orderSnapshot(page), beforeMinimap),
  );

  const beforePinch = await cameraSnapshot(page);
  const beforeOrders = await orderSnapshot(page);
  await pinchField(page);
  const afterPinch = await cameraSnapshot(page);
  check(
    `${prefix} pinch changes camera distance`,
    Math.abs(afterPinch.distance - beforePinch.distance) > 1,
    `${beforePinch.distance} → ${afterPinch.distance}`,
  );
  check(`${prefix} pinch does not select or order`, same(await orderSnapshot(page), beforeOrders));

  await cancelTouch(page);
  check(
    `${prefix} pointer cancellation does not select or order`,
    same(await orderSnapshot(page), beforeOrders),
  );
}

export async function verifyTouchOrders({ page, check, prefix }) {
  if (!(await page.evaluate(() => globalThis.__wreckright.useGame.getState().paused))) {
    await page.locator('[data-testid="pause-button"]').tap();
  }
  const firstLance = page.locator('[data-testid="lance-bar"] button').first();
  await firstLance.tap();
  const gate = await page.evaluate(() => {
    const zone = globalThis.__wreckright.world.zones[0];
    if (zone === undefined) throw new Error('training gate missing');
    return { x: zone.x, y: zone.y };
  });
  await tapMinimapAt(page, gate);
  await page.locator('[data-testid="command-move"]').tap();
  const beforeMove = await orderSnapshot(page);
  const gateScreen = await battlefieldPoint(page, gate);
  await page.touchscreen.tap(gateScreen.x, gateScreen.y);
  const afterMove = await orderSnapshot(page);
  check(
    `${prefix} battlefield tap issues a move order`,
    !same(afterMove, beforeMove) && afterMove.orders.some((entry) => entry.move !== null),
  );

  while ((await page.locator('[data-testid="mobile-speed"]').innerText()) !== '4×') {
    await page.locator('[data-testid="mobile-speed"]').tap();
  }
  await page.waitForFunction(
    () => globalThis.__wreckright.useGame.getState().enemies.some((enemy) => enemy.alive),
    { timeout: 20_000 },
  );
  await page.locator('[data-testid="pause-button"]').tap();

  const target = await page.evaluate(() => {
    const { useGame, world } = globalThis.__wreckright;
    const targetId = useGame.getState().enemies.find((enemy) => enemy.alive)?.id;
    const entity = world.entities.find((candidate) => candidate.id === targetId);
    if (entity === undefined) throw new Error('visible target missing');
    return { id: entity.id, point: { x: entity.pos.x, y: entity.pos.y } };
  });
  await tapMinimapAt(page, target.point);
  await page.locator('[data-testid="command-attack"]').tap();
  const targetScreen = await entityPoint(page, target.id);
  await page.touchscreen.tap(targetScreen.x, targetScreen.y);
  const attacked = await orderSnapshot(page);
  check(
    `${prefix} battlefield tap issues a target order`,
    attacked.orders.some((entry) => entry.attack?.targetId === target.id),
  );
}
