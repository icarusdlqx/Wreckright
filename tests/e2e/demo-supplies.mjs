import { saveBay } from './save-bay.mjs';
import { openCompanyTools } from './unified-navigation.mjs';
const read = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);
const supplyClaim = state => state.claimedRewardIds?.filter(id => id.includes('/demo-supplies/')) ?? [];
const count = (state, id) => state.store.find(item => item.kind === 'weapon' && item.itemId === id)?.count ?? 0;

async function revealSupplies(page) {
  const guide = page.getByTestId('campaign-guide-dismiss');
  if (await guide.isVisible()) await guide.click();
  await openCompanyTools(page);
  await page.getByTestId('camp-area-supplies').click();
  await page.getByTestId('demo-supply-panel').waitFor();
}

async function startCompany(page, url, campaignId) {
  await page.goto(url);
  await page.getByTestId('home-campaign').click();
  await page.getByTestId('campaign-choice').selectOption(campaignId);
  await page.getByTestId('campaign-choice-start').click();
  await page.getByTestId('campaign-chooser').waitFor({ state: 'hidden' });
  await revealSupplies(page);
}

async function crewPortraits(page) {
  await openCompanyTools(page);
  await page.getByTestId('camp-area-crew').click();
  const state = await read(page);
  const portraits = [];
  for (const pilot of state.pilots) {
    await page.getByTestId(`crew-select-${pilot.id}`).click();
    const image = page.getByTestId(`camp-pilot-detail-${pilot.id}`).getByTestId(`portrait-${pilot.templateId}`);
    portraits.push(await image.evaluate(svg => ({ body: svg.innerHTML, expression: svg.getAttribute('data-expression'), kit: svg.getAttribute('data-kit'), viewBox: svg.getAttribute('viewBox') })));
  }
  return portraits;
}

/** Existing-save case uses a deliberately labelled, isolated pre-crate save fixture. */
export async function runDemoSupplyChecks({ browser, url, shots, check }) {
  for (const campaignId of ['border_dispute', 'aurelian_recall']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.setDefaultTimeout(30000);
    try {
      await startCompany(page, url, campaignId);
      const initial = await read(page);
      const equipment = initial.store.filter(item => item.kind === 'weapon');
      check(`${campaignId}: new company receives twelve weapon types once`, new Set(equipment.map(item => item.itemId)).size === 12 && supplyClaim(initial).length === 1 && await page.getByTestId('claim-demo-supplies').count() === 0);
      await page.getByTestId('demo-supply-panel').locator('summary').click();
      const rewards = await page.getByTestId('demo-supply-panel').locator('ol li').allTextContents();
      check(`${campaignId}: advanced weapon rewards are visible on future contracts`, rewards.length >= 3 && rewards.every(row => row.includes('×')));
      await page.getByTestId('demo-supply-panel').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/demo-supplies-${campaignId}-desktop.png` });
      await page.reload(); await page.getByTestId('home-campaign').click(); await revealSupplies(page);
      const reloaded = await read(page);
      check(`${campaignId}: reload does not duplicate demo supplies or alter treasury and day`, JSON.stringify(initial.store) === JSON.stringify(reloaded.store) && initial.cbills === reloaded.cbills && initial.day === reloaded.day && supplyClaim(reloaded).length === 1);

      const choice = page.getByTestId('camp-fit-small_laser');
      const machineId = await choice.locator('option').evaluateAll(options => options.find(option => option.value !== '')?.value);
      await choice.selectOption(machineId);
      await page.getByTestId('mechbay').waitFor();
      check(`${campaignId}: choosing an owned weapon opens the correct campaign refit with it held`, await page.getByTestId('bay-armed').isVisible() && (await page.getByTestId('bay-armed').innerText()).includes('Small Laser'));
      const replacement = page.locator('[data-replacement-fit="true"] [data-testid^="replace-weapon-"]').first();
      await replacement.click();
      await page.getByTestId('bay-replacement-confirm').click();
      await saveBay(page);
      await page.getByTestId('mechbay').waitFor({ state: 'hidden' });
      const refitted = await read(page);
      const oldMachine = initial.mechs.find(mech => mech.id === machineId);
      const newMachine = refitted.mechs.find(mech => mech.id === machineId);
      check(`${campaignId}: legal store-to-refit commit consumes one spare and updates only its owned mech`, count(refitted, 'small_laser') === count(initial, 'small_laser') - 1 && newMachine.design.mounts.filter(mount => mount.weaponId === 'small_laser').length === oldMachine.design.mounts.filter(mount => mount.weaponId === 'small_laser').length + 1 && initial.day === refitted.day);
      const portraits = await crewPortraits(page);
      check(`${campaignId}: crew portraits retain identity and distinct vector facial and uniform details`, portraits.length === 4 && new Set(portraits.map(portrait => portrait.body)).size === 4 && portraits.every(portrait => portrait.expression && portrait.kit && portrait.viewBox === '0 0 160 200'));
      await page.screenshot({ path: `${shots}/demo-crew-${campaignId}.png` });

      // Reuse the saved company shape while removing only the new-demo feature.
      // This represents an older save and is not a claim of a played campaign.
      const fixture = await page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')));
      delete fixture.state.claimedRewardIds;
      fixture.state.store = [{ kind: 'weapon', itemId: 'ac5', count: 3 }];
      fixture.state.log = fixture.state.log.filter(entry => !entry.text.includes('Demo fitting crate received'));
      await page.goto(url);
      await page.evaluate(save => localStorage.setItem('ironline.campaign', JSON.stringify(save)), fixture);
      await page.reload(); await page.getByTestId('home-campaign').click(); await revealSupplies(page);
      const before = await read(page);
      check(`${campaignId}: old save offers an explicit optional crate claim`, await page.getByTestId('claim-demo-supplies').isVisible() && count(before, 'ac5') === 3 && supplyClaim(before).length === 0);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByTestId('demo-supply-panel').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${shots}/demo-supplies-${campaignId}-phone.png` });
      const mobile = await page.getByTestId('claim-demo-supplies').evaluate(button => { const bounds = button.getBoundingClientRect(); return bounds.width >= 44 && bounds.height >= 44 && bounds.left >= 0 && bounds.right <= innerWidth; });
      check(`${campaignId}: demo claim stays readable and touch sized on a phone`, mobile && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByTestId('claim-demo-supplies').click();
      const claimed = await read(page);
      check(`${campaignId}: claiming old-save supplies merges existing stock exactly once for no money or time`, count(claimed, 'ac5') === 4 && claimed.cbills === before.cbills && claimed.day === before.day && supplyClaim(claimed).length === 1 && claimed.store.filter(item => item.kind === 'weapon').length === 12);
      await page.reload(); await page.getByTestId('home-campaign').click(); await revealSupplies(page);
      const stable = await read(page);
      check(`${campaignId}: old-save claim and complete stock survive reload without another claim button`, JSON.stringify(stable.store) === JSON.stringify(claimed.store) && supplyClaim(stable).length === 1 && await page.getByTestId('claim-demo-supplies').count() === 0);
      check(`${campaignId}: supply and crew journey produces no browser errors`, errors.length === 0, errors.join('\n'));
    } finally { await context.close(); }
  }
}
