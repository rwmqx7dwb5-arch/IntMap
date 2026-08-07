#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE OTHER WORLDS  (#R197)
 * ----------------------------------------------------------------------------
 *  「そこから各惑星を見れたり、（地球と同じ形式で。地名のラベル付き。）」
 *
 *  Two things are needed to show a planet the way this app shows the Earth: a picture of its surface,
 *  and the names of the things on it. Both ship with the app, because the space explorer must work
 *  the same way on the fiftieth visit as on the first and because neither changes.
 *
 *  ── THE SURFACES ────────────────────────────────────────────────────────────────────────────────
 *  data/planets/<body>.jpg — 2048 × 1024 equirectangular, −180…180 by 90…−90.
 *
 *  Source: Solar System Scope's texture set (CC BY 4.0), which is assembled from NASA/JPL/USGS
 *  imagery — MESSENGER for Mercury, Magellan radar for the surface of Venus, LRO for the Moon,
 *  Viking/MOLA for Mars, Cassini and Voyager for the giants. They are downloaded and shipped
 *  BYTE-FOR-BYTE: this script does not re-encode them, so what the app draws is what the source
 *  published. Attribution is carried in js/reference-data.js, as every other source in this app is.
 *
 *  ⚠ WHY NOT NASA TREK DIRECTLY. Trek serves the real mosaics as WMTS tiles and they are better data
 *  — but a global 2048 × 1024 texture from Trek is 32 tiles that have to be DECODED, stitched and
 *  RE-ENCODED, and this repository has no image library (see the JPEG problem in the header of
 *  scripts/build-bathymetry.mjs's PNG writer: encoding PNG is 40 lines, encoding JPEG is not). A
 *  stitched PNG of a photograph is 3–5 MB a body against 200–1000 KB of JPEG. If an image dependency
 *  is ever added, Trek is the upgrade and this is the place to make it.
 *
 *  ── THE NAMES ───────────────────────────────────────────────────────────────────────────────────
 *  data/planet-names.json — the IAU-approved names, from the USGS Gazetteer of Planetary
 *  Nomenclature (public domain, and the only authority there is for these names). Per feature: the
 *  clean name, centre latitude/longitude, diameter in km and the feature type.
 *
 *  ⚠ THE GAZETTEER HAS NO MACHINE FORMAT. `displayType=csv` returns the ordinary HTML page, so this
 *  parses the results table by its column CLASSES (`cleanFeatureNameColumn`, `centerLatLonColumn`,
 *  `diameterColumn`, `featureTypeColumn`) — which is brittle, on purpose, AT BUILD TIME: if the page
 *  changes this script fails loudly here rather than the app quietly showing fewer names. The output
 *  is committed, so a broken build never reaches anybody.
 *
 *  Only the largest features are kept (see KEEP): a label smaller than a pixel is not a label, and
 *  the Moon alone has over nine thousand named features.
 *
 *    node scripts/build-planet-data.mjs [--skip-textures] [--skip-names]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'planets');
const UA = { 'User-Agent': 'IntMap/build-planet-data (+https://github.com/rwmqx7dwb5-arch/IntMap)' };
const KEEP = 700;                      /* largest features per body */

/* body → the texture file name at the source */
const TEX = {
  sun: '2k_sun', mercury: '2k_mercury', venus: '2k_venus_surface', earth: '2k_earth_daymap',
  moon: '2k_moon', mars: '2k_mars', jupiter: '2k_jupiter', saturn: '2k_saturn',
  uranus: '2k_uranus', neptune: '2k_neptune'
};
/* body → the gazetteer target id. ⚠ THE NUMERIC PREFIX IS PART OF THE QUERY and is not the NAIF id or
   anything else guessable — it is the gazetteer's own row number, read off the <option> list on
   /AdvancedSearch. Guessing them cost a build: `1_Mercury` returns a page with no rows in it and no
   error, which is why parseGazetteer refuses an empty result rather than writing an empty file. */
const GAZ = {
  mercury: ['14_Mercury'], venus: ['15_Venus'], moon: ['16_Moon'], mars: ['20_Mars'], pluto: ['149_Pluto']
};

const arg = (k) => process.argv.includes('--' + k);

async function get(url, asText) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 180000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: UA });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return asText ? await r.text() : Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

/* the SOF marker carries the true dimensions — verify rather than trust the file name */
function jpegSize(b) {
  if (!(b[0] === 0xff && b[1] === 0xd8)) throw new Error('not a JPEG');
  for (let i = 2; i < b.length - 9;) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error('no SOF marker');
}

async function textures() {
  fs.mkdirSync(OUT, { recursive: true });
  const man = {};
  for (const [id, file] of Object.entries(TEX)) {
    const url = 'https://www.solarsystemscope.com/textures/download/' + file + '.jpg';
    const buf = await get(url);
    const { w, h } = jpegSize(buf);
    if (w !== 2048 || h !== 1024) throw new Error(id + ': expected 2048×1024, got ' + w + '×' + h);
    fs.writeFileSync(path.join(OUT, id + '.jpg'), buf);
    man[id] = { file: 'data/planets/' + id + '.jpg', width: w, height: h, bytes: buf.length, source: url };
    process.stdout.write('  ' + id.padEnd(9) + (buf.length / 1024).toFixed(0).padStart(5) + ' KB  ' + w + '×' + h + '\n');
  }
  return man;
}

/* ── the gazetteer table ───────────────────────────────────────────────────────────────────────
   ⚠ TAG-STRIPPING BY REGEX IS NOT SANITISATION, AND CODEQL SAID SO. Two real objections to the first
   version, both worth fixing even though this runs at BUILD time over one known page and its output
   is a JSON file of place names that the app draws with canvas fillText:
     · one `replace(/<[^>]*>/g,'')` pass can MANUFACTURE a tag — `<<b>script>` becomes `<script>` —
       so the strip repeats until the string stops changing;
     · unescaping `&amp;` first and `&lt;` after can double-unescape, turning `&amp;lt;` into `<`.
       Entities are decoded in ONE pass by a single alternation instead, so nothing a decode produces
       is fed back into another decode.
   What ships is then verified rather than trusted: parseGazetteer rejects any name that still holds
   a metacharacter, so a page change cannot put markup into data/planet-names.json. */
const ENT = { '&amp;': '&', '&#39;': "'", '&apos;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
function strip(s) {
  let prev;
  do { prev = s; s = s.replace(/<[^>]*>/g, ''); } while (s !== prev);
  return s.replace(/&(?:amp|#39|apos|quot|lt|gt|nbsp);/g, (m) => ENT[m]).replace(/\s+/g, ' ').trim();
}

function parseGazetteer(html, target) {
  const cell = (row, cls) => {
    const out = [];
    const re = new RegExp('<td[^>]*class="[^"]*' + cls + '[^"]*"[^>]*>([\\s\\S]*?)</td>', 'g');
    let m; while ((m = re.exec(row))) out.push(strip(m[1]));
    return out;
  };
  const rows = html.split(/<tr\b/).slice(1);
  const feats = [];
  for (const row of rows) {
    if (row.indexOf('cleanFeatureNameColumn') < 0) continue;
    const name = cell(row, 'cleanFeatureNameColumn')[0];
    const tgt = cell(row, 'targetColumn')[0];
    if (!name || (tgt && tgt.toLowerCase() !== target.toLowerCase())) continue;
    /* ⚠ AND THE RESULT IS CHECKED, NOT ASSUMED. An IAU feature name is letters, digits, spaces and a
       few punctuation marks (an apostrophe is legitimate — O'Neill is a real lunar crater), so what is
       rejected is MARKUP: anything with < > & or a double quote left in it is a parse that went wrong, and
       it must not reach data/planet-names.json. Failing loudly at build time is the whole point of
       doing this here rather than in the browser. */
    if (/[<>&"]/.test(name)) throw new Error('gazetteer name still contains markup: ' + JSON.stringify(name));
    const ll = cell(row, 'centerLatLonColumn');
    const lat = parseFloat(ll[0]), lon = parseFloat(ll[1]);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const d = parseFloat(cell(row, 'diameterColumn')[0]);
    const type = cell(row, 'featureTypeColumn')[0] || '';
    feats.push({ n: name, lat: +lat.toFixed(3), lon: +(((lon + 180) % 360 + 360) % 360 - 180).toFixed(3),
      d: isFinite(d) ? +d.toFixed(1) : 0, t: type.split(',')[0] });
  }
  return feats;
}

async function names() {
  const out = {};
  for (const [id, ids] of Object.entries(GAZ)) {
    let best = [];
    for (const gid of ids) {
      let html;
      try { html = await get('https://planetarynames.wr.usgs.gov/SearchResults?Target=' + gid, true); }
      catch (e) { continue; }
      const f = parseGazetteer(html, id === 'moon' ? 'Moon' : id[0].toUpperCase() + id.slice(1));
      if (f.length > best.length) best = f;
      if (best.length > 20) break;
    }
    if (!best.length) throw new Error('no named features parsed for ' + id + ' — the gazetteer page changed');
    best.sort((a, b) => b.d - a.d);
    out[id] = best.slice(0, KEEP);
    process.stdout.write('  ' + id.padEnd(9) + String(best.length).padStart(6) + ' named features, keeping '
      + out[id].length + ' (largest: ' + out[id][0].n + ', ' + out[id][0].d + ' km)\n');
  }
  return out;
}

const manifest = { built: new Date().toISOString(), textures: null, names: null };
if (!arg('skip-textures')) { process.stdout.write('textures (Solar System Scope, CC BY 4.0):\n'); manifest.textures = await textures(); }
if (!arg('skip-names')) {
  process.stdout.write('names (USGS Gazetteer of Planetary Nomenclature, public domain):\n');
  const n = await names();
  fs.writeFileSync(path.join(ROOT, 'data', 'planet-names.json'), JSON.stringify(n));
  manifest.names = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v.length]));
}
const mp = path.join(ROOT, 'data', 'planets.json');
const prev = fs.existsSync(mp) ? JSON.parse(fs.readFileSync(mp, 'utf8')) : {};
fs.writeFileSync(mp, JSON.stringify({
  built: manifest.built,
  textures: manifest.textures || prev.textures || null,
  names: manifest.names || prev.names || null,
  textureSource: 'Solar System Scope planetary textures (CC BY 4.0), assembled from NASA/JPL/USGS imagery',
  nameSource: 'USGS Gazetteer of Planetary Nomenclature (IAU-approved names, public domain)',
  keptPerBody: KEEP
}, null, 2) + '\n');
process.stdout.write('wrote data/planets.json\n');
