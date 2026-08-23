import { Renderer } from '../render3d/scene';
import { loadCatalog } from '../schema/load';
import { missionTickBudget } from '../schema/missionClock';
import type { World } from '../sim/types';
import { createWorld, type LanceEntry } from '../sim/world';
import { Engine } from './engineCore';
import { PerfOverlay } from './perf';
import { useGame } from './store';

export interface EngineOptions {
  missionId?: string;
  seed?: string;
  playerTeam?: number;
  playerLance?: LanceEntry[];
  /** Difficulty tier id from the rules; the sim default when absent. */
  difficulty?: string;
}

export async function createEngine(host: HTMLElement, options: EngineOptions = {}): Promise<Engine> {
  const catalog = loadCatalog();
  const missionId = options.missionId ?? 'skirmish_ridge';
  const playerTeam = options.playerTeam ?? 0;

  const world = createWorld(catalog, {
    seed: options.seed ?? 'skirmish',
    missionId,
    playerTeam,
    ...(options.playerLance === undefined ? {} : { playerLance: options.playerLance }),
    ...(options.difficulty === undefined ? {} : { difficulty: options.difficulty }),
  });

  const mission = catalog.missions.get(missionId);
  if (mission === undefined) throw new Error(`unknown mission "${missionId}"`);
  const mapData = catalog.maps.get(mission.mapId);
  if (mapData === undefined) throw new Error(`mission "${missionId}" has no map`);

  // The mission's own choice first, then the map's, then the default rig — so a
  // night raid overrides the ground it borrows without touching the map file.
  const atmosphereId = mission.atmosphereId ?? mapData.atmosphereId;
  const atmosphere = catalog.atmospheres.get(atmosphereId);
  if (atmosphere === undefined) throw new Error(`unknown atmosphere "${atmosphereId}"`);

  const renderer = new Renderer(host, world, mapData, atmosphere);
  const engine = new Engine(world, renderer, missionTickBudget(catalog, missionId));
  renderer.onFootfall = (at, tonnage, faction) => engine.audio.footfall(at, tonnage, faction);
  engine.audio.setTerrain(mapData);
  engine.audio.setAmbient(atmosphereId);
  engine.perf = new PerfOverlay(host);
  engine.onDestroy(() => engine.perf?.destroy());
  engine.attach(renderer.canvas);

  const onResize = (): void => renderer.resize();
  globalThis.addEventListener('resize', onResize);
  engine.onDestroy(() => globalThis.removeEventListener('resize', onResize));

  // Local tooling and browser playthroughs need the authoritative handle, but
  // the shipped page must not bypass its own fog-of-war presentation boundary.
  if (import.meta.env.DEV) {
    const debugGlobal = globalThis as typeof globalThis & {
      __ironline?: { engine: Engine; world: World; useGame: typeof useGame };
    };
    const handle = { engine, world, useGame };
    debugGlobal.__ironline = handle;
    engine.onDestroy(() => {
      if (debugGlobal.__ironline === handle) delete debugGlobal.__ironline;
    });
  }

  useGame.getState().patch({
    ready: true,
    playerTeam,
    missionName: mission.name,
    briefing: mission.briefing,
    briefingSeen: false,
    elapsedSeconds: 0,
    missionDurationSeconds: mission.maxDurationSeconds,
    paused: true,
    speed: 1,
    hitPreview: null,
    queueOrders: false,
    supportMode: null,
    heatTiers: catalog.rules.heat.tiers.map((tier) => tier.fraction),
  });
  engine.start();
  return engine;
}
