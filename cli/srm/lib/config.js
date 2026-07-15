import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readCredentials } from './credentials.js';
import { DEFAULT_URL } from './oauth.js';

/**
 * Resolve how this CLI talks to the SRM store.
 *
 * The token is a secret and never comes from a tracked file. It comes from
 * `srm login` (stored 0600 outside any repo, see credentials.js) or, for the
 * non-interactive case, `SRM_TOKEN`. The env wins: a CI job or a one-off against
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
 * `url` falls back to the hosted store, so a fresh install can `srm login` with
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
        backend: env.SRM_BACKEND ?? state.backend ?? 'local-json',
        url: env.SRM_URL ?? state.url ?? stored?.url ?? DEFAULT_URL,
        token: env.SRM_TOKEN ?? stored?.access_token ?? null,
        // An explicit --project beats both, so the "pass --project" that
        // resolveRelease suggests on an ambiguous version is actually actionable.
        project: overrides.project ?? env.SRM_PROJECT ?? state.project ?? null,
    };
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
 * Assert the config is complete enough to reach the store; throw a friendly
 * message naming the missing piece otherwise.
 *
 * The backend gate stays: it is what keeps the session-start hook silent in repos
 * that never opted into SRM (the hook reads a non-zero `srm me` as "say nothing").
 * Dropping it would make the hook greet every repo on the machine.
 *
 * @param {{ backend: string, url: string|null, token: string|null }} config
 */
export function requireSrm(config) {
    if (config.backend !== 'srm') {
        throw new Error(
            "This repo's release-config.json does not opt into the SRM backend " +
                '(state.backend is not "srm"). Nothing to do.',
        );
    }
    if (!config.url) {
        throw new Error('No SRM store URL. Set state.url in release-config.json or SRM_URL.');
    }
    if (!config.token) {
        throw new Error('Not signed in. Run `srm login` (or set SRM_TOKEN for non-interactive use).');
    }
}
