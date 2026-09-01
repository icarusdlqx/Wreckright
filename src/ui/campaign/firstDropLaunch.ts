import { dropTeam, PLAYER_TEAM } from '../../campaign/campaign';
import { pristineCondition } from '../../campaign/repair';
import { findMech, type CampaignState, type MechRecord } from '../../campaign/types';
import { LOCATIONS } from '../../schema/common';
import { validateDesign } from '../../schema/designValidation';
import type { Catalog } from '../../schema/load';

function isPristine(catalog: Catalog, mech: MechRecord): boolean {
  if (mech.rebuildCost !== 0) return false;
  const expected = pristineCondition(catalog, mech.design);
  return LOCATIONS.every((location) => {
    const actual = mech.condition[location];
    const ready = expected[location];
    return actual.armour === ready.armour &&
      actual.rearArmour === ready.rearArmour &&
      actual.internal === ready.internal &&
      actual.destroyed === ready.destroyed;
  });
}

/** Whether prep can be skipped without hiding a decision or a problem. */
export function canLaunchFirstDropDirectly(catalog: Catalog, state: CampaignState): boolean {
  const contract = state.contract;
  if (contract === null || state.finished || state.pilots.length === 0) return false;
  const authoredLanceSize = catalog.missions.get(contract.missionId)?.lances
    .find((lance) => lance.team === PLAYER_TEAM)?.units.length ?? 0;
  if (authoredLanceSize === 0 || state.pilots.length !== authoredLanceSize) return false;

  const assignedMechs = new Set<string>();
  for (const pilot of state.pilots) {
    const mechId = pilot.mechId;
    if (
      pilot.dead ||
      pilot.injuredUntilDay > state.day ||
      state.benched.includes(pilot.id) ||
      mechId === null ||
      assignedMechs.has(mechId)
    ) return false;

    const mech = findMech(state, mechId);
    if (
      mech === null ||
      mech.status !== 'ready' ||
      mech.design.mounts.length === 0 ||
      !validateDesign(catalog, mech.design).valid ||
      !isPristine(catalog, mech)
    ) return false;
    assignedMechs.add(mechId);
  }

  const team = dropTeam(catalog, state, contract.missionId);
  return team.length === state.pilots.length && team.every(
    ({ mech, pilot }) => pilot.mechId === mech.id && assignedMechs.has(mech.id),
  );
}
