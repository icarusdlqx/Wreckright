/** Controlled damage presentation fixture. This does not claim a played combat outcome. */
export async function runCombatDamageChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing-mission-picker').selectOption('skirmish_ridge');
    await page.getByTestId('briefing-deploy').click();
    await page.getByTestId('briefing').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => globalThis.__wreckright?.useGame.getState().briefingSeen);
    const fixture = await page.evaluate(() => {
      const { world, useGame } = globalThis.__wreckright;
      useGame.getState().patch({ paused: true });
      const friendly = world.entities.find(unit => unit.team === world.playerTeam && !unit.destroyed);
      const enemy = world.entities.find(unit => unit.team !== world.playerTeam && !unit.destroyed);
      if (!friendly || !enemy) throw Error('Damage fixture requires two opposing machines');
      friendly.locations.left_arm.destroyed = true;
      friendly.locations.left_torso.armour = 0;
      friendly.locations.centre_torso.armour = friendly.locations.centre_torso.armourMax / 2;
      friendly.locations.centre_torso.internal = friendly.locations.centre_torso.internalMax / 5;
      friendly.locations.right_torso.armour = friendly.locations.right_torso.armourMax;
      friendly.locations.right_torso.rearArmour = 0;
      world.vision.visible.add(enemy.id);
      world.vision.identified.add(enemy.id);
      useGame.getState().setSelection([friendly.id]);
      return { friendlyId: friendly.id, enemyId: enemy.id };
    });
    await page.getByTestId('unit-details-toggle').click();
    const panel = page.getByTestId('sidebar');
    const doll = panel.getByTestId('paper-doll');
    await page.waitForFunction(() => document.querySelector('[data-testid="doll-shape-left_arm"]')?.getAttribute('data-armour') === 'destroyed');
    check('damage miniature gives every mech section a named silhouette region',
      await doll.locator('[data-testid^="doll-shape-"]').count() === 8 && await doll.locator('.doll-cell:disabled').count() === 8);
    check('armour stripped from a live section is critical while its internal core remains sound',
      await doll.getByTestId('doll-shape-left_torso').getAttribute('data-armour') === 'critical'
      && await doll.getByTestId('doll-shape-left_torso').getAttribute('data-structure') === 'sound');
    check('damaged armour and critical internal structure use independent conditions',
      await doll.getByTestId('doll-shape-centre_torso').getAttribute('data-armour') === 'damaged'
      && await doll.getByTestId('doll-shape-centre_torso').getAttribute('data-structure') === 'critical');
    check('lost sections retain a visible cross and a destroyed accessible name',
      await doll.getByTestId('doll-shape-left_arm').locator('.combat-damage__cross').count() === 1
      && /destroyed/.test(await doll.getByTestId('doll-left_arm').getAttribute('aria-label')));
    check('secondary skills, combat modifiers and log start folded while weapon controls stay visible',
      !(await panel.getByTestId('pilot-hand').isVisible()) && await panel.getByTestId('weapon-groups').isVisible()
      && await panel.getByTestId('log-details').getAttribute('open') === null);
    await page.screenshot({ path: `${shots}/combat-damage-front.png` });
    await doll.getByRole('button', { name: 'Rear', exact: true }).click();
    check('rear toggle exposes stripped torso protection without changing shared arm protection',
      await doll.getByTestId('doll-shape-right_torso').getAttribute('data-armour') === 'critical'
      && await doll.getByTestId('doll-shape-right_arm').getAttribute('data-armour') === 'sound');
    await doll.getByTestId('damage-values').locator('summary').click();
    check('exact front, rear and structure values remain available on demand',
      await doll.getByTestId('doll-rear-right_torso').isVisible()
      && /^0\//.test(await doll.getByTestId('doll-rear-right_torso').innerText()));
    await page.screenshot({ path: `${shots}/combat-damage-rear.png` });
    await doll.getByTestId('damage-values').locator('summary').click();
    await doll.getByRole('button', { name: 'Front', exact: true }).click();
    await panel.getByTestId('tactical-details').locator('summary').click();
    check('expanding tactical details restores pilot attributes and diagnostic readouts',
      await panel.getByTestId('pilot-hand').isVisible() && await panel.getByTestId('tactical-readout').isVisible());
    await panel.getByTestId('tactical-details').locator('summary').click();
    await page.getByTestId('tactics-toggle').click();
    await page.getByTestId('command-called_shot').click();
    const aim = page.getByTestId('called-shot-target');
    await aim.getByTestId('called-shot-hostile').selectOption(String(fixture.enemyId));
    await aim.getByTestId('doll-left_leg').focus();
    await page.keyboard.press('Enter');
    check('keyboard called shots still direct the selected lance at the chosen hostile body section',
      await page.evaluate(({ friendlyId, enemyId }) => {
        const { world, useGame } = globalThis.__wreckright;
        const order = world.entities.find(unit => unit.id === friendlyId).orders.attack;
        return order?.targetId === enemyId && order?.calledShot === 'left_leg' && useGame.getState().calledShotLocation === 'left_leg';
      }, fixture));
    await aim.getByTestId('doll-right_arm').click();
    check('pointer called shots update the highlighted hostile section',
      await aim.getByTestId('doll-right_arm').getAttribute('aria-pressed') === 'true');
    await page.screenshot({ path: `${shots}/combat-damage-called-shot.png` });
    await aim.getByRole('button', { name: 'Done', exact: true }).click();
    await page.setViewportSize({ width: 792, height: 830 });
    await page.locator('[data-testid="mobile-tab-unit"]').click();
    const mobile = page.getByTestId('mobile-unit-panel');
    await mobile.getByTestId('paper-doll').waitFor();
    const compactBounds = await mobile.evaluate(panel => {
      const clip = panel.getBoundingClientRect();
      const drawing = panel.querySelector('.combat-damage__drawing').getBoundingClientRect();
      return { fullyShown: drawing.top >= clip.top && drawing.bottom <= clip.bottom,
        overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    check('compact inspection tray shows the whole damage miniature without horizontal overflow',
      compactBounds.fullyShown && !compactBounds.overflow, JSON.stringify(compactBounds));
    await page.screenshot({ path: `${shots}/combat-damage-compact.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    const phoneBounds = await mobile.evaluate(panel => {
      const clip = panel.getBoundingClientRect();
      const drawing = panel.querySelector('.combat-damage__drawing').getBoundingClientRect();
      return { fullyShown: drawing.top >= clip.top && drawing.bottom <= clip.bottom,
        overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    check('phone inspection tray keeps the complete damage silhouette visible', phoneBounds.fullyShown && !phoneBounds.overflow, JSON.stringify(phoneBounds));
    await page.screenshot({ path: `${shots}/combat-damage-phone.png` });
    await page.setViewportSize({ width: 844, height: 390 });
    await mobile.getByRole('button', { name: 'Rear', exact: true }).click();
    check('short landscape inspection keeps rear controls reachable by scrolling without horizontal overflow',
      await mobile.getByTestId('paper-doll').getAttribute('data-face') === 'rear'
      && await mobile.evaluate(panel => panel.getBoundingClientRect().height >= 140)
      && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mobile.locator('.combat-damage__drawing').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shots}/combat-damage-landscape.png` });
    check('damage miniature and called-shot journey produce no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
