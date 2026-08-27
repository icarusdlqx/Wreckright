import { describe, expect, it } from 'vitest';
import { battleRemountState, useGame } from './store';

describe('battle entry', () => {
  it('starts at the front door before constructing a field', () => {
    expect(useGame.getState()).toMatchObject({ screen: 'home', ready: false });
  });

  it('clears transient field state while preserving player preferences', () => {
    useGame.getState().patch({
      screen: 'campaign',
      ready: true,
      error: 'old error',
      paused: false,
      speed: 4,
      tick: 900,
      finished: true,
      outcomePending: true,
      winner: 1,
      selection: [7],
      controlGroups: { 1: [7] },
      orderMode: 'attack',
      queueOrders: true,
      formationPreset: 'wedge',
      calledShotLocation: 'head',
      units: [{ id: 7 } as never],
      enemies: [{ id: 8 } as never],
      log: ['old field'],
      missionName: 'Old field',
      briefing: 'Old briefing',
      briefingSeen: true,
      missionStatus: 'failure',
      missionReason: 'old result',
      supportMode: 'air_strike',
      supportNotice: 'old support warning',
      marquee: { x: 1, y: 2, width: 3, height: 4 },
    });

    useGame.getState().enterBattle({
      missionId: 'training_ground',
      battleCode: 'skirmish',
      campaignPending: false,
    });

    expect(useGame.getState()).toMatchObject({
      screen: 'battle',
      campaignPending: false,
      ready: false,
      error: null,
      paused: true,
      speed: 1,
      tick: 0,
      finished: false,
      outcomePending: false,
      winner: null,
      selection: [],
      controlGroups: {},
      orderMode: null,
      queueOrders: false,
      formationPreset: 'wedge',
      calledShotLocation: null,
      units: [],
      enemies: [],
      log: [],
      skirmishMissionId: 'training_ground',
      battleCode: 'skirmish',
      missionName: '',
      briefing: '',
      briefingSeen: false,
      missionStatus: 'active',
      missionReason: null,
      supportMode: null,
      supportNotice: null,
      marquee: null,
    });
  });

  it('gives every same-screen field remount an empty event ledger', () => {
    useGame.getState().patch({ log: ['old mission event'], selection: [7], ready: true });
    useGame.getState().patch(battleRemountState());
    expect(useGame.getState()).toMatchObject({ log: [], selection: [], ready: false });
  });

  it('keeps queued routing only while a route command can consume it', () => {
    useGame.getState().patch({ queueOrders: true });
    useGame.getState().setOrderMode('move');
    expect(useGame.getState().queueOrders).toBe(true);

    useGame.getState().setOrderMode('attack');
    expect(useGame.getState().queueOrders).toBe(false);

    useGame.getState().patch({ queueOrders: true });
    useGame.getState().setSupportMode('sensor_probe');
    expect(useGame.getState()).toMatchObject({ orderMode: null, queueOrders: false });
  });
});
