import type { EntityId, Vec2 } from '../sim/types';

export interface RouteMarkerLeg {
  readonly points: readonly Vec2[];
  readonly kind: 'active' | 'queued';
  readonly run: boolean;
  /** Estimated approach bearing; move orders do not promise an exact terminal heading. */
  readonly arrivalFacing: number;
  readonly arrivalFacingEstimated: true;
  /** Approximate cumulative travel time from the unit's current position. */
  readonly cumulativeEtaSeconds: number | null;
}

export interface RouteMarkerView {
  readonly entityId: EntityId;
  readonly team: number;
  readonly legs: readonly RouteMarkerLeg[];
}
