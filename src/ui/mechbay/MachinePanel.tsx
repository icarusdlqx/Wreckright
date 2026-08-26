import type { Chassis } from '../../schema/chassis';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { DesignIssue } from '../../schema/designValidation';
import type { Catalog } from '../../schema/load';
import type { HeatProfile, Loadout } from '../../sim/loadout';
import { MachineCultureBadge } from './MachineCultureBadge';
import { designUsesForeignComponents } from './machineCulturePresentation';
import { MechPreview } from './MechPreview';

function Gauge({
  label,
  used,
  total,
  value,
  tone = 'ok',
  testId,
}: {
  label: string;
  used: number;
  total: number;
  value: string;
  tone?: 'ok' | 'warn' | 'over';
  testId?: string;
}) {
  const fraction = total <= 0 ? 0 : Math.max(0, Math.min(1, used / total));
  return (
    <div className={`bay-gauge ${tone}`}>
      <span className="gauge-label">{label}</span>
      <span className="gauge-value" data-testid={testId}>
        {value}
      </span>
      <span className="gauge-track">
        <span style={{ width: `${fraction * 100}%` }} />
      </span>
    </div>
  );
}

interface Props {
  catalog: Catalog;
  chassis: Chassis;
  design: Design;
  loadout: Loadout;
  heat: HeatProfile;
  issues: readonly DesignIssue[];
  selectedLocation: MechLocation | null;
  hoveredLocation: MechLocation | null;
  compatibleLocations: ReadonlySet<MechLocation>;
  onSelectLocation: (location: MechLocation) => void;
  onHoverLocation: (location: MechLocation | null) => void;
}

export function MachinePanel({
  catalog,
  chassis,
  design,
  loadout,
  heat,
  issues,
  selectedLocation,
  hoveredLocation,
  compatibleLocations,
  onSelectLocation,
  onHoverLocation,
}: Props) {
  const overweight = loadout.freeTonnage < 0;
  return (
    <section className="bay-machine" data-testid="bay-budget">
      <h3>
        {chassis.name}
        <span className="dossier-class">
          {chassis.class} · {chassis.tonnage}t ·{' '}
          {(
            (chassis.engineRating / chassis.tonnage) *
            catalog.rules.movement.walkSpeedFactor
          ).toFixed(0)}
          m/s
        </span>
      </h3>
      <p className="bay-role" data-testid="bay-role">
        {chassis.role}
      </p>
      <MachineCultureBadge
        faction={chassis.faction}
        foreignComponents={designUsesForeignComponents(catalog, design, chassis.faction)}
        testId="machine-culture-primary"
      />

      <MechPreview
        catalog={catalog}
        chassis={chassis}
        design={design}
        selected={selectedLocation}
        hovered={hoveredLocation}
        compatible={compatibleLocations}
        onHoverLocation={onHoverLocation}
        onSelectLocation={onSelectLocation}
      />
      <p className="bay-preview-help">Select a hardpoint on the machine or in the location grid.</p>

      <div className="bay-gauges">
        <Gauge
          label="Tonnage free"
          used={loadout.usedWeight}
          total={chassis.tonnage}
          value={`${loadout.freeTonnage.toFixed(1)}t`}
          tone={overweight ? 'over' : loadout.freeTonnage < 1 ? 'warn' : 'ok'}
          testId="free-tonnage"
        />
        <Gauge
          label="Slots"
          used={loadout.totalSlotsUsed}
          total={loadout.totalSlotsAvailable}
          value={`${loadout.totalSlotsUsed}/${loadout.totalSlotsAvailable}`}
          tone={loadout.totalSlotsUsed > loadout.totalSlotsAvailable ? 'over' : 'ok'}
        />
        <Gauge
          label="Heat"
          used={heat.heatPerSecond}
          total={Math.max(heat.heatPerSecond, heat.dissipationPerSecond)}
          value={
            heat.sustainable
              ? 'Sustainable'
              : `${(heat.secondsToShutdownRisk ?? 0).toFixed(0)}s to risk`
          }
          tone={heat.sustainable ? 'ok' : 'warn'}
          testId="heat-verdict"
        />
      </div>

      {chassis.traits.length === 0 ? null : (
        <ul className="dossier-traits">
          {chassis.traits.map((traitId) => {
            const trait = catalog.rules.traits.entries[traitId];
            return trait === undefined ? null : (
              <li key={traitId} title={trait.note}>
                {trait.label}
              </li>
            );
          })}
        </ul>
      )}
      <p className="dossier-summary" title={chassis.lore}>{chassis.summary}</p>

      <ul className="bay-issues" data-testid="bay-issues">
        {issues.map((issue, index) => (
          <li
            key={`${issue.code}-${issue.path.join('.')}-${index}`}
            className={`bay-issue--${issue.severity}`}
            data-issue-severity={issue.severity}
          >
            {issue.location === null ? '' : `${issue.location.replaceAll('_', ' ')}: `}
            {issue.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
