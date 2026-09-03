import type { DifficultyChoice } from './battleSetupState';
import { BattleCodeField } from './BattleCodeField';
import './battleSetup.css';

export interface MissionChoice {
  id: string;
  name: string;
  /** Mission profile, used to group the picker; optional for callers that only name it. */
  type?: string;
  mapName?: string;
  minutes?: number;
}

const TYPE_LABELS: Record<string, string> = {
  skirmish: 'Skirmish',
  assault: 'Assault',
  defend: 'Defend',
  recon: 'Recon',
  base_capture: 'Base capture',
  escort: 'Escort',
  extraction: 'Extraction',
  ambush: 'Ambush',
  headhunt: 'Headhunt',
};

function missionOptionLabel(mission: MissionChoice): string {
  const parts = [mission.name];
  // "Skirmish — Ridge Pass · Ridge Pass" says the map twice; only add it when it is news.
  if (mission.mapName !== undefined && !mission.name.includes(mission.mapName)) parts.push(mission.mapName);
  if (mission.minutes !== undefined) parts.push(`${mission.minutes} min`);
  return parts.join(' · ');
}

/** Twenty-eight bare names in one list is a memory test; grouped by profile it is a menu. */
export function MissionOptions({ missions }: { missions: readonly MissionChoice[] }) {
  const groups = new Map<string, MissionChoice[]>();
  for (const mission of missions) {
    const key = mission.type ?? '';
    const held = groups.get(key);
    if (held === undefined) groups.set(key, [mission]);
    else held.push(mission);
  }
  if (groups.size === 1 && groups.has('')) {
    return (
      <>
        {missions.map((mission) => (
          <option key={mission.id} value={mission.id}>
            {missionOptionLabel(mission)}
          </option>
        ))}
      </>
    );
  }
  return (
    <>
      {[...groups].map(([type, entries]) => (
        <optgroup key={type || 'other'} label={TYPE_LABELS[type] ?? (type || 'Other')}>
          {entries.map((mission) => (
            <option key={mission.id} value={mission.id}>
              {missionOptionLabel(mission)}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

interface SharedSetupProps {
  missionId: string;
  difficultyId: string;
  missions: readonly MissionChoice[];
  difficulties: readonly DifficultyChoice[];
  campaignMissionName: string | null;
  onMission: (missionId: string) => void;
  onDifficulty: (difficultyId: string) => void;
}

interface BriefingSetupProps extends SharedSetupProps {
  battleCode: string;
  onBattleCode: (battleCode: string) => void;
  /** Which culture's machines fill the lance; null hides the choice. */
  lanceFactionId: 'linewrought' | 'aurelian' | 'mixed' | null;
  onLanceFaction: (faction: 'linewrought' | 'aurelian') => void;
}

export function BriefingSetup(props: BriefingSetupProps) {
  const difficulty = props.difficulties.find((choice) => choice.id === props.difficultyId);

  return (
    <section className="briefing-setup" data-testid="briefing-setup">
      <h4>Battle setup</h4>
      <div className="briefing-setup-grid">
        <label className="setup-field">
          <span>Mission</span>
          {props.campaignMissionName === null ? (
            <select
              value={props.missionId}
              onChange={(event) => props.onMission(event.target.value)}
              data-testid="briefing-mission-picker"
            >
              <MissionOptions missions={props.missions} />
            </select>
          ) : (
            <span className="setup-fixed" data-testid="briefing-mission-fixed">
              {props.campaignMissionName}
              <small>Fixed by contract</small>
            </span>
          )}
        </label>
        {props.campaignMissionName === null && props.lanceFactionId !== null ? (
          <label className="setup-field">
            <span>Company machines</span>
            <select
              value={props.lanceFactionId}
              onChange={(event) => {
                const picked = event.target.value;
                if (picked === 'linewrought' || picked === 'aurelian') props.onLanceFaction(picked);
              }}
              data-testid="briefing-faction-picker"
            >
              {props.lanceFactionId === 'mixed' ? (
                <option value="mixed">Mixed company</option>
              ) : null}
              <option value="linewrought">Linewrought</option>
              <option value="aurelian">Aurelian</option>
            </select>
            <small className="setup-description">
              Refills the berths with one culture's machines, class for class.
            </small>
          </label>
        ) : null}
        <label className="setup-field">
          <span>Difficulty</span>
          <select
            value={props.difficultyId}
            onChange={(event) => props.onDifficulty(event.target.value)}
            data-testid="briefing-difficulty-picker"
          >
            {props.difficulties.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
          <small className="setup-description" data-testid="difficulty-description">
            {difficulty?.description ?? 'Enemy behaviour follows the selected tier.'}
          </small>
        </label>
        {props.campaignMissionName === null ? (
          <BattleCodeField code={props.battleCode} onCode={props.onBattleCode} />
        ) : null}
      </div>
    </section>
  );
}

export function SetupToolbar({
  locked,
  showActions,
  onRestart,
  onChooseMission,
  ...props
}: SharedSetupProps & {
  locked: boolean;
  showActions: boolean;
  onRestart: () => void;
  onChooseMission: () => void;
}) {
  const difficulty = props.difficulties.find((choice) => choice.id === props.difficultyId);

  return (
    <>
      <select
        className="pause"
        value={props.difficultyId}
        disabled={locked}
        onChange={(event) => props.onDifficulty(event.target.value)}
        title={locked ? 'Difficulty is locked while the lance is deployed.' : difficulty?.description}
        data-testid="difficulty-picker"
      >
        {props.difficulties.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
      {props.campaignMissionName === null ? (
        <select
          className="pause"
          value={props.missionId}
          disabled={locked}
          onChange={(event) => props.onMission(event.target.value)}
          title={locked ? 'Mission is locked while the lance is deployed.' : 'Choose a skirmish mission.'}
          data-testid="mission-picker"
        >
          <MissionOptions missions={props.missions} />
        </select>
      ) : (
        <span
          className="pause setup-contract"
          title="The active contract sets the mission."
          data-testid="mission-fixed"
        >
          {props.campaignMissionName}
        </span>
      )}
      {locked ? (
        <span className="setup-locked" data-testid="setup-locked">
          {difficulty?.label ?? props.difficultyId} · locked
        </span>
      ) : null}
      {showActions ? (
        <span className="setup-run-actions">
          <button
            type="button"
            className="pause"
            onClick={onRestart}
            title="Abandon this run and restart the same battle."
            data-testid="restart-battle"
          >
            Restart
          </button>
          {props.campaignMissionName === null ? (
            <button
              type="button"
              className="pause"
              onClick={() => onChooseMission()}
              title="Abandon this run and return to battle setup."
              data-testid="choose-mission"
            >
              Choose mission
            </button>
          ) : null}
        </span>
      ) : null}
    </>
  );
}
