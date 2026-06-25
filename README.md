# Swarm Release Kit

Release coordination for AI coding agents, backed by the hosted **Swarm Release
Manager (SRM)** store. It lifts release-planning state out of repo-local,
gitignored JSON (`release-plan.json`, `release-state.json`, …) into a shared
store the `release-*` skills read and drive over REST — so **claims, drift, and
startability are the same across machines, people, and agents**.

This is a **monorepo**: one agent-agnostic core, one plugin per agent host.

```
swarm-release-kit/
  .claude-plugin/marketplace.json   the marketplace that lists the host plugins
  cli/srm/                          shared core — the `srm` client (npm: @builtbyberry/srm-cli)
  plugins/
    claude/                         Claude Code host adapter        ← shipping
    codex/                          (later)
    cursor/                         (later)
```

Every host plugin is a thin wrapper that shells out to the same `srm` CLI, so
behavior is identical everywhere and the API contract lives in one place.

## Install (Claude Code)

```
/plugin marketplace add builtbyberry/swarm-release-kit
/plugin install swarm-release-claude@swarm-release-kit
```

At enable time you'll be asked for your **SRM API token** (kept in your system
keychain). The store URL and project come from each repo's
`release-config.json`. Install the core CLI too:

```
npm install -g @builtbyberry/srm-cli
```

## Opt-in (never breaks existing repos)

A repo uses SRM only when its `.claude/release-config.json` opts in:

```jsonc
{
  "state": {
    "backend": "srm",        // default "local-json" — unchanged behavior
    "url": "https://your-srm-host",
    "project": "your-project-slug"
  }
}
```

Without the opt-in, the plugin stays silent and the existing local-JSON
`release-*` skills run exactly as before.

## What ships in the Claude plugin

| Surface | What it does |
| --- | --- |
| `skills/release-next` | Startable work, ranked by what it unblocks (read-only). |
| `commands/release-status` | `/release-status` — who holds what + drift, at a glance. |
| `hooks/SessionStart` | Surfaces live store connection at session start (silent for non-SRM repos). |
| `userConfig.srm_token` | API token, stored in the system keychain — never in a repo. |

## Develop

```
cd cli/srm && npm test                  # the shared core (node --test)
claude plugin validate ./plugins/claude # the Claude plugin
```
