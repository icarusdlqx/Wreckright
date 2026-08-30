import { setTimeout as sleep } from 'node:timers/promises';
import { closeDesktopBattleMenu, clearControlFocus } from './input-safety.mjs';

function closePoint(left, right, tolerance = 0.01) {
  return Math.abs(left.x - right.x) <= tolerance && Math.abs(left.y - right.y) <= tolerance;
}

export async function runCommanderViewChecks({ page, check, shots }) {
  process.stdout.write('\ncommander view\n');
  const view = page.locator('[data-testid="commander-view"]');
  const map = page.locator('[data-testid="commander-map"]');
  const toggle = page.locator('[data-testid="commander-toggle"]');

  check(
    'Commander map is pre-mounted and hidden before use',
    (await view.count()) === 1 && !(await view.isVisible()) && (await map.count()) === 1,
  );
  await closeDesktopBattleMenu(page);
  await page.screenshot({ path: `${shots}/10-commander-field.png` });

  const startedPaused = await page.evaluate(() => globalThis.__wreckright.useGame.getState().paused);
  if (!startedPaused) {
    await page.evaluate(() => globalThis.__wreckright.engine.togglePause());
    await page.waitForFunction(() => globalThis.__wreckright.useGame.getState().paused);
  }
  await page.locator('[data-testid="lance-bar"] button').first().click();
  await toggle.click();
  await view.waitFor({ state: 'visible' });
  check(
    'Commander click-select routes through the live battle selection',
    await page.evaluate(() => globalThis.__wreckright.useGame.getState().selection.length === 1),
  );

  const mapCounts = await page.evaluate(() => {
    const { world, useGame } = globalThis.__wreckright;
    const playerTeam = useGame.getState().playerTeam;
    return {
      friendlies: world.entities.filter(
        (entity) =>
          entity.team === playerTeam &&
          !entity.destroyed &&
          !entity.withdrawn &&
          !entity.pilot.dead &&
          !entity.pilot.ejected,
      ).length,
      optical: world.entities.filter(
        (entity) => entity.team !== playerTeam && world.vision?.visible.has(entity.id),
      ).length,
      zones: world.zones.length,
    };
  });
  check(
    'Commander map shows the whole privacy-gated force picture',
    (await page.locator('.commander-chit.friendly').count()) === mapCounts.friendlies &&
      (await page.locator('.commander-chit.optical').count()) === mapCounts.optical &&
      (await page.locator('.commander-zone').count()) === mapCounts.zones,
  );

  const cameraBefore = await page.evaluate(() => ({
    ...globalThis.__wreckright.engine.renderer.camera.target,
  }));
  await page.keyboard.down('ArrowRight');
  await sleep(180);
  await page.keyboard.up('ArrowRight');
  const cameraAfter = await page.evaluate(() => ({
    ...globalThis.__wreckright.engine.renderer.camera.target,
  }));
  check('Commander arrow keys do not move the hidden field camera', closePoint(cameraBefore, cameraAfter));

  const bounds = await map.boundingBox();
  if (bounds === null) throw new Error('Commander map has no bounds');
  const points = [
    { x: bounds.width * 0.42, y: bounds.height * 0.42 },
    { x: bounds.width * 0.57, y: bounds.height * 0.38 },
    { x: bounds.width * 0.62, y: bounds.height * 0.56 },
    { x: bounds.width * 0.47, y: bounds.height * 0.66 },
  ];
  await map.click({ button: 'right', position: points[0] });
  for (const point of points.slice(1)) {
    await map.click({ button: 'right', modifiers: ['Shift'], position: point });
  }
  await page.waitForFunction(
    () => document.querySelectorAll('.commander-route.queued').length >= 3,
  );
  check(
    'four Commander waypoints render as one active and three queued legs',
    (await page.locator('.commander-route:not(.queued)').count()) === 1 &&
      (await page.locator('.commander-route.queued').count()) === 3,
  );
  check(
    'paused Commander planning still accepts live engine orders',
    await page.evaluate(() => {
      const { world, useGame } = globalThis.__wreckright;
      const selected = useGame.getState().selection[0];
      const entity = world.entities.find((entry) => entry.id === selected);
      return useGame.getState().paused && entity?.orders.move !== null && entity?.orders.queue.length === 3;
    }),
  );

  await toggle.focus();
  check(
    'Commander toggle retains an explicit Backquote shortcut while focused',
    await toggle.evaluate((element) => document.activeElement === element),
  );
  await page.keyboard.press('Backquote');
  await view.waitFor({ state: 'hidden' });
  await page.keyboard.press('Backquote');
  await view.waitFor({ state: 'visible' });
  check(
    'Backquote toggles the pre-mounted map while its button retains focus',
    await view.isVisible(),
  );

  const selectedBeforeTab = await page.evaluate(
    () => globalThis.__wreckright.useGame.getState().selection[0],
  );
  await clearControlFocus(page);
  await page.keyboard.press('Tab');
  const selectedAfterTab = await page.evaluate(
    () => globalThis.__wreckright.useGame.getState().selection[0],
  );
  check(
    'Commander hotkey leaves field Tab unit cycling intact',
    selectedAfterTab !== undefined && selectedAfterTab !== selectedBeforeTab,
  );

  const switching = await page.evaluate(async () => {
    const root = document.querySelector('[data-testid="commander-view"]');
    const mapNode = document.querySelector('[data-testid="commander-map"]');
    const button = document.querySelector('[data-testid="commander-toggle"]');
    if (!(root instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
      throw new Error('Commander switch controls are missing');
    }
    const durations = [];
    let stable = true;
    for (let index = 0; index < 24; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const hidden = !root.hidden;
      let timeout = 0;
      const committed = new Promise((resolve, reject) => {
        const observer = new MutationObserver(() => {
          if (root.hidden !== hidden) return;
          observer.disconnect();
          clearTimeout(timeout);
          resolve();
        });
        observer.observe(root, { attributes: true, attributeFilter: ['hidden'] });
        timeout = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error('Commander view did not commit its visibility change'));
        }, 250);
      });
      const before = performance.now();
      button.click();
      await committed;
      root.getBoundingClientRect();
      durations.push(performance.now() - before);
      stable &&= document.querySelector('[data-testid="commander-view"]') === root;
      stable &&= document.querySelector('[data-testid="commander-map"]') === mapNode;
    }
    durations.sort((left, right) => left - right);
    return {
      p95: durations[Math.floor((durations.length - 1) * 0.95)],
      worst: durations.at(-1),
      stable,
      visible: !root.hidden,
    };
  });
  check(
    'Commander switching costs less than one frame without remounting',
    switching.stable && switching.visible && switching.p95 < 16.67,
    JSON.stringify(switching),
  );

  await page.locator('[data-testid="lance-bar"] button').first().click();
  await page.waitForFunction(
    () => document.querySelectorAll('.commander-route.queued').length === 3,
  );
  await page.screenshot({ path: `${shots}/10-commander-plan.png` });
  await toggle.click();
  await view.waitFor({ state: 'hidden' });
  if (!startedPaused) {
    await page.evaluate(() => globalThis.__wreckright.engine.togglePause());
    await page.waitForFunction(() => !globalThis.__wreckright.useGame.getState().paused);
  }
}
