# Work board: the fun pass

This is the standing brief for the next phase: combat feel, mechbay depth,
graphics, sound, navigation, and — new for this board — **gameplay mechanics
inside the simulation**. The previous board (atmospheres, damage floaters, the
colour rework, terrain-aware footfalls, prop snags) has largely shipped; check
the current state of anything before starting it.

**Read `AGENTS.md` first** — architecture rules, commands, branch/deploy
workflow, none of it optional. This file says *what* to work on and *how to
know it worked*.

Take **one task per branch, one branch per pull request.** Tasks are
deliberately independent so several can be in flight without collisions.

## How to see your own work

The browser harness drives a real playthrough — desktop, campaign, mobile
portrait, landscape, and tablet — and drops ~47 screenshots:

```
node tests/e2e/playthrough.mjs        # ~404 checks, writes reports/e2e/*.png
SHOT_DIR=./reports/before node tests/e2e/playthrough.mjs
```

**Capture a before set, make your change, capture an after set, and look at
both.** A visual change you have not looked at is not finished. Attach the pair
to the pull request.

For anything the harness does not reach, `npm run dev` serves the game and
`globalThis.__wreckright = { engine, world, useGame }` is live in the dev
console (dev builds only — production strips it).

## The simulation: rules of engagement

Earlier boards banned `src/sim` outright. **This board charters specific tasks
into it** — the ones tagged `[sim]` below — under the full discipline:

- All randomness through `ctx.rng` / `world.rng`. `Math.random`, `Date.now`,
  `performance.now` are lint errors in `/sim` and will fail CI.
- Every sim change ships with a Vitest, and the determinism suite must stay
  green: identical seed → identical outcome.
- **The balance gate.** Any change under `src/sim` or to sim-feeding data
  (weapons, chassis, equipment, rules, mission tuning) requires
  `npx vitest run src/sim/balance.test.ts` (~90s, 200 mirror seeds) **and**
  `npx vitest run src/campaign/acceptance.test.ts`, run **after your final
  edit**. State both results in the pull request.
- **Never edit `src/data/missions/mirror_ridge.json`.** It is the balance
  fixture; `startingResourcePoints` stays `0`.
- No stat hardcoded in TypeScript. New tunables go in `src/data/rules/*.json`
  with a matching Zod field in `src/schema/` — see how
  `withdrawal.endgameClockFraction` was added to `rulesAwareness.ts` and
  `ai.json` for the pattern.
- **Run `[sim]` tasks one at a time.** Two open branches that both move
  sim-feeding data will invalidate each other's gate runs. Presentation
  branches can proceed in parallel with anything.
- Measure before you tune. `runBattle` from `src/sim/world.ts` plus
  `factionLance`/`lanceEntries` from `src/ui/lance.ts` make a 40-seed arena a
  ten-line script; a balance claim without a win-rate number is an opinion.

## Hard boundaries (unchanged)

- **No new npm dependencies.** The single-file build inlines everything under a
  strict CSP. Write the twenty lines instead.
- **No external URLs for assets** — no CDN fonts, no remote images, ever.
- **`public/` does not ship in the itch build.** In-game art is `import`ed from
  `src/` (inlined as data URIs — mind the size) or drawn procedurally.
- **Do not rename the legacy `ironline.*` localStorage keys.** They are the
  only handle on players' existing saves.
- Files stay under ~400 lines; split before exceeding. (`Mechbay.tsx` sits at
  443 and wants splitting, not growing.)
- Comments explain **why**, never what. Match the dry, concrete prose voice.
- Never name an AI model in code, comments, data, or docs.
- Rendering and audio read the world; they never write it.

## Definition of done, every task

```
npx tsc --noEmit
npx eslint .
npx vitest run --exclude "**/balance.test.ts" --exclude "**/e2e/**"
node tests/e2e/playthrough.mjs
```

All four green — plus the balance gate pair for `[sim]` tasks, plus
before/after screenshots for anything visual. Push `codex/<short-name>`, open a
pull request. **Do not merge to `main` yourself** — `main` deploys straight to
the live site.

Sizes below are honest estimates: **S** under a day, **M** a day or two,
**L** several days, **XL** a flagship worth breaking into stages (still one
branch per stage).

---

# Tier 1 — Combat feel `[render/ui]`

## 1.1 The killing blow deserves a camera (M)

**Files:** `src/render3d/camera.ts` (`TacticalCamera`), `src/ui/engineCore.ts`
presentation hooks, `src/ui/enginePresentation.ts`.

When the battle-deciding kill lands — the shot that drops the last enemy — the
camera does nothing special. Wanted: on `mech_destroyed` that ends the battle,
a two-second slow push toward the wreck before the results screen, honouring
`prefers-reduced-motion` (the camera already carries a `reducedMotion` flag —
use it, don't re-detect). The sim must not wait for the camera: the world is
already finished; this is presentation borrowing time from the results screen.

**Done when:** the last kill reads as an event, an ordinary kill is untouched,
and with reduced motion the push is a cut.

## 1.2 Incoming-fire direction (S)

**Files:** `src/ui/BattleHud.tsx` or a small new component, `src/ui/styles.css`.

Damage arrives with no directional read: a player whose selected mech is being
shot from off-screen learns it from the paper doll. Wanted: a brief directional
tick at the screen edge when a *selected or player-team* mech takes a hit from
an off-screen shooter, derived from `projectile_hit` events plus the shooter's
position — both already in the event stream. Pool the ticks; no per-hit
allocation. Respect the fog boundary: `canPresentEntity` decides whether the
shooter's bearing may be shown at all.

**Done when:** being flanked is legible without moving the camera, and the perf
overlay's `other` line does not move under sustained fire.

## 1.3 Wrecks that stay wrecked (M)

**Files:** `src/render3d/battleEffects.ts`, `src/render3d/effects.ts`
(`ScarLayer` pattern), `src/render3d/unitViews.ts`.

Destroyed machines already persist as hulks. The *ground* forgets: scorch marks
fade, craters don't exist, and a late-battle field looks like an early one.
Wanted: artillery and ammo-explosion craters as decals that persist for the
battle, smoke columns off fresh wrecks that thin over a minute, and scars that
accumulate rather than recycle too eagerly. Fixed-capacity pools throughout —
follow `ScarLayer`; the pooling discipline in this codebase was hard-won.

**Done when:** a screenshot at minute six looks like a place where a battle has
been happening, and draw calls have not climbed (P toggles the perf overlay).

# Tier 2 — Gameplay mechanics `[sim]` — run these one at a time

## 2.1 The enemy learns to use its wallet (L) — the flagship of this tier

**Files:** `src/sim/ai/tactical.ts`, new `src/sim/ai/support.ts`, tunables in
`src/data/rules/ai.json` + schema in `src/schema/rulesAwareness.ts`.

`callSupport` has **zero call sites in `src/sim/ai/`** — the enemy sits on its
resource points all battle, every battle. Support is a player-only system, so
veteran and elite difficulty never once threaten the player with the tools the
game itself owns. Wanted: a doctrine layer the tactical AI consults each
decision tick —

- **artillery** on a zone where two-plus player mechs have held position;
- **air strike** along a clustered advance;
- **sensor probe** into fog the lance is about to push through;
- **repair truck** behind its own line when a heavy is hurt but safe.

Gate everything by difficulty via the existing tier flags in
`difficulty.json` (add `usesSupport` per tier — green/regular never call).
All thresholds (cluster radius, hold seconds, minimum RP reserve) are data in
`ai.json`. The mirror match runs both sides through this doctrine, so it stays
symmetric — but expect the gate's *durations* to shift, and say so in the PR.

**Done when:** on elite, a player who parks a lance in a capture zone eats a
fair, telegraphed artillery call (the pending-call marker already renders);
green plays exactly as before; balance gate and acceptance both green.

## 2.2 The probe earns its 200 RP (M)

**Files:** `src/sim/support.ts`, `src/sim/sensors.ts`, `src/ui/`
(`eventLogPresentation.ts`), tunables in `src/data/rules/support.json`.

The sensor probe works — it was e2e-verified — but it cannot pay for itself:
the log says "sensor probe on target" whether it found a lance or empty ground,
and the sweep ring draws at 0.3 opacity (`markerLayer.ts:79`). Wanted, in
order of value: the resolution event carries a contact count and the log says
"Sensor sweep — 3 contacts" or "— nothing in range"; the ring gets a legible
presentation with a remaining-duration read; and (the sim half) **indirect
fire**: missiles may target a *detected-but-unseen* contact at an accuracy
penalty authored in `support.json` — which finally gives the probe a payoff
chain worth its cost.

**Done when:** probing empty ground and probing a lance read differently within
one second, indirect fire works and is visibly worse than sighted fire, gates
green.

## 2.3 Weather that reaches the instruments (L)

**Files:** `src/schema/atmosphere.ts` (new optional `mechanics` block),
`src/sim/world.ts` + `src/sim/sensors.ts`, atmosphere JSONs.

Nine atmospheres exist and all of them are pure theatre — rain, dust and
moonlight change nothing a sensor or a gun can feel. Wanted: an optional
`mechanics` block per atmosphere — `sightFactor`, `sensorFactor`,
`heatDissipationFactor` — validated in the schema, defaulted to 1, applied in
the sim (the mission already names its atmosphere; thread it through
`createWorld`). Tune gently: rain that halves sensors is a different game;
0.85–0.9 factors are felt without being the whole battle. Night favours the
sensor-heavy Aurelian roster; dust favours knife-range brawlers — say which
missions exploit this in the PR.

**Done when:** the same skirmish at `hard_noon` and `moonlit_night` plays
measurably differently (state the arena numbers), no atmosphere makes the
balance gate fail, and every existing atmosphere still loads (the block is
optional).

## 2.4 Fire modes (XL — stage it)

**Files:** `src/schema/weapon.ts`, `src/sim/combat.ts` + `src/sim/loadout.ts`,
`src/ui/` weapon-group controls, weapon JSONs.

The catalogue's most interesting weapons are flattened by having one trigger.
Wanted: an optional `modes` array on a weapon — each mode a named override of
`damage`/`projectiles`/`accuracy`/`heat`/`cooldown` — with the LB-X cannon
(slug ↔ cluster) as the proving piece and the Longshots' minimum range as the
second candidate (`direct` ↔ `arc`: arc ignores min-range, pays accuracy).
Stage 1: schema + sim + one weapon + tests. Stage 2: the mode toggle in the
weapon-group UI and the mechbay dossier. Stage 3: AI mode selection (simple
range-band rule, in `ai.json`).

**Done when (stage 1):** a mode switch is deterministic, saved battles replay
identically, and the balance suite scores each mode as its own efficiency row.

## 2.5 Fire on the field (XL — the showpiece)

**Files:** `src/sim/terrain.ts` + a new `src/sim/fire.ts`, rules in
`src/data/rules/terrain.json`, presentation in `src/render3d/`.

Forests are concealment that nothing can remove. Wanted: flamers, ammo
explosions and artillery can **ignite forest tiles**; fire spreads tile-to-tile
through `world.rng` with a wind vector from the atmosphere (2.3's block can carry a
wind vector), burns for an authored duration, then leaves a burnt tile — less
concealment, no fire risk. Standing in fire adds heat per second. Everything
deterministic, everything data-authored, and the vision system already
re-reads terrain factors per tile so a burnt tile's lower `visionFactor` costs
nothing extra. Presentation: instanced flame billboards + smoke on burning
tiles, scorched material on burnt ones.

This is the task most likely to tempt a shortcut around determinism. Resist:
fire state lives in the world, advances in `stepWorld`, and replays exactly.

**Done when:** torching a treeline to smoke out a scout is a real tactic, the
determinism suite is green, and a 200-seed gate run shows fire has not
destabilised the mirror (durations may move; win rate must hold).

# Tier 3 — Mechbay depth `[ui]`

## 3.1 Armour as a paper doll, not eight numbers (L)

**Files:** `src/ui/mechbay/ArmourWorkbench.tsx` (237 lines),
`src/ui/mechbay/ChassisSilhouette.tsx`.

Armour allocation is the bay's last prose-heavy surface. Wanted: the silhouette
becomes the editor — click a location, drag or scroll to pour points in or out,
front/rear split on the torsos via the existing presets, red wash where a
location is under its class median, live tonnage cost as you drag. The
`design.armour` model and validation stay exactly as they are; this is
presentation over the same numbers, the way the rack was.

**Done when:** a player can re-armour a machine without reading a number they
didn't choose to read, and keyboard editing still works (the audit's dialog
standards apply — this bay has real accessibility to protect).

## 3.2 The build compared to something (M)

**Files:** new `src/ui/mechbay/BuildCompare.tsx`, data from
`computeLoadout` + `computeHeatProfile` + `weaponEfficiency`.

Every edit changes the machine and nothing says *from what*. Wanted: a compact
delta strip against the stock design (or the last saved build): speed, armour
total, sustained heat margin, alpha damage, dps at short/medium/long — each as
`before → after` with a coloured direction. All the maths exists in
`src/sim/loadout.ts`, `src/sim/loadoutHeat.ts` and
`src/sim/balance.ts`; this task is arrangement, not computation.

**Done when:** swapping a Gauss for two Longshots tells you in one glance what
you traded away.

## 3.3 Range-band damage chart (S)

**Files:** new small component beside the dossier, pure SVG, no dependencies.

The dossier states reach as numbers. A weapon's real shape is damage-by-range.
Wanted: a tiny inline chart (procedural SVG) of expected dps across 0–600m for
the inspected weapon, and — the good part — a stacked one for the *whole
current loadout*, so a player sees their build's envelope and its dead zones.
Accuracy falloff and min-range come from the weapon schema's range block.

**Done when:** the Longshot's minimum-range hole is visible as a hole.

# Tier 4 — Graphics `[render]`

## 4.1 Night operations (M)

**Files:** `src/render3d/atmosphere.ts`, `src/render3d/battleEffects.ts`,
`moonlit_night.json`, `ash_dusk.json`.

Night exists as dim light. It should exist as *dark*: weapon fire that actually
illuminates — muzzle flashes throwing brief light pools, beams glowing, tracer
trails reading hot against black ground — and mechs carrying small running
lights (the startup-light system in `src/render3d/startupLights.ts` already
knows where lights live on a hull). Point lights are budgeted: pool four,
recycle by age, never one per shot.

**Done when:** a night screenshot is unmistakable at a glance, enemy mechs
remain pickable (readability beats atmosphere — standing rule), and the perf
overlay holds its frame time during an alpha strike.

## 4.2 Cultures that read at fifty metres (L)

**Files:** `src/render/blueprint/details-line.ts`, `details-aurelian.ts`,
within the existing detail budgets in `details.ts`.

The two cultures are distinct up close and identical at combat camera range.
Wanted: silhouette-level tells — Linewrought machines carry visible patch
plates, weld seams, stowage and asymmetry (they are rebuilt, owned things);
Aurelian machines stay sealed, symmetric, and carry their faint powered seams
(`sealedPowerLights.ts`). Work within the structural-digest system: detail
parts only (`surface`/`hero` tiers), digests untouched — the digest test will
tell you instantly if you moved structure.

**Done when:** a mixed battle screenshot lets you sort the field by culture
without team colour, and the per-chassis detail budgets in `details.test.ts`
still pass.

## 4.3 The ground has never heard of roads (M)

**Files:** `src/render3d/terrain.ts`, map JSONs' road tiles.

Roads are a flat colour. Wanted: procedural wear — centre-line fading, edge
crumble into the neighbouring tile's material, occasional cracks — done in the
terrain mesh's vertex colours / procedural texture, no image assets. While
there: water tiles deserve a cheap animated shimmer (time-based UV or vertex
wobble in the existing material, `lowFx` turns it off).

**Done when:** a road reads as used, water reads as wet, and `lowFx` mode is
exactly as cheap as before.

# Tier 5 — Sound and music `[ui/audio]`

## 5.1 A score with no audio files (XL — the other showpiece)

**Files:** new `src/ui/audioScore.ts` + hooks in `src/ui/audio.ts`,
`src/ui/audioAmbient.ts` as the foundation to study.

The game has no music, and the no-assets constraint makes the obvious solution
illegal — so build the interesting one: a **procedural adaptive score** on the
Web Audio graph. Three intensity layers — a low drone bed (campaign map and
quiet approach), a pulse layer (contact, movement), a full layer (sustained
fire, a friendly critical) — driven by a battle-intensity scalar computed from
the recent event stream, crossfaded over seconds, never cutting. Give each
culture its own harmonic character (the ambient system already keys off
atmosphere; the score keys off *who is on the field*). Keep every oscillator
accounted for — `destroy()` discipline is absolute, browsers cap AudioContexts.

Stage 1: the intensity scalar + drone/pulse layers in battle. Stage 2: the full
layer and per-culture voicing. Stage 3: campaign-map and mechbay treatments.

**Done when:** a battle has a dynamic arc you can hear with your eyes closed,
the mute toggle silences it completely, and ten consecutive battles leak zero
audio nodes (count them in the PR).

## 5.2 The last silent moments (S)

**Files:** `src/ui/audio.ts` (365 lines — headroom exists).

Still silent: `ability_used`, the alpha strike (it should sound like a decision
with consequences), `stood_up`, `pilot_ejected`, `unit_withdrew`, the rising
heat note as a mech approaches capacity, and `mission_message` (a quiet radio
blip, never a klaxon). The procedural vocabulary is all there — read the
existing voices first.

**Done when:** a battle is legible with the screen off, nothing clips, nothing
accumulates nodes.

# Tier 6 — Navigation and command `[ui]`

## 6.1 Commander view (L)

**Files:** new `src/ui/CommanderView.tsx`, `src/render3d/camera.ts`,
`src/ui/inputKeyboard.ts`.

The camera lives at shoulder height and the minimap is four pixels of context.
Missing: the middle altitude. Wanted: one key (default `Tab`-adjacent, config
in `inputKeyboard.ts`) toggles a top-down tactical view of the whole map —
simplified unit chits with facing wedges, zone shading, order lines, contact
markers — rendered as a 2D overlay from world state (not a second 3D camera).
Orders issue from it exactly as from the field: click-select, right-click move,
the whole `engineOrders` surface. Pausing + commander view is the planning
loop this game's real-time-with-pause design has been missing.

**Done when:** a full battle is playable without leaving commander view, and
switching costs under a frame.

## 6.2 Minimap that takes orders (M)

**Files:** `src/ui/Minimap.tsx`.

The minimap displays and does nothing else. Wanted: click to jump the camera,
drag to pan it live, a viewport rectangle showing the camera footprint,
contact pings that pulse on new-contact events, zone ownership tinting.

**Done when:** the minimap is a control, keyboard focus can reach it, and its
render cost is unchanged (it already draws to a small canvas — keep it there).

## 6.3 Routes you can read (M)

**Files:** `src/ui/enginePresentation.ts`, `src/render3d/markerLayer.ts`.

Move orders draw a line. Wanted: the line carries meaning — chevrons animate
along the path in the unit's team colour, a queued path renders dimmer than the
active leg, the destination shows the unit's *facing on arrival* as a wedge,
and estimated time-to-arrive sits at the endpoint (walk speed × path length is
already computable from `pathProgress`). Pooled geometry, as ever.

**Done when:** four queued waypoints across a ridge read as a plan, not a
scribble.

# Tier 7 — Content `[data]`

## 7.1 The Aurelian campaign (XL — stage it)

**Files:** new `src/data/campaigns/*.json`, new missions, new lore entries;
the campaign schema and machinery need **no changes**.

The Great Recall is told once, from the Linewrought side. The second campaign
is the same war from inside the sealed machines: an Aurelian custodian company
executing the Recall — which means the *player* fields the sealed roster and
fights foundry rebuilds, inverting every economic instinct the first campaign
taught (your machines are better; every repair costs 2.5×; salvage is beneath
you and money is short). Reuse maps freely; missions and framing are the work.
Stage 1: campaign JSON + three nodes reusing existing missions with new
briefings. Stage 2: four new missions along the arc. Stage 3: the branch
endings, mirroring `victoryNodeId`/`alternateVictoryNodeIds`.

**Done when (stage 1):** the campaign is selectable, winnable, and the
acceptance suite covers it the way it covers `border_dispute`.

## 7.2 Days with weather in them (M) `[data+campaign]`

**Files:** `src/campaign/`, new `src/data/rules/events.json` + schema.

Campaign days pass identically. Wanted: a small deterministic event deck drawn
per rest day from the campaign's seeded stream — a supplier discount week, a
pilot rumour that grants XP, a yard mishap that queues a free repair day, a
contract-payment dispute. Small numbers, no negative spirals (the solvency
planner's no-dead-end rule is a design law here), every event a line in the
campaign log. Data-authored deck, weights and all.

**Done when:** two campaign runs with different seeds feel different between
battles, and the acceptance suite still finishes both.

---

## Sequencing advice

Presentation tasks (tiers 1, 3, 4, 5, 6) parallelise freely. `[sim]` tasks
(tier 2) go **one at a time**, cheapest first: 2.2 → 2.1 → 2.3 → 2.4 → 2.5.
The two showpieces (2.5 fire, 5.1 score) are worth doing after a few smaller
wins in their areas — they lean on pooling and audio-graph discipline that the
smaller tasks teach.

If a task feels like it needs something this file says not to do, stop and say
so in the pull request. That is cheaper than a review cycle, and the boundary
has usually earned its place.
