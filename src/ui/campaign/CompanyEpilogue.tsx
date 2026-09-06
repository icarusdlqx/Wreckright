import type { Catalog } from '../../schema/load';
import { campaignEpilogue } from '../../campaign/epilogue';
import { isPilotAvailable, type CampaignState } from '../../campaign/types';
import { PilotPortrait } from '../PilotPortrait';
import './companyEpilogue.css';

export function CompanyEpilogue({ catalog, state }: { catalog: Catalog; state: CampaignState }) {
  const ending = campaignEpilogue(catalog, state);
  if (ending === null) return null;
  return <section className="company-epilogue" data-testid="campaign-epilogue" aria-label="Campaign epilogue">
    <div className="epilogue-story">
    <p className="epilogue-kicker">Campaign complete · day {state.day}</p><h3>{ending.title}</h3>
    {ending.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>
    <div className="epilogue-company">
    <dl><div><dt>Crew returning</dt><dd>{ending.survivors.length}</dd></div>
      <div><dt>Machines retained</dt><dd>{ending.machines.length}</dd></div>
      <div><dt>Hulls in the yard</dt><dd>{ending.hulls.length}</dd></div></dl>
    <h4>The company that made it through</h4>
    {ending.survivors.length === 0 ? <p>No active pilots survived the final operation.</p> : <ul>{ending.survivors.map((pilot) => <li key={pilot.id}>
      <PilotPortrait pilot={pilot} compact /><span><strong>{pilot.name}</strong><small>{isPilotAvailable(state, pilot) ? 'Returned' : 'Returned wounded'} · Gunnery {pilot.gunnery} / Piloting {pilot.piloting} / Sensors {pilot.sensors}</small></span>
    </li>)}</ul>}
    {ending.fallen.length === 0 ? <p>Every member of the company came home.</p> : <p className="epilogue-memorial">Remembered: {ending.fallen.map((pilot) => pilot.name).join(', ')}.</p>}
    </div>
  </section>;
}
