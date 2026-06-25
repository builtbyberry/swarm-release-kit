---
name: release-topic
description: "Start work on a release component: claim it in the SRM store (the cross-machine lock), then create its topic branch. Use when the user says /release-topic, start <component>, begin work on, or pick up an issue."
---

# Release Topic (SRM)

Start work on a component the right way: **claim it first** in the shared SRM
store — the exclusive, cross-machine lock — then cut the topic branch. The claim
is what stops two people (or agents) from doing the same work on different
machines.

## How it talks to the store

- `mcp__srm__release_next` — confirm the component is startable.
- `mcp__srm__claim_component` — take the lock (returns the claim id + fence).
- `mcp__srm__heartbeat_claim` — keep the lock alive during long work.
- `mcp__srm__release_claim` — hand it back when the work is parked or done
  (or use `/srm:release-unclaim`).

## Procedure

1. Identify the component (by tracker ref or title). If unclear, run
   `/srm:release-next` first and let the user pick.
2. Claim it: `mcp__srm__claim_component { component: <id> }`.
   - **Success** → you hold it; note the returned claim `id` and `fence`.
   - **`claim_conflict`** → someone else holds it (the error names the holder).
     Stop — do not start; surface who has it.
   - **`not_startable`** → blockers unmet or the graph is `unverified`. Stop and
     explain; if unverified, run `/srm:release-graph` first.
3. Only after a successful claim, mark the work started:
   `mcp__srm__set_component_state { component, state: "in_progress" }`, then
   create the topic branch (`<type>/<release>-<ref>-<slug>`) and begin work.
4. During long-running work, call `mcp__srm__heartbeat_claim { claim }`
   periodically so the lease doesn't lapse. If a heartbeat returns `lease_lost`,
   **stop** — the claim was lost or revoked; re-claim before continuing.
5. When the PR **lands**, advance the work-state so dependents unblock:
   `mcp__srm__set_component_state { component, state: "merged" }`. This is
   separate from the lock — releasing the claim alone does NOT mark it merged,
   so a merged blocker won't open its dependents until you set this.
6. Then release the lock (`/srm:release-unclaim` or `mcp__srm__release_claim`).

## Guardrails

- Never start work without a successful claim. A `claim_conflict` or
  `not_startable` is a hard stop, not a warning to work around.
- The claim is the source of truth, not the branch. If you lose the lease, the
  branch doesn't protect you — re-claim.
- One component per claim. To pick up several startable components at once, use
  `/srm:release-parallel` (dispatches a claim each).
