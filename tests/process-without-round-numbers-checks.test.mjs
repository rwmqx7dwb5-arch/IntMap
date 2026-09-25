/* ============================================================================
 *  IntMap · the process without round numbers — five defects, each stated as the defect
 * ----------------------------------------------------------------------------
 *  利用者承認済み: 「ラウンド番号を名前として使うのをやめる」「DEV-NOTES の 1 本ファイルをやめる」
 *  「テストの段を触った範囲で選ぶ」（既存の記録は 1 行も失わない）. This file is named for its subject —
 *  the convention it introduces (scripts/round-names.mjs).
 *
 *  Each case below is written against the ORIGINAL DEFECT, not against the shape of the fix
 *  (memory: intmap-restate-the-defect-not-the-fix):
 *
 *    ① TWO PARALLEL SESSIONS WERE HANDED THE SAME IDENTIFIER. `worktree.mjs new` took max+1 over a
 *       scan; everyone who scanned before the others pushed got the same number (#R671: renumbered
 *       seven times, and an add/add conflict committed merge markers into a test file).
 *    ② THE CHANGE'S OWN SPEC DID NOT RUN IN FRONT OF ITS PR. `currentRoundSpec()` read bare
 *       `rNNN.spec.js` names and matched nothing newer than r668 once names carried a subject.
 *    ③ THE SAME DEV-NOTES INDEX ROWS WERE STACKED AGAIN ON EVERY PREPEND. 1,868 index rows of which
 *       381 were distinct, nine copies of the preamble, and #R494's entry cut in half by one of them.
 *    ④ MEMORY.md WENT OVER THE HOST'S LINE LIMIT AND THE CHECK SAID GREEN (203 lines, limit 200:
 *       3 lines were not loaded; `agent-memory --check` counted characters only).
 *    ⑤ A STAMP NOBODY MOVED LEFT STALE CACHES LOOKING CURRENT (R171 through #R172/#R173; R205 on
 *       the R206 deploy; R755 on the R756 deploy).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { allSpecs, changedSpecs, coreNames, isDeep } from '../scripts/tiers.mjs';
import { splitLegacy, parseLegacy, checkNotes, entries, renderIndex, renderStub, LEGACY_INDEX, LEGACY_MANIFEST } from '../scripts/dev-notes.mjs';
import { indexVerdict, INDEX_CEILING } from '../scripts/agent-memory.mjs';
import { stampTime, buildStamp } from '../scripts/build-stamp.mjs';
import { generatedStampProblems } from './helpers/build-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const git = (args, cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

/* ═══ ① two sessions, one identifier ═══════════════════════════════════════════════════════ */
test('① two sessions asking for the same slug cannot both get it — and nothing hands out a number', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'im-pwrn-'));
  try {
    const repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'scripts'), { recursive: true });
    /* the script and what it imports — asked of the files, not listed (tests/r295 seedScripts) */
    const seen = new Set();
    const take = (rel) => {
      if (seen.has(rel)) return; seen.add(rel);
      cpSync(join(ROOT, rel), join(repo, rel));
      for (const m of readFileSync(join(ROOT, rel), 'utf8').matchAll(/\bfrom\s*['"](\.[^'"]+)['"]/g)) take(join(dirname(rel), m[1]).split('\\').join('/'));
    };
    take('scripts/worktree.mjs');
    git(['init', '-q', '-b', 'main'], repo);
    git(['config', 'user.email', 't@t'], repo); git(['config', 'user.name', 't'], repo);
    git(['add', '-A'], repo); git(['commit', '-qm', 'seed'], repo);
    const env = { ...process.env, INTMAP_WORKTREE_BASE: join(tmp, 'wts'), CODEX_HOME: join(tmp, 'codex') };
    const run = (...a) => {
      try { return { code: 0, out: execFileSync(process.execPath, [join(repo, 'scripts/worktree.mjs'), ...a], { cwd: repo, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
    };
    /* the old defect, restated: two sessions that ran the tool before either had pushed */
    const a = run('new', 'coastline-labels'), b = run('new', 'coastline-labels');
    assert.equal(a.code, 0, 'the first session was refused a free slug:\n' + a.out);
    assert.notEqual(b.code, 0, 'the second session was handed the identifier the first one holds:\n' + b.out);
    /* two different pieces of work get two identifiers, and both are theirs */
    assert.equal(run('new', 'river-course').code, 0, 'a different subject was refused');
    const branches = git(['branch', '--list', 'feat/*', '--format=%(refname:short)'], repo).split('\n').filter(Boolean).sort();
    assert.deepEqual(branches, ['feat/coastline-labels', 'feat/river-course']);
    /* and the preview ports the two were given differ (they used to be 4000 + the shared number) */
    const port = (slug) => JSON.parse(readFileSync(join(tmp, 'wts', `wt-${slug}`, '.claude', 'launch.json'), 'utf8')).configurations[0].port;
    assert.notEqual(port('coastline-labels'), port('river-course'), 'two sessions were given one preview port');
    assert.doesNotMatch(run('status').out, /空きラウンド/, 'status still offers a round number to take');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

/* ═══ ② the change's own spec runs in front of its PR ═════════════════════════════════════ */
test('② a spec the change touched is in the gate — through tiers, the planner and playwright.config', () => {
  /* an EXPENSIVE spec (one the price keeps out of the fixed gate) is the case that went unseen */
  const dear = allSpecs().find((f) => isDeep(f));
  assert.ok(dear, 'the suite has a spec over the price');
  const bare = dear.replace(/^tests\//, '').replace(/\.spec\.js$/, '');
  const env = { ...process.env, IM_CHANGED_SPECS: dear };
  assert.ok(coreNames(env).includes(bare), `${dear} was touched and is not in the core tier`);
  assert.ok(isDeep(dear), 'being touched must not take it OUT of the nightly');

  /* the planner CI calls hands it to a machine */
  const pool = /-cesium/.test(dear) ? 'cesium' : 'rest';
  const planned = execFileSync(process.execPath, [join(ROOT, 'scripts/shard-plan.mjs'), '--tier', 'core', '--pool', pool, '--group', '1', '--of', '1'],
    { cwd: ROOT, env, encoding: 'utf8' }).split(/\s+/).map((f) => f.replace(/:\d+$/, ''));
  assert.ok(planned.includes(dear), `the core plan does not schedule ${dear}`);

  /* …and playwright.config.js does not hide it (the config applies the tier on its own, #R203) */
  const src = `import(${JSON.stringify(pathToFileURL(join(ROOT, 'playwright.config.js')).href)}).then((c) => {`
    + ' process.stdout.write(JSON.stringify((c.default.testIgnore || []).map(String))); });';
  const ignores = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', src],
    { cwd: ROOT, env: { ...env, IM_TIER: 'core' }, encoding: 'utf8' }));
  const hidden = ignores.some((r) => { const m = /^\/(.*)\/([a-z]*)$/.exec(r); return m && new RegExp(m[1], m[2]).test(dear); });
  assert.equal(hidden, false, `playwright.config.js hides ${dear} from the core run although the change touched it`);

  /* and CI hands the diff over: the browser job diffs against HEAD^1 with the parent checked out */
  const ci = rd('.github/workflows/ci.yml');
  const job = ci.slice(ci.indexOf('\n  browser:\n'), ci.indexOf('\n  browser-deep:\n'));
  assert.match(job, /IM_DIFF_BASE:\s*HEAD\^1/, 'the core browser job does not tell tiers.mjs what the change is');
  const depth = /fetch-depth:\s*(\d+)/.exec(job);
  assert.ok(depth && (+depth[1] === 0 || +depth[1] >= 2), 'the checkout is too shallow for HEAD^1 to exist');
});

test('②b a diff that cannot be computed is an error, not «no spec changed»', () => {
  assert.throws(() => changedSpecs({ IM_DIFF_BASE: 'refs/heads/no-such-ref-for-this-test' }), /could not be diffed/);
  /* the real diff path, when this checkout has the history for it */
  let added = '';
  try { added = git(['log', '-1', '--diff-filter=A', '--format=%H', '--', 'tests/*.spec.js']).trim(); } catch { /* shallow */ }
  if (!added) return;
  const files = git(['show', '--name-only', '--diff-filter=A', '--format=', added]).split('\n')
    .filter((f) => /^tests\/[^/]+\.spec\.js$/.test(f) && existsSync(join(ROOT, f)));
  if (!files.length) return;
  let base = '';
  try { base = git(['rev-parse', `${added}^`]).trim(); } catch { return; }
  const got = changedSpecs({ IM_DIFF_BASE: base });
  for (const f of files) assert.ok(got.includes(f.replace(/^tests\//, '').replace(/\.spec\.js$/, '')), `${f} was added after ${base.slice(0, 7)} and the diff does not see it`);
});

/* ═══ ③ the record's index rows are not stacked again ════════════════════════════════════ */
const LEGACY_FIXTURE = [
  '## R3 — third', '', 'body three begins,', 'and quotes the title `# IntMap — Developer / Context Notes', '',
  '> preamble', '', '## 索引 — このファイルのラウンド（新しい順）', '',
  '- **#R3** — third', '- **#R2** — second', '- **#R1** — first', '',
  ' IntMap — Developer / Context Notes', '', '> preamble', '',
  '- **#R3** — third', '- **#R2** — second', '- **#R1** — first', '',
  ' and the rest of the third body.', '', '## R2 — second', '', 'body two', '',
  ' IntMap — Developer / Context Notes', '', '> preamble', '', '- **#R2** — second', '- **#R1** — first', '',
  '## R1 — first', '', 'body one', '',
].join('\n');

test('③ splitting keeps every entry byte for byte and every index row exactly once', () => {
  const out = splitLegacy(LEGACY_FIXTURE);
  assert.deepEqual(out.order, [3, 2, 1]);
  const body = (r) => Object.entries(out.files).find(([k]) => k.endsWith(`/R${r}.md`) || k.includes(`/R${r}-`))[1];
  /* the entry a stacked index had cut in half comes back whole, in order, with nothing of the index
     inserted (the blank line after the last index row is the entry's own: it is kept, not guessed away) */
  assert.equal(body(3), '## R3 — third\n\nbody three begins,\nand quotes the title `# IntMap — Developer / Context Notes\n\n and the rest of the third body.\n\n');
  assert.equal(body(1), '## R1 — first\n\nbody one\n');
  /* the rows: every one kept, none twice */
  const rows = out.residue.filter((l) => /^- \*\*#R/.test(l));
  assert.deepEqual(rows, ['- **#R3** — third', '- **#R2** — second', '- **#R1** — first']);
  assert.equal(out.stats.indexRowsTotal, 8, 'the fixture stacks eight rows');
  /* the segments ARE the input */
  const { segs } = parseLegacy(LEGACY_FIXTURE);
  assert.equal(segs.flatMap((s) => s.lines).map((l) => l + '\n').join(''), LEGACY_FIXTURE);
});

test('③b the tree: the list is rendered, lists each entry once, and the old rows are kept once', () => {
  assert.deepEqual(checkNotes(ROOT), [], 'dev-notes/ or the pointer DEV-NOTES.md is malformed');
  const idx = renderIndex(ROOT);
  const links = [...idx.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]).filter((l) => /^dev-notes\/[^/]+\.md$/.test(l) && l !== LEGACY_INDEX);
  assert.equal(new Set(links).size, links.length, 'an entry is listed twice in DEV-NOTES.md');
  assert.equal(links.length, entries(ROOT).length, 'the index does not list every entry');
  /* ⚠ THE DEFECT THIS GUARDS: a TRACKED generated index made every open PR conflict on it the
     moment another one landed (measured: four PRs at once, the first hour). The tracked file is a
     pointer whose bytes do not depend on the entries — adding one changes no tracked file but itself. */
  assert.equal(rd('DEV-NOTES.md'), renderStub(), 'DEV-NOTES.md is not the fixed pointer');
  assert.ok(!/^- (R\d+|\d{4}-\d{2}-\d{2}) · /m.test(rd('DEV-NOTES.md')), 'DEV-NOTES.md lists entries again — every PR would rewrite it');
  /* ⚠ and the instructions say so too. MEASURED 2026-09-26: after the pointer landed, AGENTS.md (3 places),
     CONSTITUTION.md §6 and the skill still told every session that DEV-NOTES.md is «the generated index» —
     the prose kept the structure the code had left. Swept over every tracked instruction/doc, not a list. */
  const docs = git(['ls-files', '*.md']).split('\n').filter((f) => f && !f.startsWith('dev-notes/') && f !== 'DEV-NOTES-ARCHIVE.md');
  for (const f of docs) {
    const hit = /DEV-NOTES\.md[^\n]{0,60}(生成(される)?索引|generated index)/.exec(rd(f));
    assert.ok(!hit, `${f} still calls DEV-NOTES.md a generated index: «${hit && hit[0]}»`);
  }
  assert.equal(renderStub.length, 0, 'the pointer is rendered from nothing that an entry can change');
  const kept = rd(LEGACY_INDEX).split('\n').filter((l) => l.trim());
  assert.equal(new Set(kept).size, kept.length, `${LEGACY_INDEX} carries a line twice`);
  /* ⚠ a stale branch that prepends an entry the OLD way is refused by the gate, not absorbed */
  assert.ok(existsSync(join(ROOT, 'DEV-NOTES.md')));
});

test('③c where the history is present, re-splitting the original reproduces every entry file exactly', (t) => {
  const m = JSON.parse(rd(LEGACY_MANIFEST));
  const run = m.runs[m.runs.length - 1];
  let text = null;
  try { text = git(['cat-file', 'blob', run.sourceBlob]); } catch { /* a shallow checkout */ }
  if (text == null) { t.skip(`the original (${run.sourceBlob.slice(0, 10)}) is not in this checkout — nothing was compared`); return; }
  const out = splitLegacy(text);
  const byRound = new Map(entries(ROOT).filter((e) => e.kind === 'legacy').map((e) => [e.round, e]));
  for (const [rel, body] of Object.entries(out.files)) {
    const name = rel.split('/').pop();
    const onDisk = byRound.get(+/^R(\d+)(?:-|\.md$)/.exec(name)[1]);
    assert.ok(onDisk, `${rel} is missing`);
    assert.equal(rd(onDisk.file), body, `${onDisk.file} is not byte-identical to the entry in the original`);
  }
  const kept = new Set(rd(LEGACY_INDEX).split('\n'));
  for (const l of out.residue) if (l.trim()) assert.ok(kept.has(l), `a line of the original index/preamble was lost: ${l.slice(0, 80)}`);
});

/* ═══ ④ the memory index over the host's line limit ════════════════════════════════════════ */
test('④ an index under the character ceiling but over the line limit is reported as over', () => {
  const v = indexVerdict(INDEX_CEILING - 5000, 203);
  assert.equal(v.overChars, false);
  assert.equal(v.over, true, 'the measured 203-line index is called fine — the host dropped 3 lines of it');
});

/* ═══ ⑤ the build stamp cannot be left behind ═════════════════════════════════════════════ */
function guard(html) {
  const at = html.indexOf("var KEY='intmap_build_seen'");
  const start = html.lastIndexOf('(function(){', at);
  const end = html.indexOf('})();', at) + '})();'.length;
  assert.ok(at > 0 && start > 0 && end > at, 'the anti-stale guard was not found in index.html');
  return html.slice(start, end);
}
function runGuard(code, seen, now) {
  const store = new Map(seen == null ? [] : [['intmap_build_seen', seen]]);
  const session = new Map();
  let reloaded = false, purged = false;
  const ctx = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    sessionStorage: { getItem: (k) => (session.has(k) ? session.get(k) : null), setItem: (k, v) => session.set(k, v), removeItem: (k) => session.delete(k) },
    location: { reload: () => { reloaded = true; } },
    Date, isFinite, String,
  };
  ctx.window = ctx;
  ctx.window.INTMAP_BUILD = now;
  /* no Cache API here, so the guard takes its location.reload() branch — `purged` stays for clarity */
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { stored: store.get('intmap_build_seen'), reloaded, purged, stale: ctx.__INTMAP_STALE };
}

test('⑤ a device holding a newer build is sent to reload; a new build replaces an old or legacy one', () => {
  const code = guard(rd('index.html'));
  const older = '2026-09-25T01:00:00Z-aaaaaaa', newer = '2026-09-25T02:00:00Z-bbbbbbb';
  /* the ES5 parser in the page and the one the build writes with agree */
  const timeOf = vm.runInNewContext(`(${/var timeOf=(function\(s\)\{[\s\S]*?\});/.exec(code)[1]})`);
  for (const s of [older, newer, buildStamp(ROOT), '2026-09-25-R808', '__INTMAP_BUILD_STAMP__', '']) {
    const a = timeOf(s), b = stampTime(s);
    assert.ok((Number.isNaN(a) && Number.isNaN(b)) || a === b, `the page and the build read «${s}» differently: ${a} vs ${b}`);
  }
  /* serving an OLDER build to a device that saw a newer one — the stale copy — reloads it */
  assert.equal(runGuard(code, newer, older).reloaded, true, 'a stale copy was served and nothing happened');
  /* a newer build replaces what was seen, and does not reload */
  const up = runGuard(code, older, newer);
  assert.equal(up.reloaded, false); assert.equal(up.stored, newer);
  /* the one stored value that predates generated stamps is older than every generated one */
  const legacy = runGuard(code, '2026-09-26-R999', older);
  assert.equal(legacy.reloaded, false, 'a hand-typed legacy stamp was treated as newer than a generated one');
  assert.equal(legacy.stored, older);
  /* a page whose stamp was never filled in purges nothing and records nothing */
  const unbuilt = runGuard(code, older, '__INTMAP_BUILD_STAMP__');
  assert.equal(unbuilt.reloaded, false); assert.equal(unbuilt.stored, older);
});

test('⑤b the stamp is written by the build, never typed', async () => {
  assert.deepEqual(await generatedStampProblems(rd('index.html'), ROOT), []);
});
