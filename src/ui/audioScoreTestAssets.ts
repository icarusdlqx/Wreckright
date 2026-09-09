/** Deterministic graph fixture; asset decoding is covered separately. */
export const SCORE_LOOP_SECONDS = 32 * 4 * 60 / 104;
export async function loadScoreBuffers(context: AudioContext): Promise<readonly AudioBuffer[]> {
  return [context.createBuffer(2, 8, 8), context.createBuffer(1, 8, 8), context.createBuffer(1, 8, 8)];
}
