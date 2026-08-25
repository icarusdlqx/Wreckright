# Cloudflare release runbook

Wreckright production is a static-asset Worker deployed by Workers Builds from
the private GitHub repository. The configured production branch is `main`, so
advancing `main` builds and publishes the site.

Record these identifiers together for every release:

- full Git commit SHA;
- Workers Build UUID;
- Worker version ID created by that build;
- production deployment ID;
- previous stable version ID;
- production URL and verification time.

A version contains static assets and configuration. A deployment determines
which version receives traffic.

## Build the exact candidate

Start from a clean checkout of the exact candidate commit:

```sh
test -z "$(git status --porcelain)"
git rev-parse HEAD
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

## Inspect the branch preview

Workers Builds creates a preview version for a topic branch when non-production
builds and preview URLs are enabled. Confirm the build details name the exact
candidate SHA, record the preview's Build UUID and Version ID, and inspect Home,
training, Move and Attack, campaign save/reload, and the console. Do not merge
if the preview metadata, files, or behavior do not match the candidate.

## Verify production

After the exact candidate advances to `main`, wait for the production Workers
Build. Confirm its full Git SHA, Build UUID, Version ID, and 100% active
deployment in the Cloudflare dashboard. Then verify every public file against
the local `dist` from the same commit:

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

Run the short production smoke once more after deployment. A byte match does not
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
- Production branch: `main`.
- Build command: `npm run build`.
- Production deploy command: `npx wrangler deploy`.
- Non-production deploy command: `npx wrangler versions upload`.
- Wrangler version: exactly `4.125.0` until deliberately reviewed and updated.
- Preview URLs are public unless protected separately with Cloudflare Access.
- Keep the previous stable version ID in every release record.

## Cloudflare references

- [Static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Static asset configuration](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)
- [Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
