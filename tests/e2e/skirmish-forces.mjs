/** Disposable-browser regression: changes made through the actual setup and bay controls. */
export async function runSkirmishForceChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.setDefaultTimeout(25000);
  await page.addInitScript(() => localStorage.setItem('ironline.muted', '1'));
  const pick = async (testId, value) => page.getByTestId(testId).selectOption(value);
  const waitWorld = async (missionId) => page.waitForFunction((id) =>
    globalThis.__wreckright?.world.mission.id === id, missionId);
  try {
    await page.goto(url);
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('enemy-force-setup').waitFor();
    const maps = await page.getByTestId('briefing-map-picker').locator('option').evaluateAll((items) => items.map((item) => item.value));
    check('skirmish offers all six terrain maps', maps.length === 6 && new Set(maps).size === 6);
    for (const map of maps) {
      await pick('briefing-map-picker', map);
      await page.waitForFunction((id) => globalThis.__wreckright?.world.mission.mapId === id, map);
      check(`${map} is a pure skirmish with legal default forces`, await page.getByTestId('briefing-deploy').isEnabled()
        && await page.evaluate(() => globalThis.__wreckright.world.mission.triggers.length === 0));
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

    await page.getByTestId('enemy-berth-customise-0').click();
    await page.getByTestId('outfit-bay').waitFor();
    check('enemy refit identifies its side and opens the selected chassis',
      (await page.getByTestId('bay-commission').innerText()).includes('Enemy berth 1'));
    await page.getByTestId('remove-weapon-0').click();
    await page.getByTestId('bay-save').click();
    await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
    check('enemy refit returns an edited loadout to the opposing berth',
      await page.getByTestId('enemy-berth-design-0').inputValue() === 'custom');
    const savedEnemy = await page.evaluate(() => JSON.parse(localStorage.getItem('ironline.lance.enemy.skirmish_foundry_district')));
    const beforeFriendly = await page.evaluate(() => localStorage.getItem('ironline.lance.skirmish_foundry_district'));
    check('enemy refit save keeps its actual weapon configuration and friendly selection separate',
      savedEnemy[0].design.mounts.length > 0 && JSON.parse(beforeFriendly)[0].designId === 'hornet_spotter');

    await page.reload();
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing-map-picker').waitFor();
    await pick('briefing-map-picker', 'foundry_district');
    await waitWorld('skirmish_foundry_district');
    check('reload restores both sides, customized enemy weapons and independent experience',
      await page.getByTestId('berth-design-0').inputValue() === 'hornet_spotter'
      && await page.getByTestId('enemy-berth-design-0').inputValue() === 'custom'
      && await page.getByTestId('enemy-berth-design-1').inputValue() === 'empty'
      && await page.getByTestId('player-difficulty-picker').inputValue() === 'elite'
      && await page.getByTestId('briefing-difficulty-picker').inputValue() === 'green'
      && await page.evaluate((expected) => JSON.stringify(JSON.parse(localStorage.getItem('ironline.lance.enemy.skirmish_foundry_district'))) === expected, JSON.stringify(savedEnemy)));

    await pick('enemy-berth-design-0', 'empty');
    check('an empty enemy force is blocked with a visible explanation', await page.getByTestId('briefing-deploy').isDisabled()
      && (await page.getByTestId('briefing-blocked-reason').innerText()).includes('Enemy lance needs at least one mech'));
    await pick('enemy-berth-design-0', 'sentinel_brawler');
    await page.getByTestId('enemy-berth-customise-0').click();
    await page.getByTestId('outfit-bay').waitFor();
    await page.getByTestId('remove-weapon-0').click();
    await page.getByTestId('bay-save').click();
    await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
    if (shots) await page.getByTestId('briefing').screenshot({ path: `${shots}/skirmish-forces-desktop.png` });
    await page.getByTestId('briefing-deploy').click();
    await page.getByTestId('briefing').waitFor({ state: 'hidden' });
    const fielded = await page.evaluate(() => ({
      mission: globalThis.__wreckright.world.mission.id,
      difficulty: globalThis.__wreckright.world.difficulty,
      playerDifficulty: globalThis.__wreckright.world.playerDifficulty,
      units: globalThis.__wreckright.world.entities.map((entity) => ({ team: entity.team, design: entity.designId,
        gunnery: entity.pilot.gunnery, weapons: entity.weapons.length })),
      campaign: localStorage.getItem('ironline.campaign'),
    }));
    check('deployment uses the exact two selected forces and their independent tiers', fielded.units.length === 2
      && fielded.units[0].design === 'hornet_spotter' && fielded.units[1].design === 'sentinel_brawler'
      && fielded.difficulty === 'green' && fielded.playerDifficulty === 'elite'
      && fielded.units[1].weapons === savedEnemy[0].design.mounts.length);
    check('skirmish setup does not create or mutate a campaign', fielded.campaign === null);
    check('skirmish setup and repeated refits produce no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) {
    if (shots) await page.screenshot({ path: `${shots}/skirmish-failure.png` });
    console.error('Browser errors:', errors, 'Page:', await page.locator('body').innerText());
    throw error;
  } finally { await context.close(); }
}
