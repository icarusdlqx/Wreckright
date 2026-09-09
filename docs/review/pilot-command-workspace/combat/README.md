# Pilot command dock visual review

The five-seat dock keeps pilot portraits and machine identification together, with the minimap on the left and commands plus essential selected-machine status on the right. The tall inspector is an explicit, keyboard-accessible disclosure. Speaking pilots receive a restrained highlight. Machine destruction does not imply pilot death.

Screenshots were captured and inspected at 1440×1000 and 1024×768 in a private headless browser. This is a controlled five-unit presentation fixture, not a completed mission. Disabled and ejected fixtures preserve their original positions and selection identity. Machine portraits identify the chassis and show its standard equipment; they do not preview the fitted weapons.

- [Desktop dock](pilot-dock-1440.png)
- [Laptop dock](pilot-dock-1024.png)
- [Optional details inspector](pilot-dock-inspector.png)
- [Disabled machines and ejected pilot](pilot-dock-casualties.png)
- [Speaking pilot](pilot-dock-radio.png)

Validation: final dock browser checks 10/10; focused UI/snapshot tests 38/38. An earlier integrated browser set passed 72/72 covering damage, Commander mode, radio, responsive layouts and target privacy. Final adjustments were the destroyed-machine zero integrity display, a maximum width for a one-unit card and focus-return verification.
