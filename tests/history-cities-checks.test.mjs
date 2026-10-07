/* ============================================================================
 *  IntMap · historical settlement names — the record, whose city a spelling is, what the label and
 *  the popup say in a given year, and the licences of what is inside
 *  (data/hist-cities.json · js/hist-cities.js · scripts/histcities/*)
 *  (consolidated from tests/r427-checks, r689-chronos-coverage, r705-chronos-city-coverage (its
 *   homonym and Kirov tests), r711-historical-city-identity, r712-historical-city-recovery and
 *   r713-hist-coverage ①; each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  #R427 — the settlement labels travel in time; #R521 — and the label that travels is THIS city's,
 *  not its namesake's: 高知市 read コーチン for five rounds while every gate was green, because identity
 *  was a spelling. The guard is MapLibre's own `distance` expression, so the shipped module is run and
 *  its output evaluated by MapLibre's own parser over features carrying REAL TILE GEOMETRY.
 *  #R689 — a licence is a VALUE (LIC()), open starts cannot be bounded from upstream and are disclosed
 *  as `[?]`, and dated evidence answers where a city has it. #R705 — every shared spelling keeps each
 *  place's own name in the map and the lookup. #R711 — a nearby neighbourhood's history cannot rename
 *  the city around it. #R712 — a failed load of the record is retried on the next clock request.
 *  #R713 ① — the sweep asks for every element kind the coordinate reader understands (`center` is a
 *  thing only a WAY or a RELATION has, and the query asked only for `node`).
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
import { importModule } from './helpers/import-module.mjs';
import { LIC } from '../scripts/histcities/lang.mjs';
import { loadRecord } from '../scripts/histcities-record.mjs';
import { pageCodes, pageDoc } from '../scripts/i18n-pages-audit.mjs';
import { coordOf, OHM_PLACE_KINDS, OHM_PLACE } from '../scripts/histcities/harvest.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const DATA = JSON.parse(rd('data/hist-cities.json'));
const RECORD = DATA;

/* ══ #R427 / #R521 ═══════════════════════════════════════════════════════════════════════════ */
/* ⚠ AN ASSERTION ABOUT WHAT THE CODE DOES MAY NOT READ THE COMMENTS. Both files below EXPLAIN in
   prose why they do not do a thing, and a bare `includes()` finds the explanation and calls it the
   deed — which is [[intmap-recurring-lessons]]: a spelling is not a mechanism. */
const code = (p) => codeOnly(rd(p));
const LANGS = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];

const byId = new Map(DATA.cities.map((c) => [c.id, c]));
const dnum = (y, m, d) => y * 10000 + m * 100 + d;
function nameAt(city, d) {
  for (const e of city.e) if ((!e.f || d >= e.f) && (!e.t || d <= e.t)) return e.n;
  return null;
}

test('#R427 ① the record is shipped, is several hundred cities, and is complete in nine languages', () => {
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
      /* ⚠⚠⚠ (#R717) THIS USED TO REQUIRE A COLUMN FOR ALL NINE, AND THAT IS WHAT THE DEFECT LOOKED
         LIKE FROM IN HERE. The columns were there — the build filled the ones nobody had written
         by copying the English spelling — so this assertion passed on 67,622 statements that no
         source makes, and the bitmask `a` beside each of them said so the whole time. What every
         reader is actually owed is an ANSWER, not a column: js/hist-cities.js resolves
         `n[lang] || n.en`, so the invariant is that `en` is always there, and that a column which
         does exist is either attested or says something different from `en`. A column repeating
         `en` under a clear bit is the false claim, and it now fails. */
      assert.ok(e.n.en, `${c.id}: era has no English form, so eight of nine readers get nothing`);
      assert.ok(Number.isInteger(e.a) && e.a >= 0 && e.a < (1 << LANGS.length), `${c.id}: era «${e.n.en}» has no attestation bitmask`);
      LANGS.forEach((lg, i) => {
        if (lg === 'en' || e.n[lg] === undefined) return;
        assert.ok(e.n[lg] !== e.n.en || ((e.a >> i) & 1),
          `${c.id}: era «${e.n.en}» ships a ${lg} column that repeats the English spelling while its own bit says no source wrote it`);
      });
      /* an era that merely restates today's label would be a row that changes nothing */
      assert.ok(!c.k.includes(e.n.en), `${c.id}: era name «${e.n.en}» is also a modern key`);
    }
  }
  assert.ok(eras >= 300, `only ${eras} historical names`);
});

test('#R427 ② the three places the request named answer with the names it named', () => {
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

test('#R427 ③ shared spellings always refer to spatially separated cities', () => {
  const seen = new Map();
  for (const c of DATA.cities) {
    assert.equal(new Set(c.k).size, c.k.length, `${c.id}: repeated key within row`);
    for (const k of c.k) {
      const prior = seen.get(k) || [];
      for (const p of prior) {
        const rad = Math.PI / 180;
        const a = Math.sin((c.lat-p.lat)*rad/2)**2 + Math.cos(c.lat*rad)*Math.cos(p.lat*rad)*Math.sin((c.lon-p.lon)*rad/2)**2;
        const distance = 6371000 * 2 * Math.asin(Math.sqrt(a));
        assert.ok(distance > c.g + p.g, `${k}: ${p.id} and ${c.id} have overlapping guards`);
      }
      seen.set(k, [...prior, c]);
    }
  }
});

test('#R427 ④ every branch of the built expression is gated on position, and falls through to the ordinary label', async () => {
  /* ⚠⚠⚠ (#R488/#R494's LESSON) THIS ASKS THE BUILT EXPRESSION, NOT THE SOURCE THAT BUILDS IT.
     #R427's version of this test pinned the spellings `byLocal.push(base)` and
     `['match', ['coalesce', ['get', 'name:en']` — and every one of those spellings was still
     present, and still green, while 高知市 was being relabelled コーチン. A regex over source can
     only say that a line survived a refactor; it cannot say that the expression means anything.
     So: build the real thing and walk it. */
  const built = await buildExpr('1942-09-13');
  /* ['let', BASE, base, ['let', G0, case0, G1, case1, …, ['let', EN, byEn, LOCAL, byLocal, pick]]]
     — each group's guarded `case` is bound ONCE and both name fields refer to it (the two matches
     used to carry a copy each, which doubled what MapLibre parses; see js/hist-cities.js). */
  assert.equal(built[0], 'let', 'the fall-through values are bound once, not copied per branch');
  const groupsLet = built[3];
  assert.equal(groupsLet[0], 'let');
  const bound = new Map();
  for (let i = 1; i < groupsLet.length - 1; i += 2) bound.set(groupsLet[i], groupsLet[i + 1]);
  const pickLet = groupsLet[groupsLet.length - 1];
  assert.equal(pickLet[0], 'let');
  const outer = pickLet[2], inner = pickLet[4], pick = pickLet[5];
  /* ⚠ compared as text: the expression was built inside the vm sandbox, so its arrays come from
     another realm and deepStrictEqual would fail on the prototype while printing an identical diff */
  assert.equal(JSON.stringify(outer[1]), JSON.stringify(['coalesce', ['get', 'name:en'], '']), 'the first match reads name:en');
  assert.equal(JSON.stringify(inner[1]), JSON.stringify(['coalesce', ['get', 'name'], '']), 'the second match reads the local name');
  /* name:en's answer first, then the local name's, then the ordinary label — never a guess */
  assert.equal(JSON.stringify(pick), JSON.stringify(['case', ['!=', ['var', pickLet[1]], ''], ['var', pickLet[1]],
    ['!=', ['var', pickLet[3]], ''], ['var', pickLet[3]], ['var', built[1]]]), 'the answer order is name:en, name, ordinary label');
  let branches = 0;
  const used = new Set();
  for (const m of [outer, inner]) {
    for (let i = 2; i < m.length - 1; i += 2) {
      const ref = m[i + 1];
      assert.equal(ref[0], 'var', `the branch for «${m[i]}» must refer to its group's guarded case, not carry a copy`);
      const v = bound.get(ref[1]);
      assert.ok(v, `«${ref[1]}» is bound`);
      assert.equal(v[0], 'case', `the branch for «${m[i]}» hands back a bare label — every branch must ask where the feature is`);
      for (let j = 1; j < v.length - 1; j += 2) {
        assert.equal(v[j][0], '<=');
        assert.equal(v[j][1][0], 'distance', "the guard is MapLibre's own distance expression");
        assert.equal(v[j][1][1].type, 'Point');
        assert.ok(v[j][2] >= 2000 && v[j][2] <= 20000, "the radius is the record's, in metres");
      }
      assert.equal(v[v.length - 1], '', 'a feature outside the guard finds nothing here and falls through, it does not get the era name');
      used.add(ref[1]);
      branches++;
    }
    assert.equal(m[m.length - 1], '', 'and an unmatched spelling finds nothing, so it falls through too');
  }
  assert.equal(used.size, bound.size, 'every bound group is reached from a spelling');
  assert.ok(branches > 200, `only ${branches} guarded branches`);

  /* EVALUATED (was: regexes for `if (!traveling()) return base;`, the absence of IntMapTimeBorders and
     `window.IntMapTime.on(`). */
  const live = boot(null);
  await live.window.IntMapHistCities.ensure();
  assert.equal(live.window.IntMapHistCities.textField(BASE, 'en', 'ui'), BASE, 'a live clock hands the base expression straight back');
  /* ⚠ the gate on the CLOCK, not on the border layer: IntMapTimeBorders.active() is false for 2020+
     because CShapes ends in 2019, and Nur-Sultan → Astana is 2022 — so the module is run beside a
     border layer that says it is NOT active, and the 2020 name must still come out. */
  const y2020 = boot('2020-06-15');
  y2020.IntMapTimeBorders = { active: () => false, current: () => null };
  await y2020.window.IntMapHistCities.ensure();
  assert.equal(evalAt(y2020, { 'name:en': 'Astana' }, where('astana')), 'Nur-Sultan',
    'js/hist-cities.js must not gate on the border layer — a city renamed after 2019 would never show its era name');
  /* …and it subscribes to the clock: a year change must repaint (applyLabelLang is not otherwise
     called when a year moves) */
  const subs = [];
  let repaints = 0;
  const wired = boot('1942-09-13');
  wired.IntMapTime.on = (f) => subs.push(f);
  vm.runInContext(asClassicScript(rd('js/hist-cities.js')), wired);
  wired.applyLabelLang = () => { repaints++; };
  assert.ok(subs.length >= 1, 'the clock is subscribed to, or a year change never repaints');
  for (const f of subs) f({ isLive: false });
  assert.ok(repaints >= 1, 'the clock is subscribed to, or a year change never repaints');
});

test('#R427 ⑤ place-labels applies it to ofm-city and to nothing else', () => {
  /* ⚠ SPELLING, ON PURPOSE: js/place-labels.js `applyLabelLang` rewrites the live style's layers;
     «one call site, under an explicit ofm-city test» is a claim about that function's text. */
  const src = rd('js/place-labels.js');
  const m = src.match(/if\(id==='ofm-city'\)\{[^\n]*IntMapHistCities[^\n]*\}/);
  assert.ok(m, 'the era expression is applied under an explicit ofm-city test');
  /* the only mention of the module is that one line — a second call site would be a second owner */
  assert.equal((src.match(/IntMapHistCities/g) || []).length, 1,
    'exactly one call site; the record\'s collision exemptions are written against ofm-city\'s class filter');
  assert.match(src, /GE\(\)\.layers\.setLayout\(id,'text-field',_fld[,)]/, 'the wrapped expression is what is set');
});

test('#R427 ⑥ the module is imported eagerly, and the record is NOT', async () => {
  /* ⚠ SPELLING, ON PURPOSE, FOR THE BOOT HALF: src/main.js is the bundle's entry — «imported eagerly,
     and the 600-city record is not in the boot bundle» is a fact about its text. */
  assert.match(rd('src/main.js'), /import '\.\.\/js\/hist-cities\.js';/, 'the subscriber has to exist before the clock moves');
  assert.ok(!/hist-cities\.json/.test(code('src/main.js')), 'the 600-city record must not be in the boot bundle');
  /* EVALUATED (was: regexes for `fetch(url)`, the success cache and the shared pending request).
     Failure must permit a later retry — #R712's recovery tests below run those scenarios. */
  const asked = [];
  const ctx = boot('1942-09-13');
  ctx.fetch = (url) => { asked.push(String(url)); return Promise.resolve({ ok: true, json: () => Promise.resolve(DATA) }); };
  const T = ctx.window.IntMapHistCities;
  const p1 = T.ensure(), p2 = T.ensure();
  assert.equal(p1, p2, 'concurrent readers share the pending request');
  const got = await p1;
  assert.equal(asked.length, 1, 'concurrent readers share the pending request');
  assert.ok(/data\/hist-cities\.json$/.test(asked[0]), 'the record is fetched');
  assert.equal(got, DATA);
  assert.equal(await T.ensure(), DATA, 'a successful record is cached');
  assert.equal(asked.length, 1, 'a successful record is cached');
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
  /* ⚠⚠⚠ (#R679) THE MESSAGE OF AN ASSERTION IS BUILT WHETHER OR NOT IT FAILS. This was
     `assert.equal(c.result, 'success', '…' + JSON.stringify(…))`, and on SUCCESS `c.value` is the
     compiled StyleExpression — no `.map`, so the ternary handed the whole object to JSON.stringify
     on every single call. That cost nothing while the label expression had a few hundred branches.
     This round took it to 2,126, and the string went past V8's maximum length: the check died with
     `RangeError: Invalid string length` while MapLibre was ACCEPTING the expression, which reads
     exactly like the renderer rejecting it. Measured: with the message built only on failure the
     same three checks pass and the file runs in 0.29 s instead of 13.8 s — the stringify WAS the
     runtime. ⚠ The lesson is not about this expression: an eagerly-built failure message is a cost
     paid on the happy path, and it grows with the data. */
  if (c.result !== 'success') {
    assert.fail('MapLibre rejected the expression: ' + JSON.stringify(c.value.map((x) => x.message)));
  }
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

test('#R427 ⑦ the shipped module answers, and MapLibre accepts and evaluates what it answers', async () => {
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
  assert.equal(evalAt(ctx, { 'name:en': 'Ilebo' }, where('ilebo'), 'ko'), 'Port-Francqui [?]');

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
   because identity was a spelling. Each member must retain its own history or modern fallback. */
test('#R427 ⑩ a namesake elsewhere on Earth keeps its own name', async () => {
  const y1950 = boot('1950-06-15');
  await y1950.window.IntMapHistCities.ensure();
  /* 高知市, Japan. The reported bug: it read コーチン. GeoNames files it as «Kōchi» with a macron
     and OSM tags it `name:en=Kochi`, so neither the record's gazetteer nor its language filter
     could see the collision — only the 6 900 km could. */
  assert.equal(evalAt(y1950, { 'name:en': 'Kochi', name: 'Kochi' }, where('kochi')), 'Cochin [?]');
  assert.equal(evalAt(y1950, { 'name:en': 'Kochi', name: '高知市' }, [133.5311, 33.5597]), 'Kochi');
  assert.equal(evalAt(y1950, { name: '高知市' }, [133.5311, 33.5597], 'jp'), '高知市');

  /* Kirov. Two of them, both `place=town` in OSM, both over the 20 000 the old gate asked about —
     and the smaller one was absent from the gate's evidence because a more populous homonym had
     already won its slot in data/gazetteer-world.json.gz. */
  const y1930 = boot('1930-06-15');
  await y1930.window.IntMapHistCities.ensure();
  /* ══ ⚠⚠⚠ (#R679) THE DATED EVIDENCE ANSWERS, AND (#R689) IT NOW ANSWERS IN THE READER'S ══════
     LANGUAGE. Until #R679 the handwritten span for Kirov had an OPEN start, and `nameAt` reads an
     open start as «since the beginning of time» — so it answered every year below 1933, and every
     DATED span for the same place was discarded by the build as «already covered». Measured then:
     221 dated spans across 120 cities had been thrown away that way, including all ten of
     Pleiades' dated spans for Istanbul. The map said «Constantinople» in 300 BC.
     ⚠ THE RULE IS #R604's, RESTATED: an absent bound does not constrain that end — it is not a
     claim to occupy all of time. So dated evidence outranks an unbounded assertion.
     ⚠⚠⚠ AND THE COST #R679 ACCEPTED HERE IS GONE, WITHOUT ANYTHING BEING REORDERED. This line
     read «Вятка» — the dated span was attested in none of the nine languages, so an English reader
     got the Cyrillic form while the record held «Vyatka» on the very next span of the same city.
     #R679 tried three ways out and rejected all three on measurement, and all three worked by
     RANKING the spans differently, which is why all three risked putting «Constantinople» back in
     300 BC: ranking by attestation puts it back outright (the ancient evidence is attested in none
     of the nine); thresholding on how close two spans END has a 27-span band where genuine and
     duplicate renames are mixed, so the number would have no derivation; and «the last dated span
     before an open one is the same claim» costs 178 pre-1500 answers to buy 234 modern ones.
     ⚠ #R689 measured the residual instead of ranking it: over 1,634 instants, 67.6% of the answers
     whose winning span has no form in the reader’s language are cases where the two spans STATE THE
     SAME NAME. So a span may take a language column from an OVERLAPPING span of the same place that
     states the same name (scripts/build-hist-cities.mjs). Nothing is reordered — the span that
     answers 1930 is the same dated span as before — so 300 BC cannot come back, and the reader gets
     the spelling the record already had. ⚠ THE OVERLAP IS LOAD-BEARING: without it «Kirovo»
     (1934–1938) took Korean from «Kirovohrad» (1939–), i.e. the name it was about to be given.
     What is left after that is the honest residue — Hippo Regius beside Bône — where the two spans
     are DIFFERENT names and the era’s own name is the right answer. */
  assert.equal(evalAt(y1930, { 'name:en': 'Kirov', name: 'Киров' }, where('kirov-vyatka')), 'Vyatka');
  assert.equal(evalAt(y1930, { 'name:en': 'Kirov', name: 'Киров' }, [34.3, 54.08]), 'Песочня',
    'Kirov in Kaluga oblast retains its own attested history, never Vyatka');

  /* Linden. Guyana's is 44 690 people and New Jersey's 42 021 — the population sort that decides
     which one survives into the news locator's gazetteer is a coin toss between them. */
  const y1960 = boot('1960-06-15');
  await y1960.window.IntMapHistCities.ensure();
  assert.equal(evalAt(y1960, { 'name:en': 'Linden' }, where('linden-gy')), 'Mackenzie (Guyana) [?]');
  assert.equal(evalAt(y1960, { 'name:en': 'Linden' }, [-74.2446, 40.6220]), 'Linden',
    'Linden, New Jersey was never Mackenzie');
});

test('#R427 ⑧ a live clock changes nothing at all, and the three named cities answer on their years', async () => {
  const live = boot(null);
  await live.window.IntMapHistCities.ensure();
  assert.equal(live.window.IntMapHistCities.textField(BASE, 'en', 'ui'), BASE,
    'when the clock is live the base expression is handed back by identity — not a rebuilt copy');

  const edo = boot('1867-06-15');
  await edo.window.IntMapHistCities.ensure();
  assert.equal(evalAt(edo, { 'name:en': 'Tokyo', name: '東京' }, where('tokyo')), 'Edo');
  assert.equal(evalAt(edo, { name: '東京' }, where('tokyo'), 'jp'), '江戸');
  /* Pleiades explicitly bridges Constantinople / Istanbul. That source-supported
     identity keeps the dated Wikidata history reachable without donating unrelated
     GeoNames anchor names to neighborhoods.
     ⚠ (hist-findings-sweep) 1867 read «Цариград» — Wikidata's Bulgarian «official name» (1453–1923) outranked the
     written «Constantinople», whose start was left open. The written row now states both its spans (Byzantium from
     657 BC, Constantinople from 330), and a written dated span wins an overlap (build-hist-cities.mjs alreadyCovered). */
  assert.equal(evalAt(edo, { 'name:en': 'Istanbul' }, where('istanbul')), 'Constantinople');
  /* ⚠ AND THE HALF THAT RULE BOUGHT — the years no open-start span may answer any more. */
  const bc300 = boot('-000299-06-15');
  await bc300.window.IntMapHistCities.ensure();
  assert.equal(evalAt(bc300, { 'name:en': 'Istanbul' }, where('istanbul')), 'Byzantium',
    '300 BC read «Constantinople» until #R679 — an open start was being read as a claim on all of time');
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

test('#R427 ⑨ the cache is keyed on the base expression too, so a label-language switch is not stale', async () => {
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
test('#R427 ⑪ the homonym index carries the collisions, and no row\'s guard reaches one', () => {
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

/* ══ #R705 — every shared spelling keeps each place's own name ══════════════════════════════ */
const HC_CLASSIC = asClassicScript(rd('js/hist-cities.js'));
const byKey = new Map();
for (const c of DATA.cities) for (const k of c.k) byKey.set(k, [...(byKey.get(k) || []), c]);
const shared = [...byKey].filter(([, cities]) => cities.length > 1);
const BASE2 = ['coalesce', ['get', 'name:en'], ['get', 'name']];

function feature(spelling, lon, lat, local) {
  const z = 10, n = 2 ** z;
  const sx = (lon + 180) / 360 * n, r = lat * Math.PI / 180;
  const sy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const x = Math.floor(sx), y = Math.floor(sy);
  return [{ type: 1, properties: local ? { name: spelling } : { 'name:en': spelling },
    geometry: [[{ x: Math.round((sx - x) * 8192), y: Math.round((sy - y) * 8192) }]] }, { z, x, y }];
}

for (const year of [1500, 1900, 1930]) test(`#R705 homonyms: MapLibre and lookup preserve each place's ${year} name`, async () => {
  const date = new Date(`${year}-06-15T12:00:00Z`), stamp = year * 10000 + 615;
  const ctx = vm.createContext({ URL, console, document: { baseURI: 'https://example.invalid/' },
    fetch: async () => ({ ok: true, json: async () => DATA }) });
  ctx.window = ctx;
  ctx.IntMapTime = { isLive: () => false, when: () => date, on: () => {} };
  vm.runInContext(HC_CLASSIC, ctx);
  const api = ctx.IntMapHistCities;
  await api.ensure();
  const expression = api.textField(BASE2, 'en', 'ui');
  const parsed = createExpression(expression, { type: 'string', 'property-type': 'data-driven',
    expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
  if (parsed.result !== 'success') assert.fail(parsed.value.map(e => e.message).join('\n'));
  let checked = 0;
  for (const [spelling, cities] of shared) for (const c of cities) {
    const era = c.e.find(e => (!e.f || stamp >= e.f) && (!e.t || stamp <= e.t));
    const expected = era ? era.n.en + (era.f ? '' : ' [?]') : null;
    assert.equal(api.at(spelling, c.lon, c.lat, 'en'), expected, `${c.id}: lookup`);
    for (const local of [false, true]) {
      const [f, canonical] = feature(spelling, c.lon, c.lat, local);
      assert.equal(parsed.value.evaluate({ zoom: 10 }, f, {}, canonical), expected || spelling, `${c.id}: tile name field ${local}`);
    }
    checked++;
  }
  assert.ok(checked > 100, 'exercise actual shared-key places, including restored upstream rows');
  const [f, canonical] = feature('Kirov', 0, 0, false);
  assert.equal(parsed.value.evaluate({ zoom: 10 }, f, {}, canonical), 'Kirov');
  assert.equal(api.at('Kirov', 0, 0, 'en'), null);
});

test('#R705 Kirov in Kaluga retains the dated source record previously lost to its namesake', () => {
  const c = DATA.cities.find(c => c.id === 'wd-q153490');
  assert.ok(c);
  assert.ok(c.k.includes('Kirov'));
  assert.equal(c.e.find(e => e.f <= 19300615 && e.t >= 19300615).n.ru, 'Песочня');
  assert.ok(DATA.cities.find(c => c.id === 'kirov-vyatka').k.includes('Kirov'));
});


/* ══ #R712 — a failed load of the record recovers ══════════════════════════════════════════ */
const payload = { cities: [{ id: 'source-city', k: ['Modern'], lon: 10, lat: 20, g: 1000,
  e: [{ f: 18000101, t: 18991231, n: { en: 'Historical' } }] }] };
const ok = () => ({ ok: true, json: async () => payload });
/* (module-graph) js/hist-cities.js is IMPORTED, fresh per runtime, with the clock stub handed at its
   chronos.js import edge; `context` is the window it publishes IntMapHistCities on */
async function runtime(fetcher) {
  let clock, calls = 0, redraws = 0;
  const context = {};
  context.window = context;
  await importModule('js/hist-cities.js', {
    globals: { window: context, document: { baseURI: 'https://example.invalid/' },
      fetch: (...args) => { calls++; return fetcher(...args); } },
    mocks: { 'js/chronos.js': { IntMapTime: { isLive: () => false, when: () => new Date('1850-06-15T12:00:00Z'), on: fn => { clock = fn; } } } },
  });
  const api = context.IntMapHistCities;
  context.applyLabelLang = () => { redraws++; api.textField(['get', 'name'], 'en', 'ui'); api.ensure(); };
  return { api, calls: () => calls, redraws: () => redraws, tick: () => clock({ isLive: false }) };
}

for (const [name, fail] of [
  ['HTTP failure', () => Promise.resolve({ ok: false })],
  ['network rejection', () => Promise.reject(new Error('offline'))],
  ['invalid JSON', () => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('partial'); } })],
  ['empty record', () => Promise.resolve({ ok: true, json: async () => ({ cities: [] }) })],
  ['synchronous fetch exception', () => { throw new Error('unavailable'); }],
]) {
  test(`#R712 historical city names recover after ${name} on the next clock request`, async () => {
    let attempt = 0;
    const h = await runtime(() => ++attempt === 1 ? fail() : Promise.resolve(ok()));
    assert.equal(await h.api.ensure(), null);
    assert.equal(h.api.ready(), false);
    h.tick();
    await h.api.ensure();
    assert.equal(h.calls(), 2);
    assert.equal(h.api.at('Modern', 10, 20, 'en'), 'Historical');
    assert.equal(h.api.count(), 1);
    assert.equal(await h.api.ensure(), payload);
    assert.equal(h.calls(), 2);
  });
}

test('#R712 concurrent requests and redraw re-entry share one load; explicit retries recover', async () => {
  let resolveFetch;
  const h = await runtime(() => new Promise(resolve => { resolveFetch = resolve; }));
  const first = h.api.ensure();
  assert.equal(first, h.api.ensure());
  h.tick();
  await Promise.resolve();
  assert.equal(h.calls(), 1);
  resolveFetch({ ok: false });
  await first;
  const second = h.api.ensure();
  assert.equal(second, h.api.ensure());
  await Promise.resolve();
  resolveFetch(ok());
  await second;
  assert.equal(h.calls(), 2);
  assert.equal(h.redraws(), 2); // clock redraw plus the successful load redraw
  assert.equal(h.api.ready(), true);
});

/* ══ #R711 — a neighbourhood's history cannot rename the city around it ═════════════════════ */
test('#R711 a nearby neighborhood history cannot rename Kagoshima in lookup, popup or map label', async () => {
  const ctx = vm.createContext({ URL, console, document: { baseURI: 'https://example.invalid/' }, fetch: async () => ({ ok: true, json: async () => DATA }) });
  ctx.window = ctx;
  ctx.IntMapTime = { isLive: () => false, when: () => new Date('1800-06-15T12:00:00Z'), on: () => {} };
  vm.runInContext(asClassicScript(rd('js/hist-cities.js')), ctx);
  const api = ctx.IntMapHistCities;
  await api.ensure();
  const lon = 130.55814, lat = 31.56018;
  assert.equal(api.at('Kagoshima', lon, lat, 'jp'), null);
  assert.equal(api.forFeature({ layer: { id: 'ofm-city' }, geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { 'name:en': 'Kagoshima', name: '鹿児島市' } }, 'jp', 'ui'), null);
  const parsed = createExpression(api.textField(['get', 'name'], 'jp', 'ui'), { type: 'string', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
  assert.equal(parsed.result, 'success');
  const z = 10, n = 2 ** z, sx = (lon + 180) / 360 * n, r = lat * Math.PI / 180, sy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  const x = Math.floor(sx), y = Math.floor(sy);
  assert.equal(parsed.value.evaluate({ zoom: z }, { type: 1, properties: { 'name:en': 'Kagoshima', name: '鹿児島市' }, geometry: [[{ x: Math.round((sx - x) * 8192), y: Math.round((sy - y) * 8192) }]] }, {}, { z, x, y }), '鹿児島市');
  const neighborhood = DATA.cities.find(c => c.id === 'wd-q17226549');
  assert.ok(neighborhood, 'retain the authentic neighborhood record');
  assert.equal(api.at('Hirano-chō', neighborhood.lon, neighborhood.lat, 'jp'), '平之馬場町 [?]');
  for (const [id, wrong, actual, year] of [
    ['pl-383580', 'Pino Torinese', 'Turin', 100],
    ['ohm-2093450534', 'Dearborn Heights', 'Dearborn', 1920],
  ]) {
    const place = DATA.cities.find(c => c.id === id);
    assert.ok(place, id);
    ctx.IntMapTime.when = () => new Date(`${String(year).padStart(4, '0')}-06-15T12:00:00Z`);
    assert.ok(api.at(actual, place.lon, place.lat, 'en'), id + ': source identity remains reachable');
    assert.equal(api.at(wrong, place.lon, place.lat, 'en'), null, id + ': nearby place must retain its identity');
  }

});


test('#R711 identity keys never inherit a containing city solely through its alternate names', async () => {
  const { identityKeys, identityMatchRank } = await import('../scripts/histcities/upstream.mjs');
  const neighborhood = ['Hirano-chō', '平之町'];
  const city = { name: 'Kagoshima', ascii: 'Kagoshima', alts: ['Hirano-chō'] };
  assert.deepEqual(identityKeys(neighborhood, city), neighborhood);
  assert.deepEqual(identityKeys(['São Paulo'], { name: 'São Paulo', ascii: 'Sao Paulo' }), ['São Paulo', 'Sao Paulo']);
  const source = ['Turin'];
  assert.ok(identityMatchRank(source, { name: 'Torino', ascii: 'Torino', alts: ['Turin'] }) < identityMatchRank(source, { name: 'Turino', ascii: 'Turino', alts: [] }));
  assert.deepEqual(identityKeys(['Cambridge'], { name: 'East Cambridge', ascii: 'East Cambridge' }), ['Cambridge']);
});

test('#R711 all harvested relabel keys have source-name evidence before build-time merging', async () => {
  const { loadRecord } = await import('../scripts/histcities-record.mjs');
  const { fold } = await import('../scripts/histcities/upstream.mjs');
  const { rows } = await loadRecord();
  for (const row of rows.filter(r => r.derived)) {
    assert.ok(row.ev.n?.length, row.id + ': evidence');
    const names = new Set(row.ev.n.map(fold));
    for (const key of row.keys) assert.ok(names.has(fold(key)), row.id + ': unsupported key ' + key);
  }
});


test('#R711 a later source alias bridge preserves identity regardless of enumeration order', async () => {
  const { loadRecord, km, ANCHOR_TOL_KM } = await import('../scripts/histcities-record.mjs');
  const { identityHosts, fold } = await import('../scripts/histcities/upstream.mjs');
  const { rows } = await loadRecord();
  const ids = ['istanbul', 'wd-q16869', 'pl-520998'];
  const subjects = ids.map(id => rows.find(r => r.id === id));
  assert.ok(subjects.every(Boolean));
  const priority = new Map(subjects.map((r, i) => [r, i]));
  const different = { id: 'nearby-neighborhood', keys: ['Hirano-chō'], lon: subjects[0].lon, lat: subjects[0].lat };
  const distant = { id: 'distant-namesake', keys: subjects[0].keys, lon: 0, lat: 0 };
  priority.set(different, 3); priority.set(distant, 4);
  const connected = (a, b) => km(a.lon, a.lat, b.lon, b.lat) <= ANCHOR_TOL_KM && a.keys.some(k => b.keys.some(j => fold(k) === fold(j)));
  const permutations = a => a.length ? a.flatMap((r, i) => permutations(a.filter((_, j) => j !== i)).map(tail => [r, ...tail])) : [[]];
  for (const order of permutations(subjects)) {
    const hosts = identityHosts([...order, different, distant], fold, connected, (a, b) => priority.get(a) - priority.get(b));
    for (const r of subjects) assert.equal(hosts.get(r), subjects[0], r.id + ': source precedence survives bridge order');
    assert.equal(hosts.get(different), different, 'proximity without a source alias is not identity');
    assert.equal(hosts.get(distant), distant, 'a shared spelling at a different place is not identity');
  }
});

/* ══ #R713 ① — the sweep asks for every shape the receiver can read ════════════════════════ */
/* ── ① the sweep asks for every shape the receiver can read ───────────────── */

test('R713 ① every element kind the coordinate reader understands is a kind the sweep asks for', () => {
  /* THE DEFECT, STATED AS ITSELF: the reader understood centres and the query asked for nodes,
     so the half of the reader that handles an outline could not be reached by anything.
     ⚠ Measured from BOTH sides rather than by reading either query's spelling (#R488): what a
     kind can yield is decided by EVALUATING `coordOf`, not by matching text. */
  const shapes = {
    node: { type: 'node', lon: 12.5, lat: 41.9 },
    way: { type: 'way', center: { lon: 12.5, lat: 41.9 } },
    relation: { type: 'relation', center: { lon: 12.5, lat: 41.9 } },
  };
  for (const [kind, el] of Object.entries(shapes)) {
    if (!coordOf(el)) continue;              /* the reader cannot use it — nothing to ask for */
    assert.ok(OHM_PLACE_KINDS.includes(kind),
      'coordOf() reads a coordinate off a ' + kind + ', so the OHM sweep must ask for ' + kind + 's');
  }
  /* and the reader really does understand all three — otherwise the loop above proves nothing */
  assert.deepEqual(Object.keys(shapes).filter((k) => coordOf(shapes[k])), ['node', 'way', 'relation']);
});

test('R713 ① an element with neither a coordinate nor a centre is refused, not defaulted', () => {
  assert.equal(coordOf({ type: 'way', tags: { name: 'x' } }), null);
  assert.equal(coordOf({ type: 'node', lon: 1 }), null);        /* half a coordinate is not one */
  assert.equal(coordOf(null), null);
  assert.deepEqual(coordOf({ type: 'node', lon: 0, lat: 0 }), [0, 0]);   /* ⚠ 0 IS a coordinate */
});

test('R713 ① both sweeps ask about the same kind of place, spelled once', () => {
  assert.match(OHM_PLACE, /city/);
  assert.match(OHM_PLACE, /hamlet/);
  /* ⚠ SPELLING, ON PURPOSE: «spelled ONCE» is itself the claim — a second copy of the filter is a
     second answer (#R536) — and it is counted over the harvest script's code. */
  const src = codeOnly(readFileSync(join(ROOT, 'scripts/histcities/harvest.mjs'), 'utf8'));   /* ⚠ #R621: strip comments first */
  const spelled = src.split(OHM_PLACE).length - 1;
  assert.equal(spelled, 1,
    'the place filter is spelled ' + spelled + ' times outside comments; it belongs in OHM_PLACE '
    + 'alone, because a second copy is a second answer (#R536)');
});


/* ══ #R689 — the coverage #R679 left in numbers, and the credit it left unpaid ═════════════ */
/* ── ① A LICENCE IS A VALUE, AND IT REFUSES THE READINGS THAT LET #R679 THROUGH ─────────────
   ⚠ THE FUNCTION IS EVALUATED, not read (#R505). What is asserted is what LIC() DECIDES. */
test('r681 ① LIC() refuses a licence that does not say what it costs', () => {
  const ok = { publisher: 'Upstream', licence: 'CC BY 4.0', url: 'https://example.invalid/', attribution: true, source: 'Upstream (CC BY 4.0)', read: '2026-09-11' };
  assert.doesNotThrow(() => LIC(ok));
  /* «attribution» may not be left out, and may not be a guess */
  assert.throws(() => LIC({ ...ok, attribution: undefined }), /true or false/);
  assert.throws(() => LIC({ ...ok, attribution: 'probably' }), /true or false/);
  /* a licence that owes credit must name the row that pays it — that is the whole gate */
  assert.throws(() => LIC({ ...ok, source: undefined }), /source/);
  /* …and one that owes none may not pretend to be paid by a row */
  assert.throws(() => LIC({ ...ok, attribution: false }), /owes no attribution/);
  /* the date the licence text was read is part of the reading */
  assert.throws(() => LIC({ ...ok, read: 'recently' }), /ISO date/);
  assert.throws(() => LIC({ ...ok, url: '' }), /url/);
});

/* ── ② …AND IT SURVIVES ITS OWN SERIALISATION ────────────────────────────────────────────────
   The declaration is written into the generated record file with JSON.stringify and read back by
   the loader. The first draft of the «owes no attribution names no row» rule tested
   `source !== undefined`, and the round trip turns «absent» into «''» — so the rule fired on the
   very file it was written to describe. A rule that cannot survive its own serialisation is not
   a rule about the world. */
test('r681 ② a LIC() declaration round-trips through JSON', () => {
  for (const src of [
    { publisher: 'Alpha', licence: 'CC0 1.0', url: 'https://example.invalid/a', attribution: false, read: '2026-01-01' },
    { publisher: 'Beta', licence: 'CC BY 3.0', url: 'https://example.invalid/b', attribution: true, source: 'Beta (CC BY 3.0)', read: '2026-01-01' },
  ]) {
    const once = LIC(src);
    const twice = LIC(JSON.parse(JSON.stringify(once)));
    assert.deepEqual({ ...twice }, { ...once }, `${src.publisher} does not survive being written out and read back`);
  }
});

/* ── ③ EVERY DERIVED RECORD FILE DECLARES WHOSE ROWS THOSE ARE ───────────────────────────────
   ⚠ THE UNIVERSE IS THE RECORD, NOT A LIST OF FILENAMES. loadRecord() asks each row whether it is
   derived, so a fourth upstream is covered on the day somebody harvests it (#R429). */
test('r681 ③ a file whose rows are somebody else’s says whose, and a handwritten one claims nobody', async () => {
  const { rows, licences } = await loadRecord();
  const derivedFiles = new Set(rows.filter((r) => r.derived).map((r) => r._file));
  const declared = new Set(licences.map((l) => l._file));
  assert.deepEqual([...derivedFiles].sort(), [...declared].sort(),
    'a record file holds harvested rows and declares no LICENCE, or declares one and holds none');
  assert.ok(licences.length >= 2, `only ${licences.length} upstream(s) declare a licence`);
  for (const l of licences) {
    assert.match(l.read, /^\d{4}-\d{2}-\d{2}$/, `${l._file}: no date for when the licence was read`);
    assert.ok(/^https?:\/\//.test(l.url), `${l._file}: the licence url is not a url`);
  }
});

/* ── ④ …AND THE READER IS TOLD, IN ALL NINE LANGUAGES ────────────────────────────────────────
   This is the shipped-artifact half of the gate scripts/build-hist-cities.mjs runs over the
   record. That one asks «does the registry carry the row»; this asks «does the reader get a
   page», which is the thing the licence actually requires and the thing that was missing. */
test('r681 ④ every upstream that is owed credit is named on the Sources page, in every language', () => {
  assert.ok(Array.isArray(RECORD.rights) && RECORD.rights.length,
    'data/hist-cities.json no longer carries the licences of what is inside it');
  const registry = rd('js/reference-data.js');
  const owed = RECORD.rights.filter((r) => r.attribution);
  assert.ok(owed.length >= 1, 'no shipped upstream owes attribution — has the record stopped carrying Pleiades?');
  const codes = pageCodes();
  assert.equal(codes.length, 9, `the app has ${codes.length} languages, not nine`);
  for (const r of owed) {
    /* the publisher is named in the registry… */
    const stem = r.publisher.split(' (')[0];
    assert.ok(registry.includes(stem), `js/reference-data.js does not name ${stem}, whose ${r.licence} makes credit a condition`);
    /* …and every language has prose for the row, not just English */
    const en = pageDoc('en');
    const key = [...en.keys()].find((k) => k.startsWith('sourceUse.') && k.includes(stem));
    assert.ok(key, `pages.en.js has no Sources-page description naming ${stem}`);
    for (const c of codes) {
      const doc = pageDoc(c.html);
      assert.ok(doc && doc.get(key), `pages.${c.html}.js has no description at ${key} — ${stem}'s credit is English-only for that reader`);
    }
  }
});

/* ── ⑤ UNKNOWN STARTS REMAIN EVIDENCE, WITH VISIBLE UNCERTAINTY ────────────────────────
   The old absolute count rejected distant namesakes becoming reachable even though their
   evidence was unchanged. The contract is now observable: every open-start winning name
   carries its uncertainty in both MapLibre and the lookup API, never in the source name. */
test('r705 ⑤ unknown starts are disclosed by the actual map expression and lookup API', async () => {
  const ctx = vm.createContext({ URL, console, document: { baseURI: 'https://example.invalid/' },
    fetch: async () => ({ ok: true, json: async () => RECORD }) });
  ctx.window = ctx;
  vm.runInContext(asClassicScript(rd('js/hist-scale.js')), ctx);
  let date;
  ctx.IntMapTime = { isLive: () => false, when: () => date, on: () => {} };
  vm.runInContext(asClassicScript(rd('js/hist-cities.js')), ctx);
  const api = ctx.IntMapHistCities;
  await api.ensure();
  let checked = 0;
  const before = JSON.stringify(RECORD);
  for (const year of [ctx.IntMapHistScale.FLOOR, 1500, 1900]) {
    date = new Date(0); date.setUTCFullYear(year, 5, 15);
    const stamp = year * 10000 + 615;
    const expression = api.textField(['get', 'name'], 'en', 'ui');
    const parsed = createExpression(expression, { type: 'string', 'property-type': 'data-driven',
      expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
    if (parsed.result !== 'success') assert.fail(parsed.value.map(e => e.message).join('\n'));
    for (const c of RECORD.cities) {
      for (const e of c.e) if (!e.f) assert.equal(e.p[0], '-', `${c.id}: unknown precision retained`);
      const era = c.e.find(e => (!e.f || stamp >= e.f) && (!e.t || stamp <= e.t));
      if (!era) continue;
      const expected = era.n.en + (era.f ? '' : ' [?]');
      assert.equal(api.at(c.k[0], c.lon, c.lat, 'en'), expected, `${c.id}: lookup at ${year}`);
      const z = 14, n = 2 ** z, r = c.lat * Math.PI / 180;
      const sx = (c.lon + 180) / 360 * n;
      const sy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
      const x = Math.floor(sx), y = Math.floor(sy);
      const feature = { type: 1, properties: { name: c.k[0] },
        geometry: [[{ x: Math.round((sx - x) * 8192), y: Math.round((sy - y) * 8192) }]] };
      assert.equal(parsed.value.evaluate({ zoom: z }, feature, {}, { z, x, y }), expected, `${c.id}: map at ${year}`);
      if (!era.f) checked++;
    }
  }
  assert.ok(checked > 2000, 'exercise the actual unknown-start corpus');
  assert.equal(JSON.stringify(RECORD), before, 'uncertainty is display metadata, never a fabricated source name');
});

/* ── ⑥ THE READABILITY DEFECT IS DOWNSTREAM OF ⑤, AND THIS IS THE MEASUREMENT THAT SAYS SO ────
 *  #R679 tried three ways to stop a dated-but-untranslated span hiding a nine-language one, and
 *  turned all three down. Re-measured this round over 1 049 sampled instants and all 4 011 cities:
 *  ordering by attestation instead cuts «the winning span has no form in the reader's language
 *  while another covering span does» from 16 163 answers to 448 for an English reader — and costs
 *  21 answers in which an undated span reaches a year earlier than any dated evidence the city
 *  has. Twenty-one against fifteen thousand looks like an easy trade and it is not: those 21 are
 *  «Constantinople in 300 BC», which is FALSE, against fifteen thousand that are merely hard to
 *  read. What makes the trade unbuyable is ⑤ — an open start with no evidence behind it cannot be
 *  ranked below anything, because nothing knows where it begins.
 *  ⚠ SO WHAT IS ASSERTED HERE IS THE CONNECTION, not the choice: for a city that HAS dated
 *  evidence, the ordering already answers with it, and the residue is exactly the cities that have
 *  none. If that stops being true, the trade is worth re-measuring. */
test('r681 ⑥ where a city has dated evidence, the dated evidence is what answers', () => {
  const covers = (e, d) => (!e.f || d >= e.f) && (!e.t || d <= e.t);
  let checked = 0, wrong = [];
  for (const c of RECORD.cities) {
    const dated = c.e.filter((e) => e.f);
    if (!dated.length) continue;
    for (const e of dated) {
      /* the middle of a span it states — the one instant its own evidence certainly covers */
      const y = Math.trunc(e.f / 10000);
      const d = y * 10000 + 701 <= e.t && y * 10000 + 701 >= e.f ? y * 10000 + 701 : e.f;
      const first = c.e.find((x) => covers(x, d));
      checked++;
      if (first && !first.f) wrong.push(`${c.id} @ ${d}: «${first.n.en}» has no stated start and answers over dated «${e.n.en}»`);
    }
  }
  assert.ok(checked > 2000, `only ${checked} dated spans to check`);
  assert.deepEqual(wrong.slice(0, 5), [], `${wrong.length} dated spans are hidden by an undated one`);
});

/* ── ⑦ …AND THE ANSWER TO ⑥ IS THAT THE SPANS SHARE COLUMNS, NOT THAT THEY SWAP PLACES ───────
 *  scripts/build-hist-cities.mjs lets two spans of one city that state THE SAME NAME use each
 *  other's language forms. Measured over 1,634 instants: answers whose winning span has no form in
 *  the reader's language while another covering span does fell from 324,259 to 107,930, and every
 *  one of the 216,329 is a case where the two spans were saying the same thing in two scripts.
 *  ⚠ WHAT IS ASSERTED IS THAT NOTHING MOVED. The pass may not change which span answers a year,
 *  so the shipped record must still be ordered exactly as ⑥ requires — and Volgograd, which is the
 *  case the pass was written for, must read the dated span WITH the readable name. */
test('r681 ⑦ a dated span carries the name the record holds in the reader’s language', () => {
  const v = RECORD.cities.find((c) => c.id === 'volgograd');
  assert.ok(v, 'volgograd left the record');
  const en = RECORD.langs.indexOf('en');
  const at1700 = v.e.find((e) => (!e.f || 17000701 >= e.f) && 17000701 <= e.t);
  assert.ok(at1700, 'nothing in the record answers for Volgograd in 1700');
  assert.ok(at1700.f, 'the 1700 answer for Volgograd comes from a span with no stated start again');
  assert.ok((at1700.a >> en) & 1, `the 1700 answer «${at1700.n.en}» is not attested in English`);
  assert.equal(at1700.n.en, 'Tsaritsyn');
  assert.equal(at1700.n.ru, 'Царицын');
  /* …and globally: a span may not claim a language it has no form for */
  let empty = 0;
  for (const c of RECORD.cities) for (const e of c.e) for (const [i, l] of RECORD.langs.entries()) {
    if (((e.a >> i) & 1) && !e.n[l]) empty++;
  }
  assert.equal(empty, 0, `${empty} spans claim a language they hold no string for`);
});

/* ── ⑧ THE MEDIEVAL GAP #R679 LEFT AS A NUMBER ──────────────────────────────────────────────
 *  106 spans ended between AD 1000 and 1499 and 289 between 1000 and 1799. OpenHistoricalMap —
 *  the upstream #R679 measured and turned down — took those to 452 and 929. This is the ratchet
 *  the other way round: coverage of the centuries the record was silent about may not quietly
 *  fall back to what it was. */
test('r681 ⑧ the medieval and early-modern centuries are covered', () => {
  const end = (e) => Math.trunc(e.t / 10000);
  const spans = RECORD.cities.flatMap((c) => c.e);
  const med = spans.filter((e) => end(e) >= 1000 && end(e) <= 1499).length;
  const early = spans.filter((e) => end(e) >= 1000 && end(e) <= 1799).length;
  assert.ok(med >= 388, `${med} spans end between AD 1000 and 1499 — was 106 before OpenHistoricalMap, 388 after`);
  assert.ok(early >= 827, `${early} spans end between AD 1000 and 1799 — was 289 before OpenHistoricalMap, 827 after`);
  const ohm = RECORD.cities.filter((c) => c.s === 'o');
  assert.ok(ohm.length >= 2211, `${ohm.length} cities come from OpenHistoricalMap`);
  /* ⚠ AND EVERY ONE OF ITS SPANS SAYS WHEN IT BEGAN. 57 of OHM's ended names carry no start date,
     and the harvest leaves them out rather than adding to the 2,288 claims nobody can bound (⑤). */
  const open = ohm.flatMap((c) => c.e).filter((e) => !e.f);
  assert.deepEqual(open.map((e) => e.n.en).slice(0, 5), [],
    `${open.length} OpenHistoricalMap spans ship with no stated start`);
});
