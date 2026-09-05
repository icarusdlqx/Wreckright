import { getCatalog } from '../schema/load';
import { MechPreview } from './mechbay/MechPreview';

const FEATURED = ['bulwark_assault', 'warden_lancer'] as const;

/** Use the same authored machines and fittings the player will command. */
export default function HomeMachines() {
  const catalog = getCatalog();
  return (
    <div className="home-machines" aria-hidden="true">
      {FEATURED.map((id) => {
        const design = catalog.designs.get(id);
        const chassis = design === undefined ? undefined : catalog.chassis.get(design.chassisId);
        if (design === undefined || chassis === undefined) return null;
        return (
          <div className={`home-machine ${chassis.faction}`} key={id}>
            <MechPreview catalog={catalog} chassis={chassis} design={design} />
            <div className="home-machine-label">
              <span>{chassis.faction === 'linewrought' ? 'LINEWROUGHT' : 'AURELIAN STOCK'}</span>
              <strong>{chassis.name}</strong><small>{chassis.tonnage}t</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
