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
2. Run the client and render its output:

   ```
   srm status --release $ARGUMENTS
   ```

   - `● held` lines = live holds (who, where).
   - `◌ drifting` lines = dropped holds that reopened — call these out; they're
     the thing most likely to surprise a teammate.
   - The header tallies startable / held / drifting.
3. If the command exits non-zero, surface the store's error verbatim (it fails
   loud: auth, unreachable store, or a repo that hasn't opted into SRM). Don't
   paper over it.

For *what to start next* (ranked by what it unblocks), use `/release-next`.
