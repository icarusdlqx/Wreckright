import { saveBay } from './save-bay.mjs';
import { clickFittingAction } from './fitting-actions.mjs';

/** Saved fixtures enter through storage; every faction, hull and refit change uses actual UI controls. */
export async function runSkirmishFactionChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.setDefaultTimeout(25000);
  await page.addInitScript(() => {
    localStorage.setItem('ironline.muted', '1');
    globalThis.__blockedLanceKeys = [];
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (globalThis.__blockedLanceKeys.includes(key)) throw new DOMException('Test quota exceeded', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  const factionId = side => side ? 'enemy-faction-picker' : 'briefing-faction-picker';
  const prefix = side => side ? 'enemy-' : '';
  const key = side => `ironline.lance.${side ? 'enemy.' : ''}skirmish_ridge`;
  const select = async (side, index, value) => {
    await page.getByTestId(`${prefix(side)}briefing-berth-${index}`).click();
    await page.getByTestId(`${prefix(side)}berth-design-${index}`).selectOption(value);
  };
  const refit = async (side, index = 0) => {
    await page.getByTestId(`${prefix(side)}briefing-berth-${index}`).click();
    await page.getByTestId(`${prefix(side)}berth-customise-${index}`).click();
    await page.getByTestId('bay-save').waitFor();
  };
  const storage = side => page.evaluate(key => localStorage.getItem(key), key(side));
  try {
    await page.goto(url);
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('enemy-force-setup').waitFor();
    const fixtures = await page.evaluate(() => {
      const catalog = globalThis.__wreckright.world.catalog;
      const entries = [...catalog.designs.values()].filter(design => catalog.chassis.get(design.chassisId).frame === 'mech');
      const fixtures = {};
      for (const faction of ['linewrought', 'aurelian']) {
        const candidates = entries.filter(design => catalog.chassis.get(design.chassisId).faction === faction);
        const design = structuredClone(candidates.find(design => design.mounts.length >= 3
          && catalog.chassis.get(design.chassisId).tonnage <= 50));
        design.id = `faction_check_${faction}`;
        design.name = `${faction} saved refit`;
        design.mounts = design.mounts.slice(1);
        localStorage.setItem(`ironline.design.${design.id}`, JSON.stringify(design));
        fixtures[faction] = { design, stock: candidates.map(design => design.id) };
      }
      localStorage.setItem('ironline.design.invalid_faction_check', '{}');
      return fixtures;
    });
    for (const side of [0, 1]) {
      for (const faction of ['aurelian', 'linewrought', 'mixed']) {
        await page.getByTestId(factionId(side)).selectOption(faction);
        await page.getByTestId(`${prefix(side)}briefing-berth-0`).click();
        const options = await page.getByTestId(`${prefix(side)}berth-design-0`).locator('option').evaluateAll(items => items.map(item => item.value));
        const cultures = faction === 'mixed' ? ['linewrought', 'aurelian'] : [faction];
        const savedChoices = await page.evaluate(cultures => {
          const catalog = globalThis.__wreckright.world.catalog;
          return Object.keys(localStorage).filter(key=>key.startsWith('ironline.design.')).flatMap(key=>{
            const design = JSON.parse(localStorage.getItem(key));
            return cultures.includes(catalog.chassis.get(design.chassisId)?.faction) ? [`saved:${design.id}`] : [];
          });
        }, cultures);
        const expected = ['empty', ...cultures.flatMap(faction => fixtures[faction].stock), ...savedChoices];
        check(`${side ? 'enemy' : 'player'} ${faction} lists exactly its eligible stock and saved hulls`,
          JSON.stringify([...options].sort()) === JSON.stringify(expected.sort()));
      }
      const faction = side ? 'aurelian' : 'linewrought';
      await page.getByTestId(factionId(side)).selectOption(faction);
      if (shots) {
        // Expand the real option list for an inspection image; no application state is changed.
        const select = page.getByTestId(`${prefix(side)}berth-design-0`);
        await select.evaluate(element => { element.size = 11; });
        await page.getByTestId(`${prefix(side)}briefing-team`).screenshot({ path: `${shots}/after-${faction}-choices.png` });
        await select.evaluate(element => element.removeAttribute('size'));
      }
      await select(side, 0, `saved:${fixtures[faction].design.id}`);
      const beforeCancel = await storage(side);
      await refit(side);
      await clickFittingAction(page.getByTestId('remove-weapon-0'));
      await page.getByTestId('bay-exit').click();
      await page.getByTestId('bay-unsaved-discard').click();
      await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
      check(`${faction} cancelled refit keeps its exact saved loadout and faction`,
        await storage(side) === beforeCancel && await page.getByTestId(factionId(side)).inputValue() === faction);
      await refit(side);
      await clickFittingAction(page.getByTestId('remove-weapon-0'));
      await saveBay(page);
      await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
      const saved = JSON.parse(await storage(side));
      check(`${faction} committed refit keeps its faction and exact changed weapons`, saved[0].factionChoice === faction
        && saved[0].design.chassisId === fixtures[faction].design.chassisId
        && JSON.stringify(saved[0].design.mounts) === JSON.stringify(fixtures[faction].design.mounts.slice(1))
        && await page.getByTestId(factionId(side)).inputValue() === faction);
      await select(side, 1, 'empty');
      await refit(side, 1);
      await saveBay(page);
      await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
      const filled = JSON.parse(await storage(side))[1];
      const filledFaction = await page.evaluate(chassisId => globalThis.__wreckright.world.catalog.chassis.get(chassisId)?.faction,
        filled.design.chassisId);
      check(`${faction} empty-berth refit fills an allowed hull without changing faction`, filled.empty !== true
        && filledFaction === faction && await page.getByTestId(factionId(side)).inputValue() === faction);
      await select(side, 1, 'empty');
    }
    const ridge = [await storage(0), await storage(1)];
    await page.getByTestId('briefing-map-picker').selectOption('foundry_district');
    for (const side of [0, 1]) {
      await page.getByTestId(factionId(side)).selectOption('mixed');
      for (let index = 0; index < 4; index++) await select(side, index, index === 0 ? 'hornet_spotter' : 'empty');
      check(`${side ? 'enemy' : 'player'} Mixed stays selected after becoming a single Linewrought mech`,
        await page.getByTestId(factionId(side)).inputValue() === 'mixed');
    }
    await page.reload();
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('enemy-force-setup').waitFor();
    check('reload preserves both explicit Mixed choices independently of single-faction composition',
      await page.getByTestId('briefing-map-picker').inputValue() === 'foundry_district'
      && await page.getByTestId(factionId(0)).inputValue() === 'mixed'
      && await page.getByTestId(factionId(1)).inputValue() === 'mixed');
    await page.getByTestId('briefing-map-picker').selectOption('ridge_pass');
    check('map switch restores both original faction choices and custom refits without rewriting them',
      await page.getByTestId(factionId(0)).inputValue() === 'linewrought'
      && await page.getByTestId(factionId(1)).inputValue() === 'aurelian'
      && await storage(0) === ridge[0] && await storage(1) === ridge[1]);
    await page.evaluate(key => { globalThis.__blockedLanceKeys = [key]; }, key(0));
    await page.getByTestId(factionId(0)).selectOption('mixed');
    for (let index = 0; index < 4; index++) await select(0, index, index === 0 ? 'hornet_spotter' : 'empty');
    const warning = page.getByTestId('skirmish-storage-warning');
    check('quota failure preserves the old roster and faction together and shows a session warning',
      await storage(0) === ridge[0] && await warning.isVisible() && await page.getByTestId(factionId(0)).inputValue() === 'mixed');
    await page.getByTestId('desktop-menu-toggle').click();
    await page.getByTestId('open-mechbay').click();
    await page.getByTestId('bay-exit').click();
    await page.getByTestId('briefing').waitFor();
    check('route remount retains the session-only Mixed choice and single-mech roster',
      await page.getByTestId(factionId(0)).inputValue() === 'mixed'
      && await page.getByTestId('berth-design-0').inputValue() === 'hornet_spotter'
      && await warning.isVisible());
    await page.evaluate(() => { globalThis.__blockedLanceKeys = []; });
    await refit(0);
    await saveBay(page);
    await page.getByTestId('outfit-bay').waitFor({ state: 'hidden' });
    check('successful retry saves both the explicit choice and current refit and clears the warning',
      await warning.count() === 0 && JSON.parse(await storage(0))[0].factionChoice === 'mixed'
      && await page.evaluate(key => {
        const design = JSON.parse(localStorage.getItem(key))[0].design;
        const prime = globalThis.__wreckright.world.catalog.designs.get('hornet_spotter');
        return design.id !== prime.id && design.chassisId === prime.chassisId
          && JSON.stringify(design.mounts) === JSON.stringify(prime.mounts)
          && JSON.stringify(design) === JSON.stringify(JSON.parse(localStorage.getItem(`ironline.design.${design.id}`)));
      }, key(0)));
    if (shots) {
      await page.getByTestId('briefing-faction-picker').scrollIntoViewIfNeeded();
      await page.getByTestId('briefing').screenshot({ path: `${shots}/after-mixed-restored.png` });
    }
    check('faction changes, refits, map switches and reloads produce no browser errors', errors.length === 0, errors.join('\n'));
  } catch (error) {
    if (shots) await page.screenshot({ path: `${shots}/skirmish-factions-failure.png` });
    console.error('Faction browser errors:', errors, 'Page:', await page.locator('body').innerText());
    throw error;
  } finally { await context.close(); }
}
