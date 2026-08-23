import { LOCATIONS, type MechLocation } from './common';
import { DesignSchema, type Design } from './design';
import type { Catalog } from './load';
import { computeLoadout, type Loadout, type LoadoutIssue } from '../sim/loadout';

export type DesignIssueSeverity = 'error' | 'warning';
export type DesignIssueSource = 'schema' | 'loadout';
export type DesignIssueComponent =
  | 'identity'
  | 'chassis'
  | 'armour'
  | 'heat_sink'
  | 'weapon'
  | 'ammo'
  | 'equipment'
  | 'loadout';
export type DesignIssueCode =
  | LoadoutIssue['code']
  | 'invalid_schema'
  | 'rear_armour'
  | 'ineffective_equipment';

export interface DesignIssue {
  readonly code: DesignIssueCode;
  readonly severity: DesignIssueSeverity;
  readonly source: DesignIssueSource;
  readonly component: DesignIssueComponent;
  readonly location: MechLocation | null;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

export interface DesignReport {
  readonly valid: boolean;
  readonly loadout: Loadout;
  readonly issues: readonly DesignIssue[];
}

const LOCATION_IDS = new Set<string>(LOCATIONS);

function asLocation(value: unknown): MechLocation | null {
  return typeof value === 'string' && LOCATION_IDS.has(value)
    ? value as MechLocation
    : null;
}

function loadoutComponent(issue: LoadoutIssue): DesignIssueComponent {
  if (issue.reference === 'ammo') return 'ammo';
  switch (issue.code) {
    case 'unknown_chassis':
      return 'chassis';
    case 'armour':
      return 'armour';
    case 'unknown_heat_sink':
    case 'heat_sinks':
      return 'heat_sink';
    case 'unknown_weapon':
    case 'hardpoint':
    case 'hardpoint_size':
    case 'dry_weapon':
      return 'weapon';
    case 'energy_ammo':
    case 'orphan_ammo':
      return 'ammo';
    case 'unknown_equipment':
    case 'jump_jets':
      return 'equipment';
    case 'overweight':
    case 'slots':
      return 'loadout';
  }
}

function loadoutPath(issue: LoadoutIssue): (string | number)[] {
  if (issue.reference === 'ammo') return ['ammo'];
  switch (issue.code) {
    case 'unknown_chassis':
      return ['chassisId'];
    case 'armour':
      return issue.location === null ? ['armour'] : ['armour', issue.location];
    case 'unknown_heat_sink':
      return ['heatSinkId'];
    case 'heat_sinks':
      return ['heatSinks'];
    case 'unknown_weapon':
    case 'hardpoint':
    case 'hardpoint_size':
    case 'dry_weapon':
      return ['mounts'];
    case 'energy_ammo':
    case 'orphan_ammo':
      return ['ammo'];
    case 'unknown_equipment':
    case 'jump_jets':
      return ['equipment'];
    case 'overweight':
    case 'slots':
      return [];
  }
}

function schemaComponent(path: readonly PropertyKey[]): DesignIssueComponent {
  switch (path[0]) {
    case 'id':
    case 'name':
      return 'identity';
    case 'chassisId':
      return 'chassis';
    case 'armour':
    case 'rearArmour':
      return 'armour';
    case 'heatSinkId':
    case 'heatSinks':
      return 'heat_sink';
    case 'mounts':
      return 'weapon';
    case 'ammo':
      return 'ammo';
    case 'equipment':
      return 'equipment';
    default:
      return 'loadout';
  }
}

function schemaLocation(design: Design, path: readonly PropertyKey[]): MechLocation | null {
  if (path[0] === 'armour' || path[0] === 'rearArmour') return asLocation(path[1]);
  const index = typeof path[1] === 'number' ? path[1] : null;
  if (index === null) return null;
  if (path[0] === 'mounts') return asLocation(design.mounts[index]?.location);
  if (path[0] === 'ammo') return asLocation(design.ammo[index]?.location);
  if (path[0] === 'equipment') return asLocation(design.equipment[index]?.location);
  return null;
}

/** The one legality boundary used by authored content, the bay and campaign refits. */
export function validateDesign(catalog: Catalog, design: Design): DesignReport {
  const loadout = computeLoadout(catalog, design);
  const issues: DesignIssue[] = loadout.issues.map((issue) => ({
    code: issue.code,
    severity: 'error',
    source: 'loadout',
    component: loadoutComponent(issue),
    location: issue.location,
    path: loadoutPath(issue),
    message: issue.message,
  }));

  const parsed = DesignSchema.safeParse(design);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.map(String).join('.') || '(root)';
      issues.push({
        code: issue.path[0] === 'rearArmour' ? 'rear_armour' : 'invalid_schema',
        severity: 'error',
        source: 'schema',
        component: schemaComponent(issue.path),
        location: schemaLocation(design, issue.path),
        path: issue.path.map((part) => typeof part === 'symbol' ? String(part) : part),
        message: `${path}: ${issue.message}`,
      });
    }
  }

  design.equipment.forEach((fit, index) => {
    const equipment = catalog.equipment.get(fit.equipmentId);
    if ((equipment?.stats.ammo_blast_containment ?? 0) <= 0) return;
    const containsAmmo = design.ammo.some(
      (load) => load.location === fit.location && load.tons > 0,
    );
    if (containsAmmo) return;

    issues.push({
      code: 'ineffective_equipment',
      severity: 'warning',
      source: 'loadout',
      component: 'equipment',
      location: fit.location,
      path: ['equipment', index, 'location'],
      message: `${equipment?.name ?? fit.equipmentId} only protects ammunition in the same location; no ammunition is fitted there`,
    });
  });

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    loadout,
    issues,
  };
}
