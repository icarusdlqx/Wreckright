# Campaign release verification

Verified 11 September 2026 on the `codex/campaign-c12` campaign stack.

## Playable routes

The four main routes were completed through the real tactical simulation, campaign settlement, repair, hiring, refit, save and reload systems. Optional contracts were skipped so the result does not depend on extra income.

| Faction | Ending | Seed | Battles | Closing funds |
| --- | --- | --- | ---: | ---: |
| Linewrought | Burn the depot | `release-live-depot_burn-3` | 8 wins from 9 drops | 8,657,973 C |
| Linewrought | Take the depot | `release-live-depot_take-0` | 8 wins from 9 drops | 10,320,095 C |
| Aurelian Stock | Export continuance | `release-live-continuance_export-0` | 8 wins from 8 drops | 12,738,308 C |
| Aurelian Stock | Local stewardship | `release-live-local_stewardship-0` | 8 wins from 8 drops | 4,714,012 C |

The runs retained injuries, pilot deaths, destroyed machines and repair delays from the simulation. Both factions also fitted one captured opposing-faction weapon, then saved and reloaded the changed machine successfully. The detailed field record is in [campaign-playthrough.md](../review/release-audit/campaign-playthrough.md).

## Economy and content

- Main-only and optional-contract projections finish solvent on both clean and costly recovery assumptions.
- Every main operation, optional contract, reward, speaker, location and campaign link passes the content-consistency audit.
- The Aurelian local-stewardship opening now protects its verification sites rather than stealing its own handover.
- Detailed projections are in [campaign-economy.md](../review/release-audit/campaign-economy.md).

## Automated checks

| Check | Result |
| --- | --- |
| Fast unit and integration suite | 3,458 passed |
| Campaign acceptance suite | 15 passed |
| Simulation balance suite | 10 passed |
| Full browser journey | 1,300 passed |
| Campaign save and release journey, Chromium and Firefox | 182 passed |
| Interface consistency journey | 53 passed |
| Live four-route campaign audit | Passed |
| Content and economy audits | Passed |

The browser coverage includes skirmish setup, all twelve terrain maps, faction filtering, pilot assignment, pointer and keyboard refitting, ammunition, campaign progression, save export/import and recovery, sensor contacts, repair trucks, air strikes, audio controls, combat damage and phone/tablet layouts.

## Presentation and performance

All twelve battlefields render successfully with no browser errors. The reviewed campaign hub, preparation screen and Linewrought, Aurelian and Barrow landscape captures contain no clipping, overlap or unreadable state.

The repeatable 4v4 software-rendered performance probe passed three samples, a 90-second battle, and four restart cycles with no GPU-resource, scene-resource, document or live-audio growth. Its median was 700 draw calls and 222,657 triangles. The headless SwiftShader frame rate is a comparison signal rather than native player performance; full measurements remain in `reports/campaign-c12/performance/`.

## Release assessment

No campaign-blocking defect remains from C04-C12. The verified build is ready for a private external playtest. Public release should still wait for feedback from players who have not seen the design process, especially on mission clarity, difficulty and pacing.
