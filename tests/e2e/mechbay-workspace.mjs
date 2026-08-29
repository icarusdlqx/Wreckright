import { openDesktopBattleMenu } from './input-safety.mjs';
import {
  verifyArmedIncompatibleRemovalFocus,
  verifyOutfitDialogRerender,
} from './mechbay-accessibility.mjs';
import { verifyArmourPaperDoll } from './mechbay-armour-paper-doll.mjs';

async function selectWorkspace(page, tab) {
  await page.locator(`[data-workspace-tab="${tab}"]`).click();
  await page.waitForFunction(
    (expected) => document.querySelector('[data-testid="mechbay"]')?.getAttribute('data-workspace') === expected,
    tab,
  );
}

async function freeTonnage(page) {
  return Number((await page.locator('[data-testid="free-tonnage"]').innerText()).replace('t', ''));
}

async function renderedTextIncludes(locator, expected) {
  return (await locator.innerText()).toLowerCase().includes(expected.toLowerCase());
}

async function verifySavedLoadoutJourney({ page, check }) {
  await selectWorkspace(page, 'loadout');
  const picker = page.locator('[data-testid="design-picker"]');
  await picker.selectOption('hornet_spotter');
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="design-picker"]')?.value === 'hornet_spotter');
  check(
    'the standalone workshop selects an authored Linewrought loadout without a frame builder',
    (await picker.inputValue()) === 'hornet_spotter' &&
      (await page.locator('[data-testid="machine-culture-primary"]').getAttribute('data-faction')) === 'linewrought' &&
      (await page.locator('[data-testid="linewrought-builder-open"]').count()) === 0,
  );

  const loadoutName = 'E2E Workshop Scout';
  const loadoutId = 'e2e_workshop_scout';
  await page.locator('[data-testid="design-name"]').fill(loadoutName);
  await page.waitForFunction((expected) =>
    document.querySelector('[data-testid="design-name"]')?.value === expected, loadoutName);
  check(
    'renaming the stock machine creates an edited loadout without changing chassis',
    (await picker.inputValue()) === '' &&
      await renderedTextIncludes(picker.locator('option[value=""]'), 'edited loadout') &&
      (await page.locator('[data-testid="machine-culture-primary"]').getAttribute('data-faction')) === 'linewrought',
  );

  await selectWorkspace(page, 'review');
  check(
    'the renamed stock loadout reaches the same legal review',
    await renderedTextIncludes(page.locator('[data-testid="build-review-verdict"]'), 'Legal loadout'),
  );

  await page.locator('[data-testid="bay-save"]').click();
  check(
    'the edited loadout keeps the existing saved-design storage contract',
    await page.evaluate(({ id, name }) => {
      const raw = localStorage.getItem(`ironline.design.${id}`);
      if (raw === null) return false;
      const stored = JSON.parse(raw);
      return stored.id === id && stored.name === name && stored.chassisId === 'hornet_hnt2';
    }, { id: loadoutId, name: loadoutName }),
  );

  await page.locator('[data-testid="bay-exit"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
  const berth = page.locator('[data-testid="berth-design-0"]');
  check(
    'the briefing exposes the saved loadout through the existing picker',
    (await berth.locator(`option[value="saved:${loadoutId}"]`).count()) === 1,
  );

  await berth.selectOption(`saved:${loadoutId}`);
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="berth-design-0"]')?.value === 'custom');
  check(
    'choosing the saved loadout freezes it inline in the mission lance',
    await renderedTextIncludes(berth.locator('option[value="custom"]'), loadoutName) &&
      await page.evaluate((name) => Object.entries(localStorage)
        .filter(([key]) => key.startsWith('ironline.lance.'))
        .some(([, raw]) => JSON.parse(raw).some((entry) =>
          entry.design?.name === name && entry.design?.chassisId === 'hornet_hnt2')),
      loadoutName),
  );

  await page.locator('[data-testid="berth-customise-0"]').click();
  await page.waitForSelector('[data-testid="outfit-bay"]');
  check(
    'the saved loadout reopens as a same-chassis berth refit',
    (await page.locator('[data-testid="bay-commission"]').innerText()).startsWith('Refit') &&
      (await page.locator('[data-testid="machine-culture-primary"]').getAttribute('data-faction')) === 'linewrought' &&
      (await page.locator('[data-testid="design-picker"]').count()) === 0,
  );
  await page.locator('[data-testid="bay-exit"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
}

export async function runSkirmishMechbayJourney({ page, check, shots }) {
  process.stdout.write('\nmechbay\n');
  await openDesktopBattleMenu(page);
  await page.locator('[data-testid="choose-mission"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
  await verifyOutfitDialogRerender({ page, check });
  await openDesktopBattleMenu(page);
  await page.locator('[data-testid="open-mechbay"]').click();
  await page.waitForSelector('[data-testid="mechbay"]');

  check('mechbay shows all eight locations', (await page.locator('.bay-location').count()) === 8);
  check(
    'the workspace opens on one visible Loadout panel',
    (await page.locator('[data-testid="bay-workspace-tabs"] [role="tab"]').count()) === 3 &&
      (await page.locator('[data-workspace-tab="loadout"]').getAttribute('aria-selected')) === 'true' &&
      await page.locator('[data-workspace-panel="loadout"]').isVisible() &&
      !(await page.locator('[data-workspace-panel="armour"]').isVisible()) &&
      !(await page.locator('[data-workspace-panel="review"]').isVisible()),
  );
  check(
    'the starting build is legal',
    (await page.locator('[data-testid="bay-status"]').innerText()).includes('legal') &&
      !(await page.locator('[data-testid="bay-save"]').isDisabled()),
  );

  await selectWorkspace(page, 'armour');
  check(
    'Armour & Cooling contains the two focused systems workbenches',
    await page.locator('[data-testid="cooling-bank"]').isVisible() &&
      await page.locator('[data-testid="armour-workbench"]').isVisible() &&
      (await page.locator('[data-testid="cooling-weapon-heat"]').innerText()).includes('/s') &&
      (await page.locator('[data-testid="cooling-dissipation"]').innerText()).includes('/s') &&
      (await page.locator('[data-testid="torso-rear-total"]').innerText()).includes('points'),
  );
  await verifyArmourPaperDoll({ page, check, shots });
  await selectWorkspace(page, 'loadout');

  const firstWeaponRow = page.locator('[data-testid^="stock-weapon-"]').first();
  await firstWeaponRow.focus();
  const inspector = page.locator('#bay-shelf-inspector');
  check(
    'the loadout workspace renders the machine and one visual weapon inspector',
    (await page.locator('[data-testid="mech-preview-canvas"]').count()) === 1 &&
      (await inspector.locator('[role="meter"]').count()) === 3 &&
      (await inspector.locator('.weapon-glyph').count()) === 1 &&
      (await inspector.locator('.weapon-range-strip').count()) === 1,
  );

  const shelfSearch = page.locator('[data-testid="shelf-search"]');
  await shelfSearch.fill('laser');
  const searchedWeapons = page.locator('.weapon-catalog-list .weapon-card');
  check(
    'weapon search narrows the compact catalog',
    (await searchedWeapons.count()) > 0 &&
      await searchedWeapons.evaluateAll((entries) => entries.every((entry) =>
        (entry.textContent ?? '').toLowerCase().includes('laser'))),
  );
  await shelfSearch.fill('');
  const familyFilter = page.locator('[data-testid="shelf-family"]');
  await familyFilter.selectOption('lasers');
  const filteredFamilies = await page
    .locator('.weapon-catalog-list .weapon-card')
    .evaluateAll((entries) => entries.map((entry) => entry.getAttribute('data-weapon-category')));
  check(
    'weapon family filter shows one plain-English family',
    filteredFamilies.length > 0 && filteredFamilies.every((family) => family === 'lasers'),
    filteredFamilies.join(', '),
  );
  await familyFilter.selectOption('all');
  await page.screenshot({ path: `${shots}/05-mechbay-overview.png` });

  const startingFree = await freeTonnage(page);
  check(
    'the shelf hides weapons the hull cannot mount',
    (await page.locator('[data-testid="stock-weapon-gauss_rifle"]').count()) === 0,
  );
  await page.locator('[data-testid="bay-location-right_torso"] .bay-location-name').click();
  check(
    'selecting a hardpoint filters the shelf to that mount',
    (await page.locator('[data-testid="bay-location-filter"]').innerText()).toLowerCase().includes('right torso') &&
      (await page.locator('.weapon-card.is-unavailable').count()) === 0,
  );
  await page.locator('[data-testid="shelf-show-all"]').check();
  const incompatibleGauss = page.locator('[data-testid="stock-weapon-gauss_rifle"]');
  const gaussReason = await incompatibleGauss.getAttribute('title');
  check(
    'showing incompatible weapons explains rather than offering them',
    (await incompatibleGauss.getAttribute('aria-disabled')) === 'true' &&
      gaussReason !== null && gaussReason.trim() !== '',
  );
  await incompatibleGauss.focus();
  check(
    'an incompatible row opens its exact reason without arming a weapon',
    gaussReason !== null &&
      await renderedTextIncludes(inspector, gaussReason) &&
      (await page.locator('[data-testid="bay-armed"]').count()) === 0,
  );
  await page.locator('[data-testid="shelf-show-all"]').uncheck();

  await verifyArmedIncompatibleRemovalFocus({ page, check });
  await page.keyboard.press('Enter');
  const afterFit = await freeTonnage(page);
  check('keyboard pick-to-hardpoint mounts the weapon', afterFit < startingFree, `${startingFree}t → ${afterFit}t`);
  check('an illegal build reports its problems', (await page.locator('[data-testid="bay-issues"] li').count()) > 0);
  check('save is refused for an illegal build', await page.locator('[data-testid="bay-save"]').isDisabled());
  check('export is refused for an illegal build', await page.locator('[data-testid="bay-export"]').isDisabled());
  const blockedSave = await page.evaluate(() => {
    const button = document.querySelector('[data-testid="bay-save"]');
    const before = Object.keys(localStorage).length;
    button?.click();
    return Object.keys(localStorage).length - before;
  });
  check('clicking a disabled save writes nothing to storage', blockedSave === 0);

  await selectWorkspace(page, 'review');
  check(
    'Review groups the illegal fit into an actionable verdict',
    await renderedTextIncludes(page.locator('[data-testid="build-review-verdict"]'), 'Loadout not legal') &&
      (await page.locator('[data-testid="build-review"] [data-issue-component]').count()) > 0 &&
      await renderedTextIncludes(page.locator('[data-testid="build-review-fix"]'), 'Loadout'),
  );
  await page.locator('[data-testid="build-review-fix"]').click();
  check('the review correction returns to Loadout', (await page.locator('[data-testid="mechbay"]').getAttribute('data-workspace')) === 'loadout');
  await page.screenshot({ path: `${shots}/05-mechbay-illegal.png` });

  const fittedLaser = page.locator('[data-testid="bay-location-right_torso"] [data-testid^="inspect-weapon-"]');
  await fittedLaser.click();
  check(
    'selecting a fitted weapon inspects it without removing it',
    (await freeTonnage(page)) === afterFit &&
      await renderedTextIncludes(inspector, 'Medium Laser') &&
      (await page.locator('[data-testid="bay-location-right_torso"] [data-testid^="remove-weapon-"]').count()) === 1,
  );
  await page.locator('[data-testid="bay-location-right_torso"] [data-testid^="remove-weapon-"]').click();
  check(
    'the explicit Remove control restores the legal build and stable location focus',
    !(await page.locator('[data-testid="bay-save"]').isDisabled()) &&
      await page.locator('[data-testid="bay-location-right_torso"] .bay-location-name').evaluate(
        (control) => document.activeElement === control,
      ),
  );
  check('free tonnage returns to its starting value', (await freeTonnage(page)) === startingFree);

  await page.locator('[data-testid="stock-weapon-medium_laser"]').dragTo(
    page.locator('[data-testid="bay-location-right_torso"]'),
  );
  check('drag-to-hardpoint uses the same legal mount path', (await freeTonnage(page)) < startingFree);
  await page.locator('[data-testid="bay-location-right_torso"] [data-testid^="remove-weapon-"]').click();
  check('dragged weapon can be removed cleanly', (await freeTonnage(page)) === startingFree);
  await page.locator('[data-testid="bay-undo"]').click();
  check('Undo restores the last removed fitting', (await freeTonnage(page)) < startingFree);
  await page.locator('[data-testid="bay-redo"]').click();
  check('Redo restores the clean legal build', (await freeTonnage(page)) === startingFree);

  await selectWorkspace(page, 'armour');
  await page.locator('[data-testid="armour-detail"] summary').click();
  await page.locator('[data-testid="armour-head"]').fill('0');
  await selectWorkspace(page, 'loadout');
  check('advanced armour frees tonnage', (await freeTonnage(page)) > startingFree);
  await selectWorkspace(page, 'armour');
  await page.locator('[data-testid="max-armour"]').click();
  await selectWorkspace(page, 'review');
  check(
    'the final review confirms armour allocation and a legal build',
    await renderedTextIncludes(page.locator('[data-testid="build-review-verdict"]'), 'Legal loadout') &&
      await renderedTextIncludes(page.locator('[data-testid="build-review-next-action"]'), 'Ready to commit'),
  );

  await page.locator('[data-testid="bay-save"]').click();
  const saved = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith('ironline.design.')),
  );
  check('a legal build saves to storage', saved.length > 0, saved.join(','));
  check(
    'saving reports success',
    (await page.locator('[data-testid="bay-status"]').innerText()).startsWith('Saved'),
  );
  await page.screenshot({ path: `${shots}/06-mechbay-legal.png` });

  await verifySavedLoadoutJourney({ page, check });
  check(
    'returning to the skirmish remounts the battle',
    (await page.locator('.viewport canvas:not(.perf-overlay)').count()) === 1,
  );
}

export async function runCampaignRefitMechbayJourney({ page, check }) {
  await page.locator('[data-testid^="manifest-refit-"]').first().click();
  await page.waitForSelector('[data-testid="refit-bay"]');
  check(
    'the refit bay opens on the company mech in Loadout',
    (await page.locator('[data-testid="bay-commission"]').innerText()).startsWith('Refit') &&
      (await page.locator('[data-testid="mechbay"]').getAttribute('data-workspace')) === 'loadout',
  );
  const shelvedWeapons = await page
    .locator('.bay-side [data-testid^="stock-weapon-"]')
    .evaluateAll((entries) => entries.map((entry) => entry.getAttribute('data-testid') ?? ''));
  check(
    'the campaign shelf holds the selected welded mech\'s own weapons',
    shelvedWeapons.length === 2 &&
      shelvedWeapons.includes('stock-weapon-flamer') &&
      shelvedWeapons.includes('stock-weapon-srm2') &&
      !shelvedWeapons.includes('stock-weapon-medium_laser'),
    shelvedWeapons.join(', '),
  );
  check(
    'every location exposes a compact fitting summary',
    (await page.locator('[data-testid^="free-slots-"]').count()) === 8,
  );

  const flamerRow = page.locator('[data-testid="stock-weapon-flamer"]');
  const flamerReason = await flamerRow.getAttribute('title');
  await flamerRow.focus();
  const inspector = page.locator('#bay-shelf-inspector');
  const inspectorText = await inspector.innerText();
  check(
    'the selected inspector explains exhausted weapon costs, heat, and range',
    (await inspector.locator('[role="meter"]').count()) === 3 &&
      inspectorText.toLowerCase().includes('slot') &&
      flamerReason !== null &&
      await renderedTextIncludes(inspector, flamerReason) &&
      (await inspector.locator('.weapon-range-strip').count()) === 1,
    `${flamerReason ?? 'no fit reason'} | ${inspectorText}`,
  );
  check(
    'campaign stock cannot be fitted twice before commit',
    (await flamerRow.getAttribute('aria-disabled')) === 'true',
  );

  await selectWorkspace(page, 'armour');
  const coolingOptions = await page.locator('[data-testid="cooling-sink-type"] option').evaluateAll(
    (options) => options.map((option) => ({
      value: option.value,
      disabled: option.disabled,
      selected: option.selected,
    })),
  );
  const standardSink = coolingOptions.find((option) => option.value === 'heat_sink');
  const compoundSink = coolingOptions.find((option) => option.value === 'double_heat_sink');
  check(
    'campaign cooling shows owned technology and disables unavailable alternatives',
    standardSink?.selected === true && standardSink.disabled === false &&
      compoundSink?.disabled === true &&
      (await page.locator('[data-testid="cooling-stock"]').innerText()).includes('available'),
    JSON.stringify(coolingOptions),
  );

  await selectWorkspace(page, 'review');
  check(
    'a no-change company refit has a visible final review',
    await renderedTextIncludes(page.locator('[data-testid="build-review-verdict"]'), 'Legal loadout') &&
      !(await page.locator('[data-testid="bay-save"]').isDisabled()),
  );
  await page.locator('[data-testid="bay-save"]').click();
  await page.waitForSelector('[data-testid="lance-manifest"]');
  check(
    'a company-owned no-change refit returns to the manifest',
    (await page.locator('[data-testid="refit-bay"]').count()) === 0 &&
      (await page.locator('[data-testid="lance-manifest"]').count()) === 1,
  );
}
