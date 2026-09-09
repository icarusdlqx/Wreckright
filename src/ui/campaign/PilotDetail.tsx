import {
  availableXp,
  chooseTrait,
  hireCost,
  hirePilot,
  offeredTraits,
  pendingTraitPicks,
  raiseSkill,
  skillTotal,
  SKILLS,
  type Skill,
} from '../../campaign/roster';
import { isPilotAvailable, type CampaignState, type PilotRecord } from '../../campaign/types';
import { getCatalog } from '../../schema/load';
import type { Pilot } from '../../schema/pilot';
import {
  nextSpecialityThreshold,
  skillTraining,
  traitEffects,
} from '../pilotProgression';
import { assignWithReceipt, occupiedSeatLabel } from './companyLabels';
import { PilotProfile } from '../PilotProfile';
import { PilotStats } from '../PilotStats';
import { PilotAbilityReadout } from '../PilotAbilityReadout';
import './progression.css';

const catalog = getCatalog();

interface Props {
  state: CampaignState;
  mutate: (change: (draft: CampaignState) => string | null | void, message?: string) => void;
}

function credits(value: number): string {
  return `${Math.round(value).toLocaleString('en-GB')} C`;
}

function TraitReadout({ traitId }: { traitId: string }) {
  const trait = catalog.rules.pilotTraits.entries[traitId];
  if (trait === undefined) return <small>{traitId}</small>;
  return (
    <small className="pilot-trait" title={trait.note}>
      <strong>{trait.label}</strong>
      <span>{traitEffects(trait).join(' · ')}</span>
    </small>
  );
}

function SpecialityProgress({ pilot, mutate }: { pilot: PilotRecord; mutate: Props['mutate'] }) {
  if (pilot.dead) return <p className="pilot-milestone">Record closed.</p>;
  const offered = offeredTraits(catalog, pilot);
  if (offered.length === 0) {
    return <p className="pilot-milestone">No further specialities available.</p>;
  }
  const pending = pendingTraitPicks(catalog, pilot);
  if (pending > 0) {
    return (
      <div className="pilot-picks" data-testid={`camp-pick-${pilot.id}`}>
        <p>Speciality earned. Choose one:</p>
        {offered.map((traitId) => {
          const trait = catalog.rules.pilotTraits.entries[traitId];
          if (trait === undefined) return null;
          return (
            <button
              type="button"
              key={traitId}
              title={trait.note}
              onClick={() =>
                mutate((draft) => {
                  const target = draft.pilots.find((entry) => entry.id === pilot.id);
                  if (target === undefined) return null;
                  const result = chooseTrait(catalog, target, traitId);
                  return result.ok
                    ? `${target.name} trained ${trait.label}: ${traitEffects(trait).join(', ')}.`
                    : result.reason;
                })
              }
              data-testid={`camp-pick-${pilot.id}-${traitId}`}
            >
              <strong>{trait.label}</strong>
              <small>{traitEffects(trait).join(' · ')}</small>
            </button>
          );
        })}
      </div>
    );
  }

  const threshold = nextSpecialityThreshold(catalog, pilot);
  if (threshold === null) return <p className="pilot-milestone">Speciality track complete.</p>;
  const levels = threshold - skillTotal(pilot);
  return (
    <p className="pilot-milestone">
      Next speciality at {threshold} total skill — {levels} level{levels === 1 ? '' : 's'} to go.
    </p>
  );
}

function TrainingButton({ pilot, skill, mutate }: { pilot: PilotRecord; skill: Skill; mutate: Props['mutate'] }) {
  const training = skillTraining(catalog, pilot, skill);
  const bank = availableXp(pilot);
  const disabled = pilot.dead || training.cost === null || bank < training.cost;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        mutate((draft) => {
          const target = draft.pilots.find((entry) => entry.id === pilot.id);
          if (target === undefined) return null;
          const result = raiseSkill(catalog, target, skill);
          return result.ok
            ? `${target.name}: ${skill} ${target[skill]}. ${training.nextEffect ?? ''} ${availableXp(target)} XP remains.`
            : result.reason;
        })
      }
      data-testid={`camp-skill-${pilot.id}-${skill}`}
    >
      <span>
        {skill} {training.currentLevel}/5
        {training.nextLevel === null ? ' — maximum' : ` → ${training.nextLevel}/5`}
      </span>
      <small>
        {training.nextEffect === null
          ? training.currentEffect
          : `${training.currentEffect} → ${training.nextEffect}`}
      </small>
      <b>{training.cost === null ? '—' : `${training.cost} XP`}</b>
    </button>
  );
}

export function PilotDetail({ pilot, state, mutate }: { pilot: PilotRecord; state: CampaignState; mutate: Props['mutate'] }) {
  const lastMission = [...state.history].reverse().flatMap((outcome) => outcome.pilotReports).find((report) => report.pilotId === pilot.id);
  return (
    <section className="pilot-card crew-selected-detail" data-testid={`camp-pilot-detail-${pilot.id}`}>
      <header title={pilot.bio}>
        <span>Crew record</span>
        <span className="pilot-state">
          {pilot.dead
            ? 'KIA'
            : `${availableXp(pilot)} XP banked${isPilotAvailable(state, pilot) ? '' : (pilot.recoveryMissions ?? 0) > 0 ? ' · misses next mission' : ` · injured to day ${pilot.injuredUntilDay}`}`}
        </span>
      </header>
      <PilotProfile pilot={pilot} prominent />
      <div className="pilot-record-capabilities"><PilotStats catalog={catalog} pilot={pilot} showEffects={false} />
        <PilotAbilityReadout catalog={catalog} pilot={pilot} /></div>
      {lastMission === undefined ? null : <p className="pilot-last-mission">
        Last mission: +{lastMission.xp} XP · {lastMission.kills} kills · {lastMission.damage} damage
      </p>}

      {lastMission?.serviceNotes?.map((note) => <p key={note} className="pilot-service-note">{note}</p>)}

      {pilot.traits.length === 0 ? null : (
        <div className="pilot-traits">
          {pilot.traits.map((traitId) => <TraitReadout key={traitId} traitId={traitId} />)}
        </div>
      )}

      <label className="pilot-seat">
        Assigned mech
        <select
          className="pilot-mech"
          disabled={pilot.dead}
          value={pilot.mechId ?? ''}
          onChange={(event) =>
            mutate((draft) => {
              return assignWithReceipt(catalog, draft, pilot.id, event.target.value === '' ? null : event.target.value);
            })
          }
          data-testid={`camp-seat-${pilot.id}`}
        >
          <option value="">— no mech —</option>
          {state.mechs.map((mech) => (
            <option key={mech.id} value={mech.id}>
              {occupiedSeatLabel(catalog, state, mech)}
            </option>
          ))}
        </select>
      </label>

      {pilot.dead ? null : (
        <div className="pilot-training">
          {SKILLS.map((skill) => (
            <TrainingButton key={skill} pilot={pilot} skill={skill} mutate={mutate} />
          ))}
        </div>
      )}
      <SpecialityProgress pilot={pilot} mutate={mutate} />
    </section>
  );
}

export function HireRow({ hire, state, mutate }: { hire: Pilot; state: CampaignState; mutate: Props['mutate'] }) {
  const cost = hireCost(catalog, hire);
  const salary = catalog.rules.economy.pilot.salaryPerDay;
  return (
    <li key={hire.id} title={hire.bio} data-testid={`camp-hire-${hire.id}`}>
      <PilotProfile pilot={hire} />
      <div className="pilot-traits">{hire.traits.map((traitId) => <TraitReadout key={traitId} traitId={traitId} />)}</div>
      <span className="pilot-state">{credits(cost)} · {credits(salary)}/day</span>
      <button
        type="button"
        disabled={state.cbills < cost}
        onClick={() =>
          mutate((draft) => {
            const result = hirePilot(catalog, draft, hire.id);
            return result.ok ? `${hire.name} signed. Payroll rises by ${credits(salary)} a day.` : result.reason;
          })
        }
        data-testid={`camp-sign-${hire.id}`}
      >
        Sign
      </button>
    </li>
  );
}
