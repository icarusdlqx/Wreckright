# Release audit index

These reports are regenerated from the live game catalogue and deterministic systems.

- [Faction report: reported matchup](faction-reported.md) recreates the player-reported 200t Linewrought force against 225t of Aurelian Halberds across terrain and range.
- [Faction report: paired duels](faction-duels.md) compares all eight faction roles with identical pilots and alternating spawn sides.
- [Faction report: teams](faction-teams.md) covers equal-tonnage companies and experienced Linewrought pilots against green Aurelian crews.
- [Campaign economy](campaign-economy.md) follows both authored campaign routes through clean and costly victories, including payroll, salvage, rewards, repairs and purchases.
- [Content consistency](content-consistency.md) checks all machines, weapons and pilots against their live records.

## Current decision

The reported matchup now favours Aurelian Stock in 17 of 18 runs. Aurelian wins 82 of 96 paired duels and 32 of 36 team battles. Linewrought retains situational counterplay in the 75t Bulwark and 90t Rampart pairings, especially at long starting range. The evidence supports the intended Aurelian tonne-for-tonne advantage without another global statistics change.

Both costly campaign ledgers remain solvent through their full routes. Aurelian repairs consume materially more cash than Linewrought repairs, while contract rewards supply the proprietary equipment its market cannot reliably replace. No economy change is justified by this run.

## Reproduction

Run `npm run audit:balance:reported`, `npm run audit:balance:duels`, `npm run audit:balance:teams`, `npm run audit:economy` and `npm run audit:content`. Raw faction seed results are written under `reports/faction-balance/` for investigation; the concise reviewer reports are kept here.
