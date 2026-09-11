import type { Vector3 } from 'three';
import type { MechLocation } from '../schema/common';
import type { EntityId, Vec2, World } from '../sim/types';
import type { Viewport } from './camera';

export interface BattleFeedbackBindings {
  anchorOf: (id: EntityId, location: MechLocation, out: Vector3) => boolean;
  contactOf?: (id: EntityId, location: MechLocation, bearing: number, out: Vector3) => boolean;
  canLocate?: (id: EntityId) => boolean;
  currentPositionOf?: (id: EntityId) => Vec2 | null;
  readouts?: {
    host: HTMLElement;
    world: World;
    viewport: () => Viewport;
  };
}
