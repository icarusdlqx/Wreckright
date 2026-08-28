import { loadCatalog } from '../schema/load';
import { missionTickBudget } from '../schema/missionClock';
import type { World } from '../sim/types';
import { createWorld, type LanceEntry } from '../sim/world';
import { Engine } from './engineCore';
import { IncomingFireDirections } from './incomingFireDirections';
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

  const mission = world.mission;
  const mapData = catalog.maps.get(mission.mapId);
  if (mapData === undefined) throw new Error(`mission "${missionId}" has no map`);

  // three.js and every model that depends on it arrive here rather than in the
  // entry chunk: the home screen, the briefing and the campaign map all paint
  // before anyone asks for a battlefield.
  const { Renderer } = await import('../render3d/scene');
  const renderer = new Renderer(host, world, mapData, world.atmosphere);
  const incomingFire = new IncomingFireDirections(
    host,
    (entity) => renderer.screenBodyOf(entity),
    (entity, out) => renderer.camera.screenDirection(entity.pos, renderer.viewport, out),
    () => renderer.viewport,
  );
  const engine = new Engine(world, renderer, missionTickBudget(catalog, missionId), incomingFire);
  engine.onDestroy(() => incomingFire.destroy());
  renderer.onContextLost = () => {
    engine.halt();
    useGame.getState().patch({
      paused: true,
      error:
        'The graphics context was lost, so the battlefield has stopped drawing. Reload the page to return to the drop.',
    });
  };
  renderer.onFootfall = (at, tonnage, faction) => engine.audio.footfall(at, tonnage, faction);
  engine.audio.setTerrain(mapData);
  engine.audio.setAmbient(world.atmosphere.id);
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
      __wreckright?: { engine: Engine; world: World; useGame: typeof useGame };
    };
    const handle = { engine, world, useGame };
    debugGlobal.__wreckright = handle;
    engine.onDestroy(() => {
      if (debugGlobal.__wreckright === handle) delete debugGlobal.__wreckright;
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
