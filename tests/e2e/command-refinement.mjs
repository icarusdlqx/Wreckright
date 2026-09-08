import { discardRefitIfPrompted } from './mechbay-exit.mjs';
import { completeInitialCampaignSetup } from './campaign-setup.mjs';
import { nativeBayDrag } from './native-bay-drag.mjs';

const company = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);

export async function runCommandRefinementChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  context.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  const shot = name => page.screenshot({ path: `${shots}/refinement-${name}.png` });
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.locator('[data-testid="audio-settings"]').click();
    await page.locator('[data-testid="settings-display-tab"]').click();
    await page.locator('[data-testid="settings-graphics"]').selectOption('low');
    check('shared settings persist low graphics without leaving the home screen', await page.evaluate(() => localStorage.getItem('ironline.lowfx') === '1'));
    await shot('settings');
    await page.locator('[data-testid="settings-graphics"]').selectOption('full');
    await page.keyboard.press('Escape');
    await page.locator('[data-testid="home-campaign"]').click();
    await completeInitialCampaignSetup(page);
    const guide = page.locator('[data-testid="campaign-guide-dismiss"]');
    if (await guide.isVisible()) await guide.click();
    await page.locator('[data-testid="planning-map"]').waitFor();
    check('planning map opens by default with friendly insertion and known terrain',
      await page.locator('[data-testid="survey-plan"]').getAttribute('aria-pressed') === 'true'
      && (await page.locator('[data-testid="planning-map"]').innerText()).includes('Your insertion'));
    await shot('planning-map');
    await page.locator('[data-testid="survey-landscape"]').click();
    await page.locator('.mission-survey-image[data-state="ready"]').waitFor();
    await shot('landscape');
    await page.locator('[data-testid="camp-area-crew"]').click();
    await shot('crew');
    await page.locator('[data-testid="camp-area-workshop"]').click();
    await page.locator('[data-testid^="camp-refit-"]:enabled').nth(1).click();
    await page.waitForSelector('[data-testid="refit-bay"] canvas');
    const original = JSON.stringify(await company(page));
    const centre = page.locator('[data-testid="bay-location-centre_torso"]');
    await centre.getByRole('button', { name: /Remove .* from Centre Torso/ }).click();
    const spare = page.locator('[data-testid="weapon-card-medium_laser"] .weapon-card__pick');
    await spare.click();
    await page.locator('[data-testid="replace-weapon-0"]').click();
    const preview = page.locator('[data-testid="bay-replacement-preview"]');
    await preview.waitFor();
    check('occupied mount opens a reviewable replacement with weight, heat and stores',
      /Whole machine weight/.test(await preview.innerText()) && /Stores & ammunition/.test(await preview.innerText()));
    await shot('replacement');
    await page.locator('[data-testid="bay-replacement-cancel"]').click();
    await page.locator('[data-testid="bay-armed-cancel"]').click();
    check('cancelling replacement keeps both original arm weapons', await page.locator('[data-testid="bay-location-left_arm"]').getByRole('button', { name: 'Inspect Large Laser', exact: true }).count() === 2);
    await nativeBayDrag(page, spare, page.locator('[data-testid="replacement-target-0"]'));
    await preview.waitFor();
    await page.locator('[data-testid="bay-replacement-confirm"]').click();
    const arm = page.locator('[data-testid="bay-location-left_arm"]');
    check('native drop replacement snaps in exactly one smaller weapon', await arm.getByRole('button', { name: 'Inspect Medium Laser', exact: true }).count() === 1);
    await page.locator('[data-testid="bay-undo"]').click();
    check('one undo restores the complete old mount', await arm.getByRole('button', { name: 'Inspect Large Laser', exact: true }).count() === 2 && await arm.getByRole('button', { name: 'Inspect Medium Laser', exact: true }).count() === 0);
    await page.locator('[data-testid="bay-redo"]').click();
    check('redo reapplies one atomic replacement without mutating the company', await arm.getByRole('button', { name: 'Inspect Medium Laser', exact: true }).count() === 1 && JSON.stringify(await company(page)) === original);
    await page.locator('[data-testid="bay-exit"]').click();
    await discardRefitIfPrompted(page);
    await page.locator('[data-testid="refit-bay"]').waitFor({ state: 'hidden' });
    await page.locator('[data-testid="camp-area-operations"]').click();
    await page.locator('[data-testid="camp-accept"]').click();
    await page.locator('[data-testid="camp-review-machines"]').click();
    await page.locator('[data-testid="hangar-continue"]').click();
    await page.locator('[data-testid="lance-preset-name"]').fill('Opening lance');
    await page.locator('[data-testid="lance-preset-save"]').click();
    const saved = await company(page);
    check('lance presets store explicit ordered seats', saved.lancePresets.length === 1 && saved.lancePresets[0].seats.length > 0);
    const id = saved.lancePresets[0].seats[0].pilotId;
    await page.locator(`[data-testid="manifest-bench-${id}"]`).click();
    check('moving a pilot to reserve does not silently refill that seat', (await company(page)).deploymentSelection.length === saved.lancePresets[0].seats.length - 1);
    await page.locator('[data-testid="lance-preset-load"]').click();
    check('loading the lance restores the saved commander selection', JSON.stringify((await company(page)).deploymentSelection) === JSON.stringify(saved.lancePresets[0].seats.map(seat => seat.pilotId)));
    await shot('manifest');
    await page.locator('[data-testid="manifest-launch"]').click();
    await page.locator('[data-testid="briefing-deploy"]').click();
    await page.waitForSelector('[data-testid="lance-bar"]');
    await page.locator('[data-testid="field-radio"]').waitFor();
    await page.locator('[data-testid="pause-button"]').click();
    await page.getByRole('button', { name: 'Dismiss radio report', exact: true }).click();
    await page.locator('[data-testid="lance-bar"] button').first().click();
    await page.locator('[data-testid="command-move"]').click();
    check('armed orders explain the next click in the field', await page.locator('[data-testid="active-order-help"]').isVisible());
    const canvas = await page.locator('.viewport canvas:not(.perf-overlay)').boundingBox();
    await page.mouse.click(canvas.x + canvas.width * .56, canvas.y + canvas.height * .62);
    await page.locator('[data-testid="field-radio"]').waitFor();
    check('successful orders receive a pilot radio acknowledgement with a portrait',
      await page.locator('[data-testid="field-radio"] .pilot-portrait').count() === 1
      && await page.locator('[data-testid="field-radio"]').getAttribute('aria-label') === 'Company radio');
    await page.locator('[data-testid="command-intent"]').waitFor();
    await shot('battle-order');
    check('refinement journey has no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) {
    await shot('error').catch(() => {}); throw error;
  } finally { await context.close(); }
}
