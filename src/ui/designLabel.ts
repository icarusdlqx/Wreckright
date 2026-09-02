import type { Design } from '../schema/design';
import type { Catalog } from '../schema/load';
import { machineCulturePresentation } from './mechbay/machineCulturePresentation';

type DesignIdentity = Pick<Design, 'id' | 'name' | 'chassisId'>;

const SERIAL_DESIGNATION = /\b[A-Z]{3}-\d+\b/g;

/** Replace a legacy model code without otherwise rewriting authored prose. */
export function replaceSerialDesignation(value: string, replacement: string): string {
  return value.replace(SERIAL_DESIGNATION, replacement);
}

/**
 * Legacy campaign history sometimes stores only a rendered machine name, with
 * no stable id to resolve. Remove just the old three-letter model code while
 * leaving callsigns and the rest of the sentence intact.
 */
export function stripSerialDesignation(value: string): string {
  return replaceSerialDesignation(value, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .trim();
}

/** Keep saved stock designs on their current authored name without renaming custom builds. */
export function authoredDesignName(
  catalog: Catalog,
  design: Pick<Design, 'id' | 'name'>,
): string {
  return catalog.designs.get(design.id)?.name ?? design.name;
}

/**
 * Use the chassis name when it identifies the only stock design on that
 * chassis. A callsign is retained only when multiple authored designs would
 * otherwise be indistinguishable. Unknown ids are player-authored builds and
 * keep their chosen name.
 */
export function machineDisplayName(catalog: Catalog, design: DesignIdentity): string {
  const current = catalog.designs.get(design.id);
  if (current === undefined) return design.name;
  const chassis = catalog.chassis.get(current.chassisId);
  if (chassis === undefined) return current.name;
  const siblingCount = [...catalog.designs.values()].filter(
    (entry) => entry.chassisId === current.chassisId,
  ).length;
  return siblingCount > 1 ? current.name : chassis.name;
}

function authoredDesign(catalog: Catalog, design: DesignIdentity): DesignIdentity {
  return catalog.designs.get(design.id) ?? design;
}

function titledWeightClass(weightClass: string): string {
  return weightClass.charAt(0).toUpperCase() + weightClass.slice(1);
}

/**
 * One name format everywhere a design is offered: the machine, its weight, its
 * class. A picker full of bare callsigns made every choice a memory test; the
 * two numbers that actually drive the choice ride along instead.
 */
export function designLabel(catalog: Catalog, design: DesignIdentity): string {
  const current = authoredDesign(catalog, design);
  const name = machineDisplayName(catalog, design);
  const chassis = catalog.chassis.get(current.chassisId);
  if (chassis === undefined) return name;
  return `${name} — ${chassis.tonnage}t ${titledWeightClass(chassis.class)}`;
}

/** One compact line for rows that must carry the machine's complete identity. */
export function designIdentityLabel(catalog: Catalog, design: DesignIdentity): string {
  const current = authoredDesign(catalog, design);
  const compact = designLabel(catalog, design);
  const chassis = catalog.chassis.get(current.chassisId);
  if (chassis === undefined) return compact;
  const culture = machineCulturePresentation(chassis.faction);
  return `${compact} · ${chassis.role} · ${culture.originLabel}`;
}
