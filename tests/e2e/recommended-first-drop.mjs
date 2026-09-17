import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { clickFittingAction } from './fitting-actions.mjs';

const readCompany = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.campaign')).state);
const resources = state => ({ cbills: state.cbills, day: state.day, store: state.store,
  mechs: state.mechs, pilots: state.pilots.map(({ mechId: _assignment, ...pilot }) => pilot) });

async function startCompany(page, url, campaignId) {
  await page.goto(url);
  await page.getByTestId('home-new-campaign').click();
  await page.getByTestId(`company-card-${campaignId}`).click();
  await page.getByTestId('campaign-difficulty-picker').selectOption('regular');
  await page.getByTestId('campaign-choice-start').click();
  await page.getByTestId('campaign-chooser').waitFor({ state: 'hidden' });
  await page.getByTestId('camp-accept').click();
  await page.getByTestId('first-drop-overview').waitFor();
}

async function deploymentSummary(page, url) {
  return page.evaluate(async url => {
    const [{ getCatalog }, { deploymentPlan }] = await Promise.all([
      import(new URL('src/schema/load.ts', url).href),
      import(new URL('src/campaign/deployment.ts', url).href),
    ]);
    const state = JSON.parse(localStorage.getItem('ironline.campaign')).state;
    const catalog = getCatalog();
    const plan = deploymentPlan(catalog, state, state.contract.missionId);
    return { missionId: state.contract.missionId, allowance: plan.allowance,
      tonnage: plan.tonnage, slots: plan.slots, issues: plan.issues,
      pairs: plan.pairs.map(({ mech, pilot }) => ({ mechId: mech.id, pilotId: pilot.templateId,
        name: pilot.name, designId: mech.design.id, chassisId: mech.design.chassisId,
        mounts: mech.design.mounts.map(({ weaponId, location }) => ({ weaponId, location })) })) };
  }, url);
}

async function assertDeployment(page, url, before, label, check, shot) {
  await page.getByTestId('first-drop-use-team').click();
  await page.getByTestId('briefing-deploy').waitFor();
  const prepared = await readCompany(page);
  const plan = await deploymentSummary(page, url);
  check(`${label}: the recommended team is fully paired, within tonnage and berth limits`,
    plan.issues.length === 0 && plan.pairs.length > 0 && plan.pairs.length <= plan.slots
    && plan.tonnage <= plan.allowance
    && new Set(plan.pairs.map(pair => pair.pilotId)).size === plan.pairs.length);
  check(`${label}: choosing the team preserves money, inventory, machines and pilot progression`,
    isDeepStrictEqual(resources(prepared), resources(before)));
  check(`${label}: one action opens a launchable field briefing`,
    await page.getByTestId('briefing-deploy').isEnabled()
    && await page.getByTestId('first-drop-overview').count() === 0);
  await shot('briefing');
  await page.getByTestId('briefing-deploy').click();
  await page.getByTestId('lance-bar').waitFor();
  await page.waitForFunction(count => document.querySelectorAll('[data-testid="lance-bar"] .lance-card').length === count, plan.pairs.length);
  const pause = page.getByTestId('pause-button');
  if ((await pause.innerText()).includes('Pause')) await pause.click();
  const actual = await page.evaluate(() => globalThis.__ironmuster.world.entities.filter(unit => unit.team === 0 && unit.frame === 'mech').map(unit => ({
    pilotId: unit.pilot.id, name: unit.pilot.name, designId: unit.designId, chassisId: unit.chassisId,
    mounts: unit.weapons.map(({ weaponId, location }) => ({ weaponId, location })),
  })));
  const expected = plan.pairs.map(({ mechId: _id, ...pair }) => pair);
  check(`${label}: battle receives exactly the previewed pilots, chassis and weapon layouts`,
    isDeepStrictEqual(actual, expected), JSON.stringify({ actual, expected }));
  check(`${label}: deployment spends no campaign credits or inventory`,
    isDeepStrictEqual(resources(await readCompany(page)), resources(prepared)));
  await shot('deployed');
}

/** This creates a settled success through the campaign API; it is not a played victory. */
async function stageLaterMission(page, url) {
  await page.evaluate(async url => {
    const source = path => new URL(path, url).href;
    const [{ getCatalog }, campaign, save, worldApi] = await Promise.all([
      import(source('src/schema/load.ts')), import(source('src/campaign/campaign.ts')),
      import(source('src/campaign/save.ts')), import(source('src/sim/world.ts')),
    ]);
    const catalog = getCatalog();
    const state = JSON.parse(localStorage.getItem('ironline.campaign')).state;
    const deployment = campaign.prepareDeployment(catalog, state);
    const world = worldApi.createWorld(catalog, { seed: deployment.seed, missionId: deployment.missionId,
      playerTeam: 0, playerLance: deployment.entries, difficulty: state.difficulty });
    world.tick = 100;
    world.finished = true;
    world.winner = 0;
    world.missionStatus = 'success';
    world.missionReason = 'all objectives complete';
    for (const objective of world.objectives) if (objective.team === 0) {
      objective.status = 'complete'; objective.progress = 1;
    }
    campaign.resolveMission(catalog, state, worldApi.toResult(world, deployment.seed, 12000), deployment.lance, false);
    save.saveCampaign(state, { recover: true });
    localStorage.setItem('ironline.campaign.debriefed', '0');
  }, url);
  await page.reload();
  await page.getByTestId('home-campaign').click();
  await page.getByTestId('debrief-next-mission').click();
  await page.getByTestId('camp-accept').click();
  await page.getByTestId('lance-manifest').waitFor();
}

export async function runRecommendedFirstDropChecks({ browser, url, shots, check }) {
  for (const campaignId of ['border_dispute', 'aurelian_recall']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
    const shot = name => page.screenshot({ path: `${shots}/first-drop-${campaignId}-${name}.png` });
    try {
      await startCompany(page, url, campaignId);
      const original = await readCompany(page);
      check(`${campaignId}: a fresh company opens the recommended team without the full editor`,
        await page.getByTestId('first-drop-overview').isVisible()
        && await page.getByTestId('lance-manifest').count() === 0);
      check(`${campaignId}: the preview shows actual paired machines and a weight budget`,
        await page.locator('[data-testid^="first-drop-machine-"]').count() > 0
        && /\d+\s*\/\s*\d+\s*t/.test(await page.getByTestId('first-drop-tonnage').innerText()));
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.getByTestId('first-drop-use-team').scrollIntoViewIfNeeded();
        check(`${campaignId}: ${viewport.width}px overview fits and keeps the launch action usable`,
          await page.evaluate(() => {
            const button = document.querySelector('[data-testid="first-drop-use-team"]');
            const rect = button.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return document.documentElement.scrollWidth <= innerWidth + 1 && rect.height >= 40
              && rect.left >= 0 && rect.right <= innerWidth && button.contains(hit);
          }));
        await shot(`overview-${viewport.width}`);
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await assertDeployment(page, url, original, campaignId, check, shot);
      await stageLaterMission(page, url);
      check(`${campaignId}: later missions open normal preparation without repeating the first-drop overview`,
        (await readCompany(page)).history.length > 0 && await page.getByTestId('first-drop-overview').count() === 0);
      await shot('later-mission-fixture');
      check(`${campaignId}: first-drop and staged later-mission journeys have no browser errors`, errors.length === 0, errors.join('\n'));
    } catch (error) { await shot('error').catch(() => {}); throw error; }
    finally { await context.close(); }
  }

  // Separate fresh company: naming a real edited loadout must survive recommendation and reload.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  const shot = name => page.screenshot({ path: `${shots}/first-drop-custom-${name}.png` });
  try {
    await startCompany(page, url, 'border_dispute');
    await page.getByTestId('first-drop-customise').click();
    await page.getByTestId('lance-manifest').waitFor();
    check('customisation remains an explicit route to the full team and pilot editor',
      await page.getByTestId('prep-machines').isVisible() && await page.getByTestId('hangar-continue').isVisible());
    await page.getByTestId('manifest-cancel').click();
    await page.getByTestId('camp-review-machines').click();
    await page.getByTestId('first-drop-overview').waitFor();
    const original = await readCompany(page);
    const mech = original.mechs.find(machine => machine.design.mounts.length > 1);
    await page.getByTestId(`first-drop-mechlab-${mech.id}`).click();
    const refit = page.getByTestId('refit-bay');
    await refit.getByTestId('bay-readiness').waitFor();
    await clickFittingAction(refit.locator('[data-testid^="remove-weapon-"]').first());
    await refit.getByTestId('bay-save-as').click();
    await page.getByTestId('bay-save-name').fill('First Drop Scout');
    await page.getByTestId('bay-save-confirm').click();
    await refit.waitFor({ state: 'hidden' });
    await page.getByTestId('first-drop-overview').waitFor();
    const edited = await readCompany(page);
    const design = edited.mechs.find(machine => machine.id === mech.id).design;
    check('optional Mechlab commits the named edited loadout and returns to the recommendation',
      design.name === 'First Drop Scout' && design.mounts.length === mech.design.mounts.length - 1
      && (await page.getByTestId(`first-drop-machine-${mech.id}`).innerText()).includes('First Drop Scout'));
    const blueprint = await page.evaluate(id => JSON.parse(localStorage.getItem(`ironline.design.${id}`)), design.id);
    check('the campaign variant is saved as the same reusable blueprint', isDeepStrictEqual(blueprint, design));
    await page.reload();
    await page.getByTestId('home-campaign').click();
    await page.getByTestId('camp-review-machines').click();
    await page.getByTestId('first-drop-overview').waitFor();
    const restored = await readCompany(page);
    check('reloading restores the edited company, inventory and saved weapon layout',
      isDeepStrictEqual(resources(restored), resources(edited))
      && isDeepStrictEqual(restored.mechs.find(machine => machine.id === mech.id).design, design));
    await shot('restored-variant');
    await assertDeployment(page, url, restored, 'custom variant', check, shot);
    check('customised first-drop journey has no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) { await shot('error').catch(() => {}); throw error; }
  finally { await context.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.E2E_URL ?? 'http://127.0.0.1:5225/';
  const shots = process.env.SHOT_DIR ?? 'reports/recommended-first-drop';
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let count = 0;
  const check = (name, ok, details = '') => {
    if (!ok) throw new Error(`${name}${details ? `\n${details}` : ''}`);
    console.log(`PASS ${++count}: ${name}`);
  };
  try {
    await runRecommendedFirstDropChecks({ browser, url, shots, check });
    console.log(`${count} recommended first-drop checks passed. Later-mission outcomes were staged fixtures, not played victories.`);
  } finally { await browser.close(); }
}
