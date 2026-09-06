import type { Chassis } from '../../schema/chassis';
import { replaceSerialDesignation } from '../designLabel';
import { MachinePortrait } from './MachinePortrait';
import './machineDossier.css';
import { WikiLink } from '../wiki/WikiLink';

export function MachineDossier({ chassis, portrait = true }: { chassis: Chassis; portrait?: boolean }) {
  return <section className="machine-dossier" data-testid="machine-dossier" aria-label={`${chassis.name} field guide`}>
    <div className="machine-dossier-intro">
      {portrait ? <MachinePortrait chassis={chassis} /> : null}
      <p className="dossier-summary" title={replaceSerialDesignation(chassis.lore, chassis.name)}>{chassis.summary}</p>
    </div>
    <dl className="machine-dossier-tradeoffs">
      <div><dt>Strengths</dt><dd>{chassis.strengths.join(' · ') || chassis.role}</dd></div>
      <div><dt>Weaknesses</dt><dd>{chassis.weaknesses.join(' · ') || 'Depends on fitted equipment.'}</dd></div>
    </dl>
    <p className="machine-dossier-caveat">Chassis tendencies. Your fitted weapons, armour and cooling decide the final build.</p>
    {chassis.frame === 'mech' ? <WikiLink to={{ kind: 'mech', id: chassis.id }} className="machine-wiki-link">Read {chassis.name} history ↗</WikiLink> : null}
  </section>;
}
