import { Battle } from './Battle';
import { CampaignScreen } from './campaign/CampaignScreen';
import { ErrorBoundary } from './ErrorBoundary';
import { HomeScreen } from './HomeScreen';
import { LazyMechbay } from './mechbay/LazyMechbay';
import { PlaytestProvider } from './playtest';
import { StrategicScoreProvider } from './StrategicScoreProvider';
import { useGame } from './store';

export function App() {
  return (
    <StrategicScoreProvider>
      <PlaytestProvider>
        <ErrorBoundary onReset={() => useGame.getState().patch({ screen: 'home', error: null })}>
          <AppRoute />
        </ErrorBoundary>
      </PlaytestProvider>
    </StrategicScoreProvider>
  );
}

// Only the mechbay is deferred here. It is the one route that reaches three.js
// through a static import, so holding it back is what lets the entry chunk shed
// the renderer; the battle screen gets there through the dynamic import inside
// engineFactory instead. The other routes stay eager on purpose — a route that
// arrives late brings its stylesheet with it, and route CSS landing after the
// responsive overrides in main.tsx wins a cascade it is meant to lose.
function AppRoute() {
  const screen = useGame((state) => state.screen);
  const patch = useGame((state) => state.patch);

  if (screen === 'home') return <HomeScreen />;
  if (screen === 'mechbay') return <LazyMechbay onExit={() => patch({ screen: 'battle' })} />;
  if (screen === 'campaign') return <CampaignScreen onExit={() => patch({ screen: 'home' })} />;
  return <Battle />;
}
