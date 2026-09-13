import { dropTonnageFor } from '../campaign/campaign';
import type { Catalog } from '../schema/load';
import type { BriefingLance } from './Briefing';
import { designIdentityLabel, machineDisplayName } from './designLabel';
import { berthDesign, lanceTonnage, type SkirmishBerth, type SkirmishFaction } from './lance';
import { listStoredDesigns, loadFromStorage } from './mechbay/editor';
import { pilotAtDifficulty } from '../sim/pilotDifficulty';
import { skirmishDesignAllowed } from './skirmishFaction';

export function briefingLanceFor(
  catalog: Catalog,
  missionId: string,
  lance: SkirmishBerth[],
  onLance: (next: SkirmishBerth[]) => void,
  onCustomise: (index: number) => void,
  playerDifficulty?: string,
  faction: SkirmishFaction = 'mixed',
): BriefingLance {
  return {
    berths: lance.map((berth, index) => {
      const design = berthDesign(catalog, berth);
      const pilot = catalog.pilots.get(berth.pilotId);
      const delta = playerDifficulty === undefined ? undefined : catalog.rules.difficulty.tiers[playerDifficulty]?.skillDelta;
      return {
        index,
        designValue: berth.empty === true ? 'empty' : (berth.designId ?? 'custom'),
        customLabel:
          berth.designId === null && design !== null
            ? designIdentityLabel(catalog, design)
            : null,
        machine: design === null ? null : {
          chassisId: design.chassisId, name: machineDisplayName(catalog, design),
          identity: designIdentityLabel(catalog, design),
          role: catalog.chassis.get(design.chassisId)?.role ?? '',
          weaponCount: design.mounts.length,
        },
        pilotId: berth.pilotId,
        tonnage: catalog.chassis.get(design?.chassisId ?? '')?.tonnage ?? 0,
        pilot: pilot === undefined ? null : pilotAtDifficulty(pilot, 0, 0, undefined, delta),
      };
    }),
    // A dropship berth is for something that walks; vehicles and emplacements
    // remain opposition even when their cards share the design catalogue.
    designs: [...catalog.designs.values()]
      .filter((design) => skirmishDesignAllowed(catalog, design, faction))
      .map((design) => ({
        value: design.id,
        label: `${designIdentityLabel(catalog, design)} · Prime`,
      })),
    saved: listStoredDesigns().flatMap((id) => {
      const stored = loadFromStorage(id, catalog).design;
      return stored === null || !skirmishDesignAllowed(catalog, stored, faction) ? [] : [{
        value: `saved:${id}`,
        label: designIdentityLabel(catalog, stored),
      }];
    }),
    pilots: [...catalog.pilots.values()].map((pilot) => ({ id: pilot.id, name: pilot.name })),
    total: lanceTonnage(catalog, lance),
    allowance: dropTonnageFor(catalog, missionId),
    onDesign: (index, value) => {
      const next = lance.map((berth) => ({ ...berth }));
      const target = next[index];
      if (target === undefined) return;
      if (value === 'empty') {
        target.empty = true;
        target.designId = null;
        delete target.design;
      } else if (value.startsWith('saved:')) {
        const stored = loadFromStorage(value.slice('saved:'.length), catalog);
        if (stored.design === null || !skirmishDesignAllowed(catalog, stored.design, faction)) return;
        delete target.empty;
        target.designId = null;
        target.design = stored.design;
      } else if (value !== 'custom') {
        if (!skirmishDesignAllowed(catalog, catalog.designs.get(value), faction)) return;
        delete target.empty;
        target.designId = value;
        delete target.design;
      }
      onLance(next);
    },
    onPilot: (index, pilotId) => {
      const next = lance.map((berth) => ({ ...berth }));
      const target = next[index];
      if (target === undefined || !catalog.pilots.has(pilotId)) return;
      target.pilotId = pilotId;
      onLance(next);
    },
    onCustomise,
  };
}
