import { buyMech, type Listing } from '../../campaign/market';
import type { CampaignState, MechRecord } from '../../campaign/types';
import type { Catalog } from '../../schema/load';
import type { DropPayload } from '../mechbay/dropPayload';
import { shelfFit } from '../mechbay/shelfFit';
import type { InspectorFit } from '../mechbay/Dossier';
import { refitAvailability } from '../../campaign/refitQuote';
import { evaluateEdit } from '../mechbay/editPreview';

export function ownedPartFits(catalog: Catalog, state: CampaignState, part: DropPayload, includesPurchase = false) {
  return state.mechs.filter((mech) => mech.status === 'ready').map((mech) => {
    const stocked = refitAvailability(state, mech);
    const availability = { weapon: new Map(stocked.weapon), equipment: new Map(stocked.equipment) };
    if (includesPurchase && part.kind !== 'ammo') {
      const store = availability[part.kind];
      store.set(part.id, (store.get(part.id) ?? 0) + 1);
    }
    const cooling = part.kind === 'equipment' && catalog.equipment.get(part.id)?.category === 'heat_sink';
    let fit: InspectorFit;
    if (cooling) {
      const swapping = part.id !== mech.design.heatSinkId;
      const evaluation = evaluateEdit(catalog, mech.design, { type: 'set_cooling', heatSinkId: part.id,
        heatSinks: mech.design.heatSinks + (swapping ? 0 : 1) }, availability);
      fit = { ok: evaluation.status !== 'blocked' && evaluation.report.valid,
        reason: evaluation.reasons[0]?.message ?? evaluation.report.issues[0]?.message
          ?? 'Review sink type and quantity in Armour & cooling.', replacementOnly: swapping };
    } else fit = shelfFit(catalog, mech.design, part, availability, null);
    return { mech, fit };
  });
}

/** Preview the actual purchase path, so a yard card never invents its condition. */
export function inspectYardListing(catalog: Catalog, state: CampaignState, listing: Listing): MechRecord | null {
  const preview = structuredClone(state);
  preview.cbills = Math.max(preview.cbills, listing.price);
  const before = new Set(preview.mechs.map((mech) => mech.id));
  if (!buyMech(catalog, preview, listing.id).ok) return null;
  return preview.mechs.find((mech) => !before.has(mech.id)) ?? null;
}

export interface SaleUndo {
  before: CampaignState;
  after: string;
  name: string;
}

export function canUndoSale(state: CampaignState, receipt: SaleUndo | null): receipt is SaleUndo {
  return receipt !== null && JSON.stringify(state) === receipt.after;
}

export function undoSale(state: CampaignState, receipt: SaleUndo): boolean {
  if (!canUndoSale(state, receipt)) return false;
  Object.assign(state, structuredClone(receipt.before));
  return true;
}
