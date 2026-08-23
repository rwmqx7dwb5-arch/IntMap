/* ============================================================================
 *  IntMap · #R388 source checks — World railways, from OpenStreetMap's own tags
 * ----------------------------------------------------------------------------
 *  「現在の『世界の鉄道（軌間別）』は、各線路そのものの軌間を読んでいるわけではありません。
 *    変換コードを見ると、線路の中点が入る国を判定し、その国の『主要軌間』をその線路全体に
 *    割り当てています。」
 *
 *  The defect these checks exist to keep out is not "the data was coarse". It is that a layer
 *  advertised a property it had never read: `_rail_convert.py` looked up a gauge by COUNTRY and
 *  the legend called the result «by gauge». So ⑥ below is not a smoke test — it asserts that the
 *  shipped world file contains BOTH 1668 mm and 1435 mm inside Spain, which is exactly what the
 *  old data could not contain and what OpenStreetMap actually says.
 *
 *  ⚠ THE SOURCE IS READ THROUGH readLF and stripped through the SHARED codeOnly (#R317, #R345):
 *  a `\n`-anchored regex on a CRLF checkout is a check that is permanently red on Windows and
 *  permanently green in CI, and a check that reads its own explanatory comment is the shape this
 *  project has paid for eleven times.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { RailSchema } from '../js/rail-schema.js';

const {
  AXES, UNKNOWN_COLOUR, gaugeOf, speedOf, freqOf, tracksOf, voltageOf, elecOf,
  currentOf, usageOf, modeOf, yearOf, gaugeBucket, elecBucket, speedBucket, tracksBucket,
  encodeLines, decodeLines, encodePoints, decodePoints,
} = RailSchema;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const code = (p) => codeOnly(read(p));
const DATA = resolve(ROOT, 'data', 'railways');
const wire = (p) => JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));
/* ⚠ READ IT THE WAY THE BROWSER DOES. The shipped files are the compact wire form
   ({v,s,k,d,l}), not GeoJSON: the first version of ⑥ and ⑦ read `.features` off them and died with
   "Cannot read properties of undefined". Decoding here means these checks also exercise the decoder
   against real data rather than against the four hand-made lines in ⑬. */
const gz = (p) => decodeLines(wire(p));
const hasData = existsSync(resolve(DATA, 'world.json.gz'));

/* ── ① the country guess is gone, not merely unused ───────────────────────── */
test('R388 ① the Natural Earth converter and its output no longer exist anywhere', () => {
  assert.equal(existsSync(resolve(ROOT, '_rail_convert.py')), false,
    '_rail_convert.py assigned a gauge by country midpoint — deleting the layer that used it is not enough, the converter itself must go');
  assert.equal(existsSync(resolve(ROOT, 'data', 'railways_gauge.json')), false);
  /* ⚠ CODE, NOT PROSE. The comment that replaced the old block SHOULD say what was deleted and why —
     that history is the reason the next round will not rebuild it. What must not survive is a live
     reference, so this reads the stripped source (#R345). */
  for (const f of ['js/layer-packs.js', 'js/compare.js', 'js/railways.js']) {
    const s = code(f);
    assert.equal(/railways_gauge\.json/.test(s), false, f + ' still loads the deleted file');
    assert.equal(/_rail_convert/.test(s), false, f + ' still calls the deleted converter');
  }
  /* docs/FILES.md is a LEDGER of files that exist, not a history — a row for a deleted file is a
     wrong row, and prose is exactly what it is made of, so it is checked whole. */
  const ledger = read('docs/FILES.md');
  assert.equal(/railways_gauge\.json/.test(ledger), false, 'docs/FILES.md still lists data/railways_gauge.json');
  assert.equal(/_rail_convert/.test(ledger), false, 'docs/FILES.md still lists _rail_convert.py');
  assert.match(ledger, /railways\/[\s\S]{0,500}world\.json\.gz/, 'docs/FILES.md does not list what replaced it');
});

/* ── ② one table, imported by both sides ──────────────────────────────────── */
test('R388 ② the colour/bucket table has exactly one definition', () => {
  const lp = code('js/layer-packs.js');
  assert.equal(/RAIL_COL|RAIL_LBL/.test(lp), false,
    'js/layer-packs.js still carries its own gauge colour table — that copy is what drifted from the Python that fed it');
  const build = code('scripts/rail/build.mjs');
  const layer = code('js/railways.js');
  assert.match(build, /from '\.\.\/\.\.\/js\/rail-schema\.js'/, 'the build must classify with the SAME table the legend draws from');
  assert.match(layer, /from '\.\/rail-schema\.js'/);
  /* and the layer must not re-declare colours of its own */
  const hexes = (layer.match(/#[0-9a-fA-F]{6}/g) || []).filter((h) => h !== '#ffffff' && h !== '#1a1d23' && h !== '#ffd43b' && h !== '#e8eef8');
  assert.equal(hexes.length, 0, 'js/railways.js declares line colours (' + hexes.join(',') + ') — every axis colour belongs in js/rail-schema.js');
});

/* ── ③ "OSM did not say" is a value, and 0 is not it ──────────────────────── */
test('R388 ③ every parser returns null for absent, and never 0', () => {
  /* Number('') === 0 and isFinite(0) === true: the pair that shipped a wrong number three times
     in one round (#R354). Each of these would be 0 under the naive parser. */
  assert.equal(gaugeOf({}), null);
  assert.equal(gaugeOf({ b: '' }), null);
  assert.equal(speedOf({ h: '' }), null);
  assert.equal(tracksOf({ i: '' }), null);
  assert.equal(voltageOf({ f: '' }), null);
  assert.equal(usageOf({ j: '' }), null);
  assert.equal(modeOf({ l: '' }), null);
  assert.equal(yearOf({ v: '' }), null);
  assert.equal(elecOf({ e: '' }), null);
  /* …and 0 Hz IS an answer — it means DC — so it must survive as 0 and not collapse to null */
  assert.equal(freqOf({ g: '0' }), 0);
  assert.equal(currentOf({ e: 'contact_line', g: '0' }), 'dc');
  assert.equal(currentOf({ e: 'contact_line', g: '16.7' }), 'ac');
  assert.equal(currentOf({ e: 'contact_line' }), null, 'no frequency stated is not DC');
  assert.equal(currentOf({ e: 'no' }), 'none');
  /* real values still parse */
  assert.equal(gaugeOf({ b: '1435' }), 1435);
  assert.equal(gaugeOf({ b: '1000;1435' }), 1000);
  assert.equal(speedOf({ h: '80 mph' }), 129);
  assert.equal(yearOf({ v: '1875-06-01' }), 1875);
});

/* ── ④ every bucket the map can paint has a name in the legend ────────────── */
test('R388 ④ every bucket id in every axis is labelled, and "not stated" is never a real colour', () => {
  const layer = code('js/railways.js');
  const labelled = new Set();
  for (const m of layer.matchAll(/^\s{4}([A-Za-z_][A-Za-z0-9_]*):\s*\(\)\s*=>\s*LA\(/gm)) labelled.add(m[1]);
  /* `na` is supplied by NOT_STATED, which is assigned rather than written inline */
  labelled.add('na');
  const missing = [];
  for (const [axis, spec] of Object.entries(AXES)) {
    for (const [id] of spec.buckets) if (!labelled.has(id)) missing.push(axis + '.' + id);
  }
  assert.deepEqual(missing, [], 'buckets the map paints but the legend cannot name: ' + missing.join(', '));

  /* the honest bucket must be visually distinct from every answered one */
  for (const [axis, spec] of Object.entries(AXES)) {
    const real = spec.buckets.filter(([id]) => id !== 'na').map(([, c]) => c.toLowerCase());
    assert.equal(real.includes(UNKNOWN_COLOUR.toLowerCase()), false,
      axis + ' paints a real answer in the same colour as "not stated"');
    assert.equal(new Set(real).size, real.length, axis + ' paints two different answers the same colour');
  }
  /* …and every axis that CAN be unanswered must offer the bucket. status and kind are derived from
     `railway=*` itself, which is always present, so they are the two that must not. */
  for (const axis of ['gauge', 'electrification', 'speed', 'tracks', 'traffic']) {
    assert.ok(AXES[axis].buckets.some(([id]) => id === 'na'), axis + ' has no "not stated" bucket');
  }
  for (const axis of ['status', 'kind']) {
    assert.equal(AXES[axis].buckets.some(([id]) => id === 'na'), false, axis + ' cannot be unanswered');
  }
});

/* ── ⑤ the bucketers agree with the axis tables ───────────────────────────── */
test('R388 ⑤ every bucketer only ever returns ids its axis declares', () => {
  const ids = (a) => new Set(AXES[a].buckets.map(([id]) => id));
  const gs = ids('gauge');
  for (const g of [null, 100.5, 500, 600, 762, 891, 1000, 1009, 1067, 1200, 1435, 1445, 1520, 1524, 1600, 1668, 1676, 1700, 3000]) {
    assert.ok(gs.has(gaugeBucket(g)), 'gauge ' + g + ' → ' + gaugeBucket(g) + ', not an axis bucket');
  }
  const es = ids('electrification');
  for (const [e, v, c] of [[null, 0, null], ['no', 0, 'none'], ['contact_line', 25000, 'ac'], ['contact_line', 15000, 'ac'],
    ['contact_line', 750, 'ac'], ['rail3', 3000, 'dc'], ['rail3', 1500, 'dc'], ['rail3', 630, 'dc'], ['yes', 0, null]]) {
    assert.ok(es.has(elecBucket(e, v, c)), 'elec ' + e + '/' + v + '/' + c + ' → ' + elecBucket(e, v, c));
  }
  const ss = ids('speed');
  for (const v of [null, 0.5, 20, 45, 90, 130, 175, 220, 275, 320, 603]) assert.ok(ss.has(speedBucket(v)), 'speed ' + v);
  const ts = ids('tracks');
  for (const v of [null, 1, 2, 3, 4, 9]) assert.ok(ts.has(tracksBucket(v)), 'tracks ' + v);
  /* 1520 and 1524 stay two gauges (#R266), now on real per-track values */
  assert.notEqual(gaugeBucket(1520), gaugeBucket(1524));
});

/* ── ⑥ THE REGRESSION ITSELF: a country is not one gauge ──────────────────── */
test('R388 ⑥ the shipped world data disagrees with the country it runs through', { skip: !hasData && 'data/railways not built' }, () => {
  const w = gz(resolve(DATA, 'world.json.gz'));
  assert.ok(w.features.length > 20000, 'world file has only ' + w.features.length + ' lines');
  /* the world level ships buckets in place of readings for every axis but gauge — so the axes it
     cannot answer must be answered by the bucket, never left blank (js/railways.js stamp()) */
  const anyF = w.features[0].properties;
  for (const k of ['k', 'be', 'bs', 'bt', 'bm']) assert.ok(k in anyF, 'the world level stopped shipping ' + k);

  const inBox = (f, s, wst, n, e) => f.geometry.coordinates.some((p) => p[1] >= s && p[1] <= n && p[0] >= wst && p[0] <= e);
  const gaugesIn = (s, wst, n, e) => {
    const set = new Set();
    for (const f of w.features) if (inBox(f, s, wst, n, e) && f.properties.g != null) set.add(f.properties.g);
    return set;
  };
  /* Iberia: OSM states 1435 mm on the high-speed network and 1000 mm on the metre-gauge lines.
     The old layer could only ever have said 1668 here, because 1668 was ESP's table entry. */
  const iberia = gaugesIn(36, -10, 44, 3);
  assert.ok(iberia.has(1668), 'Iberia has no 1668 mm line at all — the sweep missed Spain');
  assert.ok(iberia.has(1435), 'Iberia is uniformly Iberian gauge — the Spanish high-speed network is 1435 mm and the layer must say so');
  /* India: OSM states 1000 mm and 762 mm lines inside a 1676 mm country. */
  const india = gaugesIn(8, 68, 35, 90);
  assert.ok(india.has(1676), 'India has no 1676 mm line — the sweep missed India');
  assert.ok(india.size > 1, 'India is uniformly broad gauge — OSM records metre and 762 mm lines there');

  /* and the honest bucket is present and is not the whole map */
  const na = w.features.filter((f) => f.properties.g == null).length;
  assert.ok(na < w.features.length * 0.4, 'more than 40% of the world has no stated gauge (' + na + '/' + w.features.length + ') — the sweep or the parser lost it');
});

/* ── ⑦ the shards are self-describing and complete ────────────────────────── */
test('R388 ⑦ index.json names cells that exist, and every feature carries its class', { skip: !hasData && 'data/railways not built' }, () => {
  const idx = JSON.parse(readFileSync(resolve(DATA, 'index.json'), 'utf8'));
  assert.equal(idx.cell, 5);
  const keys = Object.keys(idx.cells);
  assert.ok(keys.length > 100, 'only ' + keys.length + ' cells');
  const onDisk = new Set(readdirSync(resolve(DATA, 'c')).map((f) => f.replace(/\.json\.gz$/, '')));
  const missing = keys.filter((k) => !onDisk.has(k));
  assert.deepEqual(missing, [], 'index names cells with no file: ' + missing.slice(0, 5).join(', '));
  const unindexed = [...onDisk].filter((k) => !Object.prototype.hasOwnProperty.call(idx.cells, k));
  assert.deepEqual(unindexed, [], 'cells on disk the index never mentions — the layer would never fetch them: ' + unindexed.slice(0, 5).join(', '));

  /* one real cell, read the way the browser reads it */
  const sample = gz(resolve(DATA, 'c', keys[0] + '.json.gz'));
  const kinds = new Set();
  for (const f of sample.features) {
    assert.ok(f.properties.k, 'a feature with no line class');
    kinds.add(f.properties.k);
    assert.equal(Object.prototype.hasOwnProperty.call(f.properties, 'g') && f.properties.g === 0, false,
      'a gauge of 0 reached the product — absent must be absent');
  }
  for (const k of kinds) assert.ok(['rail', 'narrow_gauge', 'light_rail', 'subway', 'tram', 'construction'].includes(k), 'unknown class ' + k);
});

/* ── ⑧ the coverage gate can actually reject ──────────────────────────────── */
test('R388 ⑧ a well-formed empty answer is rejected, not filed as an empty region', async () => {
  const m = await import('../scripts/rail/fetch.mjs');
  assert.equal(typeof m.electEndpoints, 'function');
  assert.ok(m.PROBE_MIN >= 1000, 'the probe threshold must be far above zero — the Swiss instance answered 0, not an error');
  /* the probe asks about a bbox that is known to be populated; a mirror that reports 0 there is a
     regional instance. This asserts the SHAPE that catches it: `classifyError` calls a valid JSON
     body "ok", so emptiness has to be judged after parsing, by count. */
  assert.equal(m.classifyError('{"elements":[]}'), 'ok',
    'an empty result set is a well-formed answer — if classifyError called it an error the sweep would retry forever instead of rejecting the instance');
  assert.equal(m.classifyError('<html>Dispatcher_Client::request_read_and_idx::timeout'), 'busy');
  assert.equal(m.classifyError('<html>Error: runtime error: Query timed out'), 'too-big');
  assert.equal(m.classifyError(''), 'busy', 'an EMPTY BODY is transient, never a reason to split a cell');
  /* ⚠ AND AN ILL-FORMED QUERY IS PERMANENT. MEASURED: an invalid `convert item ::geom=center()`
     comes back as «parse error: center(...) must have one or more arguments» — which matched none
     of the transient patterns and fell through to the "try again" default, so the station sweep
     retried a programming mistake for its whole run and reported it as an overloaded server. A
     classifier that defaults to "transient" must name the permanent failures explicitly. */
  assert.equal(m.classifyError('<html>Error: line 1: parse error: center(...) must have one or more arguments'), 'bad-query');
  assert.equal(m.classifyError('<html>Error: line 1: static error: Unknown type "foo"'), 'bad-query');
  assert.match(code('scripts/rail/fetch.mjs'), /throw new Error\('Overpass rejected the query as ill-formed/, 'a bad query is retried instead of raised');
  /* and the elected list starts empty, so nothing can sweep before the probe has run */
  assert.deepEqual(m.ENDPOINTS, [], 'ENDPOINTS is pre-populated — a sweep could start without the coverage probe');
  const src = code('scripts/rail/fetch.mjs');
  assert.match(src, /NOT A PLANET INSTANCE/, 'the rejection reason must be stated in the log, not silently dropped');
  assert.match(src, /refusing to sweep/, 'zero elected instances must throw, never fall through to a silent no-op sweep');

  /* ⚠ AND A REFUSAL IS A DELAY, NOT AN ANSWER. MEASURED on the first full run: the one elected
     instance began refusing the 10° queries while still answering the 1° probe, and 34 cells —
     Central Asia, 40–50°N — reached the end of their retry ladder and were written off. The sweep
     then printed "done". A hole in the planet that no error ever reported is the most expensive
     shape this pipeline has, so the requeue is asserted here rather than trusted. */
  assert.match(src, /requeued \$\{tries\}\/\$\{MAX_REQUEUE\}/, 'a refused cell is dropped instead of being put back in the queue');
  assert.match(src, /GIVEN UP after/, 'giving up on a cell must say so — a silent loss reads as coverage');
  /* the recovery check cannot be counted in successes: when everything is failing, the success
     counter stops and a re-election keyed on it never fires again */
  assert.match(src, /attempts \+\+?= ?1;|attempts\+\+;/, 'nothing counts attempts');
  assert.match(src, /if \(attempts % 60 === 0\)/, 're-election is keyed on successes, so a total outage never re-probes');
  assert.equal(/if \(done % 60 === 0\)/.test(src), false, 'the old success-keyed re-election is back');
});

/* ── ⑨ the row keeps the names the rest of the app already uses ───────────── */
test('R388 ⑨ the layer ids the opacity registration, the self-heal and Compare name are unchanged', () => {
  const lp = code('js/layer-packs.js');
  assert.match(lp, /_registerLayerOpacity\('rail2'/);
  assert.match(lp, /'beta-dl-rail'/);
  assert.match(lp, /'rail-ln'/);
  const layer = code('js/railways.js');
  for (const id of ['rail-src', 'rail-ln', 'rail-det-src', 'rail-det-ln', 'rail-st', 'rail-st-lbl']) {
    assert.ok(layer.includes("'" + id + "'"), 'js/railways.js never names ' + id);
  }
  /* the row delegates and says so when the module is absent — the shape this project keeps paying
     for is a toggle that looks alive and does nothing (#R254) */
  assert.match(lp, /IntMapLazy\.need\('railways'\)/);
  assert.match(lp, /IntMapRailways is not loaded/);
  /* …and Compare's rail layer must not paint from a property the new data does not have.
     ⚠ SCOPED TO cmp-rail: `cmp-dc` and `cmp-ph` legitimately read `col`, because those two really
     do carry it. A repo-wide grep for `['get','col']` would have failed on their correctness. */
  const cmp = code('js/compare.js').replace(/\s/g, '');
  const railLayer = /id:'cmp-rail',type:'line'.*?paint:\{(.*?)\}\)/.exec(cmp);
  assert.ok(railLayer, "Compare no longer defines a 'cmp-rail' line layer");
  assert.equal(/\['get','col'\]/.test(railLayer[1]), false,
    "Compare's rail layer still reads the `col` property the Natural Earth build stamped on every feature");
  assert.match(railLayer[1], /IntMapRailways/, "Compare's rail colour must come from the module that owns the buckets");
});

/* ── ⑩ the layer is reachable from Atlas, and so is the one it displaced ──── */
test('R388 ⑩ Atlas can name this layer, the basemap reference keeps its own words', () => {
  const ac = code('js/atlas-console.js');
  assert.match(ac, /'railways':'beta-dl-rail'/, 'the bare word still points at the basemap reference line, which is ON by default');
  assert.match(ac, /'鉄道':'beta-dl-rail'/);
  assert.match(ac, /'railway reference':'cb-rail2'/, 'cb-rail2 lost its only route out of Atlas');
  assert.match(ac, /case 'railAxis'/);
  const caps = read('js/atlas-capabilities.js');
  assert.match(caps, /'layers\.railAxis'/);
  assert.match(caps, /'railways'\]/, 'the railAxis capability must declare the lazy module it needs at execution');
  const cat = read('js/atlas-catalog-text.js');
  assert.match(cat, /'layers\.railAxis'/, 'a capability the planner is never told about cannot be used');
  assert.match(cat, /"type":"railAxis"/);
});

/* ── ⑬ the wire format is lossless within its own rounding ────────────────── */
test('R388 ⑬ encode → decode returns exactly what was encoded', () => {
  const KEYS = ['k', 'x', 'g', 'n', 'o'];
  const lines = [
    { pts: [[-9.1234, 38.7654], [-9.1, 38.8], [-8.9, 39.0]], props: { k: 'rail', g: 1668, n: 'Linha do Norte', o: 'IP' } },
    { pts: [[139.7, 35.68], [139.75, 35.7]], props: { k: 'rail', g: 1067, n: '東海道本線', o: 'JR東日本', i: 12345 } },
    /* the SAME tuple as the first: it must cost one dictionary entry, not two */
    { pts: [[-8.9, 39.0], [-8.5, 39.4]], props: { k: 'rail', g: 1668, n: 'Linha do Norte', o: 'IP', i: 999 } },
    { pts: [[0, 0], [0.001, -0.001]], props: { k: 'construction', x: 'construction' } },
  ];
  const enc = encodeLines(lines, KEYS, 100000, 'i');
  assert.equal(enc.d.length, 3, 'the dictionary did not deduplicate identical tuples: ' + JSON.stringify(enc.d));
  /* ⚠ AND THE UNIQUE VALUE MUST NOT BE IN THE TUPLE. An OSM way id inside the dictionary key makes
     every tuple distinct and turns the dictionary into a longer copy of the data. */
  for (const t of enc.d) assert.equal(t.includes(999) || t.includes(12345), false, 'the way id leaked into the dictionary');

  const back = decodeLines(enc);
  assert.equal(back.features.length, lines.length);
  for (let i = 0; i < lines.length; i++) {
    const got = back.features[i];
    assert.deepEqual(got.geometry.coordinates.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]),
      lines[i].pts.map((p) => [+p[0].toFixed(5), +p[1].toFixed(5)]), 'line ' + i + ' geometry');
    for (const k of KEYS) {
      if (lines[i].props[k] === undefined) assert.equal(k in got.properties, false, 'line ' + i + ' invented ' + k);
      else assert.equal(got.properties[k], lines[i].props[k], 'line ' + i + ' ' + k);
    }
    if (lines[i].props.i) assert.equal(got.properties.i, lines[i].props.i, 'line ' + i + ' lost its OSM id');
  }
  /* a version it does not know must produce nothing, never a half-decoded map */
  assert.deepEqual(decodeLines({ v: 999 }).features, []);
  assert.deepEqual(decodeLines(null).features, []);

  const pts = [
    { pt: [2.3522, 48.8566], props: { n: 'Gare du Nord', o: 'SNCF', tr: 1 } },
    { pt: [2.32, 48.88], props: { n: 'Gare du Nord', o: 'SNCF', tr: 1 } },
  ];
  const penc = encodePoints(pts, ['n', 'o', 'tr'], 100000);
  assert.equal(penc.d.length, 1);
  const pback = decodePoints(penc);
  assert.equal(pback.features.length, 2);
  assert.deepEqual(pback.features[0].geometry.coordinates, [2.3522, 48.8566]);
  assert.equal(pback.features[1].properties.o, 'SNCF');
});

/* ── ⑫ every engine call the layer makes is a method the engine has ───────── */
test('R388 ⑫ the module calls the facade by its real names', () => {
  /* ⚠ THIS CHECK EXISTS BECAUSE THE FIRST DRAFT DID NOT. It called `layers.setVisibility`,
     `camera.zoom()` and `camera.bounds()`; the facade spells them `setVisible`, `getZoom`,
     `getBounds`. All three sit inside `try { … } catch (_) {}`, so the TypeError was swallowed and
     the layer never became visible — a toggle that looks alive and does nothing. A typo in a
     method name behind a bare catch has no symptom at all, so the name has to be checked here. */
  const engine = read('js/geo-engine.js');
  /* the facade's namespaces are one enormous object literal each; rather than guess where a block
     closes, take from one namespace's opening to the next one's */
  const opens = [...engine.matchAll(/\n {4}([a-z][A-Za-z0-9_]*):\{/g)].map((m) => ({ name: m[1], at: m.index }));
  const ns = {};
  for (const name of ['layers', 'camera', 'coords', 'events', 'render']) {
    const i = opens.findIndex((o) => o.name === name);
    assert.ok(i >= 0, 'js/geo-engine.js has no ' + name + ' namespace — this check is reading the wrong shape');
    ns[name] = engine.slice(opens[i].at, i + 1 < opens.length ? opens[i + 1].at : engine.length);
  }
  const src = code('js/railways.js');
  const calls = new Set();
  for (const m of src.matchAll(/GE\(\)\.([a-z]+)\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) calls.add(m[1] + '.' + m[2]);
  assert.ok(calls.size >= 12, 'only found ' + calls.size + ' engine calls — the extractor stopped matching');
  const bad = [];
  for (const c of calls) {
    const [n, method] = c.split('.');
    if (!ns[n]) { bad.push(c + ' (no such namespace)'); continue; }
    if (!new RegExp('[{,\\s]' + method + '\\s*:').test(ns[n])) bad.push(c);
  }
  assert.deepEqual(bad, [], 'js/railways.js calls engine methods that do not exist: ' + bad.join(', '));
});

/* ── ⑪ the module is lazy, and registered in all three tables ─────────────── */
test('R388 ⑪ railways is a lazy module and is not on the startup path', () => {
  const lz = code('js/lazy-modules.js');
  assert.match(lz, /railways: 'IntMapRailways'/);
  assert.match(lz, /case 'railways': return import\('\.\/railways\.js'\)/);
  assert.match(lz, /case 'railways': window\.IntMapModules\.railways\(IM_HOST\); return true;/);
  /* #R340: assert the absence directly rather than trusting that js/*.js is all eager */
  const main = code('src/main.js');
  assert.equal(/railways\.js/.test(main), false, 'src/main.js imports the railway module — it would be in the startup bundle');
  assert.equal(/rail-schema\.js/.test(main), false);
});
