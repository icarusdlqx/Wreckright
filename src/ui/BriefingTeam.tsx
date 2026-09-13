import { useState, type CSSProperties } from 'react';
import { getCatalog } from '../schema/load';
import type { BriefingBerth, BriefingLance } from './Briefing';
import { PilotPortrait } from './PilotPortrait';
import { PilotStats } from './PilotStats';
import { PilotAbilityReadout } from './PilotAbilityReadout';
import { PilotPersonalityNote } from './PilotProfile';
import { machinePortraitSource } from './mechbay/MachinePortrait';
import './briefingTeam.css';

/** The same seat order and pilot/machine pairing continue into the combat dock. */
export function BriefingTeam({ lance, enemy = false }: { lance: BriefingLance; enemy?: boolean }) {
  const [selected, setSelected] = useState(0);
  const active = lance.berths.some(berth => berth.index === selected) ? selected : lance.berths[0]?.index;
  const prefix = enemy ? 'enemy-' : '';
  return <div className="briefing-team" data-testid={`${prefix}briefing-team`}>
    <p className="briefing-team-hint">Select a pairing to assign its pilot, choose a mech or refit its weapons.</p>
    <div className="briefing-team-cards" aria-label={enemy ? 'Enemy pilot and mech pairings' : 'Your pilot and mech pairings'}
      style={{ '--berth-count': Math.max(1, lance.berths.length) } as CSSProperties}>
      {lance.berths.map(berth => {
        const empty = berth.designValue === 'empty';
        const pilotName = berth.pilot?.name ?? lance.pilots.find(pilot => pilot.id === berth.pilotId)?.name ?? 'Unassigned pilot';
        const source = machinePortraitSource(berth.machine?.chassisId ?? '');
        return <button key={berth.index} type="button" className={`briefing-team-card${empty ? ' is-empty' : ''}`}
          data-testid={`${prefix}briefing-berth-${berth.index}`} data-pilot-id={empty ? undefined : berth.pilotId}
          aria-pressed={active === berth.index} aria-controls={`${prefix}briefing-berth-editor-${berth.index}`}
          onClick={() => setSelected(berth.index)}>
          <span className="briefing-pair-art">
            {empty ? <span className="briefing-empty-art" aria-hidden="true">+</span> : <>
              <PilotPortrait pilot={{ id: berth.pilotId, name: pilotName }} compact />
              {source === undefined ? null : <img src={source} className="briefing-pair-mech" alt="" width="80" height="90"
                title="Chassis portrait · standard equipment" />}
            </>}
            <span className="briefing-pair-seat">{String(berth.index + 1).padStart(2, '0')}</span>
          </span>
          <strong>{empty ? 'Empty berth' : pilotName}</strong>
          <span className="briefing-pair-machine" title={berth.machine?.identity}>{empty ? 'Choose a machine' : `${berth.machine?.name ?? 'Machine'} · ${berth.tonnage}t`}</span>
          <small>{empty ? 'No tonnage used' : berth.customLabel === null ? berth.machine?.role : 'Edited loadout'}</small>
        </button>;
      })}
    </div>
    {lance.berths.map(berth => <BriefingBerthEditor key={berth.index} berth={berth} lance={lance}
      prefix={prefix} hidden={active !== berth.index} />)}
  </div>;
}

function BriefingBerthEditor({ berth, lance, prefix, hidden }: {
  berth: BriefingBerth; lance: BriefingLance; prefix: string; hidden: boolean;
}) {
  const catalog = getCatalog();
  const occupied = berth.designValue !== 'empty';
  const taken = (id: string) => lance.berths.some(candidate => candidate.designValue !== 'empty' && candidate.pilotId === id);
  return <section className="briefing-berth briefing-berth-editor" hidden={hidden}
    id={`${prefix}briefing-berth-editor-${berth.index}`} aria-label={`${prefix ? 'Enemy ' : ''}berth ${berth.index + 1} assignments`}>
    <div className="briefing-berth-controls">
      <label><span>Mech · berth {berth.index + 1}</span>
        <select value={berth.designValue} onChange={event => lance.onDesign(berth.index, event.target.value)}
          data-testid={`${prefix}berth-design-${berth.index}`} aria-label={`${prefix ? 'Enemy mech' : 'Mech'} for berth ${berth.index + 1}`}>
          {berth.customLabel === null ? null : <option value="custom">{berth.customLabel} (edited loadout)</option>}
          <option value="empty">— empty berth —</option>
          {occupied && berth.designValue !== 'custom' && !lance.designs.some(design => design.value === berth.designValue)
            ? <option value={berth.designValue}>{berth.machine?.name ?? berth.designValue} (scenario unit)</option> : null}
          {lance.designs.map(design => <option key={design.value} value={design.value}>{design.label}</option>)}
          {lance.saved.length === 0 ? null : <optgroup label="Saved loadouts">
            {lance.saved.map(design => <option key={design.value} value={design.value}>{design.label}</option>)}
          </optgroup>}
        </select>
      </label>
      <label><span>Pilot</span>
        <select value={berth.pilotId} onChange={event => lance.onPilot(berth.index, event.target.value)}
          data-testid={`${prefix}berth-pilot-${berth.index}`} aria-label={`${prefix ? 'Enemy pilot' : 'Pilot'} for berth ${berth.index + 1}`}>
          {lance.pilots.map(pilot => <option key={pilot.id} value={pilot.id}
            disabled={pilot.id !== berth.pilotId && taken(pilot.id)}>{pilot.name}</option>)}
        </select>
      </label>
      <div className="briefing-refit-line">
        <small>{occupied ? `${berth.machine?.weaponCount ?? 0} weapons fitted · ${berth.tonnage}t drop weight` : 'An empty berth stays behind on this drop.'}</small>
        <button type="button" onClick={() => lance.onCustomise(berth.index)} title="Open the Mechlab on this machine"
          data-testid={`${prefix}berth-customise-${berth.index}`}>Mechlab</button>
      </div>
    </div>
    {!occupied || berth.pilot === null ? null : <div className="briefing-pilot-dossier" data-testid={`${prefix}briefing-pilot-dossier`}>
      <div className="briefing-pilot-character"><strong>{berth.pilot.name}</strong><PilotPersonalityNote pilot={berth.pilot} /></div>
      <PilotStats catalog={catalog} pilot={berth.pilot} compact />
      <PilotAbilityReadout catalog={catalog} pilot={berth.pilot} compact />
    </div>}
  </section>;
}
