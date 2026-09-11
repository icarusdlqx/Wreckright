# Faction equipment, fitting identity and audio reliability

This build addresses overlapping music, silent energy batteries and Aurelian
stock fits that did not earn their deployment tonnage. It continues the local
campaign-save and compact-HUD build. No public upload or release is part of this
change.

## Player-facing changes

- One foreground game tab owns audio. Background tabs fade silent without
  changing the player's independent music/effects preferences. Deploy unlocks
  playback and brings in the marching battle arrangement immediately.
- Automatic heat safety schedules individual weapons and rotates waiting guns
  instead of permanently silencing an energy group. Weapon rows identify a
  temporary cooling pause. Manual groups, hold fire and alpha strikes retain
  their meaning.
- Sentinel, Halberd and Pallvault receive targeted premium stock configurations.
  All sixteen walkers have clearer role, strength and weakness descriptions.
  Chassis cooling traits are included in the bay's preview.
- Each bay diagram projects the actual chassis geometry. Weapon artwork and
  fitting boxes remain interactive, with the same drag/drop rules. The compact
  role brief explains the standard job and its main vulnerability.
- The wiki and Review's expandable weapon-position map show the actual loadout's
  equipment artwork, occupied/free boxes, weapon damage rate, range, heat and
  ammunition. Standard portraits are refreshed from the current game models.
  Multi-weapon mounts use real model bounds so stacked housings remain visible.

## Compatibility

Existing companies and saved custom designs keep their fitted equipment. The
new standard fits are available to fresh selections and Reset to stock. No
mount permission, slot capacity, chassis ID, weapon ID or save key was removed.
Older mixed Sentinel configurations remain valid and are explicitly retained as
mechanical test fixtures for ammunition, salvage and refitting behavior.

Old already-open browser tabs still run the old audio code until refreshed.
After updating, close extra old game tabs or refresh every open game tab once.
Subsequent tabs coordinate sound automatically. A player can still turn Music
off and retain Effects in Settings.

## Evidence

The reproducible combat audit and its limits are in
[faction-balance-evidence.md](faction-balance-evidence.md). These seeded automated
matches establish the equipment advantage under controlled conditions; they
are not human win-rate estimates or guarantees that a heavier force always wins.

Before/after screenshots, desktop/phone fitting checks, the complete visual
roster, audio ownership checks and offline audio render are under
`reports/faction-identity/` and `reports/audio-reliability/`. Testing uses isolated
headless browsers and does not take over the user's screen.

The final validation command outputs are recorded under
`reports/faction-identity/`: typecheck, lint, the complete fast test suite,
balance mirror gate, campaign acceptance, browser playthrough and both builds.
