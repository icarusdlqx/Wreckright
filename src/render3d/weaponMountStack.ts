import { Box3, type Object3D } from 'three';
import type { MechLocation } from '../schema/common';

/** A location's first weapon keeps its authored anchor; later bodies clear the one below. */
export class WeaponMountStack {
  private readonly locations = new Map<MechLocation, { top: number; offset: number }>();

  constructor(private readonly scale: number) {}

  place(location: MechLocation, weapon: Object3D): number {
    const bounds = new Box3().setFromObject(weapon);
    const previous = this.locations.get(location);
    const offset = previous === undefined ? 0 : Math.max(
      previous.offset + this.scale * 0.22,
      previous.top - bounds.min.y + this.scale * 0.035,
    );
    this.locations.set(location, { top: bounds.max.y + offset, offset });
    return offset;
  }
}
