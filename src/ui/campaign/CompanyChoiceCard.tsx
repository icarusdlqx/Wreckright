import type { Campaign } from '../../schema/campaign';
import { getCatalog } from '../../schema/load';
import { MachinePortrait } from '../mechbay/MachinePortrait';
import { machineDisplayName } from '../designLabel';

export function CompanyChoiceCard({ campaign, selected, onSelect }: { campaign: Campaign; selected: boolean; onSelect: () => void }) {
  const catalog = getCatalog();
  const designs = campaign.startingDesignIds.flatMap((id) => { const design = catalog.designs.get(id); return design === undefined ? [] : [design]; });
  const lead = designs.find((design) => (catalog.chassis.get(design.chassisId)?.tonnage ?? 0) >= 60) ?? designs[0];
  const chassis = lead === undefined ? undefined : catalog.chassis.get(lead.chassisId);
  const copy = campaign.presentation;
  return <button type="button" className={`company-choice-card company-choice-${copy?.faction ?? 'linewrought'}`} aria-pressed={selected}
    onClick={onSelect} data-testid={`company-card-${campaign.id}`}>
    <div className="company-choice-art" aria-hidden="true">{chassis === undefined ? null : <MachinePortrait chassis={chassis} />}
      <span>{selected ? 'Selected company' : 'Choose company'}</span></div>
    <div className="company-choice-copy"><span className="company-choice-kicker">{campaign.name}</span><h4>{copy?.title ?? campaign.name}</h4>
      <p>{copy?.premise}</p><p><strong>Your advantage</strong>{copy?.strength}</p><p><strong>The cost</strong>{copy?.tradeoff}</p>
      <small>Starting company · {designs.length} machines · {campaign.startingCbills.toLocaleString('en-GB')} C</small>
      <small>{designs.map((design) => machineDisplayName(catalog, design)).join(' / ')}</small>
    </div>
  </button>;
}
