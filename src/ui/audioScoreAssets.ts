import coreUrl from '../assets/audio/roads-we-keep-core.ogg';
import ironworkUrl from '../assets/audio/roads-we-keep-ironwork.ogg';
import monolithUrl from '../assets/audio/roads-we-keep-monolith.ogg';

export const SCORE_ASSET_URLS = [coreUrl, ironworkUrl, monolithUrl] as const;
export const SCORE_LOOP_SECONDS = 32 * 4 * 60 / 116;
export type ScoreBuffers = readonly [AudioBuffer, AudioBuffer, AudioBuffer];
export type ScoreBufferLoader = (context: AudioContext, signal: AbortSignal) => Promise<ScoreBuffers>;

// Only these three authored files are cached. Contexts and decoded PCM never
// enter this cache, so leaving a battle releases its much larger audio data.
const byteCache = new Map<string, Promise<ArrayBuffer>>();

export async function readScoreAsset(url: string): Promise<ArrayBuffer> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    if (comma < 0 || !url.slice(0, comma).endsWith(';base64')) {
      throw new Error('Unsupported inline score asset');
    }
    const encoded = atob(url.slice(comma + 1));
    return Uint8Array.from(encoded, (character) => character.charCodeAt(0)).buffer;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Score asset unavailable (${response.status})`);
  return response.arrayBuffer();
}

function bytesFor(url: string): Promise<ArrayBuffer> {
  const cached = byteCache.get(url);
  if (cached !== undefined) return cached;
  const pending = readScoreAsset(url).catch((error: unknown) => {
    byteCache.delete(url);
    throw error;
  });
  byteCache.set(url, pending);
  return pending;
}

/** Abandoned routes must not await a stalled shared fetch or native decoder. */
function duringLifetime<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error: unknown) => { signal.removeEventListener('abort', abort); reject(error); },
    );
  });
}

export const loadScoreBuffers: ScoreBufferLoader = async (context, signal) => {
  signal.throwIfAborted();
  const buffers = await Promise.all(SCORE_ASSET_URLS.map(async (url) => {
    const bytes = await duringLifetime(bytesFor(url), signal);
    signal.throwIfAborted();
    // decodeAudioData may detach its input; the shared compressed copy survives.
    const buffer = await duringLifetime(context.decodeAudioData(bytes.slice(0)), signal);
    signal.throwIfAborted();
    if (!Number.isFinite(buffer.duration) || Math.abs(buffer.duration - SCORE_LOOP_SECONDS) > 0.1) {
      throw new Error('Score stem has an unexpected loop duration');
    }
    return buffer;
  }));
  const [core, ironwork, monolith] = buffers;
  if (core === undefined || ironwork === undefined || monolith === undefined) {
    throw new Error('Score arrangement is incomplete');
  }
  return [core, ironwork, monolith];
};
