# Independent gameplay audit — 13 September 2026

Inspected branch `codex/variants-instant-preparation`, starting commit `16a727d`. No tracked files changed during diagnosis. This audit uses the real tactical simulation and campaign APIs; it is not a human browser playthrough or a difficulty study.

## Live coverage

- `all-routes.log`: 59 live battles, 41 wins, 18 losses, 11 KIA outcomes, 19 injuries, 59 hull-loss outcomes. Damage, wounded crew, hiring, paid repairs, retries and JSON save/reload were retained between missions.
- `trained-burn.log`: 20 more live battles, 15 wins, 5 losses, 7 KIA outcomes, 5 injuries, 16 hull-loss outcomes. Same recovery protocol plus normal spending of actually earned pilot XP.
- Linewrought Take: `independent-20260913-depot_take-0`, eight wins in eleven battles, completed at 4,648,058 C.
- Aurelian Export: `independent-20260913-continuance_export-1`, eight wins in nine battles, completed at 5,802,739 C.
- Aurelian Local Stewardship: `independent-20260913-local_stewardship-0`, eight wins in eight battles, completed at 8,073,925 C.
- Linewrought Burn: initially failed with untrained starting pilots; normal XP spending completed `independent-20260913-depot_burn-1`, eight wins in nine battles, 12,794,547 C. Automatic-command losses alone do not justify retuning this ending.
- `all-routes.md` is the existing harness output adapted to retain incomplete routes. Its generic coverage footer is not proof of Burn completion; `trained-burn.md` and this summary specify that evidence.

## Independent configuration checks

All sixteen machine designs passed named-variant refit, damage retention across that refit, exactly quoted instant repair, JSON save/reload, legal pre-deployment state, and actual simulation deployment retaining weapon count and repair condition. Dry ballistic loadouts were rejected without mutating the campaign.

A broader strip-and-reinstall probe exposed one helper issue rather than passing universally: Rampart, Rivet and Trestle cannot automatically reinstall some original guns after their corresponding ammo has been removed. The 228-check diagnostic intentionally logs these failed reinstalls rather than counting them as successful. Other invariant checks passed.

## Concrete bug awaiting coordinated fix

`src/campaign/refit.ts:planFit` only tries a first ammunition bin in the weapon's own location. A cannon that fills its compartment can legally use ammunition elsewhere, but the helper reports no fit. Solvency uses this helper and can falsely recommend retirement.

Verified zero-credit examples: armed-ready condition but no installed guns; one fit pilot; only the specified gun in store:

- Falchion / Canister Cannon: right-arm mount, ammo elsewhere.
- Rivet / Field Autocannon: right-arm mount, ammo elsewhere.
- Sentinel / Field Autocannon: right-arm mount, ammo elsewhere.
- Trestle / Field Autocannon: left-arm mount, ammo elsewhere.

In all four, `assessSolvency` currently returns terminal/retire; a legal complete design submitted through `applyRefit` succeeds with no credits needed. `fit-gap.log` records the exact results. Candidate fix: preserve current fit preferences, then search remaining legal ammo locations deterministically, sharing no UI import with campaign/sim and changing no statistics.

## Remediation

The coordinated fix now preserves the original fitting pass and adds an ammunition-location fallback only after it cannot find a valid fit. The fallback prefers blast-contained compartments and then side torsos/limbs before the centre torso/head. No simulation, statistics, repair, inventory or economy rules changed.

- 48 focused tests passed across six files, including nine new regression cases.
- 215 successful pre-fix catalogue fitting plans remained byte-for-byte identical.
- Exhaustive bare-hull + ballistic checks no longer find the previously demonstrated false-negative configurations.
- The strict sixteen-hull diagnostic now also successfully reinstalls the original stripped guns; its final log is `invariants-fixed.log`.
- Typecheck, scoped lint and diff whitespace checks passed.
