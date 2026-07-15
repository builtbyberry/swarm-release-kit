#!/usr/bin/env node
/**
 * Enforce the rule RELEASING.md states but nothing checked: the plugin version
 * lives in three places — the manifest, the latest dated CHANGELOG heading, and
 * the git tag — and they must always agree.
 *
 * That rule has now drifted twice. It was written because the manifest was
 * hand-bumped on nearly every commit (0.1.0 -> 0.6.1) while nothing was tagged.
 * Then 0.8.1 was bumped anyway — inside a fix PR rather than a `chore(release)`
 * commit — and so never reached the tag step, shipping untagged for nine days
 * until it was noticed by accident while cutting 0.9.0. A convention only holds
 * as well as the thing that verifies it; this is that thing.
 *
 * Three checks, each aimed at a failure that actually happened:
 *
 *   1. The manifest version only changes in a `chore(release): vX.Y.Z` commit.
 *      This is the drift at its source — 0.8.1's bump rode in on `fix(plugin):`.
 *   2. Every dated CHANGELOG version has a tag. This is what catches an untagged
 *      release, and it would have flagged 0.8.1 on the very next PR.
 *   3. The manifest version equals the newest dated CHANGELOG heading — they are
 *      two of the three strings, and they must not disagree.
 *
 * Usage:
 *   node scripts/check-release-coherence.mjs               # strict: every dated
 *                                                          # version must be tagged
 *   node scripts/check-release-coherence.mjs --base <ref>  # exempt versions this
 *                                                          # diff introduces
 *
 * With --base, a version introduced by the diff is exempt from check 2: a release
 * PR adds its heading before its tag exists, so requiring the tag there would fail
 * the very commit that earns it. The exemption is narrow — it lasts exactly one
 * diff, and the next PR (which introduces nothing) demands the tag strictly.
 *
 * Run with no --base before cutting a release: it audits EVERY version, not just
 * the new one. The 0.8.1 gap was invisible from 0.9.0's perspective — cutting
 * 0.9.0 looked perfectly coherent while 0.8.1 sat untagged behind it.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MANIFEST = 'plugins/claude/.claude-plugin/plugin.json';
const CHANGELOG = 'CHANGELOG.md';

/** `## [0.8.1] - 2026-07-06`. Undated headings (`## Unreleased`) are not releases. */
const DATED_HEADING = /^## \[?(\d+\.\d+\.\d+)\]? - \d{4}-\d{2}-\d{2}/gm;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const gitOrNull = (...args) => {
    try {
        return git(...args);
    } catch {
        return null;
    }
};

/** File contents at a ref, or from the working tree when ref is null. */
const read = (ref, path) => (ref === null ? readFileSync(path, 'utf8') : gitOrNull('show', `${ref}:${path}`));

const manifestVersion = (ref) => {
    const raw = read(ref, MANIFEST);

    return raw === null ? null : JSON.parse(raw).version;
};

/** Released versions, newest first — the order the file is written in. */
const changelogVersions = (ref) => {
    const raw = read(ref, CHANGELOG);

    return raw === null ? [] : [...raw.matchAll(DATED_HEADING)].map((m) => m[1]);
};

const baseIndex = process.argv.indexOf('--base');
const base = baseIndex === -1 ? null : process.argv[baseIndex + 1];

const failures = [];
const version = manifestVersion(null);
const versions = changelogVersions(null);
const newest = versions[0];

// (3) Manifest vs CHANGELOG.
if (version !== newest) {
    failures.push(
        `Manifest says ${version} but the newest dated CHANGELOG heading is ${newest ?? '(none)'}.\n` +
            `    Two of the three strings already disagree. Cutting a release from here tags one of them and\n` +
            `    entrenches the split — fix the pair first.`,
    );
}

// (2) Every released version is tagged.
const tags = new Set(git('tag', '-l').split('\n').filter(Boolean));
// A version present at HEAD but not at base is being introduced by this diff, so
// its tag cannot exist yet. With no base, nothing is exempt (the strict audit).
const introduced = base === null ? [] : versions.filter((v) => !changelogVersions(base).includes(v));

for (const v of versions) {
    if (introduced.includes(v)) {
        continue;
    }

    if (!tags.has(`v${v}`)) {
        failures.push(
            `CHANGELOG documents ${v} as released, but there is no tag v${v}.\n` +
                `    That version shipped without a tag — the exact drift that hid 0.8.1 for nine days.\n` +
                `    Backfill it at the commit where the manifest first read ${v} on main:\n` +
                `      git tag -a v${v} <commit> -m "v${v} — <summary>" && git push origin v${v}`,
        );
    }
}

// (1) The manifest only moves in a release commit.
if (base !== null) {
    const before = manifestVersion(base);

    if (before !== null && before !== version) {
        const subjects = git('log', '--format=%s', `${base}..HEAD`).split('\n').filter(Boolean);

        if (!subjects.includes(`chore(release): v${version}`)) {
            failures.push(
                `The manifest version moved ${before} -> ${version} without a "chore(release): v${version}" commit.\n` +
                    `    RELEASING.md: bump the version ONLY at release, never per commit. A bump riding in on a\n` +
                    `    feature/fix commit is how 0.8.1 shipped untagged — it never reached the tag step.\n` +
                    `    Revert the manifest here and let the release cut own the bump.`,
            );
        }
    }
}

if (failures.length > 0) {
    console.error(`\nRelease coherence: ${failures.length} problem(s).\n`);
    failures.forEach((f, i) => console.error(`  ${i + 1}. ${f}\n`));
    console.error('See RELEASING.md — the manifest, the CHANGELOG heading, and the tag are one string.\n');
    process.exit(1);
}

const scope = base === null ? 'every released version' : `every released version except ${introduced.join(', ') || '(none)'}`;
console.log(`Release coherence OK — manifest ${version}, newest CHANGELOG ${newest}, ${scope} tagged.`);
