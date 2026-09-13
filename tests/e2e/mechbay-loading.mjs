import { openCompanyTools } from './unified-navigation.mjs';
import { checkCompanyWorkspaces } from './campaign-navigation.mjs';
import { clickFittingAction } from './fitting-actions.mjs';

/** Development-server regression: hold the deferred module so cold loading is deterministic. */
export async function runColdMechbayChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const deferred = [];
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/src/ui/mechbay/Mechbay.tsx*', route => new Promise(resolve => deferred.push({ route, resolve })));
  const release = async () => {
    await Promise.all(deferred.splice(0).map(async pending => { try { await pending.route.continue(); } finally { pending.resolve(); } }));
    await page.unroute('**/src/ui/mechbay/Mechbay.tsx*');
  };
  try {
    await page.goto(url);
    await page.getByTestId('home-campaign').click();
    await page.getByTestId('company-card-border_dispute').click();
    await page.getByTestId('campaign-choice-start').click();
    await page.getByTestId('campaign-chooser').waitFor({ state: 'hidden' });
    const guide = page.getByTestId('campaign-guide-dismiss');
    if (await guide.isVisible()) await guide.click();
    await openCompanyTools(page);
    await page.getByTestId('camp-area-workshop').click();
    const launch = page.locator('[data-testid^="camp-refit-"]:enabled').first();
    const saved = await page.evaluate(() => localStorage.getItem('ironline.campaign'));
    await launch.click();
    await page.getByTestId('bay-loading-cancel').waitFor();
    check('cold refit displays an explicit loading cancel action', deferred.length === 1 && await page.getByTestId('bay-loading-cancel').isVisible());
    await page.screenshot({ path: `${shots}/cold-mechbay-loading.png` });
    await page.keyboard.press('Escape');
    await page.getByTestId('refit-bay').waitFor({ state: 'hidden' });
    check('Escape cancels a still-loading refit and restores its launch control', await launch.evaluate(button => button === document.activeElement));
    await launch.click();
    await page.getByTestId('bay-loading-cancel').waitFor();
    await page.getByTestId('bay-loading-cancel').click();
    await page.getByTestId('refit-bay').waitFor({ state: 'hidden' });
    check('the loading Cancel button closes without changing the campaign', await page.evaluate(() => localStorage.getItem('ironline.campaign')) === saved && await launch.evaluate(button => button === document.activeElement));
    await release();
    await launch.click();
    await page.getByTestId('mechbay').waitFor();
    await clickFittingAction(page.locator('[data-testid^="remove-weapon-"]').first());
    await page.keyboard.press('Escape');
    await page.getByTestId('bay-unsaved-dialog').waitFor();
    check('loaded bay Escape still protects an unsaved draft instead of cancelling it', await page.getByTestId('refit-bay').isVisible() && await page.getByTestId('bay-unsaved-keep').isVisible() && await page.getByTestId('bay-loading-cancel').count() === 0);
    await page.getByTestId('bay-unsaved-discard').click();
    await page.getByTestId('refit-bay').waitFor({ state: 'hidden' });
    check('discarding that isolated draft preserves the saved company', await page.evaluate(() => localStorage.getItem('ironline.campaign')) === saved);
    await checkCompanyWorkspaces({ page, shots, check });
    check('cold-load cancellation and workspace navigation produce no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await release().catch(() => {}); await context.close(); }
}
