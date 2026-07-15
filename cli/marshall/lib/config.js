import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readCredentials } from './credentials.js';
import { DEFAULT_URL } from './oauth.js';

/**
 * Resolve how this CLI talks to the SRM store.
 *
 * The token is a secret and never comes from a tracked file. It comes from
 * `marshall login` (stored 0600 outside any repo, see credentials.js) or, for the
 * non-interactive case, `MARSHALL_TOKEN`. The env wins: a CI job or a one-off against
 * another store must not be silently overridden by whoever last logged in here.
 *
 * The rest (which project this repo maps to) is lifted from the repo's tracked
 * `release-config.json` `state` block, with env overrides for ad-hoc use:
 *
 *   "state": {
 *     "backend": "srm",
 *     "url": "https://srm.example.com",
 *     "project": "swarm-release-manager"
 *   }
 *
 * `url` falls back to the hosted store, so a fresh install can `marshall login` with
 * nothing configured — the same call the plugin made in 0.8.1 when it hardcoded
 * its MCP url. `state.url` still wins for a self-hosted store.
 *
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, overrides?: { project?: string|null } }} [opts]
 * @returns {{ backend: string, url: string, token: string|null, project: string|null }}
 */
export function resolveConfig({ cwd = process.cwd(), env = process.env, overrides = {} } = {}) {
    const state = readState(cwd);
    const stored = readCredentials(env);

    return {
        backend: pick(env, 'BACKEND') ?? state.backend ?? 'local-json',
        url: pick(env, 'URL') ?? state.url ?? stored?.url ?? DEFAULT_URL,
        token: pick(env, 'TOKEN') ?? stored?.access_token ?? null,
        // An explicit --project beats both, so the "pass --project" that
        // resolveRelease suggests on an ambiguous version is actually actionable.
        project: overrides.project ?? pick(env, 'PROJECT') ?? state.project ?? null,
    };
}

/**
 * Read `MARSHALL_<name>`, falling back to the older `SRM_<name>`.
 *
 * The binary is `marshall`, so `MARSHALL_TOKEN` is the name a user would guess —
 * being told to set `SRM_TOKEN` by a command called `marshall` is a puzzle, not a
 * hint. `SRM_*` keeps working rather than breaking anyone mid-flight; it is the
 * fallback, not the primary, so the new name wins when both are set.
 *
 * Note this is only the ENV surface. `state.backend` in a repo's
 * release-config.json stays the literal string "srm" — that value lives in other
 * repos' tracked files, and renaming it would break every repo that already
 * opted in to gain nothing.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} name
 * @returns {string|undefined}
 */
function pick(env, name) {
    return env[`MARSHALL_${name}`] ?? env[`SRM_${name}`];
}

/**
 * Walk up from cwd to find a `.claude/release-config.json` (or `.agents/…`) and
 * return its `state` block, or an empty object.
 *
 * @param {string} cwd
 * @returns {Record<string, any>}
 */
function readState(cwd) {
    let dir = cwd;

    while (true) {
        for (const rel of ['.claude/release-config.json', '.agents/release-config.json']) {
            const path = join(dir, rel);
            if (existsSync(path)) {
                try {
                    const config = JSON.parse(readFileSync(path, 'utf8'));

                    return config.state ?? {};
                } catch {
                    return {};
                }
            }
        }

        const parent = dirname(dir);
        if (parent === dir) {
            return {};
        }
        dir = parent;
    }
}

/**
 * Assert we can reach the store: a URL and a credential. Nothing about the repo.
 *
 * This used to also demand `state.backend === "srm"`, which conflated two
 * unrelated questions — "can I reach the store?" and "does THIS REPO use
 * Marshall?" — and answered both with one error. The result was the worst
 * possible first run: install the CLI, sign in, type `marshall me`, and get told
 * about a `release-config.json` you have never heard of, for a backend named
 * after the product's old name. Identity is a property of your TOKEN, not of the
 * directory you happen to be standing in.
 *
 * The repo question still exists and still matters — but only to the
 * session-start hook, which now asks it explicitly via
 * {@see requireRepoOptIn}.
 *
 * @param {{ url: string|null, token: string|null }} config
 */
export function requireStore(config) {
    if (!config.url) {
        throw new Error('No store URL. Set state.url in release-config.json or MARSHALL_URL.');
    }
    if (!config.token) {
        throw new Error('Not signed in. Run `marshall login` (or set MARSHALL_TOKEN for non-interactive use).');
    }
}

/**
 * Assert this REPO opted into the Marshall store (`state.backend === "srm"` in
 * its release-config.json).
 *
 * Only the session-start hook wants this, via `marshall me --require-repo`: it
 * reads a non-zero exit as "say nothing", which is what keeps it silent in every
 * repo on the machine that has nothing to do with Marshall. Making it a flag the
 * hook opts INTO — rather than a gate every human trips over — is the whole
 * point: the strict caller asks for strictness, and the default path stays
 * friendly.
 *
 * The value is still the literal "srm", not "marshall": it lives in other repos'
 * tracked config files, so renaming it would break every repo already opted in.
 *
 * @param {{ backend: string }} config
 */
export function requireRepoOptIn(config) {
    if (config.backend !== 'srm') {
        throw new Error(
            "This repo does not use Marshall (no `state.backend: \"srm\"` in its " +
                '.claude/release-config.json). Nothing to do.',
        );
    }
}
