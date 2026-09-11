# Campaign environment kit

Campaign maps carry two independent presentation choices:

- `propTheme` describes the physical place: alpine, causeway, industrial or shale.
- `sceneryFamily` describes the people maintaining its constructed layer.

The terrain grid remains the sole authority for collision, movement, cover and
elevation. Scenery is deterministic visual dressing and never changes those
rules.

## Linewrought workshop

Use `"sceneryFamily": "linewrought_workshop"` for active repair yards,
improvised depots and infrastructure the Linewrought have kept operating.

- ochre structural plates and petrol-teal roofs
- cobalt replacement panels and rust-orange patched modules
- uneven stacks, pipe skids and small warm work lights
- repaired utility rather than abandoned ruin

The low yard fittings belong on rough ground and leave roads, firing lanes and
objective markers visually clear. Industrial wreckage remains available as a
separate biome cue; it should not dominate a working Linewrought site.

## Aurelian civic expedition

Use `"sceneryFamily": "aurelian_civic"` for modular authority compounds,
temporary civic stations and maintained logistics sites on Tessell.

- chalk modular shells and pale-gold caps
- deep-blue power and service bands
- cool glass-green panels and restrained amber signals
- level foundations, ordered repetition and clean utility nodes

These are expeditionary structures, not a repaint of Tessell's permanent
architecture. Keep the underlying biome and landmarks tied to the actual place.

## Authoring limits

Both families reuse the existing building and landmark batches and add at most
one `yard` batch. Yard pieces are deterministic, low enough to sit below combat
markers, and capped at 320 instances before even-thinning. A representative
56-by-56 industrial map stays below five prop draw calls and 450 instances.

Maps without `sceneryFamily` retain their existing appearance. Low-effects and
reduced-motion modes require no special variant because these fittings use no
particles, animation, transparency or extra lights.
