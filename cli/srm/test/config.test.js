import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { requireSrm, resolveConfig } from '../lib/config.js';

/**
 * @param {object} state
 * @returns {string} a temp dir containing .claude/release-config.json
 */
function repoWithState(state) {
    const dir = mkdtempSync(join(tmpdir(), 'srm-cfg-'));
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(
        join(dir, '.claude', 'release-config.json'),
        JSON.stringify({ repo: 'a/b', state }),
    );

    return dir;
}

test('reads the state block from release-config.json', () => {
    const cwd = repoWithState({ backend: 'srm', url: 'https://srm.test', project: 'demo' });

    const config = resolveConfig({ cwd, env: {} });
    assert.equal(config.backend, 'srm');
    assert.equal(config.url, 'https://srm.test');
    assert.equal(config.project, 'demo');
    assert.equal(config.token, null);
});

test('defaults to local-json when no config opts in', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'srm-empty-'));

    const config = resolveConfig({ cwd, env: {} });
    assert.equal(config.backend, 'local-json');
});

test('env overrides the config and supplies the token', () => {
    const cwd = repoWithState({ backend: 'srm', url: 'https://file.test' });

    const config = resolveConfig({
        cwd,
        env: { SRM_URL: 'https://env.test', SRM_TOKEN: 'secret' },
    });
    assert.equal(config.url, 'https://env.test');
    assert.equal(config.token, 'secret');
});

test('requireSrm refuses a non-srm backend and missing token', () => {
    assert.throws(() => requireSrm({ backend: 'local-json', url: null, token: null }), /opt into/);
    assert.throws(
        () => requireSrm({ backend: 'srm', url: 'https://x', token: null }),
        /SRM_TOKEN/,
    );
});
