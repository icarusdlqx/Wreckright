import { installAudioProbe, audioProbe } from './audio-probe.mjs';
import { completeInitialCampaignSetup } from './campaign-setup.mjs';

/** Real preference controls and navigation, with deterministic WebAudio routing inspection. */
export async function runAudioChannelControlChecks({ browser, url, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await installAudioProbe(page);
  const openSettings = async () => {
    await page.getByTestId('audio-settings').click();
    await page.getByTestId('audio-settings-panel').waitFor();
  };
  const closeSettings = async () => {
    await page.getByRole('button', { name: 'Close settings', exact: true }).click();
    await page.getByTestId('audio-settings-panel').waitFor({ state: 'hidden' });
  };
  const activeGraphs = async () => (await audioProbe(page)).filter(graph => graph.state !== 'closed');
  const waitForMusic = async () => page.waitForFunction(() => {
    const graphs = globalThis.__audioProbe.snapshot().filter(graph => graph.state !== 'closed');
    return graphs.length > 0 && graphs.every(graph => graph.scoreSources.length > 0
      && graph.scoreSources.every(source => source.kind === 'buffer' && source.loop && source.loaded && source.starts.length === 1));
  }, undefined, { timeout: 20_000 });
  const switchState = async channel => page.getByTestId(`audio-${channel}-enabled`).getAttribute('aria-checked');
  const saved = async () => page.evaluate(() => JSON.parse(localStorage.getItem('ironline.audio-settings')));
  const chooseVolume = async (channel, value) => {
    const slider = page.getByTestId(`audio-${channel}`);
    await slider.focus();
    await page.keyboard.press('Home');
    for (let step = 0; step < value / 5; step += 1) await page.keyboard.press('ArrowRight');
  };
  try {
    await page.goto(url);
    await openSettings();
    check('Home exposes separate named music and sound-effects switches before the advanced mix',
      await page.getByRole('switch', { name: 'Music', exact: true }).isVisible()
      && await page.getByRole('switch', { name: 'Sound effects', exact: true }).isVisible()
      && await switchState('music') === 'true' && await switchState('effects') === 'true'
      && !await page.getByTestId('audio-music').isVisible());
    await page.getByTestId('audio-advanced').locator('summary').click();
    for (const [channel, value] of [['master', 80], ['music', 35], ['effects', 65], ['interface', 45]]) {
      await chooseVolume(channel, value);
    }
    await page.getByTestId('audio-advanced').locator('summary').click();
    await page.getByTestId('audio-music-enabled').focus();
    await page.keyboard.press('Space');
    await page.getByTestId('audio-effects-enabled').click();
    const disabled = await saved();
    check('keyboard Music Off and Sound effects Off preserve all four selected volume trims',
      disabled.musicEnabled === false && disabled.effectsEnabled === false
      && disabled.master === .8 && disabled.music === .35 && disabled.effects === .65 && disabled.interface === .45);
    if (shots) await page.getByTestId('audio-settings-panel').screenshot({ path: `${shots}/audio-switches-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    const fit = await page.getByTestId('audio-settings-panel').evaluate(panel => ({
      fits: panel.scrollWidth <= panel.clientWidth,
      switches: [...panel.querySelectorAll('[role="switch"]')].every(control => {
        const box = control.getBoundingClientRect();
        return box.width >= 44 && box.height >= 44 && box.left >= 0 && box.right <= innerWidth;
      }),
    }));
    check('phone sound switches remain readable, reachable and within the settings panel', fit.fits && fit.switches);
    if (shots) await page.getByTestId('audio-settings-panel').screenshot({ path: `${shots}/audio-switches-phone.png` });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await openSettings();
    check('reload restores both disabled channels and their chosen volumes',
      await switchState('music') === 'false' && await switchState('effects') === 'false'
      && JSON.stringify(await saved()) === JSON.stringify(disabled));
    await page.getByTestId('audio-music-enabled').click();
    await closeSettings();

    await page.getByTestId('home-campaign').click();
    await page.getByTestId('campaign').waitFor();
    await completeInitialCampaignSetup(page);
    await openSettings();
    await waitForMusic();
    let graphs = await activeGraphs();
    check('campaign keeps music on while all effects and interface buses are off',
      graphs.length > 0 && graphs.every(graph => graph.mix.music === .35 && graph.mix.effects === 0 && graph.mix.interface === 0));
    const counts = graphs.map(graph => graph.counts);
    await page.getByTestId('audio-effects-enabled').click();
    await page.getByTestId('audio-music-enabled').click();
    graphs = await activeGraphs();
    check('campaign switches restore separate effects and interface trims without restarting audio',
      graphs.every(graph => graph.mix.music === 0 && graph.mix.effects === .65 && graph.mix.interface === .45)
      && JSON.stringify(graphs.map(graph => graph.counts)) === JSON.stringify(counts));
    await page.getByTestId('audio-mute').check();
    await page.getByTestId('audio-music-enabled').click();
    graphs = await activeGraphs();
    check('master mute overrides both enabled channels without discarding their choices',
      graphs.every(graph => graph.master === 0) && await switchState('music') === 'true' && await switchState('effects') === 'true');
    await page.getByTestId('audio-mute').uncheck();
    graphs = await activeGraphs();
    check('unmuting restores the chosen master and independent channel volumes',
      graphs.every(graph => Math.abs(graph.master - .4) < .0001
        && graph.mix.music === .35 && graph.mix.effects === .65 && graph.mix.interface === .45));
    await closeSettings();
    await page.getByTestId('camp-exit').click();
    await page.getByTestId('home-screen').waitFor();
    await page.getByTestId('home-skirmish').click();
    await page.getByTestId('briefing-deploy').click();
    await page.getByTestId('briefing').waitFor({ state: 'hidden' });
    await page.getByTestId('pause-button').click();
    await page.getByTestId('desktop-menu-toggle').click();
    await openSettings();
    await waitForMusic();
    await page.getByTestId('audio-effects-enabled').click();
    graphs = await activeGraphs();
    check('battle shares the same independent switches and keeps its music bus audible with effects off',
      graphs.length > 0 && graphs.every(graph => graph.mix.music === .35 && graph.mix.effects === 0 && graph.mix.interface === 0));
    await page.getByTestId('audio-music-enabled').click();
    await page.getByTestId('audio-advanced').locator('summary').click();
    await page.getByTestId('audio-reset').click();
    const reset = await saved();
    check('Reset mix restores volume trims while preserving explicit channel Off choices',
      reset.master === 1 && reset.music === 1 && reset.effects === 1 && reset.interface === 1
      && reset.musicEnabled === false && reset.effectsEnabled === false);
    await closeSettings();
    await page.getByTestId('mute-button').click();
    await openSettings();
    check('legacy battle mute button remains the shared all-sound override',
      await page.getByTestId('audio-mute').isChecked()
      && await switchState('music') === 'false' && await switchState('effects') === 'false');
    check('audio switches and route changes produce no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
