# Independent audio controls

Reviewed 10 September 2026 against the local development preview. All images were opened and visually inspected.

The shared Settings panel now offers separate Music and Sound effects switches. Their On/Off state is independent of the four volume trims; turning a channel back on restores its chosen volume. Sound effects includes weapons, movement, environment, radio and interface sounds. Master mute overrides both channels. The existing trims and dynamic range remain under **Volume and advanced mix**.

- [Before: phone](before-phone.png) is the existing prepublication reference, with all four sliders displayed immediately.
- [After: desktop](after-desktop.png) shows the two primary switches and collapsed advanced controls at a 1440 × 1000 viewport.
- [After: phone](after-phone.png) shows the same controls at a 390 × 844 viewport, without horizontal overflow and with reachable touch targets.

The before image shows the whole phone viewport; the after images capture the Settings panel itself. The phone reference and current desktop capture therefore have different framing.

## Verification

The dedicated headless journey in `tests/e2e/audio-channel-controls.mjs` passed all 12 checks; [results](checks.json) record each assertion. It uses real controls and route navigation, waits for the three authored looping music buffers to load and start, and inspects the instrumented Web Audio bus routing. It covers keyboard activation, saved non-default volumes, disabled states after reload, independent campaign and battle routing, master mute precedence, fixed node counts while switching, reset behavior and browser errors. These routing checks do not claim subjective audio listening quality.

The focused preference, mixer, Settings, spatial-audio and Home tests passed 38/38. TypeScript and scoped ESLint also passed. Missing legacy enable flags default to enabled without changing saved volume values, including zero; the legacy master-mute storage key remains authoritative.
