import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const read = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);
const raw = page => page.evaluate(() => localStorage.getItem('ironline.campaign'));
// Opening preparation persists cockpits and their pilot assignments. Everything
// outside those explicit choices must remain byte-for-byte equivalent.
const preparationResources = raw => {
  const state = JSON.parse(raw).state;
  delete state.deploymentSeats; delete state.deploymentSelection; delete state.benched;
  for (const pilot of state.pilots) delete pilot.mechId;
  return JSON.stringify(state);
};

/** Controlled settled-field fixtures exercise navigation, not campaign balance or human victories. */
async function fixture(page, url, campaignId) {
  return page.evaluate(async ({ url, campaignId }) => {
    const source = path => new URL(path, url).href;
    const [{ getCatalog }, campaign, save, worldApi] = await Promise.all([
      import(source('src/schema/load.ts')), import(source('src/campaign/campaign.ts')),
      import(source('src/campaign/save.ts')), import(source('src/sim/world.ts')),
    ]);
    const catalog = getCatalog();
    const state = campaign.startCampaign(catalog, campaignId, 'command-flow-review', 'green');
    const first = catalog.campaigns.get(campaignId).nodes[0];
    campaign.acceptContract(catalog, state, first.id, 'standard');
    const deployment = campaign.prepareDeployment(catalog, state);
    const world = worldApi.createWorld(catalog, { seed: deployment.seed, missionId: deployment.missionId,
      playerTeam: 0, playerLance: deployment.entries, difficulty: state.difficulty });
    world.entities.find(unit => unit.team === 0).locations.centre_torso.armour -= 10;
    world.tick = 100; world.finished = true; world.winner = 0;
    world.missionStatus = 'success'; world.missionReason = 'all objectives complete';
    for (const objective of world.objectives) if (objective.team === 0) { objective.status = 'complete'; objective.progress = 1; }
    campaign.resolveMission(catalog, state, worldApi.toResult(world, deployment.seed, 12000), deployment.lance, false);
    save.saveCampaign(state, { recover: true });
    localStorage.setItem('ironline.campaign.debriefed', '0');
    return { first: first.name, mechId: deployment.lance[0].mech.id,
      next: campaignId === 'border_dispute' ? 'recovery_window' : 'cutbank_attestation',
      optional: campaignId === 'border_dispute' ? 'marker_survey' : 'custody_survey' };
  }, { url, campaignId });
}

export async function runCampaignCommandFlow({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  const focusLoops = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  try {
    for (const campaignId of ['border_dispute', 'aurelian_recall']) {
      await page.goto(url);
      const prepared = await fixture(page, url, campaignId);
      await page.reload();
      await page.locator('[data-testid="home-campaign"]').click();
      await page.locator('[data-testid="debrief-next-mission"]').waitFor();
      check(`${campaignId}: settled debrief offers a next-mission review without calendar waiting`,
        (await page.locator('[data-testid="debrief-continue"]').innerText()).includes('No calendar advance is needed'));
      await page.screenshot({ path: `${shots}/campaign-flow-${campaignId}-debrief.png` });
      const firstReportAction = page.locator('.debrief-pair-actions button').first();
      await page.getByTestId('debrief-close').focus();
      await page.keyboard.press('Tab');
      const forward = await firstReportAction.evaluate(el => el === document.activeElement);
      await firstReportAction.focus();
      await page.keyboard.press('Shift+Tab');
      const reverse = await page.getByTestId('debrief-close').evaluate(el => el === document.activeElement);
      focusLoops.push({ campaignId, forward, reverse });
      const settled = await read(page);
      await page.locator('[data-testid="debrief-next-mission"]').click();
      await page.locator('[data-testid="camp-contract"]').waitFor();
      const reviewed = await read(page);
      check(`${campaignId}: next mission selects the main route, finalizes salvage and preserves day and treasury`,
        await page.locator(`[data-testid="camp-node-${prepared.next}"]`).evaluate(el => el.classList.contains('selected'))
        && reviewed.contract === null && reviewed.day === settled.day && reviewed.cbills === settled.cbills
        && reviewed.history.at(-1).salvageFinalized);
      await page.locator('[data-testid="camp-area-journal"]').click();
      check(`${campaignId}: Journal retains a visible continuation action`, await page.locator('[data-testid="camp-continue-mission"]').isVisible());
      await page.screenshot({ path: `${shots}/campaign-flow-${campaignId}-journal.png` });
      const unchanged = await raw(page);
      await page.locator('[data-testid="camp-next-mission"]').click();
      check(`${campaignId}: header returns from Journal to contract review without any transaction`,
        await page.locator('[data-testid="camp-contract"]').isVisible() && await raw(page) === unchanged);
      await page.locator('[data-testid="camp-route-list"] summary').filter({ hasText: 'Optional work' }).click();
      await page.locator(`[data-testid="camp-route-review-${prepared.optional}"]`).click();
      check(`${campaignId}: optional work remains an explicit choice with no automatic signature`,
        await page.locator(`[data-testid="camp-node-${prepared.optional}"]`).evaluate(el => el.classList.contains('selected')) && await raw(page) === unchanged);
      await page.locator(`[data-testid="camp-route-review-${prepared.next}"]`).click();
      await page.locator('[data-testid="camp-accept"]').click();
      const signed = await raw(page);
      await page.locator('[data-testid="camp-next-mission"]').click();
      await page.locator('[data-testid="hangar-continue"]').waitFor();
      const preparedSave = await raw(page);
      const preparedState = JSON.parse(preparedSave).state;
      check(`${campaignId}: signed primary action saves actual cockpits without launching or spending`,
        preparationResources(preparedSave) === preparationResources(signed)
        && preparedState.deploymentSeats.length > 0
        && preparedState.deploymentSeats.every(seat => seat.pilotId !== null && seat.mechId !== null
          && preparedState.pilots.find(pilot => pilot.id === seat.pilotId)?.mechId === seat.mechId)
        && JSON.stringify(preparedState.deploymentSelection) === JSON.stringify(preparedState.deploymentSeats.map(seat => seat.pilotId))
        && await page.locator('[data-testid="hangar-stage"]').isVisible());
      await page.locator('[data-testid="hangar-continue"]').click();
      check(`${campaignId}: pilot view keeps the same saved deployment ready for review`,
        await page.locator('[data-testid="prep-team-view"]').isVisible() && await raw(page) === preparedSave);
      await page.reload();
      await page.locator('[data-testid="home-campaign"]').click();
      if (await page.locator('[data-testid="debrief-close"]').isVisible()) await page.locator('[data-testid="debrief-close"]').click();
      check(`${campaignId}: reload retains signed contract and resumes at outfit step`,
        (await page.locator('[data-testid="camp-next-mission"]').innerText()).includes('Outfit & deploy')
        && (await read(page)).contract.nodeId === prepared.next && await raw(page) === preparedSave);
      await page.locator('[data-testid="camp-area-workshop"]').click();
      await page.locator(`[data-testid="camp-repair-${prepared.mechId}"]`).click();
      const booked = await read(page);
      const targetDay = Math.min(...booked.mechs.filter(mech => mech.status === 'repairing').map(mech => mech.readyOnDay));
      await page.locator('[data-testid="camp-waiting"] > summary').click();
      check(`${campaignId}: booked work exposes a priced wait to the next ready day`,
        (await page.locator('[data-testid="camp-wait-repair"]').innerText()).includes('wages') && await page.locator('[data-testid="camp-wait-repair"]').isEnabled());
      await page.screenshot({ path: `${shots}/campaign-flow-${campaignId}-wait.png` });
      await page.locator('[data-testid="camp-wait-repair"]').click();
      const ready = await read(page);
      check(`${campaignId}: paid-repair wait finishes the booked mech and retains the signed mission`,
        ready.day === targetDay && ready.mechs.find(mech => mech.id === prepared.mechId).status === 'ready' && ready.contract.nodeId === prepared.next);
      await page.locator('[data-testid="camp-waiting"] > summary').click();
      for (const width of [390, 320, 1440]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        await page.locator('[data-testid="camp-waiting"] > summary').click();
        const waitingBounds = await page.locator('.campaign-waiting-panel').evaluate(el => {
          const rect = el.getBoundingClientRect();
          const buttons = [...el.querySelectorAll('button')].map(button => {
            const box = button.getBoundingClientRect();
            return { left: box.left, right: box.right, height: box.height,
              hit: button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) };
          });
          return { left: rect.left, right: rect.right, viewport: innerWidth, buttons };
        });
        const label = width === 390 ? 'phone waiting controls stay inside the viewport' : `${width}px waiting controls stay inside the viewport`;
        check(`${campaignId}: ${label}`, waitingBounds.left >= 0 && waitingBounds.right <= width,
          JSON.stringify(waitingBounds));
        check(`${campaignId}: ${width}px waiting actions remain complete ${width <= 900 ? 'touch' : 'pointer'} hit targets`,
          waitingBounds.buttons.length > 0 && waitingBounds.buttons.every(button => button.left >= 0 && button.right <= width && button.height >= (width <= 900 ? 44 : 36) && button.hit), JSON.stringify(waitingBounds));
        await page.screenshot({ path: `${shots}/campaign-flow-${campaignId}-wait-${width}.png` });
        await page.locator('[data-testid="camp-waiting"] > summary').click();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('[data-testid="camp-area-journal"]').click();
      await page.locator('[data-testid="camp-next-step"]').scrollIntoViewIfNeeded();
      check(`${campaignId}: phone continuation fits without horizontal overflow`,
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
        && await page.locator('[data-testid="camp-continue-mission"]').evaluate(el => el.getBoundingClientRect().height >= 44));
      await page.screenshot({ path: `${shots}/campaign-flow-${campaignId}-phone.png` });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    check('campaign command flow has no browser errors', errors.length === 0, errors.join('\n'));
    check('both faction debriefs wrap Tab from the final action to the first crew action',
      focusLoops.length === 2 && focusLoops.every(entry => entry.forward), JSON.stringify(focusLoops));
    check('both faction debriefs wrap Shift+Tab from the first crew action to the final action',
      focusLoops.length === 2 && focusLoops.every(entry => entry.reverse), JSON.stringify(focusLoops));
  } finally { await context.close(); }
}

if (process.argv[1]?.endsWith('campaign-command-flow.mjs')) {
  const shots = process.env.SHOT_DIR ?? 'reports/economy-command-flow/campaign';
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let checks = 0;
  const failures = [];
  try {
    await runCampaignCommandFlow({ browser, url: process.env.BASE_URL ?? 'http://127.0.0.1:5235/', shots,
      check(name, ok, detail = '') { checks++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) failures.push(`${name}: ${detail}`); } });
    if (failures.length) throw new Error(failures.join('\n'));
    console.log(`${checks}/${checks} campaign command flow checks passed`);
  } finally { await browser.close(); }
}
