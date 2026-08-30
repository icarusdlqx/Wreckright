import type { MechLocation } from '../schema/common';
import type { Renderer } from '../render3d/scene';
import { callSupport, headingBetween, isDirectional, type SupportCallId } from '../sim/support';
import {
  findEntity,
  isOperational,
  type EntityId,
  type Posture,
  type Vec2,
  type World,
} from '../sim/types';
import { toResult, type BattleResult } from '../sim/world';
import { AudioDirector } from './audio';
import {
  alphaStrikeSelection,
  attackSelection,
  engageContactSelection,
  jumpSelection,
  moveSelection,
  setSelectedWeaponMode,
  setSelectionPosture,
  stopSelection,
  targetNearestSelection,
  toggleSelectionGroup,
  toggleSelectionHeatSafety,
  toggleSelectionHoldFire,
  useSelectionAbilities,
  type MoveOrderOptions,
} from './engineOrders';
import { EnginePresentation } from './enginePresentation';
import { FramePacer } from './framePacer';
import type { IncomingFireDirections } from './incomingFireDirections';
import { attachInput } from './input';
import { PerfOverlay } from './perf';
import { useGame, type OrderMode } from './store';
import { supportRadius } from './supportOptions';

const HUD_INTERVAL_SECONDS = 0.1;
const SMOKE_INTERVAL_SECONDS = 0.7;
const MAX_CATCHUP_STEPS = 5;

export class Engine {
  readonly world: World;
  readonly renderer: Renderer;
  readonly maxTicks: number;
  /** Every sound in the battle. Silent until the first user gesture unlocks it. */
  readonly audio = new AudioDirector();

  private running = true;
  private accumulator = 0;
  private readonly pacer = new FramePacer();
  private readonly presentation: EnginePresentation;
  /** The frame-time overlay, attached by createEngine and toggled with P. */
  perf: PerfOverlay | null = null;
  private lastFrame = 0;
  private hudTimer = 0;
  private smokeTimer = 0;
  private detachInput: (() => void) | null = null;

  constructor(world: World, renderer: Renderer, maxTicks: number, incomingFire: IncomingFireDirections | null = null) {
    this.world = world;
    this.renderer = renderer;
    this.maxTicks = maxTicks;
    this.audio.primeScore(world);
    this.presentation = new EnginePresentation(world, renderer, this.audio, maxTicks, incomingFire);
  }

  get paused(): boolean {
    return useGame.getState().paused;
  }

  setPaused(paused: boolean): void {
    this.pacer.reset();
    useGame.getState().patch({ paused });
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  /** The rates on offer. Walking to the fight should cost patience, not time. */
  static readonly SPEEDS = [1, 2, 4] as const;

  setSpeed(speed: number): void {
    if (!Engine.SPEEDS.includes(speed as 1 | 2 | 4)) return;
    this.pacer.reset();
    useGame.getState().patch({ speed, paused: false });
  }

  togglePerf(): void {
    this.perf?.toggle();
  }

  /**
   * Stops the frame loop and leaves everything else standing. Teardown belongs
   * to whoever created the engine, so a battle that cannot draw any more stops
   * spending frames without pulling the canvas out from under React.
   */
  halt(): void {
    this.running = false;
  }

  /** Halves the GPU's job on the spot: shadows off, pixel ratio down. */
  toggleLowFx(): boolean {
    const low = !this.renderer.lowFx;
    this.renderer.setLowFx(low);
    this.hudDirty = true;
    useGame
      .getState()
      .pushLog(low ? 'Low graphics — shadows off, resolution down.' : 'Full graphics restored.');
    return low;
  }

  /** Steps along 1× → 2× → 4×, clamped at the ends rather than wrapping. */
  nudgeSpeed(direction: 1 | -1): void {
    const current = useGame.getState().speed;
    const at = Engine.SPEEDS.findIndex((speed) => speed >= current);
    const index = Math.max(0, Math.min(Engine.SPEEDS.length - 1, (at === -1 ? 0 : at) + direction));
    this.setSpeed(Engine.SPEEDS[index] ?? 1);
  }

  attach(canvas: HTMLCanvasElement): void {
    this.detachInput = attachInput(this, canvas);
  }

  start(): void {
    const frame = (now: number): void => {
      if (!this.running) return;
      // The sim clamps its catch-up, but the pacer wants the honest interval:
      // a clamped reading would hide exactly the slowness it exists to catch.
      const rawMs = this.lastFrame === 0 ? 0 : now - this.lastFrame;
      const deltaSeconds = Math.min(0.25, rawMs / 1000);
      this.lastFrame = now;
      this.tick(deltaSeconds, rawMs);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private readonly teardown: (() => void)[] = [];

  /** Extra cleanup the creator wants run when the battle screen goes away. */
  onDestroy(run: () => void): void {
    this.teardown.push(run);
  }

  destroy(): void {
    this.running = false;
    this.audio.destroy();
    this.detachInput?.();
    for (const run of this.teardown) run();
    this.renderer.destroy();
  }

  // Fixed 20Hz simulation; the renderer interpolates between steps at display rate.
  private tick(deltaSeconds: number, rawMs = deltaSeconds * 1000): void {
    const state = useGame.getState();
    let simMs = 0;
    let stepsRun = 0;

    if (!state.paused && !this.world.finished) {
      const verdict = this.pacer.record(rawMs, state.speed);
      if (verdict !== null && verdict < state.speed) {
        state.patch({ speed: verdict });
        state.pushLog(`Frame rate cannot hold ${state.speed}× — dropping to ${verdict}×.`);
      }

      this.accumulator += deltaSeconds * state.speed;
      const cap = MAX_CATCHUP_STEPS * state.speed;
      let steps = 0;
      const simStart = performance.now();
      while (this.accumulator >= this.world.dt && steps < cap) {
        this.accumulator -= this.world.dt;
        steps += 1;
        this.forceStep();
      }
      simMs = performance.now() - simStart;
      stepsRun = steps;
      if (steps >= cap) this.accumulator = 0;
    }

    const presentationDelta = state.paused ? 0 : deltaSeconds * state.speed;
    this.smokeTimer += presentationDelta;
    if (this.smokeTimer >= SMOKE_INTERVAL_SECONDS) {
      this.smokeTimer = 0;
      this.presentation.emitDamageSmoke();
    }

    const alpha =
      state.paused || this.world.finished ? 1 : Math.min(1, this.accumulator / this.world.dt);
    if (state.selection !== this.selectionSource) {
      this.selectionSource = state.selection;
      this.selectionSet = new Set(state.selection);
    }
    const drawStart = performance.now();
    this.renderer.draw(
      this.world,
      alpha,
      deltaSeconds,
      {
        selection: this.selectionSet,
        hovered: this.hoveredId,
        cursor: this.cursorWorld,
        orderMode: state.orderMode,
        selectionBox: this.selectionBox,
        supportRadius: this.supportArea(state.supportMode),
        supportRun: this.supportRun(state.supportMode),
        routes: this.presentation.routeMarkers(this.selectionSet),
      },
      presentationDelta,
    );

    if (this.presentation.advance(deltaSeconds)) {
      this.hudDirty = true;
      this.hudTimer = HUD_INTERVAL_SECONDS;
    }

    this.perf?.record({
      frameMs: rawMs,
      simMs,
      drawMs: performance.now() - drawStart,
      steps: stepsRun,
      speed: state.speed,
      drawCalls: this.renderer.drawCalls,
    });

    this.hudTimer += deltaSeconds;
    if (this.hudTimer >= HUD_INTERVAL_SECONDS) {
      this.hudTimer = 0;
      const last = this.lastPublished;
      if (
        this.hudDirty ||
        this.world.tick !== last.tick ||
        this.hoveredId !== last.hovered ||
        state.selection !== last.selection ||
        state.orderMode !== last.orderMode
      ) {
        this.hudDirty = false;
        last.tick = this.world.tick;
        last.hovered = this.hoveredId;
        last.selection = state.selection;
        last.orderMode = state.orderMode;
        this.presentation.publish(this.hoveredId);
      }
    }
  }

  /** The store's selection array the set was last built from, by identity. */
  private selectionSource: readonly EntityId[] | null = null;
  private selectionSet = new Set<EntityId>();

  /** What the HUD was last told, so an unchanged battle publishes nothing. */
  private readonly lastPublished = {
    tick: -1,
    hovered: null as EntityId | null,
    selection: null as readonly EntityId[] | null,
    orderMode: null as OrderMode,
  };
  private hudDirty = true;

  cursorWorld: Vec2 | null = null;
  hoveredId: EntityId | null = null;
  selectionBox: { a: Vec2; b: Vec2 } | null = null;
  supportAim: { call: SupportCallId; at: Vec2; to: Vec2 } | null = null;

  private supportRun(call: SupportCallId | null): {
    at: Vec2;
    heading: number;
    length: number;
    width: number;
  } | null {
    const aim = this.supportAim;
    const at = aim?.at ?? this.cursorWorld;
    if ((aim?.call ?? call) !== 'air_strike' || at === null) return null;
    const config = this.world.rules.support.air_strike;
    return {
      at,
      heading: this.headingFor(at, aim?.to ?? at),
      length: config.length,
      width: config.width,
    };
  }

  private supportArea(call: SupportCallId | null): { at: Vec2; radius: number } | null {
    if (this.cursorWorld === null) return null;
    const radius = supportRadius(this.world.rules.support, call);
    return radius === null ? null : { at: this.cursorWorld, radius };
  }

  private headingFor(at: Vec2, to: Vec2): number {
    const drag = Math.hypot(to.x - at.x, to.y - at.y);
    if (drag >= this.world.terrain.tileSize) return headingBetween(at, to);

    const team = this.world.playerTeam ?? 0;
    let x = 0;
    let y = 0;
    let count = 0;
    for (const entity of this.world.entities) {
      if (entity.team !== team || !isOperational(entity)) continue;
      x += entity.pos.x;
      y += entity.pos.y;
      count += 1;
    }
    if (count === 0) return 0;
    return headingBetween({ x: x / count, y: y / count }, at);
  }

  forceStep(): void {
    this.presentation.forceStep();
  }

  selectedEntities(): EntityId[] {
    const team = this.world.playerTeam ?? 0;
    return useGame.getState().selection.filter((id) => findEntity(this.world, id)?.team === team);
  }

  orderMove(to: Vec2, run: boolean, options: MoveOrderOptions = {}): void {
    this.hudDirty = true;
    moveSelection(this, to, run, options);
  }

  engageContact(targetId: EntityId, to: Vec2): void {
    this.hudDirty = true;
    engageContactSelection(this, targetId, to);
  }

  orderJump(to: Vec2): void {
    this.hudDirty = true;
    jumpSelection(this, to);
  }

  orderAttack(targetId: EntityId, calledShot: MechLocation | null): void {
    this.hudDirty = true;
    attackSelection(this, targetId, calledShot);
  }

  targetNearest(): void {
    targetNearestSelection(this, (targetId) => this.orderAttack(targetId, null));
  }

  setPosture(posture: Posture): void {
    this.hudDirty = true;
    setSelectionPosture(this, posture);
  }

  orderStop(): void {
    this.hudDirty = true;
    stopSelection(this);
  }

  toggleHoldFire(): void {
    this.hudDirty = true;
    toggleSelectionHoldFire(this);
  }

  toggleHeatSafety(): void {
    this.hudDirty = true;
    toggleSelectionHeatSafety(this);
  }

  useAbilities(): void {
    this.hudDirty = true;
    useSelectionAbilities(this);
  }

  alphaStrike(): void {
    this.hudDirty = true;
    alphaStrikeSelection(this);
  }

  toggleGroup(group: number): void {
    this.hudDirty = true;
    toggleSelectionGroup(this, group);
  }

  setWeaponMode(entityId: EntityId, mountIndex: number, modeId: string): boolean {
    const switched = setSelectedWeaponMode(this, entityId, mountIndex, modeId);
    this.hudDirty ||= switched;
    return switched;
  }

  setOrderMode(mode: OrderMode): void {
    useGame.getState().setOrderMode(mode);
  }

  supportNeedsHeading(call: SupportCallId): boolean {
    return isDirectional(this.world, call);
  }

  callSupport(call: SupportCallId, target: Vec2, runTo: Vec2 = target): { ok: boolean; reason: string | null } {
    this.hudDirty = true;
    const team = this.world.playerTeam ?? 0;
    const result = callSupport(this.world, team, call, target, this.headingFor(target, runTo));
    if (!result.ok && result.reason !== null) useGame.getState().pushLog(result.reason);
    return result;
  }

  result(): BattleResult {
    return toResult(this.world, String(this.world.rng.save().w), this.maxTicks);
  }
}
