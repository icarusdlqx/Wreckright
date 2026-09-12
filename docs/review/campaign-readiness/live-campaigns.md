# Campaign live playthrough

These routes use the real tactical battle simulation and campaign settlement. Each operation begins with repairs and relief hiring when needed, and every field report is saved and reloaded before the next contract. Optional contracts are deliberately skipped; a failed main contract is repaired and retried through the normal recovery rules.

## Linewrought — depot_burn

Seed: `release-live-depot_burn-2` · Cross-faction refit: Small Laser fitted to Gadfly left_arm · Closing funds: 11,096,594 C

| # | Operation | Result | Battle time | Casualties | Lost machines | Day | Funds |
| --- | --- | --- | ---: | --- | --- | ---: | ---: |
| 1 | militia_raid (line_maintenance) | win | 58.2s | Kessa Vale (misses the next mission) | Gadfly | 1 | 4432500 |
| 2 | recovery_window (recovery_window) | win | 40.4s | none | none | 2 | 4198074 |
| 3 | workshop_defence (workshop_defence) | win | 186.4s | none | Cairn | 3 | 5265817 |
| 4 | pass_skirmish (sealed_contact) | win | 80.2s | none | Gadfly | 4 | 6346798 |
| 5 | foundry_sweep_node (rules_break) | win | 55.1s | none | none | 5 | 7198832 |
| 6 | shale_overwatch_node (conduit_breach) | win | 242.3s | Dorn Hess (killed), Ilse Brant (misses the next mission), Cato Ferrin (killed) | Bulwark, Cairn, Gadfly | 6 | 9019695 |
| 7 | ridge_hold (depot_road) | win | 149.5s | none | none | 7 | 8077810 |
| 8 | depot_burn (depot_burn) | win | 267.1s | Juno Reyes (misses the next mission) | Gadfly, Bulwark | 8 | 11096594 |

## Linewrought — depot_take

Seed: `release-live-depot_take-1` · Cross-faction refit: Small Laser fitted to Gadfly left_arm · Closing funds: 8,981,386 C

| # | Operation | Result | Battle time | Casualties | Lost machines | Day | Funds |
| --- | --- | --- | ---: | --- | --- | ---: | ---: |
| 1 | militia_raid (line_maintenance) | win | 66.9s | Kessa Vale (killed) | Gadfly | 1 | 4432500 |
| 2 | recovery_window (recovery_window) | win | 40.4s | none | none | 2 | 4269298 |
| 3 | workshop_defence (workshop_defence) | win | 198.5s | none | Cairn | 3 | 4869052 |
| 4 | pass_skirmish (sealed_contact) | win | 150.7s | none | Gadfly | 4 | 6041982 |
| 5 | foundry_sweep_node (rules_break) | win | 55.1s | none | none | 5 | 6277961 |
| 6 | shale_overwatch_node (conduit_breach) | win | 117.9s | none | none | 6 | 8031511 |
| 7 | ridge_hold (depot_road) | win | 135.0s | none | none | 7 | 11644934 |
| 8 | depot_take (depot_take) | loss | 154.1s | Dorn Hess (misses the next mission), Ilse Brant (misses the next mission), Cato Ferrin (misses the next mission) | Bulwark, Gadfly, Cairn, Gadfly | 8 | 11245360 |
| 9 | depot_take (depot_take) | win | 252.6s | Juno Reyes (killed) | Gadfly, Bulwark | 9 | 8981386 |

## Aurelian Stock — continuance_export

Seed: `release-live-continuance_export-0` · Cross-faction refit: Field Autocannon fitted to Falchion right_arm · Closing funds: 12,930,526 C

| # | Operation | Result | Battle time | Casualties | Lost machines | Day | Funds |
| --- | --- | --- | ---: | --- | --- | ---: | ---: |
| 1 | first_warrant (raid_ridge) | win | 22.1s | none | none | 1 | 2542500 |
| 2 | cutbank_attestation (authority_custody_posts) | win | 68.0s | none | none | 2 | 3767011 |
| 3 | sarn_inventory (switchyard_watch) | win | 107.3s | none | Falchion | 3 | 4780453 |
| 4 | root_exchange (authority_root_exchange) | win | 76.5s | none | none | 4 | 5667585 |
| 5 | quarry_receipt (authority_quarry_receipt) | win | 129.3s | none | Falchion | 5 | 7571451 |
| 6 | conduit_injunction (authority_conduit_injunction) | win | 128.8s | none | none | 6 | 8586794 |
| 7 | barrow_warrant (authority_barrow_warrant) | win | 124.1s | none | none | 7 | 10242340 |
| 8 | continuance_export (authority_continuance_export) | win | 101.4s | none | Falchion | 8 | 12930526 |

## Aurelian Stock — local_stewardship

Seed: `release-live-local_stewardship-0` · Cross-faction refit: Field Autocannon fitted to Falchion right_arm · Closing funds: 11,651,863 C

| # | Operation | Result | Battle time | Casualties | Lost machines | Day | Funds |
| --- | --- | --- | ---: | --- | --- | ---: | ---: |
| 1 | first_warrant (raid_ridge) | win | 28.6s | none | none | 1 | 2542500 |
| 2 | cutbank_attestation (authority_custody_posts) | win | 77.5s | Teodor Krysa (killed) | Falchion | 2 | 3768086 |
| 3 | sarn_inventory (switchyard_watch) | win | 100.3s | none | none | 3 | 3924263 |
| 4 | root_exchange (authority_root_exchange) | win | 66.7s | none | none | 4 | 5567861 |
| 5 | quarry_receipt (authority_quarry_receipt) | win | 128.3s | Bo Ferrant (killed) | Falchion | 5 | 7477430 |
| 6 | conduit_injunction (authority_conduit_injunction) | win | 118.0s | none | none | 6 | 7523568 |
| 7 | barrow_warrant (authority_barrow_warrant) | win | 124.1s | none | none | 7 | 9261674 |
| 8 | local_stewardship (authority_local_stewardship) | win | 58.1s | none | none | 8 | 11651863 |

## Unsuccessful attempts

This is a bounded completion audit, not an unbeaten first-attempt playthrough or a difficulty study. Failed runs are retained below rather than hidden by the seed search.

- release-live-depot_burn-0: depot_burn: a required objective failed (arm_purge_train=active, run_archive_purge=active, lance_survives=failed)
- release-live-depot_burn-1: depot_burn: a required objective failed (arm_purge_train=active, run_archive_purge=active, lance_survives=failed)
- release-live-depot_take-0: depot_take: No mech is ready to deploy. Repair a mech, rebuild a hulk, or hire a fit reserve pilot. Wounded pilots miss the next mission.

## Coverage

- Both factions complete their eight-operation main routes with optional work skipped.
- Both endings for each faction are resolved from a real battle.
- Opposing-faction weapons are fitted through the same campaign store and refit code used by the mechbay.
- The modified loadout and every later campaign state survive JSON export and import.
- Damage, injuries, deaths and lost equipment remain whatever the tactical simulation produces; the company must repair and recover before the next drop.
