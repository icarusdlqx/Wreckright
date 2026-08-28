import { create } from 'zustand';
import type { MechLocation } from '../schema/common';
import type { SupportCallId } from '../sim/support';
import type { EntityId } from '../sim/types';
import type { FormationPreset } from './formationPreset';
import { initialBattleCode } from './battleCode';
import { initialSkirmishMission } from './trainingProgress';

export type OrderMode = 'move' | 'run' | 'attack' | 'attack_move' | 'called_shot' | 'jump' | null;

export interface ObjectiveView {
  id: string;
  label: string;
  required: boolean;
  status: string;
  progress: number;
  sustained?: boolean;
  stopped?: { stopped: number; total: number };
}

export interface ZoneView {
  id: string;
  name: string;
  owner: number | null;
  contender: number | null;
  progress: number;
  captureSeconds: number;
  contested: boolean;
}

export interface WeaponSnapshot {
  index: number;
  name: string;
  group: number;
  cooldown: number;
  cooldownMax: number;
  destroyed: boolean;
  rounds: number | null;
  shortRange: number;
  longRange: number;
  /** Where the weapon is bolted, so a lost arm explains a silent gun. */
  location: MechLocation;
}

export interface TimedActionSnapshot {
  label: string;
  note: string;
  ready: boolean;
  activeRemaining: number;
  cooldownRemaining: number;
}

export interface StabilitySnapshot {
  value: number;
  staggerAt: number;
  knockdownAt: number;
  footingRemaining: number;
}

export type HeatBandTone = 'ok' | 'warn' | 'danger' | 'critical';

export interface ReactorSnapshot {
  /** Heat carried if every live gun bears throughout the next available alpha window. */
  alphaHeat: number;
  projectedFraction: number;
  projectedBand: string;
  projectedTone: HeatBandTone;
  governorHoldAt: number;
  governorResumeAt: number;
  /** Groups the pilot asked for but the governor has taken out of the firing plan. */
  shedGroups: number[];
}

export interface LocationSnapshot {
  armour: number;
  armourMax: number;
  hasRearArmourFace: boolean;
  rearArmour: number;
  rearArmourMax: number;
  internal: number;
  internalMax: number;
  destroyed: boolean;
}

export interface UnitSnapshot {
  id: EntityId;
  team: number;
  name: string;
  pilotName: string;
  /** What the pilot brings, so their skills are visible where the mech is. */
  pilotSkills: { gunnery: number; piloting: number; sensors: number };
  pilotTraits: string[];
  tonnage: number;
  alive: boolean;
  destroyed: boolean;
  killMethod: string | null;
  heat: number;
  heatCapacity: number;
  shutdownRemaining: number;
  /** Seconds left on the ground; zero means upright. */
  downRemaining: number;
  /** Rocking but still standing — the next heavy hit is the one that floors it. */
  staggered: boolean;
  motion: string;
  /** Presentation-gated identity for selection highlights; null outside optical sight. */
  targetId: EntityId | null;
  targetName: string | null;
  /** Metres to whatever this mech is shooting at, so ranges mean something. */
  targetRange: number | null;
  /** How far away this mech is from the player's nearest machine. */
  rangeToLance: number | null;
  /** Which structural locations have been shot off. */
  lostLocations: MechLocation[];
  locations: Record<MechLocation, LocationSnapshot>;
  weapons: WeaponSnapshot[];
  groupEnabled: boolean[];
  holdingFire: boolean;
  heatSafety: boolean;
  ability: TimedActionSnapshot;
  alpha: TimedActionSnapshot;
  stability: StabilitySnapshot;
  reactor: ReactorSnapshot;
  hasMoveOrder: boolean;
  /** A player-issued standing target order, distinct from automatic fire control. */
  hasAttackOrder: boolean;
  /** How far the jets can throw this mech; 0 when it has none. */
  jumpRange: number;
  /** Seconds until the jets recharge, 0 when they are ready. */
  jumpCooldown: number;
  canJump: boolean;
  /** The standing order this mech is following between orders. */
  posture: string;
  /**
   * False for a hostile the lance holds on sensors but cannot name yet. A
   * return on a scope is not the same as knowing what is walking at you.
   */
  identified: boolean;
  /** Current electronic reach after weather and active pilot effects. */
  sensorRange: number;
  /** Current optical base after weather, before terrain and elevation. */
  sightRange: number;
  /** How readily electronic sensors can acquire this machine. */
  signature: number;
  /** Authored chassis trade-offs, shown only for a friendly machine. */
  chassisTraits: { label: string; note: string }[];
  role: string;
  frameClass: string;
  chassisSummary: string;
}

/** A sensor return deliberately contains no entity, pilot, loadout, or damage state. */
export interface ContactSnapshot {
  id: EntityId;
  team: number;
  label: string;
  /** Quantized by the simulation before it crosses the presentation boundary. */
  position: { x: number; y: number };
  /** Rounded from the coarse position, never from the hidden entity. */
  approximateRange: number | null;
  /** False is a frozen last-known report inside the authored memory window. */
  current: boolean;
  source: 'sensor';
}

export type Screen = 'home' | 'battle' | 'mechbay' | 'campaign';

export interface BattleEntry {
  missionId?: string;
  battleCode?: string;
  campaignPending?: boolean;
}

/**
 * The to-hit readout for the primary selected mech, refreshed with the HUD.
 * `hover` says whether it is priced against the hull under the cursor or the
 * mech's standing target, so the panel can say which question it is answering.
 */
export interface HitPreviewView {
  shooterId: EntityId;
  targetId: EntityId;
  targetName: string;
  range: number;
  hover: boolean;
  /** Chance per weapon, keyed by the mount index the weapon rows carry. */
  weapons: { index: number; chance: number | null; blocked: string | null }[];
  factors: { id: string; label: string; value: number }[];
}

/**
 * The AI strength the player picked, kept across sessions. First launches
 * start on green: a stranger's opening battle decides whether there is a
 * second one, and the picker is right there for anyone who wants more.
 */
export function readDifficulty(): string {
  try {
    return localStorage.getItem('ironline.difficulty') ?? 'green';
  } catch {
    return 'green';
  }
}

export function storeDifficulty(tier: string): void {
  try {
    localStorage.setItem('ironline.difficulty', tier);
  } catch {
    // Private browsing: the choice lasts for the session only.
  }
}

export interface GameState {
  screen: Screen;
  campaignPending: boolean;
  ready: boolean;
  error: string | null;
  paused: boolean;
  /** Simulation rate as a multiple of real time. Pause is a separate flag. */
  speed: number;
  tick: number;
  elapsedSeconds: number;
  missionDurationSeconds: number;
  finished: boolean;
  outcomePending: boolean;
  winner: number | null;
  playerTeam: number;
  heatTiers: number[];
  selection: EntityId[];
  /** Lance elements the player has bound to the number keys. */
  controlGroups: Record<number, EntityId[]>;
  orderMode: OrderMode;
  /** A phone has no Shift key, so route-building persists across successive taps. */
  queueOrders: boolean;
  formationPreset: FormationPreset;
  calledShotLocation: MechLocation | null;
  units: UnitSnapshot[];
  enemies: UnitSnapshot[];
  contacts: ContactSnapshot[];
  log: string[];

  skirmishMissionId: string;
  battleCode: string;
  difficulty: string;
  missionName: string;
  briefing: string;
  briefingSeen: boolean;
  resourcePoints: number;
  objectives: ObjectiveView[];
  zones: ZoneView[];
  missionStatus: 'active' | 'success' | 'failure';
  missionReason: string | null;
  supportMode: SupportCallId | null;
  supportNotice: string | null;
  reservesLeft: number;
  /** The drag-select box in screen pixels, while one is open. */
  marquee: { x: number; y: number; width: number; height: number } | null;
  /** To-hit readout for the primary selection, or null with nothing to price. */
  hitPreview: HitPreviewView | null;
}

export interface GameActions {
  enterBattle: (entry?: BattleEntry) => void;
  setSelection: (ids: EntityId[]) => void;
  assignControlGroup: (slot: number, ids: EntityId[]) => void;
  setOrderMode: (mode: OrderMode) => void;
  setFormationPreset: (preset: FormationPreset) => void;
  setSupportMode: (call: SupportCallId | null) => void;
  setCalledShotLocation: (location: MechLocation | null) => void;
  patch: (partial: Partial<GameState>) => void;
  pushLog: (line: string) => void;
}

const LOG_LIMIT = 60;
const INITIAL_SKIRMISH_MISSION = initialSkirmishMission();

/** Clears one field's transient UI before another engine owns the same screen. */
export function battleRemountState() {
  return {
    ready: false,
    error: null,
    paused: true,
    speed: 1,
    tick: 0,
    elapsedSeconds: 0,
    missionDurationSeconds: 0,
    finished: false,
    outcomePending: false,
    winner: null,
    playerTeam: 0,
    heatTiers: [],
    selection: [],
    controlGroups: {},
    orderMode: null,
    queueOrders: false,
    calledShotLocation: null,
    units: [],
    enemies: [],
    contacts: [],
    log: [],
    missionName: '',
    briefing: '',
    briefingSeen: false,
    resourcePoints: 0,
    objectives: [],
    zones: [],
    missionStatus: 'active',
    missionReason: null,
    supportMode: null,
    supportNotice: null,
    reservesLeft: 0,
    marquee: null,
    hitPreview: null,
  } satisfies Partial<GameState>;
}

export const useGame = create<GameState & GameActions>((set) => ({
  screen: 'home',
  campaignPending: false,
  ready: false,
  error: null,
  paused: false,
  speed: 1,
  tick: 0,
  elapsedSeconds: 0,
  missionDurationSeconds: 0,
  finished: false,
  outcomePending: false,
  winner: null,
  playerTeam: 0,
  heatTiers: [],
  selection: [],
  controlGroups: {},
  orderMode: null,
  queueOrders: false,
  formationPreset: 'auto',
  calledShotLocation: null,
  units: [],
  enemies: [],
  contacts: [],
  log: [],

  skirmishMissionId: INITIAL_SKIRMISH_MISSION,
  battleCode: initialBattleCode(INITIAL_SKIRMISH_MISSION),
  difficulty: readDifficulty(),
  missionName: '',
  briefing: '',
  briefingSeen: false,
  resourcePoints: 0,
  objectives: [],
  zones: [],
  missionStatus: 'active',
  missionReason: null,
  supportMode: null,
  supportNotice: null,
  reservesLeft: 0,
  marquee: null,
  hitPreview: null,

  enterBattle: (entry = {}) =>
    set((state) => ({
      screen: 'battle',
      campaignPending: entry.campaignPending ?? false,
      ...battleRemountState(),
      skirmishMissionId: entry.missionId ?? state.skirmishMissionId,
      battleCode: entry.battleCode ?? state.battleCode,
    })),
  setSelection: (ids) => set({ selection: ids }),
  assignControlGroup: (slot, ids) =>
    set((state) => ({ controlGroups: { ...state.controlGroups, [slot]: ids } })),
  setOrderMode: (mode) =>
    set((state) => ({
      orderMode: mode,
      supportMode: null,
      queueOrders:
        mode === 'move' || mode === 'run' || mode === 'attack_move' ? state.queueOrders : false,
    })),
  setFormationPreset: (formationPreset) => set({ formationPreset }),
  setSupportMode: (call) =>
    set({ supportMode: call, supportNotice: null, orderMode: null, queueOrders: false }),
  setCalledShotLocation: (location) => set({ calledShotLocation: location }),
  patch: (partial) => set(partial),
  pushLog: (line) =>
    set((state) => ({ log: [line, ...state.log].slice(0, LOG_LIMIT) })),
}));

export function selectedUnit(state: GameState): UnitSnapshot | null {
  const id = state.selection[0];
  if (id === undefined) return null;
  return (
    state.units.find((unit) => unit.id === id) ??
    state.enemies.find((unit) => unit.id === id) ??
    null
  );
}
