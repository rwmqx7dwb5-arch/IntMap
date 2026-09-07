/* ============================================================================
 *  IntMap · #R427 — the settlement labels travel in time
 *          · #R521 — …and the label that travels is THIS city's, not its namesake's
 * ----------------------------------------------------------------------------
 *  What these hold, that nothing else does:
 *   ① the record actually reaches the app — data/hist-cities.json is shipped, is the size the
 *      request asked for (「数百以上」), carries all nine languages spelled out, and gives every
 *      row a guard radius inside the range the build is allowed to derive;
 *   ② the three places the request NAMED resolve to the names it named, on the years it means;
 *   ③ no spelling names two cities — a repeated branch label makes MapLibre reject the style
 *      outright and takes the WHOLE label stack down with it (#R211 measured exactly that);
 *   ④ the expression js/hist-cities.js builds gates every branch on POSITION and falls through to
 *      the ordinary label, is the identity when the clock is live, gates on the CLOCK rather than
 *      on the border layer, and subscribes to the clock — `applyLabelLang` is not otherwise called
 *      when a year moves, so without that subscriber nothing would repaint;
 *   ⑤ js/place-labels.js applies it to `ofm-city` and to NOTHING ELSE;
 *   ⑥ the subscriber is eager and the 600-city record is not;
 *   ⑦⑧⑨ the shipped module, run, with MapLibre's own parser and MapLibre's own evaluator over
 *      features carrying REAL TILE GEOMETRY — because `distance` is the whole mechanism now and
 *      an evaluation without geometry cannot tell a working guard from a dead one;
 *   ⑩ ⚠⚠⚠ THE CONTROL CASES. Kochi/高知, Kirov/Kirov and Linden/Linden are three pairs of real
 *      cities that share a spelling. Before #R521 the second of each pair was relabelled with the
 *      first one's history, every gate was green, and 高知市 read コーチン on the map;
 *   ⑪ and the property that makes ⑩ true for the OTHER 605 rows, asserted over the shipped bytes:
 *      no settlement on Earth answering to a row's spelling, other than that row's own city, lies
 *      inside that row's guard.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
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
    /* ⚠ (#R521) the guard is what makes the key a join to ONE city. A row without one, or with one
       wide enough to be meaningless, is a row that renames its namesakes. */
    assert.ok(Number.isFinite(c.g) && c.g >= 2000 && c.g <= 20000, `${c.id}: guard radius ${c.g} m is outside the range the build may derive`);
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

test('④ every branch of the built expression is gated on position, and falls through to the ordinary label', async () => {
  /* ⚠⚠⚠ (#R488/#R494's LESSON) THIS ASKS THE BUILT EXPRESSION, NOT THE SOURCE THAT BUILDS IT.
     #R427's version of this test pinned the spellings `byLocal.push(base)` and
     `['match', ['coalesce', ['get', 'name:en']` — and every one of those spellings was still
     present, and still green, while 高知市 was being relabelled コーチン. A regex over source can
     only say that a line survived a refactor; it cannot say that the expression means anything.
     So: build the real thing and walk it. */
  const built = await buildExpr('1942-09-13');
  assert.equal(built[0], 'let', 'the two fall-through values are bound once, not copied per branch');
  const byEn = built[3];                          /* ['let', BASE, base, ['let', LOCAL, byLocal, byEn]] */
  assert.equal(byEn[0], 'let');
  const outer = byEn[3], inner = byEn[2];
  /* ⚠ compared as text: the expression was built inside the vm sandbox, so its arrays come from
     another realm and deepStrictEqual would fail on the prototype while printing an identical diff */
  assert.equal(JSON.stringify(outer[1]), JSON.stringify(['coalesce', ['get', 'name:en'], '']), 'the outer match reads name:en');
  assert.equal(JSON.stringify(inner[1]), JSON.stringify(['coalesce', ['get', 'name'], '']), 'the inner match reads the local name');
  let branches = 0;
  for (const m of [outer, inner]) {
    for (let i = 2; i < m.length - 1; i += 2) {
      const v = m[i + 1];
      assert.equal(v[0], 'case', `the branch for «${m[i]}» hands back a bare label — every branch must ask where the feature is`);
      assert.equal(v[1][0], '<=');
      assert.equal(v[1][1][0], 'distance', "the guard is MapLibre's own distance expression");
      assert.equal(v[1][1][1].type, 'Point');
      assert.ok(v[1][2] >= 2000 && v[1][2] <= 20000, "the radius is the record's, in metres");
      assert.equal(v[3][0], 'var', 'a feature outside the guard falls through, it does not get the era name');
      branches++;
    }
    assert.equal(m[m.length - 1][0], 'var', 'and an unmatched spelling falls through too');
  }
  assert.ok(branches > 200, `only ${branches} guarded branches`);

  const src = rd('js/hist-cities.js');
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

/* ⚠⚠⚠ (#R521) A FEATURE WITHOUT GEOMETRY CANNOT ANSWER THE QUESTION THE EXPRESSION NOW ASKS.
   MapLibre's Distance expression returns NaN unless `ctx.geometry()` and `ctx.canonicalID()` are
   both there, and `['<=', NaN, r]` is false — so an evaluation with bare `{ properties }` would
   report «the modern label» for EVERY city and look exactly like a working record with the era
   names silently missing. This builds the feature the way the symbol worker does: point geometry
   in tile units, plus the canonical tile it came from. */
/* ⚠⚠⚠ 8192 IS THE BUCKET'S NUMBER, NOT THE TILE'S. OpenMapTiles serves `place` at extent 4096,
   and MapLibre's own `loadGeometry` rescales every feature to EXTENT = 8192 before layout reads
   it. Measured against a live tile while verifying this round: feeding the raw 4096-extent
   geometry to the same compiled expression puts Volgograd half a tile from where it is and the
   guard rejects its own city — «Volgograd» instead of «Stalingrad», which is precisely the shape
   of a test that reports the feature working when it is not. */
const EXTENT = 8192;
function tileFeature(props, lonlat, z) {
  const [lon, lat] = lonlat;
  const n = Math.pow(2, z);
  const sx = (lon + 180) / 360 * n;
  const la = lat * Math.PI / 180;
  const sy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n;
  const x = Math.floor(sx), y = Math.floor(sy);
  return {
    canonical: { z, x, y },
    feature: { type: 1, properties: props, geometry: [[{ x: Math.round((sx - x) * EXTENT), y: Math.round((sy - y) * EXTENT) }]] },
  };
}
/* where the record says a city is — so a test asserts against the shipped coordinate, not a
   number retyped here that could drift away from it */
const where = (id) => { const c = byId.get(id); assert.ok(c, `${id} is in the record`); return [c.lon, c.lat]; };

/* ⚠ MEMOISED ON THE ARRAY ITSELF. `textField` caches, so repeated calls hand back the very same
   expression — but parsing 1 400 guarded branches is ~1.3 s, and a test that re-parsed it per
   assertion spent half a minute proving the same style valid over and over. */
const compiled = new Map();
function compile(e) {
  if (compiled.has(e)) return compiled.get(e);
  const c = createExpression(e, { type: 'string', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
  assert.equal(c.result, 'success', 'MapLibre rejected the expression: ' + JSON.stringify(c.value && c.value.map ? c.value.map((x) => x.message) : c.value));
  compiled.set(e, c.value);
  return c.value;
}
async function buildExpr(dateISO) {
  const ctx = boot(dateISO);
  await ctx.window.IntMapHistCities.ensure();
  return ctx.window.IntMapHistCities.textField(BASE, 'en', 'ui');
}
/* `lonlat` is where the tile drew this label. It is required: the whole point of #R521 is that
   the same spelling in two places is two different answers. */
function evalAt(ctx, props, lonlat, lang, z) {
  const t = tileFeature(props, lonlat, z || 6);
  return compile(ctx.window.IntMapHistCities.textField(BASE, lang || 'en', 'ui'))
    .evaluate({ zoom: z || 6 }, t.feature, {}, t.canonical);
}

test('⑦ the shipped module answers, and MapLibre accepts and evaluates what it answers', async () => {
  const ctx = boot('1942-09-13');
  await ctx.window.IntMapHistCities.ensure();
  assert.ok(ctx.window.IntMapHistCities.ready(), 'the record loaded');
  assert.ok(ctx.window.IntMapHistCities.count() >= 300, 'and it is the whole record');

  const VLG = where('volgograd');
  /* the tile carries the modern English name → the era name comes out */
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd', name: 'Волгоград' }, VLG), 'Stalingrad');
  /* …and the same city reached through the LOCAL name alone, which is the second match */
  assert.equal(evalAt(ctx, { name: 'Волгоград' }, VLG), 'Stalingrad');
  /* …in the reader's own language */
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd' }, VLG, 'jp'), 'スターリングラード');
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd' }, VLG, 'ru'), 'Сталинград');
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd' }, VLG, 'ko'), '스탈린그라드');
  /* a language the row does not spell out falls to the Latin form, which is what the live map
     already does for a city OSM carries no tag for — not to some other language's word */
  assert.equal(evalAt(ctx, { 'name:en': 'Ilebo' }, where('ilebo'), 'ko'), 'Port-Francqui');

  /* ⚠ AND EVERYTHING ELSE ON EARTH IS UNTOUCHED — the fall-through is the base expression */
  assert.equal(evalAt(ctx, { 'name:en': 'Paris', name: 'Paris' }, [2.35, 48.86]), 'Paris');
  assert.equal(evalAt(ctx, { 'name:latin': 'Yokohama', name: '横浜市' }, [139.64, 35.44]), 'Yokohama');
  assert.equal(evalAt(ctx, { name: '名古屋市' }, [136.91, 35.18]), '名古屋市');

  /* ⚠ …AND THE SAME SPELLING AT THE WRONG PLACE IS NOT THIS CITY. Every assertion above would
     pass on a build with no guard at all; this one is the difference. */
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd', name: 'Волгоград' }, [37.62, 55.75]), 'Volgograd',
    'a feature spelled Volgograd in Moscow is not Stalingrad');

  /* the zoom the label first appears at (`ofm-city` is minzoom 3) quantises tile geometry most
     coarsely — 4.9 km per unit at z3 — so the guard has to survive it */
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd' }, VLG, 'en', 3), 'Stalingrad');
  assert.equal(evalAt(ctx, { 'name:en': 'Volgograd' }, VLG, 'en', 14), 'Stalingrad');
});

/* ══ ⚠⚠⚠ ⑩ THE THREE PAIRS THAT WERE ACTUALLY WRONG ════════════════════════════════════════════
   These are not hypotheticals. Each line below is a city that the map relabelled with a different
   city's history for five rounds, with `npm test`, `check:histcities` and CI green throughout —
   because identity was a spelling. The right-hand member of each pair must come out UNCHANGED. */
test('⑩ a namesake elsewhere on Earth keeps its own name', async () => {
  const y1950 = boot('1950-06-15');
  await y1950.window.IntMapHistCities.ensure();
  /* 高知市, Japan. The reported bug: it read コーチン. GeoNames files it as «Kōchi» with a macron
     and OSM tags it `name:en=Kochi`, so neither the record's gazetteer nor its language filter
     could see the collision — only the 6 900 km could. */
  assert.equal(evalAt(y1950, { 'name:en': 'Kochi', name: 'Kochi' }, where('kochi')), 'Cochin');
  assert.equal(evalAt(y1950, { 'name:en': 'Kochi', name: '高知市' }, [133.5311, 33.5597]), 'Kochi');
  assert.equal(evalAt(y1950, { name: '高知市' }, [133.5311, 33.5597], 'jp'), '高知市');

  /* Kirov. Two of them, both `place=town` in OSM, both over the 20 000 the old gate asked about —
     and the smaller one was absent from the gate's evidence because a more populous homonym had
     already won its slot in data/gazetteer-world.json.gz. */
  const y1930 = boot('1930-06-15');
  await y1930.window.IntMapHistCities.ensure();
  assert.equal(evalAt(y1930, { 'name:en': 'Kirov', name: 'Киров' }, where('kirov-vyatka')), 'Vyatka');
  assert.equal(evalAt(y1930, { 'name:en': 'Kirov', name: 'Киров' }, [34.3, 54.08]), 'Kirov',
    'Kirov in Kaluga oblast was never Vyatka');

  /* Linden. Guyana's is 44 690 people and New Jersey's 42 021 — the population sort that decides
     which one survives into the news locator's gazetteer is a coin toss between them. */
  const y1960 = boot('1960-06-15');
  await y1960.window.IntMapHistCities.ensure();
  assert.equal(evalAt(y1960, { 'name:en': 'Linden' }, where('linden-gy')), 'Mackenzie (Guyana)');
  assert.equal(evalAt(y1960, { 'name:en': 'Linden' }, [-74.2446, 40.6220]), 'Linden',
    'Linden, New Jersey was never Mackenzie');
});

test('⑧ a live clock changes nothing at all, and the three named cities answer on their years', async () => {
  const live = boot(null);
  await live.window.IntMapHistCities.ensure();
  assert.equal(live.window.IntMapHistCities.textField(BASE, 'en', 'ui'), BASE,
    'when the clock is live the base expression is handed back by identity — not a rebuilt copy');

  const edo = boot('1867-06-15');
  await edo.window.IntMapHistCities.ensure();
  assert.equal(evalAt(edo, { 'name:en': 'Tokyo', name: '東京' }, where('tokyo')), 'Edo');
  assert.equal(evalAt(edo, { name: '東京' }, where('tokyo'), 'jp'), '江戸');
  assert.equal(evalAt(edo, { 'name:en': 'Istanbul' }, where('istanbul')), 'Constantinople');
  assert.equal(evalAt(edo, { 'name:en': 'Kaliningrad' }, where('kaliningrad')), 'Königsberg');
  /* ⚠ Korolyov was ALSO called Kaliningrad, 1 200 km away — the second Kaliningrad on a Soviet
     map. Position is the only thing that has ever been able to tell those two apart. */
  assert.equal(evalAt(edo, { 'name:en': 'Kaliningrad' }, where('korolyov')), 'Kaliningrad');

  const now2 = boot('2010-06-15');
  await now2.window.IntMapHistCities.ensure();
  assert.equal(evalAt(now2, { 'name:en': 'Tokyo', name: '東京' }, where('tokyo')), 'Tokyo', 'Edo is not still on the map in 2010');
  assert.equal(evalAt(now2, { 'name:en': 'Volgograd' }, where('volgograd')), 'Volgograd');
  /* ⚠ THE ONE THE BORDER LAYER COULD NOT HAVE DONE: CShapes ends in 2019, so a gate on
     IntMapTimeBorders.active() would answer «Astana» here. The clock knows better. */
  const y2020 = boot('2020-06-15');
  await y2020.window.IntMapHistCities.ensure();
  assert.equal(evalAt(y2020, { 'name:en': 'Astana' }, where('astana')), 'Nur-Sultan');
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
  /* the base is the value bound by the OUTER `let`, which is what every guarded branch and both
     matches ultimately fall through to */
  assert.deepEqual(asEn[2], ['coalesce', ['get', 'name:en'], ['get', 'name']]);
  assert.deepEqual(asLocal[2], ['get', 'name']);
  /* the same call twice IS cached — the array comes back by identity */
  const again = T.textField(['get', 'name'], 'en', 'local');
  assert.equal(again, asLocal, 'an unchanged call is served from the cache');
});

/* ══ ⚠⚠⚠ ⑪ THE SAME PROPERTY, OVER EVERY ROW AND EVERY SPELLING ══════════════════════════════
   ⑩ names three pairs because three pairs were reported. This asks the question of the whole
   record, against the shipped evidence — and it asks the evidence to prove itself first.

   ⚠ THE FIRST ASSERTION IS THAT THE ORACLE IS NOT EMPTY. #R427's gate was not wrong about its
   rule; it was wrong about its evidence. data/gazetteer-world.json.gz keeps `the more populous
   homonym` and drops the rest, so «is there another city called Kirov?» was being asked of a file
   from which the other Kirov had been deleted, and the answer came back «no» forever. A uniqueness
   test whose oracle has had uniqueness imposed on it passes for the same reason a scale with no
   pan reads zero — so before believing that nothing collides, make the file show the collisions. */
test('⑪ the homonym index carries the collisions, and no row\'s guard reaches one', () => {
  const idx = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data/histcities-homonyms.json.gz'))).toString('utf8'));
  const R = Math.PI / 180;
  const km = (aLon, aLat, bLon, bLat) => {
    const dLat = (bLat - aLat) * R, dLon = (bLon - aLon) * R;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * R) * Math.cos(bLat * R) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
  };
  const rows = (k) => (idx.keys[k] || []).map((h) => ({ name: h[0], cc: h[1], lon: h[2], lat: h[3], pop: h[4], fcode: h[5], field: h[6] }));

  /* ① the evidence contains the three cities the old oracle had dropped */
  const has = (k, cc, near) => rows(k).some((h) => h.cc === cc && km(h.lon, h.lat, near[0], near[1]) < 25);
  assert.ok(has('Kochi', 'JP', [133.5311, 33.5597]), 'the index must carry Kochi, Japan — the collision the record collides with');
  assert.ok(has('Kirov', 'RU', [34.3, 54.08]), 'the index must carry Kirov in Kaluga oblast');
  assert.ok(has('Linden', 'US', [-74.2446, 40.6220]), 'the index must carry Linden, New Jersey');

  /* ② every spelling the record joins on is resolved in it — a key the index does not cover is a
     key nothing has checked, which is how «unproven» used to be counted and shipped */
  for (const c of DATA.cities) for (const k of c.k) {
    assert.ok(Object.prototype.hasOwnProperty.call(idx.keys, k), `«${k}» (${c.id}) is not covered by the homonym index`);
  }

  /* ③ …and no city's guard reaches a settlement that is not that city. A namesake under its OWN
     name inside the guard is a live mislabel; one that differs in country is a different place
     whatever its population. Both are the shape that produced コーチン. */
  let checked = 0, guarded = 0;
  for (const c of DATA.cities) {
    for (const k of c.k) {
      const inside = rows(k).filter((h) => km(c.lon, c.lat, h.lon, h.lat) * 1000 <= c.g);
      for (const h of inside) {
        checked++;
        if (h.cc !== c.cc) {
          /* a border can run through one town (Valga/Valka is 1.2 km); what may not happen is a
             tile that CARRIES the spelling for the other side, and that is what `field` says */
          assert.equal(h.field, 'alt',
            `${c.id}: ${h.name} (${h.cc}) is inside the ${(c.g / 1000).toFixed(1)} km guard and carries «${k}» as its own ${h.field}`);
        }
      }
      const primary = inside.filter((h) => h.field !== 'alt');
      for (const a of primary) for (const b of primary) {
        assert.ok(km(a.lon, a.lat, b.lon, b.lat) <= 3,
          `${c.id}: «${k}» names both ${a.name} (${a.cc}) and ${b.name} (${b.cc}) inside the guard, ${km(a.lon, a.lat, b.lon, b.lat).toFixed(1)} km apart — those are two cities`);
      }
      guarded += rows(k).length - inside.length;
    }
  }
  assert.ok(checked > 0, 'the index resolved nothing at all — it is not the evidence it claims to be');
  assert.ok(guarded > 200, `only ${guarded} namesakes were excluded by a guard; the index is too thin to prove anything`);
});
