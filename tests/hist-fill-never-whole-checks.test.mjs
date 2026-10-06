/* (hist-fill-never-whole) data/hist-admin-fill.js refused whole countries as `never-whole` — Latvia's 119
   municipalities on every date, 2011 included, when all 119 were in force together. Two structural causes:
   ① a code held by TWO Wikidata items (a reform reused it) was folded into ONE unit, so the predecessor's
     outline took the successor's founding and the set floor fell after three quarters of the set had ended;
   ② a sample point stands for its lattice cell, and one sitting 0.2 km outside the era outline's coast read
     as «unplaced» — Carnikava's two points became 50% and withheld the country.
   These checks hold each rule to its fact, with a synthetic upstream and on the shipped bundle. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { fillInceptionProblems } from '../scripts/hist-fidelity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const load = (rel) => { const s = rd(rel); return JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, '')); };
const v = (d) => ({ type: 'literal', value: d });
const R = (r) => ({ type: 'uri', value: 'http://wikiba.se/ontology#' + r });
const row = (code, q, inc, dis, rank = 'NormalRank') => ({ code: v(code), item: v('http://www.wikidata.org/entity/' + q), rank: R(rank), ...(inc ? { inc: v(inc) } : {}), ...(dis ? { dis: v(dis) } : {}) });

async function spansFrom(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'histfill-nw-'));
  fs.writeFileSync(path.join(dir, 'p300-spans-ranked.json'), JSON.stringify(rows));
  fs.writeFileSync(path.join(dir, 'p8119-spans-ranked.json'), '[]');
  process.env.INTMAP_HISTFILL_CACHE = dir;
  try {
    const F = await import('../scripts/build-hist-admin-fill.mjs');
    return { F, m: await F.wikidataSpans() };
  } finally { delete process.env.INTMAP_HISTFILL_CACHE; fs.rmSync(dir, { recursive: true, force: true }); }
}

test('① two items holding one code are two lives, not one unit with both items\' dates', async () => {
  const { m } = await spansFrom([
    /* Ludza as Wikidata states it: the 2009 municipality, ended 2021-06-30, and the merged one from 2021-07-01 */
    row('LV-058', 'Q932445', '2009-07-01T00:00:00Z', '2021-06-30T00:00:00Z'),
    row('LV-058', 'Q97231943', '2021-07-01T00:00:00Z'),
    /* Kagawa: several foundings on ONE item — the rule inside an item is unchanged */
    row('JP-37', 'Q161454', '1871-12-26T00:00:00Z', '1876-08-21T00:00:00Z'),
    row('JP-37', 'Q161454', '1888-12-03T00:00:00Z', '1876-08-21T00:00:00Z'),
  ]);
  const lv = m.get('LV-058');
  assert.deepEqual(lv.lives.map((l) => [l.qid, l.s, l.e]), [['Q932445', 20090701, 20210630], ['Q97231943', 20210701, null]]);
  assert.equal(lv.s, 20210701, 'the top-level span is still the latest-founded item\'s');
  assert.equal(lv.e, null, 'the predecessor\'s end leaked into the successor');
  const jp = m.get('JP-37');
  assert.deepEqual(jp.lives.map((l) => [l.s, l.e]), [[18881203, null]], 'one item is one life, drawn from its last founding');
});

test('① the set floor is the first date every dated unit is in force — and the old floor wherever codes have one life', async () => {
  const { F, m } = await spansFrom([
    row('LV-058', 'Q932445', '2009-07-01T00:00:00Z', '2021-06-30T00:00:00Z'),
    row('LV-058', 'Q97231943', '2021-07-01T00:00:00Z'),
    row('LV-005', 'Q1', '2009-07-01T00:00:00Z', '2021-06-30T00:00:00Z'),
    row('LV-063', 'Q2', '2011-01-01T00:00:00Z', '2021-06-30T00:00:00Z'),
    row('LV-RIX', 'Q1773', '1201-01-01T00:00:00Z'),
    row('JP-37', 'Q161454', '1888-12-03T00:00:00Z'),
    row('JP-18', 'Q133879', '1881-02-07T00:00:00Z'),
    row('NO-02', 'Q50615', '2024-01-01T00:00:00Z'),
    row('NO-17', 'Q50629', '1919-01-01T00:00:00Z', '2017-12-31T00:00:00Z'),
  ]);
  const lv = ['LV-058', 'LV-005', 'LV-063', 'LV-RIX'].map((c) => m.get(c));
  assert.equal(F.setFloorOf(lv), 20110101, 'Latvia\'s set is in force together from the latest founding inside its predecessors\' window');
  assert.deepEqual(F.setLife(lv), [[20110101, 20210630]]);
  /* one life per code: exactly the latest stated founding, as before */
  assert.equal(F.setFloorOf(['JP-37', 'JP-18'].map((c) => m.get(c))), 18881203);
  /* a set that is never in force together keeps the latest founding, so the whole-country rule refuses it by name */
  const no = ['NO-02', 'NO-17'].map((c) => m.get(c));
  assert.deepEqual(F.setLife(no), []);
  assert.equal(F.setFloorOf(no), 20240101);
});

test('② a point stands for its cell: an edge within half a cell places it, one farther does not', async () => {
  const { edgeDistance, GRID } = await import('../scripts/build-hist-admin-fill.mjs');
  const square = [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]];
  const tol = GRID / 2;
  assert.ok(Math.abs(edgeDistance(square, 1.002, 0.5, tol) - 0.002) < 1e-9, 'a point 0.002° outside the coast is placed');
  assert.equal(edgeDistance(square, 1 + tol * 1.5, 0.5, tol), Infinity, 'a point beyond half a cell is still unplaced');
  /* a hole's edge counts too: an enclave's shore is the polity's edge */
  const holed = [[[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]]];
  assert.ok(edgeDistance(holed, 1.01, 2, tol) <= tol);
});

test('③ the gate re-derives lives: a row of a reused code must lie inside ONE life', () => {
  const base = { inception: { 'LV-058': 20090701 }, lives: { 'LV-058': [[20090701, 20210630], [20210701, null]] } };
  const feat = (s, e) => ['Ludzas', 4, ...s, ...e, [[0]], { en: 'Ludzas' }, 'LV-058', 'LVA'];
  const ok = fillInceptionProblems([{ file: 'data/hist-admin-fill.js', b: { ...base, feats: [feat([2011, 1, 1], [2021, 6, 30])] } }]);
  assert.deepEqual(ok, []);
  const across = fillInceptionProblems([{ file: 'data/hist-admin-fill.js', b: { ...base, feats: [feat([2011, 1, 1], [2022, 1, 1])] } }]);
  assert.equal(across.length, 1); assert.equal(across[0][0], 'fill-before-inception');
  assert.match(across[0][1], /outside every stated life/);
});

test('④ the shipped bundle draws Latvia whole, from its predecessors\' lives, and refuses it nowhere', () => {
  const fill = load('data/hist-admin-fill.js');
  const ne = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data', 'admin1-world.json.gz'))));
  const codes = new Set(ne.f.filter((f) => f.i === 'LVA').map((f) => f.n.split('|').find((p) => /^[A-Z]{2}-[A-Z0-9]{1,3}~?$/.test(p))));
  assert.ok(!fill.refused.LVA, 'Latvia is refused: ' + JSON.stringify(fill.refused.LVA));
  const lv = fill.feats.filter((f) => f[11] === 'LVA');
  const at = (y, m, d) => new Set(lv.filter((f) => f[2] * 10000 + f[3] * 100 + f[4] <= y * 10000 + m * 100 + d && f[5] * 10000 + f[6] * 100 + f[7] > y * 10000 + m * 100 + d).map((f) => f[10]));
  /* (hist-recon-expand) the defect #1015 fixed is «Latvia refused whole». Since the reconstruction draws Latvia's
     rajoni, novadi and cities 1991–2019 the fill yields there unit by unit, so «drawn whole» is asked of the GROUND
     the READER sees on the day: a point inside every one of Natural Earth's Latvian units must lie inside a fill row
     or a reconstruction row in force. (Measured 2026-10-06: in 2015 the fill draws 1 unit, the reconstruction 118.) */
  const recon = load('data/hist-admin-recon.js');
  const day = 20150615;
  const live = (f) => f[2] * 10000 + f[3] * 100 + f[4] <= day && f[5] * 10000 + f[6] * 100 + f[7] > day;
  const inRing = (r, x, y) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const holds = (b, f, x, y) => f[8].some((poly) => inRing(b.rings[poly[0]], x, y) && !poly.slice(1).some((ri) => inRing(b.rings[ri], x, y)));
  const seen = [...fill.feats.filter((f) => f[11] === 'LVA' && live(f)).map((f) => [fill, f]), ...recon.feats.filter((f) => f[12] === 'LVA' && live(f)).map((f) => [recon, f])];
  const missing = [];
  for (const u of ne.f.filter((x) => x.i === 'LVA')) {
    const outer = (u.g.type === 'Polygon' ? [u.g.coordinates] : u.g.coordinates).map((p) => p[0]).sort((p, q) => q.length - p.length)[0];
    /* a point surely inside: the first of a few candidate points that the unit's own outer ring holds */
    let pt = null;
    const [x0, y0] = outer.reduce(([a, b], [x, y]) => [a + x / outer.length, b + y / outer.length], [0, 0]);
    for (const c of [[x0, y0], ...outer.map(([x, y]) => [(x + x0) / 2, (y + y0) / 2])]) if (inRing(outer, c[0], c[1])) { pt = c; break; }
    if (pt && !seen.some(([b, f]) => holds(b, f, pt[0], pt[1]))) missing.push(u.n.split('|')[0]);
  }
  assert.deepEqual(missing, [], 'Latvia in 2015 is not drawn whole — no fill or reconstruction row holds: ' + missing.join(', '));
  assert.equal(at(2022, 6, 15).size, 0, 'the 2009 outlines are drawn after the 2021 reform');
  assert.ok(fill.lives['LV-058'], 'the evidence for drawing a reused code in its predecessor\'s life is not carried');
  assert.deepEqual(fillInceptionProblems([{ file: 'data/hist-admin-fill.js', b: fill }]), []);
});
