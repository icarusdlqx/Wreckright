# Combat sound preview

[Before](combat-preview-before.wav) · [After](combat-preview-after.wav)

Both files are 27.9-second stereo WAVs rendered from the actual Web Audio voices, at equal settings, without normalization. Each weapon family plays Linewrought first, then Aurelian. They finish with terrain footfalls, part loss, ammunition rupture and terminal destruction/landing. These are presentation effects only; simulation and balance are unchanged.

The comparison baseline is the effects source from `f6b6d6e`. The reusable renderer is `tests/e2e/audio-weapons-render.mjs`; set `AUDIO_MUSIC=1` to include the actual theme and `AUDIO_SEED` to select a repeatable noise stream. Set `BASE_URL` to a running local development server. Full 31-case recordings include the saturation checks after the shorter audition excerpt.

## Measured validation

| Render | Peak | Clipped samples |
|---|---:|---:|
| Before, effects | 1.247 | 18 |
| After, effects | 0.878 | 0 |
| After + music | 0.949 | 0 |
| After + music, seed 7721 | 0.994 | 0 |

Each complete render includes 31 cases. Extreme volleys offer six ordinary weapon voices and the two reserved destruction/landing voices. Stereo checks pan those voices toward the loudest music channel and inspect both channels. Music tests decode the three shipped Ogg stems and use the real maximum battle gain functions; the measured loudest phase-aligned passage is aligned with the pressure transient. The two recorded noise seeds passed without nonfinite or clipped samples. This is measured rendering evidence, not a claim of subjective listening review.

Every weapon offers exactly one bus admission; no voice exceeds 17 finite sources or one second. Terminal effects retain reserved admission and landing timing. Forty-three focused identity, lifecycle, visibility, stress, spatial and firing-mode tests passed, plus typecheck and scoped lint.

## Preview timeline

| Start | Sound |
|---:|---|
| 0.2s | linewrought-tracer |
| 1.5s | aurelian-tracer |
| 2.8s | linewrought-missile |
| 4.1s | aurelian-missile |
| 5.4s | linewrought-slug |
| 6.7s | aurelian-slug |
| 8.0s | linewrought-beam |
| 9.3s | aurelian-beam |
| 10.6s | linewrought-pulse |
| 11.9s | aurelian-pulse |
| 13.2s | linewrought-bolt |
| 14.5s | aurelian-bolt |
| 15.8s | linewrought-flame |
| 17.1s | aurelian-flame |
| 18.4s | linewrought-step-road |
| 19.2s | linewrought-step-rough |
| 20.0s | linewrought-step-water |
| 20.8s | aurelian-step-road |
| 21.6s | aurelian-step-rough |
| 22.4s | aurelian-step-water |
| 23.2s | part-loss |
| 24.2s | ammunition-rupture |
| 25.5s | terminal-and-ground-impact |

Source tests: `effects-tests.log`. Final audio captures: `render-final.log` and `combat-sound-*.json`.
