// ============================================================================
//  IntMap · _shared/atlas-server-caps.js — the read capabilities a durable job can run WITHOUT a page   (atlas-durable-jobs)
// ----------------------------------------------------------------------------
//  A capability task of a job (kind 'capability') names a capability of the page's registry (js/atlas-capabilities.js).
//  The page runs it in a kernel that needs a DOM, a map and the bundled data; a durable job runs after the tab is gone, so
//  it can only run a capability that has a SERVER TWIN: a function here that does the same read from the same upstream with
//  no page. This file is the closed list of those twins. Nothing else is run: a capability with no twin is refused BY NAME
//  when the job is planned (`capability_unsupported_on_server`), never started and failed there.
//
//  A twin is  { id, parts?, run(args, { fetch, signal }) → { ok, text, data?, sources?, code? } }  and it
//    · is for a capability whose row is read-only in the page registry (tests/atlas-server-caps-checks pins that: a twin of
//      a row that writes, asks or shows something would run here with none of the page's guards);
//    · fetches only hosts written in this file — the URL is never built from an argument that is text;
//    · states what it did not do: a part of the capability it does not cover is `part_unsupported_on_server`, not a smaller answer.
//  ⚠ NO TYPE ANNOTATIONS, NO IMPORTS — scripts/static-checks.mjs parses committed .js as plain JavaScript and a node test runs it as is.
// ============================================================================

const SWPC = 'https://services.swpc.noaa.gov/';

/* sim.spaceWeather — the page's capability reads seven NOAA/NASA feeds and parses them with js/widget-defs-space.js; the twin
   covers `kp` (the planetary K index, observed and forecast), which that file reads without a parser of its own: the rows
   of products/noaa-planetary-k-index-forecast.json, the last 40 with a Kp value, exactly as js/atlas-cap-sim.js does.
   Observation 2026-11-20: the feed is an array of { time_tag, kp, observed, noaa_scale }. Expires if NOAA changes that shape —
   then the twin answers `upstream_shape` (below) rather than a wrong figure. */
const spaceWeather = {
  id: 'sim.spaceWeather',
  parts: ['kp'],
  async run(args, ctx) {
    const part = String((args && args.part) || '');
    if (part !== 'kp') {
      return { ok: false, code: 'part_unsupported_on_server', text: 'On the server sim.spaceWeather answers only {"part":"kp"}; "' + (part || 'all') + '" needs the page. Ask for "kp", or run the others from the page.' };
    }
    let res;
    try { res = await ctx.fetch(SWPC + 'products/noaa-planetary-k-index-forecast.json', { signal: ctx.signal, headers: { Accept: 'application/json' } }); }
    catch (e) { return { ok: false, code: (ctx.signal && ctx.signal.aborted) ? 'cancelled' : 'upstream_unreachable', text: 'NOAA SWPC could not be reached.' }; }
    if (!res.ok) return { ok: false, code: 'upstream_' + res.status, text: 'NOAA SWPC answered ' + res.status + '.' };
    let rows;
    try { rows = await res.json(); } catch (_) { rows = null; }
    if (!Array.isArray(rows)) return { ok: false, code: 'upstream_shape', text: 'NOAA SWPC returned a shape this reader does not know.' };
    const kp = rows.filter((r) => r && r.kp != null && isFinite(+r.kp)).slice(-40).map((r) => ({ at: String(r.time_tag) + 'Z', kp: +r.kp, observed: r.observed }));
    if (!kp.length) return { ok: false, code: 'upstream_empty', text: 'NOAA SWPC returned no Kp rows.' };
    const seen = kp.filter((r) => r.observed === 'observed');
    const last = seen[seen.length - 1];
    const max = kp.reduce((m, r) => (r.kp > m.kp ? r : m), kp[0]);
    return {
      ok: true,
      text: (last ? 'Planetary Kp observed at ' + last.at + ': ' + last.kp.toFixed(1) + '. ' : '') + 'Highest of the ' + kp.length + ' rows (observed and forecast): ' + max.kp.toFixed(1) + ' at ' + max.at + '.',
      data: { source: 'NOAA SWPC', kp },
      sources: [{ url: SWPC + 'products/noaa-planetary-k-index-forecast.json', title: 'NOAA SWPC planetary K index and forecast' }],
    };
  },
};

export const SERVER_CAPS = Object.freeze({ [spaceWeather.id]: spaceWeather });

/* serverCapabilityIds() — what a job may name as a capability task */
export function serverCapabilityIds() { return Object.keys(SERVER_CAPS); }

/* makeServerCaps({ fetch }) — the lane a job runner is given: { has(id), run(id, args, { signal }) → the twin's answer } */
export function makeServerCaps(o) {
  const f = (o && o.fetch) || (typeof fetch === 'function' ? fetch : null);
  return {
    has: (id) => Object.prototype.hasOwnProperty.call(SERVER_CAPS, String(id || '')),
    async run(id, args, ctx) {
      const t = SERVER_CAPS[String(id || '')];
      if (!t) return { ok: false, code: 'capability_unsupported_on_server', text: '"' + String(id || '').slice(0, 80) + '" has no server twin.' };
      if (!f) return { ok: false, code: 'no_fetch', text: 'This runtime has no fetch.' };
      /* a twin never waits on an upstream without a clock: 20 s (observation: NOAA SWPC answers in under 2 s; this only has to stay inside the 150 s lease). Expires with the lease. */
      const signal = (ctx && ctx.signal) || (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined);
      try { return await t.run(args || {}, { fetch: f, signal }); }
      catch (e) { return { ok: false, code: 'twin_threw', text: String(e && e.message || e).slice(0, 300) }; }
    },
  };
}
