/* ============================================================================
 *  R747 — 54 QUESTIONS PUT TO ATLAS ON PRODUCTION, AND WHAT THE READER GOT BACK
 * ----------------------------------------------------------------------------
 *  Measured on https://rwmqx7dwb5-arch.github.io/IntMap/ (build R746), 2026-09-16,
 *  signed in, with the answer text, `IntMapAtlasState.lastTurn().operations` and the
 *  screen recorded for every turn. The defects this file pins, each with its turn:
 *
 *  (1) `map.highlight` READ `targets` IN ONE PLACE AND NOT THE OTHER.
 *     js/atlas-country-ids.js reads `targets`/`iso3`/`codes`/`countries` and returns null for a
 *     request made purely of NAMES — deliberately, so it falls through to the concrete-place
 *     resolver. That resolver's own field list was written out by hand in js/atlas-console.js and
 *     `targets` was not in it, so a highlight whose members are names under `targets` — the shape
 *     js/atlas-catalog-text.js documents FIRST — was read by neither. Measured, one turn apart,
 *     with the same sixteen strings:
 *         map.highlight {targets:[...]}   -> failed/failed
 *         map.highlight {countries:[...]} -> completed/ok
 *     Five separate questions hit it (landlocked Africa / left-driving countries / Brazil's
 *     neighbours / EU euro members / borders China AND Russia); every one showed the reader
 *     "Nothing is highlighted yet - name the countries or regions" for a command that named ten
 *     to fifty-four countries, and the landlocked-Africa turn died on `repeated_calls` with
 *     nothing drawn and no count given. resolveHl('Botswana') -> BWA for every name in it.
 *
 *  (2) A REMOVAL WAS JUDGED BY WHETHER SOMETHING APPEARED.
 *     `map.clearHighlights` and `highlight {on:false}` run on the generic `paint` verdict, whose
 *     last line is `not_rendered` when nothing moved. Clearing an already-clear map moves nothing.
 *     Measured: "Colour the world by population density" spent SIX of sixteen operations on
 *     `reset`, every one FAIL/not_rendered; "Turn off everything you turned on" gave
 *     `highlight:FAIL/not_rendered` x5 and ended `repeated_calls` in 44 s — with the map clear and
 *     the objects panel reading "0 on the map".
 *
 *  (3) ONE OBJECT NAMED, THOUSANDS DRAWN. "Put a SINGLE marker on the ISS" -> the reply said it
 *     had placed the single marker; the globe carried the full ~2,500-object active catalogue.
 *
 *  (6) THE ACTION THE CATALOGUE SAYS TO PREFER WAS THE ONE NOT IN HAND. js/atlas-catalog-text.js:
 *     "USE THIS INSTEAD OF analyze ... FOR ANY SUCH QUESTION" about `query`, which was reachable
 *     only through `find_capability` while `research` sat in CORE. Measured: "cities above 3000 m
 *     with more than 500,000 people" — the catalogue's OWN worked example minus one condition —
 *     spent two `research` calls (1m53s + 1m54s, 5m10s in all) and never touched the cities table,
 *     which carries `elevM` and `pop`.
 *
 *  (7) ONE REPLY, TWO LANGUAGES. js/atlas-console.js mirrors the language the reader wrote in;
 *     js/atlas-query.js read the UI language. A Japanese question on an English UI came back with
 *     both in one bubble.
 *
 *  (8) THE MEASUREMENT NEVER REACHED THE ANSWER. "Измерь расстояние от Лиссабона до Кейптауна" ->
 *     `measure:ok, drawLine:ok`, and no figure anywhere in the reply.
 *
 *  (9) AN OBJECT IS WHERE IT IS, NOT WHAT IT IS CALLED. Six pins at Machu Picchu, seven identical
 *     500 km circles at Tokyo, five identical Lisbon->Cape Town lines — every call `ok`, each
 *     carrying a different caption or colour, so `callKey` saw a different request each time.
 *
 *  (10) A LAYER TURNED OFF WAS WARNED ABOUT PAINTING. "Waves - off" followed immediately by
 *     "Could not confirm the layer actually painted on the map ... toggling it again may help".
 *
 *  These tests EVALUATE the shipped modules (#R505) wherever the defect lived in what a verdict
 *  could SEE or in which fields a reader reads. The few source reads below are reads of a FACT
 *  about the file ("the warning is inside the turn-on branch"), never of a spelling.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const { makeHighlightTargets } = await import('../js/atlas-country-ids.js');
const { makeAtlasCapabilities } = await import('../js/atlas-capabilities.js');
const { makeEraHighlight } = await import('../js/atlas-era-highlight.js');

/* == (1) THE FIELDS THAT CARRY THE REQUEST ARE ASKED ONCE ================================== */

const LANDLOCKED_AFRICA = ['Botswana', 'Burkina Faso', 'Burundi', 'Central African Republic', 'Chad',
  'Ethiopia', 'Eswatini', 'Lesotho', 'Malawi', 'Mali', 'Niger', 'Rwanda', 'South Sudan', 'Uganda',
  'Zambia', 'Zimbabwe'];

/* the store as js/atlas-country-ids.js reads it: features whose properties declare the ISO columns */
const STORE = {
  features: [
    { id: 'DEU', properties: { __code: 'DEU', ISO_A2: 'DE', ISO_A3: 'DEU', NAME: 'Germany' } },
    { id: 'FRA', properties: { __code: 'FRA', ISO_A2: 'FR', ISO_A3: 'FRA', NAME: 'France' } },
    { id: 'BWA', properties: { __code: 'BWA', ISO_A2: 'BW', ISO_A3: 'BWA', NAME: 'Botswana' } }
  ]
};
const IDS = makeHighlightTargets({ geo: () => STORE, resolveCountrySync: () => null });

test('R747 (1a): a highlight made of NAMES under `targets` is read - the field list is one list', () => {
  const names = IDS.readNames({ targets: LANDLOCKED_AFRICA });
  assert.deepEqual(names, LANDLOCKED_AFRICA,
    'the production failure: `targets` carried sixteen country names and the name reader saw none of them');
  assert.equal(IDS.readGroups({ targets: LANDLOCKED_AFRICA }), null,
    'a request made purely of names offers no identifiers - #R742 contract, unchanged, and it is what makes it fall through');
});

test('R747 (1b): every field the identifier reader accepts, the name reader accepts too', () => {
  const fields = IDS.requestFields();
  assert.ok(fields.arrays.indexOf('targets') >= 0, '`targets` is the shape the catalogue documents first');
  for (const k of fields.arrays) {
    const got = IDS.readNames({ [k]: ['Botswana', 'Chad'] });
    assert.deepEqual(got, ['Botswana', 'Chad'], 'field `' + k + '` carries the request and must be read');
  }
  assert.deepEqual(IDS.readNames({ targets: [{ name: 'Germany', iso3: 'DEU' }] }), ['Germany'],
    'the {name, iso3} object form the catalogue documents');
  assert.deepEqual(IDS.readNames({ country: 'Germany and France' }), ['Germany', 'France']);
  assert.deepEqual(IDS.readNames({ country: 'ドイツとフランス' }), ['ドイツ', 'フランス']);
  assert.deepEqual(IDS.readNames({ groups: [{ targets: ['Chad'] }, { countries: ['Mali'] }] }), ['Chad', 'Mali']);
  assert.deepEqual(IDS.readNames({}), [], 'a request that names nothing reads as nothing');
});

test('R747 (1c): the concrete-place resolver does not keep a second field list of its own', () => {
  /* the DEFECT restated: there were TWO lists and they disagreed. Not "`targets` is in the list" -
     that would pass again the next time a field is added to only one of them. */
  const src = read('js/atlas-console.js');
  const i = src.indexOf("case 'highlight':");
  assert.ok(i > 0, 'the highlight case moved - this check lost its subject');
  const body = src.slice(i, i + 30000);
  assert.ok(/const raw=_hlReadNames\(a\)/.test(body),
    'the name path must take its fields from js/atlas-country-ids.js, not restate them');
  assert.ok(!/String\(a\.countries\|\|a\.country\|\|a\.name\|\|a\.place\|\|a\.region\|\|a\.query/.test(body),
    'the hand-written field list is back: it is what dropped `targets`');
});

/* == (2) A REMOVAL IS COMPLETE WHEN THE THING IS GONE ====================================== */

const CAPS = makeAtlasCapabilities({ lang: 'en' });
const hl = CAPS.resolve('map.highlight');
const SOURCES = ['nlq-poly-src', 'nlq-line-src', 'user-pins', 'nlq-poi-src', 'atl-compose-src',
  'shk-cont-src', 'nlq-fac-src'];
function renderer() {
  const empty = { type: 'FeatureCollection', features: [] };
  return {
    hasRenderer: () => true,
    layers: { sourceData: (id) => { if (SOURCES.indexOf(id) < 0) throw new Error('no such source: ' + id); return empty; } },
    scene: { getStyle: () => ({ layers: [{ id: 'nlq-fill' }] }) },
    camera: { getCenter: () => ({ lng: 0, lat: 0 }), getZoom: () => 2, getBearing: () => 0, getPitch: () => 0 }
  };
}
function supplier(s) {
  return {
    countries: () => new Set(s.countries || []),
    era: () => (s.era || []).slice(),
    polys: () => (s.polys || []).map((n) => ({ name: n, geo: {} })),
    lines: () => (s.lines || []).map((n) => ({ name: n, geo: {} })),
    choro: () => (s.choro || []).reduce((o, c, i) => { o[c] = (i + 1) / 10; return o; }, {}),
    metric: () => s.metric || null
  };
}
function observe(s) {
  const hadP = window._imAtlasPaint, hadG = window.IntMapGeoEngine;
  window._imAtlasPaint = makeEraHighlight({ GE: () => window.IntMapGeoEngine, resolveCountrySync: () => null })
    .paintState(supplier(s));
  window.IntMapGeoEngine = renderer();
  try { return hl.observe(); }
  finally {
    if (hadP === undefined) delete window._imAtlasPaint; else window._imAtlasPaint = hadP;
    if (hadG === undefined) delete window.IntMapGeoEngine; else window.IntMapGeoEngine = hadG;
  }
}
/* what js/atlas-console.js `_CLEARED(...)` produces */
const cleared = (...kinds) => ({ ok: true, html: '<div>cleared</div>',
  meta: { painted: kinds.reduce((o, k) => { o[k] = []; return o; }, {}) } });

test('R747 (2a): clearing an already-clear map is completed, not `not_rendered`', () => {
  const empty = observe({});
  const v = hl.verify({}, { on: false }, empty, empty, cleared('countries', 'polys', 'lines'));
  assert.equal(v.status, 'completed',
    'the production failure: `highlight {on:false}` answered FAIL/not_rendered five times and the turn died on repeated_calls');
  assert.equal(v.code, 'already_there');
});

test('R747 (2b): a clear that did clear something is completed too', () => {
  const before = observe({ countries: ['DEU', 'FRA'] });
  const after = observe({});
  const v = hl.verify({}, { on: false }, before, after, cleared('countries', 'polys', 'lines'));
  assert.equal(v.status, 'completed');
  assert.equal(v.code, 'ok', 'something moved, so it is the ordinary success');
});

test('R747 (2c): READ, NOT TRUSTED - a clear that left the highlights standing still fails', () => {
  const still = observe({ countries: ['DEU', 'FRA'] });
  const v = hl.verify({}, { on: false }, still, still, cleared('countries', 'polys', 'lines'));
  assert.equal(v.code, 'not_rendered',
    'declaring a surface empty while two countries are painted must not buy a pass');
});

test('R747 (2d): an undeclared removal keeps exactly the verdict it had - nothing is guessed', () => {
  const empty = observe({});
  const bare = hl.verify({}, { on: false }, empty, empty, { ok: true, html: '' });
  assert.equal(bare.code, 'not_rendered', 'no declaration -> the reading is unchanged (#R742 rule)');
  const blank = hl.verify({}, { on: false }, empty, empty, { ok: true, html: '', meta: { painted: {} } });
  assert.equal(blank.code, 'not_rendered', '`{}` names no surface, so it makes no claim');
});

test('R747 (2e): a DRAW is unaffected - presence is still judged by presence', () => {
  const six = ['CHN', 'KGZ', 'RUS', 'TKM', 'UZB', 'TJK'];
  const after = observe({ countries: six });
  const drew = { ok: true, html: '<div>x</div>', meta: { painted: { countries: six } } };
  assert.equal(hl.verify({}, {}, after, after, drew).code, 'already_there', '#R742 redraw rule, untouched');
  const lied = { ok: true, html: '<div>x</div>', meta: { painted: { countries: ['DEU'] } } };
  assert.equal(hl.verify({}, {}, after, after, lied).code, 'not_rendered');
});

test('R747 (2f): both clearing paths declare what they emptied', () => {
  const src = read('js/atlas-console.js');
  assert.ok(/const _CLEARED=\(\.\.\.kinds\)/.test(src), 'the declaration helper is gone');
  const at = src.indexOf("case 'reset':");
  assert.ok(at > 0 && /_CLEARED\(/.test(src.slice(at, at + 700)), '`reset` clears four surfaces and must say so');
  const offAt = src.indexOf('if(a.on===false||/^(off|clear|none|');
  assert.ok(offAt > 0 && /_CLEARED\(/.test(src.slice(offAt, offAt + 700)),
    '`highlight {on:false}` clears through the drawing capability and must say so too');
});

/* == (6) THE ACTION THE CATALOGUE SAYS TO PREFER IS IN HAND ================================ */

test('R747 (6): `data.query` is a first-class tool, because the catalogue tells Atlas to prefer it', () => {
  const surface = read('js/atlas-toolsurface.js');
  const core = surface.slice(surface.indexOf('var CORE = ['), surface.indexOf("{ name: 'ask_user'"));
  assert.ok(/cap: 'data\.query'/.test(core),
    'the catalogue says USE THIS INSTEAD OF analyze about an action the model was not given');
  assert.ok(/cap: 'research\.analyze'/.test(core),
    'and research is not taken away - nothing is (CONSTITUTION.md section 5)');
  const catalogue = read('js/atlas-catalog-text.js');
  assert.ok(/USE THIS INSTEAD OF "analyze"/.test(catalogue), 'the catalogue instruction is this check subject');
});

/* == (7) ONE REPLY, ONE LANGUAGE ========================================================== */

test('R747 (7): the query engine writes in the language of the reply it is composing', () => {
  const q = read('js/atlas-query.js');
  assert.ok(/D\.lang === 'function'/.test(q),
    'js/atlas-query.js must take the reply language from its caller, not read the UI one');
  const c = read('js/atlas-console.js');
  assert.ok(/_Q\.bind\(\{lang:\(\)=>_mirrorLang\(\)/.test(c),
    'and the composer must pass the language it is mirroring');
});

/* == (8) THE MEASUREMENT REACHES THE ANSWER =============================================== */

test('R747 (8): `measure` returns the figure it measured', () => {
  const body = read('js/app-body.js');
  assert.ok(/measureReading\(pts\)/.test(body), 'the host must expose the reading the tool panel prints');
  const c = read('js/atlas-console.js');
  const m = c.slice(c.indexOf("case 'measure':"), c.indexOf("case 'measure':") + 2600);
  assert.ok(/HOST\.measureReading/.test(m),
    'the production failure: measure:ok, drawLine:ok, and no distance anywhere in the reply');
});

/* == (10) A LAYER TURNED OFF IS NOT EVIDENCE ABOUT PAINTING =============================== */

test('R747 (10): the painting warning belongs to a turn-ON', () => {
  const c = read('js/atlas-console.js');
  /* the REASON this reads the LAST occurrence: the comment above the branch quotes the warning
     verbatim, and #R621 was turned red once by its own explanation. The subject is the emitter. */
  const i = c.lastIndexOf('Could not confirm the layer actually painted');
  assert.ok(i > 0, 'the warning moved - this check lost its subject');
  const line = c.slice(c.lastIndexOf('\n', i), i);
  assert.ok(/if\(!changed&&r\.want\)/.test(line),
    'a layer turned OFF was followed by a warning that it could not be confirmed to have painted');
});

/* == (9) AN OBJECT IS WHERE IT IS ========================================================= */

test('R747 (9): a pin, a circle and a line placed again at the same place are the same object', () => {
  const body = read('js/app-body.js');
  const addPin = body.slice(body.indexOf('function addPin('), body.indexOf('function removePin('));
  assert.ok(/userPins\.find\(/.test(addPin) && /toFixed\(5\)/.test(addPin),
    'six pins landed on Machu Picchu because each call carried a different caption');
  const radAt = body.indexOf('window._radiusFromPoint=function');
  assert.ok(/radiusItems\.find\(/.test(body.slice(radAt, radAt + 1600)),
    'seven identical 500 km circles stacked on Tokyo');
  const c = read('js/atlas-console.js');
  const dl = c.slice(c.indexOf("case 'drawLine':"), c.indexOf("case 'drawLine':") + 2800);
  assert.ok(/_lnSame/.test(dl), 'five identical Lisbon to Cape Town lines');
});

/* == (3) ONE OBJECT NAMED IS NOT THE WHOLE SKY ============================================ */

test('R747 (3): the satellite catalogue is chosen by asking the catalogues, and is bounded', () => {
  const sat = read('js/satellites-live.js');
  assert.ok(/async function narrow\(/.test(sat),
    'which catalogue holds a named object is a fact about the catalogues');
  const n = sat.slice(sat.indexOf('async function narrow('), sat.indexOf('function setGroup('));
  assert.ok(/\+g\.kb/.test(n) && /spent \+|spent\+/.test(n),
    'the search must be bounded by the size of the catalogue already selected - narrowing may not cost more than not narrowing');
  assert.ok(!/'iss'/i.test(n), 'no table of names: CelesTrak decides what each catalogue holds');
  assert.ok(/narrow,/.test(sat), 'and it is exported');
  const c = read('js/atlas-console.js');
  const s = c.slice(c.indexOf("case 'satellites':"), c.indexOf("case 'satellites':") + 4400);
  assert.ok(/A\.narrow\(q\)/.test(s), 'the reply claimed a single marker while ~2,500 objects were drawn');
});
