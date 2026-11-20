/* ============================================================================
 *  IntMap · THE FETCH THE GIS READERS USE   (js/gis-fetch.js)
 * ----------------------------------------------------------------------------
 *  js/gis-geotiff.js (HTTP Range), js/gis-ogcapi.js (STAC / OGC) and js/gis-remote.js (catalogues) each
 *  chose `fetch` for themselves and so each met the same three walls the same way — by failing:
 *
 *    ① THE HOST SENDS NO CORS HEADERS (the Copernicus DEM and ESA WorldCover buckets: 206 to a server,
 *      an opaque TypeError to a page). Not fixable in the page; fixable by a server that reads it.
 *    ② THE HOST WANTS A SIGNATURE (Planetary Computer: 409 PublicAccessNotPermitted without a SAS token).
 *    ③ EVERYTHING READ TWICE IS PAID FOR TWICE (a COG's header and overview tiles are read again by every
 *      window, by every reader).
 *
 *  This is a drop-in `fetch(url, init)` that answers them in the order they are OBSERVED, never by naming
 *  a host:
 *      1  ask the host directly (free; most catalogues and buckets answer a page);
 *      2  if the direct request threw AND a `no-cors` probe proves the host answers (js/gis-http.js
 *         explainFetchFailure → `corsBlocked`), read it through supabase/functions/gis-fetch — the origin is
 *         remembered, so the next read does not pay for the probe;
 *      3  if the host answered 401/403/409, ask the SIGNER (a function the caller or js/gis-remote.js
 *         supplies: href → signed href, from what a catalogue STATES) and read again;
 *      4  anything else is the host's own answer, untouched.
 *  A POST, a non-https address and a runtime with no relay configured go straight to `fetch` and fail as
 *  they always did — the failure still names its reason (corsBlocked, serverSaid, …).
 *
 *  ⚠ THE RELAY IS READ IN CHUNKS, AND THE CHUNKS ARE KEPT. A Range of 64 KiB (the COG reader's block) would
 *  be one Edge Function invocation per block; the relay path rounds every read out to 1 MiB-aligned chunks,
 *  fetches the chunks that cover it, and slices the answer back. Chunks are reused from memory, then from
 *  the browser's Cache API (a day) — so a window read twice, or two
 *  windows of one file, pay once. ⚠ THERE IS NO SHARED (CDN) COPY: measured 2026-11-20, a repeated ranged read of the
 *  relay answers `CF-Cache-Status: DYNAMIC` both times, so the saving is per browser — not between readers. ⚠ A FAILED CHUNK IS NEVER KEPT.
 *  ⚠ A RELAY FAILURE IS NAMED, NOT DRESSED AS A NETWORK ERROR: the thrown error carries `explained` (the
 *  reason, the relay's code, whether it is the project's budget or the stop switch), which
 *  js/gis-http.js explainFetchFailure returns as it stands — otherwise a refused relay would read as
 *  «the host sends no CORS headers», a different fact that asks for a different response.
 *
 *  ⚠ Everything is inside the factory and window.* is read at CALL time, so this imports in Node with no DOM.
 * ==========================================================================*/

import { explainFetchFailure } from './gis-http.js';
import { GIS_FETCH_FUNCTION, RANGE_MAX_BYTES } from '../supabase/functions/_shared/gis-fetch-constants.js';

export const CHUNK_BYTES = 1024 * 1024;          /* 16 of the COG reader's 64 KiB blocks per Edge Function call */
const CHUNKS_RESIDENT_BYTES = 48 * 1024 * 1024;  /* the in-memory chunk LRU. 観測: a 512×512 window of a 10 m tile read ~6 MiB */
const PERSIST_MS = 24 * 60 * 60 * 1000;
const PERSIST_MAX_KEYS = 256;                    /* 256 MiB of Cache API at most */
const CACHE_NAME = 'intmap-gis-fetch-v1';
const DENIED = [401, 403, 409];

/* what each relay code means to the reader, in words. Plain strings: gis-http reasons are not translated. */
const WORDS = {
  disabled: 'the data relay is switched off (stop switch)',
  budget_exhausted: 'the data relay has used its byte budget for now; try again later',
  rate_limit: 'too many reads from this address; the relay asks for a pause',
  bad_url: 'the relay refuses the address', not_https: 'the relay reads https only', credentials_in_url: 'the relay refuses an address with credentials in it',
  port_not_default: 'the relay reads the default port only', host_not_public: 'the relay refuses a host that is not public',
  not_allowed: 'the relay refuses this address (the name does not resolve only to public addresses)', bad_range: 'the relay refuses this byte range',
  upstream_unreachable: 'the relay could not reach the host', upstream_timeout: 'the host did not answer within the relay\'s time limit',
  upstream_redirect: 'the host redirected somewhere the relay does not follow',
  upstream_range_ignored: 'the host ignores byte ranges and the file is too large to send whole',
  upstream_too_large: 'the answer is larger than the relay will carry',
  upstream_status: 'the host answered with an error',
};

function relayError(code, status, body) {
  const reason = 'via-relay: ' + (WORDS[code] || ('the relay answered ' + code));
  const explained = { reason: reason, viaRelay: true, relay: code };
  if (status) explained.relayStatus = status;
  if (body && body.redirectedTo) explained.redirectedTo = String(body.redirectedTo);
  const e = new TypeError(reason);
  e.explained = explained;
  return e;
}

const hdrOf = (init, name) => {
  const h = init && init.headers;
  if (!h) return null;
  if (typeof h.get === 'function') return h.get(name);
  for (const k of Object.keys(h)) if (k.toLowerCase() === name.toLowerCase()) return String(h[k]);
  return null;
};

export function makeGisFetch(deps) {
  const D = deps || {};
  const WIN = () => { try { return (typeof window !== 'undefined' && window) || null; } catch (_) { return null; } };
  const direct = () => (typeof D.fetch === 'function' ? D.fetch : (typeof fetch === 'function' ? fetch.bind(globalThis) : null));
  /* where the relay is: an explicit `base` (tests), else the page's own Supabase project, read at call time */
  const relayBase = () => {
    if (D.base !== undefined) return D.base ? String(D.base).replace(/\/+$/, '') : '';
    try { const w = WIN(); return w && w.SUPABASE_URL ? String(w.SUPABASE_URL).replace(/\/+$/, '') + '/functions/v1/' + GIS_FETCH_FUNCTION : ''; } catch (_) { return ''; }
  };
  const signer = () => (typeof D.signer === 'function' ? D.signer : null);
  const now = () => (typeof D.now === 'function' ? D.now() : Date.now());
  const stat = { direct: 0, relayCalls: 0, relayBytes: 0, memoryHits: 0, persistHits: 0, signed: 0, relayOrigins: [] };
  const viaRelay = new Set();                       /* origins proven readable only through the relay */
  const mem = new Map();                            /* chunk key → {bytes, total, type}; insertion order = LRU */
  let memBytes = 0;
  const inflight = new Map();

  const relayUrl = (url, from, to) => relayBase() + '?u=' + encodeURIComponent(url) + (from == null ? '' : '&range=' + from + '-' + to);

  /* ── the chunk cache ─────────────────────────────────────────────────────────────────────── */
  function remember(key, rec) {
    if (mem.has(key)) { memBytes -= mem.get(key).bytes.length; mem.delete(key); }
    mem.set(key, rec); memBytes += rec.bytes.length;
    while (memBytes > CHUNKS_RESIDENT_BYTES && mem.size > 1) {
      const k = mem.keys().next().value; memBytes -= mem.get(k).bytes.length; mem.delete(k);
    }
  }
  const store = () => { try { return D.caches !== undefined ? D.caches : (typeof caches !== 'undefined' ? caches : null); } catch (_) { return null; } };
  async function persisted(key) {
    try {
      const s = store(); if (!s) return null;
      const c = await s.open(CACHE_NAME);
      const hit = await c.match(key);
      if (!hit) return null;
      const at = Number(hit.headers.get('x-gis-fetched'));
      if (!(now() - at < PERSIST_MS)) { try { await c.delete(key); } catch (_) { } return null; }
      return { bytes: new Uint8Array(await hit.arrayBuffer()), total: Number(hit.headers.get('x-gis-total')), type: hit.headers.get('content-type') || 'application/octet-stream' };
    } catch (_) { return null; }
  }
  let puts = 0;
  async function persist(key, rec) {
    try {
      const s = store(); if (!s) return;
      const c = await s.open(CACHE_NAME);
      await c.put(key, new Response(rec.bytes, { status: 200, headers: { 'content-type': rec.type, 'x-gis-total': String(rec.total), 'x-gis-fetched': String(now()) } }));
      if (++puts % 16 === 0) { const keys = await c.keys(); for (let i = 0; i < keys.length - PERSIST_MAX_KEYS; i++) await c.delete(keys[i]); }
    } catch (_) { /* a cache that cannot be written is not a failure of the read */ }
  }

  /* one relay answer → bytes, or a typed error. A host's own error status comes back AS a Response so the readers' existing
     `http-status` path (serverSaid, redirectedTo) reports it; anything the relay itself decided is thrown with `explained`. */
  async function readRelay(url, from, to, init) {
    stat.relayCalls++;
    const o = { method: 'GET' };
    if (init && init.signal) o.signal = init.signal;
    let res;
    try { res = await direct()(relayUrl(url, from, to), o); }
    catch (e) {
      if (init && init.signal && init.signal.aborted) throw e;
      throw relayError('upstream_unreachable', 0, null);   /* the relay itself did not answer: say so, not «no CORS» */
    }
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      stat.relayBytes += bytes.length;
      const total = Number(res.headers.get('x-gis-total'));
      return { ok: true, bytes: bytes, total: Number.isFinite(total) && total > 0 ? total : null, type: res.headers.get('content-type') || 'application/octet-stream', ignoredRange: res.headers.get('x-gis-range-ignored') === '1', status: res.status };
    }
    let body = null;
    try { body = JSON.parse(await res.text()); } catch (_) { body = null; }
    const code = (body && body.error) || ('http_' + res.status);
    if (code === 'upstream_status' && body) {
      /* the host's own refusal, in the host's words: a Response the readers already know how to report */
      return { ok: false, response: new Response(String(body.said || ''), { status: Number(body.status) || 502, headers: Object.assign({ 'content-type': 'text/plain' }, body.redirectedTo ? { 'x-gis-redirected-to': String(body.redirectedTo) } : {}) }) };
    }
    if (code === 'upstream_is_a_page') {
      return { ok: false, response: new Response('<html></html>', { status: 200, headers: Object.assign({ 'content-type': 'text/html' }, body && body.redirectedTo ? { 'x-gis-redirected-to': String(body.redirectedTo) } : {}) }) };
    }
    throw relayError(code, res.status, body);
  }

  async function chunk(url, index, init) {
    const key = relayUrl(url, index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES - 1);
    if (mem.has(key)) { const r = mem.get(key); mem.delete(key); mem.set(key, r); stat.memoryHits++; return { ok: true, rec: r }; }
    if (inflight.has(key)) return inflight.get(key);
    const job = (async () => {
      const p = await persisted(key);
      if (p) { stat.persistHits++; remember(key, p); return { ok: true, rec: p }; }
      const r = await readRelay(url, index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES - 1, init);
      if (!r.ok) return r;
      if (r.ignoredRange) return { ok: true, rec: { bytes: r.bytes, total: r.bytes.length, type: r.type, whole: true } };   /* not cached as a chunk: it is the whole answer */
      const rec = { bytes: r.bytes, total: r.total, type: r.type };
      remember(key, rec); persist(key, rec);
      return { ok: true, rec: rec };
    })();
    inflight.set(key, job);
    try { return await job; } finally { inflight.delete(key); }
  }

  /* a ranged read through the relay, as the 206 a direct host would have sent */
  async function relayRange(url, from, to, init) {
    if (to - from + 1 > RANGE_MAX_BYTES * 4) throw relayError('bad_range', 0, null);
    const first = Math.floor(from / CHUNK_BYTES), last = Math.floor(to / CHUNK_BYTES);
    const parts = [];
    for (let i = first; i <= last; i++) parts.push(i);
    const got = await Promise.all(parts.map((i) => chunk(url, i, init)));
    for (const g of got) if (!g.ok) return g.response;
    const recs = got.map((g) => g.rec);
    if (recs[0].whole) {   /* the host ignored Range and the relay passed a small file whole: said as a 200, the way the host did */
      return new Response(recs[0].bytes, { status: 200, headers: { 'content-type': recs[0].type } });
    }
    const total = recs.map((r) => r.total).find((t) => Number.isFinite(t) && t > 0) || null;
    const end = total ? Math.min(to, total - 1) : to;
    if (total && from >= total) return new Response('', { status: 416, headers: { 'content-range': 'bytes */' + total } });
    const out = new Uint8Array(end - from + 1);
    let w = 0;
    for (let k = 0; k < recs.length; k++) {
      const base = (first + k) * CHUNK_BYTES, bytes = recs[k].bytes;
      const a = Math.max(from, base) - base, b = Math.min(end, base + CHUNK_BYTES - 1) - base;
      if (b < a) continue;
      out.set(bytes.subarray(a, Math.min(b + 1, bytes.length)), w);
      w += Math.min(b + 1, bytes.length) - a;
    }
    return new Response(out.subarray(0, w), { status: 206, headers: { 'content-type': recs[0].type, 'content-range': 'bytes ' + from + '-' + (from + w - 1) + '/' + (total == null ? '*' : total), 'accept-ranges': 'bytes' } });
  }

  async function relayRead(url, init) {
    const range = /^bytes=(\d+)-(\d+)$/.exec(hdrOf(init, 'range') || '');
    if (range) return relayRange(url, Number(range[1]), Number(range[2]), init);
    const r = await readRelay(url, null, null, init);
    if (!r.ok) return r.response;
    return new Response(r.bytes, { status: 200, headers: { 'content-type': r.type } });
  }

  const canRelay = () => !!relayBase();

  async function gisFetch(input, init, internal) {
    const f = direct();
    const url = String(input);
    const method = String((init && init.method) || 'GET').toUpperCase();
    let u = null;
    try { u = new URL(url); } catch (_) { u = null; }
    if (!f || !u || u.protocol !== 'https:' || (method !== 'GET')) return f(input, init);   /* HEAD (the CORS probe), POST, odd addresses: as they are */
    /* `always`: read everything through the relay (a diagnostic script has no browser CORS to prove; production never sets it) */
    let res;
    if ((D.always || viaRelay.has(u.origin)) && canRelay()) res = await relayRead(url, init);
    else {
      try { stat.direct++; res = await f(input, init); }
      catch (e) {
        if ((init && init.signal && init.signal.aborted) || !canRelay()) throw e;
        /* ⚠ ONLY a host that is PROVEN reachable-but-unreadable goes to the relay; a dead network is not made someone else's request */
        const why = await explainFetchFailure(url, f, e);
        if (!why.corsBlocked) throw e;
        viaRelay.add(u.origin); stat.relayOrigins = Array.from(viaRelay);
        res = await relayRead(url, init);
      }
    }
    /* a host that refuses the unsigned address is asked again signed — by the route that reached it (a host can need both) */
    if (DENIED.indexOf(res.status) >= 0 && signer() && !(internal && internal.signed)) {
      let s = null;
      try { s = await signer()(url); } catch (_) { s = null; }
      if (s && s.ok && s.href && s.href !== url) {
        try { if (res.body && res.body.cancel) res.body.cancel(); } catch (_) { }
        stat.signed++;
        return gisFetch(s.href, init, { signed: true });
      }
    }
    return res;
  }

  return {
    fetch: (input, init) => gisFetch(input, init, null),
    relayUrl, canRelay,
    stats: () => Object.assign({}, stat, { memoryChunks: mem.size, memoryBytes: memBytes }),
    /* forget what was learned about origins and what was kept (a test, or a reader who asks for fresh data) */
    reset: () => { viaRelay.clear(); mem.clear(); memBytes = 0; inflight.clear(); },
    CHUNK_BYTES: CHUNK_BYTES,
  };
}

/* The readers' one way to choose a fetch: the caller's own (a test, the headless runtime), else the page's relay-aware one.
   ⚠ The default instance is made on first use and shared by every reader through this module (ONE origin memory, ONE cache) — it is
   not published on `window`: nothing outside the readers asks for it. */
let shared = null;
export function reachingFetch(explicit) {
  if (typeof explicit === 'function') return explicit;
  if (typeof fetch !== 'function') return null;
  if (!shared) {
    shared = makeGisFetch({
      /* the signer is whatever js/gis-remote.js knows from the catalogues, asked at call time; none loaded → none (the host's answer stands) */
      signer: async (href) => {
        let R = null;
        try { R = (typeof window !== 'undefined' && window.IntMapGisRemote) || null; } catch (_) { R = null; }
        if (!R || typeof R.signHref !== 'function') {
          try { R = (await import('./gis-remote.js')).makeGisRemote({}); } catch (_) { R = null; }
        }
        return R && typeof R.signHref === 'function' ? R.signHref(href) : null;
      },
    });
  }
  return shared.fetch;
}
