---
description: Show who holds what and what drifted in a release, from the shared SRM store.
argument-hint: "[release-version]"
allowed-tools: Bash(srm *)
---

# Release Status (SRM)

Show the live coordination picture for a release from the shared Swarm Release
Manager store: what's startable, who currently holds which component (and on
which machine), and what has **drifted** — holds that went quiet and silently
reopened. This is the cross-machine signal that repo-local JSON can't give you.

Read-only. This never claims, releases, or mutates anything.

## Steps

1. Resolve the release version. If `$ARGUMENTS` is empty, ask the user which
   release (or use the one in context). Do not guess.
2. Call `mcp__swarm-release__release_status` with `{ release: "$ARGUMENTS" }`
   and render the result:
   - `held` — live holds (each with the actor + machine). Lead with these.
   - `drifting` — dropped holds that reopened. Call these out; they're the thing
     most likely to surprise a teammate.
   - `startable` — the count still ready to pick up.
   - If the MCP server isn't connected, fall back to `srm status --release $ARGUMENTS`.
3. On a tool error, surface it verbatim (`release_not_found`, auth/connection).
   Don't paper over it.

For *what to start next* (ranked by what it unblocks), use `/release-next`.
