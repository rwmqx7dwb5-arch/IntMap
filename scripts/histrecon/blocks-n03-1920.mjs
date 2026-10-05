#!/usr/bin/env node
/* ==========================================================================
 * scripts/histrecon/blocks-n03-1920.mjs
 *
 * BUILDING BLOCKS for reconstructing Meiji-era prefectures (1872-1890) from facts of the form
 * «this 郡 belonged to this prefecture from date X to Y». The blocks are the 郡 (districts) and 市
 * (cities) of 1920 (Taisho 9-01-01), dissolved out of the 町村 polygons of MLIT's 国土数値情報
 * 行政区域データ N03 (1920 vintage). 1920 is the earliest national boundary set that is public and
 * redistributable; a 郡 changed its outline far less between 1872 and 1920 than a 町村 did, which
 * is why the 郡 is the unit the reconstruction joins on.
 *
 * Observed 2026-10-05 on https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2015.html (the page
 * that describes every vintage up to 2015, 1920 included):
 *   - 47 files  N03-1920/N03-200101_<NN>_GML.zip  (NN = JIS prefecture code of TODAY'S prefecture)
 *   - each zip = .shp + .dbf (+ GML). NO .prj: the page states «JGD2000 / (B, L)» = lon/lat degrees.
 *   - .dbf is Shift_JIS. Fields (verified on 東京府):
 *       N03_001 prefecture as of 1920 (東京府, 北海道, 京都府 ...)  - NOT today's name
 *       N03_002 支庁 (Hokkaido; also empty strings elsewhere)
 *       N03_003 郡 (町村 rows) or empty (市/区/島庁 rows)
 *       N03_004 municipality
 *       N03_005 date this municipality came into being   N03_006 date it ceased
 *       N03_007 code (NOT unique: 13000 for every 町村 under a 郡) - therefore never used as a key.
 *
 * Nothing here is committed data: fetchRaw() caches the zips under os.tmpdir() and blocks() derives
 * everything from them at run time.
 * ========================================================================== */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pc from 'polygon-clipping';
import area from '@turf/area';
import { zipEntries, shapefileToGeoJSON, simplifyGeoJSON } from '../lib/elections-geo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE = 'https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2015.html';
const DATA = 'https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-1920/';
const CACHE = join(tmpdir(), 'intmap-histrecon-cache', 'n03-1920');

/* The licence strings are quoted from the two pages below, as observed 2026-10-05. */
export const SOURCE = {
  publisher: '国土交通省 国土数値情報（行政区域データ N03, 1920）',
  url: PAGE,
  licence: '商用可（国土数値情報ダウンロードサイトコンテンツ利用規約（旧国土情報利用約款準拠版）: 出典・加工者等表示のうえ、商用目的での利用（複製物の再配布を含む）が可能）',
  licenceUrl: 'https://nlftp.mlit.go.jp/ksj/other/agreement_02.html',
  licenceStatedAt: '2026-10-05',
  citation: '出典：国土数値情報（行政区域データ N03, 1920年（大正9年）1月1日時点）（国土交通省）（' + PAGE + '）を加工して作成。'
    + '原典：国土政策局「国土数値情報（行政区域）」（1950年時点）、国土地理院「旧版地図」「数値地図25000（地図画像）」。'
    + '「この地図は、国土地理院長の承認を得て、同院発行の数値地図50000（地図画像）を使用しました。（承認番号 平27情使、第720号）」',
};

/** The tolerance data/hist-kuni.js was simplified with — read from its header, not typed. */
export function kuniTolerance() {
  const head = readFileSync(join(HERE, '..', '..', 'data', 'hist-kuni.js'), 'utf8').slice(0, 2000);
  const m = head.match(/"tolerance"\s*:\s*([0-9.]+)/);
  if (!m) throw new Error('data/hist-kuni.js header has no "tolerance"');
  return Number(m[1]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The 47 file names are DISCOVERED from the data page, not listed here. Returns Map code -> Buffer. */
export async function fetchRaw({ log = () => {} } = {}) {
  mkdirSync(CACHE, { recursive: true });
  const listFile = join(CACHE, '_files.json');
  let names;
  if (existsSync(listFile)) names = JSON.parse(readFileSync(listFile, 'utf8'));
  else {
    const res = await fetch(PAGE);
    if (!res.ok) throw new Error('N03 page HTTP ' + res.status);
    const html = await res.text();
    names = [...new Set([...html.matchAll(/N03-1920\/(N03-[0-9]+_[0-9]{2}_GML\.zip)/g)].map((m) => m[1]))].sort();
    if (names.length < 47) throw new Error('expected 47 N03-1920 files on the page, found ' + names.length);
    writeFileSync(listFile, JSON.stringify(names));
  }
  const out = new Map();
  for (const name of names) {
    const code = name.match(/_([0-9]{2})_GML/)[1];
    const f = join(CACHE, name);
    if (!existsSync(f)) {
      log('GET ' + name);
      const res = await fetch(DATA + name);
      if (!res.ok) throw new Error(name + ' HTTP ' + res.status);
      writeFileSync(f, Buffer.from(await res.arrayBuffer()));
      await sleep(600);
    }
    out.set(code, readFileSync(f));
  }
  return out;
}

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
  for (const p of polys) {
    const rings = p.map(roundRing).filter(Boolean);
    if (rings.length) out.push(rings);
  }
  return out;
}

/** Block identity from N03 fields. 町村 under a 郡 -> 郡 (Hokkaido: 支庁 + 郡); a 市 -> 市;
 *  anything else (区, 島庁 ...) keeps its own name and is reported as `neither`. */
function classify(p) {
  const pref = p.N03_001, sub = p.N03_002, gun = p.N03_003, muni = p.N03_004;
  if (gun) {
    if (sub) return { kind: '支庁郡', name: gun, id: pref + '/' + sub + '/' + gun, pref, sub };
    return { kind: '郡', name: gun, id: pref + '/' + gun, pref };
  }
  if (/市$/.test(muni)) return { kind: '市', name: muni, id: pref + '/' + muni, pref };
  return { kind: null, name: muni, id: pref + '/' + muni, pref, sub };
}

/** Zero-width spikes (A->B->A) are what polygon-clipping's sweep line chokes on after 5-decimal
 *  rounding collapses two nearby vertices. Removing them changes no area. */
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
const cleanPoly = (poly) => { const o = poly.map(despike).filter(Boolean); return o.length ? o : null; };

/** Union of the members of one block. Bulk first; if the sweep line throws, fold one member at a
 *  time on despiked rings; a member that still cannot be merged is kept as its own part of the
 *  MultiPolygon (area is preserved, only a seam remains) and reported in `trouble`. */
function unionAll(polys, id, trouble) {
  if (polys.length < 2) return polys;
  try { return pc.union(polys[0], ...polys.slice(1)); } catch { /* fall through */ }
  const clean = polys.map(cleanPoly).filter(Boolean);
  try { return pc.union(clean[0], ...clean.slice(1)); } catch { /* fall through */ }
  let acc = [clean[0]], seams = 0;
  for (const p of clean.slice(1)) {
    try { acc = pc.union(acc, [p]); } catch { acc = acc.concat([p]); seams++; }
  }
  trouble.push(id + ' (' + seams + ' unmerged of ' + polys.length + ')');
  return acc;
}

let memo = null;
export async function blocks({ log = () => {} } = {}) {
  if (memo) return memo;
  const raw = await fetchRaw({ log });
  const tol = kuniTolerance();
  const groups = new Map();
  const neither = [];
  const unattributed = [];
  for (const [code, buf] of raw) {
    const fc = shapefileToGeoJSON(zipEntries(buf), { encoding: 'shift_jis' });
    for (const f of fc.features) {
      /* A row with every N03 field empty (observed: one 10.9 km2 polygon in the Kagoshima file, at the
         tip of the Satsuma peninsula) names nothing, so no fact «this 郡 belonged to ...» can join it.
         It is reported, never given a made-up name. */
      if (!f.properties.N03_001 && !f.properties.N03_004) {
        const a = area({ type: 'Feature', properties: {}, geometry: f.geometry }) / 1e6;
        unattributed.push({ n03: code, areaKm2: a, at: toMulti(f.geometry)[0][0][0] });
        continue;
      }
      const c = classify(f.properties);
      if (!c.kind) neither.push({ id: c.id, sub: c.sub || '', n03: code });
      const key = c.id;
      let g = groups.get(key);
      if (!g) groups.set(key, g = { ...c, kind: c.kind || 'その他', polys: [], n: 0, codes: new Set() });
      g.codes.add(code);
      g.n++;
      for (const poly of toMulti(f.geometry)) g.polys.push(poly);
    }
  }
  const out = [];
  const simplifyFallback = [];
  const unionTrouble = [];
  for (const g of groups.values()) {
    let coords = unionAll(g.polys, g.id, unionTrouble);
    let fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: coords } }] };
    /* ⚠ (hist-coverage-depth) NO SIMPLIFICATION: the blocks keep N03's own geometry (6 decimals ≈ 0.1 m). The
       overview bundle is simplified by its builder for speed; the zoomed detail is this geometry (principle §0). */
    try { fc = simplifyGeoJSON(fc, { tolerance: 0, decimals: 6 }); }
    catch { simplifyFallback.push(g.id); }
    const geom = fc.features[0].geometry;
    coords = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    out.push({
      id: g.id, pref1920: g.pref, kind: g.kind, name: g.name,
      names: { ja: g.name },
      coords,
      areaKm2: area({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: coords } }) / 1e6,
      /* derived, for the reader of --summary and for island checks; not part of the contract */
      _members: g.n, _n03Files: [...g.codes].sort(),
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id, 'ja'));
  memo = { source: SOURCE, blocks: out, tolerance: tol, neither, unattributed, simplifyFallback, unionTrouble };
  return memo;
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────────── */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.includes('--fetch') || args.includes('--summary')) {
    const log = (s) => console.error(s);
    if (args.includes('--fetch')) { const r = await fetchRaw({ log }); console.log('fetched ' + r.size + ' files into ' + CACHE); }
    if (args.includes('--summary')) {
      const r = await blocks({ log });
      const vert = (b) => b.coords.reduce((s, p) => s + p.reduce((t, ring) => t + ring.length, 0), 0);
      const per = new Map();
      for (const b of r.blocks) {
        const e = per.get(b.pref1920) || { n: 0, gun: 0, shi: 0, other: 0, km2: 0 };
        e.n++; e.km2 += b.areaKm2; if (b.kind === '市') e.shi++; else if (b.kind === 'その他') e.other++; else e.gun++;
        per.set(b.pref1920, e);
      }
      console.log('source: ' + r.source.publisher + '\nlicence: ' + r.source.licence + '\ntolerance (from data/hist-kuni.js header): ' + r.tolerance);
      console.log('\nper prefecture (as of 1920): blocks (郡/支庁郡 · 市 · その他) km2');
      for (const [k, e] of per) console.log('  ' + k + ': ' + e.n + ' (' + e.gun + ' · ' + e.shi + ' · ' + e.other + ') ' + e.km2.toFixed(0));
      const tot = r.blocks.reduce((s, b) => s + b.areaKm2, 0);
      console.log('\ntotal blocks: ' + r.blocks.length + '  (郡 ' + r.blocks.filter((b) => b.kind === '郡').length + ', 支庁郡 ' + r.blocks.filter((b) => b.kind === '支庁郡').length + ', 市 ' + r.blocks.filter((b) => b.kind === '市').length + ', その他 ' + r.blocks.filter((b) => b.kind === 'その他').length + ')');
      console.log('total vertices: ' + r.blocks.reduce((s, b) => s + vert(b), 0));
      console.log('total area: ' + tot.toFixed(0) + ' km2  (Japan land area, GSI 2023: 377,975 km2 incl. Northern Territories; 1920 map has no Karafuto/Taiwan/Korea)');
      console.log('\nblocks with several disjoint parts: ' + r.blocks.filter((b) => b.coords.length > 1).length);
      console.log('archipelago blocks (>= 5 disjoint parts; islands are separate parts, listed so nobody mistakes them for slivers): ' +
        r.blocks.filter((b) => b.coords.length >= 5).map((b) => b.id + '[' + b.coords.length + ' parts, ' + b.areaKm2.toFixed(0) + ' km2]').join(', '));
      console.log('blocks whose largest part is < 60% of the block (the rest is detached): ' +
        r.blocks.filter((b) => b.coords.length > 1).filter((b) => { const a = b.coords.map((p) => area({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: p } }) / 1e6); return Math.max(...a) < 0.6 * b.areaKm2; }).map((b) => b.id).join(', '));
      console.log('unattributed polygons (all N03 fields empty, excluded from blocks): ' + (r.unattributed.map((u) => 'N03 file ' + u.n03 + ', ' + u.areaKm2.toFixed(1) + ' km2 at ' + u.at.join(',')).join('; ') || '(none)'));
      console.log('\nneither 郡 nor 市 (rows): ' + r.neither.length + '  (blocks: ' + new Set(r.neither.map((x) => x.id)).size + ')');
      for (const id of [...new Set(r.neither.map((x) => x.id))]) console.log('  ' + id + ' x' + r.neither.filter((x) => x.id === id).length);
      console.log('union needed the fallback path for: ' + (r.unionTrouble.join(', ') || '(none)'));
      console.log('simplify fell back to 5-decimal geometry for: ' + (r.simplifyFallback.join(', ') || '(none)'));
      console.log('\nsamples:');
      const step = Math.floor(r.blocks.length / 10);
      for (let i = 0; i < 10; i++) { const b = r.blocks[i * step]; console.log('  ' + b.id + ' [' + b.kind + '] parts=' + b.coords.length + ' verts=' + vert(b) + ' area=' + b.areaKm2.toFixed(1) + ' km2 members=' + b._members); }
    }
  } else console.log('usage: node scripts/histrecon/blocks-n03-1920.mjs --fetch | --summary');
}
