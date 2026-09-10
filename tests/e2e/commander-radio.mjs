/** Radio stays inside the command dock and never covers the playable Commander map. */
export async function runCommanderRadioChecks({ browser, url, shots, check }) {
  process.stdout.write('\nCommander radio docking\n');
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
    const map = page.getByTestId('commander-map');
    await map.click({ button: 'right', position: { x: 220, y: 220 } });
    const radio = page.getByTestId('field-radio');
    await radio.waitFor();
    await page.waitForFunction(() => {
      const map = document.querySelector('[data-testid="commander-map"]').getBoundingClientRect();
      const dock = document.querySelector('.tactical-command-deck').getBoundingClientRect();
      return map.bottom <= dock.top;
    });
    const layout = await page.evaluate(() => {
      const bounds = selector => document.querySelector(selector)?.getBoundingClientRect();
      const map = bounds('[data-testid="commander-map"]');
      const radio = bounds('[data-testid="field-radio"]');
      const dock = bounds('.tactical-command-deck');
      const top = bounds('[data-testid="topbar"]');
      const contacts = bounds('[data-testid="hostile-bar"]');
      return {
        radioDocked: radio.top >= dock.top && radio.bottom <= dock.bottom && map.bottom <= radio.top,
        pairedCards: [...document.querySelectorAll('.lance-card')].every(card => {
          const rect = card.getBoundingClientRect();
          return rect.height <= 110 && rect.top >= dock.top && rect.bottom <= dock.bottom
            && card.querySelector('.pilot-portrait') !== null && card.querySelector('.lance-machine') !== null;
        }),
        topAttached: Math.abs(top.bottom - contacts.top) <= 1,
        map, radio, dock,
      };
    });
    check('radio sits inside the command dock and outside the Commander map', layout.radioDocked, JSON.stringify(layout));
    check('paired pilot and mech cards stay inside the command dock', layout.pairedCards, JSON.stringify(layout));
    // Contacts intentionally hide in Commander mode; check physical field layout on return below.
    const selected = await page.evaluate(() => globalThis.__wreckright.useGame.getState().selection);
    if (shots) await page.screenshot({ path: `${shots}/commander-radio-docked.png` });
    await page.getByRole('button', { name: 'Dismiss radio report', exact: true }).click();
    await radio.waitFor({ state: 'hidden' });
    check('dismissing a docked report leaves the selection unchanged',
      JSON.stringify(await page.evaluate(() => globalThis.__wreckright.useGame.getState().selection)) === JSON.stringify(selected));
    await page.getByTestId('commander-toggle').click();
    const contactsAttached = await page.evaluate(() => {
      const top = document.querySelector('[data-testid="topbar"]').getBoundingClientRect();
      const contacts = document.querySelector('[data-testid="hostile-bar"]').getBoundingClientRect();
      return Math.abs(top.bottom - contacts.top) <= 1;
    });
    check('field contacts attach directly beneath the header', contactsAttached);
    if (shots) await page.screenshot({ path: `${shots}/combat-command-workspace.png` });
    check('radio docking journey has no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
