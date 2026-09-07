/* ============================================================================
 *  shakemap.js — WHAT THE GROUND ACTUALLY DID, for one earthquake  (#R546)
 * ----------------------------------------------------------------------------
 *  「USGS ShakeMap を IntMap にマッピングできる？」— yes, and not as a picture.
 *
 *  ══ WHAT WAS THERE BEFORE, MEASURED ════════════════════════════════════════
 *  The live quake layer (`eq-pt`, js/wb-layers.js) drew one circle per event and
 *  its click handler opened a popup with three lines: M, place, local time. That
 *  is the CATALOGUE — a point, a magnitude, a depth. Magnitude is a property of
 *  the SOURCE; it says nothing about who felt what. A M6.0 at 11 km under a city
 *  and a M6.0 at 600 km under the sea are the same circle on this map.
 *  ShakeMap is the other half: the ground motion FIELD, made by USGS from
 *  seismic recordings, DYFI reports, site conditions and a GMPE, and published
 *  as geographic data — not only as the JPEG everyone links to.
 *
 *  ══ WHICH OF THE ~90 FILES IN A ShakeMap PRODUCT, AND WHY ══════════════════
 *  MEASURED 2026-09-08 over six events spanning 1923–2026 (iscgem906183 Kantō,
 *  official20110311054624120_30 Tōhoku, nc72282711 Napa, us6000jllz Türkiye,
 *  us7000tdvt Alaska, uw714095342 Washington):
 *
 *    · `download/cont_<metric>.json`  — GeoJSON MultiLineString contours, 7–110 kB.
 *      PRESENT ON ALL SIX, including the 1923 Atlas entry. Every feature carries
 *      `value`, `units`, **`color`** and `weight`: the colours on this map are
 *      USGS's own, not a palette invented here.
 *    · `download/coverage_<metric>_low_res.covjson` — CoverageJSON, a REGULAR
 *      GRID (e.g. 115×93) of the same field, 40–120 kB. This is what makes the
 *      map answer questions: any point can be sampled, so "what did this city
 *      feel" is a lookup rather than a guess from the nearest contour.
 *    · `download/grid.xml` — the full-resolution grid, and the reason it is NOT
 *      used: 10.2 MB (Napa) to 28.4 MB (Türkiye) per event. The low-res coverage
 *      carries the same field at a fraction of the bytes.
 *
 *  ⚠ CORS: `earthquake.usgs.gov` answers `access-control-allow-origin: *` with
 *  `cache-control: max-age=315360000` on these files (measured). No relay, no
 *  Edge Function — the browser reads USGS directly, exactly as js/wb-layers.js
 *  already does for the catalogue and as supabase/functions/volcano-feed notes.
 *
 *  ══ ⚠⚠ THE TRAP THAT WOULD HAVE PAINTED A LIE ══════════════════════════════
 *  The contour files and the coverage grids DO NOT SHARE UNITS. `cont_pga.json`
 *  says `units:"pctg"` and `cont_pgv.json` says `"cms"`, but the covjson for the
 *  same two metrics declares `unit.symbol.value = "ln(g)"` and `"ln(cm/s)"` —
 *  the grid holds NATURAL LOGARITHMS. (Napa: grid max −0.650 → exp → 0.52 g.)
 *  MMI is the exception and carries no unit at all, because it is a scale.
 *  So a single "sample the grid and print it" would report −0.65 g of shaking.
 *  Everything numeric this file reports therefore passes through `_toContourUnit`,
 *  which reads the covjson's OWN declared symbol and undoes exactly the transform
 *  that symbol names. A symbol it does not recognise is refused, not guessed.
 *
 *  ══ WHAT IS PAINTED AS A SURFACE, AND WHY IT IS NOT A CHOICE MADE HERE ═════
 *  Only MMI's covjson carries `preferredPalette` (`colors[11]`, `extent:[0,10]`,
 *  `interpolation:"linear"`). PGA, PGV and the SA periods carry none. So the rule
 *  is upstream's: **a metric is painted as a field when USGS ships the colours to
 *  paint it with**, and every metric is drawn as contours because every contour
 *  file ships its own per-level colour. Nothing in this file names a metric.
 *  The roster, the labels ("MMI", "PGA", "SA(0.3)") and the descriptions all come
 *  out of the product — add a metric upstream and it appears here.
 *
 *  ⚠ WHERE THE PAINT STOPS is also upstream's number, not a threshold invented
 *  here: the field fades out below the LOWEST CONTOUR LEVEL USGS chose to draw
 *  (2.5 for MMI on every event measured). USGS's own intensity JPEG paints the
 *  whole rectangle, which on a world map reads as a coloured slab with corners;
 *  ending the paint where the source's own lowest line ends makes the surface and
 *  the contours agree by construction. With no contours the palette decides: the
 *  leading run of pure white in `preferredPalette` is "nothing here".
 *
 *  ══ THE IMAGE IS RESAMPLED INTO MERCATOR, AND IT HAS TO BE ═════════════════
 *  A CoverageJSON grid is linear in LATITUDE. A maplibre `image` source maps four
 *  corners into WEB MERCATOR. Handing the grid over unresampled slides every row
 *  toward the equator — visible as soon as the footprint is a few degrees tall.
 *  `_render` therefore walks output rows in Mercator y, inverts to latitude and
 *  samples the grid there (js/seismic.js:1265 keeps `mY`/`latOfY` for the same
 *  reason; this file needs them before that module is ever loaded).
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.shakeMap = function (HOST) {
  const GE = () => window.IntMapGeoEngine;
  const LA = window.IntMapLang.pickArgs();
  const _LT = window.IntMapLang.pick(() => HOST.lang);
  /* ⚠ FIVE ARGUMENTS — en, ja, de, ru, es — AND THE OTHER FOUR LANGUAGES COME
     FROM THE `inline` TABLES, keyed by the English string (js/locales/ui.{fr,ko,
     zh,zh-hans}.js). Nine were written here first, and both reasons to stop are
     real: `scripts/i18n-report.mjs` counts argument 0 into the inline denominator
     whatever the arity, so fr/ko/zh needed their table rows ANYWAY and the tuple's
     tail was a second home for a fact that already had one; and only the FIRST
     FIVE positions are fixed (js/lang-registry.js:66). Positions 6-9 are whatever
     order `codes.sort()` puts the locale files in (src/locale-boot.js:58), so one
     new locale sorting before `fr` would hand French readers Korean.
     ⚠ AND EVERY TUPLE IS WRITTEN `_LT.arr(LA(…))` AT THE CALL SITE, never through
     a local wrapper. `scripts/i18n-pair-audit.mjs` finds a tuple by the identifier
     it is passed to — one bound directly to `IntMapLang.pickArgs()` / `.pick()` /
     `.t` — so a one-line helper of one's own, however tidy, hides every string
     from the instrument and lands them in the "adjacent data slots" gap that
     Architecture.md §10.1 grants to exactly one file for exactly one reason
     (#R246). Measured here: 16 tuples invisible before that was undone. */

  const DETAIL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/detail/';
  /* The two file families, DISCOVERED rather than listed. The capture is the metric
     stem exactly as USGS spells it (mmi, pga, pgv, psa0p3, …) — never written here. */
  const RE_CONT = /^download\/cont_([a-z0-9]+)\.json$/;
  const RE_COV = /^download\/coverage_([a-z0-9]+)_(low|medium|high)_res\.covjson$/;

  const SRC_IMG = 'shk-field-src', LYR_IMG = 'shk-field';
  const SRC_LN = 'shk-cont-src', LYR_LN = 'shk-cont', LYR_LB = 'shk-cont-lbl';
  const LAYER_IDS = [LYR_IMG, LYR_LN, LYR_LB];

  const D = Math.PI / 180;
  const mY = lat => (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + lat * D / 2))) / 360;
  const latOfY = y => 360 / Math.PI * Math.atan(Math.exp((180 - y * 360) * D)) - 90;
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

  let cur = null;          /* the open ShakeMap, or null */
  let opacity = 0.72;
  let imgURL = '';         /* live object URL — pinned until revoked */
  const _revoke = u => { try { if (u && u.indexOf('blob:') === 0) URL.revokeObjectURL(u); } catch (_) { } };

  function getJSON(url) { return fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }

  /* ── the product ─────────────────────────────────────────────────────────
     A detail feed can carry SEVERAL shakemap products from different networks
     (measured on us7000tdvt: `us` weight 231 and `ak` weight 79 for the same
     quake). USGS states its own preference in `preferredWeight`; taking [0]
     works today only because the feed happens to be sorted by it. */
  function preferred(list) {
    let best = null;
    (list || []).forEach(p => { const w = +(p && p.preferredWeight); if (!best || (isFinite(w) && w > (+best.preferredWeight || -Infinity))) best = p; });
    return best;
  }

  /* ── the metric roster, discovered from the product's own file list ───────
     ⚠ `cont_mi.json` is a byte-for-byte alias of `cont_mmi.json` (identical
     `length` on all six events measured, 1923–2026) and has NO coverage grid of
     its own. Two identical entries in a picker is a defect, so equal-length
     contour files collapse to the one that also has a grid — the one this app can
     paint and sample. If USGS ever gives `mi` a grid of its own, or the two files
     stop being identical, both survive and both appear: the rule is about what
     the product SAYS, not about the spelling "mi". */
  function roster(prod) {
    const c = (prod && prod.contents) || {}, cont = {}, cov = {};
    Object.keys(c).forEach(k => {
      let m = RE_CONT.exec(k); if (m) { cont[m[1]] = { url: c[k].url, bytes: +c[k].length || 0 }; return; }
      m = RE_COV.exec(k); if (m) { (cov[m[1]] = cov[m[1]] || {})[m[2]] = { url: c[k].url, bytes: +c[k].length || 0 }; }
    });
    const out = [];
    Object.keys(cont).forEach(k => {
      const dup = Object.keys(cont).filter(o => o !== k && cont[o].bytes === cont[k].bytes && cont[o].bytes > 0);
      if (dup.length && !cov[k] && dup.some(o => cov[o])) return;   /* the alias without a grid */
      out.push({ key: k, cont: cont[k], cov: cov[k] || null });
    });
    /* ORDER — and the first entry is the one that opens, so this is not cosmetic.
       The product states its own order in its `max*` summary properties
       (`maxmmi, maxpga, maxpgv, maxpsa03, …` — measured), which is USGS putting
       intensity first. The only spelling difference between the two families is
       that a filename writes a decimal point as `p` (`psa0p3` ↔ `maxpsa03`), so
       one transform — not a table of names — lines them up. A stem with no `max`
       property keeps its file order behind the ones that have one. */
    const props = Object.keys((prod && prod.properties) || {});
    const rank = k => { const i = props.indexOf('max' + k.replace(/(\d)p(\d)/g, '$1$2')); return i < 0 ? 1e9 : i; };
    out.sort((a, b) => ((b.cov ? 1 : 0) - (a.cov ? 1 : 0)) || (rank(a.key) - rank(b.key)));
    return out;
  }

  /* ── units ───────────────────────────────────────────────────────────────
     The covjson declares its own unit symbol. Undo exactly what the symbol says
     and nothing else; an unrecognised symbol means this file cannot honestly
     convert, so it reports `ok:false` instead of printing a raw number under a
     label that would be false. */
  function _toContourUnit(sym) {
    if (!sym) return { f: v => v, ok: true, unit: '' };              /* MMI: a scale, no unit */
    const s = String(sym).trim();
    const m = /^ln\((.+)\)$/.exec(s);
    if (m) { const inner = m[1]; return { f: v => Math.exp(v) * (inner === 'g' ? 100 : 1), ok: true, unit: inner === 'g' ? 'pctg' : inner }; }
    return { f: v => v, ok: false, unit: s };
  }

  /* ── the grid ────────────────────────────────────────────────────────────*/
  function readCoverage(j) {
    const dom = j && j.domain; if (!dom || !dom.axes || !dom.axes.x || !dom.axes.y) return null;
    const ax = dom.axes, pk = Object.keys((j && j.parameters) || {})[0]; if (!pk) return null;
    const P = j.parameters[pk], rg = (j.ranges || {})[pk]; if (!rg || !rg.values) return null;
    const nx = +ax.x.num, ny = +ax.y.num; if (!(nx > 1 && ny > 1)) return null;
    const u = _toContourUnit(P.unit && P.unit.symbol && P.unit.symbol.value);
    return {
      param: pk, desc: (P.description && P.description.en && P.description.en[0]) || pk,
      x0: +ax.x.start, x1: +ax.x.stop, y0: +ax.y.start, y1: +ax.y.stop, nx: nx, ny: ny,
      v: rg.values, palette: P.preferredPalette || null, conv: u,
      /* bilinear, in the grid's OWN units (i.e. still ln for PGA/PGV) */
      raw(lon, lat) {
        const fx = (lon - this.x0) / (this.x1 - this.x0) * (this.nx - 1);
        const fy = (lat - this.y0) / (this.y1 - this.y0) * (this.ny - 1);
        if (!(fx >= -0.5 && fy >= -0.5 && fx <= this.nx - 0.5 && fy <= this.ny - 0.5)) return null;
        const i = clamp(Math.floor(fx), 0, this.nx - 2), jj = clamp(Math.floor(fy), 0, this.ny - 2);
        const tx = clamp(fx - i, 0, 1), ty = clamp(fy - jj, 0, 1), g = (b, a) => this.v[b * this.nx + a];
        const a = g(jj, i), b = g(jj, i + 1), c = g(jj + 1, i), d = g(jj + 1, i + 1);
        if (a == null || b == null || c == null || d == null) return null;
        return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      },
      at(lon, lat) { const r = this.raw(lon, lat); return r == null ? null : this.conv.f(r); }
    };
  }

  function parsePalette(pal) {
    if (!pal || !Array.isArray(pal.colors) || pal.colors.length < 2) return null;
    const cols = pal.colors.map(s => { const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(String(s)); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; });
    const ex = Array.isArray(pal.extent) && pal.extent.length === 2 ? [+pal.extent[0], +pal.extent[1]] : null;
    if (!ex || !(ex[1] > ex[0])) return null;
    let white = 0; while (white < cols.length && cols[white][0] === 255 && cols[white][1] === 255 && cols[white][2] === 255) white++;
    return { cols: cols, lo: ex[0], hi: ex[1], whiteTo: white ? ex[0] + (white - 1) / (cols.length - 1) * (ex[1] - ex[0]) : null };
  }

  /* ── the surface ─────────────────────────────────────────────────────────*/
  const PIX_MAX = 1600;
  function _render(grid, pal, fadeAt, fadeTo) {
    const W = clamp(Math.round(grid.nx * 4), 64, PIX_MAX), H = clamp(Math.round(grid.ny * 4), 64, PIX_MAX);
    let cv = null, ctx = null;
    try { cv = document.createElement('canvas'); cv.width = W; cv.height = H; ctx = cv.getContext('2d'); } catch (_) { return null; }
    if (!ctx) return null;
    const im = ctx.createImageData(W, H), px = im.data;
    const north = Math.max(grid.y0, grid.y1), south = Math.min(grid.y0, grid.y1);
    const west = Math.min(grid.x0, grid.x1), east = Math.max(grid.x0, grid.x1);
    const yN = mY(north), yS = mY(south), n = pal.cols.length;
    for (let r = 0; r < H; r++) {
      const lat = latOfY(yN + (yS - yN) * (r + 0.5) / H);
      for (let c = 0; c < W; c++) {
        const lon = west + (east - west) * (c + 0.5) / W;
        const v = grid.at(lon, lat), o = (r * W + c) * 4;
        if (v == null) { px[o + 3] = 0; continue; }
        const t = clamp((v - pal.lo) / (pal.hi - pal.lo), 0, 1) * (n - 1);
        const i = clamp(Math.floor(t), 0, n - 2), f = t - i, A = pal.cols[i], B = pal.cols[i + 1];
        px[o] = A[0] + (B[0] - A[0]) * f; px[o + 1] = A[1] + (B[1] - A[1]) * f; px[o + 2] = A[2] + (B[2] - A[2]) * f;
        /* ⚠ (#R226) NO ALPHA IS BAKED IN ABOVE THE FADE. A second transparency
           multiplied into the pixels is why an opacity control could never reach
           100 % in the simulator; here the only knob is `raster-opacity`. */
        px[o + 3] = v <= fadeAt ? 0 : (v >= fadeTo ? 255 : Math.round(255 * (v - fadeAt) / (fadeTo - fadeAt)));
      }
    }
    ctx.putImageData(im, 0, 0);
    return { cv: cv, coords: [[west, north], [east, north], [east, south], [west, south]] };
  }

  function pngURL(cv) {
    return new Promise(res => {
      try { if (cv.toBlob) { cv.toBlob(b => { try { res(b ? URL.createObjectURL(b) : cv.toDataURL('image/png')); } catch (_) { res(cv.toDataURL('image/png')); } }, 'image/png'); return; } } catch (_) { }
      try { res(cv.toDataURL('image/png')); } catch (_) { res(''); }
    });
  }

  /* below the basemap's own labels, above whatever the reader had (#R520 habit) */
  function beforeId() {
    const want = ['ofm-country', 'ofm-city', 'ofm-other', 'tool-poly', 'eq-pt'];
    for (let i = 0; i < want.length; i++) { try { if (GE().layers.has(want[i])) return want[i]; } catch (_) { } }
    return undefined;
  }

  function clearMap() {
    LAYER_IDS.forEach(id => { try { if (GE().layers.has(id)) GE().layers.remove(id); } catch (_) { } });
    [SRC_IMG, SRC_LN].forEach(s => { try { if (GE().layers.hasSource(s)) GE().layers.removeSource(s); } catch (_) { } });
    _revoke(imgURL); imgURL = '';
  }

  /* the field belongs to ONE metric — switching metric must not leave the old
     surface lying under the new lines */
  function clearField() {
    try { if (GE().layers.has(LYR_IMG)) GE().layers.remove(LYR_IMG); } catch (_) { }
    try { if (GE().layers.hasSource(SRC_IMG)) GE().layers.removeSource(SRC_IMG); } catch (_) { }
  }

  function drawContours(fc) {
    try {
      if (GE().layers.hasSource(SRC_LN)) { GE().layers.setSourceData(SRC_LN, fc); return; }
      GE().layers.addSource(SRC_LN, { type: 'geojson', data: fc, attribution: 'USGS ShakeMap' });
      const bid = beforeId();
      GE().layers.add({
        id: LYR_LN, type: 'line', source: SRC_LN,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#8e8e93'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.8, 6, 1.6, 10, 2.6],
          'line-opacity': 0.95
        }
      }, bid);
      GE().layers.add({
        id: LYR_LB, type: 'symbol', source: SRC_LN,
        layout: { 'symbol-placement': 'line-center', 'text-field': ['to-string', ['get', 'label']], 'text-size': 11, 'text-allow-overlap': false },
        paint: { 'text-color': '#1c1c1e', 'text-halo-color': 'rgba(255,255,255,0.9)', 'text-halo-width': 1.6 }
      }, bid);
    } catch (_) { }
  }

  function drawField(img) {
    try {
      if (GE().layers.hasSource(SRC_IMG)) {
        const ok = GE().layers.updateImage && GE().layers.updateImage(SRC_IMG, { url: img.url, coordinates: img.coords });
        if (ok === false) clearField();
      }
      if (!GE().layers.hasSource(SRC_IMG)) {
        /* ⚠ NO `attribution` ON THIS ONE, AND THE OMISSION IS MEASURED. The style
           spec gives an `image` source exactly two properties — `url` and
           `coordinates` — so maplibre's source validation rejects the extra key
           and the whole call lands in the catch below. Nothing throws where a
           reader can see it: the contours drew, the legend appeared, `open` was
           true, and the intensity surface was simply never there (observed in a
           real browser this round, `painted:false` with everything else right).
           The GeoJSON source above is a different type and does take it, and it
           is the one that carries the credit for both. */
        GE().layers.addSource(SRC_IMG, { type: 'image', url: img.url, coordinates: img.coords });
        GE().layers.add({ id: LYR_IMG, type: 'raster', source: SRC_IMG, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 } },
          GE().layers.has(LYR_LN) ? LYR_LN : beforeId());
      }
    } catch (_) { }
  }

  /* ── open ────────────────────────────────────────────────────────────────*/
  async function open(eventId, metricWanted) {
    const id = String(eventId || '').trim();
    if (!id) throw new Error('no event id');
    let head = (cur && cur.id === id) ? cur : null;
    if (!head) {
      const dj = await getJSON(DETAIL + encodeURIComponent(id) + '.geojson');
      const pr = (dj.properties || {}), prod = preferred((pr.products || {}).shakemap);
      const mets = prod ? roster(prod) : [];
      if (!mets.length) { const e = new Error('no shakemap for ' + id); e.code = 'NO_SHAKEMAP'; throw e; }
      const pp = prod.properties || {};
      head = {
        id: id, prod: prod, metrics: mets, metric: null, grid: null, cont: null, pal: null, img: null,
        place: pr.place || '', mag: pr.mag, time: pr.time,
        maxmmi: isFinite(+pp['maxmmi']) ? +pp['maxmmi'] : null,
        bbox: [+pp['minimum-longitude'], +pp['minimum-latitude'], +pp['maximum-longitude'], +pp['maximum-latitude']]
      };
    }
    const key = (metricWanted && head.metrics.some(m => m.key === metricWanted)) ? metricWanted : (head.metric || head.metrics[0].key);
    const met = head.metrics.filter(m => m.key === key)[0];
    /* contours first: the smallest file, and the only one every metric has */
    const cj = await getJSON(met.cont.url);
    let units = '';
    const lows = [];
    (cj.features || []).forEach(f => {
      const p = f.properties || {}; if (!units && p.units) units = p.units;
      if (isFinite(+p.value)) lows.push(+p.value);
      p.label = (+p.value === Math.round(+p.value)) ? String(Math.round(+p.value)) : String(+p.value);
    });
    let grid = null, pal = null, img = null;
    if (met.cov && (met.cov.low || met.cov.medium)) {
      try { grid = readCoverage(await getJSON((met.cov.low || met.cov.medium).url)); } catch (_) { grid = null; }
    }
    if (grid) {
      pal = parsePalette(grid.palette);
      if (pal) {
        /* the fade-out point is upstream's lowest drawn contour, or — with no
           contours at all — the top of the palette's own leading run of white */
        const sorted = lows.slice().sort((a, b) => a - b);
        const lo = sorted.length ? sorted[0] : null;
        const step = sorted.length > 1 ? (sorted[1] - sorted[0]) : (pal.hi - pal.lo) / (pal.cols.length - 1);
        const fadeAt = (lo != null) ? (lo - step) : (pal.whiteTo != null ? pal.whiteTo : pal.lo);
        const r = _render(grid, pal, fadeAt, fadeAt + Math.max(step, 1e-6));
        if (r) { const u = await pngURL(r.cv); if (u) { _revoke(imgURL); imgURL = u; img = { url: u, coords: r.coords }; } }
      }
    }
    clearField();
    head.metric = key; head.grid = grid; head.cont = cj; head.pal = pal; head.img = img; head.units = units;
    head.levels = lows.slice().sort((a, b) => a - b);
    cur = head;
    drawContours(cj); if (img) drawField(img);
    fire();
    return state();
  }

  function close() { clearMap(); cur = null; mmiGrid = null; mmiFor = ''; unmountLegend(); fire(); return true; }
  function setOpacity(v) {
    opacity = clamp(+v, 0, 1) || 0;
    try { if (GE().layers.has(LYR_IMG)) GE().layers.setPaint(LYR_IMG, 'raster-opacity', opacity); } catch (_) { }
    return opacity;
  }

  function fire() { try { window.dispatchEvent(new CustomEvent('intmap:shakemap', { detail: state() })); } catch (_) { } }

  /* ── what Atlas and the panel read ───────────────────────────────────────
     ⚠ (#R534) `painted` ASKS THE MAP, it does not report that a key exists. An
     open ShakeMap whose metric has no palette is `open:true, painted:false`, and
     those are two different sentences for Atlas to say. */
  function painted() { try { return !!(cur && cur.img && GE().layers.has(LYR_IMG)); } catch (_) { return false; } }
  function state() {
    if (!cur) return { open: false, painted: false, eventId: null, metric: null, metrics: [] };
    return {
      open: true, painted: painted(),
      eventId: cur.id, place: cur.place, mag: cur.mag, time: cur.time,
      metric: cur.metric, metricLabel: cur.grid ? cur.grid.param : String(cur.metric).toUpperCase(),
      metricName: cur.grid ? cur.grid.desc : '', metrics: cur.metrics.map(m => m.key),
      units: cur.units || '', levels: cur.levels || [], maxmmi: cur.maxmmi, bbox: cur.bbox,
      samplable: !!cur.grid, source: 'USGS ShakeMap'
    };
  }

  /* the value of the OPEN metric at a point, in the contour files' units */
  function valueAt(lon, lat) { return (cur && cur.grid) ? cur.grid.at(+lon, +lat) : null; }

  /* MMI specifically — the scale the exposure questions are asked in. Loads the
     MMI grid on demand when the open metric is a different one, so "who felt VI"
     does not depend on which layer the reader happens to be looking at. */
  let mmiGrid = null, mmiFor = '';
  async function mmiGridOf() {
    if (!cur) return null;
    if (cur.grid && cur.grid.param === 'MMI') return cur.grid;
    if (mmiGrid && mmiFor === cur.id) return mmiGrid;
    const m = cur.metrics.filter(x => x.cov && (x.cov.low || x.cov.medium) && /^m?mi$/.test(x.key))[0];
    if (!m) return null;
    try { mmiGrid = readCoverage(await getJSON((m.cov.low || m.cov.medium).url)); mmiFor = cur.id; } catch (_) { mmiGrid = null; }
    return mmiGrid;
  }

  /* ── exposure: WHO was inside which shaking ──────────────────────────────
     The only large point set this app has bundled is the gazetteer (GeoNames
     cities1000 — js/gazetteer.js, 147,924 rows). So this counts NAMED CITIES and
     sums THEIR populations; it is not a population raster and does not claim to
     be, and `basis` says so to every caller that prints a number. */
  async function exposure(minMMI, limit) {
    const g = await mmiGridOf();
    if (!g) return { ok: false, why: 'no-mmi-grid' };
    let rows = [];
    try { await window.IntMapGazetteer.warm(); rows = window.IntMapGazetteer.world() || []; } catch (_) { rows = []; }
    if (!rows.length) return { ok: false, why: 'no-gazetteer' };
    const cut = isFinite(+minMMI) ? +minMMI : 6;
    const west = Math.min(g.x0, g.x1), east = Math.max(g.x0, g.x1);
    const south = Math.min(g.y0, g.y1), north = Math.max(g.y0, g.y1);
    const hit = []; let pop = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], lon = +r[2], lat = +r[3];
      if (!(lon >= west && lon <= east && lat >= south && lat <= north)) continue;
      const v = g.at(lon, lat); if (v == null || v < cut) continue;
      const p = +r[6] || 0; pop += p;
      hit.push({ name: r[4], nameJa: r[5], lon: lon, lat: lat, pop: p, iso2: r[7], mmi: Math.round(v * 10) / 10 });
    }
    hit.sort((a, b) => (b.mmi - a.mmi) || (b.pop - a.pop));
    return {
      ok: true, minMMI: cut, cities: hit.length, population: pop,
      top: hit.slice(0, clamp(Math.round(+limit) || 12, 1, 200)),
      basis: 'named cities in the GeoNames cities1000 gazetteer, sampled against the USGS ShakeMap MMI grid — not a population raster',
      source: 'USGS ShakeMap · GeoNames'
    };
  }

  /* the nine-language sentence a caller prints under a number from `exposure` */
  function basisNote() {
    return _LT.arr(LA(
      'Counted by sampling the USGS ShakeMap intensity grid at each named city in the GeoNames gazetteer. It is the population of those cities, not everyone inside the contour.',
      'GeoNames の地名辞典にある各都市の位置で USGS ShakeMap の震度グリッドを標本化して数えた値。等値線の内側にいる全員ではなく、それらの都市の人口。',
      'Gezählt, indem das USGS-ShakeMap-Intensitätsraster an jeder benannten Stadt des GeoNames-Verzeichnisses abgetastet wird. Es ist die Einwohnerzahl dieser Städte, nicht jeder Mensch innerhalb der Kontur.',
      'Подсчитано выборкой сетки интенсивности USGS ShakeMap в точках названных городов из справочника GeoNames. Это население этих городов, а не все, кто оказался внутри изолинии.',
      'Calculado muestreando la malla de intensidad del ShakeMap del USGS en cada ciudad nombrada del nomenclátor GeoNames. Es la población de esas ciudades, no todas las personas dentro de la curva.'));
  }

  /* the legend rows — value, colour and unit all out of the contour file */
  function legend() {
    if (!cur || !cur.cont) return [];
    const seen = {}, out = [];
    (cur.cont.features || []).forEach(f => {
      const p = f.properties || {}, v = +p.value;
      if (!isFinite(v) || seen[v]) return; seen[v] = 1;
      out.push({ value: v, color: p.color || '#8e8e93', units: p.units || '' });
    });
    return out.sort((a, b) => a.value - b.value);
  }

  /* ── the legend row ──────────────────────────────────────────────────────
     Rendered into the app's OWN generic legend box (js/data-layers.js
     `_registerLayerOpacity`), not into a window of its own: the reader already
     has one place where a layer's name, its opacity slider and its swatches
     live, and a second one would be a second habit to learn. The opacity slider
     is pointed at the painted field only — the contour lines are the readable
     part and must not fade with it. */
  const LEG_ID = 'shk';
  function legendName() {
    const s = state();
    return _LT.arr(LA('ShakeMap (USGS)', 'ShakeMap（USGS）', 'ShakeMap (USGS)', 'ShakeMap (USGS)', 'ShakeMap (USGS)')) + (s.metricLabel ? (' · ' + s.metricLabel) : '');
  }
  function fmt(v) { try { return Number(v).toLocaleString(HOST.lang || undefined); } catch (_) { return String(v); } }
  function mountLegend() {
    if (!cur || !window._registerLayerOpacity) return null;
    const el = window._registerLayerOpacity(LEG_ID, legendName(), [LYR_IMG]);
    if (!el) return null;
    let box = el.querySelector('.shk-ctl');
    if (!box) { box = document.createElement('div'); box.className = 'shk-ctl'; box.style.cssText = 'margin-top:6px;'; el.appendChild(box); }
    const s = state();
    const btn = (k, on) => '<button data-shk-m="' + IntMapSafe.html(k) + '" style="border:1px solid rgba(128,128,128,0.3);background:' + (on ? 'var(--primary-color)' : 'var(--input-bg)') + ';color:' + (on ? '#fff' : 'var(--text-main)') + ';border-radius:7px;padding:4px 7px;font-size:10.5px;font-weight:600;cursor:pointer;">' + IntMapSafe.html(k.toUpperCase()) + '</button>';
    const sw = legend().map(r => '<span style="display:inline-flex;align-items:center;gap:4px;margin:0 7px 3px 0;font-size:10px;color:var(--text-muted);"><i style="width:11px;height:11px;border-radius:2px;background:' + IntMapSafe.html(r.color) + ';display:inline-block;"></i>' + IntMapSafe.html(fmt(r.value) + (r.units && r.units !== 'mmi' ? (' ' + r.units) : '')) + '</span>').join('');
    box.innerHTML = '<div style="display:flex;gap:5px;flex-wrap:wrap;">' + s.metrics.map(k => btn(k, k === s.metric)).join('') + '</div>'
      + '<div style="margin-top:6px;line-height:1.5;">' + sw + '</div>'
      + '<div style="font-size:9.5px;color:var(--text-muted);margin-top:4px;line-height:1.4;">' + IntMapSafe.html((s.metricName || '') + (s.place ? (' · ' + s.place) : '')) + '</div>'
      + (s.painted ? '' : '<div style="font-size:9.5px;color:var(--text-muted);margin-top:3px;line-height:1.4;">' + IntMapSafe.html(_LT.arr(LA(
        'USGS ships no colour scale for this measure, so it is drawn as contour lines only.',
        'この指標には USGS が色表を配っていないため、等値線のみで描画しています。',
        'Für diese Größe liefert USGS keine Farbskala, daher wird sie nur als Isolinien gezeichnet.',
        'Для этой величины USGS не публикует цветовую шкалу, поэтому она нарисована только изолиниями.',
        'El USGS no publica una escala de color para esta medida, por lo que se dibuja solo con isolíneas.'))) + '</div>')
      + '<div style="margin-top:7px;"><button data-shk-x="1" style="border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);color:var(--text-main);border-radius:7px;padding:4px 9px;font-size:10.5px;cursor:pointer;">' + IntMapSafe.html(_LT.arr(LA('Close ShakeMap', 'ShakeMap を閉じる', 'ShakeMap schließen', 'Закрыть ShakeMap', 'Cerrar ShakeMap'))) + '</button></div>';
    box.querySelectorAll('[data-shk-m]').forEach(b => { b.onclick = () => { open(cur.id, b.getAttribute('data-shk-m')).then(mountLegend).catch(() => { }); }; });
    const x = box.querySelector('[data-shk-x]'); if (x) x.onclick = () => { close(); };
    return el;
  }
  function unmountLegend() { try { window._hideGenericLegend && window._hideGenericLegend(LEG_ID); } catch (_) { } }

  /* one door for the map's click handler: load, draw, and show the legend */
  async function show(eventId, metric) { const s = await open(eventId, metric); try { mountLegend(); } catch (_) { } return s; }

  /* ── the Atlas capability (map.shakemap) ─────────────────────────────────
     ⚠ THIS LIVES HERE AND NOT IN js/atlas-console.js because that file is at its
     line ceiling (tests/r318 ⓑ, 4,910) — the dispatch there is ONE line that
     lazy-loads this module and calls in. */
  const FDSN = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
  /* Resolve an event when the caller has a description instead of an id. USGS's
     own catalogue is the resolver: a time window (and/or a magnitude floor) is a
     real query, and `place` is matched against the strings USGS itself writes,
     never against a name this file invented. */
  async function resolveEvent(a) {
    const q = ['format=geojson', 'orderby=magnitude', 'limit=200'];
    if (a.from) q.push('starttime=' + encodeURIComponent(a.from));
    if (a.to) q.push('endtime=' + encodeURIComponent(a.to));
    q.push('minmagnitude=' + (isFinite(+a.minMagnitude) ? +a.minMagnitude : 5));
    const j = await getJSON(FDSN + '?' + q.join('&'));
    let list = j.features || [];
    const want = String(a.place || '').trim().toLowerCase();
    if (want) {
      const hit = list.filter(f => String((f.properties || {}).place || '').toLowerCase().indexOf(want) >= 0);
      if (!hit.length) return null;
      list = hit;
    }
    return list.length ? list[0].id : null;
  }

  function _line(k, v) { return '<div style="font-size:12.5px;line-height:1.6;">' + IntMapSafe.html(k) + ': <b>' + IntMapSafe.html(v) + '</b></div>'; }

  async function run(a) {
    a = a || {};
    const act = String(a.action || 'open').toLowerCase();
    if (act === 'close') { close(); return { ok: true, html: _LT.arr(LA('ShakeMap closed.', 'ShakeMap を閉じました。', 'ShakeMap geschlossen.', 'ShakeMap закрыт.', 'ShakeMap cerrado.')) }; }
    let id = a.eventId ? String(a.eventId).trim() : '';
    if (!id && cur && (act === 'exposure' || act === 'metric')) id = cur.id;
    if (!id) id = await resolveEvent(a);
    if (!id) return { ok: false, html: _LT.arr(LA('No earthquake in the USGS catalogue matched that description.', 'その条件に一致する地震が USGS のカタログにありませんでした。', 'Kein Beben im USGS-Katalog passt zu dieser Beschreibung.', 'В каталоге USGS нет землетрясения, отвечающего этому описанию.', 'Ningún sismo del catálogo del USGS coincide con esa descripción.')), meta: { code: 'not_found' } };
    let s;
    try { s = await show(id, a.metric); }
    catch (e) {
      const no = e && e.code === 'NO_SHAKEMAP';
      return {
        ok: false, meta: { code: no ? 'no_shakemap' : 'failed' },
        html: no ? _LT.arr(LA('USGS published no ShakeMap for that earthquake — only a catalogue entry (location, depth, magnitude).', 'その地震について USGS は ShakeMap を公開しておらず、カタログの記載（位置・深さ・規模）だけがあります。', 'Für dieses Beben hat USGS keine ShakeMap veröffentlicht — nur einen Katalogeintrag (Ort, Tiefe, Magnitude).', 'Для этого землетрясения USGS не публиковал ShakeMap — есть только запись каталога (место, глубина, магнитуда).', 'El USGS no publicó un ShakeMap de ese sismo: solo hay entrada de catálogo (ubicación, profundidad, magnitud).'))
          : _LT.arr(LA('Could not load the ShakeMap.', 'ShakeMap を取得できませんでした。', 'ShakeMap konnte nicht geladen werden.', 'Не удалось загрузить ShakeMap.', 'No se pudo cargar el ShakeMap.'))
      };
    }
    if (act === 'exposure') {
      const ex = await exposure(a.minMMI, a.limit);
      if (!ex.ok) return { ok: false, html: _LT.arr(LA('This ShakeMap carries no intensity grid, so who felt what cannot be counted from it.', 'この ShakeMap には震度グリッドが無いため、誰がどれだけ揺れたかを数えることはできません。', 'Diese ShakeMap enthält kein Intensitätsraster, daher lässt sich daraus nicht zählen, wer was gespürt hat.', 'В этой ShakeMap нет сетки интенсивности, поэтому по ней нельзя посчитать, кто что почувствовал.', 'Este ShakeMap no trae malla de intensidad, así que no puede contarse quién sintió qué.')), meta: { code: ex.why } };
      const names = ex.top.map(c => c.name + ' (' + c.mmi + ')').join(', ');
      return {
        ok: true, meta: { code: 'ok', shakemap: s, exposure: { minMMI: ex.minMMI, cities: ex.cities, population: ex.population, top: ex.top, basis: ex.basis } },
        html: _line(_LT.arr(LA('Shaking at or above MMI', '震度（MMI）以上', 'Erschütterung ab MMI', 'Сотрясения от MMI', 'Sacudida desde MMI')), String(ex.minMMI))
          + _line(_LT.arr(LA('Cities', '都市', 'Städte', 'Города', 'Ciudades')), fmt(ex.cities))
          + _line(_LT.arr(LA('Population of those cities', 'それらの都市の人口', 'Einwohner dieser Städte', 'Население этих городов', 'Población de esas ciudades')), fmt(ex.population))
          + (names ? '<div style="font-size:11.5px;line-height:1.6;color:var(--text-muted);margin-top:3px;">' + IntMapSafe.html(names) + '</div>' : '')
          + '<div style="font-size:10px;line-height:1.5;color:var(--text-muted);margin-top:5px;">' + IntMapSafe.html(basisNote()) + '</div>'
      };
    }
    return {
      ok: true, meta: { code: 'ok', shakemap: s },
      html: _line(_LT.arr(LA('ShakeMap', 'ShakeMap', 'ShakeMap', 'ShakeMap', 'ShakeMap')), (s.mag != null ? ('M' + Number(s.mag).toFixed(1) + ' · ') : '') + (s.place || s.eventId))
        + _line(_LT.arr(LA('Measure drawn', '描画した指標', 'Dargestellte Größe', 'Показанная величина', 'Medida dibujada')), s.metricLabel + (s.metricName ? (' — ' + s.metricName) : ''))
        + (s.maxmmi != null ? _line(_LT.arr(LA('Peak intensity (MMI)', '最大震度（MMI）', 'Höchste Intensität (MMI)', 'Максимальная интенсивность (MMI)', 'Intensidad máxima (MMI)')), String(s.maxmmi)) : '')
        + '<div style="font-size:10px;line-height:1.5;color:var(--text-muted);margin-top:5px;">' + IntMapSafe.html(_LT.arr(LA(
          'USGS ShakeMap — ground motion estimated from recordings, felt reports and site conditions, not a drawing of the magnitude.',
          'USGS ShakeMap — 観測記録・体感報告・地盤条件から推定した地震動であり、マグニチュードを図にしたものではない。',
          'USGS ShakeMap — aus Aufzeichnungen, Wahrnehmungsmeldungen und Untergrundbedingungen geschätzte Bodenbewegung, keine Zeichnung der Magnitude.',
          'USGS ShakeMap — движение грунта, оценённое по записям, сообщениям очевидцев и грунтовым условиям, а не изображение магнитуды.',
          'USGS ShakeMap: movimiento del suelo estimado a partir de registros, reportes de percepción y condiciones del sitio; no es un dibujo de la magnitud.'))) + '</div>'
    };
  }

  return {
    open, close, state, valueAt, exposure, legend, basisNote, setOpacity, painted, show, mountLegend, run, resolveEvent,
    metrics: () => (cur ? cur.metrics.map(m => m.key) : []),
    layerIds: () => LAYER_IDS.slice(),
    _roster: roster, _readCoverage: readCoverage, _parsePalette: parsePalette,
    _toContourUnit: _toContourUnit, _preferred: preferred, _render: _render, _mercY: mY, _latOfY: latOfY
  };
};
