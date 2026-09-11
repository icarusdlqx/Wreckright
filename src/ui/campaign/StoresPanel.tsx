import { stripToStore } from '../../campaign/refit';
import { getCatalog } from '../../schema/load';
import { computeLoadout } from '../../sim/loadout';
import { authoredDesignName, designIdentityLabel } from '../designLabel';
import { MECH_LOCATION_NAMES, type DropPayload } from '../mechbay/LocationCard';
import { companyMachineLabel } from './companyLabels';
import { ownedPartFits } from './supplyPresentation';
import { SupplyPartCard } from './SupplyPartCard';
import type { PanelProps } from './Panels';
import { DemoSupplyPanel } from './DemoSupplyPanel';
const catalog = getCatalog();

export function StoresPanel({ state, mutate, onRefitPart }: PanelProps & { onRefitPart?: (mechId: string, part: DropPayload) => void }) {
  return (
      <section className="camp-store" data-testid="camp-store">
        <DemoSupplyPanel state={state} mutate={mutate} />
        <h3>Stores</h3>
        {state.store.length === 0 ? (
          <p className="empty">Nothing salvaged yet.</p>
        ) : (
          <ul>
            {state.store.map((item) => {
              const part: DropPayload = { kind: item.kind, id: item.itemId };
              const candidates = ownedPartFits(catalog, state, part).filter(({ fit }) => fit.ok);
              return <li key={`${item.kind}:${item.itemId}`} data-testid={`camp-store-${item.itemId}`}>
                <SupplyPartCard catalog={catalog} state={state} part={part} count={item.count}>
                  <select value="" disabled={state.finished || candidates.length === 0 || onRefitPart === undefined}
                    aria-label={`Open refit with ${catalog.weapons.get(item.itemId)?.name ?? catalog.equipment.get(item.itemId)?.name ?? item.itemId}`}
                    title={state.finished ? 'This campaign has ended.' : onRefitPart === undefined ? 'Refitting is unavailable here.' : candidates.length === 0 ? 'No ready company machine has a compatible bay for this part.' : 'Choose a compatible machine and open its refit bay.'}
                    onChange={(event) => { if (event.target.value !== '') onRefitPart?.(event.target.value, part); }}
                    data-testid={`camp-fit-${item.itemId}`}>
                    <option value="">Choose machine &amp; fit…</option>
                    {candidates.map(({ mech, fit }) => <option key={mech.id} value={mech.id}>
                      {companyMachineLabel(catalog, mech)}{fit.replacementOnly ? ' · replacement required' : ''}
                    </option>)}
                  </select>
                </SupplyPartCard>
              </li>;
            })}
          </ul>
        )}

        <h3>Strip</h3>
        <ul className="camp-strip">
          {state.mechs
            .filter((mech) => mech.status === 'ready')
            .map((mech) => (
              <li key={mech.id}>
                <span>{designIdentityLabel(catalog, mech.design)}<small>{companyMachineLabel(catalog, mech)}</small></span>
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
                      {catalog.weapons.get(mount.weaponId)?.name ?? mount.weaponId} ({MECH_LOCATION_NAMES[mount.location]})
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
