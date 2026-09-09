import { useState, type CSSProperties } from 'react';
import { LOCATIONS, type MechLocation } from '../schema/common';
import type { LocationSnapshot } from './store';
import { DAMAGE_LABEL, DAMAGE_MARK, LOCATION_NAME, LOCATION_SHORT, sectionDamage, sectionDescription, type ArmourFace } from './combatDamage';
import './combatDamage.css';

interface PartShape { x: number; y: number; width: number; height: number; path: string }
// A front elevation: shoulders, torso plates and planted legs read as one machine.
const SHAPES: Record<MechLocation, PartShape> = {
  head: { x: 106, y: 4, width: 44, height: 40, path: 'M112 6 H144 L148 14 V38 H108 V14 Z' },
  left_arm: { x: 8, y: 48, width: 44, height: 84, path: 'M14 50 H48 V80 L44 84 V126 H14 L10 118 V90 L8 84 V60 Z' },
  left_torso: { x: 56, y: 48, width: 44, height: 72, path: 'M58 50 H98 V112 L86 118 H64 L58 108 Z' },
  centre_torso: { x: 106, y: 48, width: 44, height: 72, path: 'M108 50 H148 V104 L140 118 H116 L108 104 Z' },
  right_torso: { x: 156, y: 48, width: 44, height: 72, path: 'M158 50 H198 V108 L192 118 H170 L158 112 Z' },
  right_arm: { x: 204, y: 48, width: 44, height: 84, path: 'M208 50 H242 L248 60 V84 L246 90 V118 L242 126 H212 V84 L208 80 Z' },
  left_leg: { x: 62, y: 126, width: 60, height: 68, path: 'M72 128 H112 L118 152 V178 L114 192 H64 V182 L70 176 Z' },
  right_leg: { x: 134, y: 126, width: 60, height: 68, path: 'M144 128 H184 L186 176 L192 182 V192 H142 L138 178 V152 Z' },
};
interface Props {
  locations: Record<MechLocation, LocationSnapshot>;
  onSelectLocation?: (location: MechLocation) => void;
  activeLocation?: MechLocation | null;
  miniature?: boolean;
}

export function PaperDoll({ locations, onSelectLocation, activeLocation, miniature = false }: Props) {
  const [face, setFace] = useState<ArmourFace>('front');
  const hasRear = LOCATIONS.some((location) => locations[location].hasRearArmourFace);
  const drawing = <svg viewBox="0 0 256 198" aria-hidden="true" className="combat-damage__drawing">
        <path className="combat-damage__frame" d="M30 66 H226 M128 32 V138 M90 142 H166 M88 140 V178 M168 140 V178" />
        {LOCATIONS.map((location) => {
          const shape = SHAPES[location];
          const view = sectionDamage(locations[location], face);
          const middleX = shape.x + shape.width / 2;
          const labelY = shape.y + shape.height / 2;
          return <g key={location} data-testid={`${miniature ? 'dock-damage' : 'doll-shape'}-${location}`} data-armour={view.armourTone} data-structure={view.internalTone}
            className={`combat-damage__part${activeLocation === location ? ' combat-damage__part--active' : ''}`}>
            <title>{sectionDescription(location, locations[location], face)}</title>
            <path d={shape.path} className={`combat-damage__shell combat-damage__tone--${view.armourTone}`} />
            <text x={middleX} y={labelY} className="combat-damage__label">{LOCATION_SHORT[location]}</text>
            <rect x={middleX - 11} y={labelY + 6} width="22" height="7" rx="1"
              className={`combat-damage__core combat-damage__tone--${view.internalTone}`} />
            <text x={middleX + 12} y={shape.y + 14} className="combat-damage__mark">{DAMAGE_MARK[view.armourTone]}</text>
            {view.destroyed ? <path className="combat-damage__cross" d={`M${middleX - 9} ${labelY + 5} l18 10 m-18 0 l18 -10`} /> : null}
          </g>;
        })}
      </svg>;
  if (miniature) return <div className="dock-damage-miniature" data-testid="dock-damage"
    role="img" aria-label="Front armour and internal structure. Open details for rear armour and section values.">
    {drawing}
  </div>;
  return <div className="paper-doll combat-damage" data-testid="paper-doll" data-face={face}>
    <div className="combat-damage__heading">
      <span>Section condition</span>
      {hasRear ? <div className="combat-damage__faces" role="group" aria-label="Armour face">
        {(['front', 'rear'] as const).map((value) => <button key={value} type="button"
          aria-pressed={face === value} onClick={() => setFace(value)}>{value === 'front' ? 'Front' : 'Rear'}</button>)}
      </div> : null}
    </div>
    <div className={`combat-damage__stage${onSelectLocation === undefined ? '' : ' combat-damage__stage--interactive'}`}>
      {drawing}
      {LOCATIONS.map((location) => {
        const shape = SHAPES[location];
        const view = sectionDamage(locations[location], face);
        const style: CSSProperties = { left: `${shape.x / 256 * 100}%`, top: `${shape.y / 198 * 100}%`,
          width: `${shape.width / 256 * 100}%`, height: `${shape.height / 198 * 100}%` };
        return <button key={location} type="button" className={`doll-cell combat-damage__hit${view.destroyed ? ' destroyed' : ''}${activeLocation === location ? ' active' : ''}`}
          style={style} disabled={onSelectLocation === undefined} onClick={() => onSelectLocation?.(location)}
          aria-label={sectionDescription(location, locations[location], face)}
          {...(onSelectLocation === undefined ? {} : { 'aria-pressed': activeLocation === location })}
          title={sectionDescription(location, locations[location], face)} data-testid={`doll-${location}`} />;
      })}
    </div>
    <p className="combat-damage__key">Shell: armour · inset: structure{face === 'rear' ? ' · rear torso view' : ''}</p>
    <div className="combat-damage__legend" aria-label="Condition legend">
      {(['sound', 'damaged', 'critical', 'destroyed'] as const).map((tone) => <span key={tone}>
        <i className={`combat-damage__tone--${tone}`}>{DAMAGE_MARK[tone]}</i>{DAMAGE_LABEL[tone]}</span>)}
    </div>
    <details className="combat-damage__values" data-testid="damage-values"><summary>Section values</summary>
      <table><caption>Front / rear armour and internal structure</caption><thead><tr><th>Section</th><th>Armour</th><th>Rear</th><th>Structure</th></tr></thead>
        <tbody>{LOCATIONS.map((location) => {
          const state = locations[location];
          const view = sectionDamage(state, face);
          return <tr key={location}><th title={LOCATION_NAME[location]}>{LOCATION_SHORT[location]}{view.destroyed ? ' ×' : ''}</th>
            <td>{Math.ceil(view.destroyed ? 0 : state.armour)}/{state.armourMax}</td>
            <td>{state.hasRearArmourFace ? <span data-testid={`doll-rear-${location}`}>{Math.ceil(view.destroyed ? 0 : state.rearArmour)}/{state.rearArmourMax}</span> : '—'}</td>
            <td>{Math.ceil(view.internal)}/{state.internalMax}</td></tr>;
        })}</tbody></table>
    </details>
  </div>;
}
