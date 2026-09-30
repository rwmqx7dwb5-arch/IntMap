/* ============================================================================
 *  atlas-capability-modules — ONE CAPABILITY, ONE PLACE
 * ----------------------------------------------------------------------------
 *  A capability used to be written in five places: its row in js/atlas-capabilities.js, its `case` in
 *  the 2,190-line dispatch switch of js/atlas-console.js, its schema in js/atlas-schemas.js, its
 *  catalogue prose, and (through the row) its observer. Now it is ONE ENTRY in
 *  js/atlas-cap-<namespace>.js — { row, schema, run } — and the registry table, the dispatch and the
 *  schema table are derived from the entries (js/atlas-caps.js). What this file holds to:
 *
 *    ① every registry row is exactly one entry, in the file of its namespace, with a schema and a run;
 *       all 147 arms of the old switch (146 capabilities + its `default`) have somewhere to be
 *    ② the dispatch that SHIPS is one lookup — lifted out of js/atlas-console.js and EVALUATED: every
 *       declared spelling reaches its own entry's run, an unknown one (and `toString`) reaches
 *       unknownAction, and nothing is answered synchronously
 *    ③ K is complete and not padded: every kernel name a run reads is a getter the console hands it,
 *       every `let` a run writes has a setter, and no getter is left that no run reads
 *    ④ ADDING A CAPABILITY IS ONE FILE. On a scratch copy — never the working tree — one new
 *       js/atlas-cap-<namespace>.js plus `node scripts/atlas-caps.mjs --write` puts the capability in
 *       the registry, the dispatch and the schema table, and its run answers
 *    ⑤ what is generated agrees with the entries, and the eager side carries no executor (and no extra module)
 *    ⑥ a malformed entry is refused by name, not dispatched
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseSource, walk } from './helpers/ast.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { capabilityEntries as entrySources } from './helpers/atlas-kernel.mjs';
import { namespaceFiles, namespaceOfFile, stale, GENERATED_FILES } from '../scripts/atlas-caps.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
const KIT = await import('../js/atlas-caps.js');
const { CAPABILITY_MODULES } = await import('../js/atlas-caps-modules.js');
const CAPS = makeAtlasCapabilities({}, { publish: false });
const ENTRIES = KIT.capabilityEntries(CAPABILITY_MODULES);
const CONSOLE = read('js/atlas-console.js');

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-modules ①: every registry row is one entry, in the file of its namespace, with a schema and a run', () => {
  const ids = CAPS.list();
  assert.ok(ids.length >= 140, `the registry has ${ids.length} rows — this check lost its subject`);
  assert.deepEqual(ENTRIES.map((e) => e.id).sort(), ids.slice().sort(), 'the registry and the entries name the same capabilities');
  const byId = new Map(ENTRIES.map((e) => [e.id, e]));
  const S = makeAtlasSchemas();
  for (const id of ids) {
    const e = byId.get(id), c = CAPS.resolve(id);
    assert.equal(typeof e.run, 'function', `${id} has no run`);
    assert.equal(e.row[1], c.legacy, `${id}: the entry's dispatch spelling is the registry's`);
    assert.deepEqual(S.schemaFor(id), e.schema(), `${id}: the schema table is the entry's schema`);
  }
  /* the file IS the namespace — derived from the file list, not typed */
  for (const src of entrySources()) assert.equal(namespaceOfFile(src.file), src.id.split('.')[0], `${src.id} lives in ${src.file}`);
  assert.deepEqual(namespaceFiles().map(namespaceOfFile), Object.keys(CAPABILITY_MODULES), 'the dispatch runs every namespace file there is, and no other');
  /* 146 capabilities + the switch's `default` = the 147 arms the switch had */
  assert.equal(typeof KIT.unknownAction, 'function', 'the switch\'s `default` has somewhere to be');
  /* …and no switch is left: the dispatch does not branch on a spelling any more */
  let switches = 0;
  walk.full(parseSource(CONSOLE, { sourceType: 'module' }), (n) => {
    if (n.type === 'SwitchStatement' && /dispatchName/.test(CONSOLE.slice(n.discriminant.start, n.discriminant.end))) switches++;
  });
  assert.equal(switches, 0, 'a switch over CAPS.dispatchName(...) is back in js/atlas-console.js');
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-modules ②: the shipped dispatch is one lookup — every spelling reaches its own run', async () => {
  const text = liftFunction(codeOnly(CONSOLE), 'dispatch');
  assert.match(text, /CAP_RUN\[t\]/, 'the lifted function is the lookup');
  /* the dispatch's own free names, handed in: the real registry, a recording run per spelling, the real fallback */
  const hits = [];
  const RUN = Object.create(null);
  for (const e of ENTRIES) RUN[e.row[1]] = (a) => { hits.push(e.id); return (async () => ({ ok: true, id: e.id }))(); };
  const K = { sentinel: true };
  let fellBack = 0;
  const unknown = async (a, dctx, k) => { fellBack++; assert.equal(k, K, 'the fallback receives K too'); return { ok: false }; };
  const R = (ok, html) => ({ ok: !!ok, html });
  const dispatch = new Function('CAPS', 'CAP_RUN', 'unknownAction', 'R', 'capDeps', 'return ' + text)(CAPS, RUN, unknown, R, () => K);
  let n = 0;
  for (const c of CAPS.all()) {
    for (const sp of c.aliases) {
      hits.length = 0;
      const p = dispatch({ type: sp });
      assert.ok(p && typeof p.then === 'function', `${sp}: the dispatch answers with a promise`);
      await p;
      assert.deepEqual(hits, [c.id], `the spelling «${sp}» must reach ${c.id}'s run`);
      n++;
    }
  }
  assert.ok(n >= 300, `only ${n} spellings were driven`);
  for (const sp of ['noSuchThing', 'toString', 'constructor', 'Reach']) {
    fellBack = 0; hits.length = 0;
    await dispatch({ type: sp });
    assert.equal(fellBack, 1, `«${sp}» belongs to no row and must reach unknownAction`);
    assert.deepEqual(hits, []);
  }
  const none = await dispatch({});
  assert.deepEqual(none, { ok: true, html: '' }, 'an action with no type answers as it always did');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-modules ③: K names exactly what the runs read — no missing name, no padding', () => {
  const ast = parseSource(CONSOLE, { sourceType: 'module' });
  let lit = null;
  walk.full(ast, (n) => { if (!lit && n.type === 'FunctionDeclaration' && n.id.name === 'capDeps') walk.full(n, (m) => { if (!lit && m.type === 'ObjectExpression') lit = m; }); });
  assert.ok(lit, 'js/atlas-console.js builds no K (capDeps)');
  const getters = new Set(), setters = new Set();
  for (const p of lit.properties) {
    const name = p.key.name;
    if (p.kind === 'get') {
      getters.add(name);
      const body = CONSOLE.slice(p.value.body.start, p.value.body.end);
      assert.match(body, new RegExp('return\\s+' + name.replace(/\$/g, '\\$') + '\\s*;'), `K.${name} must hand over the kernel's own ${name}`);
    } else if (p.kind === 'set') setters.add(name);
  }
  /* what the runs read and write, from the modules as they ship (and the fallback in js/atlas-caps.js) */
  const reads = new Set(), writes = new Set();
  const files = [...namespaceFiles(), 'js/atlas-caps.js'];
  for (const f of files) {
    walk.full(parseSource(read(f), { sourceType: 'module' }), (n) => {
      if (n.type === 'MemberExpression' && !n.computed && n.object.type === 'Identifier' && n.object.name === 'K') reads.add(n.property.name);
      const target = n.type === 'AssignmentExpression' ? n.left : n.type === 'UpdateExpression' ? n.argument : null;
      if (target && target.type === 'MemberExpression' && target.object.type === 'Identifier' && target.object.name === 'K') writes.add(target.property.name);
    });
  }
  assert.ok(reads.size >= 100, `only ${reads.size} K names read — this check lost its subject`);
  assert.deepEqual([...reads].filter((x) => !getters.has(x)).sort(), [], 'a run reads a kernel name K does not hand over — it would be undefined at run time');
  assert.deepEqual([...writes].filter((x) => !setters.has(x)).sort(), [], 'a run writes a kernel `let` K has no setter for — the write would be lost');
  assert.deepEqual([...getters].filter((x) => !reads.has(x)).sort(), [], 'K hands over a name no run reads — padding hides what each run depends on');
  /* a setter exists exactly where the kernel binding is reassignable */
  for (const s of setters) assert.match(CONSOLE, new RegExp('\\blet\\s+(?:[^;]*,\\s*)?' + s.replace(/\$/g, '\\$') + '\\b'), `K has a setter for ${s}, which is not a kernel \`let\``);
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────────── */
/* the files a set of modules needs, discovered by following their static imports — not listed */
function importClosure(start) {
  const seen = new Set(), queue = start.slice();
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const ast = parseSource(read(f), { sourceType: 'module' });
    for (const st of ast.body) {
      const src = (st.type === 'ImportDeclaration' || ((st.type === 'ExportNamedDeclaration' || st.type === 'ExportAllDeclaration') && st.source)) ? st.source.value : null;
      if (src && src.startsWith('.')) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), src)));
    }
  }
  return [...seen];
}

test('atlas-capability-modules ④: one new file is a new capability — in the registry, the dispatch and the schemas', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'intmap-capmod-'));
  try {
    const need = importClosure(['js/atlas-capabilities.js', 'js/atlas-schemas.js', 'js/atlas-caps.js', ...GENERATED_FILES, ...namespaceFiles()]);
    for (const f of need) {
      fs.mkdirSync(path.join(scratch, path.dirname(f)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, f), path.join(scratch, f));
    }
    /* THE ONE FILE: a namespace nobody has, one entry, written the way every entry is written */
    fs.writeFileSync(path.join(scratch, 'js/atlas-cap-probe.js'), [
      "import { str } from './atlas-caps.js';",
      'export default [',
      '  {',
      "    row: ['probe.echo', 'probeEcho', 'echoProbe', 'probe', 'none', '', 'explanation', 'read', 'none', 'text', ''],",
      "    schema: () => ({ type: 'object', properties: { text: str() }, required: ['text'] }),",
      "    async run(a, dctx, K) { const R = K.R; return R(true, 'echo:' + a.text); },",
      '  },',
      '];',
      '',
    ].join('\n'));
    const before = fs.readFileSync(path.join(scratch, 'js/atlas-capabilities.js'), 'utf8');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/atlas-caps.mjs'), '--write', '--root', scratch], { encoding: 'utf8' });
    const u = (f) => pathToFileURL(path.join(scratch, f)).href;
    const caps = (await import(u('js/atlas-capabilities.js'))).makeAtlasCapabilities({}, { publish: false });
    const probe = caps.resolve('probe.echo');
    assert.ok(probe, 'the registry has the new capability');
    assert.equal(caps.dispatchName('echoProbe'), 'probeEcho', 'its alias reaches its dispatch spelling');
    assert.deepEqual(caps.list().slice(0, -1), CAPS.list(), 'every existing capability kept its place; the new one is appended');
    const schemas = (await import(u('js/atlas-schemas.js'))).makeAtlasSchemas();
    assert.deepEqual(schemas.schemaFor('probe.echo').required, ['text'], 'the schema table has its schema');
    const kit = await import(u('js/atlas-caps.js'));
    const runs = kit.capabilityRunners((await import(u('js/atlas-caps-modules.js'))).CAPABILITY_MODULES);
    const r = await runs.probeEcho({ type: 'probeEcho', text: 'hi' }, {}, { R: (ok, html) => ({ ok, html }) });
    assert.deepEqual(r, { ok: true, html: 'echo:hi' }, 'the dispatch runs it');
    assert.notEqual(fs.readFileSync(path.join(scratch, 'js/atlas-capabilities.js'), 'utf8'), before, 'the eager rows were regenerated');
    /* the one file is also all the gate needs to see: nothing else in the scratch tree was edited by hand */
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/atlas-caps.mjs'), '--check', '--root', scratch], { encoding: 'utf8' });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  assert.deepEqual(await stale(), [], 'the working tree was not touched');
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-modules ⑤: the generated files agree with the entries, and the eager side carries no executor', async () => {
  assert.deepEqual(await stale(), [], 'run `node scripts/atlas-caps.mjs --write`');
  /* js/atlas-capabilities.js is EAGER: it imports nothing, and its generated region is rows — data, never a run */
  const capSrc = read('js/atlas-capabilities.js');
  const capAst = parseSource(capSrc, { sourceType: 'module' });
  assert.deepEqual(capAst.body.filter((s) => s.type === 'ImportDeclaration').map((s) => s.source.value), [], 'the eager registry imports nothing — no entry, no run');
  const b = capSrc.indexOf('/* ⚠ GENERATED ROWS — BEGIN'), e = capSrc.indexOf('/* ⚠ GENERATED ROWS — END */');
  assert.ok(b > 0 && e > b, 'the generated region is where the rows are');
  const region = capSrc.slice(capSrc.indexOf('var T = ', b) + 'var T = '.length, capSrc.lastIndexOf(';', e));
  const rows = JSON.parse(region.replace(/,\s*\]\s*$/, ']'));
  assert.deepEqual(rows.map((r) => r[0]), CAPS.list(), 'the registry is built from the generated rows, in their order');
  assert.deepEqual(rows, ENTRIES.map((x) => x.row).sort((p, q) => CAPS.list().indexOf(p[0]) - CAPS.list().indexOf(q[0])), 'and they are the entries\' rows, cell for cell');
  /* the entries (and so the runs) are reached only from the on-demand Atlas kernel */
  const importers = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter((x) => x.endsWith('.js')).map((x) => 'js/' + x).concat(fs.readdirSync(path.join(ROOT, 'src')).filter((x) => x.endsWith('.js')).map((x) => 'src/' + x))) {
    const ast = parseSource(read(f), { sourceType: 'module', orNull: true });
    if (!ast) continue;
    for (const st of ast.body) if (st.type === 'ImportDeclaration' && /^\.\/atlas-caps?(-modules)?\.js$|^\.\/atlas-cap-/.test(st.source.value) && !/^js\/atlas-cap(s|-)/.test(f)) importers.push(f);
  }
  assert.deepEqual([...new Set(importers)].sort(), ['js/atlas-console.js', 'js/atlas-schemas.js'], 'only the Atlas kernel reaches the runs');
  const { LAZY_REGISTRY } = await import('../js/lazy-modules.js');
  assert.ok(Object.values(LAZY_REGISTRY).some((m) => /atlas-console\.js/.test(String(m.load))), 'and the kernel itself is loaded on demand');
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-modules ⑥: a malformed entry is refused by name', () => {
  const one = (row, extra) => Object.assign({ row, schema: () => ({ type: 'object' }), run: async () => null }, extra);
  const row = (id, sp) => [id, sp, '', 'x', 'none', '', '', 'read', 'none', '', ''];
  assert.throws(() => KIT.capabilityEntries({ view: [one(row('map.misplaced', 'misplaced'))] }), /map\.misplaced belongs in js\/atlas-cap-map\.js/);
  assert.throws(() => KIT.capabilityEntries({ map: [one(row('map.a', 'same')), one(row('map.b', 'same'))] }), /«same» is declared twice/);
  assert.throws(() => KIT.capabilityEntries({ map: [one(row('map.a', 'a')), one(row('map.a', 'b'))] }), /map\.a is declared twice/);
  assert.throws(() => KIT.capabilityEntries({ map: [one(row('map.a', 'a'), { run: null })] }), /map\.a has no run/);
  assert.throws(() => KIT.capabilityEntries({ map: [one(['map.short', 'x'])] }), /not an 11- or 12-column registry row/);
  /* the lookup is a null-prototype map: an Object.prototype name is not a capability */
  const RUN = KIT.capabilityRunners(CAPABILITY_MODULES);
  assert.equal(RUN.toString, undefined);
  assert.equal(Object.getPrototypeOf(RUN), null);
  /* a schema is built FRESH per call — one caller's annotation cannot reach another capability */
  const a = makeAtlasSchemas().schemaFor('view.flyTo'), b = makeAtlasSchemas().schemaFor('view.flyTo');
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
});
