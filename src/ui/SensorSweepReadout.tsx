import { abilityActive, abilityOf } from '../sim/abilities';
import { effectiveSensorRange, visionFor } from '../sim/sensors';
import { isOperational, type World } from '../sim/types';
import './sensorSweepReadout.css';

export interface SensorSweepStatus {
  count: number;
  remainingSeconds: number;
}

export interface MechSensorSweepStatus extends SensorSweepStatus {
  maximumRange: number;
}

/** Pilot sweeps extend the machine's automatic sensors; they are not support reveal circles. */
export function mechSensorSweepStatus(world: World | null): MechSensorSweepStatus | null {
  if (world === null || world.playerTeam === null) return null;
  let count = 0;
  let remainingSeconds = 0;
  let maximumRange = 0;
  for (const entity of world.entities) {
    if (entity.team !== world.playerTeam || !isOperational(entity) || !abilityActive(world, entity)
      || (abilityOf(world, entity)?.sensorRangeFactor ?? 1) <= 1) continue;
    count += 1;
    remainingSeconds = Math.max(remainingSeconds, (entity.ability.activeUntilTick - world.tick) * world.dt);
    maximumRange = Math.max(maximumRange, effectiveSensorRange(world, entity));
  }
  return count === 0 ? null : { count, remainingSeconds: Math.max(1, Math.ceil(remainingSeconds)), maximumRange: Math.round(maximumRange) };
}

function liveSensorReturns(world: World): number {
  const vision = world.playerTeam === null ? null : visionFor(world, world.playerTeam);
  if (vision === null) return 0;
  return [...vision.detected].filter(id => !vision.visible.has(id) && vision.tracks.get(id)?.source === 'sensor').length;
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
  const mechs = mechSensorSweepStatus(world);
  if (world === null || (status === null && mechs === null)) return null;
  const contacts = liveSensorReturns(world);
  return (
    <aside className="sensor-sweep-readout" role="status" data-testid="sensor-sweep-readout">
      <span className="sensor-sweep-kicker">SCAN</span>
      <div className="sensor-sweep-status">
        {mechs === null ? null : <span data-testid="mech-sensor-sweep-readout">
          <strong>{mechs.count === 1 ? 'Mech Sensor Sweep' : `${mechs.count} mech Sensor Sweeps`}</strong>
          {' · '}{mechs.remainingSeconds}s remaining · {mechs.count > 1 ? 'up to ' : ''}{mechs.maximumRange}m instrument range
        </span>}
        {status === null ? null : <span><strong>{status.count === 1 ? 'Sensor sweep' : `${status.count} sensor sweeps`}</strong>
          {' · '}probe coverage · {status.remainingSeconds}s remaining</span>}
        <span className="sensor-sweep-contacts">Lance: {contacts} live sensor return{contacts === 1 ? '' : 's'} · optics required for direct fire</span>
      </div>
    </aside>
  );
}
