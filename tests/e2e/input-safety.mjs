export async function checkBriefingInputSafety({
  page,
  check,
  sim,
  state,
  beforeBriefing,
  shots,
}) {
  await page.setViewportSize({ width: 1280, height: 720 });
  const clockControlsHeld =
    (await page.locator('[data-testid="pause-button"]').isDisabled()) &&
    (await page.locator('button[data-testid^="speed-"]').evaluateAll((buttons) =>
      buttons.every((button) => button instanceof HTMLButtonElement && button.disabled),
    ));
  check('desktop clock controls stay disabled until deployment', clockControlsHeld);

  const compactDesktop = await page.evaluate(() => {
    const hitIds = [
      'pause-button',
      'speed-1',
      'speed-2',
      'speed-4',
      'desktop-menu-toggle',
    ];
    const blocked = hitIds.filter((testId) => {
      const target = document.querySelector(`[data-testid="${testId}"]`);
      if (!(target instanceof HTMLElement)) return true;
      const rect = target.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === null || !target.contains(hit);
    });
    const topbar = document.querySelector('[data-testid="topbar"]');
    const children = topbar instanceof HTMLElement
      ? [...topbar.children]
          .filter((child) => child instanceof HTMLElement && getComputedStyle(child).display !== 'none')
          .map((child) => child.getBoundingClientRect())
      : [];
    const centres = children.map((rect) => rect.top + rect.height / 2);
    const overlaps = children.flatMap((left, index) =>
      children.slice(index + 1).filter((right) =>
        left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top,
      ),
    );
    return {
      blocked,
      fits: topbar instanceof HTMLElement && topbar.scrollWidth <= topbar.clientWidth + 1,
      height: topbar instanceof HTMLElement ? topbar.getBoundingClientRect().height : Infinity,
      oneLine:
        centres.length > 0 && Math.max(...centres) - Math.min(...centres) <= 2,
      overlaps: overlaps.length,
    };
  });
  check(
    '1280px briefing leaves the primary battle controls on top',
    compactDesktop.blocked.length === 0,
    compactDesktop.blocked.join(', '),
  );
  check(
    '1280px topbar is one line with no overlap',
    compactDesktop.fits && compactDesktop.oneLine && compactDesktop.overlaps === 0 && compactDesktop.height <= 54,
    JSON.stringify(compactDesktop),
  );
  check(
    'desktop secondary controls are closed by default',
    !(await page.locator('[data-testid="desktop-menu-sheet"]').isVisible()),
  );
  await openDesktopBattleMenu(page);
  const secondaryControls = await page.evaluate(() => {
    const ids = [
      'fx-toggle',
      'open-mechbay',
      'open-campaign',
      'difficulty-picker',
      'mission-picker',
      'feedback-link',
    ];
    return ids.filter((testId) => {
      const target = document.querySelector(`[data-testid="${testId}"]`);
      if (!(target instanceof HTMLElement)) return true;
      const rect = target.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit === null || !target.contains(hit);
    });
  });
  check(
    '1280px battle menu exposes every secondary control above the field',
    secondaryControls.length === 0,
    secondaryControls.join(', '),
  );
  await page.screenshot({ path: `${shots}/01-boot-1280x720.png` });

  const predeployUnit = await page.evaluate(() => {
    const { useGame, world } = globalThis.__wreckright;
    const state = useGame.getState();
    const unit = world.entities.find((entity) => entity.team === state.playerTeam);
    if (unit === undefined) throw new Error('player unit missing');
    state.setSelection([unit.id]);
    state.setOrderMode('move');
    return unit.id;
  });
  const ordersBeforePointer = await sim(page);
  const battleCanvas = await page.locator('.viewport canvas:not(.perf-overlay)').boundingBox();
  if (battleCanvas === null) throw new Error('battle canvas missing');
  await page.mouse.click(
    battleCanvas.x + 16,
    battleCanvas.y + battleCanvas.height * 0.58,
    { button: 'right' },
  );
  const ordersAfterPointer = await sim(page);
  const stateAfterPointer = await state(page);
  const beforeUnit = ordersBeforePointer.entities.find((entity) => entity.id === predeployUnit);
  const afterUnit = ordersAfterPointer.entities.find((entity) => entity.id === predeployUnit);
  check(
    'battlefield clicks cannot queue an order behind the briefing',
    JSON.stringify(afterUnit) === JSON.stringify(beforeUnit) &&
      stateAfterPointer.selection.includes(predeployUnit) &&
      stateAfterPointer.orderMode === 'move',
  );
  await page.evaluate(() => {
    const state = globalThis.__wreckright.useGame.getState();
    state.setOrderMode(null);
    state.setSelection([]);
  });

  await page.locator('[data-testid="open-mechbay"]').click();
  await page.waitForSelector('[data-testid="mechbay"]');
  check('1280px briefing leaves Mechbay navigation clickable', true);
  await page.locator('[data-testid="bay-exit"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
  await page.setViewportSize({ width: 1440, height: 900 });

  const battleCode = page.locator('[data-testid="briefing-battle-code"]');
  await battleCode.fill('Ridge Touch');
  await battleCode.press('Space');
  check(
    'Space types into the focused Battle code',
    (await battleCode.inputValue()) === 'Ridge Touch ',
    await battleCode.inputValue(),
  );
  check('focused Battle code leaves the clock held', (await sim(page)).tick === beforeBriefing);
  await battleCode.evaluate((field) => field.blur());
  const predeployState = await state(page);
  await page.keyboard.press('Space');
  check(
    'battle hotkeys do nothing before deployment',
    (await state(page)).paused === predeployState.paused &&
      (await sim(page)).tick === beforeBriefing,
  );
}

export async function clearControlFocus(page) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

export async function openDesktopBattleMenu(page) {
  const sheet = page.locator('[data-testid="desktop-menu-sheet"]');
  if (!(await sheet.isVisible())) await page.locator('[data-testid="desktop-menu-toggle"]').click();
  await sheet.waitFor({ state: 'visible' });
}

export async function closeDesktopBattleMenu(page) {
  const sheet = page.locator('[data-testid="desktop-menu-sheet"]');
  if (await sheet.isVisible()) await page.locator('[data-testid="desktop-menu-toggle"]').click();
  await sheet.waitFor({ state: 'hidden' });
}

export async function checkDeployedInputSafety({ page, check, state }) {
  await openDesktopBattleMenu(page);
  const fxToggle = page.locator('[data-testid="fx-toggle"]');
  const fxBefore = await fxToggle.innerText();
  const pauseBeforeFx = (await state(page)).paused;
  await fxToggle.focus();
  await page.keyboard.press('Space');
  check(
    'Space activates a focused battle button without pausing',
    (await fxToggle.innerText()) !== fxBefore && (await state(page)).paused === pauseBeforeFx,
  );
  await page.keyboard.press('Space');
  await clearControlFocus(page);
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true, bubbles: true }),
    );
  });
  check('a repeated toggle key does not change pause', (await state(page)).paused === pauseBeforeFx);
  await closeDesktopBattleMenu(page);
}
