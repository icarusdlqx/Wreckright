# Carry the Dawn

Original Wreckright theme, composed and synthesized for this audio upgrade on 2026-09-10.

[Listen to the standalone mix](Carry-the-Dawn.mp3).

## Musical design

The company call rises by a fifth, climbs through two shorter notes, then answers with a falling held phrase. Its first appearance uses a mallet tone; the horn-like voice takes over as the arrangement grows. Warm sustained strings, a plucked bass and ringing metal keep the march connected to the game's salvaged machines and their pilots.

- F minor, 104 beats per minute, four beats per bar.
- Thirty-two bars, approximately 73.846 seconds per loop.
- Bars 1–8 introduce the call; 9–16 state the main theme; 17–24 create space for its answer; 25–32 return with the lower horn doubling the lead.
- The Ironwork layer uses unevenly spaced plucks, low drums and metallic backbeats.
- The Monolith layer uses precise high arpeggios, clipped percussion and cleaner resonances.

The three runtime stems share their exact sample length and harmonic progression. The stereo core carries melody, bass and harmony; the two mono arrangement layers share its timing. The game crossfades faction colour and builds rhythmic weight with battle intensity. Playback speed does not change the musical tempo or pitch. Circular room tails carry across the loop join; the standalone audition has its own opening and closing fades.

## Source and reproduction

All notes, instrument envelopes, synthesis and arrangement are retained in:

- `tools/audio/score-composition.mjs`
- `tools/audio/score-instruments.mjs`
- `tools/audio/render-score.mjs`

Run `node tools/audio/render-score.mjs` with Node and ffmpeg available to render the 32 kHz PCM masters, the three bundled Ogg/Opus stems and the standalone MP3. No npm package, music service, sample library, soundfont or external recording is needed. Neither the composition nor its synthesis uses a reference song.

The compressed asset hashes are registered in `docs/asset-provenance.json`. This record documents the source of the music without assigning the game's audio assets the software's licence. Runtime sound effects remain procedural Web Audio voices, with their source and timing retained in the repository.
