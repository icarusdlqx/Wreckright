# Machine and pilot identity polish

Reviewed 2026-09-11 at 1280 × 720 and 390 × 844 in a disposable Chromium
session with reduced motion enabled.

## Machine field plates

- All 19 catalogue machines use 640 × 720 renders of their actual battlefield
  model and standard equipment.
- Linewrought plates use irregular survey contours, warm salvage paper and
  orange registration marks.
- Aurelian Stock plates use measured arcs, pale technical glass and teal marks.
- The source models remain authoritative, so silhouettes and visible weapons
  stay in step with the game rather than becoming separate concept art.

Reference frames:

- `linewrought-field-plate.webp`
- `aurelian-field-plate.webp`
- `machine-dossiers.png` shows both visual languages together in the archive.

## Mech-bay focus

`mechbay-desktop.png` records the compact fitting workspace. The new **Inspect
mech** control opens the current draft as a large interactive model; selected
and compatible body zones stay linked to the fitting grid. The footer exposes
free tonnage, used boxes and heat without displacing weapon details.

`mech-inspector-desktop.png` and `mech-inspector-phone.png` record the fitted
Sentinel at both checked sizes. The phone view becomes a full-height sheet and
does not create horizontal overflow.

## Pilot identity

The existing 24 authored faces, expressions, uniforms, accessories,
personalities and biographies remain intact. Portrait frames now carry a quiet
discipline mark derived from the pilot's strongest skill: gunnery, piloting,
sensors, or balanced. This adds a useful recognition cue to briefing, crew,
radio and command cards without adding another label at compact sizes.
`pilot-pairings.png` records four distinct portraits alongside the pilot's
temperament, biography, skills and ability in the deployment workflow.

## Verification

- 3,442 unit and integration tests passed.
- 14 focused browser checks passed, including every authored loadout, keyboard
  focus return, the campaign refit path, body-zone navigation and desktop/phone
  overflow.
- Type checking, linting, production build, standalone build and third-party
  notice verification passed.
