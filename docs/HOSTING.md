# Hosting Wreckright

The game is a static site — no server, no database, no API. Anything that can
serve files can host it.

## Cloudflare (what this repo is set up for)

The production site is a Worker serving static assets through Cloudflare's
Git-connected Workers Builds integration. A push to the configured production
branch builds and deploys automatically. In this repository that branch is
`main`, so merging to `main` is a production action.

The live URL is under **Workers & Pages → the project → Settings → Domains &
Routes**. Both the production `workers.dev` route and version preview URLs have
their own enable switches.

The Worker configuration is checked in as `wrangler.jsonc`; its name matches the
existing Cloudflare project and its asset directory is `dist`. **Settings**,
under **Workers & Pages → your project → Settings → Build**, should use:

| Field                                | Value                           |
| ------------------------------------ | ------------------------------- |
| Build command                        | `npm run build`                 |
| Deploy command                       | `npx wrangler deploy`           |
| Non-production branch deploy command | `npx wrangler versions upload`  |
| Production branch                    | `main`                          |
| Root directory                       | repository root                 |

Node is pinned by `.node-version` in the repository root. Keep dependency
installation lockfile-driven.

The Wrangler `name` is a deployment identifier that must continue to match the
existing Worker. It remains the legacy identifier `ironline` after the
player-facing rename to Wreckright; renaming the Worker or its route is a
separate infrastructure migration.

Wrangler is pinned exactly as `wrangler@4.125.0` in `devDependencies` and the
lockfile. That was the stable npm release reviewed for this configuration on
2026-08-24; keep the pin in sync with any future dashboard-command review.

`npm run build` runs `tsc --noEmit` before Vite, so a type error fails the
Cloudflare build. The release gates in `.github/workflows/ci.yml` must also be
required by branch protection; a Cloudflare build succeeding does not imply
that lint, simulation, or browser verification passed.

### Preview deployments

Non-production branches produce preview versions only when **Settings → Build
→ Branch control → Builds for non-production branches** is enabled. Preview
URLs must also be enabled under **Settings → Domains & Routes**. They are public
unless protected separately with Cloudflare Access, so do not treat a preview
as confidential.

Workers Builds uses its non-production deploy command for these builds and does
not promote the resulting version to production. Verify its commit SHA in the
build details before approving the change.

### Caching

`public/_headers` is copied into the build output and parsed by Workers Static
Assets. Fingerprinted assets are cached for a year. The entry document can be
stored but is revalidated on every request, so a returning phone receives the
current asset graph.

The same file applies the site's browser security policy. If a Worker script is
later placed in front of the assets, these rules will not apply to responses
created by that script; the script must attach equivalent headers itself.

The self-contained `dist-single/wreckright.html` has inline script and style by
design. Its path explicitly detaches the normal site's CSP when the complete
`dist-single` directory is hosted, while the normal deployed app keeps the
strict policy.

### Release verification and rollback

Follow `docs/CLOUDFLARE_RELEASE.md`. It records how to tie the Git commit,
Workers Build UUID, Worker version ID, and live files together, and how to roll
back without confusing a build retry with a rollback.

## Playing on a phone

The site works in Safari on iOS and macOS. On a phone:

- **Drag** the ground to move the camera, **pinch** to zoom.
- **Tap** one of your mechs to select it; **tap** an enemy to attack it.
- **Tap** open ground to send the selection there.
- Everything else is on the buttons along the bottom.

Add it to the home screen (Share → Add to Home Screen) and it installs as
WRECKRIGHT with its own app icon, opening full screen in landscape with no
browser chrome. The web app manifest (`public/manifest.webmanifest`) and the
icons beside it are what make that work; there is deliberately no service
worker — the single-file build is the offline story, and a stale-cache bug is
worse than a network round trip.

## Somewhere else

`npm run build` writes a plain static site to `dist/`. Upload that directory
anywhere — Netlify, an S3 bucket, a folder on a web server. The build uses
relative asset paths, so it works from a domain root or from a subdirectory
without configuration. `public/_headers` uses Cloudflare's static-header
format; another host needs equivalent caching and security headers configured
in its own system.

`npm run build:single` writes `dist-single/wreckright.html`: the entire game,
including every asset, as one file that can be emailed or opened from a disk.
