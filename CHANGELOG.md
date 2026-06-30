# Changelog

All notable changes to the Swarm Release Manager (Claude) plugin are documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [RELEASING.md](RELEASING.md) for how versions are cut.

## Unreleased

### Added

- **`/srm:release-parallel`** — store-driven parallel subagent dispatch. Reads the
  startable candidate set from the store (`release_next` / `release_get`, not
  `release-plan.json`), opens a `dispatch_run` for the wave (`dispatch_open`) and
  relies on the server-side graph guard to reject dep-unmet members with a
  per-member reason, claims each admitted member (`claim_component`), materializes
  a git worktree per component (via `/srm:release-topic --worktree`), and spawns
  one Claude subagent each that reports semantic progress back to its run member
  (`dispatch_report`: dispatched → in_progress → proposed → merged / failed).
  Refuses unless the main checkout is on the active release branch. Resumable: a
  re-invocation re-attaches to an open `dispatch_run` and reports per-member status
  instead of re-dispatching. The store-driven counterpart to the GitHub-plan-driven
  `/release-parallel`. (#54)

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
