# Swarm Release Kit

Release coordination for AI coding agents, backed by the hosted **Swarm Release
Manager (SRM)** store. It lifts release-planning state out of repo-local,
gitignored JSON (`release-plan.json`, `release-state.json`, …) into a shared
store — so **claims, drift, and startability are the same across machines,
people, and agents**.

Agents talk to the store **natively over MCP**; each host plugin just connects
the same hosted MCP endpoint. The `marshall` CLI is the secondary path for humans.

This is a **monorepo**: one agent-agnostic core, one plugin per agent host.

```
swarm-release-kit/
  .claude-plugin/marketplace.json   the marketplace that lists the host plugins
  cli/marshall/                     the `marshall` client (npm: @builtbyberry/marshall-cli)
  plugins/
    claude/                         Claude Code host adapter        ← shipping
    codex/                          (later)
    cursor/                         (later)
```

Host plugins drive the store's **MCP tools** directly; the `srm` CLI is the
separate human/CI path to the same REST store. (This once read "every host plugin
is a thin wrapper that shells out to the `srm` CLI" — that stopped being true when
the agent surface moved to MCP, and the next section has described the MCP path
for several releases.)

## Install (Claude Code)

```
/plugin marketplace add builtbyberry/swarm-release-kit
/plugin install srm@swarm-release-kit
```

Enabling the plugin connects the hosted SRM MCP server at
`https://release-manager.swarmplatform.cloud/mcp` (built in — nothing to fill in)
and authenticates over **OAuth** — you approve the connection in your browser and
pick a workspace, no token to paste. (The client self-registers via OAuth Dynamic
Client Registration.) Optionally install the CLI, the human path to the same
store — it signs in the same way, over OAuth in your browser:

```
npm install -g @builtbyberry/marshall-cli
marshall login
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
cd cli/marshall && npm test             # the CLI (node --test)
claude plugin validate ./plugins/claude # the Claude plugin
```
