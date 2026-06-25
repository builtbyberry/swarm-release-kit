---
name: release-readiness
description: "Run a release readiness review and record its findings in the shared SRM store (not a local review-state file). Loads the configured readiness lenses, runs them against the release, and writes findings via record_finding; supports defer/accept/fix/re-open via resolve_finding. Use when the user says /srm:release-readiness, is this release ready, readiness review, pre-release checklist, or asks about migration safety, tenant safety, or deploy readiness for an SRM-tracked release."
---

# Release Readiness (SRM)

Run the readiness lenses for a release and record what they find **in the shared
SRM store** via the findings tools, instead of a repo-local `review-state.json` /
`release-state.json`. The store is the same across machines, people, and agents —
so a readiness review one person runs is visible to everyone working the release.

This is the SRM-store port of `swarm-release-readiness` / `release-readiness`:
same lens mechanics and verdict rubric, but findings are durable store rows
(kind `readiness`) rather than a local file.

## How it talks to the store

- `mcp__srm__release_get` — read the release: its components **and its existing
  findings**. This is the state — there is no local file to read.
- `mcp__srm__record_finding` — record a new readiness finding
  (`{ release, kind: "readiness", ref, severity, summary, rationale?, component_id? }`).
- `mcp__srm__resolve_finding` — transition a finding
  (`{ finding, status, rationale? }`): `deferred | accepted | fixed | open`.

(If the MCP server isn't connected, stop and say so — there is no local fallback
for store findings.)

## Config

Reads `.claude/release-config.json` from the current checkout. Refuses if missing
— point the user at `/release-init`.

Fields used:
- `reviews.readiness.lenses` — array of lens slugs to load and run. Each slug must
  resolve to `~/.claude/skills/_lenses/<slug>.md`. Refuse on any unresolved slug
  or malformed frontmatter — do not silently skip.
- `wrap.mode` — informational (the verdict language matches deploy vs tag).

The lens catalog format is at `~/.claude/skills/_lenses/_format.md`.

## The store is the state (no local file)

Unlike the non-SRM readiness skills, this one keeps **no** `release-state.json`.
Open/deferred/accepted/fixed findings are read straight from the release document
(`release_get` → `findings`, filtered to `kind: "readiness"`). Never create or
write a local findings file here.

### Status lifecycle (store-defined)

The store enforces the lifecycle; this skill only ever asks for a legal move:

- `open → deferred | accepted | fixed`
- `deferred → accepted | fixed | open` (re-open)
- `accepted` and `fixed` are **terminal**

There is no `fixed-verified` status in the store — `fixed` is terminal. `verify`
mode therefore re-examines and **reports**, but does not transition a finding.
An illegal move (e.g. `fixed → open`) returns `invalid_finding_transition` from
the store — surface it verbatim; never work around it.

## Review process

### Step 1 — Resolve the release + load the store state

Resolve the release version (ask if ambiguous — don't guess). Then
`mcp__srm__release_get { release }` to load:
- the components (ids, titles, refs) — for `component_id` scoping, and
- the **existing findings** — so this run reconciles against them (Step 5).

### Step 2 — Gather release context

```bash
git log <release-base>..HEAD --oneline      # commits on the release branch
git diff <release-base>..HEAD --name-only   # changed files
```

Read `CHANGELOG.md` (the "Unreleased"/active section) and any migration/config
files the lenses care about. Know what changed before forming a view.

### Step 3 — Load and run lenses

1. Read `reviews.readiness.lenses` from `.claude/release-config.json`. If empty,
   refuse and point the user at `/release-init`.
2. For each slug, load `~/.claude/skills/_lenses/<slug>.md`. Refuse on unresolved
   slug or malformed frontmatter.
3. For each lens, evaluate its `## Purpose` against the release context; if its
   "skip when" condition fires, note "lens skipped" and move on.
4. For lenses that apply, walk `## Questions to ask`, scan `## Anti-patterns to
   flag`, anchor against `## Examples` and `## Severity calibration`, and use
   `## How findings from this lens sound` to shape the voice of each finding.

### Step 4 — Cross-lens synthesis

Do one integration pass using each lens's `related:` array. When a finding was
surfaced or sharpened by another lens, note it: `*(+ <lens-name> via synthesis)*`.

### Step 5 — Reconcile against the store, then record (idempotent re-run)

`record_finding` is **not idempotent** — calling it again writes another row. So
before recording, reconcile each fresh finding against the existing store
findings loaded in Step 1:

- **Semantic match to an existing `open` or `deferred` readiness finding**
  (same underlying issue — match on summary/component, not the `ref`, which
  renumbers each run) → **do not record again**. Surface it as already-tracked,
  carrying its existing status and id.
- **Match to an `accepted` or `fixed` finding** → suppress (already resolved),
  unless the issue has genuinely regressed — then record a new one and say so.
- **No match** → record it: `record_finding { release, kind: "readiness", ref,
  severity, summary, rationale?, component_id? }`. Use `component_id` only when
  the finding is about a specific component of this release.

Report which findings were newly recorded vs. already tracked. Recording twice in
the same review run is the failure mode this step exists to prevent.

## Severity gate

- **high:** fix before shipping.
- **medium:** fix now unless explicitly deferred with an owner.
- **low:** may defer if documented.

## Verdict and release impact rubric

**Release impact**
- **blocker:** any unmitigated `high`, inability to roll back safely, broken CI,
  or an inverted conservative security/deploy default — unless accepted risk and
  owner are explicitly recorded (as an `accepted` finding).
- **non-blocker:** no open `high`, or each `high` has a recorded mitigation path.

**Consolidated verdict**
- **hold:** one or more `high` without documented mitigation, CI failing, or a
  fundamental migration/deploy mismatch.
- **ship-with-followups:** `medium`/`low` remain (or deferred `medium` with a
  named owner), no blocker-level gap.
- **ship:** no material findings; open gaps minor or absent; tradeoffs recorded.

## Output format

### Verdict (always first)

## `<verdict>` · `<release impact>`
- `N high` · `N medium` · `N low` · `N open gaps`
- **Recorded:** N new readiness findings written to the store (or `none — all already tracked`).
- **Passes:** only areas at risk given the changes that came back clean.
- **Carry-forward:** `id` deferred · `id` accepted — omit if the store has none.

---

### Findings (one H3 per finding, high → medium → low)

### F1 · `<severity>` · `<Primary lens>` *(+ Secondary lens via synthesis)*
- **Where:** [`path:line`](path) or `CHANGELOG.md` / migration / config
- **Issue:** one sentence on what is wrong or risky.
- **Fix:** one sentence concrete fix.
- **Store:** `recorded <id>` (new) or `already tracked <id> (<status>)`.

Separate findings with `---`. Omit the synthesis parenthetical if single-lens.

### Open gaps (one H3 per gap)

### OG1 · `<Lens>`
One sentence on what cannot be verified and what would confirm or refute it.

### Tradeoffs (inline)

One line per tradeoff: **Chosen** — **Rejected** — **Rationale** — **Recorded in**.
If none: `Tradeoffs: none identified.`

If no fresh findings, write `No new findings.` after the verdict and still show
any open/deferred store findings.

## Post-review actions

These map 1:1 onto `resolve_finding`. Resolve the `F#` the user names to its store
`id` via the most recent review output or `release_get`.

### Defer

`"defer F3"` or `"defer F3 — migration ships in the next release"`:
`resolve_finding { finding: <id>, status: "deferred", rationale }`.

### Accept

`"accept F2 — documented in runbook instead"`:
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

`"show readiness findings"` / `"what's deferred"`: `release_get { release }`,
filter `findings` to `kind: "readiness"`, group by status (open / deferred /
accepted / fixed) with each finding's `id`, `ref`, `severity`, and `summary`.

## Guardrails

- Record only `kind: "readiness"` findings here. Change-review findings are
  `/srm:change-review`'s job (`kind: "change"`).
- Reconcile before recording — never write a duplicate of a finding the store
  already holds open.
- The store enforces the lifecycle. Ask only for legal transitions; surface
  `invalid_finding_transition` verbatim rather than working around it.
- The store is the source of truth — do not create a local readiness state file.
