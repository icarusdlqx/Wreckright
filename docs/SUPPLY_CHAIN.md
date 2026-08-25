# Dependency and SBOM record

`package-lock.json` is the authoritative dependency lock. The repository's
`.node-version` identifies the supported Node.js line used in CI.

After `npm ci`, generate the production dependency SBOM with:

```sh
npm run sbom > wreckright.cdx.json
```

The result is CycloneDX JSON. It uses npm's lockfile-native SBOM command, omits
development-only packages, and describes the application dependency graph.
The small wrapper retains npm's component, license, integrity, and dependency
data while removing optional per-run and generator metadata, normalizing the
checkout-directory display name, and sorting the remaining document. Two runs
against the same lockfile therefore produce identical bytes on the supported
Node.js line.

For an audit of the build toolchain as well, run npm directly without
`--omit=dev` and retain that separate SBOM with the release records.

The exact production dependency license texts are checked in at
`public/THIRD_PARTY_NOTICES.txt`, which also makes them part of ordinary web
builds. `npm run build:single` embeds the same text in the self-contained HTML.
Regenerate and verify the notice inventory with:

```sh
npm run notices:write
npm run notices:check
```

Neither the SBOM nor the third-party notices grants a license to the game's
own source, writing, visual design, or other assets. The repository owner must
choose and document those distribution terms separately before release.
