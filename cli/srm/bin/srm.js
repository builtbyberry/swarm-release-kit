#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { HttpError } from '../lib/http.js';
import { requireSrm, resolveConfig } from '../lib/config.js';
import { clearCredentials, credentialsPath, writeCredentials } from '../lib/credentials.js';
import { authorizeUrl, exchangeCode, loopbackServer, newState, pkce, registerClient } from '../lib/oauth.js';
import { drifting, held, me, resolveRelease, startable } from '../lib/store.js';

/**
 * The SRM client: the human/CI path to the same shared store the agent reaches
 * over MCP. (The agent uses MCP directly — this is not what the skills shell out
 * to for their primary path.)
 *
 * Usage:
 *   srm login                      sign in via the browser (OAuth + PKCE)
 *   srm logout                     forget the stored tokens
 *   srm me                         who this token authenticates as
 *   srm next   --release <version> startable work, ranked (read-only)
 *   srm status --release <version> who holds what + drift (read-only)
 *
 * Output is JSON when --json is passed (for a host to parse), human text else.
 */

async function main(argv) {
    const args = parseArgs(argv);
    const command = args._[0];

    if (!command || command === 'help' || args.help) {
        printUsage();

        return 0;
    }

    const config = resolveConfig({ overrides: { project: typeof args.project === 'string' ? args.project : null } });

    switch (command) {
        case 'login':
            return await cmdLogin(config, args);
        case 'logout':
            return cmdLogout();
        case 'me':
            return await cmdMe(config, args);
        case 'next':
            return await cmdNext(config, args);
        case 'status':
            return await cmdStatus(config, args);
        default:
            process.stderr.write(`Unknown command: ${command}\n`);
            printUsage();

            return 1;
    }
}

/**
 * Sign in: register a public client, bounce the human through the browser, and
 * trade the code for tokens.
 *
 * Deliberately does NOT call requireSrm — you log in to the store, not to a repo.
 * Gating this on `state.backend === "srm"` would make signing in impossible from
 * anywhere except an already-configured repo, which is backwards.
 *
 * @param {ReturnType<typeof resolveConfig>} config
 * @param {{ json?: boolean }} args
 */
async function cmdLogin(config, args) {
    const { url } = config;
    const { verifier, challenge } = pkce();
    const state = newState();

    // The server must be listening before registration: the redirect URI carries
    // the port, and the OS only assigns one on listen.
    const { port, result } = await loopbackServer((query) => {
        if (query.get('error')) {
            return { ok: false, message: query.get('error_description') || query.get('error') };
        }
        // Compare state before trusting the code — this is the CSRF check, and a
        // mismatch means the response is not the one we asked for.
        if (query.get('state') !== state) {
            return { ok: false, message: 'State mismatch — ignoring this response.' };
        }
        if (!query.get('code')) {
            return { ok: false, message: 'No authorization code in the response.' };
        }

        return { ok: true, message: 'Signed in.' };
    });

    const redirectUri = `http://127.0.0.1:${port}/callback`;
    const clientId = await registerClient(url, redirectUri);
    const target = authorizeUrl({ url, clientId, redirectUri, challenge, state });

    // Print the URL unconditionally, then try to open it. Opening is best-effort:
    // over SSH or in a container there may be no browser, and the printed URL is
    // then the whole flow rather than a fallback nobody mentioned.
    process.stdout.write(`Opening your browser to sign in.\nIf it doesn't open, visit:\n\n  ${target}\n\n`);
    openBrowser(target);

    const query = await result;
    const tokens = await exchangeCode({ url, clientId, redirectUri, verifier, code: query.get('code') });

    const path = writeCredentials({
        url,
        client_id: clientId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        // Absolute, so a stale file is obvious; expires_in is relative to now.
        expires_at: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    });

    const who = await me({ url, token: tokens.access_token });

    if (args.json) {
        emitJson({ signed_in: true, url, ...who });

        return 0;
    }

    process.stdout.write(`Signed in to ${url} as ${who.user.name}.\nTokens stored in ${path} (0600).\n`);

    return 0;
}

/** Forget the stored tokens. */
function cmdLogout() {
    const had = clearCredentials();
    process.stdout.write(had ? `Signed out — removed ${credentialsPath()}.\n` : 'Not signed in; nothing to remove.\n');

    return 0;
}

/**
 * Best-effort browser open. Never throws and never blocks: a failure here is not
 * a failed login, because the URL is already on screen.
 *
 * The `error` listener is load-bearing, not defensive noise. A missing opener —
 * no `xdg-open` on a bare Linux box or a container, the common headless case —
 * surfaces as an ASYNC 'error' event on the child, not a throw from spawn(), so a
 * try/catch here would miss it and the unhandled event would take the whole login
 * down at the exact moment the printed-URL fallback was supposed to save it.
 *
 * @param {string} url
 */
function openBrowser(url) {
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';

    try {
        const child = spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' });
        child.on('error', () => {});
        child.unref();
    } catch {
        // Synchronous spawn failure (bad args, EACCES) — same answer: the URL is
        // already printed, so the flow continues without a browser.
    }
}

/**
 * Who this token authenticates as, and where they can work.
 *
 * Prints the USER and their workspaces, which is what /api/me actually returns.
 * It used to print `display_name (kind) on machine` — an Actor, which that
 * endpoint has never returned; against the real store every field was undefined.
 * An Actor is workspace-scoped, so there is no single one to name here anyway.
 *
 * @param {ReturnType<typeof resolveConfig>} config
 * @param {{ json?: boolean }} args
 */
async function cmdMe(config, args) {
    requireSrm(config);
    const who = await me(config);

    if (args.json) {
        emitJson(who);

        return 0;
    }

    process.stdout.write(`${who.user.name} <${who.user.email}>\n`);

    const workspaces = who.workspaces ?? [];
    if (workspaces.length === 0) {
        process.stdout.write('  No workspaces — ask an owner to invite you.\n');
    }
    for (const w of workspaces) {
        process.stdout.write(`  • ${w.name} (${w.slug})\n`);
    }

    return 0;
}

/**
 * @param {ReturnType<typeof resolveConfig>} config
 * @param {{ release?: string, json?: boolean }} args
 */
async function cmdNext(config, args) {
    requireSrm(config);
    if (!args.release) {
        throw new Error('Pass --release <version> (e.g. --release v0.1.0).');
    }

    const release = await resolveRelease(config, args.release);
    const ready = startable(release);

    if (args.json) {
        emitJson({ release: release.version, startable: ready });

        return 0;
    }

    if (ready.length === 0) {
        process.stdout.write(`No startable work in ${release.version}.\n`);
        const reasons = blockerSummary(release);
        if (reasons) {
            process.stdout.write(reasons);
        }

        return 0;
    }

    process.stdout.write(`Startable in ${release.version}:\n`);
    for (const c of ready) {
        const ref = c.tracker_ref ? `${c.tracker_ref} ` : '';
        process.stdout.write(`  • ${ref}${c.title}\n`);
    }

    return 0;
}

/**
 * Who holds what, and what drifted — the cross-machine coordination picture.
 *
 * @param {ReturnType<typeof resolveConfig>} config
 * @param {{ release?: string, json?: boolean }} args
 */
async function cmdStatus(config, args) {
    requireSrm(config);
    if (!args.release) {
        throw new Error('Pass --release <version> (e.g. --release v0.1.0).');
    }

    const release = await resolveRelease(config, args.release);
    const holds = held(release);
    const drift = drifting(release);
    const ready = startable(release);

    if (args.json) {
        emitJson({ release: release.version, held: holds, drifting: drift, startable: ready });

        return 0;
    }

    process.stdout.write(`${release.version} — ${ready.length} startable, ${holds.length} held`);
    process.stdout.write(drift.length ? `, ${drift.length} drifting ⚠\n` : '\n');

    for (const c of holds) {
        const ref = c.tracker_ref ? `${c.tracker_ref} ` : '';
        const who = c.hold.actor?.display_name ?? 'someone';
        const where = c.hold.machine ? ` on ${c.hold.machine}` : '';
        process.stdout.write(`  ● ${ref}${c.title} — held by ${who}${where}\n`);
    }
    for (const c of drift) {
        const ref = c.tracker_ref ? `${c.tracker_ref} ` : '';
        const who = c.drift.actor?.display_name ?? 'someone';
        process.stdout.write(`  ◌ ${ref}${c.title} — dropped by ${who}, reopened\n`);
    }

    return 0;
}

/**
 * Why nothing is startable, summarized by reason — so the skill can explain it.
 *
 * @param {any} release
 * @returns {string}
 */
function blockerSummary(release) {
    const tally = {};
    for (const c of release.components ?? []) {
        if (c.startable_reason) {
            tally[c.startable_reason] = (tally[c.startable_reason] ?? 0) + 1;
        }
    }
    const parts = Object.entries(tally).map(([reason, n]) => `${n} ${reason}`);

    return parts.length ? `  (${parts.join(', ')})\n` : '';
}

/**
 * Minimal flag parser: `--key value`, `--flag`, positional args under `_`.
 *
 * @param {string[]} argv
 * @returns {{ _: string[], [k: string]: any }}
 */
function parseArgs(argv) {
    const out = { _: [] };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg.startsWith('--')) {
            const key = arg.slice(2);
            const next = argv[i + 1];
            if (next === undefined || next.startsWith('--')) {
                out[key] = true;
            } else {
                out[key] = next;
                i++;
            }
        } else {
            out._.push(arg);
        }
    }

    return out;
}

/**
 * @param {any} value
 */
function emitJson(value) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printUsage() {
    process.stdout.write(
        [
            'srm — Swarm Release Manager client',
            '',
            'Commands:',
            '  login                       sign in via the browser (OAuth + PKCE)',
            '  logout                      forget the stored tokens',
            '  me                          who this token authenticates as',
            '  next --release <version>    startable work, ranked (read-only)',
            '  status --release <version>  who holds what + drift (read-only)',
            '',
            'Flags:',
            '  --project <slug>          disambiguate a version across projects',
            '  --json                    machine-readable output',
            '',
            'Config: state.backend/url/project in .claude/release-config.json;',
            'token from SRM_TOKEN. SRM_URL/SRM_PROJECT override.',
            '',
        ].join('\n'),
    );
}

main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
        if (err instanceof HttpError) {
            const reason = err.body?.error ?? err.message;
            process.stderr.write(`SRM error (${err.status}): ${reason}\n`);
            if (err.body && typeof err.body === 'object') {
                process.stderr.write(`${JSON.stringify(err.body, null, 2)}\n`);
            }
        } else {
            process.stderr.write(`${err.message}\n`);
        }
        process.exit(1);
    });
