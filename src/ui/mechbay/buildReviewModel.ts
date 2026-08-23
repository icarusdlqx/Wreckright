import type {
  DesignIssue,
  DesignIssueCode,
  DesignIssueComponent,
} from '../../schema/designValidation';
import { validateDesign } from '../../schema/designValidation';
import type { MechLocation } from '../../schema/common';
import type { Design } from '../../schema/design';
import type { Catalog } from '../../schema/load';
import type { HeatProfile, Loadout } from '../../sim/loadout';
import type { BayWorkspaceTab } from './BayWorkspaceTabs';

export interface BuildReviewMetric {
  readonly id: 'tonnage' | 'slots' | 'armour' | 'cooling';
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: 'ok' | 'warn';
}

export interface BuildReviewGearLine {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
}

export interface BuildReviewIssue extends DesignIssue {
  readonly action: string;
  readonly locationLabel: string | null;
}

export interface BuildReviewIssueGroup {
  readonly component: DesignIssueComponent;
  readonly label: string;
  readonly issues: readonly BuildReviewIssue[];
}

export interface BuildReviewSummary {
  readonly legal: boolean;
  readonly verdict: string;
  readonly verdictDetail: string;
  readonly issueCount: number;
  readonly metrics: readonly BuildReviewMetric[];
  readonly weapons: readonly BuildReviewGearLine[];
  readonly ammunition: readonly BuildReviewGearLine[];
  readonly issueGroups: readonly BuildReviewIssueGroup[];
  readonly nextAction: string;
  readonly nextTab: BayWorkspaceTab | null;
}

const COMPONENT_LABELS: Readonly<Record<DesignIssueComponent, string>> = {
  identity: 'Design identity',
  chassis: 'Chassis',
  armour: 'Armour',
  heat_sink: 'Cooling',
  weapon: 'Weapons',
  ammo: 'Ammunition',
  equipment: 'Equipment',
  loadout: 'Overall fit',
};

const COMPONENT_ORDER: readonly DesignIssueComponent[] = [
  'chassis',
  'identity',
  'loadout',
  'weapon',
  'ammo',
  'equipment',
  'heat_sink',
  'armour',
];

function readableLocation(location: MechLocation | null): string | null {
  if (location === null) return null;
  const words = location.replaceAll('_', ' ');
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function uniqueLocations(locations: readonly MechLocation[]): string {
  return [...new Set(locations.map((location) => readableLocation(location) ?? ''))]
    .filter((location) => location !== '')
    .join(', ');
}

function issueAction(code: DesignIssueCode): string {
  switch (code) {
    case 'unknown_chassis':
      return 'Choose a chassis that is present in the catalog.';
    case 'unknown_weapon':
      return 'Replace the missing weapon reference with a catalogued weapon.';
    case 'unknown_equipment':
      return 'Replace the missing equipment reference with catalogued gear.';
    case 'unknown_heat_sink':
      return 'Choose a catalogued cooling system.';
    case 'overweight':
      return 'Remove payload or reduce armour until the design is within tonnage.';
    case 'hardpoint':
      return 'Move or remove the weapon, or choose a matching hardpoint.';
    case 'hardpoint_size':
      return 'Move the weapon to a mount rated for its size or choose a smaller weapon.';
    case 'slots':
      return 'Remove or relocate fittings until slot use is within capacity.';
    case 'armour':
      return 'Reduce armour at this location to its chassis limit.';
    case 'heat_sinks':
      return 'Restore at least the cooling bank built into the chassis.';
    case 'dry_weapon':
      return 'Add a matching ammunition bin in a legal location.';
    case 'orphan_ammo':
      return 'Mount the matching weapon or remove this ammunition bin.';
    case 'energy_ammo':
      return 'Remove this bin; the matching weapon does not consume ammunition.';
    case 'ineffective_equipment':
      return 'Move this containment unit beside an ammunition bin, or remove it.';
    case 'jump_jets':
      return 'Remove jump equipment from this chassis.';
    case 'rear_armour':
      return 'Move rear plate within the paid torso armour total.';
    case 'invalid_schema':
      return 'Return this field to an allowed value.';
  }
}

function groupIssues(issues: readonly DesignIssue[]): BuildReviewIssueGroup[] {
  const grouped = new Map<DesignIssueComponent, BuildReviewIssue[]>();
  for (const issue of issues) {
    const entries = grouped.get(issue.component) ?? [];
    entries.push({
      ...issue,
      action: issueAction(issue.code),
      locationLabel: readableLocation(issue.location),
    });
    grouped.set(issue.component, entries);
  }
  return COMPONENT_ORDER.flatMap((component): BuildReviewIssueGroup[] => {
    const entries = grouped.get(component);
    return entries === undefined
      ? []
      : [{ component, label: COMPONENT_LABELS[component], issues: entries }];
  });
}

function weaponLines(catalog: Catalog, design: Design): BuildReviewGearLine[] {
  const grouped = new Map<string, MechLocation[]>();
  for (const mount of design.mounts) {
    const locations = grouped.get(mount.weaponId) ?? [];
    locations.push(mount.location);
    grouped.set(mount.weaponId, locations);
  }
  return [...grouped].map(([weaponId, locations]) => {
    const weapon = catalog.weapons.get(weaponId);
    const count = locations.length;
    return {
      id: weaponId,
      label: `${weapon?.name ?? `Unknown weapon (${weaponId})`}${count === 1 ? '' : ` ×${count}`}`,
      detail: uniqueLocations(locations),
    };
  }).sort((left, right) => left.label.localeCompare(right.label));
}

function ammoLines(catalog: Catalog, design: Design): BuildReviewGearLine[] {
  const grouped = new Map<string, { tons: number; bins: number; locations: MechLocation[] }>();
  for (const load of design.ammo) {
    const entry = grouped.get(load.weaponId) ?? { tons: 0, bins: 0, locations: [] };
    entry.tons += load.tons;
    entry.bins += 1;
    entry.locations.push(load.location);
    grouped.set(load.weaponId, entry);
  }
  return [...grouped].map(([weaponId, entry]) => {
    const weapon = catalog.weapons.get(weaponId);
    const rounds = weapon?.ammoPerTon === null || weapon?.ammoPerTon === undefined
      ? null
      : entry.tons * weapon.ammoPerTon;
    return {
      id: weaponId,
      label: `${weapon?.name ?? `Unknown weapon (${weaponId})`} ammunition`,
      detail: [
        `${entry.tons}t`,
        rounds === null ? null : `${rounds} rounds`,
        `${entry.bins} ${entry.bins === 1 ? 'bin' : 'bins'}`,
        uniqueLocations(entry.locations),
      ].filter((part): part is string => part !== null && part !== '').join(' · '),
    };
  }).sort((left, right) => left.label.localeCompare(right.label));
}

function targetTab(component: DesignIssueComponent): BayWorkspaceTab {
  return component === 'armour' || component === 'heat_sink' ? 'armour' : 'loadout';
}

function workspaceLabel(tab: BayWorkspaceTab): string {
  return tab === 'armour' ? 'Armour & Cooling' : 'Loadout';
}

export function buildReviewSummary(
  catalog: Catalog,
  design: Design,
  loadout: Loadout,
  heat: HeatProfile,
): BuildReviewSummary {
  const report = validateDesign(catalog, design);
  const issueGroups = groupIssues(report.issues);
  const firstGroup = issueGroups[0];
  const firstIssue = firstGroup?.issues[0];
  const nextTab = firstGroup === undefined ? null : targetTab(firstGroup.component);
  const sinkName = catalog.equipment.get(design.heatSinkId)?.name ?? design.heatSinkId;
  const freeSlots = loadout.totalSlotsAvailable - loadout.totalSlotsUsed;
  const legal = report.valid;
  const blockingCount = report.issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = report.issues.filter((issue) => issue.severity === 'warning').length;

  return {
    legal,
    verdict: legal ? 'Legal build' : 'Build not legal',
    verdictDetail: legal
      ? warningCount === 0
        ? 'Every construction check passed.'
        : `${warningCount} advisory ${warningCount === 1 ? 'note' : 'notes'}; this build can still be saved.`
      : `${blockingCount} ${blockingCount === 1 ? 'issue blocks' : 'issues block'} this build.`,
    issueCount: report.issues.length,
    metrics: [
      {
        id: 'tonnage',
        label: 'Tonnage',
        value: `${loadout.usedWeight.toFixed(1)} / ${loadout.tonnage.toFixed(0)}t`,
        detail: loadout.freeTonnage >= 0
          ? `${loadout.freeTonnage.toFixed(1)}t free`
          : `${Math.abs(loadout.freeTonnage).toFixed(1)}t overweight`,
        tone: loadout.freeTonnage >= 0 ? 'ok' : 'warn',
      },
      {
        id: 'slots',
        label: 'Slots',
        value: `${loadout.totalSlotsUsed} / ${loadout.totalSlotsAvailable}`,
        detail: freeSlots >= 0
          ? `${freeSlots} ${freeSlots === 1 ? 'slot' : 'slots'} free`
          : `${Math.abs(freeSlots)} over capacity`,
        tone: freeSlots >= 0 ? 'ok' : 'warn',
      },
      {
        id: 'armour',
        label: 'Armour',
        value: `${loadout.armourPoints} points`,
        detail: `${loadout.armourWeight.toFixed(1)}t of paid plate`,
        tone: report.issues.some((issue) => issue.component === 'armour') ? 'warn' : 'ok',
      },
      {
        id: 'cooling',
        label: 'Cooling',
        value: `${heat.dissipationPerSecond.toFixed(2)} heat/s`,
        detail: `${design.heatSinks} × ${sinkName} · ${heat.sustainable ? 'sustained fire is stable' : 'continuous fire builds heat'}`,
        tone: heat.sustainable ? 'ok' : 'warn',
      },
    ],
    weapons: weaponLines(catalog, design),
    ammunition: ammoLines(catalog, design),
    issueGroups,
    nextAction: legal
      ? 'Ready to commit. Save this build, or return to a workspace to make another change.'
      : `Open ${workspaceLabel(nextTab ?? 'loadout')} and ${firstIssue?.action.toLowerCase() ?? 'fix the highlighted issue.'}`,
    nextTab,
  };
}
