import type { UnitSnapshot } from './store';
import './machineProfile.css';

/** Friendly-only machine strengths and trade-offs; hostile panels never receive this view. */
export function FriendlyMachineProfile({ unit }: { unit: UnitSnapshot }) {
  return (
    <section className="machine-profile" aria-label="Friendly machine profile">
      <h3>Awareness &amp; chassis</h3>
      <p className="machine-profile-role">
        <strong>{unit.role} · {unit.frameClass}</strong>
        <span>{unit.chassisSummary}</span>
      </p>
      <dl>
        <div>
          <dt>Optics</dt>
          <dd>{Math.round(unit.sightRange)}m base</dd>
        </div>
        <div>
          <dt>Sensors</dt>
          <dd>{Math.round(unit.sensorRange)}m reach</dd>
        </div>
        <div>
          <dt>Signature</dt>
          <dd>{unit.signature.toFixed(2)} · lower is quieter</dd>
        </div>
      </dl>
      {unit.chassisTraits.length === 0 ? (
        <p className="machine-profile-standard">Standard chassis — no pronounced trade-off.</p>
      ) : (
        <ul aria-label="Chassis strengths and trade-offs">
          {unit.chassisTraits.map((trait) => (
            <li key={`${trait.label}-${trait.note}`}>
              <strong>{trait.label}</strong>
              <span>{trait.note}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="machine-profile-caveat">
        Terrain and elevation alter optical reach. Sensor returns do not provide line of sight.
      </p>
    </section>
  );
}
