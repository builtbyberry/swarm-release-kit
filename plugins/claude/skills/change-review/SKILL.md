---
name: change-review
description: "Run a multi-lens change review over a release component's diff and record the findings in the shared SRM store (not a local review-state file). Loads the configured change lenses, runs them against the component's diff, and writes findings (kind: change) via record_finding; supports defer/accept/fix/re-open via resolve_finding. Use when the user says /srm:change-review, review this component, change review, or attaches a component diff/PR/branch for an SRM-tracked release."
---

# Change Review (SRM)

Run the change lenses over a **component's diff** and record what they find **in
the shared SRM store** via the findings tools, instead of a repo-local
`review-state.json`. The store is the same across machines, people, and agents —
so a change review one person runs is visible to everyone working the release.

This is the SRM-store port of `multi-expert-change-review`: same lens mechanics
and verdict rubric, but findings are durable store rows (kind `change`) rather
than a local file. It is the change-review counterpart to `/srm:release-readiness`
(kind `readiness`) — readiness is release-wide; change review is **component-scoped**.

## How it talks to the store

- `mcp__srm__release_get` — read the release: its components (for `component_id`
  scoping) **and its existing findings**. This is the state — there is no local
  file to read.
- `mcp__srm__record_finding` — record a new change finding
  (`{ release, kind: "change", ref, severity, summary, rationale?, component_id }`).
- `mcp__srm__resolve_finding` — transition a finding
  (`{ finding, status, rationale? }`): `deferred | accepted | fixed | open`.

(If the MCP server isn't connected, stop and say so — there is no local fallback
for store findings.)

## Config

Reads `.claude/release-config.json` from the current checkout. Refuses if missing
— point the user at `/release-init`.

Fields used:
- `reviews.change.lenses` — array of lens slugs to load and run. Each slug must
  resolve to `~/.claude/skills/_lenses/<slug>.md`. Refuse on any unresolved slug
  or malformed frontmatter — do not silently skip.

The lens catalog format is at `~/.claude/skills/_lenses/_format.md`.

## The store is the state (no local file)

Unlike the non-SRM change-review skill, this one keeps **no** `review-state.json`.
Open/deferred/accepted/fixed findings are read straight from the release document
(`release_get` → `findings`, filtered to `kind: "change"`). Never create or write
a local findings file here.

### Status lifecycle (store-defined)

The store enforces the lifecycle; this skill only ever asks for a legal move:

- `open → deferred | accepted | fixed`
- `deferred → accepted | fixed | open` (re-open)
- `accepted` and `fixed` are **terminal**

There is **no `fixed-verified` status** in the store — the non-SRM skill has one;
this port drops it. `fixed` is terminal, so `verify` mode re-examines and
**reports**, but never transitions a finding. An illegal move (e.g. `fixed → open`)
returns `invalid_finding_transition` from the store — surface it verbatim; never
work around it.

## Scope: one component's diff

Change review is scoped to a single component, so every finding it records carries
that component's `component_id`. Resolve the component before reviewing.

### Resolving the component (fail-loud)

Resolve from three signals:

1. an explicit tracker ref the user named (`/srm:change-review #10`),
2. the active SRM claim on a component,
3. the current branch name `<type>/<release>-<ref>-<slug>`.

The priority order (ref → claim → branch) applies **only to fill absent signals**.
**Any disagreement between two present signals is ambiguity — STOP and ask.** For
example, a claim on `#10` while the branch encodes `#11` means the diff under
review and the finding's `component_id` would refer to different components; do not
let the higher-priority signal silently win. If the component cannot be pinned to
exactly one, **stop and ask** — never default to "the release" or guess. The store
validates that `component_id` is a *member* of the release but not that it is the
*correct* one, so a wrong-but-valid id mis-scopes silently; this step is what makes
mis-scope fail loud instead.

### Gathering the diff (fresh base)

```bash
git fetch origin <default-branch>                       # avoid a stale base
BASE=$(git merge-base origin/<default-branch> HEAD)
git diff "$BASE"..HEAD --name-only                      # changed files
git diff "$BASE"..HEAD                                  # the change under review
```

Fetch before computing the merge-base: a stale local ref resolves to an old commit
and pulls already-merged work into the diff, producing findings about code that is
not part of this component. Use `default_branch` from `.claude/release-config.json`.

## Review process

### Step 1 — Resolve the release + component, load the store state

Resolve the release version (ask if ambiguous — don't guess) and the component (see
**Resolving the component** above). Then `mcp__srm__release_get { release }` to load:
- the components (ids, titles, refs) — to confirm the resolved `component_id`, and
- the **existing findings**, filtered to `kind: "change"` — so this run reconciles
  against them (Step 5).

### Step 2 — Gather the component diff

Compute the diff as in **Gathering the diff** above. Read `CHANGELOG.md` and any
files the lenses care about. Know what changed before forming a view.

### Step 3 — Load and run lenses

1. Read `reviews.change.lenses` from `.claude/release-config.json`. If empty,
   refuse and point the user at `/release-init`.
2. For each slug, load `~/.claude/skills/_lenses/<slug>.md`. Refuse on unresolved
   slug or malformed frontmatter.
3. For each lens, evaluate its `## Purpose` against the diff; if its "skip when"
   condition fires, note "lens skipped (not applicable to this diff)" and move on.
4. For lenses that apply, walk `## Questions to ask`, scan `## Anti-patterns to
   flag`, anchor against `## Examples` and `## Severity calibration`, and use
   `## How findings from this lens sound` to shape the voice of each finding.
   Attribute each finding to its primary lens by its frontmatter `name`.

### Step 4 — Cross-lens synthesis

Do one integration pass using each lens's `related:` array. When a finding was
surfaced or sharpened by another lens, note it: `*(+ <lens-name> via synthesis)*`.

### Step 5 — Reconcile against the store, then record (idempotent re-run)

`record_finding` is **not idempotent** — calling it again writes another row. So
before recording, reconcile each fresh finding against the existing `kind: "change"`
findings loaded in Step 1:

- **Semantic match to an existing `open` or `deferred` change finding** — match on
  `(component_id + normalized summary)`, **never on the `ref`** (refs renumber each
  run). When a match is ambiguous, **bias toward "already-tracked" and do not
  record**: a missed-as-new finding still prints below and is recoverable, but a
  duplicate durable row is the failure mode this step exists to prevent. Carry the
  existing status and id.
- **Match to an `accepted` or `fixed` finding** → suppress (already resolved),
  unless the issue has genuinely regressed — then record a new one and say so.
- **No match** → record it: `record_finding { release, kind: "change", ref,
  severity, summary, rationale?, component_id }`. Always pass the resolved
  `component_id`.

Always report `recorded N / already-tracked M` so any duplicate is immediately
visible. Recording twice in the same review run is the failure mode this step
exists to prevent.

> **Concurrent reviews:** reconcile is read-then-write with no findings lock, and
> the component claim does not lock the review *action* — two reviewers running on
> the same component simultaneously can each record a row. This is an accepted
> residual: the `recorded / already-tracked` count surfaces it and `resolve_finding`
> cleanup is cheap.

## Severity gate

- **high:** fix before release.
- **medium:** fix now unless explicitly deferred with an owner.
- **low:** may defer if documented.

## Verdict and release impact rubric

**Release impact**
- **blocker:** any unmitigated `high`, inability to roll back safely, or missing
  safety-relevant control — unless accepted risk and owner are explicitly recorded
  (as an `accepted` finding).
- **non-blocker:** no open `high`, or each `high` has a recorded mitigation path.

**Consolidated verdict**
- **changes-required:** one or more `high` without documented mitigation, or a
  fundamental design/API/changelog mismatch.
- **approve-with-followups:** `medium`/`low` remain (or deferred `medium` with a
  named owner), no blocker-level gap.
- **approve:** no material findings; open gaps minor or absent; tradeoffs recorded.

## Output format

### Verdict (always first)

## `<verdict>` · `<release impact>` · component `<ref>`
- `N high` · `N medium` · `N low` · `N open gaps`
- **Recorded:** N new change findings written to the store · M already tracked
  (or `none — all already tracked`).
- **Passes:** only areas at risk given this change that came back clean.
- **Carry-forward:** `id` deferred · `id` accepted — omit if the store has none.

---

### Findings (one H3 per finding, high → medium → low)

### F1 · `<severity>` · `<Primary lens>` *(+ Secondary lens via synthesis)*
- **Where:** [`path:line`](path) or `CHANGELOG.md` / migration / config
- **Issue:** one sentence on what is wrong or risky.
- **Fix:** one sentence concrete fix, test, doc change, or escalation.
- **Store:** `recorded <id>` (new) or `already tracked <id> (<status>)`.

Separate findings with `---`. Omit the synthesis parenthetical if single-lens. Use
`None — informational` for Fix only on `low` findings where no action is warranted.

### Open gaps (one H3 per gap)

### OG1 · `<Lens>`
One sentence on what cannot be verified and what would confirm or refute it.

### Tradeoffs (inline)

One line per tradeoff: **Chosen** — **Rejected** — **Rationale** — **Recorded in**.
If none: `Tradeoffs: none identified.`

If no fresh findings, write `No new findings.` after the verdict and still show any
open/deferred store findings.

## Compressed pass (trivial changes)

For a trivial diff, emit the verdict section followed by one sentence per lens.
Expand any lens that surfaces non-trivial risk to a full finding.

## Post-review actions

These map 1:1 onto `resolve_finding`. Resolve the `F#` the user names to its store
`id` via the most recent review output or `release_get`.

### Defer

`"defer F3"` or `"defer F3 — fix lands next sprint"`:
`resolve_finding { finding: <id>, status: "deferred", rationale }`.

### Accept

`"accept F2 — documented in maintenance.md instead"`:
`resolve_finding { finding: <id>, status: "accepted", rationale }`.
Acceptance means no fix is planned; use defer when a fix is intended but not now.

### Mark fixed

`"mark F1 as fixed"` (optionally with a rationale):
`resolve_finding { finding: <id>, status: "fixed", rationale? }`. Terminal.

### Re-open

`"re-open F3"` (only from `deferred`):
`resolve_finding { finding: <id>, status: "open" }`. From a terminal status the
store returns `invalid_finding_transition` — surface it; don't force it.

### Verify

`"verify F1 F2"`: re-examine the referenced findings against the current code and
report `✓ resolved` / `✗ unresolved`. The store has no verified state — if a
`fixed` finding is confirmed resolved, leave it `fixed` and say so; if a still-open
finding is confirmed resolved, offer to `mark fixed`.

### List

`"show change findings"` / `"what's deferred"`: `release_get { release }`, filter
`findings` to `kind: "change"`, group by status (open / deferred / accepted /
fixed) with each finding's `id`, `ref`, `severity`, and `summary`.

## Guardrails

- Record only `kind: "change"` findings here. Readiness findings are
  `/srm:release-readiness`'s job (`kind: "readiness"`); design findings are the
  design gate's (`kind: "design"`).
- Scope to one component: resolve it fail-loud, and pass its `component_id` on every
  recorded finding. A signal conflict is a stop-and-ask, not a guess.
- Reconcile before recording — never write a duplicate of a finding the store
  already holds open. Filter every `release_get` read to `kind: "change"`.
- The store enforces the lifecycle. Ask only for legal transitions; surface
  `invalid_finding_transition` verbatim rather than working around it. There is no
  `fixed-verified`.
- The store is the source of truth — do not create a local change-review state file.
