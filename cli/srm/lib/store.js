import { request } from './http.js';

/**
 * Typed operations against the SRM REST surface. Each takes the resolved
 * config ({ url, token }) so the caller stays declarative.
 */

/**
 * @param {{ url: string, token: string }} config
 * @returns {Promise<any>}
 */
export async function me(config) {
    const { json } = await request('GET', `${config.url}/api/me`, { token: config.token });

    return json.data;
}

/**
 * Resolve a release by version (and optional project slug) to its full record.
 *
 * @param {{ url: string, token: string, project?: string|null }} config
 * @param {string} version
 * @returns {Promise<any>}
 */
export async function resolveRelease(config, version) {
    const params = new URLSearchParams({ version });
    if (config.project) {
        params.set('project', config.project);
    }

    const { json } = await request('GET', `${config.url}/api/releases?${params}`, {
        token: config.token,
    });
    const matches = json.data ?? [];

    if (matches.length === 0) {
        throw new Error(`No release "${version}" found in the store.`);
    }
    if (matches.length > 1) {
        throw new Error(
            `"${version}" is ambiguous across ${matches.length} projects — pass --project.`,
        );
    }

    return getRelease(config, matches[0].id);
}

/**
 * @param {{ url: string, token: string }} config
 * @param {string} id
 * @returns {Promise<any>}
 */
export async function getRelease(config, id) {
    const { json } = await request('GET', `${config.url}/api/releases/${id}`, {
        token: config.token,
    });

    return json.data;
}

/**
 * The startable components of a release, ranked by what they unblock — the
 * server already computed `startable`; we just order the truth it returned.
 *
 * @param {any} release
 * @returns {any[]}
 */
export function startable(release) {
    const components = release.components ?? [];
    const unblockCount = countUnblocks(components);

    return components
        .filter((c) => c.startable)
        .sort((a, b) => (unblockCount[b.id] ?? 0) - (unblockCount[a.id] ?? 0));
}

/**
 * Components with a live hold — who is working where, right now. The
 * cross-machine coordination signal SRM exists to surface.
 *
 * @param {any} release
 * @returns {any[]}
 */
export function held(release) {
    return (release.components ?? []).filter((c) => c.hold);
}

/**
 * Components whose hold went quiet and dropped — drift. Work that looked
 * claimed but isn't anymore, so it's silently reopened.
 *
 * @param {any} release
 * @returns {any[]}
 */
export function drifting(release) {
    return (release.components ?? []).filter((c) => c.drift);
}

/**
 * How many components each component (transitively) blocks — the critical-path
 * ranking signal.
 *
 * @param {any[]} components
 * @returns {Record<string, number>}
 */
function countUnblocks(components) {
    const blockedBy = new Map(components.map((c) => [c.id, c.blocked_by ?? []]));
    const counts = {};

    for (const c of components) {
        const seen = new Set();
        const stack = [...(blockedBy.get(c.id) ?? [])];
        while (stack.length) {
            const blocker = stack.pop();
            if (seen.has(blocker)) {
                continue;
            }
            seen.add(blocker);
            counts[blocker] = (counts[blocker] ?? 0) + 1;
            stack.push(...(blockedBy.get(blocker) ?? []));
        }
    }

    return counts;
}
