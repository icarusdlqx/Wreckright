# Workshop economics and command flow

This build addresses costly recovery, unclear postmission progression and a crowded battle interface. It continues the faction-campaign build at `d1118af`; the existing faction campaigns, pilot progression, loadout saves and fixed campaign difficulty remain supported.

## Campaign and economy

The primary company action now leads to the next mission. After a debrief or from the Journal, it opens the next available main-story contract for review without signing it, spending credits or advancing the day. Once signed, the action opens outfitting and lance selection. A persistent Contract → Outfit → Deploy guide explains the sequence. Optional missions remain selectable and both ending choices remain reviewable.

Waiting is a separate disclosure with an explicit wage quote. It can advance one day or to the next already-booked repair, checks the treasury at each day boundary, and stops before crossing a signed contract deadline. Waiting does not bypass a wounded pilot's required missed mission.

The workshop rebalance reduces reconstruction fees and labour rather than increasing mission earnings. Aurelian maintenance still costs more, but its old 2.5× multiplier no longer compounds large hull and section surcharges. Existing paid repairs preserve their completion dates; unpaid legacy hulls receive the current tariff when quoted, without rewriting saved damage or treasury.

| Representative repair | Before | Now |
| --- | --- | --- |
| Actual saved captured Votive, four lost sections | 9,221,318 C / 110 days | 1,439,812 C / 14 days |
| Actual saved captured Warden, lost head | 6,755,515 C / 75 days | 1,068,128 C / 10 days |
| Aurelian starting fleet, fixed half-armour fixture, including queue wages | 533,550 C / 26 days | 263,925 C / 9 days |

The saved captures are from the previously completed ordinary-UI Linewrought campaign. Recomputed quotes are not new campaign victories. The fleet comparison is a controlled damage fixture. Full assumptions and market checks are in [the economy report](economy-command-flow/economy-metrics.md). Severe losses remain expensive; practical campaign loss rates still need external playtesting.

## Combat workspace

- The compact contacts strip attaches directly beneath the battle header.
- Short squad cards select the company; the right panel holds detailed condition and weapon controls. Full machine identities remain available in tooltips and tactical details.
- An original eight-section silhouette shows front/rear armour, independent internal structure, destroyed crosses and exact values. Conditions use green/yellow/red/black plus labels and symbols. Called-shot selection retains keyboard and pointer support.
- Pilot diagnostics and explanatory text start folded. Radio and support reports live inside the command dock, outside the playable Commander map. Its reserved space follows the actual dock height.
- Routes retain direction, endpoint and ETA information with thinner lines and fewer, smaller chevrons.
- Clicking a hostile gives a brief command receipt and four optical target corners. They respond while paused and disappear immediately on lost sight. Sensor contacts retain coarse positions rather than revealing exact hidden mechs.
- Phone inspection expands to show the miniature. Compact command layouts preserve usable controls, scrolling and safe-area spacing.

## Visual evidence

The supplied before images and the new screenshots were inspected. New presentation tests deliberately set damage and visibility to exercise edge states; they do not represent played campaign victories.

| Before | After |
| --- | --- |
| [Campaign Journal](economy-command-flow/before-campaign.png) | [Next mission from Journal](economy-command-flow/after-campaign.png) |
| [Crowded battle interface](economy-command-flow/before-combat.png) | [Compact combat workspace](economy-command-flow/after-combat.png) |

Additional views: [explicit waiting cost](economy-command-flow/after-workshop-wait.png), [docked radio and Commander map](economy-command-flow/after-commander.png), [damage miniature](economy-command-flow/after-damage.png), [phone inspection](economy-command-flow/after-phone.png), [short landscape controls](economy-command-flow/after-landscape.png), [enemy target corners](economy-command-flow/after-target.png).

## Ordinary campaign check

An independent, ordinary-UI Aurelian opening run won First Warrant in 1:08 with all four mechs returning. Actual repairs were 80,175 C, with 19,200 C payroll to clear the lift by day 5. After settlement and repairs, the company held 2,170,825 C versus 1,600,000 at campaign start. The next contract opened a valid four-mech 205/210t manifest; navigation did not spend money or days, and reload preserved the complete company. This is one opening mission, not proof of full-campaign solvency. [Detailed live ledger](economy-command-flow/live-review.md), [victory](economy-command-flow/live-04-first-result-or-status.png), [next deployment](economy-command-flow/live-10-next-mission-manifest.png).

## Validation

- TypeScript and ESLint passed.
- Fast suite: **3,241 tests across 400 files passed**.
- Balance and campaign acceptance: **25 tests passed** against frozen product source.
- Both production builds passed; standalone HTML is **3.58 MB**, with no external requests.
- Full browser regression: **1,037/1,037 checks passed** against the final product source.
- The production preview was separately opened and deployed through normal browser controls; all eight damage sections rendered and contacts attached exactly beneath the header.
- Browser checks used isolated profiles; the original company saves were preserved.

Focused checks cover both faction flows, saved repair queues, salvage/yard resale loops, called shots, paused targeting, fog privacy, and desktop/phone/landscape geometry.
