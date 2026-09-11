# Workshop economics review — 8 September 2026

The changes target the excessive cost of losing a section or recovering a hull, rather than increasing income. Mission fees, starting reserves, wages, hiring, salvage rolls, purchased chassis prices, market stock, combat statistics and weapon configurations are unchanged.

## Authored tuning

| Rule | Previous | Revised |
| --- | ---: | ---: |
| Hulk recommissioning | 45% bare chassis | 12% bare chassis |
| Hulk workshop labour | 21 days | 4 days |
| Destroyed section surcharge | 8% bare chassis | 2% bare chassis |
| Destroyed section labour | 4 days | 1 day |
| Armour throughput | 90 points/day | 120 points/day |
| Structure throughput | 20 points/day | 60 points/day |
| Aurelian cost premium | 2.5× | 1.35× |
| Aurelian labour premium | 2.5× | 1.25× |

Armour still costs 250 credits per point and structure 1,200. The one-lift queue remains. Faction labour is now rounded once, after applying the multiplier: a one-point Aurelian patch takes one day rather than three. Aurelian hulls still tend to have a higher purchase basis and carry a repair premium; their replacement weapons and equipment remain salvage-only.

## Measured quotes

Costs are credits. Duration is the job's own labour, before any earlier bookings or banked day credit. Captures arrive without weapons, loose equipment or external sinks; fitting parts remains a separate inventory decision.

| Machine / condition | Previous credits | Previous days | Revised credits | Revised days |
| --- | ---: | ---: | ---: | ---: |
| **Actual saved Votive capture**, four destroyed sections | 9,221,318 | 110 | 1,439,812 | 14 |
| **Actual saved Warden capture**, destroyed head | 6,755,515 | 75 | 1,068,128 | 10 |
| **Actual saved Trestle wreck**, three destroyed sections | 3,123,049 | 42 | 955,549 | 11 |
| Votive, hypothetical intact capture | 5,175,000 | 53 | 745,200 | 5 |
| Sentinel, hypothetical intact capture | 3,825,000 | 53 | 550,800 | 5 |
| Prybar, hypothetical intact capture | 742,500 | 21 | 198,000 | 4 |
| Halberd, half armour plus left torso and arm destroyed | 5,686,500 | 35 | 899,910 | 7 |
| Bulwark, half armour plus left torso and arm destroyed | 1,549,450 | 14 | 481,450 | 5 |
| Votive, hypothetical all-eight-section wreck | 13,044,500 | 155 | 2,013,930 | 20 |

The actual saved captures are read from the prior ordinary-UI Linewrought ending export at `reports/faction-campaign-playtest/linewrought-ui/linewrought-complete-day89-smoke-hammer-fe548c7f.json`. That export was not changed. These are recomputed workshop quotes, not a new campaign victory.

## Fleet budget checks

Each fixed-damage scenario uses the faction's original four-machine fleet and four pilots. Every job is booked sequentially on the existing single lift; payroll is 4,800 credits per waiting day. These are damage fixtures, not claims about average combat outcomes.

| Fleet / fixture | Previous repairs | Previous waiting payroll | Previous queue | Revised repairs | Revised waiting payroll | Revised queue |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Linewrought, half armour on every mech | 157,750 | 48,000 | 10 days | 157,750 | 28,800 | 6 days |
| Aurelian, half armour on every mech | 408,750 | 124,800 | 26 days | 220,725 | 43,200 | 9 days |
| Linewrought, half armour plus last mech's left torso/arm lost | 1,060,100 | 100,800 | 21 days | 436,100 | 48,000 | 10 days |
| Aurelian, half armour plus Halberd's left torso/arm lost | 5,971,500 | 254,400 | 53 days | 1,053,810 | 62,400 | 13 days |

The first standard Linewrought fee is 850,000 and its opening reserve is 3.2 million. The first standard Aurelian fee is 650,000 and its reserve is 1.6 million. Routine half-armour repair plus payroll now consumes 22% and 41% of those first fees respectively. A major Aurelian section loss still consumes more than one initial fee, but the starting reserve can repair the fleet. Repeated total losses can still bankrupt a company.

## Persistence and market checks

- No save version or storage-key change. Quotes cap a known chassis's existing unpaid rebuild fee to today's authored tariff; an older discount remains discounted. Merely opening or quoting a legacy save does not change its cash, damage, stored fee or dates.
- Paid work still uses its saved completion date. No automatic refunds, queue resets or changes to signed contract payments.
- The yard continues to subtract the current full inherited repair bill. More recoverable hulls now have a useful direct sale value. Rebuilding and selling produces no more cash than selling the damaged hull directly, and is worse after payroll. Finite salvage rewards retain intended value.
- Actual buy → repair → advance → sell loops tested across 12 seeded weekly markets, including worn listings, all lose money. Captured hull rebuild → advance → sell checked across every mech design.
- Ten new economy tests cover affordability, full-wreck consequences, one-time rounding, current quotes on legacy hulls, preserved paid bookings, and market/capture anti-arbitrage. Existing yard recovery tests now use an actual severely destroyed Halberd instead of arbitrary superseded repair bills.

## Validation and limits

`npx vitest run src/campaign/economyBalance.test.ts src/campaign/repairQueue.test.ts src/campaign/aurelianCampaign.test.ts src/campaign/salvagedHull.test.ts src/campaign/market.test.ts src/campaign/solvency.test.ts src/campaign/solvencyWorkshop.test.ts src/campaign/campaignOperations.test.ts` passed **89 tests across 8 files**. Scoped ESLint and global TypeScript passed. Root integration is responsible for final full gates after all parallel work freezes.

This is a measured first rebalance, not proof that every campaign route is financially balanced. Another uncoached Aurelian campaign should establish the practical loss rate and whether captures arrive early enough to use. No combat tuning, extra money grant, automatic repair or unrestricted store stock was introduced.

Recompute the full tables with `npx vite-node reports/economy-command-flow/measure-economy.ts`; detailed values are retained in `economy-metrics.json`.
