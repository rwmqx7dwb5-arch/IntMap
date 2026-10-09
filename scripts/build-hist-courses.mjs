#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/hist-courses.js — a coarse historical boundary redrawn along the river or wall
 *  that history says it followed   (hist-border-refine)
 * ----------------------------------------------------------------------------
 *  「歴史地図にある粗い直線的な国境・境界を、歴史的事実をもとに IntMap 独自に高精度化してほしい。
 *    根拠の取れない区間は精密化せず、根拠の無いものを精密に見せない。」
 *
 *  ══ WHERE THE COARSE LINES ARE, MEASURED (2026-10-05) ══════════════════════════════════════════
 *  The drawn border runs (data/border-coast.js marks) of each record, by the share of their length in
 *  edges longer than 25 km that are not a meridian or a parallel:
 *      CShapes 14–19 %   OpenHistoricalMap (1689–1885) 21–27 %   Cliopatria 55–77 %   the sheets 63–86 %
 *  so before 1689 three quarters of every line on the map is a chord. The long chords of CShapes and OHM
 *  are mostly lines that ARE straight (49° N, 129° E, the Saharan treaty lines); Cliopatria's are not: its
 *  border vertices lie a median 5 km and a 75th percentile 7–18 km from the precise record's line where
 *  both describe the same date (`--measure`), and only 0.6 % of them within 50 m of any CShapes line
 *  (0.3 % for the same vertices shifted at random) — they were drawn by hand, not traced from a modern line.
 *
 *  ══ WHAT THIS DOES — AND THE ONE THING IT IS ALLOWED TO DO ═════════════════════════════════════
 *  Nothing here interpolates, smooths or snaps a coarse record to a line that merely looks right. A
 *  stretch is redrawn only where scripts/histcourse/courses.json — a REVIEWED file of historical facts,
 *  each with at least two sources that were opened — states that the boundary between named polities
 *  followed a named river or wall on a named stretch for a stated period. Then, and only then, the part
 *  of a coarse ring that lies within the record's own positional error of that feature, on a row of one
 *  of those polities whose whole span lies inside the period, is drawn along the feature instead:
 *      · the feature is read from OpenStreetMap at its own vertices (no simplification, no rounding);
 *      · a ring shared by any row that does not qualify is left as it is;
 *      · a vertex that lies on a more precise record's line (the edge Cliopatria was cut along) is never
 *        moved — a record above already draws that line;
 *      · the exceptions the facts name (a bridgehead held on the far bank) keep the coarse line;
 *      · both sides of the same boundary, where both qualify, are drawn along the SAME vertices, so the two
 *        coincide exactly and no seam or step appears between them.
 *  The fills, the click targets, the dates and the names are untouched: this file changes which line is
 *  stroked and nothing else, and the page draws exactly what it drew before when the file is absent.
 *  Refuted, undetermined and unplaceable claims are kept in the facts file (`notDrawn`) with the reason, so a later
 *  reader does not re-propose them and so the map's silence about them is a decision, not an omission.
 *
 *      node scripts/build-hist-courses.mjs --fetch     # OpenStreetMap geometry of every reviewed feature (network)
 *      node scripts/build-hist-courses.mjs --rebasis   # offline: re-derive the substitutions from the shipped course lines (a rebuilt bundle or border-coast.js)
 *      node scripts/build-hist-courses.mjs             # write data/hist-courses.js from the cache
 *      node scripts/build-hist-courses.mjs --check     # re-derive from the shipped files and verify (offline)
 *      node scripts/build-hist-courses.mjs --report    # the coarse share by year, before and after
 *      node scripts/build-hist-courses.mjs --measure   # the record's positional error (needs the Cliopatria cache)
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { OPENSTREETMAP } from './lib/upstream-cadence.mjs';
import { requireModule } from './lib/import-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = join(ROOT, 'data', 'hist-courses.js');
export const FACTS = process.env.INTMAP_HISTCOURSE_FACTS || join(ROOT, 'scripts', 'histcourse', 'courses.json');
const CACHE = process.env.INTMAP_HISTCOURSE_CACHE || join(tmpdir(), 'intmap-histcourse-cache');
const OSM_API = process.env.INTMAP_OVERPASS || 'https://overpass-api.de/api/interpreter';

/* ⚠ 出自は値である（scripts/data-governance.mjs が読む）。形は OpenStreetMap の地物、主張は IntMap の考証。 */
export const GOVERNANCE = {
  'data/hist-courses.js': {
    publisher: 'OpenStreetMap contributors',
    url: 'https://www.openstreetmap.org/copyright',
    licence: 'ODbL',
    licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: true,
    schema: 'scripts/build-hist-courses.mjs --check (npm run check:bordercoast)',
    paidBy: 'Historical boundary courses — OpenStreetMap contributors (ODbL 1.0), reviewed by IntMap',
    ...OPENSTREETMAP,
    builtBy: 'scripts/build-hist-courses.mjs',
  },
};
export const SRC = 'River and wall courses © OpenStreetMap contributors (ODbL 1.0, openstreetmap.org/copyright), at their own vertices; which stretch of which historical boundary followed them, and when, is IntMap\'s review of the sources each course cites (scripts/histcourse/courses.json)';

/* ⚠⚠ THE RECORDS THIS REDRAWS, AND THEIR POSITIONAL ERROR — MEASURED, NOT CHOSEN.
   `tolKm` is how far a coarse record's border may lie from the feature and still be the record's drawing of
   that boundary. It is the 75th percentile of the distance from the record's border vertices (more than
   30 km inland) to the line a precise record draws for the same date (`--measure`):
       observed 2026-10-05, Cliopatria v0.2.1 against data/hist-borders.js (OHM) and data/cshapes.js:
           1750 18.1 km · 1800 18.5 · 1850 13.5 · 1900 10.0 · 1950 7.0   (median 4.1–6.0 km)
       the value is the median of those five percentiles, 13.5 km.
   It does NOT decide whether a boundary followed a river — the facts file does; it decides which part of
   the coarse ring is the drawing of that stretch. A larger value would let a ring that leaves the river
   for a real reason (a bridgehead, an inland march) be pulled onto it; a smaller one leaves most of the
   record's drawing of a documented river boundary coarse.
   expires: when Cliopatria is re-digitised or the comparison records are rebuilt — re-run `--measure`;
   canon: here. The sheets (data/hist-eras-rest.js) are not redrawn: their rows carry no verified identity
   a fact can name (scripts/histnames byName is a translation table, not an identity test). */
export const RECORDS = [
  { key: 'histclio', file: 'data/hist-clio.js', global: '__HISTCLIO', tolKm: 13.5 },
];
/* The records that draw Cliopatria's edges without being redrawn on their own account: the sheets were cut along
   Cliopatria's lines (scripts/build-hist-clio.mjs), so where they abut it they carry its very vertices, and a redraw
   of that edge is carried to them (see `derive`). */
export const MIRRORS = [
  { key: 'histerasrest', file: 'data/hist-eras-rest.js', global: '__HISTERASREST' },
];
/* The records ABOVE Cliopatria — their lines are never moved, and a coarse vertex lying on one of them is
   an edge Cliopatria was cut along (scripts/build-hist-clio.mjs), not Cliopatria's own drawing. "On" is
   one cell of the grid Cliopatria's cut geometry is rounded to (build-hist-clio DEC = 3): 10^-3 degree. */
const ABOVE = [
  { file: 'data/cshapes.js', global: '__CSHAPES' },
  { file: 'data/hist-borders.js', global: '__HISTB' },
  { file: 'data/hist-borders-late.js', global: '__HISTBLATE' },
];
const ON_LINE_KM = 1e-3 * 111.32;
/* The edges between two coarse vertices are walked at this step so a chord that leaves the river between
   two vertices on it is caught — the same step scripts/build-border-coast.mjs SAMPLE_KM walks. */
const SAMPLE_KM = 1;

const KM = 111.32, RAD = Math.PI / 180;
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const evalBundle = (rel, g) => { const w = {}; new Function('window', readFileSync(join(ROOT, rel), 'utf8'))(w); return w[g]; };
const ymd = (y, m, d) => y * 10000 + m * 100 + d;

/* "YYYY" / "-YYYY" / "YYYY-MM" / "YYYY-MM-DD" → a sortable day. Years are as the facts write them:
   historical (1 BC = -1), so they are made astronomical (1 BC = 0) like Cliopatria's rows are. */
export function dayOf(s) {
  const m = /^(-?)(\d{1,5})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(String(s).trim());
  if (!m) throw new Error('not a date: ' + s);
  let y = +m[2]; if (m[1]) y = -y + 1;
  return ymd(y, m[3] ? +m[3] : 1, m[4] ? +m[4] : 1);
}

/* ── geometry on a small patch of the sphere ─────────────────────────────── */
function segDist(p, a, b) {
  const k = Math.cos(p[1] * RAD);
  const ax = (a[0] - p[0]) * k, ay = a[1] - p[1], bx = (b[0] - p[0]) * k, by = b[1] - p[1];
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
  let t = L ? -(ax * vx + ay * vy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { d: Math.hypot(ax + t * vx, ay + t * vy) * KM, t };
}
const kmBetween = (a, b) => { const k = Math.cos((a[1] + b[1]) * 0.5 * RAD); return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * KM; };
const CELL = 0.1;
function gridOf(segs) {
  const g = new Map();
  segs.forEach(([a, b], i) => {
    const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
    const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const k = x + ',' + y; const l = g.get(k); if (l) l.push(i); else g.set(k, [i]); }
  });
  return g;
}
/* every segment within `km` of p (cells around p wide enough for that radius) */
function* near(grid, p, km) {
  const ry = Math.ceil(km / KM / CELL) + 1, rx = Math.ceil(km / (KM * Math.max(0.05, Math.cos(p[1] * RAD))) / CELL) + 1;
  const gx = Math.floor(p[0] / CELL), gy = Math.floor(p[1] / CELL), seen = new Set();
  for (let dx = -rx; dx <= rx; dx++) for (let dy = -ry; dy <= ry; dy++) {
    const l = grid.get((gx + dx) + ',' + (gy + dy)); if (!l) continue;
    for (const i of l) if (!seen.has(i)) { seen.add(i); yield i; }
  }
}

/* ── the feature, from OpenStreetMap ─────────────────────────────────────── */
const osmFile = (f) => join(CACHE, 'osm', f.osm.type + '-' + f.osm.ids.join('_') + '.json');
async function overpass(q) {
  for (let i = 1; ; i++) {
    const r = await fetch(OSM_API, { method: 'POST', body: new URLSearchParams({ data: q }),
      headers: { 'user-agent': 'IntMap-build-hist-courses/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap)' } });
    if (r.ok) return r.json();
    /* a refusal the server states (429 / 504) is retried after a wait that grows; anything else is a failure */
    if ((r.status !== 429 && r.status !== 504) || i >= 8) throw new Error('Overpass answered ' + r.status);
    console.error('  Overpass ' + r.status + ' — waiting ' + (8 * i) + ' s (try ' + i + ')');
    await new Promise((res) => setTimeout(res, 8000 * i));
  }
}
async function fetchAll(facts) {
  mkdirSync(join(CACHE, 'osm'), { recursive: true });
  for (const c of facts.reviewed) {
    const f = c.feature, file = osmFile(f);
    if (existsSync(file)) continue;
    const ids = f.osm.ids.join(',');
    const q = f.osm.type === 'relation'
      ? `[out:json][timeout:300];rel(id:${ids});out meta;way(r);out geom qt;`
      : `[out:json][timeout:300];way(id:${ids});out meta geom qt;`;
    const j = await overpass(q);
    /* ⚠ A RELATION'S MEMBER LIST CAN LAG ITS RIVER. Measured 2026-10-05: the Dniester relation's main stream
       stops 1.6 km short on both sides of the Novodnistrovsk dam, and the way that carries the river through it
       (31251924's neighbour 1381210602, tagged as the same river) was never added to the relation. So the river's
       own ways — waterway=river with the relation's name — are asked for in the stretch's box as well, and
       `featureWays` uses them as the same river. */
    const rel = (j.elements || []).find((e) => e.type === 'relation');
    /* by the English name when the relation states one: the local `name` is spelt differently on the relation
       and on its ways often enough (the Dniester: «Дністер / Nistru» against «Дністер Nistru») */
    const nmKey = rel && rel.tags && (rel.tags['name:en'] ? 'name:en' : 'name');
    if (rel && rel.tags && rel.tags.waterway === 'river' && rel.tags[nmKey]) {
      const lo = [Math.min(c.from[0], c.to[0]) - 0.3, Math.min(c.from[1], c.to[1]) - 0.3], hi = [Math.max(c.from[0], c.to[0]) + 0.3, Math.max(c.from[1], c.to[1]) + 0.3];
      const nm = JSON.stringify(rel.tags[nmKey]);
      const k = await overpass(`[out:json][timeout:300];way["waterway"="river"]["${nmKey}"=${nm}](${lo[1]},${lo[0]},${hi[1]},${hi[0]});out meta geom qt;`);
      const have = new Set(j.elements.map((e) => e.type + e.id));
      for (const e of k.elements || []) if (!have.has(e.type + e.id)) { e._byName = true; j.elements.push(e); }
    }
    j._fetchedAt = new Date().toISOString();   /* when this copy was taken (the bundle's retrievedAt) */
    writeFileSync(file, JSON.stringify(j));
    console.error(`  ${c.id}: ${f.osm.type} ${ids} → ${(j.elements || []).length} elements`);
  }
}

/* the ways that carry the feature's line: a river relation's main stream (OpenStreetMap's own `main_stream`
   role — the side channels of a braided reach are other ways), every way of a wall. A side stream is offered
   too, at SIDE_COST times its length, because the main stream is sometimes broken where a dam or a
   bifurcation interrupts it (measured: the Dniester's main stream has one 1.6 km gap at the Novodnistrovsk
   dam); the walk then crosses on the river's own side channel instead of on a line no one mapped. */
const SIDE_COST = 10;
function featureWays(f, j) {
  const els = j.elements || [];
  const ways = new Map(els.filter((e) => e.type === 'way' && Array.isArray(e.geometry)).map((e) => [e.id, e]));
  const rels = els.filter((e) => e.type === 'relation');
  let pick = [...ways.keys()], side = [];
  if (rels.length) {
    const roles = f.roles || ['main_stream', ''];
    const members = rels.flatMap((r) => r.members.filter((m) => m.type === 'way' && roles.includes(m.role)).map((m) => m.ref));
    if (members.length) pick = members.filter((id) => ways.has(id));
    if (!f.roles) side = rels.flatMap((r) => r.members.filter((m) => m.type === 'way' && m.role === 'side_stream').map((m) => m.ref)).filter((id) => ways.has(id));
    /* the river's own ways the relation does not list (see fetchAll) */
    const named = new Set(rels.flatMap((r) => r.tags ? [r.tags['name:en'], r.tags.name] : []).filter(Boolean));
    for (const [id, w] of ways) if (w._byName && w.tags && (named.has(w.tags['name:en']) || named.has(w.tags.name)) && !pick.includes(id)) pick.push(id);
  }
  const version = rels.length ? rels.map((r) => ({ id: r.id, version: r.version, timestamp: r.timestamp }))
    : [...ways.values()].map((w) => ({ id: w.id, version: w.version, timestamp: w.timestamp }));
  const geom = (id) => ways.get(id).geometry.map((p) => [p.lon, p.lat]);
  return { ways: pick.map(geom), side: side.map(geom), version };
}

/* the feature's own path from `from` to `to`: the shortest walk along its ways (vertices shared by two ways
   join them). Every vertex returned is an OpenStreetMap node — nothing is interpolated. */
/* `bridgeKm` (a wall's facts only): a constructed line that ran continuously, mapped in sections, has the
   ends of its sections joined straight across gaps no longer than this — the gap is where OpenStreetMap stops
   (a river crossing, a road), not where the wall did. Each join is returned (`bridges`) and shipped with the
   course, so what was joined is stated rather than hidden. */
export function pathAlong(ways, from, to, side = [], bridgeKm = 0) {
  const key = (p) => p[0].toFixed(7) + ',' + p[1].toFixed(7);
  const nodes = new Map(), adj = new Map();
  const id = (p) => { const k = key(p); if (!nodes.has(k)) { nodes.set(k, p); adj.set(k, []); } return k; };
  const link = (w, cost) => { for (let i = 0; i + 1 < w.length; i++) {
    const a = id(w[i]), b = id(w[i + 1]); if (a === b) continue;
    const L = kmBetween(w[i], w[i + 1]) * cost; adj.get(a).push([b, L]); adj.get(b).push([a, L]);
  } };
  for (const w of ways) link(w, 1);
  const mainNodes = new Set(nodes.keys()), bridges = [];
  if (bridgeKm > 0) {
    /* join a dangling section end to the nearest node of ANOTHER connected piece (a node of its own piece, e.g. the
       parallel wall-route mapped beside the wall, is not a gap), nearest joins first, pieces merged as they join */
    const comp = new Map(); let nc = 0;
    for (const k of adj.keys()) { if (comp.has(k)) continue; const st = [k]; comp.set(k, nc); while (st.length) { const u = st.pop(); for (const [v] of adj.get(u)) if (!comp.has(v)) { comp.set(v, nc); st.push(v); } } nc++; }
    const parent = Array.from({ length: nc }, (_, i) => i), find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    const cand = [];
    for (const [k, e] of adj) { if (e.length !== 1) continue; const p = nodes.get(k);
      let best = null, bd = Infinity; for (const [q, pq] of nodes) { if (comp.get(q) === comp.get(k)) continue; const d = kmBetween(p, pq); if (d < bd) { bd = d; best = q; } }
      if (best && bd <= bridgeKm) cand.push([bd, k, best]); }
    cand.sort((x, y) => x[0] - y[0]);
    for (const [bd, k, q] of cand) { const A = find(comp.get(k)), B = find(comp.get(q)); if (A === B) continue; parent[A] = B;
      adj.get(k).push([q, bd]); adj.get(q).push([k, bd]); bridges.push([nodes.get(k), nodes.get(q), +bd.toFixed(3)]); }
  }
  const closest = (p) => { let best = null, bd = Infinity; for (const k of mainNodes) { const q = nodes.get(k); const d = kmBetween(p, q); if (d < bd) { bd = d; best = k; } } return { k: best, d: bd }; };
  const s = closest(from), t = closest(to);
  /* Dijkstra with a binary heap */
  const dist = new Map([[s.k, 0]]), prev = new Map(), heap = [[0, s.k]];
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop(); if (u === t.k) break; if (d > (dist.get(u) ?? Infinity)) continue;
    for (const [v, L] of adj.get(u)) { const nd = d + L; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); push([nd, v]); } }
  }
  if (!dist.has(t.k)) return null;
  const out = []; for (let u = t.k; u != null; u = prev.get(u)) out.push(nodes.get(u));
  out.reverse();
  /* only the joins the walk actually used */
  const onPath = new Set(out.map(key));
  return { line: out, snapKm: [s.d, t.d], km: dist.get(t.k), bridges: bridges.filter(([a, b]) => onPath.has(key(a)) && onPath.has(key(b))) };
}

/* ── a course as something to measure against ─────────────────────────────── */
function courseIndex(line) {
  const cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + kmBetween(line[i - 1], line[i]));
  const segs = []; for (let i = 0; i + 1 < line.length; i++) segs.push([line[i], line[i + 1]]);
  const grid = gridOf(segs);
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of line) { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }
  /* distance from p to the course and how far along it p projects (km from the start) */
  const locate = (p, km) => {
    let best = { d: Infinity, at: 0 };
    for (const i of near(grid, p, km)) { const r = segDist(p, segs[i][0], segs[i][1]); if (r.d < best.d) best = { d: r.d, at: cum[i] + r.t * (cum[i + 1] - cum[i]) }; }
    return best;
  };
  return { line, cum, locate, bbox: [w, s, e, n] };
}
const boxNear = (bb, p, km) => { const dy = km / KM, dx = km / (KM * Math.max(0.05, Math.cos(p[1] * RAD))); return p[0] >= bb[0] - dx && p[0] <= bb[2] + dx && p[1] >= bb[1] - dy && p[1] <= bb[3] + dy; };

/* the lines of the records above, near any course — `onAbove(p)` is true for a vertex on one of them */
function aboveIndex(courses, tol) {
  const segs = [];
  const all = courses.reduce((b, c) => [Math.min(b[0], c.ix.bbox[0]), Math.min(b[1], c.ix.bbox[1]), Math.max(b[2], c.ix.bbox[2]), Math.max(b[3], c.ix.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  for (const r of ABOVE) {
    if (!existsSync(join(ROOT, r.file))) continue;
    const d = evalBundle(r.file, r.global);
    for (const ring of d.rings) {
      if (!ring.some((p) => boxNear(all, p, tol) && courses.some((c) => boxNear(c.ix.bbox, p, tol)))) continue;
      for (let i = 0; i + 1 < ring.length; i++) segs.push([ring[i], ring[i + 1]]);
      segs.push([ring[ring.length - 1], ring[0]]);
    }
  }
  const grid = gridOf(segs);
  return (p) => { for (const i of near(grid, p, ON_LINE_KM)) if (segDist(p, segs[i][0], segs[i][1]).d <= ON_LINE_KM) return true; return false; };
}

const closedRing = (r) => { const n = r.length; return (n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) ? r : r.concat([r[0]]); };

/* ── the substitutions ─────────────────────────────────────────────────────
   For one ring and one course: the maximal vertex ranges [a, b] inside a drawn run whose every vertex and
   every point of the edges between (walked at SAMPLE_KM) lies within `tol` of the course, that are not on a
   line of a record above and not at a named exception, whose projection onto the course moves one way
   (a backtrack of more than `tol` ends the range), and that cover at least `tol` of the course — a stretch
   shorter than the record's own error is not a stretch the record can be said to have drawn.
   Each becomes [a, b, course, i0, i1]: draw V[..a-1], then the course's own vertices i0 → i1, then V[b+1..]. */
export function substitutionsOf(V, runs, ci, ix, tol, onAbove, exceptions, opt = {}) {
  const allowed = opt.allowed || null, minKm = opt.minKm == null ? tol : opt.minKm;
  const out = [];
  const pt = (i) => V[i];
  /* an exception is a stretch of the course, not a point: where the boundary left the feature (a bridgehead
     held on the far bank) the course within `km` of it is not the boundary, so no redraw may cover it */
  const gaps = exceptions.map((x) => { const r = ix.locate([x.lon, x.lat], tol); return r.d <= tol ? [r.at - x.km, r.at + x.km] : null; }).filter(Boolean);
  const inGap = (lo, hi) => gaps.some((g) => lo <= g[1] && g[0] <= hi);
  /* a vertex is ON the course (r), AT an exception (the boundary left the feature there: the redraw may run up to
     the exception's edge but not over it), or OFF it (too far, or on a line a record above draws) */
  const gapEdge = (from, to) => { for (const g of gaps) if (to >= g[0] && to <= g[1]) return from <= g[0] ? g[0] : g[1]; return null; };
  const classify = (p) => { if (onAbove(p)) return null;
    const r = ix.locate(p, tol); if (r.d > tol) return null; if (inGap(r.at, r.at)) return { gap: true, at: r.at };
    return allowed && !allowed(p) ? null : r; };
  const okEdge = (a, b) => { const L = kmBetween(a, b), n = Math.max(1, Math.ceil(L / SAMPLE_KM));
    for (let k = 1; k < n; k++) { const t = k / n; if (ix.locate([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], tol).d > tol) return false; } return true; };
  for (const [ra, rb] of runs) {
    let start = -1, at = [], dir = 0, ext0 = false, ext1 = false;
    /* a vertex is drawn at the course vertex nearest its own station — so two rings that redraw the same vertex
       draw it at the same point, whichever run it belongs to; a run that stops at an exception ends on the last
       course vertex outside the exception */
    const cum = ix.cum;
    const snap = (st) => { let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= st) lo = m; else hi = m; } return st - cum[lo] <= cum[hi] - st ? lo : hi; };
    const outside = (e) => { for (const g of gaps) { if (e === g[0]) { let i = cum.length - 1; while (i > 0 && cum[i] > e) i--; return i; } if (e === g[1]) { let i = 0; while (i < cum.length - 1 && cum[i] < e) i++; return i; } } return snap(e); };
    const close = (end) => {
      if (start >= 0 && end - start >= 0) {
        const s0 = at[0], s1 = at[at.length - 1];
        if (Math.abs(s1 - s0) >= minKm && !inGap(Math.min(s0, s1) + 1e-9, Math.max(s0, s1) - 1e-9)) {
          const i0 = ext0 ? outside(s0) : snap(s0), i1 = ext1 ? outside(s1) : snap(s1);
          if (i0 === i1 ? s0 === s1 || minKm === 0 : (s1 > s0) === (i1 > i0)) out.push([start, end, ci, i0, i1]);
        }
      }
      ext0 = false; ext1 = false;
      start = -1; at = []; dir = 0;
    };
    let prev = null;
    for (let i = ra; i <= rb; i++) {
      const r = classify(pt(i));
      if (!r || r.gap) {
        /* the run stops at an exception: the redraw follows the course to the exception's edge, and the ring
           resumes at the exception vertex itself — only when the edge into it lies along the course */
        if (r && start >= 0 && okEdge(pt(i - 1), pt(i))) { const e = gapEdge(at[at.length - 1], r.at); if (e != null) { at.push(e); ext1 = true; } }
        close(i - 1); prev = r; continue;
      }
      if (start >= 0) {
        const step = r.at - at[at.length - 1];
        const turn = dir && Math.sign(step) !== dir && Math.abs(step) > tol;
        if (!okEdge(pt(i - 1), pt(i)) || turn) { close(i - 1); }
        else { if (!dir && Math.abs(step) > 0) dir = Math.sign(step); at.push(r.at); prev = r; continue; }
      }
      start = i; at = [r.at]; dir = 0;
      /* …and starts again at an exception's far edge when the ring comes back to the course out of one */
      if (prev && prev.gap && i > ra && okEdge(pt(i - 1), pt(i))) { const e = gapEdge(r.at, prev.at); if (e != null) { at = [e, r.at]; ext0 = true; } }
      prev = r;
    }
    close(rb);
  }
  return out;
}

function runsOf(mark, V) { if (mark === 0) return []; if (mark === 1 || !Array.isArray(mark)) return [[0, V.length - 1]]; return mark; }

/* rows of a ring-pooled bundle: in force [s, e) as sortable days, and the identity the row states */
function rowsOf(d) {
  return d.feats.map((f, i) => ({ i, q: f[1] || null, s: ymd(f[2], f[3], f[4]), e: ymd(f[5], f[6], f[7]), polys: f[8], name: (f[0] && f[0].en) || '' }));
}

/* the whole derivation — the same function `build` writes and `--check` re-runs on the shipped lines */
/* ⚠⚠ ONE BOUNDARY, ONE LINE. Two rings that draw the same edge (the same two vertices — Cliopatria's neighbours
   share their border, and the sheets were cut along Cliopatria's lines, so they carry its vertices) are one boundary
   drawn twice. Measured 2026-10-05 on the first build: the Roman Empire's ring at 300 shares the Iron Gates chord with
   Cliopatria's «Gothia»; redrawing only the Roman side put the Danube and the old chord on the map side by side.
   So every redraw is carried to each ring that draws the same edge at the same time (MIRRORED — the same course, the
   same vertices, so the two lines coincide exactly), and where that ring may not take it (it is drawn outside the
   period the fact names) the redraw is dropped on both sides. No identity is asked of the mirror: the edge it draws
   is the qualifying polity's boundary, and only that edge moves. */
const edgeKey = (p, q) => { const a = p[0] + ',' + p[1], b = q[0] + ',' + q[1]; return a < b ? a + '|' + b : b + '|' + a; };
const vkey = (p) => p[0] + ',' + p[1];
/* the years each sheet is shown below CShapes: js/time-borders.js `nearest` (the composition's rule) answers year y
   with the sheet before it unless the sheet after is strictly nearer — so sheet k is shown from the year after the
   midpoint with its predecessor to the midpoint with its successor (inclusive years) */
export function sheetSpans(years) {
  const ys = [...years].sort((x, y) => x - y);
  return ys.map((y, k) => [k === 0 ? -Infinity : Math.floor((ys[k - 1] + y) / 2) + 1, k === ys.length - 1 ? Infinity : Math.floor((y + ys[k + 1]) / 2)]);
}
function windowsOf(d) {
  /* ring → [[s, e)…] as sortable days, from the rows (or sheets) that use it */
  const w = new Map(), add = (ri, s, e) => { const l = w.get(ri); if (l) l.push([s, e]); else w.set(ri, [[s, e]]); };
  if (Array.isArray(d.snaps)) {
    const ys = d.snaps.map((x) => x.y).sort((x, y) => x - y), spans = sheetSpans(ys), byY = new Map(d.snaps.map((x) => [x.y, x]));
    ys.forEach((y, k) => {
      const [lo, hi] = spans[k], sn = byY.get(y);
      const s0 = lo === -Infinity ? -1e12 : ymd(lo, 1, 1), e0 = hi === Infinity ? 1e12 : ymd(hi + 1, 1, 1);
      for (const f of sn.feats) for (const p of f[2]) for (const ri of p) add(ri, s0, e0);
      for (const p of sn.blank || []) for (const ri of p) add(ri, s0, e0);
    });
  } else for (const r of rowsOf(d)) for (const p of r.polys) for (const ri of p) add(ri, r.s, r.e);
  return w;
}
const overlapsIn = (A, B) => A.some(([a, b]) => B.some(([c, e]) => a < e && c < b));

export function derive(courses, { bundles, marks, onAboveOf }) {
  const sets = {}, stats = courses.map((c) => ({ course: c.id, rings: 0, edges: 0, mirrored: 0, dropped: 0 }));
  const all = [...RECORDS, ...MIRRORS].map((rec) => {
    const d = bundles[rec.key], M = marks.sets[rec.key];
    if (!d || !M || M.rings !== d.rings.length) throw new Error(rec.file + ' and data/border-coast.js disagree on the ring pool — rebuild the marks');
    return { rec, d, M, win: windowsOf(d), V: new Map(), sub: new Map(), own: RECORDS.includes(rec) };
  });
  const tol = RECORDS[0].tolKm, onAbove = onAboveOf(tol);
  const near = (ring) => courses.some((c) => ring.some((p) => boxNear(c.ix.bbox, p, tol)));
  const closed = (S, ri) => { let V = S.V.get(ri); if (!V) { V = closedRing(S.d.rings[ri]); S.V.set(ri, V); } return V; };
  /* drawn edges near the courses, by their two vertices */
  const edges = new Map();
  for (const S of all) S.d.rings.forEach((ring, ri) => {
    if (!near(ring)) return;
    const V = closed(S, ri);
    for (const [a, b] of runsOf(S.M.draw[ri], V)) for (let j = a; j < b; j++) { const k = edgeKey(V[j], V[j + 1]); const l = edges.get(k); if (l) l.push([S, ri]); else edges.set(k, [[S, ri]]); }
  });
  /* 1. the redraws the facts allow, ring by ring (identity and period) */
  for (const S of all.filter((x) => x.own)) {
    const usedBy = new Map(); for (const r of rowsOf(S.d)) for (const p of r.polys) for (const ri of p) { const l = usedBy.get(ri); if (l) l.push(r); else usedBy.set(ri, [r]); }
    courses.forEach((c, ci) => {
      const qs = new Set(c.sides.map((x) => x.qid).filter(Boolean)), lo = dayOf(c.span[0]), hi = dayOf(c.span[1]);
      /* identity is asked of the rows drawn DURING the period; the redraw itself applies only then (the reader filters
         by the course's days), so a ring drawn before or after the period keeps its coarse line at those dates */
      const during = (r) => r.s < hi && r.e > lo, fits = (r) => !during(r) || (r.q && qs.has(r.q));
      for (const [ri, users] of usedBy) {
        if (!users.some(during) || !users.every(fits) || !S.d.rings[ri].some((p) => boxNear(c.ix.bbox, p, tol))) continue;
        const V = closed(S, ri), found = substitutionsOf(V, runsOf(S.M.draw[ri], V), ci, c.ix, tol, onAbove, c.exceptions || []);
        const prev = S.sub.get(ri) || [];
        /* two courses never claim the same vertex: the earlier-listed course keeps it */
        for (const x of found) if (!prev.some((y) => x[0] <= y[1] && y[0] <= x[1])) prev.push(x);
        if (prev.length) S.sub.set(ri, prev);
      }
    });
  }
  const origin = new Map(); for (const S of all) for (const [ri, l] of S.sub) origin.set(S.rec.key + ':' + ri, l.slice());
  /* 2. carry each redraw to every ring that draws the same edge at the same time, until nothing changes; a redraw that
     cannot be carried is dropped, and the carrying starts again from the redraws that are left (so a mirror never
     outlives the redraw it copies) */
  const clip = (W, c) => { const lo = dayOf(c.span[0]), hi = dayOf(c.span[1]); return W.map(([s, e]) => [Math.max(s, lo), Math.min(e, hi)]).filter(([s, e]) => s < e); };
  const replaced = (S, ri) => { const m = new Map(), V = closed(S, ri); for (const x of S.sub.get(ri) || []) for (let i = x[0]; i <= x[1]; i++) m.set(vkey(V[i]), x[2]); return m; };
  const dropped = new Set();
  for (let round = 0; round < 100; round++) {
    /* restart from the owners' own redraws, less what has been dropped */
    for (const S of all) { S.sub.clear(); }
    for (const [k, l] of origin) { const [key, ri] = k.split(':'), S = all.find((x) => x.rec.key === key); const keep = l.filter((x) => !dropped.has(key + ':' + ri + ':' + x.join(','))); if (keep.length) S.sub.set(+ri, keep.slice()); }
    let failed = null;
    for (let pass = 0; pass < 100 && !failed; pass++) {
      let changed = false;
      for (const S of all) for (const [ri] of [...S.sub]) {
        if (failed) break;
        const V = closed(S, ri), mine = replaced(S, ri), win = S.win.get(ri) || [];
        for (const x of S.sub.get(ri) || []) {
          const c = courses[x[2]];
          for (let j = Math.max(0, x[0] - 1); j <= Math.min(V.length - 2, x[1]) && !failed; j++) {
            for (const [T, rj] of edges.get(edgeKey(V[j], V[j + 1])) || []) {
              if (T === S && rj === ri) continue;
              /* only rings drawn together while the redraw applies have to agree */
              if (!overlapsIn(clip(win, c), T.win.get(rj) || [])) continue;
              const same = (m) => [V[j], V[j + 1]].every((p) => (mine.get(vkey(p)) ?? -1) === (m.get(vkey(p)) ?? -1));
              if (same(replaced(T, rj))) continue;
              /* both rings take the union of what either redraws on each course involved, so neither is left with
                 a vertex the other moved (a ring may gain vertices here; it never loses one the facts gave it) */
              const cids = new Set([...[V[j], V[j + 1]].map((p) => mine.get(vkey(p))), ...[V[j], V[j + 1]].map((p) => replaced(T, rj).get(vkey(p)))].filter((v) => v != null));
              for (const cid of cids) {
                const cc = courses[cid], want = new Set([...replaced(S, ri), ...replaced(T, rj)].filter(([, cj]) => cj === cid).map(([k]) => k));
                for (const [R, rr] of [[S, ri], [T, rj]]) {
                  const W = closed(R, rr);
                  const got = substitutionsOf(W, runsOf(R.M.draw[rr], W), cid, cc.ix, tol, onAbove, cc.exceptions || [], { allowed: (p) => want.has(vkey(p)), minKm: 0 });
                  const keep = (R.sub.get(rr) || []).filter((y) => y[2] !== cid);
                  const next = keep.concat(got.filter((g) => !keep.some((y) => g[0] <= y[1] && y[0] <= g[1]))).sort((p, q) => p[0] - q[0]);
                  if (JSON.stringify(next) !== JSON.stringify(R.sub.get(rr) || [])) { if (next.length) R.sub.set(rr, next); else R.sub.delete(rr); changed = true; }
                }
              }
              const ok = [V[j], V[j + 1]].every((p) => (replaced(S, ri).get(vkey(p)) ?? -1) === (replaced(T, rj).get(vkey(p)) ?? -1));
              if (!ok) { if (process.env.INTMAP_HISTCOURSE_DEBUG) console.error('  ✗', c.id, S.rec.key + ':' + ri, '→', T.rec.key + ':' + rj, 'mine', JSON.stringify([V[j], V[j + 1]].map((p) => replaced(S, ri).get(vkey(p)) ?? -1)), 'theirs', JSON.stringify([V[j], V[j + 1]].map((p) => replaced(T, rj).get(vkey(p)) ?? -1)), JSON.stringify([V[j], V[j + 1]])); failed = { S, ri, x }; break; }
            }
          }
          if (failed) break;
        }
      }
      if (!changed) break;
    }
    if (!failed) break;
    /* the redraw of the OWNER that this chain started from is dropped (a failed mirror traces back to an owner's
       vertex on the shared edge) — every owner redraw touching that edge's vertices on the same course goes */
    const keys = new Set([...replaced(failed.S, failed.ri)].filter(([, cj]) => cj === failed.x[2]).map(([k]) => k));
    for (const [k, l] of origin) { const [key, ri] = k.split(':'), S = all.find((y) => y.rec.key === key), V = closed(S, +ri);
      for (const y of l) if (y[2] === failed.x[2] && !dropped.has(key + ':' + ri + ':' + y.join(',')) && V.slice(y[0], y[1] + 1).some((p) => keys.has(vkey(p)))) { dropped.add(key + ':' + ri + ':' + y.join(',')); stats[y[2]].dropped++; } }
  }
  for (const S of all) {
    const sub = {};
    for (const [ri, l] of [...S.sub].sort((a, b) => a[0] - b[0])) {
      l.sort((a, b) => a[0] - b[0]); sub[ri] = l;
      const mine = origin.get(S.rec.key + ':' + ri) || [];
      for (const x of l) { stats[x[2]].edges += x[1] - x[0]; if (!mine.some((y) => y.join() === x.join())) stats[x[2]].mirrored++; }
      for (const ci of new Set(l.map((x) => x[2]))) stats[ci].rings++;
    }
    sets[S.rec.key] = { global: S.rec.global, rings: S.d.rings.length, tolKm: tol, sub };
  }
  return { sets, stats };
}

/* ── facts ───────────────────────────────────────────────────────────────── */
export function readFacts() { return JSON.parse(readFileSync(FACTS, 'utf8')); }
/* what a reviewed course must state before it can move a line */
export function factProblems(facts) {
  const bad = [], ids = new Set();
  const isQ = (q) => /^Q\d+$/.test(String(q));
  for (const c of facts.reviewed || []) {
    const at = 'course ' + c.id;
    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(c.id))) bad.push(at + ': id must be kebab-case');
    if (ids.has(c.id)) bad.push(at + ': duplicate id'); ids.add(c.id);
    const f = c.feature || {};
    if (!['river', 'wall'].includes(f.kind)) bad.push(at + ': feature.kind must be river or wall');
    if (!isQ(f.wikidata)) bad.push(at + ': feature.wikidata must be a QID');
    if (!f.osm || !['relation', 'way'].includes(f.osm.type) || !Array.isArray(f.osm.ids) || !f.osm.ids.length || !f.osm.ids.every(Number.isInteger)) bad.push(at + ': feature.osm must name the OpenStreetMap elements');
    for (const k of ['from', 'to']) if (!Array.isArray(c[k]) || c[k].length !== 2 || !c[k].every(Number.isFinite)) bad.push(at + ': ' + k + ' must be [lon, lat]');
    let lo, hi; try { lo = dayOf(c.span[0]); hi = dayOf(c.span[1]); } catch (e) { bad.push(at + ': ' + e.message); }
    if (!(lo < hi)) bad.push(at + ': span must run forwards');
    if (!Array.isArray(c.sides) || !c.sides.some((s) => isQ(s.qid))) bad.push(at + ': at least one side must be a polity with a QID');
    if (!(typeof c.claim === 'string' && c.claim.length >= 40)) bad.push(at + ': the claim must be stated');
    const src = (c.sources || []).filter((s) => s && typeof s.cite === 'string' && /^https?:\/\//.test(String(s.url)) && typeof s.supports === 'string');
    if (src.length < 2) bad.push(at + ': needs at least two sources with cite, url and what each supports');
    if (f.bridgeKm != null && !(f.kind === 'wall' && f.bridgeKm > 0 && f.bridgeKm <= 1)) bad.push(at + ': only a wall may join its mapped sections, across at most 1 km');
    for (const x of c.exceptions || []) if (!(Number.isFinite(x.lon) && Number.isFinite(x.lat) && x.km > 0 && typeof x.place === 'string')) bad.push(at + ': an exception needs place, lon, lat and km');
  }
  for (const r of facts.notDrawn || []) if (!(r.id && typeof r.why === 'string' && r.why.length >= 20)) bad.push('not drawn ' + r.id + ': must say why');
  return bad;
}

function inputs() {
  const bundles = {}; for (const r of [...RECORDS, ...MIRRORS]) bundles[r.key] = evalBundle(r.file, r.global);
  const marks = evalBundle('data/border-coast.js', '__IMBCOAST');
  return { bundles, marks };
}
const basisOf = () => Object.fromEntries([...RECORDS.map((r) => r.file), ...MIRRORS.map((r) => r.file), 'data/border-coast.js', ...ABOVE.map((r) => r.file)]
  .filter((f) => existsSync(join(ROOT, f))).map((f) => [f, sha(join(ROOT, f))]));

/* ── build ───────────────────────────────────────────────────────────────── */
async function build() {
  const facts = readFacts(), bad = factProblems(facts);
  if (bad.length) { for (const b of bad) console.error('✖ ' + b); process.exit(1); }
  const courses = [], fetched = [], based = [];
  for (const c of facts.reviewed) {
    const file = osmFile(c.feature);
    if (!existsSync(file)) throw new Error(c.id + ': no OpenStreetMap geometry in the cache — node scripts/build-hist-courses.mjs --fetch');
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    /* the copy's own dates: when it was taken, and the OpenStreetMap state it is (Overpass osm_base) */
    fetched.push(raw._fetchedAt || statSync(file).mtime.toISOString()); if (raw.osm3s && raw.osm3s.timestamp_osm_base) based.push(raw.osm3s.timestamp_osm_base);
    const { ways, side, version } = featureWays(c.feature, raw);
    const p = pathAlong(ways, c.from, c.to, side, c.feature.bridgeKm || 0);
    if (!p) throw new Error(c.id + ': the feature\'s ways do not connect ' + JSON.stringify(c.from) + ' to ' + JSON.stringify(c.to));
    /* the stretch's ends are named places ON the feature; one further from it than the record's error is a typo */
    if (p.snapKm.some((k) => k > RECORDS[0].tolKm)) throw new Error(c.id + ': an end of the stretch is ' + p.snapKm.map((k) => k.toFixed(1)).join(' / ') + ' km from the feature');
    courses.push({ ...c, line: p.line, osmVersion: version, km: p.km, bridges: p.bridges });
  }
  for (const c of courses) c.ix = courseIndex(c.line);
  const inp = inputs();
  const { sets, stats } = derive(courses, { ...inp, onAboveOf: (tol) => aboveIndex(courses, tol) });
  /* ⚠ 出自は値である（scripts/data-governance.mjs が先頭から読む）。品質は js/data-governance.js measureQuality が測る:
     1 行 = 1 区間、id で同一、線の座標は地球の上、期間は前へ進む */
  const { measureQuality } = requireModule('js/data-governance.js');
  const qrows = courses.map((c) => ({ id: c.id, line: c.line.length >= 2 ? c.line.length : null, sources: c.sources.length >= 2 ? c.sources.length : null,
    lon: Math.min(...c.line.map((p) => p[0])), lat: Math.min(...c.line.map((p) => p[1])), lonMax: Math.max(...c.line.map((p) => p[0])), latMax: Math.max(...c.line.map((p) => p[1])),
    forward: dayOf(c.span[1]) - dayOf(c.span[0]) }));
  const quality = measureQuality(qrows, { key: ['id'], fields: { id: {}, line: { min: 2 }, sources: { min: 2 }, lon: { min: -180, max: 180 }, lonMax: { min: -180, max: 180 },
    lat: { min: -90, max: 90 }, latMax: { min: -90, max: 90 }, forward: { min: 1 } } });
  const g = GOVERNANCE['data/hist-courses.js'];
  const doc = {
    v: 1, src: SRC, publisher: g.publisher, url: g.url, licence: 'ODbL 1.0', licenceUrl: g.licenceUrl, attribution: true, paidBy: g.paidBy,
    retrievedAt: fetched.sort().slice(-1)[0] || null, generatedAt: new Date().toISOString().slice(0, 10), asOf: based.sort().slice(-1)[0] || null,
    cadence: g.cadence, builtBy: g.builtBy, schema: g.schema, quality, basis: basisOf(),
    means: '`sets[key].sub[ringIndex]` = [[a, b, course, i0, i1], …], in force while the clock is in courses[course].days ([from, to) as sortable YYYYMMDD days) on the CLOSED ring of the bundle whose window global is `global` (a pool of exactly `rings` rings): the drawn run V[..a-1] continues along courses[course].line from vertex i0 to vertex i1 (i1 < i0 walks it backwards) and resumes at V[b+1]. Only lines change; a ring with no entry is drawn as data/border-coast.js marks it.',
    courses: courses.map((c) => ({ id: c.id, name: c.feature.name, kind: c.feature.kind, wikidata: c.feature.wikidata,
      osm: { type: c.feature.osm.type, ids: c.feature.osm.ids, version: c.osmVersion }, span: c.span, days: [dayOf(c.span[0]), dayOf(c.span[1])],
      ...(c.bridges && c.bridges.length ? { joined: c.bridges } : {}),
      sides: c.sides, sources: c.sources.map((s) => ({ cite: s.cite, url: s.url })), line: c.line })),
    sets,
  };
  writeFileSync(OUT, 'window.__IMBCOURSE=' + JSON.stringify(doc) + ';\n');
  for (const s of stats) if (s.rings) console.error(`  ${s.course}: ${s.rings} ring(s), ${s.edges} coarse edge(s) redrawn; ${s.mirrored} of them carried from a neighbour that draws the same edge, ${s.dropped} dropped because a neighbour could not take them`);
  const unused = courses.filter((c) => !stats.some((s) => s.course === c.id && s.rings));
  for (const c of unused) console.error(`  · ${c.id}: no row of the named polities draws this stretch inside the span (nothing redrawn)`);
  console.error(`data/hist-courses.js: ${courses.length} course(s), ${courses.reduce((a, c) => a + c.line.length, 0)} vertices, ${(readFileSync(OUT).length / 1e6).toFixed(2)} MB`);
}

/* ── check (offline) ─────────────────────────────────────────────────────── */
export function check() {
  const bad = [], ok = (c, m) => { if (!c) bad.push(m); };
  if (!existsSync(OUT)) return ['data/hist-courses.js is missing — node scripts/build-hist-courses.mjs'];
  const d = evalBundle('data/hist-courses.js', '__IMBCOURSE'), facts = readFacts();
  bad.push(...factProblems(facts));
  ok(d && d.v === 1 && /OpenStreetMap/.test(d.src) && d.licence === 'ODbL 1.0' && d.paidBy === GOVERNANCE['data/hist-courses.js'].paidBy, 'data/hist-courses.js must name OpenStreetMap, ODbL 1.0 and the row that pays its credit');
  ok(d && d.quality && d.quality.rows === d.courses.length && d.quality.duplicates === 0 && Object.values(d.quality.missing).every((n) => n === 0) && Object.values(d.quality.outOfRange).every((n) => n === 0), 'data/hist-courses.js quality: a course is missing a field, out of range or duplicated');
  const basis = basisOf();
  for (const [f, h] of Object.entries(basis)) ok(d.basis[f] === h, `data/hist-courses.js was derived from another ${f} — rebuild it (node scripts/build-hist-courses.mjs)`);
  /* the shipped courses are exactly the reviewed facts, in order, with the same span, sides and sources */
  ok(d.courses.length === facts.reviewed.length && d.courses.every((c, i) => c.id === facts.reviewed[i].id), 'data/hist-courses.js does not carry exactly the reviewed courses');
  d.courses.forEach((c, i) => {
    const f = facts.reviewed[i]; if (!f) return;
    ok(JSON.stringify(c.span) === JSON.stringify(f.span) && JSON.stringify(c.sides) === JSON.stringify(f.sides), `course ${c.id}: span or sides differ from the facts`);
    ok(c.sources.length === f.sources.length, `course ${c.id}: sources differ from the facts`);
    ok(Array.isArray(c.line) && c.line.length >= 2 && c.line.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)), `course ${c.id}: line is not a line`);
    /* the shipped line is the stretch the facts name: it starts and ends at the named places */
    if (c.line.length) ok(kmBetween(c.line[0], f.from) <= RECORDS[0].tolKm && kmBetween(c.line[c.line.length - 1], f.to) <= RECORDS[0].tolKm, `course ${c.id}: the line does not run from the facts' from to its to`);
  });
  if (bad.length) return bad;
  /* the substitutions re-derive EXACTLY from the shipped bundles, marks and course lines */
  const courses = d.courses.map((c, i) => ({ ...facts.reviewed[i], line: c.line, ix: courseIndex(c.line) }));
  const re = derive(courses, { ...inputs(), onAboveOf: (tol) => aboveIndex(courses, tol) });
  ok(JSON.stringify(re.sets) === JSON.stringify(d.sets), 'data/hist-courses.js substitutions do not re-derive from the shipped files — rebuild it');
  return bad;
}

/* ── --rebasis (offline): the substitutions re-derived from the SHIPPED course lines against today's bundles and marks ──
   (coast-snap-detail) The course lines are OpenStreetMap's geometry as `build` took it from the cache; what depends on the
   other files is only `sets` and `basis`. When a bundle or data/border-coast.js is rebuilt and the OpenStreetMap cache is
   not at hand (it lives in the temp directory of the machine that fetched it), this re-derives `sets` exactly as `check`
   does and records the new basis — the lines, their versions and their retrieval dates are carried unchanged. */
function rebasis() {
  const d = evalBundle('data/hist-courses.js', '__IMBCOURSE'), facts = readFacts(), bad = factProblems(facts);
  if (bad.length) { for (const b of bad) console.error('✖ ' + b); process.exit(1); }
  if (d.courses.length !== facts.reviewed.length || d.courses.some((c, i) => c.id !== facts.reviewed[i].id)) { console.error('✖ the reviewed courses changed — a full build is needed (node scripts/build-hist-courses.mjs --fetch, then without flags)'); process.exit(1); }
  const courses = d.courses.map((c, i) => ({ ...facts.reviewed[i], line: c.line, ix: courseIndex(c.line) }));
  const re = derive(courses, { ...inputs(), onAboveOf: (tol) => aboveIndex(courses, tol) });
  const same = JSON.stringify(re.sets) === JSON.stringify(d.sets);
  writeFileSync(OUT, 'window.__IMBCOURSE=' + JSON.stringify({ ...d, generatedAt: new Date().toISOString().slice(0, 10), basis: basisOf(), sets: re.sets }) + ';\n');
  console.error('data/hist-courses.js: basis re-recorded from the shipped course lines — substitutions ' + (same ? 'unchanged' : 'RE-DERIVED (they changed)'));
}

/* ── --report: the instrument ─────────────────────────────────────────────── */
function report() {
  const d = evalBundle('data/hist-courses.js', '__IMBCOURSE'), { bundles, marks } = inputs();
  const years = [-500, 0, 100, 300, 500, 800, 1000, 1200, 1400, 1500, 1600, 1650, 1700, 1750, 1800, 1850, 1880];
  console.log('year  record     drawn km   coarse km (edges > 25 km, not a meridian/parallel)   redrawn km');
  for (const rec of RECORDS) {
    const b = bundles[rec.key], M = marks.sets[rec.key], S = d.sets[rec.key].sub, rows = rowsOf(b);
    for (const y of years) {
      const t = ymd(y, 7, 1), seen = new Set(); let drawn = 0, coarse = 0, redrawn = 0;
      for (const r of rows) { if (!(r.s <= t && t < r.e)) continue;
        for (const p of r.polys) for (const ri of p) { if (seen.has(ri)) continue; seen.add(ri);
          const V = closedRing(b.rings[ri]), subs = (S[ri] || []).filter((x) => d.courses[x[2]].days[0] <= t && t < d.courses[x[2]].days[1]);
          for (const [a, z] of runsOf(M.draw[ri], V)) for (let j = a; j < z; j++) {
            const L = kmBetween(V[j], V[j + 1]); drawn += L;
            const axis = Math.abs(V[j][0] - V[j + 1][0]) < 1e-3 || Math.abs(V[j][1] - V[j + 1][1]) < 1e-3;
            const moved = subs.some((s) => j >= s[0] - 1 && j < s[1] + 1 && !(j === s[0] - 1 || j === s[1]));
            if (moved) redrawn += L; else if (L > 25 && !axis) coarse += L;
          } } }
      console.log(String(y).padStart(5) + '  ' + rec.key.padEnd(9) + String(Math.round(drawn)).padStart(10) + String(Math.round(coarse)).padStart(12) + String(Math.round(redrawn)).padStart(48));
    }
  }
}

/* ── --measure: the record's positional error against the precise records (build time; needs the cache) ── */
async function measure() {
  const { water } = await import('./build-border-coast.mjs');
  const W = water();
  const gj = JSON.parse(readFileSync(join(process.env.INTMAP_CLIO_CACHE || join(tmpdir(), 'intmap-clio-cache'), 'cliopatria_polities_only_v021.geojson'), 'utf8'));
  const hb = evalBundle('data/hist-borders.js', '__HISTB'), cs = evalBundle('data/cshapes.js', '__CSHAPES');
  const inF = (f, y) => ymd(f[2], f[3], f[4]) <= ymd(y, 7, 1) && ymd(y, 7, 1) < ymd(f[5], f[6], f[7]);
  for (const [y, ref] of [[1750, hb], [1800, hb], [1850, hb], [1900, cs], [1950, cs]]) {
    const segs = []; for (const f of ref.feats) if (inF(f, y)) for (const p of f[8]) for (const ri of p) { const r = ref.rings[ri]; for (let i = 0; i + 1 < r.length; i++) segs.push([r[i], r[i + 1]]); }
    const grid = gridOf(segs), ds = [];
    for (const ft of gj.features) { const P = ft.properties; if (P.Type !== 'POLITY' || !(P.FromYear <= y && y <= P.ToYear)) continue;
      const g = ft.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const poly of polys) for (const r of poly) for (let i = 0; i < r.length; i += 2) { const p = r[i]; if (W.inlandKm(p[0], p[1], 40) < 30) continue;
        let best = Infinity; for (const k of near(grid, p, 100)) best = Math.min(best, segDist(p, segs[k][0], segs[k][1]).d); if (best < 200) ds.push(best); } }
    ds.sort((a, b) => a - b); const q = (x) => ds[Math.floor(x * ds.length)].toFixed(1);
    console.log(`${y}: ${ds.length} inland vertices — median ${q(0.5)} km, 75th percentile ${q(0.75)} km, 90th ${q(0.9)} km`);
  }
}

const arg = process.argv.slice(2);
const main = async () => {
  if (arg.includes('--check')) { const bad = check(); if (bad.length) { for (const b of bad) console.error('✖ ' + b); process.exit(1); } const d = evalBundle('data/hist-courses.js', '__IMBCOURSE'); console.log(`hist-courses ok — ${d.courses.length} reviewed course(s), ${Object.values(d.sets).reduce((a, s) => a + Object.keys(s.sub).length, 0)} ring(s) redrawn, all re-derived from the shipped files`); return; }
  if (arg.includes('--fetch')) { await fetchAll(readFacts()); return; }
  if (arg.includes('--rebasis')) { rebasis(); return; }
  if (arg.includes('--report')) { report(); return; }
  if (arg.includes('--measure')) { await measure(); return; }
  await build();
};
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
