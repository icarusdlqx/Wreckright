import { BufferAttribute, Group, LineBasicMaterial, MeshBasicMaterial } from 'three';
import { teamColour } from '../render/palette';
import { isOperational, type EntityId, type Vec2, type World } from '../sim/types';
import { disposeObjectResources } from './sceneResources';
import { effectPoint, needsArmour } from './supportEffectModels';
import { REPAIR_LINKS, repairTruckModel, type RepairVisual } from './repairTruckModels';

const CAPACITY = 4;
const LIFT_SECONDS = 1.2;

/** A delivered service vehicle is cosmetic; the authored repair circle remains authoritative. */
export class RepairTruckEffects {
  readonly group = new Group();
  private readonly visuals: RepairVisual[] = [];
  private elapsed = 0;
  private lowFx = false;
  constructor(private readonly heightAt: (x: number, y: number) => number,
    private readonly positionOf: (id: EntityId) => Vec2 | null, private readonly reducedMotion: boolean) {
    this.group.name = 'repair-service-effects';
    for (let slot = 0; slot < CAPACITY; slot++) {
      const visual = repairTruckModel(slot); this.visuals.push(visual); this.group.add(visual.root);
    }
  }
  setPresentationMode(low: boolean): void { this.lowFx = low; }
  draw(world: World, delta: number): void {
    const dt = Math.max(0, delta); this.elapsed += dt;
    for (const visual of this.visuals) visual.seen = false;
    const visible = (team: number): boolean => world.playerTeam === null || world.playerTeam === team;
    for (const active of world.support.trucks) {
      if (!visible(active.team)) continue;
      const visual = this.acquire(world, active.team, active.pos, active.expiresTick);
      if (visual === undefined) continue;
      visual.phase = 'working'; visual.seen = true; visual.root.visible = true;
      visual.age = Math.max(0, world.rules.support.repair_truck.durationSeconds - (active.expiresTick - world.tick) * world.dt);
      this.place(world, visual, active.radius, Math.max(0, active.expiresTick - world.tick) * world.dt);
    }
    for (const pending of world.support.pending) {
      if (pending.call !== 'repair_truck' || !visible(pending.team)) continue;
      const end = pending.resolveTick + Math.round(world.rules.support.repair_truck.durationSeconds / world.dt);
      const visual = this.acquire(world, pending.team, pending.target, end);
      if (visual === undefined) continue;
      visual.phase = 'incoming'; visual.seen = true; visual.root.visible = true;
      visual.age = Math.max(0, pending.resolveTick - world.tick) * world.dt;
      this.place(world, visual, world.rules.support.repair_truck.radius, 0);
    }
    for (const visual of this.visuals) {
      if (visual.seen || visual.phase === 'hidden') continue;
      if (visual.phase !== 'departing') { visual.phase = 'departing'; visual.age = 0; }
      visual.age += dt;
      if (this.reducedMotion || visual.age >= LIFT_SECONDS) {
        visual.phase = 'hidden'; visual.root.visible = false; continue;
      }
      this.place(world, visual, world.rules.support.repair_truck.radius, 0);
    }
  }
  dispose(): void { disposeObjectResources(this.group); this.group.clear(); this.visuals.length = 0; }

  private acquire(world: World, team: number, at: Vec2, endTick: number): RepairVisual | undefined {
    const existing = this.visuals.find(v => !v.seen && v.phase !== 'hidden' && v.team === team && v.x === at.x && v.y === at.y && v.endTick === endTick);
    if (existing !== undefined) return existing;
    const visual = this.visuals.find(v => !v.seen && (v.phase === 'hidden' || v.phase === 'departing'));
    if (visual === undefined) return undefined;
    visual.team = team; visual.x = at.x; visual.y = at.y; visual.endTick = endTick;
    visual.parkX = 0; visual.parkY = 0;
    // Park beside a crowded drop point so a mech cannot conceal the whole service vehicle.
    const friendlies = world.entities.filter(e => e.team === team && isOperational(e));
    if (friendlies.some(e => Math.hypot(e.pos.x - at.x, e.pos.y - at.y) < 22)) {
      let best = -1;
      for (let index = 0; index < 8; index++) {
        const x = Math.cos(index * Math.PI / 4) * 26, y = Math.sin(index * Math.PI / 4) * 26;
        const tile = world.terrain.toTile({ x: at.x + x, y: at.y + y });
        if (!world.terrain.passable(tile.column, tile.row)) continue;
        const clearance = Math.min(...friendlies.map(e => Math.hypot(e.pos.x - at.x - x, e.pos.y - at.y - y)));
        if (clearance > best) { best = clearance; visual.parkX = x; visual.parkY = y; }
      }
    }
    return visual;
  }
  private place(world: World, visual: RepairVisual, radius: number, remaining: number): void {
    const ground = this.heightAt(visual.x, visual.y);
    visual.root.position.set(visual.x, ground, visual.y);
    const parkedHeight = this.heightAt(visual.x + visual.parkX, visual.y + visual.parkY) - ground;
    const working = visual.phase === 'working';
    const incoming = visual.phase === 'incoming';
    const lift = this.reducedMotion ? 0 : incoming ? Math.min(1, visual.age / LIFT_SECONDS) : visual.phase === 'departing' ? Math.min(1, visual.age / LIFT_SECONDS) : 0;
    visual.vehicle.position.set(visual.parkX, parkedHeight + lift * lift * 72, visual.parkY);
    visual.vehicle.visible = !incoming || visual.age <= LIFT_SECONDS;
    visual.lift.visible = !working && !this.reducedMotion;
    if (this.reducedMotion && incoming) visual.vehicle.visible = false;
    visual.colour.color.setHex(teamColour(visual.team));
    visual.boom.scale.x = working ? this.reducedMotion ? 1 : Math.min(1, 0.45 + visual.age * 1.5) : 0.45;
    visual.beacon.scale.setScalar(this.reducedMotion ? 1 : 0.9 + 0.25 * Math.sin(this.elapsed * 7));
    visual.radius.visible = visual.phase !== 'departing'; visual.radius.scale.setScalar(radius);
    const boundary = visual.radius.geometry.getAttribute('position') as BufferAttribute;
    for (let index = 0; index < boundary.count; index += 1) {
      const x = boundary.getX(index) * radius, y = -boundary.getY(index) * radius;
      boundary.setZ(index, (this.heightAt(visual.x + x, visual.y + y) - ground + 0.4) / radius);
    }
    boundary.needsUpdate = true;
    visual.hub.visible = working;
    visual.tether.visible = working && Math.hypot(visual.parkX, visual.parkY) > 1;
    effectPoint(visual.tether, 0, visual.parkX, parkedHeight + 3, visual.parkY);
    effectPoint(visual.tether, 1, visual.parkX / 2, Math.max(2, parkedHeight + 2), visual.parkY / 2);
    effectPoint(visual.tether, 2, 0, 2, 0);
    (visual.tether.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    const ratio = working ? Math.max(0, Math.min(1, remaining / world.rules.support.repair_truck.durationSeconds)) : 0;
    visual.progress.visible = working;
    for (let i = 0; i <= 48; i++) {
      const angle = -Math.PI / 2 + i / 48 * Math.PI * 2 * ratio;
      const x = visual.x + Math.cos(angle) * radius, y = visual.y + Math.sin(angle) * radius;
      effectPoint(visual.progress, i, x - visual.x, this.heightAt(x, y) - ground + 1.3, y - visual.y);
    }
    (visual.progress.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    visual.dust.visible = !this.lowFx && !this.reducedMotion && (working && visual.age < 0.75 || incoming && visual.age < 0.6);
    visual.dust.position.set(visual.parkX, parkedHeight + 1.2, visual.parkY);
    visual.dust.scale.setScalar(12 + (working ? visual.age : 0.6 - visual.age) * 16);
    (visual.dust.material as MeshBasicMaterial).opacity = working ? Math.max(0, 0.4 - visual.age * 0.55) : 0.3;
    let links = 0;
    if (working) for (const entity of world.entities) {
      if (links >= (this.lowFx ? 3 : REPAIR_LINKS) || entity.team !== visual.team || !isOperational(entity) || !needsArmour(entity)) continue;
      const at = this.positionOf(entity.id) ?? entity.pos;
      if (Math.hypot(entity.pos.x - visual.x, entity.pos.y - visual.y) > radius) continue;
      const link = visual.links[links]!, weld = visual.welds[links]!;
      const tx = at.x - visual.x, tz = at.y - visual.y, ty = this.heightAt(at.x, at.y) - ground + 10;
      if (links === 0) visual.boom.rotation.y = -Math.atan2(tz - visual.parkY, tx - visual.parkX);
      effectPoint(link, 0, visual.parkX, parkedHeight + 15, visual.parkY);
      effectPoint(link, 1, (tx + visual.parkX) / 2, Math.max(ty, parkedHeight + 15) + 4, (tz + visual.parkY) / 2);
      effectPoint(link, 2, tx, ty, tz);
      (link.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (link.material as LineBasicMaterial).opacity = this.reducedMotion ? 0.7 : 0.65 + 0.22 * Math.sin(this.elapsed * 8 + links);
      link.visible = true; weld.visible = !this.lowFx; weld.position.set(tx, ty, tz);
      weld.scale.setScalar(this.reducedMotion ? 1.5 : 1.4 + 0.45 * Math.sin(this.elapsed * 13 + links));
      links++;
    }
    for (let i = links; i < REPAIR_LINKS; i++) { visual.links[i]!.visible = false; visual.welds[i]!.visible = false; }
  }
}
