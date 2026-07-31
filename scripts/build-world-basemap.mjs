#!/usr/bin/env node
/* ============================================================================
 *  IntMap · BUILD THE COARSE WHOLE-EARTH SATELLITE BASE  (#R186)
 * ----------------------------------------------------------------------------
 *  「地球規模でも毎回衛星画像を再読み込みしている。大雑把な地球単位の衛星画像は、何もないタイルが
 *    発生しないように、デフォルトで読み込み待ちすることなく表示できるように。高画質でなくてよい。」
 *
 *  Two problems, one cause. The satellite view is a tile pyramid from a remote host, so at world
 *  zoom it has to fetch a fresh set of tiles every time the app opens — and until they arrive the
 *  globe has holes in it. And Cesium draws the Earth as a real ellipsoid to ±90° while Web Mercator
 *  tiles stop at ±85.05°, so the two polar caps have no imagery from that source AT ALL and render
 *  as the globe's bare base colour, which is what 「南極・北極付近が…真っ黒」 is.
 *
 *  One image answers both: a whole-Earth equirectangular picture, shipped with the app, covering
 *  −180…180 by −90…90. It is served from our own origin (so it is in cache after the first visit
 *  and needs no round trip to a tile host), it is one request rather than hundreds, and it has real
 *  pixels at the poles. It sits UNDER the real tiles, so it is what the eye sees only where the
 *  sharp imagery has not arrived or does not exist — the request's own 「高画質でなくてよい」.
 *
 *  SOURCE — NASA Blue Marble: Shaded Relief and Bathymetry, from NASA EOSDIS GIBS. Real satellite
 *  imagery (MODIS composite) with real bathymetry, in the public domain, and already one of this
 *  app's attributed sources. 2048 × 1024 is deliberate: that is one Mercator tile row of 4 at z2,
 *  it JPEG-compresses to ~280 KB, and it is the size where "load it before the map needs it" is
 *  still true on a phone.
 *
 *  Output: data/world-basemap.jpg, data/world-basemap.json (the manifest: layer, size, build time)
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), 'data');
const WIDTH = Number(process.env.WORLD_BASE_W || 2048);
const HEIGHT = WIDTH / 2;
const LAYER = process.env.WORLD_BASE_LAYER || 'BlueMarble_ShadedRelief_Bathymetry';
const URL_ = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi'
  + '?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&CRS=EPSG:4326'
  + '&LAYERS=' + encodeURIComponent(LAYER)
  + '&BBOX=-90,-180,90,180&WIDTH=' + WIDTH + '&HEIGHT=' + HEIGHT + '&FORMAT=image/jpeg';
const TIMEOUT_MS = Number(process.env.WORLD_BASE_TIMEOUT_MS || 120000);

const main = async () => {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  let buf;
  try {
    const r = await fetch(URL_, { signal: ac.signal, headers: { 'User-Agent': 'IntMap/world-basemap (+https://github.com/rwmqx7dwb5-arch/IntMap)' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const ct = r.headers.get('content-type') || '';
    if (!/^image\/jpeg/.test(ct)) throw new Error('unexpected content-type ' + ct);   /* a WMS error is XML with HTTP 200 */
    buf = Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
  /* JPEG SOI + the SOF marker carry the true dimensions — verify them rather than trusting that the
     server honoured WIDTH/HEIGHT, because a silently reprojected image would misregister the globe. */
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) throw new Error('not a JPEG');
  let w = 0, h = 0;
  for (let i = 2; i < buf.length - 9;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7); break; }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  if (w !== WIDTH || h !== HEIGHT) throw new Error('server returned ' + w + '×' + h + ', expected ' + WIDTH + '×' + HEIGHT);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'world-basemap.jpg'), buf);
  fs.writeFileSync(path.join(OUT_DIR, 'world-basemap.json'), JSON.stringify({
    layer: LAYER, width: w, height: h, bytes: buf.length,
    projection: 'EPSG:4326 equirectangular', bbox: [-180, -90, 180, 90],
    source: 'NASA EOSDIS GIBS — Blue Marble: Shaded Relief and Bathymetry',
    url: URL_, built: new Date().toISOString(),
  }, null, 2) + '\n');
  console.log('[world-basemap] ' + w + '×' + h + ', ' + buf.length + ' bytes, layer ' + LAYER);
};

main().catch((e) => { console.error('[world-basemap] ' + (e && e.stack || e)); process.exit(1); });
