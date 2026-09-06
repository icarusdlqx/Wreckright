# A local preview that stays available

The review links previously depended on temporary development-server sessions.
Once those processes ended, both the old link and the open browser tab stopped
responding. A production build is now served by one project-owned local preview
process, independently of the task that started it.

## Start, inspect and stop

Build the current game, then start the preview:

```sh
npm run build
npm run preview:local
```

Both addresses serve the same release:

- `http://127.0.0.1:5219/`
- `http://127.0.0.1:5220/`

The wiki is available at either address with `#wiki`, or a specific fragment such
as `#wiki/story/tessell`. Nothing redirects between the ports. Browser storage is
separate for each origin, so return to the address where a company was saved;
Company files can export/import a company when changing addresses.

```sh
npm run preview:status
npm run preview:stop
npm run preview:restart
```

Starting an already-running managed preview is safe. If another process owns
either port, startup fails with that port named. It never takes over or kills
another server. `preview:status` reports each address and the served entry's
build fingerprint. A stopped preview leaves the build and browser saves intact.
Shutdown is confirmed by closed listening ports, not just a failed health page.
An unknown or unrelated listener is reported without being terminated.

On macOS, start manually loads a project-specific job into the current user's
launchd session. Its plist and logs live in ignored `reports/local-preview/`.
No file is installed in `~/Library/LaunchAgents`, and no login item is created.
The job survives the coding task and can restart after a crash, but does not
automatically return after logout or reboot. Run `preview:local` again then.

The optional `node tools/local-preview.mjs serve` runs the same server in the
foreground on other systems, or for diagnosis. Stop that terminal with Ctrl+C.
It does not provide the managed process's lifetime guarantee.

## Serving and verification

Only the built `dist` directory is served, on loopback interfaces. No runtime
dependencies are needed. The server uses the release's `_headers` security and
cache rules, supplies browser asset MIME types, and prevents dot-file access,
path traversal and symlinks escaping the release directory. Missing files return
404 rather than silently serving the game. Internal aliases to hidden or hosting
control files are also refused. HTML is not cached, so rebuilding
updates the entry without a server restart; restart after changing server code
or `_headers` rules.

`/__wreckright_preview` identifies this project's running preview and current
entry fingerprint. It exposes no absolute project path. The control commands
check that identity before reporting a server as this preview.

Run `npx vitest run tests/localPreview.test.ts` to check static serving, both-port
binding, MIME/security headers, malformed paths, build refresh, safe refusal on
occupied ports and lifecycle configuration. Tests bind temporary loopback ports
and require permission to listen locally in a restricted environment. They do
not load launchd jobs or open a browser. The final delivery separately verifies
the managed job, both actual addresses and the rendered game.
