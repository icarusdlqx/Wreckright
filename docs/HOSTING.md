# Hosting Wreckright

The game is a static site: there is no server, database, API, service worker,
or Cloudflare binding. Production is the `wreckright` Worker serving the
contents of `dist/` at `wreckright.ligand-ave.workers.dev`.

## Cloudflare production

Production is connected to the private GitHub repository through Workers
Builds. A push to the configured production branch, `main`, builds and deploys
automatically, so advancing `main` is a production action.

The checked-in `wrangler.jsonc` names the existing Worker and points its static
assets at `./dist`. Node is pinned by `.node-version`, and Wrangler is pinned in
`devDependencies`; keep dependency installation lockfile-driven.

The release sequence is: inspect the topic-branch preview, land only a fully
green commit on `main`, verify that Workers Builds deployed that exact SHA,
then byte-verify the public site and run the short browser smoke.

The exact commands, verification steps, and rollback procedure are in
`docs/CLOUDFLARE_RELEASE.md` and `docs/RELEASING.md`.

### Preview versions

Workers Builds creates a non-production preview for a topic branch when branch
builds and preview URLs are enabled. Confirm the full commit SHA in the build
details before inspecting it. Preview URLs are public unless protected
separately with Cloudflare Access.

### Caching and security headers

`public/_headers` is copied into the build output and parsed by Workers Static
Assets. Fingerprinted assets are cached for a year. The entry document is
revalidated on every request so a returning phone receives the current asset
graph.

The same file applies the browser security policy. If a Worker script is later
placed in front of the assets, responses created by that script must attach
equivalent headers themselves.

The self-contained `dist-single/wreckright.html` has inline script and style by
design. Its path explicitly detaches the normal site's CSP when the complete
`dist-single` directory is hosted, while the normal deployed app keeps the
strict policy.

## Playing on a phone

The site works in Safari on iOS and macOS. On a phone:

- **Drag** the ground to move the camera, **pinch** to zoom.
- **Tap** one of your mechs to select it; **tap** an enemy to attack it.
- **Tap** open ground to send the selection there.
- Everything else is on the buttons along the bottom.

Add it to the home screen (Share → Add to Home Screen) and it installs as
WRECKRIGHT with its own app icon, opening full screen in landscape with no
browser chrome. There is deliberately no service worker: the single-file build
is the offline distribution, and stale application code is worse than a
network round trip.

## Hosting elsewhere

`npm run build` writes a plain static site to `dist/`. Upload that directory to
any static host. The build uses relative asset paths, so it works from a domain
root or subdirectory. Another host must reproduce the caching and security
headers in `public/_headers` using its own configuration format.

`npm run build:single` writes `dist-single/wreckright.html`, containing the
entire game and its assets in one file that can be opened from disk.
