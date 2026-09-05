import {
  fitFromStore,
  stripToStore,
} from '../../campaign/refit';
import { buyMech, buyPart, marketListings, partMarketListings, saleValueOf, sellMech } from '../../campaign/market';
import type { CampaignState } from '../../campaign/types';
import { getCatalog } from '../../schema/load';
import { computeLoadout } from '../../sim/loadout';
import { authoredDesignName, designIdentityLabel } from '../designLabel';
import { yardStockLine } from './factionEconomy';

const catalog = getCatalog();

export { BarracksPanel } from './BarracksPanel';
export { MechBayPanel } from './CompanyWorkshop';

export function cbills(value: number): string {
  return `${Math.round(value).toLocaleString('en-GB')} C`;
}

export interface PanelProps {
  state: CampaignState;
  /**
   * Applies a change to a copy of the campaign. What the change returns is what
   * the screen says about it, so a refusal reports itself rather than being
   * overwritten by the caption of the button that hoped it would work.
   */
  mutate: (change: (draft: CampaignState) => string | null | void, message?: string) => void;
}

export function StoresPanel({ state, mutate }: PanelProps) {
  return (
      <section className="camp-store" data-testid="camp-store">
        <h3>Stores</h3>
        {state.store.length === 0 ? (
          <p className="empty">Nothing salvaged yet.</p>
        ) : (
          <ul>
            {state.store.map((item) => (
              <li key={`${item.kind}:${item.itemId}`} data-testid={`camp-store-${item.itemId}`}>
                <span>
                  {catalog.weapons.get(item.itemId)?.name ??
                    catalog.equipment.get(item.itemId)?.name ??
                    item.itemId}{' '}
                  × {item.count}
                </span>
                {item.kind === 'weapon' ? (
                  <select
                    value=""
                    onChange={(event) => {
                      if (event.target.value === '') return;
                      const mechId = event.target.value;
                      mutate((draft) => {
                        const target = draft.mechs.find((entry) => entry.id === mechId);
                        if (target === undefined) return null;
                        const result = fitFromStore(catalog, draft, target, item.itemId);
                        return result.ok
                          ? `Fitted to ${authoredDesignName(catalog, target.design)} ${result.location}.`
                          : result.reason;
                      });
                    }}
                    data-testid={`camp-fit-${item.itemId}`}
                  >
                    <option value="">Fit to…</option>
                    {state.mechs
                      .filter((mech) => mech.status === 'ready')
                      .map((mech) => (
                        <option key={mech.id} value={mech.id}>
                          {designIdentityLabel(catalog, mech.design)}
                        </option>
                      ))}
                  </select>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <h3>Strip</h3>
        <ul className="camp-strip">
          {state.mechs
            .filter((mech) => mech.status === 'ready')
            .map((mech) => (
              <li key={mech.id}>
                <span>{designIdentityLabel(catalog, mech.design)}</span>
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value === '') return;
                    const index = Number(event.target.value);
                    mutate((draft) => {
                      const target = draft.mechs.find((entry) => entry.id === mech.id);
                      if (target === undefined) return null;
                      const result = stripToStore(catalog, draft, target, index);
                      return result.ok
                        ? `Stripped from ${authoredDesignName(catalog, target.design)}.`
                        : result.reason;
                    });
                  }}
                >
                  <option value="">Strip…</option>
                  {mech.design.mounts.map((mount, index) => (
                    <option key={`${mount.weaponId}-${index}`} value={index}>
                      {catalog.weapons.get(mount.weaponId)?.name ?? mount.weaponId} ({mount.location})
                    </option>
                  ))}
                </select>
                <span className="strip-legal">
                  {computeLoadout(catalog, mech.design).valid ? '' : 'illegal build'}
                </span>
              </li>
            ))}
        </ul>
      </section>
  );
}


/**
 * The yard. Machines used to enter the company only as salvage and never leave
 * it, which made a mech the one asset with no price on it — a bay full of hulls
 * you could not use and could not turn into anything else.
 */
export function MarketPanel({ state, mutate }: PanelProps) {
  const listings = marketListings(catalog, state);
  const partListings = partMarketListings(catalog, state);
  const signed = state.contract !== null;

  return (
    <section className="camp-market" data-testid="camp-market">
      <h3>Yard</h3>
      <p className="yard-stock-note" data-testid="yard-stock-note">
        {yardStockLine(catalog)}
      </p>

      <h4>On the lot</h4>
      <ul className="market-stock">
        {listings.length === 0 ? (
          <li className="empty">Nothing on the lot this week.</li>
        ) : (
          listings.map((listing) => {
            const designName = authoredDesignName(catalog, listing.design);
            return (
              <li key={listing.id} data-testid={`market-${listing.id}`}>
                <span className="market-name">
                  {designIdentityLabel(catalog, listing.design)}
                  {listing.worn ? <small>sold as seen</small> : null}
                </span>
                <span className="market-price">{cbills(listing.price)}</span>
                <button
                  type="button"
                  disabled={state.cbills < listing.price}
                  title={
                    state.cbills < listing.price
                      ? `${cbills(listing.price - state.cbills)} short`
                      : `Buy the ${designName}`
                  }
                  onClick={() =>
                    mutate((draft) => {
                      const result = buyMech(catalog, draft, listing.id);
                      return result.ok ? `Bought a ${designName}.` : result.reason;
                    })
                  }
                  data-testid={`market-buy-${listing.id}`}
                >
                  Buy
                </button>
              </li>
            );
          })
        )}
      </ul>

      <h4>Parts counter</h4>
      <ul className="market-stock" data-testid="market-parts">
        {partListings.length === 0 ? (
          <li className="empty">No crates on the counter this week.</li>
        ) : (
          partListings.map((listing) => (
            <li key={listing.id} data-testid={`market-part-${listing.id}`}>
              <span className="market-name">
                {listing.name}
                <small>{listing.kind === 'weapon' ? 'Weapon' : 'Gear'} · to stores</small>
              </span>
              <span className="market-price">{cbills(listing.price)}</span>
              <button
                type="button"
                disabled={state.cbills < listing.price}
                title={
                  state.cbills < listing.price
                    ? `${cbills(listing.price - state.cbills)} short`
                    : `Buy a ${listing.name} for stores`
                }
                onClick={() =>
                  mutate((draft) => {
                    const result = buyPart(catalog, draft, listing.id);
                    return result.ok ? `A ${listing.name} arrives in stores.` : result.reason;
                  })
                }
                data-testid={`market-buy-part-${listing.id}`}
              >
                Buy
              </button>
            </li>
          ))
        )}
      </ul>

      <h4>{signed ? 'Sell — not while a contract is signed' : 'Sell'}</h4>
      <ul className="market-sell">
        {state.mechs.map((mech) => {
          const booked = mech.status === 'repairing';
          const designName = authoredDesignName(catalog, mech.design);
          return (
            <li key={mech.id} data-testid={`market-sell-row-${mech.id}`}>
              <span className="market-name">
                {designIdentityLabel(catalog, mech.design)}
                <small>
                  {mech.status === 'hulk'
                    ? 'wreck'
                    : booked
                      ? `paid workshop booking · ready day ${mech.readyOnDay}`
                      : mech.design.mounts.length === 0
                        ? 'needs a weapon'
                        : mech.status}
                </small>
              </span>
              <span className="market-price">{cbills(saleValueOf(catalog, mech))}</span>
              <button
                type="button"
                // A signed contract protects the drop; a paid booking protects
                // the queue. Both rules refuse the operation at the model too.
                disabled={signed || state.mechs.length <= 1 || booked}
                title={booked ? 'This paid workshop booking must finish before sale' : undefined}
                onClick={() =>
                  mutate((draft) => {
                    const result = sellMech(catalog, draft, mech.id);
                    return result.ok
                      ? `Sold the ${designName} for ${cbills(saleValueOf(catalog, mech))}.`
                      : result.reason;
                  })
                }
                data-testid={`market-sell-${mech.id}`}
              >
                Sell
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
