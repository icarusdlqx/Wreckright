import { useMemo, useRef } from 'react';
import { mechIntegrity } from '../../campaign/integrity';
import type { CampaignState } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { validateDesign } from '../../schema/designValidation';
import { machineDisplayName } from '../designLabel';
import { PilotPortrait } from '../PilotPortrait';
import { MachinePortrait } from '../mechbay/MachinePortrait';
import { WeaponGlyph } from '../mechbay/WeaponGlyph';
import { useDialogFocus } from '../useDialogFocus';
import { isPrimeEquipment, recommendedFirstDrop } from './firstDropRecommendation';
import './recommendedFirstDrop.css';

interface Props {
  catalog: Catalog;
  state: CampaignState;
  onUseTeam: () => void;
  onCustomise: () => void;
  onRefit: (mechId: string) => void;
  onCancel: () => void;
  hidden?: boolean;
  persistent?: boolean;
}

export function RecommendedFirstDrop({ catalog, state, onUseTeam, onCustomise, onRefit, onCancel,
  hidden = false, persistent = true }: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogFocus(dialogRef, dialogRef, hidden ? undefined : onCancel);
  const recommendation = useMemo(() => recommendedFirstDrop(catalog, state), [catalog, state]);
  if (recommendation === null || state.contract === null) return null;
  const { plan, issues, allPrime } = recommendation;
  const ready = issues.length === 0;
  return <div className="manifest-backdrop prep-workspace-backdrop" data-testid="first-drop-overview" hidden={hidden} inert={hidden}>
    <section className="manifest exp-prep first-drop" ref={dialogRef} role="dialog" aria-modal="true"
      aria-labelledby="first-drop-title" tabIndex={-1}>
      <header className="first-drop-header">
        <div><span className="prep-eyebrow">Your first deployment</span><h3 id="first-drop-title">A team to start with</h3>
          <p>{catalog.missions.get(state.contract.missionId)?.name ?? state.contract.missionId}</p></div>
        <button type="button" onClick={onCancel} aria-label="Close preparation">×</button>
      </header>
      <div className="first-drop-content">
        <div className="first-drop-introduction">
          <div><h4>{allPrime && ready ? 'Already armed. Already paired.' : 'Your current loadouts, ready to review.'}</h4>
            <p>{allPrime && ready ? 'These starting Prime loadouts already have weapons, armour and any required ammunition fitted. You can learn command on the battlefield without changing a thing.'
              : 'This team uses the equipment you have fitted, including saved variants. Nothing is reset or purchased. Review the weapons below, or open the Mechlab to make changes.'}</p>
            <p className="first-drop-hint">Review the field briefing next. You can return here before deploying.</p></div>
          <div className="first-drop-allowance" data-testid="first-drop-tonnage">
            <strong>{plan.tonnage}/{plan.allowance}t</strong><span>Mission allowance</span>
            <progress aria-label="Recommended team mission tonnage" value={plan.tonnage} max={Math.max(1, plan.allowance)} />
            <small>{plan.pairs.length}/{plan.slots} deployment seats · {ready ? 'Team ready' : 'Needs attention'}</small>
          </div>
        </div>
        <div className="first-drop-team">
          {plan.pairs.map(({ mech, pilot }, index) => {
            const chassis = catalog.chassis.get(mech.design.chassisId);
            const integrity = mechIntegrity(catalog, mech);
            const valid = validateDesign(catalog, mech.design).valid;
            const weapons = [...new Set(mech.design.mounts.map(mount => mount.weaponId))];
            return <article className="first-drop-machine" key={mech.id} data-testid={`first-drop-machine-${mech.id}`}>
              <div className="first-drop-pair">
                <PilotPortrait pilot={pilot} /><div><span className="prep-eyebrow">Seat {index + 1} · {pilot.name}</span>
                  <h4>{machineDisplayName(catalog, mech.design)}</h4>
                  <p>{isPrimeEquipment(catalog, mech.design) ? 'Prime loadout' : 'Current loadout'} · {chassis?.tonnage ?? '?'}t</p>
                  <small>{chassis?.role}</small></div>
                {chassis === undefined ? null : <div className="first-drop-machine-art"><MachinePortrait chassis={chassis} /></div>}
              </div>
              <div className="first-drop-condition"><span>{valid ? 'Armed' : 'Check equipment'} · {Math.round(integrity.fraction * 100)}% intact</span>
                <progress aria-label={`${machineDisplayName(catalog, mech.design)} integrity`} value={integrity.current} max={Math.max(1, integrity.maximum)} /></div>
              <ul className="first-drop-weapons" aria-label={`${machineDisplayName(catalog, mech.design)} installed weapons`}>
                {weapons.map(id => {
                  const weapon = catalog.weapons.get(id);
                  if (weapon === undefined) return <li key={id}>Unknown weapon: {id}</li>;
                  const count = mech.design.mounts.filter(mount => mount.weaponId === id).length;
                  const tons = mech.design.ammo.filter(bin => bin.weaponId === id).reduce((total, bin) => total + bin.tons, 0);
                  return <li key={id}><WeaponGlyph catalog={catalog} weapon={weapon} /><div><strong>{count} × {weapon.name}</strong>
                    <small>{weapon.ammoPerTon === null ? 'No ammunition needed' : tons > 0 ? `${Math.floor(tons * weapon.ammoPerTon)} salvos fitted · shared across ${count} weapon${count === 1 ? '' : 's'}` : 'No ammunition fitted'}</small></div></li>;
                })}
              </ul>
              <button type="button" data-testid={`first-drop-mechlab-${mech.id}`} onClick={() => onRefit(mech.id)}>Mechlab <span>· optional</span></button>
            </article>;
          })}
        </div>
        {!ready ? <div className="first-drop-problems" role="status"><strong>Review this team before deployment.</strong><ul>{issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></div> : null}
      </div>
      <footer className="first-drop-actions">
        <div role="status">{!persistent ? 'Browser saving needs attention. Deployment checks your save before continuing.'
          : ready ? 'No purchases or refits needed for this team.' : 'Open Customise team to repair, reassign or refit.'}</div>
        <button type="button" data-testid="first-drop-customise" onClick={onCustomise}>Customise team</button>
        <button type="button" className="first-drop-primary" data-testid="first-drop-use-team" onClick={onUseTeam} disabled={!ready}
          title={ready ? 'Use these pilots and equipped mechs, then review the mission briefing.' : issues.join(' ')}>Use recommended team → field briefing</button>
      </footer>
    </section>
  </div>;
}
