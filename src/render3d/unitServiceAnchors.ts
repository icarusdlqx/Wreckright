import type { Vector3 } from 'three';
import type { MechLocation } from '../schema/common';
import { locationWorldAnchor } from './locationAnchors';
import type { EntityView } from './unitViewFactory';

export function unitLocationAnchor(view: EntityView, location: MechLocation, out: Vector3,
  heightAt: (x: number, y: number) => number): void {
  if (locationWorldAnchor(view.anchors, location, out)) return;
  const top = view.model.root.position.y + view.model.height;
  const base = Math.min(top, Math.max(view.model.root.position.y,
    heightAt(view.model.root.position.x, view.model.root.position.z)));
  out.set(view.model.root.position.x, (base + top) * 0.5, view.model.root.position.z);
}

export function unitVentAnchor(view: EntityView, index: number, out: Vector3): boolean {
  if (!view.model.services.enabled) return false;
  const vent = view.model.services.vents[index % view.model.services.vents.length];
  if (vent === undefined) return false;
  vent.getWorldPosition(out);
  return true;
}
