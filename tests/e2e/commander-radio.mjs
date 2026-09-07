/** A real movement remark must not intercept the map; its dismiss button stays interactive. */
export async function runCommanderRadioChecks({ browser, url, shots, check }) {
  process.stdout.write('\nCommander radio hit testing\n');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing-mission-picker').selectOption('skirmish_ridge');
    await page.waitForFunction(() => globalThis.__wreckright?.world.mission.id === 'skirmish_ridge'
      && globalThis.__wreckright.useGame.getState().ready);
    await page.getByTestId('briefing-deploy').click();
    await page.getByTestId('briefing').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => {
      const test = globalThis.__wreckright;
      return test?.useGame.getState().ready && test.useGame.getState().briefingSeen && test.engine.world === test.world;
    });
    if (!await page.evaluate(() => globalThis.__wreckright.useGame.getState().paused)) {
      await page.getByTestId('pause-button').click();
    }
    await page.getByTestId('lance-bar').locator('button').first().click();
    await page.getByTestId('commander-toggle').click();
    await page.getByTestId('commander-view').waitFor();
    const map = page.getByTestId('commander-map');
    await map.click({ button: 'right', position: { x: 420, y: 350 } });
    const radio = page.getByTestId('field-radio');
    await radio.waitFor();
    const fixture = await page.evaluate(() => {
      const { world, useGame } = globalThis.__wreckright;
      const radio = document.querySelector('[data-testid="field-radio"]');
      const body = radio.querySelector('div').getBoundingClientRect();
      const map = document.querySelector('[data-testid="commander-map"]');
      const point = map.createSVGPoint();
      point.x = body.left + body.width * .45;
      point.y = body.top + body.height * .5;
      const worldPoint = point.matrixTransform(map.getScreenCTM().inverse());
      const friend = world.entities.find(unit => unit.team === world.playerTeam && !unit.destroyed
        && !useGame.getState().selection.includes(unit.id));
      if (!friend) throw Error('Radio hit test requires a second friendly mech.');
      friend.pos = { x: worldPoint.x, y: worldPoint.y };
      useGame.getState().patch({ tick: useGame.getState().tick + 1 });
      return { id: friend.id, x: point.x, y: point.y };
    });
    await page.waitForFunction(({ id, x, y }) => document.elementFromPoint(x, y)
      ?.closest('[data-commander-id]')?.getAttribute('data-commander-id') === String(id), fixture);
    check('a routine radio body leaves its underlying Commander chit hit-testable', true);
    await page.mouse.click(fixture.x, fixture.y);
    check('a physical mouse click through the radio selects the underlying mech without dismissing the remark',
      await page.evaluate(id => {
        const selected = globalThis.__wreckright.useGame.getState().selection;
        return selected.length === 1 && selected[0] === id;
      }, fixture.id) && await radio.isVisible());
    if (shots) await page.screenshot({ path: `${shots}/commander-radio-click-through.png` });
    await page.getByRole('button', { name: 'Dismiss radio report', exact: true }).click();
    await radio.waitFor({ state: 'hidden' });
    check('the radio dismiss button still receives clicks without changing Commander selection',
      await page.evaluate(id => globalThis.__wreckright.useGame.getState().selection[0] === id, fixture.id));
    check('radio click-through journey has no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
