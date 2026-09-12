import { useState } from 'react';
import type { MechLocation } from '../schema/common';
import { PaperDoll } from './PaperDoll';
import type { UnitSnapshot } from './store';
import { getCatalog } from '../schema/load';
import { SalvageIntent } from './SalvageIntent';

interface Props {
  enemies: readonly UnitSnapshot[];
  currentTargetId: number | null;
  location: MechLocation | null;
  onAim: (targetId: number, location: MechLocation) => void;
  onCancel: () => void;
}

/** Target snapshots exist only while optical identification is current. */
export function CalledShotTarget({ enemies, currentTargetId, location, onAim, onCancel }: Props) {
  const [chosen, setChosen] = useState(currentTargetId);
  const standing = enemies.filter((enemy) => enemy.alive && enemy.identified);
  const target = standing.find((enemy) => enemy.id === chosen) ?? standing.find((enemy) => enemy.id === currentTargetId) ?? standing[0];
  return <section className="called-shot-target" data-testid="called-shot-target">
    <header><strong>Called shot · hostile armour</strong><button type="button" onClick={onCancel}>Done</button></header>
    {target === undefined ? <p>Optical contact required. Move closer to identify a hostile before choosing its body section.</p> : <>
      <label>Hostile target<select value={target.id} onChange={(event) => setChosen(Number(event.currentTarget.value))} data-testid="called-shot-hostile">
        {standing.map((enemy) => <option key={enemy.id} value={enemy.id}>{enemy.identity.split(' — ')[0]} · contact {enemy.id}</option>)}
      </select></label>
      <p>Choose a section of <strong>{target.identity.split(' — ')[0]}</strong> to direct the selected lance's fire there.</p>
      <PaperDoll locations={target.locations} activeLocation={location} onSelectLocation={(part) => onAim(target.id, part)} />
      <SalvageIntent catalog={getCatalog()} target={target} location={location} />
    </>}
  </section>;
}
