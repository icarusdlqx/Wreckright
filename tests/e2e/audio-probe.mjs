export async function installAudioProbe(page, scoreSourceCount) {
  await page.addInitScript(({ fixedScoreSources }) => {
    class ProbeParam {
      constructor(context, name) {
        this.context = context;
        this.name = name;
        this.value = 0;
      }
      record(method, value, at = null, timeConstant = null) {
        this.value = value;
        this.context.automation.push({ method, name: this.name, value, at, timeConstant });
      }
      setValueAtTime(value, at) { this.record('set', value, at); }
      linearRampToValueAtTime(value, at) { this.record('linear', value, at); }
      exponentialRampToValueAtTime(value, at) { this.record('exponential', value, at); }
      setTargetAtTime(value, at, timeConstant) {
        this.record('target', value, at, timeConstant);
      }
      cancelScheduledValues(at) {
        this.context.automation.push({
          method: 'cancel', name: this.name, value: this.value, at, timeConstant: null,
        });
      }
    }

    class ProbeNode {
      constructor(context, kind) {
        this.context = context;
        this.kind = kind;
        this.id = context.nodes.length;
        context.nodes.push(this);
      }
      connect(destination) { return destination; }
    }

    class ProbeSource extends ProbeNode {
      constructor(context, kind) {
        super(context, kind);
        this.starts = [];
        this.stops = [];
        this.active = false;
      }
      start(when = 0) {
        this.starts.push(when);
        this.active = true;
      }
      stop(when = 0) {
        this.stops.push(when);
        this.active = false;
      }
    }

    class ProbeOscillator extends ProbeSource {
      constructor(context) {
        super(context, 'oscillator');
        this.type = 'sine';
        this.frequency = new ProbeParam(context, `source-${this.id}-frequency`);
        this.startFrequency = null;
      }
      start(when = 0) {
        this.startFrequency = this.frequency.value;
        super.start(when);
      }
    }

    class ProbeBufferSource extends ProbeSource {
      constructor(context) {
        super(context, 'buffer');
        this.buffer = null;
        this.loop = false;
      }
    }

    class ProbeGain extends ProbeNode {
      constructor(context) {
        super(context, 'gain');
        this.gain = new ProbeParam(context, `gain-${this.id}`);
      }
    }

    class ProbeFilter extends ProbeNode {
      constructor(context) {
        super(context, 'filter');
        this.type = 'lowpass';
        this.frequency = new ProbeParam(context, `filter-${this.id}-frequency`);
        this.Q = new ProbeParam(context, `filter-${this.id}-q`);
      }
    }

    class ProbeCompressor extends ProbeNode {
      constructor(context) {
        super(context, 'compressor');
        this.threshold = new ProbeParam(context, `compressor-${this.id}-threshold`);
        this.ratio = new ProbeParam(context, `compressor-${this.id}-ratio`);
      }
    }

    const contexts = [];
    class ProbeContext {
      constructor() {
        this.currentTime = 5;
        this.sampleRate = 8;
        this.nodes = [];
        this.sources = [];
        this.gains = [];
        this.filters = [];
        this.automation = [];
        this.closeCalls = 0;
        this.resumeCalls = 0;
        this.state = 'running';
        this.destination = new ProbeNode(this, 'destination');
        contexts.push(this);
      }
      createDynamicsCompressor() { return new ProbeCompressor(this); }
      createBuffer(_channels, length) {
        const data = new Float32Array(length);
        return { getChannelData: () => data };
      }
      createBufferSource() {
        const source = new ProbeBufferSource(this);
        this.sources.push(source);
        return source;
      }
      createOscillator() {
        const source = new ProbeOscillator(this);
        this.sources.push(source);
        return source;
      }
      createGain() {
        const gain = new ProbeGain(this);
        this.gains.push(gain);
        return gain;
      }
      createBiquadFilter() {
        const filter = new ProbeFilter(this);
        this.filters.push(filter);
        return filter;
      }
      close() {
        this.closeCalls += 1;
        this.state = 'closed';
        return Promise.resolve();
      }
      resume() {
        this.resumeCalls += 1;
        this.state = 'running';
        return Promise.resolve();
      }
    }

    const sourceView = (source) => ({
      id: source.id,
      kind: source.kind,
      active: source.active,
      startFrequency: source.startFrequency ?? null,
      frequency: source.frequency?.value ?? null,
      starts: [...source.starts],
      stops: [...source.stops],
    });
    const contextView = (context) => ({
      state: context.state,
      closeCalls: context.closeCalls,
      counts: {
        nodes: context.nodes.length,
        sources: context.sources.length,
        gains: context.gains.length,
        filters: context.filters.length,
      },
      activeSources: context.sources.filter((source) => source.active).length,
      master: context.gains[0]?.gain.value ?? null,
      targets: context.automation.filter((entry) => entry.method === 'target').length,
      automation: context.automation.map((entry) => ({ ...entry })),
      sources: context.sources.map(sourceView),
      // The score is constructed before ambient or one-shot voices. Cohort
      // position remains stable even while culture automation changes pitch.
      scoreSources: context.sources.slice(0, fixedScoreSources).map(sourceView),
    });
    globalThis.__audioProbe = {
      advance: (seconds) => {
        const context = contexts.findLast((candidate) => candidate.state !== 'closed');
        if (context !== undefined) context.currentTime += seconds;
      },
      snapshot: () => contexts.map(contextView),
    };
    globalThis.AudioContext = ProbeContext;
    globalThis.webkitAudioContext = ProbeContext;
  }, { fixedScoreSources: scoreSourceCount });
}

export const audioProbe = (page) => page.evaluate(() => globalThis.__audioProbe.snapshot());

export async function advanceAudioClock(page, seconds = 0.25) {
  await page.evaluate((step) => globalThis.__audioProbe.advance(step), seconds);
}

export function newTargets(before, after) {
  return after.automation.slice(before.automation.length)
    .filter((entry) => entry.method === 'target');
}

export function scoreFrequencyTargets(before, after) {
  const ids = new Set(before.scoreSources.map((source) => source.id));
  return newTargets(before, after)
    .filter((entry) => {
      const match = /^source-(\d+)-frequency$/.exec(entry.name);
      return match !== null && ids.has(Number(match[1]));
    })
    .map((entry) => entry.value);
}

export function includesValues(actual, expected, epsilon = 0.001) {
  return expected.every((value) => actual.some((candidate) => Math.abs(candidate - value) <= epsilon));
}
