# Aurelian live UI economy check

Played the opening mission through ordinary headless browser UI on the shared dev build. No game-state injection, synthetic victories or simulation stepping. This is one live mission and its actual recovery and preparation for the next contract, not a complete campaign balance proof.

- Campaign: Aurelian, Green; seed `iron-garrison-e1c24f81`.
- Starting treasury: **1,600,000 C**, day 0. Four stock mechs, 205 tonnes.
- First Warrant: **Victory, 1:08**, 4/4 operational, 608 damage dealt, 238 received; 3/3 enemies stopped.
- Commands: select four lance cards, Attack Move toward map centre, then investigate the final sensor contact. Paused to inspect; used normal speed controls. No support purchase or pilot abilities.
- Actual damage received: Votive 21; Sentinel 0; Falchion 60; Halberd 157.
- All four pilots returned. Arne earned 778 XP and the debrief correctly offered training.

## Ledger and repairs

| Step | Credits | Day |
| --- | ---: | ---: |
| Campaign start | 1,600,000 | 0 |
| After mission settlement | 2,270,200 | 1 |
| After booking all needed repairs | 2,190,025 | 1 |
| All four mechs fully repaired | 2,170,825 | 5 |
| Next contract signed and outfit/manifest reviewed | 2,170,825 | 5 |

The nominal Standard split fee was 650,000 C; the day-one payment-dispute event added 25,000 C. Debrief showed 675,000 C paid. The normal mission day cost 4,800 C in wages.

Repair bills were Votive **7,030 C**, Falchion **20,284 C**, Halberd **52,861 C**: **80,175 C total**. Sentinel needed no repair. The single lift queued Votive for day 2, Falchion for day 3, Halberd for day 5. The explicit next-repair buttons waited 1 + 1 + 2 days and displayed 4,800 + 4,800 + 9,600 C wages: **19,200 C total**. Repair plus recovery wages cost **99,375 C**. Final treasury was **570,825 C above campaign start** with all four mechs restored.

## Continuation proof

The actual debrief's **Review next mission** opened **Custody Posts** at unchanged day 1 and treasury 2,270,200 C. From Journal, the header's **Next mission** returned directly to that contract. Workshop repairs remained explicit choices.

After repair, signing Standard split terms for Custody Posts and choosing **Outfit & deploy** opened the mechbay; **Continue to deployment** opened the normal manifest, showing four ready machines, **205/210t**, and a valid Launch button. No mission was launched automatically and navigation/signing did not advance time or spend treasury. Reload preserved the entire saved company byte-for-byte and the header resumed **Outfit & deploy**, day 5, 2,170,825 C.

The field-result button first resolves the contract and then becomes **Back to campaign**; it still takes that second click to leave the field report. This is explicit but remains a possible future simplification. No browser errors or gameplay failures occurred in this bounded run.

## Evidence

- [Actual victory and damage report](live-04-first-result-or-status.png).
- [Actual debrief and next-mission action](live-05-real-debrief.png).
- [Next deployment with four ready mechs](live-10-next-mission-manifest.png).

Detailed local saves, UI text and repair/wait records are retained under `reports/economy-command-flow/aurelian-live/` in the development workspace. All three images above were inspected.
