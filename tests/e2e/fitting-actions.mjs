/** Mounted actions are disclosed by keyboard focus as well as hover and touch. */
export async function clickFittingAction(action) {
  await action.waitFor({ state: 'attached' });
  if (!await action.isVisible()) {
    await action.locator('..').locator('.slot-block__inspect').focus();
    await action.waitFor({ state: 'visible' });
  }
  await action.click();
}
