import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { prepareDeployment, resolveMission } from '../campaign/campaign';
import { loadCampaign, saveCampaign } from '../campaign/save';
import { getCatalog } from '../schema/load';
import { BattleHud } from './BattleHud';
import { BattleResults } from './BattleResults';
import { BattleTopbar } from './BattleTopbar';
import { Briefing } from './Briefing';
import { briefingLanceFor } from './briefingLance';
import type { Engine } from './engine';
import { lanceFaction } from './lance';
import { ObjectiveList } from './ObjectiveList';
import { createBattleOutfitBay, OutfitBayDialog } from './OutfitBayDialog';
import { BriefingSetup } from './BattleSetup';
import { difficultyChoices, type BattleSetupKey } from './battleSetupState';
import { usePlaytest } from './playtest';
import { useGame } from './store';
import { buildSupportOptions } from './supportOptions';
import { BattleCoach } from './BattleCoach';
import { TrainingCoach, useTrainingPresentation } from './TrainingCoach';
import { showTrainingGate } from './trainingCamera';
import { skipTraining, TRAINING_MISSION_ID } from './trainingProgress';
import { trainingShowsFullHud } from './trainingPresentation';
import { useBattleSetup } from './useBattleSetup';
import { useBattleEngine } from './useBattleEngine';
import { useSkirmishForces } from './useSkirmishForces';
import { EnemyForceSetup } from './EnemyForceSetup';
import { SkirmishStorageNotice } from './SkirmishStorageNotice';
import { checkBattleCode, createNewBattleCode, resultWithBattleCode } from './battleCode';
import { useStrategicScoreControls } from './StrategicScoreProvider';
import './trainingPresentation.css';

type BattleProps = Partial<Record<'onSkipTraining' | 'onTrainingComplete' | 'onTrainingContinueAnyway', () => void>>;

export function Battle(props: BattleProps = {}) {
  const { onSkipTraining, onTrainingComplete, onTrainingContinueAnyway } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const state = useGame();
  const { record } = usePlaytest();
  const strategicScore = useStrategicScoreControls();
  const battleSeedRef = useRef(state.battleCode);

  const [resolved, setResolved] = useState(false);
  const [muted, setMuted] = useState(false);
  const [lowFx, setLowFx] = useState(false);
  const missionId = useGame((game) => game.skirmishMissionId);
  const skirmishDifficulty = useGame((game) => game.difficulty);
  const [campaignDifficulty] = useState(() => state.campaignPending ? loadCampaign().state?.difficulty : null);
  const difficulty = campaignDifficulty ?? skirmishDifficulty;
  const [battleCodeDraft, setBattleCodeDraft] = useState(state.battleCode);
  const battleCodeCheck = checkBattleCode(battleCodeDraft);

  useEffect(() => setBattleCodeDraft(state.battleCode), [state.battleCode]);

  const catalog = getCatalog();
  const missions = useMemo(
    () =>
      [...catalog.missions.values()]
        .sort((left, right) =>
          left.id === TRAINING_MISSION_ID ? -1 : right.id === TRAINING_MISSION_ID ? 1 : 0,
        )
        .map((mission) => ({ id: mission.id, name: mission.name })),
    [catalog],
  );
  const difficulties = useMemo(() => difficultyChoices(catalog.rules.difficulty), [catalog]);
  const forces = useSkirmishForces(catalog, missionId);
  const lance = forces.friendly;
  const setLance = forces.setFriendly;
  const lanceKey = forces.friendlyKey;
  const enemyLanceKey = state.campaignPending || missionId === TRAINING_MISSION_ID ? undefined : forces.enemyKey;
  const playerDifficulty = state.campaignPending || missionId === TRAINING_MISSION_ID ? undefined : forces.playerDifficulty;
  const draftSetup = useMemo<BattleSetupKey>(
    () => ({ missionId, difficulty, lanceKey, enemyLanceKey, playerDifficulty, battleCode: state.battleCode }),
    [missionId, difficulty, lanceKey, enemyLanceKey, playerDifficulty, state.battleCode],
  );
  const setup = useBattleSetup({
    draft: draftSetup,
    briefingSeen: state.briefingSeen,
    finished: state.finished,
    campaignPending: state.campaignPending,
    patch: state.patch,
  });
  const [outfitting, setOutfitting] = useState<{ index: number; side: 'player' | 'enemy' } | null>(null);
  const closeOutfitBay = useCallback(() => setOutfitting(null), []);
  const openOutfitBay = (index: number, side: 'player' | 'enemy' = 'player'): void => {
    engineRef.current?.audio.unlock();
    setOutfitting({ index, side });
  };
  const activeTraining = !state.campaignPending && missionId === TRAINING_MISSION_ID;
  const training = useTrainingPresentation({
    active: activeTraining,
    onSkip: onSkipTraining,
    onComplete: onTrainingComplete,
    onContinueAnyway: onTrainingContinueAnyway,
    onFallback: () => {
      strategicScore.prepare();
      state.patch({ campaignPending: false, screen: 'campaign' });
    },
  });

  useBattleEngine({ setup: setup.engine, revision: setup.revision, nextStart: setup.nextStart,
    hostRef, engineRef, battleSeedRef, onMuted: setMuted, onLowFx: setLowFx });

  const restartBattle = (): void => {
    setup.restart();
    setResolved(false);
  };

  const newField = (): void => {
    setup.newField(createNewBattleCode(setup.engine.battleCode));
    setResolved(false);
  };

  const chooseMission = (nextMissionId = setup.engine.missionId): void => {
    if (setup.engine.missionId === TRAINING_MISSION_ID && nextMissionId !== TRAINING_MISSION_ID) {
      skipTraining();
      record({ name: 'training_skipped' });
    }
    setup.chooseMission(nextMissionId);
    setResolved(false);
  };

  const selectMission = (nextMissionId: string): void => {
    if (missionId === TRAINING_MISSION_ID && nextMissionId !== TRAINING_MISSION_ID) {
      skipTraining();
      record({ name: 'training_skipped' });
    }
    setup.selectMission(nextMissionId);
  };

  const onReturnToCampaign = (): void => {
    const engine = engineRef.current;
    if (engine !== null && !resolved) {
      const catalog = getCatalog();
      const saved = loadCampaign().state;
      if (saved !== null) {
        const deployment = prepareDeployment(catalog, saved);
        resolveMission(
          catalog,
          saved,
          resultWithBattleCode(engine.result(), battleSeedRef.current),
          deployment.lance,
        );
        saveCampaign(saved);
      }
      setResolved(true);
      return;
    }
    strategicScore.prepare();
    state.patch({ campaignPending: false, screen: 'campaign' });
  };

  const briefingLance = state.campaignPending || activeTraining
    ? null
    : briefingLanceFor(catalog, missionId, lance, setLance, openOutfitBay, playerDifficulty);
  const outfittingEnemy = outfitting?.side === 'enemy';
  const outfitBay = createBattleOutfitBay(catalog, outfittingEnemy ? forces.enemy : lance,
    outfitting?.index ?? null, outfittingEnemy ? forces.setEnemy : setLance, closeOutfitBay, outfitting?.side);
  const skirmishIssue = state.campaignPending || activeTraining ? null : forces.issue;
  const deployIssue = skirmishIssue ?? (battleCodeCheck.ok ? null : battleCodeCheck.reason);
  const outfitAudio = engineRef.current?.audio ?? null;

  const supportOptions = useMemo(
    () => buildSupportOptions(catalog.rules.support, state.reservesLeft),
    [catalog.rules.support, state.reservesLeft],
  );
  const battleResult =
    state.finished && engineRef.current !== null
      ? resultWithBattleCode(engineRef.current.result(), battleSeedRef.current)
      : null;

  return (
    <div className="app" inert={state.outcomePending}>
      <div className="viewport" ref={hostRef} data-testid="viewport" />

      {state.marquee === null ? null : (
        <div
          className="marquee"
          data-testid="marquee"
          style={{
            left: state.marquee.x,
            top: state.marquee.y,
            width: state.marquee.width,
            height: state.marquee.height,
          }}
        />
      )}

      <BattleTopbar
        engine={engineRef.current}
        muted={muted}
        lowFx={lowFx}
        setupMissionId={setup.engine.missionId}
        setupDifficultyId={setup.engine.difficulty}
        missions={missions}
        difficulties={difficulties}
        locked={setup.locked}
        trainingStep={training.presentedStep}
        onMuted={setMuted}
        onLowFx={setLowFx}
        onMission={selectMission}
        onDifficulty={setup.selectDifficulty}
        onRestart={restartBattle}
        onChooseMission={chooseMission}
      />

      {!state.briefingSeen && state.briefing !== '' && !state.finished ? (
        <Briefing
          name={state.missionName}
          text={state.briefing}
          objectives={state.objectives}
          resourcePoints={state.resourcePoints}
          setup={
            <>
            {state.campaignPending || activeTraining ? null : <SkirmishStorageNotice
              rosters={forces.unsavedRosters} revision={forces.saveFailureRevision} />}
            <BriefingSetup
              missionId={setup.engine.missionId}
              difficultyId={setup.engine.difficulty}
              battleCode={battleCodeDraft}
              missions={missions}
              difficulties={difficulties}
              campaignMissionName={state.campaignPending ? state.missionName : null}
              lanceFactionId={activeTraining ? null : lanceFaction(catalog, lance) ?? 'mixed'}
              onLanceFaction={(faction) => forces.setFaction('player', faction)}
              maps={forces.maps} mapId={forces.mapId}
              playerDifficulty={forces.playerDifficulty} onPlayerDifficulty={forces.setPlayerDifficulty}
              separateEnemySetup={!activeTraining}
              onMission={selectMission}
              onDifficulty={setup.selectDifficulty}
              onBattleCode={setBattleCodeDraft}
            />
            </>
          }
          {...(briefingLance === null ? {} : { lance: briefingLance })}
          opposition={state.campaignPending || activeTraining ? null : <EnemyForceSetup catalog={catalog}
            missionId={missionId} lance={forces.enemy} difficultyId={difficulty} difficulties={difficulties}
            onDifficulty={setup.selectDifficulty} onLance={forces.setEnemy}
            onFaction={(faction) => forces.setFaction('enemy', faction)} onCustomise={(index) => openOutfitBay(index, 'enemy')} />}
          {...(activeTraining ? { training: { onSkip: training.skip } } : {})}
          deployDisabled={!state.campaignPending && !activeTraining && deployIssue !== null}
          deployReason={state.campaignPending || activeTraining ? null : deployIssue}
          onDeploy={() => {
            if (!state.campaignPending && !activeTraining && deployIssue !== null) return;
            if (activeTraining) record({ name: 'training_deployed' });
            const battleCode = state.campaignPending || activeTraining
              ? setup.engine.battleCode
              : battleCodeCheck.ok
                ? battleCodeCheck.code
                : setup.engine.battleCode;
            if (!state.campaignPending && !activeTraining) state.patch({ battleCode });
            setup.deploy({ ...setup.engine, battleCode });
          }}
        />
      ) : null}

      {outfitBay === null || outfitAudio === null ? null : (
        <OutfitBayDialog
          bay={outfitBay}
          battleAudio={outfitAudio}
          onMuted={setMuted}
          onClose={closeOutfitBay}
        />
      )}

      {state.briefingSeen && trainingShowsFullHud(training.presentedStep) ? (
        <ObjectiveList objectives={state.objectives} zones={state.zones} />
      ) : null}
      {state.briefingSeen && !state.campaignPending ? (
        activeTraining ? (
          <TrainingCoach active step={training.step} onStep={training.onStep}
            onShowGate={() => showTrainingGate(engineRef.current)} />
        ) : (
          <BattleCoach missionId={missionId} />
        )
      ) : null}

      {state.briefingSeen && state.paused && !state.finished ? (
        <div className="paused-banner" data-testid="paused-banner">
          PAUSED — orders still accepted
        </div>
      ) : null}

      {battleResult === null ? null : (
        <BattleResults
          result={battleResult}
          playerTeam={state.playerTeam}
          missionName={state.missionName}
          campaignPending={state.campaignPending}
          campaignResolved={resolved}
          missions={[...catalog.missions.values()].map((mission) => ({
            id: mission.id,
            name: mission.name,
          }))}
          selectedMissionId={missionId}
          onSameField={restartBattle}
          onNewField={newField}
          onChooseMission={chooseMission}
          onReturnToCampaign={onReturnToCampaign}
          {...(activeTraining
            ? {
                trainingActions: {
                  onStartCampaign: () => {
                    strategicScore.prepare();
                    training.complete();
                  },
                  onReplay: restartBattle,
                  onRetry: restartBattle,
                  onContinueAnyway: training.continueAnyway,
                },
              }
            : {})}
        />
      )}

      {state.error !== null ? (
        <div className="error" data-testid="error">
          {state.error}
        </div>
      ) : null}

      {state.briefingSeen ? (
        <BattleHud
          engine={engineRef.current}
          supportOptions={supportOptions}
          trainingStep={training.presentedStep}
        />
      ) : null}
    </div>
  );
}
