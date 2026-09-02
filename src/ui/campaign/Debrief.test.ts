import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { catalog } from '../../../tests/support';
import { startCampaign } from '../../campaign/campaign';
import { campaignBlob, deserialiseCampaign } from '../../campaign/save';
import type { MissionOutcome } from '../../campaign/types';
import { CampaignPostBattle } from './CampaignPostBattle';
import { Debrief } from './Debrief';

describe('campaign debrief recovery ledger', () => {
  it('shows final hull rolls and the field source of each offered part', async () => {
    const state = startCampaign(catalog, 'border_dispute', 'debrief-ledger');
    const outcome: MissionOutcome = {
      nodeId: 'militia_raid',
      missionId: 'training_ground',
      employerId: 'kestrel_combine',
      employerName: 'Kestrel Combine',
      termsId: 'salvage_first',
      won: true,
      day: 4,
      payout: 100,
      paymentDisputeSettled: false,
      salvagedChassis: ['sentinel_brawler'],
      salvagedItems: [{ kind: 'weapon', itemId: 'medium_laser', count: 2 }],
      salvageOffered: [{ kind: 'weapon', itemId: 'medium_laser', count: 2 }],
      salvageFinalized: false,
      salvageCandidates: [
        {
          designId: 'sentinel_brawler',
          name: "Sentinel SNL-2 'Brawler'",
          outcome: 'head',
          chassisChance: 0.225,
          recovered: true,
        },
        {
          designId: 'sentinel_brawler',
          name: "Sentinel SNL-2 'Second'",
          outcome: 'centre_torso',
          chassisChance: 0.1,
          recovered: false,
        },
        {
          designId: 'carrier_apc',
          name: "Field Carrier FCR-7 'Mule'",
          outcome: 'centre_torso',
          chassisChance: 0,
          recovered: false,
        },
      ],
      salvageProvenance: [
        {
          kind: 'weapon',
          itemId: 'medium_laser',
          sourceDesignId: 'sentinel_brawler',
          sourceMechName: "Sentinel SNL-2 'Brawler'",
          location: 'left_arm',
        },
        {
          kind: 'weapon',
          itemId: 'medium_laser',
          sourceDesignId: 'sentinel_brawler',
          sourceMechName: "Sentinel SNL-2 'Brawler'",
          location: 'centre_torso',
        },
        {
          kind: 'weapon',
          itemId: 'medium_laser',
          sourceDesignId: 'carrier_apc',
          sourceMechName: "Field Carrier FCR-7 'Mule'",
          location: 'right_arm',
        },
      ],
      pilotCasualties: [],
      mechsLost: ["Sentinel SNL-2 'Brawler'"],
      pilotReports: [
        {
          pilotId: 'rook',
          name: 'Rook',
          mech: "Sentinel SNL-2 'Brawler'",
          kills: 1,
          damage: 40,
          xp: 9,
          xpBanked: 9,
          promotions: [],
          fate: 'returned',
        },
      ],
    };
    state.history.push(outcome);
    state.log.unshift({
      day: 4,
      text: "Sentinel SNL-2 'Brawler' returned; AC/5 intact.",
    });
    const savedMech = state.mechs[0];
    if (savedMech === undefined) throw new Error('missing campaign mech fixture');
    const savedMechId = savedMech.design.id;
    savedMech.design.name = "Gadfly GAD-2 'Spotter'";

    const html = renderToStaticMarkup(
      createElement(Debrief, {
        catalog,
        state,
        outcome,
        onClose: () => undefined,
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('data-testid="debrief-ledger"');
    expect(html).toContain('Contract complete · +100 C · salvaged:');
    expect(html).toContain('Medium Laser ×2');
    expect(html).toContain('data-testid="debrief-salvage-report"');
    expect(html).toContain('data-testid="debrief-adjust-picks"');
    expect(html).toMatch(/<summary[^>]*tabindex="0"[^>]*>Adjust picks<\/summary>/);
    expect(html).toContain('Field recovery ledger');
    expect(html).toContain('Head destroyed');
    expect(html).toContain('22.5%');
    expect(html).toContain('hull recovered');
    expect(html).toContain('not recovered');
    expect(html).toContain('not eligible');
    expect(html).toContain('Field source: Sentinel, left arm');
    expect(html).toContain('Sentinel, centre torso');
    expect(html).toContain("Field Carrier &#x27;Mule&#x27;, right arm");
    expect(html).toContain("Field Carrier &#x27;Mule&#x27;");
    expect(html).toContain("Lost: Sentinel &#x27;Brawler&#x27;.");
    expect(html).not.toMatch(/(?:SNL|FCR)-\d+/);
    expect(html).toContain('Recovered hulls are already in the yard');
    expect(html).toContain('carrying their field damage and no mounted');
    expect(html).toContain('weapons or equipment');
    expect(html).toContain('weapons and equipment alternate');
    expect(html).toContain('each list rotates from one field to the next');
    expect(html).toContain('Kestrel Combine');
    expect(html).toContain('1 completed · 0 failed · 100 C paid');
    expect(html).toContain('+9 XP');
    expect(html.indexOf('</details>')).toBeLessThan(html.indexOf('+9 XP'));

    outcome.salvageFinalized = true;
    const restored = renderToStaticMarkup(
      createElement(Debrief, {
        catalog,
        state,
        outcome,
        onChooseSalvage: (picks) => picks,
        onClose: () => undefined,
      }),
    );
    expect(restored).toContain('Salvage manifest finalized');
    expect(restored).toContain('This restored report is read-only');
    expect(restored).toContain('marks record what came home');
    expect(restored).not.toContain('Choose what comes home');
    expect(restored).toMatch(/<summary[^>]*tabindex="0"[^>]*>Review salvage report<\/summary>/);
    expect(restored).toMatch(/disabled=""[^>]*data-testid="salvage-pick-medium_laser"/);

    const failed = renderToStaticMarkup(
      createElement(Debrief, {
        catalog,
        state,
        outcome: { ...outcome, won: false },
        onClose: () => undefined,
      }),
    );
    expect(failed).toContain('Contract failed · no payment · salvaged:');
    expect(failed).not.toContain('Contract failed · +100 C');

    const legacy = renderToStaticMarkup(
      createElement(Debrief, {
        catalog,
        state,
        outcome: { ...outcome, salvageOffered: [] },
        onClose: () => undefined,
      }),
    );
    expect(legacy).toContain('Medium Laser ×2');

    const exportedSave = await campaignBlob(state).text();
    const restoredState = deserialiseCampaign(exportedSave, catalog).state;
    if (restoredState === null) throw new Error('legacy campaign export did not reload');
    expect(restoredState.mechs[0]?.design.id).toBe(savedMechId);
    expect(restoredState.history[0]?.salvageCandidates[0]?.designId).toBe(
      'sentinel_brawler',
    );
    expect(restoredState.history[0]?.salvageProvenance[0]?.sourceDesignId).toBe(
      'sentinel_brawler',
    );

    const restoredPresentation = renderToStaticMarkup(
      createElement(CampaignPostBattle, {
        catalog,
        state: restoredState,
        status: null,
        outcomeCount: 1,
        debriefed: 0,
        mutate: () => undefined,
        onDebriefed: () => undefined,
      }),
    );
    expect(restoredPresentation).toContain(
      "day 4: Sentinel &#x27;Brawler&#x27; returned; AC/5 intact.",
    );
    expect(restoredPresentation).toContain("Sentinel &#x27;Brawler&#x27;");
    expect(restoredPresentation).toContain("Field Carrier &#x27;Mule&#x27;");
    expect(restoredPresentation).not.toMatch(/(?:GAD|SNL|FCR)-\d+/);
  });

  it('traps dialog focus without making Escape finalize the report', () => {
    const source = readFileSync(new URL('./Debrief.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('./salvage.css', import.meta.url), 'utf8');

    expect(source).toContain('useDialogFocus(dialogRef, dialogRef, undefined');
    expect(source).toContain('[data-testid="camp-manual-toggle"]');
    expect(css).toContain('(pointer: coarse) and (max-width: 1100px)');
    expect(css).toMatch(/\.debrief-salvage-report > summary \{[\s\S]*?min-height: 44px;/);
  });
});
