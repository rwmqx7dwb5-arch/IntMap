/* ============================================================================
 *  time-admin1.js — the FIRST-LEVEL SUBDIVISIONS of the year on the clock  (#R530)
 * ----------------------------------------------------------------------------
 *  「国境線だけでなく地方区分の境界もChronosに完全対応させるように。完全対応。」
 *
 *  ══ ⚠⚠⚠ WHAT THIS FIXES, MEASURED ═══════════════════════════════════════════
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
 *  ══ THE DATA, AND WHY IT IS THE ONLY ONE ═══════════════════════════════════
 *  data/hist-admin1.js — OpenHistoricalMap, CC0, built by scripts/build-hist-admin1.mjs,
 *  ring-pooled in the SAME literal shape as data/cshapes.js so the two twin modules
 *  read their bundles with one set of habits. Dates are inclusive on both ends and
 *  DAY-EXACT where OHM knows the day, so the epoch index below is CShapes' verbatim
 *  (#R421): two dates inside one epoch share a cache key, and a quiet decade
 *  re-renders nothing while a busy year steps every time something moved.
 *  The header of the build script records every other candidate that was measured
 *  and what it actually was; OHM is the only global, dated, openly-licensed one.
 *
 *  ⚠⚠ THE COVERAGE IS PARTIAL AND THE MAP SAYS SO, RATHER THAN FILLING IT IN.
 *  OHM holds a few hundred dated units in the 19th century against 4,596 present-day
 *  ones. Two "fixes" were available and both are forbidden by CONSTITUTION §「偽物・
 *  ハリボテ禁止」: drawing the present-day province under a past date (the very bug
 *  this file exists to remove), and clipping today's provinces to the era's country
 *  (a boundary nobody ever surveyed, wearing the authority of a drawn line).
 *  `coverage()` therefore reports what IS in force, the layer row says it in nine
 *  languages, and a country the record is silent about is drawn with no subdivision
 *  line — which is the true statement.
 * ==========================================================================*/
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.timeAdmin1 = function (HOST) {
  const GE = () => window.IntMapGeoEngine;   /* the renderer, through the contract — never the raw handle */
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
        if (window.__HISTADM1) { _D = window.__HISTADM1; res(_D); return; }
        const s = document.createElement('script'); s.src = 'data/hist-admin1.js'; s.async = true;
        s.onload = () => { _D = window.__HISTADM1 || null; res(_D); };
        s.onerror = () => { _P = null; res(null); };
        document.head.appendChild(s);
      });
      return _P;
    }

    /* ── the epoch index (#R421, verbatim from the country side) ───────────
       Every instant on which the subdivisions change, as sortable YYYYMMDD ints: a
       record's START, and the day AFTER its END (a unit that vanishes with no successor
       still ends an epoch). Built once, lazily, off the same bundle the polygons come
       from — there is no second source to drift from. */
    let _bnd = null;
    const _ymd = (y, m, d) => y * 10000 + m * 100 + d;
    function _dayAfter(y, m, d) { const t = new Date(Date.UTC(y, m - 1, d)); t.setUTCDate(t.getUTCDate() + 1); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }
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

    function fcAt(d, y, m, dd) {
      const t = _ymd(y, m, dd), feats = [];
      for (let i = 0; i < d.feats.length; i++) {
        const f = d.feats[i];
        if (_ymd(f[2], f[3], f[4]) > t || _ymd(f[5], f[6], f[7]) < t) continue;
        const NAME = nameOf(f);
        feats.push({ type: 'Feature', geometry: geomOf(d, i), properties: { NAME: NAME, name: NAME, _lvl: f[1], _ix: i } });
      }
      return { type: 'FeatureCollection', features: feats };
    }

    /* ── layers ────────────────────────────────────────────────────────────
       ⚠ (#R212's rule, applied to the province line) Travelling in time must change
       WHERE a boundary runs, not what a boundary LOOKS like. Every value below is the
       one `ref-admin1` uses (js/app-body.js) and `ofm-admin1` uses (js/place-labels.js),
       read out of js/border-style.js / IntMapLabelScale rather than re-typed; the
       literals are only the fallback for a page where those have not evaluated, and
       they are the same numbers. */
    function ensure() {
      try {
        if (!_imCanDraw()) return false;
        const BS = (window.IntMapBorderStyle || {});
        const COL = BS.admin1 || '#cba6f7';
        const W = BS.admin1Width || ['interpolate', ['linear'], ['zoom'], 1, 0.45, 4, 0.75, 8, 1.15, 12, 1.6];
        if (!GE().layers.hasSource('imta-src')) GE().layers.addSource('imta-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: 'OpenHistoricalMap (CC0)' });
        /* below the labels, and below the era COUNTRY line, so a national border always
           reads on top of a provincial one — the order `ref-admin1`/`borders-only-line`
           already have at Now. */
        const before = ['imtb-lbl', 'ofm-admin1', 'ofm-country', 'ofm-city'].find(id => { try { return !!GE().layers.has(id); } catch (_) { return false; } });
        if (!GE().layers.has('imta-line')) GE().layers.add({
          id: 'imta-line', type: 'line', source: 'imta-src',
          layout: { visibility: 'none', 'line-join': 'round' },
          paint: { 'line-color': COL, 'line-opacity': 0.82, 'line-dasharray': [3, 2], 'line-width': W }
        }, before);
        /* the era unit's NAME, in the style `ofm-admin1` uses for the present-day one —
           same zoom window, same size ladder, same colour-of-its-own-boundary (#R252),
           same dark halo on both basemaps.
           ⚠ readerFont(), not a name-key test: `placeFont()` decides the face by looking
           for `name:ja` ON THE FEATURE, and an era feature carries none — the localized
           name is already baked into `NAME` above, which is exactly the case readerFont()
           exists for (js/time-borders.js `_ERAFONT`, #R309). */
        const FONT = (function () { try { return window.IntMapMapTypography.readerFont(); } catch (_) { return ['Noto Sans SC']; } })();
        const SIZE = (function () { try { return window.IntMapLabelScale.place('admin1'); } catch (_) { return ['interpolate', ['linear'], ['zoom'], 4, 9.5, 7, 11.5]; } })();
        if (!GE().layers.has('imta-lbl')) GE().layers.add({
          id: 'imta-lbl', type: 'symbol', source: 'imta-src', minzoom: 4, maxzoom: 9,
          layout: {
            visibility: 'none', 'symbol-placement': 'point', 'text-field': ['coalesce', ['get', 'NAME'], ['get', 'name'], ''],
            'text-font': FONT, 'text-size': SIZE, 'text-letter-spacing': 0.06, 'text-max-width': 8,
            'text-padding': 4, 'text-optional': true
          },
          paint: { 'text-color': COL, 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.5 }
        });
        /* ⚠ THE CLICK IS NOT WIRED HERE. An era province name is a place label like any other, and
           js/map-ui.js is the ONE place that decides what a place label does when it is tapped —
           #R201 put `ofm-admin1` into all four of its lists after 「クリック可能ではない！ほかの地名
           ラベルと違う挙動にするな！」, and a second owner in this file would be the same defect
           wearing a different name. `imta-lbl` joins that list instead, so travelling does not turn a
           working label into a dead one for the years it is on screen. */
        return true;
      } catch (_) { return false; }
    }

    function apply(fc) {
      const my = seq; shownFC = fc;
      try {
        if (GE().layers.hasSource('imta-src') && GE().layers.has('imta-line')) {
          GE().layers.setSourceData('imta-src', fc); _applyNow(); return;
        }
      } catch (_) {}
      if (ensure()) { try { GE().layers.setSourceData('imta-src', fc); } catch (_) {} _applyNow(); }
      /* (#R140's shape) the style was mid-load — don't latch the era units absent until a reload. */
      else whenStyleReady().then(() => { if (active && seq === my) apply(fc); });
    }
    /* ══ (#R530) THE SWITCHBOARD — WHICH SET OF SUBDIVISIONS IS ON SCREEN ══════════════════════
       ⚠ IT LIVES HERE, NOT IN js/app-body.js, AND THAT IS NOT A STYLE CHOICE. The app shell has a
       LINE BUDGET (tests/r168 #8, and r350 ⑨c and r479 ⑧ hold copies of the same number): six files
       may total 8,050 lines and they stood at 8,049. This block is fifty of them. It also belongs
       here on the merits — the module that draws the era units is the right owner of the rule that
       decides whether they or the live ones are shown. app-body keeps one call and one hand-back.
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
        if (GE().layers.has('ref-admin1')) GE().layers.setLayout('ref-admin1', 'visibility', (on && !traveling) ? 'visible' : 'none');
        if (GE().layers.has('imta-line')) GE().layers.setLayout('imta-line', 'visibility', (on && traveling) ? 'visible' : 'none');
        if (GE().layers.has('imta-lbl')) GE().layers.setLayout('imta-lbl', 'visibility', (namesOn && traveling) ? 'visible' : 'none');
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

    function clear() {
      active = false; shownKey = null; shownFC = null; shownWhen = null;
      try { GE().layers.setSourceData('imta-src', { type: 'FeatureCollection', features: [] }); } catch (_) {}
      try { ['imta-line', 'imta-lbl'].forEach(id => { if (GE().layers.has(id)) GE().layers.setLayout(id, 'visibility', 'none'); }); } catch (_) {}
      _applyNow();
    }

    async function go(when) {
      active = true; const my = ++seq;
      const isD = (when instanceof Date) && !isNaN(when.getTime());
      const y = isD ? when.getFullYear() : Math.round(+when);
      const m = isD ? (when.getMonth() + 1) : 7, dd = isD ? when.getDate() : 1;
      shownWhen = isD ? when : new Date(y, 6, 1, 12, 0, 0);
      const d = await load();
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

    /* ── the clock ─────────────────────────────────────────────────────────
       ⚠ the INSTANT, not the year (#R421): `IntMapTime.setYear(y)` sets June 15, and a
       selector that sampled July 1 would draw a world sixteen days from the one the
       reader named. The 45 ms debounce is #R122's number — a single year change applies
       almost immediately while a slider drag still coalesces.
       ⚠ THE SAME "IS THIS TRAVELLING?" TEST AS THE COUNTRY BORDER, so the two halves of
       one map can never disagree about which era they are in: live, or the present year,
       is Now — everything else is the past and the modern line steps aside. */
    window.IntMapTime.on(e => {
      clearTimeout(go._t);
      if (e.isLive || e.year >= new Date().getFullYear()) { clear(); return; }
      const w = e.when;
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
      if (!active) { active = true; _applyNow(); }
      go._t = setTimeout(() => { try { go(w); } catch (_) {} }, 45);
    });

    /* re-localize the era names when the language changes WHILE travelling: `nameOf`
       bakes one language into the feature, so the collection has to be rebuilt — but
       only the CURRENT epoch, and only when something actually moved. */
    window.addEventListener('intmap-lang', () => {
      try {
        if (!active || shownKey == null || !_D) return;
        const w = shownWhen; if (!w) return;
        const fc = fcAt(_D, w.getFullYear(), w.getMonth() + 1, w.getDate());
        cache.set(shownKey, fc); apply(fc);
      } catch (_) {}
    });

    /* re-assert ONLY when a base-style swap (globe/flat/satellite) WIPED the layers —
       detected by a missing imta-line. Re-asserting on every styledata would loop,
       because setLayout fires styledata (js/time-borders.js learned this as the fast-blink). */
    GE().events.on('styledata', () => {
      if (active && shownKey != null && _imCanDraw() && !GE().layers.has('imta-line')) setTimeout(() => {
        try {
          if (active && _imCanDraw() && !GE().layers.has('imta-line')) {
            ensure(); const fc = cache.get(shownKey); if (fc) { try { GE().layers.setSourceData('imta-src', fc); } catch (_) {} }
            _applyNow();
          }
        } catch (_) {}
      }, 160);
    });

    /* ── warm the bundle at idle, and NOT on a phone or Data Saver ──────────
       The same rule and the same reasons as data/cshapes.js (#R192/#R201): it is a
       speculative copy for a feature that has not been asked for, and on a phone it
       queues in front of the tiles the reader is actually looking at. `load()` below
       is what draws, so nothing is lost by skipping it — only the head start. */
    (function warm() {
      const pf = () => { load().catch(() => {}); };
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
       1900" to be a percentage of. */
    function coverage() {
      try {
        if (!active || !shownFC) return { active: false, units: 0, when: null, source: (_D && _D.src) || null };
        return { active: true, units: shownFC.features.length, when: shownWhen ? new Date(shownWhen.getTime()) : null, source: (_D && _D.src) || null };
      } catch (_) { return { active: false, units: 0, when: null, source: null }; }
    }
    /* the nine-language sentence the layer row shows while travelling (AGENTS.md §3.5). */
    function note() {
      const c = coverage(); if (!c.active) return '';
      const n = String(c.units);
      return _LT.arr(LA(
        n + ' dated subdivisions are in force on this date. OpenHistoricalMap has not mapped every country yet, so a country with no line here is one the record is silent about — not one without subdivisions.',
        'この日付で記録のある地方区分は ' + n + ' 件。OpenHistoricalMap はまだ全ての国を網羅していないため、境界線が無い国は「区分が無かった」のではなく「記録がまだ無い」。',
        n + ' datierte Verwaltungseinheiten gelten an diesem Datum. OpenHistoricalMap hat noch nicht jedes Land erfasst: Ein Land ohne Linie ist eines, zu dem die Quelle schweigt — nicht eines ohne Untergliederungen.',
        'На эту дату действует ' + n + ' датированных единиц. OpenHistoricalMap охватывает ещё не все страны: страна без линии — это страна, о которой источник молчит, а не страна без единиц.',
        n + ' subdivisiones fechadas están en vigor en esta fecha. OpenHistoricalMap aún no cubre todos los países: un país sin línea es aquel del que no hay registro, no uno sin subdivisiones.',
        '此日期有記錄的行政區共 ' + n + ' 個。OpenHistoricalMap 尚未涵蓋所有國家，因此沒有界線的國家是記錄從缺，而非沒有行政區。',
        '此日期有记录的行政区共 ' + n + ' 个。OpenHistoricalMap 尚未涵盖所有国家，因此没有界线的国家是记录从缺，而非没有行政区。',
        n + ' subdivisions datées sont en vigueur à cette date. OpenHistoricalMap ne couvre pas encore tous les pays : un pays sans tracé est un pays sur lequel la source est muette, non un pays sans subdivisions.',
        '이 날짜에 기록이 있는 행정구역은 ' + n + '개입니다. OpenHistoricalMap이 아직 모든 나라를 담지 못했으므로, 경계선이 없는 나라는 구역이 없었던 것이 아니라 기록이 아직 없는 것입니다.'
      ));
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
      _go: go, _clear: clear, active: () => active, current: () => shownKey,
      currentFC: () => shownFC, refresh: _applyNow, coverage, note,
      range: () => { try { return { min: (_D && _D.since) || 1850, max: new Date().getFullYear() }; } catch (_) { return { min: 1850, max: new Date().getFullYear() }; } }
    };
  })();
};
