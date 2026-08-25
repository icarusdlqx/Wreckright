async function overflowOf(page, selector) {
  return page.locator(selector).evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
}

async function fullyInViewport(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
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
