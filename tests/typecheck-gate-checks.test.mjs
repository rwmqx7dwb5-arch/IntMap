/* ============================================================================
 *  typecheck-gate — a method added to only ONE engine's adapter does not pass the gate
 * ----------------------------------------------------------------------------
 *  THE DEFECT. The renderer seam (js/geo-engine.js's `makeMapLibreAdapter` and
 *  js/cesium-engine.js's `makeCesiumAdapter`, behind the eight-namespace facade)
 *  was held together by prose — Architecture.md §1.2: 「契約に無い関数名をアダプタに
 *  だけ足すと『2つ目以降』が静かに落ちる」 — and by AST checks that compare the
 *  capability TABLES, not the method sets. Measured when this was written: the two
 *  adapters returned 156 and 142 members, 15 of them on the MapLibre side only and
 *  1 on the Cesium side only, and nothing in the repository named which.
 *
 *  So the invariant is stated as the defect, and exercised on a COPY of the tree
 *  with the real compiler (npm run check:types is `tsc --noEmit`):
 *    ① the unmodified copy passes;
 *    ② a method added to the MapLibre adapter only fails;
 *    ③ a method added to the Cesium adapter only fails;
 *    ④ a method declared required by the contract and implemented by one adapter fails;
 *    ⑤ the facade calling an adapter method the contract does not have fails;
 *    ⑥ a js/ file enters the checked population by carrying `// @ts-check` — no list.
 *  Plus two registers the declarations may not contradict (IM_HOST and window).
 *  One copy, mutated and restored in turn: each tsc run is about a second.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const TSC = join(dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');

/* a comment-free view of a declaration file, so prose that mentions a member is not a member */
function stripComments(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }
function interfaceBody(src, name) {
  const s = stripComments(src);
  const at = s.search(new RegExp('interface\\s+' + name + '\\b[^{]*\\{'));
  assert.ok(at >= 0, 'interface ' + name + ' is declared');
  let i = s.indexOf('{', at) + 1, depth = 1; const start = i;
  for (; i < s.length && depth; i++) { if (s[i] === '{') depth++; else if (s[i] === '}') depth--; }
  return s.slice(start, i - 1);
}
/** top-level members of an interface body: { name, readonly } */
function membersOf(body) {
  const out = []; let depth = 0, line = '', prev = '';
  for (const ch of body) {
    if (ch === '{' || ch === '(' || ch === '<') depth++;
    if (ch === '}' || ch === ')' || (ch === '>' && prev !== '=')) depth--;   /* `=>` is not a closing angle */
    prev = ch;
    if (ch === ';' && depth === 0) { const m = /^\s*(readonly\s+)?([A-Za-z_$][\w$]*)\??\s*[:(]/.exec(line); if (m) out.push({ name: m[2], readonly: !!m[1] }); line = ''; continue; }
    line += ch;
  }
  return out;
}

/* ── the copy ──────────────────────────────────────────────────────────────────────────────── */
function makeCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-'));
  cpSync(join(ROOT, 'js'), join(dir, 'js'), { recursive: true });
  cpSync(join(ROOT, 'types'), join(dir, 'types'), { recursive: true });
  /* the copy has no node_modules; bare specifiers (cesium, maplibre-gl…) resolve into the real one
     through `paths`, so the copy sees exactly the declarations the gate sees */
  const nm = join(ROOT, 'node_modules').replace(/\\/g, '/');
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    extends: join(ROOT, 'tsconfig.json').replace(/\\/g, '/'),
    compilerOptions: { paths: { '*': [nm + '/*'] } },
    include: ['types/**/*.d.ts', 'js/**/*.js'],
  }));
  return dir;
}
/** tsc's diagnostics, one per error: the `file(l,c): error TSn:` line and its indented continuation */
function diagnostics(out) {
  const blocks = [];
  for (const l of String(out).split(/\r?\n/)) {
    if (/^\S.*: error TS\d+:/.test(l)) blocks.push(l); else if (/^\s/.test(l) && blocks.length) blocks[blocks.length - 1] += '\n' + l;
  }
  return blocks;
}
/** is there an error, in `file`, whose text names `what` (and, if given, has code `code`)? */
function reports(r, file, what, code) {
  const re = new RegExp('(^|[\\\\/])' + file.replace(/[.\\/]/g, (c) => (c === '.' ? '\\.' : '[\\\\/]')) + '\\(\\d+,\\d+\\): error ' + (code || 'TS\\d+') + ':');
  return diagnostics(r.out).some((b) => re.test(b) && b.includes(what));
}
function tsc(dir) {
  try { execFileSync(process.execPath, [TSC, '--noEmit', '-p', join(dir, 'tsconfig.json')], { encoding: 'utf8', stdio: 'pipe' }); return { code: 0, out: '' }; }
  catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
}
/** apply one exact, unique replacement to a file in the copy, run tsc, put the file back */
function mutated(dir, edits, fn) {
  const saved = new Map();
  try {
    for (const [rel, from, to] of edits) {
      const f = join(dir, rel); const src = saved.has(f) ? readFileSync(f, 'utf8') : (saved.set(f, readFileSync(f, 'utf8')), saved.get(f));
      assert.equal(src.split(from).length - 1, 1, `${rel}: the anchor «${from.slice(0, 60)}» is present exactly once (the probe must touch what it claims to)`);
      writeFileSync(f, src.replace(from, to));
    }
    return fn(tsc(dir));
  } finally { for (const [f, s] of saved) writeFileSync(f, s); }
}

const ML_ANCHOR = "return { id:'maplibre', capabilities:MAPLIBRE_CAPS,";
const CE_ANCHOR = "id:'cesium', capabilities:CESIUM_CAPS,";
const CORE_ANCHOR = 'export interface GeoEngineAdapterCore {';
const FACADE_ANCHOR = 'raw(){ return A().raw(); }';
const PROBE = 'js/probe.js';

test('typecheck-gate the renderer contract is enforced by the compiler, on both engines', { timeout: 180000 }, () => {
  const dir = makeCopy();
  try {
    /* the probe file exists in every run below; only ⑥ gives it the pragma */
    writeFileSync(join(dir, PROBE), 'window.IntMapGeoEngine.camera.r813Probe();\n');

    const base = tsc(dir);
    assert.equal(base.code, 0, '① the unmodified copy (plus an UNCHECKED probe file) passes:\n' + base.out);

    mutated(dir, [['js/geo-engine.js', ML_ANCHOR, ML_ANCHOR + ' r813Probe(){ return null; },']], (r) => {
      assert.notEqual(r.code, 0, '② a method on the MapLibre adapter only must fail the gate');
      assert.ok(reports(r, 'js/geo-engine.js', 'r813Probe'), r.out);
    });
    mutated(dir, [['js/cesium-engine.js', CE_ANCHOR, CE_ANCHOR + ' r813Probe(){ return null; },']], (r) => {
      assert.notEqual(r.code, 0, '③ a method on the Cesium adapter only must fail the gate');
      assert.ok(reports(r, 'js/cesium-engine.js', 'r813Probe'), r.out);
    });
    mutated(dir, [
      ['types/geo-engine.d.ts', CORE_ANCHOR, CORE_ANCHOR + ' r813Probe(): any;'],
      ['js/geo-engine.js', ML_ANCHOR, ML_ANCHOR + ' r813Probe(){ return null; },'],
    ], (r) => {
      assert.notEqual(r.code, 0, '④ a required member implemented by MapLibre alone must fail the gate');
      assert.ok(reports(r, 'js/cesium-engine.js', 'r813Probe'), 'the engine that LACKS it is the one named:\n' + r.out);
    });
    mutated(dir, [['js/geo-engine.js', FACADE_ANCHOR, 'raw(){ return A().r813Probe(); }']], (r) => {
      assert.notEqual(r.code, 0, '⑤ the facade calling a method the contract lacks must fail the gate');
      assert.ok(reports(r, 'js/geo-engine.js', 'r813Probe', 'TS2339'), r.out);
    });
    mutated(dir, [[PROBE, 'window.IntMapGeoEngine', '// @ts-check\nwindow.IntMapGeoEngine']], (r) => {
      assert.notEqual(r.code, 0, '⑥ the same probe file, once it carries // @ts-check, is checked without being listed anywhere');
      assert.ok(reports(r, PROBE, 'r813Probe', 'TS2339'), r.out);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('typecheck-gate IMHost does not contradict the register check:surface keeps', () => {
  const reg = JSON.parse(readFileSync(join(ROOT, 'tests', 'global-surface-baseline.json'), 'utf8'));
  const host = new Set(reg.host), writable = new Set(reg.hostWritable);
  const members = membersOf(interfaceBody(readFileSync(join(ROOT, 'types', 'im-host.d.ts'), 'utf8'), 'IMHost'));
  assert.ok(members.length >= 5, 'IMHost was read (' + members.length + ' members)');
  const problems = [];
  for (const m of members) {
    if (!host.has(m.name)) problems.push(`${m.name}: not a member of IM_HOST (tests/global-surface-baseline.json host)`);
    else if (!m.readonly && !writable.has(m.name)) problems.push(`${m.name}: declared writable, but IM_HOST has no setter for it`);
    else if (m.readonly && writable.has(m.name)) problems.push(`${m.name}: declared readonly, but IM_HOST has a setter for it`);
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('typecheck-gate the declared window globals are the ones the program publishes — none invented', () => {
  const reg = new Set(JSON.parse(readFileSync(join(ROOT, 'tests', 'global-surface-baseline.json'), 'utf8')).window);
  const src = readFileSync(join(ROOT, 'types', 'globals.d.ts'), 'utf8');
  const published = membersOf(interfaceBody(src, 'IntMapPublished')).map((m) => m.name);
  const elsewhere = membersOf(interfaceBody(src, 'PublishedElsewhere')).map((m) => m.name);
  assert.ok(published.length >= 5, 'IntMapPublished was read');
  assert.deepEqual(published.filter((n) => !reg.has(n)), [], 'declared as published by js/ or src/, but check:surface has never seen it published');
  assert.deepEqual(elsewhere.filter((n) => reg.has(n)), [], 'declared as published elsewhere, but a js/ or src/ file publishes it — it belongs in IntMapPublished');
});

test('typecheck-gate a @ts-expect-error in a checked file says why', () => {
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : (n.endsWith('.js') ? [p] : []); });
  /* the pragma counts where tsc reads it: among the comments before the first statement. A linear
     scan, not one regex — `(\/\*[\s\S]*?\*\/\s*)*` backtracks without end on a long header comment. */
  const hasPragma = (src) => {
    let i = 0;
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++;
      if (src.startsWith('//', i)) { const e = src.indexOf('\n', i); const line = src.slice(i, e < 0 ? src.length : e); if (/^\/\/\s*@ts-check\b/.test(line)) return true; if (e < 0) return false; i = e + 1; continue; }
      if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); if (e < 0) return false; i = e + 2; continue; }
      return false;
    }
  };
  const checked = walk(join(ROOT, 'js')).filter((f) => hasPragma(readFileSync(f, 'utf8')));
  assert.ok(checked.length >= 2, 'the checked population was discovered (' + checked.length + ' files)');
  const bare = [];
  for (const f of checked) readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => {
    const m = /@ts-expect-error\b(.*)$/.exec(l);
    if (m && m[1].replace(/\*\/.*$/, '').trim().split(/\s+/).filter(Boolean).length < 4) bare.push(`${f.slice(ROOT.length)}:${i + 1}`);
  });
  assert.deepEqual(bare, [], 'a suppression without its reason hides a contract break in silence');
});
