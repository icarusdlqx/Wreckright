function watchPage(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function openCultureBattle(page, url) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'ironline.training',
      JSON.stringify({ version: 1, step: 0, status: 'skipped' }),
    );
    localStorage.setItem(
      'ironline.lance.skirmish_ridge',
      JSON.stringify([
        { designId: 'hornet_spotter', pilotId: 'kessa_vale' },
        { designId: 'votive_picket', pilotId: 'dorn_hess' },
        { designId: 'bulwark_assault', pilotId: 'marek_sud' },
        { designId: 'halberd_prime', pilotId: 'ilse_brant' },
      ]),
    );
  });
  await page.goto(url);
  await page.waitForSelector('[data-testid="home-screen"]');
  await page.locator('[data-testid="home-skirmish"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
  await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().ready === true);

  // Force an actual mission change before returning to the stored mixed lance.
  await page.locator('[data-testid="briefing-mission-picker"]').selectOption('rules_break');
  await page.waitForFunction(() => (
    globalThis.__wreckright?.world.mission.id === 'rules_break' &&
    globalThis.__wreckright.useGame.getState().ready === true
  ));
  await page.locator('[data-testid="briefing-mission-picker"]').selectOption('skirmish_ridge');
  await page.waitForFunction(() => (
    globalThis.__wreckright?.world.mission.id === 'skirmish_ridge' &&
    globalThis.__wreckright.useGame.getState().ready === true
  ));
  await page.waitForFunction(() => (
    document.querySelector('[data-testid="briefing-faction-picker"]')?.value === 'mixed'
  ));
  await page.locator('[data-testid="briefing-deploy"]').click();
  await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().briefingSeen === true);
  await page.waitForSelector('.viewport canvas:not(.perf-overlay)');
}

async function stageCultureFixture(page) {
  return page.evaluate(() => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const state = useGame.getState();
    const friendlies = world.entities.filter((entity) => entity.team === state.playerTeam);
    const compact = engine.renderer.viewport.width < 900;
    const xPositions = compact ? [395, 445, 495, 545] : [380, 440, 500, 560];
    const wanted = [
      ['hornet_hnt2', xPositions[0], 420],
      ['votive_vtv2', xPositions[1], 420],
      ['bulwark_bwk3', xPositions[2], 420],
      ['halberd_hlb4', xPositions[3], 420],
    ];
    if (friendlies.length !== wanted.length) {
      throw new Error(`culture fixture needs ${wanted.length} friendlies, found ${friendlies.length}`);
    }
    for (let index = 0; index < friendlies.length; index += 1) {
      const entity = friendlies[index];
      const [chassisId, x, y] = wanted[index];
      if (entity.chassisId !== chassisId) {
        throw new Error(`culture fixture expected ${chassisId}, found ${entity.chassisId}`);
      }
      entity.pos = { x, y };
      entity.facing = -Math.PI / 4;
      entity.torsoOffset = 0;
      entity.targetId = null;
    }
    for (const entity of world.entities.filter((candidate) => candidate.team !== state.playerTeam)) {
      entity.pos = { x: 880 + entity.id * 8, y: 780 + entity.id * 8 };
      entity.targetId = null;
    }
    // The units moved without a sim tick. Reveal the terrain they now occupy so
    // the proof judges hull construction rather than a stale sensor shroud.
    if (world.vision !== null) {
      world.vision.tiles.fill(1);
      world.vision.explored.fill(1);
      engine.renderer.fog.update(world.terrain, world.vision);
    }

    engine.setPaused(true);
    state.setSelection([]);
    engine.renderer.snapshot(world);
    engine.renderer.snapshot(world);
    engine.presentation.publish(null);
    engine.renderer.camera.skipDropIn();
    engine.renderer.camera.distance = compact ? 299 : 255;
    engine.renderer.camera.centreOn({ x: 470, y: 420 });
    engine.renderer.camera.update(engine.renderer.viewport);

    return {
      ids: friendlies.map((entity) => entity.id),
      chassisIds: friendlies.map((entity) => entity.chassisId),
      factions: friendlies.map((entity) => world.catalog.chassis.get(entity.chassisId)?.faction),
      teams: friendlies.map((entity) => entity.team),
      missionId: world.mission.id,
      distance: engine.renderer.camera.distance,
    };
  });
}

async function inspectCultureFixture(page, ids) {
  await settle(page);
  return page.evaluate((wantedIds) => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const { renderer } = engine;
    const effectiveVisible = (node, root) => {
      let current = node;
      while (current !== null) {
        if (!current.visible) return false;
        if (current === root) return true;
        current = current.parent;
      }
      return false;
    };
    const projectedBoundsOf = (root) => {
      const bounds = {
        left: Infinity,
        top: Infinity,
        right: -Infinity,
        bottom: -Infinity,
      };
      root.updateWorldMatrix(true, true);
      root.traverse((node) => {
        if (!node.isMesh || !effectiveVisible(node, root)) return;
        const geometry = node.geometry;
        if (geometry.boundingBox === null) geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (box === null) return;
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              const point = box.min.clone().set(x, y, z)
                .applyMatrix4(node.matrixWorld)
                .project(renderer.camera.camera);
              const screenX = (point.x + 1) * renderer.viewport.width * 0.5;
              const screenY = (1 - point.y) * renderer.viewport.height * 0.5;
              bounds.left = Math.min(bounds.left, screenX);
              bounds.top = Math.min(bounds.top, screenY);
              bounds.right = Math.max(bounds.right, screenX);
              bounds.bottom = Math.max(bounds.bottom, screenY);
            }
          }
        }
      });
      return Number.isFinite(bounds.left) ? bounds : null;
    };
    const units = wantedIds.map((id) => {
      const entity = world.entities.find((candidate) => candidate.id === id);
      const root = renderer.scene.children.find((candidate) => candidate.userData.entityId === id);
      if (entity === undefined || root === undefined) return { id, missing: true };
      let surface = 0;
      let visibleSurface = 0;
      let hero = 0;
      let power = 0;
      let visiblePower = 0;
      root.traverse((node) => {
        if (node.userData.blueprintDetail === 'surface') {
          surface += 1;
          if (effectiveVisible(node, root)) visibleSurface += 1;
        }
        if (node.userData.blueprintDetail === 'hero') hero += 1;
        if (node.name.startsWith('power-seam:') || node.name.startsWith('startup-light:')) {
          power += 1;
          if (effectiveVisible(node, root)) visiblePower += 1;
        }
      });
      return {
        id,
        bounds: projectedBoundsOf(root),
        detail: root.userData.modelDetail,
        surface,
        visibleSurface,
        hero,
        power,
        visiblePower,
      };
    });
    return {
      units,
      paused: useGame.getState().paused,
      selection: useGame.getState().selection,
      lowFx: renderer.lowFx,
      distance: renderer.camera.distance,
      stats: renderer.renderStats,
      viewport: { ...renderer.viewport },
      teamTints: [...new Set(
        world.entities
          .filter((entity) => wantedIds.includes(entity.id))
          .map((entity) => renderer.teamTint(entity.team)),
      )],
    };
  }, ids);
}

async function setQuality(page, distance, lowFx) {
  await page.evaluate(({ nextDistance, nextLowFx }) => {
    const { renderer } = globalThis.__wreckright.engine;
    renderer.setLowFx(nextLowFx);
    renderer.camera.distance = nextDistance;
    renderer.camera.update(renderer.viewport);
  }, { nextDistance: distance, nextLowFx: lowFx });
}

function bodiesFit(units, viewport) {
  return units.every(({ bounds }) => bounds !== null && bounds !== undefined &&
    bounds.left >= 0 && bounds.right <= viewport.width &&
    bounds.top >= 0 && bounds.bottom <= viewport.height);
}

function bodiesDoNotOverlap(units) {
  for (let left = 0; left < units.length; left += 1) {
    for (let right = left + 1; right < units.length; right += 1) {
      const a = units[left]?.bounds;
      const b = units[right]?.bounds;
      if (a === undefined || b === undefined || a === null || b === null) return false;
      const separated = a.right < b.left || b.right < a.left ||
        a.bottom < b.top || b.bottom < a.top;
      if (!separated) return false;
    }
  }
  return true;
}

export async function runCultureSilhouetteChecks({ browser, url, shots, check }) {
  process.stdout.write('\nculture silhouettes\n');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const errors = watchPage(page);

  try {
    await openCultureBattle(page, url);
    const fixture = await stageCultureFixture(page);
    check(
      'culture proof stages the expected same-team mixed company',
      fixture.missionId === 'skirmish_ridge' &&
        fixture.chassisIds.join(',') === 'hornet_hnt2,votive_vtv2,bulwark_bwk3,halberd_hlb4' &&
        fixture.factions.join(',') === 'linewrought,aurelian,linewrought,aurelian' &&
        new Set(fixture.teams).size === 1,
      JSON.stringify(fixture),
    );

    const near = await inspectCultureFixture(page, fixture.ids);
    check(
      'culture proof is paused, unselected, full-FX and inside the surface-detail range',
      near.paused && near.selection.length === 0 && !near.lowFx && near.distance === fixture.distance,
      JSON.stringify({ paused: near.paused, selection: near.selection, lowFx: near.lowFx, distance: near.distance }),
    );
    check(
      'all four close tactical models expose their exact surface budget and no hero meshes',
      near.units.every((unit) => !unit.missing && unit.detail === 'surface' &&
        unit.surface === 4 && unit.visibleSurface === 4 && unit.hero === 0),
      JSON.stringify(near.units),
    );
    check(
      'Aurelian powered seams corroborate geometry without becoming a Linewrought cue',
      near.units[0]?.power === 0 && near.units[2]?.power === 0 &&
        near.units[1]?.power === 5 && near.units[1]?.visiblePower === 5 &&
        near.units[3]?.power === 5 && near.units[3]?.visiblePower === 5,
      JSON.stringify(near.units.map(({ id, power, visiblePower }) => ({ id, power, visiblePower }))),
    );
    check(
      'one team tint cannot reveal culture in the proof image',
      near.teamTints.length === 1,
      JSON.stringify(near.teamTints),
    );
    check(
      'every proof silhouette fits the canvas without overlap',
      bodiesFit(near.units, near.viewport) && bodiesDoNotOverlap(near.units),
      JSON.stringify(near.units.map(({ id, bounds }) => ({ id, bounds }))),
    );

    await setQuality(page, 470, false);
    const far = await inspectCultureFixture(page, fixture.ids);
    check(
      'far tactical view removes every optional surface mesh',
      far.units.every((unit) => unit.detail === 'structure' && unit.visibleSurface === 0),
      JSON.stringify(far.units),
    );
    await setQuality(page, 255, true);
    const low = await inspectCultureFixture(page, fixture.ids);
    check(
      'low FX keeps all optional surface meshes hidden at close range',
      low.lowFx && low.units.every((unit) => unit.detail === 'structure' && unit.visibleSurface === 0),
      JSON.stringify(low.units),
    );
    await setQuality(page, 255, false);
    const restored = await inspectCultureFixture(page, fixture.ids);
    check(
      'detail cycling restores all cues without growing render resources',
      restored.units.every((unit) => unit.detail === 'surface' && unit.visibleSurface === 4) &&
        restored.stats.geometries === near.stats.geometries &&
        restored.stats.textures === near.stats.textures,
      JSON.stringify({ near: near.stats, restored: restored.stats }),
    );
    await page.addStyleTag({ content: '.app > :not(.viewport) { visibility: hidden !important; }' });
    await settle(page);
    await page.locator('.viewport canvas:not(.perf-overlay)').screenshot({
      path: `${shots}/17-culture-silhouettes.png`,
    });
    check('culture fixture emits no browser errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }

  const compactContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    hasTouch: true,
    isMobile: true,
  });
  const compactPage = await compactContext.newPage();
  const compactErrors = watchPage(compactPage);
  try {
    await openCultureBattle(compactPage, url);
    const compactFixture = await stageCultureFixture(compactPage);
    const compact = await inspectCultureFixture(compactPage, compactFixture.ids);
    check(
      'landscape touch proof keeps all four same-team culture silhouettes readable',
      compactFixture.distance === 299 && compact.teamTints.length === 1 &&
        compact.units.every((unit) => unit.detail === 'surface' && unit.visibleSurface === 4) &&
        bodiesFit(compact.units, compact.viewport) && bodiesDoNotOverlap(compact.units),
      JSON.stringify({ fixture: compactFixture, units: compact.units }),
    );
    await compactPage.addStyleTag({
      content: '.app > :not(.viewport) { visibility: hidden !important; }',
    });
    await settle(compactPage);
    await compactPage.locator('.viewport canvas:not(.perf-overlay)').screenshot({
      path: `${shots}/17-culture-silhouettes-mobile.png`,
    });
    check(
      'landscape culture fixture emits no browser errors',
      compactErrors.length === 0,
      compactErrors.join(' | '),
    );
  } finally {
    await compactContext.close();
  }
}
