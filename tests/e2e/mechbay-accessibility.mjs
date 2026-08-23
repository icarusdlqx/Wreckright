export async function verifyOutfitDialogRerender({ page, check }) {
  const trigger = page.locator('[data-testid="berth-customise-0"]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-testid="outfit-bay"] [role="dialog"]');

  const head = page.locator(
    '[data-testid="outfit-bay"] [data-testid="bay-location-head"] .bay-location-name',
  );
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
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.activeElement?.matches(
    '[data-testid="bay-location-right_torso"] .bay-location-name',
  ) === true);
  check(
    'a keyboard pick arms and focuses its compatible hardpoint',
    (await page.locator('[data-testid="bay-armed"]').count()) === 1 &&
      (await page.locator('.bay-location.armed-target').count()) === 1 &&
      (await page.locator('[data-testid="bay-location-right_torso"].armed-target').count()) === 1,
  );

  const blockedHeader = page.locator(
    '[data-testid="bay-location-right_arm"] .bay-location-name',
  );
  check(
    'an incompatible occupied location is unavailable while a part is held',
    await blockedHeader.isDisabled(),
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
