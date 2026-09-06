/** Older journeys deliberately leave edited drafts; acknowledge the visible discard choice. */
export async function discardRefitIfPrompted(page) {
  await page.waitForFunction(() => !document.querySelector('[data-testid="mechbay"]')
    || document.querySelector('[data-testid="bay-unsaved-dialog"]'));
  const discard = page.locator('[data-testid="bay-unsaved-discard"]');
  if (await discard.isVisible()) await discard.click();
}
