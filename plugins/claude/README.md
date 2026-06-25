# Swarm Release Manager (Claude)

The **Claude Code** host adapter for the hosted Swarm Release Manager store. It
lifts release-planning state out of repo-local, gitignored JSON into a shared
store the `release-*` skills read and drive over REST — so claims, drift, and
startability are the same across machines, people, and agents.

The release logic lives in the agent-agnostic `srm` CLI (`../../cli/srm`); this
plugin shells out to it. codex / cursor adapters will wrap the same CLI.

## What's here

```
plugins/claude/
  .claude-plugin/plugin.json   manifest + userConfig (srm_token, keychain)
  commands/release-status.md   /release-status — who holds what + drift
  skills/release-next/         startable work, ranked (read-only)
  hooks/hooks.json             SessionStart: surface store connection
  scripts/session-start.sh     the hook body (silent for non-SRM repos)
```

## Config

- **Token** — set `srm_token` when you enable the plugin; it's stored in your
  system keychain, never in a repo. (`SRM_TOKEN` in the environment also works.)
- **Store URL + project** — from the repo's `.claude/release-config.json`
  `state` block. A repo opts in with `state.backend = "srm"`; otherwise the
  plugin stays silent and the local-JSON `release-*` skills run as before.

## Prerequisite

The `srm` CLI on `PATH`: `npm i -g @builtbyberry/srm-cli`.

## Status

Early. `release-next` + `release-status` (read path) are wired end-to-end as the
proof of the lift. The write-path skills (claim / heartbeat / release) and the
rest of the lifecycle follow — along with an MCP server surface and a
`release-worker` agent.
