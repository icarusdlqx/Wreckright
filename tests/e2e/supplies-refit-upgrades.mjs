import { completeInitialCampaignSetup } from './campaign-setup.mjs';
import { nativeBayDrag } from './native-bay-drag.mjs';

const readCompany = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);

export async function runSuppliesRefitUpgradeChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.locator('[data-testid="home-campaign"]').click();
    await completeInitialCampaignSetup(page);
    const guide = page.locator('[data-testid="campaign-guide-dismiss"]');
    if (await guide.isVisible()) await guide.click();
    await page.locator('[data-testid="camp-area-workshop"]').click();
    await page.locator('[data-testid="camp-refit-mech-1"]').click();
    await page.locator('[data-testid="mechbay"]').waitFor();
    await page.waitForTimeout(300);
    const original = JSON.stringify(await readCompany(page));
    await page.locator('[data-testid="remove-weapon-0"]').click();
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="bay-unsaved-dialog"]').waitFor();
    check('Escape protects a dirty refit and leaves the saved company intact', JSON.stringify(await readCompany(page)) === original);
    await page.locator('[data-testid="bay-unsaved-keep"]').click();
    check('Keep editing retains the draft and its Undo history', await page.locator('[data-testid="bay-undo"]').isEnabled());
    await page.locator('[data-testid="bay-exit"]').click();
    await page.locator('[data-testid="bay-unsaved-discard"]').click();
    await page.locator('[data-testid="refit-bay"]').waitFor({ state: 'hidden' });
    check('Discard restores the saved loadout without consuming stores', JSON.stringify(await readCompany(page)) === original);
    await page.locator('[data-testid="camp-refit-mech-1"]').click();
    await page.locator('[data-testid="remove-weapon-0"]').click();
    const shelf = await page.locator('[data-testid="bay-stocks"]').boundingBox();
    check('laptop fitting retains at least 160px of visible parts shelf', shelf.height >= 159 && shelf.y + shelf.height <= 720);
    const target = page.locator('[data-testid="free-slots-right_arm"]');
    const drag = await nativeBayDrag(page, page.locator('[data-testid="stock-weapon-flamer"]'), target);
    check('held-part feedback keeps the drop rectangle stable', drag.stable, JSON.stringify(drag));
    await page.locator('[data-testid="bay-location-right_arm"] button[aria-label="Remove Flamer from Right Arm"]').waitFor();
    check('native drag fits the Flamer in the chosen arm', await page.locator('[data-testid="bay-location-right_arm"] button[aria-label="Remove Flamer from Right Arm"]').count() === 1);
    await page.screenshot({ path: `${shots}/laptop-refit-upgraded.png` });
    await page.locator('[data-testid="bay-exit"]').click();
    await page.locator('[data-testid="bay-unsaved-save"]').click();
    await page.locator('[data-testid="refit-bay"]').waitFor({ state: 'hidden' });
    check('Save and leave commits the chosen location', (await readCompany(page)).mechs[0].design.mounts.some(mount => mount.weaponId === 'flamer' && mount.location === 'right_arm'));

    await page.locator('[data-testid="camp-area-supplies"]').click();
    const current = await readCompany(page);
    const flamerIndex = current.mechs[0].design.mounts.findIndex(mount => mount.weaponId === 'flamer');
    await page.locator('.camp-strip > li').filter({ hasText: 'Bay 1' }).locator('select').selectOption(String(flamerIndex));
    await page.locator('[data-testid="camp-fit-flamer"]').waitFor();
    const stripped = JSON.stringify(await readCompany(page));
    await page.locator('[data-testid="camp-fit-flamer"]').selectOption('mech-1');
    await page.locator('[data-testid="bay-armed"]').waitFor();
    check('Stores opens the chosen machine with its part held and no hidden automatic fit',
      (await page.locator('[data-testid="bay-armed"]').innerText()).includes('Flamer') && JSON.stringify(await readCompany(page)) === stripped);
    await page.locator('[data-testid="bay-exit"]').click();
    await page.locator('[data-testid="refit-bay"]').waitFor({ state: 'hidden' });
    check('an untouched Stores refit exits without a discard dialog', await page.locator('[data-testid="bay-unsaved-dialog"]').count() === 0);
    const beforeSale = JSON.stringify(await readCompany(page));
    await page.locator('[data-testid="market-sell-mech-1"]').click();
    await page.locator('[data-testid="market-sale-review"]').waitFor();
    check('sale review shows fittings, condition and the pilot consequence before spending',
      (await page.locator('[data-testid="market-sale-review"]').innerText()).includes('Kessa Vale stays in your crew') && JSON.stringify(await readCompany(page)) === beforeSale);
    await page.locator('[data-testid="market-sale-confirm"]').click();
    await page.locator('[data-testid="market-undo-sale"]').waitFor();
    await page.locator('[data-testid="market-undo-sale"]').click();
    check('immediate sale undo restores the exact company', JSON.stringify(await readCompany(page)) === beforeSale);
    const lot = page.locator('[data-testid^="market-inspect-"]').first();
    await lot.locator('summary').click();
    check('yard inspection exposes actual condition and mounted loadout', (await lot.innerText()).includes('% intact') && /included fittings/i.test(await lot.innerText()));
    await page.screenshot({ path: `${shots}/supplies-yard-upgraded.png` });
    check('supplies and refit upgrade journey has no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
