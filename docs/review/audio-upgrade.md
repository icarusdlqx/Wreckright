# Wreckright audio identity

The original theme, **Roads We Keep**, now connects the main menu, campaign, MechBay and combat. Weapon families retain their own sonic identity in both factions. Settings offers separate Music and Sound effects switches, with saved volume trims and master mute.

[Theme audition](../audio/Roads-We-Keep.mp3) · [Composition and synthesis source record](../audio/ROADS_WE_KEEP.md) · [Before/after combat audition](audio-upgrade/effects/README.md) · [Settings screenshots and checks](audio-upgrade/controls/README.md)

## Music

The replacement 32-bar, 116 BPM E-minor theme, **Roads We Keep**, uses an original call and answer over a driving road rhythm, picked synth guitar, bass and live-feeling drums. A rougher guitar-and-drum layer gives Linewrought its industrial character; a precise pulse and clipped percussion give Aurelian its cleaner character. Home, campaign, MechBay and battle each receive a distinct arrangement from the synchronized stems.

Three original Ogg/Opus recordings share a 66.207-second loop and one start timestamp. Faction and intensity transitions automate their gains rather than changing pitch, tempo or source count. Only information already visible to the player influences faction colour. Pause preserves the current battle intensity. Muting retains musical position. The first player gesture starts audio; strategic route changes preserve the unlocked context. Abandoned loads cannot restart music after a route closes.

The composition, instrument code and reproducible encoder command are retained in `tools/audio/`. No external music, samples, soundfont, service, runtime URL or new package was introduced. Runtime files and hashes are recorded in the asset provenance register. The standalone build embeds all three stems and decodes their bytes locally.

## Sound effects

Cannons have a percussive report and recoil; missiles have an exhaust rush; gauss weapons have a capacitor-and-impact character. Lasers hold a tonal core, pulse weapons fire a short sequence, particle weapons have a pressure burst, and flame weapons have a sustained hiss. Faction colour is applied after the weapon family is selected, fixing Aurelian ballistic and missile weapons previously sounding like energy weapons.

Footfalls, water steps, landing, part loss and terminal collapse have more weight. Impact stereo placement is retained. Every weapon still requests one admitted voice; each voice uses at most 17 finite sources. Existing visibility, priority and terminal-effect timing rules remain in place.

Actual Web Audio renders cover 31 cases, including extreme simultaneous weapons and destruction. The comparison captured 18 clipped samples before the changes and none afterward. Two combined renders with the shipped theme also had no clipped or nonfinite samples; their measured stereo peaks were 0.949 and 0.994. These checks establish bounded headroom for the exercised cases, not every possible live sound combination. Audio was rendered and analysed; a subjective listening review was not available during implementation.

## Player controls

Settings → Sound provides Music and Sound effects switches. Sound effects includes combat, environment, interface and radio. Volume and advanced mix retains the four volume sliders and Quiet mode. Master mute silences both channels without overwriting either choice. Switching a channel back on restores its previous volume. Reset mix also preserves the on/off choices. Legacy saves default both new switches to On and retain the existing mute key.

The battle, mechbay and campaign shortcuts now say **Mute all** or **Unmute all**, making their action clear even when only one channel is enabled.

## Validation

| Check | Result |
|---|---|
| TypeScript and full ESLint | Passed |
| Fast suite | 3,496 tests across 433 files passed |
| Final support and strategic cleanup fixtures | 12 passed |
| Production and standalone builds | Passed; standalone file 7.17 MB |
| Real playback against the built preview and offline standalone | 15 passed |
| Full game-wide browser journey | 1,300 / 1,300 checks passed in one uninterrupted run |

Focused checks cover real browser decoding, phase-aligned starts, independent bus muting, saved preferences, repeated route teardown, cancellation during decoding, combat voice admission, spatial placement and reserved destruction effects. Before/after desktop and phone settings captures were inspected. The standalone playback check disables networking and asserts zero external requests, nonzero decoded music, matching loop lengths and music-switch behavior using native browser audio nodes.

The [full browser log](audio-upgrade/full-playthrough.log) records the complete clean run. Browser validation used isolated headless Chromium. Other browser engines and physical audio output were not exercised during this pass.

The authored stem renders contain finite PCM with identical lengths and loop-join changes below the ordinary high-percentile sample changes in each recording. Detailed measurements are retained in [score-render.json](audio-upgrade/score-render.json) and [score-waveform-check.json](audio-upgrade/score-waveform-check.json).

Simulation, chassis/weapon statistics, campaign balance, save formats and dependencies are unchanged. This is a local build; no remote release was made.
