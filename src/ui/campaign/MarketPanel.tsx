import { useRef, useState } from 'react';
import { buyMech, buyPart, marketListings, partMarketListings, saleValueOf, sellMech } from '../../campaign/market';
import type { CampaignState, MechRecord } from '../../campaign/types';
import { getCatalog } from '../../schema/load';
import { authoredDesignName, designIdentityLabel } from '../designLabel';
import { useDialogFocus } from '../useDialogFocus';
import { companyMachineLabel } from './companyLabels';
import { yardStockLine } from './factionEconomy';
import { cbills, type PanelProps } from './Panels';
import { SupplyPartCard } from './SupplyPartCard';
import { canUndoSale, inspectYardListing, undoSale, type SaleUndo } from './supplyPresentation';
import { YardMachineDetails } from './YardMachineDetails';
import './supplyCards.css';

const catalog = getCatalog();

export function MarketPanel({ state, mutate }: PanelProps) {
  const [selling, setSelling] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SaleUndo | null>(null);
  const listings = marketListings(catalog, state);
  const partListings = partMarketListings(catalog, state);
  const signed = state.contract !== null;
  const sale = state.mechs.find((mech) => mech.id === selling);
  const confirmSale = (): void => {
    if (sale === undefined) return;
    mutate((draft) => {
      const result = sellMech(catalog, draft, sale.id);
      if (!result.ok) return result.reason;
      const name = companyMachineLabel(catalog, sale);
      setReceipt({ before: structuredClone(state), after: JSON.stringify(draft), name });
      return `Sold ${name} for ${cbills(saleValueOf(catalog, sale))}. Undo is available until the next company change.`;
    });
    setSelling(null);
  };
  return <>
    <section className="camp-market" data-testid="camp-market" inert={sale !== undefined || undefined}>
      <h3>Yard</h3>
      <p className="yard-stock-note" data-testid="yard-stock-note">{yardStockLine(catalog)}</p>
      {canUndoSale(state, receipt) ? <div className="market-undo" role="status">
        <span>{receipt.name} sold. Fittings and pilot seat can still be restored.</span>
        <button type="button" data-testid="market-undo-sale" onClick={() => {
          mutate((draft) => undoSale(draft, receipt) ? 'Sale undone. Machine, fittings and pilot assignment restored.' : 'Company has changed; this sale can no longer be undone.');
          setReceipt(null);
        }}>Undo sale</button>
      </div> : null}
      <h4>On the lot</h4>
      <ul className="market-stock market-machine-stock">
        {listings.length === 0 ? <li className="empty">Nothing on the lot this week.</li> : listings.map((listing) => {
          const preview = inspectYardListing(catalog, state, listing);
          return <li key={listing.id} data-testid={`market-${listing.id}`}>
            <div className="market-machine-heading"><span className="market-name">{designIdentityLabel(catalog, listing.design)}<small>{listing.worn ? 'Worn armour · repair estimate below' : 'Refurbished · full condition'}</small></span>
              <span className="market-price">{cbills(listing.price)}</span></div>
            {preview === null ? null : <details data-testid={`market-inspect-${listing.id}`}>
              <summary>Inspect condition &amp; loadout before buying</summary>
              <YardMachineDetails catalog={catalog} mech={preview} />
              <button type="button" disabled={state.cbills < listing.price}
                title={state.cbills < listing.price ? `${cbills(listing.price - state.cbills)} short` : undefined}
                data-testid={`market-buy-${listing.id}`} onClick={() => mutate((draft) => {
                  const result = buyMech(catalog, draft, listing.id);
                  return result.ok ? `Bought a ${authoredDesignName(catalog, listing.design)}.` : result.reason;
                })}>Buy for {cbills(listing.price)}</button>
            </details>}
          </li>;
        })}
      </ul>
      <h4>Parts counter</h4>
      <ul className="market-stock market-part-stock" data-testid="market-parts">
        {partListings.length === 0 ? <li className="empty">No crates on the counter this week.</li> : partListings.map((listing) => <li key={listing.id} data-testid={`market-part-${listing.id}`}>
          <SupplyPartCard catalog={catalog} state={state} part={{ kind: listing.kind, id: listing.itemId }}>
            <button type="button" disabled={state.cbills < listing.price}
              title={state.cbills < listing.price ? `${cbills(listing.price - state.cbills)} short` : `Buy a ${listing.name} for stores`}
              data-testid={`market-buy-part-${listing.id}`} onClick={() => mutate((draft) => {
                const result = buyPart(catalog, draft, listing.id);
                return result.ok ? `A ${listing.name} arrives in stores. Choose a machine there to open its refit.` : result.reason;
              })}>Buy for {cbills(listing.price)} · to stores</button>
          </SupplyPartCard>
        </li>)}
      </ul>
      <h4>{signed ? 'Sell — not while a contract is signed' : 'Sell'}</h4>
      <ul className="market-sell">{state.mechs.map((mech) => {
        const booked = mech.status === 'repairing';
        return <li key={mech.id} data-testid={`market-sell-row-${mech.id}`}>
          <span className="market-name">{designIdentityLabel(catalog, mech.design)}<small>{companyMachineLabel(catalog, mech)}</small>
            <small>{mech.status === 'hulk' ? 'wreck' : booked ? `paid workshop booking · ready day ${mech.readyOnDay}` : mech.design.mounts.length === 0 ? 'needs a weapon' : mech.status}</small>
          </span><span className="market-price">{cbills(saleValueOf(catalog, mech))}</span>
          <button type="button" disabled={signed || state.mechs.length <= 1 || booked}
            title={booked ? 'This paid workshop booking must finish before sale' : 'Review the machine and all included fittings'}
            onClick={() => setSelling(mech.id)} data-testid={`market-sell-${mech.id}`}>Review sale</button>
        </li>;
      })}</ul>
    </section>
    {sale === undefined ? null : <SaleDialog state={state} mech={sale} onCancel={() => setSelling(null)} onConfirm={confirmSale} />}
  </>;
}

function SaleDialog({ state, mech, onCancel, onConfirm }: {
  state: CampaignState; mech: MechRecord; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useDialogFocus(dialog, cancel, onCancel, () =>
    document.querySelector('[data-testid="market-undo-sale"]')
      ?? document.querySelector('[data-testid="camp-area-supplies"]'));
  const pilot = state.pilots.find((entry) => entry.mechId === mech.id && !entry.dead);
  return <div className="market-sale-backdrop">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="market-sale-title" className="market-sale-dialog" data-testid="market-sale-review" tabIndex={-1}>
      <span>Machine &amp; all mounted fittings</span><h2 id="market-sale-title">Sell {companyMachineLabel(catalog, mech)}?</h2>
      <p>The yard pays <strong>{cbills(saleValueOf(catalog, mech))}</strong> for this complete machine. Remove any parts you want to keep in Stores first.</p>
      <YardMachineDetails catalog={catalog} mech={mech} />
      <p>{pilot === undefined ? 'No pilot is assigned.' : `${pilot.name} stays in your crew and becomes unassigned.`}</p>
      <p>You can undo immediately, until the next company change.</p>
      <footer><button ref={cancel} type="button" data-testid="market-sale-cancel" onClick={onCancel}>Keep machine</button>
        <button type="button" data-testid="market-sale-confirm" onClick={onConfirm}>Sell for {cbills(saleValueOf(catalog, mech))}</button></footer>
    </section>
  </div>;
}
