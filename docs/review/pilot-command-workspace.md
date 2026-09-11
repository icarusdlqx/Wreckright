# Pilot command workspace

Campaign preparation now uses one workspace with persistent pilot–mech pairings above the machine roster, pilot roster and mission map. Selecting a seat keeps its identity while comparing pilots, refitting weapons and reviewing the drop. The existing Graphic Expedition palette, Ironwork/Monolith machine identities and weapon illustrations remain the visual basis.

## Preparation and fitting

- Five paired seats show portraits, chassis, tonnage and readiness. Missions with fewer berths visibly restrict the unused positions. The mission tonnage allowance still governs the team.
- Pilots can be assigned by an explicit button or dragged from the roster into a cockpit. Moving a pilot leaves the old machine uncrewed; it does not silently swap pilots or remove the hull. Removing the whole seat keeps that pair in company reserve.
- The fitting workspace places all eight compartments around an anatomical silhouette. Weapons retain their recognizable illustrations on both the shelf and the installed tiles. The catalogue and inspector show damage, range, heat, size, tonnage and ammunition requirements.
- Box groups represent the existing slot capacity. Shapes pack automatically; mount type, size class, tonnage, ammunition and available stock still determine legality. Hover or keyboard focus exposes Move/Remove and detailed hardpoint/armour information.
- Missile operating notes distinguish direct fire from weapons that can use teammate sightings or live sensor tracks to fire over cover.
- Campaign refits retain the same team strip and mission allowance. Committing updates the selected machine and returns to the same cockpit. Draft edits still require an explicit commit.
- The compact mech profile retains its history link. Opening and closing the Wiki preserves an unfinished refit and returns keyboard focus to the link.
- Saved lances remain available from the preparation header. Mission maps show known insertion/terrain/objectives without revealing hidden enemies.

## Pilots, Skirmish and combat

- Every pilot dossier uses the three actual trainable skills, each out of five, alongside personality, service details and the pilot's real ability effects and recharge. Trait-derived modifiers remain separate from trainable skills.
- Both Skirmish forces use paired portrait cards with one selected berth editor. Mech/pilot selection, edited loadouts, faction filters, map selection and independent difficulty settings remain available. Enemy dossier skills reflect the chosen enemy difficulty.
- The desktop combat dock places the minimap on the left, ordered pilot/mech cards in the middle and selected-machine essentials plus commands on the right. The full inspector opens on request. Radio speech highlights the matching portrait. Destroyed machines, ejected pilots and KIA remain distinct states.
- Explicitly opening the inspector moves keyboard focus into it. Tab reaches weapon controls, while Escape closes it and returns focus to the original toggle.
- The campaign debrief pairs each returning pilot with the machine used in that mission, then shows XP, injury/fate and current machine condition. Training/repair links open the relevant record without spending resources, and the next-mission action stays at the bottom.

## Save integrity

Optional `deploymentSeats` preserve explicit cockpit choices, including empty or unavailable seats, while existing `ironline.*` storage keys and older pilot-only saves remain supported. The team displayed in preparation is the team passed into battle. An empty cockpit, duplicate assignment, wounded pilot, missing or unfieldable hull, excess tonnage or excess occupied berths blocks deployment until resolved.

A final review caught and fixed a sold-hull edge case: editing another seat must not restore a pilot's assignment to a machine that no longer exists. The missing hull stays visible in the saved plan for replacement, while the pilot remains unassigned.

No simulation rules, content balance, dependencies or externally hosted assets changed. Chassis portraits show standard equipment; the installed-weapon lists and fitting preview describe the actual loadout.

## Inspected visual evidence

- Preparation: [machine/loadout comparison](pilot-command-workspace/preparation/machines.png), [pilot assignment](pilot-command-workspace/preparation/pilot-assignment.png), [mission planning](pilot-command-workspace/preparation/mission-map.png).
- Fitting: [previous compartment list](battlefield-visuals/fitting-after.png), [anatomical refit with persistent team](pilot-command-workspace/preparation/refit.png).
- Compact fitting: [all eight compartments and the restored mech-history link](pilot-command-workspace/fitting/campaign-1280.png).
- Responsive preparation: [1280px laptop](pilot-command-workspace/preparation/1280.png), [390px phone](pilot-command-workspace/preparation/390.png).
- [Skirmish before/after review](pilot-command-workspace/briefing/README.md).
- [Combat dock, radio and casualty review](pilot-command-workspace/combat/README.md).
- [Personal campaign debrief](pilot-command-workspace/crew/company-outcome-crew-desktop.png).

All captures use an isolated headless browser. The user's desktop was not controlled or locked.

## Validation

- Type checking and complete lint passed.
- Fast automated suite: **3,338 tests passed across 414 files**.
- Focused post-fix deployment, preset, market and campaign acceptance checks: **55 passed**.
- Hosted build and self-contained build passed; the offline file is approximately **3.69 MB**. Both local preview ports serve build `a93f37708ddb8d02`.
- Offline browser journey: **17/17 passed**, including portrait dragging, exact cockpit/loadout persistence, committed weapon edits and deployment, with zero external requests or browser errors.
- The minimap performance probe now compares paints with actual eligible animation frames instead of an inaccurate average-frame-rate floor. Its two-blit and rendering-cost limits remain intact; **9 cadence checks** cover low/high frame rates, jitter and deliberately skipped updates.

The complete browser playthrough passed **1,137/1,137 checks** in one final run, including training, campaign preparation and outcomes, both Skirmish forces, actual weapon dragging, save/import recovery, sensor/support effects, combat controls, the Wiki, keyboard navigation, and portrait/landscape/tablet layouts. The final log is `reports/pilot-command/full-complete.log`; its screenshots are under `reports/pilot-command/full-complete/`.
