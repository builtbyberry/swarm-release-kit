# Swarm Release Kit

Release coordination for AI coding agents, backed by the hosted **Swarm Release
Manager (SRM)** store. It lifts release-planning state out of repo-local,
gitignored JSON (`release-plan.json`, `release-state.json`, …) into a shared
store — so **claims, drift, and startability are the same across machines,
people, and agents**.

Agents talk to the store **natively over MCP**; each host plugin just connects
the same hosted MCP endpoint. The `srm` CLI is the secondary path for humans/CI.

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
/plugin install srm@swarm-release-kit
```

Enabling the plugin connects the hosted SRM MCP server at
`https://release-manager.swarmplatform.cloud/mcp` (built in — nothing to fill in)
and authenticates over **OAuth** — you approve the connection in your browser and
pick a workspace, no token to paste. (The client self-registers via OAuth Dynamic
Client Registration.) Optionally install the core CLI for human/CI use:

```
npm install -g @builtbyberry/srm-cli
```

## How the agent reaches the store

The plugin registers the hosted SRM **MCP server**; the skills drive its tools
(`mcp__srm__release_next`, `…__claim_component`, …). The same REST
store also powers the web UI and the `srm` CLI — MCP is just the agent surface.

## What ships in the Claude plugin

| Surface | What it does |
| --- | --- |
| `.mcp.json` | Connects the hosted SRM MCP server at a built-in URL (OAuth — self-registers, browser consent). |
| `skills/release-init` | Born-in-the-store project + release bootstrap via the write-path tools — no GitHub round-trip; external link optional. |
| `skills/release-next` | Startable work, ranked by what it unblocks — across every release in flight, or within one (read-only). |
| `commands/release-status` | `/release-status` — who holds what + drift, at a glance. |
| `hooks/SessionStart` | Optional CLI readiness ping (silent without the CLI). |

## Develop

```
cd cli/srm && npm test                  # the shared core (node --test)
claude plugin validate ./plugins/claude # the Claude plugin
```
