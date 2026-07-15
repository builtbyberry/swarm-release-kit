import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { after, test } from 'node:test';
import { authorizeUrl, exchangeCode, loopbackServer, newState, pkce, registerClient } from '../lib/oauth.js';

/**
 * The login flow: PKCE, dynamic client registration, the loopback callback, and
 * the token exchange. Driven against a throwaway HTTP server standing in for the
 * store, the same way store.test.js does — the point is to exercise the real
 * request/response path, not a mock of it.
 */

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

/** A fake store. `handler(req, body)` returns [status, json]. */
function fakeStore(handler) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let body = '';
            req.on('data', (c) => (body += c));
            req.on('end', () => {
                const [status, json] = handler(req, body);
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(json));
            });
        });
        servers.push(server);
        server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
    });
}

test('pkce() produces a verifier whose S256 challenge the store can recompute', () => {
    const { verifier, challenge } = pkce();

    // The whole point of S256: the challenge must be derivable from the verifier
    // by the server. If this drifts, the token exchange fails with invalid_grant
    // and the CLI looks broken for reasons no error message will explain.
    const expected = createHash('sha256').update(verifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    assert.equal(challenge, expected);
    // base64url only — a '+', '/' or '=' would be mangled in a query string.
    assert.match(verifier, /^[A-Za-z0-9\-_]+$/);
    assert.match(challenge, /^[A-Za-z0-9\-_]+$/);
});

test('pkce() and newState() are not fixed values', () => {
    assert.notEqual(pkce().verifier, pkce().verifier);
    assert.notEqual(newState(), newState());
});

test('authorizeUrl() asks for a code with S256 and carries the state', () => {
    const url = new URL(
        authorizeUrl({
            url: 'https://store.test',
            clientId: 'abc',
            redirectUri: 'http://127.0.0.1:5/callback',
            challenge: 'chal',
            state: 'st',
        }),
    );

    assert.equal(url.pathname, '/oauth/authorize');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('client_id'), 'abc');
    assert.equal(url.searchParams.get('code_challenge'), 'chal');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('state'), 'st');
    // No scope: the store's REST surface has no scope middleware, and asking for
    // one it does not know would fail the request outright.
    assert.equal(url.searchParams.get('scope'), null);
});

test('registerClient() posts JSON metadata and returns the client_id', async () => {
    let seen;
    const url = await fakeStore((req, body) => {
        seen = { path: req.url, contentType: req.headers['content-type'], body: JSON.parse(body) };

        return [201, { client_id: 42, grant_types: ['authorization_code', 'refresh_token'] }];
    });

    const clientId = await registerClient(url, 'http://127.0.0.1:5/callback');

    assert.equal(clientId, '42'); // stringified — the store returns a number/uuid
    assert.equal(seen.path, '/oauth/register');
    assert.match(seen.contentType, /application\/json/);
    assert.deepEqual(seen.body.redirect_uris, ['http://127.0.0.1:5/callback']);
});

test('registerClient() fails loud when the store returns no client_id', async () => {
    const url = await fakeStore(() => [201, { oops: true }]);

    await assert.rejects(() => registerClient(url, 'http://127.0.0.1:5/callback'), /did not return a client_id/);
});

test('exchangeCode() posts FORM encoding, not JSON', async () => {
    let seen;
    const url = await fakeStore((req, body) => {
        seen = { path: req.url, contentType: req.headers['content-type'], body };

        return [200, { access_token: 'at', refresh_token: 'rt', expires_in: 900 }];
    });

    const tokens = await exchangeCode({
        url,
        clientId: 'abc',
        redirectUri: 'http://127.0.0.1:5/callback',
        verifier: 'ver',
        code: 'the-code',
    });

    assert.equal(tokens.access_token, 'at');
    assert.equal(seen.path, '/oauth/token');
    // RFC 6749 §4.1.3 specifies form encoding for the token endpoint. Sending
    // JSON here is the classic silent-400 that looks like a bad credential.
    assert.match(seen.contentType, /application\/x-www-form-urlencoded/);

    const form = new URLSearchParams(seen.body);
    assert.equal(form.get('grant_type'), 'authorization_code');
    assert.equal(form.get('code'), 'the-code');
    assert.equal(form.get('code_verifier'), 'ver');
    // Public client: PKCE replaces the secret, so none is sent.
    assert.equal(form.get('client_secret'), null);
});

test('loopbackServer() binds loopback only and hands back the callback query', async () => {
    const { port, result } = await loopbackServer((q) => ({ ok: Boolean(q.get('code')), message: 'ok' }));

    const res = await fetch(`http://127.0.0.1:${port}/callback?code=xyz&state=st`);
    const query = await result;

    assert.equal(res.status, 200);
    assert.equal(query.get('code'), 'xyz');
    assert.equal(query.get('state'), 'st');
});

test('loopbackServer() rejects when the handler refuses, and still answers the browser', async () => {
    const { port, result } = await loopbackServer(() => ({ ok: false, message: 'State mismatch' }));

    const res = await fetch(`http://127.0.0.1:${port}/callback?code=xyz&state=wrong`);

    assert.equal(res.status, 400);
    assert.match(await res.text(), /State mismatch/);
    await assert.rejects(() => result, /State mismatch/);
});
