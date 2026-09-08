import type { CampaignState } from '../../campaign/types';
import { deploymentCandidates } from '../../campaign/deployment';
import type { CampaignNode } from '../../schema/campaign';
import type { Catalog } from '../../schema/load';
import './campaignFlow.css';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  node: CampaignNode | null;
  onContinue: () => void;
}

export function CampaignNextStep({ catalog, state, node, onContinue }: Props) {
  if (state.finished) return null;
  const signed = state.contract !== null;
  const active = catalog.campaigns.get(state.campaignId)?.nodes.find((entry) => entry.id === state.contract?.nodeId);
  const mission = state.contract === null ? null : catalog.missions.get(state.contract.missionId);
  const title = active?.name ?? mission?.name ?? node?.name ?? 'Choose a contract';
  const ready = deploymentCandidates(state).length;
  const repairing = state.mechs.filter((mech) => mech.status === 'repairing').length;
  return <section className="campaign-next-step" aria-label="Next mission" data-testid="camp-next-step">
    <div><span className="campaign-flow-kicker">{signed ? 'Contract signed' : 'Next mission'}</span>
      <h3>{title}</h3>
      <p>{signed ? `${ready} fieldable machine${ready === 1 ? '' : 's'}${repairing > 0 ? ` · ${repairing} in the workshop` : ''}. Check loadouts and choose the lance before launch.`
        : 'Review a contract, outfit your mechs, then deploy. Choosing the next mission does not advance the calendar.'}</p>
    </div>
    <div className="campaign-flow-progress">
      <ol aria-label="Deployment steps"><li className={signed ? 'done' : 'current'}>1 · Contract</li><li className={signed ? 'current' : ''}>2 · Outfit</li><li>3 · Deploy</li></ol>
      <button type="button" onClick={onContinue} data-testid="camp-continue-mission">{signed ? 'Outfit mechs & choose lance' : node?.ending ? 'Review ending choice' : 'Review next mission'} →</button>
    </div>
  </section>;
}
