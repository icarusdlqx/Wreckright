import type { OrderMode } from './store';

const EXPLANATIONS = [
  ['Move', 'Go to a point. Replaces pursuit of the old target; guns may still fire at opportunities. Shift or Queue adds a waypoint.'],
  ['Attack', 'Assign a target and approach a useful firing position. A Move or Guard order takes priority over the approach.'],
  ['Attack Move', 'Advance towards a destination and stop to engage contacts along the way.'],
  ['Stop', 'Cancel the route, queued waypoints and priority target. Weapons stay active and may fire at opportunities.'],
  ['Guard', 'Cancel the route and hold this ground. Weapons remain active. Press again to release.'],
  ['Called Shot', 'Choose a visible hostile in the target panel, then a section of its armour. Disabling legs can preserve a hull when the mission can be won by holding ground.'],
  ['Hold Fire', 'Stop firing while you reposition or secure a damaged machine for recovery.'],
  ['Stay Cool', 'Let the governor temporarily hold the hottest weapon groups. It restores them as heat falls.'],
  ['Formation', 'Sets the group’s destination layout. It does not make every machine follow the same marching shape.'],
];

export function OrderGuide({ jumpNote }: { jumpNote: string }) {
  return <details className="order-guide" data-testid="order-guide"><summary>What these orders do</summary>
    <dl>{EXPLANATIONS.map(([name, text]) => <div key={name}><dt>{name}</dt><dd>{text}</dd></div>)}
      <div><dt>Jump</dt><dd>{jumpNote}</dd></div></dl>
  </details>;
}

export function ActiveOrderHelp({ mode }: { mode: OrderMode }) {
  if (mode === null) return null;
  const text = mode === 'attack' ? 'Choose a visible hostile. A current Move route or Guard order keeps priority; otherwise your machine approaches a firing position. Stop clears the route and target; Guard cancels the route and keeps the target.'
    : mode === 'called_shot' ? 'Choose a visible hostile and its body section in the hostile armour panel. Hold fire once the desired damage is done.'
      : mode === 'jump' ? 'Choose a point inside jump reach. Jets create heat and need time to recharge.'
        : 'Choose a destination. Shift or Queue adds another waypoint. Orders also work while paused.';
  return <p className="active-order-help" data-testid="active-order-help">{text}</p>;
}
