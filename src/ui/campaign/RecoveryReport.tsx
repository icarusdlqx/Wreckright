import type { SalvageCandidate, SalvageOutcome } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import { stripSerialDesignation } from '../designLabel';

const OUTCOME_NAMES: Record<SalvageOutcome, string> = {
  centre_torso: 'Centre torso destroyed', head: 'Head destroyed', ammo_explosion: 'Ammo explosion',
  legged: 'Both legs destroyed; side defeated', ejected: 'Pilot ejected',
};

const CONDITION_REASON: Record<SalvageOutcome, string> = {
  centre_torso: 'The destroyed core reduced the hull recovery chance.',
  head: 'The core survived the head kill, leaving a possible rebuild.',
  ammo_explosion: 'The ammunition explosion left very little recoverable hull.',
  legged: 'Immobilising the mech while preserving its core improved the recovery chance.',
  ejected: 'The pilot abandoned the machine, improving its recovery chance.',
};

export function recoveryExplanation(catalog: Catalog, candidate: SalvageCandidate): string {
  const design = catalog.designs.get(candidate.designId);
  if (candidate.chassisChance === 0) {
    return catalog.chassis.get(design?.chassisId ?? '')?.frame === 'mech'
      ? 'The contract gave no hull recovery chance. Any awarded parts are listed separately.'
      : 'This vehicle cannot be rebuilt as a company mech. Any recovered parts are listed separately.';
  }
  return `${CONDITION_REASON[candidate.outcome]} ${candidate.recovered
    ? 'Recovery succeeded; repair the battle damage before deployment.'
    : 'The recovery roll failed; no hull was added to your inventory.'}`;
}

export function RecoveryReport({ catalog, candidates }: { catalog: Catalog; candidates: readonly SalvageCandidate[] }) {
  if (candidates.length === 0) return null;
  return <div className="debrief-recovery" data-testid="debrief-recovery">
    <h4>Mechs recovered · {candidates.filter(candidate => candidate.recovered).length}</h4>
    <p>Every field result is shown. Percentages include your contract share; hulls and loose parts roll separately.</p>
    <ul>{candidates.map((candidate, index) => <li key={`${candidate.designId}-${candidate.name}-${index}`} data-testid={`debrief-recovery-${index}`}>
      <span className="recovery-name">{catalog.designs.get(candidate.designId)?.name ?? stripSerialDesignation(candidate.name || candidate.designId)}</span>
      <span className="recovery-outcome">{OUTCOME_NAMES[candidate.outcome]}</span>
      <span className="recovery-chance">{Number((candidate.chassisChance * 100).toFixed(1))}% chance</span>
      <span className={`recovery-result${candidate.recovered ? ' recovered' : ''}`}>{candidate.recovered ? 'hull recovered' : candidate.chassisChance > 0 ? 'not recovered' : 'no hull claim'}</span>
      <span className="recovery-explanation">{recoveryExplanation(catalog, candidate)}</span>
    </li>)}</ul>
  </div>;
}
