# Campaign canon and continuity

Status: approved writing source for C02-C12. This document settles the facts and
story logic for the revised Linewrought and Aurelian campaigns. Stable data IDs
remain unchanged unless a later migration explicitly versions them.

## Names

| Kind | Stable ID | Display name |
|---|---|---|
| Shared event | — | The Great Recall |
| Linewrought campaign | `border_dispute` | The Hands That Kept It |
| Aurelian campaign | `aurelian_recall` | A Clean Account |
| Local machine culture | `linewrought` | Linewrought |
| Expedition machine culture | `aurelian` | Aurelian Stock |

The Great Recall is an event, not either campaign's title. Use the campaign
titles on campaign selection, saves, route screens, chapter headers and the
journal. Existing save and content IDs are compatibility handles, not player
facing names.

## Facts that do not change

- About a century ago, the Aurelian Compact abandoned Tessell. The Aurelian
  Continuance inherited its surviving records and obligations.
- The Continuance has failing civil-defence machines in other settlements. Its
  need for working roots is real, finite and urgent, though that need does not
  settle who should bear the cost.
- The General Reversion Order claims inherited walker roots: reactor cradles,
  keels and control lattices. It does not claim Tessell, its people, or every
  locally made component attached to a root.
- No one can manufacture a new root after the Foundry Winter. Tessell can
  rebuild almost every surrounding system, which is why its walkers remain in
  service.
- A root reader identifies records and service history. It cannot remotely
  start, stop, steer or seize a machine.
- Tessell's workshops copied and shared the least-disputed serial records among
  several surviving roots. The Authority calls this counterfeiting. The yards
  call it the paperwork that kept pumps, haulers and defence walkers running.
- Linewrought and Aurelian weapons use compatible physical mounts. Cross-culture
  fitting remains possible. Cooling, ammunition feeds, calibration and scarce
  replacements create the trade-offs.
- The Ironmuster Code is Tessell's field custom: at dusk the holder of the ground owns
  recoverable wreckage, and ejected pilots are allowed home. It limits endless
  reprisals without making a battle bloodless or legalising every seizure.
- The Recall Authority operates through one custody tender and contracted local
  compliance forces. This is a bounded repossession expedition, not an invasion
  fleet.
- Barrow's surviving documents support two lawful dispositions: export roots
  under the Continuance warrant, or record Tessellan workshops as local
  stewards with maintenance obligations. Neither choice creates more roots or
  erases the needs of the other settlements.

## Moral frame

Neither faction owns the truth by default. The Continuance can have a lawful
claim and still impose an unjust cost. Tessell can have maintained the machines
for generations and still possess altered records. Compliance contractors may
profit from escalation, but they are not a secret third power and do not
replace the conflict between the two legitimate readings.

The two campaigns observe the same sequence of public events from different
routes. They are alternative accounts rather than simultaneous save-state
histories. Shared locations and documents must agree. A result may change what
the commander knows or controls, but cannot change the settled facts above.

## Campaign identities

### The Hands That Kept It

The player begins with four repaired machines named as property in somebody
else's ledger. The campaign asks a workshop company to survive, rescue its
people, keep repair capacity alive, face superior equipment and finally accept
responsibility for a record that can protect or endanger the district.

Its verbs are find, salvage, flank, rescue, protect, restore and choose. Its
emotional progression is precarity, solidarity, justified anger and
responsibility. Victory means the company gains enough power to make a choice;
it does not prove every local claim correct.

### A Clean Account

The player begins with serviced machines, a lawful warrant and confidence that
precision will settle the work quickly. Each completed inventory reveals more
people inside the account. The final duty is to interpret the warrant after the
commander understands both outcomes.

Its verbs are survey, secure, coordinate, contain, preserve and decide. Its
emotional progression is confidence, friction, doubt and accountable command.
Victory means completing a defensible disposition; it does not require the
crew to agree or the Continuance's need to disappear.

## Route logic

The revised main routes contain eight playable operations including an ending.
Optional operations add equipment, repair relief, evidence or context. They
never contain the only fact needed to understand an ending and never block the
main route.

```text
LINEWROUGHT
First Notice -> The Quiet Claim -> Keep the Gantries -> First Attestation
             -> Broken Code -> The Cold Yards -> Manifest Key
             -> Take the Manifest OR Burn the Manifest

Optional postings: The Missing Trail, Custody Posts, The Causeway,
Cutbank Ledger, Blackglass Attestation
```

The Missing Trail may be offered after First Notice and adds intelligence to
The Quiet Claim, but the rescue must also be reachable directly. C02 must not
retain its current hard prerequisite on the survey. Custody Posts leads to The
Causeway and Cutbank Ledger as a local contract branch. Blackglass Attestation
opens after Broken Code. All optional branches close cleanly when the
campaign ends.

```text
AURELIAN
First Warrant -> Custody Posts -> Sarn Inventory -> Root Exchange
              -> Quarry Receipt -> Conduit Injunction -> Barrow Warrant
              -> Export Under Seal OR Countersign Stewardship

Optional postings: The Unbroken Chain -> Under Civil Seal
```

The Unbroken Chain and Under Civil Seal offer scarce tender equipment and
logistical context. First Warrant must still open Custody Posts directly.

## Causal chain

Linewrought clears Marker Eleven because it holds the title rolls naming local
machines. Those records expose an isolated recovery crew; bringing the crew
home exposes the working gantries to attack. Keeping the gantries alive gives
the company the repair capacity to confront an Aurelian claim detail. That
battle reveals Kestrel's escalation and leads to an Ironmuster Code violation at
Sarn. Securing the victims' recovery preserves evidence of the violation but
reveals the western yards have lost power. Restoring the switching position
recovers an address for Barrow's manifest. Opening Barrow then puts the master
record within reach and creates the final choice.

Aurelian clears its landing approach so the custody tender can operate. The
next warrant secures Cutbank's contradictory records. Sarn's registry explains
that the discrepancies form a service network rather than isolated clerical
errors. The reader trail shows serials were shared; Blackglass receipts show
who made the plates and which working yards depended on them. The live conduit
proves the disputed roots still support public industry. Barrow holds both the
master warrant and local compact, allowing the commander to choose between two
lawful dispositions with full knowledge of their cost.

## Crew continuity

Starting pilots keep their current stable IDs, portraits, skills and combat
traits. Dialogue develops the existing characters; it does not change stats.

| Pilot ID | Campaign beat |
|---|---|
| `kessa_vale` | Knows every Sarn repair habit; becomes willing to speak for the workshops. |
| `dorn_hess` | Uses dry survival humour; gradually asks who will look after the next crew. |
| `marek_sud` | Hears people in relay traffic and service patterns; protects quiet evidence. |
| `ilse_brant` | Knows the roads and pushes action; later measures what the company may destroy. |
| `petra_lindqvist` | Notices discrepancies first and states them without theatrics. |
| `silas_okonkwo` | Turns polished scepticism into explicit professional dissent. |
| `teodor_krysa` | Uses memories of earlier operations to make operational cost concrete. |
| `arne_gedde` | Defends technical excellence and duty sincerely, even when others disagree. |

Named lines are preferred colour, never compulsory exposition. At mission
start, choose a preferred speaker only when that pilot is alive, available and
deployed. Otherwise use another eligible line assigned to the same voice role,
then a neutral Dispatch line. A pilot who is injured, absent or dead cannot
speak as though present. Essential facts always appear in the briefing,
objective text or journal.

Use four voice roles for fallbacks:

- **Lead:** frames the immediate task. Preferred Kessa or Petra.
- **Practical:** reads terrain, damage or service conditions. Preferred Dorn
  or Teodor.
- **Observer:** identifies records, routes and contradictions. Preferred Marek
  or Silas.
- **Impulse:** presses or contests the decision. Preferred Ilse or Arne.

Story radio yields to combat warnings. Each mission may use one opening
exchange, one contextual exchange after a real trigger, and one short
aftermath. Do not queue a missed story line after the tactical moment has
passed.

## Terms and voice

Define **root** once as the inherited reactor cradle, keel and control lattice
inside a walker. Define **the Ironmuster Code** once as Tessell's dusk rule for wrecks
and surviving pilots. Thereafter use the terms without repeated exposition.

Linewrought speech names places, people, jobs and visible machine conditions.
Aurelian dispatch names clauses, records, custody stages and measured risk.
Both groups speak plainly under fire. Avoid speeches during combat, prophetic
villains, modern legal jargon and claims that a ledger controls a machine.

Use “Aurelian Stock” for the machines and expedition culture, “Aurelian
Continuance” for the successor government, “Recall Authority” for the body
that issued the order, and “Custody Tender” for the field organisation. Use
“Linewrought” for the local machine culture and player company, not every
resident of Tessell.

## Ending truths

### Linewrought: Take the Manifest

The company preserves the master record and becomes its armed keeper. Tessell
gains evidence and a negotiating voice; the Authority gains no remote control
and cannot simply pretend the workshops never maintained the roots. Keeping
the document also makes the company responsible for protecting access to it.

### Linewrought: Burn the Manifest

The company destroys the strongest seizure ledger. The workshops gain time and
control, while certified service histories and proof of local stewardship burn
with it. This is a deliberate sacrifice of shared history, not a clean act of
liberation.

### Aurelian: Export Under Seal

The commander executes the warrant and sends roots to settlements whose civil
defence machines are failing. Tessellan yards close or contract without the
machines they kept alive. The account is lawful and complete, and the cost is
recorded rather than denied.

### Aurelian: Countersign Stewardship

The commander uses Barrow's alternate reading to leave the roots on Tessell
under named maintenance obligations. The Continuance's shortages remain. The
detachment returns with a lawful record and a decision its own officers must
defend.

## Implementation guardrails

- Preserve every node and mission ID listed in the faction scripts. C02 owns
  route versioning and save migration.
- A mission outcome must describe something the supported objective system can
  establish. Recovery is a protected fixed zone; a “convoy” cannot move unless
  a later task adds that mechanic.
- No required objective depends on a named pilot, a specific purchased chassis
  or completion of optional work.
- Do not require annihilation after the stated custody, transfer or recovery
  objective is complete.
- Maps retain their geographic identity regardless of player faction. Later
  visits may show authored aftermath, but not contradictory landmarks.
- Four endings are mutually exclusive within their campaign and remain
  understandable without completing optional nodes.
