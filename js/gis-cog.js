/* ============================================================================
 *  IntMap · A GRID AT A URL — window.IntMapGisCog   (js/gis-cog.js)
 * ----------------------------------------------------------------------------
 *  js/gis-geotiff.js has read a Cloud Optimized GeoTIFF over HTTP range requests since #R752
 *  (`readUrl`, `levelFor`, `readRegion`), and until this file NOTHING CALLED IT: the only road from
 *  a GeoTIFF to a dataset was a file the reader had already put on their own disk
 *  (js/geo-import.js reads bytes). So a population grid, a DEM or a land-cover map that a
 *  government publishes as a COG could be analysed only after somebody downloaded all of it.
 *
 *  ⚠ THIS FILE DOES ONE THING: given a URL and a WINDOW AT A RESOLUTION THE CALLER STATES, read only
 *  the tiles that window needs, from the coarsest overview that is still fine enough, and hand back
 *  the raster contract (docs/GIS-CORE.md §1.4) plus a `coverage` that says what was and was not
 *  answered. It registers nothing and draws nothing — js/gis-atlas.js registers the result as a
 *  dataset (so every op, export and draw works on it) and `map.drawDataset` draws it.
 *
 *  ⚠ THE WINDOW AND THE RESOLUTION ARE THE CALLER'S, NOT THIS FILE'S (the same rule as
 *  js/gis-layers.js toRaster): a grid sized here would be a measurement nobody asked for.
 *  ⚠ THE RESAMPLING IS STATED, NOT HIDDEN: `nearest`, because it creates no value the file did not
 *  hold (it survives a land-cover class map), and the answer carries the level used and whether the
 *  file had pixels as fine as the ask (`resolution.meets`).
 *  ⚠ ONLY A FILE THAT STATES EPSG:4326 IS READ (non-4326 → `cog-crs-not-4326`, with the code the
 *  file stated). 消せる条件: a window of a projected COG needs the bbox carried into the file's CRS
 *  and the region reprojected (js/gis-warp.js to4326 already does the second half); until that is
 *  written the refusal NAMES the CRS so the reader knows what to convert, rather than reading metres
 *  as degrees.
 *  ⚠ A GRID THAT HAS NO STATED CRS IS REFUSED (`crs-not-stated`): where it is has not been said.
 *  ⚠ https ONLY — the page's CSP connect-src allows nothing else, and a URL with a user name in it
 *  is a credential written into a string that will be logged.
 * ==========================================================================*/

export function makeGisCog(deps) {
  const D = deps || {};
  const bad = (why, detail) => (detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail });
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  /* the only judgement this file makes about a URL; the host's CORS and range support are asked of
     the host, by the reader, and come back as codes (fetch-failed / http-status / range-unsupported) */
  function checkUrl(url) {
    let u;
    try { u = new URL(String(url)); } catch (_) { return bad('url-invalid', { url: String(url).slice(0, 200) }); }
    if (u.protocol !== 'https:') return bad('url-not-https', { protocol: u.protocol });
    if (u.username || u.password) return bad('url-has-credentials', { host: u.host });
    return { ok: true, url: u.href };
  }

  async function geotiff() {
    if (D.geotiff) return D.geotiff;
    return (await import('./gis-geotiff.js')).makeGisGeotiff();
  }
  /* the owners hand these over (js/gis-core.js builds them); this file reads no global of its own */
  const warp = () => D.warp || null;
  const crsMod = () => D.crs || null;

  /* readWindow(url, {bounds:[w,s,e,n], width, height, band?:{index?}, signal?, fetch?})
       → { ok:true, raster, band, source, coverage } | { ok:false, why, detail } */
  async function readWindow(url, o) {
    const q = o || {};
    const u = checkUrl(url);
    if (!u.ok) return u;
    const b = q.bounds;
    if (!Array.isArray(b) || b.length < 4 || !b.slice(0, 4).every(isNum) || !(b[2] > b[0]) || !(b[3] > b[1])) return bad('bad-param', { param: 'bounds', value: b == null ? null : b });
    if (!Number.isInteger(q.width) || q.width <= 0) return bad('bad-param', { param: 'width', value: q.width == null ? null : q.width });
    if (!Number.isInteger(q.height) || q.height <= 0) return bad('bad-param', { param: 'height', value: q.height == null ? null : q.height });
    const W = warp(), C = crsMod();
    if (!W || typeof W.resample !== 'function' || !C || typeof C.isWgs84 !== 'function') return bad('raster-unavailable', { needs: 'IntMapGisWarp + IntMapGisCrs' });

    const T = await geotiff();
    const ro = {};
    if (q.signal) ro.signal = q.signal;
    if (typeof q.fetch === 'function') ro.fetch = q.fetch;
    const opened = await T.readUrl(u.url, ro);
    if (!opened.ok) return opened;
    const g = opened.grid;

    if (g.crs == null || String(g.crs).trim() === '') return bad('crs-not-stated', { url: u.url });
    if (!C.isWgs84(g.crs)) return bad('cog-crs-not-4326', { crs: String(g.crs), url: u.url });

    const pixelLng = (b[2] - b[0]) / q.width, pixelLat = (b[3] - b[1]) / q.height;
    const pick = g.levelFor({ dx: pixelLng, dy: pixelLat });
    if (!pick.ok) return pick;
    const lv = await g.levelAt(pick.level);
    if (!lv.ok) return lv;
    const bandIndex = (q.band && Number.isInteger(q.band.index)) ? q.band.index : 0;
    const part = await lv.grid.readRegion({ bbox: [b[0], b[1], b[2], b[3]], band: bandIndex, signal: q.signal });
    if (!part.ok) return part;
    const r = part.region;
    const meta = (lv.grid.bands && lv.grid.bands[bandIndex]) || {};

    /* the region is a north-up piece of the file in 4326; the caller's lattice is the target */
    const src = {
      crs: 'EPSG:4326', width: r.width, height: r.height,
      affine: { x0: r.affine.x0, y0: r.affine.y0, dx: r.affine.dx, dy: r.affine.dy, rotated: false },
      bands: [{ name: meta.name != null ? meta.name : null, unit: meta.unit != null ? meta.unit : null, nodata: meta.nodata != null ? meta.nodata : null }],
      read: () => r.values,
    };
    const out = await W.resample(src, { west: b[0], north: b[3], pixelLng: pixelLng, pixelLat: pixelLat, width: q.width, height: q.height }, { method: 'nearest' });
    if (!out.ok) return out;

    const full = g.affine;
    const fileBox = [full.x0, full.y0 - full.dy * g.height, full.x0 + full.dx * g.width, full.y0];
    const served = [Math.max(b[0], fileBox[0]), Math.max(b[1], fileBox[1]), Math.min(b[2], fileBox[2]), Math.min(b[3], fileBox[3])];
    const inside = served[0] === b[0] && served[1] === b[1] && served[2] === b[2] && served[3] === b[3];
    const reasons = [];
    if (!inside) reasons.push('window-extends-past-the-file');
    if (!pick.meets) reasons.push('file-coarser-than-asked');
    const coverage = {
      completeness: reasons.length ? 'partial' : 'all',
      reason: reasons.length ? reasons.join(',') : 'window-fully-inside-the-file-at-the-resolution-asked',
      requested: [b[0], b[1], b[2], b[3]], served: served,
      count: out.report ? out.report.filled : null,
      asOf: null,
      resolution: { pixelLng: pixelLng, pixelLat: pixelLat, width: q.width, height: q.height, nativeDx: pick.dx, nativeDy: pick.dy, level: pick.level, isOverview: pick.isOverview, meets: pick.meets },
    };
    return {
      ok: true, raster: out.grid, band: meta, coverage: coverage,
      source: { url: u.url, level: pick.level, requests: g.source && typeof g.source.requests === 'function' ? g.source.requests() : null, fileWidth: g.width, fileHeight: g.height, fileBounds: fileBox, crs: String(g.crs) },
    };
  }

  return { readWindow, checkUrl };
}
