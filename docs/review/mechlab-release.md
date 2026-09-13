# Mechlab and observable battlefield repairs

The workshop is now called **Mechlab** throughout the player's home, battle
menu, campaign preparation, skirmish preparation, workspace accessibility labels,
loading state and current help. The Prepare the team action previously labelled
Refit loadout now reads Mechlab. Technical module paths, test IDs and storage
contracts remain unchanged.

## Why an enemy health bar could rise

AI commanders can call a repair truck. It restores armour at the authored rate,
while the old renderer hid every opposing truck even on ground the player could
currently see. Health readouts were reporting real repairs without their visual
cause. They are not clamped and repair balance is unchanged.

In the controlled Warden reproduction, incoming damage left **601.8/623 HP**
(96.5971%). A truck restored **0.35 armour per tick**, or **7 in one second**,
raising the total to **608.8/623 HP** (97.7207%). World state, snapshots, field
bars, company cards and optical target readouts agree before and after the fix.

Active enemy trucks now appear on optically visible ground with links to
optically visible, rendered recipients. They disappear immediately when vision
is lost. Opposing queued calls, timer/radius overlays and concealed recipient
positions remain private. Existing friendly and spectator presentation and
resource cleanup are retained.

Both captures were opened and inspected. They stage a deterministic repair at
an observed Warden; they are not a natural mission outcome.

- [Before: unexplained recovery](mechlab-release/repair-before.png)
- [After: visible enemy service truck](mechlab-release/repair-after.png)

## Automatic fitting and company recovery

`planFit` used to try a first ammo bin only beside the new weapon. A gun filling
its compartment was incorrectly rejected even when ammo would fit elsewhere.
This also affected company solvency, falsely recommending retirement for some
zero-credit companies with a fit pilot, ready hull and usable gun in stores.

The original successful fitting pass remains unchanged. Only after it fails,
a deterministic second pass looks for separate ammunition compartments,
preferring blast-contained sections and side torsos/limbs before the centre or
head. It retains validation, damage, inventory and armour rules.

- Nine regression cases cover zero-credit recovery, stock gun reinstalls,
  same-section/shared ammunition and incompatible weapons.
- All 215 previously successful catalogue plans remain byte-for-byte identical.
- All 244 independent fitting/repair/save/deployment checks across 16 hulls pass.
- The repair presentation and health reproduction pass 54 focused tests;
  automatic fitting and recovery pass 48 focused tests.

## Campaign playthrough

The [independent campaign audit](mechlab-release/campaign-audit.md) exercised
79 real battles including failures, retries, injuries, KIA outcomes and repairs.
All four endings were reached on new seeds. The harder Burn route required
spending normally earned pilot XP; automatic-commander losses alone did not
justify changing its combat balance. This is simulation coverage, not a human
first-time difficulty study, and does not claim every optional contract was played.

## Release checks

The candidate is frozen for the fast suite, complete headless browser journey,
typecheck/lint, both production builds and final balance/campaign gates. Aggregate
results and the exact release commit are recorded in the pull request. Browser
inspection uses isolated contexts without desktop input or screen locking.

The itch.io update retains the existing restricted access, optional donations
and GenAI disclosure while changing the project title, URL and current description.
No tester invitations or other outbound messages are part of this release.
