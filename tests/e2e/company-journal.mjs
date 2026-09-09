import { completeInitialCampaignSetup } from './campaign-setup.mjs';
import { companyFile } from './campaign-navigation.mjs';

const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);

/** Disposable companies and a clearly staged field result; no user save or desktop surface is touched. */
export async function runCompanyJournalChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(25000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  const shot = name => shots ? page.screenshot({ path: `${shots}/company-${name}.png` }) : Promise.resolve();
  try {
    await page.goto(url);
    await page.locator('[data-testid="home-campaign"]').click();
    await page.locator('[data-testid="campaign-chooser"]').waitFor();
    check('company choice shows both illustrated factions and practical tradeoffs',
      await page.locator('.company-choice-card').count() === 2 && await page.locator('.company-choice-card img').count() === 2
      && /Your advantage/i.test(await page.locator('.campaign-chooser').innerText()));
    await page.locator('.company-choice-card img').evaluateAll(async images => { await Promise.all(images.map(image => image.decode())); });
    await page.waitForTimeout(200);
    await shot('faction-choice-laptop');
    await completeInitialCampaignSetup(page);
    const line = await saved(page);
    await companyFile(page, 'camp-campaigns');
    await page.locator('[data-testid="company-card-aurelian_recall"]').click();
    await page.locator('[data-testid="campaign-choice-start"]').click();
    await page.locator('[data-testid="camp-node-first_warrant"]').waitFor();
    const gold = await saved(page);
    await companyFile(page, 'camp-campaigns');
    await page.locator('[data-testid="company-card-border_dispute"]').click();
    await page.locator('[data-testid="campaign-choice-resume"]').click();
    await page.locator('[data-testid="camp-node-militia_raid"]').waitFor();
    check('switching factions preserves each company and resumes the original seed and roster',
      (await saved(page)).seed === line.seed && await page.evaluate(seed =>
        JSON.parse(localStorage.getItem('ironline.campaign.company.aurelian_recall')).state.seed === seed, gold.seed));

    await page.evaluate(async url => {
      const source = path => new URL(path, url).href;
      const [{ getCatalog }, api, worldApi, save] = await Promise.all([
        import(source('src/schema/load.ts')), import(source('src/campaign/campaign.ts')),
        import(source('src/sim/world.ts')), import(source('src/campaign/save.ts'))]);
      const catalog = getCatalog();
      const state = api.startCampaign(catalog, 'border_dispute', 'journal-review', 'regular');
      api.acceptContract(catalog, state, 'militia_raid', 'standard');
      const drop = api.prepareDeployment(catalog, state);
      const world = worldApi.createWorld(catalog, { seed: drop.seed, missionId: drop.missionId, playerTeam: 0, playerLance: drop.entries });
      world.tick = 100; world.finished = true; world.winner = 0; world.missionStatus = 'success';
      for (const objective of world.objectives) { objective.status = 'complete'; objective.progress = 1; }
      world.entities.find(entity => entity.team === 0).locations.left_arm.armour = 0;
      api.resolveMission(catalog, state, worldApi.toResult(world, drop.seed, 12000), drop.lance, false);
      state.history.at(-1).salvageFinalized = true;
      localStorage.setItem('ironline.campaign', save.serialiseCampaign(state));
      localStorage.setItem('ironline.campaign.debriefed', '1');
    }, url);
    await page.goto(url);
    await page.locator('[data-testid="home-campaign"]').click();
    if (await page.locator('[data-testid="campaign-guide-dismiss"]').isVisible()) await page.locator('[data-testid="campaign-guide-dismiss"]').click();
    await page.locator('[data-testid="camp-node-militia_raid"]').click();
    await page.locator('[data-testid="company-journal"]:visible').waitFor();
    const journal = await page.locator('[data-testid="company-journal"]').innerText();
    check('completed map nodes reopen a journal with objective service and recovery facts',
      /First Notice/.test(journal) && /Returned without firing a shot/.test(journal) && /Recovery record/.test(journal));
    await shot('journal');
    await page.locator('[data-testid="camp-area-operations"]').click();
    await page.locator('[data-testid="camp-node-marker_survey"]').click();
    await page.locator('[data-testid="camp-accept"]').click();
    await page.locator('[data-testid="camp-deploy"]').click();
    await page.locator('[data-testid="lance-manifest"]').waitFor();
    await page.locator('[data-testid="prep-seat-0"]').click();
    const machineView = await page.locator('[data-testid="lance-manifest"]').innerText();
    const prepared = JSON.stringify(await saved(page));
    await shot('manifest-condition');
    await page.locator('[data-testid="hangar-continue"]').click();
    check('preparation makes condition, duplicate bay labels and paired pilot strengths visible across its views',
      /% intact · damaged/.test(machineView) && /Bay 1/.test(machineView) && /Bay 5/.test(machineView)
      && /Strength:/.test(await page.locator('.prep-pilot-detail').innerText())
      && JSON.stringify(await saved(page)) === prepared);
    await shot('manifest-pilot');
    await page.locator('[data-testid="manifest-cancel"]').click();
    await page.locator('[data-testid="camp-wiki"]').click();
    await page.locator('[data-testid="wiki-machines"]').click();
    const card = page.locator('.wiki-machine-card').last();
    await card.scrollIntoViewIfNeeded();
    const before = await page.locator('.wiki-scroll').evaluate(element => element.scrollTop);
    await card.click();
    await page.locator('[data-testid="wiki-article"]').waitFor();
    await page.goBack();
    await page.locator('[data-testid="wiki-machines"]').waitFor();
    await page.waitForFunction(() => document.querySelector('.wiki-scroll').scrollTop > 100);
    const after = await page.locator('.wiki-scroll').evaluate(element => element.scrollTop);
    check('returning from a dossier restores the archive list position', before > 100 && Math.abs(before - after) < 3, JSON.stringify({before, after}));
    check('company upgrades raise no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
