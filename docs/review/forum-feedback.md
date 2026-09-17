# First forum feedback — 18 September 2026

## Sources and response

- [Belcroft's Linux enquiry](https://itch.io/post/17344734) asked whether a Linux version was available. [Reply posted](https://itch.io/post/17367594): “Thanks for asking! There are currently no plans for a Linux version.” No Linux implementation was added.
- [u_capricorn_studioz's onboarding suggestion](https://itch.io/post/17352467) proposed a recommended first-mission loadout so players could learn deployment before weapon customisation. This was an organic suggestion, not a completed playtest or a reproduced report of player failure. The change below addresses that suggestion; its effect on first-time player comprehension still needs external feedback.
- Implementation reply URL: **pending hosted release verification**.

## Change

The first campaign deployment now opens **A team to start with** for either faction. It shows actual paired pilots, equipped mechs, weapon artwork, ammunition and mission tonnage. Unmodified starting Prime loadouts explain that the player can deploy without refitting. Edited designs and saved variants instead show their current equipment with matching copy.

**Use recommended team → field briefing** previews and applies the same existing automatic roster selection. The preview operates on a clone; launch saves that prepared snapshot before entering the briefing. It does not reset designs, grant equipment or spend credits. Missing ammunition, invalid equipment, damage and an empty team prevent recommended deployment and explain what needs attention.

**Customise team** opens the existing preparation workspace, and every recommended machine has an optional **Mechlab** action. Mechlab changes remain visible on return. Closing and reopening preparation restores the overview; after the first mission outcome, normal preparation resumes. No simulation rules or equipment statistics changed in this feedback patch.

## Visual evidence

Both captures were opened and inspected. The overview gives the recommendation and next action priority while retaining optional customisation. Focused browser evidence also covers 1440-, 1280- and 390-pixel layouts without horizontal overflow.

- [Before: full preparation workspace](forum-feedback/before-preparation.png)
- [After: first-deployment overview](forum-feedback/after-preparation.png)

## Verification

- **34 focused browser checks passed**, with no page errors: both factions, recommended team deployment, exact pilot/equipment matching, optional customisation, Mechlab return, a named edited variant surviving reload and deployment, and a controlled completed-mission fixture suppressing the overview. The fixture is not a claim of a new complete campaign playthrough.
- **3,556 fast tests passed** across 447 files, including seven new recommendation checks. Typecheck and lint passed.
- Hosted production build and self-contained build passed. The standalone HTML is approximately **7.19 MB**.
- Offline smoke passed: embedded artwork/fonts, all 16 mech dossiers, archive reload, campaign refit, contract and deployment; zero external HTTP requests or page errors.
- **1,295/1,295 full browser playthrough checks passed**. The 34 new checks passed in their separate focused run and were then wired into the full runner for future CI. The running full suite had already loaded before that wiring, so this run reports the existing 1,295 checks, not a combined total. Existing first-deployment journeys explicitly opt into custom preparation where needed.

## Publication record

- Release commit: **pending**.
- Hosted itch.io upload and live verification: **pending**.
- Onboarding suggestion reply: **pending**.

Keep the existing Ironmuster project, Public visibility, optional donations and generative-AI disclosure. Replace the playable browser upload and current offline edition only after release checks are complete.
