import type { BattleTopbarProps } from './BattleTopbar';
import { BattleMenu } from './BattleMenu';
import { formatMissionClock, missionClockUrgency } from './missionClock';
import { useGame } from './store';
import { trainingShowsFullHud } from './trainingPresentation';

export function MobileBattleTopbar(props: BattleTopbarProps) {
  const state = useGame();
  const fullHud = trainingShowsFullHud(props.trainingStep ?? null);
  const remainingSeconds = Math.max(0, state.missionDurationSeconds - state.elapsedSeconds);
  const speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;

  return (
    <header
      className={`topbar mobile-topbar${fullHud ? '' : ' training-topbar'}`}
      data-testid="topbar"
    >
      {fullHud ? (
        <span
          className={`clock clock-${missionClockUrgency(remainingSeconds)}`}
          data-testid="clock"
          aria-label={`Mission time remaining ${formatMissionClock(remainingSeconds)}`}
        >
          {formatMissionClock(remainingSeconds)}
        </span>
      ) : (
        <span className="mission">{state.missionName}</span>
      )}
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
        <button
          type="button"
          className="pause mobile-speed"
          disabled={!state.briefingSeen}
          onClick={() => props.engine?.setSpeed(speed)}
          title="Cycle battle speed"
          data-testid="mobile-speed"
        >
          {state.speed}×
        </button>
      ) : null}
      <BattleMenu {...props} fullHud={fullHud} variant="mobile" />
    </header>
  );
}
