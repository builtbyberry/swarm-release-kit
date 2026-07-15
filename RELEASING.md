# Releasing

This repo ships **two independently versioned artifacts**. They do not move
together and must not share a tag prefix:

| Artifact | Version lives in | Tag | Released by |
| --- | --- | --- | --- |
| Claude plugin | `plugins/claude/.claude-plugin/plugin.json` + `CHANGELOG.md` heading | `vX.Y.Z` | the steps below |
| `@builtbyberry/srm-cli` | `cli/srm/package.json` | `cli-vX.Y.Z` | [CLI releases](#cli-releases) |

The plugin is 0.9.x while the CLI is 0.2.x — that is expected, not drift. Bumping
one because the other moved is the mistake.

## The plugin

The plugin version lives in three places that must always agree:

- `plugins/claude/.claude-plugin/plugin.json` → `version`
- the latest dated section heading in `CHANGELOG.md`
- the git tag

## The rule that keeps them coherent

**Bump the version only at release — never per commit.**

The drift this file exists to prevent: `plugin.json` was hand-bumped on nearly
every feature commit (0.1.0 → 0.6.1) while nothing was ever tagged and the
changelog sat under a single `## Unreleased`. The manifest became a per-commit
counter instead of a release version. Don't do that.

Day to day: land changes under the `## Unreleased` section of `CHANGELOG.md` and
**leave `plugin.json` alone**.

## What enforces it

`scripts/check-release-coherence.mjs`, run on every PR and push to main by
`.github/workflows/release-coherence.yml`. It fails the build on the three ways
this has actually gone wrong:

1. the manifest version moving outside a `chore(release): vX.Y.Z` commit,
2. a dated `CHANGELOG` version with no matching tag,
3. the manifest and the newest dated `CHANGELOG` heading disagreeing.

It exists because the rule above did not hold on its own. It was written after the
manifest had been hand-bumped 0.1.0 → 0.6.1 with nothing tagged — and then **0.8.1
drifted anyway**: bumped inside a fix PR rather than a release commit, it never
reached step 5 below and shipped untagged for nine days, noticed only by accident
while cutting 0.9.0. A convention holds only as well as the thing that verifies it.

Run it yourself before cutting:

```sh
node scripts/check-release-coherence.mjs
```

With no arguments it audits **every** released version, not just the one you are
cutting. That matters: the 0.8.1 gap was invisible from 0.9.0's point of view —
cutting 0.9.0 looked perfectly coherent while 0.8.1 sat untagged behind it.

## Cutting a release

1. Choose the next version per SemVer — features → minor, fixes → patch, breaking
   → major (pre-1.0, breaking changes may stay within `0.x`).
2. In `CHANGELOG.md`, rename `## Unreleased` to `## [X.Y.Z] - YYYY-MM-DD` and add a
   fresh empty `## Unreleased` above it.
3. Set `plugin.json` `version` to `X.Y.Z`.
4. Commit: `chore(release): vX.Y.Z`.
5. Tag and push:

   ```sh
   git tag -a vX.Y.Z -m "vX.Y.Z — <one-line summary>"
   git push origin main vX.Y.Z
   ```

One tag per version. The tag, the changelog heading, and the manifest version are
the same string. If they ever diverge, the manifest is a per-commit counter again
and the drift is back.

## CLI releases

`@builtbyberry/srm-cli` publishes to npm from a `cli-v*` tag — the tag IS the
release, so there is no manual `npm publish` from a laptop. (A hand-published
package is how you get a version no tag points at, which is exactly the plugin's
0.8.1 story with an npm tarball attached.)

1. Bump `cli/srm/package.json` `version` per SemVer.
2. Commit: `chore(release): cli-vX.Y.Z`.
3. Tag and push:

   ```sh
   git tag -a cli-vX.Y.Z -m "cli-vX.Y.Z — <one-line summary>"
   git push origin main cli-vX.Y.Z
   ```

`.github/workflows/cli-publish.yml` then verifies the tag matches the manifest,
runs the tests, and publishes with npm provenance. **It refuses to publish on a
mismatch** — the CLI has no changelog to cross-check, so the tag and the manifest
are its only two strings and publish time is the only moment they can be checked.

Requires an `NPM_TOKEN` repo secret (an npm automation token with publish rights
on the `@builtbyberry` scope). Provenance additionally needs
`cli/srm/package.json`'s `repository.url` to point at THIS repo — npm attests the
tarball against the workflow's repo, so a stale URL fails the publish outright.
