# First forum feedback — 18 September 2026

## Sources and response

- [Belcroft's Linux enquiry](https://itch.io/post/17344734) asked whether a Linux version was available. [Reply posted](https://itch.io/post/17367594): “Thanks for asking! There are currently no plans for a Linux version.” No Linux implementation was added.
- [u_capricorn_studioz's onboarding suggestion](https://itch.io/post/17352467) proposed a recommended first-mission loadout so players could learn deployment before weapon customisation. This was an organic suggestion, not a completed playtest or a reproduced report of player failure. The change below addresses that suggestion; its effect on first-time player comprehension still needs external feedback.
- [Implementation reply posted](https://itch.io/post/17369872). It describes the tested change and explicitly says that the upload is still pending; it does not claim the update is live.

## Change

The first campaign deployment now opens **A team to start with** for either faction. It shows actual paired pilots, equipped mechs, weapon artwork, ammunition and mission tonnage. Unmodified starting Prime loadouts explain that the player can deploy without refitting. Edited designs and saved variants instead show their current equipment with matching copy.

**Use recommended team → field briefing** previews and applies the same existing automatic roster selection. The preview operates on a clone; launch saves that prepared snapshot before entering the briefing. It does not reset designs, grant equipment or spend credits. Missing ammunition, invalid equipment, damage and an empty team prevent recommended deployment and explain what needs attention.

**Customise team** opens the existing preparation workspace, and every recommended machine has an optional **Mechlab** action. Mechlab changes remain visible on return. Closing and reopening preparation restores the overview; after the first mission outcome, normal preparation resumes. No simulation rules or equipment statistics changed in this feedback patch.

## Visual evidence

The local before/after captures and the live hosted capture were opened and inspected. The overview gives the recommendation and next action priority while retaining optional customisation. Focused browser evidence also covers 1440-, 1280- and 390-pixel layouts without horizontal overflow.

- [Before: full preparation workspace](forum-feedback/before-preparation.png)
- [After: first-deployment overview](forum-feedback/after-preparation.png)
- [Live itch.io: first-deployment overview](forum-feedback/hosted-first-drop.png)

## Verification

- **34 focused browser checks passed**, with no page errors: both factions, recommended team deployment, exact pilot/equipment matching, optional customisation, Mechlab return, a named edited variant surviving reload and deployment, and a controlled completed-mission fixture suppressing the overview. The fixture is not a claim of a new complete campaign playthrough.
- **3,556 fast tests passed** across 447 files, including seven new recommendation checks. Typecheck and lint passed.
- Hosted production build and self-contained build passed. The standalone HTML is approximately **7.19 MB**.
- Offline smoke passed: embedded artwork/fonts, all 16 mech dossiers, archive reload, campaign refit, contract and deployment; zero external HTTP requests or page errors.
- **1,295/1,295 full browser playthrough checks passed**. The 34 new checks passed in their separate focused run and were then wired into the full runner for future CI. The running full suite had already loaded before that wiring, so this run reports the existing 1,295 checks, not a combined total. Existing first-deployment journeys explicitly opt into custom preparation where needed.

## Publication record

- Release implementation: `590888a` on `codex/forum-feedback`, pushed to the existing GitHub repository. [Remote CI](https://github.com/icarusdlqx/Wreckright/actions/runs/35251497737): all four jobs succeeded (quality/builds, simulation, browser playthrough and production gate). Subsequent commits record release evidence only.
- **Published and verified:** [Ironmuster](https://onlatentstates.itch.io/ironmuster), existing project `4981536`, version `2026.09.18-590888a`.
- Official Butler 15.31.0 authorised with the user's explicit approval. Future releases can update the same `browser` and `offline-browser` channels. Credentials remain in Butler's local credential store and are not included in the repository or release bundle.
- Playable browser channel: upload `19281987`, build `1989948`. Observed live iframe: `https://html-classic.itch.zone/html/19281987-1989948/index.html?v=1789686687`.
- Offline channel: upload `19282032`, build `1989953`. Public download label: **Ironmuster — Offline browser edition (18 September 2026).html**, 7.1 MB. This is a self-contained HTML download, not a Linux executable.
- Older uploads and the duplicate classic uploads remain hidden, not deleted. Public visibility, optional donations and generative-AI disclosure are preserved.
- The public description now explains the ready-equipped first deployment and optional Mechlab. Existing written-feedback instructions remain visible.
- Independent hosted-artifact verification: all seven local JS/CSS entry assets exactly match the tested ZIP. Hosted HTML differs only by the official itch.io `htmlgame.js` script appended by the host. The public page, active download and description were separately verified in the authenticated browser.
- Live UI smoke: a new Regular Linewrought company opened the first-mission overview at `205/205t`, proceeded directly to the field briefing, and deployed Kessa Vale/Gadfly, Dorn Hess/Bulwark, Marek Sud/Gadfly and Ilse Brant/Cairn. No browser error logs. This verifies the hosted deployment path, not a full campaign playthrough. The unattended smoke battle later reached its normal time limit without any combat orders.
- Linux reply: https://itch.io/post/17367594. Onboarding reply: https://itch.io/post/17369872. The initial onboarding reply accurately said the tested build was awaiting upload; a live-status edit is being attempted after publication.

GitHub backup remains on `codex/forum-feedback`; `main` was not merged or redeployed as part of this itch.io update.
