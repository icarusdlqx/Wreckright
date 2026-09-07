import type { DifficultyChoice } from './battleSetupState';
import type { SkirmishMapChoice } from './skirmishForces';
import { BattleCodeField } from './BattleCodeField';
import './battleSetup.css';

export interface MissionChoice {
  id: string;
  name: string;
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
  onLanceFaction: (faction: 'linewrought' | 'aurelian' | 'mixed') => void;
  maps?: readonly SkirmishMapChoice[];
  mapId?: string;
  playerDifficulty?: string;
  onPlayerDifficulty?: (tier: string) => void;
  separateEnemySetup?: boolean;
}

export function BriefingSetup(props: BriefingSetupProps) {
  const difficulty = props.difficulties.find((choice) => choice.id === props.difficultyId);

  return (
    <section className="briefing-setup" data-testid="briefing-setup">
      <h4>Battle setup</h4>
      <div className="briefing-setup-grid">
        {props.campaignMissionName === null && props.maps !== undefined ? (
          <label className="setup-field"><span>Map</span>
            <select value={props.mapId} data-testid="briefing-map-picker" onChange={(event) => {
              const map = props.maps?.find((choice) => choice.id === event.target.value);
              if (map !== undefined) props.onMission(map.missionId);
            }}>
              {props.maps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
            </select>
            <small className="setup-description" data-testid="skirmish-map-save-note">
              Each map remembers both lances, their refits and your crew experience.
            </small>
          </label>
        ) : null}
        <label className="setup-field">
          <span>{props.maps === undefined || props.campaignMissionName !== null ? 'Mission' : 'Scenario'}</span>
          {props.campaignMissionName === null ? (
            <select
              value={props.missionId}
              onChange={(event) => props.onMission(event.target.value)}
              data-testid="briefing-mission-picker"
            >
              {props.missions.map((mission) => (
                <option key={mission.id} value={mission.id}>
                  {mission.name}
                </option>
              ))}
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
            <span>Your faction</span>
            <select
              value={props.lanceFactionId}
              onChange={(event) => {
                const picked = event.target.value;
                if (picked === 'linewrought' || picked === 'aurelian' || picked === 'mixed') props.onLanceFaction(picked);
              }}
              data-testid="briefing-faction-picker"
            >
              <option value="mixed">Mixed company</option>
              <option value="linewrought">Linewrought</option>
              <option value="aurelian">Aurelian</option>
            </select>
            <small className="setup-description">
              Choosing a faction refills your berths. Individual picks below can mix both cultures.
            </small>
          </label>
        ) : null}
        {props.campaignMissionName === null && props.onPlayerDifficulty !== undefined ? (
          <label className="setup-field"><span>Your crew experience</span>
            <select value={props.playerDifficulty} data-testid="player-difficulty-picker"
              onChange={(event) => props.onPlayerDifficulty?.(event.target.value)}>
              {props.difficulties.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
            </select>
            <small className="setup-description">Green lowers crew skills; Regular keeps their profiles; Veteran and Elite raise them. You give the orders.</small>
          </label>
        ) : null}
        {props.separateEnemySetup && props.campaignMissionName === null ? null : <label className="setup-field">
          <span>Difficulty</span>
          {props.campaignMissionName !== null ? (
            <span className="setup-fixed" data-testid="briefing-difficulty-fixed">
              {difficulty?.label ?? props.difficultyId}<small>Fixed for this campaign</small>
            </span>
          ) : <select
            value={props.difficultyId}
            onChange={(event) => props.onDifficulty(event.target.value)}
            data-testid="briefing-difficulty-picker"
          >
            {props.difficulties.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>}
          <small className="setup-description" data-testid="difficulty-description">
            {difficulty?.description ?? 'Enemy behaviour follows the selected tier.'}
          </small>
        </label>}
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
      {props.campaignMissionName !== null ? (
        <span className="pause setup-contract" data-testid="campaign-difficulty-fixed"
          title="Chosen when this campaign began.">{difficulty?.label ?? props.difficultyId} campaign</span>
      ) : <select
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
      </select>}
      {props.campaignMissionName === null ? (
        <select
          className="pause"
          value={props.missionId}
          disabled={locked}
          onChange={(event) => props.onMission(event.target.value)}
          title={locked ? 'Mission is locked while the lance is deployed.' : 'Choose a skirmish mission.'}
          data-testid="mission-picker"
        >
          {props.missions.map((mission) => (
            <option key={mission.id} value={mission.id}>
              {mission.name}
            </option>
          ))}
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
