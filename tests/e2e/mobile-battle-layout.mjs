async function verifyStatusLayout({ page, check, prefix }) {
  const coach = page.locator('[data-testid="training-coach"]');
  if (!(await coach.evaluate((element) => element.open))) await coach.locator('summary').tap();
  const layout = await page.evaluate(() => {
    const element = (id) => document.querySelector(`[data-testid="${id}"]`);
    const paused = element('paused-banner')?.getBoundingClientRect();
    const minimap = element('minimap')?.getBoundingClientRect();
    const objectives = element('objective-list')?.getBoundingClientRect();
    const coach = element('training-coach');
    const coachBounds = coach?.getBoundingClientRect();
    const summary = element('objective-list')?.querySelector('summary');
    const summaryBounds = summary?.getBoundingClientRect();
    const hit = summaryBounds === undefined ? null : document.elementFromPoint(
      summaryBounds.left + summaryBounds.width / 2, summaryBounds.top + summaryBounds.height / 2,
    );
    const overlaps = (a, b) => a !== undefined && b !== undefined
      && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    return {
      statusClear: !overlaps(paused, minimap) && !overlaps(paused, objectives),
      missionClear: coach instanceof HTMLDetailsElement && coach.open
        && !overlaps(coachBounds, summaryBounds) && summary?.contains(hit) === true,
      paused, minimap, objectives, coachBounds, summaryBounds,
    };
  });
  check(`${prefix} pause notice has its own strip above the minimap and objectives`,
    layout.statusClear, JSON.stringify(layout));
  check(`${prefix} Mission summary remains touchable with the range coach open`,
    layout.missionClear, JSON.stringify(layout));

  const mission = page.locator('[data-testid="objective-list"]');
  await mission.locator('summary').tap();
  await page.waitForFunction(() => document.querySelector('[data-testid="objective-list"]')?.open === true);
  const readable = await mission.evaluate((element) => {
    const body = element.querySelector('.objective-body');
    const bounds = body?.getBoundingClientRect();
    const dock = document.querySelector('[data-testid="mobile-dock"]')?.getBoundingClientRect();
    if (bounds === undefined || dock === undefined) return false;
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return bounds.bottom <= dock.top && body?.contains(hit) === true;
  });
  check(`${prefix} Mission opens readable objectives above the command dock`, readable);
  await mission.locator('summary').tap();
}

/** CSS environment insets are zero in emulation, so exercise the home-indicator space explicitly. */
export async function verifyMobileStatusLayout({ page, check, prefix }) {
  await verifyStatusLayout({ page, check, prefix });
  const shortLandscape = await page.evaluate(() =>
    matchMedia('(orientation: landscape) and (max-height: 500px)').matches);
  if (!shortLandscape) return;
  const app = page.locator('.app');
  const previous = await app.evaluate((element) => {
    const saved = { value: element.style.getPropertyValue('--safe-bottom'),
      priority: element.style.getPropertyPriority('--safe-bottom') };
    element.style.setProperty('--safe-bottom', '21px');
    return saved;
  });
  try {
    await verifyStatusLayout({ page, check, prefix: `${prefix} with 21px bottom safe area` });
    const geometry = await app.evaluate((element) => {
      const coach = element.querySelector('[data-testid="training-coach"]');
      const dock = element.querySelector('[data-testid="mobile-dock"]');
      const summary = coach?.querySelector('summary');
      const coachBounds = coach?.getBoundingClientRect();
      const dockBounds = dock?.getBoundingClientRect();
      const summaryBounds = summary?.getBoundingClientRect();
      const hit = summaryBounds === undefined ? null : document.elementFromPoint(
        summaryBounds.left + summaryBounds.width / 2, summaryBounds.top + summaryBounds.height / 2,
      );
      return {
        inset: Number.parseFloat(getComputedStyle(element).getPropertyValue('--safe-bottom')),
        coachClear: coachBounds !== undefined && dockBounds !== undefined
          && coachBounds.bottom <= dockBounds.top && summary?.contains(hit) === true,
        coachBounds, dockBounds, summaryBounds,
      };
    });
    check(`${prefix} 21px safe area keeps the coach summary touchable above the dock`,
      geometry.inset === 21 && geometry.coachClear, JSON.stringify(geometry));
  } finally {
    await app.evaluate((element, saved) => {
      if (saved.value === '') element.style.removeProperty('--safe-bottom');
      else element.style.setProperty('--safe-bottom', saved.value, saved.priority);
    }, previous);
  }
}
