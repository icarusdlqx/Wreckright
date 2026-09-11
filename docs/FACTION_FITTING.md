# Factions, fitting and salvage

Linewrought machines are practical rebuilds around inherited walker roots. Crews
share tools, repair mismatched armour and keep local guns fed. Aurelian Stock
presents the Continuance ideal: fresh armour, precision servicing, advanced optics
and compact energy weapons. Its crews are trained to dismiss workshop rebuilding
as improper ownership. Their technology is valuable; their certainty is not always
earned. Fresh systems do not mean fresh roots: the original industrial chain is
still lost.

The public field-manual pages **Linewrought** and **What Fits, What It Costs**, and
the first-contact **Aurelian Stock** page carry this direction into the game.
`the_welded` and `the_sealed` remain stable lore identifiers for compatibility.

## Shared mounts, visible costs

Faction is not an equipment lock. Every current walker has at least one mount
that can take a weapon from the other culture. Fitting uses the same legality
boundary as the simulation and campaign refits:

1. A matching energy, ballistic or missile mount.
2. A mount that supports the weapon's size.
3. Enough compartment boxes for the weapon and any locally placed ammunition.
4. Enough tonnage across the mech, with additional cooling sharing that payload.
5. A real copy of the weapon in the current refit inventory.

The weapon keeps its damage, accuracy, heat, weight and box footprint when it
crosses cultures. There is no adapter currency, hidden faction multiplier or
extra save field.

| Swap | What it gives | What it asks |
|---|---|---|
| Aurelian energy on Linewrought | Compact firepower, no ammunition bin, premium tracking on burst lasers | Energy mounts, cooling capacity, replacements from salvage |
| Linewrought cannon/missiles on Aurelian Stock | Local replacement supply, often cooler sustained fire | Suitable physical mounts, finite ammunition, bin boxes and tonnage, ammunition explosion risk |
| Linewrought flamer on Aurelian Stock | Close-range target heating | An energy mount, local heat; no separate fuel bin is simulated |

The weapon inspector derives sourcing, heat rate, equivalent sink cooling and
ammo endurance directly from the catalogue. Configuration labels follow the
weapons actually fitted, including player edits. They do not infer faction from
paint or the company that captured a machine.

## Existing stock configurations

Linewrought's Bulwark has a mixed fit with three recovered lasers and three local
guns/racks. The other seven Linewrought walkers use local armament. Aurelian's
Falchion and Warden retain mixed service refits with a majority of native weapons.
The other six Aurelian standards carry native armament.

The September balance review restored the Sentinel, Halberd and Pallvault to
coherent native batteries with Compound Heat Sinks. Sentinel trades its cannon
and missile bins for burst lasers and torso plasma; Halberd fields paired arm arc
projectors and large lasers behind heavier plate; Pallvault exchanges some engine
mass for full armour and a central plasma rifle. Existing saved mixed refits keep
their weapons. Physical mounts and compartment capacities remain unchanged, so
local guns still fit wherever the chassis interfaces permit them.

The revision also fixed a reactor-governor fault that could silence an entire
energy group when its full volley could not fit the safe heat budget. The governor
now admits individual ready weapons and rotates waiting emitters, while preserving
the player's weapon-group orders. The measured comparison and its limits are in
`docs/review/faction-balance-evidence.md`; there is no hidden faction damage bonus.

## Recovery and repair

Recovery uses the actual components of the source design and retains their item
identities and provenance. A workshop cannon recovered from an Aurelian mech stays
Linewrought; an emitter recovered from a mixed Linewrought machine stays Aurelian.
Contract terms, damage and salvage cargo limits still determine what comes home.
Installed weapons can be stripped into company stores and reused in another legal
fit. Cross-faction inventory round trips are covered in campaign tests.

Local Yard stock is controlled by the existing authored faction allow-list.
Linewrought replacement weapons and equipment can be bought when listed. Aurelian
weapons and equipment must be recovered or stripped from an owned machine. Armour
and structure repair is charged in credits and workshop time; it does not consume
an invented spare-component resource. Current Aurelian repair factors are 1.35×
cost and 1.25× time, applied to the chassis even when its weapon fit is mixed.
Workshop labour is rounded once to whole days. Recommissioning a recovered hull
starts at 12% of its bare chassis cost and four workshop days, plus its actual
field damage; each lost section adds 2% and one day before the faction factor.
Existing unbooked hulls receive the lower current tariff, while already-paid
workshop bookings keep their saved completion dates.

## Weapon baseline before this pass

Measured from the 24 JSON weapons on 6 September 2026, before any edits. Figures
assume continuous base-mode cycling; they exclude aim, range falloff, armour
location, movement, available ammunition and overheating. This is a tradeoff
check, not a prediction of which weapon wins every fight.

| Weapon | Culture | Tons | Boxes | Damage/s/ton | Heat/s |
|---|---|---:|---:|---:|---:|
| Siege Autocannon | Linewrought | 14 | 10 | 0.46 | 1.75 |
| Field Autocannon | Linewrought | 8 | 4 | 0.41 | 0.50 |
| Focused Large Laser | Aurelian | 5 | 2 | 0.64 | 2.40 |
| Focused Medium Laser | Aurelian | 1 | 1 | 1.71 | 2.00 |
| Extended Arc Projector | Aurelian | 7 | 3 | 0.71 | 3.25 |
| Flamer | Linewrought | 1 | 1 | 2.00 | 2.00 |
| Gauss Rifle | Linewrought | 15 | 7 | 0.35 | 0.25 |
| Smelter Laser | Aurelian | 8 | 3 | 0.78 | 4.50 |
| Large Laser | Aurelian | 5 | 2 | 0.69 | 2.29 |
| Large Burst Laser | Aurelian | 7 | 3 | 0.61 | 3.75 |
| Canister Cannon | Linewrought | 11 | 6 | 0.36 | 0.67 |
| Longshot 10 | Linewrought | 5 | 2 | 1.12 | 1.00 |
| Longshot 20 | Linewrought | 10 | 5 | 1.02 | 1.50 |
| Machine Gun | Linewrought | 0.5 | 1 | 2.40 | 1.00 |
| Medium Laser | Aurelian | 1 | 1 | 1.67 | 1.67 |
| Medium Burst Laser | Aurelian | 2 | 2 | 1.40 | 3.20 |
| Volley 20 | Linewrought | 7 | 3 | 1.43 | 1.71 |
| Plasma Rifle | Aurelian | 6 | 2 | 0.83 | 3.50 |
| Arc Projector | Aurelian | 7 | 3 | 0.61 | 2.50 |
| Small Laser | Aurelian | 0.5 | 1 | 1.60 | 0.80 |
| Small Burst Laser | Aurelian | 1 | 1 | 1.50 | 2.00 |
| Shortbow 2 | Linewrought | 1 | 1 | 1.31 | 0.43 |
| Shortbow 6 | Linewrought | 3 | 2 | 1.63 | 1.33 |
| Seeker 6 | Linewrought | 4.5 | 2 | 0.87 | 1.33 |

The energy catalogue already offers substantial payload efficiency: Medium Laser
1.67 damage/s/ton versus Field Autocannon 0.41, and Large Laser 0.69 versus Gauss
Rifle 0.35. Burst lasers carry 1.3 accuracy, but some local missile weapons have
excellent sustained output and Seeker tracking is higher still. Aurelian weapons
therefore have a general technology advantage, not unconditional superiority.
Heat, range, critical hits, projectile spread, ammunition and rarity remain
meaningful reasons to choose workshop armament. No blanket faction buff was added.
