import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, writeFileSync, rmSync, cpSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { codexToml, trustCodexProject } from '../scripts/lib/codex-settings.mjs';
import { replaceSettings, updateSettings } from '../scripts/lib/local-settings.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKTREE = 'scripts/worktree.mjs';
const SETUP = join(ROOT, 'scripts/codex-setup.mjs');
const SETTINGS = pathToFileURL(join(ROOT, 'scripts/lib/local-settings.mjs')).href;
const parse = await codexToml();

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-settings-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5 }));
  return dir;
}

function start(args, cwd, env = process.env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const finished = once(child, 'close').then(([code]) => ({ code, output }));
  return { child, finished };
}

test('two old truncate-and-write handles reproduce the orphaned trust line on disk', t => {
  const file = join(scratch(t), 'config.toml');
  const entry = name => `[projects.'${name}']\ntrust_level = "trusted"\n`;
  const short = entry('short');
  const long = entry('longer-name');
  const first = openSync(file, 'w');
  const second = openSync(file, 'w');
  try { writeFileSync(first, long); writeFileSync(second, short); }
  finally { closeSync(first); closeSync(second); }
  assert.equal(readFileSync(file, 'utf8'), short + 'sted"\n');
  assert.throws(() => parse(readFileSync(file, 'utf8')), /Invalid Codex TOML at line 3/);
});

test('malformed TOML is left intact by worktree trust and setup', async t => {
  const dir = scratch(t), file = join(dir, 'config.toml');
  const bad = Buffer.from('model = "example"\nsted"\n');
  writeFileSync(file, bad);
  await assert.rejects(trustCodexProject(join(dir, 'worktree'), file), /Invalid Codex TOML at line 2/);
  const env = { ...process.env, CODEX_HOME: dir };
  const { code, output } = await start([SETUP, '--apply', '--json'], ROOT, env).finished;
  assert.equal(code, 1);
  assert.match(output, /Invalid Codex TOML at line 2/);
  assert.deepEqual(readFileSync(file), bad);
  assert.throws(() => readFileSync(file + '.r704.bak'), { code: 'ENOENT' });
});

test('quoted paths, inline tables, multiline values and explicit untrusted status survive surgical edits', async t => {
  const dir = scratch(t), file = join(dir, 'config.toml'), denied = join(dir, 'denied'), allowed = join(dir, "reader's map");
  const doc = 'notes = """\r\n[projects]\r\n"""\r\n' +
    `projects = { ${JSON.stringify(denied)} = { trust_level = 'untrusted' } } # preserve\r\n` +
    '[sandbox_workspace_write]\r\nwritable_roots = [\r\n  "existing",\r\n] # roots\r\n';
  writeFileSync(file, doc);
  assert.equal(await trustCodexProject(denied, file), 'unchanged');
  assert.equal(readFileSync(file, 'utf8'), doc);
  assert.equal(await trustCodexProject(allowed, file), 'added');
  const env = { ...process.env, CODEX_HOME: dir };
  const { code, output } = await start([SETUP, '--apply', '--json'], ROOT, env).finished;
  assert.equal(code, 0, output);
  const text = readFileSync(file, 'utf8'), config = parse(text);
  assert.equal(config.get(['projects', denied, 'trust_level']), 'untrusted');
  assert.equal(config.get(['projects', allowed, 'trust_level']), 'trusted');
  assert.equal(config.get(['sandbox_workspace_write', 'writable_roots'])[0], 'existing');
  assert.match(text, /# preserve\r\n/);
  assert.match(text, /# roots\r\n/);
  assert.ok(text.includes('notes = """\r\n[projects]\r\n"""\r\n'));
});

test('an external edit made before publication forces a fresh read', async t => {
  const file = join(scratch(t), 'launch.json');
  writeFileSync(file, '["original"]');
  let calls = 0;
  await updateSettings(file, text => {
    if (++calls === 1) replaceSettings(file, '["original","other-writer"]');
    return { text: JSON.stringify([...JSON.parse(text), 'intmap']) };
  });
  assert.equal(calls, 2);
  assert.deepEqual(JSON.parse(readFileSync(file)), ['original', 'other-writer', 'intmap']);
});

test('a killed owner leaves a recoverable lock and a readable settings file', async t => {
  const dir = scratch(t), file = join(dir, 'launch.json');
  writeFileSync(file, '{"original":true}');
  const { child, finished } = start(['--input-type=module', '-e',
    `import {withSettingsLock} from ${JSON.stringify(SETTINGS)};
    await withSettingsLock(process.argv[1], () => new Promise(() => {
      process.stdout.write('locked\\n'); setInterval(() => {}, 1000);
    }));`, file], dir);
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  const ready = await Promise.race([once(child.stdout, 'data').then(([data]) => String(data)), finished]);
  assert.equal(ready, 'locked\n');
  child.kill('SIGKILL');
  await finished;
  assert.equal(readFileSync(file, 'utf8'), '{"original":true}');
  await updateSettings(file, () => ({ text: '{"after":true}' }));
  assert.equal(readFileSync(file, 'utf8'), '{"after":true}');
});

test('parallel worktree creation and codex-setup keep every trust entry and reserve distinct preview ports', async t => {
  const dir = scratch(t), repo = join(dir, 'repo'), home = join(dir, 'codex'), worktrees = join(dir, 'worktrees');
  mkdirSync(repo);
  mkdirSync(home);
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git('init', '-qb', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'IntMap test');
  cpSync(join(ROOT, 'scripts'), join(repo, 'scripts'), { recursive: true });
  git('add', 'scripts');
  git('commit', '-qm', 'Test fixture');
  symlinkSync(join(ROOT, 'node_modules'), join(repo, 'node_modules'), 'junction');
  const cfg = join(home, 'config.toml'), original = 'model = "example"\n# keep this comment\n';
  writeFileSync(cfg, original);
  const launch = join(repo, '.claude', 'launch.json');
  mkdirSync(join(repo, '.claude'));
  writeFileSync(launch, '{"version":"0.0.1","configurations":[{"name":"existing","port":4920}]}');
  const env = { ...process.env, CODEX_HOME: home, INTMAP_WORKTREE_BASE: worktrees };
  const slugs = ['small-preview', 'medium-preview', 'longer-preview-name'];
  const jobs = slugs.map(slug => start([WORKTREE, 'new', slug], repo, env).finished);
  jobs.push(start([SETUP, '--apply', '--json'], ROOT, env).finished);
  const problems = [];
  const reader = setInterval(() => {
    try { parse(readFileSync(cfg, 'utf8')); JSON.parse(readFileSync(launch, 'utf8')); }
    catch (err) { problems.push(err.message); }
  }, 5);
  try {
    for (const { code, output } of await Promise.all(jobs)) assert.equal(code, 0, output);
  } finally { clearInterval(reader); }
  assert.deepEqual(problems, []);
  const text = readFileSync(cfg, 'utf8'), config = parse(text);
  assert.ok(text.includes(original));
  assert.equal(config.get(['sandbox_mode']), 'workspace-write');
  const entries = JSON.parse(readFileSync(launch, 'utf8')).configurations;
  assert.deepEqual(new Set(entries.map(entry => entry.name)), new Set(['existing', ...slugs.map(s => 'intmap-preview-' + s)]));
  assert.equal(new Set(entries.map(entry => entry.port)).size, entries.length);
  for (const slug of slugs) {
    const wt = join(worktrees, 'wt-' + slug), name = 'intmap-preview-' + slug;
    assert.equal(config.get(['projects', wt, 'trust_level']), 'trusted');
    const local = JSON.parse(readFileSync(join(wt, '.claude', 'launch.json'), 'utf8')).configurations;
    assert.equal(local[0].port, entries.find(entry => entry.name === name).port);
  }
  const [done, added] = await Promise.all([
    start([WORKTREE, 'done'], join(worktrees, 'wt-' + slugs[0]), env).finished,
    start([WORKTREE, 'new', 'next-preview'], repo, env).finished,
  ]);
  assert.equal(done.code, 0, done.output);
  assert.equal(added.code, 0, added.output);
  const after = JSON.parse(readFileSync(launch, 'utf8')).configurations.map(entry => entry.name);
  assert.deepEqual(new Set(after), new Set(['existing', 'intmap-preview-next-preview', ...slugs.slice(1).map(s => 'intmap-preview-' + s)]));
});
