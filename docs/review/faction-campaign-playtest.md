# Faction campaigns and mechanics review

This build develops the two existing faction campaigns, adds authored pilot
personalities, shows compact mech health in both tactical views, and gives the
player control over both forces in skirmish setup. It also fixes data-loss and
recovery problems found while testing the mech bay.

## Player-facing changes

- **Linewrought — The Hands That Kept It:** a workshop company protects its
  crews and repair yards, recovers equipment, and decides the fate of the root
  manifest. **Aurelian — A Clean Account:** a custody detachment follows a
  disputed warrant and must choose between export and local stewardship.
  Each has an opening, progress-dependent story entries and distinct endings.
  Existing campaign identifiers, mission graphs and saves remain compatible.
- Original vector faction insignia appear in campaign selection, the story
  panel, faction articles and all 16 mech dossiers. Campaign difficulty remains
  fixed at the start. Battle briefings now show the current faction contract's
  title and narrative rather than only its underlying mission template.
- All 24 pilots have a temperament and authored movement, engagement, guard,
  investigation and pressure remarks. The portrait radio panel uses text and
  its existing radio sound; there is no recorded voice acting. Chatter has
  cooldowns and cannot interrupt emergency or mission reports.
- Small health strips follow friendly and optically visible enemy mechs in
  the field and Commander views. Sensor-only dots do not reveal enemy health.
  Destroyed, ejected and hidden units do not retain bars.
- Skirmish offers six maps, independent faction presets and individual mech,
  pilot and loadout choices for both sides. Empty berths support smaller
  forces. Player crew experience and enemy AI difficulty are separate controls.
  Pure skirmishes use the selected forces; authored scenarios explicitly warn
  that their scripted reinforcements still apply.

## Bugs found and corrected

- Stock, saved-loadout and file-import selection could silently replace an
  edited mech. They now offer Save and switch, Discard changes or Keep editing.
  Delayed imports also check the current draft, ignore superseded or unmounted
  reads, and support retrying the same file after cancellation.
- Missing, blocked or full browser storage could crash a path or appear to save.
  The bay now retains the draft, reports the failure and permits JSON export.
  Skirmish roster failures now show a visible session-only warning and retain
  those edits when visiting the workshop. Each warning clears only after that
  particular roster is successfully saved.
- Names that collapse to the same saved identifier could overwrite unrelated
  configurations. Conflicting names now require a distinct name; intentional
  updates of the same named design remain supported.
- An imported unknown chassis could trap the bay without usable controls.
  Invalid chassis and non-mech imports are rejected before replacement.
- Generic CSS classes made a save-error message inherit an unrelated error
  overlay and made an enemy health strip expand into a 250-pixel contact card.
  Component-specific classes fix both. Field bars are verified at 38 by 4 pixels
  on desktop, with a smaller phone variant.
- Selecting the current skirmish map or difficulty could unnecessarily remount
  battle setup. Refitting an empty berth did not restore it to the force. Both
  paths now preserve the intended setup.
- Faction selection had weak summary contrast, phone autofocus skipped the
  faction cards, and the company menu could stay open after a campaign switch.
  The corrected desktop and phone layouts have been visually inspected.

## Computer-use playthrough

At this code checkpoint: native tutorial and first Linewrought contract completed;
remaining campaign playthrough continuing in the in-app browser, starting Aurelian
seed `red-garrison-ee79292d`.

Completed so far with ordinary controls in Firefox on the isolated local preview,
without automatic victories or injected campaign progress:

1. Won the tutorial, testing selection, movement, queued orders while paused,
   engagement, objective capture, camera controls and Commander view. One of
   the two starting mechs was lost.
2. Started a Linewrought campaign on Green, signed First Notice, moved the
   Gadfly's flamer from its left arm to its right arm and committed the refit.
   Reopening the bay and reloading the game retained that weapon configuration,
   campaign seed, difficulty and contract.
3. Won First Notice with all four pilots surviving. Verified damage, mech
   health strips, individual pilot remarks, debrief, salvage, XP and story
   progression. Reassigned two pilots through the Crew screen successfully.
4. Reached the repair workshop. The computer-control tool then reported that
   the Mac was locked. Desktop actions stopped and manual unlock was requested.

**Remaining manual work:** finish both complete campaign routes, exercise
skirmish choices in the browser, and observe later pilot progression and
injury recovery during that journey. Automated coverage is recorded separately;
it is not presented as a completed manual campaign playthrough.

Resume the isolated Firefox campaign at `http://127.0.0.1:5231/`, seed
`smoke-bastion-4a9517de`. Inspect the repair queue first: the lock happened during
a batch of repair-button clicks, so their completion is not assumed. The user's
existing play session on port 5220 and itch.io publication were not replaced.

## Verification and evidence

Final source-frozen checks:

- TypeScript and global ESLint passed.
- Main regression suite: **3,174 tests across 393 files passed**.
- Separate balance and campaign acceptance gates: **25 tests passed**.
- Production and standalone builds passed; standalone is **3.55 MB**.
- Built-artifact browser smoke: **23 checks passed**, with no browser errors.
  The standalone completed its smoke journey with **zero HTTP(S) requests**.
- Full integrated browser journey: **941/941 checks passed**.

The test commands are:

```sh
npx tsc --noEmit
npx eslint .
npx vitest run --exclude "**/balance.test.ts" --exclude "**/e2e/**"
npx vitest run src/sim/balance.test.ts src/campaign/acceptance.test.ts
E2E_PORT=5240 SHOT_DIR=reports/faction-campaign-playtest/e2e node tests/e2e/playthrough.mjs
npm run build
npm run build:single
```

Selected inspected captures are retained in
[the review image folder](faction-campaign-playtest/):

![Faction selection](faction-campaign-playtest/faction-choice.png)
![Compact field health](faction-campaign-playtest/field-health.png)
![Opposing force setup](faction-campaign-playtest/skirmish-enemy.png)
![Mechbay save recovery](faction-campaign-playtest/mechbay-save-recovery.png)
![Skirmish session-only save warning](faction-campaign-playtest/skirmish-storage-warning.png)

Additional local browser captures and detailed reports live under
`reports/faction-campaign-playtest/`. Faction, field/Commander health, skirmish,
support and mechbay persistence checks use isolated browser contexts. Pilot
lifecycle tests cover injury holds, KIA exclusion, deployed-only XP and training.

One early integrated browser attempt was invalidated by a development reload
while source files were being edited. It is not counted as a product failure or
passing verification. Final browser verification runs with source edits frozen.

This branch is a review candidate. It has not been merged to the public site or
uploaded over the restricted itch.io build.
