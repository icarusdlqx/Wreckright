# Cloudflare release runbook

IRONLINE production is a static-asset Worker deployed by Workers Builds from
the Git repository. This runbook does not require a local Cloudflare token and
does not use a manual `wrangler deploy`.

A release has four identifiers. Record all four together:

- the full Git commit SHA;
- the Workers Build UUID;
- the Worker version ID created by that build;
- the production URL and verification time.

Cloudflare versions contain the static assets and configuration for that point
in time. A deployment determines which version receives traffic.

The repository-wide pull-request gates, production procedure, and recovery
workflow live in `docs/RELEASING.md`. This document covers the Cloudflare
runtime details that procedure relies on.

## Materialize the static header policy

From the exact candidate commit, reproduce both distributions and confirm that
Vite copied the static header policy into each one:

```sh
git rev-parse HEAD
npm ci
npm run build
npm run build:single
cmp public/_headers dist/_headers
cmp public/_headers dist-single/_headers
awk 'length($0) > 2000 { print FNR ": header line is too long"; failed=1 } END { exit failed }' public/_headers
```

The normal build must contain `dist/index.html`, hashed JavaScript and CSS under
`dist/assets/`, and `dist/_headers`. The 2,000-character limit comes from the
Workers Static Assets `_headers` format.

## Preview runtime

Open the candidate's Cloudflare preview and complete the release smoke path
before merge. A preview is not production and must not be used as proof of the
active version.

Dashboard setup required for that preview:

1. **Workers & Pages → IRONLINE → Settings → Build → Branch control**: enable
   builds for non-production branches.
2. **Settings → Domains & Routes**: enable Preview URLs.
3. If the branch contains anything that should not be public, protect previews
   with Cloudflare Access before enabling them.

## Verify production

After merge, open **Workers & Pages → IRONLINE → Deployments**:

1. Under Version History, select the new version and then **View build**.
2. Confirm the build succeeded from `main` and its full commit SHA is the merge
   commit intended for release.
3. Record the Build UUID and Version ID.
4. Confirm Active Deployment sends 100% of traffic to that Version ID.

Then verify every public file against the clean local build from the same
commit. The verifier ignores Cloudflare control files such as `_headers`, which
are consumed rather than served, and retries while a new deployment propagates:

```sh
npm run verify:deploy -- \
  --url https://ironline.ligand-ave.workers.dev/ \
  --attempts 20 \
  --interval-ms 3000
```

Because `_headers` is not a public asset, verify the resulting behavior over
HTTP as a separate check:

```sh
ironline_release_url=https://ironline.ligand-ave.workers.dev
ironline_verify_dir=$(mktemp -d)
curl -fsS -D "$ironline_verify_dir/headers.txt" \
  -o /dev/null "$ironline_release_url/"
tr -d '\r' < "$ironline_verify_dir/headers.txt" | rg -i \
  '^(content-security-policy|cross-origin-opener-policy|permissions-policy|referrer-policy|strict-transport-security|x-content-type-options|x-frame-options):'

ironline_js_path=$(rg -o 'assets/[^" ]+\.js' dist/index.html | head -n 1)
curl -fsSI "$ironline_release_url/$ironline_js_path" | tr -d '\r' | rg -i \
  '^cache-control: public, max-age=31536000, immutable$'
```

Finally, complete the production smoke path in a fresh browser profile: load
Home, begin training, issue Move and Attack, enter campaign, reload, and confirm
the campaign resumes. Check the browser console for CSP violations and runtime
errors. A byte match does not replace this behavioral check.

Record the previous stable Version ID beside the release record before closing
the release.

## Roll back

A retry is not a rollback. Workers Builds applies the build settings that exist
when a build is retried, so a retry can differ from the historical build.

To restore Cloudflare traffic during an incident:

1. Identify the last stable Version ID from its build details and commit SHA.
2. Open **Workers & Pages → IRONLINE → Deployments**.
3. In Version History, use the three-dot menu for that stable version and
   select **Rollback**.
4. Confirm the new Active Deployment sends 100% of traffic to the selected
   version. Cloudflare creates a new deployment; it does not rewrite Git.
5. Repeat the live header and smoke checks above and record the rollback time,
   operator, target Version ID, and result.
6. Follow the repository recovery procedure in `docs/RELEASING.md`; the
   dashboard rollback does not change `main`.

Cloudflare retains rollback selection for the 100 most recently published
versions. This application currently has no remote storage or bindings, so a
Worker rollback cannot alter the player's browser-local campaign data. Revisit
that assumption before adding any server-side state.

## Dashboard-only release controls

The repository cannot enforce these settings. Review them in Cloudflare after
this runbook lands:

- production branch is `main`;
- build command is `npm run build`, production deploy is
  `npx wrangler deploy`, and non-production deploy is
  `npx wrangler versions upload`;
- `wrangler.jsonc` identifies the existing Worker as `ironline` and serves
  `./dist` without a Worker script;
- the root directory is the repository root and `.node-version` resolves to
  Node 22;
- non-production branch builds and version preview URLs are enabled;
- preview access is intentionally public or protected with Cloudflare Access;
- the active `workers.dev` or custom-domain route is enabled;
- the previous stable Version ID is in the release record.

The Worker identifier remains `ironline` until the product title is decided.
Changing it would create a deployment/domain migration and must not be bundled
into an ordinary content release.

The current stable CLI checked for this configuration on 2026-08-24 was
`wrangler@4.125.0`. Add that exact version to `devDependencies` and the lockfile
before relying on the dashboard deploy commands; do not leave production on a
floating `npx` resolution.

## Cloudflare references

- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Build branches](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)
- [Static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Static asset configuration](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/)
- [Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
