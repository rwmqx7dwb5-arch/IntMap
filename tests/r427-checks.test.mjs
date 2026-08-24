/* ============================================================================
 *  IntMap · #R427 — the settlement labels travel in time
 * ----------------------------------------------------------------------------
 *  What these hold, that nothing else does:
 *   ① the record actually reaches the app — data/hist-cities.json is shipped, is the size the
 *      request asked for (「数百以上」), and carries all nine languages spelled out;
 *   ② the three places the request NAMED resolve to the names it named, on the years it means;
 *   ③ no spelling names two cities — a repeated branch label makes MapLibre reject the style
 *      outright and takes the WHOLE label stack down with it (#R211 measured exactly that);
 *   ④ the expression js/hist-cities.js builds is a `match` whose DEFAULT is the ordinary label,
 *      which is the identity when the clock is live, which gates on the CLOCK rather than on the
 *      border layer, and which subscribes to the clock — `applyLabelLang` is not otherwise called
 *      when a year moves, so without that subscriber nothing would repaint;
 *   ⑤ js/place-labels.js applies it to `ofm-city` and to NOTHING ELSE — the record's collision
 *      exemptions are written against that layer's `class in [city, town]` filter, so widening it
 *      would silently invalidate them;
 *   ⑥ the subscriber is eager and the 600-city record is not.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { asClassicScript } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
/* ⚠ AN ASSERTION ABOUT WHAT THE CODE DOES MAY NOT READ THE COMMENTS. Both files below EXPLAIN in
   prose why they do not do a thing, and a bare `includes()` finds the explanation and calls it the
   deed — which is [[intmap-recurring-lessons]]: a spelling is not a mechanism. */
const code = (p) => rd(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const DATA = JSON.parse(rd('data/hist-cities.json'));
const LANGS = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];

const byId = new Map(DATA.cities.map((c) => [c.id, c]));
const dnum = (y, m, d) => y * 10000 + m * 100 + d;
function nameAt(city, d) {
  for (const e of city.e) if ((!e.f || d >= e.f) && (!e.t || d <= e.t)) return e.n;
  return null;
}

test('① the record is shipped, is several hundred cities, and is complete in nine languages', () => {
  assert.ok(DATA.cities.length >= 300, `「数百以上」 — only ${DATA.cities.length} cities`);
  assert.deepEqual(DATA.langs, LANGS, 'the language list is js/lang-registry.js\'s own codes');
  let eras = 0;
  for (const c of DATA.cities) {
    assert.ok(/^[a-z0-9-]+$/.test(c.id), `bad id ${c.id}`);
    assert.ok(Math.abs(c.lon) <= 180 && Math.abs(c.lat) <= 90, `bad coordinate for ${c.id}`);
    assert.ok(Array.isArray(c.k) && c.k.length, `${c.id} has no tile keys`);
    assert.ok(Array.isArray(c.e) && c.e.length, `${c.id} has no eras`);
    for (const e of c.e) {
      eras++;
      for (const lg of LANGS) assert.ok(e.n[lg], `${c.id}: era «${e.n.en}» has no ${lg} form`);
      /* an era that merely restates today's label would be a row that changes nothing */
      assert.ok(!c.k.includes(e.n.en), `${c.id}: era name «${e.n.en}» is also a modern key`);
    }
  }
  assert.ok(eras >= 300, `only ${eras} historical names`);
});

test('② the three places the request named answer with the names it named', () => {
  /* ヴォルゴグラード — Stalingrad through the battle, Tsaritsyn before the 1925 renaming */
  const v = byId.get('volgograd');
  assert.ok(v, 'Volgograd is in the record');
  assert.equal(nameAt(v, dnum(1942, 9, 13)).en, 'Stalingrad');
  assert.equal(nameAt(v, dnum(1942, 9, 13)).jp, 'スターリングラード');
  assert.equal(nameAt(v, dnum(1942, 9, 13)).ru, 'Сталинград');
  assert.equal(nameAt(v, dnum(1900, 6, 15)).en, 'Tsaritsyn');
  assert.equal(nameAt(v, dnum(1980, 6, 15)), null, 'after 1961 the modern tile label stands');

  /* 江戸 — Edo until the 1868 renaming, and Tokyo on every year after it */
  const t = byId.get('tokyo');
  assert.ok(t, 'Tokyo is in the record');
  assert.equal(nameAt(t, dnum(1860, 6, 15)).en, 'Edo');
  assert.equal(nameAt(t, dnum(1860, 6, 15)).jp, '江戸');
  assert.equal(nameAt(t, dnum(1900, 6, 15)), null);

  /* the shape with more than one era, and a reversion the record must NOT invent an era for */
  const p = byId.get('saint-petersburg');
  assert.equal(nameAt(p, dnum(1916, 6, 15)).en, 'Petrograd');
  assert.equal(nameAt(p, dnum(1960, 6, 15)).en, 'Leningrad');
  assert.equal(nameAt(p, dnum(1900, 6, 15)), null, 'before 1914 it was already Saint Petersburg');
  assert.equal(nameAt(p, dnum(2000, 6, 15)), null, 'and it is again');
});

test('③ no spelling names two cities — the property the rewrite depends on', () => {
  const seen = new Map();
  for (const c of DATA.cities) {
    for (const k of c.k) {
      assert.ok(!seen.has(k) || seen.get(k) === c.id,
        `key «${k}» is claimed by both ${seen.get(k)} and ${c.id} — a MapLibre match rejects repeated branch labels, and the style would fail to load`);
      seen.set(k, c.id);
    }
  }
  assert.ok(seen.size >= DATA.cities.length, 'every city contributes at least one key');
});

test('④ the expression is a match over the tile name whose default is the ordinary label', () => {
  const src = rd('js/hist-cities.js');
  assert.match(src, /\['match', \['coalesce', \['get', 'name:en'\]/, 'the first match reads name:en');
  assert.match(src, /\['match', \['coalesce', \['get', 'name'\]/, 'the second reads the local name');
  assert.match(src, /byLocal\.push\(base\)/, 'the inner default is the ordinary language expression');
  assert.match(src, /byEn\.push\(byLocal\)/, 'the outer default is the inner match');
  assert.match(src, /if \(!traveling\(\)\) return base;/, 'a live clock hands the base expression straight back');
  /* ⚠ the gate on the CLOCK, not on the border layer: IntMapTimeBorders.active() is false for
     2020+ because CShapes ends in 2019, and Nur-Sultan → Astana is 2022. */
  assert.ok(!/IntMapTimeBorders/.test(code('js/hist-cities.js')),
    'js/hist-cities.js must not gate on the border layer — a city renamed after 2019 would never show its era name');
  assert.match(src, /window\.IntMapTime\.on\(/, 'the clock is subscribed to, or a year change never repaints');
});

test('⑤ place-labels applies it to ofm-city and to nothing else', () => {
  const src = rd('js/place-labels.js');
  const m = src.match(/if\(id==='ofm-city'\)\{[^\n]*IntMapHistCities[^\n]*\}/);
  assert.ok(m, 'the era expression is applied under an explicit ofm-city test');
  /* the only mention of the module is that one line — a second call site would be a second owner */
  assert.equal((src.match(/IntMapHistCities/g) || []).length, 1,
    'exactly one call site; the record\'s collision exemptions are written against ofm-city\'s class filter');
  assert.match(src, /GE\(\)\.layers\.setLayout\(id,'text-field',_fld\)/, 'the wrapped expression is what is set');
});

test('⑥ the module is imported eagerly, and the record is NOT', () => {
  assert.match(rd('src/main.js'), /import '\.\.\/js\/hist-cities\.js';/, 'the subscriber has to exist before the clock moves');
  assert.ok(!/hist-cities\.json/.test(code('src/main.js')), 'the 600-city record must not be in the boot bundle');
  const src = rd('js/hist-cities.js');
  assert.match(src, /fetch\(url\)/, 'the record is fetched');
  assert.match(src, /if \(data \|\| loading \|\| failed\) return loading;/, 'and fetched at most once');
});

/* ══ ⚠⚠⚠ ⑦ THE SHIPPED MODULE, RUN, AND ITS OUTPUT EVALUATED BY MAPLIBRE'S OWN PARSER ══════════
   Everything above reads source. That is [[intmap-recurring-lessons]]'s standing trap — 「計器が
   緑でも機能は死んでいる」 — so this one boots js/hist-cities.js in a sandbox with a stub clock and
   a stub `fetch` that serves the REAL data/hist-cities.json, asks it for the very expression
   js/place-labels.js would hand to setLayout, and then runs that expression through
   `createExpression` from @maplibre/maplibre-gl-style-spec — the same parser the renderer uses.

   ⚠ THAT PARSER IS THE POINT, not a convenience. A `match` with a repeated branch label is not a
   wrong answer, it is a REJECTED STYLE: addLayer throws and the whole label stack stops existing
   (#R211 measured that). Only the real parser can say whether 600 branch labels are acceptable, and
   only evaluating it can say whether Volgograd comes out as Stalingrad. It is a transitive
   dependency of maplibre-gl, which this app ships, so it cannot be present without the renderer. */
function boot(dateISO) {
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Promise, URL, JSON, Array, Object, String });
  ctx.window = ctx;
  ctx.document = { baseURI: 'https://example.invalid/' };
  ctx.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(rd('data/hist-cities.json'))) });
  const when = dateISO ? new Date(dateISO + 'T12:00:00Z') : null;
  ctx.IntMapTime = { isLive: () => when == null, when: () => (when ? new Date(when) : new Date()), on: () => {} };
  vm.runInContext(asClassicScript(rd('js/hist-cities.js')), ctx);
  return ctx;
}
const BASE = ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
function evalAt(ctx, props, lang) {
  const e = ctx.window.IntMapHistCities.textField(BASE, lang || 'en', 'ui');
  const c = createExpression(e, { type: 'string', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
  assert.equal(c.result, 'success', 'MapLibre rejected the expression: ' + JSON.stringify(c.value && c.value.map ? c.value.map((x) => x.message) : c.value));
  return c.value.evaluate({ zoom: 6 }, { properties: props });
}

test('⑦ the shipped module answers, and MapLibre accepts and evaluates what it answers', async () => {
  const ctx = boot('1942-09-13');
  await ctx.window.IntMapHistCities.ensure();
  assert.ok(ctx.window.IntMapHistCities.ready(), 'the record loaded');
  assert.ok(ctx.window.IntMapHistCities.count() >= 300, 'and it is the whole record');

  /* the tile carries the modern English name → the era name comes out */
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd', name: 'Волгоград' }), 'Stalingrad');
  /* …and the same city reached through the LOCAL name alone, which is the second match */
  assert.equal(evalAt(ctx, { name: 'Волгоград' }), 'Stalingrad');
  /* …in the reader's own language */
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd' }, 'jp'), 'スターリングラード');
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd' }, 'ru'), 'Сталинград');
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd' }, 'ko'), '스탈린그라드');
  /* a language the row does not spell out falls to the Latin form, which is what the live map
     already does for a city OSM carries no tag for — not to some other language's word */
  assert.equal(evalAt(ctx, { 'name:en': 'Ilebo' }, 'ko'), 'Port-Francqui');

  /* ⚠ AND EVERYTHING ELSE ON EARTH IS UNTOUCHED — the default of the match is the base expression */
  assert.equal(evalAt(ctx, { 'name:en': 'Paris', name: 'Paris' }), 'Paris');
  assert.equal(evalAt(ctx, { 'name:latin': 'Yokohama', name: '横浜市' }), 'Yokohama');
  assert.equal(evalAt(ctx, { name: '名古屋市' }), '名古屋市');
});

test('⑧ a live clock changes nothing at all, and the three named cities answer on their years', async () => {
  const live = boot(null);
  await live.window.IntMapHistCities.ensure();
  assert.equal(live.window.IntMapHistCities.textField(BASE, 'en', 'ui'), BASE,
    'when the clock is live the base expression is handed back by identity — not a rebuilt copy');

  const edo = boot('1867-06-15');
  await edo.window.IntMapHistCities.ensure();
  assert.equal(evalAt(edo, { 'name:en': 'Tokyo', name: '東京' }), 'Edo');
  assert.equal(evalAt(edo, { name: '東京' }, 'jp'), '江戸');
  assert.equal(evalAt(edo, { 'name:en': 'Istanbul' }), 'Constantinople');
  assert.equal(evalAt(edo, { 'name:en': 'Kaliningrad' }), 'Königsberg');

  const now2 = boot('2010-06-15');
  await now2.window.IntMapHistCities.ensure();
  assert.equal(evalAt(now2, { 'name:en': 'Tokyo', name: '東京' }), 'Tokyo', 'Edo is not still on the map in 2010');
  assert.equal(evalAt(now2, { 'name:en': 'Volgograd' }), 'Volgograd');
  /* ⚠ THE ONE THE BORDER LAYER COULD NOT HAVE DONE: CShapes ends in 2019, so a gate on
     IntMapTimeBorders.active() would answer «Astana» here. The clock knows better. */
  const y2020 = boot('2020-06-15');
  await y2020.window.IntMapHistCities.ensure();
  assert.equal(evalAt(y2020, { 'name:en': 'Astana' }), 'Nur-Sultan');
});

test('⑨ the cache is keyed on the base expression too, so a label-language switch is not stale', async () => {
  /* ⚠ 'en' and 'local' both take the English column, so ONLY the base expression distinguishes
     them — and the base is the default of the match, i.e. the label every city outside the record
     gets. A cache keyed on (date, language) alone would hand the previous mode's default back and
     leave every unlisted place on Earth in the wrong language until the year moved. */
  const ctx = boot('1942-09-13');
  await ctx.window.IntMapHistCities.ensure();
  const T = ctx.window.IntMapHistCities;
  const asEn = T.textField(['coalesce', ['get', 'name:en'], ['get', 'name']], 'en', 'en');
  const asLocal = T.textField(['get', 'name'], 'en', 'local');
  assert.notDeepEqual(asEn, asLocal, 'the two modes must not share a cached expression');
  assert.deepEqual(asEn[asEn.length - 1][asEn[asEn.length - 1].length - 1], ['coalesce', ['get', 'name:en'], ['get', 'name']]);
  assert.deepEqual(asLocal[asLocal.length - 1][asLocal[asLocal.length - 1].length - 1], ['get', 'name']);
  /* the same call twice IS cached — the array comes back by identity */
  const again = T.textField(['get', 'name'], 'en', 'local');
  assert.equal(again, asLocal, 'an unchanged call is served from the cache');
});
