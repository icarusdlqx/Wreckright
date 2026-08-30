import type { BattleTopbarProps } from './BattleTopbar';
import { SetupToolbar } from './BattleSetup';
import { usePlaytest } from './playtest';
import { useGame } from './store';
import { useStrategicScoreControls } from './StrategicScoreProvider';

interface BattleMenuProps extends BattleTopbarProps {
  fullHud: boolean;
  variant: 'desktop' | 'mobile';
}

/** Secondary battle chrome stays available without competing with the field. */
export function BattleMenu({ fullHud, variant, ...props }: BattleMenuProps) {
  const state = useGame();
  const { openFeedback } = usePlaytest();
  const score = useStrategicScoreControls();
  const mobile = variant === 'mobile';
  const lockedTitle = state.campaignPending
    ? 'The lance is in the field — resolve the contract first.'
    : 'The lance is in the field — choose a mission to leave this run.';
  const prefix = mobile ? 'mobile' : 'desktop';

  return (
    <details
      className={`battle-menu ${prefix}-battle-menu`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.currentTarget.open = false;
        (event.currentTarget.firstElementChild as HTMLElement | null)?.focus();
        event.stopPropagation();
      }}
    >
      <summary
        className={mobile ? undefined : 'pause'}
        aria-label="Open battle menu"
        data-testid={`${prefix}-menu-toggle`}
      >
        Menu
      </summary>
      <div
        className={`battle-menu-sheet ${mobile ? 'mobile-menu-sheet' : 'desktop-menu-sheet'}`}
        data-testid={`${prefix}-menu-sheet`}
      >
        <strong className="battle-menu-title">{state.missionName}</strong>
        <div className={`battle-menu-buttons${mobile ? ' mobile-menu-buttons' : ''}`}>
          <button
            type="button"
            className="pause"
            onClick={() => props.onMuted(props.engine?.audio.toggleMuted() ?? false)}
            title={props.muted ? 'Sound is off' : 'Sound is on'}
            data-testid="mute-button"
          >
            {props.muted ? 'Sound off' : 'Sound on'}
          </button>
          <button
            type="button"
            className={`pause ${props.lowFx ? 'active' : ''}`}
            onClick={() => props.onLowFx(props.engine?.toggleLowFx() ?? false)}
            title={
              props.lowFx
                ? 'Low graphics: shadows off, resolution down. Click for full.'
                : 'Full graphics. Click to drop shadows and resolution if the game stutters.'
            }
            data-testid="fx-toggle"
          >
            {props.lowFx ? 'FX low' : 'FX full'}
          </button>
          {fullHud ? (
            <>
              <button
                type="button"
                className="pause"
                disabled={props.locked}
                title={props.locked ? lockedTitle : ''}
                onClick={() => {
                  score.prepare();
                  state.patch({ screen: 'mechbay' });
                }}
                data-testid="open-mechbay"
              >
                Mechbay
              </button>
              <button
                type="button"
                className="pause"
                disabled={props.locked}
                title={props.locked ? lockedTitle : ''}
                onClick={() => {
                  score.prepare();
                  state.patch({ screen: 'campaign' });
                }}
                data-testid="open-campaign"
              >
                Campaign
              </button>
            </>
          ) : null}
        </div>
        {fullHud ? (
          <>
            <div className="battle-menu-setup">
              <SetupToolbar
                missionId={props.setupMissionId}
                difficultyId={props.setupDifficultyId}
                missions={props.missions}
                difficulties={props.difficulties}
                campaignMissionName={state.campaignPending ? state.missionName : null}
                locked={props.locked}
                showActions={props.locked && !state.finished}
                onMission={props.onMission}
                onDifficulty={props.onDifficulty}
                onRestart={props.onRestart}
                onChooseMission={props.onChooseMission}
              />
            </div>
            <button
              type="button"
              className="pause feedback-link"
              onClick={openFeedback}
              title="Something broken, unfair, or missing? Tell the builders."
              data-testid="feedback-link"
            >
              Feedback
            </button>
            <section className="battle-menu-help" aria-label="Battle controls">
              <strong>Controls</strong>
              <p>
                Space pauses · , and . change speed · right-click moves · Shift queues · click a
                hostile to attack
              </p>
              <p>Drag selects · arrows pan · wheel zooms · Centre recentres · P shows performance</p>
            </section>
          </>
        ) : null}
      </div>
    </details>
  );
}
