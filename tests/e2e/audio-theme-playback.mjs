/** Real decoder and real nodes complement the deterministic score graph probe. */
export async function runAudioThemePlaybackChecks({ browser, url, check }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const offline = url.startsWith('file:');
  if (offline) await context.setOffline(true);
  const page = await context.newPage();
  const errors = [];
  const network = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('ironline.muted', '0');
    localStorage.setItem('ironline.audio-settings', JSON.stringify({ version: 1,
      musicEnabled: true, effectsEnabled: false, music: 1, effects: .4, interface: .3, master: 1 }));
    const NativeContext = globalThis.AudioContext;
    const records = [];
    const edges = new Map();
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (...args) {
      edges.set(this, args[0]);
      return connect.apply(this, args);
    };
    globalThis.AudioContext = class extends NativeContext {
      constructor(...args) {
        super(...args);
        this.record = { context: this, sources: [] };
        records.push(this.record);
      }
      createBufferSource() {
        const node = super.createBufferSource();
        const record = { node, starts: [], stops: 0 };
        this.record.sources.push(record);
        const start = node.start.bind(node);
        const stop = node.stop.bind(node);
        node.start = (...args) => {
          const buffer = node.buffer;
          let energy = 0;
          let peak = 0;
          let count = 0;
          if (buffer) for (let c = 0; c < buffer.numberOfChannels; c++) {
            const data = buffer.getChannelData(c);
            for (let i = 0; i < data.length; i += 97) {
              peak = Math.max(peak, Math.abs(data[i])); energy += data[i] ** 2; count++;
            }
          }
          record.starts.push({ at: args[0] ?? this.currentTime, duration: buffer?.duration,
            channels: buffer?.numberOfChannels, peak, rms: Math.sqrt(energy / Math.max(1, count)),
            rate: node.playbackRate.value, loop: node.loop, loopEnd: node.loopEnd });
          return start(...args);
        };
        node.stop = (...args) => { record.stops++; return stop(...args); };
        return node;
      }
    };
    globalThis.__themePlayback = {
      records,
      summary: () => records.flatMap(record => record.sources).filter(source => source.node.loop)
        .map(source => ({ starts: source.starts, stops: source.stops })),
      musicGain: () => {
        let node = records.flatMap(record => record.sources).find(source => source.node.loop)?.node;
        for (let step = 0; step < 3 && node; step++) node = edges.get(node);
        return node?.gain?.value;
      },
    };
  });
  try {
    await page.goto(url, { waitUntil: 'load' });
    await page.getByTestId('home-screen').waitFor();
    check('theme creates no audio context before a player gesture',
      await page.evaluate(() => globalThis.__themePlayback.records.length === 0));
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.waitForFunction(() => globalThis.__themePlayback.summary().length === 3
      && globalThis.__themePlayback.summary().every(source => source.starts.length === 1), null, { timeout: 30_000 });
    const starts = await page.evaluate(() => globalThis.__themePlayback.summary().map(source => source.starts[0]));
    check('real browser decodes and starts all three shipped theme stems', starts.length === 3
      && starts.every(source => Math.abs(source.duration - 32 * 4 * 60 / 104) < .03)
      && starts.map(source => source.channels).join(',') === '2,1,1', JSON.stringify(starts));
    check('decoded theme contains finite audible music with headroom', starts.every(source =>
      Number.isFinite(source.rms) && source.rms > .02 && source.peak > .1 && source.peak < .85));
    check('all real music stems loop at the same timestamp and unchanged playback speed',
      starts.every(source => source.at === starts[0].at && source.rate === 1 && source.loop
        && Math.abs(source.loopEnd - 32 * 4 * 60 / 104) < .001));
    await page.getByTestId('audio-music-enabled').click();
    await page.waitForFunction(() => globalThis.__themePlayback.musicGain() === 0);
    check('Music Off silences the real music bus without stopping or recreating the theme',
      await page.evaluate(() => globalThis.__themePlayback.musicGain() === 0
        && globalThis.__themePlayback.summary().every(source => source.starts.length === 1 && source.stops === 0)));
    await page.getByTestId('audio-music-enabled').click();
    await page.waitForFunction(() => globalThis.__themePlayback.musicGain() > .95);
    check('Music On restores the real bus at the same musical position',
      await page.evaluate(() => globalThis.__themePlayback.summary().length === 3
        && globalThis.__themePlayback.summary().every(source => source.starts.length === 1 && source.stops === 0)));
    if (offline) check('standalone theme works with networking disabled and zero external requests', network.length === 0, network.join('\n'));
    check('real theme playback produces no uncaught browser errors', errors.length === 0, errors.join('\n'));
  } finally { await context.close(); }
}
