import type { Design } from '../schema/design';
import type { Catalog } from '../schema/load';

/**
 * One name format everywhere a design is offered: the machine, its weight, its
 * class. A picker full of bare callsigns made every choice a memory test; the
 * two numbers that actually drive the choice ride along instead.
 */
export function designLabel(catalog: Catalog, design: Design): string {
  const chassis = catalog.chassis.get(design.chassisId);
  if (chassis === undefined) return design.name;
  const weightClass = chassis.class.charAt(0).toUpperCase() + chassis.class.slice(1);
  return `${design.name} — ${chassis.tonnage}t ${weightClass}`;
}
