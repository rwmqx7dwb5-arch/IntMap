/* ============================================================================
 *  IntMap · POPULATION AS A GRID OF VALUES — WorldPop 1 km, 2000–2020
 * ----------------------------------------------------------------------------
 *  ⚠⚠ THE APP HAD A PICTURE OF POPULATION AND NO NUMBERS. The 「人口密度（グリッド）」 layer is
 *  NASA GIBS imagery of GPW (colours, no values), so nothing that analyses — zonal statistics,
 *  `profile`, `reach` — could read a population out of it, while Atlas's own guide promised
 *  「施設から5km圏を作り、統合し、その範囲の人口を集計」 (measured 2026-11-16: `layer:` held no
 *  population grid at all). This module is the values: WorldPop's own ArcGIS image service, which
 *  answers any window as a Float32 GeoTIFF.
 *
 *  SOURCE  WorldPop — Unconstrained global mosaics 2000–2020, 1 km (30″), UN-adjusted counts.
 *          DOI 10.5258/SOTON/WP00647 · CC BY 4.0 (stated on hub.worldpop.org) · served by
 *          worldpop.arcgis.com (WorldPop's ArcGIS organisation; CORS answered for the production
 *          origin, measured 2026-11-16).
 *
 *  ⚠ WHAT A CELL MEANS, AND WHY THE ANSWER IS A DENSITY. A WorldPop cell is PEOPLE IN THAT 30″
 *  CELL. A window the caller sizes has its own pixels, so handing back the count of the native cell
 *  under each pixel centre would make a coarser grid sum to the wrong population (every pixel would
 *  count one native cell, not the several it covers). Dividing by the native cell's ground area
 *  turns it into people/km², which IS readable at any pixel size — and js/gis-ops.js zonal's
 *  `areaIntegral` (Σ value·km²) is then exactly 「その範囲の人口」. The band says so in its quantity
 *  (`density`), so `sum` is refused with the remedy and nobody adds densities by accident.
 *  The cell area is js/gis-raster.js pixelAreaKm2 — the same closed form zonal integrates with — and
 *  the cell size is the service's own `pixelSizeY`, never a number written here.
 *
 *  ⚠ NOTHING ABOUT THE SERVICE IS WRITTEN DOWN EXCEPT ITS ADDRESS. The years it covers, its cell
 *  size and the largest image it will draw are read from its own description (`?f=json`) the first
 *  time a window is asked for, so the day WorldPop adds a year the grid has it.
 *
 *  ⚠ NO REQUEST AT LOAD. The module is imported by the registry row's window door
 *  (js/map-ui.js `population`) when somebody acquires — the boot path never sees it.
 * ==========================================================================*/

import { readWithin } from './fetch-deadline.js';   /* every network read in IntMap is under a host clock */
import { clockFor } from './proxy-fetch.js';

const SERVICE = 'https://worldpop.arcgis.com/arcgis/rest/services/WorldPop_Total_Population_1km/ImageServer';
/* the credit is the registry row's (js/map-ui.js `population` rights), not a second copy here */

/* the year a request names: a bare year is that year; a date names its year; anything else is unread */
function yearOf(time) {
  if (time == null || time === '') return null;
  const m = /^\s*(-?\d{1,4})(?:\b|-)/.exec(String(time));
  return m ? Number(m[1]) : NaN;
}

/* {first, last, cell, maxW, maxH} from the service's own description */
function describeService(j) {
  if (!j || typeof j !== 'object') return null;
  const t = j.timeInfo && Array.isArray(j.timeInfo.timeExtent) ? j.timeInfo.timeExtent : null;
  const first = t ? new Date(t[0]).getUTCFullYear() : null, last = t ? new Date(t[1]).getUTCFullYear() : null;
  const cell = Number(j.pixelSizeY);
  if (!(first <= last) || !(cell > 0)) return null;
  return { first, last, cell, cellX: Number(j.pixelSizeX) || cell, maxW: Number(j.maxImageWidth) || null, maxH: Number(j.maxImageHeight) || null };
}

export function makePopulationGrid(deps) {
  /* the GIS kernel's own doors, asked at call time (js/gis-core.js mounts them before any acquisition) */
  const D = Object.assign({
    raster: () => { try { return window.IntMapGisRaster || null; } catch (_) { return null; } },
    geotiff: async () => (await import('./gis-geotiff.js')).makeGisGeotiff(),
  }, deps || {});
  /* {ok, status, text|bytes}; THROWS when nothing arrived (the host's silence, or the caller's stop) */
  const read = D.read || ((url, signal, bytes) => readWithin(url, clockFor(url), signal ? { signal } : {}, bytes ? { bytes: true } : undefined));
  let meta = null;   /* the service description, once read */

  async function service(signal) {
    if (meta) return meta;
    const r = await read(SERVICE + '?f=json', signal, false);
    if (!r || !r.ok) throw new Error('worldpop: service description HTTP ' + (r ? r.status : 'no answer'));
    let j = null; try { j = JSON.parse(r.text); } catch (_) { j = null; }
    const d = describeService(j);
    if (!d) throw new Error('worldpop: service description unreadable');
    meta = d; return d;
  }

  /* the native cell's ground area at latitude `lat`, asked of the one area function zonal uses */
  function cellKm2(R, d, lat) {
    const half = d.cell / 2;
    const one = { width: 1, height: 1, bands: [{ name: null, unit: null, nodata: null }],
      grid: { west: 0, north: lat + half, pixelLng: d.cellX, pixelLat: d.cell }, read: () => new Float64Array(1) };
    const a = R.pixelAreaKm2(one, 0);
    return (typeof a === 'number' && a > 0) ? a : ((a && typeof a.km2 === 'number' && a.km2 > 0) ? a.km2 : null);
  }

  /* js/gis-sources.js supply({region}) — {bbox, width, height, time, signal} → {ok, cells, band, coverage} */
  async function region(req) {
    const RS = D.raster ? D.raster() : null, TIF = D.geotiff ? await D.geotiff() : null;
    if (!RS || !TIF) return { ok: false, why: 'map-unavailable', detail: { needs: !RS ? 'IntMapGisRaster' : 'gis-geotiff' } };
    const d = await service(req.signal);
    const asked = yearOf(req.time);
    if (Number.isNaN(asked)) return { ok: false, why: 'bad-param', detail: { param: 'time', value: req.time } };
    /* no year asked = the latest the service states, and the answer says which (coverage.time) */
    const year = asked == null ? d.last : asked;
    if (year < d.first || year > d.last) return { ok: false, why: 'time-not-covered', detail: { asked: year, from: d.first, to: d.last } };
    const b = req.bbox, W = req.width, H = req.height;
    /* the service draws at most maxW×maxH; a bigger window is asked in blocks of rows/columns */
    const bw = d.maxW ? Math.min(W, d.maxW) : W, bh = d.maxH ? Math.min(H, d.maxH) : H;
    const out = new Array(W * H).fill(null);
    const px = (b.e - b.w) / W, py = (b.n - b.s) / H;
    const t = Date.UTC(year, 0, 1);
    for (let r0 = 0; r0 < H; r0 += bh) {
      for (let c0 = 0; c0 < W; c0 += bw) {
        if (req.signal && req.signal.aborted) return { ok: false, why: 'cancelled' };
        const w = Math.min(bw, W - c0), h = Math.min(bh, H - r0);
        const box = [b.w + c0 * px, b.n - (r0 + h) * py, b.w + (c0 + w) * px, b.n - r0 * py];
        const u = SERVICE + '/exportImage?bbox=' + box.join(',') + '&bboxSR=4326&imageSR=4326&size=' + w + ',' + h +
          '&format=tiff&pixelType=F32&noData=-1&interpolation=RSP_NearestNeighbor&time=' + t + '&f=image';
        const res = await read(u, req.signal || null, true);
        if (!res || !res.ok) throw new Error('worldpop: exportImage HTTP ' + (res ? res.status : 'no answer'));
        const g = await TIF.read(new Uint8Array(res.bytes));
        if (!g || !g.ok || !g.grid) throw new Error('worldpop: image unreadable (' + ((g && g.why) || 'no grid') + ')');
        if (g.grid.width !== w || g.grid.height !== h) throw new Error('worldpop: image is ' + g.grid.width + '×' + g.grid.height + ', asked ' + w + '×' + h);
        const v = g.grid.read(0);
        for (let r = 0; r < h; r++) {
          const lat = b.n - (r0 + r + 0.5) * py;
          const km2 = cellKm2(RS, d, lat);
          for (let c = 0; c < w; c++) {
            const x = v[r * w + c];
            /* -1 is the nodata we asked for; the service's own fill is 3.4e38 — neither is a count */
            if (!(typeof x === 'number' && isFinite(x) && x >= 0 && x < 1e30) || !km2) continue;
            out[(r0 + r) * W + (c0 + c)] = x / km2;
          }
        }
      }
    }
    return {
      ok: true, cells: out,
      band: { name: 'Population density · WorldPop ' + year, unit: 'people/km²', nodata: null,
        quantity: { kind: 'density', space: 'perArea', time: 'instant', unit: 'people/km²' } },
      coverage: { time: String(year), asOf: String(year), served: { w: b.w, s: b.s, e: b.e, n: b.n } },
    };
  }

  return { region, service, yearOf, describeService };
}
