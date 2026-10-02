/* ============================================================================
 *  layer-packages — a row's implementation is a module its declaration names; js/data-layers.js only shrinks
 * ----------------------------------------------------------------------------
 *  Measured 2026-10-02 (a925952e): js/data-layers.js 6,108 lines, 119 assignments to window.*, 29 rows switched
 *  by name in toggleLayer / setLayerOpacity. A layer was a declaration (js/layers/<id>.js) plus a branch, a
 *  slider case and a block of closure code somewhere in the 6,000 lines. A LAYER PACKAGE (js/layer-pkg-<pkg>.js,
 *  named by the declaration's `pkg`) is the implementation as a module of its own, reached through one path.
 *
 *  What this file RUNS:
 *    ① every package a declaration names is a module whose factory, handed the kit js/data-layers.js hands it,
 *       returns exactly the rows that name it (no more, no fewer), each with on / off / opacity — and asks the
 *       kit for nothing js/data-layers.js does not put in it (the kit is a Proxy that refuses an unknown name)
 *    ② an off and an opacity that reach a package before anything was drawn draw nothing (the order
 *       js/data-layers.js replays switches in can start with either)
 *    ③ js/data-layers.js reaches a package through ONE path, ahead of every per-name branch, in the on half,
 *       the off half and the opacity — and keeps no branch for a packaged row
 *    ④ the gate (scripts/layer-packages.mjs, check:static) holds on this tree and refuses what it exists to
 *       refuse: a new branch, a branch for a packaged row, a line more, a window assignment more, a ledger
 *       that was not lowered — and `--update` refuses to raise
 *    ⑤ every row in the browser evaluation's photograph (tests/fixtures/layer-packages-before.json, taken on
 *       the tree before the move; tests/layer-manifest.spec.js ⑥ compares against it) is a packaged row
 *    ⑥ each package's switch returns the request it started, pending until the renderer can draw (the
 *       self-heal does not judge a row whose request is on its way — heal-waits-for-inflight)
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { LAYERS, layerDeclaration, packageOf } from '../js/layer-manifest.js';
import { packageFile, packageExport } from '../scripts/lib/layer-descriptor.mjs';
import { measure } from '../scripts/layer-packages.mjs';
import { importModule } from './helpers/import-module.mjs';
import { scratchTree } from './helpers/scratch-tree.mjs';
import '../js/safe-html.js';   /* publishes globalThis.IntMapSafe — the markup tag a package binds from the page */

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const DL = read('js/data-layers.js');
const AST = acorn.parse(DL, { ecmaVersion: 'latest', sourceType: 'module' });
const fnNamed = (name) => { let f = null; (function w(n) { if (!n || typeof n.type !== 'string' || f) return;
  if (n.type === 'FunctionDeclaration' && n.id && n.id.name === name) { f = n; return; }
  for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(w); else if (v && typeof v.type === 'string') w(v); } })(AST); return f; };
const src = (n) => DL.slice(n.start, n.end);

/* the rows each package must answer for, from the declarations */
const BY_PKG = new Map();
for (const l of LAYERS) { const d = layerDeclaration(l.id); if (d && d.pkg) BY_PKG.set(d.pkg, (BY_PKG.get(d.pkg) || []).concat(l.id)); }

/* what js/data-layers.js packageKit() puts in the kit — read from the object it builds */
const KIT_KEYS = (() => {
  const f = fnNamed('packageKit'); assert.ok(f, 'js/data-layers.js has no packageKit()');
  let obj = null; (function w(n) { if (!n || typeof n.type !== 'string' || obj) return;
    if (n.type === 'ObjectExpression' && n.properties.some((p) => p.key && p.key.name === 'live')) { obj = n; return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(w); else if (v && typeof v.type === 'string') w(v); } })(f);
  assert.ok(obj, 'packageKit() builds no kit object');
  const live = obj.properties.find((p) => p.key.name === 'live');
  const liveObj = live.value.type === 'CallExpression' ? live.value.arguments[0] : live.value;
  return { top: obj.properties.map((p) => p.key.name), live: liveObj.properties.map((p) => p.key.name) };
})();

/* a renderer that holds nothing and records every write */
function fakeEngine(log) {
  const rec = (what) => (...a) => { log.push([what, a[0]]); };
  const layers = { has: () => false, hasSource: () => false, get: () => null, getLayout: () => 'none', add: rec('add'), addSource: rec('addSource'),
    remove: rec('remove'), removeSource: rec('removeSource'), setLayout: rec('setLayout'), setPaint: rec('setPaint'), setSourceData: rec('setSourceData'), setSourceTiles: () => false };
  const E = { hasRenderer: () => true, layers, events: { on: () => {}, off: () => {}, once: () => {}, onLayer: () => {}, offLayer: () => {} }, scene: { hasImage: () => false, addImage: rec('addImage') } };
  return () => E;
}
/* a kit with exactly packageKit()'s names — anything else asked for is a seam the two files disagree about */
function strictKit(log) {
  const GE = fakeEngine(log);
  const el = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, querySelector: () => null, querySelectorAll: () => [], closest: () => null, setAttribute() {}, removeAttribute() {} });
  const values = { HOST: { lang: 'en' }, GE, setVis: (id, on) => log.push(['setVis', id, on]), beforeId: undefined, opacities: {}, layerReads: {},
    satToast: () => {}, tileLegends: () => {}, whenStyleReady: () => Promise.resolve(), addRaster: (id) => log.push(['addRaster', id]),
    rowUntilObserved: () => Promise.reject(Object.assign(new Error('aborted'), { reason: 'aborted' })), autoUncheck: () => {},
    /* the country-fill machinery the alliance rows draw with */
    withCountries: (cb) => Promise.resolve().then(cb), addChoro: (id) => log.push(['addChoro', id]), applyChoro: (id) => log.push(['applyChoro', id]),
    countryStats: {}, cName: (c) => c, ensureMapTooltip: () => el(), positionTooltip: () => {}, isMobile: () => false,
    flagM: () => '', NATO: new Set(['USA']) };
  const live = new Proxy({}, { get: (_t, k) => { if (!KIT_KEYS.live.includes(k)) throw new Error('the package asks the kit for live.' + String(k) + ', which packageKit() does not provide'); return el(); } });
  assert.deepEqual(Object.keys(values).sort(), KIT_KEYS.top.filter((k) => k !== 'live').sort(), 'this harness and packageKit() name the same kit');
  return new Proxy(Object.assign({ live }, values), { get: (t, k) => { if (!(k in t)) throw new Error('the package asks the kit for ' + String(k) + ', which packageKit() does not provide'); return t[k]; } });
}
const fakeDocument = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, getContext: () => null }), addEventListener() {} };

test('layer-packages ① every declared package answers for exactly its rows, through the kit js/data-layers.js builds', async () => {
  assert.ok(BY_PKG.size >= 3, 'at least the three packages the move made');
  for (const [pkg, ids] of BY_PKG) {
    const M = await importModule('js/' + packageFile(pkg), { globals: { window: { IntMapSafe: globalThis.IntMapSafe }, document: fakeDocument } });
    assert.equal(typeof M[packageExport(pkg)], 'function', 'js/' + packageFile(pkg) + ' exports ' + packageExport(pkg));
    const log = [];
    const inst = M[packageExport(pkg)](strictKit(log));
    assert.deepEqual(Object.keys(inst.rows).sort(), ids.slice().sort(), pkg + ': the rows the package answers for are the rows whose declaration names it');
    for (const id of ids) for (const k of ['on', 'off', 'opacity']) assert.equal(typeof inst.rows[id][k], 'function', id + ' has ' + k);
    for (const id of ids) assert.equal(packageOf(id), pkg);
  }
});

test('layer-packages ② an off or an opacity before anything was drawn draws nothing', async () => {
  for (const [pkg, ids] of BY_PKG) {
    const M = await importModule('js/' + packageFile(pkg), { globals: { window: { IntMapSafe: globalThis.IntMapSafe }, document: fakeDocument } });
    const log = [];
    const inst = M[packageExport(pkg)](strictKit(log));
    for (const id of ids) { inst.rows[id].opacity(0.5); inst.rows[id].off(); }
    const drew = log.filter(([w]) => /^(add|addSource|addRaster|setPaint|setSourceData)$/.test(w));
    assert.deepEqual(drew, [], pkg + ': nothing is drawn or painted by an off / opacity that came first');
  }
});

test('layer-packages ③ js/data-layers.js reaches a package through one path, ahead of every branch, and keeps none for a packaged row', () => {
  const tl = fnNamed('toggleLayer'), op = fnNamed('setLayerOpacity');
  assert.ok(tl && op);
  /* the on half and the off half of toggleLayer, and setLayerOpacity: the FIRST test of each chain is the package path */
  const chains = [];
  (function w(n) { if (!n || typeof n.type !== 'string') return;
    if (n.type === 'IfStatement' && n.test.type === 'Identifier' && n.test.name === 'on') { chains.push(n.consequent.body.find((s) => s.type === 'IfStatement')); chains.push(n.alternate.body.find((s) => s.type === 'IfStatement')); return; }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(w); else if (v && typeof v.type === 'string') w(v); } })(tl.body);
  chains.push(op.body.body.find((s) => s.type === 'IfStatement'));
  assert.equal(chains.length, 3);
  for (const c of chains) assert.match(src(c.test), /^packageOf\('dl-'\+id\)$/, 'the chain opens with the package path: ' + src(c).slice(0, 80));
  assert.match(src(chains[0].consequent), /_pkgSwitch\('dl-'\+id,true\)/);
  assert.match(src(chains[1].consequent), /_pkgSwitch\('dl-'\+id,false\)/);
  assert.match(src(chains[2].consequent), /_pkgOpacity\('dl-'\+id,v\)/);
  const branches = measure(DL).branches;
  for (const ids of BY_PKG.values()) for (const id of ids) {
    const key = (layerDeclaration(id).key) || id.replace(/^dl-/, '');
    assert.ok(!branches.includes(key), key + ' is a packaged row and still has a branch of its own');
  }
});

test('layer-packages ④ the gate holds here and refuses a branch, a line, a window assignment, a stale ledger', () => {
  const S = scratchTree();
  const run = (args = ['--check']) => S.node('scripts/layer-packages.mjs', args);
  assert.equal(run().code, 0, run().out);
  const dl = 'js/data-layers.js';
  const at = (t, needle, add) => { const i = t.indexOf(needle); assert.ok(i > 0, needle); return t.slice(0, i) + add + t.slice(i); };
  const ON = "        else if(id==='climate')";
  const cases = [
    ['a new row switched by name', (t) => at(t, ON, "        else if(id==='zzprobe'){ req=null; }\n"), /switch the row `zzprobe` by name/],
    ['a packaged row switched by name', (t) => at(t, ON, "        else if(id==='radar'){ req=null; }\n"), /`radar` is implemented by js\/layer-pkg-radar\.js/],
    ['a line more', (t) => t.replace('\n', '\n\n'), /lines, the ledger allows/],
    ['a window assignment more', (t) => at(t, '    function toggleLayer(id,on){', '    window.__zzProbe=1;\n'), /assignments to window\.\*, the ledger allows/],
    ['a line fewer, ledger not lowered', (t) => t.replace(/\n\s*\/\* the reads js\/layer-previews\.js asks for[^\n]*\n/, '\n'), /lines, the ledger still says .* lower it/],
  ];
  for (const [what, edit, want] of cases) {
    const r = S.mutate([{ file: dl, edit }], () => run());
    assert.equal(r.code, 1, what + ' passed the gate');
    assert.match(r.out, want, what);
  }
  /* --update lowers and never raises */
  const up = S.mutate([{ file: dl, edit: (t) => t.replace('\n', '\n\n') }, { file: 'tests/data-layers-baseline.json', edit: (t) => t }], () => run(['--update']));
  assert.equal(up.code, 1); assert.match(up.out, /refusing to raise/);
});

/* ⑥ (heal-waits-for-inflight, carried into the packages) a row's switch returns the request it started, and that
   request is pending while the work it waits on is: toggleLayer hands it to js/layer-rows.js layerInflight, and the
   self-heal does not judge a row whose request is on its way. tests/heal-waits-for-inflight-checks ④ holds that
   toggleLayer returns what the package path returns; this holds what each package's own switch returns. The reads
   are answered here (no network): the fire probe says «image», every JSON read refuses. */
test('layer-packages ⑥ each package\'s switch returns its request, pending until the renderer can draw', async () => {
  const mocks = { 'js/fetch-deadline.js': {
    readWithin: () => Promise.resolve({ ok: true, status: 200, type: 'image/png', text: '' }),
    jsonWithin: () => Promise.reject(Object.assign(new Error('refused here'), { reason: 'network' })),
    isUnobserved: () => false, untilObserved: () => Promise.resolve() } };
  const settles = new Set(['dl-radar', 'dl-thermal', 'dl-nato', 'dl-eu', 'dl-milSpend']);   /* the cables' work after the gate is a download ladder — only its pending half is asked */
  for (const [pkg, ids] of BY_PKG) {
    for (const id of ids) {
      /* the switch is made because the box was ticked — the row's box answers «checked» */
      const box = { id, checked: true, dataset: {}, closest: () => null, classList: { add() {}, remove() {} } };
      const M = await importModule('js/' + packageFile(pkg), { globals: { window: { IntMapSafe: globalThis.IntMapSafe }, document: Object.assign({}, fakeDocument, { getElementById: (x) => (x === id ? box : null) }) }, mocks });
      let open; const gate = new Promise((r) => { open = r; });
      const log = [];
      const K = strictKit(log);
      const kit = new Proxy({}, { get: (_t, k) => (k === 'whenStyleReady' ? () => gate : k === 'withCountries' ? (cb) => gate.then(cb) : (k === 'rowUntilObserved' ? () => Promise.resolve() : K[k])) });
      const req = M[packageExport(pkg)](kit).rows[id].on();
      assert.ok(req && typeof req.then === 'function', id + ': the switch returned no request');
      let state = 'pending'; req.then(() => { state = 'fulfilled'; }, () => { state = 'rejected'; });
      await new Promise((r) => setImmediate(r));
      assert.equal(state, 'pending', id + ': the request settled before the renderer could draw');
      if (!settles.has(id)) continue;
      open();
      for (let i = 0; i < 20 && state === 'pending'; i++) await new Promise((r) => setImmediate(r));
      assert.equal(state, 'fulfilled', id + ': the request did not settle when its work did');
    }
  }
});

/* ⑦ (hist-fidelity) THE NUMBER A LEGEND STATES IS A FUNCTION OF WHAT THE LAYER DRAWS. The NATO card said
   「32 members」 at every instant — over a 1985 map painting 16. Run as shipped: the alliances package with the
   NATO set js/data-layers.js hands it, a country table holding every member, the real clock moved to 1985 and back. */
function fakeEl(tag) {
  const e = { tagName: tag, children: [], style: {}, dataset: {}, className: '', textContent: '', innerHTML: '', parentNode: null,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { c.parentNode = e; e.children.push(c); return c; },
    insertBefore(c, ref) { c.parentNode = e; const i = e.children.indexOf(ref); if (i < 0) e.children.push(c); else e.children.splice(i, 0, c); return c; },
    querySelector(sel) {
      const cls = sel.startsWith('.') ? sel.slice(1) : null;
      const walk = (n) => { for (const k of n.children) { if (cls && String(k.className).split(' ').includes(cls)) return k; const r = walk(k); if (r) return r; } return null; };
      return walk(e) || (cls ? null : fakeEl('stub'));   /* a control inside markup this fake does not parse: it only has to take a listener */
    },
    querySelectorAll: () => [], addEventListener() {}, setAttribute() {}, removeAttribute() {}, contains: () => false };
  return e;
}
test('layer-packages ⑦ the NATO legend states the members it draws at the clock\'s instant — 16 in 1985, not 32', async () => {
  const NATO_SET = new Set(/const NATO=new Set\("([^"]+)"\.split\(' '\)\)/.exec(DL)[1].split(' '));
  const square = (x, y) => ({ type: 'Polygon', coordinates: [[[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]] });
  const countryGeo = { type: 'FeatureCollection', features: [...NATO_SET].map((c, i) => ({ type: 'Feature', id: c, properties: {}, geometry: square(i, 40) })) };
  const legend = fakeEl('div'); legend.id = 'data-legend-nato';
  const box = { id: 'dl-nato', checked: true, dataset: {}, closest: () => null };
  const doc = Object.assign({}, fakeDocument, { getElementById: (x) => (x === 'dl-nato' ? box : x === 'data-legend-nato' ? legend : null), createElement: (t) => fakeEl(t) });
  const win = { IntMapSafe: globalThis.IntMapSafe, _registerLayerOpacity: () => legend, IntMapLayerHome: { arrive() {} }, IntMapLabelScale: { sub: (x) => x } };
  const { IntMapTime } = await import('../js/chronos.js');   /* the one clock — the package imports the same instance */
  const hint = () => { const h = legend.querySelector('.dl-hint'); return h && h.textContent; };
  try {
    /* the clock moves BEFORE the package arrives — the row is lazy, and the years must still be the clock's */
    IntMapTime.setYear(1985);
    const M = await importModule('js/layer-pkg-alliances.js', { globals: { window: win, document: doc } });
    const K = strictKit([]);
    const kit = new Proxy({}, { get: (_t, k) => (k === 'HOST' ? { lang: 'en', countryGeo } : k === 'NATO' ? NATO_SET : k === 'withCountries' ? (cb) => Promise.resolve().then(cb) : K[k]) });
    const row = M.alliancesPackage(kit).rows['dl-nato'];
    await row.on();
    assert.equal(hint(), '16 members', 'the legend did not state the 16 members a 1985 map paints');
    IntMapTime.setNow();
    await row.on();
    assert.equal(hint(), NATO_SET.size + ' members', 'the legend did not state today\'s members once the clock came back');
  } finally { IntMapTime.setNow(); }
});

/* ⑧ (hist-fidelity-sweep) A NAME TUPLE IS POSITIONAL, AND A CALLER DOES NOT RE-ORDER IT. js/layer-packs.js built the
   plate / land-cover / ecoregion legend titles as [jp, en, de, ru] from an LA tuple ([en, jp, de, ru, es]), so the
   English screen read them in Japanese. Every call of _registerLayerOpacity in js/: a names argument written as an
   array of indexings of one tuple must take them in order from 0 (pass the tuple itself, or its head). */
test('layer-packages ⑧ no legend title is a tuple re-ordered by hand', () => {
  const bad = [];
  for (const f of readdirSync(join(ROOT, 'js')).filter((x) => x.endsWith('.js'))) {
    const t = read('js/' + f);
    let ast; try { ast = acorn.parse(t, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); } catch (_) { continue; }
    (function w(n) { if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && /(^|\.)_registerLayerOpacity$/.test(t.slice(n.callee.start, n.callee.end)) && n.arguments[1] && n.arguments[1].type === 'ArrayExpression') {
        const el = n.arguments[1].elements;
        const idx = el.map((x) => (x && x.type === 'MemberExpression' && x.computed && x.property.type === 'Literal' && typeof x.property.value === 'number') ? [t.slice(x.object.start, x.object.end), x.property.value] : null);
        if (idx.every(Boolean) && new Set(idx.map((x) => x[0])).size === 1 && idx.some((x, i) => x[1] !== i)) bad.push(f + ':' + n.loc.start.line + ' ' + t.slice(n.arguments[1].start, n.arguments[1].end));
      }
      for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(w); else if (v && typeof v.type === 'string') w(v); } })(ast);
  }
  assert.deepEqual(bad, [], 'a legend title re-ordered from its tuple');
  assert.match(read('js/layer-packs.js'), /const nm=ECLBL\[which\];/, 'the land-cover / plates / ecoregions legend takes its row\'s tuple as written');
});

test('layer-packages ⑤ the browser photograph is of packaged rows', () => {
  const photo = JSON.parse(read('tests/fixtures/layer-packages-before.json'));
  const rows = Object.keys(photo);
  assert.ok(rows.length >= 3);
  for (const id of rows) {
    assert.ok(packageOf(id), id + ' is in the before-photograph and is not a packaged row');
    for (const phase of ['on', 'opacity', 'off']) assert.ok(photo[id][phase], id + ' ' + phase);
    assert.ok(photo[id].on.layers.length > 0, id + ': the photograph of «on» drew something');
  }
});
