/* ============================================================================
 *  (generated-file-merge-driver) the conflicts no person should resolve are resolved by the driver
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-01: fifteen parallel pull requests, and nearly every conflict was in a generated
 *  file, a ledger or a count. Every claim below is made by DOING it: two real branches in a throwaway
 *  repository, a real `git merge` / `git rebase`, and the bytes git leaves behind. Nothing here writes
 *  to the repository these tests run in — the driver is registered in each throwaway repo's own config.
 *
 *   ① --install is idempotent and every worktree of a clone sees it (the config is shared)
 *   ② ledgers: perf-baseline, global-surface, durations, a ratchet count — merge AND rebase resolve
 *      with no conflict; a number both sides moved takes main's value or both moves, as declared
 *   ③ tokens: TOTAL_BUDGET_S and HISTORY in scripts/test-budget.mjs, plan(N) and the table list in
 *      00_structure_test.sql, a count in a document — resolved; a date both sides changed stays a conflict
 *   ④ regen: two branches add a capability each; the GENERATED ROWS conflict resolves, --finish runs the
 *      real scripts/atlas-caps.mjs on the merged inputs, and check agrees with the result
 *   ⑤ a branch without the script still gets git's own conflict markers (never a silent one-sided file)
 *   ⑥ the declarations: every file that declares itself generated or a ledger is declared in
 *      .gitattributes, every regen command exists and accepts its flags, every json ledger round-trips
 *   ⑦ an integer is summed only when it reads as a count
 *   ⑧ the two session tools register it (worktree.mjs new/status, master-sync.mjs --sync)
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync, symlinkSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { install, declarations, DRIVER, DRIVER_CMD, mergeTokens, mergeJson, parseRegen, pending } from '../scripts/merge-driver.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LF = (s) => s.replace(/\r\n/g, '\n');
const real = (rel) => LF(readFileSync(join(ROOT, rel), 'utf8'));

function git(cwd, args, opts = {}) {
  return spawnSync('git', args, { cwd, encoding: 'utf8', ...opts });
}
function ok(cwd, args) {
  const r = git(cwd, args);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} → ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout.trim();
}
function put(file, text) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); }
const get = (dir, rel) => readFileSync(join(dir, rel), 'utf8');

/* a throwaway repository holding THIS checkout's driver and declarations */
function repo(t, { withScript = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-mergedrv-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  ok(dir, ['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.email', 't@example.invalid'], ['user.name', 'test'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false']]) ok(dir, ['config', k, v]);
  put(join(dir, '.gitattributes'), real('.gitattributes'));
  if (withScript) put(join(dir, 'scripts/merge-driver.mjs'), real('scripts/merge-driver.mjs'));
  assert.equal(install(dir).ok, true);
  return dir;
}
const commitAll = (dir, msg) => { ok(dir, ['add', '-A']); ok(dir, ['commit', '-q', '-m', msg]); };

/* base on main → `feat` changes one way, main changes the other way */
function twoBranches(dir, base, ours, theirs) {
  for (const [rel, text] of Object.entries(base)) put(join(dir, rel), text);
  commitAll(dir, 'base');
  ok(dir, ['checkout', '-q', '-b', 'feat']);
  for (const [rel, text] of Object.entries(ours)) put(join(dir, rel), text);
  commitAll(dir, 'feat');
  ok(dir, ['checkout', '-q', 'main']);
  for (const [rel, text] of Object.entries(theirs)) put(join(dir, rel), text);
  commitAll(dir, 'main');
  ok(dir, ['checkout', '-q', 'feat']);
}

test('① --install is idempotent, and a worktree of the clone sees the same driver', (t) => {
  const dir = repo(t);
  assert.deepEqual(install(dir).changed, [], 'a second install writes nothing');
  assert.equal(ok(dir, ['config', '--get', `merge.${DRIVER}.driver`]), DRIVER_CMD);
  put(join(dir, 'x.txt'), 'x\n'); commitAll(dir, 'x');
  const wt = dir + '-wt';
  t.after(() => rmSync(wt, { recursive: true, force: true }));
  ok(dir, ['worktree', 'add', '-q', '-b', 'side', wt]);
  assert.equal(ok(wt, ['config', '--get', `merge.${DRIVER}.driver`]), DRIVER_CMD, 'the config is the clone\'s, not the worktree\'s');
  assert.deepEqual(install(wt).changed, []);
});

/* the ledgers as they are on main today, moved the way parallel pull requests move them */
function ledgerCase() {
  const perf = JSON.parse(real('tests/perf-baseline.json'));
  const surf = JSON.parse(real('tests/global-surface-baseline.json'));
  const dur = JSON.parse(real('tests/durations.json'));
  const fd = JSON.parse(real('tests/fetch-deadline-baseline.json'));
  const chunk = Object.keys(perf.async.chunks)[0];
  const durKey = Object.keys(dur)[0];
  const j = (v, ind) => JSON.stringify(v, null, ind) + '\n';
  const clone = (v) => JSON.parse(JSON.stringify(v));

  const pO = clone(perf); pO.eager.raw += 1000; pO.async.chunks['zz-ours-new'] = 1234;                 /* this branch grew */
  const pT = clone(perf); pT.eager.raw -= 500; pT.eager.gzip -= 10; delete pT.async.chunks[chunk];      /* main's bot tightened */
  const sO = clone(surf); sO.host.push('ZZ_OURS_NAME'); sO.host.sort();
  const sT = clone(surf); sT.host.push('AA_THEIRS_NAME'); sT.host.sort(); const gone = sT.host.splice(1, 1)[0];
  const dO = { 'tests/ours-new.spec.js': 7, ...clone(dur) }; dO[durKey] = dur[durKey] + 3;
  const dT = { 'tests/theirs-new.spec.js': 5, ...clone(dur) }; dT[durKey] = dur[durKey] + 9;
  const fO = clone(fd); fO.total -= 1;
  const fT = clone(fd); fT.total -= 2;
  return {
    perf, surf, dur, fd, chunk, durKey, gone,
    base: { 'tests/perf-baseline.json': j(perf, 2), 'tests/global-surface-baseline.json': j(surf, 1), 'tests/durations.json': j(dur, 1), 'tests/fetch-deadline-baseline.json': j(fd, 1) },
    ours: { 'tests/perf-baseline.json': j(pO, 2), 'tests/global-surface-baseline.json': j(sO, 1), 'tests/durations.json': j(dO, 1), 'tests/fetch-deadline-baseline.json': j(fO, 1) },
    theirs: { 'tests/perf-baseline.json': j(pT, 2), 'tests/global-surface-baseline.json': j(sT, 1), 'tests/durations.json': j(dT, 1), 'tests/fetch-deadline-baseline.json': j(fT, 1) },
  };
}

test('② ledgers: `git merge origin/main` resolves perf-baseline, global-surface, durations and a ratchet count by itself', (t) => {
  const dir = repo(t); const c = ledgerCase();
  twoBranches(dir, c.base, c.ours, c.theirs);
  const r = git(dir, ['merge', '-q', '--no-edit', 'main']);
  assert.equal(r.status, 0, 'no conflict left: ' + r.stdout + r.stderr);
  const perf = JSON.parse(get(dir, 'tests/perf-baseline.json'));
  assert.equal(perf.eager.raw, c.perf.eager.raw - 500, 'a measurement both moved takes main\'s value');
  assert.equal(perf.eager.gzip, c.perf.eager.gzip - 10);
  assert.equal(perf.async.chunks['zz-ours-new'], 1234, 'this branch\'s new chunk is kept');
  assert.ok(!(c.chunk in perf.async.chunks), 'main\'s removal is kept');
  assert.equal(get(dir, 'tests/perf-baseline.json'), JSON.stringify(perf, null, 2) + '\n', 'written the way the ledger writer writes it');
  const host = JSON.parse(get(dir, 'tests/global-surface-baseline.json')).host;
  assert.ok(host.includes('ZZ_OURS_NAME') && host.includes('AA_THEIRS_NAME') && !host.includes(c.gone));
  assert.deepEqual(host, [...host].sort(), 'the name set stays sorted');
  const dur = JSON.parse(get(dir, 'tests/durations.json'));
  assert.equal(dur['tests/ours-new.spec.js'], 7); assert.equal(dur['tests/theirs-new.spec.js'], 5);
  assert.equal(dur[c.durKey], c.dur[c.durKey] + 9, 'a duration both re-measured takes main\'s');
  assert.equal(JSON.parse(get(dir, 'tests/fetch-deadline-baseline.json')).total, c.fd.total - 3, 'a count both moved adds both moves');
  const p = pending(dir);
  const perfEntry = p.find((e) => e.path === 'tests/perf-baseline.json');
  assert.ok(perfEntry && perfEntry.regen.some((x) => x.manual && /perf-budget\.mjs --update/.test(x.text)), 'perf is marked for a rebuild, not rebuilt here');
});

test('② …and `git rebase origin/main` (where main is %A, not %B) resolves the same way', (t) => {
  const dir = repo(t); const c = ledgerCase();
  twoBranches(dir, c.base, c.ours, c.theirs);
  const r = git(dir, ['rebase', '-q', 'main']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const perf = JSON.parse(get(dir, 'tests/perf-baseline.json'));
  assert.equal(perf.eager.raw, c.perf.eager.raw - 500, 'main\'s value, although main is «ours» in a rebase');
  assert.equal(JSON.parse(get(dir, 'tests/durations.json'))[c.durKey], c.dur[c.durKey] + 9);
  assert.equal(JSON.parse(get(dir, 'tests/fetch-deadline-baseline.json')).total, c.fd.total - 3);
});

test('③ tokens: TOTAL_BUDGET_S, HISTORY, plan(N), the table list and a document count resolve; a date does not', (t) => {
  const dir = repo(t);
  const tb = real('scripts/test-budget.mjs');
  const total = /const TOTAL_BUDGET_S = (\d+);/.exec(tb);
  assert.ok(total, 'TOTAL_BUDGET_S is where the case expects it');
  const n0 = Number(total[1]);
  const close = tb.indexOf(' */', total.index);
  const bump = (n, clause) => tb.slice(0, total.index) + `const TOTAL_BUDGET_S = ${n};` + tb.slice(total.index + total[0].length, close) + clause + tb.slice(close);
  const hist = (s, entry) => s.replace('const HISTORY = [\n', `const HISTORY = [\n  ${entry},\n`);
  const sql = real('supabase/tests/00_structure_test.sql');
  const plan = /select plan\((\d+)\);/.exec(sql); const p0 = Number(plan[1]);
  const sqlMove = (n, note, table) => sql.replace(plan[0], `select plan(${n});${note}`).replace("'current_news',\n", `'current_news',\n  '${table}',\n`);
  const doc = '# x\n\nThe registry holds **153 能力** today.\n\nLast measured 2026-10-01.\n';
  twoBranches(dir,
    { 'scripts/test-budget.mjs': tb, 'supabase/tests/00_structure_test.sql': sql, 'docs/x.md': doc },
    { 'scripts/test-budget.mjs': hist(bump(n0 + 11, ' + 11 (ours-spec: one boot)'), "['ours', " + (n0 + 11) + ", 'ours added a spec']"),
      'supabase/tests/00_structure_test.sql': sqlMove(p0 + 2, '  -- (ours) +2', 'ours_table'),
      'docs/x.md': doc.replace('153', '154') },
    { 'scripts/test-budget.mjs': hist(bump(n0 + 21, ' + 21 (theirs-spec: two boots)'), "['theirs', " + (n0 + 21) + ", 'theirs added a spec']"),
      'supabase/tests/00_structure_test.sql': sqlMove(p0 + 4, '  -- (theirs) +4', 'theirs_table'),
      'docs/x.md': doc.replace('153', '156') });
  const r = git(dir, ['merge', '-q', '--no-edit', 'main']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const got = get(dir, 'scripts/test-budget.mjs');
  assert.match(got, new RegExp(`const TOTAL_BUDGET_S = ${n0 + 32};`), 'base + 11 + 21');
  assert.ok(got.includes(' + 21 (theirs-spec: two boots) + 11 (ours-spec: one boot) */'), 'both clauses, main\'s first');
  assert.ok(got.includes("['theirs', ") && got.includes("['ours', "), 'both HISTORY entries');
  assert.equal(spawnSync(process.execPath, ['--check', join(dir, 'scripts/test-budget.mjs')]).status, 0, 'the result still parses');
  const s = get(dir, 'supabase/tests/00_structure_test.sql');
  assert.ok(s.includes(`select plan(${p0 + 6});`), 'plan(N) took both moves');
  assert.ok(s.includes('-- (theirs) +4') && s.includes('-- (ours) +2'));
  assert.ok(s.includes("'ours_table'") && s.includes("'theirs_table'"));
  assert.ok(get(dir, 'docs/x.md').includes('**157 能力**'), '153 + 1 + 3');

  /* a date is not a count: both moving it is a conflict for a person */
  const dir2 = repo(t);
  twoBranches(dir2, { 'docs/y.md': doc }, { 'docs/y.md': doc.replace('2026-10-01', '2026-10-02') }, { 'docs/y.md': doc.replace('2026-10-01', '2026-10-03') });
  const r2 = git(dir2, ['merge', '-q', '--no-edit', 'main']);
  assert.notEqual(r2.status, 0, 'the merge stops');
  assert.match(get(dir2, 'docs/y.md'), /^<<<<<<< ours$/m, 'with ordinary markers');
});

/* the real generator, on a copy of exactly what it reads */
function capabilityRepo(t) {
  const dir = repo(t);
  const want = new Set(['scripts/atlas-caps.mjs', 'tests/helpers/ast.mjs', 'js/atlas-capabilities.js', 'js/atlas-caps-modules.js', 'js/atlas-caps.js']);
  for (const f of readdirSync(join(ROOT, 'js'))) if (/^atlas-cap-.*\.js$/.test(f)) want.add('js/' + f);
  const queue = [...want].filter((f) => /\.m?js$/.test(f));
  while (queue.length) {                                     /* the static import closure of the modules it imports */
    const f = queue.pop();
    for (const m of readFileSync(join(ROOT, f), 'utf8').matchAll(/\b(?:import|export)\b[^'";]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const rel = posix.normalize(posix.join(posix.dirname(f), m[1] || m[2]));
      if (!want.has(rel) && existsSync(join(ROOT, rel))) { want.add(rel); queue.push(rel); }
    }
  }
  for (const f of want) put(join(dir, f), real(f));                 /* as git stores it (LF), whatever this checkout did */
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
  put(join(dir, '.gitignore'), 'node_modules\n');
  return dir;
}
const caps = (dir, args) => spawnSync(process.execPath, ['scripts/atlas-caps.mjs', ...args], { cwd: dir, encoding: 'utf8' });

test('④ regen: two branches add a capability each; the GENERATED ROWS resolve and --finish rebuilds them from the merged entries', (t) => {
  const dir = capabilityRepo(t);
  { const c0 = caps(dir, ['--check']); assert.equal(c0.status, 0, 'the copy starts consistent: ' + c0.stdout + c0.stderr); }
  commitAll(dir, 'base');
  const addEntry = (file, id, spelling) => {
    const src = readFileSync(join(dir, file), 'utf8');
    const m = /\n  \{\n    row: \[\s*'([^']+)',\s*'([^']*)',\s*'([^']*)'([\s\S]*?)\n  \},\n/.exec(src);
    assert.ok(m, `${file} has an entry to copy`);
    const entry = m[0].replace(`'${m[1]}'`, `'${id}'`).replace(`'${m[2]}'`, `'${spelling}'`).replace(`'${m[3]}'`, `'${spelling}Alias'`);
    const at = src.lastIndexOf('];');
    writeFileSync(join(dir, file), src.slice(0, at) + entry.slice(1) + src.slice(at));
    assert.equal(caps(dir, ['--write']).status, 0);
  };
  ok(dir, ['checkout', '-q', '-b', 'feat']);
  addEntry('js/atlas-cap-reader.js', 'reader.mergeours', 'mergeOurs'); commitAll(dir, 'feat');
  ok(dir, ['checkout', '-q', 'main']);
  addEntry('js/atlas-cap-ui.js', 'ui.mergetheirs', 'mergeTheirs'); commitAll(dir, 'main');
  ok(dir, ['checkout', '-q', 'feat']);

  const r = git(dir, ['merge', '-q', '--no-edit', 'main']);
  assert.equal(r.status, 0, 'the generated region did not stop the merge: ' + r.stdout + r.stderr);
  assert.ok(pending(dir).some((e) => e.path === 'js/atlas-capabilities.js'), 'a regeneration is waiting');
  const f = spawnSync(process.execPath, ['scripts/merge-driver.mjs', '--finish'], { cwd: dir, encoding: 'utf8' });
  assert.equal(f.status, 0, f.stdout + f.stderr);
  const rows = get(dir, 'js/atlas-capabilities.js');
  assert.ok(rows.includes('"reader.mergeours"') && rows.includes('"ui.mergetheirs"'), 'both capabilities are in the rows');
  assert.equal(caps(dir, ['--check']).status, 0, 'and the generator agrees with what is there');
  assert.deepEqual(pending(dir), [], 'nothing is waiting afterwards');
});

test('⑤ a branch without the script falls back to git\'s own markers — never a silent one-sided file', (t) => {
  const dir = repo(t, { withScript: false });
  twoBranches(dir, { 'tests/durations.json': '{\n "a": 1\n}\n' }, { 'tests/durations.json': '{\n "a": 2\n}\n' }, { 'tests/durations.json': '{\n "a": 3\n}\n' });
  const r = git(dir, ['merge', '-q', '--no-edit', 'main']);
  assert.notEqual(r.status, 0);
  const got = get(dir, 'tests/durations.json');
  assert.match(got, /^<<<<<<< ours$/m); assert.ok(got.includes('"a": 2') && got.includes('"a": 3'), 'both sides are in front of the person');
});

/* ⑥ — DISCOVERED, not listed: what declares itself generated or a ledger must be declared here */
const SCRIPT = /scripts\/[\w/.-]+\.mjs/;
function selfDeclared() {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
  const out = [];
  for (const f of files) {
    /* the generators describe themselves and the tests quote their markers; .agents/ is the 正本 the
       copies are generated FROM; history quotes old markers; data/ is not merged as text */
    if (/^(data|dist|scripts|tests|dev-notes|\.agents)\//.test(f) && !/^(tests|scripts)\/[^/]+\.json$/.test(f)) continue;
    if (/^DEV-NOTES/.test(f) || !/\.(js|mjs|json|html|txt|xml|md|toml)$/.test(f)) continue;
    let text; try { text = LF(readFileSync(join(ROOT, f), 'utf8')); } catch { continue; }
    if (f.endsWith('.json') && /^(tests|scripts)\//.test(f)) {
      let j; try { j = JSON.parse(text); } catch { continue; }
      const k = Object.keys(j)[0];
      if ((k === '//' || k === '_') && typeof j[k] === 'string' && SCRIPT.test(j[k])) out.push({ f, kind: 'json', script: j[k].match(SCRIPT)[0] });
      continue;
    }
    const head = text.split('\n').slice(0, 12).find((l) => /GENERATED|生成物/.test(l) && SCRIPT.test(l));
    if (head) out.push({ f, kind: 'regen', script: head.match(SCRIPT)[0] });
    for (const l of text.split('\n')) if (/GENERATED.*\bBEGIN\b|\bBEGIN GENERATED\b/.test(l) && SCRIPT.test(l)) out.push({ f, kind: 'regen', script: l.match(SCRIPT)[0] });
  }
  return out;
}

test('⑥ every file that declares itself generated or a ledger is declared, with the generator it names', () => {
  const decl = new Map(declarations(ROOT).map((d) => [d.path, d]));
  const found = selfDeclared();
  assert.ok(found.length >= 40, `the discovery still finds the generated files (${found.length})`);
  const missing = [];
  for (const s of found) {
    const d = decl.get(s.f);
    if (!d || d.kind !== s.kind) { missing.push(`${s.f} (${s.kind}, written by ${s.script}) — declared as ${d ? d.kind : 'nothing'}`); continue; }
    if (s.kind === 'regen' && !d.regen.some((c) => c.argv[0] === s.script)) missing.push(`${s.f}: its marker names ${s.script}, the declaration runs ${d.regen.map((c) => c.text).join(' ; ')}`);
  }
  assert.deepEqual(missing, [], 'add a line to .gitattributes (the block «HOW A MERGE RESOLVES…»)');
  for (const d of decl.values()) {
    assert.ok(['json', 'regen', 'tokens'].includes(d.kind), `${d.path}: intmap-merge=${d.kind}`);
    if (d.kind === 'json') {
      assert.ok(['sum', 'upstream'].includes(d.clash), `${d.path}: intmap-clash=${d.clash}`);
      const blob = execFileSync('git', ['cat-file', '-p', 'HEAD:' + d.path], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
      const ind = (/\n([ \t]+)\S/.exec(blob) || [])[1];
      assert.equal(JSON.stringify(JSON.parse(blob), null, ind) + '\n', blob, `${d.path}: the driver writes a ledger byte-for-byte the way its writer does`);
    }
    if (d.kind === 'regen') assert.ok(d.regen.length, `${d.path}: a generated file names what regenerates it`);
    for (const c of d.regen) {
      const script = c.argv.find((a) => a.endsWith('.mjs'));
      assert.ok(script && existsSync(join(ROOT, script)), `${d.path}: ${c.text} — the script exists`);
      const src = readFileSync(join(ROOT, script), 'utf8');
      for (const flag of c.argv.filter((a) => a.startsWith('--'))) assert.ok(src.includes(flag), `${d.path}: ${script} knows ${flag}`);
    }
  }
});

test('⑦ an integer is summed only when it reads as a count', () => {
  assert.equal(mergeTokens('n = 10;\n', 'n = 12;\n', 'n = 15;\n').text, 'n = 17;\n');
  assert.equal(mergeTokens('1,554 rows\n', '1,560 rows\n', '1,600 rows\n').text, '1,606 rows\n', 'thousands stay grouped');
  for (const [o, a, b] of [['2026-10-01\n', '2026-10-02\n', '2026-10-03\n'], ['v1.63\n', 'v1.64\n', 'v1.65\n'], ['(#873)\n', '(#880)\n', '(#881)\n'],
    ['12%\n', '13%\n', '14%\n'], ['12:30\n', '12:31\n', '12:32\n'], ['09\n', '10\n', '11\n']]) {
    assert.equal(mergeTokens(o, a, b), null, `${o.trim()} is not a count`);
  }
  assert.equal(mergeTokens('n = 2;\n', 'n = 0;\n', 'n = 1;\n'), null, 'a count cannot go below zero — that is two sides removing the same thing');
  assert.equal(mergeTokens('a\nz\n', 'a\nb\nz\n', 'a\nc\nz\n').text, 'a\nc\nb\nz\n', 'two insertions at one place: main\'s first');
  assert.equal(mergeTokens('a\nz\n', 'a\nb\nz\n', 'a\nb\nc\nz\n').text, 'a\nb\nc\nz\n', 'a line both inserted appears once');
  assert.equal(mergeTokens('x = 1\n', 'y = 1\n', 'z = 1\n'), null, 'a word both changed is a conflict');
  assert.throws(() => mergeJson({ a: 'x' }, { a: 'y' }, { a: 'z' }), /both sides changed it differently/);
  assert.deepEqual(mergeJson({ n: 5 }, { n: 4 }, { n: 3 }, { clash: 'sum' }).value, { n: 2 });
  assert.deepEqual(parseRegen('a.mjs,--write;!npm,run,build').map((c) => [c.manual, c.text]), [[false, 'node a.mjs --write'], [true, 'npm run build']]);
});

test('⑧ the session tools register it: worktree.mjs (new and status) and master-sync.mjs (--sync)', () => {
  const wt = readFileSync(join(ROOT, 'scripts/worktree.mjs'), 'utf8');
  const ms = readFileSync(join(ROOT, 'scripts/master-sync.mjs'), 'utf8');
  assert.match(wt, /import \{ install as installMergeDriver[^}]*\} from '\.\/merge-driver\.mjs'/);
  assert.match(wt, /function makeNew[\s\S]*installMergeDriver\(dir\)[\s\S]*function markVerified/, 'new registers it');
  assert.match(wt, /function status\(brief\)[\s\S]*mergeDriver\(here\)/, 'status (the SessionStart hook in both products) registers it');
  assert.match(ms, /import \{ install as installMergeDriver \} from '\.\/merge-driver\.mjs'/);
  assert.match(ms, /if \(want\('--sync'\)\)[\s\S]*installMergeDriver\(MASTER\)/, '--sync registers it on the master');
});
