/** Existing campaign journeys explicitly accept the new one-time setup; saved runs stay untouched. */
export async function completeInitialCampaignSetup(page, difficulty = 'regular') {
  const start = page.locator('[data-testid="campaign-choice-start"]:enabled');
  if (!(await start.isVisible())) return;
  await page.locator('[data-testid="campaign-difficulty-picker"]').selectOption(difficulty);
  await start.click();
  await page.locator('[data-testid="campaign-chooser"]').waitFor({ state: 'hidden' });
}
