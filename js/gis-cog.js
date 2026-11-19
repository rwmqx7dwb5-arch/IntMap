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
 *  ⚠ A FILE IN ANOTHER CRS (UTM, Web Mercator …) IS READ TOO: the window is carried into the file's CRS,
 *  the file is read there, and js/gis-warp.js to4326 brings the piece back — the one transform rule.
 *  A projection that does not answer is refused by name (`crs-unavailable` / `crs-transform-failed`).
 *  ⚠ A window that crosses the antimeridian is not handled (its perimeter would wrap); 消せる条件:
 *  splitting the window at ±180 and reading both halves.
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
    /* ⚠ s3://bucket/key IS HOW A STAC ASSET NAMES A FILE ON AN OBJECT STORE (Earth Search's Copernicus DEM
       has no other address). The scheme is AWS's own, and the https address of the same object is a
       DERIVATION of it, not a guess: virtual-hosted style, or path style when the bucket name has a dot
       (the wildcard certificate does not cover it). It is reported as `derivedFrom` so nobody reads it as
       the address the catalogue gave. A requester-pays or private bucket still answers 403 and says so. */
    let derivedFrom = null;
    const m3 = /^s3:\/\/([^/]+)\/(.+)$/i.exec(String(url).trim());
    if (m3) {
      derivedFrom = String(url).trim();
      const bucket = m3[1], key = m3[2];
      url = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ? 'https://' + bucket + '.s3.amazonaws.com/' + key : 'https://s3.amazonaws.com/' + bucket + '/' + key;
    }
    try { u = new URL(String(url)); } catch (_) { return bad('url-invalid', { url: String(url).slice(0, 200) }); }
    if (u.protocol !== 'https:') return bad('url-not-https', { protocol: u.protocol });
    if (u.username || u.password) return bad('url-has-credentials', { host: u.host });
    return derivedFrom ? { ok: true, url: u.href, derivedFrom: derivedFrom } : { ok: true, url: u.href };
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
    const wgs = C.isWgs84(g.crs);
    const pixelLng = (b[2] - b[0]) / q.width, pixelLat = (b[3] - b[1]) / q.height;

    /* ⚠ A PROJECTED FILE: the window is carried INTO the file's CRS, the file is read there, and the
       piece comes back to degrees through js/gis-warp.js to4326 — the one transform rule, not a second
       one here. Two things are derived from the projection itself rather than from a constant: the
       window's box in the file's CRS (its perimeter is WALKED, because a projected edge bows, so four
       corners under-state it) and the size of the asked-for pixel in the file's units (so the right
       overview is chosen). Both fail by name when the projection does not answer. */
    let readBox = [b[0], b[1], b[2], b[3]], wantDx = pixelLng, wantDy = pixelLat, wantBox = null;
    if (!wgs) {
      if (typeof C.ready !== 'function' || typeof C.fromWgs84 !== 'function') return bad('crs-unavailable', { crs: String(g.crs) });
      if (!(await C.ready())) return bad('crs-unavailable', { crs: String(g.crs) });
      const fwd = (lng, lat) => {
        const xy = C.fromWgs84(lng, lat, g.crs);
        return (xy && isNum(xy[0]) && isNum(xy[1])) ? xy : null;
      };
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const STEPS = 32;
      for (let k = 0; k <= STEPS; k++) {
        const t = k / STEPS;
        for (const [lng, lat] of [[b[0] + t * (b[2] - b[0]), b[1]], [b[0] + t * (b[2] - b[0]), b[3]], [b[0], b[1] + t * (b[3] - b[1])], [b[2], b[1] + t * (b[3] - b[1])]]) {
          const xy = fwd(lng, lat);
          if (!xy) return bad(typeof C.why === 'function' && C.why() ? C.why() : 'crs-transform-failed', { crs: String(g.crs), at: [lng, lat] });
          if (xy[0] < x0) x0 = xy[0]; if (xy[0] > x1) x1 = xy[0];
          if (xy[1] < y0) y0 = xy[1]; if (xy[1] > y1) y1 = xy[1];
        }
      }
      const cLng = (b[0] + b[2]) / 2, cLat = (b[1] + b[3]) / 2;
      const c0 = fwd(cLng, cLat), cE = fwd(cLng + pixelLng, cLat), cN = fwd(cLng, cLat + pixelLat);
      if (!c0 || !cE || !cN) return bad('crs-transform-failed', { crs: String(g.crs) });
      wantDx = Math.hypot(cE[0] - c0[0], cE[1] - c0[1]);
      wantDy = Math.hypot(cN[0] - c0[0], cN[1] - c0[1]);
      if (!(wantDx > 0) || !(wantDy > 0)) return bad('pixel-size-underivable', { crs: String(g.crs) });
      wantBox = [x0, y0, x1, y1];
      /* one file pixel of margin, so the pixels the warp reads at the window's edge exist */
      readBox = [x0 - g.affine.dx, y0 - g.affine.dy, x1 + g.affine.dx, y1 + g.affine.dy];
    }

    const pick = g.levelFor({ dx: wantDx, dy: wantDy });
    if (!pick.ok) return pick;
    const lv = await g.levelAt(pick.level);
    if (!lv.ok) return lv;
    const bandIndex = (q.band && Number.isInteger(q.band.index)) ? q.band.index : 0;
    const part = await lv.grid.readRegion({ bbox: readBox, band: bandIndex, signal: q.signal });
    if (!part.ok) return part;
    const r = part.region;
    const meta = (lv.grid.bands && lv.grid.bands[bandIndex]) || {};

    /* the region is a north-up piece of the file; the caller's lattice is the target */
    let src = {
      crs: wgs ? 'EPSG:4326' : String(g.crs), width: r.width, height: r.height,
      affine: { x0: r.affine.x0, y0: r.affine.y0, dx: r.affine.dx, dy: r.affine.dy, rotated: false },
      bands: [{ name: meta.name != null ? meta.name : null, unit: meta.unit != null ? meta.unit : null, nodata: meta.nodata != null ? meta.nodata : null }],
      read: () => r.values,
    };
    let regionDeg = null;
    if (!wgs) {
      const deg = await W.to4326(src, { method: 'nearest' });
      if (!deg.ok) return deg;
      regionDeg = [deg.grid.grid.west, deg.grid.grid.north - deg.grid.grid.pixelLat * deg.grid.height, deg.grid.grid.west + deg.grid.grid.pixelLng * deg.grid.width, deg.grid.grid.north];
      src = Object.assign({}, deg.grid, { crs: 'EPSG:4326' });
    }
    const out = await W.resample(src, { west: b[0], north: b[3], pixelLng: pixelLng, pixelLat: pixelLat, width: q.width, height: q.height }, { method: 'nearest' });
    if (!out.ok) return out;

    const full = g.affine;
    const fileBox = [full.x0, full.y0 - full.dy * g.height, full.x0 + full.dx * g.width, full.y0];
    let served, inside;
    if (wgs) {
      served = [Math.max(b[0], fileBox[0]), Math.max(b[1], fileBox[1]), Math.min(b[2], fileBox[2]), Math.min(b[3], fileBox[3])];
      inside = served[0] === b[0] && served[1] === b[1] && served[2] === b[2] && served[3] === b[3];
    } else {
      /* inside = the window's own box in the file's CRS lies within the file; what was served is then
         the whole window, and otherwise the part of it the piece that WAS read covers */
      inside = wantBox[0] >= fileBox[0] && wantBox[1] >= fileBox[1] && wantBox[2] <= fileBox[2] && wantBox[3] <= fileBox[3];
      served = inside ? [b[0], b[1], b[2], b[3]] : [Math.max(b[0], regionDeg[0]), Math.max(b[1], regionDeg[1]), Math.min(b[2], regionDeg[2]), Math.min(b[3], regionDeg[3])];
    }
    const reasons = [];
    if (!inside) reasons.push('window-extends-past-the-file');
    if (!pick.meets) reasons.push('file-coarser-than-asked');
    const coverage = {
      completeness: reasons.length ? 'partial' : 'all',
      reason: reasons.length ? reasons.join(',') : 'window-fully-inside-the-file-at-the-resolution-asked',
      requested: [b[0], b[1], b[2], b[3]], served: served,
      count: out.report ? out.report.filled : null,
      asOf: null,
      resolution: { pixelLng: pixelLng, pixelLat: pixelLat, width: q.width, height: q.height, nativeDx: pick.dx, nativeDy: pick.dy, nativeUnit: wgs ? 'degree' : 'crs-unit', level: pick.level, isOverview: pick.isOverview, meets: pick.meets },
    };
    return {
      ok: true, raster: out.grid, band: meta, coverage: coverage,
      source: { url: u.url, derivedFrom: u.derivedFrom || null, level: pick.level, requests: g.source && typeof g.source.requests === 'function' ? g.source.requests() : null, fileWidth: g.width, fileHeight: g.height, fileBounds: fileBox, fileBoundsCrs: String(g.crs), crs: String(g.crs) },
    };
  }

  return { readWindow, checkUrl };
}
