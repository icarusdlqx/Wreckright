import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Campaign, CampaignNode } from '../../schema/campaign';
import type { Catalog } from '../../schema/load';
import { employerDisplayName } from '../../campaign/employers';
import { layoutCampaignMap, mapLabelHeight, MAP_SSR_SIZE, campaignAnchor } from './campaignMapLayout';
import { CampaignTheatre, theatreIdentity } from './CampaignTheatre';
import './campaignTheatre.css';
import { mainStoryNodeIds, missingPrerequisites } from './campaignFlow';
import { campaignRouteForRevision } from '../../campaign/campaignRoute';

export type NodeState = 'locked' | 'available' | 'complete' | 'failed';

interface Props {
  campaign: Campaign;
  catalog: Catalog;
  contentRevision?: number;
  stateOf: (node: CampaignNode) => NodeState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReview?: (id: string) => void;
}

/** What the contract actually asks you to do, from the mission it points at. */
function missionGlyph(catalog: Catalog, missionId: string): { glyph: string; kind: string } {
  const mission = catalog.missions.get(missionId);
  // Only the required objectives say what the contract is; the optional ones are bonuses.
  const types = new Set(
    (mission?.objectives ?? []).filter((objective) => objective.required).map((o) => o.type),
  );

  if (types.has('capture_zones') || types.has('hold_zones')) return { glyph: '◎', kind: 'Capture' };
  if (types.has('protect_zones')) return { glyph: '⬢', kind: 'Defend' };
  if (types.has('destroy_all')) return { glyph: '✳', kind: 'Strike' };
  if (types.has('survive')) return { glyph: '⌂', kind: 'Hold' };
  return { glyph: '✳', kind: 'Strike' };
}

function deploymentNote(catalog: Catalog, missionId: string): { allowance: string; reason: string } {
  const mission = catalog.missions.get(missionId);
  const tonnage = mission?.dropTonnage === null || mission?.dropTonnage === undefined ? 'Open tonnage' : `${mission.dropTonnage}t`;
  const berths = mission?.maxPlayerUnits ?? mission?.lances.find((lance) => lance.team === 0)?.units.length;
  const allowance = `${tonnage}${berths === undefined ? '' : ` / ${berths}`}`;
  if ((mission?.dropTonnage ?? Infinity) <= 50 || berths === 1) return { allowance, reason: 'Solo survey' };
  if (berths === 2) return { allowance, reason: 'Verification detail' };
  if ((mission?.dropTonnage ?? Infinity) <= 150) return { allowance, reason: 'Restricted access' };
  if (mission?.type === 'defend') return { allowance, reason: 'Site defence lift' };
  if (mission?.type === 'recon') return { allowance, reason: 'Survey lift' };
  return { allowance, reason: 'Operational lift' };
}

export function CampaignMap({ campaign, catalog, contentRevision, stateOf, selectedId, onSelect, onReview }: Props) {
  const mapRef = useRef<HTMLElement>(null);
  const [measured, setMeasured] = useState({ ...MAP_SSR_SIZE, borderHeight: 2, heights: {} as Record<string, number> });
  const revision = contentRevision ?? campaign.contentRevision;
  const nodes = campaignRouteForRevision(campaign, revision)?.nodes ?? campaign.nodes;
  const story = mainStoryNodeIds(campaign, revision);
  const completed = nodes.filter((node) => stateOf(node) === 'complete').map((node) => node.id);
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    const cards = [...map.querySelectorAll<HTMLElement>('[data-map-node]')];
    const measure = (): void => {
      if (map.clientWidth <= 0 || map.clientHeight <= 0) return;
      const heights = Object.fromEntries(cards.map((card) => [card.dataset.mapNode ?? '', card.offsetHeight]));
      const borderHeight = Math.max(0, map.offsetHeight - map.clientHeight);
      setMeasured((previous) => previous.width === map.clientWidth && previous.height === map.clientHeight
        && previous.borderHeight === borderHeight
        && Object.keys(heights).every((id) => heights[id] === previous.heights[id])
        ? previous : { width: map.clientWidth, height: map.clientHeight, borderHeight, heights });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(map);
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [campaign.id]);
  const layout = layoutCampaignMap(nodes.map((node) => ({
    id: node.id, position: node.position, available: stateOf(node) === 'available', height: measured.heights[node.id],
  })), measured);
  const at = (node: CampaignNode): { x: number; y: number } => {
    const card = layout.cards.get(node.id);
    return { x: (card?.x ?? node.position.x * layout.width) / layout.width * 100,
      y: (card?.y ?? node.position.y * layout.height) / layout.height * 100 };
  };
  const mapStyle = { '--camp-node-width': `${layout.nodeWidth}px`,
    '--camp-map-min-height': `${layout.minimumHeight + measured.borderHeight}px` } as CSSProperties;

  // Supply routes: a contract unlocks the ones that list it as a prerequisite.
  const routes = nodes.flatMap((node) =>
    node.requires.map((requiredId) => {
      const from = nodes.find((candidate) => candidate.id === requiredId);
      return from === undefined ? null : { from, to: node };
    }),
  );

  return (
    <section className={`camp-map camp-map-${campaign.presentation?.faction ?? 'linewrought'}`} ref={mapRef} style={mapStyle}
      data-campaign-faction={campaign.presentation?.faction ?? 'linewrought'} data-testid="camp-map">
      <svg className="camp-terrain" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <CampaignTheatre campaignId={campaign.id} />

        {routes.map((route, index) =>
          route === null ? null : (
            <line
              key={index}
              x1={campaignAnchor(route.from.position).x}
              y1={campaignAnchor(route.from.position).y}
              x2={campaignAnchor(route.to.position).x}
              y2={campaignAnchor(route.to.position).y}
              className={`camp-route ${stateOf(route.from) === 'complete' ? 'open' : ''}`}
            />
          ),
        )}
        {nodes.map((node) => {
          const anchor = campaignAnchor(node.position);
          const label = at(node);
          return <g key={node.id} data-map-anchor={node.id}>
            <line className="campaign-label-leader" x1={anchor.x} y1={anchor.y} x2={label.x} y2={label.y} />
            <circle className={`campaign-anchor ${stateOf(node)}`} cx={anchor.x} cy={anchor.y} r={selectedId === node.id ? .8 : .55} />
          </g>;
        })}
      </svg>
      <div className="campaign-cartouche"><strong>{theatreIdentity(campaign.id).name}</strong><span>{campaign.presentation?.faction === 'aurelian' ? 'Surveyed stages · warrant sequence' : 'Workshop sites · service routes'}</span></div>

      {nodes.map((node) => {
        const state = stateOf(node);
        const { glyph, kind } = missionGlyph(catalog, node.missionId);
        const position = at(node);
        const employer = employerDisplayName(campaign, node.employerId);
        const main = story.has(node.id);
        const deployment = deploymentNote(catalog, node.missionId);

        return (
          <button
            key={node.id}
            type="button"
            className={`camp-node ${state} ${main ? 'main-route' : 'optional-route'} ${selectedId === node.id ? 'selected' : ''}`}
            style={{ left: `${position.x}%`, top: `${position.y}%`,
              '--camp-node-height': `${mapLabelHeight(state === 'available')}px` } as CSSProperties}
            disabled={state === 'locked' || (state !== 'available' && onReview === undefined)}
            onClick={() => state === 'available' ? onSelect(node.id) : onReview?.(node.id)}
            data-testid={`camp-node-${node.id}`}
            data-map-node={node.id}
            title={`${main ? 'Main story' : 'Optional work'} · ${employer} · ${kind} · ${deployment.allowance} · ${deployment.reason}${state === 'locked' ? ` · Complete: ${missingPrerequisites(campaign, node, completed, revision).join(' + ')}` : ''}`}
          >
            <span className="node-glyph" aria-hidden="true">
              {state === 'complete' ? '✓' : state === 'failed' ? '✕' : glyph}
            </span>
            <span className="node-body">
              <span className="node-name">{node.name}</span>
              <span className="node-meta">
                {main ? 'Main route' : 'Optional work'} · {kind}
              </span>
              <span className="node-state">
                {state === 'available'
                  ? `${deployment.allowance} · ${deployment.reason}`
                  : state === 'locked' ? `${deployment.allowance} · locked` : `${deployment.allowance} · ${state}`}
              </span>
            </span>
          </button>
        );
      })}

      <ul className="camp-legend" aria-label="Map legend">
        <li><span aria-hidden="true">✳</span> Strike</li>
        <li><span aria-hidden="true">◎</span> Capture</li>
        <li><span aria-hidden="true">⌂</span> Hold</li>
        <li><span aria-hidden="true">⬢</span> Defend</li>
      </ul>
    </section>
  );
}
