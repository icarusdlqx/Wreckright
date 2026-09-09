import { openDesktopBattleMenu } from './input-safety.mjs';
import { completeInitialCampaignSetup } from './campaign-setup.mjs';

async function anatomyBounds(page) {
  return page.getByTestId('anatomical-loadout').evaluate(body => {
    const boundary = document.querySelector('[data-testid="bay-save"]').getBoundingClientRect().top;
    return [...body.querySelectorAll('.bay-location')].map(card => {
      const rect = card.getBoundingClientRect();
      const tiles = [...card.querySelectorAll('.slot-block__inspect')].map(tile => tile.getBoundingClientRect());
      return { part: card.dataset.testid, visible: rect.top >= 0 && rect.bottom <= boundary,
        contentsFit: tiles.every(tile => tile.left >= rect.left && tile.right <= rect.right + 1 && tile.top >= rect.top && tile.bottom <= rect.bottom + 1) };
    });
  });
}

export async function runMechbayAnatomyChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const shot = name => page.screenshot({ path: `${shots}/anatomy-${name}.png` });
  try {
    await page.goto(url);
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing').waitFor();
    await openDesktopBattleMenu(page);
    await page.getByTestId('open-mechbay').click();
    await page.getByTestId('design-picker').waitFor();
    const picker = page.getByTestId('design-picker');
    const choices = await picker.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean));
    const failures = [];
    for (const id of choices) {
      await picker.selectOption(id);
      const bounds = await anatomyBounds(page);
      if (bounds.length !== 8 || bounds.some(part => !part.visible || !part.contentsFit)) failures.push({ id, bounds });
    }
    check('all authored loadouts keep eight anatomical racks and their installed tiles visible at 1280×720', failures.length === 0, JSON.stringify(failures));
    await picker.selectOption('sentinel_brawler');
    check('installed weapons retain the same recognizable artwork as catalogue weapons', await page.locator('[data-testid^="inspect-weapon-"] .weapon-glyph').count() === 5
      && await page.locator('.weapon-card__quick-stats').first().isVisible());
    const guide = page.getByTestId('bay-workbench-disclosure');
    check('expanded fitting guide is visibly expanded without requiring hover', await guide.getAttribute('aria-expanded') === 'true' && await page.locator('#location-fit-steps').isVisible());
    const mounted = page.getByTestId('inspect-weapon-0');
    await mounted.focus();
    check('focusing an installed weapon exposes keyboard accessible Move and Remove actions', await page.getByTestId('move-weapon-0').isVisible() && await page.getByTestId('remove-weapon-0').isVisible());
    check('inspecting a fitted weapon describes its installed location rather than trying to fit another copy', (await page.getByTestId('dossier-fit').innerText()).toLowerCase().includes('installed')
      && (await page.getByTestId('dossier-fit').innerText()).includes('right arm'));
    await guide.focus();
    await shot('1280');
    await page.setViewportSize({ width: 390, height: 844 });
    const navigator = page.getByTestId('anatomical-navigator');
    await navigator.scrollIntoViewIfNeeded();
    check('phone overview has eight labeled touch sized body locations', await navigator.locator('button').evaluateAll(buttons => buttons.length === 8 && buttons.every(button => {
      const rect = button.getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44 && !!button.getAttribute('aria-label');
    })));
    await shot('phone');
    await navigator.getByRole('button', { name: 'Open Left Arm rack', exact: true }).click();
    check('phone anatomy navigation selects and brings the corresponding rack into view', await page.getByTestId('bay-location-left_arm').getAttribute('data-selected') === 'true'
      && await page.getByTestId('bay-location-left_arm').evaluate(card => { const rect = card.getBoundingClientRect(); return rect.top < innerHeight && rect.bottom > 0; }));
    check('phone anatomy does not cause horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(url);
    await page.getByTestId('home-campaign').click();
    await completeInitialCampaignSetup(page);
    const dismiss = page.getByTestId('campaign-guide-dismiss');
    if (await dismiss.isVisible()) await dismiss.click();
    await page.getByTestId('camp-accept').click();
    await page.getByTestId('camp-review-machines').click();
    await page.getByTestId('prep-seat-1').click();
    const mech = await page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state.deploymentSeats[1].mechId);
    await page.getByTestId(`hangar-refit-${mech}`).click();
    await page.getByTestId('refit-bay').getByTestId('bay-save').waitFor();
    const bounds = await anatomyBounds(page);
    check('campaign refit retains all eight body racks alongside mission and deployment context at 1280×720', bounds.length === 8 && bounds.every(part => part.visible && part.contentsFit)
      && await page.locator('.prep-refit-context .prep-seat').count() === 5, JSON.stringify(bounds));
    await shot('campaign-1280');
    check('anatomical workshop journey produces no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) { await shot('error').catch(() => {}); throw error; }
  finally { await context.close(); }
}
