#!/usr/bin/env node
/* ============================================================================
 *  build-admin1.mjs — data/admin1-world.json.gz  (#R290)
 * ----------------------------------------------------------------------------
 *  ONE first-level administrative index for the whole planet, so the weather-warning layer can
 *  answer 「発令なし」 at the UNIT for every country rather than for the fifty this map happened to
 *  hold a closer index for.
 *
 *  ── WHY THIS FILE EXISTS AT ALL (measured, #R290) ───────────────────────────────────────────
 *  Nothing on the open web serves a world ADM1 set a browser can afford:
 *    · Natural Earth 50 m admin-1  — 294 features covering **9 countries**. Not a world index.
 *    · Natural Earth 10 m admin-1  — 4,596 features, 251 countries, and **40.7 MB** of GeoJSON
 *      (12.1 MB gzipped). jsDelivr answers 403 for it (over its size limit); raw.githubusercontent
 *      serves it, and no phone should download it to draw grey.
 *    · geoBoundaries CGAZ ADM1     — **360 MB**.
 *    · geoBoundaries gbOpen, per country — 0.3–2 MB EACH, which is a stampede of ~95 downloads the
 *      moment the layer is switched on, throttled to two at a time. That is the 「重すぎる」 half of
 *      the same report.
 *  So the world set is simplified ONCE, here, and shipped: Douglas–Peucker at 0.01° (≈1.1 km) with
 *  coordinates rounded to four decimals, holes and slivers under 1e-4 deg² dropped.
 *
 *  ⚠ THE NAMES TRAVEL WITH THE SHAPES, because this index is also the last naming rung the warning
 *  placer consults (`lookupUnit`): Natural Earth carries `name`, `name_alt`, `name_local`,
 *  `iso_3166_2`, `code_hasc` and the localised names, and a met service may name a region by any
 *  of them.
 *
 *  Source & licence: Natural Earth (public domain), ne_10m_admin_1_states_provinces.
 *  Declared in sources.html / js/reference-data.js like every other bundled set.
 *
 *  Usage:  node scripts/build-admin1.mjs [--out data/admin1-world.json.gz] [--tol 0.01]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(ROOT, argOf('--out', 'data/admin1-world.json.gz'));
const TOL = parseFloat(argOf('--tol', '0.01'));
const QUANT = 1e4;                       /* four decimals ≈ 11 m at the equator */
const MIN_AREA = 1e-4;                   /* deg² — an island under ~1 km² is not a grey unit */

/* Douglas–Peucker, iterative (a recursive one blows the stack on a 40,000-point ring). */
function simplifyRing(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const seg = stack.pop(), a = seg[0], b = seg[1];
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay, den = dx * dx + dy * dy;
    let far = -1, fd = 0;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0], py = pts[i][1];
      let t = den ? ((px - ax) * dx + (py - ay) * dy) / den : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + t * dx, qy = ay + t * dy;
      const d = (px - qx) * (px - qx) + (py - qy) * (py - qy);
      if (d > fd) { fd = d; far = i; }
    }
    if (fd > tol2 && far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
const q = (v) => Math.round(v * QUANT) / QUANT;
function ringOf(r, tol) {
  const s = simplifyRing(r, tol).map((p) => [q(p[0]), q(p[1])]);
  const out = [s[0]];
  for (let i = 1; i < s.length; i++) {
    const p = s[i], l = out[out.length - 1];
    if (p[0] !== l[0] || p[1] !== l[1]) out.push(p);
  }
  if (out.length < 4) return null;
  const f = out[0], l = out[out.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]]);
  return out.length >= 4 ? out : null;
}
const ringArea = (r) => { let a = 0; for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };

function simplifyGeom(g, tol) {
  const polys = g && g.type === 'Polygon' ? [g.coordinates] : (g && g.type === 'MultiPolygon' ? g.coordinates : null);
  if (!polys) return null;
  const out = [];
  for (const p of polys) {
    const rings = [];
    for (let i = 0; i < p.length; i++) {
      const r = ringOf(p[i], tol);
      if (!r) { if (i === 0) break; else continue; }
      if (i === 0 && ringArea(r) < MIN_AREA) break;
      rings.push(r);
    }
    if (rings.length) out.push(rings);
  }
  if (!out.length) return null;
  return out.length === 1 ? { type: 'Polygon', coordinates: out[0] } : { type: 'MultiPolygon', coordinates: out };
}

/* the naming keys a met service could plausibly use for the same unit */
const NAME_KEYS = ['name', 'name_en', 'name_alt', 'name_local', 'iso_3166_2', 'code_hasc', 'gn_name', 'woe_name', 'postal', 'abbrev'];

const res = await fetch(SRC);
if (!res.ok) { console.error('fetch failed: HTTP ' + res.status + ' ' + SRC); process.exit(1); }
const src = JSON.parse(await res.text());
console.log('source: ' + src.features.length + ' features');

const feats = [];
let points = 0;
for (const f of src.features) {
  const p = f.properties || {};
  const iso = String(p.adm0_a3 || '').toUpperCase();
  if (!/^[A-Z]{3}$/.test(iso)) continue;
  const g = simplifyGeom(f.geometry, TOL);
  if (!g) continue;
  const walk = (a) => { if (typeof a[0] === 'number') { points++; return; } for (const x of a) walk(x); };
  walk(g.coordinates);
  const names = [];
  for (const k of NAME_KEYS) {
    String(p[k] == null ? '' : p[k]).split('|').forEach((x) => {
      const t = x.trim();
      if (t && t !== '-99' && names.indexOf(t) < 0) names.push(t);
    });
  }
  feats.push({ i: iso, n: names.join('|'), g });
}
feats.sort((a, b) => (a.i < b.i ? -1 : a.i > b.i ? 1 : 0));

const isos = {};
feats.forEach((f) => { isos[f.i] = (isos[f.i] || 0) + 1; });
const body = JSON.stringify({
  v: 1,
  source: 'Natural Earth 10m admin-1 states/provinces (public domain)',
  built: new Date().toISOString().slice(0, 10),
  tolerance: TOL,
  countries: Object.keys(isos).length,
  units: feats.length,
  f: feats
});
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const gz = zlib.gzipSync(Buffer.from(body, 'utf8'), { level: 9 });
fs.writeFileSync(OUT, gz);
console.log('units ' + feats.length + ' · countries ' + Object.keys(isos).length + ' · points ' + points);
console.log('json ' + body.length + ' bytes → gzip ' + gz.length + ' bytes → ' + path.relative(ROOT, OUT));
