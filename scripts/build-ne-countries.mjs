#!/usr/bin/env node
/* ============================================================================
 *  IntMap · NATURAL EARTH ADMIN-0 COUNTRIES, SERVED FROM THIS SITE  (mobile-performance)
 *  nvkelso/natural-earth-vector @ <pinned commit>  →  data/ne-countries/ne_{110m,50m,10m}_admin_0_countries.json.gz
 * ----------------------------------------------------------------------------
 *  「スマホのパフォーマンスと UI を改善して」 — MEASURED in production (390×844, CPU ×4, 2026-10-02): a
 *  phone that zoomed in fetched ne_10m_admin_0_countries.geojson from cdn.jsdelivr.net, 4.34 MB, at
 *  `@master`. js/countries-ui.js read all three scales from there (and js/map-tools.js the 110 m one),
 *  so the country table and outlines depended on a third-party CDN serving a moving branch.
 *
 *  This reads the same three files at ONE PINNED COMMIT and writes them in the lossless form
 *  js/ne-countries.js defines and decodes (properties verbatim, coordinates as delta-encoded integer
 *  micro-degrees). Nothing is simplified, dropped or re-derived: `decode(file)` is deep-equal to the
 *  upstream JSON, key order included, and `--check` proves it for every vertex whenever the upstream
 *  bytes are at hand.
 *
 *      node scripts/build-ne-countries.mjs                 download (or read --cache), write data/ne-countries/
 *      node scripts/build-ne-countries.mjs --check         offline: every shipped file decodes, re-encodes to
 *                                                         itself and carries the pinned source; with --cache
 *                                                         <dir> holding the upstream files, also deep-equal
 *      node scripts/build-ne-countries.mjs --cache <dir>   read ne_<scale>_admin_0_countries.geojson from <dir>
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { NATURAL_EARTH } from './lib/upstream-cadence.mjs';
import { NE_SCALES, neCountriesPath, encodeNECountries, decodeNECountries } from '../js/ne-countries.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* the commit `master` pointed at when this was built (read 2026-10-02 from api.github.com: the
   repository's last commit, 2022-06-02). Pinned so that the bytes a reader gets are the bytes this
   build checked; moving it is a rebuild, not a drift. */
const COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const upstreamUrl = (scale) => `https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@${COMMIT}/geojson/ne_${scale}_admin_0_countries.geojson`;

/* ⚠ (#729) 出自は値である（散文ではない）。読むのは js/data-governance.js の read() で、
   npm run check:datagov がこの宣言と data/ の実体・js/reference-data.js の DATA_SOURCES を
   突き合わせる。⚠ ここに書くのは「上流が述べていること」だけ——述べていないものは書かない。 */
export const GOVERNANCE = {
  'data/ne-countries/index.json': {
    publisher: 'Natural Earth',
    url: 'https://github.com/nvkelso/natural-earth-vector/tree/ca96624a56bd078437bca8184e78163e5039ad19/geojson',
    licence: 'public domain',
    attribution: false,
    ...NATURAL_EARTH,
    builtBy: 'scripts/build-ne-countries.mjs',
  },
};

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

async function upstream(scale, cache) {
  if (cache) {
    const p = join(cache, `ne_${scale}_admin_0_countries.geojson`);
    if (existsSync(p)) return readFileSync(p, 'utf8');
    return null;
  }
  const r = await fetch(upstreamUrl(scale));
  /* update-failure: a response this build never checked must not reach the bytes it writes */
  if (!r.ok) throw new Error(`${upstreamUrl(scale)} answered ${r.status}`);
  const t = await r.text();
  const j = JSON.parse(t);
  if (j.type !== 'FeatureCollection' || !Array.isArray(j.features) || j.features.length < 150) throw new Error(`${scale}: not the admin-0 collection (${j.features && j.features.length} features)`);
  return t;
}

function encode(scale, text) {
  const fc = JSON.parse(text);
  const doc = encodeNECountries(fc, { scale, source: { publisher: 'Natural Earth', commit: COMMIT, url: upstreamUrl(scale), licence: 'public domain' } });
  /* lossless, or nothing is written */
  if (!isDeepStrictEqual(decodeNECountries(doc), fc)) throw new Error(`${scale}: the encoding does not decode back to the upstream file`);
  return doc;
}

function readShipped(scale) {
  const p = join(ROOT, neCountriesPath(scale));
  if (!existsSync(p)) throw new Error(`${neCountriesPath(scale)} is missing — run node scripts/build-ne-countries.mjs`);
  return JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));
}

export async function check(cache) {
  const out = [];
  for (const scale of NE_SCALES) {
    const doc = readShipped(scale);
    if (!doc.source || doc.source.commit !== COMMIT || doc.scale !== scale) throw new Error(`${scale}: the file does not carry the pinned source (${doc.source && doc.source.commit})`);
    const fc = decodeNECountries(doc);
    /* every ring closed, every coordinate on the globe */
    let verts = 0;
    for (const f of fc.features) {
      const g = f.geometry; if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      for (const p of polys) for (const r of p) {
        const a = r[0], b = r[r.length - 1];
        if (r.length < 4 || a[0] !== b[0] || a[1] !== b[1]) throw new Error(`${scale}: an open ring in ${f.properties && f.properties.ADM0_A3}`);
        for (const [x, y] of r) { verts++; if (!(x >= -180 && x <= 180 && y >= -90 && y <= 90)) throw new Error(`${scale}: ${x},${y} is not on the globe`); }
      }
    }
    /* the shipped form is canonical: re-encoding what it decodes to gives the same document */
    const again = encodeNECountries(fc, { scale: doc.scale, source: doc.source });
    if (!isDeepStrictEqual(again, doc)) throw new Error(`${scale}: the file is not the canonical encoding of its own content`);
    let vs = 'not compared (no upstream at hand — pass --cache <dir>)';
    if (cache) {
      const t = await upstream(scale, cache);
      if (t) { if (!isDeepStrictEqual(fc, JSON.parse(t))) throw new Error(`${scale}: decodes to something other than the upstream file`); vs = 'deep-equal to the upstream file'; }
    }
    out.push(`${scale}: ${fc.features.length} features, ${verts.toLocaleString()} vertices — ${vs}`);
  }
  if (!existsSync(INDEX) || readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n') !== indexText()) throw new Error('data/ne-countries/index.json is not what the shipped files say — run node scripts/build-ne-countries.mjs --index');
  out.push('index.json: agrees with the shipped files');
  return out;
}

/* the shard directory's index (data/ne-countries/index.json): which scales ship, from which pinned
   commit, at what size — derived from the shipped files themselves, so --check can re-derive and
   compare it. It is the file check:datagov reads as the directory's one declaration (the same place
   data/border-detail/ keeps its own). */
const INDEX = join(ROOT, 'data', 'ne-countries', 'index.json');
function indexDoc() {
  return {
    source: { publisher: 'Natural Earth', commit: COMMIT, url: GOVERNANCE['data/ne-countries/index.json'].url },
    files: NE_SCALES.map((scale) => {
      const p = neCountriesPath(scale);
      const bytes = readFileSync(join(ROOT, p)).length;
      return { scale, path: p, bytes, features: decodeNECountries(readShipped(scale)).features.length };
    }),
  };
}
const indexText = () => JSON.stringify(indexDoc(), null, 1) + '\n';

export async function build(cache) {
  mkdirSync(join(ROOT, 'data', 'ne-countries'), { recursive: true });
  const out = [];
  for (const scale of NE_SCALES) {
    const t = await upstream(scale, cache);
    if (!t) throw new Error(`${scale}: not in --cache ${cache}`);
    const doc = encode(scale, t);
    const gz = gzipSync(Buffer.from(JSON.stringify(doc), 'utf8'), { level: 9 });
    writeFileSync(join(ROOT, neCountriesPath(scale)), gz);
    out.push(`${neCountriesPath(scale)}  ${(gzipSync(Buffer.from(t), { level: 9 }).length / 1024).toFixed(0)} kB as upstream text → ${(gz.length / 1024).toFixed(0)} kB`);
  }
  writeFileSync(INDEX, indexText());
  out.push('data/ne-countries/index.json');
  return out;
}

/* --index: write the index from the files already shipped (no network) */
export function writeIndex() { writeFileSync(INDEX, indexText()); return ['data/ne-countries/index.json']; }

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const cache = val('--cache');
  try {
    const lines = has('--check') ? await check(cache) : has('--index') ? writeIndex() : await build(cache);
    for (const l of lines) console.log('  ' + l);
    if (has('--check')) console.log('✓ data/ne-countries/ is the pinned Natural Earth admin-0, losslessly');
  } catch (e) { console.error('✗ ' + e.message); process.exit(1); }
}
