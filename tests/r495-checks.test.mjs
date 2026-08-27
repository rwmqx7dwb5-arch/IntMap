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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DOC = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/coastline.json.gz'))).toString('utf8'));

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

test('R495 ③: data.query is a capability, a schema, a catalogue block, a dispatch case and a lazy module', () => {
  const caps = read('js/atlas-capabilities.js');
  assert.match(caps, /\['data\.query',\s*'query',\s*'crossQuery,dataQuery'/, 'the capability row');
  assert.match(caps, /'data\.query'[^\n]*'queryRows'/, "…observed by the observer that knows an empty result is an answer");
  assert.match(caps, /queryRows: \{/, 'the observer itself');
  assert.match(read('js/atlas-schemas.js'), /'data\.query':\s*\{[^\n]*required: \['from'\]/, 'the argument schema');
  const cat = read('js/atlas-catalog-text.js');
  assert.match(cat, /ids: \['data\.query'\]/, 'the catalogue block the planner is shown');
  assert.match(cat, /CROSS-DATASET QUERY/, '…and it says what it is');
  const atlas = read('js/atlas-console.js');
  assert.match(atlas, /case 'query': case 'crossQuery': case 'dataQuery':/, 'the dispatch door');
  assert.match(atlas, /IntMapLazy\.need\('atlasQuery'\)/, '…which fetches the engine');
  const lazy = read('js/lazy-modules.js');
  assert.match(lazy, /atlasQuery: 'IntMapQuery'/, 'the lazy registry knows what it publishes');
  assert.match(lazy, /case 'atlasQuery': return import\('\.\/atlas-query\.js'\);/, '…and how to fetch it');
  assert.match(lazy, /case 'atlasQuery': window\.IntMapQuery=window\.IntMapModules\.atlasQuery\(IM_HOST\); return true;/, '…and how to mount it');
  assert.match(read('src/main.js'), /'atlasQuery'\]/, 'the one list of every factory the program has');
});

test('R495 ③: the catalogue sends multi-condition questions HERE instead of to the essay writers', () => {
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
  const gz = read('js/gazetteer.js');
  assert.match(gz, /out\.push\(\[pop>=250000\?'city':'town', terms, lng, lat, en, ja\|\|en, pop, iso2\]\)/,
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
  assert.ok(existsSync(join(ROOT, 'data/coastline.json.gz')));
  assert.match(read('js/coastline.js'), /'data\/coastline\.json\.gz'/, 'named in source, so scripts/asset-report.mjs can see it is used');
  assert.match(read('js/atlas-query.js'), /import \{ makeCoastline \} from '\.\/coastline\.js'/, 'and imported by name (tests/r175 ③)');
  /* the builder can re-derive it — the file is not hand-made */
  assert.match(read('scripts/build-coastline.mjs'), /ne_10m_coastline\.geojson/);
  assert.match(read('scripts/build-coastline.mjs'), /--check/);
});
