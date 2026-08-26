import { machineCulture } from '../render3d/machineCulture';
import type { Renderer } from '../render3d/scene';
import { canPresentEntity } from '../render3d/visibilityPresentation';
import type { SimEvent } from '../sim/events';
import { hitPreview } from '../sim/preview';
import { isSightedBy } from '../sim/sensors';
import { findEntity, isOperational, type EntityId, type World } from '../sim/types';
import { stepWorld } from '../sim/world';
import type { AudioDirector } from './audio';
import { eventLogLine } from './eventLogPresentation';
import type { IncomingFireDirections } from './incomingFireDirections';
import { crossedMissionClockWarnings } from './missionClock';
import { stoppedCount } from './objectiveReadout';
import { snapshotUnits } from './snapshot';
import { useGame, type HitPreviewView } from './store';

/** Owns the HUD-facing view of a battle, including its contact privacy boundary. */
export class EnginePresentation {
  private clockSeconds: number;
  /** Every optical or electronic contact acquired, for the new-contact brake. */
  private readonly sighted = new Set<EntityId>();
  private contactsSeeded = false;

  constructor(
    private readonly world: World,
    private readonly renderer: Renderer,
    private readonly audio: AudioDirector,
    private readonly maxTicks: number,
    private readonly incomingFire: IncomingFireDirections | null = null,
  ) {
    this.clockSeconds = maxTicks * world.dt;
  }

  forceStep(): void {
    if (this.world.finished) return;
    const before = this.clockSeconds;
    stepWorld(this.world, this.maxTicks);
    this.clockSeconds = Math.max(0, (this.maxTicks - this.world.tick) * this.world.dt);
    this.renderer.snapshot(this.world);
    const events = this.world.events.splice(0, this.world.events.length);
    this.renderer.consumeEvents(this.world, events);
    this.incomingFire?.consume(this.world, events, useGame.getState().selection);
    this.audio.listenAt = this.renderer.camera.target;
    this.audio.consume(
      this.world,
      events,
      useGame.getState().speed,
      this.renderer.camera.reducedMotion,
    );
    this.logEvents(events);
    if (!this.world.finished) {
      for (const warning of crossedMissionClockWarnings(before, this.clockSeconds)) {
        useGame.getState().pushLog(warning);
      }
    }
  }

  emitDamageSmoke(): void {
    for (const entity of this.world.entities) {
      if (!isOperational(entity) || !canPresentEntity(this.world, entity.id)) continue;

      // A mech running hot says so on the battlefield, not just in a panel:
      // steam off the vents is how a player reads "that one is about to shut
      // down" while looking at the fight rather than at a bar.
      if (entity.heat > entity.heatCapacity * 0.62) {
        const vent = this.renderer.positionOf(entity.id);
        if (vent !== null) this.renderer.spawnSmoke(vent);
      }

      const faction = this.world.catalog.chassis.get(entity.chassisId)?.faction ?? 'linewrought';
      if (!machineCulture(faction).revealsFieldDamage) continue;

      // Front and back together, so a mech stripped from behind smokes too.
      const damaged = Object.values(entity.locations).some(
        (location) =>
          location.destroyed ||
          location.armour + location.rearArmour <
            (location.armourMax + location.rearArmourMax) * 0.35,
      );
      if (!damaged) continue;
      const at = this.renderer.positionOf(entity.id);
      if (at !== null) this.renderer.spawnSmoke(at);
    }
  }

  publish(hoveredId: EntityId | null): void {
    const playerTeam = this.world.playerTeam ?? 0;
    const { units, enemies, contacts } = snapshotUnits(this.world, playerTeam);
    const state = useGame.getState();

    this.brakeOnNewContact([...enemies, ...contacts]);

    const selection = state.selection.filter((id) => {
      const entity = findEntity(this.world, id);
      return entity !== null && isOperational(entity);
    });

    state.patch({
      tick: this.world.tick,
      elapsedSeconds: this.world.tick * this.world.dt,
      finished: this.world.finished,
      winner: this.world.winner,
      units,
      enemies,
      contacts,
      playerTeam,
      resourcePoints: Math.floor(this.world.resources.get(playerTeam) ?? 0),
      reservesLeft: this.world.reserves.length,
      missionStatus: this.world.missionStatus,
      missionReason: this.world.missionReason,
      objectives: this.world.objectives.map((objective) => ({
        id: objective.id,
        label: objective.label,
        required: objective.required,
        status: objective.status,
        progress: objective.progress,
        sustained: objective.type === 'protect_zones' || objective.type === 'survive',
        stopped: stoppedCount(this.world, objective),
      })),
      zones: this.world.zones.map((zone) => ({
        id: zone.id,
        name: zone.name,
        owner: zone.owner,
        contender: zone.contender,
        progress: zone.progress,
        captureSeconds: zone.captureSeconds,
        contested: zone.contested,
      })),
      hitPreview: this.previewFor(selection, hoveredId),
      ...(selection.length === state.selection.length ? {} : { selection }),
    });
  }

  private logEvents(events: readonly SimEvent[]): void {
    const push = useGame.getState().pushLog;
    for (const event of events) {
      const line = eventLogLine(this.world, event);
      if (line !== null) push(line);
    }
  }

  /**
   * Drops fast-forward the moment a hostile nobody has seen before appears.
   * Contacts blink in and out of cover all battle, so re-acquiring an old
   * contact is not news — only a machine this lance has never detected
   * pulls the clock back to 1×. Whatever was already visible at the drop is
   * seeded silently: the opening of a mirror match is not a surprise.
   */
  private brakeOnNewContact(enemies: readonly { id: EntityId }[]): void {
    if (!this.contactsSeeded) {
      this.contactsSeeded = true;
      for (const enemy of enemies) this.sighted.add(enemy.id);
      return;
    }
    let fresh = false;
    for (const enemy of enemies) {
      if (this.sighted.has(enemy.id)) continue;
      this.sighted.add(enemy.id);
      fresh = true;
    }
    const state = useGame.getState();
    if (fresh && state.speed > 1) {
      state.patch({ speed: 1 });
      state.pushLog('New contact — speed back to 1×.');
    }
  }

  /** The to-hit readout: primary selection priced against cursor or target. */
  private previewFor(
    selection: readonly EntityId[],
    hoveredId: EntityId | null,
  ): HitPreviewView | null {
    const shooterId = selection.find(
      (id) => findEntity(this.world, id)?.team === (this.world.playerTeam ?? 0),
    );
    const shooter = shooterId === undefined ? null : findEntity(this.world, shooterId);
    if (shooter === null || !isOperational(shooter)) return null;

    const hoveredEntity = hoveredId === null ? null : findEntity(this.world, hoveredId);
    const hovered =
      hoveredEntity !== null && hoveredEntity.team !== shooter.team && isOperational(hoveredEntity)
        ? hoveredEntity
        : null;
    const target = hovered ?? findEntity(this.world, shooter.targetId);
    if (
      target === null ||
      target.team === shooter.team ||
      !isOperational(target) ||
      !isSightedBy(this.world.vision, target)
    ) return null;

    const preview = hitPreview(this.world, shooter, target);
    if (preview === null) return null;

    return {
      shooterId: shooter.id,
      targetId: target.id,
      targetName: target.name,
      range: preview.range,
      hover: hovered !== null,
      weapons: preview.weapons.map((weapon) => ({
        index: weapon.index,
        chance: weapon.chance,
        blocked: weapon.blocked,
      })),
      factors: preview.factors,
    };
  }
}
