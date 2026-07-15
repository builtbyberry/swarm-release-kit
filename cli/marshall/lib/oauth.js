import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import { request } from './http.js';

/**
 * OAuth 2.1 login against the SRM store — authorization code + PKCE, with the
 * code coming back to a throwaway server on loopback. The `gh auth login` shape.
 *
 * Why this and not the device flow, even though the store exposes /oauth/device:
 * a device client needs the device grant, and the store's Dynamic Client
 * Registration endpoint hardcodes `enableDeviceFlow: false`. Device login would
 * therefore need a client pre-registered on the store by an operator and its id
 * baked in here. DCR needs neither — the CLI registers itself, so a fresh install
 * can log in against a store nobody prepared for it. (Device flow is still the
 * right answer for headless/SSH later; it just costs an operator step.)
 *
 * No client secret: this is a public client (`token_endpoint_auth_method: none`).
 * A secret shipped inside a published npm package is not a secret, which is
 * exactly what PKCE exists to replace.
 */

/** The hosted store. Mirrors the plugin hardcoding its MCP url in 0.8.1: SRM is a
 *  hosted service, so a URL prompt is a question with one answer. */
export const DEFAULT_URL = 'https://release-manager.swarmplatform.cloud';

/** base64url per RFC 7636 — no padding, URL-safe alphabet. */
const base64url = (buffer) => buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * A PKCE verifier/challenge pair (S256).
 *
 * @returns {{ verifier: string, challenge: string }}
 */
export function pkce() {
    const verifier = base64url(randomBytes(32));

    return {
        verifier,
        challenge: base64url(createHash('sha256').update(verifier).digest()),
    };
}

/**
 * Register this CLI as a public OAuth client and get a client_id back.
 *
 * Registration is per-login, not per-install: the id is cheap, and minting a
 * fresh one keeps the redirect URI honest (the loopback port is only known once
 * the server is listening).
 *
 * @param {string} url store base url
 * @param {string} redirectUri
 * @returns {Promise<string>} client_id
 */
export async function registerClient(url, redirectUri) {
    const { json } = await request('POST', `${url}/oauth/register`, {
        body: { client_name: 'Marshall CLI', redirect_uris: [redirectUri] },
    });

    if (!json?.client_id) {
        throw new Error(`Store did not return a client_id from ${url}/oauth/register.`);
    }

    return String(json.client_id);
}

/**
 * The URL the human approves in a browser.
 *
 * No `scope`: the store's REST surface is guarded by `auth:api` alone with no
 * scope middleware, so asking for one would be theatre — and a scope the store
 * does not know would fail the request outright.
 *
 * @param {{ url: string, clientId: string, redirectUri: string, challenge: string, state: string }} params
 * @returns {string}
 */
export function authorizeUrl({ url, clientId, redirectUri, challenge, state }) {
    const query = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
    });

    return `${url}/oauth/authorize?${query}`;
}

/**
 * Trade the authorization code for tokens.
 *
 * @param {{ url: string, clientId: string, redirectUri: string, verifier: string, code: string }} params
 * @returns {Promise<{ access_token: string, refresh_token?: string, expires_in?: number }>}
 */
export async function exchangeCode({ url, clientId, redirectUri, verifier, code }) {
    const { json } = await request('POST', `${url}/oauth/token`, {
        form: {
            grant_type: 'authorization_code',
            client_id: clientId,
            redirect_uri: redirectUri,
            code_verifier: verifier,
            code,
        },
    });

    return json;
}

/**
 * Trade a refresh token for a fresh access token.
 *
 * @param {{ url: string, clientId: string, refreshToken: string }} params
 * @returns {Promise<{ access_token: string, refresh_token?: string, expires_in?: number }>}
 */
export async function refreshToken({ url, clientId, refreshToken: token }) {
    const { json } = await request('POST', `${url}/oauth/token`, {
        form: {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: token,
        },
    });

    return json;
}

/**
 * Serve one loopback request and resolve with its query.
 *
 * Binds 127.0.0.1 explicitly rather than 0.0.0.0: the authorization code lands
 * in this URL, and it has no business being reachable off the machine. Port 0
 * lets the OS pick a free one, which is also why registration has to wait until
 * the server is listening — the redirect URI is not known before then.
 *
 * @param {(query: URLSearchParams) => { ok: boolean, message: string }} onRequest
 * @returns {Promise<{ port: number, result: Promise<URLSearchParams> }>}
 */
export function loopbackServer(onRequest) {
    return new Promise((resolve, reject) => {
        let settle;
        const result = new Promise((res, rej) => {
            settle = { res, rej };
        });

        // Mark `result` as handled the moment it exists. It can reject before the
        // caller awaits it — cmdLogin registers a client and opens a browser in
        // between — and an unattached rejection is an unhandledRejection, which
        // kills the process instead of surfacing as the login error it is. The
        // no-op does not swallow anything: real awaiters still see the rejection.
        result.catch(() => {});

        const server = http.createServer((req, res) => {
            const query = new URL(req.url, 'http://127.0.0.1').searchParams;
            const { ok, message } = onRequest(query);

            res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(page(ok, message));

            res.on('finish', () => {
                // Drop lingering sockets, THEN close. close() alone only stops
                // accepting and waits on open connections — and a browser holds
                // this one open with keep-alive, so the handle would never free
                // and `marshall login` would print "Signed in" and then hang forever
                // instead of exiting. (Node >= 18.2; optional-called so an older
                // 18.x still closes, just less promptly.)
                server.closeAllConnections?.();
                server.close();
            });

            ok ? settle.res(query) : settle.rej(new Error(message));
        });

        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, result }));
    });
}

const page = (ok, message) => `<!doctype html><meta charset="utf-8"><title>marshall</title>
<body style="font:16px/1.5 system-ui;margin:4rem auto;max-width:30rem;text-align:center">
<h1 style="font-size:1.25rem">${ok ? 'Signed in to Swarm Release Manager' : 'Sign-in failed'}</h1>
<p style="color:#555">${message}</p>
<p style="color:#888;font-size:.875rem">You can close this tab and return to your terminal.</p>`;

/** A random, opaque CSRF state value. */
export const newState = () => base64url(randomBytes(16));
