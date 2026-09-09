import type { ReactNode } from 'react';
import type { Pilot } from '../schema/pilot';
import { BriefingTeam } from './BriefingTeam';
import type { ObjectiveView } from './store';

export interface BriefingBerth {
  index: number;
  designValue: string;
  customLabel: string | null;
  pilotId: string;
  tonnage: number;
  pilot: Pilot | null;
  machine: { chassisId: string; name: string; identity: string; role: string; weaponCount: number } | null;
}

export interface BriefingLance {
  berths: BriefingBerth[];
  designs: { value: string; label: string }[];
  saved: { value: string; label: string }[];
  pilots: { id: string; name: string }[];
  total: number;
  allowance: number;
  onDesign: (index: number, value: string) => void;
  onPilot: (index: number, pilotId: string) => void;
  onCustomise: (index: number) => void;
}

interface BriefingProps {
  name: string;
  text: string;
  objectives: readonly ObjectiveView[];
  resourcePoints: number;
  setup?: ReactNode;
  opposition?: ReactNode;
  /** Contracts prepare their lance elsewhere, so no editor is passed here. */
  lance?: BriefingLance;
  deployDisabled?: boolean;
  deployReason?: string | null;
  training?: { onSkip: () => void };
  onDeploy: () => void;
}

export function Briefing({
  name,
  text,
  objectives,
  resourcePoints,
  setup,
  opposition,
  lance,
  deployDisabled = false,
  deployReason = null,
  training,
  onDeploy,
}: BriefingProps) {
  const over = training === undefined && lance !== undefined && lance.total > lance.allowance;
  const blocked = over || deployDisabled;
  const reason = over
    ? 'The lance is over the drop tonnage — lighten it first.'
    : deployReason ?? undefined;

  return (
    <div className="briefing" data-testid="briefing">
      <h2>{name}</h2>
      <p>{text}</p>
      <h4>Objectives</h4>
      <ul>
        {objectives.map((objective) => (
          <li key={objective.id}>
            {objective.label}
            {objective.required ? '' : ' (optional)'}
          </li>
        ))}
      </ul>

      {training === undefined ? (
        setup
      ) : (
        <p className="training-briefing-note">
          Range control has assigned the machines and marked the course. No loadout or
          contract decisions are made here.
        </p>
      )}

      {training !== undefined || lance === undefined ? null : (
        <div className="briefing-lance" data-testid="briefing-lance">
          <h4>
            Lance
            <span
              className={`briefing-tonnage${over ? ' over' : ''}`}
              data-testid="briefing-tonnage"
            >
              {lance.total}/{lance.allowance}t
            </span>
          </h4>
          <BriefingTeam lance={lance} />
        </div>
      )}

      {training === undefined ? opposition : null}
      {blocked && reason !== undefined ? <p className="setup-invalid briefing-blocked" role="status" data-testid="briefing-blocked-reason">{reason}</p> : null}

      <footer
        className={`briefing-actions${training === undefined ? '' : ' training-actions'}`}
        data-testid="briefing-actions"
      >
        {training === undefined ? (
          <p className="briefing-rp">{resourcePoints} Resource Points on the books.</p>
        ) : null}
        <button
          type="button"
          onClick={onDeploy}
          disabled={blocked}
          title={reason}
          data-testid="briefing-deploy"
        >
          {over ? 'Over tonnage' : training === undefined ? 'Deploy' : 'Begin range walk'}
        </button>
        {training === undefined ? null : (
          <button
            type="button"
            className="secondary"
            onClick={training.onSkip}
            data-testid="training-skip"
          >
            Skip to campaign
          </button>
        )}
      </footer>
    </div>
  );
}
