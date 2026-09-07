/* ============================================================================
 *  IntMap · TERRAIN FOR PHOTO GEOLOCATION — globalThis.IntMapPhotoTerrain   (#R527)
 * ----------------------------------------------------------------------------
 *  「山並み写真から撮影地点・撮影方向を探す機能」の地形側。ここが答える問いは一つだけ:
 *
 *      «ある地点に立った人の目に、地平線／稜線は方位ごとに何度の高さで見えるか»
 *
 *  ── WHY THIS FILE IS NOT js/viewshed.js ─────────────────────────────────────────────────────────
 *  js/viewshed.js already ray-marches the same DEM, and its physics (dropAt, the refracted earth,
 *  the observer-height-above-SEA-LEVEL rule) is reused here verbatim — the constants below are the
 *  same numbers. What it cannot do is the thing this needs: it answers "can A see B" for ONE pair,
 *  on the page, reading tiles through the main-thread cache in js/map-readout.js. A search over a
 *  rectangle asks for a 360 degree horizon at each of a few thousand candidate points, and the same
 *  terrain is walked once per candidate. Two consequences shape everything below:
 *
 *   1. THE DEM IS RESAMPLED ONCE, INTO METRES. A ray step must not cost a Mercator projection, an
 *      asin and an atan2 — at 1,500 steps x 720 azimuths x 2,000 candidates that is 4.3 billion
 *      transcendental calls. So the tiles are resampled ONCE into local east/north rasters in
 *      metres (exact spherical geodesy is paid there, per cell, not per ray step), and the walk is
 *      then array arithmetic with no trigonometry in the inner loop at all.
 *   2. RESOLUTION FOLLOWS DISTANCE, because ANGULAR resolution is what a photograph can see. A 30 m
 *      post 200 km away subtends 0.0086 degrees; carrying it costs 250x the memory of the 438 m
 *      post that subtends the same angle a photograph can actually resolve. Three bands (below)
 *      hold the angular resolution roughly constant at ~0.15 degrees, which is where 30 m SRTM
 *      lands at 10 km — i.e. at the data's own limit, not below it.
 *
 *  ── THE DATA, AND WHAT IS WRONG WITH IT (stated, not hidden) ────────────────────────────────────
 *  AWS Terrain Tiles (Mapzen «terrarium»), the same bucket every other DEM consumer in IntMap uses:
 *  no API key, CORS open, mostly SRTM/NED at ~30 m. MEASURED against published summit heights:
 *
 *      Mt Fuji     3,776 m -> 3,752 m   (-24 m)
 *      Everest     8,849 m -> 8,722 m   (-127 m)
 *      Matterhorn  4,478 m -> 4,300 m   (-178 m)
 *      Dead Sea     -430 m ->  -412 m   (+18 m)
 *
 *  A 30 m grid cannot hold a sharp summit: the cell is an average, so PEAKS READ LOW, by more the
 *  sharper they are. For this feature that is a systematic bias of the right sign to worry about —
 *  every computed skyline sits slightly below the real one — but it is nearly constant across a
 *  photograph's field of view, so it is absorbed almost entirely by the pitch the search is already
 *  solving for. What it does NOT absorb is the SHAPE error on a knife-edge ridge, and that is a
 *  real limit of the method, recorded in docs/PHOTO-GEOLOCATION.md.
 *
 *  ⚠ AND THE DATASET CARRIES BATHYMETRY. Ocean cells are the SEA FLOOR (mid-Pacific reads -4,292 m),
 *  which is right for js/elevation-profile.js and wrong here: a photograph sees the sea SURFACE. The
 *  horizon over water is set by the observer's height and the curvature of the earth, and reading
 *  -4,292 m puts it degrees too low. So cells below SEA_CLAMP_M are raised to 0. The threshold is
 *  -500 m and it is not arbitrary: THE DEEPEST EXPOSED LAND ON EARTH IS THE DEAD SEA SHORE AT ABOUT
 *  -430 m. Below -500 m there is no dry land to get wrong, and every real depression on the planet
 *  (Turpan -154, Qattara -133, Danakil -125, Death Valley -86) is far above it and untouched.
 * ==========================================================================*/
(function () {
  'use strict';

  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  /* the same mean radius js/drone-nav.js, js/insolation.js, js/routing-ops.js and js/cesium-engine.js use */
  var R_EARTH = 6371008.8;
  /* Standard optical refraction. js/viewshed.js calls the same number «the usual optical value»: a
     ray over an earth of radius k*R falls d^2/(2kR) below the tangent plane. k = 1 is vacuum
     geometry, k ~ 1.13 is air at the surface in ordinary conditions, k = 4/3 is the radio value.
     Distant peaks appear HIGHER than pure geometry says, by ~0.03 degrees at 100 km — small, but
     the wrong sign to ignore, because it biases every long-range match the same way. */
  var K_REFRACTION = 1.13;
  /* below this the terrarium tile is bathymetry, not land — see the header */
  var SEA_CLAMP_M = -500;
  /* Challenger Deep is -10,935 m; under this is «no data», the same rule as js/map-readout.js */
  var NODATA_BELOW = -12000;
  /* ⚠ AND THE SAME RULE AT THE TOP END, WHICH js/map-readout.js DOES NOT NEED AND THIS DOES.
     MEASURED on the shipped bucket: the terrarium tile z9/451/199 carries two cells reading
     32,767 m — (255,255,255), the largest value the encoding can hold — at 36.7609,137.1588, which
     is the Toyama Bay COASTLINE. Its parent z8 tile reads 18,111 m at the same place. Every finer
     level is right: z10 3 m, z11 8 m, z12 3 m, z13 4 m. So this is not a hole, it is a spike, and a
     spike is far more dangerous here than a hole: the horizon is a MAX along the ray, so one bad
     cell is not averaged away, it BECOMES the skyline. A 32,767 m cell 40 km out draws a phantom
     ridge at 39 degrees and every candidate that can see it scores alike.
     Everest is 8,849 m, so nothing above 9,000 m is Earth. */
  var NODATA_ABOVE = 9000;
  /* …and a second, milder spike guard for values that are absurd only in CONTEXT. A cell that stands
     more than this above ALL FOUR of its neighbours is not terrain at any of the zooms used here: at
     z9 (250 m cells) it would be a needle 500 m tall and under 250 m wide on every side — the
     Matterhorn's final 500 m is about 800 m across. Real cliffs fail the test because a cliff has a
     TOP: its uphill neighbour is at the same height, so the cell does not exceed all four. */
  var SPIKE_ABOVE_NEIGHBOURS_M = 500;

  /* ── THE BANDS ──────────────────────────────────────────────────────────────────────────────────
     Each band is {r: outer radius in metres, z: tile zoom}. Ground resolution at zoom z and latitude
     phi is 156543.034*cos(phi) / 2^z. At 45 degrees that is 13.5 m (z13), 54 m (z11) and 215 m (z9);
     at the outer edge of each band those subtend 0.155, 0.089 and 0.082 degrees, so nothing in the
     walk is resolved much finer than the ~0.15 degrees that 30 m data supports at all. */
  var BANDS = [
    { r: 5000, z: 13 },
    { r: 35000, z: 11 },
    { r: 150000, z: 9 }
  ];
  /* the four host names for one bucket (#R223, js/map-readout.js): a browser opens six connections
     per host over HTTP/1.1, and the host is a DETERMINISTIC function of the tile so the HTTP cache
     still hits */
  var DEM_HOSTS = [
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium',
    'https://elevation-tiles-prod.s3.amazonaws.com/terrarium',
    'https://elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com/terrarium',
    'https://elevation-tiles-prod.s3.us-east-1.amazonaws.com/terrarium'
  ];
  function demURL(z, x, y) { return DEM_HOSTS[(x + y) & 3] + '/' + z + '/' + x + '/' + y + '.png'; }

  var ATTRIBUTION = {
    id: 'aws-terrain-tiles',
    name: 'AWS Terrain Tiles (Mapzen terrarium)',
    url: 'https://registry.opendata.aws/terrain-tiles/',
    /* what the bytes actually are, per the dataset's own documentation */
    sources: 'SRTM · 3DEP/NED · GMTED2010 · ETOPO1 bathymetry · national DEMs',
    nativeResolutionM: 30,
    licence: 'public domain / CC-BY per source — see the registry page'
  };

  /* ── tile arithmetic (Web Mercator, 256 px tiles) ────────────────────────────────────────────── */
  function lonToTileX(lon, z) { return (lon + 180) / 360 * Math.pow(2, z); }
  function latToTileY(lat, z) {
    var r = lat * D2R;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, z);
  }
  /* ground metres per pixel at this zoom and latitude — the number the bands are chosen against */
  function metresPerPixel(lat, z) { return 156543.03392804097 * Math.cos(lat * D2R) / Math.pow(2, z); }

  /* ── decode ─────────────────────────────────────────────────────────────────────────────────────
     terrarium: elevation = R*256 + G + B/256 - 32768. ⚠ A VOID IS NOT A DEPTH. An untouched canvas
     pixel is (0,0,0,0) and a void terrarium pixel is (0,0,0,255); both decode to -32,768 and both
     mean «no data», which is why js/map-readout.js turns them into NaN rather than 32.8 km down.
     Same rule here — and NaN survives all the way to the report, as unevaluated azimuth. */
  function decodeTerrarium(rgba, out) {
    var n = (rgba.length / 4) | 0;
    var el = out || new Float32Array(n);
    var voids = 0, spikes = 0;
    for (var i = 0, o = 0; i < n; i++, o += 4) {
      var v = (rgba[o] * 256 + rgba[o + 1] + rgba[o + 2] / 256) - 32768;
      if (rgba[o + 3] === 0 || !(v > NODATA_BELOW) || !(v < NODATA_ABOVE)) { el[i] = NaN; voids++; }
      else el[i] = v < SEA_CLAMP_M ? 0 : v;      /* the sea-surface rule, applied once, at decode */
    }
    /* the contextual spike pass — square tiles only, which is every tile this reads */
    var w = Math.round(Math.sqrt(n));
    if (w * w === n && w > 2) {
      for (var y = 1; y < w - 1; y++) {
        for (var x = 1; x < w - 1; x++) {
          var k = y * w + x, c = el[k];
          if (c !== c) continue;
          var a = el[k - 1], b = el[k + 1], u = el[k - w], d = el[k + w];
          /* a void neighbour cannot vouch for the cell either way, so it is not evidence of a spike */
          if (!(a === a && b === b && u === u && d === d)) continue;
          var hi = a > b ? a : b; if (u > hi) hi = u; if (d > hi) hi = d;
          if (c - hi > SPIKE_ABOVE_NEIGHBOURS_M) { el[k] = NaN; voids++; spikes++; }
        }
      }
    }
    return { el: el, voids: voids, spikes: spikes };
  }

  /* ── which tiles a search needs ─────────────────────────────────────────────────────────────────
     The search rectangle is where the CAMERA may have stood. The terrain that camera can see extends
     one horizon radius beyond it in every direction — two different rectangles, and confusing them
     is the single easiest way to quietly search the wrong thing. `tilesFor` takes the camera
     rectangle and returns the tiles of the TERRAIN rectangle, band by band. */
  function tilesFor(area, opts) {
    var o = opts || {};
    var bands = o.bands || BANDS;
    var latC = (area.south + area.north) / 2;
    var out = [], byBand = [];
    for (var b = 0; b < bands.length; b++) {
      var pad = bands[b].r, z = bands[b].z;
      var dLat = pad / (R_EARTH * D2R);
      var cosl = Math.max(0.02, Math.cos(Math.max(Math.abs(area.south), Math.abs(area.north)) * D2R));
      var dLon = pad / (R_EARTH * D2R * cosl);
      var s = Math.max(-85, area.south - dLat), n = Math.min(85, area.north + dLat);
      var w = area.west - dLon, e = area.east + dLon;
      var x0 = Math.floor(lonToTileX(w, z)), x1 = Math.floor(lonToTileX(e, z));
      var y0 = Math.floor(latToTileY(n, z)), y1 = Math.floor(latToTileY(s, z));
      var nn = Math.pow(2, z), list = [];
      for (var x = x0; x <= x1; x++) {
        for (var y = y0; y <= y1; y++) {
          if (y < 0 || y >= nn) continue;
          var xx = ((x % nn) + nn) % nn;                  /* the antimeridian is not an edge */
          list.push({ z: z, x: xx, y: y });
        }
      }
      byBand.push({ z: z, r: bands[b].r, tiles: list, latC: latC });
      out = out.concat(list);
    }
    /* de-duplicate: two bands never share a zoom, so this only guards a caller-supplied band table */
    var seen = Object.create(null), uniq = [];
    for (var i = 0; i < out.length; i++) {
      var k = out[i].z + '/' + out[i].x + '/' + out[i].y;
      if (!seen[k]) { seen[k] = 1; uniq.push(out[i]); }
    }
    return { all: uniq, bands: byBand };
  }

  /* ── the local rasters ──────────────────────────────────────────────────────────────────────────
     One Float32Array per band, in LOCAL EAST/NORTH METRES about a single origin, so the ray march is
     arithmetic. Building it costs exact spherical geodesy PER CELL — asin and atan2 — but that is
     paid once for the whole search rather than once per candidate per step, which is the entire
     reason this feature is fast enough to exist. */
  function buildField(origin, area, tileStore, opts) {
    var o = opts || {};
    var bands = o.bands || BANDS;
    var lat0 = origin.lat, lon0 = origin.lon;
    var sinLat0 = Math.sin(lat0 * D2R), cosLat0 = Math.cos(lat0 * D2R);
    /* how far east/north the raster must reach: the camera rectangle's own half-extent, plus the band */
    var halfN = Math.max(Math.abs(area.north - lat0), Math.abs(area.south - lat0)) * D2R * R_EARTH;
    var halfE = Math.max(Math.abs(area.east - lon0), Math.abs(area.west - lon0)) * D2R * R_EARTH * cosLat0;
    var layers = [], totalCells = 0, voidCells = 0;
    for (var b = 0; b < bands.length; b++) {
      var z = bands[b].z, reach = bands[b].r;
      var res = metresPerPixel(lat0, z);
      var extE = halfE + reach, extN = halfN + reach;
      var nx = Math.max(2, Math.ceil(2 * extE / res) + 1);
      var ny = Math.max(2, Math.ceil(2 * extN / res) + 1);
      var grid = new Float32Array(nx * ny);
      var nn = Math.pow(2, z), voids = 0;
      for (var j = 0; j < ny; j++) {
        var north = -extN + j * res;
        for (var i = 0; i < nx; i++) {
          var east = -extE + i * res;
          var r = Math.sqrt(east * east + north * north);
          var lat, lon;
          if (r < 1e-6) { lat = lat0; lon = lon0; }
          else {
            /* exact great-circle destination on the sphere — the accuracy the ray march inherits */
            var d = r / R_EARTH, sd = Math.sin(d), cd = Math.cos(d);
            var cosA = north / r, sinA = east / r;
            var sl = sinLat0 * cd + cosLat0 * sd * cosA;
            sl = sl > 1 ? 1 : sl < -1 ? -1 : sl;
            lat = Math.asin(sl) * R2D;
            lon = lon0 + Math.atan2(sinA * sd * cosLat0, cd - sinLat0 * sl) * R2D;
          }
          var v = NaN;
          if (lat < 85 && lat > -85) {
            var fx = lonToTileX(lon, z), fy = latToTileY(lat, z);
            var tx = Math.floor(fx), ty = Math.floor(fy);
            tx = ((tx % nn) + nn) % nn;
            if (ty >= 0 && ty < nn) {
              var t = tileStore.get(z + '/' + tx + '/' + ty);
              if (t) {
                /* bilinear in ELEVATION, never in the encoding (js/map-readout.js #R19), and the
                   weights are renormalised over the corners that carry data — one void corner used
                   to poison a whole blend and read Lake Biwa as -7,800 m (#R265) */
                var px = (fx - Math.floor(fx)) * 256 - 0.5, py = (fy - Math.floor(fy)) * 256 - 0.5;
                var x0 = Math.floor(px), y0 = Math.floor(py);
                var ux = px - x0, uy = py - y0;
                var xa = x0 < 0 ? 0 : x0 > 255 ? 255 : x0, xb = xa + 1 > 255 ? 255 : xa + 1;
                var ya = y0 < 0 ? 0 : y0 > 255 ? 255 : y0, yb = ya + 1 > 255 ? 255 : ya + 1;
                var a = t[ya * 256 + xa], bb = t[ya * 256 + xb], c = t[yb * 256 + xa], e2 = t[yb * 256 + xb];
                var wa = (1 - ux) * (1 - uy), wb = ux * (1 - uy), wc = (1 - ux) * uy, we = ux * uy;
                var sum = 0, wsum = 0;
                if (a === a) { sum += a * wa; wsum += wa; }
                if (bb === bb) { sum += bb * wb; wsum += wb; }
                if (c === c) { sum += c * wc; wsum += wc; }
                if (e2 === e2) { sum += e2 * we; wsum += we; }
                if (wsum > 0) v = sum / wsum;
              }
            }
          }
          if (v !== v) voids++;
          grid[j * nx + i] = v;
        }
      }
      /* the band's highest cell — the ray march uses it to skip a whole band it cannot possibly see
         over, which is most of the far band for an observer in a valley */
      var mx = -Infinity;
      for (var q = 0; q < grid.length; q++) { var g = grid[q]; if (g === g && g > mx) mx = g; }
      /* whether this layer has a single hole decides which sampler the ray march may use — the
         renormalising one is correct everywhere and about a third slower, and a band with no voids
         at all (the common case on land) does not need it */
      layers.push({ z: z, reach: reach, res: res, nx: nx, ny: ny, extE: extE, extN: extN, grid: grid, max: mx, voids: voids, hasVoid: voids > 0 });
      totalCells += grid.length; voidCells += voids;
    }
    return {
      lat0: lat0, lon0: lon0, layers: layers,
      cells: totalCells, voidCells: voidCells,
      bytes: totalCells * 4,
      /* east/north metres for any lat/lon inside the field — the inverse of the resample above,
         accurate to the same spherical model */
      toEN: function (lat, lon) {
        var p1 = lat * D2R, l1 = lat0 * D2R, dl = (lon - lon0) * D2R;
        var sp = Math.sin(p1), cp = Math.cos(p1), sl1 = Math.sin(l1), cl1 = Math.cos(l1);
        var cd = sl1 * sp + cl1 * cp * Math.cos(dl);
        cd = cd > 1 ? 1 : cd < -1 ? -1 : cd;
        var d = Math.acos(cd) * R_EARTH;
        var brg = Math.atan2(Math.sin(dl) * cp, cl1 * sp - sl1 * cp * Math.cos(dl));
        return { e: d * Math.sin(brg), n: d * Math.cos(brg) };
      },
      /* and back, for reporting a candidate's own latitude and longitude */
      toLL: function (e, n) {
        var r = Math.sqrt(e * e + n * n);
        if (r < 1e-6) return { lat: lat0, lon: lon0 };
        var d = r / R_EARTH, sd = Math.sin(d), cd = Math.cos(d);
        var sl = sinLat0 * cd + cosLat0 * sd * (n / r);
        sl = sl > 1 ? 1 : sl < -1 ? -1 : sl;
        return {
          lat: Math.asin(sl) * R2D,
          lon: lon0 + Math.atan2((e / r) * sd * cosLat0, cd - sinLat0 * sl) * R2D
        };
      },
      /* bilinear elevation at local metres, from the finest band that covers the point */
      sampleEN: function (e, n) {
        for (var i = 0; i < layers.length; i++) {
          var L = layers[i];
          if (Math.abs(e) > L.extE || Math.abs(n) > L.extN) continue;
          var v = _bilinear(L, e, n);
          if (v === v) return v;
        }
        return NaN;
      }
    };
  }

  function _bilinear(L, e, n) {
    var fx = (e + L.extE) / L.res, fy = (n + L.extN) / L.res;
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    if (x0 < 0 || y0 < 0 || x0 + 1 >= L.nx || y0 + 1 >= L.ny) return NaN;
    var ux = fx - x0, uy = fy - y0, g = L.grid, nx = L.nx;
    var i0 = y0 * nx + x0;
    var a = g[i0], b = g[i0 + 1], c = g[i0 + nx], d = g[i0 + nx + 1];
    var wa = (1 - ux) * (1 - uy), wb = ux * (1 - uy), wc = (1 - ux) * uy, wd = ux * uy;
    var s = 0, w = 0;
    if (a === a) { s += a * wa; w += wa; }
    if (b === b) { s += b * wb; w += wb; }
    if (c === c) { s += c * wc; w += wc; }
    if (d === d) { s += d * wd; w += wd; }
    return w > 0 ? s / w : NaN;
  }

  /* ── THE HORIZON ────────────────────────────────────────────────────────────────────────────────
     For each azimuth, walk outward and keep the largest apparent elevation angle. Two pieces of
     physics, both taken from js/viewshed.js rather than re-derived:
       · the target's height is measured from the OBSERVER'S EYE, which is the ground under the
         observer plus their own height above it — and the eye height that matters for the curvature
         term is above SEA LEVEL, not above the ground (js/viewshed.js says why: a 10 m mast on Fuji
         reads 13 km with the local height and 253 km with the real one);
       · everything beyond the observer falls d^2/(2kR) below the tangent plane.
     `elev[i]` is NaN where the walk found no data at all in that direction — an unanswered azimuth
     is reported as unanswered, never as «flat». */
  function horizon(field, e0, n0, opts) {
    var o = opts || {};
    var nAz = o.nAz || 720;
    var eyeAgl = o.observerHeightM == null ? 1.6 : o.observerHeightM;
    var stepScale = o.stepScale || 1.0;
    var ground = field.sampleEN(e0, n0);
    if (ground !== ground) return null;                    /* the observer is not on known ground */
    var eye = ground + eyeAgl;
    var k2R = 2 * K_REFRACTION * R_EARTH;
    var elev = new Float32Array(nAz), dist = new Float32Array(nAz);
    var layers = field.layers, nL = layers.length;
    var covered = 0;
    for (var i = 0; i < nAz; i++) {
      var az = i * 2 * Math.PI / nAz;
      var se = Math.sin(az), cn = Math.cos(az);
      var best = -Infinity, bestR = 0, any = 0;
      var rPrev = 0;
      for (var b = 0; b < nL; b++) {
        var L = layers[b], outer = L.reach;
        /* can anything in this band beat what we already have? The band's tallest cell, seen from
           its NEAREST edge, is the most it could possibly offer. */
        if (best > -Infinity) {
          var rNear = Math.max(rPrev, L.res);
          /* `best` is a TANGENT (see the inner loop), so the ceiling is compared as one too */
          var ceil = (L.max - eye - rNear * rNear / k2R) / rNear;
          if (ceil <= best) { rPrev = outer; continue; }
        }
        var step = L.res * stepScale;
        var g = L.grid, gnx = L.nx, gny = L.ny, gres = L.res, gE = L.extE, gN = L.extN, hv = L.hasVoid;
        for (var r = rPrev + step; r <= outer; r += step) {
          var e = e0 + se * r, n = n0 + cn * r;
          if (e < -gE || e > gE || n < -gN || n > gN) break;
          /* inlined bilinear — this is the innermost loop of the whole feature and a call per
             sample costs more than the arithmetic it wraps */
          var fx = (e + gE) / gres, fy = (n + gN) / gres;
          var xi = fx | 0, yi = fy | 0;
          if (xi < 0 || yi < 0 || xi + 1 >= gnx || yi + 1 >= gny) continue;
          var ux = fx - xi, uy = fy - yi, i0 = yi * gnx + xi;
          var p0 = g[i0], p1 = g[i0 + 1], p2 = g[i0 + gnx], p3 = g[i0 + gnx + 1];
          var h;
          if (!hv) h = p0 + (p1 - p0) * ux + (p2 - p0) * uy + (p0 - p1 - p2 + p3) * ux * uy;
          else {
            var wa = (1 - ux) * (1 - uy), wb = ux * (1 - uy), wc = (1 - ux) * uy, wd = ux * uy;
            var sm = 0, wt = 0;
            if (p0 === p0) { sm += p0 * wa; wt += wa; }
            if (p1 === p1) { sm += p1 * wb; wt += wb; }
            if (p2 === p2) { sm += p2 * wc; wt += wc; }
            if (p3 === p3) { sm += p3 * wd; wt += wd; }
            if (!(wt > 0)) continue;
            h = sm / wt;
          }
          any = 1;
          /* atan2 per sample is the second-largest cost; compare TANGENTS instead and take the one
             arctangent that survives. tan is monotonic over the range an elevation angle can take. */
          var t = (h - eye - r * r / k2R) / r;
          if (t > best) { best = t; bestR = r; }
        }
        rPrev = outer;
      }
      if (any) { covered++; elev[i] = Math.atan(best) * R2D; dist[i] = bestR; }
      else { elev[i] = NaN; dist[i] = 0; }
    }
    return {
      nAz: nAz, elev: elev, dist: dist,
      groundM: ground, eyeM: eye, observerHeightM: eyeAgl,
      coverage: covered / nAz,
      maxRangeM: layers.length ? layers[layers.length - 1].reach : 0
    };
  }

  /* Elevation angle of the sea/earth horizon for an eye this high — what the walk converges to over
     open water, and a useful floor to sanity-check a computed panorama against. Negative. */
  function horizonDipDeg(eyeM) {
    return -Math.acos(K_REFRACTION * R_EARTH / (K_REFRACTION * R_EARTH + Math.max(0, eyeM))) * R2D;
  }

  var API = {
    D2R: D2R, R2D: R2D, R_EARTH: R_EARTH, K_REFRACTION: K_REFRACTION,
    SEA_CLAMP_M: SEA_CLAMP_M, NODATA_BELOW: NODATA_BELOW, NODATA_ABOVE: NODATA_ABOVE,
    SPIKE_ABOVE_NEIGHBOURS_M: SPIKE_ABOVE_NEIGHBOURS_M,
    BANDS: BANDS, DEM_HOSTS: DEM_HOSTS, ATTRIBUTION: ATTRIBUTION,
    demURL: demURL, decodeTerrarium: decodeTerrarium,
    lonToTileX: lonToTileX, latToTileY: latToTileY, metresPerPixel: metresPerPixel,
    tilesFor: tilesFor, buildField: buildField, horizon: horizon, horizonDipDeg: horizonDipDeg
  };
  if (typeof globalThis !== 'undefined') globalThis.IntMapPhotoTerrain = API;
  else if (typeof window !== 'undefined') window.IntMapPhotoTerrain = API;
})();
