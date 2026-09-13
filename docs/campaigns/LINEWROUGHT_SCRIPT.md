# The Hands That Kept It — campaign script

Campaign ID: `border_dispute`

Player culture: Linewrought

Main employer: Halloran Freight, with Sarn Foundry and Ridgeward Assembly
Arc: precarity → solidarity → justified anger → responsibility

This is the final writing source for the Linewrought campaign. Tonnage and map
assignments are design targets for later encounter work, not changes made by
this document.

## Opening

### Four names on a list

The notice arrives during a repair shift. The Aurelian Continuance claims every
surviving walker root left by its predecessor, including the four in your yard.
Halloran Freight offers a contract to reopen Marker Eleven before a compliance
company removes its title rolls. Your company accepts because those records
include your own machines.

You command Linewrought: local pilots, mismatched armour and guns the workshops
can keep supplied. A root is the inherited reactor cradle, keel and control
lattice inside a walker; no yard knows how to make another. Keep the company
solvent, bring crews home and decide which wrecks are worth rebuilding. The
first job is to clear the registry guard.

## Route and stable IDs

| Use | Node ID | Legacy mission ID | Final display name | Target place | Cap |
|---|---|---|---|---|---|
| Main L1 | `militia_raid` | `line_maintenance` | First Notice | `line_workshop_belt` | 205t / 4 |
| Optional | `marker_survey` | `marker_survey` | The Missing Trail | `line_recovery_cut` | 45t / 1 |
| Main L2 | `recovery_window` | `recovery_window` | The Quiet Claim | `line_recovery_cut` | 140t / 3 |
| Main L3 | `workshop_defence` | `workshop_defence` | Keep the Gantries | `line_workshop_belt` | 205t / 5 |
| Main L4 | `pass_skirmish` | `sealed_contact` | First Attestation | `ridge_pass` | 215t / 5 |
| Optional | `supply_line` | `base_capture_ridge` | Custody Posts | `aurelian_civic_exchange` | 195t / 4 |
| Optional | `causeway_push` | `causeway_crossing` | The Causeway | `causeway` | 205t / 5 |
| Main L5 | `foundry_sweep_node` | `rules_break` | Broken Code | `line_workshop_belt` | 220t / 5 |
| Optional | `cutbank_register` | `exchange_register` | Cutbank Ledger | `exchange_yard` | 205t / 5 |
| Optional | `blackglass_receipt` | `quarry_brakes` | Blackglass Attestation | `blackglass_quarry` | 220t / 5 |
| Main L6 | `shale_overwatch_node` | `conduit_breach` | The Cold Yards | `shale_steps` | 240t / 5 |
| Main L7 | `ridge_hold` | `depot_road` | Manifest Key | `barrow_archive` | 225t / 5 |
| Ending L8a | `depot_take` | `depot_take` | Take the Manifest | `barrow_archive` | 255t / 5 |
| Ending L8b | `depot_burn` | `depot_burn` | Burn the Manifest | `barrow_archive` | 255t / 5 |

The revised main path opens The Quiet Claim directly after First Notice. The
Missing Trail remains optional and changes only a small line in the rescue
briefing. The local Custody Posts branch opens after First Notice; The Causeway
and Cutbank Ledger follow it. Blackglass Attestation opens after Broken
Ironmuster. Optional work never gates L3-L8.

## L1 — First Notice

**Why this battle happens:** Kestrel Combine has locked Marker Eleven under a
Recall compliance contract. Halloran needs the title rolls copied before the
Authority takes them, and the player's own roots appear in the register.

**Why it opens L2:** The recovered pages identify a recent service signal from
a dismantling basin. It belongs to a repair crew trapped beside an unclaimed
walker cradle.

**Briefing**

Kestrel holds Marker Eleven and the road into it. Break the cordon, then secure
the registry long enough for Halloran to copy the title rolls. The straight
road is covered; the drainage lane west of the sheds reaches their flank. Keep
at least one machine working. The paper inside names all four of ours.

**Opening exchange — after deployment**

- Lead / Kessa: “Marker Eleven. I used to sign coolant deliveries at that
  door. Never thought I would have to take it back.”
- Practical / Dorn: “Front lane is made for their guns. West drain is made for
  ours.”
- Dispatch fallback: “Marker Eleven is ahead. Registry copy begins when the
  cordon is clear.”

**Field exchange — first sight of the west lane**

- Observer / Marek: “Tyre marks stop at the drain, but the bed is load-bearing.
  That is our way around.”
- Impulse / Ilse: “Good. Let them keep watching the pretty road.”

**Aftermath: The workshops answer**

Marker Eleven is copied. The rolls describe serials, but the margins hold
workshop names, repair dates and the people who kept those machines running.
One fresh reader entry points to a recovery cut west of Sarn. A crew there has
stopped answering. The company can reach them before Kestrel does.

Halloran also posts several local contracts. They can provide parts and proof,
but the company does not have to clear every notice before continuing.

## Optional — The Missing Trail

**Purpose:** A short, one-machine observation job teaches sensor use and rewards
restraint. It gives extra information and two ammunition isolation cases, not
permission to start the rescue.

**Briefing**

Two old readers overlook the western service road. Take one machine no heavier
than 45 tonnes, read both sites and copy the road ledger. The guard is watching
the paved route. You are being paid to find the missing crew, not to clear the
terrace.

**Opening exchange**

- Observer / Marek: “Readers only. If nobody fires, the record is cleaner.”
- Impulse / Ilse: “One light machine, two quiet stops. I can live with quiet.”
- Dispatch fallback: “Survey both readers and copy the road ledger. Contact is
  optional.”

**Field exchange — after the second reader**

- Observer: “The crew diverted into the recovery cut. Kestrel followed six
  minutes later.”

**Aftermath**

The route is confirmed without turning the terrace into another salvage field.
Halloran exchanges the copied ledger for two unopened ammunition isolation
cases. The rescue briefing now marks Kestrel's likely approach.

## L2 — The Quiet Claim

**Why this battle happens:** A Sarn repair crew and an unclaimed Prybar cradle
are trapped in a dismantling basin while Kestrel closes both exits.

**Why it opens L3:** The rescued fitters report that Kestrel traced their service
route to a working Sarn repair hall and is preparing to seize it.

**Briefing**

Get the fitters out. Secure the road-junction winch and protect the recovery
cradle while the lift runs. Bring no more than three machines and 140 tonnes.
Once the crew is clear, surviving guards are Halloran's problem. A service
cabinet across the channel is useful, but optional.

**Opening exchange**

- Lead / Kessa: “The cradle is boxed in below us. Winch first, then we make a
  roof over those fitters.”
- Practical / Dorn: “Three machines, two jobs. Keep the longest gun where it can
  see both.”
- Dispatch fallback: “Secure the winch, protect the cradle and hold both until
  the lift completes.”

**Field exchange — when the lift begins**

- Impulse / Ilse: “Cable is moving. They know we came.”
- Observer / Marek: “New traffic from the north road. Hold the cradle; do not
  chase it.”

**Aftermath: A crew brought home**

The cradle clears the cut with its fitters alive. They sign over a damaged,
unclaimed Prybar hulk and bring a warning: Kestrel followed the service trail
to Sarn's working gantries. The company has recovered people who can help
rebuild a machine. Now it must keep their workshop standing.

If recovered, the service cabinet contains a Canister Cannon. It is workshop
stock, separate from battlefield salvage.

## L3 — Keep the Gantries

**Why this battle happens:** Kestrel wants to shut Sarn's repair capacity before
the local companies can turn recovered wrecks into a defence force.

**Why it opens L4:** With the gantries operating, Halloran can trace and prepare
the first direct challenge to an Aurelian claim detail.

**Briefing**

Hold gantry control while Sarn clears the active repair racks. Kestrel can reach
the yard through the north freight gate or the southern service lane; both
approaches will be called before they arrive. A forward power kiosk can slow
the second wave if a scout reaches it. The workshop matters more than pursuit.

**Opening exchange**

- Lead / Kessa: “Those lights mean a night shift and a machine going home under
  its own power. We keep them on.”
- Practical / Dorn: “Two gates. Put armour between each gate and the glass.”
- Dispatch fallback: “Defend gantry control until the repair racks are clear.”

**Field exchange — second approach announced**

- Observer / Marek: “South traffic just went silent. That is not an empty road.”
- Impulse / Ilse: “Then call it early and let me meet it outside.”

**Aftermath: The lights stay on**

Sarn finishes its shift behind the company's guns. Recovered crews return to
the floor, and the yard banks repair time and supplier terms for the company.
A company can live off wrecks for a while. A district survives because someone
can still put them back together.

Halloran has located the first Continuance-sealed machine on the ridge road.
The next fight will test whether superior equipment is the same as superior
command.

## L4 — First Attestation

**Why this battle happens:** An Aurelian claim detail is escorting Kestrel's
attestation package to the Tender. If it reaches the pass, the first local roots
will be accepted for seizure without challenge.

**Why it opens L5:** Defeating the detail yields direct evidence of Kestrel's
orders and draws the contractor into violating the Ironmuster Code at Sarn.

**Briefing**

Bring the claim detail down and hold the pass. Its white-armoured machine has
better reach and cooling than our rebuilt line. Do not trade shots in the open.
The east shelf masks a flanking approach; pin the escort from cover, then close
the angle. Halloran waives its share of the first recoverable Aurelian Stock.

**Opening exchange**

- Impulse / Ilse: “There it is. Clean plates, clean sightline, nowhere to hide
  if we use their road.”
- Lead / Kessa: “Then we use Tessell's road. East shelf, together.”
- Dispatch fallback: “The claim detail controls the pass. Use the east shelf to
  break its firing line.”

**Field exchange — first Aurelian weapon impact**

- Practical / Dorn: “That emitter reaches exactly as far as advertised. Stop
  admiring it and move.”
- Observer / Marek: “Escort is turning late. Their machine is precise; their
  formation is not.”

**Aftermath: White armour in the yard**

The attestation is stopped. The Stock's precise emitters and factory-fit armour
are real advantages; so are the gaps the company found around them. Common
mounts will accept recovered Aurelian weapons, but the workshop must still pay
for cooling, calibration and replacements.

The captured orders send Kestrel to Sarn's freight sector. Their instruction is
to deny the company further salvage before dusk.

## Optional — Custody Posts

**Purpose:** Recapture local records intact and establish that the compliance
company is changing custody entries while the Authority advances.

**Briefing**

Kestrel holds two Cutbank custody posts. Take both and keep them intact while
Halloran's clerks copy the entries. Expect rebuilt defenders through the service
streets. The posts, not the wreck count, complete the job.

**Opening exchange**

- Observer / Marek: “Two posts, two versions of the same district. Let us keep
  both long enough to compare them.”
- Dispatch fallback: “Secure both custody posts for the records team.”

**Field exchange — after both posts are occupied**

- Lead: “Clerks are inside. Close the streets and give them the time.”

**Aftermath**

The two copies disagree on which roots entered Kestrel custody and when. One
entry points to the Causeway transfer; another points to Cutbank's older
exchange ledger. Both become optional postings.

## Optional — The Causeway

**Purpose:** Interrupt a contractor transfer and earn useful salvage without
turning the operation into a mandatory campaign gate.

**Briefing**

Kestrel is moving seized components across the causeway before Halloran can
challenge the custody entries. Take the relay, hold the crossing and break the
transfer detail. Ice narrows the obvious road; the lower bank gives lighter
machines another approach.

**Opening exchange**

- Impulse / Ilse: “They made a queue out of stolen parts. I can fix that.”
- Practical / Dorn: “Fix the relay first. Anger does not stop a truck.”
- Dispatch fallback: “Secure the causeway relay and stop the transfer detail.”

**Field exchange — relay secured**

- Observer: “Manifest is open. Half this cargo never reached a lawful seal.”

**Aftermath**

The transfer is stopped and its disputed components return to local stores.
The copied manifest strengthens Halloran's challenge, but Barrow remains the
only record broad enough to decide the Recall.

## Optional — Cutbank Ledger

**Purpose:** Add documentary context and a valuable local fitting reward. It
shows record alteration without proving every workshop serial legitimate.

**Briefing**

The old exchange house still holds Cutbank's pre-Recall ledger. Reach its
records room, keep the structure intact and hold the yard while the copy runs.
Kestrel would rather destroy the comparison than surrender it.

**Opening exchange**

- Observer / Marek: “Old paper, old hands, no convenient revisions. That is why
  they brought guns.”
- Dispatch fallback: “Secure the exchange records and preserve the building.”

**Field exchange — copy halfway complete**

- Practical / Dorn: “Fire team on the loading street. They are aiming past us
  at the records room.”

**Aftermath**

The ledger proves Kestrel altered several custody dates after receiving its
contract. It also shows gaps older than Kestrel itself. The evidence exposes
the contractor's conduct without simplifying a century of borrowed records.


## Continued script

Missions L5-L8 and both endings continue in
[LINEWROUGHT_SCRIPT_L5_L8.md](./LINEWROUGHT_SCRIPT_L5_L8.md).
