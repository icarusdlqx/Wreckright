import { openCompanyTools } from './unified-navigation.mjs';
import { completeInitialCampaignSetup } from './campaign-setup.mjs';

const company = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);

async function tap(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.tap();
}

async function horizontalFit(locator) {
  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1;
  });
}

async function inViewport(locator) {
  return locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
  });
}

/** Natural phone journey: no campaign injection, viewport changes, or forced clicks. */
export async function runRefinementTouchChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  context.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  const shot = name => page.screenshot({ path: `${shots}/refinement-touch-${name}.png` });
  try {
    await page.goto(url, { waitUntil: 'load' });
    await tap(page.locator('[data-testid="audio-settings"]'));
    await tap(page.locator('[data-testid="settings-display-tab"]'));
    const settings = page.locator('[data-testid="audio-settings-panel"]');
    const graphics = page.locator('[data-testid="settings-graphics"]');
    await graphics.scrollIntoViewIfNeeded();
    check('phone shared Display settings remain inside the viewport with a touch-sized selector',
      await inViewport(settings) && await horizontalFit(graphics) && (await graphics.boundingBox())?.height >= 44);
    await graphics.selectOption('low');
    check('phone graphics selection persists and remains visible in shared settings',
      await graphics.inputValue() === 'low' && await page.evaluate(() => localStorage.getItem('ironline.lowfx') === '1'));
    await shot('settings');
    await graphics.selectOption('full');
    await tap(settings.getByRole('button', { name: 'Close settings', exact: true }));

    await tap(page.locator('[data-testid="home-campaign"]'));
    await completeInitialCampaignSetup(page);
    const guide = page.locator('[data-testid="campaign-guide-dismiss"]');
    if (await guide.isVisible()) await tap(guide);
    const plan = page.locator('[data-testid="planning-map"]');
    await plan.waitFor();
    await plan.locator('svg').scrollIntoViewIfNeeded();
    check('phone campaign opens the planning map with an explained friendly insertion',
      await page.locator('[data-testid="survey-plan"]').getAttribute('aria-pressed') === 'true'
      && await plan.locator('svg[role="img"]').count() === 1 && (await plan.innerText()).includes('Your insertion'));
    check('phone planning map, its legend and terrain survey have no horizontal overflow',
      await horizontalFit(plan) && await horizontalFit(plan.locator('.planning-map__key'))
      && await horizontalFit(page.locator('[data-testid="camp-mission-survey"]')));
    await shot('planning-map');

    await openCompanyTools(page);
    await tap(page.locator('[data-testid="camp-area-crew"]'));
    const rows = page.locator('[data-testid^="crew-select-"]');
    check('phone crew uses compact portrait rows and one selected detailed record',
      await rows.count() > 1 && await rows.locator('.pilot-portrait.is-compact').count() === await rows.count()
      && await page.locator('[data-testid^="camp-pilot-detail-"]').count() === 1
      && await rows.locator('.pilot-bio').count() === 0);
    const chosen = rows.nth(1);
    const chosenId = (await chosen.getAttribute('data-testid')).replace('crew-select-', '');
    const chosenName = await chosen.locator('.crew-row-identity strong').innerText();
    await tap(chosen);
    const detail = page.locator(`[data-testid="camp-pilot-detail-${chosenId}"]`);
    await detail.waitFor();
    check('phone crew selection opens that pilot’s bio, strengths and weaknesses',
      await chosen.getAttribute('aria-pressed') === 'true' && (await detail.locator('.pilot-name').textContent()).trim() === chosenName
      && (await detail.locator('.pilot-bio').innerText()).trim().length > 20
      && /Strength:/.test(await detail.innerText()) && /Watch:/.test(await detail.innerText()));
    await detail.locator('.pilot-person').scrollIntoViewIfNeeded();
    check('phone selected crew profile fits its panel and compact row controls stay touch-sized',
      await horizontalFit(detail) && await horizontalFit(detail.locator('.pilot-person'))
      && await rows.evaluateAll(buttons => buttons.every(button => {
        const rect = button.getBoundingClientRect();
        return rect.height >= 44 && rect.left >= -1 && rect.right <= innerWidth + 1;
      })));
    await shot('crew');

    await openCompanyTools(page);
    await tap(page.locator('[data-testid="camp-area-workshop"]'));
    const bulwark = page.locator('.company-workshop-machine').filter({ hasText: 'Bulwark' });
    await tap(bulwark.locator('[data-testid^="camp-refit-"]:enabled'));
    const bay = page.locator('[data-testid="mechbay"]');
    await bay.waitFor();
    const originalState = await company(page);
    const originalCompany = JSON.stringify(originalState);
    const returnedLaserStock = originalState.store
      .filter(item => item.kind === 'weapon' && item.itemId === 'medium_laser')
      .reduce((count, item) => count + item.count, 0) + 1;
    const arm = page.locator('[data-testid="bay-location-left_arm"]');
    await tap(page.getByRole('button', { name: 'Remove Medium Laser from Centre Torso', exact: true }));
    const spare = page.locator('[data-testid="weapon-card-medium_laser"] .weapon-card__pick');
    await spare.scrollIntoViewIfNeeded();
    check('phone refit creates a real spare from Bulwark’s mounted laser without committing company stores',
      (await page.locator('[data-testid="bay-commission"]').innerText()).includes('Bulwark')
      && await spare.locator('.weapon-card__stock').innerText() === `${returnedLaserStock} spare`
      && await arm.getByRole('button', { name: 'Inspect Large Laser', exact: true }).count() === 2
      && JSON.stringify(await company(page)) === originalCompany);
    const beforePreviewWeight = await page.locator('[data-testid="free-tonnage"]').innerText();
    await tap(spare);
    const replace = page.locator('[data-testid="replace-weapon-0"]');
    await replace.scrollIntoViewIfNeeded();
    check('phone pickup offers a touch-sized occupied weapon replacement button',
      await replace.getAttribute('aria-haspopup') === 'dialog' && (await replace.boundingBox())?.height >= 44
      && await inViewport(replace));
    await tap(replace);
    const preview = page.locator('[data-testid="bay-replacement-preview"]');
    await preview.waitFor();
    await preview.locator('.replacement-comparison').scrollIntoViewIfNeeded();
    check('phone replacement preview explains both weapons, boxes, weight, heat and stores',
      await preview.getAttribute('role') === 'dialog' && await preview.getAttribute('aria-modal') === 'true'
      && (await preview.locator('.replacement-weapon strong').allInnerTexts()).join('|') === 'Large Laser|Medium Laser'
      && await preview.locator('.replacement-weapon').nth(0).locator('.rack-cell').count() === 2
      && await preview.locator('.replacement-weapon').nth(1).locator('.rack-cell').count() === 1
      && /Whole machine weight/.test(await preview.innerText()) && /Net heat each second/.test(await preview.innerText())
      && /Return 1 Large Laser to stores. Use 1 spare Medium Laser./.test(await preview.innerText()));
    check('phone replacement dialog fits the unchanged viewport and scrolls its own long content',
      await inViewport(preview) && await horizontalFit(preview)
      && await preview.evaluate(element => element.scrollHeight > element.clientHeight
        && ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)));
    check('phone replacement boxes have visible borders against their pale cards',
      await preview.locator('.rack-cell').evaluateAll(boxes => {
        const luminance = colour => {
          const channels = colour.match(/[\d.]+/g)?.slice(0, 3).map(Number);
          if (channels?.length !== 3) return NaN;
          const linear = channels.map(value => value / 255 <= .04045 ? value / 255 / 12.92 : ((value / 255 + .055) / 1.055) ** 2.4);
          return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
        };
        return boxes.length === 3 && boxes.every(box => {
          const rect = box.getBoundingClientRect();
          const foreground = luminance(getComputedStyle(box).borderTopColor);
          const background = luminance(getComputedStyle(box.closest('.replacement-weapon')).backgroundColor);
          return rect.width >= 15 && rect.height >= 15
            && (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= 3;
        });
      }));
    await shot('replacement');
    const cancel = page.locator('[data-testid="bay-replacement-cancel"]');
    await cancel.scrollIntoViewIfNeeded();
    check('phone replacement confirmation and cancellation are reachable native touch controls',
      await inViewport(cancel) && await preview.locator('footer button').evaluateAll(buttons =>
        buttons.length === 2 && buttons.every(button => button.tagName === 'BUTTON' && button.getBoundingClientRect().height >= 44)));
    await shot('replacement-actions');
    await tap(cancel);
    await preview.waitFor({ state: 'hidden' });
    await tap(page.locator('[data-testid="bay-armed-cancel"]'));
    check('phone cancellation restores the interactive draft with both old weapons and the unspent spare',
      await arm.getByRole('button', { name: 'Inspect Large Laser', exact: true }).count() === 2
      && await arm.getByRole('button', { name: 'Inspect Medium Laser', exact: true }).count() === 0
      && await spare.locator('.weapon-card__stock').innerText() === `${returnedLaserStock} spare` && await bay.getAttribute('inert') === null
      && await page.locator('[data-testid="free-tonnage"]').innerText() === beforePreviewWeight
      && JSON.stringify(await company(page)) === originalCompany);
    check('phone refinement journey keeps 390 × 844 geometry and produces no browser errors',
      page.viewportSize()?.width === 390 && page.viewportSize()?.height === 844
      && await page.evaluate(() => innerWidth === 390 && document.documentElement.scrollWidth <= innerWidth + 1)
      && errors.length === 0, errors.join('\n'));
  } catch (error) {
    await shot('error').catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
