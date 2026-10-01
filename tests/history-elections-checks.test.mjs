/* ============================================================================
 *  IntMap · 国政選挙レイヤー — the data, the wiring, and the frame a polity is shown in
 *  (consolidated from tests/r588-checks and tests/r626-checks; each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  #R588 「アメリカ大統領選挙以外の選挙レイヤーも作って。衆院選、参院選など。欧米日豪韓中露」
 *  What is checked here is what `npm run check:elections` cannot see: the gate verifies the DATA,
 *  and these verify the things that make the data the only place a country is described — plus the
 *  wiring, because #R243 shipped a `--check` that nothing ever called.
 *
 *  #R626 — the frame a polity is shown in must contain that polity. #R588's production verification
 *  measured this: choosing France took the camera to 2.99 °W / 18.53 °N at z3 — the Atlantic off West
 *  Africa, with not one constituency on screen. The entry in js/layer-home.js framed the EXTENT OF
 *  WHAT IS DRAWN, and France's 559 constituencies include Réunion (55 °E) and Guyane (53 °W), so that
 *  extent is most of the planet and its centre is sea.
 *  ⚠ THE CHECK IS NOT «France is framed correctly». It is «for EVERY polity in the shipped pack, the
 *  box the reader is taken to actually holds most of that polity's districts» — a property of the
 *  data, swept over all of it, so the next pack cannot introduce the same defect silently.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { validate } from '../scripts/lib/elections-schema.mjs';
import { ciRuns, npmTestRuns } from './helpers/ci-reach.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import * as LM from '../js/layer-manifest.js';   /* the Layers taxonomy (layer manifest) */
import { importModule, langRegistry } from './helpers/import-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const DATA = join(ROOT, 'data', 'elections');
const hasData = existsSync(join(DATA, 'index.json'));
const index = hasData ? JSON.parse(rd('data/elections/index.json')) : null;

/* is `key` filed on `shelf`, and does the manifest resolve it to the box the row builder makes */
const onShelf = (shelf, key, id) => (LM.layerGroups().find(([k]) => k === shelf) || [null, []])[1].includes(key)
  && (LM.layerFor(key) || {}).id === id;

/* js/layer-home.js, EVALUATED with a stub window: the table of layers that may move the camera and
   the boxes they answer are asked of the module, not read out of its text (#R505). `elections` is
   the stand-in for window.IntMapElections; `fits` records every camera move the module makes.
   (module-graph) IMPORTED, fresh per call; the camera is a stub handed at its geo-engine.js import edge. */
async function layerHome(elections) {
  const fits = [];
  const win = { IntMapElections: elections };
  await importModule('js/layer-home.js', {
    globals: { window: win, document: { getElementById: () => null } },
    mocks: { 'js/geo-engine.js': { IntMapGeoEngine: { camera: { fitBounds: (box, opts) => fits.push({ box, opts }) } } } },
  });
  return { LH: win.IntMapLayerHome, fits };
}
/* compare values, not prototypes (the boxes come from the module's own data) */
const plain = (v) => JSON.parse(JSON.stringify(v));

/** the centre of one ring of a feature, good enough to ask «is this district inside the frame» */
function points(fc) {
  const out = [];
  for (const f of fc.features) {
    const g = f.geometry; if (!g) continue;
    const rings = g.type === 'Polygon' ? [g.coordinates[0]] : g.coordinates.map((p) => p[0]);
    let best = null;
    for (const ring of rings) {
      let w = 180, s = 90, e = -180, n = -90;
      for (const c of ring) { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; }
      const area = (e - w) * (n - s);
      if (!best || area > best.a) best = { a: area, p: [(w + e) / 2, (s + n) / 2] };
    }
    if (best) out.push(best.p);
  }
  return out;
}

/* ══ #R626 — the frame ══════════════════════════════════════════════════════════════════════ */

test('R626 ① the camera goes to the box the PACK states, not to the extent of what is drawn', async () => {
  /* EVALUATED (was: the text offsets of `homeBox()` and `bboxOfFC(` inside the dl-elect entry).
     The entry is asked with a pack box AND a drawn collection that disagree, which is France's case:
     the answer must be the pack's box. With no pack box, the drawn extent is the fallback. */
  const PACK = [[-5, 42], [8, 51]];
  const drawn = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[55, -21], [56, -21], [56, -20], [55, -21]]] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-54, 4], [-53, 4], [-53, 5], [-54, 4]]] } },
  ] };
  const { LH } = await layerHome({ homeBox: () => PACK, fc: () => drawn });
  assert.ok(LH.ids().includes('dl-elect'), 'the dl-elect entry was found');
  assert.deepEqual(plain(LH.boxOf('dl-elect')), PACK, 'the pack’s own box is asked before the extent of what is drawn');
  /* the entry still knows both answers: without a pack box it falls back to what is drawn */
  const { LH: fallback } = await layerHome({ homeBox: () => null, fc: () => drawn });
  assert.deepEqual(plain(fallback.boxOf('dl-elect')), [[-54, -21], [56, 5]], 'the drawn extent is no longer the fallback');
});

test('R626 ② every polity’s frame holds that polity’s districts', () => {
  if (!index) return assert.fail('data/elections/index.json is missing');
  const bad = [];
  for (const p of index.polities) {
    /* the most recent election of this polity is the one the selector lands on */
    const es = index.elections.filter((e) => e.polity === p.id && e.geo);
    if (!es.length) continue;
    const e = es[es.length - 1];
    const fc = JSON.parse(readFileSync(join(DATA, e.geo), 'utf8'));
    const pts = points(fc);
    const [w, s] = p.home[0], [east, n] = p.home[1];
    const inside = pts.filter((c) => c[0] >= w && c[0] <= east && c[1] >= s && c[1] <= n).length;
    /* ⚠ NOT «all of them». A frame that held every overseas constituency would be the planet again,
       which is the defect. What the reader needs is that the frame is ABOUT this polity: most of
       its districts are in it. France's 11 overseas départements sit outside its frame on purpose. */
    const share = inside / pts.length;
    if (share < 0.8) bad.push(p.id + ': ' + inside + '/' + pts.length + ' districts inside its own frame');
  }
  assert.deepEqual(bad, [], 'a polity is framed somewhere its districts are not');
});

test('R626 ③ …and the frame is not the whole planet', () => {
  if (!index) return assert.fail('data/elections/index.json is missing');
  /* the failure #R588 shipped: a box spanning most of the globe, whose centre is open sea */
  const huge = index.polities
    .map((p) => ({ id: p.id, w: p.home[1][0] - p.home[0][0], h: p.home[1][1] - p.home[0][1] }))
    .filter((x) => x.w > 180 || x.h > 120)
    .map((x) => x.id + ' spans ' + x.w.toFixed(0) + '° × ' + x.h.toFixed(0) + '°');
  assert.deepEqual(huge, [], 'a polity states a frame the size of the planet');
});

/* ══ #R588 — the layer ══════════════════════════════════════════════════════════════════════ */

/* ── ① the runtime does not know any country ────────────────────────────────────────────────────
   The whole reason this layer is not a tenth copy of js/us-elections.js is that it carries no
   country in it. That is a claim about the source, so it is measured against the source: every
   string literal in js/elections.js is compared with the identifiers the data actually uses, and a
   match means a country, a party or a district has leaked into the code that paints them.
   ⚠ MEASURED AGAINST THE DATA, NOT AGAINST A LIST TYPED HERE (no-ad-hoc-hardcoding §2.4). */
test('#R588 ① js/elections.js names no polity, party or district from the data', () => {
  if (!hasData) return assert.fail('data/elections/index.json is missing — run node scripts/build-elections.mjs');
  const src = rd('js/elections.js');
  const lits = new Set();
  acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module', onToken: (t) => {   /* (module-graph) an ES module now */
    if (t.type && t.type.label === 'string' && typeof t.value === 'string') lits.add(t.value);
  } });

  const forbidden = new Set();
  for (const p of index.polities) { forbidden.add(p.id); for (const v of Object.values(p.n)) forbidden.add(v); }
  for (const pid of Object.keys(index.parties)) forbidden.add(pid);
  for (const p of Object.values(index.parties)) { for (const v of Object.values(p.n)) forbidden.add(v); forbidden.add(p.col); }
  for (const e of index.elections) for (const v of Object.values(e.body)) forbidden.add(v);
  /* an id of one or two characters ('us', 'de') collides with ordinary code; identity is only
     claimed for the longer ones, and the party ids are all «xx:slug» so they never collide */
  const hits = [...lits].filter(s => s.length >= 3 && forbidden.has(s));
  assert.deepEqual(hits, [], 'js/elections.js contains identifiers that belong to the data: ' + hits.join(', '));
});

/* ── ② the gate is not merely declared — something runs it ────────────────────────────────────
   ⚠ THIS IS #R243's MEASURED FAILURE, TURNED INTO A TEST. scripts/build-us-elections.mjs has had a
   `--check` since it was written and it is named by NOTHING, so for eighteen rounds the American
   election map's data was unverified while every instrument was green. A gate with no caller is not
   a gate. */
test('#R588 ② check:elections is declared AND called by the suite and by CI', () => {
  const pkg = JSON.parse(rd('package.json'));
  assert.ok(pkg.scripts['check:elections'], 'package.json declares no check:elections');
  /* (gate-parity-and-shards) asked of `npm test`'s evaluated plan (tests/helpers/ci-reach.mjs) */
  assert.ok(npmTestRuns('check:elections'), 'npm test does not run the elections gate');
  /* ⚠ (#R771) ASKED OF WHAT CI RUNS, NOT OF HOW ci.yml SPELLS IT — tests/helpers/ci-reach.mjs. */
  assert.ok(ciRuns('check:elections'), 'CI does not run the elections gate');
});

/* ── ③ the camera is moved by one file, and it is not this layer ────────────────────────────────
   (#R313) 「レイヤーを選択しても視点を動かさない」 with one audited exception table. This layer is in
   the table — and it is the first to need a SECOND door in it (the reader changing country inside
   the layer), so both doors are checked to live in js/layer-home.js. */
test('#R588 ③ dl-elect flies only through js/layer-home.js', async () => {
  /* ⚠ SPELLING, ON PURPOSE, FOR THE NEGATIVE HALF: «js/elections.js never calls the camera» is a
     claim about every path of a DOM-bound module (it builds the legend, the selector and the
     popups on a live map), so no evaluation of a stubbed instance could cover all of its paths. */
  const layer = rd('js/elections.js');
  assert.doesNotMatch(layer, /fitBounds|flyTo|easeTo|jumpTo/, 'js/elections.js moves the camera itself');
  /* the audited table and its in-layer door, EVALUATED: dl-elect is in the published set, and
     goTo() moves the camera to the pack's box (every time — it is not the once-per-session arrive) */
  const PACK = [[129, 31], [146, 45]];
  const { LH, fits } = await layerHome({ homeBox: () => PACK, fc: () => null });
  assert.ok(LH.ids().includes('dl-elect'), 'dl-elect is not in the audited table');
  assert.equal(typeof LH.goTo, 'function', 'layer-home.js has no goTo for an in-layer place change');
  assert.equal(LH.goTo('dl-elect'), true, 'goTo did not take the reader to the polity they picked');
  assert.equal(LH.goTo('dl-elect'), true, 'a second pick inside the layer was refused');
  assert.deepEqual(plain(fits.map((f) => f.box)), [PACK, PACK]);
  assert.equal(LH.goTo('not-in-the-table'), false, 'a layer outside the audited table reached the camera');
  /* every call site in the layer goes through the published API */
  for (const m of layer.matchAll(/IntMapLayerHome\s*&&\s*window\.IntMapLayerHome\.(\w+)/g)) {
    assert.ok(['arrive', 'goTo'].includes(m[1]), 'unexpected layer-home entry point: ' + m[1]);
  }
});

/* ── ④ the layer is registered everywhere a layer has to be ────────────────────────────────────
   An eager module has four ledgers (#R546 measured that a lazy one has five). Missing any of them
   is silent: the row simply is not there. */
test('#R588 ④ the elections module is in every ledger an eager layer needs', () => {
  /* ⚠ SPELLING, ON PURPOSE: js/app-body.js is the app shell; «this module is imported / called at boot»
     is a fact about its text that no node evaluation reaches without building the whole app. The
     manifest half below is evaluated. (module-graph) src/main.js's two ledgers — the import line and the
     eager factory list — are one edge now: js/app-body.js imports the factory by name, which puts the
     file in the bundle and makes a missing factory a link error instead of a console line. */
  assert.match(rd('js/app-body.js'), /^import \{ elections \} from '\.\/elections\.js';/m, 'js/app-body.js does not import it');
  assert.match(rd('js/app-body.js'), /\belections\(IM_HOST\)/, 'js/app-body.js never calls it');
  /* the fourth ledger is js/layer-manifest.js now (the shelf reorganizeLayerPanel files by, and the id it
     resolves the row through) — a layer it does not declare is swept into Beta and unknown to its readers */
  assert.ok(onShelf('lyrGrpPolitics', 'elect', 'dl-elect'), 'the row is not in 政治 / Politics');
  /* …and it is NOT in the lazy ledgers, because it is not lazy (#R546) */
  assert.doesNotMatch(rd('js/lazy-modules.js'), /['"]elections['"]/, 'js/lazy-modules.js claims it is lazy');
});

/* ── ⑤ the validator actually rejects what it claims to ────────────────────────────────────────
   ⚠ A CHECK THAT HAS NEVER SEEN A FAILURE IS NOT KNOWN TO WORK (#R548). Each case below is a real
   corruption of a minimal but well-formed pack, and each must be caught for its own stated reason. */
const wellFormed = () => ({
  index: {
    parties: { 'xx:a': { n: { en: 'A' }, col: '#112233' }, 'xx:b': { n: { en: 'B' }, col: '#445566' } },
    polities: [{ id: 'xx', n: { en: 'X', native: 'X' }, home: [[0, 0], [1, 1]] }],
    elections: [{
      id: 'xx-l-2020', polity: 'xx', body: { en: 'Lower house', native: 'Lower house' },
      date: '2020-01-01', y: 2020, geo: 'g.geo.json', res: 'r.res.json',
      seatsTotal: 3, districtSeats: 2, listSeats: 1, src: 'S', lic: 'L'
    }]
  },
  files: {
    'g.geo.json': { type: 'FeatureCollection', features: [1, 2].map(i => ({
      type: 'Feature', properties: { cd: 'd' + i, n: { en: 'D' + i } },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
    })) },
    'r.res.json': {
      d: { d1: { w: 'xx:a', c: [{ n: 'p', p: 'xx:a', v: 10 }], t: 10 }, d2: { w: 'xx:b', c: [{ n: 'q', p: 'xx:b', v: 8 }], t: 8 } },
      n: [{ p: 'xx:a', seats: 2, dseats: 1, lseats: 1, pct: 55 }, { p: 'xx:b', seats: 1, dseats: 1, lseats: 0, pct: 45 }]
    }
  }
});
const run = (pack) => validate(pack.index, (kind, id) => pack.files[id] ?? null);

test('#R588 ⑤ a well-formed pack passes', () => {
  assert.deepEqual(run(wellFormed()), []);
});

test('#R588 ⑤a a district with no result is caught — a hole reads as «nobody won here»', () => {
  const p = wellFormed(); delete p.files['r.res.json'].d.d2;
  assert.match(run(p).join('|'), /have no result at all/);
});
test('#R588 ⑤b a result naming a district the geometry lacks is caught', () => {
  const p = wellFormed(); p.files['r.res.json'].d.d9 = { w: 'xx:a' };
  assert.match(run(p).join('|'), /no polygon carries this code/);
});
test('#R588 ⑤c seat arithmetic that does not add up is caught', () => {
  const p = wellFormed(); p.index.elections[0].listSeats = 5;
  assert.match(run(p).join('|'), /≠ seatsTotal/);
});
test('#R588 ⑤d a party nobody defined is caught', () => {
  const p = wellFormed(); p.files['r.res.json'].d.d1.w = 'xx:ghost';
  assert.match(run(p).join('|'), /is not in the party table/);
});
test('#R588 ⑤e a missing attribution or licence is caught', () => {
  const a = wellFormed(); delete a.index.elections[0].src;
  assert.match(run(a).join('|'), /src \(the attribution line\) is required/);
  const b = wellFormed(); delete b.index.elections[0].lic;
  assert.match(run(b).join('|'), /lic \(the licence of the data\) is required/);
});
test('#R588 ⑤f a polygon count that disagrees with districtSeats is caught', () => {
  const p = wellFormed(); p.index.elections[0].districtSeats = 7; p.index.elections[0].seatsTotal = 8;
  assert.match(run(p).join('|'), /polygons but districtSeats says/);
});
test('#R588 ⑤g two polygons with the same district code are caught', () => {
  const p = wellFormed(); p.files['g.geo.json'].features[1].properties.cd = 'd1';
  assert.match(run(p).join('|'), /duplicate district code/);
});
test('#R588 ⑤h a party with no colour is caught — the fill would have nothing to read', () => {
  const p = wellFormed(); delete p.index.parties['xx:b'].col;
  assert.match(run(p).join('|'), /col must be #rrggbb/);
});

/* ⚠ THE LANGUAGE-KEY RULE, WHICH THIS ROUND NEEDED BECAUSE IT SHIPPED THE BUG FIRST. The app's own
   code for Japanese is `jp`; the packs wrote `ja`, `nm()` compared raw, and 113 elections' Japanese
   and Chinese notes reached nobody while every instrument stayed green. Both halves are measured:
   the schema refuses a key the registry has never heard of and two spellings of one language that
   DISAGREE, and the runtime resolves the reader's language through the registry. */
test('#R588 ⑤i a name in a language this app does not have is caught', () => {
  const p = wellFormed(); p.index.polities[0].n.klingon = 'tlhIngan';
  assert.match(run(p).join('|'), /is not a language this app has/);
});
test('#R588 ⑤j an alias spelling is accepted — «ja» is Japanese here', () => {
  const p = wellFormed(); p.index.polities[0].n.ja = '日本';
  assert.deepEqual(run(p), []);
});
test('#R588 ⑤k two spellings of one language that disagree are caught', () => {
  const p = wellFormed(); p.index.polities[0].n.ja = '甲'; p.index.polities[0].n.jp = '乙';
  assert.match(run(p).join('|'), /are both «jp» and differ/);
});
test('#R588 ⑤l …and the same sentence under two spellings is not an error', () => {
  const p = wellFormed(); p.index.polities[0].n.ja = '同'; p.index.polities[0].n.jp = '同';
  assert.deepEqual(run(p), []);
});
test('#R588 ⑤m js/elections.js resolves the reader’s language through the registry', () => {
  /* EVALUATED (was: a regex for «IntMapLang … normalise» near nm()). The shipped `nm` is lifted out
     of js/elections.js and run against the REAL js/lang-registry.js: a reader whose code is `jp`
     must be shown the pack's `ja` string, and a `zh` reader the `zh-Hant` one — a raw
     `t[HOST.lang]` answers neither, which is what missed `ja` in the first place. */
  /* (module-graph) the lifted `nm` reads the registry under the name js/elections.js imports it as; the
     real module, with the shipped language list declared, is handed in under that name */
  const HOST = { lang: 'jp' };
  const nm = new Function('IntMapLang', 'HOST', liftFunction(rd('js/elections.js'), 'nm') + '\nreturn nm;')(langRegistry(), HOST);
  const t = { en: 'Lower house', ja: '衆議院', 'zh-Hant': '眾議院', native: 'Native' };
  assert.equal(nm(t), '衆議院', 'a jp reader was not shown the pack’s ja name');
  HOST.lang = 'zh';
  assert.equal(nm(t), '眾議院', 'a zh reader was not shown the pack’s zh-Hant name');
  HOST.lang = 'fr';
  assert.equal(nm(t), 'Native', 'a language the pack does not carry must fall back to the native form');
});

/* ── ⑥ every shipped election carries its credit line ──────────────────────────────────────────
   Several of these licences — CC BY 4.0, dl-de/by-2.0, the Open Parliament Licence, data.gov.hk's
   terms — make attribution the CONDITION of the right to redistribute at all. */
test('#R588 ⑥ every election in the shipped index has an attribution and a licence', () => {
  if (!hasData) return assert.fail('data/elections/index.json is missing');
  for (const e of index.elections) {
    assert.ok(e.src && e.src.length > 3, e.id + ' has no attribution line');
    assert.ok(e.lic && e.lic.length > 1, e.id + ' has no licence');
  }
});

/* ── ⑦ …and the shipped bytes really do satisfy the contract ───────────────────────────────────
   The same validation the gate runs, run again from the test suite, so that a checkout whose gate
   was skipped still cannot ship a broken join. */
test('#R588 ⑦ the committed data validates', () => {
  if (!hasData) return assert.fail('data/elections/index.json is missing');
  const errs = validate(index, (kind, id) => {
    const p = join(DATA, id);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  });
  assert.deepEqual(errs.slice(0, 5), [], errs.length + ' problem(s) in data/elections/');
});

/* ── ⑧ nothing is shipped that nothing loads ─────────────────────────────────────────────────── */
test('#R588 ⑧ data/elections holds exactly the files the index names', () => {
  if (!hasData) return assert.fail('data/elections/index.json is missing');
  const named = new Set(['index.json']);
  for (const e of index.elections) { if (e.geo) named.add(e.geo); if (e.res) named.add(e.res); }
  const onDisk = readdirSync(DATA);
  assert.deepEqual(onDisk.filter(f => !named.has(f)), [], 'orphaned files in data/elections/');
  assert.deepEqual([...named].filter(f => !onDisk.includes(f)), [], 'the index names files that are not there');
});

/* ── ⑨ the U.S. presidential layer is untouched ────────────────────────────────────────────────
   CONSTITUTION §0.3: an existing feature may not be shrunk without asking. */
test('#R588 ⑨ the U.S. presidential layer still exists and is still registered', async () => {
  assert.ok(existsSync(join(ROOT, 'js', 'us-elections.js')));
  assert.ok(existsSync(join(ROOT, 'data', 'us-elections.json')));
  assert.ok(onShelf('lyrGrpPolitics', 'uselect', 'dl-uselect'), 'the U.S. presidential row is still on 政治 / Politics (layer manifest)');
  /* ⚠ SPELLING, ON PURPOSE: the app-shell call is a boot-wiring fact (see ④) */
  assert.match(rd('js/app-body.js'), /^import \{ usElections \} from '\.\/us-elections\.js';/m);   /* (module-graph) imported by name */
  assert.match(rd('js/app-body.js'), /\busElections\(IM_HOST\)/);
  /* EVALUATED (was: a regex for HOMES['dl-uselect']): the audited table still answers for it */
  const { LH } = await layerHome(null);
  assert.ok(LH.ids().includes('dl-uselect'), 'the U.S. presidential layer left the audited camera table');
  assert.ok(Array.isArray(LH.boxOf('dl-uselect')), 'the U.S. presidential layer no longer answers a frame');
});
