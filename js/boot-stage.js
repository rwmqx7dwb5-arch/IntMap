/* ============================================================================
 *  IntMap · THE PHONE'S START-UP, IN STAGES — window.__imBootStage  (mobile-performance)
 * ----------------------------------------------------------------------------
 *  「スマホのパフォーマンスと UI を改善して。」→「修正じゃなくて作り変え。意図を理解しろ。」
 *
 *  MEASURED before this file (production, 390×844, CPU ×4, 2026-10-02): the app could be touched
 *  after 9.7–10.8 s, and on the way it read 6.5 MB in 133 requests. Locally, on the same profile
 *  (scripts/frame-profile.mjs --boot --detail), what a phone read BEFORE its launch screen lifted
 *  included the 98,887-star sky (773 kB), the 12,000-row gazetteer (551 kB, then ~700 ms of one
 *  long task compiling its matchers), a Natural Earth country file from a third-party CDN (819 kB)
 *  and six World Bank indicators — none of which is part of «the map and its chrome can be used».
 *  Each had been scheduled «on idle» by its own author, which on a phone whose main thread is busy
 *  for nine seconds means «somewhere inside the boot».
 *
 *  So the question every reader used to answer for itself — WHEN may I read this — is answered here,
 *  once, as a DECLARATION, and the readers ask it:
 *
 *      boot      read while the launch screen is up: the map, its chrome, the floor under the default
 *                basemap. Things a phone cannot be used without.
 *      settled   read once the app is INTERACTIVE (the launch screen has lifted) and the main thread
 *                is next idle. Still eager — nothing waits for a click — but behind the moment the
 *                reader can touch the map, and never inside it.
 *      need      read only when a reader asks (a panel, a layer, a search). Declared so that the
 *                plan names every file the start-up path can reach, not only the ones it reads.
 *
 *  ⚠ THE STAGE IS PER DEVICE. The plan says what a PHONE does; every other device keeps `boot`
 *  semantics unless a row says otherwise, so a desktop starts exactly as it did. «Phone» is the cost
 *  predicate js/ui-device.js owns (`phoneBudget()` — the pointer and the screen, never a width,
 *  #R232/#R668), read at call time.
 *
 *  ⚠ A STAGE DEFERS A READ; IT NEVER REMOVES ONE. Every row below is still read on every device,
 *  in full, with the same bytes — what moves is the moment. Nothing visible is degraded: the star
 *  sky, the gazetteer and the country table arrive a beat after the app can be touched instead of
 *  a beat before.
 *
 *  ⚠ THE PLAN IS CHECKED FROM TWO SIDES (the same rule js/data-door.js §「THE JOB IS ONE FUNCTION」
 *  keeps — a declaration nobody checks is a comment):
 *    · statically, by scripts/perf-budget.mjs (`npm run check:perf`): every `data/…` file a module
 *      in the EAGER graph names must have a row here, and the bytes of the rows a phone reads at
 *      `boot` are a ceiling in tests/perf-baseline.json like every other startup number;
 *    · at run time, by scripts/frame-profile.mjs --boot --detail: what a phone actually requested
 *      before the launch screen lifted, compared with `boot` here (an undeclared request, or a row
 *      declared `settled`/`need` that was read during the boot, is printed as a violation).
 *
 *  ⚠ NOT A LOADER. Fetching, inflating and parsing stay with js/data-door.js and each reader; this
 *  file only answers «may it start now», as a promise.
 * ==========================================================================*/
(function (G) {
  'use strict';
  if (G.__imBootStage) return;

  /* ── THE PLAN ────────────────────────────────────────────────────────────────────────────────
     `path` is a same-origin file under the site root (prefix match when it ends in '/'); `host` an
     external origin. `phone` / `other` is the stage on each class of device (`other` defaults to
     'boot'). `who` is the reader, `why` the reason it may (or may not) wait. `shipped: false` says the
     code names a file this site does not ship (the gate then requires that it is absent). Order is irrelevant. */
  const PLAN = [
    /* ── read during the boot on every device ── */
    { id: 'world-basemap', path: 'data/world-basemap.jpg', phone: 'boot', who: 'js/world-base.js', why: 'the floor under the default (satellite) basemap — the first frame is drawn from it' },
    { id: 'land-mask', path: 'data/land-mask.png', phone: 'boot', who: 'js/land-mask.js via js/basemap-switch.js', why: 'the basemap switcher draws its map-face thumbnail from it (19 kB)' },
    { id: 'hdi-series', path: 'data/hdi-series.json', phone: 'boot', who: 'js/time-countries.js loadHDI()', why: 'the country table\'s HDI column (10 kB)' },
    { id: 'border-coast', path: 'data/border-coast.js', phone: 'need', who: 'js/border-coast.js', why: 'which border edges are coast — read when borders are drawn at a zoom that needs it' },
    { id: 'border-detail', path: 'data/border-detail/', phone: 'need', who: 'js/border-coast.js', why: 'the zoomed-in outline shards, by viewport' },

    /* ── behind the moment a phone can be touched ── */
    { id: 'stars', path: 'data/stars.bin', phone: 'settled', who: 'js/star-catalogue.js (the night sky behind the globe, js/space-sky.js)', why: '773 kB and a 98,887-row decode for the background of the dark globe; the globe is usable without it' },
    { id: 'gazetteer', path: 'data/gazetteer-phone.json.gz', phone: 'settled', who: 'js/gazetteer.js warm() — the news locator and the place search', why: '551 kB and the long task that builds the locator; the curated rows answer until it lands' },
    { id: 'gazetteer-world', path: 'data/gazetteer-world.json.gz', phone: 'need', who: 'js/gazetteer.js (desktop file; a phone reads the phone head of it)', why: 'never read by a phone' },
    { id: 'ne-countries', path: 'data/ne-countries/', phone: 'settled', who: 'js/countries-ui.js loadCountryData()', why: 'the country table and its outlines; the visible border line is the vector basemap\'s, not this file\'s' },
    { id: 'world-bank', host: 'api.worldbank.org', phone: 'settled', who: 'js/wb-layers.js refreshStatsLatest(), js/app-body.js loadGdpPPP()', why: 'refreshes figures the country table already carries' },

    /* ── only when a reader asks ── */
    { id: 'country-facts', path: 'data/country-facts.json', phone: 'need', who: 'js/countries-ui.js (a country card)', why: 'one card' },
    { id: 'admin1', path: 'data/admin1-world.json.gz', phone: 'need', who: 'js/world-packs.js, js/atlas-admin1.js', why: 'first-level subdivisions, a layer or an Atlas question' },
    { id: 'asher-languages', path: 'data/asher_languages.geojson', phone: 'need', shipped: false, who: 'js/dash-extended.js', why: 'a layer that asks for a file this site does not ship — it says so on screen when pressed; nothing is read at start-up' },
    { id: 'bathymetry', path: 'data/bathymetry.png', phone: 'need', who: 'js/bathymetry.js', why: 'the tsunami and sea-level tools' },
    { id: 'cshapes', path: 'data/cshapes.js', phone: 'need', who: 'js/time-borders.js', why: 'the time machine' },
    { id: 'hist-borders', path: 'data/hist-borders.js', phone: 'need', who: 'js/time-borders.js', why: 'the time machine' },
    { id: 'hist-eras', path: 'data/hist-eras.js', phone: 'need', who: 'js/time-borders.js', why: 'the time machine' },
    { id: 'hist-era-spans', path: 'data/hist-era-spans.json', phone: 'need', who: 'js/time-borders.js', why: 'the time machine' },
    { id: 'histnames', path: 'data/histnames.json', phone: 'need', who: 'js/time-borders.js', why: 'the time machine' },
    { id: 'hist-admin', path: 'data/hist-admin', phone: 'need', who: 'js/time-admin1.js', why: 'historical subdivisions (hist-admin1/2/3, hist-admin-fill)' },
    { id: 'hist-claims', path: 'data/hist-claims.json', phone: 'need', who: 'js/time-admin1.js (_know)', why: 'the same ground claimed twice, counted at the reader\'s date while subdivisions are drawn in the time machine' },
    { id: 'hist-kuni', path: 'data/hist-kuni.js', phone: 'need', who: 'js/time-admin1.js', why: 'the provinces of Japan, in the time machine' },
    { id: 'hist-cities', path: 'data/hist-cities.json', phone: 'need', who: 'js/hist-cities.js', why: 'historical city names, in the time machine' },
    { id: 'hist-places', path: 'data/hist-places.json', phone: 'need', who: 'js/hist-places.js', why: 'Pleiades places, in the time machine' },
    { id: 'ecoregions', path: 'data/ecoregions_2017.', phone: 'need', who: 'js/layer-packs.js', why: 'a layer' },
    { id: 'elections', path: 'data/elections/', phone: 'need', who: 'js/elections.js', why: 'a layer' },
    { id: 'gibs-range', path: 'data/gibs-range.json', phone: 'need', who: 'js/layer-packs.js', why: 'a satellite-product layer' },
    { id: 'language', path: 'data/language', phone: 'need', who: 'js/layer-packs.js', why: 'the language layer (language.json, language-tree.json)' },
    { id: 'religion', path: 'data/religion.json', phone: 'need', who: 'js/layer-packs.js', why: 'a layer' },
    { id: 'maddison', path: 'data/maddison.json', phone: 'need', who: 'js/history.js', why: 'the time machine\'s historical GDP' },
    { id: 'npp', path: 'data/npp.json', phone: 'need', who: 'js/sims.js', why: 'a simulator' },
    { id: 'radiation-hindcast', path: 'data/radiation-hindcast.json', phone: 'need', who: 'js/sims.js hindcast(), js/atlas-cap-sim.js', why: 'the 2011 answer-check of the radioactive-dispersion panel — read only when the reader presses it (161 kB, 51 kB gzipped: the preset and the three rungs of the attribution ladder, docs/RADIATION-MODEL.md §10b)' },
    { id: 'ocean-currents', path: 'data/ocean-currents', phone: 'need', who: 'js/ocean-currents.js, js/data-layers.js', why: 'a layer' },
    { id: 'osm-facilities', path: 'data/osm-', phone: 'need', who: 'js/osm-facilities.js', why: 'a layer (osm-diplo.json, osm-space.json)' },
    { id: 'precip', path: 'data/precip-', phone: 'need', who: 'js/precip-annual.js', why: 'a layer' },
    { id: 'subcables', path: 'data/subcables', phone: 'need', who: 'js/data-layers.js', why: 'a layer' },
    { id: 'us-elections', path: 'data/us-', phone: 'need', who: 'js/us-elections.js', why: 'a layer (us-elections.json, us-states.json)' },
    { id: 'volcanoes', path: 'data/volcanoes_gvp.json', phone: 'need', who: 'js/beta-overlays.js, js/compare.js', why: 'a layer' },
    { id: 'vs30', path: 'data/vs30', phone: 'need', who: 'js/vs30-mask.js', why: 'the earthquake simulator' },
    { id: 'whc', path: 'data/whc-', phone: 'need', who: 'js/beta-overlays.js', why: 'a layer and its detail card' },
    { id: 'who-don', path: 'data/who-don.json.gz', phone: 'need', who: 'js/outbreaks.js', why: 'a layer' },
  ];
  const STAGES = ['boot', 'settled', 'need'];

  /* ── the device ── */
  function isPhone() {
    try { const D = G.IntMapDevice; if (D && typeof D.phoneBudget === 'function') return !!D.phoneBudget(); } catch (_) { }
    try { if (typeof G._imPhoneClass === 'function') return !!G._imPhoneClass(); } catch (_) { }
    return false;   /* a device nobody has classified yet keeps today's (boot) schedule */
  }

  function row(id) { for (const r of PLAN) if (r.id === id) return r; return null; }
  /** the stage `id` is read at on THIS device ('boot' for an unknown id — nothing is held back by a typo
   *  in a caller; the static gate is what catches an undeclared file). */
  function stageOf(id, phone) {
    const r = row(id); if (!r) return 'boot';
    const p = (phone === undefined) ? isPhone() : !!phone;
    return (p ? r.phone : (r.other || 'boot')) || 'boot';
  }

  /* ── «interactive»: the launch screen has lifted ─────────────────────────────────────────────
     index.html owns the launch screen and publishes `__imBoot` with `isDone()`; it has no event. Two
     facts are observed instead of polled: the call that ends it (`__imBoot.done`, wrapped here — every
     ending in js/app-body.js goes through it) and the class the screen receives the moment it starts to
     fade (`boot-gone`, which index.html's own 20 s failsafe also sets without going through `done`). */
  let _interactive = null;
  function interactive() {
    if (_interactive) return _interactive;
    _interactive = new Promise((resolve) => {
      let fired = false;
      const go = () => { if (fired) return; fired = true; try { mo && mo.disconnect(); } catch (_) { } resolve(); };
      let mo = null;
      try {
        const B = G.__imBoot;
        if (!B || typeof B.isDone !== 'function' || B.isDone()) { go(); return; }
        const orig = B.done;
        if (typeof orig === 'function') B.done = function () { const r = orig.apply(this, arguments); go(); return r; };
        const el = G.document && G.document.getElementById('boot-splash');
        if (el && typeof G.MutationObserver === 'function') {
          mo = new G.MutationObserver(() => { if (el.classList.contains('boot-gone') || !el.isConnected) go(); });
          mo.observe(el, { attributes: true, attributeFilter: ['class'] });
          if (el.parentNode) mo.observe(el.parentNode, { childList: true });
        }
      } catch (_) { go(); }
    });
    return _interactive;
  }

  /* ── «settled»: interactive, and then the main thread's next idle period ───────────────────────
     ⚠ THE CEILING IS THE ONE THE READERS THIS REPLACES ALREADY USED (js/app-body.js's country warm-up
     `requestIdleCallback(…,{timeout:7000})`, js/wb-layers.js 6000, js/countries-ui.js 6000): a page
     that is never idle still gets its data. OBSERVED, not tuned: 6 s is the middle of the three.
     EXPIRES IF a reader that waits here needs its data sooner than an idle period can promise. */
  const SETTLE_CEILING_MS = 6000;
  let _settled = null;
  function settled() {
    if (_settled) return _settled;
    _settled = interactive().then(() => new Promise((resolve) => {
      try {
        if (typeof G.requestIdleCallback === 'function') { G.requestIdleCallback(() => resolve(), { timeout: SETTLE_CEILING_MS }); return; }
      } catch (_) { }
      setTimeout(resolve, 0);
    }));
    return _settled;
  }

  /* ── one settled JOB at a time, each in an idle period, in the order they were asked for ─────────
     MEASURED on the first version of this file (one shared «settled» promise): every deferred read
     started within 0.4 ms of the same idle callback — the World Bank indicators, the star catalogue,
     the gazetteer and the country file all at 8.2 s, right after the launch screen lifted, so their
     arrival work landed together on the first seconds a reader can touch the map. A turn per idle
     period was the second version, and MEASURED it was not enough: idle periods come back to back
     while a read is on the network, so the star catalogue and the gazetteer still started 5 ms apart
     and their arrivals (a 98,887-row derivation, a matcher build) still stacked.
     So a reader hands over its JOB — the read AND the work its arrival does — and the next turn is
     released when that job has settled and the thread is next idle. ⚠ A job that never settles must
     not hold the queue: after SETTLE_CEILING_MS the next turn goes anyway (the job itself is not
     touched). A reader that only needs «may I start» passes no job and holds its turn for nothing. */
  const _turns = [];
  let _pumping = false;
  function idle(fn) {
    try { if (typeof G.requestIdleCallback === 'function') { G.requestIdleCallback(fn, { timeout: SETTLE_CEILING_MS }); return; } } catch (_) { }
    setTimeout(fn, 0);
  }
  function pump() {
    if (_pumping) return; _pumping = true;
    settled().then(function step() {
      const t = _turns.shift();
      if (!t) { _pumping = false; return; }
      let p;
      try { p = Promise.resolve(t.job ? t.job() : undefined); } catch (e) { p = Promise.reject(e); }
      p.then(t.resolve, t.reject);
      let moved = false;
      const go = () => { if (moved) return; moved = true; idle(step); };
      p.then(go, go);
      if (t.job) setTimeout(go, SETTLE_CEILING_MS);
    });
  }
  function settledTurn(job) { return new Promise((resolve, reject) => { _turns.push({ job, resolve, reject }); pump(); }); }

  /* `need` resolves on the reader's own call — by the time a reader asks, the need is real. */
  function whenStage(stage, job) {
    if (stage === 'settled') return settledTurn(job);
    if (job) return whenStage(stage).then(job);
    if (stage === 'interactive') return interactive();
    return Promise.resolve();
  }
  /** at(id[, job]) → a promise that resolves when `id` may be read on this device — with `job()`'s result
   *  when a job is given (the job runs at that moment, and a settled queue waits for it before the next).
   *  Readers use it for the read they do on their own initiative; a read a reader ASKED for does not wait. */
  function at(id, job) { return whenStage(stageOf(id), job); }

  /** the plan, as data — for scripts/perf-budget.mjs and scripts/frame-profile.mjs. */
  function plan() { return PLAN.map((r) => Object.assign({}, r)); }
  /** which row a URL belongs to (or null). `base` is the page's root for same-origin paths. */
  function rowFor(url, base) {
    let u; try { u = new URL(String(url), base || (G.document && G.document.baseURI) || 'http://localhost/'); } catch (_) { return null; }
    let root = ''; try { root = new URL(base || (G.document && G.document.baseURI) || 'http://localhost/').pathname.replace(/[^/]*$/, ''); } catch (_) { }
    const rel = decodeURIComponent(u.pathname.startsWith(root) ? u.pathname.slice(root.length) : u.pathname.replace(/^\//, ''));
    for (const r of PLAN) {
      if (r.host && u.host === r.host) return r;
      if (r.path && rel.startsWith(r.path)) return r;
    }
    return null;
  }

  G.__imBootStage = { STAGES, plan, rowFor, stageOf, whenStage, at, interactive, settled, isPhone, SETTLE_CEILING_MS };
})(typeof globalThis !== 'undefined' ? globalThis : self);

export const BootStage = globalThis.__imBootStage;
