/** Navigate the single-page editor and the folded company tools as a player does. */
export async function selectBaySection(page, section) {
  if (section === 'loadout') {
    for (const name of ['armour', 'review']) {
      const detail = page.locator(`[data-workspace-panel="${name}"]`);
      if (await detail.getAttribute('open') !== null) await detail.locator(':scope > summary').click();
    }
  }
  const panel = page.locator(`[data-workspace-panel="${section}"]`);
  if (section !== 'loadout' && await panel.getAttribute('open') === null) await panel.locator(':scope > summary').click();
  await panel.scrollIntoViewIfNeeded();
}
export async function openCompanyTools(page) {
  const tools = page.locator('.company-tools');
  if (await tools.count() && await tools.getAttribute('open') === null) await tools.locator(':scope > summary').click();
}
export async function returnFromAutoPreparation(page) {
  const cancel = page.getByTestId('manifest-cancel');
  if (await cancel.isVisible()) await cancel.click();
}

export async function openCampaignDetails(page) {
  await page.getByTestId('campaign').waitFor();
  for (const selector of ['.company-tools', '.campaign-route-overview', '.campaign-terms-detail', '.campaign-optional-work', '.campaign-company-detail']) {
    const detail = page.locator(selector);
    if (await detail.count() && await detail.getAttribute('open') === null)
      await detail.locator(':scope > summary').click();
  }
}
