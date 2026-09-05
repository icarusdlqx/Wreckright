import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';
import './ui/fireModes.css';
import './ui/desktopBattleLayout.css';
import './ui/tacticalReadout.css';
import './ui/mobileLayout.css';
import './ui/mobileBattle.css';
import './ui/damageReadouts.css';
import './ui/formationPicker.css';
import './ui/cameraControls.css';
import './ui/supportPalette.css';
import './ui/sidebarDetails.css';
import './ui/expeditionTheme.css';
import './ui/expeditionBriefing.css';
import './ui/expeditionBattle.css';
import './ui/expeditionMechbay.css';
import './ui/expeditionWorkbench.css';
import './ui/expeditionCampaignOverlays.css';
import './ui/resilience.css';

const host = document.getElementById('root');
if (host === null) throw new Error('missing #root');

createRoot(host).render(<App />);
