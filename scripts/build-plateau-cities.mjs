#!/usr/bin/env node
/* ============================================================================
 *  IntMap · PLATEAU CITY REGISTRY, DERIVED  — data/plateau-cities.json
 * ----------------------------------------------------------------------------
 *  js/plateau-cities.js used to hold a hand-written list (Tokyo's 23 wards) and one geoid constant. The
 *  catalogue lists ~450 city/ward units with building 3D Tiles; a hand list cannot follow it and a
 *  single geoid number is wrong everywhere but Tokyo. This DISCOVERS the registry:
 *
 *   1. api.plateauview.mlit.go.jp/datacatalog/plateau-datasets  → `latest_datasets` of type `bldg`
 *      (format 3D Tiles). Per unit (ward code if any, else city code) the variant streamed is the
 *      best at LOD <= 2: LOD2 textured > LOD2 plain > LOD1 textured > LOD1 plain. LOD3/4 exist for ~25
 *      units but are several times heavier; the choice is a data-volume judgement, kept in one place
 *      (`rank` below). The URL is the catalogue's own `latest` alias, as the Tokyo code already used.
 *   2. each tileset.json's root `boundingVolume.region` → the unit's extent (west,south,east,north).
 *   3. GSI's geoid calculator (vldb.gsi.go.jp/sokuchi/surveycalc/geoid — JGEOID2011-based, the
 *      national geoid model) at the extent's centre → `geoid`, the metres by which PLATEAU's
 *      ellipsoidal heights exceed the sea-level ground. The runtime adds -geoid per tileset.
 *      Tokyo (Chiyoda) answers 36.78 m, matching the 36.7 m measured against rendered tiles
 *      (dev-notes/2026-11-19-plateau-render-quality.md).
 *
 *  USAGE   node scripts/build-plateau-cities.mjs            fetch, derive, write data/plateau-cities.json
 *          node scripts/build-plateau-cities.mjs --check    fetch, derive, compare (network; nightly, not CI)
 *  EXPIRES when MLIT renames the `-latest` aliases or GSI retires the calculator (the script then
 *  fails loudly instead of writing a registry with missing geoid heights).
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATEAU_CATALOGUE } from './lib/upstream-cadence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'plateau-cities.json');
const CATALOGUE = 'https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets';
/* 出自は値である（check:datagov が読む）。上流が述べていることだけを書く。 */
export const GOVERNANCE = {
  'data/plateau-cities.json': {
    upstreams: [
      { publisher: 'MLIT Japan — Project PLATEAU data catalogue', url: 'https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets', licence: 'PLATEAU site policy (compatible with CC BY 4.0)', attribution: true,
        paidBy: 'PLATEAU 3D city models (MLIT Japan)', fields: 'which cities have building 3D Tiles, the tileset alias, LOD, texture, the tileset root region' },
      { publisher: 'Geospatial Information Authority of Japan (GSI) — geoid height calculator', url: 'https://vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh/calc_f.html', licence: 'GSI terms of use', attribution: false,
        fields: 'geoid height at each unit centre (build time only)' },
    ],
    priority: { disjoint: ['city list, tileset alias, extent (PLATEAU catalogue)', 'geoid height (GSI calculator)'] },
    /* (describes.*) every value below is either the catalogue's own field or a count measured on the committed data/plateau-cities.json
       (2026-11-20); the catalogue states no accuracy or completeness of its own, so neither is declared. */
    period: { start: '2020', end: '2025', note: "the catalogue's own `year` field of the streamed dataset of each unit (46 / 1 / 52 / 85 / 100 / 157 units for 2020 / 2021 / 2022 / 2023 / 2024 / 2025), measured; it is the year of the dataset, not a survey date" },
    extent: '441 city or ward units in 45 prefectures of Japan, measured on the committed registry; union of the tileset root regions 127.63E 20.42N to 153.99E 43.19N; a unit appears only if the catalogue lists building 3D Tiles for it',
    resolution: 'building models at LOD2 (293 units) or LOD1 (148 units), all textured, as the catalogue\'s lod and texture fields state; the best variant at LOD2 or below is chosen per unit',
    ...PLATEAU_CATALOGUE, builtBy: 'scripts/build-plateau-cities.mjs' },
};

const GEOID = 'https://vldb.gsi.go.jp/sokuchi/surveycalc/geoid/calcgh/cgi/geoidcalc.pl';

/** @param {{lod:string,texture:boolean}} d  higher = preferred; null = not streamed */
export function rank(d) {
  const lod = Number(d.lod);
  if (lod === 2) return d.texture ? 4 : 3;
  if (lod === 1) return d.texture ? 2 : 1;
  return null;
}

/** per unit code (ward code if the catalogue has one), the streamable variants best first */
export function pickUnits(datasets) {
  const by = new Map();
  for (const d of datasets) {
    if (d.type_en !== 'bldg' || d.format !== '3D Tiles') continue;
    const r = rank(d); if (r == null) continue;
    const code = d.ward_code || d.city_code;
    if (!by.has(code)) by.set(code, []);
    by.get(code).push({ r, d });
  }
  return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([code, c]) => ({ code, candidates: c.sort((x, y) => y.r - x.r).map((x) => x.d) }));
}

async function getJson(url, tries = 3) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(url + ' → HTTP ' + r.status); return await r.json(); }
    catch (e) { if (i + 1 >= tries) throw e; await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
}

/* the calculator answers "server busy" (HTTP 200, ExportData.ErrMsg) when called faster than about one a second or two: one at a time, spaced 1.5 s,
   retried with growing waits. PLATEAU_GEOID_CACHE=<file> keeps answers between runs so a failed run resumes (a scratch aid; the registry is the product). */
let gate = Promise.resolve();
const CACHE_FILE = process.env.PLATEAU_GEOID_CACHE;
const cache = CACHE_FILE && fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
function geoidAt(lat, lng) {
  const key = lat + ',' + lng;
  if (key in cache) return Promise.resolve(cache[key]);
  const run = async () => {
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 1500 + i * 2500));
      const g = await getJson(`${GEOID}?outputType=json&latitude=${lat}&longitude=${lng}`);
      const v = Number(g.OutputData && g.OutputData.geoidHeight);
      if (Number.isFinite(v)) { cache[key] = v; if (CACHE_FILE) fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); return v; }
    }
    throw new Error('GSI geoid calculator gave no height for ' + lat + ',' + lng);
  };
  const p = gate.then(run); gate = p.catch(() => {}); return p;
}

async function build() {
  const cat = await getJson(CATALOGUE);
  const units = pickUnits(cat.latest_datasets);
  if (units.length < 300) throw new Error('catalogue returned only ' + units.length + ' units — refusing to write a shrunken registry');
  const rows = [];
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++; if (i >= units.length) return;
      const { code, candidates } = units[i];
      /* the catalogue lists some `-latest` aliases whose tileset is an EMPTY placeholder (measured 2026-11-20: Hamamatsu's seven wards at LOD2 —
         a root with no content and no children, region spanning all of Japan). Such a dataset draws nothing and would claim the whole country as its
         extent, so a unit takes the best variant that actually has content, and is dropped (and reported) if none does. */
      let d = null, ts = null;
      for (const c of candidates) { const t = await getJson(c.url); if (t.root && (t.root.content || (t.root.children && t.root.children.length))) { d = c; ts = t; break; } }
      if (!d) { console.warn('no variant with content: ' + code); continue; }
      const reg = ts.root && ts.root.boundingVolume && ts.root.boundingVolume.region;
      if (!reg) throw new Error(d.url + ': root has no boundingVolume.region');
      const D = 180 / Math.PI, [w, s, e, n] = reg.slice(0, 4).map(x => +(x * D).toFixed(5));
      const lat = +((s + n) / 2).toFixed(5), lng = +((w + e) / 2).toFixed(5);
      const geoid = await geoidAt(lat, lng);
      const m = d.url.match(/\/3dtiles\/([^/]+)\/tileset\.json$/);
      if (!m) throw new Error('unexpected tileset url ' + d.url);
      rows[i] = { code, name: [d.city, d.ward].filter(Boolean).join(' '), pref: d.pref, lod: Number(d.lod), tex: !!d.texture, alias: m[1], bbox: [w, s, e, n], geoid: +geoid.toFixed(2), bytes: d.file_size || 0 };
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  rows.splice(0, rows.length, ...rows.filter(Boolean));
  const now = new Date().toISOString();
  const g = GOVERNANCE['data/plateau-cities.json'];
  return { source: 'PLATEAU (MLIT Japan) data catalogue + GSI geoid calculator', publisher: g.upstreams[0].publisher, licence: g.upstreams[0].licence, licenceUrl: 'https://www.mlit.go.jp/plateau/site-policy/', attribution: true, paidBy: g.upstreams[0].paidBy,
           retrievedAt: now, generatedAt: now, asOf: now.slice(0, 10), cadence: g.cadence, builtBy: g.builtBy, catalogue: CATALOGUE, geoidModel: GEOID,
           heights: 'geoid = metres PLATEAU ellipsoidal heights exceed mean sea level at the unit centre; apply -geoid', units: rows };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await build();
  const text = JSON.stringify(out) + '\n';
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    const a = new Set(JSON.parse(cur || '{"units":[]}').units.map(u => u.code)), b = new Set(out.units.map(u => u.code));
    const gone = [...a].filter(c => !b.has(c)), added = [...b].filter(c => !a.has(c));
    console.log(`committed ${a.size} units, upstream ${b.size}; added ${added.length}, gone ${gone.length}`);
    process.exit(gone.length ? 1 : 0);
  }
  fs.writeFileSync(OUT, text);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${out.units.length} units, ${text.length} bytes`);
}
