import { describe, expect, it } from 'vitest';
import type { LoreEntry } from '../../schema/lore';
import { catalog } from '../../../tests/support';
import { visibleCampaignLore } from './campaignLore';

const publicPage: LoreEntry = {
  id: 'public',
  title: 'Public',
  order: 0,
  summary: 'Known before the first contract.',
  body: ['Known.'],
};

const discovery: LoreEntry = {
  id: 'discovery',
  title: 'Discovery',
  order: 1,
  unlockNodeId: 'sealed_contact',
  summary: 'Learned in the field.',
  body: ['Recovered.'],
};

describe('campaign lore', () => {
  it('opens Aurelian doctrine for its own company while preserving Linewrought discovery', () => {
    const lore = [...catalog.lore.values()];
    expect(visibleCampaignLore(lore, [], 'aurelian_recall').map((entry) => entry.id)).toContain('the_sealed');
    expect(visibleCampaignLore(lore, [], 'border_dispute').map((entry) => entry.id)).not.toContain('the_sealed');
    expect(visibleCampaignLore(lore, ['pass_skirmish'], 'border_dispute').map((entry) => entry.id)).toContain('the_sealed');
  });
  it('keeps discoveries out of the manual until their contract is complete', () => {
    expect(visibleCampaignLore([publicPage, discovery], [])).toEqual([publicPage]);
    expect(visibleCampaignLore([publicPage, discovery], ['sealed_contact'])).toEqual([
      publicPage,
      discovery,
    ]);
  });
});
