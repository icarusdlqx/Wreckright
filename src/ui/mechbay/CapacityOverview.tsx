import { useMemo } from 'react';
import type { Chassis } from '../../schema/chassis';
import type { Loadout, HeatProfile } from '../../sim/loadout';
import { projectChassisAnatomy } from './anatomyProjection';
import './capacityOverview.css';

function CapacityBar({ label, value, maximum, unit, note }: {
  label: string; value: number; maximum: number; unit: string; note: string;
}) {
  const fraction = maximum > 0 ? value / maximum : value > 0 ? Infinity : 0;
  const overflow = fraction > 1;
  return <div className={`capacity-gauge${overflow ? ' is-over' : ''}`}>
    <span>{label}</span><strong>{Number(value.toFixed(1))} / {Number(maximum.toFixed(1))} {unit}</strong>
    <div className="capacity-gauge__track" role="meter" aria-label={label} aria-valuemin={0}
      aria-valuemax={Math.max(1, maximum)} aria-valuenow={Math.min(Math.max(0, value), Math.max(1, maximum))}
      aria-valuetext={`${value.toFixed(1)} of ${maximum.toFixed(1)} ${unit}${overflow ? ', exceeds limit' : ''}`}>
      <i style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} />
    </div><small>{note}</small>
  </div>;
}

export function CapacityOverview({ chassis, loadout, heat, armourMaximum }: { chassis: Chassis; loadout: Loadout; heat: HeatProfile; armourMaximum: number }) {
  const outline = useMemo(() => projectChassisAnatomy(chassis), [chassis]);
  return <div className="capacity-overview" data-testid="capacity-overview">
    <figure className="capacity-overview__hull">
      <svg viewBox={outline.viewBox} preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={`${chassis.name} complete hull outline`} data-testid="complete-hull-outline">
        {outline.pieces.map((piece, index) => <polygon key={index}
          points={piece.points.map(point => `${point.x},${point.y}`).join(' ')} vectorEffect="non-scaling-stroke" />)}
      </svg><figcaption>{chassis.name}<small>Complete hull</small></figcaption>
    </figure>
    <div className="bay-readiness__gauges">
      <CapacityBar label="Weight" value={loadout.usedWeight} maximum={loadout.tonnage} unit="t"
        note={loadout.freeTonnage < 0 ? `Remove ${(-loadout.freeTonnage).toFixed(1)}t before saving` : `${loadout.freeTonnage.toFixed(1)}t available`} />
      <CapacityBar label="Armour" value={loadout.armourPoints} maximum={armourMaximum} unit="points"
        note={`${loadout.armourWeight.toFixed(1)}t of protection · chassis maximum`} />
      <CapacityBar label="Sustained heat / cooling" value={heat.heatPerSecond} maximum={heat.dissipationPerSecond} unit="heat/s"
        note={heat.sustainable ? 'Cooling keeps up with sustained fire' : 'Heat builds during continuous fire'} />
      <CapacityBar label="Salvo heat / heat limit" value={heat.alphaStrikeHeat} maximum={heat.heatCapacity} unit="heat"
        note="One full salvo from cold · shorter bursts manage heat" />
    </div>
  </div>;
}
