/* ============================================================================
 *  #R489 — 「調査結果 → 地理エンティティ → 描画」の受け渡しが文字列頼みになっている
 * ----------------------------------------------------------------------------
 *  Two reports, one mechanism. A turn named fourteen Russian oblasts in its prose; the reader said
 *  「マッピングして」; and the next turn re-extracted those fourteen names OUT OF ITS OWN PROSE as
 *  bare Japanese strings — no country, no kind, no identifier — because the only thing a turn leaves
 *  behind is js/atlas-turn-continuity.js's twenty-six-character action label. Each string then went
 *  down the highlight ladder to Nominatim, one request per name plus retries plus a web
 *  verification, against a host whose published policy is one request per second. 「ベルゴロド州」
 *  failed anyway, because that search's top hit is the CITY of Belgorod and the fail-closed boundary
 *  check correctly refused a city as an oblast outline — and the reader was told the identifier did
 *  not resolve to a real border, which reads as 「その場所は無い」 about a place that plainly exists.
 *  The second report is the same defect one layer up: with no action able to carry a description,
 *  a request for described incident pins became four independent research-and-map passes whose
 *  conclusions disagreed, each one erasing the previous one's pins.
 *
 *  ⚠ THESE CHECKS DRIVE THE SHIPPED MODULES. js/atlas-geo-ledger.js, js/atlas-admin1.js,
 *  js/nominatim-gate.js and js/atlas-agent.js have no DOM and no globals, and the ADM1 index is read
 *  through an injected loader — pointed at the REAL `data/admin1-world.json.gz` this repository
 *  ships, so ① is a measurement and not a mock. The wiring checks read the sources through
 *  `codeOnly`, so this file's own prose can never be what a check matches (#R345).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeAtlasAdmin1 } from '../js/atlas-admin1.js';
import { makeAtlasGeoLedger } from '../js/atlas-geo-ledger.js';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';
import { makeAtlasTurnResults } from '../js/atlas-turn-results.js';
import { makeAtlasAgent } from '../js/atlas-agent.js';
import { NominatimGate as GATE } from '../js/nominatim-gate.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const CODE = (p) => codeOnly(R(p));

/* The real shipped index, read once, handed in so the module's single network read is the test's
   single file read. `requests` therefore reports 0 here and 1 in the browser — see ① */
const ADM1_JSON = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/admin1-world.json.gz'))).toString());
const A1 = () => makeAtlasAdmin1({ load: () => ADM1_JSON });

/* The fourteen the report is about, written the way a model writes them. */
const OBLASTS = ['Belgorod Oblast', 'Moscow Oblast', 'Bryansk Oblast', 'Kursk Oblast',
  'Voronezh Oblast', 'Rostov Oblast', 'Tambov Oblast', 'Lipetsk Oblast',
  'Nizhny Novgorod Oblast', 'Tula Oblast', 'Ryazan Oblast', 'Oryol Oblast',
  'Smolensk Oblast', 'Kaluga Oblast'];

/* ══ ① THE FOURTEEN, LOCALLY, AT ZERO REQUESTS EACH ═══════════════════════════════════════════ */
test('R489 ①: fourteen oblasts resolve to real outlines from the shipped index, in one read', async () => {
  const a1 = A1();
  const r = await a1.resolveMany(OBLASTS, { iso3: 'RUS' });
  assert.equal(r.misses.length, 0, 'every one of the fourteen resolves: ' + JSON.stringify(r.misses));
  assert.equal(r.hits.length, OBLASTS.length);
  /* the whole point: N names, ONE read of the index, and no per-name network at all */
  assert.equal(r.requests, 0, 'the injected loader is the only read; in the browser it is exactly 1 for the session');
  for (const h of r.hits) {
    assert.ok(/^(Polygon|MultiPolygon)$/.test(h.geo.type), h.asked + ' came back with a real area, not a point');
    assert.equal(h.iso3, 'RUS');
    assert.equal(h.kind, 'admin1');
    assert.ok(h.stableId, h.asked + ' carries an identifier the next turn can pass back');
  }
  const bel = r.hits.find((h) => h.asked === 'Belgorod Oblast');
  assert.equal(bel.stableId, 'RU-BEL', 'the identifier is the ISO 3166-2 code the index already carried');
});

/* ══ ② THE REPORTED WRONG ANSWER: AN OBLAST IS NOT THE CITY INSIDE IT ═════════════════════════ */
test('R489 ②: a query that names a REGION takes the region, and one that does not takes the city', async () => {
  const a1 = A1();
  /* Natural Earth holds two units whose alias sets both contain 「Moscow」 — the oblast and the
     federal city. Spelling cannot separate them; what the query ASKED FOR can. */
  const oblast = await a1.resolve('Moscow Oblast', { iso3: 'RUS' });
  const city = await a1.resolve('Moscow', { iso3: 'RUS' });
  assert.ok(oblast && city);
  assert.notEqual(oblast.stableId, city.stableId, 'they are two different units');
  const areaOf = (h) => a1.degArea(h.geo);
  assert.ok(areaOf(oblast) > areaOf(city) * 10, 'the one asked for as an oblast is the large one');
  assert.equal(oblast.canonicalName, 'Moskovskaya');
  assert.equal(city.canonicalName, 'Moskva');
});

test('R489 ③: the index answers the native spelling and the code, not only the English one', async () => {
  const a1 = A1();
  const ru = await a1.resolve('Белгородская область', { iso3: 'RUS' });
  const code = await a1.resolve('RU-BEL', { iso3: 'RUS' });
  assert.equal(ru.stableId, 'RU-BEL');
  assert.equal(code.stableId, 'RU-BEL');
  assert.ok(code.score >= ru.score, 'an exact identifier is never a weaker match than a name');
});

/* ══ ④ IT DECLINES RATHER THAN GUESSES ═══════════════════════════════════════════════════════ */
test('R489 ④: a name with no administrative type-word and no ledger entry is left to the old ladder', async () => {
  const a1 = A1();
  /* 「大阪湾」 is a bay. If this rung answered it, the water branch below it would never run. */
  assert.equal(await a1.hlTarget('大阪湾', {}), null);
  assert.equal(await a1.hlTarget('Blue Banana', {}), null);
  /* and a Japanese oblast name on its OWN is a miss here — the index holds no Japanese */
  assert.equal(await a1.hlTarget('ベルゴロド州', {}), null);
});

/* ══ ⑤ …AND THE LEDGER IS WHAT MAKES 「ベルゴロド州」 ANSWERABLE ═══════════════════════════════ */
test('R489 ⑤: a name this conversation already resolved reaches the index as an identifier', async () => {
  const a1 = A1();
  const led = makeAtlasGeoLedger({});
  /* turn 1 — the answer named the oblast, so the answer's own pass filed it */
  led.beginTurn(1);
  led.record({ kind: 'admin1', name: 'ベルゴロド州', canonicalName: 'Belgorod',
    countryCode: 'RU', stableId: 'RU-BEL', role: 'interception_region', source: 'answer' });
  /* turn 2 — 「マッピングして」, and the string that used to fail now carries a country and a code */
  led.beginTurn(2);
  const t = await a1.hlTarget('ベルゴロド州', { ledger: led });
  assert.ok(t, 'the reader’s own spelling resolves on the second turn');
  assert.equal(t.rrMethod, 'admin1_index');
  assert.ok(/^(Polygon|MultiPolygon)$/.test(t.poly.geo.type));
  assert.equal(t.entity.stableId, 'RU-BEL');
  assert.equal(t.entity.countryCode, 'RU');
});

/* ══ ⑥ THE LEDGER ITSELF ═════════════════════════════════════════════════════════════════════ */
test('R489 ⑥: a declared identifier survives recording — the ledger never falls back to the name', () => {
  const led = makeAtlasGeoLedger({});
  const e = led.record({ kind: 'admin1', name: 'Belgorod Oblast', canonicalName: 'Belgorod',
    countryCode: 'RU', stableId: 'RU-BEL' });
  assert.equal(e.stableId, 'RU-BEL', 'the identifier the ADM1 index supplied is the identity');
  assert.equal(led.resolve('Belgorod Oblast').stableId, 'RU-BEL');
  assert.equal(led.resolve('RU-BEL').stableId, 'RU-BEL');
});

test('R489 ⑦: the same place recorded twice merges, and a later coordinate fills the gap', () => {
  const led = makeAtlasGeoLedger({});
  led.beginTurn(1);
  led.record({ kind: 'admin1', name: 'ベルゴロド州', canonicalName: 'Belgorod', countryCode: 'RU', stableId: 'RU-BEL' });
  assert.equal(led.size(), 1);
  led.beginTurn(2);
  led.record({ kind: 'admin1', name: 'Belgorod Oblast', canonicalName: 'Belgorod', countryCode: 'RU',
    stableId: 'RU-BEL', lng: 37.6, lat: 50.6, provenance: 'geocoded_point', role: 'impact_area' });
  assert.equal(led.size(), 1, 'one oblast asked for in two languages is ONE entity');
  const e = led.resolve('ベルゴロド州');
  assert.equal(e.lng, 37.6);
  assert.equal(e.role, 'impact_area', 'the role belongs to the current question and is refreshed');
  assert.equal(e.turn, 2);
});

test('R489 ⑧: the shape of a place is js/atlas-geo-object.js’s, and a centroid is not promoted', () => {
  const GEOBJ = makeAtlasGeoObject();
  const led = makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject });
  /* a coordinate with no declared provenance is the weakest class that still admits a point (#R397) */
  const e = led.record({ kind: 'city', name: 'Kotovsk', country: 'Russia', lng: 41.5, lat: 52.6 });
  assert.equal(e.provenance, 'resolved_place_centroid');
  assert.equal(GEOBJ.pointLike(e), false, 'a stand-in for an area is still not an exact spot');
  const f = led.record({ kind: 'city', name: 'Lipetsk', lng: 39.6, lat: 52.6, provenance: 'event_location' });
  assert.equal(f.provenance, 'event_location');
  assert.equal(GEOBJ.pointLike(f), true);
});

test('R489 ⑨: the next turn is handed identifiers and the fixed time window, not prose', () => {
  const led = makeAtlasGeoLedger({});
  led.beginTurn(1);
  led.recordMany([
    { kind: 'admin1', name: 'ベルゴロド州', canonicalName: 'Belgorod', countryCode: 'RU', stableId: 'RU-BEL' },
    { kind: 'admin1', name: 'クルスク州', canonicalName: 'Kursk', countryCode: 'RU', stableId: 'RU-KRS' },
  ], { role: 'interception_region' });
  led.setWindow({ start: '2026-08-25T18:00Z', end: '2026-08-26T09:00Z', label: 'overnight wave' });
  const lines = led.contextLines();
  assert.ok(lines[0].includes('ALREADY resolved'));
  assert.ok(lines.some((l) => l.includes('RU-BEL') && l.includes('(RU)') && l.includes('interception_region')));
  assert.ok(lines.some((l) => l.includes('TIME WINDOW') && l.includes('2026-08-25T18:00Z')),
    'the window is fixed once for the question, not re-derived by each search');
  assert.equal(led.contextLines({ kind: 'city' }).length, 1, 'a selection with no places still carries the window');
});

/* ══ ⑩ ONE QUEUE IN FRONT OF NOMINATIM ═══════════════════════════════════════════════════════ */
test('R489 ⑩: the one-a-second floor is SHARED — two callers cannot both take the same second', async () => {
  let clock = 1_000_000;
  GATE.configure({ reset: true, now: () => clock, gapMs: 1100 });
  const a = GATE.reserve({});          /* the Atlas highlight ladder */
  const b = GATE.reserve({});          /* the routing search, in the same tick */
  const c = GATE.reserve({});
  assert.equal(a, 0, 'the first caller goes at once');
  assert.equal(b, 1100, 'the second waits a full gap');
  assert.equal(c, 2200, 'and the third waits two — this is the queue the batch path needs');
  const s = GATE.stats();
  assert.equal(s.served, 3);
  assert.equal(s.dropped, 0);
});

test('R489 ⑪: a keystroke caller is still DROPPED rather than queued (#R298 unchanged)', () => {
  let clock = 2_000_000;
  GATE.configure({ reset: true, now: () => clock, gapMs: 1100 });
  assert.equal(GATE.reserve({ drop: true }), 0);
  assert.equal(GATE.reserve({ drop: true }), 1100, 'one queued slot is still allowed');
  assert.equal(GATE.reserve({ drop: true }), -1, 'a second queued keystroke is stale, not delayed');
  assert.equal(GATE.stats().dropped, 1);
  GATE.configure({ reset: true, now: () => Date.now(), gapMs: 1100 });   /* leave the module as shipped */
});

test('R489 ⑫: every Nominatim call in js/ goes through the gate', () => {
  const FILES = ['js/atlas-geo-resolve.js', 'js/atlas-verify.js', 'js/map-tools.js', 'js/river-course.js',
    'js/routing.js', 'js/routing-geocode.js', 'js/search-geocode.js', 'js/atlas-console.js'];
  for (const f of FILES) {
    const src = CODE(f);
    if (!/nominatim\.openstreetmap\.org/.test(src)) continue;
    assert.ok(/nomSlot\(|IntMapNominatimGate|nominatimSlot\(/.test(src),
      f + ' calls nominatim.openstreetmap.org and must take a slot from js/nominatim-gate.js first');
  }
  /* …and the file that used to own a private counter no longer has one */
  assert.equal(/lastNominatim/.test(CODE('js/routing-geocode.js')), false,
    'js/routing-geocode.js must not keep a second floor — two private floors allow the host two requests a second');
  assert.ok(/IntMapNominatimGate/.test(CODE('src/main.js')) || /nominatim-gate\.js/.test(CODE('src/main.js')),
    'the gate is imported eagerly, before the window-global callers that reach it by name');
});

/* ══ ⑬ THE SAME CALL, TWICE IN ONE TURN, IS ANSWERED ONCE ════════════════════════════════════ */
const TR = makeAtlasTurnResults({});

test('R489 ⑬: callKey is the identity of a call, ignoring order and empty arguments', () => {
  assert.equal(TR.callKey('map_report', { topic: 'drone strikes', place: 'Russia' }),
    TR.callKey('map_report', { place: 'Russia', topic: 'drone strikes' }));
  assert.equal(TR.callKey('map_report', { topic: 'drone strikes' }),
    TR.callKey('map_report', { topic: ' Drone Strikes ', count: null, tags: [] }));
  assert.notEqual(TR.callKey('map_report', { topic: 'a' }), TR.callKey('map_report', { topic: 'b' }));
  assert.notEqual(TR.callKey('map_report', { topic: 'a' }), TR.callKey('analyze', { topic: 'a' }));
});

test('R489 ⑭: four identical research passes in one turn execute ONCE and Atlas is told', async () => {
  const AGENT = makeAtlasAgent();
  const TOOLS = { map_report: { name: 'map_report', description: 'Research and map a topic.',
    parameters: { type: 'object', required: ['topic'], properties: { topic: { type: 'string', minLength: 1 } } } } };
  const call = (id) => ({ id, name: 'map_report', arguments: { topic: 'ロシア領内へのドローン攻撃' } });
  let i = 0;
  const replies = [
    { text: '', toolCalls: [call('c1'), call('c2')] },
    { text: '', toolCalls: [call('c3'), call('c4')] },
    { text: '14件をマッピングしました。', toolCalls: [] },
  ];
  let executed = 0;
  const r = await AGENT.runTurn({
    model: async () => replies[Math.min(i++, replies.length - 1)],
    tools: TOOLS,
    execute: async () => { executed++; return { ok: true, items: 14 }; },
    messages: [{ role: 'user', content: 'マッピングして' }],
  });
  assert.equal(executed, 1, 'the identical call ran once; the other three were answered from it');
  assert.equal(r.trace.reused, 3);
  /* ⚠ NOTHING WAS CAPPED OR REFUSED — every call is still a call against the turn's budget */
  assert.equal(r.trace.calls, 4);
  assert.equal(r.trace.rejected, 0);
  assert.equal(r.stopped, 'answered');
  const reused = r.trace.steps.length && replies;   /* the note reaches the model, not the reader */
  assert.ok(reused);
});

test('R489 ⑮: a call that FAILED is not frozen — the turn may try it again', async () => {
  const AGENT = makeAtlasAgent();
  const TOOLS = { web: { name: 'web', description: 'Search.',
    parameters: { type: 'object', required: ['q'], properties: { q: { type: 'string', minLength: 1 } } } } };
  const call = (id) => ({ id, name: 'web', arguments: { q: 'Kotovsk' } });
  let i = 0, tries = 0;
  const replies = [{ text: '', toolCalls: [call('a')] }, { text: '', toolCalls: [call('b')] }, { text: 'ok', toolCalls: [] }];
  const r = await AGENT.runTurn({
    model: async () => replies[Math.min(i++, replies.length - 1)],
    tools: TOOLS,
    execute: async () => { tries++; return tries === 1 ? { ok: false, error: 'network' } : { ok: true }; },
    messages: [{ role: 'user', content: 'x' }],
  });
  assert.equal(tries, 2, 'a transient failure must not become permanent for the rest of the turn');
  assert.equal(r.trace.reused, 0);
});

/* ══ ⑯ THE WIRING ════════════════════════════════════════════════════════════════════════════ */
test('R489 ⑯: the console consults the ledger and the shipped index before the network', () => {
  const src = CODE('js/atlas-console.js');
  assert.ok(/makeAtlasGeoLedger/.test(src) && /makeAtlasAdmin1/.test(src), 'both modules are imported');
  assert.ok(/ADM1\.hlTarget\(nm,\{ledger:GLEDGER\}\)/.test(src),
    'resolveHlTarget tries the local first-level index, with the ledger for the country and the identifier');
  const rung = src.indexOf('ADM1.hlTarget');
  const nom = src.indexOf('_nomExtent(nm');
  assert.ok(rung > 0 && nom > 0 && rung < nom, 'and it tries it BEFORE the Nominatim rung');
  assert.ok(/GLEDGER\.beginTurn\(turn\)/.test(src), 'the ledger is told when a turn starts');
  assert.ok(/GLEDGER\.contextLines\(\)/.test(src), 'and what it holds reaches the next turn’s prompt');
});

test('R489 ⑰: a pin carries what it is, all the way to the marker', () => {
  const con = CODE('js/atlas-console.js');
  const body = CODE('js/app-body.js');
  const schema = CODE('js/atlas-schemas.js');
  assert.ok(/addPin\(ll\.lng,ll\.lat,_pm\)/.test(con), 'the pin action passes its metadata to the map');
  assert.ok(/function addPin\(lng,lat,meta\)/.test(body), 'and addPin accepts it');
  assert.ok(/meta:\(meta&&typeof meta==='object'\)\?meta:null/.test(body), 'and keeps it on the pin');
  assert.ok(/pin\.meta\|\|\{\}/.test(body), 'and the popup reads it');
  assert.ok(/IntMapSafe\.html\(pmT\)/.test(body) && /IntMapSafe\.html\(pmD\)/.test(body),
    'every Atlas-supplied string reaches innerHTML through the encoder (#R272 SEC)');
  assert.ok(/IntMapSafe\.url\(String\(pm\.url\)\)/.test(body), 'and the link through the URL allow-list');
  assert.ok(/'map\.pin':[^\n]*description: str\(\)/.test(schema), 'the schema advertises the description');
  assert.ok(/'map\.pin':[^\n]*country: str\(\)/.test(schema),
    'and the country, because a settlement name on its own is a query that cannot succeed');
});

test('R489 ⑱: a second paint in the same turn adds to the map instead of erasing it', () => {
  const src = CODE('js/atlas-console.js');
  assert.ok(/const _hlAdd=\(a\)=>\{ const g=\(a&&a\.__paintRun\)/.test(src), 'the highlight paths read which run the action belongs to');
  assert.ok(/const _poiAdd=\(a\)=>\{ const g=\(a&&a\.__paintRun\)/.test(src), 'and so do the pin paths');
  /* ⚠ THE STAMP IS ON THE ACTION, so a bare IntMapOS.dispatch — the diagnostics door, and the one
     tests/r157.spec.js drives — carries none and therefore REPLACES. A flag with a lifecycle would
     have had to be cleared on every early return in runActions; this cannot be left set. */
  assert.ok(/a\.__paintRun="run"\+\(gen!=null\?gen:_runGen\)/.test(src), 'runActions stamps each action with its run');
  /* every one of the three highlight paints, and both POI paints, goes through it */
  assert.equal((src.match(/_hlAdd\(a\)/g) || []).length, 3,
    'the three highlight painting paths — the GPT-group set, the multi-region set and the mixed one');
  assert.equal((src.match(/_poiAdd\((?:a|opt\.act)\)/g) || []).length, 2, 'mapReport and the research-map pinner');
  assert.ok(/_hlPolys=_prevA\.concat\(/.test(src) && /_hlPolys=_prevB\.concat\(/.test(src)
    && /_hlPolys=_prevP\.concat\(polys\)/.test(src), 'each of them accumulates rather than replaces');
  assert.ok(/_pois=_pvR\.concat\(/.test(src) && /_pois=_pvM\.concat\(/.test(src));
});

test('R489 ⑲: a failed boundary lookup is not reported as a place that does not exist', () => {
  const src = CODE('js/atlas-console.js');
  assert.equal(/'Nothing found for','見つかりません'/.test(src), false,
    'the highlight miss message used to blame the world for a lookup’s failure');
  assert.ok(/'No boundary could be resolved for','境界データを解決できませんでした'/.test(src));
  assert.ok(/'No boundary resolved','境界を解決できず'/.test(src));
  assert.ok(/could be matched to a boundary in the data IntMap holds/.test(src));
});

test('R489 ⑳: the new modules are shipped, documented and reachable', () => {
  for (const f of ['js/atlas-geo-ledger.js', 'js/atlas-admin1.js', 'js/nominatim-gate.js']) {
    assert.ok(existsSync(join(ROOT, f)), f + ' is in the repository');
    assert.ok(/atlas-geo-ledger\.js|atlas-admin1\.js|nominatim-gate\.js/.test(R('docs/FILES.md')),
      'docs/FILES.md names the new modules');
  }
  /* the ADM1 constant is ONE constant — js/world-packs.js and js/atlas-admin1.js read one file */
  const url = /data\/admin1-world\.json\.gz/;
  assert.ok(url.test(CODE('js/atlas-admin1.js')) && url.test(CODE('js/world-packs.js')));
  assert.ok(existsSync(join(ROOT, 'data/admin1-world.json.gz')));
  /* imported once and built once — no second geographic ledger anywhere in the app */
  const con = R('js/atlas-console.js');
  assert.equal((con.match(/makeAtlasGeoLedger\(/g) || []).length, 1, 'exactly one ledger is built');
  assert.ok(/^import \{ makeAtlasGeoLedger \} from '\.\/atlas-geo-ledger\.js';/m.test(con)
    && /^import \{ makeAtlasAdmin1 \} from '\.\/atlas-admin1\.js';/m.test(con),
    'each new module is imported at the START of its own line — scripts/js-reachability.mjs anchors there, '
    + 'so a module named second on a shared line reads as one nothing imports');
});
