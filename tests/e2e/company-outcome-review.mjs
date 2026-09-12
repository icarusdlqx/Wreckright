import { openCampaignDetails } from './unified-navigation.mjs';
const company = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);
const account = state => JSON.stringify({
  cbills: state.cbills, day: state.day, mechs: state.mechs, pilots: state.pilots,
  store: state.store, effects: state.eventEffects, claims: state.claimedRewardIds,
});

function stockAndClaimsMatch(before, after, receipts) {
  // A company already owns its demo crate; rewards add to that stock and must
  // never replace it or arrive again when the debrief is reopened.
  const stockKey = item => `${item.kind}/${item.itemId}`;
  const expectedStock = new Map();
  for (const item of [...before.store, ...receipts.flatMap(reward => reward.items)]) {
    const key = stockKey(item);
    expectedStock.set(key, (expectedStock.get(key) ?? 0) + item.count);
  }
  const expectedClaims = [...before.claimedRewardIds, ...receipts.map(reward => reward.id)];
  return after.store.length === expectedStock.size
    && after.store.every(item => expectedStock.get(stockKey(item)) === item.count)
    && new Set(after.store.map(stockKey)).size === after.store.length
    && JSON.stringify(after.claimedRewardIds) === JSON.stringify(expectedClaims)
    && new Set(after.claimedRewardIds).size === after.claimedRewardIds.length;
}

/** Diagnostic presentation fixtures, not recorded human playthroughs or balance evidence. */
async function outcomeFixture(page, url, campaignId, nodeId, ending = false) {
  return page.evaluate(async ({ url, campaignId, nodeId, ending }) => {
    const source = path => new URL(path, url).href;
    const [{ getCatalog }, campaignApi, save, worldApi, roster, repair] = await Promise.all([
      import(source('src/schema/load.ts')), import(source('src/campaign/campaign.ts')),
      import(source('src/campaign/save.ts')), import(source('src/sim/world.ts')),
      import(source('src/campaign/roster.ts')), import(source('src/campaign/repair.ts')),
    ]);
    const catalog = getCatalog();
    const campaign = catalog.campaigns.get(campaignId);
    const node = campaign.nodes.find(entry => entry.id === nodeId);
    if (!node) throw new Error(`Missing outcome review node ${nodeId}`);
    const state = campaignApi.startCampaign(catalog, campaignId, `outcome-review-${nodeId}`, 'regular');
    // A mid-campaign save with known prerequisites; no mission is played here.
    const completeAncestors = id => {
      for (const required of campaign.nodes.find(entry => entry.id === id).requires) {
        completeAncestors(required);
        if (!state.completedNodes.includes(required)) state.completedNodes.push(required);
      }
    };
    completeAncestors(nodeId);
    let fallenName = null;
    if (ending) {
      const fallen = state.pilots.at(-1);
      fallen.dead = true;
      fallen.mechId = null;
      fallenName = fallen.name;
    }
    const trainee = state.pilots[0];
    trainee.xp = Math.min(...roster.SKILLS.map(skill => roster.skillCost(catalog, trainee[skill]))) - 1;
    const offerRaw = save.serialiseCampaign(state);
    const accepted = campaignApi.acceptContract(catalog, state, nodeId, 'fee_first');
    if (!accepted.ok) throw new Error(accepted.reason);
    const deployment = campaignApi.prepareDeployment(catalog, state);
    const world = worldApi.createWorld(catalog, {
      seed: deployment.seed, missionId: deployment.missionId, playerTeam: 0,
      playerLance: deployment.entries, difficulty: state.difficulty,
    });
    // Use real deployed identities and conditions, then stage an explicitly
    // controlled completed field report to exercise the normal settlement path.
    const units = world.entities.filter(unit => unit.team === 0);
    if (units.length < 2) throw new Error('Outcome review needs two deployed crew');
    units[0].locations.left_arm.armour = Math.floor(units[0].locations.left_arm.armour / 2);
    units[1].pilot.wounds = 1;
    world.tick = 100;
    world.finished = true;
    world.winner = 0;
    world.missionStatus = 'success';
    world.missionReason = 'all objectives complete';
    for (const objective of world.objectives) {
      if (objective.team === 0) { objective.status = 'complete'; objective.progress = 1; }
    }
    const battle = worldApi.toResult(world, deployment.seed, 12000);
    const run = campaignApi.resolveMission(catalog, state, battle, deployment.lance, false);
    const raw = save.serialiseCampaign(state);
    if (save.deserialiseCampaign(raw, catalog).state === null) throw new Error('Outcome review save failed validation');
    const mech = deployment.lance[0].mech;
    const report = run.outcome.pilotReports.find(entry => entry.pilotId === trainee.id);
    const mission = catalog.missions.get(node.missionId);
    const rules = catalog.rules.economy.xp;
    const expectedShared = rules.sharedMissionWin + Math.min(rules.sharedObjectiveCap,
      mission.objectives.filter(objective => objective.team === 0).reduce((sum, objective) =>
        sum + (objective.required ? rules.perRequiredObjective : rules.perOptionalObjective), 0));
    const itemNames = (node.rewards ?? []).flatMap(reward => (reward.items ?? []).map(item =>
      `${(item.kind === 'weapon' ? catalog.weapons : catalog.equipment).get(item.itemId).name} ×${item.count}`));
    return { offerRaw, raw, nodeId, labels: (node.rewards ?? []).map(reward => reward.label), itemNames,
      optionalLabels: (node.rewards ?? []).filter(reward => reward.objectiveId).map(reward =>
        mission.objectives.find(objective => objective.id === reward.objectiveId).label),
      traineeId: trainee.id, traineeName: trainee.name, mechId: mech.id,
      woundedId: deployment.lance[1].pilot.id, expectedShared, report,
      repairCost: repair.estimateRepair(catalog, mech).cost,
      receipts: run.outcome.campaignRewards, ending: node.ending, fallenName,
      survivors: state.pilots.filter(pilot => !pilot.dead).map(pilot => pilot.name),
    };
  }, { url, campaignId, nodeId, ending });
}

async function openSaved(page, url, raw, debriefed = 0) {
  await page.evaluate(({ raw, debriefed }) => {
    localStorage.setItem('ironline.campaign', raw);
    localStorage.setItem('ironline.campaign.debriefed', String(debriefed));
  }, { raw, debriefed });
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('[data-testid="home-campaign"]').click();
  await page.locator('[data-testid="campaign"]').waitFor();
  if (!(await page.locator('[data-testid="debrief"]').isVisible())) {
    const guide = page.locator('[data-testid="campaign-guide-dismiss"]');
    if (await guide.isVisible()) await guide.click();
  }
}

const reveal = locator => locator.evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

/** Called by a headless harness; this module never launches or takes over a browser. */
export async function runCompanyOutcomeChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  context.setDefaultTimeout(25_000);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  const shot = name => shots ? page.screenshot({ path: `${shots}/company-outcome-${name}.png` }) : Promise.resolve();
  try {
    await page.goto(url, { waitUntil: 'load' });
    const fixture = await outcomeFixture(page, url, 'border_dispute', 'workshop_defence');
    await openSaved(page, url, fixture.offerRaw);
    await openCampaignDetails(page);
    await page.locator(`[data-testid="camp-node-${fixture.nodeId}"]`).click();
    const offer = page.locator('[data-testid="contract-rewards"]');
    const offerText = await offer.textContent();
    check('diagnostic offer shows guaranteed and optional reward conditions before signing',
      fixture.labels.every(label => offerText.includes(label))
      && fixture.optionalLabels.every(label => offerText.includes(label))
      && /Complete the contract successfully/.test(offerText)
      && /Priority workshop access/.test(offerText) && /% off yard purchases/.test(offerText)
      && (await company(page)).contract === null, offerText);
    await reveal(offer);
    await shot('offer-desktop');
    check('reviewing guaranteed rewards leaves credits, crew, stock and repair bookings intact',
      account(await company(page)) === account(JSON.parse(fixture.offerRaw).state));

    const recovery = await outcomeFixture(page, url, 'border_dispute', 'recovery_window');
    await openSaved(page, url, recovery.offerRaw);
    await openCampaignDetails(page);
    await page.locator(`[data-testid="camp-node-${recovery.nodeId}"]`).click();
    const recoveryOffer = await offer.textContent();
    await reveal(offer);
    await shot('warehouse-offer-desktop');
    await openSaved(page, url, recovery.raw);
    const receipt = page.locator('[data-testid="debrief-contract-rewards"]');
    await receipt.waitFor();
    const recoveryText = await receipt.textContent();
    const recovered = await company(page);
    const recoveryBefore = JSON.parse(recovery.offerRaw).state;
    const delivered = recovery.receipts.flatMap(reward => reward.items);
    const hulks = recovery.receipts.flatMap(reward => reward.hulls);
    const goodsVisible = delivered.length > 0 && hulks.length > 0
      && await receipt.locator('li').count() === recovery.receipts.length
      && recovery.labels.every(label => recoveryOffer.includes(label) && recoveryText.includes(label))
      && recovery.optionalLabels.every(label => recoveryOffer.includes(label))
      && recovery.itemNames.every(name => recoveryOffer.includes(name) && recoveryText.includes(name))
      && /warehouse hull · stripped · 55% condition/.test(recoveryOffer)
      && /Warehouse hulls arrive stripped and require rebuilding/.test(recoveryText)
      && stockAndClaimsMatch(recoveryBefore, recovered, recovery.receipts)
      && account(recovered) === account(JSON.parse(recovery.raw).state)
      && recovered.mechs.length === recoveryBefore.mechs.length + hulks.length
      && hulks.every(hull => recovered.mechs.some(mech => mech.id === hull.mechId && mech.design.id === hull.designId
        && mech.status === 'hulk' && mech.design.mounts.length + mech.design.ammo.length + mech.design.equipment.length === 0));
    await reveal(receipt);
    await shot('warehouse-receipt-desktop');
    await openSaved(page, url, fixture.raw);
    await receipt.waitFor();
    const receiptText = await receipt.textContent();
    const settled = await company(page);
    check('resolved company shows each guaranteed receipt, afterword and delivered stock exactly once',
      goodsVisible && await receipt.locator('li').count() === fixture.receipts.length
      && fixture.labels.every(label => receiptText.includes(label))
      && fixture.itemNames.every(name => receiptText.includes(name))
      && fixture.receipts.every(reward => receiptText.includes(reward.afterword))
      && /Workshop priority honoured/.test(receiptText)
      && /Supplier purchase discount activated/.test(receiptText)
      && stockAndClaimsMatch(JSON.parse(fixture.offerRaw).state, settled, fixture.receipts)
      && account(settled) === account(JSON.parse(fixture.raw).state), `${receiptText}\n${recoveryText}`);
    await reveal(receipt);
    await shot('rewards-desktop');
    const pilotReport = page.locator(`[data-testid="debrief-${fixture.traineeId}"]`);
    await page.locator('.debrief-pilot-report > summary').click();
    await reveal(page.locator('[data-testid="debrief-crew"]'));
    await shot('crew-desktop');
    check('return cards retain the pilot, fielded machine and separate current condition',
      await pilotReport.locator('.pilot-portrait').count() === 1
      && await pilotReport.locator('.machine-portrait').count() === 1
      && (await pilotReport.textContent()).includes('Current machine condition')
      && await pilotReport.locator(`[data-testid="debrief-pair-workshop-${fixture.mechId}"]`).count() === 1);
    check('a non-firing scout sees the capped shared mission XP subtotal and can choose training',
      fixture.report.damage === 0 && fixture.report.sharedXp === fixture.expectedShared
      && (await pilotReport.textContent()).includes(`Includes ${fixture.expectedShared} XP for shared mission progress.`)
      && await page.locator(`[data-testid="debrief-pair-train-${fixture.traineeId}"]`).isVisible());
    check('results retain injury and reward data while keeping administration secondary',
      /Wounded/.test(await page.getByTestId('debrief-crew').textContent())
      && settled.eventEffects.freeRepairDays === 2 && settled.eventEffects.supplierDiscountThroughDay !== null
      && account(await company(page)) === account(settled));
    await page.locator(`[data-testid="debrief-pair-workshop-${fixture.mechId}"]`).click();
    await page.locator('[data-testid="debrief"]').waitFor({ state: 'hidden' });
    await page.waitForFunction(id => document.querySelector(`[data-testid="camp-inspect-${id}"]`)?.getAttribute('aria-pressed') === 'true', fixture.mechId);
    check('repair deep link opens its exact machine and closes the receipt without booking or spending',
      await page.locator('[data-testid="camp-area-workshop"]').getAttribute('aria-current') === 'page'
      && account(await company(page)) === account(settled));
    await reveal(page.locator('[data-testid="camp-selected-machine"]'));
    await shot('repair-desktop');

    await openSaved(page, url, fixture.raw);
    await page.locator('.debrief-pilot-report > summary').click();
    await page.locator(`[data-testid="debrief-pair-train-${fixture.traineeId}"]`).click();
    const detail = page.locator(`[data-testid="camp-pilot-detail-${fixture.traineeId}"]`);
    await detail.waitFor();
    check('training deep link selects the named pilot with a live skill choice and spends no XP',
      await page.locator(`[data-testid="crew-select-${fixture.traineeId}"]`).getAttribute('aria-pressed') === 'true'
      && await detail.locator(`[data-testid^="camp-skill-${fixture.traineeId}-"]:enabled`).count() > 0
      && account(await company(page)) === account(settled));
    await reveal(detail);
    await shot('training-desktop');

    await page.setViewportSize({ width: 390, height: 844 });
    await openSaved(page, url, fixture.raw);
    await receipt.waitFor();
    await page.locator('.debrief-pilot-report > summary').click();
    await reveal(page.locator('[data-testid="debrief-crew"]'));
    await shot('crew-mobile');
    await reveal(receipt);
    await shot('rewards-mobile');
    const training = page.locator(`[data-testid="debrief-pair-train-${fixture.traineeId}"]`);
    await training.scrollIntoViewIfNeeded();
    check('phone debrief scrolls its training action into an unobstructed touch-sized target',
      await noOverflow(page) && await training.evaluate(button => {
        const bounds = button.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= innerHeight && bounds.height >= 44
          && button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      }));
    await shot('next-steps-mobile');
    await training.click();
    await detail.waitFor();
    await reveal(detail);
    check('phone training destination retains the selected portrait and full record without spending',
      await detail.locator('.pilot-portrait').count() === 1
      && (await detail.textContent()).includes(fixture.traineeName)
      && await noOverflow(page) && account(await company(page)) === account(settled));
    await shot('training-mobile');

    await page.setViewportSize({ width: 1440, height: 1000 });
    const line = await outcomeFixture(page, url, 'border_dispute', 'depot_take', true);
    await openSaved(page, url, line.raw, 1);
    const epilogue = page.locator('[data-testid="campaign-epilogue"]');
    await epilogue.waitFor();
    const lineText = await epilogue.textContent();
    check('successful Linewrought ending records authored consequences, surviving crew and the fallen',
      lineText.includes(line.ending.title) && line.ending.body.every(paragraph => lineText.includes(paragraph))
      && line.survivors.every(name => lineText.includes(name)) && lineText.includes(`Remembered: ${line.fallenName}`)
      && lineText.includes('Returned wounded') && await epilogue.locator('.pilot-portrait').count() === line.survivors.length
      && (await company(page)).finished && (await company(page)).won);
    await reveal(epilogue);
    await shot('linewrought-ending-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    const aurelian = await outcomeFixture(page, url, 'aurelian_recall', 'local_stewardship', true);
    await openSaved(page, url, aurelian.raw, 1);
    await epilogue.waitFor();
    const aurelianText = await epilogue.textContent();
    check('phone Custodian ending has its own consequence text and surviving company instead of a generic win',
      aurelian.ending.title !== line.ending.title && aurelianText.includes(aurelian.ending.title)
      && aurelian.ending.body.every(paragraph => aurelianText.includes(paragraph))
      && aurelianText.includes(`Remembered: ${aurelian.fallenName}`)
      && await epilogue.locator('.pilot-portrait').count() === aurelian.survivors.length && await noOverflow(page));
    await reveal(epilogue);
    await shot('aurelian-ending-mobile');
    check('isolated company outcome review has no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) {
    await shot('error').catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
