import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign, resolveMission } from '../../campaign/campaign';
import { rewardBattle, rewardFixture } from '../../campaign/missionRewardFixtures';
import { CompanyJournal } from './CompanyJournal';
import { getWikiLibrary } from '../../wiki/library';

describe('company journal', () => {
  it('does not reveal undiscovered later records or invent old field reports', () => {
    const state = startCampaign(catalog, 'border_dispute', 'journal');
    state.completedNodes.push('militia_raid');
    const html = renderToStaticMarkup(createElement(CompanyJournal, { catalog, state }));
    expect(html).toContain('First Notice');
    expect(html).toContain('detailed field report is no longer available');
    for (const article of getWikiLibrary().values()) {
      if (article.kind === 'story' && article.discovery?.unlockNodeId !== undefined
        && !state.completedNodes.includes(article.discovery.unlockNodeId)
        && !article.discovery.knownByCampaigns?.includes(state.campaignId)) {
        expect(html).not.toContain(article.title);
      }
    }
  });
  it('records sustained protection as held when the contract succeeds', () => {
    const { content, state, deployment } = rewardFixture();
    const battle = rewardBattle(deployment.missionId, deployment.lance);
    const mission = content.missions.get(deployment.missionId)!;
    const sustained = mission.objectives.find((objective) => objective.type === 'survive' || objective.type === 'protect_zones');
    expect(sustained).toBeDefined();
    const result = battle.objectives.find((objective) => objective.id === sustained!.id);
    if (result !== undefined) result.status = 'active';
    else battle.objectives.push({ id: sustained!.id, label: sustained!.label, required: true, status: 'active', progress: 1 });
    resolveMission(content, state, battle, deployment.lance, false);
    const html = renderToStaticMarkup(createElement(CompanyJournal, { catalog: content, state }));
    expect(html).toContain('Required · held');
  });

  it('retains optional outcome and noncombat service alongside salvage provenance', () => {
    const { content, state, deployment } = rewardFixture();
    const battle = rewardBattle(deployment.missionId, deployment.lance);
    const optional = battle.objectives.find((objective) => !objective.required)!;
    optional.status = 'failed';
    resolveMission(content, state, battle, deployment.lance, false);
    const html = renderToStaticMarkup(createElement(CompanyJournal, { catalog: content, state }));
    expect(html).toContain('Optional · not completed');
    expect(html).toContain('Returned without firing a shot');
    expect(html).toContain('Recovery record');
    expect(html).toContain('Deployed with the team');
  });
});
