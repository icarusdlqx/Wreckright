# Graphic Expedition presentation review

Review date: 5 September 2026. Status: integrated presentation candidate on a review branch; per-commit browser results are recorded in the pull request.

## Scope and baseline

This work gives **Wreckright** the stylised, colourful, readable **Graphic Expedition** direction chosen during The Long Crossing exploration. The game being updated is Wreckright, including its existing campaigns, machine cultures, combat, economy and saves.

- Baseline: fresh main at `b3227b357284ff66d92d2ad70f4933aa1f2a2663` (`b3227b3`).
- Isolated checkout: `wreckright-graphic-expedition`.
- Working branch: `codex/graphic-expedition`.
- The Long Crossing prototype's simpler combat, upgrade system, convoy campaign and five-machine limit are **not being migrated** into this game.
- At this review snapshot, the tracked diff contains no changes under `src/sim`, `src/schema`, `src/campaign` or `src/data`. Presentation work reads existing campaign and simulation state; it must not change their decisions.

This document records the source audit and presentation decisions. The pull request carries the final per-commit validation and release status.

## Game systems to preserve

| System | Existing behaviour that the presentation must explain and preserve | Source anchors |
| --- | --- | --- |
| Deployment | The existing six-berth framework and authored mission tonnage determine the drop. `dropTeam` uses the existing ordering, skips machines that would exceed the allowance, and stops when berths are filled. A ready company and the actual drop are different counts. | [deployment.ts](../src/campaign/deployment.ts) |
| Crew assignment | Fit pilots retain their assigned machines. Unassigned fit pilots can be paired with free fieldable machines. Holding back a pilot, injuries, death, weaponless hulls and workshop work affect availability. Viewing the manifest must not write an assignment. | [deployment.ts](../src/campaign/deployment.ts), [roster.ts](../src/campaign/roster.ts), [types.ts](../src/campaign/types.ts) |
| Combat | The deterministic simulation retains component armour and structure, front/rear protection, critical damage, heat and shutdown, ammunition, fire modes, stability, movement, sensors, terrain and orders. Pause remains part of commanding the battle. Presentation cannot substitute a single health pool or a generic disable threshold. | [combat.ts](../src/sim/combat.ts), [critical.ts](../src/sim/critical.ts), [heat.ts](../src/sim/heat.ts), [orders.ts](../src/sim/orders.ts), [sensors.ts](../src/sim/sensors.ts) |
| Deep refit | Mount compatibility, slots, tonnage, ammunition, armour allocation, cooling and actual company stock remain meaningful. Fitting, removing, previewing and reviewing equipment continue through existing edit and inventory validation. Existing damage carries through a refit. | [Mechbay.tsx](../src/ui/mechbay/Mechbay.tsx), [refit.ts](../src/campaign/refit.ts), [refitQuote.ts](../src/campaign/refitQuote.ts) |
| Machine cultures | Linewrought workshop construction and Aurelian sealed construction retain their authored identity, equipment and economic context. Origin alone is not an equipment-fit prohibition: mount, slots, tonnage and stock decide fit. Faction appearance must remain distinct from tactical team markings. | [machineCulturePresentation.ts](../src/ui/mechbay/machineCulturePresentation.ts), [factionEconomy.ts](../src/ui/campaign/factionEconomy.ts), [mechMaterials.ts](../src/render3d/mechMaterials.ts) |
| Repairs and rebuilding | Work is paid when booked and uses the existing workshop capacity and completion dates. Fieldable damage can still be repaired; an unavailable machine must explain its queue or completion date. Recovered hulls require their existing rebuilding/refit process. A paid booking must not be presented as a second bill. | [repair.ts](../src/campaign/repair.ts), [refit.ts](../src/campaign/refit.ts), [salvagedHull.ts](../src/campaign/salvagedHull.ts) |
| Calendar and payroll | Advancing campaign days pays living crew, progresses repairs, resolves applicable campaign events and can expire contracts. A repair quote and payroll through its completion date are separate amounts. | [ledger.ts](../src/campaign/ledger.ts), [campaign.ts](../src/campaign/campaign.ts), [contractBriefing.ts](../src/campaign/contractBriefing.ts) |
| Contracts and campaign | Authored prerequisites, mission objectives, negotiation packages, salvage share, deadlines, employer history, failure/recovery terms and company solvency remain in force. Changing the screen organisation must not make these optional. | [campaign.ts](../src/campaign/campaign.ts), [contractTerms.ts](../src/campaign/contractTerms.ts), [employers.ts](../src/campaign/employers.ts), [solvency.ts](../src/campaign/solvency.ts) |
| Salvage and results | Recovery follows the recorded battlefield outcome and custody/eligibility rules, including hull recovery chances and component provenance. Recovered hulls are separate from the offered crates. The existing initial selection of up to three crate picks can be adjusted before finalisation; adjusting swaps the original selection rather than granting another reward. | [salvage.ts](../src/campaign/salvage.ts), [Debrief.tsx](../src/ui/campaign/Debrief.tsx), [CampaignPostBattle.tsx](../src/ui/campaign/CampaignPostBattle.tsx), [history.ts](../src/campaign/history.ts) |
| Saves and recovery | Schema validation, supported old-save migrations, import/export, memory-only recovery states and original-save export remain. Existing `ironline.*` storage keys must remain usable; a visual rebrand must not orphan a campaign. Deployment is held when the campaign cannot be safely persisted. | [save.ts](../src/campaign/save.ts), [saveSchema.ts](../src/campaign/saveSchema.ts), [storage.ts](../src/campaign/storage.ts), [CampaignRecoveryNotice.tsx](../src/ui/campaign/CampaignRecoveryNotice.tsx) |

## Flow audit and findings

| Area | Existing flow and finding | Direction in this pass |
| --- | --- | --- |
| Home | Learn Command, campaign and skirmish already have distinct entry behaviour, including training resume and saved-campaign detection. The front door should introduce the actual world and machines immediately. | New masthead, premise, clearer route hierarchy and two authored 3D machine previews. Existing entry handlers remain. |
| Campaign operations | The board encodes prerequisite routes and contract states; the contract panel carries the consequential financial decisions. The previous full-company view stacked many unrelated panels in one long page. | Printed-map styling is implemented. Operations/Workshop/Crew/Stores & yard navigation is implemented to make each visit a focused task. |
| First contract | The pristine, correctly assigned first company already has a direct sign-to-launch path. The guided route remains necessary for damaged, unarmed or misassigned companies. | Preserve direct launch and the optional full preparation corridor. New visual steps support the corridor; they do not add a mandatory detour to a ready first drop. |
| Hangar preparation | Machine names and condition strings provided little visual identity. Repair price, queue timing and paid status needed stronger separation. | Lightweight chassis portraits, culture labels, readiness badges and explicit booking facts now sit beside existing actions. |
| Manifest | The old list made players infer the actual drop from individual status lines. An automatically paired pilot could appear to have no machine. Reordering rows on a bench action would also move controls under the pointer. | A top summary lists exactly the `dropTeam` result. Rows explain reserve reasons and automatic pairings while retaining pilot order and the existing assignment/bench/refit controls. |
| Full mechbay | The existing workspace already supports detailed fitting, armour/cooling work, preview, comparison and review. Density and uneven visual hierarchy make those capabilities harder to learn. | Paper work surfaces, dark machine diagrams, stronger type hierarchy and consistent selection/fit states are implemented in scoped styles. Editing rules and inventory remain unchanged. |
| Stores and yard | Equipment stock, trade, hull rebuilding and faction supply limitations affect what can be fielded. These should remain reachable without competing with the current contract. | Existing panels are being grouped within Stores & yard. Further prioritisation of useful purchases is future work. |
| Crew | Assignment, availability, traits, ratings and progression already exist. They deserve a clear destination, and the manifest must retain access to their practical effects. | Crew becomes a workspace area. Manifest ratings and availability remain visible. More contextual explanation of ratings is future work. |
| Battle | Several useful readouts already exist: objectives, component damage, orders, fire modes, support, sensor information and training prompts. Their visibility must survive brighter scenery and a larger typographic hierarchy. | Shared dark tactical surfaces, clearer type and state styling accompany the brighter battlefield palette. Full map/weather/zoom validation remains pending. |
| Results and salvage | The debrief already leads with the payout and salvage receipt and keeps detailed recovery/selection in a disclosure. It also records pilot consequences and employer history. | Preserve this useful concise receipt and its adjustment/finalisation flow. Broader debrief navigation is under integration; no new recovery or reward rules are claimed. |
| Files and restart | Save/load/export/import, campaign choice and restart were peers in a crowded header. Immediate restart sat close to routine controls. Recovery notices need to remain conspicuous. | Header file-action grouping and restart confirmation are being integrated. Import/export and memory-only recovery behaviour must remain intact. |

The strongest opportunity is reducing the effort required to understand an existing decision. The game already has substantial tactical and campaign depth. Better grouping, machine recognition and plain readiness explanations can expose that depth without changing balance.

## Implemented presentation work

### Home and actual machines

[HomeScreen.tsx](../src/ui/HomeScreen.tsx), [HomeMachines.tsx](../src/ui/HomeMachines.tsx), [CommandMark.tsx](../src/ui/CommandMark.tsx) and [graphicHome.css](../src/ui/graphicHome.css) establish the new front door. The featured Bulwark and Warden use the existing `MechPreview` renderer and authored designs (`bulwark_assault` and `warden_lancer`), including their fittings. They are representative game machines, rather than unrelated promotional illustrations. The home layout introduces Tessell, the Great Recall and the two machine cultures while retaining the established training/campaign/skirmish routes.

### Shared visual language, battle and mechbay

[expeditionTheme.css](../src/ui/expeditionTheme.css) defines paper, ink, orange and teal tokens and locally bundled DM Sans/Barlow Condensed typography. Tactical displays keep dark navy surfaces; planning and workshop tools use paper surfaces. [expeditionBattle.css](../src/ui/expeditionBattle.css), [expeditionBriefing.css](../src/ui/expeditionBriefing.css), [expeditionMechbay.css](../src/ui/expeditionMechbay.css) and [expeditionWorkbench.css](../src/ui/expeditionWorkbench.css) apply the hierarchy to existing components. Focus, high-contrast and forced-colour styling are present; complete accessibility acceptance is still a verification task.

### Faction finishes and battlefield environment

[graphicMaterials.ts](../src/render3d/graphicMaterials.ts) adds broad illustrated lighting bands within the existing material pipeline. [mechMaterials.ts](../src/render3d/mechMaterials.ts) supplies warm field-painted Linewrought finishes and cooler Aurelian finishes while retaining team trim and damage states. The treatment survives material cloning for wear. This pass does not claim a wholesale redesign of every chassis silhouette.

[palette.ts](../src/render/palette.ts), [terrain.ts](../src/render3d/terrain.ts) and [propGeometry.ts](../src/render3d/propGeometry.ts) introduce meadow greens, warm rock, turquoise water and clearer vegetation/building colour planes. The building prop treatment adds readable architectural details. These are renderer changes; the authored terrain classifications and simulation rules stay in place. Close/far readability, night conditions and performance require the final integrated visual pass.

### Campaign map

[CampaignMap.tsx](../src/ui/campaign/CampaignMap.tsx) uses a lighter cartographic ground, contours, river and grid. Existing mission glyphs, states, employer labels, prerequisite routes and selection handlers remain. A deterministic layout keeps cards inside the map and moves overlapping labels apart; routes follow their displayed centres. Its intrinsic minimum height converges across repeated resize callbacks, including narrow screens. The decorative contours do not become new campaign terrain mechanics or mission information.

### Preparation and deployment

[Hangar.tsx](../src/ui/campaign/Hangar.tsx), [LanceManifest.tsx](../src/ui/campaign/LanceManifest.tsx), [MachineIdentity.tsx](../src/ui/campaign/MachineIdentity.tsx) and [preparation.css](../src/ui/campaign/preparation.css) provide:

- Check machines → assemble the drop → field briefing steps, with signed terms available in a disclosure.
- Chassis identity using the existing lightweight `ChassisSilhouette`, plus name, tonnage, role and culture.
- An actual-drop summary with boarding order, machine/pilot pairings and remaining tonnage.
- Distinct reserve explanations for a held pilot, infirmary, workshop, rebuilding, missing weapons, no free fieldable machine, tonnage or berths.
- Read-only automatic pairing feedback, without silently changing the assignment select or campaign save.
- Repair price versus paid booking, starts/ready dates, payroll through completion and a warning when the expected completion falls after the signed deadline.

Existing test IDs, mutation handlers, bench behaviour and pilot row order are retained. The readiness calculation still comes from the existing campaign functions.

### Campaign workspace and header

[CampaignWorkspace.tsx](../src/ui/campaign/CampaignWorkspace.tsx) and [CampaignScreen.tsx](../src/ui/campaign/CampaignScreen.tsx) organise the company around **Operations**, **Workshop**, **Crew** and **Stores & yard**. Navigation state is transient; campaign state remains authoritative. The workspace provides company readiness, crew/payroll and contract context while preserving the first-drop disclosure rules.

[CampaignHeader.tsx](../src/ui/campaign/CampaignHeader.tsx) keeps company status and calendar advancement prominent, groups file actions in a native disclosure, and confirms restarting before replacing the current company. Cancel and Escape preserve the saved run and restore focus. [CompanyWorkshop.tsx](../src/ui/campaign/CompanyWorkshop.tsx) adds portraits, repair/booking facts and direct entry to the existing detailed refit bay. Refit cancellation returns to Workshop; inventory and damage validation still use the existing model. Related result/debrief integration is in [CampaignPostBattle.tsx](../src/ui/campaign/CampaignPostBattle.tsx).

## Prioritised remaining upgrades — future work

| Priority | Upgrade | Why it matters and a concrete acceptance target |
| --- | --- | --- |
| P1 | Camera-relative audio placement | The existing sound system already synthesises weapons, impacts, destruction, footfalls, lifecycle moments, terrain ambience and adaptive music. `AudioDirector` calculates distance attenuation, and `AudioGraph` applies air filtering; its placement currently contains level and distance rather than a stereo position. A future pass can add camera-relative left/right placement with a centred interface bus. A left-side visible shot should be heard on the corresponding side, and camera rotation should remain coherent. |
| P1 | Audio settings and listening validation | The current persisted preference is mute, with a fixed master level. Add separate music, effects and interface levels, a master control and suitable dynamic-range options. Preserve voice admission limits, terminal-event priority, gesture unlocking and context cleanup. Test headphones and laptop speakers during both sparse and saturated combat; source tests cannot establish perceived quality. No settings overhaul is implemented in this pass. |
| P1 | Stronger chassis silhouettes at gameplay distance | Existing authored blueprints and construction differences are valuable. Further author shoulder mass, head/torso placement, gait, leg profile and weapon mounting for similar-sized machines. Validate recognition in silhouette and at normal tactical zoom, including grayscale, before adding more surface detail. Keep rendered shapes consistent with machine identity, damage locations and preview/battle models. |
| P1 | Teach consequential decisions in context | Range training, heat guidance, salvage drills and the first-contract guide already exist. Extend them with brief, situational explanations: why a machine is held back, what repair waiting costs, how a firing mode affects heat/range, and why a particular hull was ineligible for recovery. Aim for a new player to complete the first contract and explain one refit/repair/salvage choice without opening a long manual. This remains a playtest-led follow-up. |
| P2 | Improve campaign comparisons | Introduce focused comparisons for fieldable-versus-repairing machines, relevant stock and the practical effect of a purchase or refit. Use actual existing values and distinguish readiness from health and assignment. Avoid a second upgrade currency or a parallel simplified equipment system. |
| P2 | Complete the debrief's next action | After reviewing payment, losses and salvage, help the player reach the relevant workshop, crew or stores task. Preserve the current concise receipt, default crate picks, provenance and finalisation. Do not turn a visual reward moment into another payout or bypass recovery rules. |

## Verification record

Baseline browser run: **667/667 checks passed** against the immutable `b3227b3` source snapshot. Before images are retained in `reports/before/`.

Integrated checks:

- TypeScript, full ESLint and third-party notices: passed.
- Fast suite: **312 files, 2,535 tests passed**, including unchanged deterministic combat/campaign tests. No sim-affecting code or data changed, so the separate balance gate was not required.
- Production and self-contained builds: passed. The single file embeds all three font binaries and both font licenses.
- Offline smoke: passed through home, machine previews, direct Workshop refit, contract and battle deployment, with **zero external HTTP requests or page errors**.
- Full integrated browser playthrough: `npm run verify:ui`; the pull-request checks and validation record hold the result for each commit.
- Before/after inspection covers home, briefing, battle, campaign and workshop/refit, including the portrait battle layout. The final validation record identifies the remaining touch and outcome captures inspected.
- Read-only review identified a map resize feedback loop, optional home-preview failure propagation and a mobile gutter specificity issue. All three were fixed and rechecked. Resize convergence is covered for both authored campaigns; preview failure is injected in the browser test.
- Final source diff contains no changes under `src/sim`, `src/schema`, `src/campaign`, `src/data` or `src/audio`; package versions and lockfile are unchanged.

The browser tests retain existing gameplay assertions. Navigation helpers open Company files before file actions and explicitly confirm restart. New checks cover cancellation without save mutation, workspace navigation, direct refit/focus restoration, actual offline font loading and optional-preview failure. A state-based bounded wait replaces a fixed initial clock delay. Normal zoom now explicitly retains surface detail, and a 610m fixture checks its removal.

The Low FX Causeway fixture still draws **19 calls / 51,956 triangles / 3 textures**. Its resident geometry count rises from 212 to **224** because normal zoom initially uploads four optional surface parts on each of three visible signature machines. Low FX hides those parts; repeated quality changes retain the same resources. The test records this exact new residency budget. This is a controlled fixture check, not a broad frame-rate benchmark across hardware.

Artifacts and inspection evidence are generated under `reports/` and `dist-single/`, both ignored by Git. The existing synthesised effects and score were preserved and exercised by the audio regression tests; this pass does not claim a new sound mix or a human listening evaluation.

Release status: review branch; production has not been updated by this work.
