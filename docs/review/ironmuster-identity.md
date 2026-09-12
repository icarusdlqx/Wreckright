# Ironmuster: company identity and the opening equipment trail

The game is now **Ironmuster**. This build makes its central loop visible: disable
an enemy carefully, bring something home, fit and name a machine, and hear from
the pilot who takes it into the next operation.

## Accepted design scope

The preceding proposal had five numbered changes and a three-mission opening;
the opening is implemented as the sixth item.

| Item | Result |
|---|---|
| 1. Tactical salvage | Called-shot armour view explains disabling both legs versus destroying the core, with rule-derived bars. Arm shots identify the live weapons they silence. The debrief includes failed hull recoveries, final contract-adjusted odds and an explanation; it never promises salvage. Sensor-only contacts expose no damage or equipment. |
| 2. Personal machines | Weapon assemblies retain their originating faction's finish and visible adapter collars. Inspect mech compares the named current build against Prime without altering the save. A collapsed preparation service record links real deployments by owned hull ID, retaining previous name, pilot, mission and known weapon changes. |
| 3. Pilot continuity | All 24 authored pilots have distinct return, refit, recovered-gun and familiar-ground remarks. At most two memories per drop and one per pilot. Priority messages defer them. Only heard remarks are recorded. Claimed battlefield salvage and its first actual shot drive recovered-gun remarks; missing legacy history does not invent events. |
| 4. Readable combat | Brief directional hit reactions distinguish ballistic, missile and energy weight without moving tactical positions. Reduced motion and fog are respected. A cockpit kill sparks and vents locally, preserving the remaining hull; core and ammunition breaches retain destructive fire and blackened wrecks. Existing separate weapon effects, component detachment and leg-disable behaviour remain in use. |
| 5. People and places | Iona Venn, Nera Pell, Ada Rusk and Len Saye connect existing registry, winch, gantry and custody objectives to recurring people. The two faction perspectives keep their own language, duties and tradeoffs. These are authored objectives and radio context, not simulated civilian NPCs. |
| 6. Opening loop | Both first victories earn a named-source weapon through existing contract rewards. The guide suggests a legal named refit and explains its use in mission two. Mission three presents a company selection decision; the Aurelian court now permits 175t. Optional jobs still work without hiding the guide. |

Persistent cosmetic repair scars are not introduced. The service record records
known history without inventing individual component provenance from pooled stores.
No new assets, dependencies, random simulation behaviour or extra management system
were introduced. See [opening details and measured choices](opening-equipment-story.md).

## Branding and compatibility

Home, wiki, campaign/lore references, export filenames, install metadata, package
metadata, notices, development diagnostics and release artifacts use Ironmuster.
The in-world salvage custom is now named the **Ironmuster Code**; its breach mission
is **Broken Code**. IDs remain stable. `dist-single/ironmuster.html` is the new
single-file deliverable.

Existing `ironline.*` saves, variant library and export schemas remain compatible.
The old cross-tab audio channel and local-preview service identifiers remain
non-visible protocols. Provisioned GitHub/Worker names and their valid URLs are
unchanged; historical proof logs retain the commands and paths actually used.
Remote project/page renaming and publication are separate release actions.

## Visual evidence

All captures below were opened and inspected. Browser contexts are isolated;
no desktop input or screen lock was used.

- [New home](ironmuster-identity/home.png) and [wiki](ironmuster-identity/wiki.png).
- [Targeting consequences](ironmuster-identity/salvage-intent.png) and [recovery receipt](ironmuster-identity/recovery-receipt.png). Contacts/results are staged for deterministic UI inspection; actual targeting clicks issue simulation orders.
- [Inspection before](ironmuster-identity/inspect-before.png), [named variant](ironmuster-identity/variant-current.png), [Prime reference](ironmuster-identity/variant-prime.png), [390px inspection](ironmuster-identity/variant-mobile.png).
- [Cockpit versus core outcome](ironmuster-identity/terminal-settled.png): controlled renderer fixtures, not a natural battle or a recovery guarantee.
- [Machine history](ironmuster-identity/service-record.png) and [narrow preparation](ironmuster-identity/service-narrow.png). The narrow check also found and fixed nested scrolling that trapped the wheel above the sticky footer.

## Validation

- Fast suite: **3,534 tests / 443 files passed**. Typecheck, lint and both
  production builds passed. The self-contained artifact is 7.18 MB.
- Full headless browser journey: **1,282 / 1,282 checks passed**. Coverage includes
  training, campaign settlement, pilot assignment, immediate repairs, grid fitting,
  ammunition, exact variant persistence, deployment, sensors/support, combat,
  desktop, phone, tablet, touch and keyboard use.
- New identity/salvage checks: **9 Chromium + 9 Firefox**; named-build/Prime checks:
  **12 Chromium + 12 Firefox**; machine-history checks: **3 in each browser**.
  The final Firefox targeting capture includes the ejection and elimination caveats.
- Hosted production and the standalone file both open with the Ironmuster title,
  wiki and four bay capacity meters; neither exposes development globals or makes
  external network requests.
- [All four campaign endings](ironmuster-identity/live-campaigns.md) reached through
  real tactical simulation, with cross-faction refits, repairs, pilot casualties and
  save/reload between contracts. The completed routes contain 33 battles. Failed
  seed attempts are retained; this is a bounded completion audit, not a human
  difficulty assessment or an unbeaten run through every optional contract.

The first full browser pass found three stale/timing expectations. The corrected
run above retains strict assertions: three fixed adapter meshes raise the known
resident geometry count from 258 to 261 without changing draw/triangle budgets;
inspection expects the new current-build label; deployment waits for the first
roster snapshot and then checks exact ordered pilot template IDs and names.
The final review also corrected head-destruction advice to allow ejection, and
explains that immobilised mechs keep firing and count toward elimination objectives.

After this review is frozen, the required final gameplay gates are
`npx vitest run src/sim/balance.test.ts src/campaign/acceptance.test.ts`.
Their result is recorded with the review commit/pull request. No production merge
or itch.io upload is part of this build.
