/** Real Web Audio and shared-origin pages: background games must never sing together. */
export async function runAudioPlaybackFocusChecks({ browser, url, check }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  await context.addInitScript(() => {
    const Native = globalThis.AudioContext;
    const records = [];
    globalThis.AudioContext = class extends Native {
      constructor(...args) { super(...args); this.record = { context: this, gains: [], sources: [] }; records.push(this.record); }
      createGain() { const node = super.createGain(); this.record.gains.push(node); return node; }
      createBufferSource() {
        const node = super.createBufferSource();
        const entry = { node, starts: [], stops: 0 };
        this.record.sources.push(entry);
        const start = node.start.bind(node); const stop = node.stop.bind(node);
        node.start = (...args) => { entry.starts.push(args[0] ?? this.currentTime); return start(...args); };
        node.stop = (...args) => { entry.stops++; return stop(...args); };
        return node;
      }
    };
    globalThis.__audioOwnership = () => records.filter(record => record.context.state !== 'closed').map(record => ({
      master: record.gains[0]?.gain.value,
      music: record.gains[2]?.gain.value,
      rhythm: record.gains[6]?.gain.value,
      now: record.context.currentTime,
      sources: record.sources.filter(source => source.node.loop && source.node.buffer?.duration > 70).map(source => ({
        duration: source.node.buffer.duration, length: source.node.buffer.length, channels: source.node.buffer.numberOfChannels,
        loopEnd: source.node.loopEnd, rate: source.node.playbackRate.value, starts: source.starts, stops: source.stops,
      })),
    }));
  });
  const pages = [];
  const snapshot = async page => page.evaluate(() => globalThis.__audioOwnership());
  const audible = async page => (await snapshot(page)).some(record => record.master > .001);
  try {
    for (let index = 0; index < 3; index++) {
      const page = await context.newPage(); pages.push(page);
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto(url, { waitUntil: 'load' });
      if (index === 0) await page.evaluate(() => {
        localStorage.setItem('ironline.muted', '0');
        localStorage.setItem('ironline.audio-settings', JSON.stringify({ version: 1, music: .55, effects: .7, interface: .6,
          musicEnabled: true, effectsEnabled: true, master: .8 }));
      });
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      await page.waitForFunction(() => globalThis.__audioOwnership().some(record => record.sources.length === 3));
    }
    await pages[2].waitForFunction(() => globalThis.__audioOwnership().some(record => record.master > .39));
    await pages[0].waitForFunction(() => globalThis.__audioOwnership().every(record => record.master === 0));
    await pages[1].waitForFunction(() => globalThis.__audioOwnership().every(record => record.master === 0));
    check('three open game tabs have exactly one audible owner after their separate gestures',
      !(await audible(pages[0])) && !(await audible(pages[1])) && await audible(pages[2]));
    const preferences = await pages[0].evaluate(() => localStorage.getItem('ironline.audio-settings'));
    const before = (await snapshot(pages[0]))[0];
    await pages[0].getByTestId('audio-music-enabled').focus();
    await pages[0].keyboard.press('Tab');
    await pages[0].waitForFunction(() => globalThis.__audioOwnership().some(record => record.master > .39));
    await pages[2].waitForFunction(() => globalThis.__audioOwnership().every(record => record.master === 0));
    const returned = (await snapshot(pages[0]))[0];
    check('returning by keyboard restores the previous tab without replaying its theme',
      await audible(pages[0]) && !(await audible(pages[2])) && returned.now > before.now
      && JSON.stringify(returned.sources) === JSON.stringify(before.sources));
    check('foreground ownership leaves saved Music and Effects preferences untouched',
      await pages[0].evaluate(() => localStorage.getItem('ironline.audio-settings')) === preferences);
    await pages[0].evaluate(() => window.dispatchEvent(new Event('blur')));
    await pages[0].waitForFunction(() => globalThis.__audioOwnership().every(record => record.master === 0));
    check('leaving the game window immediately silences its master bus', !(await audible(pages[0])));
    await pages[0].evaluate(() => window.dispatchEvent(new Event('focus')));
    await pages[0].waitForFunction(() => globalThis.__audioOwnership().some(record => record.master > .39));
    check('returning to the game restores the chosen volume without another source',
      (await snapshot(pages[0]))[0].sources.length === 3);
    check('decoded stems have identical sample counts and loop boundaries with no relative drift',
      returned.sources.length === 3 && returned.sources.every(source => source.length === returned.sources[0].length
        && source.loopEnd === returned.sources[0].loopEnd && source.rate === 1 && source.starts[0] === returned.sources[0].starts[0]));
    await pages[0].getByRole('button', { name: 'Close settings', exact: true }).click();
    await pages[0].getByTestId('home-skirmish').click();
    await pages[0].getByTestId('briefing').waitFor();
    await pages[0].getByTestId('briefing-deploy').click();
    await pages[0].getByTestId('briefing').waitFor({ state: 'hidden' });
    await pages[0].waitForFunction(() => globalThis.__audioOwnership().some(record => record.rhythm > .49 && record.sources.length === 3));
    const battle = await snapshot(pages[0]);
    check('Deploy starts one combat arrangement immediately without needing a map click',
      battle.length === 1 && battle[0].rhythm > .49 && battle[0].sources.every(source => source.starts.length === 1));
    check('multi-tab music, settings and deployment produce no browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
