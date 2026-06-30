# Changelog

All notable changes to the Swarm Release Manager (Claude) plugin are documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [RELEASING.md](RELEASING.md) for how versions are cut.

## Unreleased

### Added

- **`/srm:release-init`** — bootstrap a project + release directly in the shared
  store via the new write-path tools (`project_create` / `release_create`), with
  no GitHub round-trip. The SRM-native counterpart to the GitHub-seeded
  `/release-init`: resolve-or-create the workspace project (repo optional), create
  the release from theme / version-or-slug / out_of_scope (`source: native`), and
  offer an optional, skippable external-tracker link (GitHub/Jira/Linear) — the
  store stays the source of truth. Idempotent/resumable: re-running against an
  existing release resumes via `release_get` instead of duplicating. Refuses
  gracefully on older stores that lack the write-path tools, pointing at
  `php artisan srm:import-release`. Requires the plan-write-path backend tools.
- **`/srm:release-plan`** — SRM-native planning conversation. Runs the
  structured per-cluster sweep (theme → component sweep by `project_type` →
  deploy-safety + breaking per component → out-of-scope) and writes each
  confirmed component straight to the store via `component_create` with a
  per-component yes/edit/skip loop. Pure-store: files no GitHub issues and writes
  no `release-plan.json`, so components are live on the release-detail screen and
  graphable by `/srm:release-graph` the moment they're confirmed. Components land
  with the same strict shape as the GitHub issue template (title, branch_type,
  slug, deploy_safety, breaking, notes) plus an optional, skippable external
  tracker link. Supports `add` mode to append a single component without
  re-walking the sweep. The GitHub-seeded `/release-plan` stays for repos that
  want issue-tracked planning.
- **`/srm:release-parallel`** — store-driven parallel subagent dispatch. Reads the
  startable candidate set from the store (`release_next` / `release_get`, not
  `release-plan.json`), opens a `dispatch_run` for the wave (`dispatch_open`) and
  relies on the server-side graph guard to reject dep-unmet members with a
  per-member reason. Then per admitted member, `/srm:release-topic --worktree` is
  the single claim owner — it claims the component and materializes a git worktree
  — and the wave spawns one Claude subagent each that reports semantic progress
  back to its run member (`dispatch_report`: dispatched → in_progress → proposed →
  merged / failed). Refuses unless the main checkout is on the active release
  branch. Resumable: a re-invocation re-attaches to an open `dispatch_run` and
  reports per-member status instead of re-dispatching. The store-driven counterpart
  to the GitHub-plan-driven `/release-parallel`. (#54)

### Changed

- Skill guidance aligned with the store's new edit write-path
  (`project_update` / `release_update` / `component_update`): `/srm:release-init`
  no longer claims the store has "no edit tool by design" — a created record is
  now editable via those tools (the skill itself stays create-only), and a
  resume points at `project_update` for changing a project's external link.
  `/srm:release-plan`'s out-of-scope sweep now offers to write the cuts straight
  onto the release via `release_update` instead of only reminding the operator.
  `/srm:release-open` corrects its stale "no create release tool by design"
  guardrail — a missing release is seeded with `/srm:release-init` (native
  `release_create`) or a GitHub-milestone import, not import-only.

## [0.7.0] - 2026-06-29

First tagged release of the `srm` Claude Code plugin — release coordination for AI
coding agents backed by the hosted Swarm Release Manager store, connected over
OAuth so claims, drift, startability, findings, and lens config live in one shared
store (the same across machines, people, and agents) instead of repo-local JSON.

This release consolidates all work to date into a single coherent version; prior
`plugin.json` numbers (0.1.0–0.6.1) were development iterations and were never
tagged.

### Added

- **MCP-first, OAuth-authenticated SRM backing.** The plugin connects its MCP
  server at `<srm_url>/mcp` and authenticates via OAuth (Dynamic Client
  Registration) — approve the connection in the browser and pick a workspace, no
  token to paste.
- **`/srm:release-next`** — resolve the next startable component from the store.
- **`/srm:release-graph`** — verify a release's dependency graph; components stay
  unstartable until the graph is confirmed.
- **`/srm:release-topic`** — select the component/topic to work on.
- **`/srm:release-unclaim`** — recover a stuck or dead claim.
- **Component work-state lifecycle** via `set_component_state`
  (open → in_progress → proposed → merged), separate from the claim lock —
  marking a blocker `merged` is what unblocks its dependents.
- **`/srm:release-readiness`** — run the configured readiness lenses for a release
  and record their findings in the shared store (`kind: readiness`) via
  `record_finding`, with defer/accept/fix/re-open through `resolve_finding`. The
  store port of `swarm-release-readiness`: durable store rows, reconciled on
  re-run (no duplicates), read back from the release document instead of a
  repo-local `review-state.json`.
- **`/srm:change-review`** — run the configured change lenses over a release
  component's diff and record their findings in the store (`kind: change`),
  component-scoped with fail-loud component resolution and idempotent re-runs. The
  store port of `multi-expert-change-review`.
- **Lenses resolved from the store.** Lens *selection* comes from the release
  document (`project.reviews.<scope>.lenses` via `release_get`) and lens
  *definitions* from `lenses_get` — no `~/.claude/skills/_lenses` fallback; an
  empty selection or an unresolved slug fails loud. Both review skills fan out one
  subagent per lens in parallel, then aggregate, synthesize, and record centrally
  (recording stays idempotent). Requires the backend lens table +
  `lenses_get`/`set_release_lenses` tools.
