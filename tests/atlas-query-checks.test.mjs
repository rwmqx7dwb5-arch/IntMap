/* ============================================================================
 *  Atlas · the cross-dataset query engine (js/atlas-query.js, js/coastline.js) and the data it reads
 * ----------------------------------------------------------------------------
 *  (tests-by-topic) Gathered from three round files; every test keeps the title it had there:
 *    · tests/r495-checks.test.mjs — the query, and the coastline measurement it needed
 *    · tests/r497-checks.test.mjs — the volcano table was counting rows it could not name
 *    · tests/r620-checks.test.mjs — the query audited end to end (sections of cities, one table per query)
 *  Their histories follow, each above its own tests.
 *  ⚠ (tests-by-topic) #R620's engine() installs a window and a document of its own; they are put back
 *  after the file, so nothing that runs later in this process inherits them.
 * ==========================================================================*/
/* ============================================================================
 *  R495 — THE CROSS-DATASET QUERY, AND THE MEASUREMENT IT NEEDED
 * ----------------------------------------------------------------------------
 *  「人口100万人以上で、年間降水量500mm未満、海から200km以上、過去30日でM5以上の地震があった都市は？」
 *  came back as a page about what somebody would have to go and check. Three of the four conditions
 *  were already answerable from data the app ships; the fourth — 「海から200km以上」 — had no
 *  measurement anywhere in the program, and nothing could have intersected the four in any case.
 *
 *  What this file asserts is the part that can be asserted WITHOUT a browser:
 *    ① the coastline artefact is what it says it is, and the Caspian is separated rather than assumed
 *    ② js/coastline.js's distance agrees with an INDEPENDENT spherical computation over the same file
 *       (dot-product cosines vs. cross-track atan2 — two different formulas, one answer)
 *    ③ the capability, the schema, the catalogue block, the dispatch door and the lazy entry all exist
 *       and name each other, so `{"type":"query"}` cannot be documented-but-unreachable (#R278's rule)
 *    ④ the engine's honesty rules are IN THE CODE: every cap is pushed into the reported list, a
 *       column that fails is recorded as unapplied, and nothing in the file asks a model for a number
 *    ⑤ the two fields the engine needed from existing modules are still there (gazetteer iso2,
 *       precip warmValues) — a silent removal of either is a silently empty column
 * ==========================================================================*/
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import * as acorn from 'acorn';
import { LAZY_NAMES, LAZY_REGISTRY } from '../js/lazy-modules.js';
import { codeOnly } from '../scripts/code-only.mjs';   /* (#R497) the forbidden names below appear in that round's own COMMENT explaining them */
import { makeAtlasTurnResults } from '../js/atlas-turn-results.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DOC = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/coastline.json.gz'))).toString('utf8'));

const _saved = { window: globalThis.window, document: globalThis.document };
after(() => { globalThis.window = _saved.window; globalThis.document = _saved.document; });

/* ── ① the artefact ─────────────────────────────────────────────────────────────────────────── */

test('R495 ①: data/coastline.json.gz is the Natural Earth coastline, at a stated tolerance', () => {
  assert.equal(DOC.v, 1);
  assert.match(DOC.source, /Natural Earth 1:10m/);
  assert.equal(DOC.scale, 1000);
  assert.ok(DOC.toleranceKm > 0 && DOC.toleranceKm <= 5, `tolerance ${DOC.toleranceKm} km — the error it puts into every answer`);
  assert.ok(DOC.parts > 1000, `${DOC.parts} ocean parts`);
  assert.ok(DOC.vertices > 50000, `${DOC.vertices} ocean vertices`);
  /* the simplification is what makes the file small; if it ever stops simplifying, say so loudly */
  assert.ok(DOC.vertices < DOC.rawVertices, 'the geometry is simplified, not copied');
  for (const p of DOC.coords) { assert.ok(p.length >= 4 && p.length % 2 === 0, 'a part is [lng0,lat0,dlng,dlat,…]'); }
});

test('R495 ①: the Caspian is separated from the ocean, and no lake is in either list', () => {
  assert.ok(DOC.enclosedParts > 0, 'Natural Earth carries the Caspian in its coastline layer — it must be classified, not silently counted as ocean');
  assert.deepEqual(Array.from(new Set(DOC.enclosedNames)), ['Caspian Sea']);
  const pts = (parts) => {
    const out = [];
    for (const p of parts) { let x = p[0], y = p[1]; out.push([x / DOC.scale, y / DOC.scale]);
      for (let i = 2; i < p.length; i += 2) { x += p[i]; y += p[i + 1]; out.push([x / DOC.scale, y / DOC.scale]); } }
    return out;
  };
  const ocean = pts(DOC.coords), enclosed = pts(DOC.enclosed);
  const inBox = (ps, b) => ps.some((q) => q[0] >= b[0] && q[0] <= b[2] && q[1] >= b[1] && q[1] <= b[3]);
  /* the Caspian's own basin: every vertex there belongs to `enclosed`, none to `coords` */
  const CASPIAN = [47.0, 37.0, 55.0, 47.0];
  assert.ok(inBox(enclosed, CASPIAN), 'the enclosed list is the Caspian');
  assert.ok(!inBox(ocean, CASPIAN), 'no ocean vertex may sit inside the Caspian basin');
  /* freshwater lakes are not coast in EITHER list — that is what makes 「海から」 mean the sea */
  for (const [name, b] of [['Aral', [58.0, 44.0, 61.5, 46.8]], ['Baikal', [104.0, 51.6, 109.8, 55.8]],
    ['Superior/Michigan', [-92.0, 41.5, -84.5, 48.9]], ['Victoria', [31.8, -3.0, 34.8, 0.4]]]) {
    assert.ok(!inBox(ocean, b), `${name} must not be in the ocean coastline`);
    assert.ok(!inBox(enclosed, b), `${name} must not be in the enclosed-sea list`);
  }
});

/* ── ② the distance, checked against a different formula ────────────────────────────────────── */

/* Cross-track / along-track on the sphere, with atan2 — the textbook formula, and NOT the one
   js/coastline.js uses. It computes bearings and angular distances; the module computes dot
   products and compares cosines. Two implementations agreeing is evidence; one implementation
   agreeing with itself is not. */
function independentKm(lng, lat, parts, scale) {
  const R = 6371.0088, rad = Math.PI / 180;
  const ang = (a, b, c, d) => {
    const s1 = Math.sin((c - a) * rad / 2), s2 = Math.sin((d - b) * rad / 2);
    return 2 * Math.asin(Math.min(1, Math.sqrt(s1 * s1 + Math.cos(a * rad) * Math.cos(c * rad) * s2 * s2)));
  };
  const brg = (a, b, c, d) => {
    const y = Math.sin((d - b) * rad) * Math.cos(c * rad);
    const x = Math.cos(a * rad) * Math.sin(c * rad) - Math.sin(a * rad) * Math.cos(c * rad) * Math.cos((d - b) * rad);
    return Math.atan2(y, x);
  };
  let best = Infinity;
  for (const p of parts) {
    let x = p[0], y = p[1];
    let ax = x / scale, ay = y / scale;
    for (let i = 2; i < p.length; i += 2) {
      x += p[i]; y += p[i + 1];
      const bx = x / scale, by = y / scale;
      const d13 = ang(ay, ax, lat, lng), d12 = ang(ay, ax, by, bx);
      const t13 = brg(ay, ax, lat, lng), t12 = brg(ay, ax, by, bx);
      let d = Math.min(d13, ang(by, bx, lat, lng));
      if (d12 > 0 && Math.cos(t13 - t12) >= 0) {
        /* ⚠ THE `cos(θ13−θ12) >= 0` IS NOT OPTIONAL. `acos` returns [0,π], so an along-track
           distance that is really NEGATIVE (the point lies behind A) comes back positive and the
           perpendicular to the EXTENDED great circle gets accepted for a segment it misses. Left
           out, this check reported Tokyo at 6.04 km against a true 7.71 and would have failed the
           module for being correct. */
        const dxt = Math.asin(Math.max(-1, Math.min(1, Math.sin(d13) * Math.sin(t13 - t12))));
        const dat = Math.acos(Math.max(-1, Math.min(1, Math.cos(d13) / Math.cos(dxt))));
        if (dat <= d12) d = Math.min(d, Math.abs(dxt));
      }
      if (d < best) best = d;
      ax = bx; ay = by;
    }
  }
  return best * R;
}

test('R495 ②: makeCoastline() agrees with an independent spherical computation', async () => {
  const { makeCoastline } = await import('../js/coastline.js');
  const C = makeCoastline();
  assert.equal(C.loaded(), false, 'nothing is measured before the file arrives');
  assert.equal(C.distanceKm(139.69, 35.69), null, 'and a query before then answers null, not 0');
  assert.ok(C.adopt(DOC), 'adopt() takes the real file');
  const POINTS = [
    ['Tokyo', 139.6917, 35.6895], ['Singapore', 103.8198, 1.3521], ['Anchorage', -149.9003, 61.2181],
    ['Denver', -104.9903, 39.7392], ['Moscow', 37.6173, 55.7558], ['Ürümqi', 87.6005, 43.8256],
    ['Ulaanbaatar', 106.9175, 47.9186], ['Riyadh', 46.7219, 24.6333], ['Johannesburg', 28.0473, -26.2041],
    ['La Paz', -68.1193, -16.4897], ['Reykjavík', -21.9426, 64.1466], ['open Pacific', -140, 0],
  ];
  for (const [name, lng, lat] of POINTS) {
    const mine = C.distanceKm(lng, lat);
    const theirs = independentKm(lng, lat, DOC.coords, DOC.scale);
    assert.ok(Math.abs(mine - theirs) < Math.max(0.5, theirs * 0.001),
      `${name}: module says ${mine.toFixed(2)} km, the cross-track formula says ${theirs.toFixed(2)} km`);
  }
});

test('R495 ②: the two columns are two different answers, and each is the right one', async () => {
  const { makeCoastline } = await import('../js/coastline.js');
  const C = makeCoastline(); C.adopt(DOC);
  /* Baku is ON the Caspian and 600+ km from any ocean. If `coastKm` and `seaKm` ever agree there,
     the two lists have been merged and 「海から200km以上」 has quietly changed meaning. */
  const baku = C.distances(49.8671, 40.4093);
  assert.ok(baku.seaKm < 20, `Baku is on the Caspian — seaKm ${baku.seaKm.toFixed(1)} km`);
  assert.ok(baku.coastKm > 500, `…and far from the ocean — coastKm ${baku.coastKm.toFixed(1)} km`);
  /* Tehran is the case that decides whether the answer contains Tehran */
  const tehran = C.distances(51.3890, 35.6892);
  assert.ok(tehran.seaKm < 150 && tehran.coastKm > 400,
    `Tehran: ocean ${tehran.coastKm.toFixed(0)} km vs any-sea ${tehran.seaKm.toFixed(0)} km — the choice this round refuses to make silently`);
  /* a coastal city must be coastal by BOTH measures, and an interior one far by both */
  const tokyo = C.distances(139.6917, 35.6895);
  assert.ok(tokyo.coastKm < 20 && tokyo.seaKm < 20);
  const urumqi = C.distances(87.6005, 43.8256);
  assert.ok(urumqi.coastKm > 1500 && urumqi.seaKm > 1500, 'Ürümqi is the most inland large city on Earth by either reading');
  assert.ok(urumqi.seaKm <= urumqi.coastKm + 1e-6, 'counting MORE water can never make the sea further away');
});

/* ── ③ the action exists at every layer it has to exist at ──────────────────────────────────── */

test('R495 ③: data.query is a capability, a schema, a catalogue block, a dispatch case and a lazy module', async () => {
  /* ⚠ (tests-by-topic) THE FIVE LAYERS ARE ASKED, NOT SPELLED. This read one row of
     js/atlas-capabilities.js, one line of js/atlas-schemas.js and one `case` line of the console as
     text — so reordering the aliases, or moving the schema to another line, failed a check whose
     subject is whether the planner can reach the action. The registry, the schema module, the
     catalogue and the dispatch audit all run in node; what each one ANSWERS is the property. */
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
  const { makeAtlasSchemas } = await import('../js/atlas-schemas.js');
  const { makeAtlasCatalogText } = await import('../js/atlas-catalog-text.js');
  const { dispatchGroups } = await import('../scripts/atlas-capability-audit.mjs');
  const CAPS = makeAtlasCapabilities({});
  const cap = CAPS.resolve('data.query');
  assert.ok(cap && cap.id === 'data.query', 'the capability row');
  for (const s of ['query', 'crossQuery', 'dataQuery']) {
    assert.equal(CAPS.resolve(s) && CAPS.resolve(s).id, 'data.query', 'the capability answers to «' + s + '»');
  }
  assert.equal(cap.observerKind, 'queryRows', "…observed by the observer that knows an empty result is an answer");
  assert.ok(CAPS.OBSERVERS && CAPS.OBSERVERS.queryRows, 'the observer itself');
  const sc = makeAtlasSchemas().schemaFor('data.query');
  assert.ok(sc && Array.isArray(sc.required) && sc.required.includes('from'), 'the argument schema');
  const docs = makeAtlasCatalogText({}, {});
  assert.ok(docs.idsCovered().includes('data.query'), 'the catalogue block the planner is shown');
  assert.match(docs.text(['data.query']), /CROSS-DATASET QUERY/, '…and it says what it is');
  const spellings = new Set(dispatchGroups(read('js/atlas-console.js').split(/\r?\n/)).flatMap((g) => g.names));
  for (const s of ['query', 'crossQuery', 'dataQuery']) assert.ok(spellings.has(CAPS.dispatchName(s)), 'the dispatch door answers «' + s + '»');   /* (atlas-one-declaration) through the resolver the dispatch calls */
  /* the door fetching the engine lazily is closure code inside js/atlas-console.js — a spelling */
  assert.match(read('js/atlas-console.js'), /IntMapLazy\.need\('atlasQuery'\)/, '…which fetches the engine');
  /* (#R798) one registry entry holds what it publishes, how to fetch it and how to mount it */
  const e = LAZY_REGISTRY.atlasQuery;
  assert.ok(e && e.publishes === 'IntMapQuery', 'the lazy registry knows what it publishes');
  assert.match(read('js/lazy-modules.js'), /atlasQuery: \{[^\n]*import\('\.\/atlas-query\.js'\)/, '…and how to fetch it');
  assert.ok(typeof e.mount === 'function' && /window\.IntMapQuery=window\.IntMapModules\.atlasQuery\(IM_HOST\)/.test(String(e.mount)), '…and how to mount it');
  /* ⚠ MEMBERSHIP, NOT POSITION. This read /'atlasQuery'\]/ — true only because atlasQuery
     happened to be the LAST entry the day it was written, so #R527 broke it merely by appending a
     new lazy factory after it. The property this line exists for is that «the one list of every
     factory the program has» knows about atlasQuery; that is what it asserts now. */
  assert.ok(LAZY_NAMES.includes('atlasQuery'), 'the one list of every factory the program has (js/lazy-modules.js LAZY_REGISTRY, #R798)');
});


test('R495 ③: the catalogue sends multi-condition questions HERE instead of to the essay writers', () => {
  /* kept as a spelling: the caps, the cost order and the borrowed fields are wiring inside js/atlas-query.js / js/gazetteer.js / js/precip-annual.js that only a network-backed run would exercise; the catalogue text is what the planner is shown */
  const cat = read('js/atlas-catalog-text.js');
  const i = cat.indexOf('CROSS-DATASET QUERY');
  const block = cat.slice(i, cat.indexOf("' },", i));
  /* the failure this round is about is not a missing dataset — it is Atlas reaching for prose. */
  assert.match(block, /INSTEAD OF "analyze"\/"mapReport"\/"researchMap"/, 'the redirection has to be explicit');
  assert.match(block, /Never answer a multi-condition question by explaining what would have to be checked/);
  /* ⚠ AND IT HAS TO POINT BOTH WAYS. A planner that reaches for `analyze` first never reads the
     query block, and #R115's rule is that the catalogue is what the planner acts on — so the three
     prose actions carry the reciprocal sentence. */
  assert.equal((cat.match(/NOT FOR A MULTI-CONDITION FILTER/g) || []).length, 3,
    'analyze, mapReport and researchMap must each say that a multi-condition filter is a query');
  for (const head of ['INTEGRATED ANALYSIS', 'RESEARCH MAPPED ONTO THE MAP', 'RESEARCH & SITUATION MAP']) {
    const j = cat.indexOf(head);
    assert.ok(j > 0 && cat.lastIndexOf('NOT FOR A MULTI-CONDITION FILTER', j) > cat.lastIndexOf("t: '", j) - 1,
      `the «${head}» block does not carry the pointer back to query`);
  }
  /* every table and every first-class column the engine registers must be nameable by the planner */
  const eng = read('js/atlas-query.js');
  for (const t of ['cities', 'countries', 'earthquakes', 'volcanoes', 'facilities']) {
    assert.ok(new RegExp('\\b' + t + '\\b').test(block), `the catalogue never mentions the table «${t}»`);
    assert.ok(new RegExp(t + ': \\{').test(eng), `js/atlas-query.js does not register «${t}»`);
  }
  for (const c of ['pop', 'precipMm', 'coastKm', 'seaKm', 'elevM', 'tempC']) {
    assert.ok(block.includes(c), `the catalogue never mentions the column «${c}» — an undocumented column does not exist for the planner (#R115)`);
  }
  /* the coastKm/seaKm choice changes answers, so the planner is told, not left to pick */
  assert.match(block, /Tehran/, 'the catalogue names the case where the two coast columns disagree');
});

/* ── ④ the honesty rules are in the code, not only in the header ────────────────────────────── */

test('R495 ④: every cap the engine applies is reported, and nothing in it asks a model for a number', () => {
  /* kept as a spelling: the caps, the cost order and the borrowed fields are wiring inside js/atlas-query.js / js/gazetteer.js / js/precip-annual.js that only a network-backed run would exercise; the catalogue text is what the planner is shown */
  const eng = read('js/atlas-query.js');
  for (const cap of ['SCAN_CAP', 'NET_CAP', 'JOIN_CAP', 'OUT_CAP', 'PIN_CAP']) {
    assert.ok(eng.includes(cap), `${cap} is gone — a cap that is not named cannot be reported`);
  }
  /* each of the caps that can silently shorten an ANSWER pushes a row into `caps`, which
     methodHtml prints. SCAN_CAP and BATCH bound work rather than the answer. */
  for (const cap of ['NET_CAP', 'PIN_CAP']) {
    assert.ok(new RegExp('caps\\.push\\(\\{[^}]*' + cap).test(eng.replace(/\n/g, ' ')),
      `${cap} can shorten an answer without saying so`);
  }
  /* OUT_CAP is the ceiling on the CALLER's own `limit`, so what a cut reports is that limit */
  assert.match(eng, /Math\.min\(OUT_CAP, \+\(spec && spec\.limit\)/, 'OUT_CAP bounds `limit`');
  assert.match(eng, /if \(rows\.length > lim\) \{ caps\.push\(/, '…and cutting to it is reported');
  assert.match(eng, /if \(jr\.capped\) caps\.push/, 'a truncated join is reported');
  assert.match(eng, /for \(const c of res\.caps\)/, 'and the reply prints them');
  /* rule ③ — no invented value */
  for (const bad of ['askAI', 'aiFacilities', 'openai', 'ai-proxy']) {
    assert.ok(!eng.includes(bad), `js/atlas-query.js reaches for «${bad}» — every figure here must come from a dataset`);
  }
  /* a 200 that carries an error payload is a failure (Open-Meteo's quota refusal, measured) */
  assert.match(eng, /j\.error === true/, 'an error payload served with HTTP 200 must not become a column of nulls');
  /* a condition that could not be applied is stated ABOVE the table */
  assert.match(eng, /const gap = res\.unapplied\.length/, 'the unapplied-condition banner');
  assert.match(eng, /unapplied\.push\(colName\(c\._col\)\)/, '…fed by the column that failed');
  assert.match(eng, /unapplied\.push\(tableName\(jt\)\)/, '…and by a join that could not run');
});

test('R495 ④: the planner really is cost-ordered — a network column is never asked about every row', () => {
  /* kept as a spelling: the caps, the cost order and the borrowed fields are wiring inside js/atlas-query.js / js/gazetteer.js / js/precip-annual.js that only a network-backed run would exercise; the catalogue text is what the planner is shown */
  const eng = read('js/atlas-query.js');
  assert.match(eng, /\.sort\(\(a, b\) => a\._col\.cost - b\._col\.cost\)/, 'conditions are ordered by cost');
  assert.match(eng, /if \(c\._col\.cost >= 2 && rows\.length > NET_CAP\)/, 'and a network column is bounded');
  /* the three cost tiers must all be IN USE — if every column became cost 0 the ordering would be a
     no-op and 147,924 rows would go to Open-Meteo one hundred at a time */
  assert.match(eng, /col\('pop',[^\n]*, 0, intrinsic\(/, 'pop is free');
  assert.match(eng, /col\('coastKm',[^\n]*, 1, \(rows\)/, 'coastKm is one shared fetch, then free');
  assert.match(eng, /col\('elevM', \['cities', 'facilities'\],[^\n]*, 2, \(rows\)/, 'elevM is per-row network');
});

/* ── ⑤ the two fields the engine borrows from modules that existed before it ────────────────── */

test('R495 ⑤: the gazetteer still hands over the country, and precip still exposes its value grid', () => {
  /* kept as a spelling: the caps, the cost order and the borrowed fields are wiring inside js/atlas-query.js / js/gazetteer.js / js/precip-annual.js that only a network-backed run would exercise; the catalogue text is what the planner is shown */
  const gz = read('js/gazetteer.js');
  assert.match(gz, /out\.push\(\[pop>=250000\?'city':'town', terms, lng, lat, en, ja\|\|en, pop, iso2[,\]]/,
    'the eighth field is the ISO-2 country — without it `cities` cannot join to `countries`');
  assert.match(gz, /const en=r\[0\], ja=r\[1\], iso2=r\[2\]\|\|''/, '…read from the source row it was always in');
  const pr = read('js/precip-annual.js');
  assert.match(pr, /warmValues: \(\) => ensureVals\(\)/,
    'js/atlas-query.js reads precipMm through this; without it the column is null unless the reader had the layer on');
  /* and the engine reads them by those exact names */
  const eng = read('js/atlas-query.js');
  assert.match(eng, /iso2: r\[7\] \|\| ''/);
  assert.match(eng, /P\.warmValues/);
});

test('R495 ⑤: the coastline artefact is reachable from the code that ships it', () => {
  /* kept as a spelling: the claim is that the artefact is named in source (so the asset report sees it) and rebuildable — facts about files */
  assert.ok(existsSync(join(ROOT, 'data/coastline.json.gz')));
  assert.match(read('js/coastline.js'), /'data\/coastline\.json\.gz'/, 'named in source, so scripts/asset-report.mjs can see it is used');
  assert.match(read('js/atlas-query.js'), /import \{ makeCoastline \} from '\.\/coastline\.js'/, 'and imported by name (tests/r175 ③)');
  /* the builder can re-derive it — the file is not hand-made */
  assert.match(read('scripts/build-coastline.mjs'), /ne_10m_coastline\.geojson/);
  assert.match(read('scripts/build-coastline.mjs'), /--check/);
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R497 (formerly tests/r497-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  R497 — THE VOLCANO TABLE WAS COUNTING ROWS IT COULD NOT NAME
 * ----------------------------------------------------------------------------
 *  #R495 registered `volcanoes` as a table of the cross-dataset query engine and read its rows as
 *  `p.name` / `p.elev` / `p.type` / `p.last`. data/volcanoes_gvp.json uses ONE-LETTER keys — `n`,
 *  `c`, `t`, `e`, `y`, `v` — so every one of those was `undefined`. Measured on production the day
 *  it shipped: 「coastKm >= 300」 answered **127 volcanoes**, all of them with an empty name and a
 *  null elevation. The COUNT was right, which is exactly why nothing caught it.
 *
 *  ⚠ THE LESSON THIS FILE ENCODES: a table's shape passing is not the table working. #R495's own
 *  rule ② says a column may not appear without its source; a column that appears with its source
 *  and nothing IN it breaks the same rule from the inside. So these checks read VALUES out of the
 *  shipped file through the module's own accessor names, and refuse a row set that is merely
 *  the right length.
 * ==========================================================================*/
const GVP = JSON.parse(read('data/volcanoes_gvp.json'));

test('R497 ①: the shipped GVP file really does use one-letter keys', () => {
  const feats = GVP.features || [];
  assert.ok(feats.length > 1000, `${feats.length} volcanoes`);
  const p = feats[0].properties || {};
  for (const k of ['n', 'c', 't', 'e', 'y', 'v']) {
    assert.ok(k in p, `data/volcanoes_gvp.json no longer carries «${k}» — js/atlas-query.js reads it`);
  }
  /* and NOT the long ones the broken code guessed at */
  for (const k of ['name', 'elev', 'type', 'last']) {
    assert.ok(!(k in p), `«${k}» now exists too — decide which one js/atlas-query.js should read`);
  }
});
test('R497 ②: js/atlas-query.js reads the keys the file actually has', async () => {
  /* ⚠ (tests-by-topic) THE ENGINE IS RUN OVER THE SHIPPED FILE, NOT READ. This matched the text of
     `volcanoRows` for `name: p.n || ''` and forbade `p.name` & co. — a spelling a correct refactor
     (say, a destructuring) turns red. The defect was a table whose rows came back nameless and
     elevation-less; so the engine is asked for its volcano rows, with only the fetch of
     data/volcanoes_gvp.json served from disk. */
  const pick = () => { const f = (...a) => a[0]; f.arr = (a) => (Array.isArray(a) ? a[0] : String(a)); return f; };
  globalThis.window = { IntMapLang: { pick, pickArgs: () => ((...a) => a) }, IntMapModules: {},
    IntMapGazetteer: { warm: async () => [], worldMeta: () => ({ count: 0, placeKinds: null }) } };
  globalThis.document = { baseURI: 'http://localhost/' };
  await import('../js/atlas-query.js?r497-' + Math.random());
  const API = globalThis.window.IntMapModules.atlasQuery({ lang: 'en', addPin: () => null });
  API.bind({ countryStats: () => ({}), countryName: (s) => s.nameEn,
    loadData: async (p) => JSON.parse(read(p)) });   /* (data-one-door) the engine's injection point for data/ reads */
  const all = await API.run({ from: 'volcanoes', where: [{ col: 'elevM', op: '>=', value: -20000 }] });
  assert.ok(all.scanned > 1000, 'the volcanoes table is gone, or reads nothing: ' + all.scanned);
  assert.ok(all.matched / all.scanned > 0.95, 'the elevation comes from e: only ' + all.matched + ' of ' + all.scanned + ' rows have one');
  const jp = await API.run({ from: 'volcanoes', where: [{ col: 'country', op: '==', value: 'Japan' }], show: ['elevM', 'country'], limit: 200 });
  assert.ok(jp.matched > 50, 'the country comes from c: ' + jp.matched + ' Japanese volcanoes');
  assert.ok(jp.rows.every((r) => r.name && r.name.length > 1), 'the name comes from n — a row came back nameless');
  const fuji = jp.rows.find((r) => /^Fuji/i.test(r.name));
  assert.ok(fuji, 'Fuji is not in the engine’s answer');
  assert.equal(fuji.elevM, 3776, 'the elevation comes from e');
  assert.match(fuji.kind, /volcano/i, 'the type comes from t');
  assert.equal(fuji.country, 'Japan', 'the country comes from c');
  assert.match(String(fuji.id), /^\d+$/, 'the id is the GVP volcano number');
  assert.equal(new Set(jp.rows.map((r) => r.id)).size, jp.rows.length, 'and it identifies one row');
});

test('R497 ③: reading the real file that way produces NAMED rows with real numbers', () => {
  /* the same conversion the module performs, applied to the shipped data — a row set that is the
     right LENGTH and empty of content is what shipped, so length is not what this asserts */
  const rows = [];
  for (const f of (GVP.features || [])) {
    const c = f.geometry && f.geometry.coordinates; if (!c) continue;
    const p = f.properties || {};
    rows.push({ id: String(p.v != null ? p.v : (p.n || '')), name: p.n || '', lng: +c[0], lat: +c[1],
      country: p.c || '', elevM: (p.e == null || isNaN(+p.e)) ? null : +p.e, kind: p.t || '',
      lastEruption: p.y != null ? String(p.y) : '' });
  }
  assert.ok(rows.length > 1000);
  const named = rows.filter((r) => r.name.length > 1).length;
  const withElev = rows.filter((r) => r.elevM != null).length;
  const withCountry = rows.filter((r) => r.country.length > 1).length;
  assert.ok(named / rows.length > 0.99, `only ${named} of ${rows.length} volcanoes have a name`);
  assert.ok(withElev / rows.length > 0.95, `only ${withElev} of ${rows.length} have an elevation`);
  assert.ok(withCountry / rows.length > 0.95, `only ${withCountry} of ${rows.length} have a country`);
  /* every id is unique, or the join would collapse rows onto one another */
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'volcano ids are not unique');
  /* a known row, spelled out, so a silent reshuffle of the columns is visible */
  const fuji = rows.find((r) => /^Fuji/i.test(r.name));
  assert.ok(fuji, 'Fuji is not in the record');
  assert.equal(fuji.country, 'Japan');
  assert.ok(fuji.elevM > 3000 && fuji.elevM < 4000, `Fuji is ${fuji.elevM} m`);
  assert.ok(Math.abs(fuji.lng - 138.73) < 0.5 && Math.abs(fuji.lat - 35.36) < 0.5, 'Fuji is where Fuji is');
});

test('R497 ④: the two facts the row carries are reachable as columns, and documented', () => {
  /* kept as a spelling: the caps, the cost order and the borrowed fields are wiring inside js/atlas-query.js / js/gazetteer.js / js/precip-annual.js that only a network-backed run would exercise; the catalogue text is what the planner is shown */
  const eng = read('js/atlas-query.js');
  assert.match(eng, /col\('country', \['volcanoes'\]/, 'the volcano country is a column');
  assert.match(eng, /col\('lastEruptionYear', \['volcanoes'\]/, 'the last known eruption is a column');
  /* #R115's rule: a column the catalogue does not name does not exist for the planner */
  const cat = read('js/atlas-catalog-text.js');
  const block = cat.slice(cat.indexOf('CROSS-DATASET QUERY'), cat.indexOf("' },", cat.indexOf('CROSS-DATASET QUERY')));
  assert.match(block, /volcanoes \(Smithsonian GVP, offline\)[^·]*country/, 'the catalogue names the country column');
  assert.match(block, /lastEruptionYear/, 'the catalogue names the last-eruption column');
});

/* ══════════════════════════════════════════════════════════════════════════════════════════════
   #R620 (formerly tests/r620-checks.test.mjs)
   ══════════════════════════════════════════════════════════════════════════════════════════════ */
/* ============================================================================
 *  IntMap · R620 — THE CROSS-DATASET QUERY, AUDITED END TO END
 * ----------------------------------------------------------------------------
 *  Four defects were reported against one answer to 「人口100万人以上、年間降水量500mm未満、
 *  外洋の海岸線から200km以上の都市」, and a fifth was found while measuring them:
 *
 *   ① the same 34 rows were drawn TWICE, in two tables, one with coordinates and one without;
 *   ② the country code was printed twice per row — 「Wuzhong CN | CN」;
 *   ③ `Al Mawşil al Jadīdah` (a PPLX — «section of populated place») stood in the answer as a
 *      city of 2,065,597, while the real Mosul sits in the same GeoNames file as PPLA / 1,683,000;
 *   ④ 「UEruemqi」 — GeoNames' ASCII transliteration, printed as if it were the English name;
 *   ⑤ …and Tokyo, Cairo, Baghdad, Tehran, Moscow, Delhi, Mumbai and 71 other places over a million
 *      people were ABSENT from the `cities` table altogether.
 *
 *  ⚠ THESE CHECKS DRIVE THE SHIPPED MODULES. js/atlas-query.js is loaded and RUN — the only things
 *  stubbed are DATA (a row array standing in for the gazetteer) and the language picker, never a
 *  collaborator that decides anything. A fixture that made its own decisions could not tell whether
 *  the shipping code makes the right ones (#R552), and a check that reads the source for a spelling
 *  cannot tell whether the code was ever evaluated (#R505).
 * ==========================================================================*/
/* ── the query engine, loaded and run ───────────────────────────────────────────────────────── */
const ORIGINS = ['raw', 'sampled', 'computed', 'network', 'derived'];

/** A gazetteer row in the shape js/gazetteer.js `_rowsFrom` publishes.
 *  [type, terms, lng, lat, en, ja, pop, iso2, gid, fcode, disp, cur] */
const gzRow = (en, pop, iso2, gid, fcode, disp) =>
  ['city', [en], 10, 50, en, en, pop, iso2, gid, fcode, disp || '', 0];

async function engine(rows, placeKinds) {
  const pick = () => { const f = (...a) => a[0]; f.arr = (a) => (Array.isArray(a) ? a[0] : String(a)); return f; };
  globalThis.window = {
    IntMapLang: { pick, pickArgs: () => ((...a) => a) },
    IntMapModules: {},
    IntMapGazetteer: {
      warm: async () => rows,
      worldMeta: () => ({ count: rows.length, placeKinds: placeKinds === undefined ? KINDS : placeKinds }),
    },
  };
  globalThis.document = { baseURI: 'http://localhost/' };
  const mod = await import('../js/atlas-query.js?' + Math.random());
  void mod;
  const API = globalThis.window.IntMapModules.atlasQuery({ lang: 'en', addPin: () => null });
  /* the two country facts the engine asks its host for, and nothing else */
  API.bind({ countryStats: () => ({ CHN: { a2: 'CN', nameEn: 'China' }, IRQ: { a2: 'IQ', nameEn: 'Iraq' } }),
    countryName: (s) => s.nameEn });
  return API;
}

/* GeoNames' own verdicts, in the shape the build ships them (see scripts/build-gazetteer.mjs). */
const KINDS = {
  PPL: { kind: 'settlement', desc: 'populated place' },
  PPLA: { kind: 'settlement', desc: 'seat of a first-order administrative division' },
  PPLA2: { kind: 'settlement', desc: 'seat of a second-order administrative division' },
  PPLC: { kind: 'settlement', desc: 'capital of a political entity' },
  PPLX: { kind: 'part', desc: 'section of populated place' },
  PPLH: { kind: 'defunct', desc: 'historical populated place' },
  PPLQ: { kind: 'defunct', desc: 'abandoned populated place' },
  PPLW: { kind: 'defunct', desc: 'destroyed populated place' },
};

/* ══ ① A SECTION OF A CITY IS NOT A CITY ═══════════════════════════════════════════════════════ */
test('R620 ①: the cities table admits places and refuses parts of places and places that are gone', async () => {
  const API = await engine([
    gzRow('Mosul', 1683000, 'IQ', '99072', 'PPLA'),
    gzRow('Al Mawsil al Jadidah', 2065597, 'IQ', '99071', 'PPLX', 'Al Mawşil al Jadīdah'),
    gzRow('Kowloon', 2232339, 'HK', '1819609', 'PPLX'),
    gzRow('Wuzhong', 7202654, 'CN', '1790842', 'PPLA2'),
    gzRow('Gonebury', 3000000, 'CN', '9', 'PPLQ'),
    gzRow('Newcode', 4000000, 'CN', '10', 'PPLZZ'),   /* GeoNames has not classified this one */
  ]);
  const res = await API.run({ from: 'cities', where: [{ col: 'pop', op: '>=', value: 1000000 }] });
  const names = res.rows.map((r) => r.name);

  assert.ok(names.includes('Mosul'), 'the real Mosul must be in the answer');
  assert.ok(!names.includes('Al Mawşil al Jadīdah'), 'a PPLX is a section of a city, not a city');
  assert.ok(!names.includes('Kowloon'), 'the same rule, on a second measured case');
  assert.ok(!names.includes('Gonebury'), 'a place GeoNames records as abandoned is not a city');
  assert.ok(names.includes('Wuzhong'), 'an administrative seat IS a city');
  /* ⚠ THE DEFAULT FOR AN UNKNOWN CODE IS TO ADMIT. «GeoNames has not classified this yet» is not
     evidence that the place is a district, and a silent drop would remove real cities the day
     GeoNames adds a code. The build is what fails loudly when a code has no published description. */
  assert.ok(names.includes('Newcode'), 'an unclassified code is admitted, not silently dropped');

  /* the counts stop being one number the moment a row is refused */
  assert.equal(res.universe.loaded, 6, 'six records came out of the source list');
  assert.equal(res.universe.notACity, 3, 'two sections of a place and one abandoned place');
  assert.equal(res.universe.eligible, 3, 'Mosul, Wuzhong and the unclassified one');
  assert.equal(res.scanned, 3, 'evaluated counts the rows the conditions were actually asked about');
});

test('R620 ①b: with no verdicts shipped, nothing is refused — an older file degrades, it does not lie', async () => {
  const API = await engine([gzRow('Kowloon', 2232339, 'HK', '1819609', 'PPLX')], null);
  const res = await API.run({ from: 'cities', where: [{ col: 'pop', op: '>=', value: 1000000 }] });
  assert.equal(res.rows.length, 1, 'a v2 gazetteer carries no feature codes and no verdicts');
  assert.equal(res.universe.classified, false);
});

/* ══ ② THE DISPLAY NAME IS NOT THE MATCHING SURFACE ════════════════════════════════════════════ */
test('R620 ②: a row prints the name chosen for a reader, not GeoNames ASCII transliteration', async () => {
  const API = await engine([gzRow('UEruemqi', 3029372, 'CN', '1529102', 'PPLA', 'Ürümqi')]);
  const res = await API.run({ from: 'cities', where: [{ col: 'pop', op: '>=', value: 1000000 }] });
  assert.equal(res.rows[0].name, 'Ürümqi');
  assert.equal(res.rows[0].asciiName, 'UEruemqi', 'the transliteration is kept — it is a real matching surface');
  /* ⚠ the ID IS THE GEONAMES ID. `c17` meant «row 17 of whichever build is loaded», so the same
     city changed identity on every rebuild and again whenever the phone cut the list short. */
  assert.equal(res.rows[0].id, 'geonames:1529102');
  assert.equal(res.rows[0].geonameId, '1529102');

  /* …and the row says WHICH RECORD it is, so a population can be checked against its source.
     「Wuzhong 7,202,654」 is GeoNames' own figure for a prefecture seat, not IntMap arithmetic —
     the reader can only know that if the row names the record. */
  const out = await API.answer({ from: 'cities', show: ['pop'], where: [{ col: 'pop', op: '>=', value: 1000000 }] }, { pin: false });
  assert.match(out.html, /Record type[^"]*PPLA/, 'the feature code, with GeoNames own words for it');
  assert.match(out.html, /GeoNames ID: 1529102/);
  /* ⚠ AND THE TRANSLITERATION REACHES THE READER NOWHERE IN THE FRAGMENT — not as the label and
     not in a tooltip either. The first draft of `rowProvenance` included it and this file still
     passed, because it was asking about the CELL; tests/r620.spec.js ③ asks about the whole
     fragment and caught it. The two now agree, and this is the cheaper of the two to run. */
  assert.doesNotMatch(out.html, /UEruemqi/, 'the ASCII matching key is not something a reader is shown');
});

/* ══ ③ THE COUNTRY, ONCE ═══════════════════════════════════════════════════════════════════════ */
test('R620 ③: the country code is not printed twice, and the column shows a country', async () => {
  const API = await engine([gzRow('Wuzhong', 7202654, 'CN', '1790842', 'PPLA2')]);
  const withCountry = await API.answer({ from: 'cities', show: ['pop', 'country'],
    where: [{ col: 'pop', op: '>=', value: 1000000 }] }, { pin: false });
  assert.ok(withCountry.html.includes('China'), 'the country column names the country');
  assert.ok(!/Wuzhong<\/?span[^>]*>?\s*<span[^>]*>CN</.test(withCountry.html), 'no code glued to the name');
  assert.equal((withCountry.html.match(/>CN</g) || []).length, 0, 'the bare code is not printed at all when the column is shown');

  /* …and when the reader did NOT ask for the country, the code beside the name still does its job */
  const withoutCountry = await API.answer({ from: 'cities', show: ['pop'],
    where: [{ col: 'pop', op: '>=', value: 1000000 }] }, { pin: false });
  assert.ok(/>CN</.test(withoutCountry.html), 'with no country column the name still carries the code');
});

test('R620 ③b: the country column compares on the CODE, whatever it prints', async () => {
  const API = await engine([gzRow('Wuzhong', 7202654, 'CN', '1790842', 'PPLA2'), gzRow('Mosul', 1683000, 'IQ', '99072', 'PPLA')]);
  const res = await API.run({ from: 'cities', show: ['country'], where: [{ col: 'country', op: '==', value: 'CN' }] });
  assert.deepEqual(res.rows.map((r) => r.name), ['Wuzhong'],
    'a predicate on a localised label would break the moment the reader changed language');
});

/* ══ ④ ONE OPERATION, ONE TABLE ════════════════════════════════════════════════════════════════ */
test('R620 ④: the identity of a query is what it resolved, not which columns it printed', async () => {
  const API = await engine([gzRow('Wuzhong', 7202654, 'CN', '1790842', 'PPLA2')]);
  const q = (extra) => Object.assign({ from: 'cities', where: [{ col: 'pop', op: '>=', value: 1000000 }] }, extra);

  const a = await API.run(q({ show: ['pop'] }));
  const b = await API.run(q({ show: ['pop', 'lat', 'lng'] }));
  assert.ok(a.resultKey, 'the case must declare one — without it the turn falls back on the arguments');
  assert.equal(a.resultKey, b.resultKey, 'two drafts of one answer, differing only in what they show');

  /* an alias is not a different question … */
  const c = await API.run(q({ show: ['pop'], where: [{ col: 'pop', op: 'gte', value: 1000000 }] }));
  assert.equal(a.resultKey, c.resultKey, '`gte` and `>=` are the same condition');

  /* … but everything that changes WHICH ROWS COME BACK is */
  for (const [what, spec] of [
    ['a different threshold', q({ where: [{ col: 'pop', op: '>=', value: 2000000 }] })],
    ['a different table', { from: 'countries' }],
    ['a country scope', q({ in: ['CN'] })],
    ['a row limit', q({ limit: 5 })],
    ['an ordering', q({ order: { col: 'pop', dir: 'asc' } })],
  ]) {
    const r = await API.run(spec);
    assert.notEqual(a.resultKey, r.resultKey, what + ' is a different question');
  }

  /* ⚠⚠ AND THE FIELDS THAT ARE NOT IN THE SCHEMA COUNT TOO. `quakeRows` reads `sinceDays`,
     `minMagnitude` and `bbox` straight off the spec and `facilityRows` reads `kind`; none of them
     appear in js/atlas-schemas.js's property list for data.query. A key built from a remembered
     list of fields would have merged two earthquake questions a month apart in their window. */
  const q1 = await API.run({ from: 'cities', sinceDays: 30, where: [{ col: 'pop', op: '>=', value: 1000000 }] });
  const q2 = await API.run({ from: 'cities', sinceDays: 365, where: [{ col: 'pop', op: '>=', value: 1000000 }] });
  assert.notEqual(q1.resultKey, q2.resultKey, 'a field the schema never declared still decides the rows');

  /* …and the clamp is respected: two limits that resolve to the same rows are one answer. */
  const c1 = await API.run(q({ limit: 1000 }));
  const c2 = await API.run(q({ limit: 200 }));
  assert.equal(c1.resultKey, c2.resultKey, 'both clamp to OUT_CAP, so both resolved the same rows');
});

test('R620 ④b: the turn keeps ONE block for two runs that resolved the same rows', () => {
  const TR = makeAtlasTurnResults();
  const key = 'data.query:cities|pop>=1000000|null|[]|null|50';
  const act = (show) => ({ type: 'query', from: 'cities', show });
  const kept = TR.keep([
    { act: act(['pop']), ok: true, html: '<table>first</table>', meta: { resultKey: key, status: 'completed' } },
    { act: act(['pop', 'lat', 'lng']), ok: true, html: '<table>second</table>', meta: { resultKey: key, status: 'completed' } },
  ]);
  assert.equal(kept.length, 1, 'this is the reported defect: the reader saw both');
  assert.ok(kept[0].html.includes('second'), 'the later run is the one the app is holding');

  /* ⚠ AND THE GUARD MUST NOT OVER-COLLAPSE. Two genuinely different questions stay two answers. */
  const two = TR.keep([
    { act: act(['pop']), ok: true, html: '<table>cn</table>', meta: { resultKey: key + ':CN', status: 'completed' } },
    { act: act(['pop']), ok: true, html: '<table>iq</table>', meta: { resultKey: key + ':IQ', status: 'completed' } },
  ]);
  assert.equal(two.length, 2);
});

test('R620 ④c: the shipped dispatch actually hands the key to the turn', () => {
  /* kept as a spelling: the caps, the cost order and the borrowed fields are wiring inside js/atlas-query.js / js/gazetteer.js / js/precip-annual.js that only a network-backed run would exercise; the catalogue text is what the planner is shown */
  /* ⚠ MEASURED ON THE WIRING THAT SHIPS, not on a copy of it (#R552): a key the engine builds and
     the door drops is a key nothing has. */
  const src = read('js/atlas-console.js');
  const tree = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module', ranges: true });
  let seen = null;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'SwitchCase' && n.test && n.test.type === 'Literal' && n.test.value === 'query') {   /* (atlas-one-declaration) the one label; `dataQuery` reaches it through the registry */
      seen = src.slice(n.range[0], n.range[1]);
    }
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(tree);
  assert.ok(seen, 'the data.query dispatch case must still be reachable in the parse tree');
  assert.match(seen, /resultKey/, 'the door reads the key the engine declared');
  assert.match(seen, /meta\s*[:=]\s*\{\s*resultKey/, 'and passes it as meta, which is where opKey looks');
});

/* ══ ⑤ EVERY COLUMN SAYS HOW ITS NUMBER WAS OBTAINED ═══════════════════════════════════════════ */
test('R620 ⑤: every column the planner may name declares a source AND an origin', async () => {
  const API = await engine([]);
  const cat = API.catalogue();
  let n = 0;
  for (const t of cat.tables) {
    for (const id of cat.columns[t]) {
      const c = API.columnFor(t, id);
      assert.ok(c, t + '.' + id + ' is advertised to the planner but does not resolve');
      assert.ok(ORIGINS.includes(c.origin), t + '.' + id + ' has origin=' + c.origin);
      n++;
    }
  }
  assert.ok(n >= 40, 'the whole registry was walked, not a corner of it — saw ' + n);

  /* the three the reported answer used, each a genuinely different kind of number */
  assert.equal(API.columnFor('cities', 'pop').origin, 'raw');
  assert.equal(API.columnFor('cities', 'precipMm').origin, 'sampled');
  assert.equal(API.columnFor('cities', 'coastKm').origin, 'computed');
  assert.equal(API.columnFor('cities', 'elevM').origin, 'network');
  /* ⚠ NOT DERIVABLE FROM `cost`: precipMm and coastKm are both cost 1 and are not the same thing. */
  assert.equal(API.columnFor('cities', 'precipMm').cost, API.columnFor('cities', 'coastKm').cost);
});

test('R620 ⑤b: the method block prints the chain of counts and how each number was obtained', async () => {
  const API = await engine([
    gzRow('Wuzhong', 7202654, 'CN', '1790842', 'PPLA2'),
    gzRow('Kowloon', 2232339, 'HK', '1819609', 'PPLX'),
  ]);
  const out = await API.answer({ from: 'cities', show: ['pop'], where: [{ col: 'pop', op: '>=', value: 1000000 }] }, { pin: false });
  const h = out.html;
  assert.match(h, /source records/, 'how many records the source holds');
  assert.match(h, /are a place in its own right/, 'how many of them are a place');
  assert.match(h, /evaluated/, 'how many the conditions were asked about');
  assert.match(h, /match/, 'how many survived');
  assert.match(h, /a field of the source record, copied/, 'population is read, not measured');
  assert.match(h, /section of another place/, 'and the reader is told what was refused, and why');
});

/* ══ ⑥ WHAT THE BUILD MUST KEEP SHIPPING ═══════════════════════════════════════════════════════ */
test('R620 ⑥: the world gazetteer carries GeoNames identity, feature code and a display name', () => {
  const p = join(ROOT, 'data', 'gazetteer-world.json.gz');
  assert.ok(existsSync(p), 'data/gazetteer-world.json.gz');
  const doc = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));

  assert.deepEqual(doc.fields.slice(0, 7), ['en', 'ja', 'iso2', 'lng', 'lat', 'pop', 'alt'],
    'the first seven positions are a contract with six consumers and eight tests — append only');
  for (const f of ['gid', 'fcode', 'disp', 'cur']) assert.ok(doc.fields.includes(f), 'fields must carry ' + f);

  const iGid = doc.fields.indexOf('gid'), iFc = doc.fields.indexOf('fcode'), iCur = doc.fields.indexOf('cur');
  const ids = new Set();
  for (const r of doc.rows) {
    assert.match(String(r[iGid]), /^\d+$/, 'every row keeps its GeoNames id');
    assert.ok(!ids.has(r[iGid]), 'a GeoNames id identifies one row: ' + r[iGid]);
    ids.add(r[iGid]);
    assert.ok(r[iFc], 'every row keeps its feature code');
    assert.ok(r[iCur] === 0 || r[iCur] === 1, 'the curated flag is a flag');
  }

  /* ⚠ THE VERDICTS COME FROM GEONAMES' OWN SENTENCES, and this is where that is checked. The build
     classifies by description; if GeoNames rewords one, the derivation must still land here. */
  assert.ok(doc.placeKinds, 'the build must ship the classification the browser cannot compute');
  assert.equal(doc.placeKinds.PPLX.kind, 'part', 'section of populated place');
  for (const code of ['PPLH', 'PPLQ', 'PPLW', 'PPLCH']) {
    if (doc.placeKinds[code]) assert.equal(doc.placeKinds[code].kind, 'defunct', code + ' is gone');
  }
  for (const code of ['PPL', 'PPLA', 'PPLA2', 'PPLC']) {
    assert.equal(doc.placeKinds[code].kind, 'settlement', code + ' is a place');
  }
  for (const code in doc.placeKinds) assert.ok(doc.placeKinds[code].desc, code + ' must carry the published description it was classified by');
});

test('R620 ⑥b: the reported rows, in the shipped file', () => {
  const doc = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString('utf8'));
  const iGid = doc.fields.indexOf('gid'), iFc = doc.fields.indexOf('fcode'), iDisp = doc.fields.indexOf('disp');
  const byGid = new Map(doc.rows.map((r) => [String(r[iGid]), r]));

  const mawsil = byGid.get('99071');
  assert.ok(mawsil, 'Al Mawşil al Jadīdah is still in the file — it is a real name in the news');
  assert.equal(mawsil[iFc], 'PPLX', 'and it is still a section of a place, which is why queries refuse it');
  assert.ok(byGid.get('99072'), 'the real Mosul is in the file');
  assert.equal(byGid.get('99072')[iFc], 'PPLA');

  const urumqi = byGid.get('1529102');
  assert.ok(urumqi, 'Ürümqi');
  const shown = urumqi[iDisp] || urumqi[0];
  assert.notEqual(shown, 'UEruemqi', 'the transliteration must not be what a reader is shown');

  /* ⑤ — the hole nothing had noticed: the most important cities on Earth were not in this list */
  const named = new Set(doc.rows.map((r) => String(r[iDisp] || r[0])));
  for (const city of ['Tokyo', 'Cairo', 'Baghdad', 'Moscow', 'Mumbai', 'Delhi', 'Paris', 'Mosul']) {
    assert.ok(named.has(city), city + ' must be in the place list the query engine reads');
  }
});

test('R620 ⑥d: the phone gets the verdicts as well as the codes', () => {
  /* ⚠⚠ A SLICE THAT CARRIED THE FEATURE CODES AND NOT THE CLASSIFICATION would put districts back
     into the answer ON PHONES ONLY, from the same build, with nothing in either file saying so —
     the reader on the small screen gets Kowloon as a city and the reader on the large one does not.
     `placeKinds` is a header field, so it has to be copied like the other header fields. */
  const world = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString('utf8'));
  const phone = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-phone.json.gz'))).toString('utf8'));
  assert.deepEqual(phone.fields, world.fields, 'the two artefacts must be one build');
  assert.deepEqual(phone.placeKinds, world.placeKinds,
    'the phone reads the same verdicts, so `cities` means the same thing on both');
  const iFc = phone.fields.indexOf('fcode');
  const unknown = phone.rows.filter((r) => !phone.placeKinds[r[iFc]]).length;
  assert.equal(unknown, 0, 'every code in the shipped phone rows is classified in its own header');
});

test('R620 ⑥c: js/ does not carry a hand-written list of GeoNames feature codes', () => {
  /* ⚠ THE POINT OF READING featureCodes_en.txt IS THAT NOBODY HAS TO KEEP A LIST. A spelling here
     would be the thing this round removed, growing back one code at a time. */
  const src = read('js/atlas-query.js');
  const hits = src.match(/['"]PPL[A-Z0-9]*['"]/g) || [];
  assert.deepEqual(hits, [], 'feature codes belong to GeoNames and to the shipped verdicts, not to this file');
});

