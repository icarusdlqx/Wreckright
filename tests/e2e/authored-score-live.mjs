/** Real browser decoding complements the deterministic graph probe. */
export async function runAuthoredScoreLiveChecks({ browser, url, check }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  try {
    await page.addInitScript(() => {
      localStorage.clear(); sessionStorage.clear();
      const NativeContext = globalThis.AudioContext;
      const contexts = [];
      const pending = [];
      let deferred = false;
      class ObservedContext extends NativeContext {
        constructor(...args) {
          super(...args);
          this.observed = { context: this, sources: [], decoded: [], closes: 0 };
          contexts.push(this.observed);
        }
        createBufferSource() {
          const source = super.createBufferSource();
          const record = { source, starts: [], stops: [] };
          this.observed.sources.push(record);
          const start = source.start.bind(source);
          const stop = source.stop.bind(source);
          source.start = (...args) => { record.starts.push(args[0] ?? 0); start(...args); };
          source.stop = (...args) => { record.stops.push(args[0] ?? 0); stop(...args); };
          return source;
        }
        async decodeAudioData(...args) {
          const buffer = await super.decodeAudioData(...args);
          let peak = 0;
          const pcm = buffer.getChannelData(0);
          for (let sample = 0; sample < pcm.length; sample += 97) peak = Math.max(peak, Math.abs(pcm[sample]));
          this.observed.decoded.push({ channels: buffer.numberOfChannels, duration: buffer.duration, peak });
          if (deferred) await new Promise(resolve => pending.push(resolve));
          return buffer;
        }
        close() { this.observed.closes += 1; return super.close(); }
      }
      globalThis.AudioContext = ObservedContext;
      globalThis.__liveScore = {
        snapshot: () => contexts.map(record => ({
          state: record.context.state, closes: record.closes, decoded: [...record.decoded],
          sources: record.sources.filter(item => item.source.loop).map(item => ({
            starts: [...item.starts], stops: [...item.stops], loaded: item.source.buffer !== null,
            rate: item.source.playbackRate.value,
          })),
        })),
        defer: () => { deferred = true; },
        pending: () => pending.length,
        release: () => { deferred = false; pending.splice(0).forEach(resolve => resolve()); },
      };
    });
    await page.goto(url);
    await page.waitForSelector('[data-testid="home-screen"]');
    check('native audio creates no context before a home gesture', await page.evaluate(() => globalThis.__liveScore.snapshot().length === 0));
    await page.locator('.home-introduction h1').click();
    await page.waitForFunction(() => globalThis.__liveScore.snapshot()[0]?.sources.filter(source => source.starts.length === 1).length === 3);
    const home = await page.evaluate(() => globalThis.__liveScore.snapshot()[0]);
    check('a home gesture starts decoded local music in a running native audio context',
      home.state === 'running' && home.decoded.length === 3
        && home.decoded.every(stem => stem.peak > .0001 && Math.abs(stem.duration - 32 * 4 * 60 / 116) < .1)
        && home.decoded.filter(stem => stem.channels === 2).length === 1
        && home.decoded.filter(stem => stem.channels === 1).length === 2
        && new Set(home.sources.map(source => source.starts[0])).size === 1
        && home.sources.every(source => source.rate === 1));
    await page.locator('[data-testid="home-campaign"]').click();
    await page.waitForSelector('[data-testid="campaign"]');
    check('native home to campaign handoff reuses the running context', await page.evaluate(() => {
      const records = globalThis.__liveScore.snapshot();
      return records.length === 1 && records[0].state === 'running' && records[0].closes === 0;
    }));
    await page.reload();
    await page.waitForSelector('[data-testid="home-screen"]');
    await page.evaluate(() => globalThis.__liveScore.defer());
    await page.locator('.home-introduction h1').click();
    await page.waitForFunction(() => globalThis.__liveScore.pending() === 3);
    await page.locator('[data-testid="home-skirmish"]').click();
    await page.waitForSelector('[data-testid="briefing"]');
    await page.waitForFunction(() => globalThis.__liveScore.snapshot()[0].state === 'closed');
    await page.evaluate(() => globalThis.__liveScore.release());
    const cancelled = await page.evaluate(() => globalThis.__liveScore.snapshot()[0]);
    check('native decode completion cannot start music after route teardown',
      cancelled.closes === 1 && cancelled.decoded.length === 3
        && cancelled.sources.length === 3 && cancelled.sources.every(source => source.starts.length === 0 && !source.loaded));
    check('native music lifecycle reports no page errors', errors.length === 0, errors.join(' | '));
  } finally { await context.close(); }
}
