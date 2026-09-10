/* ============================================================================
 *  time-admin1.js — the SUBDIVISIONS of the year on the clock  (#R530, #R564, #R604)
 * ----------------------------------------------------------------------------
 *  「国境線だけでなく地方区分の境界もChronosに完全対応させるように。完全対応。」  (#R530)
 *  「歴史的地方区分境界のcoverageがまだ全然。もっと充実させろ。また、現在のものは海上に境界線が
 *    ないのに、昔のはある。それにクリック時の挙動が違う。全部同じにしろ。」        (#R564)
 *  「歴史的地方区分の境界線のcoverageがくそ。全時代、全地域で完璧に網羅しろ。
 *    線の解像度も低すぎる。」                                                    (#R604)
 *
 *  ══ ⚠⚠⚠ (#R604) BOTH COMPLAINTS WERE TRUE, AND BOTH WERE THE BUNDLE'S ══════
 *  #R564 answered 「coverage が足りない」 by measuring upstream and reporting that the
 *  thinness was OHM's. That was true of the ONE YEAR it measured (1900) and it hid two
 *  things that were entirely ours:
 *  ① THE RESOLUTION WAS THE BUILD'S, NOT UPSTREAM'S. Measured 2026-09-10 against OHM's
 *     Overpass: 伊豆国 (relation 2687374) is 2,800 vertices, 787 km of perimeter, 281 m
 *     mean spacing. The shipped bundle drew it with TWENTY-NINE — 0.02° Douglas-Peucker
 *     and 3 decimals, chosen so a world-wide polygon file stays parseable. A bundle has
 *     one resolution; a map has twenty. No tolerance fixes that, so the line stopped
 *     coming from the bundle: OHM publishes the same records as VECTOR TILES
 *     (vtiles.openhistoricalmap.org, TileJSON maps/ohm.json, z0-20, CC0) whose admin
 *     lines carry `start_decdate`/`end_decdate` as numbers. The era boundary is now
 *     drawn from those at the tile's own geometry, and travelling is a `setFilter`.
 *  ② THE ERAS WERE THE BUILD'S TOO. `--since 1850` dropped every unit that ENDED before
 *     the clock's floor, so the record held almost nothing for any earlier century — and
 *     the floor itself was 1850. Both moved: js/chronos.js reaches year 1 (#R604), the
 *     bundles are rebuilt with `--since 1` (levels 3-4: 3,049 → 4,679 units, and the number of
 *     them in force in a given June: year 1 → 64, 1000 → 113, 1500 → 393, 1800 → 411, where the
 *     old bundle held none before 1850), and the tiles were never limited to begin with.
 *  ⚠ AND THE THINNESS THAT IS REALLY UPSTREAM'S IS STILL REPORTED, NOT FILLED IN. On a
 *  160-tile z5 sweep of the tiles, dated admin_level≥3 segments in force number 936 in
 *  year 1, 3,712 in 1500 and 8,341 in 1900, touching 14, 23 and 66 of those tiles — the
 *  older the century, the more REGIONAL the record. `coverage()` counts it and the layer
 *  row says it in nine languages. A country with no line is a country the record is
 *  silent about, in every century.
 *
 *  ══ ⚠⚠⚠ WHAT #R530 FIXED, MEASURED ═════════════════════════════════════════
 *  The province layer (`ref-admin1`, js/app-body.js) is drawn from OpenFreeMap's
 *  live vector tiles and read NO clock at all. It is not in `window._applyBorders`,
 *  so travelling to 1900 hid the modern country border, drew the CShapes 1900 one —
 *  and left TODAY'S provinces on top of it, in violet dashes, as if Slovakia had
 *  had its 2026 kraje under Austria-Hungary. The label half was already right
 *  (js/place-labels.js hides `ofm-admin1` while travelling, #R198/#R103), which is
 *  precisely why the lines looked deliberate: the names went away and the wrong
 *  boundaries stayed. `git grep ref-admin1 tests/` was 0 — nothing could catch it.
 *
 *  ══ THE RULE, AND IT IS THE COUNTRY BORDER'S RULE ══════════════════════════
 *  One time machine, one behaviour. While travelling the present-day subdivision
 *  line hides and the ERA subdivisions draw, exactly as `borders-only-line` hides
 *  and `imtb-*` draws (js/time-borders.js). At Now the modern set returns.
 *  ⚠ ONE FEATURE, ONE SWITCH — and in BOTH directions. #R94g's principle, without
 *  #R94l's carve-out: `cb-admin1` governs the era units too, because a reader who
 *  switched province borders off has said what they want, and unlike the country
 *  case (where the exception exists so travelling never leaves the map border-less)
 *  honouring it here leaves the country borders and coastlines untouched.
 *
 *  ══ (#R564) THE THREE THINGS THIS ROUND CHANGED ════════════════════════════
 *  ① COVERAGE, BY DEPTH RATHER THAN BY WISHING. Measured against OHM's Overpass on
 *     2026-09-09: the first-level tier (admin_level 3-4, dated) holds 647 units in
 *     force in 1900 and the shipped bundle already had 642 of them — the thinness is
 *     UPSTREAM, not in the build, and no spelling of a date tag adds a single record
 *     (`start_date`/`end_date` already carry every one; `*_date:edtf` adds 0). What
 *     upstream does have is DEPTH: 16,323 dated relations at admin_level 5-6, 4,168
 *     of them in force in 1900. They are not first-level units and must not pretend
 *     to be, so they are a SECOND TIER on a SECOND BUNDLE, drawn only once the reader
 *     has zoomed past the first — the same map at a scale where a county is legible.
 *     ⚠ And the present-day map gains the same tier at the same zoom (`ref-admin2`),
 *     because a reader who zooms in at Now and at 1900 must be shown the same KIND of
 *     thing. Travel changes WHERE a boundary runs, never what the map is willing to
 *     show (#R212).
 *  ② THE SEA. `imta-line` stroked whole polygon rings, so every coastal province drew
 *     the record's own copy of the coastline a few kilometres out to sea — the exact
 *     defect #R531 removed from the country line, still present here because
 *     data/border-coast.js only marked the two country bundles. It now marks these two
 *     as well, the reading of those marks moved to js/border-coast.js so that one fact
 *     has one owner, and the line layers stroke a LINE source carrying only the border
 *     runs. The polygons stay in `imta-src`: they are the label anchor and the answer
 *     to a click.
 *  ③ THE CLICK. An era province label opened the same popup as a modern one and then
 *     asked IntMapOutline for «the boundary of this NAME», i.e. TODAY'S namesake — a
 *     1900 click answered with a 2026 outline, which is #R530's own defect wearing a
 *     different hat. The era polygon is right here; `geomAt()` hands it over, and
 *     js/map-ui.js passes it exactly as the era COUNTRY label has passed its own since
 *     #R94m. Same popup, same rows, and now the same claim.
 *
 *  ══ THE DATA, AND WHY IT IS THE ONLY ONE ═══════════════════════════════════
 *  data/hist-admin1.js (levels 3-4) and data/hist-admin2.js (levels 5-6) — both
 *  OpenHistoricalMap, CC0, both built by scripts/build-hist-admin1.mjs, ring-pooled in
 *  the SAME literal shape as data/cshapes.js so every module that reads a historical
 *  record reads it with one set of habits. Dates are inclusive on both ends and
 *  DAY-EXACT where OHM knows the day, so the epoch index below is CShapes' verbatim
 *  (#R421): two dates inside one epoch share a cache key, and a quiet decade
 *  re-renders nothing while a busy year steps every time something moved.
 *  The header of the build script records every other candidate that was measured
 *  and what it actually was; OHM is the only global, dated, openly-licensed one.
 *
 *  ⚠⚠ THE COVERAGE IS PARTIAL AND THE MAP SAYS SO, RATHER THAN FILLING IT IN.
 *  Measured 2026-09-09: of the 151 polities CShapes holds in 1900, 56 have any dated
 *  subdivision in OHM at all, and widening the level filter does NOT fix that — it
 *  deepens the countries already covered (67% of the added units are United States
 *  counties) and adds five countries. Two "fixes" were available and both are
 *  forbidden by CONSTITUTION §「偽物・ハリボテ禁止」: drawing a present-day province
 *  under a past date (the very bug this file exists to remove), and clipping today's
 *  provinces to the era's country (a boundary nobody ever surveyed, wearing the
 *  authority of a drawn line). `coverage()` therefore reports what IS in force, the
 *  layer row says it in nine languages, and a country the record is silent about is
 *  drawn with no subdivision line — which is the true statement.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.timeAdmin1 = function (HOST) {
  const GE = () => window.IntMapGeoEngine;   /* the renderer, through the contract — never the raw handle */
  const BC = () => window.IntMapBorderCoast; /* (#R564) which edges are border — js/border-coast.js */
  /* ⚠ (#R241/#R502) THE TUPLE IS BUILT BY `LA(…)` AND RESOLVED BY `_LT.arr(…)`, AND THOSE ARE TWO
     DIFFERENT JOBS. `pickArgs()` returns the array it is given — it exists so the strings appear to
     the translation instruments as a CallExpression rather than an invisible array literal; it does
     NOT choose one. `pick(getLang)` is the chooser, and it must be handed a live accessor because the
     app reassigns the language at runtime (#R165). Calling `LA(…)` and printing the result is how a
     nine-string tuple reaches the screen as all nine at once — measured here before the fix.
     ⚠ AND THE POSITIONS ARE en, jp, de, ru, es, zh-Hant, zh-Hans, fr, ko. Not alphabetical, and not
     the order the language menu shows: `IntMapLang.index()` reports fr=7 and ko=8 with the two
     Chinese scripts at 5 and 6, so a tuple written en/ja/de/ru/es/fr/ko/zh/zh — the natural order —
     hands French text to a Traditional-Chinese reader. */
  const LA = window.IntMapLang.pickArgs();
  const _LT = window.IntMapLang.pick(() => HOST.lang);

  /* (#R170/#R421) "Is it safe to addSource/addLayer right now?" — the app-wide predicate, and the
     wait that goes with it. Both are the shapes js/time-borders.js carries, for the same reasons:
     a one-shot `once('idle')` never fires on a busy map, so this polls AND hard-resolves. */
  function _imCanDraw() { try { return !!HOST.canDraw(); } catch (_) { try { return !!GE().ready(); } catch (__) { return false; } } }
  function whenStyleReady() {
    return new Promise(res => {
      let done = false;
      const fin = () => { if (done) return; done = true; try { GE().events.off('idle', ck); GE().events.off('styledata', ck); GE().events.off('load', ck); } catch (_) {} res(); };
      const ck = () => { if (_imCanDraw()) fin(); };
      if (_imCanDraw()) { res(); return; }
      try { GE().events.on('idle', ck); GE().events.on('styledata', ck); GE().events.on('load', ck); } catch (_) {}
      let n = 0; (function poll() { if (done) return; if (_imCanDraw() || n++ > 40) fin(); else setTimeout(poll, 150); })();
    });
  }

  return (function () {
    if (!GE().hasRenderer() || !window.IntMapTime) return {};

    /* ══ (#R564) THE DEEPER TIER'S ZOOM, AND WHY IT IS 6 ═══════════════════════════════════════
       The second tier is admin_level 5-6 — Prussian Regierungsbezirke, United States counties,
       Peruvian provinces. They are second-level units, so they may never stand in for the first
       level; they may only ADD, and only where they are legible. Measured on the shipped bundle:
       the median unit of the deeper tier spans 0.42° of longitude, which at z5 is 30 px and at z6
       is 61 px — the point at which a unit is a shape rather than a smudge, and the point at which
       the first tier's own labels (minzoom 4, maxzoom 9) are still on screen so the two tiers read
       as one hierarchy rather than as a replacement. Below it the tier is not drawn AND NOT
       FETCHED: 10.2 MB is not a speculative cost a reader looking at a continent should pay. */
    const DEEP_Z = 6;

    /* ══ (#R604) THE LINE COMES FROM OPENHISTORICALMAP'S OWN TILES, NOT FROM THE BUNDLE ═══════════
       「歴史的地方区分の境界線のcoverageがくそ。全時代、全地域で完璧に網羅しろ。線の解像度も低すぎる。」
       Both halves of that were measured, and both were true of the BUNDLE rather than of upstream:

       · RESOLUTION. scripts/build-hist-admin1.mjs simplifies at 0.02° (~2.2 km) and quantises to 3
         decimals (~110 m) to keep the file parseable. Measured 2026-09-10 against OHM's Overpass,
         伊豆国 (relation 2687374) is 2,800 vertices / 787 km of perimeter / 281 m mean spacing
         upstream; the shipped bundle draws it with 29. That is not a boundary at any zoom past a
         country view, and no tolerance that keeps a 7 MB file can fix it — a bundle has ONE
         resolution and a map has twenty.
       · COVERAGE. The build's `--since` dropped every unit that ENDED before the clock's floor, so
         with the floor at 1850 the record held essentially nothing for any earlier century. Measured
         on OHM's Overpass the same day: 4,841 dated relations at admin_level 3-4 and 22,808 at 5-6,
         of which 1,142 and 1,600 end before 1800.

       ⚠ THE FIX IS NOT A BIGGER BUNDLE. OHM publishes the same records as VECTOR TILES —
       vtiles.openhistoricalmap.org, TileJSON `maps/ohm.json`, minzoom 0 / maxzoom 20, CC0 — and every
       admin line in them carries `start_decdate` / `end_decdate` as numbers. So the era boundary is
       drawn at the tile's own native geometry at whatever zoom the reader is at, for every level and
       every century upstream has, and TRAVELLING IS A `setFilter`, not a re-fetch: one tile cache
       serves all 2,000 years.
       ⚠ `maritime` IS UPSTREAM'S OWN ANSWER, and that is why it is used here. #R564 had to derive
       "which run of this ring is a border rather than a coast" against Natural Earth
       (data/border-coast.js) because a polygon bundle does not say. The tiles say — the same clause
       `ref-admin1` and `ref-admin2` already carry at Now, so the two eras stop at the shore for the
       same stated reason instead of two of them.
       ⚠ THE BUNDLE IS NOT DELETED AND IS NOT DEAD. It is still the label (nine languages, which the
       tiles do not carry — they hold a bare `name`), still the answer to a click (`geomAt`), still
       what `coverage()` counts, and still the line when the tiles do not arrive: a reader offline, or
       behind a filter that blocks the host, keeps the coarse line rather than losing the layer. */
    const VT_SRC = 'ohm-vt', VT_LAYER = 'land_ohm_lines';
    const VT_TILES = 'https://vtiles.openhistoricalmap.org/maps/ohm/{z}/{x}/{y}.pbf';
    /* the derived units carry their own attribution: the raster is CC0 and Wikidata is CC0, and a
       derived work still says where it came from. */
    const GAP_ATTR = '令制国: <a href="https://github.com/Asukana/Ryoseikoku_20230626_TSV" target="_blank" rel="noopener">Asukana/Ryoseikoku</a> (CC0) · <a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a> (CC0)';
    const VT_ATTR = '<a href="https://www.openhistoricalmap.org/copyright" target="_blank" rel="noopener">OpenHistoricalMap</a> (CC0)';

    /* ⚠ (#R604) THE ARITHMETIC IS NOT HERE, AND THAT IS THE POINT. `decYear` and `ohmFilter` live in
       js/hist-scale.js because a function inside this factory cannot be evaluated by a check — it
       needs a map, a language table and a HOST to exist at all — and #R570 measured what that costs:
       six wrong invariants in one round, none of them reachable by a test. One owner, two readers
       (js/news-timeline.js reads the rail half). */
    const HS = () => window.IntMapHistScale;
    const _dec = (y, m, d) => HS().decYear(y, m, d);
    const _vtFilter = (lo, hi, t) => HS().ohmFilter(lo, hi, t);
    function ensureVTSource() {
      try {
        if (GE().layers.hasSource(VT_SRC)) return true;
        GE().layers.addSource(VT_SRC, { type: 'vector', tiles: [VT_TILES], minzoom: 0, maxzoom: 20, attribution: VT_ATTR });
        return true;
      } catch (_) { return false; }
    }

    /* ── the tier ──────────────────────────────────────────────────────────
       ⚠ ONE FACTORY, TWO INSTANCES, AND THE MEMOS LIVE INSIDE IT. Before #R564 the epoch index and
       the assembled-geometry memo were module-level singletons keyed by FEATURE INDEX — which is
       fine for one bundle and silently wrong for two, because index 12 means a different province
       in each. Everything a bundle knows about itself now lives in its own closure, and the module
       holds only what the two tiers must agree on: the clock, and the switchboard. */
    function makeTier(cfg) {
      let active = false, shownKey = null, shownFC = null, shownWhen = null, seq = 0;
      const cache = new Map();

      /* ── the bundle ────────────────────────────────────────────────────────
         Injected as a <script>, like data/cshapes.js: it is a literal, not JSON, so the
         browser's own parser is the fastest reader of it and there is no second copy in
         memory while it is being parsed. */
      let _D = null, _P = null;
      function load() {
        if (_D) return Promise.resolve(_D);
        if (_P) return _P;
        _P = new Promise(res => {
          if (window[cfg.global]) { _D = window[cfg.global]; res(_D); return; }
          const s = document.createElement('script'); s.src = cfg.file; s.async = true;
          s.onload = () => { _D = window[cfg.global] || null; if (_D && cfg.gapFile) { addGap(); return; } res(_D); };
          s.onerror = () => { _P = null; res(null); };
          document.head.appendChild(s);
          /* == (#R668) THE SUBDIVISIONS UPSTREAM DOES NOT HOLD, SPLICED INTO THE SAME RECORD =======
             「日本は北半分の令制国が全滅。」 Measured: OpenHistoricalMap holds 53 of the 68 classical
             provinces of Japan and no relation at all for the other fifteen — the whole of 東山道 and
             北陸道. data/hist-kuni.js is those fifteen, derived by scripts/build-hist-kuni.mjs from a
             CC0 raster at ~112 m per cell and named from Wikidata.
             (!) IT IS APPENDED TO _D, NOT HELD BESIDE IT. A second record beside this one would need a
             second epoch index, a second label layer, a second click path and a second count — four
             places to disagree with each other. Appended, every one of those already works, and the
             ONE thing that differs about these units is already in the row: their relation id is
             null, because there is no relation. */
          function addGap() {
            const g = document.createElement('script'); g.src = cfg.gapFile; g.async = true;
            const finish = () => { res(_D); };
            g.onload = () => {
              try {
                const X = window[cfg.gapGlobal];
                if (X && X.rings && X.feats) {
                  const off = _D.rings.length;
                  for (const r of X.rings) _D.rings.push(r);
                  /* ⚠ column 11 is the row's index in the KUNI bundle, not in _D. js/border-coast.js
                     marks each set's rings against its own file, so the run that says «this edge is a
                     border and that one is the coast» is addressed by the index the marks were built
                     from — the spliced index would read another unit's answer. */
                  for (let k = 0; k < X.feats.length; k++) { const f = X.feats[k];
                    _D.feats.push([f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7],
                      f[8].map(poly => poly.map(ri => ri + off)), f[9], null, k]); }
                  _D.gapSrc = X.src || null;
                }
              } catch (_) {}
              finish();
            };
            g.onerror = finish;
            document.head.appendChild(g);
          }
        });
        return _P;
      }

      /* ── the epoch index (#R421, verbatim from the country side) ───────────
         Every instant on which the subdivisions change, as sortable YYYYMMDD ints: a
         record's START, and the day AFTER its END (a unit that vanishes with no successor
         still ends an epoch). Built once, lazily, off the same bundle the polygons come
         from — there is no second source to drift from. */
      let _bnd = null;
      function bounds(d) {
        if (_bnd) return _bnd;
        const set = new Set(), lo = _ymd(d.since || 1850, 1, 1), hi = _ymd(9998, 12, 31);
        for (const f of d.feats) {
          set.add(_ymd(f[2], f[3], f[4]));
          const a = _dayAfter(f[5], f[6], f[7]); set.add(_ymd(a[0], a[1], a[2]));
        }
        _bnd = [...set].filter(k => k >= lo && k <= hi).sort((a, b) => a - b);
        return _bnd;
      }
      function epoch(d, y, m, dd) {
        const t = _ymd(y, m, dd), b = bounds(d);
        let lo = 0, hi = b.length - 1, ans = b.length ? b[0] : t;
        while (lo <= hi) { const mid = (lo + hi) >> 1; if (b[mid] <= t) { ans = b[mid]; lo = mid + 1; } else hi = mid - 1; }
        return ans;
      }

      /* ── geometry, memoised by feature index (the rings are shared, the assembled
         GeoJSON is not — building it once per unit is what keeps a scrub cheap) ── */
      const _geom = new Map();
      function geomOf(d, ix) {
        let g = _geom.get(ix); if (g) return g;
        const polys = d.feats[ix][8].map(poly => poly.map(ri => d.rings[ri]));
        g = (polys.length === 1) ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
        _geom.set(ix, g); return g;
      }

      function fcAt(d, y, m, dd) {
        const t = _ymd(y, m, dd), feats = [];
        for (let i = 0; i < d.feats.length; i++) {
          const f = d.feats[i];
          if (_ymd(f[2], f[3], f[4]) > t || _ymd(f[5], f[6], f[7]) < t) continue;
          const NAME = nameOf(f);
          feats.push({ type: 'Feature', geometry: geomOf(d, i), properties: { NAME: NAME, name: NAME, _lvl: f[1], _ix: i, _tier: cfg.key, _gap: (f[10] == null) ? 1 : 0, _gapIx: (f[11] == null) ? -1 : f[11] } });
        }
        return { type: 'FeatureCollection', features: feats };
      }

      /* ══ (#R564) THE LINE IS NOT THE POLYGON ══════════════════════════════════════════════════
         Stroking the polygons drew the record's own copy of the coastline as if it were a boundary
         — the same wrong claim #R531 removed from the country line, several kilometres out to sea
         and in the same colour as the real coast that js/coast-line.js draws from live tiles. The
         marks say which runs of each pooled ring are border; js/border-coast.js reads them; this
         builds the LineString collection the line layer strokes. A collection built before the
         marks land is drawn whole and rebuilt when they arrive (`_onMarks`), which is the same
         "never latch the un-measured picture" rule the country side has. */
      /* (!) (#R668) A UNIT WITH NO UPSTREAM RELATION HAS NO UPSTREAM LINE EITHER. The era line is
         OpenHistoricalMap's own tiles (#R604) and the bundle line stands in only when the tiles are
         measured absent — which is right for every unit OHM holds and wrong for the fifteen it does
         not: those would have a label and a click and no boundary at all. So they get a line of
         their own, from the same rings, drawn whenever the layer is on. The rule is not «Japan» and
         not a list of names — it is _gap, which is «this row has no relation id», which is «the
         tiles cannot be carrying it». */
      function gapLinesFor(fc) {
        /* ⚠ AND IT IS NOT THE POLYGON EITHER. Stroking these rings whole draws the record's own copy
           of the coastline in the same violet dashes as a real provincial border — the claim #R531
           took off the country line and #R564 took off the provinces, and Japan is almost all coast.
           data/border-coast.js carries the marks for this bundle too (set 'hk'), addressed by the
           row's index in the KUNI file. Marks that have not landed yet mean the line is drawn whole
           for a moment and rebuilt when they arrive (refreshLines) — the same «never latch the
           un-measured picture» rule the rest of this file follows. */
        const K = window[cfg.gapGlobal];
        const m = (BC() && K) ? BC().marks('hk') : null;
        const feats = [];
        for (const f of (fc.features || [])) {
          if (!f.properties || !f.properties._gap) continue;
          if (m && f.properties._gapIx >= 0) {
            const g = BC().lineGeom(K, f.properties._gapIx, m);
            if (g) { feats.push({ type: 'Feature', geometry: g, properties: {} }); continue; }
          }
          const g = f.geometry; if (!g) continue;
          const polys = (g.type === 'Polygon') ? [g.coordinates] : (g.coordinates || []);
          for (const poly of polys) for (const ring of poly) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: ring }, properties: {} });
        }
        return { type: 'FeatureCollection', features: feats };
      }
      function _setGap(fc) {
        try { if (cfg.gapFile && GE().layers.hasSource(cfg.gapSrc)) GE().layers.setSourceData(cfg.gapSrc, gapLinesFor(fc)); } catch (_) {}
      }

      function linesFor(fc) {
        const m = BC() ? BC().marks(cfg.set) : null;
        if (!_D || !m) { try { return BC().wholeLines(fc); } catch (_) { return { type: 'FeatureCollection', features: [] }; } }
        const feats = [];
        for (const f of (fc.features || [])) {
          const g = BC().lineGeom(_D, f.properties._ix, m);
          if (g) feats.push({ type: 'Feature', geometry: g, properties: {} });
        }
        return { type: 'FeatureCollection', features: feats };
      }

      /* ══ (#R604) POINT THE TILE LAYER AT A DATE, AND ASK THE MAP WHETHER IT ANSWERED ═══════════
         ⚠⚠⚠ THE BUNDLE'S LINE IS NOT SHOWN UNTIL THE TILES HAVE BEEN GIVEN A CHANCE TO FAIL, AND
         THAT ORDER IS THE WHOLE DESIGN. The first version showed the fallback immediately and hid it
         once the tiles were seen painting — which measured, in tests/r530.spec.js, as BOTH lines on
         screen at once: the same boundary struck twice, in the same violet dashes, at two different
         resolutions, for as long as the tiles took to arrive. A fallback that is visible before the
         thing it stands in for has failed is not a fallback; it is a second map.
         So the state has three values, not two. `unknown` draws the tiles and nothing else — the
         correct picture the moment the tiles land, and a bare map for a second or two if they never
         do. `live` is latched the first time the tile layer is MEASURED painting (#R565: the number
         comes from the map, never from the fact that a request was made). `absent` is only reached
         after GRACE_MS of travelling with the tile layer painting nothing while the bundle has
         something to draw — i.e. on evidence, and it is given up again the moment a tile does paint,
         because a reader who walks back into coverage must not keep the coarse line. */
      let vtState = 'unknown', vtAt = null, vtSince = 0;
      /* ⚠ MEASURED, NOT GUESSED: on this machine a cold z5 view over Germany has the first OHM tile
         painting 0.9-2.1 s after the clock moves. Six seconds is that with room for a slow link;
         below the round trip it would declare failure on a page that was merely loading, and far
         above it a genuinely offline reader waits with no line at all. EXPIRES if the tile host's
         latency changes character — the symptom is a coarse line that appears and then swaps. */
      const GRACE_MS = 6000;
      function vtAim(y, m, dd) {
        try {
          if (!ensure()) return;
          const t = _dec(y, m, dd);
          if (vtAt === t) return;
          vtAt = t; if (!vtSince) vtSince = Date.now();
          GE().layers.setFilter(cfg.vtLine, _vtFilter(cfg.lo, cfg.hi, t));
          vtPoll();
        } catch (_) {}
      }
      /* ⚠ `idle` ALONE IS NOT ENOUGH TO ASK THE QUESTION, and that was measured: the map goes idle
         while the first OHM tiles are still in flight, and then — nothing having changed on screen
         since — never goes idle again. The state stayed `unknown` with the tile layer visibly
         painting (tests/r530.spec.js read 1,700 features from the layer whose supply this had never
         noticed). So the question is also asked on a short poll for as long as the answer is unknown,
         which is at most GRACE_MS of 400 ms ticks and stops the moment there is an answer. */
      let _pollT = 0;
      function vtPoll() {
        clearTimeout(_pollT);
        if (!active || vtState === 'live') return;
        /* 400 ms while there is no answer at all; once there is one ('absent' — the tiles did not
           come) the question is only "have they come back?", which nobody is waiting on. */
        _pollT = setTimeout(() => { _pollT = 0; if (!active) return; vtProbe(); vtPoll(); },
                            vtState === 'unknown' ? 400 : 3000);
      }
      /* asked every time the map settles, and on the poll above. Latches to `live` and stays there;
         `absent` is reversible, because a reader who walks back into coverage must not keep the
         coarse line. */
      function vtProbe() {
        try {
          if (vtState === 'live' || !GE().layers.has(cfg.vtLine)) return vtState;   /* latched — stop paying for the query */
          const n = (GE().coords.queryRenderedFeatures(undefined, { layers: [cfg.vtLine] }) || []).length;
          const was = vtState;
          if (n > 0) vtState = 'live';
          else if (vtState !== 'live' && vtSince && (Date.now() - vtSince) > GRACE_MS
                   && shownFC && shownFC.features && shownFC.features.length) vtState = 'absent';
          if (vtState !== was) _applyNow();
        } catch (_) {}
        return vtState;
      }

      /* ── layers ────────────────────────────────────────────────────────────
         ⚠ (#R212's rule, applied to the province line) Travelling in time must change
         WHERE a boundary runs, not what a boundary LOOKS like. Every value below is the
         one `ref-admin1` uses (js/app-body.js) and `ofm-admin1` uses (js/place-labels.js),
         read out of js/border-style.js / IntMapLabelScale rather than re-typed; the
         literals are only the fallback for a page where those have not evaluated, and
         they are the same numbers. The deeper tier is the same colour at a lower weight,
         for the same reason a map draws a county thinner than a state: it is subordinate,
         not different in kind. */
      function ensure() {
        try {
          if (!_imCanDraw()) return false;
          const BS = (window.IntMapBorderStyle || {});
          const COL = BS.admin1 || '#cba6f7';
          const W = BS.admin1Width || ['interpolate', ['linear'], ['zoom'], 1, 0.45, 4, 0.75, 8, 1.15, 12, 1.6];
          if (!GE().layers.hasSource(cfg.src)) GE().layers.addSource(cfg.src, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: 'OpenHistoricalMap (CC0)' });
          if (!GE().layers.hasSource(cfg.lnSrc)) GE().layers.addSource(cfg.lnSrc, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: 'OpenHistoricalMap (CC0)' });
          if (cfg.gapFile && !GE().layers.hasSource(cfg.gapSrc)) GE().layers.addSource(cfg.gapSrc, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: GAP_ATTR });
          /* below the labels, and below the era COUNTRY line, so a national border always
             reads on top of a provincial one — the order `ref-admin1`/`borders-only-line`
             already have at Now. */
          const before = ['imtb-lbl', 'ofm-admin1', 'ofm-country', 'ofm-city'].find(id => { try { return !!GE().layers.has(id); } catch (_) { return false; } });
          const PAINT = { 'line-color': COL, 'line-opacity': cfg.deep ? 0.55 : 0.82, 'line-dasharray': cfg.deep ? [2, 2] : [3, 2], 'line-width': cfg.deep ? ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 0.9, 13, 1.3] : W };
          if (!GE().layers.has(cfg.line)) GE().layers.add(Object.assign({
            id: cfg.line, type: 'line', source: cfg.lnSrc,
            layout: { visibility: 'none', 'line-join': 'round' },
            paint: PAINT
          }, cfg.deep ? { minzoom: DEEP_Z } : {}), before);
          /* (#R604) the same line, at upstream's own resolution and for every century it holds.
             Identical paint to the bundle fallback above on purpose: which SOURCE answered must
             never be visible as a change of style — #R212's rule applied to the supply, not to the
             clock. It is added AFTER the fallback so it draws on top of it in the rare frame where
             both are briefly visible. */
          if (ensureVTSource() && !GE().layers.has(cfg.vtLine)) GE().layers.add(Object.assign({
            id: cfg.vtLine, type: 'line', source: VT_SRC, 'source-layer': VT_LAYER,
            filter: _vtFilter(cfg.lo, cfg.hi, _dec(1900, 7, 1)),
            layout: { visibility: 'none', 'line-join': 'round' },
            paint: PAINT
          }, cfg.deep ? { minzoom: DEEP_Z } : {}), before);
          /* (#R668) …and the same paint again for the units upstream does not hold, so that WHICH
             record answered is never visible as a change of style (#R212 applied to the supply). */
          if (cfg.gapFile && !GE().layers.has(cfg.gapLine)) GE().layers.add(Object.assign({
            id: cfg.gapLine, type: 'line', source: cfg.gapSrc,
            layout: { visibility: 'none', 'line-join': 'round' },
            paint: PAINT
          }, cfg.deep ? { minzoom: DEEP_Z } : {}), before);
          /* the era unit's NAME, in the style `ofm-admin1` uses for the present-day one —
             same zoom window, same size ladder, same colour-of-its-own-boundary (#R252),
             same dark halo on both basemaps.
             ⚠ readerFont(), not a name-key test: `placeFont()` decides the face by looking
             for `name:ja` ON THE FEATURE, and an era feature carries none — the localized
             name is already baked into `NAME` above, which is exactly the case readerFont()
             exists for (js/time-borders.js `_ERAFONT`, #R309). */
          const FONT = (function () { try { return window.IntMapMapTypography.readerFont(); } catch (_) { return ['Noto Sans SC']; } })();
          const SIZE = (function () { try { return window.IntMapLabelScale.place('admin1'); } catch (_) { return ['interpolate', ['linear'], ['zoom'], 4, 9.5, 7, 11.5]; } })();
          if (!GE().layers.has(cfg.lbl)) GE().layers.add({
            id: cfg.lbl, type: 'symbol', source: cfg.src, minzoom: cfg.deep ? DEEP_Z + 1 : 4, maxzoom: cfg.deep ? 12 : 9,
            layout: {
              visibility: 'none', 'symbol-placement': 'point', 'text-field': ['coalesce', ['get', 'NAME'], ['get', 'name'], ''],
              'text-font': FONT, 'text-size': SIZE, 'text-letter-spacing': 0.06, 'text-max-width': 8,
              'text-padding': 4, 'text-optional': true
            },
            paint: { 'text-color': COL, 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.5, 'text-opacity': cfg.deep ? 0.8 : 1 }
          });
          /* ⚠ THE CLICK IS NOT WIRED HERE. An era province name is a place label like any other, and
             js/map-ui.js is the ONE place that decides what a place label does when it is tapped —
             #R201 put `ofm-admin1` into all four of its lists after 「クリック可能ではない！ほかの地名
             ラベルと違う挙動にするな！」, and a second owner in this file would be the same defect
             wearing a different name. Both era label layers join that list instead, so travelling
             does not turn a working label into a dead one for the years it is on screen. */
          return true;
        } catch (_) { return false; }
      }

      function apply(fc) {
        const my = seq; shownFC = fc;
        try {
          if (GE().layers.hasSource(cfg.src) && GE().layers.has(cfg.line)) {
            GE().layers.setSourceData(cfg.src, fc); GE().layers.setSourceData(cfg.lnSrc, linesFor(fc)); _setGap(fc); _applyNow(); return;
          }
        } catch (_) {}
        if (ensure()) { try { GE().layers.setSourceData(cfg.src, fc); GE().layers.setSourceData(cfg.lnSrc, linesFor(fc)); _setGap(fc); } catch (_) {} _applyNow(); }
        /* (#R140's shape) the style was mid-load — don't latch the era units absent until a reload. */
        else whenStyleReady().then(() => { if (active && seq === my) apply(fc); });
      }

      /* the marks landed after a collection had already been drawn whole: re-derive the lines from
         the collection on screen. The identities did not change, so the polygons are left alone. */
      function refreshLines() {
        try { if (shownFC && GE().layers.hasSource(cfg.lnSrc)) { GE().layers.setSourceData(cfg.lnSrc, linesFor(shownFC)); _setGap(shownFC); } } catch (_) {}
      }

      function clear() {
        active = false; shownKey = null; shownFC = null; shownWhen = null; vtSince = 0;
        clearTimeout(_pollT); _pollT = 0;
        try { GE().layers.setSourceData(cfg.src, { type: 'FeatureCollection', features: [] }); } catch (_) {}
        try { GE().layers.setSourceData(cfg.lnSrc, { type: 'FeatureCollection', features: [] }); } catch (_) {}
        try { if (cfg.gapFile && GE().layers.hasSource(cfg.gapSrc)) GE().layers.setSourceData(cfg.gapSrc, { type: 'FeatureCollection', features: [] }); } catch (_) {}
        try { [cfg.line, cfg.vtLine, cfg.gapLine, cfg.lbl].forEach(id => { if (id && GE().layers.has(id)) GE().layers.setLayout(id, 'visibility', 'none'); }); } catch (_) {}
      }

      async function go(when) {
        active = true; const my = ++seq;
        const isD = (when instanceof Date) && !isNaN(when.getTime());
        const y = isD ? when.getFullYear() : Math.round(+when);
        const m = isD ? (when.getMonth() + 1) : 7, dd = isD ? when.getDate() : 1;
        shownWhen = isD ? when : new Date(y, 6, 1, 12, 0, 0);
        /* ══ (#R604) THE TILE LINE IS AIMED BEFORE THE BUNDLE IS EVEN ASKED FOR ══════════════════
           The date the reader chose is known synchronously; the 6.9 MB bundle is not, and on a cold
           page it is seconds away (the window #R530 measured as modern provinces painted over 1900).
           A `setFilter` on a source the map already has costs nothing and needs nothing, so the era
           boundary is on screen while the label half is still downloading. */
        vtAim(y, m, dd);
        const d = (await Promise.all([load(), BC() ? BC().load() : null]))[0];   /* (#R564) the marks settle before the first collection is built, so nothing is cached unmarked */
        if (my !== seq || !active) return;
        if (!d) { setTimeout(() => { try { if (active && my === seq) go(when); } catch (_) {} }, 4000); return; }
        let key; try { key = 'a' + epoch(d, y, m, dd); } catch (_) { key = 'a' + y; }
        if (shownKey === key) {
          try { if (ensure()) _applyNow(); else whenStyleReady().then(() => { if (active && shownKey === key && ensure()) _applyNow(); }); } catch (_) {}
          return;
        }
        let fc = cache.get(key);
        if (!fc) { try { fc = fcAt(d, y, m, dd); cache.set(key, fc); } catch (_) { fc = null; } }
        if (fc) { shownKey = key; apply(fc); }
      }

      function relocalize() {
        try {
          if (!active || shownKey == null || !_D) return;
          const w = shownWhen; if (!w) return;
          const fc = fcAt(_D, w.getFullYear(), w.getMonth() + 1, w.getDate());
          cache.set(shownKey, fc); apply(fc);
        } catch (_) {}
      }

      function reassert() {
        try {
          if (active && _imCanDraw() && !GE().layers.has(cfg.line)) {
            ensure(); const fc = cache.get(shownKey);
            if (fc) { try { GE().layers.setSourceData(cfg.src, fc); GE().layers.setSourceData(cfg.lnSrc, linesFor(fc)); _setGap(fc); } catch (_) {} }
            _applyNow();
          }
        } catch (_) {}
      }

      return {
        cfg, load, go, clear, refreshLines, relocalize, reassert, ensure, vtProbe, vtState: () => vtState,
        setActive: v => { active = v; }, isActive: () => active, key: () => shownKey,
        fc: () => shownFC, when: () => shownWhen, data: () => _D,
        geom: ix => { try { return _D ? geomOf(_D, ix) : null; } catch (_) { return null; } }
      };
    }

    const _ymd = (y, m, d) => y * 10000 + m * 100 + d;
    function _dayAfter(y, m, d) { const t = new Date(Date.UTC(y, m - 1, d)); t.setUTCDate(t.getUTCDate() + 1); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }

    /* the reader's language → the unit's own name in it. OHM carries `name:<code>` for
       the nine; the bare `name` is the local/official one and is the honest fallback —
       a province's endonym is a better answer than a machine transliteration. */
    /* ⚠ INTMAP'S LANGUAGE CODES AND OSM'S `name:*` TAGS ARE NOT THE SAME ALPHABET. IntMap says `jp`
       where OSM says `ja`, and `zh` / `zh-hans` where OSM says `zh-Hant` / `zh-Hans` — so a lookup
       that used HOST.lang directly would miss Japanese, both Chinese scripts, and nothing else, i.e.
       it would look like it worked. The bare `name` is the last rung on purpose: a province's own
       official name is a better answer than no name at all, and better than a transliteration this
       file would have to invent. */
    const OSM_TAG = { jp: 'ja', zh: 'zh-Hant', 'zh-hans': 'zh-Hans' };
    function nameOf(f) {
      const nm = f[9] || {};
      let code = 'en';
      try { code = window.IntMapLang.normalise(HOST.lang) || 'en'; } catch (_) { try { code = String(HOST.lang || 'en'); } catch (__) {} }
      const tag = OSM_TAG[code] || code;
      return nm[tag] || nm.en || f[0] || '';
    }

    /* ⚠ (#R604) `lo`/`hi` ARE THE SAME LEVELS THE BUNDLE WAS BUILT FROM, and they are stated here
       rather than inside the filter because the two supplies must answer for the same tier or the
       fallback would be a different map. Levels 1-2 are the COUNTRY border and belong to
       js/time-borders.js; levels 7-9 exist in the tiles but not at Now (`ref-admin2` stops at 6), and
       #R212's rule is that travelling may not change what KIND of thing the map is willing to show. */
    const T1 = makeTier({ key: 'a1', file: 'data/hist-admin1.js', global: '__HISTADM1', set: 'ha', lo: 3, hi: 4,
                          gapFile: 'data/hist-kuni.js', gapGlobal: '__HISTKUNI', gapSrc: 'imta-gap-src', gapLine: 'imta-gap-line',
                          src: 'imta-src', lnSrc: 'imta-ln-src', line: 'imta-line', vtLine: 'imta-vt-line', lbl: 'imta-lbl', deep: false });
    const T2 = makeTier({ key: 'a2', file: 'data/hist-admin2.js', global: '__HISTADM2', set: 'ha2', lo: 5, hi: 6,
                          src: 'imta2-src', lnSrc: 'imta2-ln-src', line: 'imta2-line', vtLine: 'imta2-vt-line', lbl: 'imta2-lbl', deep: true });
    const TIERS = [T1, T2];
    let active = false, lastWhen = null;

    /* the marks may land after a bundle has already been drawn whole */
    try { BC().onArrive(() => { for (const t of TIERS) t.refreshLines(); }); } catch (_) {}

    /* (#R604) the tiles answer on their own schedule, so the question "did they?" is asked every
       time the map settles rather than once after a guessed delay. `vtProbe` latches, so this costs
       one queryRenderedFeatures per idle until the first tile paints and nothing afterwards. */
    try { GE().events.on('idle', () => { if (active) for (const t of TIERS) t.vtProbe(); }); } catch (_) {}

    /* ══ (#R564) THE PRESENT-DAY DEEPER TIER — the same kind of thing at the same zoom ═══════════
       `ref-admin1` (js/app-body.js) filters the live tiles to admin_level 3-4. Without this the map
       would offer counties in 1900 and nothing at Now, i.e. the time machine would change what the
       map is WILLING to show rather than where the boundaries run — the failure #R212 named. The
       modern half costs no bundle at all: OpenMapTiles already carries levels 5-8 in the same
       `boundary` layer, so it is one filter and one minzoom.
       ⚠ `maritime != 1` is the same clause `ref-admin1` and `borders-only-line` carry, and it is why
       the present-day lines stop at the shore. The era tiers reach the same answer from the other
       end — data/border-coast.js, which measures the record against the planet's coastline. */
    function ensureModernDeep() {
      try {
        if (!_imCanDraw() || GE().layers.has('ref-admin2')) return;
        if (!GE().layers.hasSource('ofm')) return;
        const BS = (window.IntMapBorderStyle || {});
        const before = ['ofm-admin1', 'ofm-country', 'ofm-city'].find(id => { try { return !!GE().layers.has(id); } catch (_) { return false; } });
        GE().layers.add({
          id: 'ref-admin2', type: 'line', source: 'ofm', 'source-layer': 'boundary', minzoom: DEEP_Z,
          filter: ['all', ['>=', ['get', 'admin_level'], 5], ['<=', ['get', 'admin_level'], 6], ['!=', ['get', 'maritime'], 1]],
          layout: { visibility: 'none', 'line-join': 'round' },
          paint: { 'line-color': BS.admin1 || '#cba6f7', 'line-opacity': 0.55, 'line-dasharray': [2, 2],
                   'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 10, 0.9, 13, 1.3] }
        }, before);
      } catch (_) {}
    }

    /* ══ (#R530) THE SWITCHBOARD — WHICH SET OF SUBDIVISIONS IS ON SCREEN ══════════════════════
       ⚠ IT LIVES HERE, NOT IN js/app-body.js, AND THAT IS NOT A STYLE CHOICE. The app shell has a
       LINE BUDGET (tests/r168 #8, and r350 ⑨c and r479 ⑧ hold copies of the same number): six files
       may total 8,050 lines. It also belongs here on the merits — the module that draws the era
       units is the right owner of the rule that decides whether they or the live ones are shown.
       app-body keeps one call and one hand-back.
       ⚠ ONE FEATURE, ONE SWITCH, IN BOTH DIRECTIONS — #R94g's principle without #R94l's carve-out.
       The country border keeps its exception (travelling must never leave the map border-less); a
       reader who switched province borders OFF has said what they want, and honouring that costs
       the map nothing here, because the country borders and coastlines are still drawn.
       ⚠ The NAMES follow `cb-names`, not `cb-admin1` — that is the split the present-day pair
       already has (#R198: a prefecture name is a place name). Travelling must not re-cut a switch. */
    window._applyAdmin1 = function () {
      try {
        if (!GE().hasRenderer()) return;
        /* ⚠ `active` DIRECTLY, not `window.IntMapTimeAdmin1.active()`. This function is published at
           factory time and js/app-body.js calls it on the very next statement — before it has
           assigned the module to `window.IntMapTimeAdmin1` — so the window route is undefined for
           exactly the first call, which is the one that decides the boot state. */
        const traveling = active;
        const box = document.getElementById('cb-admin1'), on = box ? !!box.checked : true;
        const nbox = document.getElementById('cb-names'), namesOn = nbox ? !!nbox.checked : true;
        if (on) ensureModernDeep();
        if (GE().layers.has('ref-admin1')) GE().layers.setLayout('ref-admin1', 'visibility', (on && !traveling) ? 'visible' : 'none');
        if (GE().layers.has('ref-admin2')) GE().layers.setLayout('ref-admin2', 'visibility', (on && !traveling) ? 'visible' : 'none');
        for (const t of TIERS) {
          /* ⚠ (#R604) TWO SUPPLIES, ONE LINE ON SCREEN. The tile layer is the boundary; the bundle
             layer is what is shown INSTEAD of it, and only while the tiles have never been observed
             painting. Showing both would double-strike every boundary that exists in both, at two
             different resolutions, which is worse than either. */
          const stand = (t.vtState() === 'absent');   /* the bundle stands in ONLY on evidence */
          if (GE().layers.has(t.cfg.vtLine)) GE().layers.setLayout(t.cfg.vtLine, 'visibility', (on && traveling) ? 'visible' : 'none');
          if (GE().layers.has(t.cfg.line)) GE().layers.setLayout(t.cfg.line, 'visibility', (on && traveling && stand) ? 'visible' : 'none');
          /* (!) (#R668) NOT gated on `stand`. The tiles being alive is exactly why the bundle line is
             hidden, and exactly why these fifteen would vanish if they were hidden along with it. */
          if (t.cfg.gapLine && GE().layers.has(t.cfg.gapLine)) GE().layers.setLayout(t.cfg.gapLine, 'visibility', (on && traveling) ? 'visible' : 'none');
          if (GE().layers.has(t.cfg.lbl)) GE().layers.setLayout(t.cfg.lbl, 'visibility', (namesOn && traveling) ? 'visible' : 'none');
        }
        /* ⚠ THE PRESENT-DAY PROVINCE NAME IS SET HERE TOO, AND THAT IS NOT A SECOND OWNER — it is the
           same rule from the same two inputs. js/place-labels.js `applyLabelLang` also writes it, but
           that function runs on `styledata`, on the Place-names box and on a language change, NOT on
           the clock, so leaving the clock's half to it means the name waits for whatever fires next.
           MEASURED on the return to Now: `ref-admin1` was back at `visible` while `ofm-admin1` was
           still `none`, and the names returned 0.8-2.9 s after the boundaries — a layer and its own
           label visibly out of step. `window._applyBorders` has had this exact shape for
           `ofm-country` since #R94g. */
        if (GE().layers.has('ofm-admin1')) GE().layers.setLayout('ofm-admin1', 'visibility', (namesOn && !traveling) ? 'visible' : 'none');
        /* ⚠ AND SAY WHAT IS NOT THERE. A country drawn with no subdivision line is either a country
           that had none or one nobody has mapped yet, and a map cannot tell those apart by staying
           silent — so the row that switched the layer on carries the count, in the reader's language.
           Cleared at Now, so the label never states a date the map has left. */
        try {
          const lab = box && box.closest ? box.closest('label') : null;
          if (lab) { const n = traveling ? note() : ''; if (n) lab.setAttribute('title', n); else lab.removeAttribute('title'); }
        } catch (_) {}
      } catch (_) {}
    };
    function _applyNow() { try { window._applyAdmin1(); } catch (_) {} }

    /* ══ (#R564) THE DEEPER TIER IS FETCHED BY THE CAMERA, NOT BY THE CLOCK ═══════════════════════
       10.2 MB is not a cost a reader looking at a continent should pay for units that are not drawn
       at that scale. `_deep()` is called from the clock AND from `zoomend`, and it is idempotent —
       once the tier is on the year it needs, calling it again costs a map lookup. Going back out
       does NOT clear it: the bytes are already paid for and the layer's own `minzoom` hides it. */
    function _zoom() { try { return GE().camera.getZoom(); } catch (_) { return 0; } }
    function _deep() {
      try {
        if (!active || !lastWhen) { T2.clear(); return; }
        if (_zoom() >= DEEP_Z - 0.5) T2.go(lastWhen);
      } catch (_) {}
    }
    try { GE().events.on('zoomend', _deep); } catch (_) {}

    /* ⚠ DECLARED ABOVE THE HANDLER THAT CLEARS IT (#R505): a `let` further down is in its temporal
       dead zone for anything that runs during evaluation. */
    let _tick = 0;

    /* ── the clock ─────────────────────────────────────────────────────────
       ⚠ the INSTANT, not the year (#R421): `IntMapTime.setYear(y)` sets June 15, and a
       selector that sampled July 1 would draw a world sixteen days from the one the
       reader named. The 45 ms debounce is #R122's number — a single year change applies
       almost immediately while a slider drag still coalesces.
       ⚠ THE SAME "IS THIS TRAVELLING?" TEST AS THE COUNTRY BORDER, so the two halves of
       one map can never disagree about which era they are in: live, or the present year,
       is Now — everything else is the past and the modern line steps aside. */
    window.IntMapTime.on(e => {
      clearTimeout(_tick);
      if (e.isLive || e.year >= new Date().getFullYear()) { active = false; lastWhen = null; for (const t of TIERS) t.clear(); _applyNow(); return; }
      const w = e.when; lastWhen = w;
      /* ══ ⚠⚠⚠ TODAY'S PROVINCES GO THE MOMENT THE CLOCK LEAVES NOW, NOT WHEN THE ERA DATA ARRIVES ══
         MEASURED as an intermittent failure of tests/r530.spec.js ① — 1 run in 3, and only ever the
         COLD one, with four modern province lines still painted over 1900. The window is exactly the
         time `load()` takes: `active` becomes true inside `go()`, but the switchboard is only called
         from `apply()` / `clear()`, i.e. AFTER the 6.5 MB bundle has been fetched and parsed. On a warm
         page that is a few milliseconds and invisible; on a cold one it is seconds of a past date
         wearing the present-day boundaries — which is the very defect this file exists to remove.
         ⚠ The fix is a RULE, not a longer wait: the instant the clock says "past", today's provinces
         are known to be wrong, and that is true whether or not anything is ready to replace them.
         Drawing nothing for a moment is correct; drawing the wrong thing is not. So travel is declared
         here, synchronously, and the era units arrive when they arrive. */
      if (!active) { active = true; for (const t of TIERS) t.setActive(true); _applyNow(); }
      _tick = setTimeout(() => { try { T1.go(w); _deep(); } catch (_) {} }, 45);
    });

    /* re-localize the era names when the language changes WHILE travelling: `nameOf`
       bakes one language into the feature, so the collection has to be rebuilt — but
       only the CURRENT epoch, and only when something actually moved. */
    window.addEventListener('intmap-lang', () => { for (const t of TIERS) t.relocalize(); });

    /* re-assert ONLY when a base-style swap (globe/flat/satellite) WIPED the layers —
       detected by a missing line layer. Re-asserting on every styledata would loop,
       because setLayout fires styledata (js/time-borders.js learned this as the fast-blink). */
    GE().events.on('styledata', () => {
      if (!active) return;
      const gone = TIERS.some(t => t.isActive() && t.key() != null && !GE().layers.has(t.cfg.line));
      if (gone && _imCanDraw()) setTimeout(() => { for (const t of TIERS) t.reassert(); _applyNow(); }, 160);
    });

    /* ── warm the bundle at idle, and NOT on a phone or Data Saver ──────────
       The same rule and the same reasons as data/cshapes.js (#R192/#R201): it is a
       speculative copy for a feature that has not been asked for, and on a phone it
       queues in front of the tiles the reader is actually looking at. `load()` below
       is what draws, so nothing is lost by skipping it — only the head start.
       ⚠ ONLY THE FIRST TIER IS WARMED. The deeper one is 10.2 MB and is not drawn until the reader
       has zoomed past z6, so warming it would be a speculative copy of a speculative copy. */
    (function warm() {
      const pf = () => { T1.load().catch(() => {}); };
      const start = () => {
        try { const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
          if (c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType || ''))) return; } catch (_) {}
        try { if (HOST.isMobile && HOST.isMobile()) return; } catch (_) {}
        if (typeof requestIdleCallback === 'function') requestIdleCallback(pf, { timeout: 8000 }); else setTimeout(pf, 3500);
      };
      let started = false; const once = () => { if (started) return; started = true; start(); };
      try { GE().events.once('idle', () => setTimeout(once, 900)); } catch (_) {}
      setTimeout(once, 6000);
    })();

    /* ── what the reader (and Atlas) can ask ───────────────────────────────
       ⚠ `coverage()` is the honest half of this file. It answers "how many dated
       subdivisions are in force right now", which is the only way to tell a country
       that HAD no first-level subdivisions from one whose subdivisions nobody has
       mapped yet. It is deliberately a COUNT of what is drawn, not a percentage of
       some denominator — there is no census of "how many provinces the world had in
       1900" to be a percentage of. The deeper tier is counted separately because it is
       a different claim: those are not first-level units. */
    function coverage() {
      try {
        const fc = T1.fc();
        if (!active || !fc) return { active: false, units: 0, deeper: 0, when: null, source: null };
        const d = T1.data();
        return { active: true, units: fc.features.length, deeper: (T2.fc() ? T2.fc().features.length : 0),
                 when: T1.when() ? new Date(T1.when().getTime()) : null, source: (d && d.src) || null };
      } catch (_) { return { active: false, units: 0, deeper: 0, when: null, source: null }; }
    }
    /* the nine-language sentence the layer row shows while travelling (AGENTS.md §3.5). */
    function note() {
      const c = coverage(); if (!c.active) return '';
      const n = String(c.units);
      /* ⚠ (#R668) The derived provinces are COUNTED, not spelled out. data/hist-kuni.js exists
         because OpenHistoricalMap holds no relation for those 令制国, and how many of them are in
         force depends on the date the reader is standing on — a literal «15» would be a fact about
         one instant printed at every instant. _gap is the same flag the gap LINE is drawn from
         («this row has no relation id»), so the sentence and the line can never disagree. */
      let g = 0;
      try { const fc = T1.fc(); if (fc) for (const f of fc.features) if (f.properties && f.properties._gap) g++; } catch (_) { g = 0; }
      const gs = String(g);
      return _LT.arr(LA(
        n + ' subdivisions are in force on this date. The older the year, the more geographically uneven the record is, so an area with no line here is one OpenHistoricalMap is still silent about — not one without subdivisions. Zoom in for the second-level units the record also holds.' + (g ? ' OpenHistoricalMap holds no record for ' + gs + ' of Japan’s provinces, so IntMap derives those outlines itself from CC0 data (Asukana/Ryoseikoku, Wikidata) rather than taking them from upstream.' : ''),
        'この日付で有効な地方区分は ' + n + ' 件。古い年代ほど記録は地理的に偏るため、境界線が無い地域は「区分が無かった」のではなく「記録がまだ無い」。拡大すると、記録が持つ下位の区分も出る。' + (g ? '日本の令制国のうち ' + gs + ' 国は OpenHistoricalMap に記録が無いため、上流から取るのではなく、CC0 のデータ（Asukana/Ryoseikoku・Wikidata）から IntMap 自身が導出して描いている。' : ''),
        n + ' Verwaltungseinheiten gelten an diesem Datum. Je weiter das Jahr zurückliegt, desto ungleichmäßiger ist die Überlieferung geografisch verteilt: Ein Gebiet ohne Linie ist eines, zu dem die Quelle noch schweigt — nicht eines ohne Untergliederungen. Hineinzoomen zeigt die Einheiten der zweiten Ebene.' + (g ? ' Zu ' + gs + ' japanischen Provinzen liegt in OpenHistoricalMap kein Eintrag vor; IntMap leitet diese Umrisse deshalb selbst aus CC0-Daten (Asukana/Ryoseikoku, Wikidata) ab, statt sie von der Quelle zu übernehmen.' : ''),
        'На эту дату действует ' + n + ' единиц. Чем древнее год, тем неравномернее записи распределены географически: местность без линии — это местность, о которой источник пока молчит, а не местность без единиц. При приближении показываются единицы второго уровня.' + (g ? ' Для ' + gs + ' японских провинций в OpenHistoricalMap записи нет, поэтому эти контуры IntMap выводит сам из данных CC0 (Asukana/Ryoseikoku, Wikidata), а не берёт из источника.' : ''),
        n + ' subdivisiones están en vigor en esta fecha. Cuanto más antiguo es el año, más desigual es la cobertura geográfica del registro: una zona sin línea es aquella sobre la que la fuente aún calla, no una sin subdivisiones. Al acercar aparecen las unidades de segundo nivel.' + (g ? ' OpenHistoricalMap no tiene registro de ' + gs + ' provincias japonesas, así que IntMap deriva esos contornos por sí mismo a partir de datos CC0 (Asukana/Ryoseikoku, Wikidata) en lugar de tomarlos de la fuente.' : ''),
        '此日期有效的行政區共 ' + n + ' 個。年代越久遠，記錄的地理分布越不均，因此沒有界線的地區是記錄從缺，而非沒有行政區。放大後會顯示記錄中的次級行政區。' + (g ? '其中 ' + gs + ' 個日本令制國在 OpenHistoricalMap 中沒有記錄，因此這些輪廓並非取自上游，而是由 IntMap 依 CC0 資料（Asukana/Ryoseikoku、Wikidata）自行推導繪製。' : ''),
        '此日期有效的行政区共 ' + n + ' 个。年代越久远，记录的地理分布越不均，因此没有界线的地区是记录从缺，而非没有行政区。放大后会显示记录中的次级行政区。' + (g ? '其中 ' + gs + ' 个日本令制国在 OpenHistoricalMap 中没有记录，因此这些轮廓并非取自上游，而是由 IntMap 依 CC0 数据（Asukana/Ryoseikoku、Wikidata）自行推导绘制。' : ''),
        n + ' subdivisions sont en vigueur à cette date. Plus l’année est ancienne, plus la couverture du registre est géographiquement inégale : une zone sans tracé est une zone sur laquelle la source se tait encore, non une zone sans subdivisions. En zoomant apparaissent les unités de second niveau.' + (g ? ' OpenHistoricalMap ne conserve aucun enregistrement pour ' + gs + ' provinces japonaises : IntMap dérive lui-même ces tracés à partir de données CC0 (Asukana/Ryoseikoku, Wikidata) au lieu de les reprendre de la source.' : ''),
        '이 날짜에 유효한 행정구역은 ' + n + '개입니다. 연대가 오래될수록 기록은 지리적으로 치우치므로, 경계선이 없는 지역은 구역이 없었던 것이 아니라 기록이 아직 없는 것입니다. 확대하면 기록이 가진 하위 행정구역도 나타납니다.' + (g ? ' 일본 율령국 가운데 ' + gs + '개국은 OpenHistoricalMap에 기록이 없어, 상류 기록을 가져온 것이 아니라 IntMap이 CC0 데이터(Asukana/Ryoseikoku, Wikidata)에서 직접 도출해 그린 것입니다.' : '')
      ));
    }

    /* ══ (#R564) THE ERA UNIT'S OWN OUTLINE, FOR THE POPUP ═════════════════════════════════════════
       js/map-ui.js opens the same popup for an era province label as for a present-day one, and that
       popup draws «this place's real boundary» through IntMapOutline. Asked by NAME, IntMapOutline
       answers with TODAY'S namesake — a 1900 click answered with a 2026 outline, which is exactly the
       defect #R530 exists to remove, moved from the line layer to the click. The polygon is already
       in memory; this hands it over, and map-ui passes it as `opts.geojson` the way the era COUNTRY
       label has passed its own since #R94m. */
    function geomAt(props) {
      try {
        if (!props || props._ix == null) return null;
        const t = (props._tier === 'a2') ? T2 : T1;
        return t.geom(props._ix);
      } catch (_) { return null; }
    }

    /* ══ ⚠⚠⚠ (#R668) …AND AT THE LINE'S OWN RESOLUTION, WHICH THE BUNDLE CANNOT GIVE ═════════════
       「クリックしたときのハイライト線が線に比べて解像度が低い。」
       Measured, and true. #R604 moved the LINE off the bundle and onto OpenHistoricalMap's vector
       tiles precisely because «a bundle has ONE resolution and a map has twenty» — and left the
       CLICK on the bundle. So a reader taps 伊豆国, and the highlight that appears over the tile
       line is the same boundary drawn with 29 vertices against upstream's 2,800: a hundredfold
       coarser, in the same view, at the same instant, in the accent colour that says «this is the
       thing you tapped».
       ⚠ THE FIX IS NOT A FINER BUNDLE. #R604 priced that: 0.008° / 4 decimals is 15.5 MB for the
       first tier alone, and it would STILL be one resolution. What is different about a click is
       that it names ONE record, and one record can be fetched whole — 伊豆国 measured 148 KB and
       789 ms from the same Overpass the build uses, which is a fair price for a deliberate tap and
       is paid once per unit per session.
       ⚠ AND IT IS FETCHED BY ID, NOT BY NAME. Column 10 of every feature row is the OHM relation id
       (scripts/build-hist-admin1.mjs). Asking upstream for «the thing called 伊豆国» is the mistake
       #R515 exists to forbid; asking it for relation 2687374 cannot return a different unit.
       ⚠ THE COARSE SHAPE IS STILL DRAWN FIRST. The reader gets an outline on the tap, not after a
       round trip, and js/map-tools.js replaces it in place when the true one lands — the same
       "never latch the un-measured picture" rule the line itself follows. If the fetch fails, the
       coarse outline is what stays, which is exactly what shipped before this round. */
    const OHM_EP = 'https://overpass-api.openhistoricalmap.org/api/interpreter';
    const _fullGeom = new Map();   /* relation id → Promise<geometry|null>, one flight per unit */
    function idAt(props) {
      try {
        if (!props || props._ix == null) return null;
        const t = (props._tier === 'a2') ? T2 : T1;
        const d = t.data(); if (!d || !d.feats) return null;
        const f = d.feats[props._ix]; if (!f) return null;
        const id = f[10];
        return Number.isFinite(id) ? id : null;
      } catch (_) { return null; }
    }
    function geomFullAt(props) {
      const id = idAt(props);
      if (id == null) return Promise.resolve(null);
      let p = _fullGeom.get(id); if (p) return p;
      p = (async function () {
        try {
          const r = await fetch(OHM_EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
                                          body: '[out:json][timeout:60];relation(id:' + id + ');out geom;' });
          if (!r.ok) return null;
          const j = await r.json();
          const el = (j.elements || []).find(e => e.type === 'relation');
          if (!el) return null;
          const R = window.IntMapOhmRings; if (!R) return null;
          return R.geometryOf(el);   /* no area floor: the sliver may BE the unit the reader tapped */
        } catch (_) { return null; }
      })();
      /* a failed flight is not remembered as an answer — the next click may succeed */
      p.then(g => { if (!g) _fullGeom.delete(id); });
      _fullGeom.set(id, p);
      /* ⚠ AN UPSTREAM POLYGON IS BIG (148 KB for 伊豆国) AND A SESSION IS LONG. The memo exists so
         that re-tapping the unit you just tapped costs nothing, not so that every unit a reader has
         ever opened is held for the life of the page — that is a leak with a cache's name on it.
         Oldest out, insertion order being what Map iterates in. */
      while (_fullGeom.size > 24) { const k = _fullGeom.keys().next().value; if (k === id) break; _fullGeom.delete(k); }
      return p;
    }

    /* ⚠ THERE IS DELIBERATELY NO `changeAfter` / `featureAt` HERE, AND THE OMISSION IS THE POINT.
       js/time-borders.js exposes four "step to the next date the world changed" helpers because the
       Chronos panel has a row that calls them — and that row is NAMED «Borders / 国境 / Grenzen /
       Границы / Fronteras» in js/news-timeline.js. The subdivisions carry 1,750 change dates against
       the borders' 369, so folding them into that row would make its own label false, and giving them
       a row of their own is a change to a panel nobody asked about. Writing the four functions anyway,
       with no caller, would be untested surface that looks like a feature — so the module ends at what
       is actually used. They are ten lines whenever a round has a reason for them. */
    return {
      _go: w => { lastWhen = w; active = true; for (const t of TIERS) t.setActive(true); T1.go(w); _deep(); },
      _clear: () => { active = false; lastWhen = null; for (const t of TIERS) t.clear(); _applyNow(); },
      active: () => active, current: () => T1.key(),
      currentFC: () => T1.fc(), deepFC: () => T2.fc(), refresh: _applyNow, coverage, note, geomAt, idAt, geomFullAt,
      /* (#R604) which supply is drawing the era line: 'unknown' (tiles asked, not yet seen),
         'live' (tiles measured painting) or 'absent' (the grace period passed with nothing, so the
         bundle's coarse line stands in). Read by tests/r530.spec.js, which cannot see a closure. */
      tileState: () => (T1.vtState() === 'live' || T2.vtState() === 'live') ? 'live'
                     : (T1.vtState() === 'absent' ? 'absent' : T1.vtState()),
      deepZoom: () => DEEP_Z,
      /* ⚠ (#R604) THE FLOOR IS THE KERNEL'S WHEN THE BUNDLE HAS NOT LANDED, NOT A TYPED 1850. The
         drawn line is the tiles now, and they reach every century upstream holds, so a `range()`
         that answered 1850 while the label bundle was still downloading would understate the layer
         to Atlas and to the panel — and would go on understating it forever on a page that never
         fetches the bundle at all. */
      range: () => { const kern = (function(){ try { const m = +window.IntMapTime.min; return isFinite(m) ? m : 1; } catch (_) { return 1; } })();
        try { const d = T1.data(); return { min: Math.min(kern, (d && d.since) || kern), max: new Date().getFullYear() }; } catch (_) { return { min: kern, max: new Date().getFullYear() }; } }
    };
  })();
};
