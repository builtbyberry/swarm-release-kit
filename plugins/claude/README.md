# Swarm Release Manager (Claude)

The **Claude Code** host adapter for the hosted Swarm Release Manager store. It
lifts release-planning state out of repo-local, gitignored JSON into a shared
store, so claims, drift, and startability are the same across machines, people,
and agents.

The agent talks to the store **natively over MCP** — this plugin connects the
hosted SRM MCP server, and the skills drive its tools. The agent-agnostic `srm`
CLI (`../../cli/srm`) stays as a secondary path for humans, CI, and hooks.
codex / cursor adapters will register the same MCP endpoint.

## What's here

```
plugins/claude/
  .claude-plugin/plugin.json   manifest + userConfig (srm_url, srm_token)
  .mcp.json                    connects the hosted SRM MCP server (bearer auth)
  commands/release-status.md   /release-status — who holds what + drift
  skills/release-next/         startable work, ranked (read-only)
  hooks/hooks.json             SessionStart: optional CLI readiness ping
  scripts/session-start.sh     the hook body (silent without the CLI)
```

The MCP tools appear as `mcp__swarm-release__release_next`,
`…__release_status`, `…__release_get`, `…__claim_component`,
`…__heartbeat_claim`, `…__release_claim`, `…__revoke_claim`.

## Config (set when you enable the plugin)

- **`srm_url`** — base URL of your SRM store; the MCP server connects at `<url>/mcp`.

Auth is **OAuth 2.1** (authorization-code + PKCE, Dynamic Client Registration):
the client self-registers, you approve the connection in your browser and pick
the workspace it may operate in — no token to paste or store. No per-repo opt-in
is needed; enabling the plugin connects it. (The secondary `srm` CLI authenticates
with its own bearer token from the environment for human/CI use.)

## Status

`release-next` + `release-status` (read path) are wired over MCP end-to-end, and
the claim lifecycle tools (`claim_component` → `heartbeat_claim` →
`release_claim`, plus `revoke_claim`) are available. Skills for the write path
and the rest of the lifecycle follow, along with a `release-worker` agent.
