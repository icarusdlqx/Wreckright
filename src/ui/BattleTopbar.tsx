import type { DifficultyChoice } from './battleSetupState';
import type { MissionChoice } from './BattleSetup';
import { BattleMenu } from './BattleMenu';
import type { Engine } from './engine';
import { formatMissionClock, missionClockUrgency } from './missionClock';
import { MobileBattleTopbar } from './MobileBattleTopbar';
import { useGame } from './store';
import { trainingShowsFullHud } from './trainingPresentation';
import type { TrainingStep } from './trainingProgress';
import { useCompactLayout } from './useCompactLayout';
import './battleChrome.css';

export interface BattleTopbarProps {
  engine: Engine | null;
  muted: boolean;
  lowFx: boolean;
  setupMissionId: string;
  setupDifficultyId: string;
  missions: readonly MissionChoice[];
  difficulties: readonly DifficultyChoice[];
  locked: boolean;
  trainingStep?: TrainingStep | null;
  onMuted: (muted: boolean) => void;
  onLowFx: (lowFx: boolean) => void;
  onMission: (missionId: string) => void;
  onDifficulty: (difficultyId: string) => void;
  onRestart: () => void;
  onChooseMission: () => void;
}

export function BattleTopbar(props: BattleTopbarProps) {
  const state = useGame();
  const compact = useCompactLayout();
  if (compact) {
    return <MobileBattleTopbar {...props} />;
  }
  const remainingSeconds = Math.max(0, state.missionDurationSeconds - state.elapsedSeconds);
  const clockUrgency = missionClockUrgency(remainingSeconds);
  const fullHud = trainingShowsFullHud(props.trainingStep ?? null);

  return (
    <header
      className={`topbar battle-topbar${fullHud ? '' : ' training-topbar'}`}
      data-testid="topbar"
    >
      <span className="mission">{state.missionName}</span>
      {fullHud ? (
        <span
          className={`clock clock-${clockUrgency}`}
          data-testid="clock"
          title="Mission time remaining"
          aria-label={`Mission time remaining ${formatMissionClock(remainingSeconds)}`}
        >
          TIME {formatMissionClock(remainingSeconds)}
        </span>
      ) : null}
      <button
        type="button"
        className={`pause ${state.paused ? 'active' : ''}`}
        disabled={!state.briefingSeen}
        onClick={() => props.engine?.togglePause()}
        data-testid="pause-button"
      >
        {!state.briefingSeen ? 'Briefing' : state.paused ? '▶ Resume' : '❚❚ Pause'}
      </button>
      {fullHud ? (
        <span className="speed-controls" data-testid="speed-controls">
          {[1, 2, 4].map((speed) => (
            <button
              key={speed}
              type="button"
              className={`pause ${!state.paused && state.speed === speed ? 'active' : ''}`}
              disabled={!state.briefingSeen}
              onClick={() => props.engine?.setSpeed(speed)}
              title={`Run the battle at ${speed}× (, and . step speed)`}
              data-testid={`speed-${speed}`}
            >
              {speed}×
            </button>
          ))}
        </span>
      ) : null}
      <BattleMenu {...props} fullHud={fullHud} variant="desktop" />
    </header>
  );
}
