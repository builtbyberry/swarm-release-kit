#!/usr/bin/env node
import { HttpError } from '../lib/http.js';
import { requireSrm, resolveConfig } from '../lib/config.js';
import { drifting, held, me, resolveRelease, startable } from '../lib/store.js';

/**
 * The SRM client: the agent-agnostic core the release-* skills shell out to so
 * planning state lives in the shared store, not repo-local JSON. Host adapters
 * (Claude plugin today; codex/cursor later) wrap these same commands.
 *
 * Usage:
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

    const config = resolveConfig();

    switch (command) {
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
 * @param {ReturnType<typeof resolveConfig>} config
 * @param {{ json?: boolean }} args
 */
async function cmdMe(config, args) {
    requireSrm(config);
    const actor = await me(config);

    if (args.json) {
        emitJson(actor);
    } else {
        process.stdout.write(`${actor.display_name} (${actor.kind})`);
        process.stdout.write(actor.machine ? ` on ${actor.machine}\n` : '\n');
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
            '  me                          who this token authenticates as',
            '  next --release <version>    startable work, ranked (read-only)',
            '  status --release <version>  who holds what + drift (read-only)',
            '',
            'Flags:',
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
