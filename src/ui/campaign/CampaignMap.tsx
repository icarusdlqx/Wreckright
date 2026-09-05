import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Campaign, CampaignNode } from '../../schema/campaign';
import type { Catalog } from '../../schema/load';
import { employerDisplayName } from '../../campaign/employers';
import { layoutCampaignMap, mapLabelHeight, MAP_SSR_SIZE, campaignAnchor } from './campaignMapLayout';
import { CampaignTheatre, theatreIdentity } from './CampaignTheatre';
import './campaignTheatre.css';

export type NodeState = 'locked' | 'available' | 'complete' | 'failed';

interface Props {
  campaign: Campaign;
  catalog: Catalog;
  stateOf: (node: CampaignNode) => NodeState;
  selectedId: string | null;
  onSelect: (id: string) => void;
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

export function CampaignMap({ campaign, catalog, stateOf, selectedId, onSelect }: Props) {
  const mapRef = useRef<HTMLElement>(null);
  const [measured, setMeasured] = useState({ ...MAP_SSR_SIZE, borderHeight: 2, heights: {} as Record<string, number> });
  const nodes = campaign.nodes;
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
    <section className="camp-map" ref={mapRef} style={mapStyle} data-testid="camp-map">
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
      <div className="campaign-cartouche"><strong>{theatreIdentity(campaign.id).name}</strong><span>Fixed sites · contract links</span></div>

      {nodes.map((node) => {
        const state = stateOf(node);
        const { glyph, kind } = missionGlyph(catalog, node.missionId);
        const position = at(node);
        const employer = employerDisplayName(campaign, node.employerId);

        return (
          <button
            key={node.id}
            type="button"
            className={`camp-node ${state} ${selectedId === node.id ? 'selected' : ''}`}
            style={{ left: `${position.x}%`, top: `${position.y}%`,
              '--camp-node-height': `${mapLabelHeight(state === 'available')}px` } as CSSProperties}
            disabled={state !== 'available'}
            onClick={() => onSelect(node.id)}
            data-testid={`camp-node-${node.id}`}
            data-map-node={node.id}
            title={`${employer} · ${kind}`}
          >
            <span className="node-glyph" aria-hidden="true">
              {state === 'complete' ? '✓' : state === 'failed' ? '✕' : glyph}
            </span>
            <span className="node-body">
              <span className="node-name">{node.name}</span>
              <span className="node-meta">
                {kind} · {employer}
              </span>
              <span className="node-state">
                {state === 'available'
                  ? `${(node.basePayout / 1000).toFixed(0)}k · salvage to ${(node.maxSalvageShare * 100).toFixed(0)}%`
                  : state}
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
