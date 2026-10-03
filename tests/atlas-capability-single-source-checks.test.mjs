/* ============================================================================
 *  tests/atlas-capability-single-source-checks.test.mjs — ONE CAPABILITY, ONE DECLARATION
 * ----------------------------------------------------------------------------
 *  (atlas-capability-single-source) A capability was written in up to seven places: its entry (row, schema,
 *  run), a line of js/atlas-catalog-text.js holding its block's ids AND its whole text, five planner-policy
 *  tables and the camera goals in js/atlas-capabilities.js, the map-chip table in js/atlas-console.js, the
 *  answer families in js/atlas-turn-results.js, the withdrawal a second time in scripts/atlas-catalog.mjs and
 *  the silent ledger in scripts/atlas-capability-audit.mjs. Six PRs in one day collided on those lines —
 *  two of them rewrote the same catalogue line and were merged by hand. Now the entry holds all of it
 *  (js/atlas-caps.js says what an entry may hold) and everything else is derived.
 *
 *    ① the catalogue is ASSEMBLED from the entries' `doc`, and every capability is documented by its entry
 *    ② the assembler orders by `at`, carries mentions and runtime text, and refuses what would be silently wrong
 *    ③ adding a capability to a shared block is one entry — nothing else changes
 *    ④ the eager registry's policy, answers and camera goals are the entries' (copied, held by --check)
 *    ⑤ THE GATE: no capability table is written by hand outside the entries
 *    ⑥ a scripted cassette does not depend on any description; a recorded meaning-search answer is
 *       described by the current declarations, and a changed one is reported
 *    ⑦ the silent ledger is the entries' and it is closed
 *  Every check is shown to fail on the defect it exists for (a fixture), not only to pass on the tree.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseSource } from './helpers/ast.mjs';
import { CATALOGUE_CHUNKS, makeAtlasCatalogText } from '../js/atlas-catalog-text.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;   /* as the audit and the replay load the registry */
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const KIT = await imp('js/atlas-caps.js');
const { CAPABILITY_MODULES } = await imp('js/atlas-caps-modules.js');
const CAPS = (await imp('js/atlas-capabilities.js')).makeAtlasCapabilities({}, { publish: false });
const GEN = await imp('scripts/atlas-caps.mjs');
const ENTRIES = KIT.capabilityEntries(CAPABILITY_MODULES);
const DOCS = makeAtlasCatalogText({}, {});
const C0 = { lang: 'English', moduleCatalog: () => '', metricList: () => '', showcaseList: () => '', tourList: () => '' };

/* the blocks as text, cut out of text(null) by their own lengths (what SYS() and find_capability read) */
function blockTexts(docs) {
  const full = docs.text(null); let at = 0;
  return docs.blocks().map((b) => { const t = full.slice(at, at + b.bytes); at += b.bytes; return { name: b.name, ids: b.ids, t }; });
}

/* ── ① ──────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-single-source ①: the catalogue is assembled from the entries, and every capability is documented by its entry', () => {
  const names = CATALOGUE_CHUNKS.map((k) => k.name);
  assert.equal(new Set(names).size, names.length, 'a chunk is declared once');
  const val = (t) => (typeof t === 'function' ? t({ lang: 'English', moduleCatalog: () => '', metricList: () => '', showcaseList: () => '', tourList: () => '' }) : t);
  /* recomputed here from the entries, independently of the assembler: head + the fragments that name the chunk, by `at` */
  const blocks = blockTexts(DOCS);
  assert.deepEqual(blocks.map((b) => b.name), names, 'one block per chunk, in the chunks\' order');
  for (const k of CATALOGUE_CHUNKS) {
    const frags = ENTRIES.flatMap((e) => e.doc.filter((d) => d.in === k.name && d.text != null).map((d) => ({ at: d.at || 0, t: d.text })))
      .sort((a, b) => a.at - b.at);
    const want = (k.head != null ? val(k.head) : '') + frags.map((f) => val(f.t)).join('');
    const got = blocks.find((b) => b.name === k.name);
    /* the showcase and module lists come from the runtime; compare with the same (empty) context */
    if (frags.some((f) => typeof f.t === 'function') || typeof k.head === 'function') continue;
    assert.equal(got.t, want, 'block «' + k.name + '» is its head and its fragments, nothing else');
  }
  for (const e of ENTRIES) {
    for (const d of e.doc) assert.ok(names.includes(d.in), e.id + ' names the chunk «' + d.in + '», which is not declared');
    if (e.policy && (e.policy.withdrawn || e.policy.ruleDocumented)) continue;
    assert.ok(e.doc.length, e.id + ' has no `doc` — an action the catalogue does not describe does not exist for the planner (#R278)');
  }
  /* the ids a block reports are exactly the entries that name it */
  for (const b of DOCS.blocks()) {
    const named = ENTRIES.filter((e) => e.doc.some((d) => d.in === b.name)).map((e) => e.id).sort();
    assert.deepEqual(b.ids.slice().sort(), named, 'block «' + b.name + '» documents exactly the entries that name it');
  }
  /* and a block's prose is not in js/atlas-catalog-text.js any more: the fragments are where the capabilities are */
  const src = read('js/atlas-catalog-text.js');
  assert.ok(!/\bids:\s*\[/.test(src), 'js/atlas-catalog-text.js lists no `ids` — membership is declared by the entries');
  assert.ok(src.length < 40000, 'js/atlas-catalog-text.js holds headings and history, not the 117 kB of prose (' + src.length + ' bytes)');
});

/* ── ② ──────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-single-source ②: the assembler orders by `at`, carries mentions and runtime text, and refuses a silently wrong catalogue', () => {
  const row = (id, sp) => [id, sp, '', 'x', 'none', '', '', 'read', 'none', '', ''];
  const ent = (id, sp, doc, extra) => Object.assign({ row: row(id, sp), doc, schema: () => ({ type: 'object' }), run: async () => null }, extra || {});
  const chunks = [{ name: 'a', head: 'H: ' }, { name: 'b' }];
  const mods = { x: [
    ent('x.one', 'one', [{ in: 'a', at: 20, text: 'second; ' }]),
    ent('x.two', 'two', [{ in: 'a', at: 10, text: (c) => 'first ' + c.lang + '; ' }, { in: 'b', text: 'own' }]),
    ent('x.three', 'three', [{ in: 'a' }]),
  ] };
  const B = KIT.catalogueBlocks(mods, chunks, { lang: 'EN' });
  assert.deepEqual(B.map((b) => b.t), ['H: first EN; second; ', 'own']);
  assert.deepEqual(B[0].ids, ['x.two', 'x.one', 'x.three'], 'fragments by position, then the capabilities its heading documents');
  const refuses = (m, ch, re) => assert.throws(() => KIT.catalogueBlocks(m, ch, {}), re);
  refuses({ x: [ent('x.one', 'one', [{ in: 'nowhere', text: 't' }])] }, chunks.slice(0, 1).concat([{ name: 'b' }]), /does not declare/);
  refuses({ x: [ent('x.one', 'one', [{ in: 'a', at: 5, text: 'p' }]), ent('x.two', 'two', [{ in: 'a', at: 5, text: 'q' }, { in: 'b', text: 'r' }])] }, chunks, /both put their fragment of «a» at position 5/);
  refuses({ x: [ent('x.one', 'one', [{ in: 'a', text: 'p' }])] }, chunks, /«b» documents no capability/);
  assert.throws(() => KIT.capabilityEntries({ x: [ent('x.one', 'one', [], { dco: [] })] }), /unknown field «dco»/, 'a misspelt field is refused, not ignored');
  assert.throws(() => KIT.capabilityEntries({ x: [ent('x.one', 'one', [], { catalogueSilent: true })] }), /YYYY-MM-DD/);
  assert.throws(() => KIT.capabilityEntries({ x: [ent('x.one', 'one', [], { policy: { forbiden: [] } })] }), /policy has an unknown field «forbiden»/);
  assert.throws(() => KIT.capabilityPolicy({ x: [ent('x.one', 'one', [], { policy: { forbidden: ['x.ghost'] } })] }), /names «x\.ghost», which is not a capability/);
});

/* ── ③ ──────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-single-source ③: adding a capability to a shared block is ONE entry — nothing else changes', () => {
  const probe = {
    row: ['map.singleSourceProbe', 'singleSourceProbe', '', 'map', 'none', '', 'explanation', 'read', 'none', '', ''],
    doc: [{ in: 'tools-panels', at: 1e9, text: '{"type":"singleSourceProbe"} = a probe. ' }],
    schema: () => ({ type: 'object' }), run: async () => null,
  };
  const mods = Object.assign({}, CAPABILITY_MODULES, { map: CAPABILITY_MODULES.map.concat([probe]) });
  const before = KIT.catalogueBlocks(CAPABILITY_MODULES, CATALOGUE_CHUNKS, C0);
  const after = KIT.catalogueBlocks(mods, CATALOGUE_CHUNKS, C0);
  const i = before.findIndex((b) => b.name === 'tools-panels');
  assert.ok(i >= 0);
  assert.equal(after[i].t, before[i].t + probe.doc[0].text, 'the shared block gains the fragment, at the place its `at` says');
  assert.ok(after[i].ids.includes('map.singleSourceProbe'));
  after.forEach((b, j) => { if (j !== i) assert.deepEqual(b, before[j], 'every other block is untouched'); });
  const prev = ENTRIES.map((e) => e.id);
  assert.deepEqual(KIT.capabilityRows(mods, prev).map((r) => r[0]), prev.concat(['map.singleSourceProbe']), 'its row is generated after the others');
  assert.deepEqual(KIT.capabilityPolicy(mods, prev.concat(['map.singleSourceProbe'])), KIT.capabilityPolicy(CAPABILITY_MODULES, prev), 'and the policy tables do not change');
});

/* ── ④ ──────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-single-source ④: the eager registry\'s policy, answers and camera goals are the entries\'', async () => {
  assert.deepEqual(await GEN.stale(), [], 'run `node scripts/atlas-caps.mjs --write`');
  const P = KIT.capabilityPolicy(CAPABILITY_MODULES, CAPS.list());
  assert.deepEqual(CAPS.withdrawn().sort(), Object.keys(P.withdrawn).sort());
  assert.deepEqual(CAPS.ruleDocumented(), P.ruleDocumented);
  for (const c of CAPS.all()) {
    assert.equal(c.isFallback, !!P.fallbacks[c.id], c.id + ' fallback');
    assert.equal(c.isAnswer, !!P.answers[c.id], c.id + ' answer');
    assert.deepEqual(c.forbiddenSubstitutes, P.forbidden[c.id] || [], c.id + ' forbidden');
    assert.deepEqual(c.equivalents, P.equivalents[c.id] || [], c.id + ' equivalents');
  }
  /* the camera goals: the generated region holds exactly the entries that declare one */
  const reg = read('js/atlas-capabilities.js');
  const g = reg.slice(reg.indexOf('/* ⚠ GENERATED CAMERA GOALS — BEGIN'), reg.indexOf('/* ⚠ GENERATED CAMERA GOALS — END */'));
  const inRegion = [...g.matchAll(/^ {6}"([a-z]+\.[A-Za-z]+)": function/gm)].map((m) => m[1]).sort();
  assert.deepEqual(inRegion, ENTRIES.filter((e) => e.goal).map((e) => e.id).sort());
  assert.ok(inRegion.length >= 4, 'flyTo, zoom, bearing and pitch carry their postconditions');
  /* a goal is copied as written, so it may read only its arguments */
  const fn = (src) => parseSource('(' + src + ')', { sourceType: 'module' }).body[0].expression;
  assert.deepEqual(GEN.freeNames(fn('function (a, raw, h) { var d = raw && raw.meta; return h.boxOf(d) ? [{ k: Math.abs(a.x) }] : null; }')), []);
  assert.deepEqual(GEN.freeNames(fn('function (a, raw) { return boxOf(a.box) ? [] : null; }')), ['boxOf'], 'a name from the registry\'s closure is refused');
});

/* ── ⑤ THE GATE ─────────────────────────────────────────────────────────────────────────────────── */
/* A capability TABLE written by hand: an object literal with two or more KEYS that are capability ids (a property
   per capability), or a NAMED LIST — an array literal bound to a variable — with two or more elements that are
   capability ids (an id that is also an effect key — column 5, e.g. `map.highlight` — may be a list of effects,
   which is not a capability table). A list that is the value of some OTHER thing's property (a layer naming the
   capabilities that act on it) is a cross-reference from that declaration, not a second copy of a capability's.
   Comments are not code. */
function handTables(src, ids, effects, skip) {
  const ast = parseSource(src, { sourceType: 'module', orNull: true });
  if (!ast) return [];
  const out = [];
  const inSkip = (n) => (skip || []).some(([a, b]) => n.start >= a && n.end <= b);
  (function visit(n, parent) {
    if (!n || typeof n.type !== 'string' || inSkip(n)) return;
    if (n.type === 'ObjectExpression') {
      const ks = n.properties.filter((p) => p.key && p.key.type === 'Literal' && ids.has(p.key.value)).map((p) => p.key.value);
      if (ks.length >= 2) out.push({ line: n.loc.start.line, ids: ks });
    }
    if (n.type === 'ArrayExpression' && parent && (parent.type === 'VariableDeclarator' || parent.type === 'AssignmentExpression')) {
      const es = n.elements.filter((e) => e && e.type === 'Literal' && ids.has(e.value) && !effects.has(e.value)).map((e) => e.value);
      if (es.length >= 2) out.push({ line: n.loc.start.line, ids: es });
    }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach((x) => visit(x, n)); else if (v && typeof v.type === 'string') visit(v, n); }
  })(ast, null);
  return out;
}
/* the GENERATED regions of a file — the copies the generator writes and --check holds */
function generatedRegions(src) {
  const out = [];
  for (const m of src.matchAll(/\/\* ⚠ GENERATED ([A-Z ]+) — BEGIN/g)) {
    const end = src.indexOf('/* ⚠ GENERATED ' + m[1] + ' — END */', m.index);
    if (end > 0) out.push([m.index, end]);
  }
  return out;
}
test('atlas-capability-single-source ⑤: no capability table is written by hand outside the entries', () => {
  const ids = new Set(CAPS.list());
  const effects = new Set(CAPS.all().flatMap((c) => c.effects.writes));
  const files = [
    ...fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js') && !f.startsWith('atlas-cap-')).map((f) => 'js/' + f),
    ...fs.readdirSync(path.join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => 'src/' + f),
    ...fs.readdirSync(path.join(ROOT, 'scripts'), { recursive: true }).map((f) => String(f).replace(/\\/g, '/')).filter((f) => /\.m?js$/.test(f)).map((f) => 'scripts/' + f),
  ];
  const found = [];
  for (const f of files) {
    const src = read(f);
    if (!/['"][a-z]+\.[A-Za-z]+['"]/.test(src)) continue;
    for (const h of handTables(src, ids, effects, generatedRegions(src))) found.push(f + ':' + h.line + ' ' + h.ids.slice(0, 4).join(', ') + (h.ids.length > 4 ? ' …' : ''));
  }
  assert.deepEqual(found, [], 'a per-capability table outside js/atlas-cap-<namespace>.js — declare it in the entries (js/atlas-caps.js ENTRY_KEYS / POLICY_KEYS) and derive it');
  /* and the gate sees the defect it exists for */
  const fixture = "const T = { 'view.flyTo': 1, 'view.zoom': 2 };\nconst L = ['research.brief', 'research.analyze'];\n/* ⚠ GENERATED X — BEGIN */ const G = ['view.flyTo', 'view.zoom']; /* ⚠ GENERATED X — END */\nconst layer = { atlas: ['layers.planeAltitude', 'layers.aircraftTrack'] };";
  assert.deepEqual(handTables(fixture, ids, effects, generatedRegions(fixture)).map((h) => h.line), [1, 2], 'a hand table is found; a generated copy and a cross-reference are not');
});

/* ── ⑥ CASSETTES ───────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-single-source ⑥: a scripted cassette does not depend on any description; a recorded meaning-search answer is described by the declarations of today', async () => {
  const R = await imp('scripts/atlas-eval/replay.mjs');
  const SC = await imp('scripts/atlas-eval/scripted-cassettes.mjs');
  const LAB = await imp('scripts/atlas-eval/lab.mjs');
  const P = await R.productModules(imp);
  /* every description changed — the PR that touches one capability's words, made total.
     ⚠ THE WORDS, NOT THE LINES: the search reads the catalogue one LINE at a time (js/atlas-capabilities.js
     docNorms/docBlocks) and a term is worth something only while few lines carry it (DOC_TERM_MAX_DF). A
     fragment ends with its newline, so a suffix written AFTER it lands at the head of the next fragment's
     line, splits identical lines apart and changes how many lines there are — measured (wave2-train):
     83 → 94 lines, and 「時間」 went from 4 lines (worth 3) to 5 (worth 0), which is a change of STRUCTURE the
     rewording PR this fixture stands for does not make. So the suffix goes before the fragment's own newline. */
  const reword = (s) => String(s).replace(/(\n*)$/, ' (reworded)$1');
  const edited = Object.fromEntries(Object.entries(CAPABILITY_MODULES).map(([ns, list]) => [ns, list.map((e) => Object.assign({}, e, {
    doc: (e.doc || []).map((d) => (d.text == null ? d : Object.assign({}, d, { text: (c) => reword(typeof d.text === 'function' ? d.text(c) : d.text) }))) }))]));
  const PE = Object.assign({}, P, { makeAtlasCatalogText: (H, C) => P.makeAtlasCatalogText(H, Object.assign({}, C, { modules: edited })) });
  assert.notEqual(PE.makeAtlasCatalogText({}, {}).text(null), P.makeAtlasCatalogText({}, {}).text(null), 'the fixture really rewords the catalogue');
  const committed = LAB.loadCassettes(ROOT);
  for (const b of await SC.build(PE)) {
    const c = committed.find((x) => x.id === b.id);
    const { __file, ...was } = c;
    assert.equal(R.canon(was), R.canon(JSON.parse(JSON.stringify(b))), b.id + ' went stale on a description change — a cassette must hold what came from outside, not what the code will say again');
  }
  for (const c of committed) for (const f of (c.world && c.world.find) || []) {
    assert.ok(!('documentation' in f.result) && (f.result.matches || []).every((m) => !('summary' in m) && !('schema' in m)), c.id + ' still records catalogue prose');
  }
  /* a meaning-search answer, recorded with each match's declaration version, then replayed after the descriptions changed */
  const base = committed.find((c) => c.id === 'tokaido-route-answered');
  const CAPS2 = P.makeAtlasCapabilities({}); const SCH = P.makeAtlasSchemas();
  CAPS2.bindRuntime({ docs: P.makeAtlasCatalogText({}, {}), schemas: SCH, semantic: async () => ({ state: 'replay' }) });
  const surface = P.makeAtlasToolSurface({ capabilities: CAPS2, schemas: SCH, runAction: async () => ({ ok: true }) });
  const sem = JSON.parse(JSON.stringify(base));
  sem.world.find = sem.world.find.map((f) => ({ query: f.query, result: R.compactFind(Object.assign({}, f.result, { basis: 'lexical+semantic', matches: f.result.matches }), surface) }));
  assert.ok(sem.world.find[0].result.matches.every((m) => /^[0-9a-f]{8}$/.test(m.v)), 'each recorded match carries the version of what the model was shown');
  const same = await R.replayCassette(sem, P);
  assert.deepEqual(same.divergences, []); assert.deepEqual(same.notes, []);
  const now = await R.replayCassette(sem, PE);
  assert.deepEqual(now.divergences, [], 'a reworded description is not a different turn');
  assert.ok(now.notes.length && now.notes.every((n) => n.kind === 'declaration_changed'), 'but it is reported: the model would now be told something different');
  const told = JSON.parse(now.calls[0].resultText);
  assert.match(told.documentation, /\(reworded\)/, 'the replayed answer is described by the declarations as they are now');
});

/* ── ⑦ ──────────────────────────────────────────────────────────────────────────────────────────── */
test('atlas-capability-single-source ⑦: the silent ledger is the entries\' and it is closed', async () => {
  const AUD = await imp('scripts/atlas-capability-audit.mjs');
  assert.deepEqual(AUD.CATALOGUE_SILENT.slice().sort(), ENTRIES.filter((e) => e.catalogueSilent).map((e) => e.id).sort());
  assert.ok(ENTRIES.filter((e) => e.catalogueSilent).every((e) => e.catalogueSilent <= AUD.LEDGER_CLOSED));
  assert.ok(!/export const CATALOGUE_SILENT = \[/.test(read('scripts/atlas-capability-audit.mjs')), 'the ledger is not a list in the audit');
  const ledger = ENTRIES.filter((e) => e.catalogueSilent).map((e) => ({ id: e.id, on: e.catalogueSilent }));
  const late = await AUD.audit({ silentLedger: ledger.concat([{ id: 'view.locate', on: '2026-10-02' }]) });
  const sub = late.checks.find((c) => c.id === 'subject-findable');
  assert.ok(sub.failures.some((f) => /view\.locate: `catalogueSilent: '2026-10-02'` — the ledger closed/.test(f)), 'a flag dated after the ledger closed is refused by name');
});
