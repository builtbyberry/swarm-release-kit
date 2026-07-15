#!/usr/bin/env bash
# Surface SRM store connection at session start — but ONLY for repos that opt
# into the SRM backend (state.backend = "srm" in release-config.json). For every
# other repo this stays completely silent, so it never nags non-SRM projects.
#
# The CLI resolves everything itself: the store URL and project from the repo's
# release-config.json (falling back to the hosted store), and the token from
# `marshall login` or MARSHALL_TOKEN. This hook passes nothing in.
#
# It used to export CLAUDE_PLUGIN_OPTION_SRM_URL / _TOKEN, but 0.8.1 removed the
# manifest's `userConfig` block when the MCP url was hardcoded, so those variables
# have been unset ever since — the exports were reading a mechanism that no longer
# exists and always resolved to empty.
set -uo pipefail

# The agent talks to SRM over MCP; this hook is just an optional readiness ping
# via the secondary CLI. No CLI on PATH → say nothing.
command -v marshall >/dev/null 2>&1 || exit 0

# `marshall me` fails loud (non-zero) when the repo hasn't opted in, the token is
# missing, or the store is unreachable — in all those cases we emit nothing.
if who="$(marshall me 2>/dev/null)"; then
  printf '{"additionalContext":"Swarm Release Manager store connected as %s. Use /release-status or /release-next."}\n' "$who"
fi

exit 0
