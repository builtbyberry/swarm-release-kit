import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * `srm login`, end to end: the real binary, a fake store, and a stand-in browser.
 *
 * The unit tests cover the pieces; this covers the wiring — and wiring is where
 * this CLI's bugs lived. `srm me` unwrapped a `data` envelope /api/me has never
 * sent, and the suite stayed green for it because the fake returned the invented
 * shape too. So the fake here mirrors the REAL responses (verified against the
 * store), and the flow is driven through the actual argv/exit-code surface a user
 * touches rather than through imported functions.
 */

const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'srm.js');

/** @type {http.Server[]} */
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

/** The store's real shapes: no `data` on /api/me, `data` on the resources. */
function fakeStore() {
    const seen = {};

    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                const path = req.url.split('?')[0];
                res.setHeader('Content-Type', 'application/json');

                if (path === '/oauth/register') {
                    seen.register = JSON.parse(body);

                    return res.end(JSON.stringify({ client_id: 'cid-123' }));
                }
                if (path === '/oauth/token') {
                    seen.token = Object.fromEntries(new URLSearchParams(body));

                    return res.end(JSON.stringify({ access_token: 'tok-abc', refresh_token: 'ref-xyz', expires_in: 1296000 }));
                }
                if (path === '/api/me') {
                    const ok = req.headers.authorization === 'Bearer tok-abc';
                    res.statusCode = ok ? 200 : 401;

                    return res.end(
                        JSON.stringify(
                            ok
                                ? { user: { name: 'Daniel Berry', email: 'dan@example.test' }, workspaces: [{ slug: 'acme', name: 'Acme' }] }
                                : { error: 'unauthenticated' },
                        ),
                    );
                }

                res.statusCode = 404;
                res.end('{}');
            });
        });
        servers.push(server);
        server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, seen }));
    });
}

/** Run the real binary. PATH is stripped of a browser opener on purpose — that is
 *  the headless case, and login must survive it. */
function srm(args, env) {
    const child = spawn(process.execPath, [bin, ...args], { env: { PATH: '/usr/bin:/bin', ...env } });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));

    return { child, output: () => out, exit: new Promise((r) => child.on('exit', r)) };
}

test('srm login: registers, survives no browser, exchanges with PKCE, and stores 0600 tokens', async () => {
    const { url, seen } = await fakeStore();
    const home = mkdtempSync(join(tmpdir(), 'srm-login-'));

    const proc = srm(['login'], { SRM_URL: url, SRM_CONFIG_HOME: home });

    // Act as the browser: the URL is printed before the opener is attempted, so a
    // box with no xdg-open still completes the flow by hand.
    const authorize = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`no authorize URL printed:\n${proc.output()}`)), 8000);
        const poll = setInterval(() => {
            const match = proc.output().match(/(http:\/\/127\.0\.0\.1:\d+\/oauth\/authorize\?\S+)/);
            if (match) {
                clearInterval(poll);
                clearTimeout(timeout);
                resolve(new URL(match[1]));
            }
        }, 25);
    });

    const redirect = new URL(authorize.searchParams.get('redirect_uri'));
    const page = await fetch(`${redirect.origin}/callback?code=the-code&state=${encodeURIComponent(authorize.searchParams.get('state'))}`);

    assert.equal(await proc.exit, 0);
    assert.match(await page.text(), /Signed in/);

    // Registered for THIS loopback port — the redirect URI cannot be known before
    // the server is listening, which is why registration happens after.
    assert.deepEqual(seen.register.redirect_uris, [redirect.origin + '/callback']);

    // PKCE, public client.
    assert.equal(seen.token.grant_type, 'authorization_code');
    assert.equal(seen.token.code, 'the-code');
    assert.ok(seen.token.code_verifier);
    assert.equal(seen.token.client_secret, undefined);

    const path = join(home, 'credentials.json');
    const creds = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(creds.access_token, 'tok-abc');
    assert.equal(creds.refresh_token, 'ref-xyz');
    assert.equal(typeof creds.expires_at, 'number');
    assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('srm me: reads the stored login and prints the user + workspaces', async () => {
    const { url } = await fakeStore();
    const home = mkdtempSync(join(tmpdir(), 'srm-me-'));

    const login = srm(['login'], { SRM_URL: url, SRM_CONFIG_HOME: home });
    const authorize = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('no authorize URL')), 8000);
        const poll = setInterval(() => {
            const match = login.output().match(/(http:\/\/127\.0\.0\.1:\d+\/oauth\/authorize\?\S+)/);
            if (match) {
                clearInterval(poll);
                clearTimeout(timeout);
                resolve(new URL(match[1]));
            }
        }, 25);
    });
    const redirect = new URL(authorize.searchParams.get('redirect_uri'));
    await fetch(`${redirect.origin}/callback?code=c&state=${encodeURIComponent(authorize.searchParams.get('state'))}`);
    await login.exit;

    // No SRM_TOKEN: the token has to come from the login that just happened.
    const me = srm(['me'], { SRM_URL: url, SRM_CONFIG_HOME: home, SRM_BACKEND: 'srm' });

    assert.equal(await me.exit, 0);
    assert.match(me.output(), /Daniel Berry <dan@example\.test>/);
    assert.match(me.output(), /Acme \(acme\)/);
});

test('srm me: says how to fix it when not signed in', async () => {
    const { url } = await fakeStore();
    const home = mkdtempSync(join(tmpdir(), 'srm-anon-'));

    const me = srm(['me'], { SRM_URL: url, SRM_CONFIG_HOME: home, SRM_BACKEND: 'srm' });

    assert.notEqual(await me.exit, 0);
    assert.match(me.output(), /srm login/);
});
