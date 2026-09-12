# Roads We Keep

Original Wreckright theme, composed and synthesized for the September 2026 command-deck and MechBay update.

[Listen to the standalone mix](Roads-We-Keep.mp3).

## Musical design

The score is built around a short original company call and answer over a driving E-minor road rhythm. A picked, overdriven synth-guitar voice and live-feeling drums give it forward motion; a clean pulse layer gives Aurelian scenes their engineered precision. The melody, harmony, rhythm programming and instruments were created for Wreckright. No notes, recordings or samples were taken from the film track cited as a mood reference.

- E minor, 116 beats per minute, four beats per bar.
- Thirty-two bars, approximately 66.207 seconds per loop.
- Bars 1–8 establish the road groove; 9–16 state the call; 17–24 open into its answer; 25–32 bring the two phrases together.
- The Ironwork layer uses overdriven guitar, heavier kick and snare work, toms and loose metal accents.
- The Monolith layer uses a precise synth pulse, clipped percussion and cleaner high-frequency detail.

The three runtime stems share their exact sample length and one playback clock. Their mix produces four audible arrangements without overlapping or restarting tracks:

1. **Home — Open road:** the hook and rhythm arrive together at confident cruising intensity.
2. **Campaign — Long haul:** the score drops to a restrained pulse so planning and story remain clear.
3. **MechBay — Hot workshop:** mechanical rhythm and faction colour support fitting without dominating it.
4. **Battle — Full drive:** combat pressure raises the rhythm layer continuously while the visible force mix crossfades between Ironwork and Monolith colour.

Playback speed never changes the musical tempo or pitch. Muting preserves position, and route changes reuse the same synchronized sources to prevent doubling.

## Source and reproduction

All notes, instrument envelopes, synthesis and arrangement are retained in:

- `tools/audio/score-composition.mjs`
- `tools/audio/score-instruments.mjs`
- `tools/audio/render-score.mjs`

Run `node tools/audio/render-score.mjs` with Node and ffmpeg available to render the 32 kHz PCM masters, the three bundled Ogg/Opus stems and the standalone MP3. No npm package, music service, sample library, soundfont or external recording is needed.

The compressed asset hashes are registered in `docs/asset-provenance.json`. This record documents the source of the music without assigning the game's audio assets the software's licence. Runtime sound effects remain procedural Web Audio voices, with their source and timing retained in the repository.
