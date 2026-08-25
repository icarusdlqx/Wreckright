import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Sends the player somewhere known-good; the boundary clears itself first. */
  onReset: () => void;
}

interface State {
  message: string | null;
}

/**
 * The last thing between a thrown render and an empty page.
 *
 * React unmounts the whole tree when a render throws, so without this the
 * player is left looking at the background colour with no way back and no idea
 * what happened. One screen failing should cost that screen, not the session.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { message: message.trim() === '' ? 'the screen stopped responding' : message };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('A screen failed to draw.', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ message: null });
    this.props.onReset();
  };

  override render(): ReactNode {
    const { message } = this.state;
    if (message === null) return this.props.children;

    return (
      <div className="crash" role="alert" data-testid="crash">
        <div className="crash-panel">
          <p className="crash-eyebrow">Screen failure</p>
          <h1 className="crash-title">This screen stopped drawing</h1>
          <p className="crash-body">
            Returning to the front door keeps your saved campaign intact. If it happens again,
            reloading the page rebuilds everything from the save on disk.
          </p>
          <p className="crash-detail">{message}</p>
          <div className="crash-actions">
            <button type="button" onClick={this.reset} data-testid="crash-home">
              Return to the front door
            </button>
            <button
              type="button"
              className="crash-secondary"
              onClick={() => globalThis.location.reload()}
              data-testid="crash-reload"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
