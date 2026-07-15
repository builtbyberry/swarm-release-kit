# @builtbyberry/srm-cli

The **Swarm Release Manager** client — the human path to the same shared store
the agent reaches over MCP. Read-only today: see what's startable and who holds
what, from a terminal or a script.

This is *not* what the Claude plugin's skills call. They drive the store's MCP
tools directly (`mcp__srm__release_next`, …); this CLI is the secondary path for
people, and the fallback the skills name when the MCP server isn't connected.

Zero runtime dependencies. Node ≥ 18.

## Install

```
npm install -g @builtbyberry/srm-cli
srm login
```

## Commands

```
srm login                     sign in via the browser (OAuth 2.1 + PKCE)
srm logout                    forget the stored tokens
srm me                        who this token authenticates as
srm next   --release <ver>    startable work, ranked by what it unblocks (read-only)
srm status --release <ver>    who holds what + drift (read-only)
```

Add `--json` for machine-readable output, or `--project <slug>` when a version
exists in more than one project.

## Signing in

`srm login` registers itself with the store as a public OAuth client, opens your
browser for consent, and catches the redirect on `127.0.0.1`. Nothing to paste,
no client secret, no token to mint by hand — the store's Dynamic Client
Registration means a fresh install works against a store nobody prepared for it.

Tokens land in `~/.config/srm/credentials.json`, written `0600` and kept outside
any repo so they cannot be committed. `srm logout` removes them. The store issues
short-lived tokens (15 days), so expect to sign in again occasionally.

**No browser?** The URL is printed before the browser is opened — visit it from
anywhere and the login still completes. (A true headless flow would use the
store's device grant; that needs a client registered on the store by an operator,
so it isn't wired up yet.)

**CI / non-interactive:** set `SRM_TOKEN` to a bearer for the store. The env
always beats a stored login, so a job can never be hijacked by whoever last ran
`srm login` on the machine. Note the store has no machine-token flow yet, so
there is currently no first-class way to *mint* one for CI.

## Configuration

Resolved per repo, with env overrides:

| Setting   | From `release-config.json` `state`      | Env override  |
| --------- | --------------------------------------- | ------------- |
| backend   | `state.backend` (default `local-json`)  | `SRM_BACKEND` |
| store URL | `state.url` (default: the hosted store) | `SRM_URL`     |
| project   | `state.project`                         | `SRM_PROJECT` |
| token     | `srm login` (never a tracked file)      | `SRM_TOKEN`   |

Store commands only run when `backend` is `srm`, so the CLI stays quiet in repos
that never opted in. `srm login` is exempt — you sign in to a *store*, not to a
repo, so it works from anywhere.

`SRM_CONFIG_HOME` relocates the credentials file (the test suite points it at a
temp dir so it never touches real credentials).

## Develop

```
npm test    # node --test
```
