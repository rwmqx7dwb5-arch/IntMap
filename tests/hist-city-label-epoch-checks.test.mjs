/* ============================================================================================
 *  hist-city-label-epoch · the era city names are rebuilt per EPOCH, and read exactly as before
 * --------------------------------------------------------------------------------------------
 *  js/hist-cities.js used to key its label expression by the clock's DATE, so every move of the
 *  clock rebuilt the ~1.2 MB `text-field` and js/place-labels.js wrote it again. The expression is a
 *  function of which name spans contain the instant, and that set only changes at a span's first
 *  day (`f`) or the integer after its last day (`t + 1`). The cache is now keyed by that interval.
 *
 *  What these hold — every one by RUNNING the shipped module against the shipped record:
 *   ① what a reader sees does not change: at dates chosen FROM THE RECORD — both sides of span
 *      boundaries around the two years the nightly specs travel to (1916, 1939) and a spread across
 *      the whole record, BCE included — the expression a module that has been travelling hands back
 *      is byte-identical to the one a fresh module (the old date-keyed behaviour: nothing cached)
 *      builds for that date;
 *   ② inside one interval the module hands back the SAME array — which is what lets
 *      js/place-labels.js skip the write — and it still does after the clock subscriber fires;
 *   ③ and the labels themselves, evaluated by MapLibre's own parser and evaluator at every city's
 *      recorded position on both sides of a boundary, are the record's rule: the first span that
 *      contains the instant, with « [?]» for an open start;
 *   ④ the expression passes MapLibre's own style validator. js/place-labels.js writes it with
 *      `{validate:false}` — MapLibre's API reserves that for values «previously validated», and this
 *      is where that happens — and `built()` says so for that expression and for nothing else.
 * ========================================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExpression, validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { asClassicScript } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const SRC = asClassicScript(rd('js/hist-cities.js'));
const DATA = JSON.parse(rd('data/hist-cities.json'));
const BASE = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];

/* ── the record's own calendar arithmetic, restated independently of the module ─────────────── */
const dnum = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
/* ⚠ setUTCFullYear, never Date.UTC: Date.UTC maps years 0–99 to 1900–1999, and the record reaches
   into BCE. Returns null when `v` is not a calendar day (e.g. 19661232, a `t + 1`). */
function dayOf(v) {
  const y = Math.floor(v / 10000), md = v - y * 10000, m = Math.floor(md / 100), day = md % 100;
  const d = new Date(0); d.setUTCHours(12, 0, 0, 0); d.setUTCFullYear(y, m - 1, day);
  return (Number.isFinite(d.getTime()) && dnum(d) === v) ? d : null;
}
const shift = (d, days) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + days); return x; };
/* the last calendar day before boundary `b`, and the first on or after it */
function straddle(b) {
  const before = dayOf(b - 1);
  if (before) return [before, shift(before, 1)];
  const at = dayOf(b);
  return at ? [shift(at, -1), at] : null;
}
/* the boundaries, read off the record: where `d >= f` or `d <= t` can change its answer.
   ⚠ Only those a clock can stand beside: the record carries Pleiades starts ~2.6 million years
   BCE, outside what a JavaScript Date (±275 760 years) can hold — no instant lies on their far side. */
const BOUNDS = (() => {
  const s = new Set();
  for (const c of DATA.cities) for (const e of c.e) { if (e.f) s.add(e.f); if (e.t) s.add(e.t + 1); }
  return [...s].filter((b) => straddle(b)).sort((a, b) => a - b);
})();
const nameAt = (c, d) => { for (const e of c.e) if ((!e.f || d >= e.f) && (!e.t || d <= e.t)) return e; return null; };
const label = (e, lang) => { const s = e && ((e.n && (e.n[lang] || e.n.en)) || ''); return s ? s + (e.f ? '' : ' [?]') : ''; };

/* ── the shipped module in a sandbox, with a clock that can be moved ────────────────────────── */
async function boot(at) {
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Promise, URL, JSON, Array, Object, String, Map, Set, Math, Number });
  ctx.window = ctx;
  ctx.document = { baseURI: 'https://example.invalid/' };
  ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(DATA) });
  const clock = { now: new Date(at), subs: [] };
  ctx.IntMapTime = { isLive: () => false, when: () => new Date(clock.now), on: (fn) => clock.subs.push(fn) };
  vm.runInContext(SRC, ctx);
  await ctx.window.IntMapHistCities.ensure();
  assert.ok(ctx.window.IntMapHistCities.ready(), 'the record loaded');
  const HC = ctx.window.IntMapHistCities;
  return {
    HC, clock,
    at(d) { clock.now = new Date(d); for (const fn of clock.subs) fn({ isLive: false }); return HC.textField(BASE, 'en', 'ui'); },
  };
}
/* what the module built for `d` when nothing was cached — i.e. what the date-keyed cache produced */
async function fresh(d) { const m = await boot(d); return m.HC.textField(BASE, 'en', 'ui'); }

/* dates chosen from the record, not typed: the boundaries nearest the two years the nightly specs
   travel to, and a spread over the whole list (its first and last included) */
function pickBounds() {
  const near = (iso, k) => {
    const v = dnum(new Date(iso)); let i = BOUNDS.findIndex((b) => b > v); if (i < 0) i = BOUNDS.length;
    return BOUNDS.slice(Math.max(0, i - k), i + k);
  };
  const spread = []; const step = Math.max(1, Math.floor(BOUNDS.length / 12));
  for (let i = 0; i < BOUNDS.length; i += step) spread.push(BOUNDS[i]);
  spread.push(BOUNDS[BOUNDS.length - 1]);
  return [...new Set([...near('1916-07-01T12:00:00Z', 3), ...near('1939-07-01T12:00:00Z', 3), ...spread])].sort((a, b) => a - b);
}

test('① at both sides of boundaries chosen from the record, a travelling module reads exactly as a fresh one', async () => {
  const picks = pickBounds();
  assert.ok(picks.length >= 15, `only ${picks.length} boundaries picked`);
  assert.ok(picks[0] < 0, 'the spread reaches the BCE part of the record');
  const dates = picks.flatMap(straddle);
  const walker = await boot(dates[0]);
  /* forwards, then backwards — a cache that survived a crossing in either direction would show */
  for (const d of [...dates, ...dates.slice().reverse()]) {
    const got = JSON.stringify(walker.at(d));
    const want = JSON.stringify(await fresh(d));
    if (got !== want) assert.fail(`${d.toISOString().slice(0, 10)}: the travelling module's expression differs from a fresh build`);
  }
});

test('② inside one interval the very same array comes back, even after the clock subscriber fires', async () => {
  /* the first interval after 1916-07-01 that spans more than one calendar day */
  const v = dnum(new Date('1916-07-01T12:00:00Z'));
  let i = BOUNDS.findIndex((b) => b > v);
  let a, b;
  for (; i + 1 < BOUNDS.length; i++) {
    a = straddle(BOUNDS[i])[1]; b = straddle(BOUNDS[i + 1])[0];
    if (b > a) break;
  }
  assert.ok(b > a, 'an interval of more than one day exists after 1916-07-01');
  const m = await boot(a);
  const first = m.at(a);
  assert.ok(Array.isArray(first) && first[0] === 'let', 'a past date yields the era expression');
  assert.equal(m.at(b), first, `${a.toISOString().slice(0, 10)} → ${b.toISOString().slice(0, 10)} crosses no span boundary`);
  /* …and one day further IS a crossing: the object changes and equals a fresh build there */
  const next = shift(b, 1);
  const crossed = m.at(next);
  assert.notEqual(crossed, first, 'crossing a boundary rebuilds');
  assert.equal(JSON.stringify(crossed), JSON.stringify(await fresh(next)), 'and the rebuild is the fresh one');
  /* back into the first interval is a crossing too — never the stale object from before */
  assert.equal(JSON.stringify(m.at(a)), JSON.stringify(first));
});

/* MapLibre's own evaluator needs real tile geometry for `distance` (see tests/r427-checks.test.mjs
   ⑦–⑨): a feature without it evaluates every guard as NaN and reads «the modern name» everywhere. */
const EXTENT = 8192;
function tileFeature(props, lon, lat, z) {
  const n = 2 ** z, sx = (lon + 180) / 360 * n, la = lat * Math.PI / 180;
  const sy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n;
  const x = Math.floor(sx), y = Math.floor(sy);
  return { canonical: { z, x, y }, feature: { type: 1, properties: props, geometry: [[{ x: Math.round((sx - x) * EXTENT), y: Math.round((sy - y) * EXTENT) }]] } };
}
function compile(e) {
  const c = createExpression(e, { type: 'string', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
  if (c.result !== 'success') assert.fail('MapLibre rejected the expression: ' + JSON.stringify(c.value.map((x) => x.message)));
  return c.value;
}

test('③ on both sides of the first boundary after 1916-07-01 that renames a city, every city reads the record\'s rule', async () => {
  /* not merely the first boundary: many only move a span nobody reads first (an earlier span still
     wins), so the one chosen is the first whose two sides the record itself names differently */
  const v = dnum(new Date('1916-07-01T12:00:00Z'));
  const renames = (b) => { const [x, y] = straddle(b).map(dnum); return DATA.cities.some((c) => label(nameAt(c, x), 'en') !== label(nameAt(c, y), 'en')); };
  const edge = BOUNDS.find((b) => b > v && renames(b));
  assert.ok(edge, 'the record renames some city after 1916-07-01');
  const [before, after] = straddle(edge);
  const m = await boot(before);
  let checked = 0, changed = 0;
  const seen = new Map();
  for (const d of [before, after]) {
    const expr = compile(m.at(d));
    const dn = dnum(d);
    for (const c of DATA.cities) {
      /* outside every span the tile's own name comes through untouched */
      const want = label(nameAt(c, dn), 'en') || c.k[0];
      const t = tileFeature({ 'name:en': c.k[0] }, c.lon, c.lat, 8);
      const got = expr.evaluate({ zoom: 8 }, t.feature, {}, t.canonical);
      if (got !== want) assert.fail(`${c.id} on ${d.toISOString().slice(0, 10)}: drew ${JSON.stringify(got)}, the record says ${JSON.stringify(want)}`);
      checked++;
      if (seen.has(c.id) && seen.get(c.id) !== want) changed++;
      seen.set(c.id, want);
    }
  }
  assert.ok(checked > 1000, `only ${checked} labels checked`);
  assert.ok(changed >= 1, 'the boundary chosen from the record changes at least one label');
});

test('④ the built expression passes the style validator, and built() names it and only it', async () => {
  /* the same layer shape js/place-labels.js writes into: a symbol layer on a vector source */
  const style = (tf) => ({ version: 8, glyphs: 'https://example.invalid/{fontstack}/{range}.pbf',
    sources: { ofm: { type: 'vector', tiles: ['https://example.invalid/{z}/{x}/{y}.pbf'] } },
    layers: [{ id: 'ofm-city', type: 'symbol', source: 'ofm', 'source-layer': 'place', layout: { 'text-field': tf } }] });
  const picks = pickBounds();
  const dates = [picks[0], ...picks.filter((_, i) => i % 5 === 0), picks[picks.length - 1]].flatMap(straddle);
  const m = await boot(dates[0]);
  for (const d of dates) {
    for (const lang of ['en', 'jp']) {
      m.clock.now = new Date(d);
      const e = m.HC.textField(BASE, lang, 'ui');
      /* an instant no row names (the record's last edge is in the future) hands the caller's own back */
      if (e === BASE) { assert.equal(m.HC.built(e), false, 'the base expression belongs to the caller, it was not built here'); continue; }
      assert.ok(m.HC.built(e), `${d.toISOString().slice(0, 10)}: the era expression is marked as built here`);
      /* ⚠ through JSON: the arrays come from the sandbox's realm */
      const errors = validateStyleMin(style(JSON.parse(JSON.stringify(e))));
      if (errors.length) assert.fail(`${d.toISOString().slice(0, 10)} ${lang}: ${errors.slice(0, 3).map((x) => x.message).join(' / ')}`);
    }
  }
  /* the caller's own expression handed back is not this file's to vouch for */
  const base = ['get', 'name'];
  const live = await boot(dates[0]);
  live.clock.now = new Date(dates[0]);
  assert.equal(live.HC.built(base), false);
  assert.equal(live.HC.built(null), false);
  assert.equal(live.HC.built(['let']), false, 'an equal-looking array that this file did not hand out is not vouched for');
});
