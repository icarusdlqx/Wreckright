import { openCompanyTools } from './unified-navigation.mjs';
const stored = page => page.evaluate(() => localStorage.getItem('ironline.campaign'));
const selected = (page, id) => page.locator(`[data-testid="camp-node-${id}"]`).evaluate(node => node.classList.contains('selected'));
const reveal = locator => locator.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));

/** Controlled completed reports exercise real settlement; these are not played missions or human playtests. */
async function openingFixture(page, url, campaignId) {
  return page.evaluate(async ({ url, campaignId }) => {
    const source = path => new URL(path, url).href;
    const [{ getCatalog }, campaignApi, save, worldApi] = await Promise.all([
      import(source('src/schema/load.ts')), import(source('src/campaign/campaign.ts')),
      import(source('src/campaign/save.ts')), import(source('src/sim/world.ts')),
    ]);
    const catalog = getCatalog();
    const line = campaignId === 'border_dispute';
    const firstId = line ? 'militia_raid' : 'first_warrant';
    const surveyId = line ? 'marker_survey' : 'custody_survey';
    const recoveryId = line ? 'recovery_window' : 'custody_resupply';
    const alternateId = line ? 'recovery_window' : 'cutbank_attestation';
    const state = campaignApi.startCampaign(catalog, campaignId, `opening-diagnostic-${campaignId}`, 'regular');
    const freshRaw = save.serialiseCampaign(state);
    const settle = nodeId => {
      const accepted = campaignApi.acceptContract(catalog, state, nodeId, 'standard');
      if (!accepted.ok) throw new Error(accepted.reason);
      const deployment = campaignApi.prepareDeployment(catalog, state);
      const world = worldApi.createWorld(catalog, {
        seed: deployment.seed, missionId: deployment.missionId, playerTeam: 0,
        playerLance: deployment.entries, difficulty: state.difficulty,
      });
      world.tick = 100;
      world.finished = true;
      world.winner = 0;
      world.missionStatus = 'success';
      world.missionReason = 'all objectives complete';
      for (const objective of world.objectives) {
        if (objective.team === 0) { objective.status = 'complete'; objective.progress = 1; }
      }
      const battle = worldApi.toResult(world, deployment.seed, 12000);
      campaignApi.resolveMission(catalog, state, battle, deployment.lance, false);
    };
    settle(firstId);
    const firstRaw = save.serialiseCampaign(state);
    settle(surveyId);
    // Archive the two real settled records while keeping their durable campaign progress.
    state.historyArchive = { outcomes: state.history.length, employers: {} };
    for (const outcome of state.history) {
      const entry = state.historyArchive.employers[outcome.employerId] ??= {
        employerName: outcome.employerName, completed: 0, failed: 0, paid: 0,
      };
      entry[outcome.won ? 'completed' : 'failed'] += 1;
      entry.paid += outcome.payout;
    }
    state.history = [];
    const archivedRaw = save.serialiseCampaign(state);
    for (const raw of [freshRaw, firstRaw, archivedRaw]) {
      if (save.deserialiseCampaign(raw, catalog).state === null) throw new Error('Invalid opening diagnostic save');
    }
    const campaign = catalog.campaigns.get(campaignId);
    const survey = campaign.nodes.find(node => node.id === surveyId);
    return { freshRaw, firstRaw, archivedRaw, surveyId, recoveryId, alternateId,
      surveyName: survey.name, allowance: catalog.missions.get(survey.missionId).dropTonnage,
      alternateName: campaign.nodes.find(node => node.id === alternateId).name,
      recoveryName: campaign.nodes.find(node => node.id === recoveryId).name };
  }, { url, campaignId });
}

async function openSaved(page, url, raw, debriefed = 0) {
  await page.evaluate(({ raw, debriefed }) => {
    localStorage.setItem('ironline.campaign', raw);
    localStorage.setItem('ironline.campaign.debriefed', String(debriefed));
  }, { raw, debriefed });
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('[data-testid="home-campaign"]').click();
  await page.locator('[data-testid="campaign"]').waitFor();
}

/** Opening-route availability and preparation through the simplified mission screen. */
export async function runOpeningRouteChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    await page.goto(url);
    for (const campaignId of ['border_dispute', 'aurelian_recall']) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const fixture = await openingFixture(page, url, campaignId);
      await openSaved(page, url, fixture.freshRaw);
      check(`${campaignId}: first mission uses the same three-step journey`,
        await page.getByTestId('campaign-journey').isVisible()
        && await page.getByTestId('campaign-guide').count() === 0);
      await openSaved(page, url, fixture.firstRaw);
      await page.getByTestId('debrief').waitFor();
      await page.getByTestId('debrief-close').click();
      const map = page.locator('.campaign-route-overview');
      await map.locator(':scope > summary').click();
      await page.getByTestId(`camp-node-${fixture.alternateId}`).click();
      const before = await stored(page);
      check(`${campaignId}: the commander can select the main route without a forced tutorial`,
        await selected(page, fixture.alternateId)
        && await page.locator('[data-testid="camp-contract"] h3').textContent() === fixture.alternateName);
      await page.getByTestId(`camp-node-${fixture.surveyId}`).click();
      check(`${campaignId}: optional scout mission remains selectable without changing the save`,
        await selected(page, fixture.surveyId) && await stored(page) === before);
      await page.setViewportSize({ width: 390, height: 844 });
      const accept = page.getByTestId('camp-accept');
      await reveal(accept);
      check(`${campaignId}: phone mission selection has no horizontal overflow`,
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (shots) await page.screenshot({ path: `${shots}/opening-route-${campaignId}-mobile.png` });
      await accept.click();
      await page.getByTestId('hangar-continue').waitFor();
      check(`${campaignId}: selecting the scout mission opens preparation immediately`,
        JSON.parse(await stored(page)).state.contract.nodeId === fixture.surveyId);
      await page.getByTestId('hangar-continue').click();
      check(`${campaignId}: scout mission enforces authored tonnage and one deployment seat`,
        /1\/1 machines · 1 ready/.test(await page.getByTestId('manifest-profile').textContent())
        && (await page.getByTestId('manifest-tonnage').textContent()).endsWith(`/${fixture.allowance}t`)
        && await page.locator('[data-testid="manifest-actual-drop"] .prep-seat:not(:disabled)').count() === 1
        && await page.getByTestId('manifest-launch').isEnabled());
      await openSaved(page, url, fixture.archivedRaw, 2);
      const archived = JSON.parse(await stored(page)).state;
      check(`${campaignId}: archived reports retain completed-node progress`,
        archived.history.length === 0 && archived.historyArchive.outcomes === 2
        && archived.completedNodes.includes(fixture.surveyId));
      const beforeRecords = await stored(page);
      await openCompanyTools(page);
      await page.getByTestId('camp-area-crew').click();
      await openCompanyTools(page);
      await page.getByTestId('camp-area-operations').click();
      check(`${campaignId}: optional records navigation preserves campaign progress`,
        await stored(page) === beforeRecords);
    }
    check('opening-route journey has no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
