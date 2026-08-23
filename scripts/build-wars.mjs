#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE TWO WORLD WARS, DAY BY DAY — the build   (#R349)
 * ----------------------------------------------------------------------------
 *  「WW1, WW2の月日ごとの勢力変遷も見れるように。」 This turns the written record in scripts/wars/
 *  into data/wars.json, and — this is the part that matters — it REFUSES to write a file it cannot
 *  prove. Every check below exists because the corresponding mistake is invisible on a map: a front
 *  line that misses the country it is supposed to divide still draws; a gwcode that does not exist on
 *  the date it is used simply paints nothing; a city under the wrong army looks exactly like a city
 *  under the right one.
 *
 *  ══ WHAT IT PROVES ══════════════════════════════════════════════════════════════════════════
 *   ①  Every place a line is quoted through exists in scripts/wars/places.mjs …
 *   ②  … and every one of those that the bundled gazetteer also knows is within 30 km of the
 *       gazetteer's own coordinate for that country. (The gazetteer is a settlement list with a
 *       population floor, so it cannot cover them all — the run prints how many it proved.)
 *   ③  Every gwcode named by `control` or `cuts` is a real CShapes entity ON THE DATE it is used.
 *   ④  Every dated front line CUTS the entities it claims to cut, exactly twice per ring — see the
 *       header of js/war-geom.js for why anything else is a fault in the record rather than a case
 *       to approximate.
 *   ⑤  A named set of cities falls under the side the record says held them, on the day it says so —
 *       computed through the SAME cut the browser will draw. This is the check that would catch a
 *       front whose two sides are the right shape and the wrong way round.
 *   ⑥  Dates are ordered, inside their war, and every faction key is one the war declares.
 *
 *      node scripts/build-wars.mjs           # write data/wars.json
 *      node scripts/build-wars.mjs --check   # verify the committed file is what this produces
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WarGeom } from '../js/war-geom.js';
import { PLACES } from './wars/places.mjs';
import { WARS } from './wars/source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'wars.json');
const args = new Set(process.argv.slice(2));
const problems = [];
const bad = (m) => problems.push(m);

/* ── CShapes, read the same way js/time-borders.js reads it ─────────────────────────────────── */
const csText = readFileSync(join(ROOT, 'data', 'cshapes.js'), 'utf8');
const CS = JSON.parse(csText.slice(csText.indexOf('=') + 1).replace(/;\s*$/, ''));
const dnum = (d) => { const p = String(d).split('-'); return +p[0] * 10000 + +p[1] * 100 + +p[2]; };
function featAt(gw, date) {
  const t = dnum(date);
  return CS.feats.find((f) => f[1] === gw
    && f[2] * 10000 + f[3] * 100 + f[4] <= t
    && f[5] * 10000 + f[6] * 100 + f[7] >= t) || null;
}
const polysOf = (f) => f[8].map((poly) => poly.map((ri) => CS.rings[ri]));

/* ── ② the gazetteer cross-check ────────────────────────────────────────────────────────────── */
const GZ = JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'gazetteer-world.json.gz'))).toString());
const gzIdx = new Map();
for (const r of GZ.rows) gzIdx.set(String(r[0]).toLowerCase() + '|' + r[2], [r[3], r[4]]);
const kmBetween = (a, b) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};
let proved = 0, unprovable = 0;
for (const [name, v] of Object.entries(PLACES)) {
  if (!Array.isArray(v) || v.length < 3 || v.length > 4) { bad(`place ${name}: expected [lon, lat, ISO2] (+ optional '!')`); continue; }
  if (Math.abs(v[0]) > 180 || Math.abs(v[1]) > 90) bad(`place ${name}: coordinate out of range`);
  const g = v[3] === '!' ? null : gzIdx.get(name.toLowerCase() + '|' + v[2]);
  if (!g) { unprovable++; continue; }
  const d = kmBetween(v, g);
  if (d > 30) bad(`place ${name} (${v[2]}) is ${d.toFixed(0)} km from the gazetteer's own ${name}`);
  else proved++;
}

/* ── ⑤ the cities that decide whether a front is the right way round ────────────────────────── */
/* Each row: [war, date, place, the faction the record says held it]. Read straight out of the
   narrative of the campaigns above — these are not close calls, and that is the point: a check
   that only fails when the map is obviously wrong is exactly the check a silent bug survives. */
const CHECKS = [
  ['ww1', '1914-11-20', 'Brussels', 'CENTRAL'], ['ww1', '1914-11-20', 'Paris', 'ALLIED'],
  ['ww1', '1914-11-20', 'Dunkirk', 'ALLIED'], ['ww1', '1914-11-20', 'Ghent', 'CENTRAL'],
  ['ww1', '1916-07-01', 'Amiens', 'ALLIED'], ['ww1', '1916-07-01', 'Lille', 'CENTRAL'],
  ['ww1', '1915-09-19', 'Warsaw', 'CENTRAL'], ['ww1', '1915-09-19', 'Minsk', 'ALLIED'],
  ['ww1', '1918-03-03', 'Odesa', 'CENTRAL'], ['ww1', '1918-03-03', 'Moscow', 'NEUTRAL'],
  ['ww1', '1917-12-11', 'Beersheba', 'ALLIED'], ['ww1', '1917-12-11', 'Damascus', 'CENTRAL'],
  ['ww2', '1939-09-28', 'Warsaw', 'AXIS'], ['ww2', '1939-09-28', 'Lviv', 'NEUTRAL'],
  ['ww2', '1940-06-25', 'Paris', 'AXIS'], ['ww2', '1940-06-25', 'Vichy', 'NEUTRAL'],
  ['ww2', '1941-12-05', 'Minsk', 'AXIS'], ['ww2', '1941-12-05', 'Moscow', 'ALLIED'],
  ['ww2', '1941-12-05', 'Kyiv', 'AXIS'], ['ww2', '1941-12-05', 'Stalingrad', 'ALLIED'],
  ['ww2', '1942-11-19', 'Rostov-on-Don', 'AXIS'], ['ww2', '1942-11-19', 'Stalingrad', 'ALLIED'],
  ['ww2', '1943-11-06', 'Kyiv', 'ALLIED'], ['ww2', '1943-11-06', 'Minsk', 'AXIS'],
  ['ww2', '1944-08-29', 'Minsk', 'ALLIED'], ['ww2', '1944-08-29', 'Warsaw', 'AXIS'],
  ['ww2', '1945-04-16', 'Berlin', 'AXIS'], ['ww2', '1945-04-16', 'Poznan', 'ALLIED'],
  ['ww2', '1944-06-30', 'Bayeux', 'ALLIED'], ['ww2', '1944-06-30', 'Paris', 'AXIS'],
  ['ww2', '1944-09-15', 'Paris', 'ALLIED'], ['ww2', '1944-09-15', 'Metz', 'AXIS'],
  ['ww2', '1944-01-17', 'Naples', 'ALLIED'], ['ww2', '1944-01-17', 'Rome', 'AXIS'],
  ['ww2', '1942-07-01', 'Alexandria', 'ALLIED'], ['ww2', '1942-07-01', 'Mersa Matruh', 'AXIS'],
  ['ww2', '1939-09-01', 'Chongqing', 'ALLIED'], ['ww2', '1939-09-01', 'Beijing', 'AXIS'],
  /* ⚠ THE THREE A SELF-AUDIT CAUGHT AFTER THE FIRST GREEN BUILD, each of which every check above
     was happy with. The two July-1943 salients INTERLOCK — German at Orel bulging east, Soviet at
     Kursk bulging west — so a line that runs straight between them puts Orel under the Red Army a
     month before it was taken. And a front with no `until` keeps cutting after the army it belongs
     to has surrendered: Italy was whole and Allied from 2 May 1945 and Germany from 8 May, and
     both were still being divided by their last quoted line in September. */
  ['ww2', '1943-07-04', 'Kursk', 'ALLIED'], ['ww2', '1943-07-04', 'Orel', 'AXIS'],
  ['ww2', '1943-07-04', 'Poltava', 'AXIS'], ['ww2', '1943-07-04', 'Kharkiv', 'AXIS'],
  ['ww1', '1916-07-01', 'Verdun', 'ALLIED'],
  ['ww2', '1943-09-20', 'Rome', 'CONTESTED'], ['ww2', '1945-06-01', 'Rome', 'ALLIED'],
  ['ww2', '1945-08-01', 'Berlin', 'ALLIED'], ['ww2', '1945-08-01', 'Munich', 'ALLIED'],
];
/* Two of the check cities are not front anchors, so they live here rather than in places.mjs. */
const CHECK_ONLY = { Lille: [3.058, 50.629, 'FR'] };
const placeOf = (n) => PLACES[n] || CHECK_ONLY[n] || null;

/* ── resolve the record ─────────────────────────────────────────────────────────────────────── */
const out = { v: 1, built: 'scripts/build-wars.mjs', wars: [] };
out.src = 'Territory and dates: the documented record, compiled in scripts/wars/. '
  + 'Country outlines: CShapes 2.0 (Schvitz et al. 2022, icr.ethz.ch/data/cshapes).';

for (const W of WARS) {
  if (!W.factions.NEUTRAL) bad(`${W.id}: every war needs a NEUTRAL faction — it is what an unlisted country is`);
  const facts = new Set(Object.keys(W.factions));
  const war = {
    id: W.id, name: W.name, from: W.from, to: W.to,
    factions: W.factions, control: {}, fronts: [], events: [],
  };

  /* ③ + ⑥ — control */
  for (const [gwStr, tl] of Object.entries(W.control)) {
    const gw = +gwStr;
    let prev = '';
    for (const [d, f] of tl) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) bad(`${W.id} gw${gw}: «${d}» is not a date`);
      if (d <= prev) bad(`${W.id} gw${gw}: ${d} does not come after ${prev}`);
      prev = d;
      if (d < W.from || d > W.to) bad(`${W.id} gw${gw}: ${d} is outside ${W.from}…${W.to}`);
      if (!facts.has(f)) bad(`${W.id} gw${gw}: «${f}» is not one of this war's factions`);
      if (!featAt(gw, d)) bad(`${W.id} gw${gw}: CShapes has no such entity on ${d}`);
    }
    war.control[gw] = tl.map(([d, f]) => [d, f]);
  }

  /* ① + ③ + ④ — fronts */
  for (const F of W.fronts) {
    const front = { id: F.id, name: F.name, left: F.left, right: F.right, dates: [] };
    if (F.until) front.until = F.until;
    let prev = '';
    for (const D of F.dates) {
      if (D.d <= prev) bad(`${W.id}/${F.id}: ${D.d} does not come after ${prev}`);
      prev = D.d;
      if (D.d < W.from || D.d > W.to) bad(`${W.id}/${F.id}: ${D.d} is outside ${W.from}…${W.to}`);
      const pts = [];
      for (const n of D.pts) {
        const p = placeOf(n);
        if (!p) { bad(`${W.id}/${F.id} ${D.d}: no place called «${n}»`); continue; }
        pts.push([p[0], p[1]]);
      }
      const left = D.left || F.left, right = D.right || F.right;
      if (!facts.has(left) || !facts.has(right)) bad(`${W.id}/${F.id} ${D.d}: unknown side faction`);
      for (const gw of (D.cuts || [])) {
        const f = featAt(gw, D.d);
        if (!f) { bad(`${W.id}/${F.id} ${D.d}: CShapes has no gw${gw} on that date`); continue; }
        if (pts.length < 2) { bad(`${W.id}/${F.id} ${D.d}: a line needs at least two places to cut gw${gw}`); continue; }
        const r = WarGeom.cutPolygon(polysOf(f), pts);
        if (r.problem) bad(`${W.id}/${F.id} ${D.d}: the line cannot cut ${f[0]} (gw${gw}) — ${r.problem}`);
        else if (!r.cutRings) bad(`${W.id}/${F.id} ${D.d}: the line never touches ${f[0]} (gw${gw}) — it claims to divide a country it misses entirely`);
      }
      const e = { d: D.d, cuts: D.cuts || [], pts };
      if (D.left) e.left = D.left;
      if (D.right) e.right = D.right;
      if (D.note) e.note = D.note;
      front.dates.push(e);
    }
    war.fronts.push(front);
  }

  /* events */
  let prevE = '';
  for (const E of W.events) {
    const p = placeOf(E.at);
    if (!p) { bad(`${W.id} event «${E.wiki}»: no place called «${E.at}»`); continue; }
    if (E.d < prevE) bad(`${W.id} events are not in date order at ${E.d}`);
    prevE = E.d;
    if (E.d2 && E.d2 < E.d) bad(`${W.id} event «${E.wiki}»: it ends before it starts`);
    const ev = { d: E.d, at: [p[0], p[1]], name: E.name, wiki: E.wiki };
    if (E.d2) ev.d2 = E.d2;
    if (E.kind) ev.kind = E.kind;
    war.events.push(ev);
  }
  out.wars.push(war);
}

/* ── ⑤ — run the cities through the very resolution the browser will run ────────────────────── */
/* This is a small copy of what js/war-fronts.js does per frame, and it is deliberately written here
   from the SHIPPED file's data rather than from the source objects: it answers «what will a reader
   see», not «what did the author mean». */
function factionAtPoint(war, dateStr, pt) {
  /* which entity is this point in, on this date? */
  let hit = null;
  for (const f of CS.feats) {
    const t = dnum(dateStr);
    if (f[2] * 10000 + f[3] * 100 + f[4] > t || f[5] * 10000 + f[6] * 100 + f[7] < t) continue;
    if (WarGeom.pointInPolys(pt, polysOf(f))) { hit = f; break; }
  }
  if (!hit) return null;
  const tl = war.control[hit[1]];
  let base = 'NEUTRAL';
  if (tl) for (const [d, k] of tl) { if (d <= dateStr) base = k; }
  return WarGeom.factionAt(pt, polysOf(hit), base, cutsFor(war, hit[1], dateStr));
}
/* EVERY front that is cutting this entity today, in declaration order — the same list the layer
   builds, because a country cut by two fronts is decided by both of them and by their order. */
function cutsFor(war, gw, dateStr) {
  const out = [];
  for (const F of war.fronts) {
    if (F.until && dateStr >= F.until) continue;
    let cur = null;
    for (const D of F.dates) { if (D.d <= dateStr) cur = D; }
    if (!cur || !cur.cuts.includes(gw)) continue;
    out.push({ pts: cur.pts, left: cur.left || F.left, right: cur.right || F.right });
  }
  return out;
}
let checked = 0;
for (const [warId, date, place, want] of CHECKS) {
  const war = out.wars.find((w) => w.id === warId);
  const p = placeOf(place);
  if (!war || !p) { bad(`check ${warId} ${date} ${place}: cannot be run`); continue; }
  const got = factionAtPoint(war, date, [p[0], p[1]]);
  if (got !== want) bad(`check FAILED — on ${date} the map puts ${place} under ${got}, the record says ${want}`);
  else checked++;
}

/* ── the verdict ────────────────────────────────────────────────────────────────────────────── */
if (problems.length) {
  console.error('build-wars: ' + problems.length + ' problem(s); nothing was written.\n  ' + problems.join('\n  '));
  process.exit(1);
}
const json = JSON.stringify(out);
const stat = out.wars.map((w) => `${w.id}: ${Object.keys(w.control).length} territories · `
  + `${w.fronts.length} fronts / ${w.fronts.reduce((a, f) => a + f.dates.length, 0)} dated lines · `
  + `${w.events.length} events`).join('\n  ');
if (args.has('--check')) {
  const have = readFileSync(OUT, 'utf8');
  if (have !== json) { console.error('build-wars --check: data/wars.json is not what this script produces — run it without --check'); process.exit(1); }
  console.log('build-wars --check: ok\n  ' + stat + `\n  places: ${proved} cross-checked against the gazetteer, ${unprovable} it does not carry · ${checked} control checks passed`);
} else {
  writeFileSync(OUT, json);
  console.log('build-wars: wrote data/wars.json (' + (json.length / 1024).toFixed(1) + ' kB)\n  ' + stat
    + `\n  places: ${proved} cross-checked against the gazetteer, ${unprovable} it does not carry · ${checked} control checks passed`);
}
