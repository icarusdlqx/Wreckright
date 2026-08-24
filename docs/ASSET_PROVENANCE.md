# Asset provenance

This register covers every checked-in image, model, font, and audio file under
`public/` and `src/`. Code, JSON, CSS, and the inline SVG favicon in
`index.html` remain reviewable source rather than opaque media assets.

The machine-readable register is [`asset-provenance.json`](asset-provenance.json).
`tests/assetProvenance.test.ts` fails if a registered file changes or if a new
media file appears without a register entry.

## Current binary assets

The three PNGs are size variants of the same app icon: a geometric, head-on
mech silhouette over a horizon. All three first entered this repository in
commit `94dde01e3bf4a71c684fd8f58d072d9531d7f20e`, whose commit description says
the icon was created for the game and "baked to PNG." The files contain no
embedded author, source, or license metadata, and no editable source file or
external stock-asset reference was committed with them.

That history establishes repository chain of custody, but it does **not** by
itself establish copyright ownership or a commercial-use grant. The register
therefore marks each icon `owner-attestation-required` rather than claiming a
clearance the repository cannot prove.

## Generated presentation

No external meshes, textures, fonts, music, or sound recordings are checked
in. Battlefield geometry and visual effects are assembled at runtime from the
project's TypeScript, JSON, and CSS. Sound is synthesized at runtime with the
Web Audio API. This describes the repository inventory; it is not a claim
about authorship of every source contribution.

## Commercial-release gate

Before a paid or broadly promoted release, the owner must either:

1. retain a dated written attestation identifying who created the icon and the
   terms that permit commercial distribution; or
2. replace it with an asset whose creator, source files, agreement, and
   commercial-use terms are retained.

After either action, update `asset-provenance.json`, including the SHA-256 of
every shipped rendition, and change the clearance status only when the
supporting record exists outside this public repository.
