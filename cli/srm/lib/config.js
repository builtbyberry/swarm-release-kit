import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Resolve how this CLI talks to the SRM store.
 *
 * The token is a secret and comes ONLY from the environment (`SRM_TOKEN`) —
 * never from a committed file. Everything else (store URL, which project/release
 * this repo maps to) is lifted from the project's tracked `release-config.json`
 * `state` block, with env overrides for ad-hoc use.
 *
 * Shape of the `state` block (config is `local-json` by default — the kit only
 * talks to SRM when a repo opts in):
 *
 *   "state": {
 *     "backend": "srm",
 *     "url": "https://srm.example.com",
 *     "project": "swarm-release-manager"
 *   }
 *
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {{ backend: string, url: string|null, token: string|null, project: string|null }}
 */
export function resolveConfig({ cwd = process.cwd(), env = process.env } = {}) {
    const state = readState(cwd);

    return {
        backend: env.SRM_BACKEND ?? state.backend ?? 'local-json',
        url: env.SRM_URL ?? state.url ?? null,
        token: env.SRM_TOKEN ?? null,
        project: env.SRM_PROJECT ?? state.project ?? null,
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
        throw new Error('No SRM token. Set SRM_TOKEN in your environment.');
    }
}
