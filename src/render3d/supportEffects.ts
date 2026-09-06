import { BufferAttribute, Group, MeshBasicMaterial } from 'three';
import { teamColour, UI } from '../render/palette';
import type { SimEvent } from '../sim/events';
import type { PendingCall } from '../sim/support';
import type { EntityId, Vec2, World } from '../sim/types';
import { RepairTruckEffects } from './repairTruckEffects';
import { disposeObjectResources } from './sceneResources';
import {
  airImpact,
  aircraft,
  effectLine,
  effectPoint,
  type AirImpact,
  type AirRun,
  type CallMemory,
  type PendingVisual,
} from './supportEffectModels';
import { canPresentSupportCall } from './visibilityPresentation';

const PENDING_CAPACITY = 4;
const CALL_MEMORY_CAPACITY = 8;
const AIR_CAPACITY = 3;
const AIR_SECONDS = 3.8;

/** Fixed-budget visuals for support calls; the simulation remains their source of truth. */
export class SupportEffects {
  readonly group = new Group();
  private readonly pending: PendingVisual[] = [];
  private readonly calls: CallMemory[] = [];
  private readonly air: AirRun[] = [];
  private readonly trucks: RepairTruckEffects;
  private nextCall = 0;
  private callOrder = 0;
  private nextAir = 0;
  private lowFx = false;
  private disposed = false;

  constructor(
    private readonly heightAt: (x: number, y: number) => number,
    positionOf: (id: EntityId) => Vec2 | null,
    private readonly reducedMotion = false,
    airImpactCount = 1,
  ) {
    this.group.name = 'support-effects';
    for (let slot = 0; slot < PENDING_CAPACITY; slot += 1) {
      const outline = effectLine(`support-air-pending-${slot}`, 5, UI.attackMarker, 0.82);
      const eta = effectLine(`support-air-eta-${slot}`, 2, UI.selection, 0.95);
      const approach = aircraft(`approach-${slot}`);
      approach.craft.name = `support-air-approach-${slot}`;
      this.group.add(outline, eta, approach.craft);
      this.pending.push({ outline, eta, ...approach });
    }
    for (let slot = 0; slot < CALL_MEMORY_CAPACITY; slot += 1) {
      this.calls.push({ active: false, team: -1, x: 0, y: 0, heading: 0, resolveTick: -1, source: null, order: 0 });
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
    this.trucks = new RepairTruckEffects(heightAt, positionOf, reducedMotion);
    this.group.add(this.trucks.group);
  }

  setPresentationMode(lowFx: boolean): void {
    if (this.disposed) return;
    this.lowFx = lowFx; this.trucks.setPresentationMode(lowFx);
  }

  consume(world: World, events: readonly SimEvent[]): void {
    if (this.disposed) return;
    for (const event of events) {
      if (event.type === 'support_called' && event.call === 'air_strike') {
        for (const pending of world.support.pending) {
          if (pending.call === 'air_strike' && pending.team === event.team &&
            pending.target.x === event.x && pending.target.y === event.y && canPresentSupportCall(world, pending)) this.remember(pending);
        }
      }
      if (event.type !== 'support_resolved' || event.call !== 'air_strike') continue;
      const heading = this.takeHeading(event.team, event.x, event.y);
      if (heading !== null) this.startAir(world, event.team, event.x, event.y, heading);
    }
  }

  draw(world: World, deltaSeconds: number): void {
    if (this.disposed) return;
    this.drawPending(world);
    this.drawAir(deltaSeconds);
    this.trucks.draw(world, deltaSeconds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.trucks.dispose();
    disposeObjectResources(this.group);
    this.group.clear();
    this.pending.length = 0;
    this.calls.length = 0;
    this.air.length = 0;
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
      const seconds = Math.max(0, call.resolveTick - world.tick) * world.dt;
      visual.craft.visible = !this.reducedMotion && seconds > 0 && seconds <= 1.6;
      if (visual.craft.visible) {
        const distance = -rules.length / 2 - 150 * seconds / 1.6;
        const x = call.target.x + Math.cos(call.heading) * distance;
        const y = call.target.y + Math.sin(call.heading) * distance;
        visual.craft.position.set(x, this.heightAt(x, y) + 58, y);
        visual.craft.rotation.y = -call.heading;
        visual.craftMaterial.color.setHex(teamColour(call.team));
        visual.trail.visible = !this.lowFx;
      }
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
      if (visual !== undefined) { visual.outline.visible = false; visual.eta.visible = false; visual.craft.visible = false; }
    }
    for (const memory of this.calls) {
      if (memory.active && memory.resolveTick + 2 < world.tick) memory.active = false;
    }
  }

  private remember(call: PendingCall): void {
    let memory = this.calls.find((entry) => entry.active && entry.source === call);
    if (memory === undefined) {
      memory = this.calls[this.nextCall];
      this.nextCall = (this.nextCall + 1) % this.calls.length;
      if (memory !== undefined) memory.order = this.callOrder++;
    }
    if (memory === undefined) return;
    memory.active = true;
    memory.source = call;
    memory.team = call.team;
    memory.x = call.target.x;
    memory.y = call.target.y;
    memory.heading = call.heading;
    memory.resolveTick = call.resolveTick;
  }

  private takeHeading(team: number, x: number, y: number): number | null {
    // Repeated runs can share a target and tick. Retain each request and resolve in queue order.
    const memory = this.calls.filter((entry) => entry.active && entry.team === team && entry.x === x && entry.y === y)
      .sort((a, b) => a.resolveTick - b.resolveTick || a.order - b.order)[0];
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
      const travel = this.reducedMotion ? 0.5 : Math.min(1, run.age / 1.55);
      const along = -run.length / 2 + (run.length + 220) * travel;
      const x = run.x + Math.cos(run.heading) * along;
      const z = run.y + Math.sin(run.heading) * along;
      run.craft.position.set(x, this.heightAt(x, z) + 58, z);
      run.craft.rotation.y = -run.heading;
      run.craft.visible = run.age < (this.reducedMotion ? 0.55 : 1.55);
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

}
