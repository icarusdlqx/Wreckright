/** Audit actual RAF opportunities, rather than estimating them from average FPS. */
export function minimapPaintCadence(frames, paints) {
  const firstEligibleFrames = [];
  let missedEligibleFrames = 0;
  let offSchedulePaints = 0;
  for (let index = 1; index < paints.length; index += 1) {
    const previous = paints[index - 1];
    const actual = paints[index];
    const firstEligible = frames.find(at => at - previous >= 100) ?? null;
    firstEligibleFrames.push(firstEligible);
    // A delayed paint may miss more than one available frame. Count every
    // eligible opportunity before it, so an average cannot hide a stall.
    missedEligibleFrames += frames.filter(at => at - previous >= 100 && at < actual).length;
    if (firstEligible === null || actual !== firstEligible) offSchedulePaints += 1;
  }
  return { firstEligibleFrames, missedEligibleFrames, offSchedulePaints };
}
