import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { requireSrm, resolveConfig } from '../lib/config.js';
import { writeCredentials } from '../lib/credentials.js';
import { DEFAULT_URL } from '../lib/oauth.js';

/**
 * An env with credentials pointed at a throwaway dir.
 *
 * resolveConfig() now reads stored login tokens, and without this every test
 * would fall through to the REAL ~/.config/srm on the developer's machine —
 * quietly reading their live token and passing or failing on it. Isolation here
 * is not tidiness; it is the difference between a test and a coin flip.
 *
 * @param {Record<string, string>} [extra]
 */
const env = (extra = {}) => ({ MARSHALL_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'marshall-home-')), ...extra });

/**
 * @param {object} state
 * @returns {string} a temp dir containing .claude/release-config.json
 */
function repoWithState(state) {
    const dir = mkdtempSync(join(tmpdir(), 'marshall-cfg-'));
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(
        join(dir, '.claude', 'release-config.json'),
        JSON.stringify({ repo: 'a/b', state }),
    );

    return dir;
}

test('reads the state block from release-config.json', () => {
    const cwd = repoWithState({ backend: 'srm', url: 'https://srm.test', project: 'demo' });

    const config = resolveConfig({ cwd, env: env() });
    assert.equal(config.backend, 'srm');
    assert.equal(config.url, 'https://srm.test');
    assert.equal(config.project, 'demo');
    assert.equal(config.token, null);
});

test('defaults to local-json when no config opts in', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'marshall-empty-'));

    const config = resolveConfig({ cwd, env: env() });
    assert.equal(config.backend, 'local-json');
});

test('env overrides the config and supplies the token', () => {
    const cwd = repoWithState({ backend: 'srm', url: 'https://file.test' });

    const config = resolveConfig({
        cwd,
        env: env({ MARSHALL_URL: 'https://env.test', MARSHALL_TOKEN: 'secret' }),
    });
    assert.equal(config.url, 'https://env.test');
    assert.equal(config.token, 'secret');
});

test('requireSrm refuses a non-srm backend and missing token', () => {
    assert.throws(() => requireSrm({ backend: 'local-json', url: null, token: null }), /opt into/);
    assert.throws(
        () => requireSrm({ backend: 'srm', url: 'https://x', token: null }),
        /marshall login/,
    );
});

test('a stored login supplies the token', () => {
    const e = env();
    writeCredentials({ url: 'https://stored.test', access_token: 'from-login' }, e);

    const config = resolveConfig({ cwd: repoWithState({ backend: 'srm' }), env: e });
    assert.equal(config.token, 'from-login');
    assert.equal(config.url, 'https://stored.test');
});

test('MARSHALL_TOKEN beats a stored login', () => {
    const e = env({ MARSHALL_TOKEN: 'from-env' });
    writeCredentials({ url: 'https://stored.test', access_token: 'from-login' }, e);

    // The env has to win, or a CI job (or a one-off against another store) would
    // be silently hijacked by whoever last ran `srm login` on the box.
    assert.equal(resolveConfig({ cwd: repoWithState({ backend: 'srm' }), env: e }).token, 'from-env');
});

test('url falls back to the hosted store so a fresh install can log in', () => {
    // Nothing configured anywhere: no repo config, no env, no stored login. This
    // is the state of a machine 10 seconds after `npm i -g`, and `srm login` has
    // to have somewhere to go.
    const config = resolveConfig({ cwd: mkdtempSync(join(tmpdir(), 'marshall-fresh-')), env: env() });

    assert.equal(config.url, DEFAULT_URL);
    assert.match(config.url, /^https:\/\//);
});

test('a repo url still beats the hosted default (self-hosted stores)', () => {
    const config = resolveConfig({ cwd: repoWithState({ backend: 'srm', url: 'https://self.hosted' }), env: env() });

    assert.equal(config.url, 'https://self.hosted');
});

test('an explicit --project override beats env and repo config', () => {
    const config = resolveConfig({
        cwd: repoWithState({ backend: 'srm', project: 'from-file' }),
        env: env({ MARSHALL_PROJECT: 'from-env' }),
        overrides: { project: 'from-flag' },
    });

    // resolveRelease tells you to "pass --project" on an ambiguous version; that
    // advice is only true if the flag actually reaches the config.
    assert.equal(config.project, 'from-flag');
});

