/** Illustrated regional geography. Contract anchors come from the campaign, never this artwork. */
export function theatreIdentity(campaignId: string): { name: string; caption: string } {
  return campaignId === 'aurelian_recall'
    ? { name: 'Recall territory', caption: 'Quarry belt / conduit corridor / export coast' }
    : { name: 'Border territory', caption: 'River crossing / yard belt / northern highlands' };
}

function contour(cx: number, cy: number, radius: number, seed: number): string {
  const points = Array.from({ length: 32 }, (_, index) => {
    const angle = index / 32 * Math.PI * 2;
    const wobble = .87 + Math.sin(angle * 3 + seed) * .09 + Math.cos(angle * 7 - seed) * .06;
    return `${(cx + Math.cos(angle) * radius * wobble).toFixed(2)},${(cy + Math.sin(angle) * radius * wobble * .67).toFixed(2)}`;
  });
  return `M${points.join('L')}Z`;
}

export function CampaignTheatre({ campaignId }: { campaignId: string }) {
  const recall = campaignId === 'aurelian_recall';
  const river = recall ? 'M-4 26 C18 21 24 39 43 40 S69 52 75 68 S95 78 106 76'
    : 'M-4 58 C18 52 26 68 44 64 C60 60 66 44 84 46 S99 42 104 40';
  const hills = recall ? [[15, 58, 21], [75, 57, 22], [48, 13, 16]] : [[17, 24, 24], [65, 20, 22], [77, 79, 20]];
  const land = recall ? 'M0 19 Q30 14 55 23 T100 18 V100 H0Z' : 'M0 0H100V100H0Z';
  return (
    <g className="campaign-geography">
      <defs>
        <pattern id="theatre-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0 H0 V10" fill="none" stroke="#638679" strokeWidth=".11" opacity=".22" />
        </pattern>
        <pattern id="theatre-forest" width="2.6" height="2.6" patternUnits="userSpaceOnUse">
          <path d="M.7 1.7 1.2 .6 1.7 1.7Z" fill="#769279" opacity=".34" />
        </pattern>
      </defs>
      <rect width="100" height="100" fill={recall ? '#8fbdb8' : '#e5e4cf'} />
      <path d={land} fill="#e5e4cf" stroke="#83aaa0" strokeWidth=".4" />
      {hills.map(([x = 0, y = 0, radius = 0], index) => <g key={index}>
        {[1, .82, .64, .45, .26].map((scale, ring) => <path key={ring} d={contour(x, y, radius * scale, index + 2)}
          fill={['#d2dbbe', '#c7d2b2', '#bac8a2', '#d1c9a3', '#dfd6b8'][ring]} fillOpacity=".7" stroke="#899c7d" strokeWidth=".14" />)}
      </g>)}
      <path d={recall ? 'M3 49 Q19 36 27 52 L20 85 8 79Z' : 'M2 37 Q17 28 31 42 L35 56 10 54Z'} fill="url(#theatre-forest)" />
      <path d={river} fill="none" stroke="#bcba94" strokeWidth="3.5" />
      <path d={river} fill="none" stroke="#f1e5c8" strokeWidth="2.7" />
      <path d={river} fill="none" stroke="#79b4af" strokeWidth="1.8" />
      <path d={river} fill="none" stroke="#b9ddd0" strokeWidth=".25" />
      <path d={recall ? 'M18 78 29 48 46 72 61 43 80 35 78 8' : 'M18 70 29 57 50 42 82 30 93 20'} fill="none" stroke="#c0ac88" strokeWidth=".8" />
      <path d={recall ? 'M18 78 29 48 46 72 61 43 80 35 78 8' : 'M18 70 29 57 50 42 82 30 93 20'} fill="none" stroke="#f4eed9" strokeWidth=".4" />
      {recall ? <>
        <path d="M71 56 78 53 87 60 83 72 73 73 68 65Z M72 60 78 57 83 61 81 68 75 69Z" fill="#c6b599" fillRule="evenodd" stroke="#a99e81" strokeWidth=".25" />
        <path d="M54 50 68 48 81 35" fill="none" stroke="#72898a" strokeWidth=".7" />
        <text x="8" y="12">EXPORT COAST</text><text x="68" y="88">QUARRY BELT</text>
        <text x="48" y="57">CONDUIT CORRIDOR</text>
      </> : <>
        <g fill="#a8ae97" stroke="#7b8d7b" strokeWidth=".2"><path d="M34 74h4v3h-4zM39 75h5v2h-5zM34 79h3v3h-3zM40 79h4v4h-4z" /></g>
        <path d="M61 56 64 60 M60 57 63 61" stroke="#516e65" strokeWidth=".45" />
        <text x="3" y="87">WORKS &amp; YARDS</text><text x="46" y="7">NORTHERN HIGHLANDS</text>
        <text x="62" y="64">RIVER CROSSING</text>
      </>}
      <rect width="100" height="100" fill="url(#theatre-grid)" />
    </g>
  );
}
