#!/usr/bin/env node
/* ==========================================================================
 * scripts/histrecon/munis-n03-1920.mjs   (hist-coverage-depth · PILOT v2)
 *
 * The 1920 町村 (and 市/区/島) polygons of 国土数値情報 N03-1920, ONE PER MUNICIPALITY, keyed the way
 * the research file names them («pref1920/郡/name», Hokkaido «pref1920/支庁/郡/name»). The 郡/市 blocks
 * of blocks-n03-1920.mjs are unions of exactly these polygons, built with the same rounding (5 decimals,
 * then 6-decimal output, no simplification), so a block's outline is the union of its 町村 and a
 * prefecture drawn from 町村 meets a prefecture drawn from whole blocks on the same line.
 *
 * Each municipality carries `blockId` = the id of the blocks-n03-1920.mjs block it belongs to. The rule
 * is that file's classify() (not exported there; restated here, and checked at run time: every blockId
 * must name an existing block).
 * ========================================================================== */
import pc from 'polygon-clipping';
import area from '@turf/area';
import { fetchRaw } from './blocks-n03-1920.mjs';
import { zipEntries, shapefileToGeoJSON, simplifyGeoJSON } from '../lib/elections-geo.mjs';

const round5 = (n) => Math.round(n * 1e5) / 1e5;
function roundRing(r) {
  const o = [];
  for (const [x, y] of r) {
    const p = [round5(x), round5(y)];
    const q = o[o.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) o.push(p);
  }
  if (o.length && (o[0][0] !== o[o.length - 1][0] || o[0][1] !== o[o.length - 1][1])) o.push(o[0].slice());
  return o.length >= 4 ? o : null;
}
function toMulti(g) {
  if (!g) return [];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const out = [];
  for (const p of polys) { const rings = p.map(roundRing).filter(Boolean); if (rings.length) out.push(rings); }
  return out;
}
function despike(ring) {
  let r = ring.slice(0, -1), again = true;
  while (again && r.length > 3) {
    again = false;
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length], c = r[(i + 1) % r.length];
      if (a[0] === c[0] && a[1] === c[1]) { r.splice(i, 1); r.splice(i % r.length, 1); again = true; break; }
    }
  }
  r.push(r[0].slice());
  return r.length >= 4 ? r : null;
}
function unionAll(polys, id, trouble) {
  if (polys.length < 2) return polys;
  try { return pc.union(polys[0], ...polys.slice(1)); } catch { /* fall through */ }
  const clean = polys.map((p) => { const o = p.map(despike).filter(Boolean); return o.length ? o : null; }).filter(Boolean);
  try { return pc.union(clean[0], ...clean.slice(1)); } catch { /* fall through */ }
  let acc = [clean[0]], seams = 0;
  for (const p of clean.slice(1)) { try { acc = pc.union(acc, [p]); } catch { acc = acc.concat([p]); seams++; } }
  trouble.push(id + ' (' + seams + ' unmerged of ' + polys.length + ')');
  return acc;
}
/* blocks-n03-1920.mjs classify(): 町村 under a 郡 -> 郡 (Hokkaido 支庁+郡); 市 -> itself; else itself */
const blockIdOf = (p) => {
  const pref = p.N03_001, sub = p.N03_002, gun = p.N03_003, muni = p.N03_004;
  if (gun) return sub ? pref + '/' + sub + '/' + gun : pref + '/' + gun;
  return pref + '/' + muni;
};

let memo = null;
/** Map key -> { key, pref1920, sub, gun, name, blockId, n03, coords, areaKm2 }. key = pref/gun/name, or
 *  pref/sub/gun/name in Hokkaido; a 市/区 without 郡 is pref//name (the research file's own spelling). */
export async function munis({ log = () => {} } = {}) {
  if (memo) return memo;
  const raw = await fetchRaw({ log });
  const groups = new Map();
  for (const [code, buf] of raw) {
    const fc = shapefileToGeoJSON(zipEntries(buf), { encoding: 'shift_jis' });
    for (const f of fc.features) {
      const p = f.properties;
      if (!p.N03_001 && !p.N03_004) continue;           /* the one unattributed polygon, as in blocks */
      const sub = p.N03_002 || '', gun = p.N03_003 || '';
      const key = sub ? [p.N03_001, sub, gun, p.N03_004].join('/') : [p.N03_001, gun, p.N03_004].join('/');
      let g = groups.get(key);
      if (!g) groups.set(key, g = { key, pref1920: p.N03_001, sub, gun, name: p.N03_004, blockId: blockIdOf(p), n03: code, polys: [] });
      for (const poly of toMulti(f.geometry)) g.polys.push(poly);
    }
  }
  const out = new Map(), trouble = [];
  for (const g of groups.values()) {
    let coords = unionAll(g.polys, g.key, trouble);
    let fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: coords } }] };
    try { fc = simplifyGeoJSON(fc, { tolerance: 0, decimals: 6 }); } catch { /* keep 5-decimal geometry */ }
    const geom = fc.features[0].geometry;
    coords = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    out.set(g.key, { key: g.key, pref1920: g.pref1920, sub: g.sub, gun: g.gun, name: g.name, blockId: g.blockId, n03: g.n03, coords,
      areaKm2: area({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: coords } }) / 1e6 });
  }
  memo = { munis: out, unionTrouble: trouble };
  return memo;
}
