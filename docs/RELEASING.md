# Releasing Wreckright safely

`main` is the production branch. A merge to it starts a Cloudflare Workers
Build, so release safety begins before the merge. GitHub's `Production gate`
is the stable status check for branch protection.

The repository path `icarusdlqx/Ironline`, Worker name `ironline`,
`Workers Builds: ironline` check, and current `workers.dev` hostname are legacy
operations identifiers retained after the player-facing rename. Do not replace
them in commands or required-check settings without a coordinated migration.

## What CI guarantees

Every pull request runs three independent jobs:

- **Quality and release builds** installs the lockfile, typechecks, lints, runs
  the fast suite, builds both distributions, and retains the tested files for
  14 days.
- **Browser playthrough** installs the Playwright Chromium revision and runs
  the complete browser journey. Failure screenshots are retained for 14 days.
- **Simulation gate** runs the deterministic balance and campaign acceptance
  suites when simulation, campaign, schema, or game-data files change. It also
  runs unconditionally from manual and weekly scheduled workflows.

`Production gate` fails unless all three jobs succeed. Every referenced Action
is GitHub-owned and pinned to an immutable commit SHA. Workflow permissions
are read-only.

Cloudflare rebuilds the main tree rather than consuming GitHub's archived
artifact. After deployment, verify that the public files match a fresh local
build exactly; do not treat a green build alone as proof that production has
the expected bytes.

## One-time repository protection

Apply these settings only after the CI workflow containing `Production gate`
has landed and completed once. The checked-in JSON files make the intended
settings reviewable and repeatable.

```sh
gh api --method PUT \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/icarusdlqx/Ironline/actions/permissions \
  --input .github/actions-permissions.json

gh api --method PUT \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/icarusdlqx/Ironline/actions/permissions/selected-actions \
  --input .github/selected-actions.json

gh api --method PATCH \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/icarusdlqx/Ironline \
  --input .github/repository-settings.json

gh api --method PUT \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/icarusdlqx/Ironline/branches/main/protection \
  --input .github/main-branch-protection.json
```

The protection requires an up-to-date pull request, the GitHub Actions
`Production gate`, the Cloudflare preview build, resolved review threads, and
linear history. It applies to administrators and blocks force-pushes and
deletion. Squash merge is the only enabled merge method.

Approval count is intentionally zero while the project has one maintainer.
GitHub does not count an author's approval of their own pull request, so a
one-approval rule would stop all ordinary releases without adding an
independent reviewer. Add `CODEOWNERS` and raise the count to one when a second
maintainer with write access accepts release-review responsibility.

Verify the resulting settings:

```sh
gh api repos/icarusdlqx/Ironline/branches/main/protection
gh api repos/icarusdlqx/Ironline/actions/permissions
gh api repos/icarusdlqx/Ironline/actions/permissions/selected-actions
gh api repos/icarusdlqx/Ironline --jq \
  '{allow_merge_commit,allow_squash_merge,allow_rebase_merge,delete_branch_on_merge}'
```

## Pull request to production

1. Start from current `main` and use a `codex/`, `claude/`, or human-owned
   topic branch as appropriate.
2. Complete the pull request template. Run the proportional local checks from
   `AGENTS.md` before pushing.
3. Inspect the Cloudflare preview on every relevant form factor. Resolve all
   review threads and wait for `Production gate` and `Workers Builds: ironline`.
4. Squash-merge. Do not push directly to `main`.
5. In Cloudflare, confirm that the production deployment names the merged Git
   SHA. Wait for the post-merge GitHub workflow to complete as a second check.
6. From the exact main commit, run a clean build and compare every served file:

   ```sh
   npm ci
   npm run build
   npm run verify:deploy -- \
     --url https://ironline.ligand-ave.workers.dev/ \
     --attempts 20 \
     --interval-ms 3000
   ```

7. Run the short player smoke path: Home, training briefing, campaign load,
   skirmish deployment, sound toggle, and save/reload. Record the Git SHA,
   Cloudflare version ID, verification result, and any known limitation in the
   release notes.

Cloudflare project identifiers, security headers, and dashboard verification
are documented in `docs/CLOUDFLARE_RELEASE.md`.

## Rollback and repository recovery

Use rollback when production has a player-blocking failure, save corruption,
unrecoverable rendering failure, or a serious security/privacy regression.

1. In Cloudflare, roll back immediately to the last verified version. This
   restores traffic without rewriting Git history.
2. Verify the restored version and run the player smoke path. Preserve the
   failed GitHub and Cloudflare logs.
3. Create a topic branch from current `main` and use `git revert` for the bad
   squash commit. Never reset or force-push `main`.
4. Open a recovery pull request. The same production gates apply; document why
   rollback was necessary and whether player saves written by the bad version
   remain readable.
5. Merge the revert so repository state and production converge again. Verify
   the new deployment, then record the restored SHA and version ID.

A dashboard rollback is temporary operational recovery. The revert pull
request is what prevents the broken tree from being deployed again on the next
push. Save-schema changes must be designed so the immediately previous release
can safely read or reject newer data; test that rollback path before release.
