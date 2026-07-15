import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';
import { drifting, held, me, resolveRelease, startable } from '../lib/store.js';

/**
 * Every stub server, closed once at the end.
 *
 * Each test used to `await store.close()` as its last line, which only runs when
 * everything before it passed — so a FAILING assertion left the server listening
 * and `node --test` hung on the open handle instead of reporting the failure.
 * A red suite that hangs reads as a broken CI job rather than a broken test, and
 * costs the whole timeout to find out. Cleanup belongs somewhere failure cannot
 * skip.
 *
 * @type {http.Server[]}
 */
const servers = [];

after(() => {
    for (const s of servers) {
        // close() alone stops accepting but WAITS on live sockets, and fetch()
        // keeps them alive — so the suite would pass and then hang forever. Drop
        // the sockets as well. (Node >= 18.2; optional-called so an older 18.x
        // degrades to the old behaviour instead of throwing.)
        s.closeAllConnections?.();
        s.close();
    }
});

/**
 * Spin up a throwaway HTTP server that answers the SRM routes the CLI calls,
 * so we exercise the real request path with no network or Laravel.
 *
 * @param {(req: http.IncomingMessage) => { status?: number, body: any }} handler
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
function stubStore(handler) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const { status = 200, body } = handler(req);
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
        });
        servers.push(server);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                url: `http://127.0.0.1:${port}`,
                // Kept so the existing per-test calls still work; the after() hook
                // is the guarantee, this is just an early release.
                close: () => new Promise((r) => server.close(r)),
            });
        });
    });
}

test('me() returns the user + workspaces exactly as /api/me sends them', async () => {
    // The REAL shape, verified against the store: a plain route closure, so no
    // `data` envelope (only the Eloquent-Resource endpoints have one) and no
    // Actor fields. This test previously faked `{data:{display_name,kind}}` —
    // a shape /api/me has never returned — which is precisely why `srm me`
    // crashed against the real store while the suite stayed green.
    const store = await stubStore(() => ({
        body: {
            user: { name: 'Daniel Berry', email: 'dan@example.test' },
            workspaces: [{ slug: 'acme', name: 'Acme' }],
        },
    }));

    const actor = await me({ url: store.url, token: 't' });
    assert.equal(actor.user.name, 'Daniel Berry');
    assert.equal(actor.workspaces[0].slug, 'acme');

    await store.close();
});

test('resolveRelease() resolves a version then fetches the full record', async () => {
    const store = await stubStore((req) => {
        if (req.url.startsWith('/api/releases?')) {
            return { body: { data: [{ id: 'rel_1', version: 'v0.1.0' }] } };
        }

        return { body: { data: { id: 'rel_1', version: 'v0.1.0', components: [] } } };
    });

    const release = await resolveRelease({ url: store.url, token: 't' }, 'v0.1.0');
    assert.equal(release.id, 'rel_1');

    await store.close();
});

test('resolveRelease() errors clearly when a version is missing', async () => {
    const store = await stubStore(() => ({ body: { data: [] } }));

    await assert.rejects(
        () => resolveRelease({ url: store.url, token: 't' }, 'v9.9.9'),
        /No release "v9.9.9"/,
    );

    await store.close();
});

test('held() and drifting() surface the coordination signal', () => {
    const release = {
        components: [
            { id: 'a', hold: { actor: { display_name: 'Atlas' } } },
            { id: 'b', drift: { actor: { display_name: 'Nomad' } } },
            { id: 'c' },
        ],
    };

    assert.deepEqual(
        held(release).map((c) => c.id),
        ['a'],
    );
    assert.deepEqual(
        drifting(release).map((c) => c.id),
        ['b'],
    );
});

test('startable() filters to startable and ranks by unblock count', () => {
    const release = {
        components: [
            { id: 'root', startable: true, blocked_by: [] }, // unblocks 2
            { id: 'mid', startable: false, blocked_by: ['root'] },
            { id: 'leaf', startable: false, blocked_by: ['mid'] },
            { id: 'lonely', startable: true, blocked_by: [] }, // unblocks 0
        ],
    };

    const ready = startable(release);
    assert.deepEqual(
        ready.map((c) => c.id),
        ['root', 'lonely'],
    );
});
