---
name: release-open
description: "Open a release session against the shared SRM store: confirm the release is seeded, cut the release branch, scaffold the CHANGELOG, and open the draft release PR. Use when the user says /release-open, start release, cut release branch, or let's start <release>."
---

# Release Open (SRM)

Open a release session the right way: **confirm the release exists in the shared
SRM store first**, then do the git/PR mechanics — cut the release branch,
scaffold the CHANGELOG entry, push, and open the draft release PR. The store is
the state; there is no local `release-state.json`/`release-plan.json`. The
release's phase derives automatically from its components (once they exist and at
least one is unmerged it resolves to `open`; an all-closed milestone imports with
every component already `merged`, so it derives `wrapping`), so there's nothing to
write to "open" it — this skill's job is the git/PR mechanics plus confirming the
release is seeded.

## How it talks to the store

- `mcp__srm__release_get` — confirm the release is seeded (its components are what
  makes the phase resolve). If it's missing, it must be imported first; there is no
  store-side "create release" tool.

If the MCP server isn't connected, **stop and say so** — the store is the only
source of truth for whether the release exists; don't proceed from memory.

The branch/CHANGELOG/PR mechanics are plain git + `gh` — they don't touch the
store. Config comes from `.claude/release-config.json` (tracked, read from the
current checkout): `repo`, `default_branch`,
`versioning.release_branch_pattern`, `wrap.mode`, `wrap.changelog_path`.

## Procedure

1. Resolve the release version-or-slug (ask if ambiguous — don't guess). Refuse
   if `.claude/release-config.json` is missing.
2. **Ensure the release is in the store.** `mcp__srm__release_get { release }`.
   - **Found** → it's seeded; continue.
   - **Not found** → the milestone must be imported first. Surface that the
     operator runs `php artisan srm:import-release <repo> <milestone>` on the
     server (the swarm-releases repo's command), then retry. Stop — do **not**
     try to create the release from here; import is the only seeding path.
3. **Preflight (refuse on failure — do not auto-fix).** In order, stop on the
   first failure with a clear message:
   1. Working tree is clean: `git status --porcelain` is empty.
   2. Current branch is `<default_branch>`.
   3. `<default_branch>` is up to date with origin: `git fetch origin` then
      compare.
   4. Resolve the release branch from `versioning.release_branch_pattern` (e.g.
      `release/v0.7.0`) and verify it does **not** already exist locally or
      remotely (`git rev-parse --verify` fails, `git ls-remote --exit-code
      origin <branch>` fails).
4. **Theme.** Ask for a one-line theme for the release (it becomes the CHANGELOG
   intro and the PR subtitle). Accept `_TBD_` if the user can't articulate it
   yet, and remind them to fill it in at wrap time.
5. **Cut the branch.** `git switch -c <release-branch>`.
6. **Scaffold the CHANGELOG.** Insert immediately after the `# Changelog` header
   in `<wrap.changelog_path>`:
   ```markdown
   ## <release-label> - unreleased

   <theme paragraph>

   ### Added

   _To be filled in during release wrap-up._

   ### Changed

   _To be filled in during release wrap-up._
   ```
   The wrap phase adds any missing sections; only include `### Fixed` /
   `### Removed` now if the user expects them.
7. **Commit + push.**
   ```
   git add <wrap.changelog_path>
   git commit -m "chore(release): scaffold <release-label> changelog entry"
   git push -u origin <release-branch>
   ```
8. **Open the draft release PR.** Title `release: <release-label> — <theme>`,
   base `<default_branch>`, head `<release-branch>`, `--draft`. The body explains
   that topic branches target this branch (not `<default_branch>`) and carries
   the wrap-status checklist. With `wrap.mode = deploy` the final checklist item
   is the deploy step:
   ```
   - [ ] All topic PRs merged
   - [ ] Multi-expert review run
   - [ ] CHANGELOG filled
   - [ ] Readiness review run
   - [ ] Deploy executed and smoke + monitor passed
   ```
   (In `tag` mode the last item is "Ready for merge + tag" instead.)
9. **Report.** Print the new branch name, the PR URL, and the next-step hint:
   `Run /srm:release-graph to verify the dependency graph, then /srm:release-next`.

## Guardrails

- **Never create the release from here.** If `release_get` comes back empty, the
  fix is `php artisan srm:import-release <repo> <milestone>` on the server, then
  retry — not a store write. There is no "create release" tool by design.
- Preflight failures are hard stops, not warnings to work around. Don't
  auto-stash, don't reset, don't force-push.
- If the release branch already exists, stop — don't reuse or overwrite it.
- If `gh pr create` reports a PR already exists for this branch, surface that
  PR's URL and continue rather than opening a duplicate.
- Don't write any "open" state to the store — the `open` phase derives from the
  release having components (ReleasePhaseResolver). This skill only does git/PR.
