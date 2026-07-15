# Changelog

All notable changes to the Swarm Release Manager (Claude) plugin are documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
See [RELEASING.md](RELEASING.md) for how versions are cut.

## Unreleased

### Fixed

- **The session-start hook now asks for its gate explicitly** (`marshall me
  --require-repo`) and greets you as **Marshall**, not "Swarm Release Manager".
  The gate used to be implicit — `marshall me` itself refused unless the repo had
  `state.backend: "srm"` — which made the CLI's first run baffling: install, sign
  in, ask who you are, get lectured about a `release-config.json` you have never
  seen, naming a backend called "srm". Identity is a property of your token, not
  of the directory you are standing in. Hook behaviour is unchanged: still silent
  unless the CLI is on PATH *and* the repo opts in.

- **The session-start hook stopped reading a mechanism that no longer exists.** It
  exported `CLAUDE_PLUGIN_OPTION_SRM_URL` / `_TOKEN` into the `srm` subprocess, but
  0.8.1 removed the manifest's `userConfig` block when the MCP url was hardcoded —
  so both have resolved to empty ever since. The CLI resolves its own url and token
  anyway, so the exports are gone. No behaviour change: the hook stays silent
  unless `srm` is on PATH and the repo opted into the SRM backend.

### Note

- **The CLI is now `@builtbyberry/marshall-cli`, and its binary is `marshall`.**
  It gained `marshall login` (browser OAuth + PKCE) — it had never been published
  at all, so the README's install line pointed at a 404. Renamed to the product
  name while it had no users; `@builtbyberry/srm-cli` (0.2.0, published briefly
  today) is deprecated and points here. The skills' CLI fallback now says
  `marshall next` / `marshall status`.
  `MARSHALL_URL`/`_TOKEN`/`_PROJECT` are the env vars; `SRM_*` still work.
  The plugin's own `srm` identifiers are UNCHANGED — the plugin is still `srm`,
  the skills are still `/srm:*`, and the MCP tools are still `mcp__srm__*`, per
  the rebrand decision that the Marshall client is a clean-slate new plugin
  rather than a breaking in-place rename. The CLI versions independently of this
  plugin (`cli-v*` tags); see [RELEASING.md](RELEASING.md).

## [0.9.0] - 2026-07-14

### Added

- **`/release-next` answers across releases.** Several releases in flight is
  normal — claims are held per *component*, so teammates on different releases
  never contend — but the skill always required a release and asked when the user
  hadn't named one. It now scopes the question to whatever the user actually gave:
  a named release (`{ release }`), a project (`{ project }`), or **nothing at all**
  (`{}` → every unshipped release in the workspace), which is the cross-release
  "what should I work on" inbox. Each recommendation carries the release it belongs
  to, since a cross-release list is useless if you can't tell what belongs where.
  Requires the store's widened `release_next` (`release` is now optional); the
  `srm` CLI fallback stays per-release, so on that path the skill still asks.
  The skill also now documents the response it reads (`startable[]` with per-item
  `release` + `unblocks`, `blocked_summary`, `releases[]`, `scope`), uses
  `releases[]` to say *which* release is stuck when nothing is startable, and
  flags that cross-release `unblocks` ranking is a proxy — each count comes from
  its own release's graph, so it should be weighed against what's near shipping
  rather than followed blindly.

### Fixed

- **`release_ambiguous` is now handled rather than dead-ended.** The store's
  release lookup used to report `release_not_found` when a version matched more
  than one release — a lie about releases that exist, and nothing an agent could
  act on. It now returns `release_ambiguous` with `candidates[]` naming each
  release's `project` + `slug`. `/release-next`, `/release-status`, and
  `/release-plan` document the mechanical retry: pass `project` **and** the
  candidate's `slug` (that pair is unique), never the same bare version again.
- **`/release-next` no longer claims `/srm:release-parallel` is unavailable.** It
  told users concurrent dispatch was "planned, not yet available"; the skill has
  shipped, so the hand-off now points at it.

## [0.8.1] - 2026-07-06

### Fixed

- **Plugin connection now works from the "Add connection" UI.** `.mcp.json` used
  `"url": "${user_config.srm_url}/mcp"`, but Claude Code does not interpolate a
  `userConfig` value into an HTTP MCP server's `url` field — so the UI showed the
  literal `${user_config.srm_url}/mcp` and the **Add** button wouldn't proceed.
  The store URL is now hardcoded to the hosted endpoint
  `https://release-manager.swarmplatform.cloud/mcp` (matching how the Swarm plugin
  ships its hosted MCP), and the now-unused `userConfig.srm_url` field was removed
  from the manifest. SRM is a hosted service — every user connects to the same
  store over OAuth — so there was no per-user URL to configure. (Self-hosters can
  still point elsewhere via `claude mcp add --url`.)

### Added

- **`/srm:release-open`** now offers — on an explicit yes, never automatically —
  to link the release to a GitHub milestone (step 9). For a native release with a
  GitHub repo and no `tracker_url` yet, it asks "create a new milestone / use an
  existing number / skip" (default skip); on opt-in it creates the milestone via
  `gh` and/or links it with `release_update { milestone_number }`, which derives
  `tracker_url` from the project repo so the release-detail "View milestone in
  tracker" link works. An already-linked release is left untouched. Requires the
  store's `release_update` tool (milestone_number support).

## [0.8.0] - 2026-06-30

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
