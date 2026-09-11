import { Component, lazy, Suspense, type ReactNode } from 'react';
import { CommandMark } from './CommandMark';

const HomeMachines = lazy(() => import('./HomeMachines'));

function TheatreFallback({ failed = false }: { failed?: boolean }) {
  return <div className="home-machine-loading" data-testid="home-theatre-fallback" data-preview-state={failed ? 'unavailable' : 'loading'}><CommandMark size={96} /></div>;
}

/** A decorative preview must never make the entry actions unavailable. */
class TheatreBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  override render(): ReactNode { return this.state.failed ? <TheatreFallback failed /> : this.props.children; }
}

export function HomeTheatre() {
  return (
    <div className="home-theatre" aria-hidden="true">
      <div className="home-theatre-grid" />
      <span className="home-theatre-label">TWO MACHINE CULTURES. ONE FINITE INHERITANCE.</span>
      <TheatreBoundary>
        <Suspense fallback={<TheatreFallback />}><HomeMachines /></Suspense>
      </TheatreBoundary>
      <div className="home-theatre-ground" />
    </div>
  );
}
