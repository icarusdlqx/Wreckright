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
    const alternateId = line ? 'pass_skirmish' : 'cutbank_attestation';
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

/** Uses the harness's single headless browser; creates and closes one disposable context. */
export async function runOpeningRouteChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(25_000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  const shot = name => shots ? page.screenshot({ path: `${shots}/opening-route-${name}.png` }) : Promise.resolve();
  const guide = page.locator('[data-testid="opening-route"]');
  const review = page.locator('[data-testid="opening-route-review"]');
  try {
    await page.goto(url, { waitUntil: 'load' });
    for (const campaignId of ['border_dispute', 'aurelian_recall']) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      const fixture = await openingFixture(page, url, campaignId);
      await openSaved(page, url, fixture.freshRaw);
      check(`${campaignId}: fresh first-drop corridor suppresses the optional opening guide`,
        await page.locator('[data-testid="campaign-guide"]').isVisible() && await guide.count() === 0);
      await openSaved(page, url, fixture.firstRaw);
      await page.locator('[data-testid="debrief"]').waitFor();
      check(`${campaignId}: diagnostic first victory keeps guidance behind the pending debrief`,
        /Contract complete/.test(await page.locator('[data-testid="debrief-ledger"]').textContent())
        && await guide.count() === 0);
      await page.locator('[data-testid="debrief-close"]').click();
      await guide.waitFor();
      const guideText = await guide.textContent();
      check(`${campaignId}: closing the first debrief recommends the one-scout survey`,
        guideText.includes('contract 2 of 3') && guideText.includes(fixture.surveyName)
        && /one fieldable scout/.test(guideText));
      await reveal(guide);
      await shot(`${campaignId}-desktop`);

      await page.locator(`[data-testid="camp-node-${fixture.alternateId}"]`).click();
      check(`${campaignId}: choosing the main route is not overridden by the suggestion`,
        await selected(page, fixture.alternateId)
        && (await page.locator('[data-testid="camp-contract"] h3').textContent()) === fixture.alternateName
        && (await review.textContent()).includes(fixture.surveyName));
      const beforeWiki = await stored(page);
      const story = guide.locator('a[href^="#wiki/story/"]').first();
      const storyHref = await story.getAttribute('href');
      await story.click();
      await page.locator('[data-testid="wiki-article"]').waitFor();
      const storyOpened = new URL(page.url()).hash === storyHref
        && await page.locator('[data-testid="wiki-locked"]').count() === 0;
      await page.locator('[data-testid="wiki-close"]').click();
      await guide.waitFor();
      check(`${campaignId}: contextual story roundtrip preserves the full save and chosen contract`,
        storyOpened && await stored(page) === beforeWiki && await selected(page, fixture.alternateId));
      await review.click();
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'camp-contract');
      check(`${campaignId}: explicit Review selects and focuses the survey without signing`,
        await selected(page, fixture.surveyId) && await stored(page) === beforeWiki
        && (await page.locator('[data-testid="camp-contract"] h3').textContent()) === fixture.surveyName);

      await page.setViewportSize({ width: 390, height: 844 });
      await review.scrollIntoViewIfNeeded();
      check(`${campaignId}: phone guide has no overflow and an unobstructed touch-sized review action`,
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
        && await guide.evaluate(element => element.scrollWidth <= element.clientWidth)
        && await review.evaluate(button => {
          const bounds = button.getBoundingClientRect();
          return bounds.height >= 44 && bounds.width >= 44 && bounds.top >= 0 && bounds.bottom <= innerHeight
            && button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
        }));
      await shot(`${campaignId}-mobile`);
      await review.focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-testid') === 'camp-contract');
      check(`${campaignId}: phone keyboard review returns focus to the selected contract`,
        await selected(page, fixture.surveyId) && await stored(page) === beforeWiki);
      await page.locator('[data-testid="camp-accept"]').click();
      check(`${campaignId}: signing the survey hides the opening guide`,
        await guide.count() === 0 && JSON.parse(await stored(page)).state.contract.nodeId === fixture.surveyId);
      await page.locator('[data-testid="camp-deploy"]').click();
      await page.locator('[data-testid="hangar-continue"]').click();
      await page.locator('[data-testid="lance-manifest"]').waitFor();
      const profile = await page.locator('[data-testid="manifest-profile"]').textContent();
      check(`${campaignId}: survey preparation enforces one berth and its authored tonnage limit`,
        /1\/1 machines · 1 ready/.test(profile)
        && (await page.locator('[data-testid="manifest-tonnage"]').textContent()).endsWith(`/${fixture.allowance}t`)
        && await page.locator('[data-testid="manifest-actual-drop"] .prep-seat').count() === 5
        && await page.locator('[data-testid="manifest-actual-drop"] .prep-seat:not(:disabled)').count() === 1
        && JSON.parse(await stored(page)).state.deploymentSeats.filter(seat => seat.mechId !== null).length === 1
        && await page.locator('[data-testid="manifest-launch"]').isEnabled());

      await openSaved(page, url, fixture.archivedRaw, 2);
      await guide.waitFor();
      const archived = JSON.parse(await stored(page)).state;
      check(`${campaignId}: archived reports preserve completed-node progress to the recovery suggestion`,
        archived.history.length === 0 && archived.historyArchive.outcomes === 2
        && archived.completedNodes.includes(fixture.surveyId)
        && (await guide.textContent()).includes('contract 3 of 3')
        && (await guide.textContent()).includes(fixture.recoveryName));
      const beforeDismiss = await stored(page);
      await page.locator('[data-testid="opening-route-dismiss"]').click();
      await page.locator('[data-testid="camp-area-crew"]').click();
      await page.locator('[data-testid="camp-area-operations"]').click();
      check(`${campaignId}: session dismissal survives workspace navigation without changing the save`,
        await guide.count() === 0 && await stored(page) === beforeDismiss);
    }
    check('isolated opening-route review has no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) {
    await shot('error').catch(() => {});
    throw error;
  } finally { await context.close(); }
}
