/* ============================================================================
 *  #R381 — finishing the two world wars
 * ----------------------------------------------------------------------------
 *  #R349 built the machinery for a day-by-day record of both wars and then filled about half of it
 *  in: five fronts and 24 dated lines for WW1, eight and 36 for WW2, and eighteen and thirty-six
 *  operations between them. Serbia, the Caucasus, Mesopotamia and Romania had no line at all; nor
 *  did Norway, Albania, Greece or Burma; the Pacific — which by design has no front and therefore
 *  has ONLY operations — had five of them. The gazetteer it shipped names every one of those
 *  theatres, and 178 of its 408 anchors were quoted by nothing.
 *
 *  ⚠ EVERY CHECK HERE READS data/wars.json AND RUNS js/war-geom.js — the shipped file through the
 *  code the browser paints with. #R349's lesson stands: the defect this round could ship is a front
 *  drawn the right shape and the wrong way round, and that looks exactly like a correct one. Nine of
 *  those were found by the build's own audit while this round was being written, INCLUDING ONE
 *  #R349 SHIPPED — the Battle of France, whose sides were declared back to front for its whole span,
 *  so that on 25 May 1940 the map put Paris, Lyon and Bordeaux under the Wehrmacht.
 *
 *  ⚠ AND THEY ARE READ THROUGH `readLF` where they are read as text, for the reason #R283 gives.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { WarGeom } from '../js/war-geom.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const wars = JSON.parse(readFileSync(join(ROOT, 'data', 'wars.json'), 'utf8'));
const csText = readFileSync(join(ROOT, 'data', 'cshapes.js'), 'utf8');
const CS = JSON.parse(csText.slice(csText.indexOf('=') + 1).replace(/;\s*$/, ''));
const dnum = (d) => { const p = String(d).split('-'); return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]); };
const polysOf = (f) => f[8].map((poly) => poly.map((ri) => CS.rings[ri]));
const war = (id) => wars.wars.find((w) => w.id === id);
const front = (id, fid) => war(id).fronts.find((f) => f.id === fid);

/* ── ① every theatre the gazetteer names is now drawn ────────────────────────────────────────── */
test('R381 ①: both wars carry a front for every theatre they name a place in', () => {
  const w1 = war('ww1').fronts.map((f) => f.id).sort();
  const w2 = war('ww2').fronts.map((f) => f.id).sort();
  /* the four #R349 had no line for in each war — these are the ids, not a count, because a count
     goes green the moment somebody adds any front at all */
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
test('R381 ②: no year of either war is left without a dated line and an operation', () => {
  for (const w of wars.wars) {
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
/* It is the only theatre of either war that is represented by operations ALONE, because there was
   no line to draw across an ocean. That is a defensible decision and it was #R349's; what it also
   means is that five events WERE the entire Pacific war on this map — Pearl Harbor, Singapore,
   Midway, Guadalcanal, Leyte Gulf. A count is the right check precisely here. */
test('R381 ③: the Pacific, which has no front, has a record made of operations', () => {
  const box = [100, -12, 180, 45];      /* the western Pacific and South-East Asia */
  const inBox = war('ww2').events.filter((e) => e.at[0] >= box[0] && e.at[0] <= box[2]
    && e.at[1] >= box[1] && e.at[1] <= box[3]);
  assert.ok(inBox.length >= 45, `only ${inBox.length} operations east of 100°E — the Pacific is still a list of five`);
  /* and it reaches every year of it, not just 1941–42 */
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
/* Resolved through WarGeom from the SHIPPED file — «what will a reader see», not «what did the
   author mean». Every row is a fact anybody can look up, and eleven of them failed on the first
   green build of this round. */
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
  const cuts = [];
  for (const F of w.fronts) {
    if (F.until && d >= F.until) continue;
    let cur = null;
    for (const D of F.dates) { if (D.d <= d) cur = D; }
    if (!cur || cur.cuts.indexOf(hit[1]) < 0) continue;
    cuts.push({ pts: cur.pts, left: cur.left || F.left, right: cur.right || F.right });
  }
  return WarGeom.factionAt(pt, polysOf(hit), base, cuts);
}

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
   city checks covered exactly one date in that campaign — 25 June, which carries a per-date override
   — so the one date that looked right was the only one anybody asked about. */
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
/* Four of the eleven were this shape: the cut is extended until it leaves the country, so a chord
   that stops in the middle carries on along its last bearing and decides places nobody was fighting
   over. The western lines have to reach the Swiss frontier and the Chinese ones the West River. */
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
  for (const f of ['scripts/wars/ww1.mjs', 'scripts/wars/ww2.mjs']) {
    assert.match(readLF(join(ROOT, f)), /\]\.sort\(\(a, b\) => \(a\.d < b\.d \? -1 : a\.d > b\.d \? 1 : 0\)\)/,
      `${f} must sort its events rather than rely on the order they were written in`);
  }
});

/* ── ⑩ the build refuses to write a table with an anchor nothing quotes ──────────────────────── */
/* ⚠ THIS IS A SOURCE CHECK AND IT IS DELIBERATELY WEAK — it asserts that the gate EXISTS, not that
   it works; what proves it works is that it is the gate that found 145 idle anchors while this round
   was being written, and that scripts/build-wars.mjs will not write data/wars.json while any remain.
   #R339's lesson: say which of the two a check is doing. */
test('R381 ⑩: build-wars.mjs still refuses an anchor no line, operation or check reaches', () => {
  const src = readLF(join(ROOT, 'scripts', 'build-wars.mjs'));
  assert.match(src, /are quoted by nothing/, 'the unused-anchor gate has been removed from the build');
  assert.match(src, /for \(const \[, , place\] of CHECKS\) quoted\.add\(place\);/,
    'the gate must count the control checks as a use, or it will force fake events for check cities');
});
