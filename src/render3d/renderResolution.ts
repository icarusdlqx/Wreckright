/** Bound Retina supersampling; a native 4K display still keeps its full 1x image. */
const MAX_PIXEL_COUNT = 6_000_000;

export function renderPixelRatio(deviceRatio: number, lowFx: boolean, width = 1, height = 1): number {
  if (lowFx) return 1;
  const nativeRatio = Number.isFinite(deviceRatio) ? Math.max(1, deviceRatio) : 1;
  const area = Number.isFinite(width * height) ? Math.max(1, width * height) : 1;
  return Math.min(2, nativeRatio, Math.max(1, Math.sqrt(MAX_PIXEL_COUNT / area)));
}
