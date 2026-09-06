import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react';
import { readWikiDiscovery } from '../../wiki/discovery';
import { parseWikiHash } from '../../wiki/routes';
import { useGame } from '../store';
import { WikiScreen } from './WikiScreen';
import './wiki.css';

const currentHash = (): string => typeof window === 'undefined' ? '' : window.location.hash;
const noHash = (): string => '';

export function WikiHost({ children }: { children: ReactNode }) {
  const gameRoot = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const subscribeHash = useCallback((listener: () => void): (() => void) => {
    const changed = (): void => {
      // Capture before React hides/inerts the game and the browser blurs its link.
      if (parseWikiHash(currentHash()) !== null && gameRoot.current?.hidden === false) {
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      listener();
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const hash = useSyncExternalStore(subscribeHash, currentHash, noHash);
  const route = parseWikiHash(hash);
  // Direct archive links must not create a battle, a company or a training visit.
  // A game already in progress stays mounted, preserving refit drafts and selection.
  const [gameEntered, setGameEntered] = useState(() => parseWikiHash(currentHash()) === null);
  const baseHash = useRef(parseWikiHash(currentHash()) === null ? currentHash() : '');
  useEffect(() => {
    if (route === null) { setGameEntered(true); baseHash.current = hash; }
  }, [hash, route]);
  const close = (): void => {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${baseHash.current}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  };
  return <>
    {gameEntered ? <div ref={gameRoot} style={{ height: '100%' }} hidden={route !== null} inert={route !== null} aria-hidden={route !== null ? true : undefined}>
      {children}
    </div> : null}
    {route === null ? null : <WikiSession route={route} onClose={close} returnFocus={() => returnFocus.current} />}
  </>;
}

function WikiSession({ route, onClose, returnFocus }: ComponentProps<typeof WikiScreen>) {
  const [discovery] = useState(readWikiDiscovery);
  useEffect(() => {
    const before = useGame.getState();
    const pause = (): void => { if (!useGame.getState().paused) useGame.getState().patch({ paused: true }); };
    pause();
    const unsubscribe = useGame.subscribe(pause);
    return () => {
      unsubscribe();
      const current = useGame.getState();
      if (current.screen === before.screen && current.battleCode === before.battleCode &&
        current.skirmishMissionId === before.skirmishMissionId) current.patch({ paused: before.paused });
    };
  }, []);
  return <WikiScreen route={route} onClose={onClose} discovery={discovery} returnFocus={returnFocus} />;
}
