import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AudioSettings } from './AudioSettings';

describe('shared sound settings', () => {
  it('renders a labelled native popover and keyboard-operable controls without unlocking audio', () => {
    const prepare = vi.fn();
    const markup = renderToStaticMarkup(createElement(AudioSettings, { onPrepare: prepare }));
    expect(prepare).not.toHaveBeenCalled();
    expect(markup).toContain('aria-label="Settings"');
    expect(markup).toMatch(/data-testid="audio-settings"[^>]*>Settings<\/button>/);
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('popover="auto"');
    expect(markup).toMatch(/popovertargetaction="hide"/i);
    expect(markup).toContain('aria-label="Close settings"');
    expect(markup).toContain('settings-display-tab');
    expect(markup).toContain('settings-graphics');
    expect(markup).toContain('Touch');
    for (const channel of ['master', 'effects', 'music', 'interface']) {
      expect(markup).toContain(`data-testid="audio-${channel}"`);
    }
    expect(markup.match(/type="range"/g)).toHaveLength(4);
    expect(markup.match(/aria-valuetext="100 percent"/g)).toHaveLength(4);
    expect(markup).toContain('Mute all sound');
    expect(markup).toMatch(/role="switch"[^>]*aria-label="Music"[^>]*aria-checked="true"/);
    expect(markup).toMatch(/role="switch"[^>]*aria-label="Sound effects"[^>]*aria-checked="true"/);
    expect(markup).toContain('data-testid="audio-music-enabled"');
    expect(markup).toContain('data-testid="audio-effects-enabled"');
    expect(markup).toContain('Weapons, movement, radio, alerts and weather');
    expect(markup).toContain('Volume and advanced mix');
    expect(markup).toMatch(/<details class="audio-settings__advanced" data-testid="audio-advanced">/);
    expect(markup).toContain('data-testid="audio-dynamic-range"');
    expect(markup).toContain('Quiet softens loud peaks');
  });

  it('uses the same controls in compact campaign and battle placements', () => {
    const markup = renderToStaticMarkup(createElement(AudioSettings, { compact: true }));
    expect(markup).toContain('audio-settings--compact');
    expect(markup).toContain('data-testid="audio-reset"');
    expect(markup).toContain('Menu, campaign and battle score');
  });
});
