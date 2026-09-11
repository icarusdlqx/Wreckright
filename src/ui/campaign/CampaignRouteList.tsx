import type { CampaignState } from '../../campaign/types';
import type { Campaign, CampaignNode } from '../../schema/campaign';
import { mainStoryNodeIds, missingPrerequisites } from './campaignFlow';
import { campaignRouteForRevision } from '../../campaign/campaignRoute';

export function CampaignRouteList({ campaign, state, open, selectedId, onReview }: {
  campaign: Campaign; state: CampaignState; open: readonly CampaignNode[];
  selectedId: string | null; onReview: (id: string) => void;
}) {
  if (state.finished) return null;
  const route = campaignRouteForRevision(campaign, state.campaignContentRevision);
  if (route === null) return null;
  const story = mainStoryNodeIds(campaign, state.campaignContentRevision);
  const available = open.filter((node) => story.has(node.id));
  const other = open.filter((node) => !story.has(node.id));
  const upcoming = route.nodes.filter((node) => story.has(node.id) && !state.completedNodes.includes(node.id)
    && !state.failedNodes.includes(node.id) && !open.some((entry) => entry.id === node.id));
  const buttons = (nodes: readonly CampaignNode[]) => nodes.map((node) => <button type="button" key={node.id}
    aria-pressed={selectedId === node.id} onClick={() => onReview(node.id)} data-testid={`camp-route-review-${node.id}`}>
    {node.name}{node.ending ? ' · Ending choice' : ''}
  </button>);
  return <section className="campaign-route-list" aria-label="Campaign route" data-testid="camp-route-list">
    <div><strong>Main story</strong><p>{state.contract !== null ? 'Finish the signed contract before taking another.'
      : available.some((node) => node.ending) ? 'Choose the future of the company. Review either ending before signing.'
        : 'These contracts advance the campaign toward its ending.'}</p></div>
    <div className="campaign-route-options">{buttons(available)}</div>
    {other.length === 0 ? null : <details><summary>Optional work · {other.length} available</summary>
      <p>Extra income, salvage and experience. Optional contracts do not replace the main story.</p><div className="campaign-route-options">{buttons(other)}</div></details>}
    {upcoming.length === 0 ? null : <details><summary>Upcoming story · requirements</summary><ul>{upcoming.map((node) => <li key={node.id}>
      <strong>{node.name}</strong><span>{state.contract?.nodeId === node.id ? 'Currently signed' : `Complete: ${missingPrerequisites(campaign, node, state.completedNodes, state.campaignContentRevision).join(' + ') || 'the active contract'}`}</span>
    </li>)}</ul></details>}
  </section>;
}
