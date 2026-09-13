/** A lesson milestone is not a saved battlefield: every fresh range needs its gate again. */
export async function runTrainingRestartChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => {
    localStorage.setItem('ironline.muted', '1');
    if (sessionStorage.getItem('range-restart-fixture')) return;
    sessionStorage.setItem('range-restart-fixture', '1');
    localStorage.setItem('ironline.training', JSON.stringify({ version: 1, status: 'active', step: 3 }));
  });
  const coach = page.getByTestId('training-coach');
  const lesson = async title => {
    await page.waitForFunction(expected =>
      document.querySelector('[data-testid="training-coach"]')?.textContent.includes(expected), title);
  };
  const selectTrainer = async () => {
    const id = await page.evaluate(() => globalThis.__ironmuster.useGame.getState().units
      .find(unit => unit.team === globalThis.__ironmuster.world.playerTeam && unit.alive).id);
    await page.getByTestId(`lance-card-${id}`).click();
    await lesson('2 · Move');
  };
  const checkFresh = async label => {
    await lesson('1 · Select');
    const fresh = await page.evaluate(() => {
      const { world, useGame } = globalThis.__ironmuster;
      return world.zones.find(zone => zone.id === 'range_gate').owner === null
        && world.triggers.find(trigger => trigger.id === 'range_open').fired === 0
        && useGame.getState().paused
        && JSON.parse(localStorage.getItem('ironline.training')).step === 0;
    });
    check(`${label}: fresh field starts at Select with an uncaptured gate`, fresh);
    await selectTrainer();
    check(`${label}: selection returns to Move and exposes Show range gate`,
      await page.getByTestId('training-show-gate').isVisible()
      && await page.getByTestId('command-attack').count() === 0);
  };
  const captureGate = async () => {
    // Advance the real move/capture simulation; no tutorial state or objective is injected.
    await page.evaluate(() => {
      const { engine, world } = globalThis.__ironmuster;
      const gate = world.zones.find(zone => zone.id === 'range_gate');
      engine.orderMove({ x: gate.x, y: gate.y }, false);
      for (let tick = 0; tick < 2000 && gate.owner !== world.playerTeam; tick++) engine.forceStep();
      if (gate.owner !== world.playerTeam) throw new Error('Range fixture did not capture the gate');
      engine.forceStep();
    });
    await lesson('3 · Engage');
  };
  const finish = async status => {
    await page.evaluate(next => {
      const { world, useGame } = globalThis.__ironmuster;
      const winner = next === 'success' ? world.playerTeam : 1;
      world.finished = true;
      world.winner = winner;
      world.missionStatus = next;
      world.missionReason = next === 'success' ? 'range certified' : 'range time expired';
      useGame.getState().patch({ finished: true, winner, missionStatus: next, missionReason: world.missionReason });
    }, status);
    await page.getByTestId('training-result-actions').waitFor();
  };
  try {
    await page.goto(url);
    check('an unfinished range remains offered from Home', (await page.getByTestId('home-learn').innerText()).includes('Resume the Range'));
    await page.getByTestId('home-learn').click();
    await page.getByTestId('briefing-deploy').click();
    await checkFresh('Resume without a battlefield checkpoint');

    await captureGate();
    await page.getByTestId('desktop-menu-toggle').click();
    await page.getByTestId('desktop-menu-toggle').click();
    check('opening and closing Menu preserves the same live-field lesson', (await coach.innerText()).includes('3 · Engage'));
    await finish('failure');
    await page.getByTestId('training-retry').click();
    await checkFresh('Retry after the gate');

    await captureGate();
    const target = await page.evaluate(() => globalThis.__ironmuster.useGame.getState().enemies.find(unit => unit.alive).id);
    await page.getByTestId(`hostile-${target}`).click();
    await lesson('4 · Read heat');
    // Establish an actual observed heat signal without waiting for a full firefight.
    await page.evaluate(() => {
      const { world, engine, useGame } = globalThis.__ironmuster;
      world.entities.find(unit => unit.id === useGame.getState().selection[0]).heat = 4;
      engine.forceStep();
    });
    await lesson('Range drill');
    await finish('failure');
    await page.getByTestId('training-retry').click();
    await checkFresh('Retry after engagement and heat');
    await captureGate();
    check('previous attack and heat observations cannot skip a new Engage lesson',
      (await coach.innerText()).includes('3 · Engage') && await page.getByTestId('command-hold_fire').count() === 0);

    await finish('success');
    await page.getByTestId('training-replay').click();
    await checkFresh('Replay a completed range');
    if (shots) await page.screenshot({ path: `${shots}/range-replay-gate-restored.png` });
    check('range retry, replay and re-entry produce no browser errors', errors.length === 0, errors.join('\n'));
  } finally {
    await context.close();
  }
}
