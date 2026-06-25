# Changelog

All notable changes to the Swarm Release Manager (Claude) plugin are documented
in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- `/srm:release-readiness` skill — run the configured readiness lenses for a
  release and record their findings in the shared SRM store (`kind: readiness`)
  via `record_finding`, with defer/accept/fix/re-open through `resolve_finding`.
  The store port of `swarm-release-readiness`: findings are durable store rows,
  reconciled on re-run (no duplicates) and read back from the release document
  instead of a repo-local `review-state.json`.
