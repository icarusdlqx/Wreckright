# Prepublication upgrade round

This round follows the inspected Ironmuster playthrough of 6 September 2026.
It continues the existing menu, lore and Ironwork/Monolith work on a review
branch. It is not a public release or a change to the sixteen-machine roster.

## What changed

- Sensor probes acquire targets in their scan circle, then retain those tracks
  until the probe expires. Live red dots are painted above fog in the field,
  minimap and Commander view. Terrain stays concealed and full enemy models
  still require optical identification. Expiry leaves a faint stationary memory.
- Training teaches queued movement and Resume, then waits for actual arrival at
  the range gate. The known gate is visible, a Show gate action centres it,
  range targets stay at the range, and unavailable command controls stay hidden.
  Shift-click selection is consistent between the field and lance cards.
- Stop and Guard communicate route cancellation. Attack help explains movement
  priority. Group abilities show each pilot's readiness and effect. Called shots
  use a hostile armour panel; the company's own armour diagram is a readout.
- Refit exits protect drafts with Save, Discard and Keep editing. Short laptop
  layouts retain a usable weapon shelf; transient fit feedback no longer moves
  drop targets. Stores opens a selected part in the chosen machine's refit bay.
- Stores and the yard share part boxes, specifications and real compatibility
  checks. Yard purchases expose their actual condition and fitted equipment.
  Sales show the included fittings and pilot consequence, with immediate Undo
  available until another company transaction changes the state.
- Duplicate machines have stable company bay labels. Pilot assignment choices
  name their occupants, reassignment names the displaced pilot, and manifests
  show condition, destroyed components and pilot strengths before launch.
- Illustrated faction cards explain starting equipment and operating tradeoffs.
  Each faction can be parked and resumed independently; the original
  `ironline.campaign` active save remains compatible. Invalid parked data is
  preserved and exportable instead of being silently replaced.
- Completed map nodes open a company journal with outcomes, crew service,
  recoveries and linked discoveries. Objective service is credited explicitly
  to the deployed team, since old results cannot identify individual captures.
  Authored reports are retained while renewable side-work history remains
  bounded. Older compacted saves show the recorded outcome without inventing a
  missing report. The archive remembers its list position after a dossier.
- Fog uses an opaque atmospheric treatment, terrain normals are smoother, and
  roads and water banks receive restrained edge colour. Ordinary hit scars are
  smaller, merge nearby marks and fade; water impacts produce temporary ripples.
  Mech plates and team trim remain readable in shadow. Important damage labels
  use real-time duration at accelerated battle speed and freeze on pause.
- Airstrike flashes and aircraft position match the simulation's impact tick.
  The repair vehicle shows its actual service centre and circle. Support calls
  have short acknowledgment tones independent of crowded positional voices.
- The third opening jobs move to Foundry District and Causeway. Recovery now
  requires operating a winch or relay and holding the recovery sites through a
  short lift cycle, rather than waiting out an empty two-minute timer. Survey
  final readers warn that they finish the contract; First Warrant's briefing
  matches the battle it actually launches. Required and optional outcomes are
  distinguished honestly.

## Verification and evidence

Representative inspected images are committed in
[the visual review](review/prepublication/README.md), so they remain available
with this change independently of local reports.

Before images and the original proposal are retained in
`reports/prepublication-playthrough/`. After images and focused results are in
`reports/prepublication-upgrades/`. The full regression journey writes
`reports/prepublication-upgrades/full/`; CI preserves browser artifacts when its
playthrough fails.

The new browser checks exercise real native drag/drop and rendered probe pixels,
not only state snapshots. Campaign journal and support stress scenarios use
explicitly staged results or field fixtures in isolated browser profiles. Those
fixtures are not claims of an unassisted full-campaign playtest.

Required final gates are typecheck, ESLint, the complete fast suite, the browser
playthrough, deterministic 200-seed balance, campaign acceptance, and hosted and
single-file builds. The local review uses one muted headless browser at a time;
no desktop control or user browser storage is used.

Support sounds have an offline-rendered sample at
`reports/prepublication-upgrades/support-audio.wav`. Waveform generation and
levels can be checked here; speaker/headphone listening remains part of the
external playtest, and is not claimed as completed listening verification.

## Release boundary

This completes the approved first-session, company, presentation and opening
content round. The proposal explicitly deferred larger ending rewrites, broad
recovery/economy rebalancing and loose-parts scrap sales until observed player
feedback. Public itch hosting, final ownership/licence declarations and external
uncoached playtesting remain separate release steps. Existing dependencies,
legacy save keys and the balance fixture are preserved.
