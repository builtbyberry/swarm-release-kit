# Releasing

This repo ships **one artifact**: the Claude plugin.

| Artifact | Version lives in | Tag | Released by |
| --- | --- | --- | --- |
| Claude plugin | `plugins/claude/.claude-plugin/plugin.json` + `CHANGELOG.md` heading | `vX.Y.Z` | the steps below |

`@builtbyberry/marshall-cli` **used to** release from here on a `cli-v*` tag. It
now releases from
[builtbyberry/marshall-cli](https://github.com/builtbyberry/marshall-cli) on a
plain `v*` tag, and this repo can no longer publish it — `cli-publish.yml` is
gone, so a `cli-v*` tag here does nothing.

That is why the `cli-` prefix existed at all: `v*` was the plugin's, and a shared
prefix would have made every plugin release try to publish the CLI. With one
artifact per repo, neither needs a qualifier — but note the consequence, because
it points a loaded gun at this repo's own history: **the `v*` tags here
(`v0.7.0` … `v0.9.0`) are the plugin's, and they now match marshall-cli's publish
trigger.** Never push this repo's tags to that one.

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

**Moved.** `@builtbyberry/marshall-cli` releases from
[builtbyberry/marshall-cli](https://github.com/builtbyberry/marshall-cli); see
that repo's `.github/workflows/publish.yml`. Nothing here publishes it.

Two things that were true here and are **not** true there, so this section is not
a stale map of the new home:

- **No `NPM_TOKEN`.** It publishes via npm trusted publishing (OIDC), so there is
  no secret to hold. This repo's `NPM_TOKEN` secret is now dead weight with live
  publish rights on the `@builtbyberry` scope — delete it.
- **`repository.url` points at the NEW repo.** npm attests the tarball against
  the repo whose workflow built it, so it must name marshall-cli. The note that
  used to live here said "point at THIS repo", which is exactly wrong now and is
  the reason it is rewritten rather than left.
