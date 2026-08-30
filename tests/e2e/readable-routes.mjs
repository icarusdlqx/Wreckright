import { closeDesktopBattleMenu } from './input-safety.mjs';

const ROUTE_BATCHES = ['route-lines', 'route-marks', 'route-labels'];

async function settleFrames(page, count = 3) {
  await page.evaluate(async (frames) => {
    await document.fonts.ready;
    for (let index = 0; index < frames; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }, count);
}

function strictlyIncreasingEtas(labels) {
  const seconds = labels.map((label) => {
    const match = /^~(\d+)s$/.exec(label);
    return match === null ? Number.NaN : Number(match[1]);
  });
  return seconds.every(
    (value, index) => Number.isFinite(value) && (index === 0 || value > seconds[index - 1]),
  );
}

async function routeFrame(page) {
  return page.evaluate((batchNames) => {
    const { renderer } = globalThis.__wreckright.engine;

    const coloursOf = (attribute, count) => {
      if (attribute === undefined) return [];
      const colours = new Set();
      const used = Math.min(attribute.count, count);
      for (let index = 0; index < used; index += 1) {
        const channels = [];
        for (let channel = 0; channel < attribute.itemSize; channel += 1) {
          channels.push(attribute.array[index * attribute.itemSize + channel].toFixed(4));
        }
        colours.add(channels.join(':'));
      }
      return [...colours].sort();
    };

    const batch = (name) => {
      const root = renderer.scene.getObjectByName(name);
      if (root === undefined) return null;
      const geometryIds = new Set();
      const materialIds = new Set();
      const textureIds = new Set();
      const colours = new Set();
      let drawCount = 0;
      let visible = false;

      root.traverse((node) => {
        let effectivelyVisible = node.visible;
        for (let parent = node.parent; effectivelyVisible && parent !== null; parent = parent.parent) {
          effectivelyVisible = parent.visible;
        }
        visible ||= effectivelyVisible;

        const geometry = node.geometry;
        if (geometry !== undefined) {
          geometryIds.add(geometry.uuid);
          const positions = geometry.getAttribute('position');
          const available = positions?.count ?? 0;
          const ranged = Number.isFinite(geometry.drawRange.count)
            ? Math.min(available, geometry.drawRange.count)
            : available;
          const used = node.isInstancedMesh === true ? node.count : ranged;
          drawCount += used;
          const colour = node.isInstancedMesh === true
            ? node.instanceColor
            : geometry.getAttribute('color');
          for (const key of coloursOf(colour, used)) colours.add(key);
        }

        const materials = node.material === undefined
          ? []
          : Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          materialIds.add(material.uuid);
          for (const value of Object.values(material)) {
            if (value?.isTexture === true) textureIds.add(value.uuid);
          }
        }
      });

      return {
        visible,
        drawCount,
        colours: [...colours].sort(),
        geometryIds: [...geometryIds].sort(),
        materialIds: [...materialIds].sort(),
        textureIds: [...textureIds].sort(),
        semantics: {
          activeIntensity: root.userData.activeIntensity,
          queuedIntensity: root.userData.queuedIntensity,
          approximateEta: root.userData.approximateEta,
        },
      };
    };

    return {
      tick: globalThis.__wreckright.world.tick,
      paused: globalThis.__wreckright.useGame.getState().paused,
      stats: structuredClone(renderer.routeMarkerStats),
      render: { ...renderer.renderStats },
      batches: Object.fromEntries(batchNames.map((name) => [name, batch(name)])),
    };
  }, ROUTE_BATCHES);
}

async function sampleRouteFrames(page, count = 8) {
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    await settleFrames(page, 1);
    frames.push(await routeFrame(page));
  }
  return frames;
}

function stableResources(frames) {
  const resourceView = (frame) => ({
    render: {
      calls: frame.render.calls,
      geometries: frame.render.geometries,
      textures: frame.render.textures,
    },
    capacities: frame.stats.capacities,
    batches: Object.fromEntries(
      ROUTE_BATCHES.map((name) => {
        const batch = frame.batches[name];
        return [name, batch === null ? null : {
          geometryIds: batch.geometryIds,
          materialIds: batch.materialIds,
          textureIds: batch.textureIds,
        }];
      }),
    ),
  });
  const expected = JSON.stringify(resourceView(frames[0]));
  return frames.every((frame) => JSON.stringify(resourceView(frame)) === expected);
}

export async function runReadableRouteChecks({ page, check, shots }) {
  process.stdout.write('\nreadable field routes\n');
  await closeDesktopBattleMenu(page);

  const commander = page.locator('[data-testid="commander-view"]');
  const commanderToggle = page.locator('[data-testid="commander-toggle"]');
  const commanderWasVisible = await commander.isVisible();
  if (commanderWasVisible) {
    await commanderToggle.click();
    await commander.waitFor({ state: 'hidden' });
  }

  const fixture = await page.evaluate(() => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const state = useGame.getState();
    const routeEntity = world.entities.find(
      (entity) =>
        entity.team === state.playerTeam &&
        entity.orders.move !== null &&
        entity.orders.queue.length === 3,
    );
    if (routeEntity === undefined || routeEntity.orders.move === null) {
      throw new Error('readable route proof requires the Commander four-leg plan');
    }

    globalThis.__readableRouteRestore = {
      paused: state.paused,
      selection: [...state.selection],
      target: { ...engine.renderer.camera.target },
      distance: engine.renderer.camera.distance,
      reducedMotion: engine.renderer.camera.reducedMotion,
      focus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    };

    engine.setPaused(true);
    state.setSelection([routeEntity.id]);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    const destinations = [
      { ...routeEntity.pos },
      { ...routeEntity.orders.move.to },
      ...routeEntity.orders.queue.map((order) => ({ ...order.to })),
    ];
    const bounds = destinations.reduce(
      (result, point) => ({
        minX: Math.min(result.minX, point.x),
        maxX: Math.max(result.maxX, point.x),
        minY: Math.min(result.minY, point.y),
        maxY: Math.max(result.maxY, point.y),
      }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
    const target = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
    const { camera, terrain, viewport } = engine.renderer;
    camera.skipDropIn();
    camera.reducedMotion = false;
    let distance = 900;
    for (let candidate = 440; candidate <= 900; candidate += 20) {
      camera.distance = candidate;
      camera.centreOn(target);
      camera.update(viewport);
      const screens = destinations.map((point) =>
        camera.worldToScreen(point, viewport, terrain.heightAt(point.x, point.y))
      );
      if (screens.every((point) =>
        point.x >= 90 && point.x <= viewport.width - 90 &&
        point.y >= 90 && point.y <= viewport.height - 120
      )) {
        distance = candidate;
        break;
      }
    }
    camera.distance = distance;
    camera.centreOn(target);
    camera.update(viewport);

    return { entityId: routeEntity.id, destinations, target, distance };
  });

  try {
    await page.waitForFunction(
      () => {
        const stats = globalThis.__wreckright.engine.renderer.routeMarkerStats;
        return stats.routes === 1 && stats.activeLegs === 1 && stats.queuedLegs === 3;
      },
      undefined,
      { timeout: 5_000 },
    );
    await settleFrames(page, 4);

    const ordinary = await sampleRouteFrames(page);
    const first = ordinary[0];
    const last = ordinary.at(-1);
    const stats = last.stats;
    const lines = last.batches['route-lines'];
    const marks = last.batches['route-marks'];
    const labels = last.batches['route-labels'];

    check(
      'the selected Commander plan becomes one active and three queued field legs',
      stats.routes === 1 && stats.activeLegs === 1 && stats.queuedLegs === 3 &&
        stats.lineSegments >= 4 && stats.dropped === 0 &&
        lines !== null && lines.visible && lines.drawCount > 0,
      JSON.stringify(stats),
    );
    check(
      'every field leg ends in an estimated arrival wedge',
      stats.wedges === 4,
      JSON.stringify(stats),
    );
    check(
      'field direction chevrons are visible along the route',
      stats.chevrons > 0 && marks !== null && marks.visible &&
        marks.drawCount >= stats.chevrons + stats.wedges,
      JSON.stringify({ chevrons: stats.chevrons, marks }),
    );
    check(
      'four readable approximate ETA labels increase along the route',
      stats.labels === 4 && stats.labelTexts.length === 4 &&
        strictlyIncreasingEtas(stats.labelTexts) && labels !== null &&
        labels.visible && labels.drawCount > 0 && labels.semantics.approximateEta === true,
      JSON.stringify({ labels: stats.labelTexts, batch: labels }),
    );
    check(
      'active and queued route styling stays distinct in all shared batches',
      ROUTE_BATCHES.every((name) => {
        const batch = last.batches[name];
        return batch !== null && batch.visible && batch.drawCount > 0 &&
          batch.semantics.activeIntensity === 1 && batch.semantics.queuedIntensity === 0.38 &&
          batch.colours.length >= 2;
      }),
      JSON.stringify(last.batches),
    );
    check(
      'route chevrons animate while planning remains paused',
      ordinary.every((frame) => frame.paused && frame.tick === first.tick) &&
        ordinary.some((frame) => Math.abs(frame.stats.phase - first.stats.phase) > 0.0001),
      JSON.stringify(ordinary.map((frame) => ({ tick: frame.tick, phase: frame.stats.phase }))),
    );
    check(
      'animated route frames keep draw calls, geometries, textures, and pools stable',
      stableResources(ordinary),
      JSON.stringify(ordinary.map((frame) => ({ render: frame.render, capacities: frame.stats.capacities }))),
    );

    await page.evaluate(() => {
      globalThis.__wreckright.engine.renderer.camera.reducedMotion = true;
    });
    await settleFrames(page, 3);
    const reduced = await sampleRouteFrames(page);
    const reducedPhase = reduced[0].stats.phase;
    check(
      'reduced motion keeps route chevrons static while retaining all route information',
      reduced.every((frame) =>
        frame.paused && frame.stats.phase === reducedPhase &&
        frame.stats.activeLegs === 1 && frame.stats.queuedLegs === 3 &&
        frame.stats.chevrons > 0 && frame.stats.wedges === 4 && frame.stats.labels === 4
      ),
      JSON.stringify(reduced.map((frame) => ({ phase: frame.stats.phase, stats: frame.stats }))),
    );
    check(
      'static reduced-motion route frames retain the same pooled render resources',
      stableResources(reduced),
      JSON.stringify(reduced.map((frame) => ({ render: frame.render, capacities: frame.stats.capacities }))),
    );

    check(
      'the field camera is centred and zoomed to the complete planned route',
      await page.evaluate(({ entityId, destinations }) => {
        const { engine, useGame } = globalThis.__wreckright;
        const { camera, terrain, viewport } = engine.renderer;
        const onScreen = destinations.every((point) => {
          const screen = camera.worldToScreen(point, viewport, terrain.heightAt(point.x, point.y));
          return screen.x >= 0 && screen.x <= viewport.width &&
            screen.y >= 0 && screen.y <= viewport.height;
        });
        return useGame.getState().selection[0] === entityId && onScreen;
      }, fixture),
      JSON.stringify(fixture),
    );

    await page.screenshot({ path: `${shots}/10-readable-route.png` });
    const closeClip = await page.evaluate(({ destinations, distance }) => {
      const { renderer } = globalThis.__wreckright.engine;
      const { camera, terrain, viewport } = renderer;
      const focus = destinations.slice(1, 4);
      const bounds = focus.reduce(
        (result, point) => ({
          minX: Math.min(result.minX, point.x),
          maxX: Math.max(result.maxX, point.x),
          minY: Math.min(result.minY, point.y),
          maxY: Math.max(result.maxY, point.y),
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
      );
      camera.distance = Math.max(camera.minDistance, distance * 0.7);
      camera.centreOn({
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
      });
      camera.update(viewport);

      const screens = focus.map((point) =>
        camera.worldToScreen(point, viewport, terrain.heightAt(point.x, point.y))
      );
      const canvas = renderer.canvas.getBoundingClientRect();
      const screenBounds = screens.reduce(
        (result, point) => ({
          minX: Math.min(result.minX, point.x),
          maxX: Math.max(result.maxX, point.x),
          minY: Math.min(result.minY, point.y),
          maxY: Math.max(result.maxY, point.y),
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
      );
      const padding = 100;
      const left = Math.max(0, screenBounds.minX - padding);
      const top = Math.max(0, screenBounds.minY - padding);
      const right = Math.min(viewport.width, screenBounds.maxX + padding);
      const bottom = Math.min(viewport.height, screenBounds.maxY + padding);
      return {
        x: canvas.left + left,
        y: canvas.top + top,
        width: right - left,
        height: bottom - top,
      };
    }, fixture);
    await settleFrames(page, 3);
    await page.screenshot({ path: `${shots}/10-readable-route-close.png`, clip: closeClip });
  } finally {
    await page.evaluate(() => {
      const restore = globalThis.__readableRouteRestore;
      if (restore === undefined) return;
      const { engine, useGame } = globalThis.__wreckright;
      engine.renderer.camera.reducedMotion = restore.reducedMotion;
      engine.renderer.camera.distance = restore.distance;
      engine.renderer.camera.centreOn(restore.target);
      engine.renderer.camera.update(engine.renderer.viewport);
      useGame.getState().setSelection(restore.selection);
      engine.setPaused(restore.paused);
      if (restore.focus?.isConnected === true) restore.focus.focus({ preventScroll: true });
      delete globalThis.__readableRouteRestore;
    });
    if (commanderWasVisible) {
      await commanderToggle.click();
      await commander.waitFor({ state: 'visible' });
    }
  }
}
