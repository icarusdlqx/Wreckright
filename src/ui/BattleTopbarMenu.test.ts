import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BattleTopbar, type BattleTopbarProps } from './BattleTopbar';
import { MobileBattleTopbar } from './MobileBattleTopbar';
import { createPlaytestJournal, PlaytestProvider } from './playtest';

const PROPS: BattleTopbarProps = {
  engine: null,
  muted: false,
  lowFx: false,
  setupMissionId: 'skirmish_ridge',
  setupDifficultyId: 'green',
  missions: [{ id: 'skirmish_ridge', name: 'Ridge Pass' }],
  difficulties: [{ id: 'green', label: 'Green', description: 'A fair opening fight.' }],
  locked: false,
  trainingStep: 4,
  onMuted: () => undefined,
  onLowFx: () => undefined,
  onMission: () => undefined,
  onDifficulty: () => undefined,
  onRestart: () => undefined,
  onChooseMission: () => undefined,
};

function withPlaytest(child: ReactElement): string {
  const journal = createPlaytestJournal({ storage: () => null });
  return renderToStaticMarkup(
    createElement(PlaytestProvider, { journal, children: child }),
  );
}

describe('battle topbar disclosure', () => {
  it('keeps the desktop line compact and moves secondary controls into Menu', () => {
    const markup = withPlaytest(createElement(BattleTopbar, PROPS));
    const menuIndex = markup.indexOf('data-testid="desktop-menu-toggle"');

    expect(markup).toContain('class="topbar battle-topbar"');
    expect(markup).toContain('aria-label="Open battle menu"');
    expect(markup.indexOf('data-testid="clock"')).toBeLessThan(menuIndex);
    expect(markup.indexOf('data-testid="pause-button"')).toBeLessThan(menuIndex);
    expect(markup.indexOf('data-testid="speed-4"')).toBeLessThan(menuIndex);
    expect(markup.indexOf('data-testid="mute-button"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="audio-settings"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="fx-toggle"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="open-mechbay"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="open-campaign"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="mission-picker"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="difficulty-picker"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="feedback-link"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('aria-label="Battle controls"')).toBeGreaterThan(menuIndex);
    expect(markup).not.toContain('class="hint"');
  });

  it('keeps deployed-run actions inside the same desktop menu', () => {
    const markup = withPlaytest(createElement(BattleTopbar, { ...PROPS, locked: true }));
    const menuIndex = markup.indexOf('data-testid="desktop-menu-toggle"');

    expect(markup.indexOf('data-testid="restart-battle"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="choose-mission"')).toBeGreaterThan(menuIndex);
  });

  it('uses the same secondary-control menu on mobile', () => {
    const markup = withPlaytest(createElement(MobileBattleTopbar, PROPS));
    const menuIndex = markup.indexOf('data-testid="mobile-menu-toggle"');

    expect(markup).toContain('aria-label="Open battle menu"');
    expect(markup.indexOf('data-testid="mute-button"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="audio-settings"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="feedback-link"')).toBeGreaterThan(menuIndex);
  });

  it('preserves the training HUD progression while keeping sound and FX discoverable', () => {
    const markup = withPlaytest(
      createElement(BattleTopbar, { ...PROPS, trainingStep: 1 }),
    );
    const menuIndex = markup.indexOf('data-testid="desktop-menu-toggle"');

    expect(markup).toContain('class="topbar battle-topbar training-topbar"');
    expect(markup).not.toContain('data-testid="clock"');
    expect(markup).not.toContain('data-testid="speed-1"');
    expect(markup.indexOf('data-testid="mute-button"')).toBeGreaterThan(menuIndex);
    expect(markup.indexOf('data-testid="fx-toggle"')).toBeGreaterThan(menuIndex);
    expect(markup).not.toContain('data-testid="open-mechbay"');
    expect(markup).not.toContain('data-testid="feedback-link"');
  });
});
