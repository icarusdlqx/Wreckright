/** Constant stroke width keeps the readout small at every tactical-map scale. */
export function CommanderHealthBar({ integrity, markerSize }: { integrity: number | null; markerSize: number }) {
  if (integrity === null) return null;
  const left = -markerSize * .44;
  const right = markerSize * .44;
  const y = Math.max(markerSize * .7, 29 + markerSize * .24);
  const filled = left + (right - left) * integrity;
  return <g className="commander-health" aria-hidden="true">
    <path className="commander-health-track" d={`M${left} ${y}H${right}`} vectorEffect="non-scaling-stroke" />
    {integrity <= 0 ? null : <path className="commander-health-fill" d={`M${left} ${y}H${filled}`} vectorEffect="non-scaling-stroke" />}
  </g>;
}
