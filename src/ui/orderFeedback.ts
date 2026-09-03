import type { OrderPulseView } from '../render3d/markerLayer';
import type { SimEvent } from '../sim/events';
import { findEntity, type Vec2, type World } from '../sim/types';

/** How long each mark stays on the ground, in wall time. */
export const ORDER_PULSE_MS = 650;
export const DROPPED_PULSE_MS = 2_000;
const MAX_PULSES = 24;

interface Pulse {
  at: Vec2;
  kind: OrderPulseView['kind'];
  bornAt: number;
  lifeMs: number;
}

/**
 * Where the player's orders land and where the machines gave them up. A
 * click that draws nothing is indistinguishable from a click the game
 * missed, and a route that quietly ends mid-map is indistinguishable from
 * the game forgetting it — both are the commonest "the controls are broken"
 * reports, and both are answered by a mark on the ground.
 */
export class OrderFeedback {
  private readonly pulses: Pulse[] = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  markOrder(at: Vec2): void {
    this.push({ x: at.x, y: at.y }, 'order', ORDER_PULSE_MS);
  }

  markDropped(at: Vec2): void {
    this.push({ x: at.x, y: at.y }, 'dropped', DROPPED_PULSE_MS);
  }

  /** Reads the simulation's own report of abandoned routes, player side only. */
  consume(world: World, events: readonly SimEvent[]): void {
    const playerTeam = world.playerTeam;
    for (const event of events) {
      if (event.type !== 'order_dropped') continue;
      const entity = findEntity(world, event.entityId);
      if (entity === null || playerTeam === null || entity.team !== playerTeam) continue;
      this.markDropped({ x: event.x, y: event.y });
    }
  }

  /** Live marks with how far through their life they are, oldest first. */
  views(): OrderPulseView[] {
    const now = this.now();
    const out: OrderPulseView[] = [];
    for (let index = this.pulses.length - 1; index >= 0; index -= 1) {
      const pulse = this.pulses[index];
      if (pulse === undefined) continue;
      if (now - pulse.bornAt >= pulse.lifeMs) {
        this.pulses.splice(index, 1);
        continue;
      }
      out.push({ at: pulse.at, kind: pulse.kind, progress: (now - pulse.bornAt) / pulse.lifeMs });
    }
    return out.reverse();
  }

  private push(at: Vec2, kind: OrderPulseView['kind'], lifeMs: number): void {
    if (this.pulses.length >= MAX_PULSES) this.pulses.shift();
    this.pulses.push({ at, kind, bornAt: this.now(), lifeMs });
  }
}
