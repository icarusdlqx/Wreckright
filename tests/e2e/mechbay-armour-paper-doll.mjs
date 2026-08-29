async function renderedTextIncludes(locator, expected) {
  return (await locator.innerText()).toLowerCase().includes(expected.toLowerCase());
}

async function armourSliderValue(slider) {
  return Number(await slider.inputValue());
}

export async function verifyArmourPaperDoll({ page, check, shots }) {
  const doll = page.locator('[data-testid="armour-paper-doll"]');
  const locationButtons = doll.locator('button[data-armour-doll-location]');
  const svg = doll.locator('svg');
  check(
    'the armour paper doll exposes eight native location controls over one presentational silhouette',
    (await locationButtons.count()) === 8 &&
      await locationButtons.evaluateAll((buttons) =>
        buttons.every((button) => button.tagName === 'BUTTON')) &&
      (await svg.count()) === 1 &&
      await svg.evaluate((silhouette) =>
        silhouette.closest('[aria-hidden="true"][inert]') !== null &&
        silhouette.querySelector(
          'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) === null),
  );

  const leftTorso = page.locator('[data-testid="armour-doll-left_torso"]');
  await leftTorso.click();
  const slider = page.locator('[data-testid="armour-doll-slider"]');
  check(
    'selecting the left torso leaves exactly one pressed location and labels its native slider',
    (await doll.locator('button[data-armour-doll-location][aria-pressed="true"]').count()) === 1 &&
      (await leftTorso.getAttribute('aria-pressed')) === 'true' &&
      (await slider.getAttribute('aria-label'))?.toLowerCase().includes('left torso') === true,
  );

  const initialValue = await armourSliderValue(slider);
  const initialPlateWeight = await page.locator('[data-testid="armour-plate-weight"]').innerText();
  await slider.focus();
  await page.keyboard.press('ArrowLeft');
  const keyboardValue = await armourSliderValue(slider);
  check(
    'the selected-location slider changes with the keyboard and keeps focus through its live rerender',
    keyboardValue === initialValue - 1 &&
      await slider.evaluate((control) => document.activeElement === control),
    `${initialValue} → ${keyboardValue}`,
  );
  await page.locator('[data-testid="bay-undo"]').click();
  check(
    'one Undo restores the keyboard armour edit',
    (await armourSliderValue(slider)) === initialValue,
  );

  await leftTorso.scrollIntoViewIfNeeded();
  const wheelStart = await armourSliderValue(slider);
  const scrollBeforeWheel = await page.evaluate(() => window.scrollY);
  const wheelTarget = await leftTorso.boundingBox();
  if (wheelTarget === null) throw new Error('left torso paper-doll control has no bounding box');
  await page.mouse.move(
    wheelTarget.x + wheelTarget.width / 2,
    wheelTarget.y + wheelTarget.height / 2,
  );
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(200);
  const wheelValue = await armourSliderValue(slider);
  check(
    'wheel armour edits stay on the selected control without scrolling the page',
    wheelValue === wheelStart - 2 &&
      (await page.evaluate(() => window.scrollY)) === scrollBeforeWheel,
    `${wheelStart} → ${wheelValue}; scroll ${scrollBeforeWheel} → ${await page.evaluate(() => window.scrollY)}`,
  );
  await page.locator('[data-testid="bay-undo"]').click();
  check(
    'one Undo restores the complete wheel gesture',
    (await armourSliderValue(slider)) === wheelStart,
  );

  const initialPreset = await page.locator(
    '.armour-workbench__preset-grid button[aria-pressed="true"]',
  ).getAttribute('data-testid');
  const nextPreset = initialPreset === 'armour-preset-rear_guard'
    ? 'armour-preset-front_facing'
    : 'armour-preset-rear_guard';
  await page.mouse.move(
    wheelTarget.x + wheelTarget.width / 2,
    wheelTarget.y + wheelTarget.height / 2,
  );
  await page.mouse.wheel(0, 100);
  await page.locator(`[data-testid="${nextPreset}"]`).click();
  await page.waitForTimeout(200);
  check(
    'starting another armour control closes the pending wheel transaction',
    (await armourSliderValue(slider)) === wheelStart - 1 &&
      (await page.locator(`[data-testid="${nextPreset}"]`).getAttribute('aria-pressed')) === 'true',
  );
  await page.locator('[data-testid="bay-undo"]').click();
  check(
    'one Undo after a wheel then preset gesture restores only the preset',
    (await armourSliderValue(slider)) === wheelStart - 1 &&
      initialPreset !== null &&
      (await page.locator(`[data-testid="${initialPreset}"]`).getAttribute('aria-pressed')) === 'true',
  );
  await page.locator('[data-testid="bay-undo"]').click();
  check(
    'a second Undo restores the preceding wheel gesture',
    (await armourSliderValue(slider)) === wheelStart,
  );

  const dragStart = await armourSliderValue(slider);
  const dragTarget = await leftTorso.boundingBox();
  if (dragTarget === null) throw new Error('left torso paper-doll control has no drag target');
  const dragX = dragTarget.x + dragTarget.width / 2;
  const dragY = dragTarget.y + dragTarget.height / 2;
  await page.mouse.move(dragX, dragY);
  await page.mouse.down();
  await page.mouse.move(dragX - 24, dragY, { steps: 4 });
  await page.mouse.up();
  const dragValue = await armourSliderValue(slider);
  const changedPlateWeight = await page.locator('[data-testid="armour-plate-weight"]').innerText();
  check(
    'a horizontal drag changes armour as one direct-manipulation gesture',
    dragValue < dragStart,
    `${dragStart} → ${dragValue}`,
  );
  check(
    'below-median armour is visible, named accessibly, and reflected in the live plate weight',
    (await leftTorso.getAttribute('data-below-class-median')) === 'true' &&
      (await leftTorso.getAttribute('aria-label'))?.toLowerCase().includes('below class median') === true &&
      await renderedTextIncludes(leftTorso, 'Below class median') &&
      (await slider.getAttribute('aria-valuetext'))?.toLowerCase().includes('below class median') === true &&
      (await slider.getAttribute('aria-valuetext'))?.includes(
        `total plating ${changedPlateWeight.replace('t plate', '')} tons`,
      ) === true &&
      /^\d+\.\dt plate$/.test(changedPlateWeight) &&
      changedPlateWeight !== initialPlateWeight,
    `${initialPlateWeight} → ${changedPlateWeight}`,
  );
  await page.screenshot({ path: `${shots}/05-mechbay-armour-paper-doll.png` });
  await page.locator('[data-testid="bay-undo"]').click();
  check(
    'one Undo restores the complete pointer drag and stock plate weight',
    (await armourSliderValue(slider)) === dragStart &&
      (await page.locator('[data-testid="armour-plate-weight"]').innerText()) === initialPlateWeight,
  );
}
