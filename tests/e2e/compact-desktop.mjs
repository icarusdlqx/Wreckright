const CASES = [
  { width: 792, height: 830, touch: false, compact: true },
  { width: 900, height: 830, touch: false, compact: true },
  { width: 1024, height: 768, touch: false, compact: false },
  { width: 1024, height: 768, touch: true, compact: true },
];

async function mapPosition(page, point) {
  return page.getByTestId('commander-map').evaluate((map, target) => {
    const bounds = map.getBoundingClientRect();
    const size = map.viewBox.baseVal;
    const scale = Math.min(bounds.width / size.width, bounds.height / size.height);
    return { x: (bounds.width - size.width * scale) / 2 + target.x * scale,
      y: (bounds.height - size.height * scale) / 2 + target.y * scale };
  }, point);
}

/** Width and pointer regression. Only fixture placement uses dev hooks; orders use real controls. */
export async function runCompactDesktopChecks({ browser, url, shots, check }) {
  process.stdout.write('\ncompact desktop Commander\n');
  for (const example of CASES) {
    const label = `${example.touch ? 'coarse' : 'fine'} ${example.width}×${example.height}`;
    const context = await browser.newContext({ viewport: { width: example.width, height: example.height },
      hasTouch: example.touch, isMobile: example.touch, reducedMotion: 'reduce' });
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
        return test?.useGame.getState().ready && test.useGame.getState().briefingSeen
          && test.engine.world === test.world;
      });
      if (!await page.evaluate(() => globalThis.__wreckright.useGame.getState().paused)) {
        await page.getByTestId('pause-button').click();
      }
      check(`${label} selects the intended HUD without changing the pointer device`,
        await page.locator('.mobile-topbar').count() === Number(example.compact)
        && await page.evaluate(() => matchMedia('(pointer: coarse)').matches) === example.touch);
      const fixture = await page.evaluate(() => {
        const { world, useGame } = globalThis.__wreckright;
        const friends = world.entities.filter(unit => unit.team === world.playerTeam && !unit.destroyed);
        if (friends.length < 2) throw Error('Commander input check requires two friendly mechs.');
        friends[0].pos = { x: 300, y: 600 };
        friends[1].pos = { x: 500, y: 600 };
        useGame.getState().patch({ tick: useGame.getState().tick + 1, selection: [],
          orderMode: null, supportMode: null, queueOrders: false });
        return { first: friends[0].id, second: friends[1].id };
      });
      await page.getByTestId(example.compact ? 'mobile-commander-toggle' : 'commander-toggle').click();
      await page.getByTestId('commander-view').waitFor();
      const geometry = await page.getByTestId('commander-map').evaluate(map => {
        const bounds = map.getBoundingClientRect();
        const size = map.viewBox.baseVal;
        const scale = Math.min(bounds.width / size.width, bounds.height / size.height);
        const left = bounds.left + (bounds.width - size.width * scale) / 2;
        const top = bounds.top + (bounds.height - size.height * scale) / 2;
        const hits = [.2, .5, .8].flatMap(x => [.2, .5, .8].map(y => map.contains(
          document.elementFromPoint(left + size.width * scale * x, top + size.height * scale * y))));
        const dock = document.querySelector('[data-testid="mobile-dock"]')?.getBoundingClientRect();
        return { width: bounds.width, drawnWidth: size.width * scale, drawnHeight: size.height * scale,
          clear: hits.every(Boolean), dockClear: !dock || bounds.bottom <= dock.top,
          overflow: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      check(`${label} leaves the Commander map large, unobstructed and above the command dock`,
        geometry.drawnWidth > 400 && geometry.drawnHeight > 400 && geometry.clear && geometry.dockClear && !geometry.overflow
        && (!example.compact || geometry.width > example.width * .9), JSON.stringify(geometry));
      const first = page.getByTestId(`commander-chit-${fixture.first}`).locator('.commander-chit-hit');
      const second = page.getByTestId(`commander-chit-${fixture.second}`).locator('.commander-chit-hit');
      const map = page.getByTestId('commander-map');
      const pointA = await mapPosition(page, { x: 420, y: 420 });
      const pointB = await mapPosition(page, { x: 600, y: 300 });
      if (example.touch) {
        await first.tap();
        await map.tap({ position: pointA });
        await page.waitForFunction(id => globalThis.__wreckright.world.entities.find(unit => unit.id === id)?.orders.move !== null, fixture.first);
        check(`${label} touch selects a mech and tap-moves without a mouse button`,
          await page.evaluate(id => globalThis.__wreckright.useGame.getState().selection.includes(id), fixture.first));
      } else {
        await first.click();
        await second.click({ modifiers: ['Shift'] });
        check(`${label} Shift-click adds a second mech to mouse selection`, await page.evaluate(({ first, second }) => {
          const selected = globalThis.__wreckright.useGame.getState().selection;
          return selected.length === 2 && selected.includes(first) && selected.includes(second);
        }, fixture));
        await second.click({ modifiers: ['Shift'] });
        check(`${label} Shift-click toggles that mech back out`, await page.evaluate(id => {
          const selected = globalThis.__wreckright.useGame.getState().selection;
          return selected.length === 1 && selected[0] === id;
        }, fixture.first));
        await map.click({ button: 'right', position: pointA });
        await page.waitForFunction(id => globalThis.__wreckright.world.entities.find(unit => unit.id === id)?.orders.move !== null, fixture.first);
        await map.click({ button: 'right', modifiers: ['Shift'], position: pointB });
        await page.waitForFunction(id => globalThis.__wreckright.world.entities.find(unit => unit.id === id)?.orders.queue.length === 1, fixture.first);
        check(`${label} right-click moves and Shift-right-click queues a second waypoint`, true);
        await map.click({ position: pointA });
        check(`${label} plain mouse ground click deselects without replacing the route`, await page.evaluate(id => {
          const { world, useGame } = globalThis.__wreckright;
          return useGame.getState().selection.length === 0 && world.entities.find(unit => unit.id === id).orders.queue.length === 1;
        }, fixture.first));
        await first.click();
      }
      if (shots) await page.screenshot({ path: `${shots}/commander-${example.touch ? 'coarse' : 'fine'}-${example.width}.png` });
      check(`${label} responsive Commander produces no browser errors`, errors.length === 0, errors.join('\n'));
    } finally {
      await context.close();
    }
  }
}
