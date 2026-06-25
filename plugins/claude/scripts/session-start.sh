#!/usr/bin/env bash
# Surface SRM store connection at session start — but ONLY for repos that opt
# into the SRM backend (state.backend = "srm" in release-config.json). For every
# other repo this stays completely silent, so it never nags non-SRM projects.
#
# The token is the plugin's keychain-backed userConfig value, exposed to this
# subprocess as CLAUDE_PLUGIN_OPTION_SRM_TOKEN. URL + project come from the
# repo's release-config.json, which the `srm` CLI resolves itself.
set -uo pipefail

# No CLI on PATH → say nothing (the skill will guide installation when invoked).
command -v srm >/dev/null 2>&1 || exit 0

export SRM_TOKEN="${CLAUDE_PLUGIN_OPTION_SRM_TOKEN:-${SRM_TOKEN:-}}"

# `srm me` fails loud (non-zero) when the repo hasn't opted in, the token is
# missing, or the store is unreachable — in all those cases we emit nothing.
if who="$(srm me 2>/dev/null)"; then
  printf '{"additionalContext":"Swarm Release Manager store connected as %s. Use /release-status or /release-next."}\n' "$who"
fi

exit 0
