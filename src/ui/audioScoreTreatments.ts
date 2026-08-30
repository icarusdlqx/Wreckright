import type { CampaignState } from '../campaign/types';
import type { Design } from '../schema/design';
import type { Faction } from '../schema/faction';
import type { Catalog } from '../schema/load';

export type StrategicScoreSurface = 'campaign' | 'mechbay';

export interface ScoreTreatment {
  readonly intensity: number;
  readonly level: number;
}

/** Navigation stays below the battlefield while the bay keeps a faint work rhythm. */
export const STRATEGIC_SCORE_TREATMENTS: Readonly<
  Record<StrategicScoreSurface, ScoreTreatment>
> = {
  campaign: { intensity: 0, level: 0.6 },
  mechbay: { intensity: 0.3, level: 0.72 },
};

export function factionCultureShare(faction: Faction | null): number | null {
  if (faction === 'aurelian') return 1;
  if (faction === 'linewrought') return 0;
  return null;
}

export function knownDesignCultureShare(
  catalog: Pick<Catalog, 'chassis'>,
  designs: readonly Pick<Design, 'chassisId'>[],
): number | null {
  let aurelian = 0;
  let linewrought = 0;
  for (const design of designs) {
    const faction = catalog.chassis.get(design.chassisId)?.faction;
    if (faction === 'aurelian') aurelian += 1;
    if (faction === 'linewrought') linewrought += 1;
  }
  const known = aurelian + linewrought;
  return known === 0 ? null : aurelian / known;
}

/** A hulk is salvage on the floor, not yet part of the company's musical identity. */
export function campaignCultureShare(
  catalog: Pick<Catalog, 'chassis'>,
  state: Pick<CampaignState, 'mechs'>,
): number | null {
  return knownDesignCultureShare(
    catalog,
    state.mechs.filter((mech) => mech.status !== 'hulk').map((mech) => mech.design),
  );
}
