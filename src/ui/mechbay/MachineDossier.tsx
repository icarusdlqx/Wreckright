import type { Chassis } from '../../schema/chassis';
import { MachinePortrait } from './MachinePortrait';
import './machineDossier.css';

export function MachineDossier({ chassis, portrait = true }: { chassis: Chassis; portrait?: boolean }) {
  return <section className="machine-dossier" data-testid="machine-dossier" aria-label={`${chassis.name} field guide`}>
    <div className="machine-dossier-intro">
      {portrait ? <MachinePortrait chassis={chassis} /> : null}
      <p>{chassis.summary}</p>
    </div>
    <dl className="machine-dossier-tradeoffs">
      <div><dt>Strengths</dt><dd>{chassis.strengths.join(' · ') || chassis.role}</dd></div>
      <div><dt>Weaknesses</dt><dd>{chassis.weaknesses.join(' · ') || 'Depends on fitted equipment.'}</dd></div>
    </dl>
    <p className="machine-dossier-caveat">Chassis tendencies. Your fitted weapons, armour and cooling decide the final build.</p>
  </section>;
}
