import { canPresentEntity } from '../render3d/visibilityPresentation';
import type { SimEvent } from '../sim/events';
import {
  findEntity,
  type EntityId,
  type MechEntity,
  type World,
} from '../sim/types';

const DEFAULT_CAPACITY = 6;
const MAX_CAPACITY = 12;
const LIFE_MS = 850;
const EDGE_INSET = 32;

interface ScreenBody {
  x: number;
  y: number;
  radius: number;
}

interface CueViewport {
  width: number;
  height: number;
}

interface DirectionSlot {
  readonly element: HTMLElement;
  shooterId: EntityId | null;
  expiresAt: number;
  phase: boolean;
  tick: number;
}

type DirectionDocument = Pick<Document, 'createElement'>;

/** A fixed DOM budget makes a fusillade cost the same as a single warning. */
export class IncomingFireDirections {
  private readonly root: HTMLElement;
  private readonly slots: DirectionSlot[] = [];
  private readonly bearing = { x: 0, y: 0 };
  private next = 0;

  constructor(
    host: HTMLElement,
    private readonly bodyOf: (entity: MechEntity) => ScreenBody,
    private readonly directionOf: (entity: MechEntity, out: { x: number; y: number }) => void,
    private readonly viewportOf: () => CueViewport,
    capacity = DEFAULT_CAPACITY,
    dom: DirectionDocument = document,
    private readonly now: () => number = () => performance.now(),
  ) {
    const count = Math.max(1, Math.min(MAX_CAPACITY, Math.trunc(capacity)));
    this.root = dom.createElement('div');
    this.root.className = 'incoming-fire-directions';
    this.root.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < count; index += 1) {
      const element = dom.createElement('span');
      element.className = 'incoming-fire-tick';
      element.hidden = true;
      this.root.appendChild(element);
      this.slots.push({ element, shooterId: null, expiresAt: 0, phase: false, tick: -1 });
    }
    host.appendChild(this.root);
  }

  get nodeCount(): number {
    return this.slots.length + 1;
  }

  get activeCount(): number {
    this.expire(this.now());
    let count = 0;
    for (const slot of this.slots) if (slot.shooterId !== null) count += 1;
    return count;
  }

  consume(world: World, events: readonly SimEvent[], selection: readonly EntityId[]): void {
    const now = this.now();
    this.expire(now);
    const playerTeam = world.playerTeam ?? 0;
    for (const event of events) {
      if (event.type !== 'projectile_hit') continue;
      const target = findEntity(world, event.targetId);
      if (target === null || (target.team !== playerTeam && !selection.includes(target.id))) continue;
      // An indirect solution still does not disclose the shooter's exact body.
      // Project no bearing until the shared presentation boundary admits it.
      if (!canPresentEntity(world, event.shooterId)) continue;
      if (this.shownThisTick(event.shooterId, event.tick)) continue;
      const shooter = findEntity(world, event.shooterId);
      if (shooter === null) continue;
      const body = this.bodyOf(shooter);
      const viewport = this.viewportOf();
      if (!this.offScreen(body, viewport)) continue;
      this.directionOf(shooter, this.bearing);
      this.show(event.shooterId, event.tick, this.bearing, viewport, now);
    }
  }

  destroy(): void {
    this.root.remove();
  }

  private offScreen(body: ScreenBody, viewport: CueViewport): boolean {
    return (
      body.x + body.radius < 0 ||
      body.x - body.radius > viewport.width ||
      body.y + body.radius < 0 ||
      body.y - body.radius > viewport.height
    );
  }

  private show(
    shooterId: EntityId,
    tick: number,
    bearing: { x: number; y: number },
    viewport: CueViewport,
    now: number,
  ): void {
    let slot: DirectionSlot | undefined;
    for (const candidate of this.slots) {
      if (candidate.shooterId === shooterId) {
        slot = candidate;
        break;
      }
    }
    if (slot === undefined) {
      for (let offset = 0; offset < this.slots.length; offset += 1) {
        const index = (this.next + offset) % this.slots.length;
        const candidate = this.slots[index];
        if (candidate?.shooterId !== null) continue;
        slot = candidate;
        this.next = (index + 1) % this.slots.length;
        break;
      }
    }
    if (slot === undefined) {
      slot = this.slots[this.next];
      this.next = (this.next + 1) % this.slots.length;
    }
    if (slot === undefined) return;

    const centreX = viewport.width / 2;
    const centreY = viewport.height / 2;
    const dx = bearing.x;
    const dy = bearing.y;
    const halfWidth = Math.max(0, centreX - Math.min(EDGE_INSET, centreX));
    const halfHeight = Math.max(0, centreY - Math.min(EDGE_INSET, centreY));
    const scaleX = dx === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(dx);
    const scaleY = dy === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(dy);
    const scale = Math.min(scaleX, scaleY);
    const x = centreX + dx * scale;
    const y = centreY + dy * scale;
    const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;

    slot.shooterId = shooterId;
    slot.tick = tick;
    slot.expiresAt = now + LIFE_MS;
    slot.phase = !slot.phase;
    slot.element.hidden = false;
    slot.element.style.left = `${x.toFixed(1)}px`;
    slot.element.style.top = `${y.toFixed(1)}px`;
    slot.element.style.transform = `translate(-50%, -50%) rotate(${(degrees + 45).toFixed(1)}deg)`;
    slot.element.className = `incoming-fire-tick ${slot.phase ? 'pulse-a' : 'pulse-b'}`;
  }

  private expire(now: number): void {
    for (const slot of this.slots) {
      if (slot.shooterId === null || slot.expiresAt > now) continue;
      slot.shooterId = null;
      slot.element.hidden = true;
      slot.element.className = 'incoming-fire-tick';
    }
  }

  private shownThisTick(shooterId: EntityId, tick: number): boolean {
    for (const slot of this.slots) {
      if (slot.shooterId === shooterId && slot.tick === tick) return true;
    }
    return false;
  }
}
