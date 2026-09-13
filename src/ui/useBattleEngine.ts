import { useEffect, type MutableRefObject, type RefObject } from 'react';
import { prepareDeployment } from '../campaign/campaign';
import { loadCampaign } from '../campaign/save';
import { campaignBattleBriefing } from './campaignBattleBriefing';
import { getCatalog } from '../schema/load';
import type { BattleSetupKey } from './battleSetupState';
import { createEngine, type Engine, type EngineOptions } from './engine';
import { lanceEntries, type SkirmishBerth } from './lance';
import { useGame } from './store';
import { battleStartsPaused } from './trainingPresentation';
import { campaignRadioFor } from './campaignRadio';

interface BattleEngineOptions {
  setup: BattleSetupKey;
  revision: number;
  nextStart: MutableRefObject<'briefing' | 'deploy'>;
  hostRef: RefObject<HTMLDivElement | null>;
  engineRef: MutableRefObject<Engine | null>;
  battleSeedRef: MutableRefObject<string>;
  onMuted: (value: boolean) => void;
  onLowFx: (value: boolean) => void;
}

export function useBattleEngine({ setup, revision, nextStart, hostRef, engineRef,
  battleSeedRef, onMuted, onLowFx }: BattleEngineOptions): void {
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    const deployOnReady = nextStart.current === 'deploy';
    nextStart.current = 'briefing';
    let options: EngineOptions = {
      missionId: setup.missionId,
      difficulty: setup.difficulty,
      seed: setup.battleCode,
    };
    let campaignRadio: ReturnType<typeof campaignRadioFor> | null = null;
    const entries = lanceEntries(
      getCatalog(),
      JSON.parse(setup.lanceKey) as SkirmishBerth[],
    );
    if (entries !== null && entries.length > 0) options = { ...options, playerLance: entries };
    if (setup.enemyLanceKey !== undefined) {
      const enemyEntries = lanceEntries(getCatalog(), JSON.parse(setup.enemyLanceKey) as SkirmishBerth[]);
      if (enemyEntries !== null) options = { ...options, enemyLance: enemyEntries, playerDifficulty: setup.playerDifficulty };
    }
    if (useGame.getState().campaignPending) {
      const saved = loadCampaign().state;
      if (saved !== null) {
        try {
          const deployment = prepareDeployment(getCatalog(), saved);
          campaignRadio = campaignRadioFor(getCatalog(), saved, deployment);
          options = {
            missionId: deployment.missionId,
            seed: deployment.seed,
            playerTeam: deployment.playerTeam,
            playerLance: deployment.entries,
            difficulty: saved.difficulty,
            presentation: campaignBattleBriefing(getCatalog(), saved),
          };
        } catch (error: unknown) {
          // Nothing fit to field. Say so and go back rather than tearing down
          // the React tree with an uncaught throw from an effect.
          useGame.getState().patch({
            campaignPending: false,
            screen: 'campaign',
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }
    }
    battleSeedRef.current = String(options.seed ?? setup.battleCode);

    let cancelled = false;
    createEngine(host, options)
      .then((engine) => {
        if (cancelled) {
          engine.destroy();
          return;
        }
        engineRef.current = engine;
        campaignRadio?.(engine.world);
        onMuted(engine.audio.muted);
        onLowFx(engine.renderer.lowFx);
        if (deployOnReady) {
          engine.audio.unlock();
          engine.renderer.camera.beginDropIn();
          useGame.getState().patch({
            briefingSeen: true,
            paused: battleStartsPaused(useGame.getState().campaignPending, setup.missionId),
          });
        }
      })
      .catch((error: unknown) => {
        useGame.getState().patch({ error: error instanceof Error ? error.message : String(error) });
      });

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [setup.missionId, setup.difficulty, setup.lanceKey, setup.enemyLanceKey,
    setup.playerDifficulty, setup.battleCode, revision, hostRef, engineRef, battleSeedRef,
    nextStart, onMuted, onLowFx]);
}
