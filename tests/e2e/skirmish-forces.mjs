import { saveBay } from './save-bay.mjs';
/** Disposable-browser regression: changes made through the actual setup and bay controls. */
import { runBriefingTeamLayoutChecks } from './briefing-team.mjs';
import { clickFittingAction } from './fitting-actions.mjs';

export async function runSkirmishForceChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.setDefaultTimeout(25000);
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  const pick = async (testId, value) => {
    const berth = /^(enemy-)?berth-(?:design|pilot)-(\d+)$/.exec(testId);
    if (berth) await page.getByTestId(`${berth[1] ?? ''}briefing-berth-${berth[2]}`).click();
    await page.getByTestId(testId).selectOption(value);
  };
  const waitWorld = async (missionId) => page.waitForFunction((id) =>
    globalThis.__ironmuster?.world.mission.id === id, missionId);
  try {
    await page.goto(url);
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('enemy-force-setup').waitFor();
    check('both skirmish sides show paired pilot and mech cards with one editable berth',
      await page.getByTestId('briefing-team').locator('.briefing-team-card').count() === 4
      && await page.getByTestId('enemy-briefing-team').locator('.briefing-team-card').count() === 4
      && await page.getByTestId('briefing-team').locator('.briefing-berth-editor:visible').count() === 1
      && await page.getByTestId('enemy-briefing-team').locator('.briefing-berth-editor:visible').count() === 1);
    if (shots) await page.getByTestId('briefing-lance').screenshot({ path: `${shots}/skirmish-pilot-pairings.png` });
    await runBriefingTeamLayoutChecks({ page, shots, check });
    const maps = await page.getByTestId('briefing-map-picker').locator('option').evaluateAll((items) => items.map((item) => item.value));
    check('skirmish offers all twelve terrain maps', maps.length === 12 && new Set(maps).size === 12);
    for (const map of maps) {
      await pick('briefing-map-picker', map);
      await page.waitForFunction((id) => globalThis.__ironmuster?.world.mission.mapId === id, map);
      check(`${map} is a pure skirmish with legal default forces`, await page.getByTestId('briefing-deploy').isEnabled()
        && await page.evaluate(() => globalThis.__ironmuster.world.mission.triggers.length === 0));
    }
    await pick('briefing-map-picker', 'foundry_district');
    await waitWorld('skirmish_foundry_district');
    for (const faction of ['aurelian', 'linewrought', 'mixed']) {
      await pick('briefing-faction-picker', faction);
      await pick('enemy-faction-picker', faction);
      check(`${faction} presets are selectable for both sides and fit the drop`,
        await page.getByTestId('briefing-faction-picker').inputValue() === faction
        && await page.getByTestId('enemy-faction-picker').inputValue() === faction
        && await page.getByTestId('briefing-deploy').isEnabled());
    }
    await pick('player-difficulty-picker', 'elite');
    await pick('briefing-difficulty-picker', 'green');
    await page.getByTestId('briefing').waitFor();
    await pick('briefing-difficulty-picker', 'green');
    await pick('briefing-mission-picker', 'skirmish_foundry_district');
    check('reselecting the current difficulty or mission keeps the briefing usable', await page.getByTestId('briefing').isVisible());
    await pick('berth-design-0', 'hornet_spotter');
    await pick('enemy-berth-design-0', 'sentinel_brawler');
    for (let index = 1; index < 4; index++) {
      await pick(`berth-design-${index}`, 'empty');
      await pick(`enemy-berth-design-${index}`, 'empty');
    }
    check('tonnage and empty berths permit one selected mech on each side',
      await page.getByTestId('briefing-deploy').isEnabled()
      && (await page.getByTestId('enemy-tonnage').innerText()).startsWith('45/'));

    await page.getByTestId('briefing-berth-0').click();
    await page.getByTestId('berth-customise-0').click();
    await page.getByTestId('outfit-bay').waitFor();
    await clickFittingAction(page.getByTestId('remove-weapon-0'));
    await saveBay(page);
    await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
    const savedFriendly = await page.evaluate(() => localStorage.getItem('ironline.lance.skirmish_foundry_district'));
    check('friendly Commit refit saves its actual changed weapons before leaving the bay',
      await page.getByTestId('berth-design-0').inputValue() === 'custom'
      && JSON.parse(savedFriendly)[0].design.mounts.length === 2
      && JSON.parse(savedFriendly)[0].design.mounts.every((mount) => mount.weaponId === 'srm2'));

    await page.getByTestId('enemy-briefing-berth-0').click();
    await page.getByTestId('enemy-berth-customise-0').click();
    await page.getByTestId('outfit-bay').waitFor();
    check('enemy refit identifies its side and opens the selected chassis',
      (await page.getByTestId('bay-commission').innerText()).includes('Enemy berth 1'));
    await clickFittingAction(page.getByTestId('remove-weapon-0'));
    await saveBay(page);
    await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
    check('enemy refit returns an edited loadout to the opposing berth',
      await page.getByTestId('enemy-berth-design-0').inputValue() === 'custom');
    const savedEnemy = await page.evaluate(() => JSON.parse(localStorage.getItem('ironline.lance.enemy.skirmish_foundry_district')));
    const beforeFriendly = await page.evaluate(() => localStorage.getItem('ironline.lance.skirmish_foundry_district'));
    check('enemy refit save keeps its actual weapon configuration and friendly selection separate',
      savedEnemy[0].design.mounts.length > 0 && beforeFriendly === savedFriendly);

    await page.reload();
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing-map-picker').waitFor();
    check('Home Skirmish reopens the last selected map automatically after reload',
      await page.getByTestId('briefing-map-picker').inputValue() === 'foundry_district');
    await waitWorld('skirmish_foundry_district');
    check('reload restores both sides, customized enemy weapons and independent experience',
      await page.getByTestId('berth-design-0').inputValue() === 'custom'
      && await page.getByTestId('enemy-berth-design-0').inputValue() === 'custom'
      && await page.getByTestId('enemy-berth-design-1').inputValue() === 'empty'
      && await page.getByTestId('player-difficulty-picker').inputValue() === 'elite'
      && await page.getByTestId('briefing-difficulty-picker').inputValue() === 'green'
      && await page.evaluate((expected) => localStorage.getItem('ironline.lance.skirmish_foundry_district') === expected, savedFriendly)
      && await page.evaluate((expected) => JSON.stringify(JSON.parse(localStorage.getItem('ironline.lance.enemy.skirmish_foundry_district'))) === expected, JSON.stringify(savedEnemy)));
    check('map selection explains the per-map saved setup',
      (await page.getByTestId('skirmish-map-save-note').innerText()).includes('both lances, their refits and your crew experience'));
    if (shots) await page.getByTestId('briefing').screenshot({ path: `${shots}/skirmish-last-map-restored.png` });

    await pick('briefing-mission-picker', 'authority_root_exchange');
    await waitWorld('authority_root_exchange');
    await page.reload();
    await page.getByTestId('home-skirmish').click();
    await waitWorld('skirmish_foundry_district');
    check('a campaign scenario selection cannot replace the remembered skirmish map or its refit',
      await page.getByTestId('briefing-map-picker').inputValue() === 'foundry_district'
      && await page.getByTestId('berth-design-0').inputValue() === 'custom');

    await pick('enemy-berth-design-0', 'empty');
    check('an empty enemy force is blocked with a visible explanation', await page.getByTestId('briefing-deploy').isDisabled()
      && (await page.getByTestId('briefing-blocked-reason').innerText()).includes('Enemy lance needs at least one mech'));
    await pick('enemy-berth-design-0', 'sentinel_brawler');
    await page.getByTestId('enemy-berth-customise-0').click();
    await page.getByTestId('outfit-bay').waitFor();
    await clickFittingAction(page.getByTestId('remove-weapon-0'));
    await saveBay(page);
    await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
    if (shots) await page.getByTestId('briefing').screenshot({ path: `${shots}/skirmish-forces-desktop.png` });
    await page.getByTestId('briefing-deploy').click();
    await page.getByTestId('briefing').waitFor({ state: 'hidden' });
    const fielded = await page.evaluate(() => ({
      mission: globalThis.__ironmuster.world.mission.id,
      difficulty: globalThis.__ironmuster.world.difficulty,
      playerDifficulty: globalThis.__ironmuster.world.playerDifficulty,
      units: globalThis.__ironmuster.world.entities.map((entity) => ({ team: entity.team, design: entity.designId,
        gunnery: entity.pilot.gunnery, weapons: entity.weapons.length })),
      campaign: localStorage.getItem('ironline.campaign'),
      enemyDesign: JSON.parse(localStorage.getItem('ironline.lance.enemy.skirmish_foundry_district'))[0].design,
    }));
    check('deployment uses the exact two selected forces and their independent tiers', fielded.units.length === 2
      && fielded.units[0].design === JSON.parse(savedFriendly)[0].design.id && fielded.units[1].design === fielded.enemyDesign.id
      && fielded.difficulty === 'green' && fielded.playerDifficulty === 'elite'
      && fielded.units[0].weapons === JSON.parse(savedFriendly)[0].design.mounts.length
      && fielded.units[1].weapons === savedEnemy[0].design.mounts.length);
    check('skirmish setup does not create or mutate a campaign', fielded.campaign === null);

    await page.reload();
    await page.getByTestId('home-learn').click();
    await waitWorld('training_ground');
    await page.reload();
    await page.getByTestId('home-skirmish').click();
    await waitWorld('skirmish_foundry_district');
    check('Learn Command does not overwrite the last skirmish map',
      await page.getByTestId('briefing-map-picker').inputValue() === 'foundry_district');

    for (const invalid of ['retired_map', 'authority_root_exchange']) {
      await page.evaluate((value) => localStorage.setItem('ironline.skirmish.lastMap', value), invalid);
      await page.reload();
      await page.getByTestId('home-skirmish').click();
      await waitWorld('skirmish_ridge');
      check(`invalid map preference ${invalid} safely opens Ridge without changing saved refits`,
        await page.getByTestId('briefing-map-picker').inputValue() === 'ridge_pass'
        && await page.evaluate((expected) => localStorage.getItem('ironline.lance.skirmish_foundry_district') === expected
          && localStorage.getItem('ironline.campaign') === null, savedFriendly));
    }
    check('skirmish setup and repeated refits produce no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) {
    if (shots) await page.screenshot({ path: `${shots}/skirmish-failure.png` });
    console.error('Browser errors:', errors, 'Page:', await page.locator('body').innerText());
    throw error;
  } finally { await context.close(); }
}
