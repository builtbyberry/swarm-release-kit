# Changelog

All notable changes to the Swarm Release Manager (Claude) plugin are documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- `/srm:change-review` skill — run the configured change lenses over a release
  component's diff and record their findings in the shared SRM store
  (`kind: change`) via `record_finding`, with defer/accept/fix/re-open through
  `resolve_finding`. The store port of `multi-expert-change-review`: findings are
  durable store rows scoped to the component (fail-loud component resolution),
  reconciled on re-run (no duplicates) and read back from the release document
  instead of a repo-local `review-state.json`.
- `/srm:release-readiness` skill — run the configured readiness lenses for a
  release and record their findings in the shared SRM store (`kind: readiness`)
  via `record_finding`, with defer/accept/fix/re-open through `resolve_finding`.
  The store port of `swarm-release-readiness`: findings are durable store rows,
  reconciled on re-run (no duplicates) and read back from the release document
  instead of a repo-local `review-state.json`.

### Changed

- `/srm:change-review` and `/srm:release-readiness` now resolve **lenses from the
  SRM store**, not local files. Lens *selection* comes from the release document
  (`project.reviews.<scope>.lenses` via `release_get`) and lens *definitions* from
  `lenses_get` — there is no `~/.claude/skills/_lenses` fallback, and an empty
  selection or an unresolved slug fails loud. So a clean `srm` install reviews
  with no machine-global catalog and no repo-local lens config. Both skills now
  **fan out one subagent per lens in parallel**, then aggregate, synthesize, and
  record centrally (recording stays idempotent). (Requires the backend lens
  table + `lenses_get`/`set_release_lenses` tools.)
