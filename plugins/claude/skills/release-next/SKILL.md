---
name: release-next
description: "Recommend the next startable release work from the Swarm Release Manager store. Use when the user says /release-next, what is next, what should I work on, or I have a time budget — in a repo whose release-config.json opts into the SRM backend."
---

# Release Next (SRM-backed)

Recommend 1–3 startable components from the active release, reading the **shared
SRM store** over REST instead of a repo-local `release-plan.json`. This is the
SRM variant of `release-next`: read-first, it never claims work.

It is the proof of the lift — startability is computed *server-side* from the
release's dependency graph and live claims, so two people (or an agent and a
human) on different machines see the same truth.

## When this applies

Only when this repo opts into SRM. Check `.claude/release-config.json`:

```jsonc
"state": { "backend": "srm", "url": "https://…", "project": "<project-slug>" }
```

If `state.backend` is absent or not `"srm"`, this skill does not apply — defer
to the local-JSON `release-next`. Never edit a repo's backend choice yourself.

## Inputs

- `.claude/release-config.json` `state` block (store URL + project) — resolved by the CLI.
- The actor's API token. As the Claude plugin it's the `srm_token` you set at
  enable time (kept in your system keychain); the CLI also accepts `SRM_TOKEN`
  from the environment. Never read from a committed file.
- The release version/slug, from the user or the active release.

The CLI (`srm`) is the only thing that touches the store. Do not hand-craft HTTP
calls or read local state files; shell out to it so behavior stays identical
across hosts.

## Procedure

1. Confirm the SRM backend is active (above). If not, stop and say so.
2. Resolve the release version. If the user didn't give one and it's ambiguous,
   ask — do not guess.
3. Run the client:

   ```
   srm next --release <version> --json
   ```

   - Exit 0 with `startable: [...]` → render the recommendations.
   - Exit 0 with an empty list → report what's blocking (the human form,
     `srm next --release <version>`, prints the reason tally, e.g.
     `1 unverified`, `2 blocked`).
   - Non-zero exit → surface the store's error verbatim (it fails loud:
     `not_startable`, `claim_conflict`, an auth/url problem). Do not paper over it.

## Output

For each recommendation (already ranked by what it unblocks):

- tracker ref + title (e.g. `#42 Audit trace CLI`)
- why it's startable now (no unmet blockers, graph verified, unheld)
- what it unblocks (its position on the critical path)

End with:

- `start <ref>` to begin work (hand off to `/release-topic`)
- `/release-parallel <refs>` to dispatch several startable components at once

## Guardrails

- Do not claim, heartbeat, or release — that's the write path of other skills.
- Do not mutate the tracker or local git state.
- Do not invent startability. If `srm next` returns nothing, the answer is
  "nothing is startable, here's why" — never relax the server's verdict.
- If the graph is `unverified`, say so plainly: the release needs
  `/release-graph` before work is safe to start (the store's fail-safe default).
