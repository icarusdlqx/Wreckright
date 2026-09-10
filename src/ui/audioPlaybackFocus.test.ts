import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioPlaybackFocus } from './audioPlaybackFocus';
import { AudioGraph } from './audioGraph';
import { FakeContext } from './audioScoreGraphTestSupport';
import { writeAudioPreferences } from './audioPreference';

class Channel extends EventTarget {
  static peers = new Set<Channel>();
  closed = false;
  constructor() { super(); Channel.peers.add(this); }
  postMessage(data: unknown): void {
    for (const peer of Channel.peers) {
      if (peer !== this) peer.dispatchEvent(new MessageEvent('message', { data }));
    }
  }
  close(): void { this.closed = true; Channel.peers.delete(this); }
}
const releases: Array<() => void> = [];
function browser() {
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible', hasFocus: (): boolean => true });
  const window = new EventTarget();
  const values = new Map<string, string>();
  vi.stubGlobal('document', document);
  vi.stubGlobal('addEventListener', window.addEventListener.bind(window));
  vi.stubGlobal('removeEventListener', window.removeEventListener.bind(window));
  vi.stubGlobal('BroadcastChannel', Channel);
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value) });
  return { document, window, values };
}
afterEach(() => { releases.splice(0).forEach(release => release()); vi.unstubAllGlobals(); vi.restoreAllMocks(); Channel.peers.clear(); });

describe('foreground game audio ownership', () => {
  it('grants one page the soundtrack even when embedded tabs all report visible and focused', () => {
    const { document } = browser();
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const ids = ['later-id', 'earlier-id'];
    vi.stubGlobal('crypto', { randomUUID: () => ids.shift() });
    const first = new AudioPlaybackFocus();
    releases.push(first.subscribe(() => undefined));
    expect(first.active).toBe(true);
    const second = new AudioPlaybackFocus();
    releases.push(second.subscribe(() => undefined));
    expect(first.active).toBe(true);
    expect(second.active).toBe(false);
    // Each page has its own event target in browsers; a direct focus here is
    // delivered in listener order, so only the final claimant keeps the lease.
    document.dispatchEvent(new Event('pointerdown'));
    expect([first.active, second.active].filter(Boolean)).toHaveLength(1);
  });

  it('silences blur/hidden pages and restores on a new foreground gesture', () => {
    const { document, window } = browser();
    const focus = new AudioPlaybackFocus(); const changed = vi.fn();
    releases.push(focus.subscribe(changed));
    window.dispatchEvent(new Event('blur')); expect(focus.active).toBe(false);
    window.dispatchEvent(new Event('focus')); expect(focus.active).toBe(true);
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange')); expect(focus.active).toBe(false);
    document.dispatchEvent(new Event('pointerdown')); expect(focus.active).toBe(false);
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange')); expect(focus.active).toBe(true);
    expect(changed).toHaveBeenCalled();
  });

  it('preserves channel preferences and drops background effects before allocation', () => {
    const { window, values } = browser();
    writeAudioPreferences({ musicEnabled: false, effectsEnabled: true, music: .35, effects: .7, master: .8 });
    const saved = new Map(values);
    const context = new FakeContext();
    const graph = new AudioGraph(context as unknown as AudioContext, context.createGain(), {} as AudioBuffer);
    releases.push(() => graph.close());
    expect(graph.master.gain.value).toBeCloseTo(.4);
    const gains = context.gains.length;
    window.dispatchEvent(new Event('blur'));
    expect(graph.master.gain.value).toBe(0);
    expect(graph.begin({ level: .8, distance: 1 })).toBeNull();
    expect(context.gains).toHaveLength(gains);
    window.dispatchEvent(new Event('focus'));
    expect(graph.master.gain.value).toBeCloseTo(.4);
    expect(graph.mixer.music.gain.value).toBe(0);
    expect(graph.mixer.effects.gain.value).toBe(.7);
    expect(values).toEqual(saved);
  });

  it('uses storage as a fallback without changing the user mute setting', () => {
    const { window, values } = browser();
    vi.stubGlobal('BroadcastChannel', undefined);
    const focus = new AudioPlaybackFocus();
    releases.push(focus.subscribe(() => undefined));
    expect(values.has('ironline.audio-owner')).toBe(true);
    const event = Object.assign(new Event('storage'), { key: 'ironline.audio-owner',
      newValue: JSON.stringify({ at: Date.now() + 100, id: 'other-tab' }) });
    window.dispatchEvent(event);
    expect(focus.active).toBe(false);
    expect(values.has('ironline.muted')).toBe(false);
  });

  it('keeps a cold background page silent until it receives a foreground gesture', () => {
    const { document } = browser(); document.hasFocus = () => false;
    const focus = new AudioPlaybackFocus();
    releases.push(focus.subscribe(() => undefined));
    expect(focus.active).toBe(false);
    document.dispatchEvent(new Event('pointerdown'));
    expect(focus.active).toBe(true);
  });

  it('retains local foreground gating when both sharing mechanisms are unavailable', () => {
    const { window } = browser();
    vi.stubGlobal('BroadcastChannel', undefined);
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('storage denied'); } });
    const focus = new AudioPlaybackFocus();
    expect(() => releases.push(focus.subscribe(() => undefined))).not.toThrow();
    expect(focus.active).toBe(true);
    window.dispatchEvent(new Event('blur')); expect(focus.active).toBe(false);
    window.dispatchEvent(new Event('focus')); expect(focus.active).toBe(true);
  });

  it('shares one listener set within a page and releases the channel with its last graph', () => {
    const { window } = browser();
    const focus = new AudioPlaybackFocus();
    const releaseA = focus.subscribe(() => undefined); const releaseB = focus.subscribe(() => undefined);
    const channel = [...Channel.peers][0]!;
    expect(Channel.peers.size).toBe(1);
    releaseA(); expect(channel.closed).toBe(false);
    releaseB(); expect(channel.closed).toBe(true);
    window.dispatchEvent(new Event('blur'));
    expect(focus.active).toBe(true);
  });
});
