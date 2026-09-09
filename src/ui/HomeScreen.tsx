import { useEffect, useState } from 'react';
import { loadCampaign } from '../campaign/save';
import { getCatalog } from '../schema/load';
import { createNewBattleCode, TRAINING_BATTLE_CODE } from './battleCode';
import { usePlaytest } from './playtest';
import { useStrategicScore, useStrategicScoreControls } from './StrategicScoreProvider';
import { useGame } from './store';
import { CommandMark } from './CommandMark';
import { AudioSettings } from './AudioSettings';
import { WikiLink } from './wiki/WikiLink';
import { readLastSkirmishMission } from './skirmishPreferences';
import {
  skipTraining,
  readTraining,
  startTraining,
  TRAINING_MISSION_ID,
} from './trainingProgress';
import './contemporaryHome.css';

const menuArtwork = new URL('../assets/art/tessell-crossing-menu.webp', import.meta.url).href;

export function HomeScreen() {
  const [artwork, setArtwork] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [entry] = useState(() => ({
    training: readTraining(),
    campaign: loadCampaign(getCatalog(), { storedOnly: true }).state !== null,
  }));
  const battleCode = useGame((state) => state.battleCode);
  const enterBattle = useGame((state) => state.enterBattle);
  const patch = useGame((state) => state.patch);
  const { record } = usePlaytest();
  const score = useStrategicScoreControls();
  useStrategicScore('home', 0.5);

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
      missionId: readLastSkirmishMission(getCatalog()),
      battleCode: createNewBattleCode(battleCode),
    });
  };

  return (
    <main className="home-screen contemporary-home" data-testid="home-screen" data-artwork={artwork}>
      <img
        className="home-artwork"
        data-testid="home-artwork"
        src={menuArtwork}
        alt=""
        aria-hidden="true"
        decoding="async"
        fetchPriority="high"
        onLoad={() => setArtwork('ready')}
        onError={() => setArtwork('fallback')}
      />
      <div className="home-scrim" aria-hidden="true" />
      <header className="home-masthead">
        <div className="home-company-mark"><CommandMark /><span>INDEPENDENT<br />COMPANY COMMAND</span></div>
        <nav aria-label="Game settings"><AudioSettings compact /></nav>
      </header>
      <section className="home-menu" aria-labelledby="home-title">
        <div className="home-introduction">
          <span className="home-edition">TACTICAL MECH COMMAND</span>
          <h1 id="home-title">WRECKRIGHT</h1>
          <p className="home-kicker">No new machines. Only new owners.</p>
          <p className="home-premise">Your company. Your machines. Your next move.</p>
        </div>
        <nav className="home-routes" aria-label="Choose where to begin">
          <button type="button" className={`home-route${primary === 'learn' ? ' primary' : ''}`} onClick={learn} data-testid="home-learn">
            <span className="home-route-copy"><strong>{entry.training?.status === 'active' ? 'Resume the Range' : 'Learn Command'}</strong><span>A short field lesson in command.</span></span>
            <span className="home-route-arrow" aria-hidden="true">↗</span>
          </button>
          <button type="button" className={`home-route${primary === 'campaign' ? ' primary' : ''}`} onClick={campaign} data-testid="home-campaign">
            <span className="home-route-copy"><strong>{entry.campaign ? 'Continue Campaign' : 'Start Campaign'}</strong><span>Build a company. Choose your contracts.</span></span>
            <span className="home-route-arrow" aria-hidden="true">↗</span>
          </button>
          <button type="button" className="home-route" onClick={skirmish} data-testid="home-skirmish">
            <span className="home-route-copy"><strong>Skirmish</strong><span>Choose your machines and the battlefield.</span></span>
            <span className="home-route-arrow" aria-hidden="true">↗</span>
          </button>
          <WikiLink className="home-route home-route--wiki" data-testid="home-wiki">
            <span className="home-route-copy"><strong>Wiki <span className="home-wiki-subtitle">· Story &amp; mechs</span></strong><span>Explore Tessell, its factions and machines.</span></span>
            <span className="home-route-arrow" aria-hidden="true">↗</span>
          </WikiLink>
        </nav>
      </section>
      <aside className="home-location" aria-label="Setting">
        <span>TESSELL / THE GREAT RECALL</span>
        <p>The Aurelian Continuance has returned to Tessell.<br />Nothing here is theirs to take without a fight.</p>
      </aside>
      <footer className="home-field-note"><span aria-hidden="true">Ⅱ</span><p>Pause the field. Choose your ground. Bring your company home.</p><span className="home-field-note-end">REAL-TIME TACTICS / YOUR PACE</span></footer>
    </main>
  );
}
