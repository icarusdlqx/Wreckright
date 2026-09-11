# The illustrated main menu

The front page now puts four clear choices over an original view of Tessell:
**Learn Command**, **Start/Continue Campaign**, **Skirmish**, and
**Wiki · Story & mechs**. The archive is part of the game and returns to the
same menu when closed. It does not require starting or creating a company.

The previous page gave its small archive link less prominence than the three
game routes. Its two decorative 3D scenes also allocated graphics contexts before
the player entered the game. The new menu uses one locally bundled WebP, a
legible teal overlay, larger controls and a compact Settings button. Desktop,
phone and landscape layouts preserve the same routes and familiar save keys.
The recommended route still reflects training progress and existing companies.

The art follows Graphic Expedition's colourful terrain and the Linewrought
Ironwork language: patched orange-and-cream plating, exposed working machinery,
and a walker overlooking a valley crossing. The distant Aurelian walker uses a
paler finish. The [art record](art/TESSELL_CROSSING.md) contains the original
generation prompt, source master and runtime asset. The artwork is decorative;
all readable text and controls remain actual HTML. If the image fails to load,
the gradient background and every route remain usable. Reduced-motion and
forced-colour preferences are supported.

## Visual evidence

Before: [desktop](images/main-menu/before-desktop.png) and
[phone](images/main-menu/before-mobile.png).

After: [desktop](images/main-menu/after-desktop.png),
[phone](images/main-menu/after-mobile.png),
[small phone](images/main-menu/after-small-phone.png),
[landscape](images/main-menu/after-landscape.png), and
[phone settings](images/main-menu/after-settings-phone.png).

Offline: [illustrated menu](images/main-menu/after-offline.png) and
[an in-game mech dossier](images/main-menu/wiki-offline.png).

## Preview availability

The broken review links were caused by temporary development servers ending
with their task sessions. The [local preview service](LOCAL_PREVIEW.md) serves
the current production build on both previously shared addresses, 5219 and 5220.
It stays under the current user's launchd session, with explicit start, status,
stop and restart commands. It remains local to this computer.

## Verification

The focused browser review is `node tests/e2e/main-menu-review.mjs`.
`BASE_URL` selects a development or hosted preview; `SHOT_DIR` selects its
evidence folder. It checks visible menu routes, keyboard and small-screen
navigation, artwork failure, the archive round trip, and actual learning,
skirmish and campaign deployment. The full browser playthrough also checks the
new front page and its lack of initial WebGL allocations. The offline smoke
checks embedded artwork and fonts, all sixteen dossiers, article reload, refit
and battle deployment with zero external HTTP requests.

`HomeScreen.test.ts` covers fresh, active and completed training, stored
companies from both factions, and unavailable browser storage. Preview server
tests cover both-port binding, release headers, safe static paths, occupied
ports and project-specific lifecycle configuration. Final delivery evidence
also checks the actual launchd job and both live loopback addresses.

Verified locally on 2026-09-06: typecheck, lint, **3,046 fast tests**,
**833 full browser checks**, **24 focused production-menu checks**, both release
builds and the offline archive/refit/deployment smoke all pass. Before/after,
small-phone, landscape, Settings and offline images were inspected. The offline
checker uses the same supported ANGLE/SwiftShader configuration as the other
review browsers; decoding, visible artwork and the completed fade are checked
before screenshots. No simulation, mission or campaign tuning changed.
