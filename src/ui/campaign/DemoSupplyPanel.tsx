import { claimDemoSupplies, hasDemoSupplies } from '../../campaign/demoSupplies';
import { getCatalog } from '../../schema/load';
import type { PanelProps } from './Panels';
import './demoSupplies.css';

const catalog = getCatalog();

export function DemoSupplyPanel({ state, mutate }: PanelProps) {
  const campaign = catalog.campaigns.get(state.campaignId);
  const crate = campaign?.demoSupplies;
  if (campaign === undefined || crate === undefined) return null;
  const received = hasDemoSupplies(catalog, state);
  const milestones = campaign.nodes.filter(node => !state.completedNodes.includes(node.id)
    && !state.failedNodes.includes(node.id) && node.rewards?.some(reward => reward.items?.some(item => item.kind === 'weapon')));
  return <aside className="demo-supply-panel" data-testid="demo-supply-panel">
    <header><div><span>Company equipment</span><h3>{crate.label}</h3></div>
      {received ? <strong className="demo-supply-received">Received · once per company</strong>
        : <button type="button" disabled={state.finished} data-testid="claim-demo-supplies" onClick={() => mutate(draft =>
          claimDemoSupplies(catalog, draft) ? 'Demo fitting crate added to stores. Choose a weapon below to refit a machine.' : 'This company has already received its demo crate.')}>Collect demo weapons</button>}
    </header>
    <p>{crate.description}</p>
    {milestones.length === 0 ? null : <details><summary>Equipment to earn on the campaign</summary>
      <p>Complete these contracts to receive the listed equipment. Optional-objective supplies also require that objective.</p>
      <ol>{milestones.map(node => <li key={node.id}><strong>{node.name}</strong>
        <span>{node.rewards?.flatMap(reward => (reward.items ?? []).filter(item => item.kind === 'weapon').map(item =>
          `${catalog.weapons.get(item.itemId)?.name ?? item.itemId} ×${item.count}${reward.objectiveId === undefined ? '' : ' (optional objective)'}`)).join(' · ')}</span></li>)}</ol>
    </details>}
  </aside>;
}
