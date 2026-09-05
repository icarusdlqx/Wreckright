export async function companyFile(page, testId) {
  const files = page.locator('[data-testid="camp-files"]');
  if ((await files.getAttribute('open')) === null) {
    await page.locator('[data-testid="camp-files-toggle"]').click();
  }
  await page.locator(`[data-testid="${testId}"]`).click();
}

export async function restartCompany(page) {
  await companyFile(page, 'camp-restart');
  await page.locator('[data-testid="camp-restart-confirm"]').click();
}

export async function checkRestartCancellation({ page, check }) {
  const saved = await page.evaluate(() => localStorage.getItem('ironline.campaign'));
  await companyFile(page, 'camp-restart');
  check('restart confirmation begins on the non-destructive action', await page.locator('[data-testid="camp-restart-cancel"]').evaluate((button) => button === document.activeElement));
  await page.keyboard.press('Escape');
  check('Escape cancels restart, keeps the company and restores focus',
    (await page.evaluate(() => localStorage.getItem('ironline.campaign'))) === saved &&
    await page.locator('[data-testid="camp-restart"]').evaluate((button) => button === document.activeElement));
  await page.locator('[data-testid="camp-restart"]').click();
  await page.locator('[data-testid="camp-restart-cancel"]').click();
  check('Cancel leaves the stored campaign byte-for-byte intact', (await page.evaluate(() => localStorage.getItem('ironline.campaign'))) === saved);
  await page.locator('[data-testid="camp-files-toggle"]').click();
}

export async function checkCompanyWorkspaces({ page, shots, check }) {
  const saved = await page.evaluate(() => localStorage.getItem('ironline.campaign'));
  await page.locator('[data-testid="camp-area-workshop"]').click();
  check('Workshop exposes the machines without unrelated contract controls',
    await page.locator('[data-testid="camp-bay"]').isVisible() &&
    !(await page.locator('[data-testid="camp-contract"]').isVisible()));
  await page.screenshot({ path: `${shots}/08-workshop.png` });
  const refit = page.locator('[data-testid^="camp-refit-"]:enabled').first();
  if (await refit.count()) {
    await refit.click();
    await page.waitForSelector('[data-testid="refit-bay"]');
    check('the workshop opens the existing detailed refit bay directly', await page.locator('[data-testid="refit-bay"]').isVisible());
    await page.keyboard.press('Escape');
    check('closing a workshop refit restores its launch control', await refit.evaluate((button) => button === document.activeElement));
  }
  await page.locator('[data-testid="camp-area-crew"]').click();
  check('Crew exposes pilot progression and hides the workshop',
    await page.locator('[data-testid="camp-roster"]').isVisible() &&
    !(await page.locator('[data-testid="camp-bay"]').isVisible()));
  await page.screenshot({ path: `${shots}/08-crew.png` });
  await page.locator('[data-testid="camp-area-supplies"]').click();
  check('Stores and yard exposes both the inventory and parts counter',
    await page.locator('[data-testid="camp-store"]').isVisible() &&
    await page.locator('[data-testid="camp-market"]').isVisible());
  await page.screenshot({ path: `${shots}/08-stores-yard.png` });
  await page.locator('[data-testid="camp-area-operations"]').click();
  check('Operations restores the contract board and navigation leaves the save intact',
    await page.locator('[data-testid="camp-map"]').isVisible() &&
    (await page.evaluate(() => localStorage.getItem('ironline.campaign'))) === saved);
}
