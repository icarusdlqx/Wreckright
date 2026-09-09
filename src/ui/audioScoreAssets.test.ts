import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

function fakeDecoder(duration = 32 * 4 * 60 / 104) {
  const decode = vi.fn(async (_bytes: ArrayBuffer) => ({ duration } as AudioBuffer));
  return { decode, context: { decodeAudioData: decode } as unknown as AudioContext };
}

describe('authored score asset loading', () => {
  it('decodes inline base64 without a network request or CSP change', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { readScoreAsset } = await import('./audioScoreAssets');
    expect([...new Uint8Array(await readScoreAsset('data:audio/ogg;base64,T2dnUw=='))]).toEqual([79, 103, 103, 83]);
    expect(fetcher).not.toHaveBeenCalled();
    await expect(readScoreAsset('data:audio/ogg,invalid')).rejects.toThrow('Unsupported');
  });
  it('caches only the three compressed assets and decodes fresh copies for each context', async () => {
    const bytes = new Uint8Array([79, 103, 103, 83]).buffer;
    const fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes }));
    vi.stubGlobal('fetch', fetcher);
    const { loadScoreBuffers } = await import('./audioScoreAssets');
    const first = fakeDecoder(); const second = fakeDecoder();
    await loadScoreBuffers(first.context, new AbortController().signal);
    await loadScoreBuffers(second.context, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(first.decode).toHaveBeenCalledTimes(3);
    expect(second.decode).toHaveBeenCalledTimes(3);
    expect(first.decode.mock.calls[0]?.[0]).not.toBe(bytes);
    expect(second.decode.mock.calls[0]?.[0]).not.toBe(first.decode.mock.calls[0]?.[0]);
  });
  it('drops failed fetch cache entries so a later attempt can recover', async () => {
    let available = false;
    const fetcher = vi.fn(async () => ({ ok: available, status: 503, arrayBuffer: async () => new ArrayBuffer(4) }));
    vi.stubGlobal('fetch', fetcher);
    const { loadScoreBuffers } = await import('./audioScoreAssets');
    const { context } = fakeDecoder();
    await expect(loadScoreBuffers(context, new AbortController().signal)).rejects.toThrow('unavailable');
    available = true;
    await expect(loadScoreBuffers(context, new AbortController().signal)).resolves.toHaveLength(3);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it('does not begin decoding after its lifetime was cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
    const { loadScoreBuffers } = await import('./audioScoreAssets');
    const { decode, context } = fakeDecoder();
    const lifetime = new AbortController(); lifetime.abort();
    await expect(loadScoreBuffers(context, lifetime.signal)).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
  it('cancels immediately while shared asset requests remain stalled', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    const { loadScoreBuffers } = await import('./audioScoreAssets');
    const { decode, context } = fakeDecoder();
    const lifetime = new AbortController();
    const pending = loadScoreBuffers(context, lifetime.signal);
    lifetime.abort();
    await expect(pending).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
  it('cancels immediately while the native decoder remains pending', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
    const { loadScoreBuffers } = await import('./audioScoreAssets');
    const lifetime = new AbortController();
    const decode = vi.fn(() => new Promise<AudioBuffer>(() => undefined));
    const pending = loadScoreBuffers({ decodeAudioData: decode } as unknown as AudioContext, lifetime.signal);
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(3));
    lifetime.abort();
    await expect(pending).rejects.toThrow();
  });
  it('rejects incompatible loop length and a decode completed after cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
    const { loadScoreBuffers } = await import('./audioScoreAssets');
    await expect(loadScoreBuffers(fakeDecoder(20).context, new AbortController().signal)).rejects.toThrow('duration');
    const lifetime = new AbortController();
    const context = { decodeAudioData: async () => { lifetime.abort(); return { duration: 32 * 4 * 60 / 104 }; } } as unknown as AudioContext;
    await expect(loadScoreBuffers(context, lifetime.signal)).rejects.toThrow();
  });
});
