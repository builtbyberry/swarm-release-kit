import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { clearCredentials, credentialsPath, readCredentials, writeCredentials } from '../lib/credentials.js';

/** A throwaway MARSHALL_CONFIG_HOME, so a test can never touch real credentials. */
const sandbox = () => ({ MARSHALL_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'marshall-cred-')) });

test('credentialsPath() honours MARSHALL_CONFIG_HOME, then XDG, then ~/.config', () => {
    assert.equal(credentialsPath({ MARSHALL_CONFIG_HOME: '/a' }), '/a/credentials.json');
    assert.equal(credentialsPath({ XDG_CONFIG_HOME: '/b' }), '/b/marshall/credentials.json');
    assert.match(credentialsPath({}), /\.config\/marshall\/credentials\.json$/);
});

test('credentialsPath() still honours the older SRM_CONFIG_HOME, but MARSHALL_ wins', () => {
    // The rename must not strand anyone mid-flight who already exported SRM_*.
    assert.equal(credentialsPath({ SRM_CONFIG_HOME: '/old' }), '/old/credentials.json');
    assert.equal(credentialsPath({ SRM_CONFIG_HOME: '/old', MARSHALL_CONFIG_HOME: '/new' }), '/new/credentials.json');
});

test('writeCredentials() stores 0600 — the file holds a bearer token', () => {
    const env = sandbox();
    const path = writeCredentials({ url: 'https://store.test', access_token: 'at' }, env);

    // 0600: readable by nobody else on a shared box. Asserted rather than assumed
    // because writeFileSync's mode only applies when it CREATES the file, so an
    // existing looser file would silently keep its permissions without the chmod.
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(readCredentials(env).access_token, 'at');
});

test('writeCredentials() tightens an existing loose file', () => {
    const env = sandbox();
    const path = credentialsPath(env);

    writeCredentials({ access_token: 'first' }, env);
    // Simulate a file that already exists world-readable (an older CLI, a botched
    // restore) — the rewrite must not inherit those permissions.
    chmodSync(path, 0o644);
    writeCredentials({ access_token: 'second' }, env);

    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(readCredentials(env).access_token, 'second');
});

test('readCredentials() treats absent and corrupt alike — both mean "log in"', () => {
    const env = sandbox();

    assert.equal(readCredentials(env), null);

    writeCredentials({ access_token: 'at' }, env);
    writeFileSync(credentialsPath(env), '{ not json');

    // A parse error must not crash a read-only command; it means the same thing
    // as no file: you are not usefully signed in.
    assert.equal(readCredentials(env), null);
});

test('clearCredentials() reports whether there was anything to clear', () => {
    const env = sandbox();

    assert.equal(clearCredentials(env), false);
    writeCredentials({ access_token: 'at' }, env);
    assert.equal(clearCredentials(env), true);
    assert.equal(readCredentials(env), null);
});
