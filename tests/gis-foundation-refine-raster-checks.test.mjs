/* ============================================================================
 *  gis-foundation-refine · raster sampling edges and the unit table
 * ----------------------------------------------------------------------------
 *  ① sample treats longitude as periodic and the outer extent edges symmetrically
 *  ② sample reads a query longitude in the grid's own frame (a 179.5…181.5 grid owns −179.8)
 *  ③ an affine conversion keeps exact decimal relationships (0 °C = 32 °F)
 *  ④ knot, mmHg, inHg, US survey foot and tsubo are answered with their exact definitions
 *  Every expectation is written from the definition, not read back from the module.
 * ==========================================================================*/
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow, isolate } from './helpers/geo-shared.mjs';

describe('gis-foundation-refine · raster + units', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  async function boot() {
    const w = installWindow();
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisUnits } = await import('../js/gis-units.js');
    const raster = makeGisRaster();
    const units = makeGisUnits();
    w.IntMapGisRaster = raster; w.IntMapGisUnits = units;
    return { raster, units };
  }
  function grid(o) {
    const data = new Float64Array(o.width * o.height);
    for (let r = 0; r < o.height; r++) for (let c = 0; c < o.width; c++) {
      data[r * o.width + c] = o.value(o.west + o.pixelLng * (c + 0.5), o.north - o.pixelLat * (r + 0.5), c, r);
    }
    return {
      width: o.width, height: o.height, crs: 'EPSG:4326',
      bands: [{ name: 'v', unit: null, nodata: null }],
      grid: { west: o.west, north: o.north, pixelLng: o.pixelLng, pixelLat: o.pixelLat },
      read: (i) => ((i == null || i === 0) ? data : null),
    };
  }

  test('① a global grid is periodic in longitude and closed on every outer edge', async () => {
    const { raster } = await boot();
    /* the value is the column index, so which column answered is the assertion */
    const g = grid({ west: -180, north: 90, pixelLng: 1, pixelLat: 1, width: 360, height: 180, value: (lng, lat, c, r) => c * 1000 + r });
    const at = (lng, lat) => raster.sample(g, 0, lng, lat, { method: 'nearest' });
    const west = at(-180, 0), east = at(180, 0), wrapped = at(540.5, 0);
    assert.equal(west.ok, true);
    assert.equal(east.ok, true, '180 is accepted');
    assert.equal(east.col, west.col, '180 and -180 are the same column');
    assert.equal(wrapped.ok, true);
    assert.equal(wrapped.col, 0, '540.5 = -179.5 is column 0');
    assert.equal(at(-179.5 - 360, 0).col, 0);
    const n = at(0, 90), s = at(0, -90);
    assert.equal(n.ok, true);
    assert.equal(s.ok, true, 'lat -90 is sampled as lat +90 is');
    assert.equal(n.row, 0);
    assert.equal(s.row, 179);
    assert.equal(at(0, -90.0001).ok, false);
    assert.equal(at(0, 90.0001).ok, false);
  });

  test('② a grid written 179.5…181.5 owns -179.8, as zonal does', async () => {
    const { raster } = await boot();
    const g = grid({ west: 179.5, north: 1, pixelLng: 0.5, pixelLat: 0.5, width: 4, height: 4, value: (lng, lat, c) => c });
    const r = raster.sample(g, 0, -179.8, 0, { method: 'nearest' });
    assert.equal(r.ok, true);
    assert.equal(r.col, 1, '-179.8 = 180.2 lies in [180, 180.5), column 1');
    assert.equal(raster.sample(g, 0, 180.2, 0, { method: 'nearest' }).col, 1);
    assert.equal(raster.sample(g, 0, 0, 0, { method: 'nearest' }).ok, false, 'a position on the far side of the world is still outside');
    /* closed outer east edge of a grid narrower than a turn */
    assert.equal(raster.sample(g, 0, 181.5, 0, { method: 'nearest' }).col, 3);
    /* bilinear at a wrapped longitude is taken in the wrapped frame */
    const bi = raster.sample(g, 0, -179.8, 0, { method: 'bilinear' });
    assert.equal(bi.ok, true);
    assert.ok(Math.abs(bi.value - 0.9) < 1e-9, 'fx = (180.2-179.5)/0.5-0.5 = 0.9 between columns 0 and 1');
  });

  test('③ affine conversions keep exact decimal relationships', async () => {
    const { units } = await boot();
    const c = units.convert;
    assert.equal(c(0, '°C', '°F'), 32);
    assert.equal(c(100, '°C', '°F'), 212);
    assert.equal(c(-40, '°C', '°F'), -40);
    assert.equal(c(32, '°F', '°C'), 0);
    assert.equal(c(212, '°F', '°C'), 100);
    assert.equal(c(0, '°C', 'K'), 273.15);
    assert.equal(c(273.15, 'K', '°C'), 0);
    assert.equal(c(-273.15, '°C', 'K'), 0);
    assert.equal(c(0, 'K', '°C'), -273.15);
    assert.equal(c(32, '°F', 'K'), 273.15);
    assert.equal(c(373.15, 'K', '°F') , 212);
    assert.equal(c(25, '°C', '°C'), 25);
    /* a difference is a gap: no offset */
    assert.equal(c(10, '°C', '°F', { difference: true }), 18);
    /* round trip stays within one ulp-scale of the input */
    for (const v of [-40, -12.5, 0, 20, 36.6, 1000]) {
      assert.ok(Math.abs(c(c(v, '°C', '°F'), '°F', '°C') - v) < 1e-12);
      assert.ok(Math.abs(c(c(v, '°C', 'K'), 'K', '°F') - (v * 9 / 5 + 32)) < 1e-9);
    }
  });

  test('④ knot, mmHg, inHg, US survey foot and tsubo', async () => {
    const { units } = await boot();
    const c = units.convert;
    assert.ok(Math.abs(c(1, 'kn', 'm/s') - 1852 / 3600) < 1e-15);
    assert.ok(Math.abs(c(1852, 'm/h', 'kn') - 1) < 1e-12);
    assert.ok(Math.abs(c(1, 'mmHg', 'Pa') - 133.322387415) < 1e-9);
    assert.ok(Math.abs(c(760, 'mmHg', 'hPa') - 1013.2499) < 1e-3);
    assert.ok(Math.abs(c(1, 'inHg', 'Pa') - 3386.389) < 1e-9);
    assert.ok(Math.abs(c(29.92, 'inHg', 'hPa') - 1013.2) < 0.1);
    assert.ok(Math.abs(c(3937, 'ftUS', 'm') - 1200) < 1e-9);
    assert.ok(Math.abs(c(1, 'ftUS', 'ft') - (1200 / 3937) / 0.3048) < 1e-15);
    assert.ok(Math.abs(c(121, 'tsubo', 'm2') - 400) < 1e-9);
    assert.ok(Math.abs(c(1, '坪', 'm²') - 400 / 121) < 1e-12);
    assert.equal(c(1, 'inHg', 'm'), null, 'a pressure is not a length');
    assert.equal(units.compare('mmHg', 'hPa').verdict, 'convertible');
    assert.equal(units.compare('tsubo', 'ha').verdict, 'convertible');
  });
});
