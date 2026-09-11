# Faction equipment and reactor scheduling review

The reported 200-tonne Linewrought team (two Cairns and a Bulwark) consistently
beat three 75-tonne Halberds in the original build. This was reproducible, but it
had two causes: the reactor governor could starve a whole energy group, and the
Halberd's standard equipment did not justify its deployment weight. This review
corrects the scheduling defect and targets three stock fits, while retaining the
other thirteen standard designs and every existing chassis fitting interface.

## Reproduction controls

Starting baseline: `f50baf6`. Each side uses the same Kessa Vale pilot template,
regular tactical AI, no support points, and alternating spawn sides. The Ridge
scenario retains authored terrain/spawns; the open arenas retain the map's size
and atmosphere but remove terrain obstacles/elevation and start teams 180 or 360
metres apart. Seeds are `faction:0` onward. These are controlled autonomous
comparisons, not estimates of human win rates.

The reported-match test uses six seeds in each of three arenas:

| State | Aurelian wins, Ridge | Aurelian wins, open 180 m | Aurelian wins, open 360 m |
|---|---:|---:|---:|
| Original governor and stock | 0/6 | 0/6 | 0/6 |
| Corrected governor, original stock | 0/6 | 0/6 | 0/6 |
| Corrected governor and revised stock | 5/6 | 6/6 | 6/6 |

There were no timeouts in these trials. The governor-only replay increased the
three Halberds' Focused Large Laser shots across the six Ridge fights from 11 to
249, yet still lost every match. That separates the firing defect from the
remaining loadout problem.

## What changed

The governor previously treated a weapon group as indivisible. When its entire
ready volley exceeded safe headroom, every weapon in that group could stay off
from a cold reactor. In a legal five-emitter test fit, all four group switches
were disabled at zero heat despite 10.738 heat/s of cooling. Mixed groups could
also let cooler missile cycling repeatedly crowd out the energy group.

It now reserves individual ready spikes and gives waiting mounts priority. Guns
on cooldown do not consume a ready gun's firing allowance. A safe solo shot may
exceed average cooling because its actual spike, cooldown and subsequent
headroom checks govern safety. Transient mount throttles preserve manual group
intent, hold fire, explicit alpha strikes, damaged mounts, ammunition and range.
The regression bench verifies every emitter cycles repeatedly across 30 seconds,
stays below shutdown headroom, and produces an identical seeded replay.

| Stock | Equipment change | Visible tradeoff |
|---|---|---|
| Sentinel 45 t | Twin Medium Burst lasers in the left arm; Plasma Rifle and Focused Medium in the right torso; Medium Laser centrally; 14 Compound sinks. 44.5 t used. | Strong close exchanges and target heat, no ammunition. Left arm/right torso are critical; longer-range batteries can keep it away. Base hull cost increases from 3.4m to 4.8m credits. |
| Halberd 75 t | Extended Arc Projector and Large Laser in each arm, central Medium Laser; 13 Compound sinks; 514 armour instead of 394. Exactly 75 t used. | Fast coordinated heavy fire with no bins. An arm loss removes two main weapons; a Bulwark remains a credible solo counter. |
| Pallvault 100 t | Existing paired Large/Medium Burst arm batteries retain their identity; central Plasma Rifle added, 24 Compound sinks, 800 armour instead of 700, engine 390→375. 99.5 t used. | Sacrifices a little speed for complete plate and reactor pressure. Still faster than a Colossus, costly to repair, and strongest inside medium range. |

No weapon statistics, faction damage multiplier, armour maximum, compartment
capacity or hardpoint permission changed. Existing saved custom/mixed builds
remain legal. Replacement costs, faction workshop multipliers and mission
tonnage remain intact. Saved companies keep their fitted equipment rather than
silently receiving the new standard.

The bay cooling estimate now includes chassis traits, matching the deployed
machine before pilot, weather and terrain modifiers. For example, the Halberd's
oversized exchangers raise its stock cooling from the previously displayed
9.10 to 10.738 heat/s. An all-design parity test compares the preview with actual
entities using a neutral pilot, while a separate test keeps pilot specialities
contextual. This presentation calculation does not drive battle simulation.

A smaller-engine, full-armour Halberd alternative was tested and rejected: its
solo performance was worse. Retaining the original missiles and only upgrading
cooling/armour was also insufficient, winning just 6/18 reported-match trials.
The retained fit answers the reported team imbalance while leaving a useful
counter in the Linewrought roster.

## Distinct jobs and fitting layouts

The same standard/current mount data drives the mechbay grids and the rendered
weapon artwork. These are standard jobs, not restrictions on player refits.

| Linewrought | Standard identity | Aurelian Stock | Standard identity |
|---|---|---|---|
| Prybar 25 t | Cheap courier; arm machine guns and torso Shortbows | Vesper 25 t | Fast scanner scout; paired arm lasers and jets |
| Gadfly 35 t | Forward spotter; designation beacon, shoulder Shortbows and flamer | Votive 35 t | Sensor picket; focused/small arm emitter pairs |
| Rivet 45 t | Convoy guard; right-arm cannon, left Shortbows, anti-missile gear | Sentinel 45 t | Plasma brawler; left burst cluster and torso emitters |
| Trestle 55 t | Field battery; left-arm cannon and paired shoulder Longshots | Falchion 50 t | Jumping duellist; burst laser and close torso racks |
| Cairn 65 t | Dense shoulder missile battery and protected bins | Warden 60 t | Command skirmisher; paired arm lasers and command console |
| Bulwark 70 t | Mixed line anchor; recovered lasers, local cannon and shoulder racks | Halberd 75 t | Coordinated heavy striker; paired arc/laser arm batteries |
| Rampart 85 t | Siege breaker; right-side siege cannon and gauss rifle | Obsequy 90 t | Long-range assault; three distributed arc projectors |
| Colossus 100 t | Slow siege platform; dual gauss, shoulder Longshot and close flamers | Pallvault 100 t | Armoured assault skirmisher; burst arms and central plasma |

## Final controlled duel evidence

Twelve seeds per range, identical pilots/controllers and alternating sides:

| Pair (Linewrought vs Aurelian) | Aurelian wins at 180 m | Aurelian wins at 360 m |
|---|---:|---:|
| Prybar 25 t vs Vesper 25 t | 11/12 | 12/12 |
| Gadfly 35 t vs Votive 35 t | 12/12 | 12/12 |
| Rivet 45 t vs Sentinel 45 t | 11/12 | 9/12 |
| Trestle 55 t vs Falchion 50 t | 11/12 | 12/12 |
| Cairn 65 t vs Warden 60 t | 11/12 | 9/12, one draw |
| Bulwark 70 t vs Halberd 75 t | 5/12 | 6/12 |
| Rampart 85 t vs Obsequy 90 t | 6/12 | 11/12 |
| Colossus 100 t vs Pallvault 100 t | 12/12 | 12/12 |

All 192 trials ended without a timeout. The general equipment premium is clear;
these are deliberately not eight identical duels. In particular, the Bulwark is a
useful counter to a solitary Halberd, and the Obsequy's advantage increases at
range. Most pairings have equal weight; the unequal middle/heavy pairs are
labelled so these results are not presented as an exact per-tonne efficiency
measurement.

## Repeatability and validation

`tools/faction-matchup-audit.ts` loads the game's current validated catalogue.
Run it with `npx vite-node tools/faction-matchup-audit.ts`. Choose
`FACTION_AUDIT_SUITE=reported`, `duels` or `teams`, and set an even
`FACTION_AUDIT_SEEDS` count. Output contains full unit and weapon statistics.
The team suite separately varies pilot experience while retaining regular AI
behaviour on both sides.

Evidence from this pass is under `reports/faction-balance/`: original/post-governor
baselines, authored final reported match, final duels, and final team runs.
Focused simulation and schema validation passed 626 tests in 65 files. Existing
mixed-refit mechanics retain an explicit legacy Sentinel JSON test fixture, so
cannon, ammo and removal checks still test those systems after the public stock
changes. Full balance, campaign acceptance and browser release gates are recorded
in the enclosing build review after completion.


## Campaign safeguards

The stronger stocks exposed two real campaign regressions; neither acceptance
threshold was relaxed. Quarry Brakes fell to 3/10 tactical reference successes.
It now fields a same-tonnage local Rivet in the initial guard and a single
Aurelian Halberd as heavy relief, without the additional Votive. The player lance,
capture/hold objectives, mission tonnage and timing are unchanged. This retains
the premium heavy threat while making the worn scout-heavy company viable:
8/10 original seeds and 9/10 separate holdout seeds succeed, with no timeouts.
The briefing signals the local guard and single heavy reserve.

The 800-armour Pallvault's damaged capture took 15 workshop days, over the
existing 14-day affordability bound. Shared armour throughput rises from 120 to
140 points/day, retaining all repair costs and Aurelian's 1.35 cost and 1.25 time
multipliers. Its damaged capture now takes 14 days; a total wreck remains more
costly and slower. All 340 campaign tests across 49 files pass, excluding the
separate final campaign acceptance run. Capture affordability, repair queues,
payroll and anti-arbitrage assertions remain intact.

Mechanics tests that deliberately require the former Sentinel's autocannon,
ammunition, containment or three identical lasers now select the explicit
legacy mixed-fit fixture. Their original shortages, salvage counts, compatibility
and removal assertions are unchanged; the real catalogue still uses the new
standard build.
