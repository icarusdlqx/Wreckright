import { BufferAttribute, Group, LineBasicMaterial, MeshBasicMaterial } from 'three';
import { teamColour, UI } from '../render/palette';
import type { SimEvent } from '../sim/events';
import type { PendingCall, RepairTruck } from '../sim/support';
import { isOperational, type EntityId, type Vec2, type World } from '../sim/types';
import { disposeObjectResources } from './sceneResources';
import {
  airImpact,
  aircraft,
  effectLine,
  effectPoint,
  LINKS_PER_TRUCK,
  needsArmour,
  truck,
  type AirImpact,
  type AirRun,
  type CallMemory,
  type PendingVisual,
  type TruckVisual,
} from './supportEffectModels';
import { canPresentSupportCall } from './visibilityPresentation';

const PENDING_CAPACITY = 4;
const CALL_MEMORY_CAPACITY = 8;
const AIR_CAPACITY = 3;
const TRUCK_CAPACITY = 4;
const AIR_SECONDS = 3.8;

/** Fixed-budget visuals for support calls; the simulation remains their source of truth. */
export class SupportEffects {
  readonly group = new Group();
  private readonly pending: PendingVisual[] = [];
  private readonly calls: CallMemory[] = [];
  private readonly air: AirRun[] = [];
  private readonly trucks: TruckVisual[] = [];
  private elapsed = 0;
  private nextCall = 0;
  private nextAir = 0;
  private lowFx = false;
  private disposed = false;

  constructor(
    private readonly heightAt: (x: number, y: number) => number,
    private readonly positionOf: (id: EntityId) => Vec2 | null,
    private readonly reducedMotion = false,
    airImpactCount = 1,
  ) {
    this.group.name = 'support-effects';
    for (let slot = 0; slot < PENDING_CAPACITY; slot += 1) {
      const outline = effectLine(`support-air-pending-${slot}`, 5, UI.attackMarker, 0.82);
      const eta = effectLine(`support-air-eta-${slot}`, 2, UI.selection, 0.95);
      this.group.add(outline, eta);
      this.pending.push({ outline, eta });
    }
    for (let slot = 0; slot < CALL_MEMORY_CAPACITY; slot += 1) {
      this.calls.push({ active: false, team: -1, x: 0, y: 0, heading: 0, resolveTick: -1 });
    }
    for (let slot = 0; slot < AIR_CAPACITY; slot += 1) {
      const built = aircraft(slot);
      const impacts: AirImpact[] = [];
      this.group.add(built.craft);
      for (let index = 0; index < Math.max(1, Math.round(airImpactCount)); index += 1) {
        const impact = airImpact(slot, index);
        impacts.push(impact);
        this.group.add(impact.root);
      }
      this.air.push({ active: false, age: 0, x: 0, y: 0, heading: 0, length: 0, impacts, ...built });
    }
    for (let slot = 0; slot < TRUCK_CAPACITY; slot += 1) {
      const built = truck(slot);
      this.trucks.push(built);
      this.group.add(built.root);
    }
  }

  setPresentationMode(lowFx: boolean): void { if (!this.disposed) this.lowFx = lowFx; }

  consume(world: World, events: readonly SimEvent[]): void {
    if (this.disposed) return;
    for (const event of events) {
      if (event.type === 'support_called' && event.call === 'air_strike') {
        const pending = world.support.pending.find((entry) =>
          entry.call === 'air_strike' && entry.team === event.team &&
          entry.target.x === event.x && entry.target.y === event.y);
        if (pending !== undefined && canPresentSupportCall(world, pending)) this.remember(pending);
      }
      if (event.type !== 'support_resolved' || event.call !== 'air_strike') continue;
      const heading = this.takeHeading(event.team, event.x, event.y);
      if (heading !== null) this.startAir(world, event.team, event.x, event.y, heading);
    }
  }

  draw(world: World, deltaSeconds: number): void {
    if (this.disposed) return;
    this.elapsed += Math.max(0, deltaSeconds);
    this.drawPending(world);
    this.drawAir(deltaSeconds);
    this.drawTrucks(world);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposeObjectResources(this.group);
    this.group.clear();
    this.pending.length = 0;
    this.calls.length = 0;
    this.air.length = 0;
    this.trucks.length = 0;
  }

  private visibleTeam(world: World, team: number): boolean {
    return world.playerTeam === null || team === world.playerTeam;
  }

  private drawPending(world: World): void {
    let used = 0;
    for (const call of world.support.pending) {
      if (call.call !== 'air_strike' || !canPresentSupportCall(world, call)) continue;
      this.remember(call);
      const visual = this.pending[used];
      if (visual === undefined) break;
      used += 1;
      const rules = world.rules.support.air_strike;
      const spacing = rules.length / rules.shots;
      // The first and last bursts sit half a spacing inside the authored run,
      // then each damages half a width beyond its centre.
      const halfAlong = rules.length / 2 - spacing / 2 + rules.width / 2;
      const damageLength = halfAlong * 2;
      const halfAcross = rules.width / 2;
      const ax = Math.cos(call.heading); const az = Math.sin(call.heading);
      const cx = -az; const cz = ax;
      for (let corner = 0; corner < 5; corner += 1) {
        const source = corner === 4 ? 0 : corner;
        const along = source < 2 ? -halfAlong : halfAlong;
        const across = source === 0 || source === 3 ? -halfAcross : halfAcross;
        const x = call.target.x + ax * along + cx * across;
        const z = call.target.y + az * along + cz * across;
        effectPoint(visual.outline, corner, x, this.heightAt(x, z) + 1.7, z);
      }
      const delayTicks = Math.max(1, Math.round(rules.delaySeconds / world.dt));
      const progress = 1 - Math.max(0, call.resolveTick - world.tick) / delayTicks;
      const sweep = -halfAlong + Math.max(0, Math.min(1, progress)) * damageLength;
      for (let edge = 0; edge < 2; edge += 1) {
        const across = edge === 0 ? -halfAcross : halfAcross;
        const x = call.target.x + ax * sweep + cx * across;
        const z = call.target.y + az * sweep + cz * across;
        effectPoint(visual.eta, edge, x, this.heightAt(x, z) + 2, z);
      }
      (visual.outline.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (visual.eta.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      visual.outline.visible = true;
      visual.eta.visible = true;
    }
    for (let index = used; index < this.pending.length; index += 1) {
      const visual = this.pending[index];
      if (visual !== undefined) { visual.outline.visible = false; visual.eta.visible = false; }
    }
    for (const memory of this.calls) {
      if (memory.active && memory.resolveTick + 2 < world.tick) memory.active = false;
    }
  }

  private remember(call: PendingCall): void {
    let memory = this.calls.find((entry) => entry.active && entry.team === call.team &&
      entry.x === call.target.x && entry.y === call.target.y &&
      entry.heading === call.heading && entry.resolveTick === call.resolveTick);
    if (memory === undefined) {
      memory = this.calls[this.nextCall];
      this.nextCall = (this.nextCall + 1) % this.calls.length;
    }
    if (memory === undefined) return;
    memory.active = true;
    memory.team = call.team;
    memory.x = call.target.x;
    memory.y = call.target.y;
    memory.heading = call.heading;
    memory.resolveTick = call.resolveTick;
  }

  private takeHeading(team: number, x: number, y: number): number | null {
    const memory = this.calls.find((entry) => entry.active && entry.team === team && entry.x === x && entry.y === y);
    if (memory === undefined) return null;
    memory.active = false;
    return memory.heading;
  }

  private startAir(world: World, team: number, x: number, y: number, heading: number): void {
    const run = this.air[this.nextAir];
    this.nextAir = (this.nextAir + 1) % this.air.length;
    if (run === undefined) return;
    run.active = true; run.age = 0; run.x = x; run.y = y; run.heading = heading;
    run.length = world.rules.support.air_strike.length;
    run.craftMaterial.color.setHex(teamColour(team));
    const spacing = run.length / run.impacts.length;
    const ax = Math.cos(heading); const az = Math.sin(heading);
    for (let index = 0; index < run.impacts.length; index += 1) {
      const impact = run.impacts[index];
      if (impact === undefined) continue;
      const along = -run.length / 2 + spacing * (index + 0.5);
      const ix = x + ax * along; const iz = y + az * along;
      impact.root.position.set(ix, this.heightAt(ix, iz), iz);
      impact.scar.visible = true;
      impact.flash.visible = false; impact.ring.visible = false; impact.smoke.visible = false;
    }
  }

  private drawAir(deltaSeconds: number): void {
    for (const run of this.air) {
      if (!run.active) continue;
      run.age += Math.max(0, deltaSeconds);
      const travel = this.reducedMotion ? 0.5 : Math.min(1, run.age / 0.9);
      const along = -run.length / 2 - 90 + (run.length + 180) * travel;
      const x = run.x + Math.cos(run.heading) * along;
      const z = run.y + Math.sin(run.heading) * along;
      run.craft.position.set(x, this.heightAt(x, z) + 68, z);
      run.craft.rotation.y = -run.heading;
      run.craft.visible = run.age < (this.reducedMotion ? 0.55 : 1.15);
      run.trail.visible = run.craft.visible && !this.lowFx;
      for (let index = 0; index < run.impacts.length; index += 1) {
        const impact = run.impacts[index];
        if (impact === undefined) continue;
        const age = run.age - (this.reducedMotion ? 0 : 0.2 + index * 0.075);
        const flashAge = Math.max(0, age);
        const showFlash = age >= 0 && age < 0.24;
        impact.flash.visible = showFlash;
        impact.ring.visible = showFlash && (!this.lowFx || index % 2 === 0);
        impact.smoke.visible = age >= 0.08 && age < 2.7 && (!this.lowFx || index % 2 === 0);
        if (showFlash) {
          const fade = 1 - flashAge / 0.24;
          impact.flash.scale.setScalar(5 + 17 * (1 - fade));
          (impact.flash.material as MeshBasicMaterial).opacity = fade * 0.92;
          impact.ring.scale.setScalar(8 + 25 * (1 - fade));
          (impact.ring.material as MeshBasicMaterial).opacity = fade * 0.8;
        }
        if (impact.smoke.visible) {
          const smokeAge = age - 0.08;
          impact.smoke.position.y = this.reducedMotion ? 8 : 6 + smokeAge * 9;
          impact.smoke.scale.setScalar(4 + smokeAge * 3.2);
          (impact.smoke.material as MeshBasicMaterial).opacity = Math.max(0, 0.48 - smokeAge * 0.16);
        }
      }
      if (run.age <= AIR_SECONDS) continue;
      run.active = false;
      run.craft.visible = false;
      for (const impact of run.impacts) {
        impact.flash.visible = false; impact.ring.visible = false; impact.smoke.visible = false;
      }
    }
  }

  private drawTrucks(world: World): void {
    for (const visual of this.trucks) visual.active = false;
    for (const active of world.support.trucks) {
      if (!this.visibleTeam(world, active.team)) continue;
      let visual = this.trucks.find((entry) => !entry.active && entry.expiresTick === active.expiresTick &&
        entry.team === active.team && entry.x === active.pos.x && entry.y === active.pos.y);
      visual ??= this.trucks.find((entry) => !entry.active);
      if (visual === undefined) break;
      this.placeTruck(world, visual, active);
    }
    for (const visual of this.trucks) if (!visual.active) visual.root.visible = false;
  }

  private placeTruck(world: World, visual: TruckVisual, active: RepairTruck): void {
    visual.active = true; visual.team = active.team; visual.x = active.pos.x; visual.y = active.pos.y;
    visual.expiresTick = active.expiresTick;
    const ground = this.heightAt(active.pos.x, active.pos.y);
    visual.root.visible = true;
    visual.root.position.set(active.pos.x, ground, active.pos.y);
    visual.bodyMaterial.color.setHex(teamColour(active.team));
    visual.radius.scale.setScalar(active.radius);
    let links = 0;
    const limit = this.lowFx ? Math.ceil(LINKS_PER_TRUCK / 2) : LINKS_PER_TRUCK;
    for (const entity of world.entities) {
      if (links >= limit || entity.team !== active.team || !isOperational(entity) || !needsArmour(entity)) continue;
      const at = this.positionOf(entity.id) ?? entity.pos;
      if (Math.hypot(at.x - active.pos.x, at.y - active.pos.y) > active.radius) continue;
      const repair = visual.links[links];
      if (repair === undefined) break;
      links += 1;
      effectPoint(repair, 0, 0, 7, 0);
      effectPoint(repair, 1, at.x - active.pos.x, this.heightAt(at.x, at.y) - ground + 9, at.y - active.pos.y);
      (repair.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (repair.material as LineBasicMaterial).opacity = this.reducedMotion
        ? 0.72 : 0.52 + 0.2 * Math.sin(this.elapsed * 8 + links);
      repair.visible = true;
    }
    for (let index = links; index < visual.links.length; index += 1) {
      const repair = visual.links[index];
      if (repair !== undefined) repair.visible = false;
    }
  }
}
