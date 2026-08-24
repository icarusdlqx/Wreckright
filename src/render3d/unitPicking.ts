import { Vector3 } from 'three';
import { radiusFor } from '../render/shape';
import { jumpHeight } from '../sim/movement';
import {
  isOperational,
  type EntityId,
  type MechEntity,
  type Vec2,
  type World,
} from '../sim/types';
import type { TacticalCamera, Viewport } from './camera';
import { canPresentEntity } from './visibilityPresentation';

export interface PickableUnitView {
  model: {
    root: { visible: boolean; position: { y: number } };
    height: number;
  };
}

/** Screen projection and hit testing share the same rendered pose callbacks. */
export class UnitPicking {
  private readonly delta = new Vector3();

  constructor(
    private readonly heightAt: (x: number, y: number) => number,
    private readonly at: (entity: MechEntity) => Vec2,
    private readonly viewOf: (id: EntityId) => PickableUnitView | undefined,
  ) {}

  screenBodyOf(
    entity: MechEntity,
    camera: TacticalCamera,
    viewport: Viewport,
  ): { x: number; y: number; radius: number } {
    const at = this.at(entity);
    const size = radiusFor(entity.tonnage);
    const view = this.viewOf(entity.id);
    const height = view?.model.height ?? size * 2;
    const base = this.baseY(entity, at, view);
    const topY = base + height;
    const visibleBase = Math.min(topY, Math.max(base, this.heightAt(at.x, at.y)));
    const centre = camera.worldToScreen(at, viewport, (visibleBase + topY) * 0.5);
    const top = camera.worldToScreen(at, viewport, topY);
    return { x: centre.x, y: centre.y, radius: Math.abs(top.y - centre.y) };
  }

  entityAtScreen(
    world: World,
    screen: Vec2,
    radiusPixels: number,
    camera: TacticalCamera,
    viewport: Viewport,
    wanted: (entity: MechEntity) => boolean,
  ): MechEntity | null {
    const visible = (entity: MechEntity): boolean =>
      canPresentEntity(world, entity.id) &&
      wanted(entity);

    const ray = camera.rayAt(screen, viewport);
    let bodyHit: MechEntity | null = null;
    let bodyAlong = Infinity;
    for (const entity of world.entities) {
      if (!visible(entity) || !isOperational(entity)) continue;
      const view = this.viewOf(entity.id);
      if (view === undefined || !view.model.root.visible) continue;

      const at = this.at(entity);
      const height = view.model.height;
      const radius = radiusFor(entity.tonnage) * 1.2;
      const footY = this.baseY(entity, at, view);

      this.delta.set(at.x - ray.origin.x, footY - ray.origin.y, at.y - ray.origin.z);
      const d = ray.direction;
      const dDotUp = d.y;
      const denominator = 1 - dDotUp * dDotUp;
      let along: number;
      let up: number;
      if (denominator < 1e-6) {
        along = this.delta.dot(d);
        up = 0;
      } else {
        const deltaDotD = this.delta.dot(d);
        const deltaDotUp = this.delta.y;
        along = (deltaDotD - dDotUp * deltaDotUp) / denominator;
        up = Math.max(0, Math.min(height, along * dDotUp - deltaDotUp));
        along = deltaDotD + up * dDotUp;
      }
      if (along < 0 || along >= bodyAlong) continue;

      const gapX = this.delta.x - along * d.x;
      const gapY = this.delta.y + up - along * d.y;
      const gapZ = this.delta.z - along * d.z;
      if (gapX * gapX + gapY * gapY + gapZ * gapZ > radius * radius) continue;
      bodyHit = entity;
      bodyAlong = along;
    }
    if (bodyHit !== null) return bodyHit;

    let best: MechEntity | null = null;
    let bestRange = radiusPixels;
    for (const entity of world.entities) {
      if (!visible(entity)) continue;
      const at = this.at(entity);
      const view = this.viewOf(entity.id);
      const height = view?.model.height ?? radiusFor(entity.tonnage) * 2;
      const base = this.baseY(entity, at, view);
      const top = base + height;
      const visibleBase = Math.min(top, Math.max(base, this.heightAt(at.x, at.y)));
      const body = camera.worldToScreen(
        at,
        viewport,
        (visibleBase + top) * 0.5,
      );
      const range = Math.hypot(body.x - screen.x, body.y - screen.y);
      if (range < bestRange) {
        best = entity;
        bestRange = range;
      }
    }
    return best;
  }

  private baseY(entity: MechEntity, at: Vec2, view: PickableUnitView | undefined): number {
    if (view?.model.root.visible === true && Number.isFinite(view.model.root.position.y)) {
      return view.model.root.position.y;
    }
    const lift = jumpHeight(entity) * radiusFor(entity.tonnage) * 2.2;
    return this.heightAt(at.x, at.y) + lift;
  }
}
