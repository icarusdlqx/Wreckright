import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

// React does not run error boundaries during server rendering, so the caught
// state is built the way React would build it and then rendered directly.
function fallbackMarkup(thrown: unknown): string {
  const boundary = new ErrorBoundary({ onReset: () => {}, children: null });
  boundary.state = ErrorBoundary.getDerivedStateFromError(thrown);
  return renderToStaticMarkup(boundary.render() as ReactElement);
}

describe('error boundary', () => {
  it('stays out of the way while nothing has thrown', () => {
    const html = renderToStaticMarkup(
      createElement(ErrorBoundary, {
        onReset: () => {},
        children: createElement('p', null, 'the battlefield'),
      }),
    );

    expect(html).toContain('the battlefield');
    expect(html).not.toContain('data-testid="crash"');
  });

  it('reports what threw and offers both ways out', () => {
    const html = fallbackMarkup(new Error('renderer lost its footing'));

    expect(html).toContain('data-testid="crash"');
    expect(html).toContain('renderer lost its footing');
    expect(html).toContain('data-testid="crash-home"');
    expect(html).toContain('data-testid="crash-reload"');
    expect(html).toContain('role="alert"');
  });

  it('still names the failure when the throw carried nothing useful', () => {
    expect(ErrorBoundary.getDerivedStateFromError(new Error('   '))).toEqual({
      message: 'the screen stopped responding',
    });
    expect(ErrorBoundary.getDerivedStateFromError('the bay went dark')).toEqual({
      message: 'the bay went dark',
    });
  });

  it('clears itself and hands the player back to the front door', () => {
    let resets = 0;
    const boundary = new ErrorBoundary({ onReset: () => (resets += 1), children: null });
    const applied: unknown[] = [];
    boundary.setState = (next: unknown) => applied.push(next);

    boundary.state = ErrorBoundary.getDerivedStateFromError(new Error('gpu reset'));
    // The reset handler is private to the render tree; reach it the way the
    // button does, through the element the fallback actually builds.
    const markup = renderToStaticMarkup(boundary.render() as ReactElement);
    expect(markup).toContain('Return to the front door');

    (boundary as unknown as { reset: () => void }).reset();
    expect(resets).toBe(1);
    expect(applied).toEqual([{ message: null }]);
  });
});
