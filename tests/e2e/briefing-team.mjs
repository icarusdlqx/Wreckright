/** Exercise the paired skirmish editor through real selection and assignment controls. */
export async function runBriefingTeamLayoutChecks({ page, shots, check }) {
  const team = page.getByTestId('briefing-team');
  const card = page.getByTestId('briefing-berth-2');
  await card.focus();
  await page.keyboard.press('Enter');
  check('keyboard selection exposes only its paired berth editor',
    await card.getAttribute('aria-pressed') === 'true'
    && await page.getByTestId('berth-design-2').isVisible()
    && !await page.getByTestId('berth-design-0').isVisible()
    && await team.locator('.briefing-berth-editor:visible').count() === 1);
  const pilot = page.getByTestId('berth-pilot-2');
  const original = await pilot.inputValue();
  const replacement = await pilot.locator('option').evaluateAll((options, current) =>
    options.find(option => !option.disabled && option.value !== current)?.value, original);
  if (!replacement) throw new Error('No unassigned pilot for the pairing regression');
  await pilot.selectOption(replacement);
  const chosenName = await pilot.locator('option:checked').innerText();
  check('assigning a pilot updates the same card, portrait and selected dossier',
    await card.getAttribute('data-pilot-id') === replacement
    && await card.getByTestId(`portrait-${replacement}`).count() === 1
    && (await team.locator('.briefing-pilot-dossier:visible').innerText()).includes(chosenName));
  await pilot.selectOption(original);
  for (const [name, width, height] of [['laptop', 1024, 768], ['phone', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await card.scrollIntoViewIfNeeded();
    const layout = await team.evaluate(element => {
      const editor = element.querySelector('.briefing-berth-editor:not([hidden])');
      const controls = [...editor.querySelectorAll('select,button')];
      const panel = element.closest('.briefing');
      return { fits: panel.scrollWidth <= panel.clientWidth + 1,
        controls: controls.every(control => control.getBoundingClientRect().width > 80),
        cards: element.querySelectorAll('.briefing-team-card').length,
        portrait: element.querySelectorAll('.briefing-team-card .pilot-portrait').length,
        ability: editor.querySelector('[data-testid="pilot-ability-readout"]') !== null };
    });
    check(`${name} paired preparation preserves every portrait with readable controls and ability`,
      layout.fits && layout.controls && layout.cards === 4 && layout.portrait === 4 && layout.ability);
    if (shots) await page.getByTestId('briefing-lance').screenshot({ path: `${shots}/skirmish-pairings-${name}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByTestId('briefing-berth-0').click();
}
