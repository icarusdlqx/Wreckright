import { useId } from 'react';
import type { MissionPreviewData } from './missionPreviewData';
import './planningMap.css';

const TERRAIN_COLOURS: Record<string, string> = {
  open: '#c6d0a1', forest: '#638f79', rough: '#b6a17e', road: '#efe0b6',
  water: '#6eafb0', building: '#727c75', impassable: '#777a70',
};

/** Merge equal terrain into a few paths; large surveys stay cheap on touch devices. */
function terrainPaths(data: MissionPreviewData): [string, string][] {
  const paths = new Map<string, string[]>();
  data.map.tiles.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const symbol = row[x]!;
      let end = x + 1;
      while (end < row.length && row[end] === symbol) end += 1;
      const terrain = data.map.legend[symbol] ?? 'open';
      const segments = paths.get(terrain) ?? [];
      segments.push(`M${x},${y}h${end - x}v1h-${end - x}z`);
      paths.set(terrain, segments); x = end;
    }
  });
  return [...paths].map(([terrain, segments]) => [terrain, segments.join('')]);
}

function elevationContours(data: MissionPreviewData): string {
  const edges: string[] = [];
  data.map.elevation?.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (x > 0 && row[x] !== row[x - 1]) edges.push(`M${x},${y}v1`);
      if (y > 0 && row[x] !== data.map.elevation?.[y - 1]?.[x]) edges.push(`M${x},${y}h1`);
    }
  });
  return edges.join('');
}

export function PlanningMap({ data }: { data: MissionPreviewData }) {
  const id = useId();
  const { width, height, tileSize } = data.map;
  const marker = Math.max(width, height) / 42;
  return <div className="planning-map" data-testid="planning-map">
    <div className="planning-map__field">
      <svg viewBox={`-2 -2 ${width + 4} ${height + 4}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
        <title id={`${id}-title`}>{data.map.name} planning map</title>
        <desc id={`${id}-description`}>Known terrain and elevation, your insertion area, and announced objective sites. Enemy positions and reinforcements are not shown.</desc>
        <rect width={width} height={height} fill={TERRAIN_COLOURS.open} />
        {terrainPaths(data).map(([terrain, d]) => <path key={terrain} d={d} fill={TERRAIN_COLOURS[terrain] ?? '#89917a'} />)}
        <path d={elevationContours(data)} fill="none" stroke="#59634e" strokeWidth=".12" opacity=".45" />
        {data.map.landmarks?.map((landmark, index) => <g key={landmark.id} transform={`translate(${landmark.column + .5},${landmark.row + .5})`}>
          <rect x={-marker} y={-marker} width={marker * 2} height={marker * 2} fill="#415b57" stroke="#fffbe9" strokeWidth=".2" />
          <text textAnchor="middle" dominantBaseline="central" fontSize={marker * 1.15} fontWeight="700" fill="#fffbe9">{String.fromCharCode(65 + index)}</text>
        </g>)}
        {data.insertion.map((point, index) => <g key={index} transform={`translate(${point.x / tileSize},${point.y / tileSize})`}>
          <circle r={marker * 1.55} fill="#ecf3d4" opacity=".65" />
          <path d={`M0,${-marker}l${marker},${marker * 2}h${-marker * 2}z`} fill="#194c48" stroke="#fffce9" strokeWidth=".2" />
        </g>)}
        {data.sites.map((site, index) => <g key={site.id} transform={`translate(${site.x / tileSize},${site.y / tileSize})`}>
          <circle r={site.radius / tileSize} fill="#ce66381a" stroke="#a54827" strokeWidth=".18" strokeDasharray={site.optional ? '.5 .4' : undefined} />
          <circle r={marker} fill={site.optional ? '#f3e1ba' : '#a54827'} stroke="#fffbe9" strokeWidth=".2" />
          <text textAnchor="middle" dominantBaseline="central" fontSize={marker * 1.3} fontWeight="700" fill={site.optional ? '#6b381e' : '#fffbe9'}>{index + 1}</text>
        </g>)}
        <rect width={width} height={height} fill="none" stroke="#425f52" strokeWidth=".25" />
      </svg>
      <span className="planning-map__orientation">N ↑ · {width * tileSize} × {height * tileSize} m</span>
    </div>
    <div className="planning-map__key">
      <p><strong>▲ Your insertion</strong><span>Plan from known ground. Scout for contacts.</span></p>
      {data.sites.length === 0 ? <p className="planning-map__unknown">Locate the opposing force after landing. No hostile positions are confirmed.</p> :
        <ol>{data.sites.map((site) => <li key={site.id}>{site.name}{site.optional ? <small>Optional</small> : null}</li>)}</ol>}
      {data.map.landmarks?.length ? <ul className="planning-map__landmarks">{data.map.landmarks.map((landmark, index) => <li key={landmark.id}><b>{String.fromCharCode(65 + index)}</b> {landmark.name}</li>)}</ul> : null}
      <div className="planning-map__terrain"><span><i style={{ background: TERRAIN_COLOURS.forest }} />Woods</span><span><i style={{ background: TERRAIN_COLOURS.road }} />Road</span><span><i style={{ background: TERRAIN_COLOURS.water }} />Water</span><span><i style={{ background: TERRAIN_COLOURS.rough }} />Rough</span></div>
      <p className="planning-map__note">Contours show elevation changes. Roads favour movement; woods conceal sightlines. Inspect terrain in the field for exact effects.</p>
    </div>
  </div>;
}
