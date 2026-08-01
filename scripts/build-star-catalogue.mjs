#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE BUNDLED BRIGHT-STAR CATALOGUE  (#R186)
 * ----------------------------------------------------------------------------
 *  「現在、ダークモードでは地球の背景は真っ黒だが、実際の時刻や位置に忠実な星空、遠くに見える太陽にして。」
 *
 *  "Faithful to the real time and position" rules out a decorative sprinkle of dots: the sky has to
 *  be drawn from a real catalogue, rotated by real sidereal time, seen from the real camera. This
 *  script turns the Yale Bright Star Catalogue into the compact binary the renderer reads.
 *
 *  SOURCE — Bright Star Catalogue, 5th Revised Edition (Hoffleit & Warren 1991), the standard
 *  all-sky list of naked-eye stars (V ≲ 6.5), served by the Harvard–Smithsonian Telescope Data
 *  Center. Every star it contains is a star a person standing outside could see, which is exactly
 *  the set a sky background wants — it is neither a thinned selection nor padded with objects no
 *  eye resolves.
 *
 *  WHAT IS KEPT, AND WHY EACH FIELD IS THERE
 *    · RA / Dec at J2000  → where the star is on the celestial sphere. The renderer precesses this
 *                           to the date; over the ~26 years since J2000 that is about 0.36°, which
 *                           is small but not invisible at a wide field, so it is not skipped.
 *    · V magnitude        → how bright to draw it. Brightness is a real photometric quantity here,
 *                           not an arbitrary size ramp.
 *    · B−V colour index   → what colour to draw it. Rigel really is blue and Betelgeuse really is
 *                           red, and B−V is the measurement that says so.
 *
 *  FORMAT — 6 bytes per star behind a 12-byte header, ~55 KB for the whole sky. Quantisation is
 *  chosen against the renderer, not against the catalogue: RA to 360/65536 = 0.0055° and Dec to
 *  90/32767 = 0.0027°, where one degree of sky is about 21 screen pixels at the camera's field of
 *  view — i.e. a tenth of a pixel. Text or JSON would be three to six times larger for no visible
 *  difference, and this file is fetched before the first frame of the night sky.
 *
 *      offset  type      meaning
 *      0       char[8]   "IMSTAR1\0"
 *      8       uint32LE  star count N
 *      12+6i   uint16LE  RA      · degrees × 65536/360
 *      14+6i   int16LE   Dec     · degrees × 32767/90
 *      16+6i   uint8     V mag   · (V + 2) × 20, clamped
 *      17+6i   int8      B−V     · (B−V) × 50, clamped
 *
 *  Output: data/stars.bin, data/stars.json (the manifest: source, count, build time, magnitudes)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT_DIR = path.join(process.cwd(), 'data');
/* ══ (#R187) DEEPER, BECAUSE THE NAKED-EYE SKY IS NOT ENOUGH SKY ═══════════════════════════════════
   「現在、ダークモードでは地球の背景は真っ黒だが…」 — reported again after #R186 shipped the Bright
   Star Catalogue. Measured on the built site: of the space canvas behind the globe, 0.16% of pixels
   carried any light at all and the mean channel value was 0.396 out of 255. Numerically black, which
   is what the report says.

   The renderer was only half the reason. The other half is the catalogue: BSC5 is the naked-eye sky
   (V ≲ 6.5, 9,096 stars over the whole sphere), and 331 of them fell inside the view. No brightness
   curve turns 331 dots into a sky — it turns them into 331 brighter dots.

   HIPPARCOS (ESA 1997, CDS I/239) is the same kind of source — an authoritative astrometric
   catalogue with measured V and B−V for every entry — and it holds 118,218 stars, thirteen times as
   many. That matters for more than density: the Milky Way is not a painted band, it is where the
   stars are, and a catalogue this deep DRAWS it because the stars really are concentrated there.
   Nothing here is synthesised; going deeper is the difference.

   BSC5 stays as the fallback, so a build that cannot reach CDS still ships the sky it shipped before
   rather than no sky at all. */
const MAG_LIMIT = Number(process.env.STAR_MAG_LIMIT || 9.5);
const SOURCES = [
  { url: 'https://cdsarc.cds.unistra.fr/ftp/I/239/hip_main.dat', parse: 'hip',
    name: 'Hipparcos Catalogue (ESA 1997, CDS I/239)' },
  { url: 'http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz', parse: 'bsc',
    name: 'Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren 1991)' },
  { url: 'https://cdsarc.cds.unistra.fr/ftp/V/50/catalog.gz', parse: 'bsc',
    name: 'Bright Star Catalogue, 5th Revised Ed. (Hoffleit & Warren 1991)' },
];
const TIMEOUT_MS = Number(process.env.STAR_TIMEOUT_MS || 300000);

const get = async (url) => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'IntMap/star-catalogue (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
};

/* The BSC5 record is fixed-width ASCII. Byte ranges are 1-indexed in the catalogue's own ReadMe;
   the slices below are the 0-indexed halves of those ranges, so they can be checked against it
   line by line. A record with a blank RA field is a catalogue entry with no position (novae and
   deleted numbers occupy some HR slots) and is dropped rather than guessed at. */
function parseBSC(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (line.length < 114) continue;
    const rah = line.slice(75, 77), ram = line.slice(77, 79), ras = line.slice(79, 83);
    if (!rah.trim() || !ram.trim() || !ras.trim()) continue;
    const sgn = line[83] === '-' ? -1 : 1;
    const ded = line.slice(84, 86), dem = line.slice(86, 88), des = line.slice(88, 90);
    const vm = parseFloat(line.slice(102, 107));
    if (!Number.isFinite(vm)) continue;
    const bv = parseFloat(line.slice(109, 114));
    const ra = (Number(rah) + Number(ram) / 60 + Number(ras) / 3600) * 15;      // hours → degrees
    const dec = sgn * (Number(ded) + Number(dem) / 60 + Number(des) / 3600);
    if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    out.push({ ra: ((ra % 360) + 360) % 360, dec: Math.max(-90, Math.min(90, dec)), v: vm, bv: Number.isFinite(bv) ? bv : 0.6 });
  }
  return out;
}

/* The Hipparcos main record is pipe-separated fixed-width ASCII. The field numbers below are the
   catalogue's own (ReadMe I/239, "Byte-by-byte Description of file: hip_main.dat"), counted as
   `line.split('|')` indices:
       5   Vmag        · Johnson V magnitude — the brightness the renderer draws with
       8   RAdeg       · right ascension, degrees, ICRS ≈ J2000 (the epoch the renderer precesses FROM)
       9   DEdeg       · declination, degrees
       37  B-V         · the measured colour index the renderer turns into a temperature and an RGB
   Records with no astrometric solution leave RAdeg/DEdeg blank; they are dropped, not guessed at,
   exactly as the BSC parser drops HR slots with no position. B−V is missing for a small number of
   entries — those keep the same 0.6 default the BSC path uses (an ordinary yellow-white star), which
   is a stated fallback rather than an invented measurement. */
function parseHIP(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (line.length < 80 || line[0] !== 'H') continue;
    const f = line.split('|');
    if (f.length < 38) continue;
    const ra = parseFloat(f[8]), dec = parseFloat(f[9]), v = parseFloat(f[5]);
    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(v)) continue;
    if (v > MAG_LIMIT) continue;
    const bv = parseFloat(f[37]);
    out.push({ ra: ((ra % 360) + 360) % 360, dec: Math.max(-90, Math.min(90, dec)), v,
               bv: Number.isFinite(bv) ? bv : 0.6 });
  }
  return out;
}

function encode(stars) {
  const buf = Buffer.alloc(12 + stars.length * 6);
  buf.write('IMSTAR1\0', 0, 'latin1');
  buf.writeUInt32LE(stars.length, 8);
  stars.forEach((s, i) => {
    const o = 12 + i * 6;
    buf.writeUInt16LE(Math.min(65535, Math.round(s.ra * 65536 / 360)) & 0xffff, o);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s.dec * 32767 / 90))), o + 2);
    buf.writeUInt8(Math.max(0, Math.min(255, Math.round((s.v + 2) * 20))), o + 4);
    buf.writeInt8(Math.max(-128, Math.min(127, Math.round(s.bv * 50))), o + 5);
  });
  return buf;
}

const main = async () => {
  let raw = null, used = null, err = [];
  for (const src of SOURCES) {
    try { raw = await get(src.url); used = src; break; }
    catch (e) { err.push(src.url + ': ' + (e && e.message || e)); }
  }
  if (!raw) { console.error('[stars] every source failed:\n  ' + err.join('\n  ')); process.exit(1); }
  if (raw[0] === 0x1f && raw[1] === 0x8b) raw = zlib.gunzipSync(raw);
  const stars = (used.parse === 'hip' ? parseHIP : parseBSC)(raw.toString('latin1'));
  if (stars.length < 5000) { console.error('[stars] only ' + stars.length + ' parsed — refusing to ship a partial sky'); process.exit(1); }
  /* Brightest first, so a renderer that ever wants to draw only the top N gets the top N without
     sorting 9,000 entries on the main thread. */
  stars.sort((a, b) => a.v - b.v);
  const bin = encode(stars);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'stars.bin'), bin);
  const manifest = {
    format: 'IMSTAR1', count: stars.length, bytes: bin.length,
    source: used.name,
    url: used.url, built: new Date().toISOString(),
    magnitude: { min: +stars[0].v.toFixed(2), max: +stars[stars.length - 1].v.toFixed(2) },
    epoch: 'J2000.0', fields: ['ra_deg', 'dec_deg', 'vmag', 'b_v'],
  };
  fs.writeFileSync(path.join(OUT_DIR, 'stars.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('[stars] ' + stars.length + ' stars, ' + bin.length + ' bytes, V ' + manifest.magnitude.min + '…' + manifest.magnitude.max + ' from ' + used.url);
};

main().catch((e) => { console.error('[stars] ' + (e && e.stack || e)); process.exit(1); });
