async function deployFive(page, url) {
  await page.goto(url);
  await page.getByTestId('home-skirmish').click();
  await page.getByTestId('briefing-mission-picker').selectOption('skirmish_ridge');
  await page.waitForFunction(() => globalThis.__ironmuster?.useGame.getState().ready);
  await page.getByTestId('briefing-deploy').click();
  await page.getByTestId('briefing').waitFor({ state: 'hidden' });
  await page.evaluate(async url => {
    const { engine, world, useGame } = globalThis.__ironmuster;
    engine.setPaused(true);
    const { createMech } = await import(new URL('src/sim/entity.ts', url).href);
    const friends = world.entities.filter(unit => unit.team === world.playerTeam);
    const pilot = [...world.catalog.pilots.values()].find(candidate => !friends.some(unit => unit.pilot.id === candidate.id));
    world.entities.push(createMech(world.catalog, world.rules, {
      id: Math.max(...world.entities.map(unit => unit.id)) + 1, team: world.playerTeam,
      designId: 'hornet_spotter', pilotId: pilot.id, autopilot: false,
      spawn: { x: friends[0].pos.x + 70, y: friends[0].pos.y + 60 }, facingDegrees: 0,
    }));
    engine.renderer.snapshot(world); engine.renderer.snapshot(world); engine.renderer.camera.skipDropIn();
    useGame.getState().setSelection(friends.map(unit => unit.id)); engine.presentation.publish(null);
  }, url);
  await page.waitForFunction(() => document.querySelectorAll('.pilot-lance-card').length === 5);
}

async function clearReports(page, url) {
  await page.evaluate(async url => {
    const radio = await import(new URL('src/ui/fieldRadio.ts', url).href);
    const receipts = await import(new URL('src/ui/commandReceiptState.ts', url).href);
    radio.beginFieldRadio(globalThis.__ironmuster.world); receipts.clearCommandReceipt();
  }, url);
}

async function report(page, url, long = false) {
  await page.evaluate(async ({ url, long }) => {
    const { world } = globalThis.__ironmuster;
    const radio = await import(new URL('src/ui/fieldRadio.ts', url).href);
    const receipts = await import(new URL('src/ui/commandReceiptState.ts', url).href);
    radio.observeFieldRadio(world, [{ type: 'mission_message', tick: world.tick,
      speakerPilotId: world.entities.find(unit => unit.team === world.playerTeam).pilot.id,
      text: long ? 'Keep every machine together. '.repeat(30) + 'End of transmission.'
        : 'Hold the crossing. Keep our machines together and bring every pilot home.' }]);
    receipts.acknowledgeCommand('Move confirmed · 4 mechs');
  }, { url, long });
  await page.getByTestId('field-radio').waitFor();
  await page.getByTestId('command-receipt').waitFor();
}

async function geometry(page) {
  return page.evaluate(() => {
    const bounds = element => {
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const rect = selector => bounds(document.querySelector(selector));
    const cards = [...document.querySelectorAll('.pilot-lance-card')].map(card => {
      const b = bounds(card);
      const parts = ['.pilot-portrait', '.lance-machine', '.lance-name', '.lance-chassis', '.lance-health', '.lance-status'];
      return { ...b, id: card.dataset.testid, paired: Boolean(card.querySelector('.pilot-portrait') && card.querySelector('.lance-machine')),
        contentsFit: parts.every(selector => {
          const r = rect(`[data-testid="${card.dataset.testid}"] ${selector}`);
          return r && r.y >= b.y && r.bottom <= b.bottom + 1 && r.x >= b.x && r.right <= b.right + 1;
        }) };
    });
    return { dock: rect('.pilot-command-dock, .mobile-dock'), cards, commands: rect('[data-testid="command-palette"]'),
      radio: rect('[data-testid="field-radio"]'), receipt: rect('[data-testid="command-receipt"]'),
      communications: rect('[data-testid="battle-communications"]'), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
}

function sameControls(a, b) {
  return JSON.stringify([a.dock, a.cards, a.commands]) === JSON.stringify([b.dock, b.cards, b.commands]);
}

function reportsInside(layout) {
  return [layout.radio, layout.receipt].every(r => r && r.y >= layout.communications.y
    && r.bottom <= layout.communications.bottom + 1 && r.y >= layout.dock.y && r.bottom <= layout.dock.bottom + 1);
}

async function stableReports(page, url, label, shots, check) {
  await clearReports(page, url);
  const quiet = await geometry(page);
  await report(page, url);
  const active = await geometry(page);
  check(`${label}: radio and acknowledgement use reserved dock space without moving cards or commands`,
    sameControls(quiet, active) && reportsInside(active), JSON.stringify({ quiet, active }));
  if (shots) await page.screenshot({ path: `${shots}/compact-dock-${label}.png` });
  await report(page, url, true);
  const copy = page.locator('.field-radio__copy');
  await copy.focus();
  await page.keyboard.press('End');
  await page.waitForFunction(() => document.querySelector('.field-radio__copy')?.scrollTop > 0);
  check(`${label}: long reports remain readable by keyboard inside the fixed radio slot`,
    await copy.evaluate(element => element.textContent.endsWith('End of transmission.')
      && element.scrollHeight > element.clientHeight && element.scrollTop > 0)
    && sameControls(quiet, await geometry(page)));
  await page.getByRole('button', { name: 'Dismiss radio report', exact: true }).click();
  await page.getByTestId('field-radio').waitFor({ state: 'hidden' });
  check(`${label}: dismissing radio leaves the same controls in the same positions`, sameControls(quiet, await geometry(page)));
  await page.evaluate(() => {
    const { engine, world } = globalThis.__ironmuster;
    world.support.pending.push({ call: 'repair_truck', team: world.playerTeam, target: { ...world.entities[0].pos },
      heading: 0, resolveTick: world.tick + Math.round(30 / world.dt) });
    engine.presentation.publish(null);
  });
  await page.getByTestId('support-status').waitFor();
  await page.getByTestId('support-status').locator('summary').click();
  check(`${label}: support details open without resizing the card and command rows`,
    sameControls(quiet, await geometry(page)) && await page.getByTestId('support-status-queued').isVisible()
    && await page.getByTestId('support-status').locator('summary').evaluate(summary => {
      const r = summary.getBoundingClientRect(); const dock = summary.closest('[data-testid="battle-communications"]').getBoundingClientRect();
      return r.top >= dock.top && r.bottom <= dock.bottom + 1;
    }));
  await page.getByTestId('support-status').locator('summary').click();
  await page.evaluate(() => {
    const { engine, world } = globalThis.__ironmuster;
    world.support.pending.length = 0; engine.presentation.publish(null);
  });
}

/** Presentation fixtures only; radio dismissal, disclosures and keyboard scrolling are real input. */
export async function runCompactCommandDockChecks({ browser, url, shots, check }) {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await desktop.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await deployFive(page, url);
    for (const [width, height] of [[1440, 900], [1280, 720], [1920, 1080], [1024, 768]]) {
      await page.setViewportSize({ width, height });
      const layout = await geometry(page);
      check(`${width}: five paired cards are at most 110px tall and fit inside a 180px dock`,
        layout.dock.height <= 180 && layout.cards.length === 5 && !layout.overflow
        && layout.cards.every(card => card.height <= 110 && card.paired && card.contentsFit), JSON.stringify(layout));
      await stableReports(page, url, String(width), shots, check);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    const fixtures = await page.evaluateHandle(() => [...globalThis.__ironmuster.world.entities]);
    const ids = await page.evaluate(() => globalThis.__ironmuster.world.entities
      .filter(unit => unit.team === globalThis.__ironmuster.world.playerTeam).map(unit => unit.id));
    // Paused battlefield fixture varies the deployed count; no campaign is created or changed.
    for (const count of [1, 2, 3, 4, 5]) {
      await page.evaluate(({ count, entities }) => {
        const { engine, world, useGame } = globalThis.__ironmuster;
        const friends = entities.filter(unit => unit.team === world.playerTeam).slice(0, count);
        world.entities.splice(0, world.entities.length, ...entities.filter(unit => unit.team !== world.playerTeam), ...friends);
        useGame.getState().setSelection(friends.map(unit => unit.id));
        engine.presentation.publish(null);
      }, { count, entities: fixtures });
      await page.waitForFunction(count => document.querySelectorAll('.pilot-lance-card').length === count, count);
      const layout = await geometry(page);
      check(`${count} deployed: paired cards remain readable without stretching across the whole screen`,
        layout.cards.length === count && layout.cards.every(card => card.width <= 211 && card.contentsFit && card.paired)
        && layout.cards.map(card => Number(card.id.split('-').at(-1))).every((id, index) => id === ids[index]), JSON.stringify(layout.cards));
    }
    await fixtures.dispose();
    await page.getByTestId('tactics-toggle').click();
    check('Tactics keeps group ability explanations reachable alongside advanced orders',
      await page.getByTestId('tactics-drawer').isVisible() && await page.getByTestId('selection-abilities').isVisible()
      && await page.getByTestId('command-run').isVisible());
    check('desktop compact dock has no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await desktop.close(); }
  for (const [width, height] of [[390, 844], [844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
    const mobile = await context.newPage(); const errors = [];
    mobile.on('pageerror', error => errors.push(error.message));
    try {
      await deployFive(mobile, url);
      const layout = await geometry(mobile);
      const actions = await mobile.locator('.mobile-lance-action, .mobile-dock-tabs button, .mobile-tray .command').evaluateAll(buttons =>
        buttons.map(button => {
          const r = button.getBoundingClientRect();
          return { label: button.textContent.trim(), visible: button.checkVisibility(), width: r.width, height: r.height };
        }));
      check(`${width} touch: paired card details fit and actions keep 44px touch targets`,
        layout.cards[0].contentsFit && layout.cards[0].paired && !layout.overflow
        && actions.filter(button => button.visible).every(button => button.height >= 44 && button.width >= 44), JSON.stringify({ layout, actions }));
      await stableReports(mobile, url, `touch-${width}`, shots, check);
      await mobile.getByTestId('tactics-toggle').click();
      check(`${width} touch: group ability explanations remain accessible within the Tactics drawer`,
        await mobile.getByTestId('selection-abilities').isVisible()
        && await mobile.getByTestId('selection-abilities').evaluate(element => {
          const drawer = element.closest('.tactics-drawer').getBoundingClientRect();
          return element.getBoundingClientRect().width >= drawer.width - 22;
        }));
      check(`${width} touch dock has no browser errors`, errors.length === 0, errors.join('\n'));
    } finally { await context.close(); }
  }
}
