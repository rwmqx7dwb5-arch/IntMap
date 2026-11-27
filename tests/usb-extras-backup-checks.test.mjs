/* ============================================================================
 *  usb-extras-backup — the mirror must not delete extras\, and extras must never hold a plaintext secret
 * ----------------------------------------------------------------------------
 *  scripts/backup-usb.ps1 deletes every USB file the repository does not have. scripts/backup-extras.ps1 writes
 *  `extras\` on the same drive, so the property is: every walk the mirror makes over the USB (delete, verify,
 *  empty-directory prune) skips `extras`. And the extras script's rules about secrets, stated as facts about
 *  its source (it cannot be run against a real USB here) plus one executed round trip with a DUMMY passphrase.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const usb = read('scripts/backup-usb.ps1');
const extras = read('scripts/backup-extras.ps1');
// the code without comments, so a sentence about a rule is not mistaken for the rule
const code = (s) => s.replace(/<#[\s\S]*?#>/, '').split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');

test('every USB walk of the mirror skips extras (delete, verify, directory prune)', () => {
  assert.match(usb, /\$ExtrasDir = 'extras'/);
  assert.match(usb, /\$NotMirrored = \$VolumeSystem \+ @\(\$ExtrasDir\)/);
  const walks = code(usb).split('\n').filter((l) => /-notcontains/.test(l));
  assert.ok(walks.length >= 2, 'both Get-ChildItem walks (files, directories) filter by first path segment');
  for (const l of walks) assert.match(l, /\$NotMirrored -notcontains/, `a walk still uses the volume-only list: ${l.trim()}`);
  assert.doesNotMatch(code(usb), /\$VolumeSystem -notcontains/);
  // the only walker of the USB files is Get-UsbFiles, used by both Invoke-Mirror's delete pass and Test-Mirror
  assert.equal((code(usb).match(/Get-UsbFiles \$root/g) || []).length, 2);
});

test('the mirror refuses a repository that tracks a path under extras\ (name collision)', () => {
  assert.match(usb, /extras-name-collision/);
  const tracked = spawnSync('git', ['ls-files', 'extras'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  assert.equal(tracked, '', 'the repository must not track extras/ — the USB reserves it');
});

test('extras script: no plaintext secret path — passphrase never an argument, a file or output', () => {
  const c = code(extras);
  assert.doesNotMatch(c, /\[string\]\$Pass(word|phrase)\b/i, 'the passphrase must not be a parameter');
  assert.match(c, /--passphrase-fd', '0'/, 'gpg takes the passphrase on stdin');
  assert.match(c, /Read-Host 'Backup passphrase \(hidden\)' -AsSecureString/);
  assert.doesNotMatch(c, /Write-Host[^\n]*\$pass\b|Say[^\n]*\$pass\b|Set-Content[^\n]*\$pass\b/, '$pass must not be printed or stored');
  assert.match(c, /AES256/);
  // non-interactive with no way to ask: encrypted steps are skipped, not done in plain
  assert.match(c, /IsInputRedirected/);
  assert.match(c, /no-way-to-ask-for-the-passphrase/);
  // login tokens are never archived; credentials and dumps are written only as .gpg
  assert.match(c, /auth\.json/);
  assert.match(c, /\.codex\\auth\.json'[\s\S]{0,160}excludedNames\.Add\(\$auth\)/);
  assert.doesNotMatch(c, /Copy-Item[^\n]*CLAUDE\.local\.md[^\n]*\$Ex\b/, 'CLAUDE.local.md only goes through the encrypted bundle');
  assert.match(c, /credentials\.tar\.gpg/);
  assert.match(c, /\.dump\.gpg/);
  assert.match(c, /Remove-Item -LiteralPath \$Tmp -Recurse -Force/, 'plaintext intermediates are removed in finally');
  // the dump and ciphertext are not written under the repository
  assert.doesNotMatch(c, /Join-Path \$Repo '(backups|extras)/);
});

test('extras script keeps secret NAMES only', () => {
  const c = code(extras);
  assert.match(c, /ForEach-Object \{ \$_\.name \}/);
  assert.doesNotMatch(c, /\$_\.value\b/i);
});

test('extras script file has a BOM (Windows PowerShell 5.1 reads BOM-less files as ANSI)', () => {
  const b = readFileSync(new URL('../scripts/backup-extras.ps1', import.meta.url));
  assert.deepEqual([...b.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('encrypt -> decrypt round trip with a dummy passphrase matches (Windows only)', { skip: process.platform !== 'win32' }, () => {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/backup-extras.ps1', '-SelfTest', '-PassphraseFromStdin'],
    { cwd: ROOT, input: 'dummy-passphrase-for-the-test\n', encoding: 'utf8' });
  const out = r.stdout.trim().split(/\r?\n/).pop();
  if (/RESULT failed no-gpg/.test(out)) return;   // gpg ships with Git for Windows; a machine without it cannot run the extras
  assert.equal(out, 'RESULT ok selftest', r.stdout + r.stderr);
});

test('with no way to ask for a passphrase the self test skips and says so', { skip: process.platform !== 'win32' }, () => {
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/backup-extras.ps1', '-SelfTest'],
    { cwd: ROOT, input: '', encoding: 'utf8' });
  assert.match(r.stdout, /RESULT (skipped no-passphrase|failed no-gpg)/);
});
test('docs state the decrypt commands', () => {
  assert.ok(existsSync(new URL('../docs/BACKUP-RESTORE.md', import.meta.url)));
  assert.match(read('docs/BACKUP-RESTORE.md'), /gpg --decrypt/);
  assert.match(read('docs/BACKUP-RESTORE.md'), /backup-extras\.ps1/);
});
