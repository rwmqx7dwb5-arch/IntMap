/* multi-aspect-audit — regressions for what the multi-aspect audit found.
   Each block names the defect it guards, not the fix (memory: intmap-restate-the-defect-not-the-fix). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/* ① The defect: Claude Code reads an agent's / skill's frontmatter as YAML and skips a file it
   cannot parse without a word. The verifier's description contained «へ: » and «model: "opus"»,
   so from the commit that wrote them the role did not exist for Claude Code ("Agent type
   'intmap-verifier' not found") while check:agents, whose reader is not YAML, stayed green.
   Measured here the way the product reads it: every file Claude Code would load. */
test('every Claude Code agent and skill file has frontmatter a YAML reader accepts, naming itself', () => {
  const files = [
    ...readdirSync(join(ROOT, '.claude/agents')).filter((f) => f.endsWith('.md')).map((f) => `.claude/agents/${f}`),
    ...readdirSync(join(ROOT, '.claude/skills'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(ROOT, '.claude/skills', e.name, 'SKILL.md')))
      .map((e) => `.claude/skills/${e.name}/SKILL.md`),
  ];
  assert.ok(files.length >= 2, 'found the agent and skill files');
  for (const rel of files) {
    const m = rd(rel).match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(m, `${rel}: has frontmatter`);
    let fm;
    assert.doesNotThrow(() => { fm = yaml.load(m[1]); }, `${rel}: frontmatter parses as YAML`);
    const self = rel.endsWith('/SKILL.md') ? rel.split('/').slice(-2, -1)[0] : rel.split('/').pop().replace(/\.md$/, '');
    assert.equal(fm.name, self, `${rel}: YAML reads its own name`);
    assert.equal(typeof fm.description, 'string', `${rel}: YAML reads a description`);
    assert.ok(fm.description.length > 20, `${rel}: the description survived whole`);
  }
});

/* ①b The source role's description must come back byte-for-byte — a YAML reader that accepts
   the file but truncates the description at the first «: » would also leave the role unusable. */
test('the rendered agent description is the source role description, as YAML reads it', () => {
  for (const f of readdirSync(join(ROOT, '.agents/roles')).filter((x) => x.endsWith('.md'))) {
    const src = rd(`.agents/roles/${f}`).match(/^---\n[\s\S]*?^description:\s*(.*)$/m)[1];
    const out = yaml.load(rd(`.claude/agents/${f}`).match(/^---\n([\s\S]*?)\n---\n/)[1]);
    assert.equal(out.description, src, `.claude/agents/${f}`);
  }
});

/* ② The defect: every worktree borrows the master's node_modules, the master's package-lock.json
   moves with each merge, and nothing moved the installed tree — 14 packages sat behind the lock
   (pdfjs-dist 4 for 6, @playwright/test 1.61 for 1.63), so local gates ran on dependencies CI
   never sees. The reader must see a version that differs and a required package that is absent,
   and must NOT call a platform-optional package this machine does not take stale. */
test('deps-fresh names an installed tree that is not the lockfile, and only that', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { staleDeps } = await import('../scripts/deps-fresh.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'deps-fresh-'));
  try {
    const put = (name, version) => {
      mkdirSync(join(dir, 'node_modules', name), { recursive: true });
      writeFileSync(join(dir, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }));
    };
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify({ packages: {
      '': { name: 'x' },
      'node_modules/same': { version: '1.0.0' },
      'node_modules/behind': { version: '2.0.0' },
      'node_modules/gone': { version: '1.0.0' },
      'node_modules/other-os': { version: '1.0.0', optional: true },
      'node_modules/linked': { link: true, resolved: '../x' },
    } }));
    put('same', '1.0.0');
    put('behind', '1.9.0');
    const r = staleDeps(dir);
    assert.deepEqual(r.stale.map((s) => s.path).sort(), ['node_modules/behind', 'node_modules/gone']);
    put('behind', '2.0.0'); put('gone', '1.0.0');
    assert.equal(staleDeps(dir).stale.length, 0, 'a tree that matches the lock is fresh');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

/* ②b The one command that moves the master forward also moves its installed tree — with the
   MASTER's own deps-fresh (the running master-sync may predate the fast-forward it just made:
   measured, the first --sync after the merge skipped the step), and the install re-checks and
   brings the test browser the new @playwright/test pins. */
test('master-sync --sync re-installs when the tree differs, and --check reports it', () => {
  const src = rd('scripts/master-sync.mjs');
  const sync = src.slice(src.indexOf("if (want('--sync'))"));
  assert.match(sync, /path\.join\(MASTER, 'scripts', 'deps-fresh\.mjs'\), '--install'/, "--sync runs the master's own deps-fresh --install");
  const df = rd('scripts/deps-fresh.mjs');
  const inst = df.slice(df.indexOf('export function install'));
  assert.match(inst, /staleDeps\(dir\)[\s\S]*npm ci[\s\S]*staleDeps\(dir\)[\s\S]*playwright install chromium/, 'install: check, npm ci, re-check, then the browser');
  assert.match(src.slice(src.indexOf('const advisory'), src.indexOf("if (want('--check'))")), /staleDeps\(MASTER\)/, '--check (and so worktree status) warns');
});

/* ③ The defect: routing-relay's header said one honest user «cannot spend more than 2% of a day»,
   but its only per-caller limit was 60/min, which is the whole 3,000/day ceiling in fifty minutes —
   one address could deny routing to every other reader for the rest of the day. The rule is stated
   as arithmetic on the numbers the module exports, not as the literal 300. */
test('routing-relay: no single address can spend the project-wide day, and the share is taken', async () => {
  const { pathToFileURL } = await import('node:url');
  globalThis.Deno ??= { env: { get: () => undefined }, serve: () => ({}) };
  const saveServe = globalThis.Deno.serve; globalThis.Deno.serve = () => ({});
  try {
    const m = await import(pathToFileURL(join(ROOT, 'supabase/functions/routing-relay/index.ts')).href + '?audit');
    const { READERS_PER_ADDRESS } = await import('../supabase/functions/_shared/rate-limit.js');
    assert.ok(m.PER_IP_PER_DAY < m.GLOBAL_PER_DAY, 'one address has less than the whole day');
    assert.ok(m.PER_IP_PER_DAY * READERS_PER_ADDRESS <= m.GLOBAL_PER_DAY,
      'it takes at least READERS_PER_ADDRESS addresses to spend the day');
  } finally { globalThis.Deno.serve = saveServe; }
  const src = rd('supabase/functions/routing-relay/index.ts');
  const spend = src.slice(src.indexOf('async function spendOk'), src.indexOf('export { rateOk'));
  assert.ok(spend.indexOf('SCOPE_IP_DAY') > -1 && spend.indexOf('SCOPE_IP_DAY') < spend.indexOf('SCOPE_GLOBAL_MINUTE'),
    'the day share is taken before the global buckets');
});

/* ④ The defect: the news reader put feed-supplied item.link / res.hero into iframe src and href
   through an ATTRIBUTE escaper only, so a javascript: URL would run in IntMap's origin (the iframe
   is sandboxed allow-same-origin allow-scripts). The rule is on the escaper in URL context, in any
   file: escForReader inside a src/href must wrap IntMapSafe.url. */
test('a URL attribute built with escForReader first passes the URL through IntMapSafe.url', () => {
  const files = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);
  const bad = [];
  let seen = 0;
  for (const rel of files) {
    const src = rd(rel);
    for (const m of src.matchAll(/(?:src|href)="\$\{(?:HOST\.)?escForReader\(([^`]*?)\)\}"/g)) {
      seen++;
      if (!/^IntMapSafe\.url\(/.test(m[1])) bad.push(`${rel}: ${m[0].slice(0, 90)}`);
    }
  }
  assert.ok(seen >= 1, 'the scan found the reader\'s URL attributes');
  assert.deepEqual(bad, []);
});
