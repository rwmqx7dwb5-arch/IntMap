/* restored-layers-under-load — the satellite layer propagates an instant once, not once per caller.
 *
 * tests/restored-layer-before-style.spec.js (deep tier) opens a share link carrying every layer. Its
 * war layers leave the clock STOPPED in the past (1991-06-25 is the last one set), and from then on
 * the tick, every `moveend` (the globe's spin fires one per frame) and the clock subscriber each asked
 * js/satellites-live.js `propagateAll()` for the same instant. Every one of them re-ran SGP4 over the
 * whole catalogue, and at an instant decades from the element epochs that is not the 21 ms the layer
 * budgets: satellite.js 7.1.0 re-integrates every resonant deep-space orbit from its epoch on each
 * call. MEASURED: 1,748 ms a call at 1991 against 60 ms at the present, 7.3 s of 30 s of main-thread
 * CPU on the settled page, and under CI's load the page's own work (a lazily fetched layer body, a
 * debounced repaint) queued behind it for longer than the spec's 60 s — the held boot then lacked
 * layers the normal boot had drawn. The record is dev-notes/2026-10-01-restored-layers-under-load.md.
 *
 * RUN: `propagateAll` is lifted out of js/satellites-live.js with the constants and the counter it
 * closes over (the same lift tests/engine-satellites-checks.test.mjs makes) and run over the real
 * bundled catalogue with the same satellite.js the layer imports; `propagate` is counted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import * as SAT from 'satellite.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* the bundled catalogue, parsed the way the layer parses it (3-line sets, twoline2satrec) */
function catalogue() {
  const lines = read('data/tle/catalogue.tle').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    let satrec; try { satrec = SAT.twoline2satrec(lines[i + 1], lines[i + 2]); } catch (_) { continue; }
    if (!satrec || satrec.error) continue;
    out.push({ satrec, name: lines[i].trim(), id: +lines[i + 1].slice(2, 7), intl: lines[i + 1].slice(9, 17).trim(), ecc: satrec.ecco });
  }
  return out;
}

function lift(S, initial, when) {
  const src = read('js/satellites-live.js');
  const want = ['D2R', 'R_EARTH', '_diverged', '_SPAN_BANDS', '_DAY_MS', '_elementSpan', '_elementsCover', 'propagateAll'];
  const stmts = [];
  walk.full(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), (n) => {
    const hit = (n.type === 'FunctionDeclaration' && want.includes(n.id && n.id.name))
      || (n.type === 'VariableDeclaration' && n.declarations.some((x) => want.includes(x.id && x.id.name)));
    if (hit && !stmts.includes(n)) stmts.push(n);
  });
  /* `setSats` REPLACES the catalogue the way load() / setGroup() do */
  return new Function('SAT', 'initial', 'clockNow', 'sunAt',
    `let sats = initial;
     ${stmts.sort((a, b) => a.start - b.start).map((n) => src.slice(n.start, n.end)).join('\n')}
     return { propagateAll, span: _elementSpan, diverged: () => _diverged, setSats: (x) => { sats = x; } };`)(S, initial, () => when, () => null);
}

function counted() {
  const c = { n: 0 };
  const S = Object.assign({}, SAT, { propagate(...a) { c.n++; return SAT.propagate(...a); } });
  return { S, c };
}

const ALL = catalogue();
/* a slice that holds resonant deep-space orbits as well as low ones, so the lifted function does the
   same kinds of work it does on the page; found in the file, not typed here */
const resonant = ALL.filter((s) => s.satrec.method === 'd' && s.satrec.irez !== 0);
const SAMPLE = ALL.slice(0, 300).concat(resonant.slice(0, 20));
const NEWEST = new Date(Date.parse(JSON.parse(read('data/tle/catalogue.json')).newestEpoch));

test('① the same instant, asked again, is answered without propagating again — and the answer is the same', () => {
  assert.ok(resonant.length > 0, 'the catalogue holds resonant deep-space orbits (the expensive kind)');
  const { S, c } = counted();
  const L = lift(S, SAMPLE, NEWEST);
  const a = L.propagateAll(NEWEST);
  const first = c.n;
  const inSpan = (ms, list) => list.filter((s) => { const sp = L.span(s); return ms >= sp.from && ms <= sp.to; }).length;
  assert.equal(first, inSpan(+NEWEST, SAMPLE), 'the first call propagates every object its element set speaks for, once');
  assert.ok(first > 0);
  const dropA = L.diverged();
  const b = L.propagateAll(new Date(+NEWEST));   /* a different Date object naming the same instant */
  assert.equal(c.n, first, 'the second call at the same instant propagates nothing');
  assert.deepEqual(b, a, 'and returns the same fixes');
  assert.notEqual(b, a, 'in a fresh array, so no caller holds the kept one');
  assert.equal(L.diverged(), dropA, 'the drop count is part of the answer and comes back with it');
  /* the clock subscriber and the tick call with no argument — clockNow() names the same instant */
  L.propagateAll();
  assert.equal(c.n, first, 'nor does a call that reads the instant from the clock');
});

test('② a different instant, or a replaced catalogue, is propagated', () => {
  const { S, c } = counted();
  const L = lift(S, SAMPLE, NEWEST);
  L.propagateAll(NEWEST);
  const n0 = c.n;
  const later = new Date(+NEWEST + 1000);
  const moved = L.propagateAll(later);
  const inSpan = (ms, list) => list.filter((s) => { const sp = L.span(s); return ms >= sp.from && ms <= sp.to; }).length;
  assert.equal(c.n, n0 + inSpan(+later, SAMPLE), 'one second later is a new answer');
  assert.notDeepEqual(moved.map((f) => f.lng), L.propagateAll(NEWEST).map((f) => f.lng), 'and a different one');
  /* load() / setGroup() REPLACE the array; the kept answer belongs to the one it was computed from */
  L.setSats(SAMPLE.slice(0, 50));
  const n1 = c.n;
  const small = L.propagateAll(NEWEST);
  assert.equal(c.n, n1 + inSpan(+NEWEST, SAMPLE.slice(0, 50)), 'a replaced catalogue is propagated even at an instant already answered');
  assert.ok(small.length <= 50, 'and the answer is about the catalogue that replaced it');
});

test('③ the premise of the cost note: satellite.js does not keep the deep-space integrator between calls', () => {
  /* ⚠ THE NOTE IN js/satellites-live.js SAYS WHY ONE CALL AT 1991 COSTS ~30× ONE AT THE PRESENT: sgp4()
     hands dspace() the record's `atime` and throws the advanced one away, so every call re-steps from
     the epoch in 720-minute strides. If a later satellite.js keeps it (Vallado's reference code does),
     this fails — and the measured figures in that note have to be measured again. */
  const rec = resonant[0].satrec;
  const t = new Date(Date.UTC(1991, 5, 25, 12));
  SAT.propagate(rec, t);
  assert.equal(rec.atime, 0, 'the integrator time is not advanced on the record');
  SAT.propagate(rec, t);
  assert.equal(rec.atime, 0, 'so a second call integrates from the epoch again');
});

/* ── the element set speaks for days around its epoch, not for an era ─────────────────────────────── */

const epochMs = (r) => (r.jdsatepoch + (r.jdsatepochF || 0) - 2440587.5) * 86400000;

test('④ in 1914 and in 1991 nothing is computed and nothing is drawn — no source states those positions', () => {
  /* MEASURED before this rule: 5,234 objects drawn at 1914-06-28 and 8,355 at 1991-06-25, from 2026 elements */
  for (const iso of ['1914-06-28T12:00:00Z', '1991-06-25T12:00:00Z']) {
    const when = new Date(iso);
    const { S, c } = counted();
    const L = lift(S, ALL, when);
    const drawn = L.propagateAll(when);
    assert.equal(drawn.length, 0, iso + ': nothing is drawn');
    assert.equal(c.n, 0, iso + ': and SGP4 is not even asked');
  }
});

test('⑤ at the catalogue\'s own dates the layer draws, and every object drawn is inside its own span', () => {
  const { S } = counted();
  const L = lift(S, ALL, NEWEST);
  const drawn = L.propagateAll(NEWEST);
  assert.ok(drawn.length > ALL.length * 0.5, `at the newest epoch most of the catalogue is drawn (${drawn.length} of ${ALL.length})`);
  const byId = new Map(ALL.map((s) => [s.id, s]));
  for (const f of drawn) {
    const sp = L.span(byId.get(f.id));
    assert.ok(+NEWEST >= sp.from && +NEWEST <= sp.to, f.name + ' is drawn outside its span');
    assert.ok(Math.abs(+NEWEST - epochMs(byId.get(f.id).satrec)) <= sp.days * 86400000, 'the span is centred on the set\'s own epoch');
  }
  /* each set is judged by its OWN epoch: the spans differ */
  const spans = new Set(ALL.slice(0, 500).map((s) => L.span(s).to));
  assert.ok(spans.size > 50, 'spans follow the individual epochs, not one date for the catalogue');
});

test('⑥ playing the clock a few days either side still draws — the «watch them move» use is inside the span', () => {
  const { S } = counted();
  const L = lift(S, ALL, NEWEST);
  const base = L.propagateAll(NEWEST).length;
  for (const d of [-2, -1, 1, 2]) {
    const when = new Date(+NEWEST + d * 86400000);
    const n = L.propagateAll(when).length;
    assert.ok(n > base * 0.8, `${d > 0 ? '+' : ''}${d} d: ${n} drawn against ${base} at the newest epoch`);
  }
});

test('⑦ never before the launch year its international designator states', () => {
  const { S } = counted();
  /* a real high-orbit set (its span reaches 60 days back) re-labelled as launched the year after the
     instant: the epoch window alone would draw it; the designator must not */
  const base = ALL.find((s) => { const n = s.satrec.no * 1440 / (2 * Math.PI); return n > 1.5 && n <= 11; });
  assert.ok(base, 'the catalogue holds a MEO/HEO set');
  const ep = epochMs(base.satrec);
  const when = new Date(ep - 30 * 86400000);
  const y = new Date(ep).getUTCFullYear() + 1;
  const moved = Object.assign({}, base, { intl: String(y % 100).padStart(2, '0') + '001A', _span: undefined });
  const L = lift(S, [base, moved], when);
  const drawn = L.propagateAll(when);
  assert.equal(drawn.length, 1, 'of the two, one is drawn 30 days before the epoch');
  assert.equal(drawn[0].intl, base.intl, 'and it is the set as launched — the one said to be launched next year is not');
});

/* ── the waits are answered by the events they wait on, not by a number of tries ─────────────────────
   MEASURED shape: js/world-packs-rows.js `whenDrawable` (80 × 250 ms), `withCountrySource` (200 × 200 ms)
   and js/war-layer.js `whenDrawable` (40 × 300 ms) gave up after their tries and dropped the draw in
   silence. On the page this spec drives, the main thread was taken for longer than that, so the tries were
   spent before the style or the record arrived. Each is lifted here and run with a setTimeout that NEVER
   fires: the draw must still happen when (and only when) the awaited fact arrives. */
function liftNamed(file, names, params, args, ret) {
  const src = read(file);
  const nodes = [];
  walk.full(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), (n) => {
    const hit = (n.type === 'FunctionDeclaration' && names.includes(n.id && n.id.name))
      || (n.type === 'VariableDeclaration' && n.declarations.some((x) => names.includes(x.id && x.id.name)));
    if (hit && !nodes.includes(n)) nodes.push(n);
  });
  const found = new Set(); for (const n of nodes) { if (n.id) found.add(n.id.name); else n.declarations.forEach((d) => found.add(d.id.name)); }
  for (const nm of names) assert.ok(found.has(nm), file + ' declares ' + nm);
  return new Function(...params, nodes.sort((a, b) => a.start - b.start).map((n) => src.slice(n.start, n.end)).join('\n') + '\nreturn ' + ret + ';')(...args);
}
const deferred = () => { let res; const p = new Promise((r) => { res = r; }); return { p, res }; };
const tick = () => new Promise((r) => setImmediate(r));
const neverTimer = () => { const t = { n: 0, fn: () => { t.n++; return 0; } }; return t; };

test('⑧ world packs: a draw refused for an unparsed style runs when the renderer can take it — however long that is', async () => {
  let can = false; const gate = deferred(); const timer = neverTimer();
  const GE = () => ({ whenCanDraw: () => gate.p });
  const W = liftNamed('js/world-packs-rows.js', ['whenDrawable'], ['GE', '_imCanDraw', 'setTimeout', 'console'],
    [GE, () => can, timer.fn, { warn() {} }], '{ whenDrawable }');
  let ran = 0;
  W.whenDrawable(() => { ran++; });
  await tick();
  assert.equal(ran, 0, 'not before the style can take it');
  can = true; gate.res(); await tick();
  assert.equal(ran, 1, 'once the renderer says it can — with no timer having fired');
  assert.equal(timer.n, 0, 'no poll was armed');
  W.whenDrawable(() => { ran++; });
  assert.equal(ran, 2, 'and at once when it already can');
});

test('⑨ world packs: the countries source is added when the collection and the renderer are there, and «false» only when the collection did not arrive', async () => {
  const timer = neverTimer();
  const make = (geo, can) => {
    const st = { has: false, can, adds: 0, gate: deferred() };
    const HOST = { countryGeo: geo, addCountryLayers() { st.adds++; st.has = true; } };
    const GE = () => ({ layers: { hasSource: () => st.has }, whenCanDraw: () => st.gate.p });
    const W = liftNamed('js/world-packs-rows.js', ['withCountrySource'], ['GE', '_imCanDraw', 'HOST', 'withCountryGeo', 'setTimeout', 'console'],
      [GE, () => st.can, HOST, () => Promise.resolve(), timer.fn, { warn() {} }], '{ withCountrySource }');
    return { st, W };
  };
  const a = make({ features: [] }, false);
  let out = null; a.W.withCountrySource().then((v) => { out = v; });
  await tick(); await tick();
  assert.equal(out, null, 'waits while the style cannot take a source');
  a.st.can = true; a.st.gate.res(); await tick(); await tick();
  assert.equal(out, true, 'and resolves true once the source is added');
  assert.equal(a.st.adds, 1);
  const b = make(null, true);
  assert.equal(await b.W.withCountrySource(), false, 'a collection that did not arrive is «false» at once — not after 200 polls');
  assert.equal(timer.n, 0, 'no poll was armed');
});

test('⑩ war layer: the draw waits for the record AND the renderer, and a record that did not arrive is reported, not dropped', async () => {
  const src = read('js/war-layer.js');
  assert.ok(!/_tries\s*>\s*40/.test(src), 'the 40-try give-up is gone');
  const run = async (loadOk) => {
    const st = { data: null, can: false, gate: deferred(), reports: [] };
    const ld = deferred();
    const W = new Function('GE', 'canDraw', 'load', 'CB', 'L', 'window', 'setTimeout', 'getData', `
      ${(() => { const m = src.match(/ {4}const canBuild = [^\n]*\n/); assert.ok(m, 'canBuild'); return m[0].replace('!!data', '!!getData()'); })()}
      ${(() => { const i = src.indexOf('    let _pending = null'); const j = src.indexOf('\n    function paint(', i); assert.ok(i > 0 && j > i); return src.slice(i, j).replace(/\bdata \?/, 'getData() ?'); })()}
      return { whenDrawable };`)(() => ({ whenCanDraw: () => st.gate.p }), () => st.can, () => ld.p, 'dl-ww2', (en) => en,
      { IntMapLayerState: { report: (id, s, info) => st.reports.push([id, s, info && info.reason]) } }, neverTimer().fn, () => st.data);
    let ran = 0;
    W.whenDrawable(() => { ran++; });
    st.can = true; st.gate.res(); await tick();
    assert.equal(ran, 0, 'the renderer alone is not enough — the record has not arrived');
    if (loadOk) st.data = { wars: [] };
    ld.res(loadOk); await tick(); await tick();
    return { ran, reports: st.reports };
  };
  const ok = await run(true);
  assert.equal(ok.ran, 1, 'drawn once both have arrived, with no timer having fired');
  assert.deepEqual(ok.reports, []);
  const bad = await run(false);
  assert.equal(bad.ran, 0);
  assert.deepEqual(bad.reports, [['dl-ww2', 'failed', 'data']], 'a record that did not arrive is said on the row');
});

test('⑪ net health: a paint refused for an unparsed style runs on the renderer\'s event; a second refusal is said on the row', async () => {
  const mk = () => {
    const st = { can: false, gate: deferred(), on: new Map(), reports: [] };
    const GE = () => ({ whenCanDraw: () => st.gate.p, events: { on: (e, h) => st.on.set(e, h), off: (e) => st.on.delete(e) } });
    const W = liftNamed('js/net-health-live.js', ['whenDrawable', '_pending'], ['GE', 'canDraw', 'window', 'setTimeout'],
      [GE, () => st.can, { IntMapLayerState: { report: (id, s) => st.reports.push([id, s]) } }, neverTimer().fn], '{ whenDrawable }');
    return { st, W };
  };
  const a = mk(); let painted = 0;
  a.W.whenDrawable(() => { painted++; }, () => true, 'dl-netreach');
  await tick();
  assert.equal(painted, 0, 'not before the style can take it');
  a.st.can = true; a.st.gate.res(); await tick();
  assert.equal(painted, 1, 'painted once the renderer can — no timer fired');
  const b = mk(); let tries = 0;
  b.W.whenDrawable(() => { tries++; }, () => false, 'dl-netreach');
  b.st.can = true; b.st.gate.res(); await tick();
  assert.equal(tries, 1, 'tried once the renderer could take it, and refused');
  assert.ok(b.st.on.has('styledata'), 'so it waits for the renderer\'s next change');
  b.st.on.get('styledata')(); await tick();
  assert.equal(tries, 2, 'tried again on that change');
  assert.deepEqual(b.st.reports, [['dl-netreach', 'failed']], 'and a second refusal is an observed failure on the row');
});
