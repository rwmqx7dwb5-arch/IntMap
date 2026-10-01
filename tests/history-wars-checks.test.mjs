/* ============================================================================
 *  IntMap · the war layers — the record, the geometry that paints it, and the rows that reach it
 *  (consolidated from tests/r349 ⑤–⑧, r381, r409 and r519; each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  #R349 built a day-by-day record of both world wars; #R381 finished it (Serbia, the Caucasus,
 *  Mesopotamia, Romania, Norway, Albania, Greece, Burma, the Pacific); #R409 split it into two rows
 *  with a legend slider that does not own the app's clock; #R519 added four more wars on the same
 *  base (Korea, Vietnam, the Middle East, Yugoslavia).
 *
 *  ⚠ THE DEFECT THESE ROUNDS COULD SHIP IS A FRONT DRAWN THE RIGHT SHAPE AND THE WRONG WAY ROUND,
 *  which looks exactly like a correct one — so the city checks resolve points through js/war-geom.js
 *  (the code the browser paints with) over the SHIPPED data/wars.json and data/cshapes.js. Nine
 *  of those were found by the build's own audit while #R381 was written, INCLUDING ONE #R349
 *  SHIPPED — the Battle of France, whose sides were declared back to front for its whole span.
 *  ⚠ #R519's third lesson is not about code at all: CShapes carries ONE geometry for the two Koreas
 *  from 1945-08-15 to 2019, and that geometry is the 1953 armistice line, not the 38th parallel.
 *  ⚠ Files read as text go through `readLF` (#R283: CRLF in a Windows working copy, LF in the index).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { readLF } from '../scripts/eol.mjs';
import { WarGeom } from '../js/war-geom.js';
import * as LM from '../js/layer-manifest.js';   /* the Layers taxonomy (layer manifest) */
import { byKey } from './helpers/layer-groups.mjs';
import { liftFunction } from './helpers/lift-function.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const raw = (p) => readFileSync(join(ROOT, p), 'utf8');
/* comments are prose: a rule asserted only inside a comment block asserts nothing */

const wars = JSON.parse(raw('data/wars.json'));
const WARS = wars;
const csText = raw('data/cshapes.js');
const CS = JSON.parse(csText.slice(csText.indexOf('=') + 1).replace(/;\s*$/, ''));
const dnum = (d) => { const p = String(d).split('-'); return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]); };
const polysOf = (f) => f[8].map((poly) => poly.map((ri) => CS.rings[ri]));
const war = (id) => wars.wars.find((w) => w.id === id);
const front = (id, fid) => war(id).fronts.find((f) => f.id === fid);
const LANGS = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];

/* the fronts that cut one CShapes polity on one day, read the way js/war-fronts.js reads them */
const cutsFor = (w, gw, d) => {
  const out = [];
  for (const F of w.fronts) {
    if (F.until && d >= F.until) continue;
    let cur = null;
    for (const D of F.dates) { if (D.d <= d) cur = D; }
    if (!cur || cur.cuts.indexOf(gw) < 0) continue;
    out.push({ pts: cur.pts, left: cur.left || F.left, right: cur.right || F.right });
  }
  return out;
};
/* «what will a reader see» at a point on a day: the country under it, its base colour and the cuts */
function faction(id, d, pt) {
  const w = war(id), t = dnum(d);
  let hit = null;
  for (const f of CS.feats) {
    if (f[2] * 10000 + f[3] * 100 + f[4] > t || f[5] * 10000 + f[6] * 100 + f[7] < t) continue;
    if (WarGeom.pointInPolys(pt, polysOf(f))) { hit = f; break; }
  }
  assert.ok(hit, `${d}: no country contains ${pt}`);
  let base = 'NEUTRAL';
  const tl = w.control[hit[1]];
  if (tl) for (const [dd, k] of tl) { if (dd <= d) base = k; }
  return WarGeom.factionAt(pt, polysOf(hit), base, cutsFor(w, hit[1], d));
}

/* a statement block taken by its braces, string-aware — the same matcher as liftFunction, for a
   block that is not a function declaration (an `if (…) {…}`, an object literal, a `for`) */
function blockAt(src, needle, from = 0) {
  const at = src.indexOf(needle, from);
  assert.ok(at >= 0, 'no «' + needle + '» to lift');
  let i = src.indexOf('{', at), depth = 0, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (!depth) return src.slice(at, i + 1); }
  }
  throw new Error('unbalanced block at ' + needle);
}

/* the panel rows, read out of the file that declares them rather than repeated here */
const ROWS = [...codeOnly(R('js/war-fronts.js'))
  .matchAll(/\{\s*id:\s*'([a-z0-9]+)',\s*sw:\s*'([^']+)',\s*os:\s*'([^']+)'/g)]
  .map((m) => ({ id: m[1], sw: m[2], os: m[3] }));

/* ══ #R349 — the machinery ══════════════════════════════════════════════════════════════════ */

/* ── ⑤ the cut is arithmetic, and the arithmetic is checkable ───────────────────────────────── */
test('R349 ⑤: cutting a polygon by a line conserves its area, however often the line crosses', () => {
  const sq = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]];
  const area = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
  const cases = {
    /* two crossings — the shape a front line usually has */
    simple: [[4, -1], [5, 5], [6, 11]],
    /* four — a line that runs along a border before turning in */
    zigzag: [[-1, 2], [5, 2], [5, 8], [-1, 8]],
    /* eight, leaving THREE pieces on one side: the case the first version of the cut refused */
    sawtooth: [[-1, 5], [2, 5], [3, 11], [4, 5], [7, 5], [8, 11], [9, 5], [11, 5]],
  };
  for (const [name, path] of Object.entries(cases)) {
    const r = WarGeom.cutPolygon(sq, path);
    assert.equal(r.problem, null, `${name}: ${r.problem}`);
    const sum = r.left.concat(r.right).reduce((s, p) => s + area(p[0]), 0);
    assert.ok(Math.abs(sum - 100) < 1e-6, `${name}: the pieces total ${sum}, not 100`);
    assert.ok(r.left.length && r.right.length, `${name}: the line produced only one side`);
  }
});

/* ── ⑥ the shipped record, read the way the layer reads it ──────────────────────────────────── */
test('R349 ⑥: data/wars.json is shaped the way js/war-fronts.js reads it', () => {
  /* (#R409) v:2 — the file gained the shipped `kinds` table, a derived `span` per war, and the two
     optional figures on an operation. The version is pinned because a reader that has not been
     taught the new members would drop them silently, and a bump is the one thing that says «go and look». */
  assert.equal(wars.v, 2);
  /* (#R519) ⚠ THIS LITERAL IS THE POINT OF THE ASSERTION AND IS MEANT TO BE EDITED: the shipped
     record contains exactly the wars somebody curated, in the order they happened, so a half-written
     war cannot appear on the map by being merely importable. */
  assert.deepEqual(wars.wars.map((w) => w.id), ['ww1', 'ww2', 'korea', 'vietnam', 'mideast', 'yugoslavia'], 'every curated war, in the order they happened');
  const full = (o, what) => { for (const k of LANGS) assert.ok(o && o[k], `${what} has no ${k}`); };
  for (const w of wars.wars) {
    assert.match(w.from, /^\d{4}-\d{2}-\d{2}$/); assert.ok(w.to > w.from);
    full(w.name, w.id + ' name');
    assert.ok(w.factions.NEUTRAL, 'a country nobody lists must have something to be');
    for (const [k, f] of Object.entries(w.factions)) { assert.match(f.col, /^#[0-9a-f]{6}$/i, k); full(f.name, k); }
    for (const [gw, tl] of Object.entries(w.control)) {
      let prev = '';
      for (const [d, k] of tl) {
        assert.ok(d > prev, `${w.id} gw${gw}: ${d} does not come after ${prev}`); prev = d;
        assert.ok(d >= w.from && d <= w.to, `${w.id} gw${gw}: ${d} is outside the war`);
        assert.ok(w.factions[k], `${w.id} gw${gw}: unknown faction ${k}`);
      }
    }
    for (const F of w.fronts) {
      full(F.name, F.id);
      assert.ok(w.factions[F.left] && w.factions[F.right], F.id + ': both sides must be declared factions');
      let prev = '';
      for (const D of F.dates) {
        assert.ok(D.d > prev, `${F.id}: ${D.d} does not come after ${prev}`); prev = D.d;
        for (const p of D.pts) {
          assert.ok(Array.isArray(p) && p.length === 2 && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90,
            `${F.id} ${D.d}: ${JSON.stringify(p)} is not a coordinate`);
        }
        if (D.note) full(D.note, F.id + ' ' + D.d + ' note');
      }
    }
    for (const e of w.events) {
      full(e.name, e.wiki);
      assert.ok(Array.isArray(e.at) && e.at.length === 2, e.wiki + ': no place');
      assert.ok(!e.d2 || e.d2 >= e.d, e.wiki + ': it ends before it starts');
    }
  }
});

/* ⚠ THIS IS THE ONE THAT WOULD CATCH A FRONT DRAWN THE WRONG WAY ROUND. scripts/build-wars.mjs runs
   the same list before it writes; this runs it against what was actually committed. */
test('R349 ⑦: named cities fall under the army the record says held them', () => {
  const CHECKS = [
    ['ww1', '1914-11-20', [4.352, 50.847], 'CENTRAL'],   /* Brussels */
    ['ww1', '1914-11-20', [2.352, 48.857], 'ALLIED'],    /* Paris */
    ['ww1', '1915-09-19', [21.012, 52.230], 'CENTRAL'],  /* Warsaw */
    ['ww1', '1915-09-19', [27.567, 53.902], 'ALLIED'],   /* Minsk */
    ['ww2', '1939-09-28', [21.012, 52.230], 'AXIS'],     /* Warsaw */
    ['ww2', '1939-09-28', [24.032, 49.842], 'NEUTRAL'],  /* Lviv — the Soviet side, and the USSR was neutral */
    ['ww2', '1940-06-25', [2.352, 48.857], 'AXIS'],      /* Paris */
    ['ww2', '1940-06-25', [3.426, 46.128], 'NEUTRAL'],   /* Vichy */
    ['ww2', '1941-12-05', [27.567, 53.902], 'AXIS'],     /* Minsk */
    ['ww2', '1941-12-05', [37.618, 55.756], 'ALLIED'],   /* Moscow */
    ['ww2', '1942-11-19', [39.720, 47.222], 'AXIS'],     /* Rostov-on-Don */
    ['ww2', '1943-11-06', [30.524, 50.450], 'ALLIED'],   /* Kyiv */
    ['ww2', '1944-09-15', [2.352, 48.857], 'ALLIED'],    /* Paris */
    ['ww2', '1945-04-16', [13.405, 52.520], 'AXIS'],      /* Berlin */
    /* ⚠ THE FOUR A SELF-AUDIT CAUGHT AFTER THE FIRST GREEN BUILD. The July-1943 salients INTERLOCK,
       so a line drawn straight between them hands Orel to the Red Army a month early; and a front
       with no end keeps cutting after its army surrendered (Germany's own polygon ENDS on 7 May). */
    ['ww2', '1943-07-04', [36.187, 51.731], 'ALLIED'],    /* Kursk — inside the Soviet salient */
    ['ww2', '1943-07-04', [36.062, 52.967], 'AXIS'],      /* Orel — inside the German one */
    ['ww2', '1943-07-04', [36.231, 49.988], 'AXIS'],      /* Kharkov, held since March */
    ['ww2', '1945-08-01', [13.405, 52.520], 'ALLIED'],    /* Berlin, three months after the surrender */
  ];
  for (const [id, d, pt, want] of CHECKS) {
    const w = wars.wars.find((x) => x.id === id);
    const t = dnum(d);
    let hit = null;
    for (const f of CS.feats) {
      if (f[2] * 10000 + f[3] * 100 + f[4] > t || f[5] * 10000 + f[6] * 100 + f[7] < t) continue;
      if (WarGeom.pointInPolys(pt, polysOf(f))) { hit = f; break; }
    }
    assert.ok(hit, `${d}: no country contains ${pt}`);
    const tl = w.control[hit[1]];
    let base = 'NEUTRAL';
    if (tl) for (const [dd, k] of tl) { if (dd <= d) base = k; }
    const got = WarGeom.factionAt(pt, polysOf(hit), base, cutsFor(w, hit[1], d));
    assert.equal(got, want, `on ${d} the map puts ${pt} (${hit[0]}) under ${got}, the record says ${want}`);
  }
});

/* ── ⑧ the anchors are places, not typos ────────────────────────────────────────────────────── */
test('R349 ⑧: every front anchor that the bundled gazetteer knows is where the gazetteer puts it', async () => {
  const GZ = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString());
  const { PLACES } = await import('../scripts/wars/places.mjs');
  const idx = new Map();
  for (const r of GZ.rows) idx.set(String(r[0]).toLowerCase() + '|' + r[2], [r[3], r[4]]);
  const km = (a, b) => {
    const rad = Math.PI / 180;
    const s = Math.sin((b[1] - a[1]) * rad / 2) ** 2
      + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
  };
  let proved = 0;
  for (const [name, v] of Object.entries(PLACES)) {
    assert.ok(Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90, name + ': coordinate out of range');
    if (v[3] === '!') continue;                       /* the six the gazetteer knows as somewhere else */
    const g = idx.get(name.toLowerCase() + '|' + v[2]);
    if (!g) continue;
    assert.ok(km(v, g) < 30, `${name} (${v[2]}) is ${km(v, g).toFixed(0)} km from the gazetteer's own ${name}`);
    proved++;
  }
  assert.ok(proved > 200, `only ${proved} anchors could be cross-checked — the gazetteer read is broken`);
});

/* ══ #R381 — finishing the two world wars ════════════════════════════════════════════════════ */

/* ── ① every theatre the gazetteer names is now drawn ────────────────────────────────────────── */
test('R381 ①: both wars carry a front for every theatre they name a place in', () => {
  const w1 = war('ww1').fronts.map((f) => f.id).sort();
  const w2 = war('ww2').fronts.map((f) => f.id).sort();
  /* the four #R349 had no line for in each war — ids, not a count, because a count goes green the
     moment somebody adds any front at all */
  for (const id of ['serbia14', 'caucasus', 'mesopotamia', 'romanian']) {
    assert.ok(w1.includes(id), `ww1 is missing the ${id} front`);
  }
  for (const id of ['norway40', 'greece40', 'balkans41', 'burma']) {
    assert.ok(w2.includes(id), `ww2 is missing the ${id} front`);
  }
  assert.ok(w1.length >= 9, `ww1 has only ${w1.length} fronts`);
  assert.ok(w2.length >= 12, `ww2 has only ${w2.length} fronts`);
});

/* ── ② the record is dense enough to be called day by day ────────────────────────────────────── */
test('R381 ②: no year of either world war is left without a dated line and an operation', () => {
  /* ⚠ (#R519) THIS LOOP IS ABOUT THE TWO WORLD WARS ON PURPOSE. They were fought continuously, so a
     year with no dated line really is a year the author stopped writing. The four discontinuous wars
     are held by R519 ⑦ — «no year of any war is a blank map» — which silence cannot satisfy either.
     ⚠ THE FIX IS NOT TO WEAKEN THIS: filling those years would mean writing lines for days nobody
     recorded, which is the one thing scripts/wars/lang.mjs refuses. */
  for (const w of [war('ww1'), war('ww2')]) {
    const y0 = +w.from.slice(0, 4), y1 = +w.to.slice(0, 4);
    const lineYears = new Set(), evYears = new Set();
    for (const F of w.fronts) for (const D of F.dates) lineYears.add(+D.d.slice(0, 4));
    for (const e of w.events) {
      for (let y = +e.d.slice(0, 4); y <= +((e.d2 || e.d).slice(0, 4)); y++) evYears.add(y);
    }
    for (let y = y0; y <= y1; y++) {
      assert.ok(lineYears.has(y), `${w.id}: no front line is dated in ${y}`);
      assert.ok(evYears.has(y), `${w.id}: no operation runs in ${y}`);
    }
  }
  const n = (id) => war(id).fronts.reduce((a, f) => a + f.dates.length, 0);
  assert.ok(n('ww1') >= 60, `ww1 has only ${n('ww1')} dated lines`);
  assert.ok(n('ww2') >= 90, `ww2 has only ${n('ww2')} dated lines`);
  assert.ok(war('ww1').events.length >= 55, `ww1 has only ${war('ww1').events.length} operations`);
  assert.ok(war('ww2').events.length >= 150, `ww2 has only ${war('ww2').events.length} operations`);
});

/* ── ③ THE PACIFIC IS THE ONE THAT HAD TO BE COUNTED SEPARATELY ──────────────────────────────── */
/* The only theatre represented by operations ALONE, because there was no line to draw across an
   ocean — so five events WERE the entire Pacific war on this map. A count is the right check here. */
test('R381 ③: the Pacific, which has no front, has a record made of operations', () => {
  const box = [100, -12, 180, 45];      /* the western Pacific and South-East Asia */
  const inBox = war('ww2').events.filter((e) => e.at[0] >= box[0] && e.at[0] <= box[2]
    && e.at[1] >= box[1] && e.at[1] <= box[3]);
  assert.ok(inBox.length >= 45, `only ${inBox.length} operations east of 100°E — the Pacific is still a list of five`);
  const years = new Set(inBox.map((e) => +e.d.slice(0, 4)));
  for (const y of [1941, 1942, 1943, 1944, 1945]) assert.ok(years.has(y), `nothing in the Pacific in ${y}`);
});

/* ── ④ every anchor the shipped file uses is a place, and no place is unused ─────────────────── */
test('R381 ④: places.mjs and data/wars.json quote exactly the same set of anchors', async () => {
  const { PLACES } = await import('../scripts/wars/places.mjs');
  const known = new Map();
  for (const [n, v] of Object.entries(PLACES)) known.set(v[0] + ',' + v[1], n);
  const seen = new Set();
  for (const w of wars.wars) {
    for (const F of w.fronts) for (const D of F.dates) for (const p of D.pts) {
      const k = p[0] + ',' + p[1];
      assert.ok(known.has(k), `${w.id}/${F.id} ${D.d}: ${JSON.stringify(p)} is not in places.mjs`);
      seen.add(known.get(k));
    }
    for (const e of w.events) { const k = e.at[0] + ',' + e.at[1]; if (known.has(k)) seen.add(known.get(k)); }
  }
  /* the build also counts the control checks, which this file cannot see; what it CAN prove is that
     the shipped file reaches most of the table rather than half of it, which is what #R349 shipped */
  const cover = seen.size / Object.keys(PLACES).length;
  assert.ok(cover > 0.75, `only ${(cover * 100).toFixed(0)}% of the gazetteer is quoted by the shipped file`);
});

/* ── ⑤ THE ONE THAT CATCHES A FRONT DRAWN THE WRONG WAY ROUND ────────────────────────────────── */
test('R381 ⑤: the theatres #R349 never drew put their cities under the right army', () => {
  const CHECKS = [
    /* Serbia 1914 — cleared by 15 December, overrun a year later */
    ['ww1', '1914-09-20', [19.483, 44.838], 'CENTRAL'],   /* Bogatić, in the Austro-Hungarian Mačva */
    ['ww1', '1914-09-20', [20.457, 44.787], 'ALLIED'],    /* Belgrade */
    ['ww1', '1915-02-01', [20.457, 44.787], 'ALLIED'],    /* the front ended on 16 Dec; Serbia is whole */
    ['ww1', '1916-06-01', [20.457, 44.787], 'CENTRAL'],
    /* the Caucasus — WEST is the Ottoman side here, the opposite of every other front in the file */
    ['ww1', '1916-03-01', [41.270, 39.900], 'ALLIED'],    /* Erzurum, taken 16 February */
    ['ww1', '1916-03-01', [39.720, 41.000], 'CENTRAL'],   /* Trebizond, not until 18 April */
    ['ww1', '1918-04-01', [41.270, 39.900], 'CENTRAL'],   /* and given back at Brest-Litovsk */
    /* Mesopotamia — and the Ottoman lands a front four hundred kilometres away must not relabel */
    ['ww1', '1915-01-01', [47.780, 30.510], 'ALLIED'],    /* Basra */
    ['ww1', '1917-06-01', [43.130, 36.340], 'CENTRAL'],   /* Mosul */
    ['ww1', '1917-06-01', [35.210, 31.780], 'CENTRAL'],   /* Jerusalem, six months before it fell */
    /* Romania — seventeen months #R349 painted one colour */
    ['ww1', '1917-01-15', [26.103, 44.437], 'CENTRAL'],   /* Bucharest */
    ['ww1', '1917-01-15', [27.600, 47.160], 'ALLIED'],    /* Iaşi */
    /* Norway, Albania, Greece, Burma */
    ['ww2', '1940-04-25', [14.142, 66.313], 'ALLIED'],    /* Mo i Rana */
    ['ww2', '1940-04-25', [10.463, 61.115], 'AXIS'],      /* Lillehammer */
    ['ww2', '1941-01-15', [19.999, 39.875], 'ALLIED'],    /* Sarandë, Greek since December */
    ['ww2', '1941-01-15', [19.820, 41.330], 'AXIS'],      /* Tirana */
    ['ww2', '1941-04-12', [22.418, 39.639], 'ALLIED'],    /* Larissa */
    ['ww2', '1941-04-22', [22.418, 39.639], 'AXIS'],
    ['ww2', '1943-06-01', [96.160, 16.800], 'AXIS'],      /* Rangoon */
    ['ww2', '1943-06-01', [94.406, 24.216], 'ALLIED'],    /* Tamu */
    ['ww2', '1945-04-01', [96.083, 21.975], 'ALLIED'],    /* Mandalay */
    /* Karelia — the chord #R349 quoted ran west of a city the Finns held for 33 months */
    ['ww2', '1942-06-01', [34.347, 61.789], 'AXIS'],      /* Petrozavodsk */
    ['ww2', '1944-08-01', [34.347, 61.789], 'ALLIED'],
  ];
  for (const [id, d, pt, want] of CHECKS) {
    assert.equal(faction(id, d, pt), want, `on ${d} the map puts ${pt} under ${faction(id, d, pt)}, not ${want}`);
  }
});

/* ── ⑥ THE ONE #R349 SHIPPED ─────────────────────────────────────────────────────────────────── */
/* west40's `left` and `right` were the wrong way round for the whole Battle of France. #R349's own
   city checks covered exactly one date in that campaign — 25 June, which carries a per-date override. */
test('R381 ⑥: the Battle of France is not drawn inside out', () => {
  assert.equal(front('ww2', 'west40').left, 'ALLIED', 'the southern side of these lines is French');
  assert.equal(front('ww2', 'west40').right, 'AXIS');
  const PARIS = [2.352, 48.857], LYON = [4.836, 45.764], BORDEAUX = [-0.579, 44.838];
  const AMIENS = [2.296, 49.894], ORLEANS = [1.909, 47.902];
  assert.equal(faction('ww2', '1940-05-25', PARIS), 'ALLIED', 'Paris did not fall until 14 June');
  assert.equal(faction('ww2', '1940-05-25', LYON), 'ALLIED');
  assert.equal(faction('ww2', '1940-05-25', BORDEAUX), 'ALLIED');
  assert.equal(faction('ww2', '1940-05-25', AMIENS), 'AXIS', 'Amiens was in the panzer corridor');
  assert.equal(faction('ww2', '1940-06-16', PARIS), 'AXIS', '…and had fallen two days before');
  assert.equal(faction('ww2', '1940-06-16', ORLEANS), 'ALLIED');
  /* and the demarcation line still answers what it always answered */
  assert.equal(faction('ww2', '1940-07-01', PARIS), 'AXIS');
  assert.equal(faction('ww2', '1940-07-01', [3.426, 46.128]), 'NEUTRAL', 'Vichy');
});

/* ── ⑦ a line quoted too short relabels a continent on the far side of its own extension ─────── */
/* The cut is extended until it leaves the country, so a chord that stops in the middle carries on
   along its last bearing and decides places nobody was fighting over. */
test('R381 ⑦: the western and Chinese lines reach the frontier they have to reach', () => {
  assert.equal(faction('ww2', '1944-08-28', [6.176, 49.120]), 'AXIS', 'Metz, German until 22 November');
  assert.equal(faction('ww2', '1944-08-28', [5.370, 43.297]), 'ALLIED', 'Marseille, free since 28 August');
  assert.equal(faction('ww2', '1944-12-24', [5.370, 43.297]), 'ALLIED', 'and still free in December');
  assert.equal(faction('ww2', '1944-12-24', [6.084, 50.775]), 'ALLIED', 'Aachen, taken 21 October');
  assert.equal(faction('ww2', '1944-12-24', [6.960, 50.937]), 'AXIS', 'Cologne, not until March');
  assert.equal(faction('ww2', '1944-12-24', [7.359, 48.079]), 'AXIS', 'the Colmar pocket');
  assert.equal(faction('ww2', '1945-03-01', [7.359, 48.079]), 'ALLIED', '…cleared on 9 February');
  assert.equal(faction('ww2', '1943-01-01', [110.290, 25.274]), 'ALLIED', 'Guilin, Chinese until Nov 1944');
  assert.equal(faction('ww2', '1945-07-05', [108.320, 22.820]), 'ALLIED', 'Nanning, retaken 27 May 1945');
  assert.equal(faction('ww2', '1945-07-05', [113.264, 23.129]), 'AXIS', 'Canton, Japanese to the end');
});

/* ── ⑧ a front that has ended stops cutting ──────────────────────────────────────────────────── */
test('R381 ⑧: every campaign that ended says so, and the map stops dividing its country', () => {
  const ENDED = [['ww1', 'serbia14', '1914-12-16'], ['ww1', 'caucasus', '1918-04-26'],
    ['ww1', 'romanian', '1918-05-07'], ['ww1', 'salonika', '1918-09-30'],
    ['ww2', 'norway40', '1940-06-11'], ['ww2', 'greece40', '1941-04-23'],
    ['ww2', 'balkans41', '1941-04-28'], ['ww2', 'burma', '1945-05-04'],
    ['ww2', 'china', '1945-08-15']];
  for (const [w, f, until] of ENDED) {
    assert.equal(front(w, f).until, until, `${w}/${f} must stop on ${until}`);
  }
  /* Norway is whole and German from 10 June, and whole and Allied after the surrender */
  assert.equal(faction('ww2', '1940-07-01', [14.142, 66.313]), 'AXIS');
  assert.equal(faction('ww2', '1945-08-12', [14.142, 66.313]), 'ALLIED');
  /* and China is whole and Allied from the day the Emperor broadcast */
  assert.equal(faction('ww2', '1945-08-20', [116.407, 39.904]), 'ALLIED', 'Beijing');
  /* Japan itself now has an end date; #R349 left the row open and it stayed Axis to the last frame */
  assert.deepEqual(war('ww2').control['740'].at(-1), ['1945-09-02', 'ALLIED']);
});

/* ── ⑨ the events are in order, and the sort that puts them there is in the source ───────────── */
test('R381 ⑨: operations are date-ordered in the shipped file, by a sort rather than by hand', () => {
  for (const w of wars.wars) {
    let prev = '';
    for (const e of w.events) { assert.ok(e.d >= prev, `${w.id}: ${e.wiki} at ${e.d} is out of order`); prev = e.d; }
  }
  /* ⚠ SPELLING, ON PURPOSE: «ordered by a sort rather than by hand» is a claim about how the build
     source is WRITTEN — the shipped order above cannot tell a sort from an author who typed carefully. */
  for (const f of ['scripts/wars/ww1.mjs', 'scripts/wars/ww2.mjs']) {
    assert.match(readLF(join(ROOT, f)), /\]\.sort\(\(a, b\) => \(a\.d < b\.d \? -1 : a\.d > b\.d \? 1 : 0\)\)/,
      `${f} must sort its events rather than rely on the order they were written in`);
  }
});

/* ── ⑩ the build refuses to write a table with an anchor nothing quotes ──────────────────────── */
/* ⚠ THIS IS A SOURCE CHECK AND IT IS DELIBERATELY WEAK — it asserts that the gate EXISTS, not that
   it works; what proves it works is that it is the gate that found 145 idle anchors while #R381 was
   being written, and that scripts/build-wars.mjs will not write data/wars.json while any remain.
   #R339's lesson: say which of the two a check is doing. */
test('R381 ⑩: build-wars.mjs still refuses an anchor no line, operation or check reaches', () => {
  const src = readLF(join(ROOT, 'scripts', 'build-wars.mjs'));
  assert.match(src, /are quoted by nothing/, 'the unused-anchor gate has been removed from the build');
  assert.match(src, /for \(const \[, , place\] of CHECKS\) quoted\.add\(place\);/,
    'the gate must count the control checks as a use, or it will force fake events for check cities');
});

/* ══ #R409 — two war layers, a slider that does not own the clock, a record that cannot carry a
   fact nothing can draw ══════════════════════════════════════════════════════════════════════
   「World Wars layerをもっと充実させろ。また、凡例内にタイムスライダーをつけろ。また、WW1とWW2で
    レイヤーを分けろ。」 The three mistakes these exist to catch are each invisible on a working map:
    a row split in two while something still resolves the old single id; a legend control that
    writes window.IntMapTime; a record that grows a fact no part of the layer can put on screen.
   ⚠ Several checks below read js/war-layer.js, js/war-fronts.js or js/map-ui.js as text. Those are
   DOM-bound closures (a live map, a legend element, the restore loop of a shared link) whose
   internal order and wiring no stubbed node instance reaches; each such check says so. Where the
   subject is a pure function or a pure block (the kind colour expression, the retirement table,
   the link migration) it is LIFTED AND RUN instead. */

/* ── ① the split is complete: two rows, and nothing still answers to the old one ─────────────── */
test('R409 ①: the Layers panel offers ww1 and ww2, and the retired single row is gone from it', () => {
  /* ⚠ SPELLING, ON PURPOSE, FOR THE SHELL: the rows are built into the Layers panel by js/war-fronts.js's
     DOM shell; the shelf half is read through the shared manifest reader. */
  const shell = raw('js/war-fronts.js');
  for (const id of ['ww1', 'ww2']) {
    assert.ok(shell.includes("id: '" + id + "'"), 'js/war-fronts.js does not declare the ' + id + ' row');
    assert.ok(shell.includes("'dl-' + R.id"), 'the checkbox id is no longer derived from the row id');
  }
  /* (#R469) the shared reader — the regex this replaced matched nothing once each shelf grew a count */
  const row = [null, byKey.lyrGrpPolitics.map((x) => "'" + x + "'").join(',')];
  assert.ok(row, 'the politics group is no longer a literal list — this check reads the list itself');
  const ids = row[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.ok(ids.includes('ww1') && ids.includes('ww2'), 'the two war rows are not both in the politics group: ' + ids.join(' '));
  assert.ok(!ids.includes('wars'), 'the retired combined row is still listed in the Layers panel');
});

/* ── ② …and a link that names the retired row still opens the two that replaced it ───────────── */
/* ⚠ THE RESTORE LOOP RESOLVES IDS WITH getElementById AND THEN CLOSES EVERYTHING NOT WANTED. So a
   link carrying `l=dl-wars` would not merely fail to open the war layer — it would be read as «the
   reader did not want it», an old link looking like a working link showing an empty map. */
test('R409 ②: a share link that still names dl-wars opens dl-ww1 and dl-ww2', () => {
  const src = codeOnly(raw('js/map-ui.js'));
  const i = src.indexOf("wantSet.has('dl-wars')");
  assert.ok(i > 0, 'js/map-ui.js no longer migrates the retired dl-wars id');
  /* EVALUATED (was: three regexes over the 420 characters after the test). The migration block is
     lifted by its braces and run on the wanted list/set a pasted link produces. */
  const block = blockAt(src, "if(wantSet.has('dl-wars'))");
  const migrate = new Function('want', 'wantSet', block + '\nreturn { want, wantSet };');
  const a = migrate(['dl-wars', 'dl-eq'], new Set(['dl-wars', 'dl-eq']));
  assert.ok(a.wantSet.has('dl-ww1') && a.wantSet.has('dl-ww2'), 'the migration does not name both replacements');
  assert.ok(!a.wantSet.has('dl-wars') && !a.want.includes('dl-wars'),
    'the retired id is left in the wanted set, so the close-everything-else pass will still see it');
  assert.deepEqual(a.want.slice().sort(), ['dl-eq', 'dl-ww1', 'dl-ww2']);
  const b = migrate(['dl-ww1', 'dl-wars'], new Set(['dl-ww1', 'dl-wars']));
  assert.deepEqual(b.want.slice().sort(), ['dl-ww1', 'dl-ww2'], 'a link naming both the old and a new id ticks a row twice');
  /* and it must run BEFORE the pass that switches unwanted layers off.
     ⚠ SPELLING, ON PURPOSE: that pass and this block are two statements of one DOM-bound restore
     function (it walks live checkboxes); their ORDER is the claim and it is read from the source. */
  const off = src.indexOf('cb.checked && !wantSet.has(k)');
  assert.ok(off > i, 'the migration runs after the pass that closes unwanted layers');
});

/* ── ③ the legend's own controls never write the master clock ────────────────────────────────── */
/* ⚠ 「付ける。Chronosは動かすな。」 `IntMapTime.set` / `setYear` / `setNow` may appear in
   js/war-layer.js exactly once, in `toggle()`, the single seeding move the reader asked for.
   ⚠ SPELLING, ON PURPOSE: the slider, the transport and the play loop are DOM handlers inside the
   layer's closure; «none of them writes the clock» is a claim over every one of their paths. */
test('R409 ③: only toggle() writes window.IntMapTime — the slider, the transport and play do not', () => {
  const src = codeOnly(raw('js/war-layer.js'));
  /* (module-graph) the clock is an imported binding now; either spelling is a write, so neither goes blind */
  const writes = [...src.matchAll(/(?:window\.)?\bIntMapTime\.(set|setYear|setNow|setIndex)\s*\(/g)];
  assert.equal(writes.length, 1, 'js/war-layer.js writes the master clock ' + writes.length + ' time(s); exactly one — the seed in toggle() — is allowed');
  /* the one write is inside toggle(), not inside the control wiring or the play loop */
  const fnAt = (name) => { const i = src.indexOf(name); assert.ok(i > 0, name + ' is gone'); return i; };
  const tog = fnAt('async function toggle(want');   /* (restore-clock-and-elam) toggle(want, opts) — the restore's tick is passed in */
  const wire = fnAt('function wireLegend(');
  const play = fnAt('function togglePlay(');
  const at = writes[0].index;
  assert.ok(at > tog, 'the clock write is not inside toggle()');
  assert.ok(at < wire || at > wire + 2600, 'the clock write sits inside wireLegend()');
  assert.ok(at < play || at > play + 900, 'the clock write sits inside togglePlay()');
  /* and the play loop steps the LAYER's own date */
  const loop = src.slice(play, play + 900);
  assert.ok(/setDate\(/.test(loop), 'the play loop no longer moves the layer date');
  assert.ok(!/IntMapTime/.test(loop), 'the play loop touches the master clock');
});

/* ── ④ …and the controls are built once, not rebuilt under the finger holding them ───────────── */
/* ⚠ SPELLING, ON PURPOSE: renderPanel writes a legend element's innerHTML; «the range is not rebuilt
   while dragged» and «the re-tile is guarded» are claims about a DOM render path. */
test('R409 ④: a date change updates the legend controls in place instead of replacing them', () => {
  const src = codeOnly(raw('js/war-layer.js'));
  assert.ok(/function syncControls\(/.test(src), 'the in-place update is gone — a range that rebuilds itself drops the drag after one pixel');
  const rp = src.slice(src.indexOf('function renderPanel('));
  assert.ok(/dataset\.built\s*!==\s*sig/.test(rp), 'renderPanel no longer guards the rebuild with a signature');
  /* the only innerHTML the per-date path writes is the prose block */
  const info = /\.war-info'\)\.innerHTML\s*=/.test(rp);
  assert.ok(info, 'the per-date render no longer writes into .war-info');
  /* ⚠ `_tileLegends()` re-lays out EVERY legend on the map. In the per-date path there may be
     exactly one call and it must sit behind the `!playT` guard. */
  const dated = rp.slice(rp.indexOf('const sig ='));
  assert.ok(dated.length > 200, 'renderPanel no longer has a per-date path to check');
  const calls = [...dated.matchAll(/window\._tileLegends\s*\(/g)];
  assert.equal(calls.length, 1, 'the per-date path calls _tileLegends ' + calls.length + ' time(s); one, guarded, is allowed');
  const guard = dated.indexOf('if (!playT)');
  assert.ok(guard >= 0, 'the re-tile is no longer skipped while playing');
  assert.ok(calls[0].index > guard && calls[0].index - guard < 80, 'the re-tile is not inside the !playT guard');
});

/* the shipped kind→colour expression, LIFTED out of js/war-layer.js and run over a `data` the test
   hands it (the function reads nothing else of the closure) */
const kindColourExpr = (data) => new Function('data',
  liftFunction(codeOnly(raw('js/war-layer.js')), 'kindColourExpr') + '\nreturn kindColourExpr();')(data);
const STYLE_COLOUR = { type: 'color', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } };

/* ── ⑤ the shipped kind vocabulary is complete, and the layer reads IT rather than a copy ─────── */
test('R409 ⑤: every kind in the record has a colour and nine names, and no kind is hard-coded', () => {
  assert.ok(WARS.kinds && Object.keys(WARS.kinds).length >= 9, 'data/wars.json ships no kind table');
  for (const [k, v] of Object.entries(WARS.kinds)) {
    assert.match(v.col || '', /^#[0-9a-f]{6}$/i, 'kind ' + k + ' has no colour');
    for (const L of LANGS) assert.ok(v.name && v.name[L], 'kind ' + k + ' has no ' + L + ' name');
  }
  /* distinct colours: two kinds that paint the same dot are one kind with two names */
  const cols = Object.values(WARS.kinds).map((v) => v.col.toLowerCase());
  assert.equal(new Set(cols).size, cols.length, 'two kinds share a colour: ' + cols.join(' '));
  /* every kind a war actually uses is in the table */
  for (const w of WARS.wars) {
    for (const e of w.events) assert.ok(WARS.kinds[e.kind || 'battle'], w.id + ' event ' + e.wiki + ' has kind «' + e.kind + '», which the shipped table does not define');
  }
  /* EVALUATED (was: regexes for `function kindColourExpr(`, `data.kinds` and the absence of a
     hand-written 'political' colour). The circle colour the layer builds from the SHIPPED table is
     parsed and evaluated by MapLibre's own evaluator: every kind must paint its own table colour, so
     a colour typed into the layer — or read from anywhere but the record — disagrees here. */
  const expr = kindColourExpr(WARS);
  const c = createExpression(expr, STYLE_COLOUR);
  assert.equal(c.result, 'success', 'MapLibre rejects the kind colour expression built from the shipped table');
  /* the literal outputs come back as the strings the table holds; a Color object is normalised */
  const hex = (col) => (typeof col === 'string' ? col : '#' + [col.r, col.g, col.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')).toLowerCase();
  for (const [k, v] of Object.entries(WARS.kinds)) {
    const got = hex(c.value.evaluate({ zoom: 4 }, { properties: { kind: k } }));
    assert.equal(got, v.col.toLowerCase(), 'kind ' + k + ' is painted ' + got + ', the shipped table says ' + v.col);
  }
});

/* ── ⑥ nothing in the record is unreachable: every operation is inside the span the layer draws ─ */
/* ⚠ THIS IS THE CHECK THAT WOULD HAVE CAUGHT WHAT #R349 SHIPPED: the assassination at Sarajevo was
   in data/wars.json from the first day, 30 days before WW1's `from`, and never once on screen. */
test('R409 ⑥: every war carries a span, and every operation falls inside it', () => {
  for (const w of WARS.wars) {
    assert.ok(Array.isArray(w.span) && w.span.length === 2, w.id + ' ships no span — the layer would fall back to the fighting dates');
    assert.ok(w.span[0] <= w.from && w.span[1] >= w.to, w.id + ' span does not contain the war itself');
    for (const e of w.events) {
      assert.ok(e.d >= w.span[0], w.id + ' ' + e.wiki + ' starts before the span the layer draws');
      assert.ok((e.d2 || e.d) <= w.span[1], w.id + ' ' + e.wiki + ' ends after the span the layer draws');
    }
    /* the span is DERIVED, so it is exactly the record's own extent — never wider */
    let lo = w.from, hi = w.to;
    for (const e of w.events) { if (e.d < lo) lo = e.d; if ((e.d2 || e.d) > hi) hi = e.d2 || e.d; }
    assert.deepEqual(w.span, [lo, hi], w.id + ' span is not the record’s own extent');
  }
  /* and the layer draws by the span, not by from/to.
     ⚠ SPELLING, ON PURPOSE: `build()` bounds the frame inside the DOM-bound layer closure. */
  const src = codeOnly(raw('js/war-layer.js'));
  assert.ok(/const spanOf\s*=/.test(src), 'js/war-layer.js no longer reads the shipped span');
  assert.ok(/dateStr < sp\[0\] \|\| dateStr > sp\[1\]/.test(src), 'build() no longer bounds the frame by the span');
});

/* ── ⑦ the figures are shaped the way the popup and the radius read them ─────────────────────── */
test('R409 ⑦: every strength / casualty figure is an ordered pair or a positive integer', () => {
  let withCas = 0, withStr = 0, ranges = 0;
  for (const w of WARS.wars) for (const e of w.events) {
    for (const k of ['str', 'cas']) {
      const v = e[k]; if (v == null) continue;
      if (k === 'cas') withCas++; else withStr++;
      if (Array.isArray(v)) {
        ranges++;
        assert.equal(v.length, 2, w.id + ' ' + e.wiki + ' ' + k + ' is not a pair');
        assert.ok(v.every((n) => Number.isInteger(n) && n > 0), w.id + ' ' + e.wiki + ' ' + k + ' is not two positive integers');
        assert.ok(v[0] < v[1], w.id + ' ' + e.wiki + ' ' + k + ' is a pair whose ends are not ordered — a pair with equal ends must ship as one number');
      } else {
        assert.ok(Number.isInteger(v) && v > 0, w.id + ' ' + e.wiki + ' ' + k + ' is not a positive integer');
      }
      assert.ok((Array.isArray(v) ? v[1] : v) <= 30000000, w.id + ' ' + e.wiki + ' ' + k + ' is larger than any world-war operation');
    }
  }
  assert.ok(withCas >= 120, 'only ' + withCas + ' operations carry a casualty figure — the round put numbers on the record');
  assert.ok(withStr >= 60, 'only ' + withStr + ' operations carry a strength figure');
  assert.ok(ranges >= 20, 'only ' + ranges + ' figures are cited as a range — a single number claims the sources agree');
});

/* ── ⑧ the round's own promise: the record actually grew, in every direction it was asked to ─── */
test('R409 ⑧: the record carries more than it did, and no war is thin in any of the four', () => {
  const by = Object.fromEntries(WARS.wars.map((w) => [w.id, w]));
  /* The floors are what the round actually reached, so they ratchet. ⚠ WW2's dated lines are 109 and
     not the 115 this round set out to write, and that is a RESULT: the desert front is stated in the
     sources as a coast point and a flank point, and a third point between them would be
     interpolation — the one thing this record refuses (scripts/wars/lang.mjs). */
  const floor = { ww1: { ev: 195, fr: 9, ln: 85, ct: 124 }, ww2: { ev: 313, fr: 12, ln: 109, ct: 156 } };
  for (const [id, f] of Object.entries(floor)) {
    const w = by[id]; assert.ok(w, id + ' is missing from the shipped record');
    const lines = w.fronts.reduce((a, F) => a + F.dates.length, 0);
    assert.ok(w.events.length >= f.ev, id + ' has ' + w.events.length + ' operations, below the ' + f.ev + ' this round set');
    assert.ok(w.fronts.length >= f.fr, id + ' lost a front: ' + w.fronts.length);
    assert.ok(lines >= f.ln, id + ' has ' + lines + ' dated front lines, below ' + f.ln);
    assert.ok(Object.keys(w.control).length >= f.ct, id + ' names ' + Object.keys(w.control).length + ' territories, below ' + f.ct);
    /* and the new kinds are actually used, not merely declared */
    const used = new Set(w.events.map((e) => e.kind || 'battle'));
    for (const k of ['air', 'siege', 'landing', 'conference', 'uprising']) {
      assert.ok(used.has(k), id + ' uses no operation of kind «' + k + '» — the vocabulary was declared and not written');
    }
    /* nothing may fall back to the default silently any more */
    const bare = w.events.filter((e) => !e.kind).length;
    assert.equal(bare, 0, id + ' still has ' + bare + ' operations with no kind — «battle» must be written, not implied');
  }
  /* ⚠ WW2 is the war with the camps, and a history layer that leaves them out is not neutral */
  const atroc = by.ww2.events.filter((e) => e.kind === 'atrocity');
  assert.ok(atroc.length >= 8, 'the WW2 record carries ' + atroc.length + ' mass-atrocity entries');
});

/* ── ⑨ every name the record ships is in all nine languages ──────────────────────────────────── */
test('R409 ⑨: every operation, front and faction name is complete in nine languages', () => {
  let n = 0;
  const chk = (o, what) => { n++; for (const L of LANGS) assert.ok(o && typeof o[L] === 'string' && o[L].trim(), what + ' has no ' + L); };
  for (const w of WARS.wars) {
    chk(w.name, w.id + ' name');
    for (const [k, f] of Object.entries(w.factions)) chk(f.name, w.id + '/' + k);
    for (const F of w.fronts) { chk(F.name, w.id + '/' + F.id); for (const D of F.dates) if (D.note) chk(D.note, w.id + '/' + F.id + ' ' + D.d); }
    for (const e of w.events) chk(e.name, w.id + ' ' + e.wiki);
  }
  for (const [k, v] of Object.entries(WARS.kinds)) chk(v.name, 'kind ' + k);
  assert.ok(n > 500, 'only ' + n + ' localized names were checked');
});

/* ── ⑩ the layer's own attribution is the record's, not a second copy ────────────────────────── */
/* ⚠ `src` was written by the build from the first day and NOTHING read it; the credit on screen was
   a hand-kept string in js/war-layer.js that named CShapes and not the record behind it.
   ⚠ SPELLING, ON PURPOSE: the attribution is handed to the renderer and the legend element inside
   the DOM-bound layer closure. */
test('R409 ⑩: the shipped source line is what the map and the legend show', () => {
  assert.ok(WARS.src && WARS.src.length > 40, 'data/wars.json ships no source line');
  const src = codeOnly(raw('js/war-layer.js'));
  assert.ok(/attrib = \(data && data\.src\)/.test(src), 'the map attribution is not read from the shipped source line');
  assert.ok(/war-src[\s\S]{0,80}data\.src/.test(src), 'the legend does not print the shipped source line');
  assert.ok(!/'CShapes 2\.0 \(Schvitz et al\. 2022\) · IntMap war record'/.test(src), 'the hand-kept second copy of the credit is back');
});

/* ── ⑪ Atlas can name both layers, in the languages the request arrives in ───────────────────── */
/* ⚠ SPELLING, ON PURPOSE: LAYER_ALIASES is a literal table inside the Atlas console closure, and the
   per-war IntMapOS commands are registered from the DOM-bound shell at boot. */
test('R409 ⑪: the two war rows have aliases Atlas can resolve', () => {
  const src = raw('js/atlas-console.js');
  const need = [['world war ii', 'dl-ww2'], ['第二次世界大戦', 'dl-ww2'], ['ww2', 'dl-ww2'],
    ['world war i', 'dl-ww1'], ['第一次世界大戦', 'dl-ww1'], ['ww1', 'dl-ww1']];
  for (const [k, v] of need) {
    assert.ok(src.includes("'" + k + "':'" + v + "'"), 'LAYER_ALIASES does not map «' + k + '» to ' + v);
  }
  /* and the control plane exposes both, by name */
  const shell = codeOnly(raw('js/war-fronts.js'));
  assert.ok(/R\.id \+ '\.toggle'/.test(shell) && /R\.id \+ '\.show'/.test(shell), 'the per-war IntMapOS commands are gone');
  assert.ok(/register\('wars\.toggle'/.test(shell) && /register\('wars\.show'/.test(shell), 'the pre-split command names no longer answer — a saved plan that says them does nothing');
});

/* ── ⑫ the transport is the app's one player, not a fourth copy of one ───────────────────────── */
/* ⚠ SPELLING, ON PURPOSE: the transport is DOM built inside the legend; the stylesheet is a string. */
test('R409 ⑫: the legend transport is built from window.IntMapWxPlayer', () => {
  const src = codeOnly(raw('js/war-layer.js'));
  assert.ok(/window\.IntMapWxPlayer/.test(src), 'the war legend builds its own transport buttons');
  assert.ok(/B\.IC\.(first|prev|play|pause|next)/.test(src), 'the transport does not use the shared icon set');
  /* the shared CSS is what dresses them: no new rule for the player may appear in this file */
  const cssBlock = /function css\(\)[\s\S]*?\]\.join\(''\)/.exec(raw('js/war-layer.js'));
  assert.ok(cssBlock, 'the legend stylesheet is gone');
  assert.ok(!/ecl-b\s*\{|ecl-player\s*\{|ecl-timerange\s*\{/.test(cssBlock[0]), 'the war legend restyles the shared player — two declarations of one control is how they drift apart');
});

/* ── ⑬ the favourite chip says the layer's name, not its id ──────────────────────────────────── */
/* ⚠ js/layer-favs.js reads a row's name from `span[data-i18n]` or `span.ec-lbl` and FALLS BACK TO
   THE RAW ID. The row this round replaced had neither, so pinning the world wars put a chip on
   screen labelled 「wars」 — in all nine languages.
   ⚠ SPELLING, ON PURPOSE: the row is markup written into the Layers panel by the DOM shell. */
test('R409 ⑬: each war row carries a label span that the favourites bar can read', () => {
  const shell = raw('js/war-fronts.js');
  /* ⚠ read the block by OFFSET, not by a pattern anchored to a line end — a check that depends on
     which machine wrote the file (CRLF / LF) is not a check. */
  const at = shell.indexOf('w.innerHTML =');
  assert.ok(at > 0, 'the row markup is no longer a literal — this check reads it');
  const markup = shell.slice(at, at + 400);
  assert.ok(/class="ec-lbl"/.test(markup), 'the label span has no class js/layer-favs.js looks for, so a pinned war row is labelled with its raw id');
  const favs = codeOnly(raw('js/layer-favs.js'));
  assert.ok(/querySelector\('span\.ec-lbl'\)/.test(favs), 'js/layer-favs.js no longer reads span.ec-lbl — the class above now means nothing');
});

/* ── ⑭ a layer whose era the clock has left holds its own day ────────────────────────────────── */
/* ⚠ THE SPLIT CREATED A CASE THAT DID NOT EXIST BEFORE: a clock at 1916 is inside WW1 and outside
   WW2, and `setDate` clamps, so an unguarded follow would drag WW2 to 1 September 1939.
   ⚠ SPELLING, ON PURPOSE: the handler is subscribed inside the DOM-bound layer instance. */
test('R409 ⑭: the clock handler only follows an instant that lands inside this war', () => {
  const src = codeOnly(raw('js/war-layer.js'));
  const i = src.indexOf('IntMapTime.on(');   /* (module-graph) the imported clock binding */
  assert.ok(i > 0, 'the layer no longer subscribes to the master clock at all');
  const h = src.slice(i, i + 520);
  assert.ok(/if \(d < sp\[0\] \|\| d > sp\[1\]\) return;/.test(h), 'the clock handler no longer refuses an instant outside this war');
  /* and it refuses BEFORE it stops playback or repaints */
  const bail = h.indexOf('sp[1]) return;');
  const stop = h.indexOf('stopPlay()');
  assert.ok(bail > 0 && stop > bail, 'the handler stops playback before deciding whether the instant even belongs to this war');
});

/* ── ⑮ a SAVED SESSION that had the world wars on comes back with both wars on ───────────────── */
/* ⚠ THIS IS THE THIRD DOOR THE OLD ID COMES THROUGH: the Layers panel (①), a share link (②) and the
   session snapshot restored on the next visit. js/session-tabs.js keeps a RETIRED table precisely so
   a retirement is recorded in ONE place — and this round is its first SPLIT rather than a rename. */
test('R409 ⑮: the retired dl-wars session id restores both war rows, and the rename entries still work', () => {
  /* EVALUATED (was: regexes over the table literal and its loop). The table and the loop that applies
     it are lifted by their braces and RUN on the wanted list a restored session carries. */
  const src = codeOnly(raw('js/session-tabs.js'));
  const t = src.indexOf('const RETIRED=');
  assert.ok(t > 0, 'js/session-tabs.js no longer keeps the retirement table as a literal');
  const table = blockAt(src, 'const RETIRED=');
  const loop = blockAt(src, 'for(let i=want.length-1', t);
  const retire = (want) => new Function('want', table + ';\n' + loop + '\nreturn want;')(want.slice());
  const RETIRED = new Function(table + ';\nreturn RETIRED;')();
  assert.deepEqual(retire(['dl-wars']).slice().sort(), ['dl-ww1', 'dl-ww2'], 'the retirement table does not turn dl-wars into both war rows');
  /* the list form de-duplicates — a session holding dl-wars AND dl-ww1 must not tick one row twice */
  assert.deepEqual(retire(['dl-ww1', 'dl-wars']).slice().sort(), ['dl-ww1', 'dl-ww2'],
    'the list form does not de-duplicate — a session holding dl-wars AND dl-ww1 would tick one row twice');
  /* and the five rename entries still behave exactly as they always did: one id to one id, and a
     session already holding the new id keeps one copy */
  for (const keep of ['dl-oceancur', 'dl-night', 'dl-temp', 'bx-wbco2t', 'dl-milSpendGDP']) {
    const to = RETIRED[keep];
    assert.equal(typeof to, 'string', 'the rename entry for ' + keep + ' was dropped when the table learned to hold a list');
    assert.deepEqual(retire([keep]), [to], keep + ' no longer renames to ' + to);
    assert.deepEqual(retire([keep, to]), [to], keep + ': a session already holding ' + to + ' now carries it twice');
  }
});

/* ── ⑯ the build still refuses a country described only by `control` and checked by nothing ───── */
/* ⚠ A GATE OUTLIVES THE REASON IT WAS WRITTEN, so the reason is written beside it and this check
   keeps the gate. #R349 shipped France painted Allied for the twenty months between Case Anton and
   D-Day. ⚠ SPELLING, ON PURPOSE: this asserts the gate's presence in the build script (it runs over
   the curated record only when the build writes data/wars.json). */
test('R409 ⑯: build-wars still gates the spans where only `control` describes a divided country', () => {
  const src = raw('scripts/build-wars.mjs');
  assert.ok(/⑪ #R409/.test(src), 'the uncut-span gate is gone from scripts/build-wars.mjs');
  const code = codeOnly(src);
  assert.ok(/const DAYSPAN = 365;/.test(code), 'the gate no longer states the span it bounds');
  assert.ok(/cur\.pts\.length && \(cur\.cuts \|\| \[\]\)\.indexOf\(gw\) >= 0/.test(code),
    'the gate no longer treats an empty `pts` as «no line here» — that spelling IS how a front says it has stopped, and it is what made France Allied');
  assert.ok(/const CHECKS_UNCUT = \[/.test(code), 'the assertions the gate asked for are gone');
  const rows = [...code.matchAll(/\['ww[12]', '[\d-]+', '[^']+', '[A-Z]+'\]/g)];
  assert.ok(rows.length >= 200, 'the control-check table shrank to ' + rows.length + ' rows');
  /* the one that was actually wrong */
  assert.ok(/\['ww2', '\d{4}-\d{2}-\d{2}', 'Paris', 'AXIS'\]/.test(code),
    'nothing asserts that occupied Paris is Axis on a date no front line crosses France');
});

/* ── ⑰ the layer refuses to build before the record arrives, and never emits a case-less match ── */
/* ⚠ MEASURED, NOT REASONED. `ensure()` is reached from three places and only `toggle()` awaits the
   fetch; a basemap swap during that fetch built the whole stack from `data === null`. The colour
   expression then came out as `['match', ['get','kind'], '#ffffff']` — which MapLibre rejects — the
   facade swallowed the bad `addLayer`, and nothing ever tried again. */
test('R409 ⑰: ensure() waits for the record, and the kind colour is never a match with no cases', () => {
  /* ⚠ SPELLING, ON PURPOSE, FOR THE RETRY WIRING: ensure(), whenDrawable() and the styledata handler
     are the layer instance's renderer lifecycle (a live style, its events, its timers). */
  const src = codeOnly(raw('js/war-layer.js'));
  const i = src.indexOf('function ensure()');
  assert.ok(i > 0, 'ensure() is gone');
  const head = src.slice(i, i + 320);
  assert.ok(/if \(!data\) return false;/.test(head), 'ensure() no longer refuses to build before data/wars.json has arrived');
  /* …and the retry has to wait for the same two things, or the caller that arrived early gives up */
  assert.ok(/const canBuild = \(\) => !!data && canDraw\(\);/.test(src), 'the retry predicate no longer covers both «style ready» and «record arrived»');
  const wd = src.slice(src.indexOf('function whenDrawable('), src.indexOf('function whenDrawable(') + 620);
  assert.ok(!/\bcanDraw\(\)/.test(wd), 'whenDrawable still asks only whether the style is ready');
  assert.equal((wd.match(/canBuild\(\)/g) || []).length, 2, 'whenDrawable must test canBuild() on entry and on each tick');
  /* the style handler goes through the retry rather than giving up on one refusal */
  const sd = src.slice(src.indexOf("events.on('styledata'"), src.indexOf("events.on('styledata'") + 300);
  assert.ok(/whenDrawable\(/.test(sd), 'a basemap swap during the fetch is dropped again instead of retried');
  /* EVALUATED (was: two regexes over kindColourExpr's body): the expression itself cannot degenerate.
     Every shape of kind table — none, empty, battle only, one other kind — is built by the shipped
     function and handed to MapLibre's parser, which is what rejected `['match', input, fallback]`. */
  for (const [what, data] of [['no record', null], ['an empty kind table', { kinds: {} }],
    ['a battle-only table', { kinds: { battle: { col: '#aa0000' } } }],
    ['a single non-battle kind', { kinds: { air: { col: '#0000aa' } } }]]) {
    const e = kindColourExpr(data);
    assert.equal(createExpression(e, STYLE_COLOUR).result, 'success', what + ' produces an expression MapLibre rejects: ' + JSON.stringify(e));
  }
  assert.equal(kindColourExpr(null), '#ffffff', 'an empty kind table produces a match expression again');
  assert.equal(kindColourExpr({ kinds: { battle: { col: '#aa0000' } } }), '#aa0000', 'a single-kind table produces a match with no cases again');
});

/* ── ⑱ the operation card wins the click, and the legend is capped against its neighbours ─────── */
/* ⚠ BOTH OF THESE WERE FOUND ON PRODUCTION, after every local gate was green: one click ran the
   operation handler AND the country handler; and the legend (579 px) stacked above the cables
   legend started at y = −22 on a 900 px window inside an `overflow-y:hidden` container.
   ⚠ SPELLING, ON PURPOSE: click arbitration and a CSS height are browser behaviour (the order of
   two DOM click handlers, a viewport unit), which node has neither of. */
test('R409 ⑱: the operation claims its click, and the legend cap allows for another legend', () => {
  const src = codeOnly(raw('js/war-layer.js'));
  const ev = src.slice(src.indexOf('function onEvent('), src.indexOf('function onEvent(') + 420);
  assert.ok(/claimClick\(ev\)/.test(ev), 'the operation handler no longer claims the click, so the country underneath takes it');
  const ar = src.slice(src.indexOf('function onArea('), src.indexOf('function onArea(') + 320);
  assert.ok(/clickClaimed\(ev\)\)\s*return;/.test(ar), 'the country handler no longer stands down for a claimed click');
  /* the claim must be the FIRST thing the country handler does — after `show()` it would be too late */
  assert.ok(ar.indexOf('clickClaimed') < ar.indexOf('show('), 'the country handler shows its popup before asking whether the click was claimed');
  /* and the height cap has to be viewport-relative, not a bare pixel number */
  const cssBlock = raw('js/war-layer.js');
  const m = /'\.war-info\{max-height:([^;]+);/.exec(cssBlock);
  assert.ok(m, 'the legend prose no longer carries a height cap');
  assert.ok(/dvh|vh/.test(m[1]), 'the cap is a fixed pixel number again — it cannot know there is another legend on the map: ' + m[1]);
  assert.ok(/calc\(/.test(m[1]), 'the cap no longer subtracts room for the box’s own controls and a neighbouring legend: ' + m[1]);
});

/* ══ #R519 — four more wars on the day-by-day layer ══════════════════════════════════════════
   「戦争の時間地図がWWI・WWIIに集中… 朝鮮戦争、ベトナム戦争、中東戦争、ユーゴ紛争などを同じ
   war-layer形式へ追加すると、既存基盤をそのまま使えるので強いです。」 The base WAS reusable. These
   are the three ways reusing it could go quietly wrong: a war no row reaches, a name that DEFAULTS
   (a two-branch ternary over an id is a default, and the default was WW2), and a base map that is
   already an answer (CShapes' one Korean geometry is the 1953 armistice line). */

/* ── ① the Layers panel and the curated record name the same wars ────────────────────────────── */
test('R519 ①: every row is a war in data/wars.json, and every war has a row', () => {
  assert.ok(ROWS.length >= 6, 'js/war-fronts.js declares ' + ROWS.length + ' war rows; #R519 ships six');
  const rowIds = ROWS.map((r) => r.id);
  const warIds = wars.wars.map((w) => w.id);
  assert.deepEqual(rowIds, warIds, 'the Layers rows and the shipped record disagree about which wars exist: rows '
    + rowIds.join(' ') + ' / record ' + warIds.join(' '));
});

/* ── ② …and every one of them is on a shelf in the Layers panel ──────────────────────────────── */
test('R519 ②: every war row is listed in the politics group', () => {
  /* the shelves are js/layer-manifest.js — a war with no entry, or an entry naming the wrong box,
     strands its row under 「その他」 exactly as a missing literal entry did */
  const shelf = LM.layerGroups().find(([k]) => k === 'lyrGrpPolitics');
  assert.ok(shelf, 'the politics group is no longer a shelf of the layer manifest — this check reads the list itself');
  const ids = shelf[1];
  for (const r of ROWS) {
    assert.ok(ids.includes(r.id), r.id + ' has a row but no shelf: it would strand under 「その他」');
    assert.equal((LM.layerFor(r.id) || {}).id, 'dl-' + r.id, r.id + ': the manifest resolves the shelf entry to a different box than the row builder makes');
  }
});

/* ── ③ Atlas can be asked for each of them by name ───────────────────────────────────────────── */
/* ⚠ SPELLING, ON PURPOSE: LAYER_ALIASES is a literal table inside the Atlas console closure (⑪). */
test('R519 ③: every war has Atlas aliases pointing at its row', () => {
  const atlas = R('js/atlas-console.js');
  for (const r of ROWS) {
    const n = (atlas.match(new RegExp(":'dl-" + r.id + "'", 'g')) || []).length;
    assert.ok(n >= 4, 'dl-' + r.id + ' has ' + n + ' Atlas aliases; a war reachable only by its full label is'
      + ' the defect #R409 fixed for the world wars');
  }
});

/* ── ④ the row name exists in all nine languages ─────────────────────────────────────────────── */
/* ⚠ FIVE ARE POSITIONAL ARGUMENTS AND FOUR ARE TABLE LOOKUPS KEYED BY THE ENGLISH STRING — which is
   why a row can be fully translated for en/ja/de/ru/es and silently English in zh-Hant, zh-Hans, fr
   and ko. */
test('R519 ④: every row label is translated in the four table languages too', () => {
  /* ⚠ the labels are read out of the DOM shell's row table; the locale files are data */
  const labels = [...R('js/war-fronts.js').matchAll(/label:\s*\(\)\s*=>\s*L\('([^']+)'/g)].map((m) => m[1]);
  assert.equal(labels.length, ROWS.length, 'a row has no label, or a label has no row');
  for (const f of ['ui.zh.js', 'ui.zh-hans.js', 'ui.fr.js', 'ui.ko.js']) {
    const t = R('js/locales/' + f);
    for (const en of labels) {
      assert.ok(t.includes("'" + en + "'"), 'js/locales/' + f + ' has no entry for «' + en
        + '» — that row reads in English for those readers');
    }
  }
});

/* ── ⑤ no place turns a war id into words by defaulting to the other war ─────────────────────── */
/* ⚠ SPELLING, ON PURPOSE: «no two-branch ternary over a war id» is a claim about how the code is
   written — a ternary answers the two wars that exist today correctly and defaults the third. */
test('R519 ⑤: the war name is looked up, not chosen by a two-branch ternary', () => {
  const os = ROWS.map((r) => r.os);
  assert.equal(new Set(os).size, os.length, 'two wars register with IntMapOS under the same label: ' + os.join(' / '));
  const layer = codeOnly(R('js/war-layer.js'));
  const shell = codeOnly(R('js/war-fronts.js'));
  for (const id of ROWS.map((r) => r.id)) {
    const re = new RegExp("id\\s*===\\s*'" + id + "'\\s*\\n?\\s*\\?");
    assert.ok(!re.test(layer), "js/war-layer.js still names a war with a ternary on id === '" + id
      + "'; the else-branch of that is every other war");
    assert.ok(!re.test(shell), "js/war-fronts.js still names a war with a ternary on id === '" + id
      + "'; the else-branch of that is every other war");
  }
});

/* ── ⑥ ⚠ the Korean War opens on the border it opened on, not on the one it ended on ─────────── */
test('R519 ⑥: on 25 June 1950 the map shows the 38th parallel, not the 1953 armistice line', () => {
  const korea = wars.wars.find((w) => w.id === 'korea');
  assert.ok(korea, 'no Korean War in the shipped record');

  /* the base map really is the wrong shape — measured, not assumed, so the check below is known to
     be asking something */
  const t0 = 19500625;
  const nk = CS.feats.find((f) => f[1] === 731
    && f[2] * 10000 + f[3] * 100 + f[4] <= t0 && f[5] * 10000 + f[6] * 100 + f[7] >= t0);
  assert.ok(nk, 'CShapes has no North Korea on 25 June 1950');
  let edge = Infinity;
  for (const poly of polysOf(nk)) for (const ring of poly) for (const p of ring) {
    if (p[0] >= 126.6 && p[0] <= 128.5 && p[1] < edge) edge = p[1];
  }
  assert.ok(edge < 38, "CShapes' North Korea now stops at " + edge.toFixed(3)
    + '°N; this check exists because its polygon used to reach below the 38th parallel');

  /* ⚠ THIS ASKS THE GEOMETRY, NOT A CITY. Kaesong is an ANCHOR of the line the record quotes for that
     day, so the cut passes through it and the answer is whichever side of a town-hall coordinate the
     arithmetic lands on (scripts/wars/ww1.mjs says exactly this about Ypres and Cambrai). So the
     question is asked of the pieces: on the opening day the front has to divide BOTH Koreas. */
  const t = dnum('1950-06-25');
  const piecesFor = (gw) => {
    const f = CS.feats.find((x) => x[1] === gw
      && x[2] * 10000 + x[3] * 100 + x[4] <= t && x[5] * 10000 + x[6] * 100 + x[7] >= t);
    assert.ok(f, 'CShapes has no gw' + gw + ' on 25 June 1950');
    const tl = korea.control[gw];
    let base = 'NEUTRAL';
    if (tl) for (const [dd, k] of tl) { if (dd <= '1950-06-25') base = k; }
    return { base, pieces: WarGeom.warPieces(polysOf(f), base, cutsFor(korea, gw, '1950-06-25')) };
  };

  const north = piecesFor(731);
  assert.ok(north.pieces.some((p) => p.faction !== north.base),
    'on 25 June 1950 the whole of CShapes’ North Korea is painted ' + north.base
    + '; that polygon reaches down to 37.789°N, so the Ongjin peninsula and Kaesong — in the Republic of'
    + ' Korea until 1951 — are being handed to the north. The record needs a front along the 38th parallel'
    + ' cutting gw731 from the opening day');
  const south = piecesFor(732);
  assert.ok(south.pieces.some((p) => p.faction !== south.base),
    'on 25 June 1950 the whole of CShapes’ South Korea is painted ' + south.base
    + '; that polygon reaches up to 38.625°N, so the ground north of the parallel that the war began on'
    + ' is being handed to the south. The same front has to cut gw732 as well');
});

/* ── ⑦ no year of any war is a blank map ────────────────────────────────────────────────────── */
/* ⚠ THIS IS THE CLAIM THAT REPLACES R381 ② FOR THE FOUR DISCONTINUOUS WARS, and it is a different
   claim rather than a weaker one: the layer can always answer «who held the ground». Silence cannot
   satisfy it — a control table that stops early, a war whose span runs past the CShapes lifetime of
   its own countries (CShapes ends 2019-12-31), or gwcodes that never existed all paint an empty map. */
test('R519 ⑦: every war paints somebody, in every year it was fought', () => {
  for (const w of wars.wars) {
    /* `from`..`to`, not `span` — the span reaches up to 120 days either side, where nobody has
       declared anything yet and Neutral is the right answer */
    for (let y = +w.from.slice(0, 4); y <= +w.to.slice(0, 4); y++) {
      let probe = y + '-07-01';
      if (probe < w.from) probe = w.from;
      if (probe > w.to) probe = w.to;
      const t = dnum(probe);
      let live = 0;
      for (const gw of Object.keys(w.control)) {
        const f = CS.feats.find((x) => x[1] === +gw
          && x[2] * 10000 + x[3] * 100 + x[4] <= t && x[5] * 10000 + x[6] * 100 + x[7] >= t);
        if (!f) continue;
        let base = 'NEUTRAL';
        for (const [d, k] of w.control[gw]) if (d <= probe) base = k;
        if (base !== 'NEUTRAL') live++;
      }
      assert.ok(live > 0, w.id + ': on ' + probe + ' not one country the record names both exists in CShapes'
        + ' and is painted — that day of the war is a blank map');
    }
  }
});
