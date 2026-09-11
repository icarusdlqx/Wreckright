# Release polish: interface, campaign journey and combat feedback

This pass covers release tasks 4–6 without changing simulation rules, authored balance data, the save format or dependencies.

## Interface consistency and accessibility

The campaign header now states whether progress is **Saved locally** or **Session only**. Disabled and consequential controls across campaign selection, preparation, the mech bay, stores and save management now explain their state through native help text. The deployment launch control also points assistive technology to the same manifest problem shown on screen.

The automated interface review covers 17 states at 1280×720 and a 640-pixel reflow that approximates enlarged browser text. It checks visible control names, clipped labels and horizontal page overflow. Result: **53/53 checks passed**.

| Review point | Earlier reference | Current evidence | Result |
| --- | --- | --- | --- |
| Campaign hierarchy | [Earlier campaign screen](../economy-command-flow/before-campaign.png) | [Campaign operations](campaign-operations.png) | Save state is visible beside company status; the compact navigation remains intact. |
| Save and recovery | [Earlier load screen](../campaign-saves-clear-deployment/load-desktop.png) | [Save library](campaign-save.png) | Clear save, load, export, import and recovery language. |
| Preparation workspace | [Earlier preparation screen](../pilot-command-workspace/preparation/1280.png) | [Current machine step](preparation-machines.png) | Selection, readiness and disabled states use consistent controls and terms. |
| Enlarged text / narrow view | — | [640-pixel reflow](preparation-200-percent.png) | No clipped control labels or horizontal page overflow. |

The battle HUD was deliberately left compact during this pass.

## Campaign preparation, saving and recovery

The cross-browser journey runs in isolated Chromium and Firefox profiles. Result: **182/182 checks passed**. It covers:

- faction and difficulty selection, lance preparation, pilot assignment and deployment;
- unsaved mech-bay drafts, cancelling a refit, saved weapon configurations and ammunition;
- named campaign saves, reload, export/import and restart recovery;
- invalid imports, unknown campaign identifiers, unavailable storage, delayed import and failed writes;
- both faction command flows through debrief, pilot progression, damaged-machine repair, waiting and the next mission.

Older campaign migrations remain covered by the fast automated test suite. Recovery paths retain the original bytes where possible and explain the next safe action on screen.

The complete headless release playthrough also passed **1,299/1,299 checks**, including both campaign routes, support services, sensor tracking, the mech bay, responsive layouts, separate music/effects controls and multi-tab audio ownership.

## Combat feedback and sound mix

The visual harness now discovers each design's authored weapon families instead of assuming every machine carries ballistic, energy and missile weapons. It adds a controlled five-mech engagement with distinct ballistic, missile and energy discharge, impact, limb loss, ammunition rupture, wreck smoke and accelerated playback.

| Moment | Evidence |
| --- | --- |
| Simultaneous discharge | [Five-mech volley](five-mech-discharge.png) |
| Distinct impacts | [Five-mech impacts](five-mech-impacts.png) |
| Part loss, ammunition rupture and wreck | [Five-mech damage](five-mech-damage.png) |
| Accelerated effects remain separated | [Four-times-speed sample](five-mech-accelerated.png) |

The harness captured 61 controlled frames with no runtime errors. Four five-mech frames trigger the diagnostic's conservative aggregate-bounds warning; manual inspection confirms the machines and the important combat effects remain readable in frame.

Field audio now reserves one voice for critical damage cues alongside two terminal-event voices. Heavy incoming fire can no longer let ordinary weapon chatter suppress ammunition explosions or other critical feedback. The offline Web Audio render produced **31 clips over 45.9 seconds**, with a peak of **0.878**, no clipping and no non-finite samples. The existing separate music and effects controls remain in place.

## Re-running the focused reviews

Start the local development server on port 5221, then run:

```sh
npm run verify:interface
npm run verify:campaign
BASE_URL=http://127.0.0.1:5221/ OUT_DIR=reports/release-polish/combat node tests/e2e/combat-motion-review.mjs
AUDIO_MUSIC=0 BASE_URL=http://127.0.0.1:5221/ OUT_DIR=reports/release-polish/audio node tests/e2e/audio-weapons-render.mjs
```

The generated reports stay outside version control. The selected evidence above is committed for review.
