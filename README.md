# Swarm Release Kit — deprecated, superseded by Marshall

> ### → [builtbyberry/marshall-claude-plugin](https://github.com/builtbyberry/marshall-claude-plugin)
>
> ```
> /plugin marketplace add builtbyberry/marshall-claude-plugin
> /plugin install marshall@marshall
> ```
>
> This repo is no longer developed. The `srm` plugin here still works against the
> same hosted store — nothing is being switched off — but new work happens in
> Marshall.

## Migrating

The store is the same store. The server did not change, and neither does
anything in your repo. Four things are worth knowing, because three of them
routinely get "tidied" into breakage:

1. **`state.backend` in `.claude/release-config.json` stays the literal `"srm"`.**
   Do not change it. That value lives in *your* repo, and the tooling matches on
   it — renaming it to `"marshall"` silently stops recognising every repo already
   opted in. It is an identifier you hold, not a product name we print.
2. **The skills move from `/srm:*` to `/marshall:*`.** Same skills, same
   lifecycle.
3. **The MCP tools re-prefix client-side**, from `mcp__srm__*` to
   `mcp__plugin_marshall_marshall__*`, because the connection is named `marshall`.
   The hosted MCP server is unchanged — this is why Marshall is a clean-slate
   plugin rather than a breaking in-place rename of this one.
4. **`php artisan srm:import-release` keeps its name.** It is a command in the
   hosted app, not this plugin's to rename.

The `marshall` CLI is unaffected and needs no migration — same
`@builtbyberry/marshall-cli` package, same binary. It now lives at
[builtbyberry/marshall-cli](https://github.com/builtbyberry/marshall-cli).
**Upgrade to 0.5.0 or newer if you use it**: 0.4.0 and older show a retired
product name after `marshall login` and their README points at MCP tools that no
host exposes.

---

Release coordination for AI coding agents, backed by the hosted **Swarm Release
Manager (SRM)** store. It lifts release-planning state out of repo-local,
gitignored JSON (`release-plan.json`, `release-state.json`, …) into a shared
store — so **claims, drift, and startability are the same across machines,
people, and agents**.

Agents talk to the store **natively over MCP**; each host plugin just connects
the same hosted MCP endpoint. The `marshall` CLI is the secondary path for humans.

```
swarm-release-kit/
  .claude-plugin/marketplace.json   the marketplace that lists the host plugins
  cli/marshall/                     moved → github.com/builtbyberry/marshall-cli
  plugins/
    claude/                         Claude Code host adapter        ← shipping
    codex/                          (later)
    cursor/                         (later)
```

This was a **monorepo**: one agent-agnostic core plus one plugin per agent host.
The core — the `marshall` CLI — now lives at
[builtbyberry/marshall-cli](https://github.com/builtbyberry/marshall-cli), because
it is agent-agnostic and this repo is organised per host. `cli/marshall/` is a
signpost now, kept because npm's published metadata for older CLI versions links
to that path and cannot be changed.

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
claude plugin validate ./plugins/claude # the Claude plugin
```

The CLI's tests moved with it — run them in
[builtbyberry/marshall-cli](https://github.com/builtbyberry/marshall-cli).
