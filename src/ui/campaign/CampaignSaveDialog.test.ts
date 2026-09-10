import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { saveCheckpoint } from '../../campaign/saveLibrary';
import { markCampaignStorageReady } from '../../campaign/storage';
import { CampaignSaveDialog } from './CampaignSaveDialog';

const state = startCampaign(catalog, 'border_dispute', 'visible-save', 'regular');
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear(); markCampaignStorageReady();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => { vi.unstubAllGlobals(); markCampaignStorageReady(); });
const markup = (mode: 'save' | 'load') => renderToStaticMarkup(createElement(CampaignSaveDialog, {
  mode, catalog, current: state, onClose: () => undefined, onSaved: () => undefined, onLoad: () => null, onImport: () => null,
}));

describe('campaign file dialog', () => {
  it('names a checkpoint, explains autosave scope and exposes the current company', () => {
    const html = markup('save');
    expect(html).toContain('role="dialog"'); expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="campaign-saves-title"');
    expect(html).toContain('data-testid="save-name"');
    expect(html).toContain('data-testid="save-new-checkpoint"');
    expect(html).toContain('autosaves between missions');
    expect(html).toContain('Current company · autosave');
    expect(html).toContain('Save new checkpoint');
    expect(html).not.toContain('data-testid="save-overwrite-selected"');
    expect(storage.size).toBe(0);
  });
  it('offers selectable company records with difficulty and progress without a destructive default', () => {
    saveCheckpoint(state, 'Before the ridge');
    const html = markup('load');
    expect(html).toContain('Before the ridge'); expect(html).toContain('The Great Recall');
    expect(html).toContain('Continue current company'); expect(html).toContain('regular');
    expect(html).toContain('missions resolved'); expect(html).toContain('Export selected');
    expect(html).not.toContain('data-testid="save-confirmation"');
    expect(html).not.toContain('data-testid="save-name"');
  });
});
