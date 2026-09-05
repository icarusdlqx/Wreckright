import { useEffect, useState } from 'react';
import { loadCampaign } from '../campaign/save';
import { getCatalog } from '../schema/load';
import { createNewBattleCode, TRAINING_BATTLE_CODE } from './battleCode';
import { usePlaytest } from './playtest';
import { useStrategicScoreControls } from './StrategicScoreProvider';
import { useGame } from './store';
import { CommandMark } from './CommandMark';
import { HomeTheatre } from './HomeTheatre';
import {
  skipTraining,
  readTraining,
  STANDARD_MISSION_ID,
  startTraining,
  TRAINING_MISSION_ID,
} from './trainingProgress';
import './onboarding.css';
import './graphicHome.css';

export function HomeScreen() {
  const [entry] = useState(() => ({
    training: readTraining(),
    campaign: loadCampaign(getCatalog(), { storedOnly: true }).state !== null,
  }));
  const battleCode = useGame((state) => state.battleCode);
  const enterBattle = useGame((state) => state.enterBattle);
  const patch = useGame((state) => state.patch);
  const { record } = usePlaytest();
  const score = useStrategicScoreControls();

  useEffect(() => {
    record({ name: 'front_door_viewed' });
  }, [record]);
  const primary = entry.training?.status === 'active' ? 'learn' : entry.campaign ? 'campaign' :
    entry.training === null ? 'learn' : 'campaign';

  const learn = (): void => {
    record({ name: 'route_chosen', route: 'learn' });
    startTraining();
    enterBattle({ missionId: TRAINING_MISSION_ID, battleCode: TRAINING_BATTLE_CODE });
  };

  const campaign = (): void => {
    score.prepare();
    record({ name: 'route_chosen', route: 'campaign' });
    skipTraining();
    patch({ screen: 'campaign', campaignPending: false, error: null });
  };

  const skirmish = (): void => {
    record({ name: 'route_chosen', route: 'skirmish' });
    skipTraining();
    enterBattle({
      missionId: STANDARD_MISSION_ID,
      battleCode: createNewBattleCode(battleCode),
    });
  };

  return (
    <main className="home-screen graphic-home" data-testid="home-screen">
      <header className="home-masthead">
        <div><CommandMark /><span>WRECKRIGHT<small>INDEPENDENT COMPANY COMMAND</small></span></div>
        <p>TESSELL <span>/</span> THE GREAT RECALL</p>
      </header>
      <section className="home-panel" aria-labelledby="home-title">
        <div className="home-introduction">
        <span className="home-edition">TACTICAL MECH COMMAND</span>
        <p className="home-kicker">No new machines. Only new owners.</p>
        <h1 id="home-title">WRECKRIGHT</h1>
        <p className="home-premise">
          The Aurelian Continuance has returned to Tessell to repossess every surviving walker
          root. Command an independent company through the Great Recall, and decide who owns
          the machines that kept this world alive.
        </p>
        <div className="home-command-note"><span aria-hidden="true">Ⅱ</span><p><strong>Time to think. Weight behind every order.</strong><span>Pause the field. Choose your ground. Bring your company home.</span></p></div>
        </div>
        <HomeTheatre />

        <div className="home-routes" aria-label="Choose where to begin">
          <button type="button" className={`home-route${primary === 'learn' ? ' primary' : ''}`} onClick={learn} data-testid="home-learn">
            <i className="home-route-number" aria-hidden="true">01 / THE RANGE</i>
            <strong>{entry.training?.status === 'active' ? 'Resume the Range' : 'Learn Command'}</strong>
            <span>Take two machines through a short range walk.</span>
          </button>
          <button type="button" className={`home-route${primary === 'campaign' ? ' primary' : ''}`} onClick={campaign} data-testid="home-campaign">
            <i className="home-route-number" aria-hidden="true">02 / THE COMPANY</i>
            <strong>{entry.campaign ? 'Continue Campaign' : 'Start Campaign'}</strong>
            <span>Open the company ledger and the contract board.</span>
          </button>
          <button type="button" className="home-route" onClick={skirmish} data-testid="home-skirmish">
            <i className="home-route-number" aria-hidden="true">03 / THE FIELD</i>
            <strong>Skirmish</strong>
            <span>Choose a field, lance and repeatable Battle code.</span>
          </button>
        </div>

        <p className="home-note">Real-time with pause. Orders remain available while the clock is stopped.<span>{getCatalog().chassis.size} CHASSIS · {getCatalog().weapons.size} WEAPONS · YOUR COMPANY</span></p>
      </section>
    </main>
  );
}
