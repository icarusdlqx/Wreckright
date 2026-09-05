import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Campaign, CampaignNode } from '../../schema/campaign';
import type { Catalog } from '../../schema/load';
import { employerDisplayName } from '../../campaign/employers';
import { layoutCampaignMap, mapLabelHeight, MAP_SSR_SIZE } from './campaignMapLayout';

export type NodeState = 'locked' | 'available' | 'complete' | 'failed';

interface Props {
  campaign: Campaign;
  catalog: Catalog;
  stateOf: (node: CampaignNode) => NodeState;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Deterministic value noise, so the same theatre draws the same terrain every load. */
function noise(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

/** A closed contour ring, wobbled by the noise field — reads as high ground. */
function contour(cx: number, cy: number, radius: number, seed: number): string {
  const points: string[] = [];
  const steps = 26;
  for (let index = 0; index < steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const wobble = 0.72 + noise(Math.cos(angle) * 3, Math.sin(angle) * 3, seed) * 0.55;
    points.push(
      `${(cx + Math.cos(angle) * radius * wobble).toFixed(1)},${(cy + Math.sin(angle) * radius * wobble * 0.62).toFixed(1)}`,
    );
  }
  return `M${points.join('L')}Z`;
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
        <defs>
          <linearGradient id="camp-ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f1ecda" />
            <stop offset="100%" stopColor="#e1e5d1" />
          </linearGradient>
          <pattern id="camp-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10,0 H0 V10" fill="none" stroke="#6b8b80"
              strokeWidth={0.65} vectorEffect="non-scaling-stroke" opacity={0.2} />
            <path d="M5,0 V10 M0,5 H10" fill="none" stroke="#6b8b80"
              strokeWidth={0.45} vectorEffect="non-scaling-stroke" opacity={0.1} />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#camp-ground)" />

        {/* Nested contours keep the highlands readable as printed cartography. */}
        {[
          { cx: 22, cy: 30, r: 20, seed: 3 },
          { cx: 68, cy: 24, r: 16, seed: 11 },
          { cx: 74, cy: 72, r: 22, seed: 7 },
          { cx: 34, cy: 76, r: 14, seed: 19 },
        ].map((hill, index) => (
          <g key={index}>
            {[1, 0.77, 0.53, 0.29].map((scale, ring) => (
              <path
                key={ring}
                d={contour(hill.cx, hill.cy, hill.r * scale, hill.seed)}
                fill={['#d4dcc0', '#cbd5b5', '#c2cca9', '#d7d2ac'][ring]}
                fillOpacity={0.7}
                stroke="#8b9e7f"
                strokeOpacity={0.45}
                strokeWidth={0.85}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        ))}

        {/* The river the whole border dispute is about. */}
        <path
          d="M-2,58 C18,52 26,68 44,64 C60,60 66,44 84,46 C94,47 98,42 102,40"
          fill="none"
          stroke="#d5bf91"
          strokeWidth={3.9}
          strokeOpacity={0.65}
        />
        <path
          d="M-2,58 C18,52 26,68 44,64 C60,60 66,44 84,46 C94,47 98,42 102,40"
          fill="none"
          stroke="#f1e4bf"
          strokeWidth={2.8}
        />
        <path
          d="M-2,58 C18,52 26,68 44,64 C60,60 66,44 84,46 C94,47 98,42 102,40"
          fill="none"
          stroke="#74b5ae"
          strokeWidth={1.7}
        />
        <path
          d="M-2,58 C18,52 26,68 44,64 C60,60 66,44 84,46 C94,47 98,42 102,40"
          fill="none"
          stroke="#c7e6d8"
          strokeWidth={0.25}
          strokeDasharray="1.4 2.2"
          strokeLinecap="round"
        />
        <rect width="100" height="100" fill="url(#camp-grid)" />

        {routes.map((route, index) =>
          route === null ? null : (
            <line
              key={index}
              x1={at(route.from).x}
              y1={at(route.from).y}
              x2={at(route.to).x}
              y2={at(route.to).y}
              className={`camp-route ${stateOf(route.from) === 'complete' ? 'open' : ''}`}
            />
          ),
        )}
      </svg>

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
