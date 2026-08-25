# Releasing Wreckright safely

`main` is the production branch. A push to it starts a Cloudflare Workers Build,
so release safety begins before the merge. GitHub's `Production gate` and the
Cloudflare branch-preview check must both pass for the exact candidate.

The production identity is:

- repository: `icarusdlqx/Wreckright`;
- Worker: `wreckright`;
- public URL: `https://wreckright.ligand-ave.workers.dev/`;
- required statuses: `Production gate` and `Workers Builds: wreckright`.

## What CI guarantees

Every pull request and push to `main` runs three independent jobs:

- **Quality and release builds** installs the lockfile, typechecks, lints, runs
  the fast suite, checks dependency notices and the SBOM, builds both
  distributions, validates the Worker package, and retains the artifacts.
- **Browser playthrough** installs Chromium and runs the complete desktop,
  campaign, portrait, landscape, and tablet journey.
- **Simulation gate** runs deterministic balance and campaign acceptance when
  simulation-affecting files change, and on manual and weekly runs.

`Production gate` fails unless all three jobs succeed. Workflow permissions are
read-only and every referenced Action is pinned to a commit SHA.

## Repository protection

The intended repository and branch settings are checked in under `.github/`.
Apply them only after `Production gate` has completed at least once:

```sh
gh api --method PUT \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/icarusdlqx/Wreckright/actions/permissions \
  --input .github/actions-permissions.json

gh api --method PUT \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/icarusdlqx/Wreckright/actions/permissions/selected-actions \
  --input .github/selected-actions.json

gh api --method PATCH \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/icarusdlqx/Wreckright \
  --input .github/repository-settings.json

gh api --method PUT \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  repos/icarusdlqx/Wreckright/branches/main/protection \
  --input .github/main-branch-protection.json
```

GitHub may require a paid plan to protect a private repository. If the final
request returns 403, record protection as unresolved; do not describe it as
enforced. Until it is available, use a topic branch and wait for both checks
before advancing `main` without rewriting history.

Approval count is zero while the project has one maintainer. Add `CODEOWNERS`
and require an independent approval when a second maintainer accepts release
responsibility.

## Production procedure

1. Start from current `main` on a `codex/`, `claude/`, or human-owned topic
   branch.
2. Run the proportional local checks from `AGENTS.md`, push the branch, and
   wait for `Production gate` and `Workers Builds: wreckright`.
3. Inspect the Cloudflare branch preview, review the diff and browser evidence,
   then advance `main` to that exact commit.
4. Wait for the main-branch GitHub and Cloudflare runs. Confirm the Cloudflare
   build details name the intended full Git SHA, version ID, and deployment.
5. Check out the exact `main` SHA with a clean worktree and rebuild it:

   ```sh
   git status --porcelain
   git rev-parse HEAD
   npm ci
   npm run typecheck
   npm run lint
   npx vitest run --exclude "**/balance.test.ts" --exclude "**/e2e/**"
   npm run build
   npm run build:single
   npm run verify:worker
   ```

6. Byte-verify production using `docs/CLOUDFLARE_RELEASE.md`, inspect the live
   headers, and run the short player
   smoke: Home, training Move/Attack, campaign save/reload, and console errors.
7. Record the Git SHA, Workers Build ID, version ID, deployment ID, previous stable
   version, public URL, and verification time.

## Rollback and repository recovery

Use rollback for a player-blocking failure, save corruption, rendering failure,
or serious security/privacy regression.

1. Roll Cloudflare traffic back to the last verified version and repeat the
   live verification.
2. Preserve the failed CI and deployment evidence.
3. Create a topic branch from current `main` and use `git revert` for the bad
   commit. Never reset or force-push `main`.
4. Put the revert through the same gates, merge it, and promote that exact
   commit so repository and production state converge again.

Save-format changes must be designed so the immediately previous release can
safely read or reject newer data. Wreckright retains its original non-visible
`ironline.*` storage and playtest-schema identifiers for this reason.
