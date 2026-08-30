import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { readAudioMuted } from './audioPreference';
import { StrategicScoreDirector, type StrategicScoreLease } from './audioStrategic';
import type { StrategicScoreSurface } from './audioScoreTreatments';

const StrategicScoreContext = createContext<StrategicScoreDirector | null>(null);
const emptySubscribe = (): (() => void) => () => undefined;

export function StrategicScoreProvider({ children }: { children: ReactNode }) {
  const [director] = useState(() => new StrategicScoreDirector());
  useEffect(() => {
    const unlock = (): void => director.unlock();
    globalThis.document?.addEventListener('pointerdown', unlock, true);
    globalThis.document?.addEventListener('keydown', unlock, true);
    return () => {
      globalThis.document?.removeEventListener('pointerdown', unlock, true);
      globalThis.document?.removeEventListener('keydown', unlock, true);
      director.destroy();
    };
  }, [director]);
  return (
    <StrategicScoreContext.Provider value={director}>
      {children}
    </StrategicScoreContext.Provider>
  );
}

export function useStrategicScore(
  surface: StrategicScoreSurface,
  aurelianShare: number | null,
  enabled = true,
): void {
  const director = useContext(StrategicScoreContext);
  const lease = useRef<StrategicScoreLease | null>(null);
  useEffect(() => {
    if (!enabled || director === null) return undefined;
    const acquired = director.acquire(surface, aurelianShare);
    lease.current = acquired;
    return () => {
      acquired.release();
      if (lease.current === acquired) lease.current = null;
    };
  }, [director, enabled, surface]);
  useEffect(() => lease.current?.update(aurelianShare), [aurelianShare]);
}

export function useStrategicScoreControls(): {
  muted: boolean;
  prepare: () => void;
  toggleMuted: () => boolean;
} {
  const director = useContext(StrategicScoreContext);
  const muted = useSyncExternalStore(
    director?.subscribe ?? emptySubscribe,
    () => director?.muted ?? readAudioMuted(),
    readAudioMuted,
  );
  return {
    muted,
    prepare: () => director?.prepare(),
    toggleMuted: () => director?.toggleMuted() ?? readAudioMuted(),
  };
}
