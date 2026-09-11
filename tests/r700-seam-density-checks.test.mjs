/* ============================================================================
 *  IntMap · THE RESOLUTION STEP AT THE RECORD HANDOVERS — the property, not the number  (#R700)
 * ----------------------------------------------------------------------------
 *  Chronos answers a year from one of three records (js/time-borders.js: data/cshapes.js from
 *  1886, data/hist-borders.js 1689-1885, data/hist-eras.js below that), and the reader can step
 *  across either handover ONE DAY at a time. The three are separate surveys, so the outline
 *  visibly changes resolution on that day — measured at 1688→1689 and stated, with the whole
 *  reasoning, in docs/MAP-LAYERS.md §7.13 and scripts/asset-report.mjs.
 *
 *  ⚠ WHAT IS GUARDED HERE IS NOT «the step is 2.83×». That number belongs to the upstreams and
 *  moves when either of them is rebuilt. What must stay true is the reasoning the documents rest
 *  on: the step sits ON the record boundary and nowhere else, two independent measures of it
 *  agree, and OUR simplification is not what puts it there — move our tolerance on one record
 *  alone and the step changes size or sign rather than disappearing.
 *
 *  ⚠ NOTHING HERE READS A SOURCE FILE FOR A SPELLING (#R488/#R505). The record that answers a
 *  year comes from RUNNING js/time-borders.js's own dispatch through the harness
 *  scripts/histeras/time-borders.mjs, the marks are read by the real js/border-coast.js, and the
 *  re-simplification uses the build's own simplifyRing.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';
import { simplifyRing } from '../scripts/histborders/geom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* the bundles are one assignment each (`window.__X={…};`), so the object is the file minus its head */
const bundle = (f) => {
  const s = readFileSync(join(ROOT, 'data', f), 'utf8');
  return JSON.parse(s.slice(s.indexOf('=') + 1).replace(/;\s*$/, ''));
};
const HISTB = bundle('hist-borders.js');
const CSHAPES = bundle('cshapes.js');
const HISTERAS = bundle('hist-eras.js');
const IMBCOAST = bundle('border-coast.js');

/* js/time-borders.js asks js/border-coast.js which edges of a record are border rather than that
   record's copy of the coastline, and that module indexes the marks BY RING IDENTITY — so it has
   to see the very objects the bundles pooled, which is why both are given the same parsed ones.
   Without it the collection builders throw and every year silently falls through to the snapshot
   tier (measured while writing this file: all four years answered «1700»). */
const bcWin = { __IMBCOAST: IMBCOAST, __HISTB: HISTB, __CSHAPES: CSHAPES, __HISTERAS: HISTERAS };
vm.runInContext(
  readFileSync(join(ROOT, 'js', 'border-coast.js'), 'utf8'),
  vm.createContext({
    window: bcWin, Map, Array, console,
    document: { createElement: () => ({ style: {} }), head: { appendChild() {} } },
  }),
  { filename: 'js/border-coast.js' },
);

const { api, window: w } = timeBorders({ year: 1700, lang: 'en' });
w.__HISTB = HISTB; w.__CSHAPES = CSHAPES; w.__HISTERAS = HISTERAS;
w.IntMapBorderCoast = bcWin.IntMapBorderCoast;

/* ── the two windows ──────────────────────────────────────────────────────────
   One region alone would not separate «the record changed» from «that country's border changed»:
   Iberia is quiet across both dates, and Japan is far from both and drawn by other hands. */
const REGION = {
  iberia: [-10, 36, 3, 44],
  japan: [129, 30, 146, 46],
};
const R_KM = 6371.0088;
const RAD = Math.PI / 180;
const haversine = (a, b) => {
  const dlat = (b[1] - a[1]) * RAD, dlon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dlon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
};
const inside = (p, bx) => p[0] >= bx[0] && p[0] <= bx[2] && p[1] >= bx[1] && p[1] <= bx[3];
const ringsOf = (g) => !g ? []
  : g.type === 'Polygon' ? g.coordinates
    : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

/* vertices per 100 km of line, and the median edge length, inside one window.
   ⚠ BOTH, AND THAT IS THE POINT. A density on its own is dominated by how much the coast bends
   inside the window, so a real difference in resolution can hide in it; an edge length on its own
   says nothing about how much line there is. A resolution step moves both, by the same factor. */
function measure(paths, bx) {
  const seen = new Set(), seg = [];
  for (const r of paths) {
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i];
      if (!inside(a, bx) || !inside(b, bx)) continue;
      /* an edge two polygons share is one edge on the screen, so it is counted once */
      const k = (a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]))
        ? a[0] + ',' + a[1] + '|' + b[0] + ',' + b[1]
        : b[0] + ',' + b[1] + '|' + a[0] + ',' + a[1];
      if (seen.has(k)) continue;
      seen.add(k);
      const d = haversine(a, b);
      if (d > 0) seg.push(d);
    }
  }
  const km = seg.reduce((s, d) => s + d, 0);
  assert.ok(seg.length > 50, 'the window holds almost no line — it is not measuring the record');
  return { n: seg.length, km, per100km: (seg.length / km) * 100, medKm: median(seg) };
}

/* GeoJSON rings close by repeating their first point; simplifyRing() works on open ones */
const openRing = (r) => {
  const n = r.length;
  return (n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) ? r.slice(0, n - 1) : r.slice();
};
const resimplify = (paths, tol) => paths.map((r) => {
  const o = openRing(r);
  if (o.length < 4) return r;
  const s = simplifyRing(o, tol);
  return s ? s.concat([s[0]]) : r;
});

/* which record answered — the cache key js/time-borders.js chose for the year, with the date taken
   off. ⚠ NOT a list of record names typed here: whatever the module keys a year by IS the record,
   so a fourth tier needs no line of this file. */
const recordOf = (key) => String(key).replace(/-?\d+$/, '') || 'snapshot';

const CACHE = new Map();
async function yearAt(y) {
  if (CACHE.has(y)) return CACHE.get(y);
  await api._go(y);                     /* the module's own dispatch decides; nothing here does */
  const fc = api.currentFC();
  const paths = ((fc && fc.features) || []).flatMap((f) => ringsOf(f.geometry));
  const row = { year: y, key: String(api.current()), record: recordOf(api.current()), paths, by: {} };
  for (const [name, bx] of Object.entries(REGION)) row.by[name] = measure(paths, bx);
  CACHE.set(y, row);
  return row;
}

const gap = (a, b) => Math.abs(Math.log(b / a));      /* the size of a step, either direction */

/* five-year windows, so that «only the boundary pair moves» is a testable claim rather than an
   assertion about two years */
const WINDOWS = [[1686, 1691], [1883, 1888]];
const SEAMS = [[1688, 1689], [1885, 1886]];

test('① the resolution step sits ON the record boundary, and only there', async () => {
  for (const [from, to] of WINDOWS) {
    const rows = [];
    for (let y = from; y <= to; y++) rows.push(await yearAt(y));
    const changes = [];
    for (let i = 1; i < rows.length; i++) if (rows[i].record !== rows[i - 1].record) changes.push(i);
    assert.equal(changes.length, 1,
      from + '-' + to + ': expected exactly one record handover, got ' + changes.length
      + ' (' + rows.map((r) => r.year + ':' + r.record).join(' ') + ')');
    const at = changes[0];
    for (const name of Object.keys(REGION)) {
      const d = rows.map((r) => r.by[name].per100km);
      for (let i = 1; i < rows.length; i++) {
        const g = gap(d[i - 1], d[i]);
        if (i === at) {
          /* the documents rest on there BEING a step here. If the upstreams ever converge this
             fails, and docs/MAP-LAYERS.md §7.13 is re-measured rather than left standing. */
          assert.ok(g >= 0.14, name + ': no step at the ' + rows[i - 1].year + '→' + rows[i].year
            + ' handover (' + d[i - 1].toFixed(2) + ' → ' + d[i].toFixed(2) + ' vertices/100 km)');
        } else {
          assert.ok(g <= 0.05, name + ': density moved ' + (Math.exp(g) * 100 - 100).toFixed(1)
            + '% inside one record at ' + rows[i - 1].year + '→' + rows[i].year
            + ' — then the step is not the record boundary');
        }
      }
    }
    /* the four rows docs/MAP-LAYERS.md §7.13 tabulates, re-derived — this is where that table is
       refreshed after either record is rebuilt, so it is printed rather than only asserted */
    for (const r of rows) {
      if (!SEAMS.flat().includes(r.year)) continue;
      console.log('  ' + r.year + ' ' + r.key + '  '
        + Object.keys(REGION).map((n) => n + ' ' + r.by[n].per100km.toFixed(2) + '/100km, median '
          + r.by[n].medKm.toFixed(1) + ' km').join('   '));
    }
  }
});

test('② the step is a resolution change, not a curvature artefact — density and edge length agree', async () => {
  for (const [a, b] of SEAMS) {
    const lo = await yearAt(a), hi = await yearAt(b);
    assert.notEqual(lo.record, hi.record, a + '/' + b + ' are answered by one record — the handover moved');
    for (const name of Object.keys(REGION)) {
      const dens = Math.log(hi.by[name].per100km / lo.by[name].per100km);
      const edge = Math.log(hi.by[name].medKm / lo.by[name].medKm);
      assert.ok(dens * edge < 0, name + ' ' + a + '→' + b + ': density and median edge length moved the SAME way ('
        + dens.toFixed(3) + ' / ' + edge.toFixed(3) + ') — one of the two is measuring something else');
      const r = Math.abs(dens) / Math.abs(edge);
      assert.ok(r > 1 / 1.5 && r < 1.5, name + ' ' + a + '→' + b + ': the two measures disagree in size (|ln| '
        + Math.abs(dens).toFixed(3) + ' vs ' + Math.abs(edge).toFixed(3) + ')');
    }
  }
});

/* ── our own simplification, moved on ONE record ──────────────────────────────
   The middle record is the one whose tolerance is a choice of ours that is not already at the
   storage grid, so it is what a «just make the step go away» change would touch.
   ⚠ Re-simplifying the SHIPPED rings is a LOWER bound on the effect — the build simplifies the raw
   OHM assembly, which has more left to remove — and that is the safe direction for an assertion. */
const TOL_SWEEP = [0.015, 0.02, 0.03, 0.05];

async function seams(tol) {
  const rows = {};
  for (const y of SEAMS.flat()) rows[y] = await yearAt(y);
  const middle = rows[1689].record;
  const dens = {};
  for (const y of SEAMS.flat()) {
    const r = rows[y];
    const paths = (tol && r.record === middle) ? resimplify(r.paths, tol) : r.paths;
    dens[y] = {};
    for (const [name, bx] of Object.entries(REGION)) dens[y][name] = measure(paths, bx).per100km;
  }
  const out = {};
  for (const name of Object.keys(REGION)) {
    out[name] = { a: dens[1689][name] / dens[1688][name], b: dens[1886][name] / dens[1885][name] };
  }
  return out;
}

test('③ our simplification is a slider between the two handovers, not an off switch', async () => {
  /* ⚠ THE CLAIM IS NOT «any change makes it worse». Coarsening the middle record really does
     shrink the 1688→1689 step — it is the fidelity of 1689-1885 that pays, which is why the answer
     is AGENTS.md §3-1 and not a number. What has to hold is that the SAME move pushes the other
     handover the other way, so the step is traded between the two dates and never removed. */
  const swept = [];
  for (const tol of [null, ...TOL_SWEEP]) swept.push([tol, await seams(tol)]);
  for (const name of Object.keys(REGION)) {
    for (let i = 1; i < swept.length; i++) {
      const [pt, p] = swept[i - 1], [ct, c] = swept[i];
      const label = name + ' ' + (pt === null ? 'as shipped' : pt) + ' → ' + ct + ': ';
      assert.ok(c[name].a < p[name].a, label + 'coarsening the middle record did not shrink the 1688→1689 step ('
        + p[name].a.toFixed(2) + '× → ' + c[name].a.toFixed(2) + '×) — then it is not our simplification that sets it');
      assert.ok(c[name].b > p[name].b, label + 'the 1885→1886 handover did not move the other way ('
        + p[name].b.toFixed(2) + '× → ' + c[name].b.toFixed(2)
        + '×) — then the trade-off scripts/asset-report.mjs states is not there');
    }
  }
});

test('④ no tolerance of ours flattens both handovers at once', async () => {
  const rows = [];
  for (const tol of [null, ...TOL_SWEEP]) rows.push([tol, await seams(tol)]);
  const shipped = rows[0][1];
  for (const name of Object.keys(REGION)) {
    /* The arithmetic floor. The middle record has ONE resolution and it stands between the other
       two, so the best any tolerance can do is meet them halfway: the smaller step it can leave is
       sqrt(cshapes density / era density), which is the product of the two shipped steps. Nothing
       here is typed — both ends come from the records themselves. */
    const floor = Math.sqrt(Math.abs(shipped[name].a * shipped[name].b));
    let best = Infinity;
    for (const [, s] of rows) {
      best = Math.min(best, Math.max(Math.abs(Math.log(s[name].a)), Math.abs(Math.log(s[name].b))));
    }
    assert.ok(best >= Math.log(floor) * 0.9,
      name + ': a step of ' + Math.exp(best).toFixed(2) + '× was reached, below the ' + floor.toFixed(2)
      + '× the two outer records leave — then one of them changed and docs/MAP-LAYERS.md §7.13 must be re-measured');
    assert.ok(floor > 1.15,
      name + ': the outer records are now within ' + floor.toFixed(2)
      + '× of each other — the step documented in docs/MAP-LAYERS.md §7.13 no longer needs its explanation');
  }
  /* the measurement the documents quote, re-derived — one command to refresh the table */
  for (const [tol, s] of rows) {
    for (const name of Object.keys(REGION)) {
      console.log('  ' + name + ' tol=' + (tol === null ? 'as shipped' : tol)
        + '  1688→1689 ' + s[name].a.toFixed(2) + '×  1885→1886 ' + s[name].b.toFixed(2) + '×');
    }
  }
});
