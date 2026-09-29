/* ============================================================================
 *  Place labels, river highlighting and the gazetteer
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r187-checks.test.mjs, tests/r217-checks.test.mjs, tests/r212-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r187-checks.test.mjs — 1 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/place-labels.js は MapLibre のスタイル式を組むファクトリで node では組み立てられない */
/* (#R187) the round's header note is kept with its largest block, in tests/layer-globe-rendering-checks.test.mjs */

/* ── 3. POI labels are ranked by what kind of place it is ────────────────────────────────────── */
test('R187 POI: the zoom window is on `class`, not on the tile sequence number', () => {
  const src = read('js/place-labels.js');
  assert.match(src, /const POI_TIER=\['match',\['get','class'\]/, 'the tier must be decided by class');
  /* MEASURED (central Tokyo, z16): the old `rank ≤ 40` window admitted 2,769 of 12,134 POIs, led by
     723 shops and 372 bus stops, and what survived collision was 24 bus stops and 14 shops. The
     landmark classes must be in the FIRST tier and the street furniture must not be. */
  const t1 = /\['hospital','university','college','school','railway',[\s\S]*?\],1,/.exec(src);
  assert.ok(t1, 'tier 1 must exist');
  for (const c of ['hospital', 'university', 'museum', 'park', 'police', 'railway', 'theatre'])
    assert.ok(t1[0].includes(`'${c}'`), `${c} belongs in the first tier`);
  for (const c of ['bus', 'entrance', 'bollard', 'waste_basket'])
    assert.ok(!t1[0].includes(`'${c}'`), `${c} must not be in the first tier`);
  /* the same expression drives collision, so a crowded corner keeps the landmark */
  assert.match(src, /'symbol-sort-key':\['\+',\['\*',POI_TIER,1000\]/, 'the tier must also sort the collision test');
  assert.match(src, /filter:POI_FILTER/, 'the dot and the label must share one filter');
});
}

/* ══════════ from tests/r217-checks.test.mjs — 14 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: js/map-ui.js と js/gazetteer.js の配線は DOM に閉じていて node では組み立てられない（川の判定は js/river-course.js を実行している） */
/* ============================================================================
 *  R217 — the browser-free guards for this round.
 *
 *  Four subjects, and the first one is the round's actual defect: which tile segments a river-name
 *  click lights up. That decision is pure (js/river-course.js takes property bags and returns
 *  property bags), so it is EXERCISED here rather than pattern-matched — the tag bags below are real
 *  OpenStreetMap tagging for the rivers they name.
 *
 *  ⚠ WHY THE NETWORK HALF IS NOT EXERCISED HERE. `course()` talks to Nominatim and Overpass. The
 *  environment this round was developed in blocks every host except the app's own origin, so no
 *  assertion about a live answer could have been honest; what is checked is the shape of the request
 *  path (which sources, in which order, and that a candidate is rejected unless it passes the click).
 * ==========================================================================*/
const rd = read;

/* one loaded copy of the matcher — the file publishes on `window` and touches nothing else */
let RC = null;
function riverCourse() {
  if (RC) return RC;
  const w = {};
  new Function('window', rd('js/river-course.js'))(w);
  RC = w.IntMapRiverCourse;
  assert.ok(RC && typeof RC.sameRiver === 'function', 'js/river-course.js published its matcher');
  return RC;
}

/* Real tagging. The Danube is one river whose ways are renamed at every border; every one of them
   also carries name:en=Danube, which is the link the old single-field comparison never looked at. */
const DANUBE = [
  { at: 'AT', properties: { class: 'river', name: 'Donau', 'name:en': 'Danube', 'name:de': 'Donau', 'name:hu': 'Duna', 'name:latin': 'Donau' } },
  { at: 'HU', properties: { class: 'river', name: 'Duna', 'name:en': 'Danube', 'name:hu': 'Duna' } },
  { at: 'RS', properties: { class: 'river', name: 'Dunav', 'name:sr': 'Дунав', 'name:latin': 'Dunav', 'name:hu': 'Duna' } },
  /* the Serbian Cyrillic way, whose ONLY link to the rest is the transliteration */
  { at: 'RS2', properties: { class: 'river', name: 'Дунав', 'name:latin': 'Dunav' } },
  /* a tile segment that carries no `name` at all — the asymmetric-fallback case */
  { at: 'RO', properties: { class: 'river', 'name:en': 'Danube' } },
];
const DECOYS = [
  { at: 'x1', properties: { class: 'stream', name: 'Donau' } },              /* a brook of the same name */
  { at: 'x2', properties: { class: 'ditch', name: 'Duna' } },
  { at: 'x3', properties: { class: 'river', name: 'Rhein', 'name:en': 'Rhine' } },
];
const withGeom = (r, i) => ({ ...r, geometry: { type: 'LineString', coordinates: [[i, 40], [i + 1, 40]] } });

/* ═══ ① THE ANSWER DOES NOT DEPEND ON WHERE YOU CLICKED ════════════════════════════════════════ */

test('R217 ①a: every segment of the Danube is selected from ANY of its segments', () => {
  const R = riverCourse();
  const feats = [...DANUBE, ...DECOYS].map(withGeom);
  const names = (list) => list.map((f) => f.at).sort().join(',');
  const all = names(DANUBE.map((r, i) => ({ at: r.at })));
  for (const seed of DANUBE) {
    const got = R.sameRiver(seed.properties, feats);
    assert.equal(names(got), all,
      `clicking the ${seed.at} segment must light the whole river, not just the segments that share `
      + `its \`name\` — got ${names(got)}`);
  }
});

test('R217 ①b: …which is precisely what the pre-#R217 comparison could not do', () => {
  /* the old rule, restated, so the test carries the defect it is guarding against */
  const oldName = (p) => p.name || p['name:en'] || p.name_en || '';
  const want = oldName(DANUBE[0].properties);                     /* clicked in Austria → "Donau" */
  const lit = DANUBE.filter((r) => oldName(r.properties) === want);
  assert.equal(lit.length, 1, 'the single-name rule lit exactly one of the five Danube segments');
});

test('R217 ①c: a brook or a ditch that shares the name is not part of the river', () => {
  const R = riverCourse();
  const feats = [...DANUBE, ...DECOYS].map(withGeom);
  const got = R.sameRiver(DANUBE[0].properties, feats).map((f) => f.at);
  for (const d of DECOYS) assert.ok(!got.includes(d.at), `${d.at} (class ${d.properties.class}) must not join the river`);
});

test('R217 ①d: a feature with no class at all is still a candidate (Natural Earth low zooms)', () => {
  const R = riverCourse();
  const ne = { at: 'ne', properties: { name: 'Danube' }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } };
  const got = R.sameRiver(DANUBE[0].properties, [...DANUBE.map(withGeom), ne]).map((f) => f.at);
  assert.ok(got.includes('ne'), 'the low-zoom waterways carry no `class`; excluding them would blank the highlight when zoomed out');
});

test('R217 ①e: names are what agree — not styling fields, not historical ones', () => {
  const R = riverCourse();
  const s = R.nameSet({ name: 'Donau', 'name:en': 'Danube', name_rank: '3', old_name: 'Ister', loc_name: 'Der Strom', ele: '150' });
  assert.deepEqual([...s].sort(), ['danube', 'donau'],
    '`name:rank` is a label-styling number, and an old/colloquial name is exactly the string two '
    + 'unrelated waterways can share');
});

test('R217 ①f: the caller\'s cap is honoured (the frame budget #R210 set)', () => {
  const R = riverCourse();
  const many = Array.from({ length: 50 }, (_, i) => withGeom({ at: 'd' + i, properties: { class: 'river', name: 'Donau' } }, i));
  assert.equal(R.sameRiver({ name: 'Donau' }, many, { limit: 7 }).length, 7);
});

/* ═══ ② A FETCHED COURSE IS ONLY THIS RIVER IF IT PASSES THE CLICK ═════════════════════════════ */

test('R217 ②a: nearestKm measures a click against a real course', () => {
  const R = riverCourse();
  /* a fragment of the Danube through Vienna, and a click on the north bank */
  const geo = { type: 'LineString', coordinates: [[16.36, 48.23], [16.45, 48.20], [16.55, 48.15]] };
  assert.ok(R.nearestKm(geo, 16.40, 48.22) < 3, 'a click on the river is within a few km of it');
  assert.ok(R.nearestKm(geo, 8.68, 50.11) > R.NEAR_KM, 'Frankfurt is not on the Danube');
});

test('R217 ②b: the resolver asks the two sources this app already declares, in Atlas\'s order', () => {
  const src = rd('js/river-course.js');
  assert.match(src, /nominatim\.openstreetmap\.org\/search/, 'Nominatim first — one GET for the whole named river');
  /* Overpass is reached through the one client (js/overpass.js owns the endpoints) */
  assert.match(src, /window\.IntMapOverpass\(/, 'Overpass as the fallback');
  assert.ok(src.indexOf('_nominatim(') < src.indexOf('_overpass('), 'Nominatim is tried before Overpass');
  /* ⚠ (#R218) INTENDED REPLACEMENT: every Nominatim answer that runs past the river is now KEPT and
     unioned, because a river renamed at each border is several OSM objects and taking the first one
     is taking one country's stretch. Overpass is still the fallback, still only reached when
     Nominatim gave nothing at all. */
  assert.match(src, /if\(hit\)\{ found\.push\(hit\.geo\);/, 'a Nominatim answer is discarded');
  assert.match(src, /if\(found\.length\) return \{ geo:_union\(found\)/, 'the answers are not unioned');
  assert.match(src, /return await _overpass\(names,lngLat\.lng,lngLat\.lat,opts\.bbox\);/, 'Overpass is not the fallback');
});

/* ═══ ③ THE WIRING — the click hands over the whole property bag, and the tiles are never lost ═══ */

test('R217 ③a: js/map-ui.js no longer compares one name, and both click paths pass properties', () => {
  const ui = rd('js/map-ui.js');
  assert.ok(!ui.includes("const n=p.name||p['name:en']||p.name_en||'';"),
    'the single-name equality that made the answer depend on the click point is gone');
  assert.match(ui, /function highlightRiver\(props,lngLat\)\{/, 'highlightRiver takes the property bag');
  assert.match(ui, /RC\.sameRiver\(props,raw,\{limit:4000\}\)/, 'selection goes through js/river-course.js');
  assert.match(ui, /if\(f\.layer&&f\.layer\.id==='ofm-river'\) highlightRiver\(p,e\.lngLat\);/, 'the per-layer click passes properties');
  assert.match(ui, /if\(lid==='ofm-river'\) highlightRiver\(p,e\.lngLat\);/, 'the padded tap passes properties');
});

test('R217 ③b: the tile highlight is drawn BEFORE the fetch and is never replaced by less', () => {
  const ui = rd('js/map-ui.js');
  const draw = ui.indexOf("GE().layers.setSourceData('river-hl-src',{type:'FeatureCollection',features:tile});");
  const fetchAt = ui.indexOf('RC.course(props,lngLat,');   /* (#R218) …now with the closure's context */
  assert.ok(draw > 0 && fetchAt > draw, 'the tiles are painted first, then the network is asked');
  assert.match(ui, /features:covers\?full:full\.concat\(tile\)/,
    'a fetched course that does not cover the tile segments is unioned with them, never substituted for them');
  assert.match(ui, /seq!==_riverSeq/, 'a late answer for a river the user has left is dropped');
});

/* ═══ ④ THE PHONE'S GAZETTEER IS THE HEAD OF THE SAME FILE ═════════════════════════════════════ */

const CAP = (() => {
  const m = /const\s+MOBILE_CAP\s*=\s*(\d+)/.exec(rd('js/gazetteer.js'));
  assert.ok(m, 'js/gazetteer.js declares MOBILE_CAP');
  return Number(m[1]);
})();

test('R217 ④a: data/gazetteer-phone.json.gz exists and holds exactly the phone\'s cap', () => {
  assert.ok(existsSync(join(ROOT, 'data', 'gazetteer-phone.json.gz')),
    'the phone artefact is committed — a phone that 404s here would silently lose the world gazetteer');
  const doc = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-phone.json.gz'))).toString('utf8'));
  assert.equal(doc.rows.length, CAP, `the phone file must carry MOBILE_CAP (${CAP}) rows`);
});

test('R217 ④b: it is a PREFIX of the world file — same rows, same names, same source', () => {
  const phone = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-phone.json.gz'))).toString('utf8'));
  const world = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString('utf8'));
  assert.equal(phone.attribution, world.attribution, 'the licence and credit travel with the rows');
  assert.deepEqual(phone.langs, world.langs);
  assert.deepEqual(phone.fields, world.fields);
  assert.equal(phone.v, world.v);
  assert.deepEqual(phone.rows, world.rows.slice(0, phone.rows.length),
    'the phone rows are the world rows, unmodified — this is a slice, not a second dataset');
});

test('R217 ④c: …and the phone REALLY asks for it', () => {
  const g = rd('js/gazetteer.js');
  assert.match(g, /const PHONE_FILE='data\/gazetteer-phone\.json\.gz';/);
  assert.match(g, /_isMobile\(\)\?PHONE_FILE:WORLD_FILE/, 'the URL is chosen by the same UA test that owns MOBILE_CAP');
  assert.match(g, /cap=_isMobile\(\)\?MOBILE_CAP:Infinity;/,
    'the client-side cap STAYS — it is what keeps a phone correct if it is handed the full file anyway');
});

test('R217 ④d: a rebuild of the world file rebuilds the phone file', () => {
  const b = rd('scripts/build-gazetteer.mjs');
  assert.match(b, /import \{ buildPhoneGazetteer \} from '\.\/build-gazetteer-phone\.mjs';/);
  assert.match(b, /const p = buildPhoneGazetteer\(\);/,
    'two artefacts from one build, so they cannot come from different runs of it');
});
}

/* ══════════ from tests/r212-checks.test.mjs — 1 of its 15 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 上流のデータ契約の綴り（theatre・harbour・cancelled）そのものが検査対象 */
/* (#R212) the round's header note is kept with its largest block, in tests/layer-world-packs-checks.test.mjs */

/* ── 15. the spelling landmines are still intact (#R210 §10, #R211 §7) ─────────────────────────── */
test('R212 ⑮: the four data contracts that look like British spellings are untouched', () => {
  assert.match(read('js/place-labels.js'), /'theatre'/, "OpenMapTiles' class value");
  /* (#R224) the ocean-current row that carried this property moved out of js/data-layers.js when the
     two layers became one; the spelling landmine it guards is the SAME one, in the file that kept it. */
  assert.match(read('js/ocean-currents.js'), /colour|'col'/, 'the ocean-currents property name');
  assert.match(read('js/atlas-sources.js'), /landuse"="harbour/, 'the OSM tag value in the Overpass query');
  assert.match(read('js/routing.js'), /'cancelled'/, "js/routing.js's internal status");
});
}
