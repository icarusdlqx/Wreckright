import { deserialiseCampaign } from '../campaign/save';
import { peekCampaignText } from '../campaign/storage';
import { getCatalog, type Catalog } from '../schema/load';
import { PUBLIC_DISCOVERY, type WikiDiscovery } from './library';

/** Reading the archive must not settle, migrate or recover the active save. */
export function readWikiDiscovery(catalog: Catalog = getCatalog()): WikiDiscovery {
  const stored = peekCampaignText();
  if (stored.kind !== 'found') return PUBLIC_DISCOVERY;
  try {
    const { state } = deserialiseCampaign(stored.text, catalog);
    if (state === null || !catalog.campaigns.has(state.campaignId)) return PUBLIC_DISCOVERY;
    return { campaignId: state.campaignId, completedNodes: [...state.completedNodes] };
  } catch {
    // An old or damaged company must not prevent public records from opening.
    return PUBLIC_DISCOVERY;
  }
}
