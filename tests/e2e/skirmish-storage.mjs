import { saveBay } from './save-bay.mjs';
import { clickFittingAction } from './fitting-actions.mjs';
export async function runSkirmishStorageChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.addInitScript(() => {
    localStorage.setItem('ironline.muted', '1');
    globalThis.__blockedLanceKeys = [];
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (globalThis.__blockedLanceKeys.includes(key)) throw new DOMException('Test quota exceeded', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  const warning = page.getByTestId('skirmish-storage-warning');
  const friendlyKey = 'ironline.lance.skirmish_ridge';
  const enemyKey = 'ironline.lance.enemy.skirmish_ridge';
  const editAndCommit = async (side) => {
    await page.getByTestId(`${side === 'enemy' ? 'enemy-' : ''}berth-customise-0`).click();
    await page.getByTestId('outfit-bay').waitFor();
    await clickFittingAction(page.getByTestId('remove-weapon-0'));
    await saveBay(page);
    await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
  };
  try {
    await page.goto(url);
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing').waitFor();
    await page.getByTestId('berth-design-0').selectOption('hornet_spotter');
    const previous = await page.evaluate((key) => localStorage.getItem(key), friendlyKey);
    await page.evaluate((key) => { globalThis.__blockedLanceKeys = [key]; }, friendlyKey);
    await editAndCommit('player');
    await warning.waitFor();
    const inView = await warning.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && element.contains(document.elementFromPoint(rect.left + 10, rect.top + 10));
    });
    check('failed berth Commit refit returns to a visible session-only warning', inView
      && (await warning.innerText()).includes('will be lost if you reload or close this page'));
    check('failed berth save keeps the edited session configuration and preserves the earlier saved roster',
      await page.getByTestId('berth-design-0').inputValue() === 'custom'
      && await page.evaluate(({ key, previous }) => localStorage.getItem(key) === previous, { key: friendlyKey, previous }));
    if (shots) await page.screenshot({ path: `${shots}/skirmish-storage-warning.png` });
    await page.getByTestId('desktop-menu-toggle').click();
    await page.getByTestId('open-mechbay').click();
    await page.getByTestId('mechbay').waitFor();
    await page.getByTestId('bay-exit').click();
    await page.getByTestId('briefing').waitFor();
    check('leaving for the workshop and returning preserves the unsaved session loadout and warning',
      await page.getByTestId('berth-design-0').inputValue() === 'custom' && await warning.isVisible());
    await page.getByTestId('player-difficulty-picker').selectOption('elite');
    await page.getByTestId('enemy-faction-picker').selectOption('aurelian');
    check('successful crew and enemy-roster saves do not clear an unsaved friendly roster warning',
      (await warning.innerText()).includes('Your lance') && (await warning.locator('li').count()) === 1);
    await page.evaluate((key) => globalThis.__blockedLanceKeys.push(key), enemyKey);
    await editAndCommit('enemy');
    check('independent roster failures are both retained', await warning.locator('li').count() === 2);
    await page.evaluate((key) => { globalThis.__blockedLanceKeys = [key]; }, enemyKey);
    await page.getByTestId('berth-customise-0').click();
    await page.getByTestId('outfit-bay').waitFor();
    await saveBay(page);
    await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
    check('saving the friendly refit clears only its own warning', await warning.locator('li').count() === 1
      && (await warning.innerText()).includes('Enemy lance') && !(await warning.innerText()).includes('Your lance'));
    await page.evaluate(() => { globalThis.__blockedLanceKeys = []; });
    await page.getByTestId('enemy-berth-customise-0').click();
    await page.getByTestId('outfit-bay').waitFor();
    await saveBay(page);
    await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
    check('warning clears after every affected roster is actually saved', await warning.count() === 0
      && await page.getByTestId('briefing-deploy').isEnabled());
  } catch (error) {
    if (shots) await page.screenshot({ path: `${shots}/skirmish-storage-failure.png` });
    throw error;
  } finally { await context.close(); }
}
