import { openDesktopBattleMenu } from './input-safety.mjs';

export async function quietLocationState(page, allowArmourReveal = false) {
  return page.locator('.bay-location').evaluateAll((cards, allowReveal) => {
    const visible = (element) => {
      if (element === null) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };
    const quietCards = cards.filter((card) => {
      const slotGrid = card.querySelector('[data-testid^="slots-grid-"]');
      const freeSlots = card.querySelector('[data-testid^="free-slots-"]');
      const armour = card.querySelector('.bay-armour-compact');
      const armourDetail = card.querySelector('.bay-armour-detail');
      const cardLabel = card.getAttribute('aria-label') ?? '';
      const armourLabel = armour?.closest('[data-testid^="armour-faces-"]')
        ?.getAttribute('aria-label') ?? '';
      const armourIsSequenced = visible(armour) && !visible(armourDetail) ||
        allowReveal && !visible(armour) && visible(armourDetail);
      return card.querySelector('.bay-location-name') !== null &&
        slotGrid !== null && freeSlots !== null && visible(card.querySelector('.rack-cell')) &&
        armourIsSequenced && /^\d+\+\d+$/.test(armour?.textContent ?? '') &&
        card.querySelector('.bay-slots') === null &&
        card.querySelector('.bay-hardpoints') === null &&
        card.querySelector('.bay-location-flags') === null &&
        card.querySelector('.bay-location-refusal') === null &&
        card.getAttribute('data-targeting') !== 'true' &&
        /\d+ of \d+ slots used/i.test(cardLabel) &&
        /front/i.test(armourLabel) && /rear/i.test(armourLabel);
    });
    return { count: cards.length, quiet: quietCards.length };
  }, allowArmourReveal);
}

async function armourRevealState(page) {
  const card = page.locator('[data-testid="bay-location-left_torso"]');
  const armour = card.locator('[data-testid="armour-faces-left_torso"]');
  const presentation = () => armour.evaluate((line) => {
    const visible = (selector) => {
      const element = line.querySelector(selector);
      if (element === null) return false;
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    };
    return {
      compact: visible('.bay-armour-compact'),
      detail: visible('.bay-armour-detail'),
      detailText: line.querySelector('.bay-armour-detail')?.textContent ?? '',
    };
  });
  await card.hover();
  const hover = await presentation();
  await page.mouse.move(0, 0);
  await armour.focus();
  const focus = await presentation();
  return { hover, focus };
}

export async function targetingLayerState(page, priorStatus, priorLiveRegions) {
  return page.locator('[data-testid="mechbay"]').evaluate((bay, prior) => {
    const targets = [...bay.querySelectorAll('.bay-location[data-targeting="true"]')];
    const status = bay.querySelector('[data-testid="bay-fit-status"]');
    return {
      count: targets.length,
      complete: targets.every((target) =>
        target.querySelector('.bay-hardpoints') !== null &&
        target.querySelector('.bay-location-flags') !== null),
      refusals: bay.querySelectorAll('.bay-location-refusal').length,
      liveRegions: bay.querySelectorAll('[aria-live]').length,
      uniqueStatus: bay.querySelectorAll('[data-testid="bay-fit-status"]').length === 1 &&
        status?.getAttribute('aria-live') === 'polite',
      statusChanged: (status?.textContent ?? '').trim() !== prior.status,
      namesHeldPart: /medium laser/i.test(status?.textContent ?? ''),
      sameLiveRegionCount: bay.querySelectorAll('[aria-live]').length === prior.liveRegions,
    };
  }, { status: priorStatus, liveRegions: priorLiveRegions });
}

export async function dragStockToLocation(page, sourceTestId, targetTestId) {
  const source = page.locator(`[data-testid="${sourceTestId}"]`);
  const target = page.locator(`[data-testid="${targetTestId}"]`);
  await target.scrollIntoViewIfNeeded();
  await source.scrollIntoViewIfNeeded();
  const priorStatus = (await page.locator('[data-testid="bay-fit-status"]').innerText()).trim();
  const priorLiveRegions = await page.locator('[data-testid="mechbay"] [aria-live]').count();
  const sourceBox = await source.boundingBox();
  if (sourceBox === null) throw new Error(`${sourceTestId} drag source is not rendered`);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width + 12, sourceBox.y + sourceBox.height / 2, { steps: 4 });
  await page.waitForFunction((testId) =>
    document.querySelector(`[data-testid="${testId}"]`)?.getAttribute('data-targeting') === 'true',
  targetTestId);
  const targeting = await targetingLayerState(page, priorStatus, priorLiveRegions);
  const targetBox = await target.boundingBox();
  if (targetBox === null) throw new Error(`${targetTestId} drag target is not rendered`);
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
  await page.mouse.up();
  return targeting;
}

export async function verifyQuietBayOpening({ page, check, selectWorkspace, comparisonDirections }) {
  const restingLocations = await quietLocationState(page);
  const armourReveal = await armourRevealState(page);
  check(
    'mechbay shows all eight quiet resting locations',
    restingLocations.count >= 5 && restingLocations.count <= 8 &&
      restingLocations.quiet === restingLocations.count &&
      !armourReveal.hover.compact && armourReveal.hover.detail &&
      !armourReveal.focus.compact && armourReveal.focus.detail &&
      /front.*rear.*total/i.test(armourReveal.focus.detailText),
    JSON.stringify({ restingLocations, armourReveal }),
  );
  const initialExplainers = await explainerState(page);
  check(
    'the workspace opens on one visible Loadout panel',
    (await page.locator('[data-testid="bay-workspace-tabs"] [role="tab"]').count()) === 3 &&
      (await page.locator('[data-workspace-tab="loadout"]').getAttribute('aria-selected')) === 'true' &&
      await page.locator('[data-workspace-panel="loadout"]').isVisible() &&
      !(await page.locator('[data-workspace-panel="armour"]').isVisible()) &&
      !(await page.locator('[data-workspace-panel="review"]').isVisible()) &&
      !(await page.locator('[data-testid="build-compare"]').isVisible()) &&
      initialExplainers.workbenchExpanded === 'true' &&
      initialExplainers.cultureExpanded === 'true',
  );
  check(
    'the starting build is legal',
    (await page.locator('[data-testid="bay-status"]').innerText()).includes('legal') &&
      !(await page.locator('[data-testid="bay-save"]').isDisabled()),
  );
  await selectWorkspace(page, 'review');
  const comparison = await comparisonDirections(page);
  check(
    'Review starts with seven neutral stock-comparison metrics',
    Object.keys(comparison).length === 7 &&
      Object.values(comparison).every((direction) => direction === 'neutral') &&
      (await page.locator('[data-testid="build-compare-baseline"]').innerText()).includes('Sentinel') &&
      await page.locator('[data-testid="build-compare"]').isVisible() &&
      await page.locator('[data-testid="build-compare"]').evaluate((strip) =>
        strip.closest('[data-workspace-panel="review"]') !== null),
    JSON.stringify(comparison),
  );
  await selectWorkspace(page, 'loadout');
}

async function explainerState(page) {
  const workbench = page.locator('[data-testid="bay-workbench-disclosure"]');
  const culture = page.locator('[data-testid="bay-culture-disclosure"]');
  return {
    controls: (await workbench.count()) + (await culture.count()),
    workbenchExpanded: await workbench.getAttribute('aria-expanded'),
    cultureExpanded: await culture.getAttribute('aria-expanded'),
    touchSized: await page.locator(
      '[data-testid="bay-workbench-disclosure"], [data-testid="bay-culture-disclosure"]',
    ).evaluateAll((controls) => controls.length === 2 && controls.every((control) => {
      const bounds = control.getBoundingClientRect();
      return bounds.width >= 44 && bounds.height >= 44;
    })),
  };
}

async function fitTrainingStored(page) {
  return page.evaluate(() => {
    try {
      const record = JSON.parse(localStorage.getItem('ironline.training.mechbay-fit') ?? 'null');
      return record?.version === 1 && record.complete === true;
    } catch {
      return false;
    }
  });
}

export async function verifyFirstFitExplainers({ page, check }) {
  const folded = await explainerState(page);
  check(
    'the first successful fit folds both explainers and records training progress',
    folded.controls === 2 &&
      folded.workbenchExpanded === 'false' &&
      folded.cultureExpanded === 'false' &&
      await fitTrainingStored(page),
    JSON.stringify(folded),
  );

  await page.locator('[data-testid="bay-workbench-disclosure"]').click();
  await page.locator('[data-testid="bay-culture-disclosure"]').click();
  const reopened = await explainerState(page);
  check(
    'the folded workbench and culture explanations remain available by disclosure',
    reopened.workbenchExpanded === 'true' && reopened.cultureExpanded === 'true',
    JSON.stringify(reopened),
  );
  await page.locator('[data-testid="bay-workbench-disclosure"]').click();
  await page.locator('[data-testid="bay-culture-disclosure"]').click();
}

export async function verifyAutoFitSnap({ page, check }) {
  await page.locator('[data-testid="stock-weapon-medium_laser"]').click();
  await page.locator('[data-testid="bay-armed-autofit"]').click();
  const landing = await page.evaluate(() => {
    const locations = [...document.querySelectorAll('.bay-location[data-snap-phase]')];
    return {
      count: locations.length,
      phase: locations[0]?.getAttribute('data-snap-phase') ?? null,
      testId: locations[0]?.getAttribute('data-testid') ?? null,
      removeControls: locations[0]?.querySelectorAll('[data-testid^="remove-weapon-"]').length ?? 0,
      snapBlocks: locations[0]?.querySelectorAll('.slot-block.snap-target').length ?? 0,
      animations: [...(locations[0]?.querySelectorAll('.slot-block.snap-target .rack-cell') ?? [])]
        .map((cell) => {
          const style = getComputedStyle(cell);
          return { name: style.animationName, duration: style.animationDuration };
        }),
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedAnimations = await page.locator('.slot-block.snap-target .rack-cell').evaluateAll(
    (cells) => cells.map((cell) => getComputedStyle(cell).animationName),
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  check(
    'auto-fit marks the landing rack for snap feedback without changing its controls',
    landing.count === 1 && (landing.phase === '1' || landing.phase === '2') &&
      landing.testId?.startsWith('bay-location-') === true &&
      landing.removeControls > 0 && landing.snapBlocks === 1 &&
      landing.animations.length > 0 && landing.animations.every((animation) =>
        animation.name.startsWith('bay-rack-snap-') && animation.duration === '0.12s') &&
      reducedAnimations.length === landing.animations.length &&
      reducedAnimations.every((name) => name === 'none'),
    JSON.stringify({ landing, reducedAnimations }),
  );
  if (landing.testId !== null) {
    await page.locator(
      `[data-testid="${landing.testId}"] [data-testid^="remove-weapon-"]`,
    ).last().click();
  }
}

export async function verifyFoldPersistenceAfterReload({ page, check }) {
  await page.reload();
  await page.waitForSelector('[data-testid="home-screen"]');
  await page.locator('[data-testid="home-skirmish"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
  await openDesktopBattleMenu(page);
  await page.locator('[data-testid="open-mechbay"]').click();
  await page.waitForSelector('[data-testid="mechbay"]');
  const folded = await explainerState(page);
  check(
    'the quiet-bay fold state survives a real reload',
    folded.controls === 2 &&
      folded.workbenchExpanded === 'false' &&
      folded.cultureExpanded === 'false' &&
      await fitTrainingStored(page),
    JSON.stringify(folded),
  );
  await page.locator('[data-testid="bay-exit"]').click();
  await page.waitForSelector('[data-testid="briefing"]');
}

export { explainerState, fitTrainingStored };

export async function verifyOutfitDialogRerender({ page, check }) {
  const trigger = page.locator('[data-testid="berth-customise-0"]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="outfit-bay"] [role="dialog"]');

  const head = page
    .locator(
      '[data-testid="outfit-bay"] :is([data-testid="bay-location-head"] .bay-location-name, [data-testid="bay-location-compact-head"])',
    )
    .first();
  await head.focus();
  const priorError = await page.evaluate(async () => {
    const { useGame } = await import('/src/ui/store.ts');
    const error = useGame.getState().error;
    useGame.getState().patch({ error: 'audit' });
    return error;
  });
  await page.waitForSelector('[data-testid="error"]');
  check(
    'the skirmish outfit dialog keeps focus through a battle-store rerender',
    await head.evaluate((control) => document.activeElement === control),
  );

  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="outfit-bay"]', { state: 'detached' });
  check(
    'closing the rerendered outfit dialog restores its berth trigger',
    await trigger.evaluate((control) => document.activeElement === control),
  );
  await page.evaluate(async (error) => {
    const { useGame } = await import('/src/ui/store.ts');
    useGame.getState().patch({ error });
  }, priorError);
}

export async function verifyArmedIncompatibleRemovalFocus({ page, check }) {
  const mediumLaser = page.locator('[data-testid="stock-weapon-medium_laser"]');
  await mediumLaser.focus();
  const priorStatus = (await page.locator('[data-testid="bay-fit-status"]').innerText()).trim();
  const priorLiveRegions = await page.locator('[data-testid="mechbay"] [aria-live]').count();
  const quietBeforePickup = await quietLocationState(page);
  await page.keyboard.press('Enter');
  const targeting = await targetingLayerState(page, priorStatus, priorLiveRegions);
  await page.waitForFunction(() => document.activeElement?.matches(
    '[data-testid="bay-location-right_torso"] .bay-location-name',
  ) === true);
  check(
    'a keyboard pick arms and focuses its compatible hardpoint',
    (await page.locator('[data-testid="bay-armed"]').count()) === 1 &&
      (await page.locator('.bay-location.armed-target').count()) === 1 &&
      (await page.locator('[data-testid="bay-location-right_torso"].armed-target').count()) === 1 &&
      quietBeforePickup.count >= 5 && quietBeforePickup.quiet === quietBeforePickup.count &&
      targeting.count === quietBeforePickup.count && targeting.complete && targeting.refusals > 0 &&
      targeting.uniqueStatus && targeting.statusChanged && targeting.namesHeldPart &&
      targeting.sameLiveRegionCount,
    JSON.stringify({ quietBeforePickup, targeting }),
  );

  const blockedHeader = page.locator(
    '[data-testid="bay-location-right_arm"] .bay-location-name',
  );
  check(
    'an incompatible occupied location is unavailable while a part is held',
    await blockedHeader.isDisabled() &&
      (await page.locator(
        '[data-testid="bay-location-right_arm"] .bay-location-refusal',
      ).innerText()).trim() !== '',
  );
  await page.locator(
    '[data-testid="bay-location-right_arm"] [data-testid^="remove-weapon-"]',
  ).first().click();
  check(
    'removing there restores focus to the selected compatible location',
    await page.locator(
      '[data-testid="bay-location-right_torso"] .bay-location-name',
    ).evaluate((control) => document.activeElement === control) &&
      (await page.locator('[data-testid="bay-armed"]').count()) === 0,
  );

  await page.locator('[data-testid="bay-undo"]').click();
  await mediumLaser.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.matches(
    '[data-testid="bay-location-right_torso"] .bay-location-name',
  ) === true);
}
