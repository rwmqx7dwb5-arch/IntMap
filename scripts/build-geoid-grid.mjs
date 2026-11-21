#!/usr/bin/env node
/* ============================================================================
 *  IntMap · EGM2008 GEOID GRID, DERIVED  — data/geoid-egm2008.bin.gz
 * ----------------------------------------------------------------------------
 *  3D building tilesets from outside Japan state heights above the WGS84 ellipsoid, while the globe's ground is
 *  the sea-level terrarium DEM. The difference is the geoid undulation N (-107..+86 m worldwide), and PLATEAU's
 *  per-city GSI figure exists only for Japan. This ships the world's N as one small grid.
 *
 *  SOURCE   EGM2008 (US NGA; public domain), the 5-arc-minute PGM that GeographicLib distributes
 *           (downloads.sourceforge.net/project/geographiclib/geoids-distrib/egm2008-5.zip, 16.8 MB).
 *  OUTPUT   every 6th sample = 0.5-degree grid, 720 columns (lng 0..359.5 E) x 361 rows (lat 90..-90), Int16LE in
 *           centimetres, gzip. js/geoid.js reads it (bilinear).
 *  WHY 0.5 DEGREE  measured 2026-11-20 against the 5' truth at 60,000 random points: mean error 0.10 m, max 3.87 m,
 *           99.4% within 1 m (1 degree: mean 0.25 m, max 7.8 m, 4% over 1 m; 15': mean 0.04 m, max 1.3 m but 2 MB).
 *           A building sits 1-2 m off the ground at worst where the geoid is steepest; the 0.5-degree file is ~0.4 MB.
 *           EXPIRES with a use that needs better than ~1 m (then use stride 3, 2 MB).
 *
 *  USAGE   node scripts/build-geoid-grid.mjs [path/to/egm2008-5.zip]    (downloads when no path is given)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_REL = 'data/geoid-egm2008.bin.gz';
const URL_ZIP = 'https://downloads.sourceforge.net/project/geographiclib/geoids-distrib/egm2008-5.zip';
export const STRIDE = 6;

/* 出自は値である（check:datagov が読む）。上流が述べていることだけを書く。EGM2008 は米国 NGA の公開データ（パブリックドメイン）。 */
export const GOVERNANCE = {
  'data/geoid-egm2008.bin.gz': {
    publisher: 'US National Geospatial-Intelligence Agency — EGM2008 (distributed in GeographicLib PGM form)',
    url: 'https://geographiclib.sourceforge.io/C++/doc/geoid.html',
    licence: 'Public domain (US government work; EGM2008)', licenceUrl: 'https://earth-info.nga.mil/', attribution: false,
    cadence: 'static',
    cadenceBasis: {
      kind: 'measured',
      observed: 'EGM2008 is a finished model published in 2008; the 5-arc-minute PGM at downloads.sourceforge.net/project/geographiclib/geoids-distrib/egm2008-5.zip was read on 2026-11-20 and its header states DateTime 2009-08-29. NGA has announced a successor (EGM2020) but not released it',
      expires: 'if NGA publishes EGM2020 (the grid would be rebuilt from it) or the distribution URL stops serving the 5-minute file',
      canon: 'this record (the only builder that reads EGM2008)',
    },
    builtBy: 'scripts/build-geoid-grid.mjs',
  },
};

/** reads the single deflated member of the GeographicLib zip and returns the PGM {W,H,offset,scale,N(row,col)} */
export function readPgm(/** @type {Buffer} */ zip) {
  const nameLen = zip.readUInt16LE(26), extraLen = zip.readUInt16LE(28), csize = zip.readUInt32LE(18);
  if (zip.readUInt32LE(0) !== 0x04034b50 || zip.readUInt16LE(8) !== 8) throw new Error('egm2008-5.zip: not a single deflated member');
  const raw = zlib.inflateRawSync(zip.subarray(30 + nameLen + extraLen, 30 + nameLen + extraLen + csize));
  let p = 0; const head = [];
  for (;;) { const e = raw.indexOf(10, p); head.push(raw.subarray(p, e).toString('latin1')); p = e + 1; if (/^65535\s*$/.test(head[head.length - 1])) break; if (head.length > 60) throw new Error('PGM header not found'); }
  const num = (/** @type {RegExp} */ re) => { const l = head.find((x) => re.test(x)); if (!l) throw new Error('PGM header lacks ' + re); return Number(l.trim().split(/\s+/).pop()); };
  const dim = head.find((l) => /^\d+\s+\d+\s*$/.test(l)); if (!dim) throw new Error('PGM dims missing');
  const [W, H] = dim.trim().split(/\s+/).map(Number), offset = num(/# Offset/), scale = num(/# Scale/);
  if (raw.length - p !== W * H * 2) throw new Error('PGM size mismatch');
  return { W, H, offset, scale, N: (/** @type {number} */ r, /** @type {number} */ c) => offset + scale * raw.readUInt16BE(p + 2 * (r * W + (((c % W) + W) % W))) };
}

export function buildGrid(/** @type {Buffer} */ zip) {
  const { W, H, N } = readPgm(zip);
  if (W !== 4320 || H !== 2161) throw new Error('unexpected EGM2008 5-minute grid ' + W + 'x' + H);
  const w = W / STRIDE, h = (H - 1) / STRIDE + 1, out = Buffer.alloc(w * h * 2);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.writeInt16LE(Math.round(N(r * STRIDE, c * STRIDE) * 100), 2 * (r * w + c));
  return { w, h, bytes: out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  let zip;
  if (arg) zip = fs.readFileSync(arg);
  else { const res = await fetch(URL_ZIP); if (!res.ok) throw new Error('egm2008-5.zip: HTTP ' + res.status + ' — nothing written'); zip = Buffer.from(await res.arrayBuffer()); }
  const { w, h, bytes } = buildGrid(zip);
  const gz = zlib.gzipSync(bytes, { level: 9 });
  fs.writeFileSync(path.join(ROOT, OUT_REL), gz);
  console.log(`wrote ${OUT_REL}: ${w}x${h}, ${bytes.length} B raw, ${gz.length} B gz`);
}
