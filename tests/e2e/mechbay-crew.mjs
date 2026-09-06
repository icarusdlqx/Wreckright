import { completeInitialCampaignSetup } from './campaign-setup.mjs';
import { nativeBayDrag } from './native-bay-drag.mjs';

const company = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);

async function openCompany(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('[data-testid="home-campaign"]').click();
  await page.waitForSelector('[data-testid="campaign"]');
}

async function checkLandscapeSetup({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    await openCompany(page, url);
    check('new campaign setup stays inside a short landscape phone', await page.locator('[data-testid="campaign-chooser"]').evaluate(dialog => {
      const bounds = dialog.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.left >= 0 && bounds.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
    }));
    await page.locator('[data-testid="campaign-difficulty-picker"]').selectOption('veteran');
    const start = page.locator('[data-testid="campaign-choice-start"]');
    await start.scrollIntoViewIfNeeded();
    check('landscape setup scrolls its start button into an unobstructed touch target', await start.evaluate(button => {
      const bounds = button.getBoundingClientRect();
      const centre = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.height >= 44 && button.contains(centre);
    }));
    await page.screenshot({ path: `${shots}/crew-campaign-landscape.png` });
    await start.tap();
    await page.locator('[data-testid="campaign-chooser"]').waitFor({ state: 'hidden' });
    check('landscape touch starts the selected difficulty without browser errors', (await company(page)).difficulty === 'veteran' && errors.length === 0, errors.join('\n'));
    const original = JSON.stringify(await company(page));
    const guide = page.locator('[data-testid="campaign-guide-dismiss"]');
    if (await guide.isVisible()) await guide.tap();
    await page.locator('[data-testid="camp-files-toggle"]').tap();
    await page.locator('[data-testid="camp-restart"]').tap();
    check('restart difficulty dialog also fits a short landscape screen', await page.locator('[data-testid="camp-restart-dialog"]').evaluate(dialog => {
      const bounds = dialog.getBoundingClientRect();
      return bounds.top >= 0 && bounds.bottom <= innerHeight && dialog.scrollWidth <= dialog.clientWidth;
    }));
    await page.locator('[data-testid="campaign-difficulty-picker"]').selectOption('regular');
    await page.locator('[data-testid="camp-restart-cancel"]').tap();
    check('landscape cancellation preserves the current campaign and difficulty', JSON.stringify(await company(page)) === original);
  } finally { await context.close(); }
}

export async function runMechbayCrewChecks({ browser, url, shots, check }) {
  await checkLandscapeSetup({ browser, url, shots, check });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  context.setDefaultTimeout(30_000);
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    await openCompany(page, url);
    check('a new campaign asks for difficulty before its first contract',
      await page.locator('[data-testid="campaign-chooser"]').isVisible()
      && await page.locator('[data-testid="campaign-difficulty-picker"]').isVisible());
    await page.locator('[data-testid="campaign-difficulty-picker"]').selectOption('veteran');
    await page.screenshot({ path: `${shots}/crew-campaign-setup.png` });
    await completeInitialCampaignSetup(page, 'veteran');
    check('chosen Veteran difficulty is stored on the campaign', (await company(page)).difficulty === 'veteran');
    await openCompany(page, url);
    check('resuming a campaign retains difficulty without asking again',
      (await company(page)).difficulty === 'veteran'
      && await page.locator('[data-testid="campaign-chooser"]').count() === 0);
    const guide = page.locator('[data-testid="campaign-guide-dismiss"]');
    if (await guide.isVisible()) await guide.click();
    await page.locator('[data-testid="camp-area-crew"]').click();
    const saved = await company(page);
    const crew = page.locator('[data-testid="camp-roster"]');
    let completeCrew = await crew.locator('[data-testid^="crew-select-"]').count() === saved.pilots.filter(pilot => !pilot.dead).length;
    for (const pilot of saved.pilots.filter(pilot => !pilot.dead)) {
      await crew.locator(`[data-testid="crew-select-${pilot.id}"]`).click();
      const detail = crew.locator(`[data-testid="camp-pilot-detail-${pilot.id}"]`);
      completeCrew &&= await detail.locator('.pilot-portrait').count() === 1
        && (await detail.textContent()).includes(pilot.name)
        && (await detail.innerText()).includes('Strength:') && (await detail.innerText()).includes('Watch:');
    }
    check('each compact crew row opens its portrait, biography, strengths and weaknesses', completeCrew);
    await page.screenshot({ path: `${shots}/crew-roster-desktop.png`, fullPage: true });
    await page.locator('[data-testid="camp-area-workshop"]').click();
    await page.locator('img.machine-portrait').first().waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('img.machine-portrait')].some(image => image.complete && image.naturalWidth === 320));
    check('workshop machine cards use local rendered portraits and a selected field guide',
      await page.locator('[data-testid="camp-bay"] img.machine-portrait').count() === saved.mechs.length
      && /weaknesses/i.test(await page.locator('[data-testid="machine-dossier"]').innerText()));
    check('player-facing machine labels no longer use Sealed',
      !/sealed/i.test(await page.locator('[data-testid="camp-bay"]').innerText()));
    await page.screenshot({ path: `${shots}/crew-workshop-desktop.png`, fullPage: true });
    await page.locator('[data-testid^="camp-refit-"]:enabled').first().click();
    await page.waitForSelector('[data-testid="refit-bay"] canvas');
    const left = page.locator('[data-testid="bay-location-left_arm"]');
    const right = page.locator('[data-testid="bay-location-right_arm"]');
    const head = page.locator('[data-testid="bay-location-head"]');
    const original = JSON.stringify((await company(page)).mechs);
    check('every body section exposes its mounts and available fitting boxes at rest',
      await page.locator('.bay-hardpoints').count() === 8
      && await page.locator('[data-testid^="free-slots-"]').count() === 8);
    await page.screenshot({ path: `${shots}/crew-refit-desktop.png` });
    await page.locator('.bay-machine [data-testid="machine-dossier"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/crew-machine-profile.png` });
    await page.locator('.bay-machine').evaluate(panel => { panel.scrollTop = 0; });
    await left.getByRole('button', { name: 'Remove Flamer from Left Arm', exact: true }).click();
    const flamer = page.locator('[data-testid="weapon-card-flamer"] .weapon-card__pick');
    check('shelf weapon footprint agrees with its slot cost',
      await flamer.locator('.rack-cell').count() === 1);
    await flamer.click();
    check('picking a weapon shows a named one-box landing preview on a compatible arm',
      await right.locator('.rack-cell--incoming').count() === 1
      && (await right.innerText()).includes('Flamer')
      && (await right.innerText()).includes('Fits held part'));
    check('an incompatible head explains why the weapon cannot fit',
      (await head.innerText()).includes('Cannot fit held part')
      && await head.locator('.bay-location-refusal').isVisible());
    await page.screenshot({ path: `${shots}/crew-fit-preview.png` });
    await right.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/crew-fit-targets.png` });
    await page.locator('[data-testid="bay-armed-cancel"]').click();
    // Exercise the browser's native drag payload and drop events, not an editor hook.
    await nativeBayDrag(page, flamer, head);
    check('dropping onto an invalid mount leaves the draft unchanged',
      await head.getByRole('button', { name: 'Inspect Flamer', exact: true }).count() === 0
      && await right.getByRole('button', { name: 'Inspect Flamer', exact: true }).count() === 0);
    await nativeBayDrag(page, flamer, right);
    check('native drag and drop snaps the weapon into its valid body section',
      await right.getByRole('button', { name: 'Inspect Flamer', exact: true }).count() === 1
      && await right.locator('.slot-block:not(.empty) .rack-cell').count() === 1);
    check('refit remains a draft until explicitly committed', JSON.stringify((await company(page)).mechs) === original);
    await page.locator('[data-testid="bay-undo"]').click();
    check('undo removes the snapped weapon', await right.getByRole('button', { name: 'Inspect Flamer', exact: true }).count() === 0);
    await flamer.focus(); await flamer.press('Enter');
    await right.locator('.bay-location-name').press('Enter');
    check('keyboard placement uses the same matching section', await right.getByRole('button', { name: 'Inspect Flamer', exact: true }).count() === 1);
    await page.screenshot({ path: `${shots}/crew-snapped-fit.png` });
    await page.locator('[data-testid="bay-save"]').click();
    await page.locator('[data-testid="refit-bay"]').waitFor({ state: 'hidden' });
    const refitted = await company(page);
    check('committed move preserves exactly one weapon and updates its location',
      refitted.mechs[0].design.mounts.filter(mount => mount.weaponId === 'flamer').length === 1
      && refitted.mechs[0].design.mounts.some(mount => mount.weaponId === 'flamer' && mount.location === 'right_arm'));
    await page.locator('[data-testid="camp-area-operations"]').click();
    await page.locator('[data-testid="camp-accept"]').click();
    await page.locator('[data-testid="camp-deploy"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    check('campaign briefing uses the chosen tier with no mission difficulty picker',
      await page.locator('[data-testid="difficulty-picker"]').count() === 0
      && /Veteran/i.test(await page.locator('[data-testid="briefing"]').innerText()));
    check('desktop bay and crew journey has no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) {
    await page.screenshot({ path: `${shots}/crew-error.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }

  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const mobile = await touch.newPage();
  touch.setDefaultTimeout(30_000);
  await mobile.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    await openCompany(mobile, url); await completeInitialCampaignSetup(mobile);
    const guide = mobile.locator('[data-testid="campaign-guide-dismiss"]');
    if (await guide.isVisible()) await guide.tap();
    await mobile.locator('[data-testid="camp-area-crew"]').tap();
    await mobile.locator('.pilot-person').first().scrollIntoViewIfNeeded();
    check('pilot portraits, bios and assignments fit their cards and the phone', await mobile.evaluate(() => {
      const elements = [...document.querySelectorAll('.pilot-card, .pilot-person, .pilot-seat, .pilot-mech')];
      return elements.length > 0 && elements.every(element => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= -1 && bounds.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1;
      });
    }));
    await mobile.screenshot({ path: `${shots}/crew-roster-mobile.png`, fullPage: true });
    await mobile.locator('[data-testid="camp-area-workshop"]').tap();
    await mobile.locator('[data-testid^="camp-refit-"]:enabled').first().tap();
    await mobile.waitForSelector('[data-testid="mechbay"]');
    await mobile.locator('[data-testid="bay-location-left_arm"]').scrollIntoViewIfNeeded();
    check('fitting boxes and locations fit a phone without horizontal scrolling', await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check('mobile bay has loaded real fitting boxes rather than a loading placeholder',
      await mobile.locator('[data-testid="free-slots-left_arm"] .rack-cell').count() === 3);
    await mobile.screenshot({ path: `${shots}/crew-refit-mobile.png`, fullPage: true });
    await mobile.getByRole('button', { name: 'Remove Flamer from Left Arm', exact: true }).tap();
    await mobile.locator('[data-testid="weapon-card-flamer"] .weapon-card__pick').tap();
    const mobileRight = mobile.locator('[data-testid="bay-location-right_arm"]');
    check('touch pickup reveals the same incoming footprint', await mobileRight.locator('.rack-cell--incoming').count() === 1);
    await mobileRight.locator('.bay-location-name').tap();
    check('tap placement snaps into the selected part on a phone',
      await mobileRight.getByRole('button', { name: 'Inspect Flamer', exact: true }).count() === 1);
    await mobile.screenshot({ path: `${shots}/crew-mobile-snapped.png`, fullPage: true });
  } finally { await touch.close(); }
}
