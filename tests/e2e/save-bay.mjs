/** Prime configurations remain immutable; the first save names a new variant. */
export async function saveBay(page) {
  await page.getByTestId('bay-save').click();
  if (await page.getByTestId('bay-save-dialog').isVisible()) {
    await page.getByTestId('bay-save-confirm').click();
  }
}
