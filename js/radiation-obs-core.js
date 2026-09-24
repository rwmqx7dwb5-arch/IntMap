/* ============================================================================
 *  IntMap · radiation observations — the part that needs no window  (#R797)
 * ----------------------------------------------------------------------------
 *  Everything js/radiation-layer.js knew about the DATA — the feed's two claims (`stations` versus
 *  `reference`), the day-mode reload, the chunked follow-up for the network that cannot answer in
 *  one request, the neighbour join `near()`, the per-station series — lived inside the same
 *  closure as the map layers, the legend and the clock subscription, and reached `fetch`,
 *  `window.SUPABASE_URL` and `window.IntMapTime` as globals. That made the data part untestable
 *  without a browser and unusable from anything but the one layer (the worker-side pandemic and
 *  plume simulators, Atlas's `data.radiationNear`, a headless GIS run all go THROUGH the layer).
 *
 *  This file is that data part with its dependencies as ARGUMENTS:
 *
 *      const obs = makeRadiationObs({ fetch, feedBase });
 *      await obs.load(null);              // latest, then the thin sources in chunks
 *      obs.near(35.7, 139.7, 150);        // stations within 150 km, nearest first
 *      obs.subscribe(ev => …);            // 'state' | 'feed' | 'chunk' — the layer paints on these
 *      obs.dispose();                     // abort what is in flight; later answers are dropped
 *
 *  · `fetch`    — the ONE way out. The browser hands the active scope's fetch (js/runtime.js) so a
 *                 closed layer's request is aborted; a test hands a fake; a worker hands its own.
 *  · `feedBase` — the Supabase origin (string or function), because the feed is an Edge Function
 *                 (supabase/functions/radiation-feed) and the base is deployment configuration,
 *                 not a fact this file may know.
 *  No `window`, no DOM, no engine, no clock: the clock's decision ("which ISO day, or live") is an
 *  argument to `load(iso)`, made by whoever owns the clock. Every result checks the GENERATION it
 *  was started in, so a reply that lands after `dispose()` — or after a newer `load` — is dropped
 *  rather than painted (the shape #R708 hand-wrote four times and js/runtime.js owns since #R789).
 *
 *  THE RAMP is here because it is a fact about the data, not the map: docs/RADIATION.md holds the
 *  same table in prose and tests/r585-checks measures that the two agree.
 * ==========================================================================*/
export function makeRadiationObs(deps) {
  const D = deps || {};
  if (typeof D.fetch !== 'function') throw new Error('makeRadiationObs: a fetch function is required');
  const base = () => { try { const b = typeof D.feedBase === 'function' ? D.feedBase() : D.feedBase; return String(b || '').replace(/\/$/, ''); } catch (_) { return ''; } };
  const feedUrl = (qs) => { const b = base(); return b ? (b + '/functions/v1/radiation-feed?' + qs) : ''; };

  /* ══ THE RAMP — absolute nSv/h, anchored on numbers the PROVIDERS publish as their own action
     thresholds, not on the spread of whatever was fetched today (which would recolour the world
     every hour and make two screenshots incomparable).
       · 50 / 100  — the natural terrestrial band. Observation (2026-09-09): the 151 Dutch annual
         means in the CC0 RIVM set span 56.0–116.0 nSv/h, and RIVM states the national range as
         55–100 nSv/h, the spread being soil composition.
       · 200       — RIVM's published threshold for an automatic alert to RIVM.
       · 1000      — the alarm threshold the Swiss NADAM network publishes for its own probes.
         (Cited as a published public fact; NADAM's DATA is not carried — no open licence.)
       · 2000      — RIVM's published threshold for also notifying the safety region.
     EXPIRY: if a provider republishes a different action threshold, this ramp is wrong and the
     step it came from must move with it. CANONICAL: docs/RADIATION.md holds the same table in
     prose, and tests/r585-checks.test.mjs measures that the two agree.
     ⚠ The colours run cool→hot but 50–200 is NOT a warning: almost every healthy station on earth
     sits inside it. The legend says so in words, because a red-ish dot with no sentence beside it
     is how a normal Tuesday gets read as an accident. */
  const RAMP = [[0, '#4c8dff'], [50, '#39c07c'], [100, '#8fbf3f'], [200, '#d8c53a'], [1000, '#f0912d'], [2000, '#e02f2f']];

  const state = { on: false, iso: null, loading: false, err: null };
  let feed = null;              /* the last successful {v,at,unit,sources,stations,reference} */
  let gen = 0;                  /* bumped by dispose() and by every load(): a reply checks it */
  let ac = null;                /* the in-flight controller for the current generation */
  const subs = new Set();
  const notify = (type) => { for (const fn of subs) { try { fn({ type, state: snapshot() }); } catch (_) { } } };
  const signalFor = (g) => (ac && g === gen) ? ac.signal : undefined;
  function newGen() {
    gen++;
    try { if (ac) ac.abort(); } catch (_) { }
    ac = (typeof AbortController === 'function') ? new AbortController() : null;
    return gen;
  }
  const doFetch = (url, g, init) => {
    const o = Object.assign({}, init || {});
    const s = signalFor(g); if (s && !o.signal) o.signal = s;
    return D.fetch(url, o);
  };

  /* ⚠ `stations` AND `reference` ARE NOT THE SAME CLAIM, and the feed keeps them apart for that
     reason: `stations` is "somebody measured this recently", `reference` is "a published mean for a
     period" (today, the 151 Dutch annual means for 2011 — RIVM's live display is down and its own
     page sends readers to EURDEP). Painting a 2011 average in the same ramp as an hourly reading
     would make the map say something nobody measured. So reference points are drawn only when the
     CLOCK IS IN THEIR PERIOD, which is the same rule every other source follows, and the legend
     says they exist the rest of the time. */
  function refRows(f) {
    if (!f || !Array.isArray(f.reference) || !f.reference.length) return [];
    const yr = state.iso ? state.iso.slice(0, 4) : null;
    if (!yr) return [];
    const per = {};
    for (const s of (f.sources || [])) if (s.asOf) per[s.id] = String(s.asOf).slice(0, 4);
    return f.reference.filter(r => per[r.s] === yr);
  }
  /* the drawable rows: a station whose coordinate could not be resolved is KEPT by the feed and
     dropped HERE — the feed's job is to say what exists, this file's job is to say what can be
     drawn. Returned as GeoJSON because that is the renderer's contract and the export's. */
  function toFC(f) {
    const out = [];
    const src = f === undefined ? feed : f;
    if (!src) return { type: 'FeatureCollection', features: out };
    const rows = (Array.isArray(src.stations) ? src.stations : []).concat(refRows(src));
    for (const s of rows) {
      if (typeof s.y !== 'number' || typeof s.x !== 'number') continue;
      if (!(s.y >= -90 && s.y <= 90 && s.x >= -180 && s.x <= 180)) continue;
      out.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [s.x, s.y] },
        properties: { c: s.c, s: s.s, n: s.n || '', v: (typeof s.v === 'number' ? s.v : null), t: s.t || '', q: s.q || '', k: s.k || '', b: s.b ? 1 : 0 }
      });
    }
    return { type: 'FeatureCollection', features: out };
  }

  /* ── the load ────────────────────────────────────────────────────────────────────────────── */
  function load(iso) {
    if (state.loading) return Promise.resolve(false);
    const g = newGen();
    state.loading = true; state.err = null; notify('state');
    const url = iso ? feedUrl('mode=day&iso=' + encodeURIComponent(iso)) : feedUrl('mode=latest');
    if (!url) { state.loading = false; state.err = 'no-backend'; notify('state'); return Promise.resolve(false); }
    return doFetch(url, g, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => {
        if (g !== gen) return false;                       /* superseded or disposed while in flight */
        if (!j || j.v !== 1) throw new Error('bad payload');
        feed = j; state.iso = iso || null; state.loading = false;
        notify('feed');
        if (!iso) chunked(g);
        return true;
      })
      .catch(e => {
        if (g !== gen) return false;
        state.loading = false; state.err = (e && e.message) || 'fetch failed'; notify('state'); return false;
      });
  }

  /* ── the networks that cannot answer in one request ──────────────────────────────────────────
     ⚠ RadNet's only keyless route is one CSV per station per year: 140 requests, 67 MB and 102 s
     measured upstream, so the feed leaves it out of `mode=latest` on a request budget rather than
     by name, and offers it in chunks. Leaving it there would put an empty United States on a world
     radiation map, and an empty country reads as a safe one. So the chunks are followed HERE, in
     the background, after the caller already has everything else. It runs once per feed. */
  const chunkState = { running: 0, done: 0, total: 0 };
  const dead = new Set();
  let chunkedOnce = false;
  function chunked(g) {
    if (chunkedOnce || !feed) return; chunkedOnce = true;
    const thin = (feed.sources || []).filter(s => (s.chunks > 1) && !s.n);
    if (!thin.length) return;
    chunkState.total = thin.reduce((a, s) => a + s.chunks, 0); chunkState.done = 0; notify('chunk');
    const jobs = [];
    for (const s of thin) for (let i = 0; i < s.chunks; i++) jobs.push([s.id, i]);
    let at = 0;
    const step = () => {
      if (g !== gen) return;                                /* the sweep belongs to a feed that is gone */
      if (at >= jobs.length) { chunkState.running--; if (!chunkState.running) notify('chunk'); return; }
      const [id, i] = jobs[at++];
      if (dead.has(id)) { chunkState.done++; step(); return; }
      const u = feedUrl('mode=latest&provider=' + encodeURIComponent(id) + '&chunk=' + i);
      doFetch(u, g).then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))).then(j => {
        if (g !== gen) return;
        if (j && j.v === 1 && Array.isArray(j.stations) && j.stations.length) {
          feed.stations = feed.stations.concat(j.stations);
          const src = (feed.sources || []).find(x => x.id === id);
          /* a chunk that lands after a sibling failed is real data and is kept — but the source stays
             marked as not fully read, so the legend says 'partly unreachable' rather than flipping
             between 'read' and 'unreachable' with the order the answers arrive in */
          if (src) { src.n = (src.n || 0) + j.stations.length; if (!dead.has(id)) src.read = true; }
          notify('feed');
        }
      }).catch(() => {
        if (g !== gen) return;
        /* ⚠ (#R621) ONE FAILURE ENDS THE SWEEP FOR THAT SOURCE, AND SAYS SO. Measured in production:
           all twenty-eight RadNet chunks answered 502 `upstream_unreachable` — the relay's own
           network cannot reach radnet.epa.gov, though the host answers fine from a desktop. The
           first version caught and ignored each one, so the reader got twenty-eight silent failures,
           an empty United States, and a legend that said nothing at all about why. An empty country
           on a radiation map reads as a safe one; «取得できず» is the only honest thing to print. */
        dead.add(id);
        const src = (feed.sources || []).find(x => x.id === id);
        if (src) { src.read = false; src.reason = 'unreachable'; }
        notify('chunk');
      }).then(() => { if (g !== gen) return; chunkState.done++; if (chunkState.done % 6 === 0) notify('chunk'); step(); });
    };
    /* four at a time: enough to finish in a few seconds, few enough that the reader's own panning
       is not competing with twenty-eight of our requests. */
    for (let k = 0; k < 4; k++) { chunkState.running++; step(); }
  }

  /* the join that makes the chain work: given a point, the measuring stations around it.
     js/sims.js puts the real readings beside a modelled plume with this; Atlas answers
     `data.radiationNear` with it. */
  function near(lat, lon, km) {
    const R = (typeof km === 'number' && km > 0) ? km : 150, out = [];
    if (!feed || !Array.isArray(feed.stations)) return out;
    const rad = Math.PI / 180, cos = Math.cos(lat * rad);
    for (const s of feed.stations) {
      if (typeof s.y !== 'number' || typeof s.x !== 'number') continue;
      const dy = (s.y - lat) * 111.32, dx = (s.x - lon) * 111.32 * cos;
      const d = Math.sqrt(dy * dy + dx * dx);
      if (d <= R) out.push({ code: s.c, name: s.n, src: s.s, nsvh: s.v, at: s.t, km: d, lat: s.y, lon: s.x });
    }
    out.sort((a, b) => a.km - b.km);
    return out;
  }
  /* one station's recent readings, for the popup's sparkline */
  function series(code) {
    const url = feedUrl('mode=series&code=' + encodeURIComponent(code));
    if (!url) return Promise.resolve([]);
    return doFetch(url, gen).then(r => r.ok ? r.json() : null).then(j => (j && Array.isArray(j.series)) ? j.series : []).catch(() => []);
  }
  function srcOf(id) { try { return (feed && feed.sources || []).find(s => s.id === id) || null; } catch (_) { return null; } }

  function snapshot() {
    return {
      on: state.on, iso: state.iso, loading: state.loading, err: state.err,
      stations: (feed && feed.stations || []).length,
      sources: (feed && feed.sources || []).map(s => ({ id: s.id, read: !!s.read, n: s.n, licence: s.licence, historyDays: s.historyDays, asOf: s.asOf, reason: s.reason, chunks: s.chunks })),
      chunks: { running: chunkState.running, done: chunkState.done, total: chunkState.total },
      generation: gen,
    };
  }

  return {
    load, near, series, toFC, refRows, srcOf,
    state: snapshot,
    /* `on` is the owner's word (the layer is visible / Atlas asked for it) — the core carries it so
       one snapshot answers "is it on, what is loaded, what failed" to every reader */
    setOn(v) { state.on = !!v; notify('state'); },
    feed: () => feed,
    stations: () => ((feed && feed.stations) || []).slice(),
    sources: () => ((feed && feed.sources) || []).slice(),
    ramp: () => RAMP.map(r => r.slice()),
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    /* abort what is in flight and make every pending reply stale; the feed already held stays
       (a re-open paints it at once, and load() replaces it) */
    dispose() { newGen(); state.loading = false; },
  };
}
