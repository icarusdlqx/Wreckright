# A Clean Account — campaign script

Campaign ID: `aurelian_recall`

Player culture: Aurelian Stock

Employer: Continuance Custody Tender
Arc: confidence → friction → doubt → accountable command

This is the final writing source for the Aurelian campaign. It treats superior
equipment as a real advantage while putting pressure on formation, heat,
replacement cost and divided duties. Tonnage and map assignments are targets
for later encounter work.

## Opening

### An orderly return

Your detachment disembarks with four serviced walkers and a warrant. The
Aurelian Continuance needs inherited roots to keep its own failing civil-defence
machines alive. The Recall Authority says Tessell is holding those roots without
title. Your first duty is to clear the landing approach so the custody tender
can advance.

You command Aurelian Stock: precise energy weapons, bright armour and crews
accustomed to being the best-equipped unit on the field. A root is the inherited
reactor cradle, keel and control lattice inside a walker; no foundry can replace
one. Your contract pays for completed work, not replacement emitters. Discipline
means preserving the detachment as carefully as the evidence.

## Route and stable IDs

| Use | Node ID | Legacy mission ID | Final display name | Target place | Cap |
|---|---|---|---|---|---|
| Main A1 | `first_warrant` | `raid_ridge` | First Warrant | `aurelian_landing_apron` | 215t / 4 |
| Optional | `custody_survey` | `custody_survey` | The Unbroken Chain | `aurelian_service_terraces` | 50t / 1 |
| Optional | `custody_resupply` | `custody_resupply` | Under Civil Seal | `aurelian_landing_apron` | 135t / 3 |
| Main A2 | `cutbank_attestation` | `base_capture_ridge` | Custody Posts | `aurelian_civic_exchange` | 210t / 5 |
| Main A3 | `sarn_inventory` | `switchyard_watch` | Sarn Inventory | `aurelian_civic_exchange` | 220t / 5 |
| Main A4 | `root_exchange` | `authority_root_exchange` | Root Exchange | `aurelian_service_terraces` | 100t / 2 |
| Main A5 | `quarry_receipt` | `authority_quarry_receipt` | Quarry Receipt | `blackglass_quarry` | 225t / 5 |
| Main A6 | `conduit_injunction` | `authority_conduit_injunction` | Conduit Injunction | `aurelian_service_terraces` | 230t / 5 |
| Main A7 | `barrow_warrant` | `authority_barrow_warrant` | Barrow Warrant | `barrow_archive` | 240t / 5 |
| Ending A8a | `continuance_export` | `authority_continuance_export` | Export Under Seal | `barrow_archive` | 250t / 5 |
| Ending A8b | `local_stewardship` | `authority_local_stewardship` | Countersign Stewardship | `barrow_archive` | 250t / 5 |

First Warrant opens Custody Posts directly. The optional survey opens Under
Civil Seal and its scarce tender allocation, but neither operation is required
to understand or finish the warrant route.

## A1 — First Warrant

**Why this battle happens:** A local cordon blocks the surveyed approach needed
to unload the Custody Tender and its evidence teams.

**Why it opens A2:** Opening the approach lets the Authority compare its landing
manifest with Cutbank's two surviving custody posts.

**Briefing**

Clear the tender approach and establish a safe deployment lane. The local
cordon has one rebuilt walker and vehicle escorts. Use range discipline and
coordinated fire; there is no premium for damage taken. When the lane is secure,
the convoy will move without waiting for every retreating unit to be hunted.

**Opening exchange — after deployment**

- Lead / Petra: “Survey line is exact. Hold spacing and the tender will have its
  road.”
- Impulse / Arne: “One rebuilt walker. We should be finished before its guns
  find their range.”
- Dispatch fallback: “Clear the surveyed lane for the Custody Tender.”

**Field exchange — after the local walker survives its first exchange**

- Practical / Teodor: “Rebuilt does not mean fragile. It means somebody knows
  which failures to expect.”
- Observer / Silas: “Then we revise the estimate and retain the formation.”

**Aftermath: Beyond the landing manifest**

The approach is open and the tender advances on schedule. The local machine was
inferior by specification and effective in cover, which is the first useful
correction to the briefing. Cutbank's two custody posts are the next main
warrant. A separate terrace survey can locate a stranded service tender and
release scarce equipment, but it is optional.

## Optional — The Unbroken Chain

**Purpose:** A patient one-machine survey introduces the service terraces and
rewards observation rather than combat.

**Briefing**

Two civil readers sit above the landing route. Take one machine no heavier than
50 tonnes, record both and copy the dispatch ledger. The western maintenance
track avoids the road guard. This is an inventory task; do not turn it into a
clearance operation.

**Opening exchange**

- Observer / Silas: “A complete chain begins with evidence gathered without
  damaging it.”
- Practical / Teodor: “And a light machine begins by staying off the fine new
  road.”
- Dispatch fallback: “Record both readers and copy the dispatch ledger. Contact
  is not required.”

**Field exchange — second reader recorded**

- Lead: “Ledger received. It marks a service tender stranded beside our landing
  perimeter.”

**Aftermath**

The unbroken reader chain locates a supply tender and earns the detachment a
Deep Scanner. The main warrant remains open. Recovering the tender is a choice
about readiness, not an unrecorded condition of duty.

## Optional — Under Civil Seal

**Purpose:** Give the detachment a distinct logistics mission and a controlled
source of advanced replacements.

**Briefing**

Protect the tender's loading stand, secure the perimeter relay and hold both
through a 30-second transfer. Bring no more than three machines and 135 tonnes.
The sealed cabinet is optional. Once the transfer closes, surviving claimants
do not invalidate the delivery.

**Opening exchange**

- Lead / Petra: “Loading stand and relay. The transfer closes only while both
  remain secure.”
- Impulse / Arne: “Those crates contain the difference between service and
  improvisation. We bring them home intact.”
- Dispatch fallback: “Secure the relay and protect the loading stand until the
  transfer closes.”

**Field exchange — transfer begins**

- Practical / Teodor: “Weight is moving. Hold the near approaches; do not chase
  noise beyond the perimeter.”

**Aftermath: The parts that arrived**

The transfer releases focused emitters from existing tender stock. If secured,
the sealed cabinet adds burst optics and one workshop day credit. No factory
has begun making roots again, and no local shop can replace every advanced
part. A compatible local weapon may be the professional choice when it returns
a machine to service.

## A2 — Custody Posts

**Why this battle happens:** Cutbank's two local records contradict the Compact
archive. The Authority needs both intact before it can extend the warrant.

**Why it opens A3:** Comparing the posts reveals service entries and living
witnesses at Sarn, whose registry can explain the discrepancies.

**Briefing**

Secure both custody posts and hold them while the Authority copies their
records. The formal avenue offers clean range and exposes the lance to both
service streets. Keep the detachment mutually supporting and expect rebuilt
defenders through the side approaches. Damage to the posts delays the account.

**Opening exchange**

- Lead / Petra: “Two posts, broad axis. We take them as one formation, then
  close the side streets.”
- Observer / Silas: “The records disagree before we have touched either. That
  is what we are here to measure.”
- Dispatch fallback: “Secure both Cutbank custody posts for copying.”

**Field exchange — first local counterattack**

- Impulse / Arne: “They are attacking an official record site.”
- Practical / Teodor: “They think it is theirs. That does not change our task;
  it does explain the route they chose.”

**Aftermath: Two books, one district**

Both posts are copied. Their root lists contradict the old archive, but the
disputed entries include repair dates and names of people still working at
Sarn. The Authority calls the differences false claims. The detachment now has
to secure the registry that can show how they were made.

## A3 — Sarn Inventory

**Why this battle happens:** Sarn has called working machines to defend the
registry because its list determines which roots the Authority may remove.

**Why it opens A4:** The completed copy exposes a route of service readers that
can trace one recorded identity across several surviving machines.

**Briefing**

Protect the registry while the evidence team copies its inventory. Cover the
workshop street and freight entrance; locals will approach from both. The record
matters more than salvage. Hold the site through the transfer and preserve
enough of the detachment to follow what it reveals.

**Opening exchange**

- Observer / Silas: “The windows are occupied by fitters, not clerks. The
  inventory has already changed their working day.”
- Impulse / Arne: “They placed machines around a disputed registry. We answer
  the disposition they chose.”
- Dispatch fallback: “Protect the Sarn registry until the inventory copy is
  complete.”

**Field exchange — transfer halfway complete**

- Lead / Petra: “New movement on the workshop street. Keep the evidence team
  covered.”
- Practical / Teodor: “Those machines came off active racks. This list is not
  describing a museum.”

**Aftermath: The cost of an inventory**

Sarn's registry is copied under Tender control. The foundry committed working
machines because the list determines which of them may leave. Its records reveal
a chain of service readers. Following that chain can establish whether one
serial describes one surviving root or several.

## A4 — Root Exchange

**Why this battle happens:** The reader network is the only surviving path from
the altered paperwork to the physical roots it describes.

**Why it opens A5:** The final reader points to Blackglass, where replacement
plates, lift manifests and receipts can show who copied the serials and why.

**Briefing**

Take two machines no heavier than 100 tonnes combined. Visit the readers in
sequence along the terrace route and remain at each only until its record is
keyed. Patrols may be bypassed. Destroying them does not complete the warrant.
The upper platforms are exposed; the lower service track is slower and screened.

**Opening exchange**

- Lead / Petra: “Four readers, one route. We record them in order and leave no
  gaps for either side to explain away.”
- Practical / Teodor: “Two machines. If the patrol turns, use the lower track.
  Pride has no line item.”
- Dispatch fallback: “Key the service readers in sequence. Patrol destruction
  is not an objective.”

**Field exchange — third reader keyed**

- Observer / Silas: “Same identity, different rebuild dates, simultaneous
  service calls. The number travelled. The roots did not.”
- Impulse / Arne: “Then the account is counterfeit.”
- Observer: “The account is altered. Blackglass may tell us the purpose.”

**Aftermath: Borrowed numbers**

The reader chain shows workshops sharing the least-disputed serials among
different surviving roots. They copied records, not machines. The Authority
sees fraud; the yards describe the paperwork that kept pumps, haulers and
walkers working after the Foundry Winter. Blackglass holds the receipts.


## Continued script

Missions A5-A8 and both endings continue in
[AURELIAN_SCRIPT_A5_A8.md](./AURELIAN_SCRIPT_A5_A8.md).
