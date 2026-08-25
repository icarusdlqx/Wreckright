# Launch notes

Working notes for taking the game public. Kept in the repository so any
session — human or agent — can pick the list up where the last one stopped.

## The name

The working public title is **WRECKRIGHT**. Complete a formal trademark
clearance and storefront search before a paid release; choosing the title does
not replace that review.

The product, repository, Worker, deployment hostname, downloads, and tooling
now share the Wreckright identity. Existing browser-storage and serialized
playtest identifiers retain their original `ironline.*` values as non-visible
compatibility contracts, preserving saves and rollback safety from the first
Wreckright deployment. Authored data ids likewise remain stable because they
are save and simulation contracts rather than branding.

## The IP scrub (done, August 2026)

An audit found the weapon and equipment catalogue reproduced another mech
franchise's designations near-verbatim, plus a handful of name collisions.
All player-facing names were replaced with originals; the JSON `id` keys were
deliberately left alone so existing saves keep working (ids never render and
are not used as marks in commerce). The renames:

- Frame label "BattleMech" (a live trademark) → "Mech"
- Weapon designations → original names (AC/n → Light/Field/Heavy/Siege
  Autocannon, LB-X → Canister Cannon, PPC → Arc Projector, ER → Focused,
  Pulse → Burst, SRM → Shortbow, LRM → Longshot, MRM → Volley,
  Streak → Seeker, Inferno → Scorcher, Thunderbolt → Longspear,
  Light/Heavy Gauss → Gauss Carbine/Howitzer, Heavy Large Laser → Smelter
  Laser)
- Equipment: CASE → Blowout Cell, NARC → Limpet Beacon, TAG → Target
  Designator, Double Heat Sink → Compound Heat Sink, Active Probe → Deep
  Scanner
- Chassis: Wisp WSP-1 → Vesper VES-1 (was one letter from a famous mech,
  same model prefix), Hornet HNT-2 → Gadfly GAD-2 (identical name to one)
- Factions/lore: Steel Legion → Slag Legion, Wolfhound Detachment →
  Watchdog Detachment, the Warden Compact → the Harrow Compact, Kell Reach
  → Karst Reach, "C-bills" → "credits"
- Docs no longer name the franchises they were inspired by

Kept as generic vocabulary (real words, real military/engineering terms, or
genre-generic): mech, lance, dropship, autocannon, gauss rifle, heat sink,
jump jet, alpha strike, called shot, flamer, plasma rifle, machine gun, the
eight hit locations.

Residual, deliberately accepted: internal ids (`lrm15`, `ppc`, `case`…)
still mirror the old designations — invisible to players, but if the repo's
public history ever feels like exposure, migrate them with a save-format
bump. Several items still share tonnage/slot numbers with their inspirations;
mechanics and stats are not protectable, and ongoing balance passes will
diverge them naturally.

## Analytics

Cloudflare Web Analytics is free, cookie-less, and needs no consent banner:
Cloudflare dashboard → Analytics & Logs → Web Analytics → add the site, then
paste the beacon `<script>` it gives you into `index.html` just before
`</head>`. That single tag reports visits, referrers, and Core Web Vitals.
This needs the dashboard token, so it is a human step, not an agent one.

## itch.io

`npm run build:single` produces `dist-single/` with one self-contained HTML
file — no assets to zip, nothing to break. On itch: create the project, set
"Kind of project" to HTML, upload the file, tick "This file will be played in
the browser", enable fullscreen, and set the viewport to at least 1280×800.
The in-game Feedback link already points at the GitHub issue tracker, so
players from any storefront land in the same place.

## Difficulty for strangers

First launches now start on Green (the picker in the top bar still offers
the full ladder). Nobody who bounced off their first battle plays a second.

## Remaining before a public push

- [x] Adopt WRECKRIGHT across player-facing application and release surfaces
- [ ] Complete formal trademark and storefront clearance for WRECKRIGHT
- [ ] Add the analytics beacon (human step, needs the dashboard)
- [ ] One full playthrough at Green from a cleared browser profile
- [ ] itch.io page with screenshots and a short pitch
