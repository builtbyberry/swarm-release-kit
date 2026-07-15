import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Where `marshall login` parks its OAuth tokens.
 *
 * A file, not the keychain: the CLI has zero dependencies and must stay that way
 * (no native keytar binding), and the store's tokens are short-lived — 15 days,
 * 30 for the refresh — so a leaked one has a bounded blast radius. The file is
 * written 0600 and lives OUTSIDE any repo, so it can never be committed the way
 * a token pasted into release-config.json could.
 *
 * `MARSHALL_CONFIG_HOME` (or the older `SRM_CONFIG_HOME`) overrides the location
 * — tests set it to a temp dir so they never touch a real developer's
 * credentials.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function credentialsPath(env = process.env) {
    const override = env.MARSHALL_CONFIG_HOME ?? env.SRM_CONFIG_HOME;
    const base = override ?? (env.XDG_CONFIG_HOME ? join(env.XDG_CONFIG_HOME, 'marshall') : join(homedir(), '.config', 'marshall'));

    return join(base, 'credentials.json');
}

/**
 * The stored credentials, or null when not logged in / unreadable.
 *
 * Unreadable is deliberately the same as absent: a corrupt file should send you
 * to `marshall login`, not crash a read-only command with a JSON parse error.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ url: string, client_id: string, access_token: string, refresh_token?: string|null, expires_at?: number|null }|null}
 */
export function readCredentials(env = process.env) {
    const path = credentialsPath(env);

    if (!existsSync(path)) {
        return null;
    }

    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * Persist credentials 0600, creating the directory if needed.
 *
 * chmod runs AFTER the write because the file may already exist with looser
 * permissions — writeFileSync's mode only applies when it creates the file.
 *
 * @param {object} credentials
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} the path written
 */
export function writeCredentials(credentials, env = process.env) {
    const path = credentialsPath(env);

    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(path, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);

    return path;
}

/**
 * Forget the stored credentials. Returns whether there were any.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function clearCredentials(env = process.env) {
    const path = credentialsPath(env);

    if (!existsSync(path)) {
        return false;
    }

    rmSync(path);

    return true;
}
