import type { World } from '../sim/types';
import './sensorSweepReadout.css';

export interface SensorSweepStatus {
  count: number;
  remainingSeconds: number;
}

/** The longest live friendly sweep keeps the read stable when coverage overlaps. */
export function sensorSweepStatus(world: World | null): SensorSweepStatus | null {
  if (world === null || world.playerTeam === null) return null;
  let count = 0;
  let remainingSeconds = 0;
  for (const reveal of world.reveals) {
    if (reveal.team !== world.playerTeam || reveal.kind !== 'sensor') continue;
    const remaining = Math.max(0, (reveal.expiresTick - world.tick) * world.dt);
    if (remaining <= 0) continue;
    count += 1;
    remainingSeconds = Math.max(remainingSeconds, remaining);
  }
  return count === 0 ? null : { count, remainingSeconds: Math.ceil(remainingSeconds) };
}

export function SensorSweepReadout({ world }: { world: World | null }) {
  const status = sensorSweepStatus(world);
  if (status === null) return null;
  return (
    <aside className="sensor-sweep-readout" role="status" data-testid="sensor-sweep-readout">
      <span className="sensor-sweep-kicker">SCAN</span>
      <strong>{status.count === 1 ? 'Sensor sweep' : `${status.count} sensor sweeps`}</strong>
      <span>{status.remainingSeconds}s remaining</span>
    </aside>
  );
}
