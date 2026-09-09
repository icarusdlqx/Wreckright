# Paired skirmish preparation

Each deployment berth keeps its pilot portrait and machine portrait together in the same order used by the battlefield dock. Selecting a card exposes that berth’s mech choice, pilot assignment and refit action. The dossier shows the selected pilot’s temperament, the three real skills out of five and the actual ability effects and recharge. Enemy skills use the selected enemy difficulty.

The team model supports five berths; current skirmish maps start with four. Empty berths remain selectable. Machine art is a static chassis portrait with standard equipment, while the fitted weapon count and edited-loadout label reflect the actual chosen design. Original stock, saved loadout, scenario unit and pilot controls remain available in the selected editor.

Inspected visual evidence:

- [Previous selection rows](before-lance.png)
- [Desktop pairings](skirmish-pilot-pairings.png)
- [AI enemy pairings and dossier](skirmish-enemy-pairings.png)
- [Laptop selected dossier](skirmish-pairings-laptop.png)
- [Phone horizontal team strip and stacked editor](skirmish-pairings-phone.png)

Focused model and SSR checks passed 8/8, including five-seat order, only one exposed editor, empty berth identity, edited equipment preservation, scenario vehicles, occupied pilot choices and difficulty-adjusted skill identity. The skirmish browser journey passed 32/32 checks: keyboard berth selection, actual pilot reassignment, responsive 1024/390 layouts, all six maps, both faction presets, independent tiers, empty berths, friendly and enemy refit/save/reload persistence and deployment with the exact configured weapon counts. No browser errors occurred. The AI panel also passed a separate no-overflow inspection. Detailed local evidence: reports/briefing-team-checks.log and reports/pilot-command-workspace/briefing/checks.json.
