# Cloudflare release runbook

Wreckright production is a static-asset Worker promoted explicitly with the
pinned Wrangler CLI. The repository is not currently connected to Workers
Builds, and a push to `main` does not change production traffic.

Record these identifiers together for every release:

- full Git commit SHA;
- uploaded Worker version ID;
- production deployment ID;
- previous stable version ID;
- production URL and verification time.

A version contains static assets and configuration. A deployment determines
which version receives traffic. Uploading a version must not promote it.

## Build the exact candidate

Start from a clean checkout of the green `main` commit:

```sh
test -z "$(git status --porcelain)"
release_sha=$(git rev-parse HEAD)
release_short=$(git rev-parse --short=12 HEAD)
release_short8=$(git rev-parse --short=8 HEAD)
npm ci
npm run build
npm run build:single
npm run verify:worker
cmp public/_headers dist/_headers
cmp public/_headers dist-single/_headers
awk 'length($0) > 2000 { print FNR ": header line is too long"; failed=1 } END { exit failed }' public/_headers
```

The hosted build must contain `dist/index.html`, hashed JavaScript and CSS under
`dist/assets/`, and `dist/_headers`. The self-contained distribution must be
`dist-single/wreckright.html` and make no external requests.

## Upload and inspect without promoting

```sh
npx wrangler versions upload \
  --name wreckright \
  --strict \
  --tag "git-$release_short" \
  --message "candidate $release_sha" \
  --preview-alias "release-$release_short8"
```

Record the returned version ID and preview URL. Inspect the preview in a fresh
browser profile: Home, training, Move and Attack, campaign load/save, and the
console. Do not continue if the version metadata, files, or behavior do not
match the candidate.

## Promote the inspected version

```sh
candidate_version='<VERSION_ID_FROM_UPLOAD>'
npx wrangler versions deploy \
  "$candidate_version@100%" \
  --name wreckright \
  --message "release $release_sha" \
  --yes
```

Record the resulting deployment ID, then verify every public file against the
local `dist` from the same commit:

```sh
npm run verify:deploy -- \
  --url https://wreckright.ligand-ave.workers.dev/ \
  --attempts 20 \
  --interval-ms 3000
```

Because `_headers` is consumed rather than served, verify its behavior over
HTTP:

```sh
wreckright_release_url=https://wreckright.ligand-ave.workers.dev
wreckright_verify_dir=$(mktemp -d)
curl -fsS -D "$wreckright_verify_dir/headers.txt" \
  -o /dev/null "$wreckright_release_url/"
tr -d '\r' < "$wreckright_verify_dir/headers.txt" | rg -i \
  '^(content-security-policy|cross-origin-opener-policy|permissions-policy|referrer-policy|strict-transport-security|x-content-type-options|x-frame-options):'

wreckright_js_path=$(rg -o 'assets/[^" ]+\.js' dist/index.html | head -n 1)
curl -fsSI "$wreckright_release_url/$wreckright_js_path" | tr -d '\r' | rg -i \
  '^cache-control: public, max-age=31536000, immutable$'
```

Run the short production smoke once more after promotion. A byte match does not
replace behavioral verification.

## Roll back

```sh
npx wrangler rollback \
  '<PREVIOUS_STABLE_VERSION_ID>' \
  --name wreckright \
  --message 'rollback: <reason>' \
  --yes
```

Confirm the new active deployment sends 100% of traffic to the selected stable
version, then repeat file, header, and browser verification. Rollback changes
traffic but does not rewrite Git; follow the repository recovery procedure in
`docs/RELEASING.md`.

The application currently has no remote storage or bindings, so a Worker
rollback cannot alter browser-local campaign data. Revisit that assumption
before adding server-side state.

## Configuration invariants

- Worker name: `wreckright`.
- Public route: `wreckright.ligand-ave.workers.dev`.
- Asset directory: `./dist`.
- No Worker script or bindings.
- Wrangler version: exactly `4.125.0` until deliberately reviewed and updated.
- Preview URLs are public unless protected separately with Cloudflare Access.
- Keep the previous stable version ID in every release record.

## Cloudflare references

- [Static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Static asset configuration](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)
- [Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
