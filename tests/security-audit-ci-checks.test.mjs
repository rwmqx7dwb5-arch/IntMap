/* ============================================================================
 *  security-audit — what a CI step may carry into the runner, and who can read a backup
 * ----------------------------------------------------------------------------
 *  THE DEFECTS, as found by the audit (2026-10-23), each stated as a property of EVERY workflow and
 *  composite action the repository has (discovered, not listed):
 *    ① `npm ci` ran every dependency's install script, with the job's token and secrets in the environment.
 *    ② `actions/checkout` left the GITHUB_TOKEN in `.git/config` for every later step to read.
 *    ③ the rules for ①② live in scripts/static-checks.mjs, so what matters is that the rule REFUSES — a fragment
 *      that breaks it is handed to the function the gate calls and must come back as an error.
 *    ④ deploy.yml / rollback.yml gave a job that runs repository code (npm ci, the build) the right to publish.
 *    ⑤ a push to a bot branch used the credential the checkout left behind; now the token is the step's own env.
 *    ⑥ the database backup was a passphrase in a repository secret, on an artifact anyone with a GitHub account
 *      can download: the key to open it was held by the very run that executes repository code.
 *      It is now encrypted to a tracked PUBLIC key; ⑥ checks the files, ⑦ EXECUTES backup then restore.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';
import { hardeningProblems, installsWithScripts, stepsOf } from '../scripts/workflow-hardening.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

/* the universe: every workflow, and every composite action — discovered from the directories */
const universe = [
  ...readdirSync(path.join(ROOT, '.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f)).map((f) => `.github/workflows/${f}`),
  ...readdirSync(path.join(ROOT, '.github', 'actions'), { withFileTypes: true }).filter((e) => e.isDirectory())
    .flatMap((e) => readdirSync(path.join(ROOT, '.github', 'actions', e.name)).filter((f) => /^action\.ya?ml$/.test(f)).map((f) => `.github/actions/${e.name}/${f}`)),
].sort();
const files = universe.map((rel) => ({ rel, text: read(rel), doc: yaml.load(read(rel)) }));
const stepsAll = files.flatMap((f) => [...stepsOf(f.doc)].map((s) => ({ ...s, rel: f.rel })));
const isComment = (l) => /^\s*#/.test(l);

test('the universe was discovered: workflows AND composite actions, with steps to judge', () => {
  assert.ok(files.filter((f) => f.rel.startsWith('.github/workflows/')).length >= 10);
  assert.ok(files.filter((f) => f.rel.startsWith('.github/actions/')).length >= 3, 'composite actions are in the universe');
  assert.ok(stepsAll.filter((s) => typeof s.step.run === 'string').length >= 50);
  assert.ok(stepsAll.some((s) => s.rel.startsWith('.github/actions/') && typeof s.step.run === 'string'), 'a composite action contributed run steps');
});

test('① every dependency install in every workflow and composite action passes --ignore-scripts', () => {
  const installs = stepsAll.filter((s) => typeof s.step.run === 'string').flatMap((s) => commandsWithInstall(s.step.run).map((c) => ({ ...s, c })));
  assert.ok(installs.length >= 10, `${installs.length} installs measured — the rule is not vacuous`);
  const bad = hardeningProblems_for('npm-install-scripts');
  assert.deepEqual(bad, [], bad.join('\n'));
  /* a second reader that shares nothing with the function: the raw text, line by line */
  const raw = files.flatMap((f) => f.text.split(/\r?\n/).map((l, i) => ({ f: f.rel, i: i + 1, l })))
    .filter(({ l }) => !isComment(l) && /\bnpm\s+(ci|install)\b/.test(l) && !/--ignore-scripts/.test(l));
  assert.deepEqual(raw, [], raw.map((r) => `${r.f}:${r.i}: ${r.l.trim()}`).join('\n'));
});

function commandsWithInstall(run) { return run.split(/\r?\n/).filter((l) => /\bnpm\s+(ci|install)\b/.test(l) && !isComment(l)); }
function hardeningProblems_for(check) {
  return files.flatMap((f) => hardeningProblems(f.doc, f.rel)).filter((p) => p.check === check).map((p) => p.msg);
}

test('② every actions/checkout drops the credential (persist-credentials: false)', () => {
  const checkouts = stepsAll.filter((s) => typeof s.step.uses === 'string' && s.step.uses.startsWith('actions/checkout@'));
  const rawCount = files.reduce((n, f) => n + f.text.split(/\r?\n/).filter((l) => !isComment(l) && /uses:\s*actions\/checkout@/.test(l)).length, 0);
  assert.equal(checkouts.length, rawCount, 'the step walk saw every checkout the text has');
  assert.ok(checkouts.length >= 20);
  const bad = checkouts.filter((s) => s.step.with?.['persist-credentials'] !== false).map((s) => `${s.rel}: ${s.where}`);
  assert.deepEqual(bad, [], `these checkouts keep the token in .git/config:\n${bad.join('\n')}`);
  assert.deepEqual(hardeningProblems_for('checkout-credentials'), []);
});

test('③ the rule refuses a violation: fragments handed to the function the gate calls', () => {
  const wf = (steps) => yaml.load(`on: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`);
  const action = (steps) => yaml.load(`name: a\ndescription: a\nruns:\n  using: composite\n  steps:\n${steps}`);
  const CO = '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n        with:\n          persist-credentials: false\n';
  const names = (doc) => hardeningProblems(doc, 'x.yml').map((p) => p.check);

  /* refused */
  for (const run of ['npm ci', 'npm install', 'npm i', 'npm i --no-audit', 'npm install --save-dev x', 'npm clean-install',
    'sudo npm ci', 'CI=1 npm ci', 'echo a && npm ci && npm run build', 'set -e\n          npm ci\n          npm run build', 'npm ci \\\n            --no-audit']) {
    const doc = wf(`${CO}      - run: |\n          ${run}\n`);
    assert.deepEqual(names(doc), ['npm-install-scripts'], `a workflow step running «${run.replace(/\n\s*/g, ' ⏎ ')}»`);
    assert.deepEqual(names(action(`${CO}      - shell: bash\n        run: |\n          ${run}\n`)), ['npm-install-scripts'], 'and the same in a composite action');
  }
  assert.deepEqual(names(wf('      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n')), ['checkout-credentials'], 'no `with:` at all');
  assert.deepEqual(names(wf('      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n        with:\n          fetch-depth: 0\n')), ['checkout-credentials'], '`with:` without it');
  assert.deepEqual(names(wf('      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n        with:\n          persist-credentials: true\n')), ['checkout-credentials'], 'explicitly kept');
  assert.deepEqual(names(action('    - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n')), ['checkout-credentials'], 'in a composite action');

  /* accepted */
  for (const run of ['npm ci --ignore-scripts', 'npm install --ignore-scripts --no-audit', 'npm run build', 'npx playwright install --with-deps chromium',
    '# npm ci would be wrong here\n          node scripts/x.mjs', 'echo "do not run npm ci"', 'npm ci --ignore-scripts && npm run build']) {
    assert.deepEqual(names(wf(`${CO}      - run: |\n          ${run}\n`)), [], `«${run.replace(/\n\s*/g, ' ⏎ ')}» is fine`);
  }
  assert.deepEqual(names(wf('      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1\n        with:\n          persist-credentials: "false"\n')), [], 'the string form says the same thing');
  assert.deepEqual(installsWithScripts('npm ci'), ['npm ci']);

  /* the gate calls it for BOTH kinds of file (static-checks.mjs is not importable — it runs on load — so the wiring is read) */
  const sc = read('scripts/static-checks.mjs');
  assert.match(sc, /import \{ hardeningProblems \} from '\.\/workflow-hardening\.mjs'/);
  assert.match(sc, /const isAction = \/\^\\\.github\\\/actions\\\/\[\^\/\]\+\\\/action\\\.ya\?ml\$\/\.test\(f\.rel\)/);
  assert.match(sc, /if \(isWorkflow \|\| isAction\) for \(const p of hardeningProblems\(doc, f\.rel\)\) err\(p\.check, p\.msg\)/);
  assert.match(sc, /if \(isWorkflow \|\| isAction\) \{[\s\S]*?action-pinning/, 'action pinning is judged on composite actions too');
});

test('④ no workflow grants Pages / OIDC publishing at the top, and a job that holds it runs no package manager', () => {
  const problems = [];
  for (const f of files.filter((x) => x.rel.startsWith('.github/workflows/'))) {
    const top = f.doc.permissions;
    if (top && typeof top === 'object') {
      for (const k of ['pages', 'id-token']) if (top[k] === 'write') problems.push(`${f.rel}: top-level permissions grant ${k}: write to every job`);
    }
    for (const [id, job] of Object.entries(f.doc.jobs)) {
      const p = job.permissions;
      if (!p || (p.pages !== 'write' && p['id-token'] !== 'write')) continue;
      /* a publishing job is a sparse checkout of the guard script and the publish action; installing and building
         is the job BEFORE it, which is why the build artifact travels between them */
      const pm = (job.steps || []).filter((s) => (typeof s.run === 'string' && /\b(npm|npx)\b/.test(s.run)) || (typeof s.uses === 'string' && s.uses.startsWith('./')));
      if (pm.length) problems.push(`${f.rel} → ${id}: holds a publishing permission and runs a package manager or a local action (${pm.length} step(s))`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
  for (const name of ['deploy.yml', 'rollback.yml']) {
    const doc = files.find((f) => f.rel === `.github/workflows/${name}`).doc;
    assert.deepEqual(doc.permissions, { contents: 'read' }, `${name}: read-only by default`);
    const publishers = Object.entries(doc.jobs).filter(([, j]) => j.permissions?.pages === 'write');
    assert.equal(publishers.length, 1, `${name}: exactly one job may publish`);
    assert.ok((publishers[0][1].steps || []).some((s) => String(s.uses).startsWith('actions/deploy-pages@')), `${name}: and it is the one that deploys`);
  }
});

test('⑤ a bot push takes the token from the step\'s own env, to an explicit URL — never from what checkout left behind', () => {
  const problems = [];
  let pushes = 0;
  for (const { rel, where, step } of stepsAll) {
    if (typeof step.run !== 'string') continue;
    const lines = step.run.split(/\r?\n/).filter((l) => !isComment(l));
    for (const l of lines) {
      if (/\bgit\s+push\b/.test(l)) {
        pushes++;
        if (/\borigin\b/.test(l)) problems.push(`${rel}: ${where} pushes to «origin», whose credential persist-credentials: false removed`);
        if (!/x-access-token:\$\{GH_TOKEN\}@github\.com\/\$\{GITHUB_REPOSITORY\}\.git/.test(l)) problems.push(`${rel}: ${where} pushes without the explicit token URL`);
        if (!step.env || !String(step.env.GH_TOKEN || '').includes('github.token')) problems.push(`${rel}: ${where} pushes but its env has no GH_TOKEN`);
      }
      if (/\b(echo|printf|cat)\b[^|>]*\bGH_TOKEN\b|\bset\s+-x\b/.test(l)) problems.push(`${rel}: ${where} may print the token: «${l.trim()}»`);
    }
  }
  assert.ok(pushes >= 4, `the four bot-branch pushes were found (${pushes})`);
  assert.deepEqual(problems, [], problems.join('\n'));
});

/* ---------------------------------------------------------------- the backup */

test('⑥ the backup is encrypted to a tracked PUBLIC key; no passphrase exists on either side', () => {
  const backup = read('scripts/backup-db.sh');
  const restore = read('scripts/restore-test.sh');
  const workflow = read('.github/workflows/db-backup.yml');
  const db = read('.github/workflows/db.yml');
  const code = (t) => t.split(/\r?\n/).filter((l) => !isComment(l)).join('\n');
  assert.doesNotMatch(code(backup), /--symmetric|--passphrase|GPG_PASSPHRASE|\bgpg\b[^\n]*\s-c\s/, 'backup-db.sh uses no symmetric option and no passphrase');
  assert.match(code(backup), /--recipient-file\s+"\$BACKUP_PUBLIC_KEY_FILE"\s+--encrypt/);
  assert.match(code(backup), /--trust-model always/);
  assert.match(code(backup), /GNUPGHOME="\$\(mktemp -d\)"/, 'a throwaway keyring, not the operator\'s');
  assert.match(code(backup), /shred -u "\$PLAIN"/, 'the plaintext is still shredded');
  assert.match(backup, /BACKUP_PUBLIC_KEY_FILE:-\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)" && pwd\)\/backup-public-key\.asc/, 'default key: the tracked file beside the script');
  assert.match(code(backup), /"recipient_fingerprint": "\$RECIPIENT_FPR"/);
  assert.doesNotMatch(code(backup), /"cipher": "AES256"/, 'the metadata no longer claims a passphrase cipher');

  assert.doesNotMatch(code(restore), /GPG_PASSPHRASE/);
  assert.match(code(restore), /BACKUP_PRIVATE_KEY_FILE/);
  assert.match(code(restore), /GNUPGHOME="\$TMP\/gnupg"/, 'the private key is imported into a scratch keyring inside the temp dir that is removed on exit');

  assert.doesNotMatch(code(workflow), /BACKUP_GPG_PASSPHRASE|GPG_PASSPHRASE/);
  const secrets = new Set([...JSON.stringify(yaml.load(workflow)).matchAll(/(?<![\w.-])secrets\.([A-Za-z_]+)/g)].map((m) => m[1]).filter((n) => n !== 'GITHUB_TOKEN'));
  assert.deepEqual([...secrets], ['SUPABASE_ACCESS_TOKEN'], 'the backup workflow reads exactly one secret, and none can decrypt');
  assert.doesNotMatch(code(db), /GPG_PASSPHRASE|ci-throwaway-passphrase/, 'the CI round trip does not use a passphrase either');
  assert.match(code(db), /--quick-generate-key[\s\S]*BACKUP_PUBLIC_KEY_FILE[\s\S]*BACKUP_PRIVATE_KEY_FILE/, 'the CI round trip makes a throwaway key pair');

  const key = path.join(ROOT, 'scripts', 'backup-public-key.asc');
  assert.ok(existsSync(key));
  const asc = readFileSync(key, 'utf8');
  assert.match(asc, /^-----BEGIN PGP PUBLIC KEY BLOCK-----/);
  assert.doesNotMatch(asc, /PRIVATE KEY/, 'only the public half is tracked');
});

/* GitHub runs `run:` with bash. On Windows `bash` on PATH may be WSL's; use Git's own. */
const findBash = () => {
  if (process.platform !== 'win32') return 'bash';
  const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  for (const rel of ['../../../usr/bin/bash.exe', '../../../bin/bash.exe']) {
    const p = path.resolve(exec, rel);
    if (existsSync(p)) return p;
  }
  return null;
};
const posix = (p) => p.replace(/\\/g, '/');

test('⑦ EXECUTED: backup-db.sh then restore-test.sh round-trips with a key pair; the wrong key and no key cannot open it', () => {
  const bash = findBash();
  assert.ok(bash, 'could not locate bash (Git for Windows) — the scripts cannot be executed, which is not a pass');
  const gpg = spawnSync(bash, ['-c', 'command -v gpg && command -v gpgconf'], { encoding: 'utf8' });
  assert.equal(gpg.status, 0, 'gpg is needed to execute the backup (ubuntu-latest and Git for Windows both carry it)');

  const dir = mkdtempSync(path.join(tmpdir(), 'secaudit-'));
  try {
    const bin = path.join(dir, 'bin');
    mkdirSync(bin);
    /* pg_dump writes bytes we can recognise; pg_restore does nothing; psql answers the restore script's checks.
       The database is not under test here — the encryption and the keys are. */
    writeFileSync(path.join(bin, 'pg_dump'), '#!/usr/bin/env bash\nif [ "$1" = "--version" ]; then echo "pg_dump (PostgreSQL) 17.0"; exit 0; fi\nwhile [ $# -gt 0 ]; do if [ "$1" = "-f" ]; then out="$2"; fi; shift; done\nprintf "SYNTHETIC-PLAINTEXT-MARKER" > "$out"\n', { mode: 0o755 });
    writeFileSync(path.join(bin, 'pg_restore'), '#!/usr/bin/env bash\nexit 0\n', { mode: 0o755 });
    writeFileSync(path.join(bin, 'psql'), '#!/usr/bin/env bash\ncase "$*" in *relrowsecurity*) echo t;; *) echo 3;; esac\n', { mode: 0o755 });

    const script = `
set -euo pipefail
K="${posix(dir)}/keys"; mkdir -p "$K"
mkpair() { # <name> — a key pair in a scratch keyring that is deleted straight away
  local g; g="$(mktemp -d)"; chmod 700 "$g"
  GNUPGHOME="$g" gpg --batch --passphrase '' --quick-generate-key "$1 <$1@intmap.invalid>" ed25519 cert never >/dev/null 2>&1
  local f; f="$(GNUPGHOME="$g" gpg --batch --with-colons --list-keys | awk -F: '$1=="fpr"{print $10; exit}')"
  GNUPGHOME="$g" gpg --batch --passphrase '' --quick-add-key "$f" cv25519 encr never >/dev/null 2>&1
  GNUPGHOME="$g" gpg --batch --armor --export "$f" > "$K/$1.pub.asc"
  GNUPGHOME="$g" gpg --batch --pinentry-mode loopback --passphrase '' --armor --export-secret-keys "$f" > "$K/$1.key.asc"
  echo "$f" > "$K/$1.fpr"
  GNUPGHOME="$g" gpgconf --kill gpg-agent || true; rm -rf "$g"
}
mkpair right; mkpair wrong
export DB_URL="postgresql://u@127.0.0.1:1/db" OUT_DIR="${posix(dir)}/out" BACKUP_PUBLIC_KEY_FILE="$K/right.pub.asc"
bash scripts/backup-db.sh > "${posix(dir)}/backup.log" 2>&1
ENC="$(ls "$OUT_DIR"/*.dump.gpg)"
echo "ENC=$ENC"
# the packet types of the ciphertext: a public-key encrypted session key, and NO symmetric one
LP="$(mktemp -d)"; GNUPGHOME="$LP" gpg --batch --list-packets "$ENC" 2>&1 | grep -E '^:(pubkey|symkey) enc packet' | cut -d: -f2 | sort -u | tr '\\n' ' ' || true; echo; rm -rf "$LP"   # list-packets exits 2 without the secret key: it is the packets that are read
echo "FPR_META=$(grep -o '"recipient_fingerprint": "[0-9A-F]*"' "$OUT_DIR"/*.meta.json | grep -o '[0-9A-F]\\{40\\}')"
echo "FPR_KEY=$(cat "$K/right.fpr")"
echo "MARKER_IN_CIPHERTEXT=$(grep -c SYNTHETIC-PLAINTEXT-MARKER "$ENC" || true)"
echo "PLAINTEXT_LEFT=$(ls "$OUT_DIR" | grep -c '\.dump$' || true)"
# restore with the right key
BACKUP_PRIVATE_KEY_FILE="$K/right.key.asc" bash scripts/restore-test.sh "$ENC" "postgresql://u@127.0.0.1:1/t" > "${posix(dir)}/restore.log" 2>&1 && echo RIGHT_OK || echo RIGHT_FAILED
# the wrong key, and no key at all
BACKUP_PRIVATE_KEY_FILE="$K/wrong.key.asc" bash scripts/restore-test.sh "$ENC" "postgresql://u@127.0.0.1:1/t" > /dev/null 2>&1 && echo WRONG_OPENED || echo WRONG_REFUSED
bash scripts/restore-test.sh "$ENC" "postgresql://u@127.0.0.1:1/t" > /dev/null 2>&1 && echo NONE_OPENED || echo NONE_REFUSED
# no recipient key: refuses to write an unencrypted backup
BACKUP_PUBLIC_KEY_FILE="$K/absent.asc" bash scripts/backup-db.sh > /dev/null 2>&1 && echo NOKEY_WROTE || echo NOKEY_REFUSED
`;
    const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
    delete env.GNUPGHOME;
    const r = spawnSync(bash, ['--noprofile', '--norc', '-c', script], { cwd: ROOT, env, encoding: 'utf8', timeout: 120_000 });
    const out = `${r.stdout || ''}`;
    assert.equal(r.status, 0, `the harness itself ran: ${r.stderr}\n${out}\n${existsSync(path.join(dir, 'backup.log')) ? readFileSync(path.join(dir, 'backup.log'), 'utf8') : ''}`);
    assert.match(out, /^pubkey enc packet\s*$/m, 'the session key is wrapped for a public key, and only that (no symmetric packet)');
    const fprMeta = /FPR_META=([0-9A-F]{40})/.exec(out)?.[1];
    assert.ok(fprMeta, 'the metadata names the recipient');
    assert.equal(fprMeta, /FPR_KEY=([0-9A-F]{40})/.exec(out)?.[1], 'and it is the key the dump was encrypted to');
    assert.match(out, /MARKER_IN_CIPHERTEXT=0/, 'the plaintext marker is not in the ciphertext');
    assert.match(out, /PLAINTEXT_LEFT=0/, 'no plaintext dump is left behind');
    assert.match(out, /RIGHT_OK/, `the recipient's private key restores it:\n${existsSync(path.join(dir, 'restore.log')) ? readFileSync(path.join(dir, 'restore.log'), 'utf8') : ''}`);
    assert.match(out, /WRONG_REFUSED/, 'another key cannot open it');
    assert.match(out, /NONE_REFUSED/, 'with no key the restore refuses');
    assert.match(out, /NOKEY_REFUSED/, 'with no recipient key the backup refuses to write one');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
