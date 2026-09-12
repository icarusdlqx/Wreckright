# IRONMUSTER

**Your company. Your mechs. Your next move.**

Real-time-with-pause tactical mech combat. See [`IRONMUSTER_DESIGN.md`](IRONMUSTER_DESIGN.md)
for the full design and build specification; [`CLAUDE.md`](CLAUDE.md) holds the
agent working rules; [`docs/HOSTING.md`](docs/HOSTING.md) covers publishing it.

**Play it:** published as a Cloudflare static-asset Worker from `main`, and
playable in Safari on a phone as well as on a desktop. See
[`docs/HOSTING.md`](docs/HOSTING.md) for the build settings and how to deploy
without pushing.

## Graphic Expedition interface

The presentation uses paper campaign/refit screens, dark teal battle controls,
colourful faction finishes and illustrated terrain. Company management is split
into **Operations**, **Workshop**, **Crew** and **Stores & yard**. Workshop opens
individual refits directly; the manifest records explicit Aboard/Reserve choices,
mission tonnage, five normal berths and named lance presets. Legacy save keys
remain compatible.

See [the presentation review](docs/GRAPHIC_EXPEDITION_REVIEW.md) for the full
system audit, preservation decisions, validation record and remaining priorities.
After `npm run build:single`, `node tests/e2e/standalone-smoke.mjs` checks the actual
offline file through home, workshop, refit and deployment. It uses Playwright's
Chromium or the executable supplied by `CHROMIUM_PATH`.

## Ironwork & Monolith

The [Ironwork & Monolith rebuild](docs/IRONWORK_MONOLITH.md) adds sixteen distinct
walker designs, actual-terrain mission surveys, a selected-machine Workshop,
authored battlefield surroundings, physical motion/effects and shared audio
settings. Its review fixtures run in background browsers with disposable profiles.

The original theme [Roads We Keep](docs/audio/ROADS_WE_KEEP.md) links menu,
campaign and combat with synchronized Ironwork and Monolith arrangements.
**Settings → Sound** offers separate Music and Sound effects switches, saved
volume trims and master mute. The [audio review](docs/review/audio-upgrade.md)
includes the soundtrack, before/after combat previews and validation record.

The [command and campaign refinement](docs/COMMAND_REFINEMENT.md) adds loadout-aware
Attack approaches, objective duties, five optional missions, guaranteed contract
rewards, shared objective XP, campaign endings, a planning map and previewed weapon
replacement. The [first-time playtest pack](docs/PLAYTEST_PACK.md) provides a
repeatable way to check the opening with new players.

The [Tessell field archive](docs/LORE_WIKI.md) adds searchable world history,
sixteen illustrated machine dossiers, shareable article links and optional
opening-route guidance for both campaigns. Campaign discoveries stay hidden
unless earned or explicitly revealed, and the archive works in the offline build.

The [sensor and support fixes](docs/SENSOR_SUPPORT_FIXES.md) make paused sweeps
and probes respond immediately, explain queued support timing, and show aircraft
and repair teams arriving, working and departing.

The [illustrated main menu](docs/MAIN_MENU.md) puts learning, campaign, skirmish
and **Wiki · Story & mechs** over original Tessell artwork. The archive opens
inside the game, with no battle or 3D renderer started in the background.
For review links that stay available after a coding session, build once and run
`npm run preview:local`; see [local preview controls](docs/LOCAL_PREVIEW.md).

## Repository identity


The product, wiki, diagnostic hook, downloads and release artifacts use **Ironmuster**.
The existing source repository (`icarusdlqx/Wreckright`), Worker (`wreckright`)
and deployed hostname (`wreckright.ligand-ave.workers.dev`) retain their provisioned
identifiers. This local rebrand does not move the published site or rename remote resources.

Browser storage and serialized playtest identifiers deliberately retain their
original `ironline.*` values. They are non-visible compatibility contracts: the
first game deployment already wrote them, and keeping them stable protects
existing saves and rollback safety.

Authored data ids remain stable because they are save and simulation contracts,
not product branding. The earlier project remains independent in its original
repository and deployment.

## Licensing

Ironmuster uses a split licence. The engine, interface and development tools are
available under the [MIT licence](LICENSE). The setting, story, missions, game
catalogue, artwork and audio use the separate [content terms](LICENSE-CONTENT.md),
which allow personal play and noncommercial local experimentation while
reserving commercial reuse rights to the extent held. Dependencies and bundled
fonts retain their own terms in the [third-party notices](public/THIRD_PARTY_NOTICES.txt).

Generative AI was used during development for code, writing and some artwork.
The content notice does not claim rights that may not exist under applicable law.

## Layout

```
src/sim       pure, deterministic simulation (no DOM, Pixi or React)
src/data      all game content as JSON
src/schema    Zod schemas + the validating content loader
src/render    shared art description — blueprints, palettes, silhouettes
src/render3d  Three.js tactical renderer — reads sim state, never mutates it
src/ui        React shell, Zustand store, fixed-step game loop and input
src/ui/mechbay loadout editor, refit validation, heat calculator
src/campaign  economy, salvage, refit, repair, roster, time, save/load
src/headless  CLI balance harness
tests         architecture tests + the browser playthrough harness
```

## Commands

```sh
npm install
npm test        # Vitest: determinism, schemas, architecture boundaries
npm run lint    # ESLint, including the /sim purity rules
npm run typecheck
npm run dev     # Vite dev server
npm run build
npm run preview:local  # persistent local release on 5219 and 5220 (macOS)
npm run preview:status
npm run preview:stop

# Headless balance harness
npm run sim -- --iterations=100 --seed=1337
npm run sim -- --mission=skirmish_ridge --iterations=500 --seed=1337 --out=./reports/skirmish.json

# Drive the real page in Chromium and assert the Phase 2 acceptance test
npm run verify:ui
```

Harness flags: `--mission`, `--iterations`, `--seed`, `--max-ticks`, `--out`, `--verbose`.
Iteration *i* runs on seed `<seed>:<i>`, so any single battle can be replayed on its own.

## Build status

- **Phase 0 — Foundation: complete.** Vite + TypeScript strict, ESLint with the
  `/sim` import boundary and `Math.random` ban, Vitest, seeded xorshift128 RNG
  with a determinism test over 10,000 draws, Zod schemas for chassis/weapon/
  equipment, and three chassis, eight weapons and six equipment items in
  `src/data`.
- **Phase 1 — Headless simulation core: complete.** Terrain grid, A* pathfinding,
  locomotion with facing and turn rates, line of sight with obstruction and
  elevation, weapon cooldowns, to-hit and hit location, damage with transfer and
  location destruction, heat with shutdown, ammo tracking and explosions with
  Blowout Cells, and an advance-and-engage placeholder AI. `npm run sim` runs complete
  4v4 battles and prints a results table.
- **Phase 2 — Tactical renderer: complete.** PixiJS tilemap with elevation
  relief, chassis-silhouette mechs with facing and component-loss damage state,
  selection, move/run/attack/called-shot orders, beams and tracers and arcing
  missiles, explosions and smoke, fog of war with remembered ground and
  last-known-position ghosts, paper-doll damage display, heat bar with threshold
  markers, weapon groups with cooldown rings, camera pan/zoom, and pause that
  freezes the sim while still accepting orders.
- **Phase 3 — Mechbay: complete.** Construction weight tables in `/data/rules`,
  a loadout calculator that enforces tonnage, slots, hardpoint types, armour
  maxima and heat-sink minimums, drag-to-hardpoint editing with live validation,
  per-location armour sliders, a heat efficiency calculator verified against
  headless sim runs, and build save/load/export. All seven shipped designs are
  legal builds.
- **Phase 4 — Campaign shell: complete.** Node-based operational map with
  branching prerequisites, contract negotiation trading payout against salvage
  rights, credit economy with pilot salaries, salvage resolution keyed to how
  each enemy was taken out, refit from stores, repair queue with day
  advancement, pilot XP and injuries, and save/load that round-trips exactly
  including the campaign random stream.
- **Phase 5 — Objectives & support: complete.** Mission scripting from JSON —
  capture zones, five objective types, and triggers on elapsed time, zone
  capture, objective completion or losses, firing spawns, resource awards,
  messages and reveals. Resource Points earned from zones and objectives pay
  for sensor probes, air strikes, repair trucks, or an authored mission reserve.
  Mission success and failure conditions, a briefing screen and an in-battle
  objective tracker.
- **Phase 6 — AI depth & balance: complete.** Utility-scoring target selection,
  lance focus fire, cover and elevation seeking, flanking, graduated heat
  discipline that sheds the least efficient weapon group rather than going dark,
  called shots at the legs to leave salvage on the field, withdrawal and
  disengagement, and four difficulty tiers that change behaviour and pilot skill
  but never hit points or damage. Torso twist so guns bear independently of the
  hull. Content pass to twenty-four weapons, ten equipment items and sixteen
  chassis spanning 25 to 100 tons. `npm run sim` reports damage-per-ton-per-heat
  against each class median.
- **Setting.** IRONMUSTER is set on Tessell, where the Aurelian Continuance has
  returned to repossess every surviving walker root. An independent company
  fights through the Great Recall while deciding who owns the finite machines
  that kept this world alive. The setting is in `src/data/lore`, readable in-game
  under Field Manual and the Tessell field archive.
- Phase 7 — Polish: in progress.

### Phase 6 acceptance

Both criteria are asserted in `src/sim/balance.test.ts`:

- **Weapon balance.** `damagePerTonPerHeat = dps / (tonnage + heatPerSecond /
  dissipationPerSink)` — a mount costs its own tonnage plus the heat sinks
  needed to keep it firing, and accuracy is folded into the numerator so Burst
  and Seeker launchers pay for their aim. Both heat load and cycle time affect
  the score. All 24 weapons remain inside the ±20% band around
  their class median.
- **AI strength.** `mirror_ridge` fields identical lances on mirrored spawns;
  the tactical controller and the `baseline` controller (nearest target, range
  bracket, heat discipline — nothing else) swap sides every other run so no
  corner of the map flatters either. Two hundred deterministic matches feed a
  one-sided confidence gate, so ordinary seed noise does not decide the build.

Known finding: light mechs are near-unsurvivable in a stand-up 4v4, because
`lanceFocus` correctly concentrates on the weakest target. That is doctrine
working as intended rather than a balance fault — lights belong on scouting and
flanking work — but it means a line lance should not be built around one.

## Mission prep

Skirmishes are outfitted at the briefing: each berth has a design picker
(stock builds plus anything saved from the bay), a pilot picker, and a
**Customise** button that opens the bay on that machine. The lance must fit
the mission's drop tonnage, and the loadout is remembered per mission.

A campaign contract is fought with what you decide to take. A pristine first
company can **Sign → Launch the drop**, with **Review machines first** available
for adjustments. Otherwise **Prepare drop** opens the hangar, then the manifest:

- **The profile** — how many berths the dropship has, how many tonnes it will
  carry, and what the contract is. The lance is limited by weight as well as by
  berths, so fielding the hundred-tonne hull means leaving something behind.
- **The crew** — every fit pilot, what their skills buy in the units you see on
  the field, and which machine they are in. Pilots can be reseated into any hull
  and held back from a drop.
- **The loadout** — **Refit** opens the bay on that machine, stocked from the
  company's own stores. What you take off goes back on the shelf; what you bolt
  on comes off it; a refit the company cannot pay for is refused.

Everything there is a trade. A heavier machine costs a berth's worth of
allowance, a better gun costs tonnage that was buying armour, and the pilot who
sees furthest is not the one who shoots straightest.

## Controls

| Input | Action |
|---|---|
| Left click / drag | Select a friendly mech; Shift-click toggles it, and Shift-drag adds a box selection |
| Right click | Attack a hostile or move to open ground; hold Shift on ground to append a waypoint |
| 1–9 / Ctrl or Cmd+1–9 | Recall a control group / bind the current selection to one |
| E | Select the whole lance |
| Numbered weapon badge | Toggle that weapon group across the current selection |
| T | Reactor governor (heat safety) on or off |
| Space | Pause / resume — orders are still accepted while paused |
| M / R / A / F / C / J | Move, Run, Attack Move, Attack, Called Shot, Jump |
| H / G | Hold Fire / hold position |
| Q / V / X | Target nearest contact, pilot ability, alpha strike |
| Tab | Cycle through your lance |
| Arrow keys / Centre | Pan or centre the selection · wheel zooms under the pointer · middle-drag pans · minimap click jumps |
| , / . | Lower / raise battle speed |
| P | Toggle the performance graph |
| Esc | Cancel targeting and clear the selection |

Shift also appends destinations placed with Move, Run, or Attack Move. Support
calls are picked from the palette and then placed with a left click; an air
strike uses a press-drag to set its run-in. Esc cancels an armed call.

On touch, tap a friendly to select it, open ground to move, or a hostile to
attack. Drag the ground to pan, pinch around the fingers to zoom, or tap Centre
to find the selection. Commands take their next target from a tap. Tap an armed
support call again to cancel it; press and drag an air strike across the field
to choose its run-in.
