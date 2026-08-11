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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

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
  assert.match(src, /overpass-api\.de\/api\/interpreter/, 'Overpass as the fallback');
  assert.ok(src.indexOf('_nominatim(') < src.indexOf('_overpass('), 'Nominatim is tried before Overpass');
  assert.match(src, /if\(hit\)\s*return hit;/, 'the first source that answers wins');
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
  const fetchAt = ui.indexOf('RC.course(props,lngLat)');
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

/* ═══ ⑤ THE KÖPPEN IMAGE IS NOT KEPT WHERE ITS EXTRA PIXELS CANNOT BE USED ═════════════════════ */

test('R217 ⑤a: the decoded source image is released once the work canvas covers the cap', () => {
  const d = rd('js/data-layers.js');
  assert.match(d, /if\(_koppenFullCap\(\)<=c\.width&&_koppenFullCap\(\)<=c\.height\)\{ window\._koppenImg=null; try\{ im\.src=''; \}catch\(_\)\{ \} \}/,
    'a phone caps the full-res highlight at 2048 and the work canvas IS 2048, so the 67 MB bitmap is unreachable');
  assert.match(d, /else window\._koppenImg=im;/, 'where the cap is higher than the work canvas (desktop) it is kept');
});

test('R217 ⑤b: …and the highlight then rasterises from the work canvas instead', () => {
  const d = rd('js/data-layers.js');
  assert.match(d, /const im=window\._koppenImg\|\|window\._koppenCanvas; if\(!im\) return null;/,
    'ensureKoppenFull must not return null just because the image was released');
});

test('R217 ⑤c: the phone cap and the work-canvas cap are still the same number', () => {
  const d = rd('js/data-layers.js');
  const work = /const KWORK_CAP=(\d+);/.exec(d);
  const mob = /if\(typeof isMobile==='function'&&isMobile\(\)\) return (\d+);/.exec(d);
  assert.ok(work && mob, 'both caps are declared where this test can read them');
  assert.equal(Number(mob[1]), Number(work[1]),
    'releasing the image is only lossless while the phone\'s highlight cap equals the work canvas — '
    + 'if one of these moves, the other has to move with it or the claim in ⑤a stops being true');
});

/* ═══ ⑥ THE TWO UI PLACEMENTS THIS ROUND WAS ALSO ASKED FOR ════════════════════════════════════ */

test('R217 ⑥a: Objects sits to the LEFT of Measure, not between Measure and Share', () => {
  const h = rd('index.html');
  const objects = h.indexOf('id="btn-tool-objects"');
  const measure = h.indexOf('class="measure-menu-container"');
  const share = h.indexOf('class="share-menu-container"');
  assert.ok(objects > 0 && measure > 0 && share > 0, 'all three are in the toolbar');
  assert.ok(objects < measure, 'Objects comes before the Measure menu in the toolbar row');
  assert.ok(measure < share, 'Measure still comes before Share');
});

/* ═══ ⑦ THE DOCUMENTS HAVE ONE JOB AND ONE ORDER EACH ═════════════════════════════════════════
   「DEVNOTESやArchitectureはかなり煩雑になったり…両者が混同されて混ざったり…これを機に一斉整理して。」
   The split is only worth anything while it holds, and all three of its properties are mechanical. */

const ROUND_HEADS = (md) => [...md.matchAll(/^## R(\d+)/gm)].map((m) => +m[1]);

test('R217 ⑦a: DEV-NOTES.md is the RECENT rounds only, newest first', () => {
  const md = rd('DEV-NOTES.md');
  const rounds = ROUND_HEADS(md);
  assert.ok(rounds.length > 0, 'it still has round headings');
  assert.equal(rounds[0], 217, 'the newest round is at the top (standing instruction 9 — prepend)');
  assert.ok(Math.min(...rounds) >= 200, `nothing below R200 is left here — found R${Math.min(...rounds)}`);
  for (let i = 1; i < rounds.length; i++) {
    assert.ok(rounds[i] < rounds[i - 1], `newest-first: R${rounds[i]} follows R${rounds[i - 1]}`);
  }
});

test('R217 ⑦b: DEV-NOTES-ARCHIVE.md is everything older, oldest first', () => {
  assert.ok(existsSync(join(ROOT, 'DEV-NOTES-ARCHIVE.md')), 'the archive exists');
  const md = rd('DEV-NOTES-ARCHIVE.md');
  const rounds = ROUND_HEADS(md);
  assert.ok(rounds.includes(199) && rounds.includes(86), 'it carries the range it took over');
  assert.ok(Math.max(...rounds) <= 199, `nothing from R200 on is duplicated here — found R${Math.max(...rounds)}`);
  for (let i = 1; i < rounds.length; i++) {
    assert.ok(rounds[i] >= rounds[i - 1], `oldest-first: R${rounds[i]} follows R${rounds[i - 1]}`);
  }
});

test('R217 ⑦c: Architecture.md is the CURRENT spec — no round appendices left in it', () => {
  const md = rd('Architecture.md');
  assert.ok(!/^## 19\. ラウンド別補足/m.test(md), '§19 moved to the round records');
  assert.equal([...md.matchAll(/^### #R\d+ 補足/gm)].length, 0,
    'a per-round appendix in the spec is what "両者が混同されて混ざる" was');
});

test('R217 ⑦d: every §19 appendix landed under its own round, and none was dropped', () => {
  const H = '### 仕様補足（旧 `Architecture.md` §19 より移設・#R217）';
  const n = (md) => md.split(H).length - 1;
  assert.equal(n(rd('DEV-NOTES.md')) + n(rd('DEV-NOTES-ARCHIVE.md')), 49,
    'the 51 appendices covered 49 rounds; each of those rounds carries one moved block');
});

test('R217 ⑥b: dropping a pin from the place-search card closes the card', () => {
  const s = rd('js/search-geocode.js');
  assert.match(s, /#src-pin'\)\.onclick=\(\)=>\{ const id=HOST\.addPin\(lng,lat\); HOST\.openPinPopup\(id\); closeSearchCard\(\); \};/,
    'the pin is dropped and its popup opened BEFORE the card is torn down');
});
