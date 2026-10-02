/* ============================================================================
 *  map-state-store — the map's one named state, its forms, its restore, and the gate that keeps it one
 * ----------------------------------------------------------------------------
 *  元の欠陥: 地図の状態（視野・投影・基図・時刻・有効レイヤー・比較・シミュレータ）に名前の付いた正本が
 *  無く、URL ハッシュ（js/map-ui.js の手書きの連結と 9 本の正規表現）・セッション（js/session-tabs.js）・
 *  共有リンク・Atlas の snapshot（js/atlas-state.js）・比較窓の ct= がそれぞれ同じ状態を組み立てていた。
 *  同じ日に「復元が時計を奪われる」「復元中の 2 本目が捨てられる」「tt 無しが今に戻らない」が出た。
 *
 *  What is held here, by EVALUATING js/map-state.js (#R505 — reading source cannot see behaviour):
 *    ① every link the repository holds — the shipped example links (js/showcase.js CAPTURED, which the
 *      landing pages and s/*.html serve) byte for byte, and every canonical `#v=` link the specs open —
 *      survives decode → encode, so a link shared before the store opens the same map after it;
 *    ② the codec states what an ABSENT field means (no `tt` is «now», no `ct` follows the main clock, no
 *      `l` is «no data layers»), and keeps reading the legacy forms (`ts`, short `v`);
 *    ③ a restore is ONE application with a generation: each field reaches its owner at the instant the
 *      schema declares, a newer restore silences every staged step of an older one (#881), a change an
 *      owner reports inside its restore step says `restore` and one outside says `reader`, and a field
 *      whose owner registers late is handed its value only if that restore is still the latest;
 *    ④ every SCHEMA field is owned by exactly the module the schema names (the registrations are found in
 *      the tree, not listed here), and the session / Atlas projections read the store;
 *    ⑤ THE GATE: no file but js/map-state.js spells a state parameter of the address bar — no hand-written
 *      `[#&]tt=` parser, no `'&l='` builder — and the direct `location.hash` / `history.*State(` sites are
 *      ratcheted per file (a new one is red; a removed one is red until the baseline is lowered).
 *  The browser half — every example opened and the store reading the same map back, and the restore's
 *  clock — is appended to tests/landing-showcase.spec.js and tests/restored-layer-before-style.spec.js.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import { SCHEMA, PARAMS, SETTLE_MS, encode, decode, carries, packObject, unpackObject, viewOf, timeOf } from '../js/map-state.js';
import { CAPTURED } from '../js/showcase.js';
import { compareTime } from '../js/compare.js';   /* the window's own instant — the face its `compare` field reads */

if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* a fresh store per case: the module is a singleton, and a query string is a separate module instance */
let fresh = 0;
const freshStore = async () => (await import('../js/map-state.js?case=' + (++fresh))).MapState;

/* every js/ and src/ file (vendor and the generated locale tables are not program) */
function sources() {
  const out = [];
  for (const d of ['js', 'src']) {
    for (const f of readdirSync(join(ROOT, d), { recursive: true })) {
      const p = (d + '/' + String(f)).split('\\').join('/');
      if (!/\.js$/.test(p) || /\/vendor\/|\/locales\//.test(p)) continue;
      out.push(p);
    }
  }
  return out;
}

/* ══ ① every link the repository holds ═══════════════════════════════════════════════════════════ */
test('① every shipped example link survives decode → encode byte for byte', () => {
  const links = Object.entries(CAPTURED).map(([id, c]) => [id, c && c.hash]).filter(([, h]) => h);
  assert.ok(links.length >= 8, 'js/showcase.js CAPTURED holds the shipped example links');
  for (const [id, h] of links) {
    const st = decode(h);
    assert.ok(st.view, id + ': the link names a view');
    assert.equal(encode(st), h, id + ': the store would write a different link than the one the pages serve');
  }
});

test('① every canonical link the specs open means the same map after a round trip', () => {
  /* discovered: any `#v=` followed by the canonical six-part view, in any spec or check */
  const LINK = /#v=-?\d+\.\d{4},-?\d+\.\d{4},\d+\.\d{2},-?\d+,\d+,[gf](?:&[a-z0-9]+=[^\s'"`&)]*)*/g;
  const found = new Set();
  for (const f of readdirSync(join(ROOT, 'tests'))) {
    if (!/\.(spec\.js|test\.mjs)$/.test(f) || f === 'map-state-store-checks.test.mjs') continue;
    for (const m of read('tests/' + f).matchAll(LINK)) found.add(m[0]);
  }
  assert.ok(found.size >= 5, 'the specs hold canonical links (' + found.size + ' found)');
  for (const h of found) {
    const st = decode(h);
    assert.deepEqual(decode(encode(st)), st, h + ': encode → decode changed what the link says');
  }
});

/* ══ ② what an absent field states, and the legacy forms ═════════════════════════════════════════ */
test('② an absent field is a statement: no tt is «now», no ct follows, no l is «no data layers»', () => {
  const st = decode('#v=20.0000,40.0000,4.00,0,0,f');
  assert.deepEqual(st.view, { lng: 20, lat: 40, zoom: 4, bearing: 0, pitch: 0, proj: 'flat' });
  assert.equal(st.time, null, 'a link with no instant is a link at now');
  assert.deepEqual(st.layers, []);
  assert.equal(st.compare, null);
  assert.equal(st.base, 'map');
  assert.equal(st.terrain, false);
  assert.deepEqual(decode('#v=1,2,3,0,0,g&cmp=x').compare, { xray: true, at: '' }, 'no ct: the window follows the main clock');
  assert.deepEqual(decode('#v=1,2,3,0,0,g&cmp=1&ct=-500').compare, { xray: false, at: '-500' });
  assert.equal(decode('#l=dl-nato').view, null, 'no v= is not a map link');
  assert.equal(carries('#v=1,2,3'), true); assert.equal(carries('#x=1'), false);
});

test('② the legacy spellings are still read: the day-based ts and a short v', () => {
  assert.deepEqual(decode('#v=1,2,3&ts=3640').time, { daysAgo: 10 });
  assert.equal(encode(decode('#v=1,2,3,0,0,f&ts=3640')), '#v=1.0000,2.0000,3.00,0,0,f&ts=3640');
  const v = decode('#v=15,50,3').view;
  assert.deepEqual([v.lng, v.lat, v.zoom, v.proj], [15, 50, 3, null], 'a short v keeps the projection it does not name unset');
  const st = decode('#v=139.7000,35.6000,5.00,0,0,f&l=dl-nato,dl-eu&tt=1990-06-15&cmp=x&ct=1914&sat=1&t3=1&s=eyJ4IjoxfQ');
  assert.deepEqual(st.layers, ['dl-nato', 'dl-eu']);
  assert.deepEqual(st.time, { at: '1990-06-15' });
  assert.deepEqual(st.sims, { x: 1 });
  assert.equal(encode(st), '#v=139.7000,35.6000,5.00,0,0,f&l=dl-nato,dl-eu&tt=1990-06-15&cmp=x&ct=1914&sat=1&t3=1&s=eyJ4IjoxfQ',
    'every field, in the address bar\'s order');
  assert.deepEqual(unpackObject(packObject({ a: 'ä→1' })), { a: 'ä→1' }, 'the simulators\' packing survives non-ASCII');
});

/* ══ ③ the restore ═══════════════════════════════════════════════════════════════════════════════ */
function recorder(S, keys) {
  const log = [];
  for (const k of keys) S.own(k, { read: () => null, apply: (v, ctx) => { log.push([k, ctx.gen, JSON.stringify(v)]); S.changed(k); } });
  return log;
}

test('③ each field reaches its owner at the schema\'s instant, once per declared step', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const S = await freshStore();
  const keys = SCHEMA.filter((f) => f.restore).map((f) => f.key);
  const log = recorder(S, keys);
  S.restore('#v=1,2,3,0,0,f&l=a&tt=1900-01-01', { full: true });
  assert.deepEqual(log.map((e) => e[0]), ['view'], 'only the synchronous step ran at once');
  t.mock.timers.tick(5000);
  for (const f of SCHEMA.filter((x) => x.restore)) {
    assert.equal(log.filter((e) => e[0] === f.key).length, f.at.length, f.key + ': applied once per declared instant');
  }
  /* a plain reload (not full) restores only the fields declared `always` */
  const log2 = [];
  const S2 = await freshStore();
  for (const k of keys) S2.own(k, { read: () => null, apply: () => log2.push(k) });
  S2.restore('#v=1,2,3,0,0,f&l=a&tt=1900-01-01', { full: false });
  t.mock.timers.tick(5000);
  assert.deepEqual([...new Set(log2)].sort(), SCHEMA.filter((f) => f.restore === 'always').map((f) => f.key).sort());
});

test('③ a newer restore silences every staged step of an older one (#881), and settles once', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const S = await freshStore();
  const log = recorder(S, SCHEMA.filter((f) => f.restore).map((f) => f.key));
  let settled = 0;
  const a = S.restore('#v=1,2,3,0,0,f&l=dl-ww2&tt=1942-11-01', { full: true, onSettle: () => settled++ });
  t.mock.timers.tick(1000);
  const b = S.restore('#v=16,52,3.2,0,0,f&tt=1985-07-01', { full: true, onSettle: () => settled++ });
  assert.equal(a.current(), false); assert.equal(b.current(), true);
  t.mock.timers.tick(6000);
  const after = log.filter((e) => e[1] === a.gen);
  assert.ok(after.every((e) => e[0] !== 'layers' || log.indexOf(e) < log.findIndex((x) => x[1] === b.gen)),
    'an older restore applied a step after the newer one began');
  assert.equal(log.filter((e) => e[1] === a.gen && e[0] === 'layers').length, 1, 'only the older restore\'s 700 ms layer pass ran');
  assert.equal(log.filter((e) => e[0] === 'time').map((e) => e[2]).pop(), JSON.stringify({ at: '1985-07-01' }), 'the clock ends on the newer link');
  assert.equal(settled, 1, 'only the latest restore settles');
  assert.equal(S.restoring(), false);
});

test('③ a change reported inside a restore step is the restore\'s; outside it, the reader\'s', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const S = await freshStore();
  const seen = [];
  S.on((e) => seen.push([e.key, e.cause]));
  recorder(S, ['view', 'time']);
  S.restore('#v=1,2,3,0,0,f&tt=1900-01-01', { full: true });
  t.mock.timers.tick(1000);
  S.changed('time');
  assert.deepEqual(seen, [['view', 'restore'], ['time', 'restore'], ['time', 'reader']]);
});

test('③ a field whose owner registers late is handed the value — unless a newer restore came first', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const S = await freshStore();
  S.own('view', { read: () => null, apply: () => { } });
  S.restore('#v=1,2,3,0,0,f&s=' + packObject({ sun: 1 }), { full: true });
  const got = [];
  S.own('sims', { read: () => null, apply: (v) => got.push(v) });
  t.mock.timers.tick(5000);
  assert.deepEqual(got, [{ sun: 1 }, { sun: 1 }], 'the late owner received both declared passes');
  const S2 = await freshStore();
  S2.own('view', { read: () => null, apply: () => { } });
  S2.restore('#v=1,2,3,0,0,f&s=' + packObject({ sun: 1 }), { full: true });
  S2.restore('#v=1,2,3,0,0,f', { full: true });
  const got2 = [];
  S2.own('sims', { read: () => null, apply: (v) => got2.push(v) });
  t.mock.timers.tick(5000);
  assert.deepEqual(got2, [null, null], 'the superseded link\'s simulators reached the owner');
});

test('③ the closing step is the schema\'s SETTLE_MS: after the last layer pass, before the simulators\' late pass', () => {
  const at = (k) => SCHEMA.find((f) => f.key === k).at;
  assert.ok(SETTLE_MS > Math.max(...at('layers')), 'the restore closes before its own layer pass');
  assert.ok(SETTLE_MS < Math.max(...at('sims')));
});

/* ══ ④ owners and projections ════════════════════════════════════════════════════════════════════ */
test('④ every field is owned by exactly the module the schema names, and nobody else registers one', () => {
  const regs = new Map();
  for (const p of sources()) {
    const s = codeOnly(read(p));
    for (const m of s.matchAll(/\bMapState\.own\(\s*'([a-z]+)'/g)) regs.set(m[1], (regs.get(m[1]) || []).concat([p]));
  }
  for (const f of SCHEMA) assert.deepEqual(regs.get(f.key), [f.owner], f.key + ': registered by ' + JSON.stringify(regs.get(f.key)) + ', the schema names ' + f.owner);
  for (const k of regs.keys()) assert.ok(SCHEMA.some((f) => f.key === k), k + ' is registered but the schema has no such field');
  assert.equal(new Set(PARAMS).size, PARAMS.length, 'two fields spell the same parameter');
});

test('④ the readers Atlas and the owners share: one assembly of the camera and the clock', () => {
  const E = { camera: { getCenter: () => ({ lng: 10, lat: 20 }), getZoom: () => 3, getBearing: () => 15, getPitch: () => 30 } };
  assert.deepEqual(viewOf(E, { proj: 'globe' }), { lng: 10, lat: 20, zoom: 3, bearing: 15, pitch: 30, proj: 'globe' });
  assert.equal(viewOf(null, {}), null);
  const T = { isLive: () => false, get: () => new Date('1914-06-28T12:00:00Z'), iso: () => '1914-06-28', year: () => 1914 };
  assert.deepEqual(timeOf(T), { at: '1914-06-28', instant: '1914-06-28T12:00:00.000Z', year: 1914 });
  assert.equal(timeOf({ isLive: () => true }), null);
  assert.equal(encode({ view: viewOf(E, { proj: 'globe' }), time: timeOf(T) }), '#v=10.0000,20.0000,3.00,15,30,g&tt=1914-06-28');
});

test('④ the saved session is the store\'s projection, with the year rule it always had', async () => {
  const S = await freshStore();
  S.own('base', { read: () => 'sat' }); S.own('terrain', { read: () => true });
  S.own('time', { read: () => ({ at: '1914-06-28', year: 1914 }) }); S.own('toggles', { read: () => ['dl-a', 'dl-names'] });
  assert.deepEqual(S.session(), { layers: ['dl-a', 'dl-names'], year: 1914, base: 'sat', terr3d: true });
  S.own('time', { read: () => null });
  assert.equal(S.session().year, null, 'a live clock saves no year');
  for (const p of ['js/session-tabs.js', 'js/atlas-state.js', 'js/map-ui.js']) {
    assert.match(codeOnly(read(p)), /MapState\.(session|read|hash|link)\(|_ms\.MapState/, p + ' reads the store');
  }
});

/* compare.js owns the window's field; before the window exists it reads «no window» and the instant face says '' */
test('④ the comparison window\'s field reads null before the window exists', async () => {
  const { MapState } = await import('../js/map-state.js');
  assert.equal(compareTime.param(), '');
  assert.equal(MapState.owns('compare'), true, 'js/compare.js registered the field at import');
  assert.equal(MapState.read('compare'), null);
});

/* ══ ⑤ THE GATE ══════════════════════════════════════════════════════════════════════════════════
   (a) nobody but the codec spells a state parameter. The parameter names come from SCHEMA, so a field
       added there is covered here without a word changed. Comments are not code (scripts/code-only.mjs). */
test('⑤ only js/map-state.js spells the address bar\'s state parameters', () => {
  const names = PARAMS.map((p) => p.replace(/[^a-z0-9]/g, '')).join('|');
  const PARSER = new RegExp('\\[#&\\](?:' + names + ')=');
  const BUILDER = new RegExp('([\'"`])[#&](?:' + names + ')=\\1');
  const bad = [];
  for (const p of sources()) {
    if (p === 'js/map-state.js') continue;
    const s = codeOnly(read(p));
    if (PARSER.test(s)) bad.push(p + ': parses a state parameter by hand (' + PARSER.exec(s)[0] + ')');
    if (BUILDER.test(s)) bad.push(p + ': builds a state parameter by hand (' + BUILDER.exec(s)[0] + ')');
  }
  assert.deepEqual(bad, [], 'read and write the map state through js/map-state.js (MapState.decode / encode / hash)');
});

/* (b) the direct address-bar sites, per file. ⚠ A PHOTOGRAPH, RATCHETED BOTH WAYS (the rule of
   scripts/global-surface.mjs): taken 2026-10-02 on feat/map-state-store, after the store took the share
   link's writer and parser. A file that gains a site is red — route it through MapState (or, if it is not
   map state at all, say why here and raise its number); a file that loses one is red until this number
   is lowered, so the baseline keeps asserting what it says. What each remaining site is:
     js/map-ui.js        7 reads: the boot latch (BOOT_HASH), the crash marker (3), the restore's `H` (2),
                          the hashchange listener — the address the store decodes; 1 write: save()
     js/page-i18n.js      2 reads: an in-page anchor of the static pages (not map state)
     js/usage-counts.js   1 read: the arrival row of the anonymous counts (not map state)
     js/atlas-cap-panel.js, js/auth-ui.js, js/legal-page.js, js/atlas-attach.js  1 write each: the showcase
                          door (then the store's restore), the OAuth return, a static page's query, a lightbox's
                          back-button entry
     js/map-state.js      1 read + 1 write (classroom-tours): `MapState.address` — the page's own query fields
                          (`?tour=&step=`, not map state) beside a fragment the codec wrote; js/tour-player.js
                          writes the bar only through it */
const ADDRESS_SITES = {
  'js/map-ui.js': { hash: 7, history: 1 },
  'js/page-i18n.js': { hash: 2, history: 0 },
  'js/usage-counts.js': { hash: 1, history: 0 },
  'js/atlas-cap-panel.js': { hash: 0, history: 1 },
  'js/auth-ui.js': { hash: 0, history: 1 },
  'js/legal-page.js': { hash: 0, history: 1 },
  'js/atlas-attach.js': { hash: 0, history: 1 },
  'js/map-state.js': { hash: 1, history: 1 },
};
test('⑤ direct location.hash / history.*State( sites do not grow, and the baseline does not go stale', () => {
  const now = {};
  for (const p of sources()) {
    const s = codeOnly(read(p));
    const hash = (s.match(/\blocation\.hash\b/g) || []).length;
    const history = (s.match(/\bhistory\.(?:replaceState|pushState)\s*\(/g) || []).length;
    if (hash || history) now[p] = { hash, history };
  }
  const grew = [], shrank = [];
  for (const p of new Set([...Object.keys(now), ...Object.keys(ADDRESS_SITES)])) {
    const a = ADDRESS_SITES[p] || { hash: 0, history: 0 }, b = now[p] || { hash: 0, history: 0 };
    for (const k of ['hash', 'history']) {
      if (b[k] > a[k]) grew.push(`${p}: ${k} ${a[k]} → ${b[k]}`);
      if (b[k] < a[k]) shrank.push(`${p}: ${k} ${a[k]} → ${b[k]}`);
    }
  }
  assert.deepEqual(grew, [], 'a new direct address-bar site — map state goes through js/map-state.js');
  assert.deepEqual(shrank, [], 'a site is gone — lower ADDRESS_SITES in this file so the baseline keeps asserting what it says');
});
