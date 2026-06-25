# @builtbyberry/srm-cli

The **Swarm Release Manager** client — the agent-agnostic core the `release-*`
skills shell out to so release-planning state lives in the shared SRM store, not
repo-local JSON. Host adapters (the Claude Code plugin today; codex / cursor
later) wrap these commands.

Zero runtime dependencies. Node ≥ 18.

## Commands

```
srm me                        who this token authenticates as
srm next --release <version>  startable work, ranked by what it unblocks (read-only)
```

Add `--json` for machine-readable output.

## Configuration

Resolved per repo, with env overrides:

| Setting  | From `release-config.json` `state` | Env override   |
| -------- | ---------------------------------- | -------------- |
| backend  | `state.backend` (default `local-json`) | `SRM_BACKEND` |
| store URL| `state.url`                        | `SRM_URL`      |
| project  | `state.project`                    | `SRM_PROJECT`  |
| token    | — (never from a file)              | `SRM_TOKEN`    |

The CLI only talks to the store when `backend` is `srm`. The token is a secret
and is read **only** from the environment.

## Develop

```
npm test    # node --test
```
