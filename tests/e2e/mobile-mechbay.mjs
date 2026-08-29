async function overflowOf(page, selector) {
  return page.locator(selector).evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
}

async function fullyInViewport(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= -1 && rect.top >= -1 &&
      rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
  });
}

async function renderedTextIncludes(locator, expected) {
  return (await locator.innerText()).toLowerCase().includes(expected.toLowerCase());
}

async function selectWorkspace(page, tab) {
  const button = page.locator(`[data-workspace-tab="${tab}"]`);
  await button.scrollIntoViewIfNeeded();
  await button.tap();
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="mechbay"]')?.getAttribute('data-workspace') === expected,
    tab,
  );
}

export async function runMobileMechbayJourney({
  page,
  check,
  prefix,
  shots,
  shotLabel,
}) {
  const bay = await overflowOf(page, '[data-testid="mechbay"]');
  const outerColumns = await page.locator('[data-testid="mechbay"]').evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.trim().split(/\s+/).length,
  );
  check(`${prefix} mechbay is one column`, outerColumns === 1, `${outerColumns} columns`);
  check(
    `${prefix} mechbay has no horizontal overflow`,
    bay.scrollWidth <= bay.clientWidth + 1,
    `${bay.scrollWidth}/${bay.clientWidth}`,
  );
  const workspaceTabs = page.locator('[data-testid="bay-workspace-tabs"] [role="tab"]');
  check(
    `${prefix} workspace tabs are reachable touch targets`,
    (await workspaceTabs.count()) === 3 &&
      await workspaceTabs.evaluateAll((tabs) => tabs.every((tab) => {
        const bounds = tab.getBoundingClientRect();
        return bounds.height >= 44 && bounds.left >= 0 && bounds.right <= innerWidth;
      })),
  );
  check(
    `${prefix} opens one visible Loadout workspace`,
    (await page.locator('[data-workspace-tab="loadout"]').getAttribute('aria-selected')) === 'true' &&
      await page.locator('[data-workspace-panel="loadout"]').isVisible() &&
      !(await page.locator('[data-workspace-panel="armour"]').isVisible()) &&
      !(await page.locator('[data-workspace-panel="review"]').isVisible()),
  );
  const panelOrder = await page.evaluate(() => ({
    hardpoints: document.querySelector('.bay-grid')?.getBoundingClientRect().top ?? Infinity,
    shelf: document.querySelector('.bay-side')?.getBoundingClientRect().top ?? -Infinity,
  }));
  check(
    `${prefix} loadout keeps hardpoints before the weapon shelf`,
    panelOrder.hardpoints < panelOrder.shelf,
    `${panelOrder.hardpoints}/${panelOrder.shelf}`,
  );

  await selectWorkspace(page, 'armour');
  const armourPanel = await overflowOf(page, '[data-workspace-panel="armour"]');
  const systemTargets = page.locator(
    '[data-testid="armour-preset-balanced"], [data-testid="cooling-increase"], [data-testid="fit-sustained-cooling"]',
  );
  check(
    `${prefix} Armour & Cooling reflows without losing touch controls`,
    await page.locator('[data-testid="cooling-bank"]').isVisible() &&
      await page.locator('[data-testid="armour-workbench"]').isVisible() &&
      armourPanel.scrollWidth <= armourPanel.clientWidth + 1 &&
      await systemTargets.evaluateAll((controls) =>
        controls.length === 3 && controls.every((control) => control.getBoundingClientRect().height >= 44)),
    `${armourPanel.scrollWidth}/${armourPanel.clientWidth}`,
  );
  await page.screenshot({ path: `${shots}/14-mobile-${shotLabel}-mechbay-systems.png` });

  const paperDoll = page.locator('[data-testid="armour-paper-doll"]');
  await paperDoll.scrollIntoViewIfNeeded();
  const dollButtons = paperDoll.locator('button[data-armour-doll-location]');
  check(
    `${prefix} armour paper doll exposes eight active native location buttons`,
    (await dollButtons.count()) === 8 &&
      await dollButtons.evaluateAll((buttons) => buttons.every((button) =>
        button.tagName === 'BUTTON' && !button.disabled)),
  );
  check(
    `${prefix} armour silhouette stays out of the focus order`,
    (await paperDoll.locator('svg').count()) === 1 &&
      await paperDoll.locator('svg, svg *').evaluateAll((elements) =>
        elements.every((element) => element.tabIndex < 0)),
  );
  check(
    `${prefix} armour location buttons are touch-sized and centre hit-testable`,
    await dollButtons.evaluateAll((buttons) => buttons.length === 8 && buttons.every((button) => {
      const bounds = button.getBoundingClientRect();
      const centre = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return bounds.width >= 44 &&
        bounds.height >= 44 &&
        centre !== null &&
        (centre === button || button.contains(centre));
    })),
  );

  const leftTorso = page.locator('[data-testid="armour-doll-left_torso"]');
  await leftTorso.tap();
  check(
    `${prefix} armour paper doll selects the left torso`,
    (await leftTorso.getAttribute('aria-pressed')) === 'true' &&
      (await paperDoll.locator('[aria-pressed="true"]').count()) === 1,
  );
  const dollSlider = page.locator('[data-testid="armour-doll-slider"]');
  await dollSlider.scrollIntoViewIfNeeded();
  check(
    `${prefix} selected armour location exposes a reachable slider`,
    await fullyInViewport(page, '[data-testid="armour-doll-slider"]') &&
      (await dollSlider.boundingBox())?.height >= 44 &&
      (await dollSlider.getAttribute('aria-label')) === 'Left torso armour',
  );

  const touchStartValue = Number(await dollSlider.inputValue());
  const touchStartScroll = await page.evaluate(() => window.scrollY);
  const touchTarget = await leftTorso.boundingBox();
  if (touchTarget === null) throw new Error(`${prefix} left torso has no touch target`);
  const touchX = touchTarget.x + touchTarget.width / 2;
  const touchY = touchTarget.y + touchTarget.height / 2;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: touchX, y: touchY, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: touchX - 32, y: touchY, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await cdp.detach();
  }
  const touchValue = Number(await dollSlider.inputValue());
  check(
    `${prefix} horizontal touch drag edits armour without stealing vertical scroll`,
    touchValue < touchStartValue &&
      (await page.evaluate(() => window.scrollY)) === touchStartScroll,
    `${touchStartValue} → ${touchValue}`,
  );
  await page.locator('[data-testid="bay-undo"]').tap();
  const undoSettled = await page.waitForFunction(
    (expected) => Number(
      document.querySelector('[data-testid="armour-doll-slider"]')?.value,
    ) === expected,
    touchStartValue,
    { timeout: 2_000 },
  ).then(() => true, () => false);
  const undoValue = Number(await dollSlider.inputValue());
  check(
    `${prefix} one Undo restores the complete touch drag`,
    undoSettled && undoValue === touchStartValue,
    `${touchValue} → ${undoValue}; expected ${touchStartValue}`,
  );

  const armourLayout = await page.evaluate(() => {
    const selectors = {
      root: document.documentElement,
      mechbay: document.querySelector('[data-testid="mechbay"]'),
      panel: document.querySelector('[data-workspace-panel="armour"]'),
      workbench: document.querySelector('[data-testid="armour-workbench"]'),
      doll: document.querySelector('[data-testid="armour-paper-doll"]'),
      editorGrid: document.querySelector('.armour-workbench__editor-grid'),
      dollEditor: document.querySelector('.armour-paper-doll__editor'),
    };
    return Object.fromEntries(Object.entries(selectors).map(([name, element]) => [
      name,
      element === null ? null : {
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      },
    ]));
  });
  check(
    `${prefix} armour paper doll has no horizontal overflow`,
    Object.values(armourLayout).every((bounds) =>
      bounds !== null && bounds.scrollWidth <= bounds.clientWidth + 1),
    JSON.stringify(armourLayout),
  );
  await paperDoll.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shots}/14-mobile-${shotLabel}-armour-paper-doll.png` });

  await selectWorkspace(page, 'review');
  const review = await overflowOf(page, '[data-testid="build-review"]');
  check(
    `${prefix} Review presents the legal build without horizontal overflow`,
    await page.locator('[data-testid="build-review"]').isVisible() &&
      await renderedTextIncludes(page.locator('[data-testid="build-review-verdict"]'), 'Legal loadout') &&
      review.scrollWidth <= review.clientWidth + 1,
    `${review.scrollWidth}/${review.clientWidth}`,
  );
  await selectWorkspace(page, 'loadout');
  await page.screenshot({ path: `${shots}/14-mobile-${shotLabel}-mechbay-preview.png` });

  const beforeFit = await page.locator('[data-testid="free-tonnage"]').innerText();
  await page.locator('[data-testid="bay-location-right_torso"] .bay-location-name').tap();
  check(
    `${prefix} mechbay hardpoint selection filters the shelf`,
    (await page.locator('[data-testid="bay-location-filter"]').count()) === 1,
  );
  const mobileWeapon = page.locator('[data-testid="stock-weapon-medium_laser"]');
  await mobileWeapon.scrollIntoViewIfNeeded();
  check(
    `${prefix} filtered weapon card is visibly reachable`,
    await fullyInViewport(page, '[data-testid="stock-weapon-medium_laser"]'),
  );
  await page.screenshot({ path: `${shots}/14-mobile-${shotLabel}-mechbay-shelf.png` });
  await mobileWeapon.tap();
  await page.waitForFunction(
    () => document.activeElement?.closest('[data-testid="bay-location-right_torso"]') !== null,
  );
  check(
    `${prefix} mechbay shelf arms only a compatible target`,
    (await page.locator('[data-testid="bay-armed"]').count()) === 1 &&
      (await page.locator('.bay-location.armed-target').count()) === 1 &&
      (await page.locator('[data-testid="bay-location-right_torso"].armed-target').count()) === 1,
  );
  check(
    `${prefix} placement banner spans the location workbench`,
    await page.locator('[data-testid="bay-armed"]').evaluate((banner) => {
      const bannerBounds = banner.getBoundingClientRect();
      const gridBounds = banner.parentElement?.getBoundingClientRect();
      return gridBounds !== undefined && Math.abs(bannerBounds.width - gridBounds.width) <= 2;
    }),
  );
  await page.screenshot({ path: `${shots}/14-mobile-${shotLabel}-mechbay-placement.png` });
  await page
    .locator('[data-testid="bay-location-right_torso"] .bay-location-name')
    .tap();
  const afterFit = await page.locator('[data-testid="free-tonnage"]').innerText();
  check(
    `${prefix} mechbay location accepts the armed item`,
    beforeFit !== afterFit && (await page.locator('[data-testid="bay-armed"]').count()) === 0,
    `${beforeFit} → ${afterFit}`,
  );

  const inspect = page.locator(
    '[data-testid="bay-location-right_torso"] [data-testid^="inspect-weapon-"]',
  );
  await inspect.scrollIntoViewIfNeeded();
  const remove = page.locator(
    '[data-testid="bay-location-right_torso"] [data-testid^="remove-weapon-"]',
  );
  check(
    `${prefix} fitted-part inspect and Remove controls stay touch-sized`,
    (await inspect.boundingBox())?.height >= 44 && (await remove.boundingBox())?.height >= 44,
  );
  await inspect.tap();
  check(
    `${prefix} inspecting the fitted weapon does not remove it`,
    (await page.locator('[data-testid="free-tonnage"]').innerText()) === afterFit &&
      await renderedTextIncludes(page.locator('#bay-shelf-inspector'), 'Medium Laser'),
  );
  await remove.tap();
  check(
    `${prefix} explicit Remove restores the starting loadout`,
    (await page.locator('[data-testid="free-tonnage"]').innerText()) === beforeFit,
  );

  await page.locator('[data-testid="bay-save"]').scrollIntoViewIfNeeded();
  check(
    `${prefix} mechbay actions remain reachable`,
    await fullyInViewport(page, '[data-testid="bay-save"]'),
  );
  await page.screenshot({ path: `${shots}/14-mobile-${shotLabel}-mechbay.png` });
  await page.locator('[data-testid="bay-exit"]').tap();
  await page.waitForSelector('[data-testid="briefing"]');
  check(`${prefix} mechbay exit remains reachable`, true);
}
