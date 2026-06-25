---
name: release-next
description: "Recommend the next startable release work from the Swarm Release Manager store. Use when the user says /release-next, what is next, what should I work on, or I have a time budget."
---

# Release Next (SRM)

Recommend 1–3 startable components from a release, reading the **shared SRM
store** through its MCP tools instead of a repo-local `release-plan.json`. This
is read-first; it never claims work.

It is the proof of the lift — startability is computed *server-side* from the
release's dependency graph and live claims, so two people (or an agent and a
human) on different machines see the same truth.

## How it talks to the store

This plugin connects the SRM MCP server (configured with your store URL + token
when you enabled the plugin). Use its tools directly:

- `mcp__srm__release_next` — startable work, ranked by what it unblocks
- `mcp__srm__release_status` — who holds what + drift
- `mcp__srm__release_get` — the full release document

If those tools aren't available (the MCP server isn't connected), fall back to
the `srm` CLI: `srm next --release <version> --json`. Same data, secondary path.

## Procedure

1. Resolve the release version. If the user didn't give one and it's ambiguous,
   ask — do not guess.
2. Call `mcp__srm__release_next` with `{ release: "<version>" }`
   (add `project` only to disambiguate the same version across projects).
3. Render the result:
   - `startable` non-empty → recommend the top 1–3 (already ranked).
   - `startable` empty → report what's blocking from `blocked_summary`
     (e.g. `{ "unverified": 1 }`, `{ "blocked": 2 }`).
   - Tool error → surface it verbatim (`release_not_found`, an auth/connection
     problem). Do not paper over it.

## Output

For each recommendation (already ranked by what it unblocks):

- tracker ref + title (e.g. `#42 Audit trace CLI`)
- why it's startable now (no unmet blockers, graph verified, unheld)
- what it unblocks (its position on the critical path)

End with:

- `start <ref>` to begin work — claim it with `mcp__srm__claim_component`
- to take more than one, claim each with `/srm:release-topic` (concurrent
  dispatch via `/srm:release-parallel` is planned, not yet available)

## Guardrails

- Do not claim, heartbeat, or release here — recommending is read-only. The
  claim lifecycle is a deliberate next step.
- Do not invent startability. If `release_next` returns nothing, the answer is
  "nothing is startable, here's why" — never relax the server's verdict.
- If the graph is `unverified`, say so plainly: the release needs
  `/release-graph` before work is safe to start (the store's fail-safe default).
