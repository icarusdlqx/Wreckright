# The Wreckright faction rebuild

A staged plan to give the game two distinct machine cultures, a weapon
catalogue half its current size and twice its character, a campaign that earns
the salvage loop, and a mechbay a newcomer can read. Work the phases in order:
each one depends on the one before it, and each ends at a gate.

**Naming boundary.** The public game, repository, deployment and diagnostic
namespace are **Wreckright**. Stable authored identifiers such as
`border_dispute` and `line_maintenance`, plus the legacy `ironline.*` browser
storage keys, remain unchanged for save and simulation compatibility. They are
implementation details, not player-facing lore.

## The one rule that changed

`CODEX_BRIEF.md` still holds: **do not edit `src/sim/**`.** Nothing in this
plan requires it — factions live in data, campaign economics live in
`src/campaign`, and the visual identity lives in the render layer.

What *has* changed: this plan edits weapon and chassis statistics, which are
**sim-affecting data**. So the balance gate is now yours to run:

```
npx vitest run src/sim/balance.test.ts        # ~13 minutes, 200 mirror matches
npx vitest run src/campaign/acceptance.test.ts
```

Run both **after your last edit**, never alongside further editing. If you
change anything afterwards, run them again. A phase marked "balance gate" below
is not finished until both are green and you have said so in the pull request.

---

## The setting rule

Read `src/data/lore/*.json` before writing anything — that voice is the standard
to match, and it is dry, concrete and specific.

Nearly a century after the **Aurelian Compact** abandoned Tessell, its successor
has physically returned. The **Aurelian Continuance** and its civil
**Recall Authority** declare every surviving serialized walker root inherited
state property. The claim is narrow enough to argue: it attaches to the root,
not Tessell, its people, or a pilot in the cockpit.

The return matters because **Foundry Winter** destroyed the distributed
industrial chain that made walker roots. The Continuance inherited service
works and records but no complete production line; Tessell never had one.
Service logic can attest a serial and open compatible depot equipment. It
cannot start, stop, steer, locate or aim a live machine.

The two machine cultures are not two armies. They are two conditions of the
same finite inheritance. One has been rebuilt by people who need it back next
week. The other stayed sealed in the dark. Everything else — weapons,
economics, repair time and movement — follows from that.

| | Faction A | Faction B |
|---|---|---|
| Formal name | **Linewrought** | **Aurelian Stock** |
| Slang | *the welded*, *shopwork* | *the sealed*, *coldstock* |
| Weapons | Ballistic and missile | Energy |
| Ammunition | Eats it, runs dry, detonates | None at all |
| Heat | Low | High capacity, but sustained fire cooks it |
| Armour per ton | Lower | Higher |
| Repair | Days, cheap, parts always stocked | Weeks, expensive, parts unbuyable |
| Look | Welded seams, rivets, exposed feed chutes, rust and hazard yellow | Smooth sealed shells, symmetric, no visible mechanism, bone-white and verdigris |

### Linewrought

The depots gave up old Compact roots and incomplete hulls. Tessell can make
plate, limbs, bearings, guns, ammunition, tracked vehicles and fixed
emplacements. It cannot make the reactor cradle, central keel, control lattice
and gait interfaces that constitute a walker root. Shops cut out what has
seized, rebuild around the surviving root and stamp a mark number that counts
trips through the gantry. A Linewrought machine is a named repair history, and
two walkers of the same class are nothing alike.

### Aurelian Stock

The historic Compact built sealed machines to return to certified depots:
sealed reactors, no ammunition and no field access panels. When its charter
lapsed, it left inside a year and sealed what it did not ship. Nearly a century
later, the Continuance can identify and service some of that stock but cannot
replace its roots. Aurelian Stock does not run dry, yet sustained fire still
cooks it. When a sealed component breaks, the only field spare is another
sealed machine.

---

## Phase 1 — The faction data model

**Files:** `src/schema/chassis.ts`, `src/schema/weapon.ts`, every
`src/data/chassis/*.json`, every `src/data/weapons/*.json`,
`src/data/equipment/*.json`.

Add a required `faction` field, one of `linewrought` | `aurelian`, to chassis,
weapons and equipment. Assign every existing entry. Nothing else changes — no
statistics move in this phase, so it stays cheap to review and cheap to revert.

Assign by what the thing is, not by who is holding it: autocannons, missile
racks, gauss weapons and machine guns are Linewrought; lasers and particle
weapons are Aurelian. Flamers are Linewrought (fuel, not capacitors).

**Gate:** fast suite. No balance gate — no statistics changed.

## Phase 2 — Halve the weapon catalogue

**Files:** `src/data/weapons/*.json`, plus any test fixture that names a weapon
that goes away.

There are **41 weapons**. That is the real reason the mechbay is unreadable, and
no amount of UI work fixes it. **Target: 24, split 12 Linewrought and 12
Aurelian.** Cutting is the work; keep the ones with the most character.

### Redundancies to remove

- **The Focused/standard laser pairs** (`medium_laser` vs `er_medium_laser`, and
  the small and large equivalents) differ *only in price* — identical
  damage-per-heat, same tonnage, same slots, same cooldown, 2x the cost. That is
  not a trade-off in an economy where cash accumulates. Keep one of each pair,
  or give the survivor a real drawback.
- **Volley 30** sits between 20 and 40 and adds nothing. Cut.
- **Seeker 2/4/6** — keep one.
- **Shortbow 2/4/6** — keep two.
- **Longshot 5/10/15/20** — keep two.

### Balance faults to fix (measured, not guessed)

- **Longspear 15 is the strongest weapon in the game.** 11 t, **46 damage into a
  single location** at 510 m, 0.22 crit, 260k. The Gauss Rifle is 15 t for 21
  damage at 390 m and costs **600k**. Double the damage, four tons lighter, 120 m
  further, under half the price. Bring it into line or cut it.
- **Volley 40** has the highest DPS in the game (19.4) and 68-point bursts at 5.7
  damage-per-heat. Spread, 240 m range and 0.85 accuracy partly excuse it; it is
  still the best heavy sustained damage per ton.
- **The burst (pulse) laser family is dead weight.** Medium Burst costs double
  the tonnage of a Medium Laser for +10% damage, -25% range and worse heat
  efficiency (0.8 vs 1.0), buying only +30% accuracy. Nobody should take that.
  Fix the trade or cut the family to one entry.
- **The energy/ballistic gap is 8x on DPS-per-ton** (Focused Medium 2.8, Gauss
  Rifle 0.35). Heat-versus-ammo is the intended axis, but at this magnitude
  boating small energy weapons is optimal whenever heat allows, which quietly
  makes heat the only decision in the game. Narrow it.
- **Shortbow 2** at 1 t returns 3.1 damage-per-heat and 2.07 DPS-per-ton — the
  most efficient missile in the game and a likely light-mech exploit.

Regenerate the measurements yourself before and after; do not trust the numbers
above to still hold once you start moving things:

```
python3 - <<'EOF'
import json, glob
for f in sorted(glob.glob('src/data/weapons/*.json')):
    d=json.load(open(f)); r=d.get('range',{})
    dmg=d.get('damage',0)*d.get('projectiles',1); cd=d.get('cooldown',1) or 1
    print(f"{d['name']:24} {d['tonnage']:>5}t dps={dmg/cd:6.2f} dps/ton={dmg/cd/d['tonnage']:5.2f} "
          f"dmg/heat={dmg/max(d.get('heat',0.001),0.001):6.1f} rng={r.get('long') or r.get('max')}")
EOF
```

### Naming

Keep the generic English names — **Medium Laser, Large Laser, Machine Gun,
Autocannon, Gauss Rifle, Flamer** are descriptive terms and are staying. Give
new or reworked entries names with faction voice; never reuse another mech
franchise's designations (no LRM, SRM, PPC, AC/20, ER, Pulse, Streak, LB-X).
`LAUNCH.md` records what was scrubbed and why — do not let any of it back in.

**Ids are load-bearing.** They appear in save files and campaign state. Removing
a weapon means existing saves referencing it must degrade gracefully rather than
crash — check `src/campaign/save.ts` and add a migration if needed.

**Gate:** balance gate + acceptance + fast suite + playthrough.

## Phase 3 — Sixteen machines, eight a side

**Files:** `src/data/chassis/*.json`, `src/data/designs/*.json`,
`src/render/blueprint/plans-*.ts`.

Thirteen chassis exist. Assign eight to Linewrought and five to Aurelian, then
author **three new Aurelian chassis** so each faction fields a full ladder:
two light, two medium, two heavy, two assault. Both sides must be playable as a
complete lance, and a mixed lance has to make sense.

“Author” here means add a previously unseen historical root class to the game
catalogue. It never means Tessell or the player manufactures a new walker.
Campaign roster growth comes from a specific existing machine changing custody
through salvage or the yard.

Give each new chassis its own body plan under `src/render/blueprint/` — plans
are authored per machine rather than scaled from one shape, and the Sealed
machines are the chance to make that pay off: symmetric, closed, no visible
mechanism.

Hardpoints carry the faction identity. Aurelian chassis are mostly energy
hardpoints, Linewrought mostly ballistic and missile — which is what makes
bolting captured guns onto a captured hull *possible but awkward*. That is the
intended texture; do not smooth it out.

**Gate:** balance gate + acceptance + fast suite + playthrough.

## Phase 4 — Salvage economics and the campaign

**Files:** `src/campaign/repair.ts`, `src/campaign/refit.ts`,
`src/campaign/market.ts`, `src/data/campaigns/border_dispute.json`,
`src/data/missions/*.json`, `src/data/lore/*.json`.

The point of the split is a decision the player actually feels: **a captured
Sealed machine is better in the field and a liability in the bay.**

- Repair of an Aurelian mech costs 2-3x and takes 2-3x the days
- Aurelian parts are **not purchasable** in the market at any price
- The only source of Aurelian components is salvage from another Aurelian machine

So fielding captured kit commits you to hunting more of it for spares. That is a
strategic decision built from cost multipliers and one availability flag — **no
new systems.** Keep it that simple.

### The campaign, four acts

1. **First Notice.** The General Reversion Order names the company's own four
   roots. Kestrel provides local compliance muscle while Halloran races to copy
   the custody books.
2. **First Attestation.** Kestrel escorts a bone-white machine carrying a
   Continuance seal. The player takes their first Aurelian Stock and learns
   that a service reader proves identity without controlling the walker.
3. **Broken wreckright.** Kestrel fires on an ejection seat and cuts power to
   Sarn repair yards that refused an Authority inventory. Root title, shop
   liens, necessity and possession at dusk become an open claims war.
4. **The manifest.** Reach the depot before Kestrel and the Recall Authority.
   **Burn it** to destroy the master evidence and certified service opportunity,
   or **take it** and become custodian of the claim. The depot is never a walker
   factory, and neither ending creates new roots.

Fold the two backstories above into `src/data/lore/` as new articles, in the
voice of the four that are already there.

**Gate:** acceptance + fast suite + playthrough.

## Phase 5 — How they walk

**Files:** `src/render3d/mechModel.ts`, the `src/render3d/scene*` modules, and
the audio set (`src/ui/audioVoices.ts`, `audioWeapons.ts`, `audioCues.ts`).

Two machine cultures should be tellable apart at a glance, from the movement
alone, before the player reads a single label.

**Welded** — a hitch in the stride, one leg fractionally out of phase.
Hydraulic slop on weight transfer. The whole frame recoils when it fires;
casings eject, the breech vents smoke. Startup is a cough and a shudder. Damage
tears panels loose to dangle. At idle it is never entirely still — small
constant corrections, a shifting of weight.

**Sealed** — an unnervingly even gait, no wasted vertical motion, feet placed
exactly. **The torso tracks its target instantly, with no lag at all** — that is
the tell, and it is already data-driven through the `twistLimit` and
`torsoOffset` fields the schema carries. No recoil: a rising hum, then
discharge. Startup is silent, lights coming up in sequence. Damage shows
nothing — it walks identically until the moment it doesn't, then drops all at
once. At idle it is *perfectly* still, which is what makes it frightening.

Where the difference can be expressed as chassis data rather than render code,
do it as data.

**Gate:** fast suite + playthrough, with before/after screenshots.

## Phase 6 — The mechbay

**Files:** `src/ui/mechbay/*.tsx` (Mechbay.tsx is 700 lines — split it),
`src/ui/styles.css`.

The bay shows numbers and expects the player to do arithmetic. Fix that.

The bay always opens on a specific owned or recovered machine. It repairs and
refits that machine; it never creates a generic frame, clones a saved pattern or
turns a catalogue class into campaign inventory. Player authorship lives in the
next shop mark — weapons, armour, ammunition, equipment and cooling — while the
root class and fixed structural interfaces remain inherited constraints.

- **A live 3D preview** built from the same `src/render/blueprint/` data the
  battlefield uses — rotating, mounted weapons visible on the hull, hardpoints
  highlighted on hover. The bay and the field finally agree about what a machine
  looks like. This is the single biggest upgrade on the board.
- **Procedural weapon glyphs** — a stubby drum for autocannons, a lens array for
  lasers, a honeycomb for missile racks. No asset pipeline; draw them.
- **The same three bars on every weapon card** — Damage, Reach, Heat — so
  comparison is visual instead of arithmetic. Plus one plain-English cost line:
  "4 tons, 2 slots, cooks you at 2.8 heat a second."
- **A range-band strip** showing this weapon against what is already mounted,
  answering "does this fit the way I fight?"
- **Filter to the hardpoint that was clicked**, so only what can actually go
  there is offered. This alone removes most of the overwhelm.
- **Category headers using plain English** — Long-Range Missiles, Short-Range
  Missiles, Autocannons, Lasers, Particle Weapons, Machine Guns — so a newcomer
  reads the shelf instantly while the individual items keep their faction names.
- **Faction tint on cards**, so captured kit reads at a glance.

**Gate:** fast suite + playthrough, with before/after screenshots.
