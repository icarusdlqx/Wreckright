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

The nineteen chassis portraits in `src/assets/machines/` are local WebP renders
of the same authored models and standard designs used in battle. Their source
is retained in the repository; `tools/render-machine-portraits.mjs` produces
them with one disposable headless renderer. `provenance.json` in that directory
records the design IDs and model bounds. The asset register records each image's
exact bytes and introducing commit. No external image or mesh input was used.
Pilot portraits remain editable, authored SVG geometry in `PilotPortrait.tsx`
with individual appearance data in the pilot JSON files.

The main menu's Tessell crossing is original generated artwork from a text-only
prompt, with no source-image inputs. Its [generation record](art/TESSELL_CROSSING.md)
retains the prompt and PNG master; the runtime WebP is a locally compressed
rendition. The register records its introducing commit and exact shipped bytes
as `generated-original-art-with-source-record`. This inventory entry records
provenance without assigning the artwork a software licence.

No external meshes, textures, music, or sound recordings are checked
in. Battlefield geometry and visual effects are assembled at runtime from the
project's TypeScript, JSON, and CSS. Sound is synthesized at runtime with the
Web Audio API. This describes the repository inventory; it is not a claim
about authorship of every source contribution.

## Bundled typefaces

The Graphic Expedition presentation bundles DM Sans (variable) and Barlow
Condensed (Semibold and Bold). These are unmodified font files from the
official `google/fonts` repository, retrieved on 2026-09-05. DM Sans's upstream
`DMSans[opsz,wght].ttf` has the local filename `DMSans-Variable.ttf`; its font
data is unchanged. Exact source URLs and SHA-256 hashes are retained in the
asset register. The fonts and their original SIL Open Font License 1.1 texts
are stored together under `src/ui/assets/fonts/`.

The fonts retain their own OFL terms. Their license texts are also included by
`npm run notices:write`, so ordinary web builds and the standalone HTML carry
the same notices. CSS imports the local files and Vite inlines them into the
standalone build; no runtime font service or external font request is used.
The fonts' recorded license does not resolve the separate app-icon provenance
question above or grant rights in the game's other material.

## Commercial-release gate

Before a paid or broadly promoted release, the owner must either:

1. retain a dated written attestation identifying who created the icon and the
   terms that permit commercial distribution; or
2. replace it with an asset whose creator, source files, agreement, and
   commercial-use terms are retained.

After either action, update `asset-provenance.json`, including the SHA-256 of
every shipped rendition, and change the clearance status only when the
supporting record exists outside this public repository.
