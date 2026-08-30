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

async function openTerrainBattle(page, url) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'ironline.training',
      JSON.stringify({ version: 1, step: 0, status: 'skipped' }),
    );
    localStorage.setItem('ironline.lowfx', '0');
  });
  await page.goto(url);
  await page.waitForSelector('[data-testid="home-screen"]');
  await page.locator('[data-testid="home-skirmish"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
  await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().ready === true);
  await page.locator('[data-testid="briefing-mission-picker"]').selectOption('causeway_crossing');
  await page.waitForFunction(() => (
    globalThis.__wreckright?.world.mission.id === 'causeway_crossing' &&
    globalThis.__wreckright.useGame.getState().ready === true
  ));
  await page.locator('[data-testid="briefing-deploy"]').click();
  await page.waitForFunction(() => (
    globalThis.__wreckright?.world.mission.id === 'causeway_crossing' &&
    globalThis.__wreckright.useGame.getState().briefingSeen === true
  ));
  await page.waitForSelector('.viewport canvas:not(.perf-overlay)');
}

async function stageTerrainFixture(page, distance) {
  return page.evaluate((cameraDistance) => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const { renderer } = engine;
    engine.setPaused(true);
    useGame.getState().setSelection([]);
    for (const entity of world.entities) {
      entity.pos = { x: 36, y: 36 };
      entity.targetId = null;
    }
    if (world.vision !== null) {
      world.vision.visible.clear();
      world.vision.tiles.fill(1);
      world.vision.explored.fill(1);
      renderer.fog.update(world.terrain, world.vision);
    }
    renderer.snapshot(world);
    renderer.snapshot(world);
    engine.presentation.publish(null);
    renderer.camera.skipDropIn();
    renderer.camera.distance = cameraDistance;
    renderer.camera.centreOn({ x: 504, y: 492 });
    renderer.camera.update(renderer.viewport);
    renderer.markers.group.visible = false;
    return {
      missionId: world.mission.id,
      mapId: world.terrain.id,
      paused: useGame.getState().paused,
      selection: useGame.getState().selection,
      distance: renderer.camera.distance,
      target: { ...renderer.camera.target },
    };
  }, distance);
}

async function inspectTerrainFixture(page) {
  await settle(page);
  return page.evaluate(() => {
    const { engine, useGame, world } = globalThis.__wreckright;
    const { renderer } = engine;
    const ground = renderer.groundMesh;
    const geometry = ground.geometry;
    const water = ground.getObjectByName('water-surface');
    const viewport = renderer.viewport;
    let roads = 0;
    let waterTiles = 0;
    let roadsTouchingWater = 0;
    for (let row = 0; row < world.terrain.height; row += 1) {
      for (let column = 0; column < world.terrain.width; column += 1) {
        const terrainId = world.terrain.idAt(column, row);
        if (terrainId === 'water') waterTiles += 1;
        if (terrainId !== 'road') continue;
        roads += 1;
        let touchesWater = false;
        for (let dr = -1; dr <= 1; dr += 1) {
          for (let dc = -1; dc <= 1; dc += 1) {
            if (world.terrain.idAt(column + dc, row + dr) === 'water') touchesWater = true;
          }
        }
        if (touchesWater) roadsTouchingWater += 1;
      }
    }

    const samples = [
      { label: 'road-left', expected: 'road', point: { x: 492, y: 492 } },
      { label: 'road-right', expected: 'road', point: { x: 516, y: 492 } },
      { label: 'water-left', expected: 'water', point: { x: 444, y: 492 } },
      { label: 'water-right', expected: 'water', point: { x: 564, y: 492 } },
    ].map((sample) => {
      const height = renderer.terrain.heightAt(sample.point.x, sample.point.y);
      const screen = renderer.camera.worldToScreen(sample.point, viewport, height);
      return {
        ...sample,
        actual: world.terrain.idAtPoint(sample.point),
        screen,
        inside: screen.x >= 0 && screen.x <= viewport.width &&
          screen.y >= 0 && screen.y <= viewport.height,
      };
    });

    const visibleUnitBodies = world.entities.filter((entity) => {
      const body = renderer.screenBodyOf(entity);
      return body.x + body.radius >= 0 && body.x - body.radius <= viewport.width &&
        body.y + body.radius >= 0 && body.y - body.radius <= viewport.height;
    }).length;
    const indexCount = geometry.index?.count ?? 0;
    return {
      missionId: world.mission.id,
      mapId: world.terrain.id,
      paused: useGame.getState().paused,
      selection: useGame.getState().selection,
      lowFx: renderer.lowFx,
      viewport: { ...viewport },
      distance: renderer.camera.distance,
      target: { ...renderer.camera.target },
      composition: { roads, waterTiles, roadsTouchingWater },
      samples,
      visibleUnitBodies,
      objectiveHidden: renderer.markers.group.visible === false,
      terrain: {
        baseIndexCount: geometry.userData.terrainBaseIndexCount,
        indexCount,
        drawStart: geometry.drawRange.start,
        drawCount: geometry.drawRange.count,
        roadWear: ground.userData.roadWear ?? null,
      },
      water: water === undefined ? null : {
        visible: water.visible,
        opacity: water.material.opacity,
        uuid: water.uuid,
        geometryUuid: water.geometry.uuid,
        materialUuid: water.material.uuid,
      },
      stats: { ...renderer.renderStats },
    };
  });
}

function sameResources(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validRoadWear(snapshot) {
  const { terrain } = snapshot;
  const wear = terrain.roadWear;
  return wear !== null && wear.roadTiles === 80 &&
    Number.isInteger(wear.centreMarks) && wear.centreMarks > 0 &&
    Number.isInteger(wear.edgePatches) && wear.edgePatches > 0 &&
    Number.isInteger(wear.cracks) && wear.cracks > 0 &&
    Number.isInteger(wear.triangles) && wear.triangles > 0 &&
    terrain.baseIndexCount === 9_600 &&
    terrain.indexCount === terrain.baseIndexCount + wear.triangles * 3 &&
    terrain.drawStart === 0 && terrain.drawCount === terrain.indexCount;
}

async function exerciseTerrainModes(page) {
  return page.evaluate(() => {
    const { renderer } = globalThis.__wreckright.engine;
    const resources = () => {
      const nodes = [];
      const geometries = new Set();
      const materials = new Set();
      const textures = new Set();
      renderer.scene.traverse((node) => {
        nodes.push(node.uuid);
        if (node.geometry?.uuid !== undefined) geometries.add(node.geometry.uuid);
        const owned = node.material === undefined
          ? []
          : Array.isArray(node.material) ? node.material : [node.material];
        for (const material of owned) {
          materials.add(material.uuid);
          for (const value of Object.values(material)) {
            if (value?.isTexture === true && value.uuid !== undefined) textures.add(value.uuid);
          }
        }
      });
      return {
        nodeIds: nodes.sort(), geometryIds: [...geometries].sort(),
        materialIds: [...materials].sort(), textureIds: [...textures].sort(),
        gpuGeometries: renderer.renderStats.geometries,
        gpuTextures: renderer.renderStats.textures,
      };
    };
    const ground = renderer.groundMesh;
    const water = ground.getObjectByName('water-surface');
    if (water === undefined || typeof water.setTime !== 'function') {
      throw new Error('terrain fixture requires the animated water surface');
    }
    const fullCount = ground.geometry.index?.count ?? 0;
    const baseCount = ground.geometry.userData.terrainBaseIndexCount;
    const resourcesBefore = resources();

    water.setTime(1.25);
    const first = water.material.opacity;
    water.setTime(4.75);
    const second = water.material.opacity;
    water.setTime(1.25);
    const repeated = water.material.opacity;

    renderer.setLowFx(true);
    const low = {
      drawCount: ground.geometry.drawRange.count,
      visible: water.visible,
      opacity: water.material.opacity,
    };
    water.setTime(99);
    low.opacityAfterTime = water.material.opacity;

    renderer.setLowFx(false);
    water.setTime(4.75);
    const restored = {
      drawCount: ground.geometry.drawRange.count,
      visible: water.visible,
      opacity: water.material.opacity,
    };
    return {
      baseCount,
      fullCount,
      shimmer: { first, second, repeated },
      low,
      restored,
      resourcesBefore,
      resourcesAfter: resources(),
    };
  });
}

async function recordedLowFxBudget(page) {
  await page.evaluate(() => {
    const { renderer } = globalThis.__wreckright.engine;
    renderer.setLowFx(true);
    renderer.markers.group.visible = true;
  });
  await settle(page);
  const stats = await page.evaluate(() => ({
    ...globalThis.__wreckright.engine.renderer.renderStats,
  }));
  await page.evaluate(() => {
    globalThis.__wreckright.engine.renderer.markers.group.visible = false;
  });
  return stats;
}

async function canvasShot(page, path) {
  await page.addStyleTag({ content: '.app > :not(.viewport) { visibility: hidden !important; }' });
  await settle(page);
  await page.locator('.viewport canvas:not(.perf-overlay)').screenshot({ path });
}

export async function runTerrainWearChecks({ browser, url, shots, check }) {
  process.stdout.write('\nterrain wear\n');
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const errors = watchPage(page);
  try {
    await openTerrainBattle(page, url);
    const fixture = await stageTerrainFixture(page, 255);
    const full = await inspectTerrainFixture(page);
    check(
      'terrain proof loads the daytime Causeway and freezes a clean camera',
      fixture.missionId === 'causeway_crossing' && fixture.mapId === 'causeway' &&
        fixture.paused && fixture.selection.length === 0 && fixture.distance === 255 &&
        fixture.target.x === 504 && fixture.target.y === 492,
      JSON.stringify(fixture),
    );
    check(
      'Causeway supplies eighty road tiles surrounded by its drowned valley',
      full.composition.roads === 80 && full.composition.waterTiles === 426 &&
        full.composition.roadsTouchingWater === 80,
      JSON.stringify(full.composition),
    );
    check(
      'road and water samples on both sides project inside the desktop canvas',
      full.samples.every((sample) => sample.actual === sample.expected && sample.inside),
      JSON.stringify(full.samples),
    );
    check(
      'desktop terrain proof excludes units, selection and the centre objective',
      full.visibleUnitBodies === 0 && full.selection.length === 0 && full.objectiveHidden,
      JSON.stringify({ units: full.visibleUnitBodies, selection: full.selection, objectiveHidden: full.objectiveHidden }),
    );
    check('road wear fills the full-FX extension of the existing terrain draw', validRoadWear(full), JSON.stringify(full.terrain));
    check(
      'full-FX Causeway keeps one visible water surface',
      full.water !== null && full.water.visible && full.water.opacity >= 0.12 && full.water.opacity <= 0.22,
      JSON.stringify(full.water),
    );

    const modes = await exerciseTerrainModes(page);
    check(
      'water shimmer is deterministic at an explicit presentation time',
      modes.shimmer.first === modes.shimmer.repeated &&
        modes.shimmer.first !== modes.shimmer.second &&
        [modes.shimmer.first, modes.shimmer.second].every((opacity) => opacity >= 0.12 && opacity <= 0.22),
      JSON.stringify(modes.shimmer),
    );
    check(
      'low FX restores the base terrain draw and freezes visible water at its old opacity',
      modes.low.drawCount === modes.baseCount && modes.low.visible &&
        modes.low.opacity === 0.2 && modes.low.opacityAfterTime === 0.2,
      JSON.stringify({ base: modes.baseCount, low: modes.low }),
    );
    check(
      'restoring full FX restores wear and shimmer without growing scene resources',
      modes.restored.drawCount === modes.fullCount && modes.restored.visible &&
        modes.restored.opacity === modes.shimmer.second &&
        sameResources(modes.resourcesBefore, modes.resourcesAfter),
      JSON.stringify({ restored: modes.restored, before: modes.resourcesBefore, after: modes.resourcesAfter }),
    );

    const lowBudget = await recordedLowFxBudget(page);
    check(
      'low-FX Causeway retains its exact pre-wear draw and triangle budget',
      lowBudget.calls === 19 && lowBudget.triangles === 51_956 &&
        lowBudget.geometries === 212 && lowBudget.textures === 3,
      JSON.stringify(lowBudget),
    );
    await page.evaluate(() => globalThis.__wreckright.engine.renderer.setLowFx(false));
    await canvasShot(page, `${shots}/18-terrain-wear.png`);
    check('desktop terrain fixture emits no browser errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }

  const compactContext = await browser.newContext({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    hasTouch: true,
    isMobile: true,
  });
  const compactPage = await compactContext.newPage();
  const compactErrors = watchPage(compactPage);
  try {
    await openTerrainBattle(compactPage, url);
    const fixture = await stageTerrainFixture(compactPage, 160);
    const compact = await inspectTerrainFixture(compactPage);
    check(
      'landscape terrain proof keeps road wear and water framed at touch size',
      fixture.distance === 160 && fixture.target.x === 504 && fixture.target.y === 492 &&
        compact.viewport.width === 844 && compact.viewport.height === 390 &&
        compact.samples.every((sample) => sample.actual === sample.expected && sample.inside) &&
        compact.visibleUnitBodies === 0 && compact.objectiveHidden && validRoadWear(compact) &&
        compact.water?.visible === true,
      JSON.stringify({ fixture, samples: compact.samples, terrain: compact.terrain, water: compact.water }),
    );
    await canvasShot(compactPage, `${shots}/18-terrain-wear-mobile.png`);
    check(
      'landscape terrain fixture emits no browser errors',
      compactErrors.length === 0,
      compactErrors.join(' | '),
    );
  } finally {
    await compactContext.close();
  }
}
