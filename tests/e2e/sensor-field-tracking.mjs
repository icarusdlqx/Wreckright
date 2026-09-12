async function renderedDot(page, id) {
  await page.waitForFunction(id => {
    const { engine, world } = globalThis.__ironmuster;
    const marker = engine.renderer.scene.getObjectByName(`sensor-contact-${id}`);
    const track = world.vision.tracks.get(id);
    return marker?.visible && marker.userData.current && track && marker.position.x === track.pos.x && marker.position.z === track.pos.y;
  }, id);
  const position = await page.evaluate(id => {
    const { engine } = globalThis.__ironmuster;
    const marker = engine.renderer.scene.getObjectByName(`sensor-contact-${id}`);
    const point = engine.renderer.camera.worldToScreen({ x: marker.position.x, y: marker.position.z }, engine.renderer.viewport, marker.position.y);
    return { ...point, current: marker.userData.current, dotVisible: marker.children[0].visible,
      depthTest: marker.children[0].material.depthTest, colour: marker.children[0].material.color.getHex(),
      at: { x: marker.position.x, y: marker.position.z } };
  }, id);
  const png = await page.locator('.viewport canvas:not(.perf-overlay)').screenshot();
  const pixels = await page.evaluate(async ({ source, point }) => {
    const image = new Image(); image.src = source; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const left = Math.max(0, Math.min(image.width - 32, Math.round(point.x * devicePixelRatio) - 16));
    const top = Math.max(0, Math.min(image.height - 32, Math.round(point.y * devicePixelRatio) - 16));
    const data = ctx.getImageData(left, top, 32, 32).data;
    let red = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 160 && data[index] > data[index + 1] * 1.5 && data[index] > data[index + 2] * 1.35) red += 1;
    }
    return red;
  }, { source: `data:image/png;base64,${png.toString('base64')}`, point: position });
  return { ...position, redPixels: pixels };
}

/** Reuses the paused probe fixture and the caller's browser, including actual painted-pixel checks. */
export async function checkSensorFieldTracking({ page, url, id, check, shot }) {
  const first = await renderedDot(page, id);
  check('sensor probe paints a red field dot above intact fog', first.dotVisible && first.colour === 0xff4655 && first.depthTest === false && first.redPixels > 2, JSON.stringify(first));
  const moved = await page.evaluate(async ({ url, id }) => {
    const { engine, world } = globalThis.__ironmuster;
    const sensors = await import(new URL('src/sim/sensors.ts', url).href);
    const enemy = world.entities.find(entity => entity.id === id);
    const probe = world.reveals.find(reveal => reveal.kind === 'sensor' && reveal.team === world.playerTeam);
    const fog = `${world.vision.tiles}|${world.vision.explored}`;
    const corners = [{ x: 48, y: 48 }, { x: world.terrain.width * world.terrain.tileSize - 48, y: 48 },
      { x: 48, y: world.terrain.height * world.terrain.tileSize - 48 }];
    enemy.pos = corners.sort((a, b) => Math.hypot(b.x - probe.x, b.y - probe.y) - Math.hypot(a.x - probe.x, a.y - probe.y))[0];
    world.tick += 1;
    sensors.updateTeamVisions(world);
    engine.renderer.snapshot(world); engine.presentation.publish(null);
    engine.renderer.camera.skipDropIn(); engine.renderer.camera.centreOn(enemy.pos); engine.renderer.camera.update(engine.renderer.viewport);
    return { outside: Math.hypot(enemy.pos.x - probe.x, enemy.pos.y - probe.y) > probe.radius,
      fogUnchanged: fog === `${world.vision.tiles}|${world.vision.explored}`, optical: world.vision.visible.has(id) };
  }, { url, id });
  const second = await renderedDot(page, id);
  check('an acquired enemy keeps its painted moving dot after leaving the probe circle', moved.outside && moved.fogUnchanged && !moved.optical && second.redPixels > 2
    && JSON.stringify(second.at) !== JSON.stringify(first.at), JSON.stringify({ moved, second }));
  await shot('tracked-outside-circle');
  const expiry = await page.evaluate(async ({ url, id }) => {
    const { engine, world } = globalThis.__ironmuster;
    const sensors = await import(new URL('src/sim/sensors.ts', url).href);
    const probe = world.reveals.find(reveal => reveal.kind === 'sensor' && reveal.team === world.playerTeam);
    world.tick = probe.expiresTick - 1; sensors.updateTeamVisions(world);
    const last = structuredClone(world.vision.tracks.get(id));
    engine.forceStep();
    const enemy = world.entities.find(entity => entity.id === id);
    enemy.pos = { x: 480, y: 480 };
    sensors.updateTeamVisions(world); engine.presentation.publish(null);
    return { current: world.vision.detected.has(id), frozen: JSON.stringify(last) === JSON.stringify(world.vision.tracks.get(id)),
      probes: world.reveals.filter(reveal => reveal.kind === 'sensor').length };
  }, { url, id });
  await page.waitForFunction(id => {
    const marker = globalThis.__ironmuster.engine.renderer.scene.getObjectByName(`sensor-contact-${id}`);
    return marker?.visible && !marker.userData.current && !marker.children[0].visible;
  }, id);
  check('probe expiry removes the live dot and leaves a frozen hollow memory ring', !expiry.current && expiry.frozen && expiry.probes === 0, JSON.stringify(expiry));
  await shot('expired-memory');
}
