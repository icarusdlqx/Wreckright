/** Five-machine layout fixture; selection, orders and disclosures use real controls. */
export async function runPilotCommandDockChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing-mission-picker').selectOption('skirmish_ridge');
    await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().ready);
    await page.getByTestId('briefing-deploy').click();
    await page.getByTestId('briefing').waitFor({ state: 'hidden' });
    const fixture = await page.evaluate(async url => {
      const { engine, world, useGame } = globalThis.__wreckright;
      engine.setPaused(true);
      const { createMech } = await import(new URL('src/sim/entity.ts', url).href);
      const friends = world.entities.filter(unit => unit.team === world.playerTeam);
      const pilot = [...world.catalog.pilots.values()].find(candidate => !friends.some(unit => unit.pilot.id === candidate.id));
      const first = friends[0];
      const fifth = createMech(world.catalog, world.rules, {
        id: Math.max(...world.entities.map(unit => unit.id)) + 1, team: world.playerTeam,
        designId: 'hornet_spotter', pilotId: pilot.id, autopilot: false,
        spawn: { x: first.pos.x + 70, y: first.pos.y + 60 }, facingDegrees: 0,
      });
      world.entities.push(fifth);
      engine.renderer.snapshot(world); engine.renderer.snapshot(world);
      engine.renderer.camera.skipDropIn();
      useGame.getState().setSelection(friends.map(unit => unit.id));
      engine.presentation.publish(null);
      return { ids: [...friends, fifth].map(unit => unit.id), fifth: fifth.id, pilotId: pilot.id };
    }, url);
    const cards = page.getByTestId('lance-bar').locator('.lance-card');
    await page.waitForFunction(() => document.querySelectorAll('.pilot-lance-card').length === 5);
    check('battle starts with essential details and the tall inspector explicitly folded',
      !(await page.getByTestId('sidebar').isVisible())
      && await page.getByTestId('unit-details-toggle').getAttribute('aria-expanded') === 'false'
      && await page.getByTestId('dock-damage').isVisible());
    for (const [width, height] of [[1440, 1000], [1024, 768]]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => {
        const map = document.querySelector('[data-testid="minimap"]').getBoundingClientRect();
        const deck = document.querySelector('.pilot-command-dock').getBoundingClientRect();
        const commands = document.querySelector('[data-testid="command-palette"]').getBoundingClientRect();
        const cards = [...document.querySelectorAll('.pilot-lance-card')].map(card => {
          const box = card.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom,
            portrait: card.querySelector('.pilot-portrait') !== null, machine: card.querySelector('.lance-machine') !== null };
        });
        return { five: cards.length === 5, order: cards.every((card, index) => index === 0 || card.left > cards[index - 1].right),
          clear: cards.every(card => card.left >= map.right && card.right <= commands.left && card.top >= deck.top && card.bottom <= innerHeight),
          paired: cards.every(card => card.portrait && card.machine), mapLeft: map.left < innerWidth / 4 && map.bottom > innerHeight * .7,
          overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      check(`${width}: five paired cards sit between the minimap and commands without hiding a berth`,
        layout.five && layout.order && layout.clear && layout.paired && layout.mapLeft && !layout.overflow, JSON.stringify(layout));
      if (shots) await page.screenshot({ path: `${shots}/pilot-dock-${width}.png` });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByTestId(`lance-card-${fixture.fifth}`).click();
    check('the fifth portrait selects its paired mech without changing deployment order',
      await page.evaluate(fixture => {
        const { useGame } = globalThis.__wreckright;
        const order = [...document.querySelectorAll('.pilot-lance-card')].map(card => Number(card.dataset.testid.split('-').at(-1)));
        return useGame.getState().selection.length === 1 && useGame.getState().selection[0] === fixture.fifth
          && JSON.stringify(order) === JSON.stringify(fixture.ids);
      }, fixture));
    await page.getByTestId('unit-details-toggle').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.classList.contains('unit-inspector-close'));
    check('keyboard Show details opens the complete condition and weapon inspector',
      await page.getByTestId('sidebar').isVisible() && await page.getByTestId('sidebar').getByTestId('weapon-groups').isVisible()
      && await page.getByTestId('sidebar').getByRole('button', { name: 'Hide details', exact: true })
        .evaluate(button => document.activeElement === button));
    if (shots) await page.screenshot({ path: `${shots}/pilot-dock-inspector.png` });
    let weaponsReached = false;
    for (let step = 0; step < 32 && !weaponsReached; step += 1) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => ({
        weapons: Boolean(document.activeElement?.closest('[data-testid="weapon-groups"]')),
        inspector: Boolean(document.activeElement?.closest('[data-testid="sidebar"]')),
      }));
      weaponsReached = focus.weapons;
      if (!focus.inspector) break;
    }
    check('Tab reaches weapon controls from the opened inspector without returning through the dock', weaponsReached);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[data-testid="sidebar"]')?.hidden
      && document.activeElement?.getAttribute('data-testid') === 'unit-details-toggle');
    check('Escape from inspector controls closes details and returns keyboard focus to its toggle',
      !(await page.getByTestId('sidebar').isVisible())
      && await page.getByTestId('unit-details-toggle').evaluate(button => document.activeElement === button)
      && await page.getByTestId(`lance-card-${fixture.fifth}`).getAttribute('aria-pressed') === 'true');
    await page.keyboard.press('Enter');
    await page.getByTestId('sidebar').getByRole('button', { name: 'Hide details', exact: true }).click();
    check('Hide details frees the field while retaining its selected portrait',
      !(await page.getByTestId('sidebar').isVisible()) && await page.getByTestId(`lance-card-${fixture.fifth}`).getAttribute('aria-pressed') === 'true'
      && await page.getByTestId('unit-details-toggle').evaluate(button => document.activeElement === button));
    await page.getByTestId('commander-toggle').click();
    await page.getByTestId('commander-map').click({ button: 'right', position: { x: 220, y: 200 } });
    await page.getByTestId('field-radio').waitFor();
    check('a move order illuminates the speaking pilot and moves the correct paired mech',
      await page.getByTestId(`lance-card-${fixture.fifth}`).getAttribute('data-speaking') === 'true'
      && await page.evaluate(id => globalThis.__wreckright.world.entities.find(unit => unit.id === id).orders.move !== null, fixture.fifth));
    if (shots) await page.screenshot({ path: `${shots}/pilot-dock-radio.png` });
    await page.getByRole('button', { name: 'Dismiss radio report', exact: true }).click();
    check('dismissing radio clears its portrait signal without changing the selected mech',
      await page.getByTestId(`lance-card-${fixture.fifth}`).getAttribute('data-speaking') === null
      && await page.getByTestId(`lance-card-${fixture.fifth}`).getAttribute('aria-pressed') === 'true');
    await page.getByTestId('commander-toggle').click();
    await page.evaluate(ids => {
      const { world, engine } = globalThis.__wreckright;
      const destroyed = world.entities.find(unit => unit.id === ids[0]);
      destroyed.destroyed = true; destroyed.killMethod = 'centre_torso';
      const ejected = world.entities.find(unit => unit.id === ids[1]);
      ejected.pilot.ejected = true;
      engine.presentation.publish(null);
    }, fixture.ids);
    check('a destroyed mech and ejected pilot keep their berths without inventing a KIA',
      await cards.count() === 5 && (await cards.nth(0).innerText()).includes('Mech destroyed')
      && await cards.nth(0).getByRole('meter').getAttribute('aria-valuenow') === '0'
      && (await cards.nth(1).innerText()).includes('Pilot ejected') && !(await cards.allTextContents()).join(' ').includes('Pilot KIA'));
    if (shots) await page.screenshot({ path: `${shots}/pilot-dock-casualties.png` });
    check('pilot command dock has no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
