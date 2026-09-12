import { openDesktopBattleMenu, closeDesktopBattleMenu } from './input-safety.mjs';

async function observeCamera(page) {
  await page.evaluate(async () => {
    const { TacticalCamera } = await import('/src/render3d/camera.ts');
    const original = TacticalCamera.prototype.beginDropIn;
    const calls = [];
    TacticalCamera.prototype.beginDropIn = function (...args) {
      calls.push({ at: performance.now(), reduced: this.reducedMotion });
      return original.apply(this, args);
    };
    globalThis.__deploymentCamera = { calls };
  });
}

async function ready(page) {
  await page.waitForFunction(() => {
    const engine = globalThis.__ironmuster?.engine;
    if (!engine || !globalThis.__ironmuster.useGame.getState().ready || engine.__previousCameraFixture) return false;
    const observed = globalThis.__deploymentCamera;
    if (observed.engine !== engine) {
      observed.engine = engine;
      observed.stableSince = performance.now();
    }
    // Map changes can reconcile their saved force after the first preview is created.
    return performance.now() - observed.stableSince >= 120;
  });
  await page.getByTestId('briefing').waitFor();
}

async function markCurrentEngine(page) {
  await page.waitForFunction(() => {
    const engine = globalThis.__ironmuster?.engine;
    if (!engine) return false;
    engine.__previousCameraFixture = true;
    return true;
  });
}

export async function runDeploymentCameraChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const count = () => page.evaluate(() => globalThis.__deploymentCamera.calls.length);
  try {
    await page.addInitScript(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(url);
    await page.getByTestId('home-screen').waitFor();
    await observeCamera(page);
    await page.getByTestId('home-skirmish').click();
    await ready(page);
    check('opening a skirmish briefing does not play the deployment camera move', await count() === 0);
    const before = await page.evaluate(() => globalThis.__ironmuster.engine.renderer.camera.camera.position.toArray());
    await page.waitForTimeout(240);
    const after = await page.evaluate(() => globalThis.__ironmuster.engine.renderer.camera.camera.position.toArray());
    check('the briefing camera stays stationary while choosing a force', before.every((value, i) => Math.abs(value - after[i]) < .01));
    if (shots) await page.screenshot({ path: `${shots}/camera-briefing.png` });
    for (const [picker, value] of [
      ['briefing-faction-picker', 'aurelian'],
      ['enemy-faction-picker', 'linewrought'],
      ['player-difficulty-picker', 'veteran'],
      ['briefing-difficulty-picker', 'elite'],
      ['briefing-map-picker', 'foundry_district'],
    ]) {
      await markCurrentEngine(page);
      await page.getByTestId(picker).selectOption(value);
      await ready(page);
      check(`${picker} updates its preview without replaying the opening zoom`, await count() === 0);
    }
    await markCurrentEngine(page);
    await page.getByTestId('briefing-deploy').click();
    await page.waitForFunction(() => globalThis.__ironmuster?.useGame.getState().briefingSeen === true
      && globalThis.__ironmuster.engine.__previousCameraFixture !== true);
    check('Deploy starts exactly one opening camera move', await count() === 1);
    const running = await page.evaluate(() => {
      const camera = globalThis.__ironmuster.engine.renderer.camera;
      return camera.camera.position.y > Math.sin(camera.elevation) * camera.distance + 2;
    });
    check('the deployment camera actually starts above its tactical height', running);
    await page.waitForFunction(() => {
      const camera = globalThis.__ironmuster.engine.renderer.camera;
      return Math.abs(camera.camera.position.y - Math.sin(camera.elevation) * camera.distance) < 1;
    });
    if (shots) await page.screenshot({ path: `${shots}/camera-deployed.png` });
    await page.getByTestId('pause-button').click();
    await openDesktopBattleMenu(page);
    await closeDesktopBattleMenu(page);
    check('pausing and opening battle menus never replay the deployment move', await count() === 1);
    await openDesktopBattleMenu(page);
    await markCurrentEngine(page);
    await page.getByTestId('restart-battle').click();
    await page.waitForFunction(() => globalThis.__ironmuster?.useGame.getState().briefingSeen === true
      && globalThis.__ironmuster.engine.__previousCameraFixture !== true);
    check('an actual battle restart starts one new opening move', await count() === 2);
    await openDesktopBattleMenu(page);
    await markCurrentEngine(page);
    await page.getByTestId('choose-mission').click();
    await ready(page);
    check('returning to mission setup keeps the preview still', await count() === 2);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await markCurrentEngine(page);
    await page.getByTestId('briefing-deploy').click();
    await page.waitForFunction(() => globalThis.__ironmuster?.useGame.getState().briefingSeen === true
      && globalThis.__ironmuster.engine.__previousCameraFixture !== true);
    const reduced = await page.evaluate(() => {
      const camera = globalThis.__ironmuster.engine.renderer.camera;
      return camera.reducedMotion && Math.abs(camera.camera.position.y - Math.sin(camera.elevation) * camera.distance) < 1;
    });
    check('reduced-motion deployment goes straight to the tactical view', reduced && await count() === 3);
    check('deployment camera journey has no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
