/* ============================================================================
 *  IntMap · #R582 — 国政選挙レイヤー
 * ----------------------------------------------------------------------------
 *  「アメリカ大統領選挙以外の選挙レイヤーも作って。衆院選、参院選など。欧米日豪韓中露」
 *
 *  What is checked here is what `npm run check:elections` cannot see: the gate verifies the DATA,
 *  and these verify the things that make the data the only place a country is described — plus the
 *  wiring, because #R243 shipped a `--check` that nothing ever called.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { validate } from '../scripts/lib/elections-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const DATA = join(ROOT, 'data', 'elections');
const hasData = existsSync(join(DATA, 'index.json'));
const index = hasData ? JSON.parse(rd('data/elections/index.json')) : null;

/* ── ① the runtime does not know any country ────────────────────────────────────────────────────
   The whole reason this layer is not a tenth copy of js/us-elections.js is that it carries no
   country in it. That is a claim about the source, so it is measured against the source: every
   string literal in js/elections.js is compared with the identifiers the data actually uses, and a
   match means a country, a party or a district has leaked into the code that paints them.
   ⚠ MEASURED AGAINST THE DATA, NOT AGAINST A LIST TYPED HERE. A hand-written list of forbidden
   words would go stale the day a pack is added — which is the failure `.agents/rules/
   no-ad-hoc-hardcoding.md` §2.4 describes. */
test('① js/elections.js names no polity, party or district from the data', () => {
  if (!hasData) return assert.fail('data/elections/index.json is missing — run node scripts/build-elections.mjs');
  const src = rd('js/elections.js');
  const lits = new Set();
  acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', onToken: (t) => {
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
   `--check` since it was written and it is named by NOTHING: not package.json, not ci.yml, not
   another script. So for eighteen rounds the American election map's data was unverified while
   every instrument was green. A gate with no caller is not a gate. */
test('② check:elections is declared AND called by the suite and by CI', () => {
  const pkg = JSON.parse(rd('package.json'));
  assert.ok(pkg.scripts['check:elections'], 'package.json declares no check:elections');
  assert.match(rd('scripts/test-parallel.mjs'), /build-elections\.mjs['"],\s*['"]--check/,
    'npm test does not run the elections gate');
  assert.match(rd('.github/workflows/ci.yml'), /check:elections/, 'ci.yml does not run the elections gate');
});

/* ── ③ the camera is moved by one file, and it is not this layer ────────────────────────────────
   (#R313) 「レイヤーを選択しても視点を動かさない」 with one audited exception table. This layer is in
   the table — and it is the first to need a SECOND door in it (the reader changing country inside
   the layer), so both doors are checked to live in js/layer-home.js. */
test('③ dl-elect flies only through js/layer-home.js', () => {
  const layer = rd('js/elections.js');
  assert.doesNotMatch(layer, /fitBounds|flyTo|easeTo|jumpTo/, 'js/elections.js moves the camera itself');
  const home = rd('js/layer-home.js');
  assert.match(home, /HOMES\['dl-elect'\]/, 'dl-elect is not in the audited table');
  assert.match(home, /function goTo\(/, 'layer-home.js has no goTo for an in-layer place change');
  /* every call site in the layer goes through the published API */
  for (const m of layer.matchAll(/IntMapLayerHome\s*&&\s*window\.IntMapLayerHome\.(\w+)/g)) {
    assert.ok(['arrive', 'goTo'].includes(m[1]), 'unexpected layer-home entry point: ' + m[1]);
  }
});

/* ── ④ the layer is registered everywhere a layer has to be ────────────────────────────────────
   An eager module has four ledgers (#R546 measured that a lazy one has five). Missing any of them
   is silent: the row simply is not there. */
test('④ the elections module is in every ledger an eager layer needs', () => {
  assert.match(rd('src/main.js'), /import '\.\.\/js\/elections\.js'/, 'src/main.js does not import it');
  assert.match(rd('src/main.js'), /'elections'/, "src/main.js's eager list does not name it");
  assert.match(rd('js/app-body.js'), /IntMapModules\.elections\(IM_HOST\)/, 'js/app-body.js never calls it');
  assert.match(rd('js/data-layers.js'), /'lyrGrpPolitics',\[[^\]]*'elect'/, 'the row is not in 政治 / Politics');
  /* …and it is NOT in the lazy ledgers, because it is not lazy (#R546: a name in the wrong ledger
     is as wrong as a name in no ledger) */
  assert.doesNotMatch(rd('js/lazy-modules.js'), /['"]elections['"]/, 'js/lazy-modules.js claims it is lazy');
});

/* ── ⑤ the validator actually rejects what it claims to ────────────────────────────────────────
   ⚠ A CHECK THAT HAS NEVER SEEN A FAILURE IS NOT KNOWN TO WORK (#R548's shape: a mutation that
   does not actually mutate reports green). Each case below is a real corruption of a minimal but
   well-formed pack, and each must be caught for its own stated reason. */
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

test('⑤ a well-formed pack passes', () => {
  assert.deepEqual(run(wellFormed()), []);
});

test('⑤a a district with no result is caught — a hole reads as «nobody won here»', () => {
  const p = wellFormed(); delete p.files['r.res.json'].d.d2;
  assert.match(run(p).join('|'), /have no result at all/);
});
test('⑤b a result naming a district the geometry lacks is caught', () => {
  const p = wellFormed(); p.files['r.res.json'].d.d9 = { w: 'xx:a' };
  assert.match(run(p).join('|'), /no polygon carries this code/);
});
test('⑤c seat arithmetic that does not add up is caught', () => {
  const p = wellFormed(); p.index.elections[0].listSeats = 5;
  assert.match(run(p).join('|'), /≠ seatsTotal/);
});
test('⑤d a party nobody defined is caught', () => {
  const p = wellFormed(); p.files['r.res.json'].d.d1.w = 'xx:ghost';
  assert.match(run(p).join('|'), /is not in the party table/);
});
test('⑤e a missing attribution or licence is caught', () => {
  const a = wellFormed(); delete a.index.elections[0].src;
  assert.match(run(a).join('|'), /src \(the attribution line\) is required/);
  const b = wellFormed(); delete b.index.elections[0].lic;
  assert.match(run(b).join('|'), /lic \(the licence of the data\) is required/);
});
test('⑤f a polygon count that disagrees with districtSeats is caught', () => {
  const p = wellFormed(); p.index.elections[0].districtSeats = 7; p.index.elections[0].seatsTotal = 8;
  assert.match(run(p).join('|'), /polygons but districtSeats says/);
});
test('⑤g two polygons with the same district code are caught', () => {
  const p = wellFormed(); p.files['g.geo.json'].features[1].properties.cd = 'd1';
  assert.match(run(p).join('|'), /duplicate district code/);
});
test('⑤h a party with no colour is caught — the fill would have nothing to read', () => {
  const p = wellFormed(); delete p.index.parties['xx:b'].col;
  assert.match(run(p).join('|'), /col must be #rrggbb/);
});

/* ⚠ THE LANGUAGE-KEY RULE, WHICH THIS ROUND NEEDED BECAUSE IT SHIPPED THE BUG FIRST. The app's own
   code for Japanese is `jp`; the packs wrote `ja`, `nm()` compared raw, and 113 elections' Japanese
   and Chinese notes reached nobody while every instrument stayed green (the fallback is a real
   string, so nothing looked broken). Both halves are now measured: the schema refuses a key the
   registry has never heard of, and refuses two spellings of one language that DISAGREE. */
test('⑤i a name in a language this app does not have is caught', () => {
  const p = wellFormed(); p.index.polities[0].n.klingon = 'tlhIngan';
  assert.match(run(p).join('|'), /is not a language this app has/);
});
test('⑤j an alias spelling is accepted — «ja» is Japanese here', () => {
  const p = wellFormed(); p.index.polities[0].n.ja = '日本';
  assert.deepEqual(run(p), []);
});
test('⑤k two spellings of one language that disagree are caught', () => {
  const p = wellFormed(); p.index.polities[0].n.ja = '甲'; p.index.polities[0].n.jp = '乙';
  assert.match(run(p).join('|'), /are both «jp» and differ/);
});
test('⑤l …and the same sentence under two spellings is not an error', () => {
  const p = wellFormed(); p.index.polities[0].n.ja = '同'; p.index.polities[0].n.jp = '同';
  assert.deepEqual(run(p), []);
});
test('⑤m js/elections.js resolves the reader’s language through the registry', () => {
  /* the runtime half of the same rule: a raw `t[HOST.lang]` is what missed `ja` in the first place */
  const src = rd('js/elections.js');
  assert.match(src, /IntMapLang[\s\S]{0,80}normalise/, 'nm() does not normalise the language key');
});

/* ── ⑥ every shipped election carries its credit line ──────────────────────────────────────────
   Several of these licences — CC BY 4.0, dl-de/by-2.0, the Open Parliament Licence, data.gov.hk's
   terms — make attribution the CONDITION of the right to redistribute at all. So this is not a
   documentation nicety: an election without `src` is data IntMap has no right to be shipping. */
test('⑥ every election in the shipped index has an attribution and a licence', () => {
  if (!hasData) return assert.fail('data/elections/index.json is missing');
  for (const e of index.elections) {
    assert.ok(e.src && e.src.length > 3, e.id + ' has no attribution line');
    assert.ok(e.lic && e.lic.length > 1, e.id + ' has no licence');
  }
});

/* ── ⑦ …and the shipped bytes really do satisfy the contract ───────────────────────────────────
   The same validation the gate runs, run again from the test suite, so that a checkout whose gate
   was skipped still cannot ship a broken join. */
test('⑦ the committed data validates', () => {
  if (!hasData) return assert.fail('data/elections/index.json is missing');
  const errs = validate(index, (kind, id) => {
    const p = join(DATA, id);
    return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  });
  assert.deepEqual(errs.slice(0, 5), [], errs.length + ' problem(s) in data/elections/');
});

/* ── ⑧ nothing is shipped that nothing loads ───────────────────────────────────────────────────
   An orphaned file left by a renamed pack costs every reader its bytes and is never fetched. */
test('⑧ data/elections holds exactly the files the index names', () => {
  if (!hasData) return assert.fail('data/elections/index.json is missing');
  const named = new Set(['index.json']);
  for (const e of index.elections) { if (e.geo) named.add(e.geo); if (e.res) named.add(e.res); }
  const onDisk = readdirSync(DATA);
  assert.deepEqual(onDisk.filter(f => !named.has(f)), [], 'orphaned files in data/elections/');
  assert.deepEqual([...named].filter(f => !onDisk.includes(f)), [], 'the index names files that are not there');
});

/* ── ⑨ the U.S. presidential layer is untouched ────────────────────────────────────────────────
   CONSTITUTION §0.3: an existing feature may not be shrunk without asking. This round added a
   layer beside that one and must not have quietly folded it in. */
test('⑨ the U.S. presidential layer still exists and is still registered', () => {
  assert.ok(existsSync(join(ROOT, 'js', 'us-elections.js')));
  assert.ok(existsSync(join(ROOT, 'data', 'us-elections.json')));
  assert.match(rd('js/data-layers.js'), /'lyrGrpPolitics',\[[^\]]*'uselect'/);
  assert.match(rd('js/app-body.js'), /IntMapModules\.usElections\(IM_HOST\)/);
  assert.match(rd('js/layer-home.js'), /HOMES\['dl-uselect'\]/);
});
