/* ============================================================================
 *  IntMap · DATA THAT IS NOT IN THE APP — window.IntMapGisRemote
 * ----------------------------------------------------------------------------
 *  Everything the GIS kernel could acquire was something this app already knew about: a layer of the
 *  map, a file somebody dropped in. js/gis-atlas.js `catalogue()` lists THOSE, so a planner asked for
 *  「2023 年のベトナム北部の、利用できる最高解像度の標高と洪水リスクを探して」 had no way to ask the one
 *  question that comes first — 「そういうデータは、世界のどこに在るか」 — and js/gis-geotiff.js's
 *  readUrl() (HTTP range reads of a Cloud-Optimised GeoTIFF) had no caller at all.
 *
 *  ⚠ THIS FILE DISCOVERS; IT DOES NOT READ DATA (it does SIGN an address when a catalogue states how — signHref below). Reading what a collection holds is already a door of
 *  its own — `ogc:<…/collections/id>` (js/gis-ogcapi.js; a STAC collection serves the same items
 *  endpoint), `stac:<…/search>` and `url:<a COG>` (js/gis-cog.js) — so inspect() answers with the REF
 *  to use rather than a second reader. What only this file knows is WHICH collection of which
 *  catalogue states that it covers a place and a period, under what licence, and who did not answer.
 *
 *      catalogs() / add()               → the registry of catalogues that are asked
 *      discover({q,bbox,time,…})        → collections of those catalogues, filtered by place and time
 *      inspect(ref, {bbox})             → what one collection states, its assets, and the refs to read it
 *
 *  Standards, not a vendor: STAC API 1.x (`/collections`, `/search`) and OGC API – Features
 *  (`/collections`, `/collections/{id}/items`). A catalogue is DATA in CATALOGS below, not a branch.
 *
 *  ══ ⚠⚠⚠ THREE DIFFERENT CLAIMS, WHICH A COUNT CANNOT TELL APART ═══════════════════════════════
 *      ① the source returned everything it holds for this window       (measured here: paged to the end)
 *      ② what the source holds covers the window and the period        (the collection states an extent)
 *      ③ what the source holds is everything that exists in the world  (NOBODY HERE CAN ESTABLISH THIS)
 *  `coverage` (js/gis-sources.js coverageOf — the same verdict every other acquisition gets) carries ①;
 *  `evidence` carries ② as stated-or-unstated, and `worldCompleteness` is `'unproven'` ALWAYS. An OSM
 *  query that returns every hospital OSM has is not a list of the hospitals there are.
 *
 *  ══ ⚠⚠⚠ A CATALOGUE THAT DID NOT ANSWER IS NOT A CATALOGUE WITH NOTHING ═════════════════════════
 *  discover() reports per catalogue whether it answered, how many pages it read, and whether it read
 *  them all (`complete`). An empty list from a catalogue that timed out is 「訊けなかった」, never 「無い」.
 *
 *  ══ ⚠⚠⚠ A LICENCE THAT IS NOT STATED IS NOT `open` ═════════════════════════════════════════════
 *  `rights.license` is the collection's own `license` verbatim, or null. A dataset made from a
 *  collection that states none carries NO `license` member at all (js/gis-export.js writes only what
 *  the record states), never a guess.
 *
 *  ══ ⚠⚠⚠ A URL FROM A PAGE IS NOT A URL WE FETCH ═════════════════════════════════════════════════
 *  Every address passes publicUrl(): https only, no credentials in it, and no host that is a loopback,
 *  a private range or a link-local address. In a browser that is hygiene; in the headless runtime
 *  (js/gis-runtime.js) it is what stops a catalogue's `href` from being a way to reach the machine.
 *  ⚠ CORS IS A FACT ABOUT THE HOST, NOT A HOPE: a bucket that sends no Access-Control-Allow-Origin
 *  answers a browser with an opaque failure. That arrives as `fetch-failed` with `reason`, and is not
 *  dressed as 「データが無い」. (Measured 2026-11-19: the Copernicus DEM bucket answers Range requests
 *  and sends no ACAO — readable headless, not from a page.) Since gis-remote-fetch every request here goes
 *  through js/gis-fetch.js, which reads such a host through supabase/functions/gis-fetch (a principle-shaped
 *  relay, not a list) once a no-cors probe has PROVEN the host answers — so a catalogue that sends no CORS
 *  headers is searched, and a bucket it names is read.
 *
 *  ══ ⚠⚠⚠ A SIGNED ADDRESS IS DERIVED FROM WHAT A CATALOGUE STATES, NEVER FROM A HOST NAME ═══════════
 *  A collection states where its files live (STAC storage extension: `storage:schemes` — type, platform
 *  template, account, container). A catalogue entry may state HOW such a store is signed (`sign:{kind,token}`,
 *  data in CATALOGS). signHref(href) finds the collection whose store the address is in and asks the stated
 *  token endpoint for the credential, kept until it expires. No collection that states the address, or no
 *  catalogue that states how to sign it, is `no-signer` — the host's own refusal then stands, in its words.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY and window.* is read at CALL time, so this imports in Node with
 *  no DOM; every collaborator can be passed in (`deps`) and the tests do exactly that.
 * ==========================================================================*/

import { reachingFetch } from './gis-fetch.js';
import { explainFetchFailure, describeResponse } from './gis-http.js';

export function makeGisRemote(deps) {
  return (function () {
    const D = deps || {};
    const WIN = () => { try { return (typeof window !== 'undefined' && window) || null; } catch (_) { return null; } };
    const pick = (k, g) => (D[k] !== undefined ? D[k] : (WIN() && WIN()[g]) || null);
    const now = () => (typeof D.now === 'function' ? D.now() : Date.now());

    /* ── the registry of catalogues ───────────────────────────────────────────────────────────
       観測: each answered `GET <url>` with 200 JSON and a permissive Access-Control-Allow-Origin
       on 2026-11-19. 失効条件: a host that stops answering is reported per call by discover() as
       not-answered — this list is not edited on a bad day, it is edited when a catalogue is gone.
       Nothing else in this file names a host; add() takes more at run time. */
    const CATALOGS = [
      { id: 'earth-search', kind: 'stac', url: 'https://earth-search.aws.element84.com/v1', label: 'Earth Search (Element 84)', operator: 'Element 84 / AWS Open Data', checked: '2026-11-19' },
      { id: 'planetary-computer', kind: 'stac', url: 'https://planetarycomputer.microsoft.com/api/stac/v1', label: 'Microsoft Planetary Computer', operator: 'Microsoft', checked: '2026-11-20',
        /* 観測 2026-11-20: GET <token>/<collection> answers 200 {token, msft:expiry} to an anonymous caller with ACAO:*, and a blob read with
           that token appended answers 206 with ACAO:*; without it, 409 PublicAccessNotPermitted. 失効条件: the endpoint asking for a key. */
        sign: { kind: 'azure-sas', token: 'https://planetarycomputer.microsoft.com/api/sas/v1/token/{collection}' } },
      { id: 'nasa-cmr-lpcloud', kind: 'stac', url: 'https://cmr.earthdata.nasa.gov/stac/LPCLOUD', label: 'NASA CMR-STAC · LP DAAC Cloud', operator: 'NASA EOSDIS', checked: '2026-11-19' },
      { id: 'msc-geomet', kind: 'ogc-features', url: 'https://api.weather.gc.ca', label: 'MSC GeoMet-OGC-API (Canada)', operator: 'Environment and Climate Change Canada', checked: '2026-11-19' },
      { id: 'bgs-ogcapi', kind: 'ogc-features', url: 'https://ogcapi.bgs.ac.uk', label: 'British Geological Survey OGC API', operator: 'British Geological Survey', checked: '2026-11-19' },
    ];
    const KINDS = ['stac', 'ogc-features'];
    const added = new Map();   /* run-time catalogues, by id */

    /* the codes this file itself returns — declared, like js/gis-sources.js refusalCodes() */
    const REFUSALS = [
      'bad-param', 'url-not-public', 'catalog-unknown', 'catalog-kind-unknown', 'collection-unknown',
      'fetch-failed', 'http-status', 'not-json', 'response-too-large', 'cancelled', 'timeout', 'no-signer', 'sign-failed',
    ];
    const refuse = (why, detail) => (detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail });

    const isNum = (v) => typeof v === 'number' && isFinite(v);

    /* ── addresses ────────────────────────────────────────────────────────────────────────────── */

    /* → {ok, url} | refusal. ⚠ A NAME, NOT A RESOLUTION: DNS is not asked, so a public name that
       points inward is not caught here — the headless runtime must also sit behind its own egress
       policy. What this refuses is every address that STATES itself private. */
    function publicUrl(raw) {
      let u;
      try { u = new URL(String(raw)); } catch (_) { return refuse('url-not-public', { url: String(raw), reason: 'unparseable' }); }
      if (u.protocol !== 'https:') return refuse('url-not-public', { url: String(raw), reason: 'not-https' });
      if (u.username || u.password) return refuse('url-not-public', { url: u.origin, reason: 'credentials-in-url' });
      const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
      const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
      const inner = h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')
        || h === '::1' || h === '::' || /^f[cd]/.test(h) && h.includes(':') || /^fe[89ab]/.test(h) && h.includes(':')
        || (v4 && (+v4[1] === 10 || +v4[1] === 127 || +v4[1] === 0 || (+v4[1] === 169 && +v4[2] === 254)
          || (+v4[1] === 172 && +v4[2] >= 16 && +v4[2] <= 31) || (+v4[1] === 192 && +v4[2] === 168) || (+v4[1] === 100 && +v4[2] >= 64 && +v4[2] <= 127)));
      if (inner) return refuse('url-not-public', { url: u.origin, reason: 'private-or-loopback-host' });
      return { ok: true, url: u.href };
    }

    /* the one https address a bucket URL stands for, DERIVED and said to be: s3://b/k → virtual-hosted */
    function resolveHref(href) {
      const s = String(href == null ? '' : href);
      const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(s);
      if (m) return { href: 'https://' + m[1] + '.s3.amazonaws.com/' + m[2], derivedFrom: s };
      return { href: s, derivedFrom: null };
    }

    /* ── the wire ─────────────────────────────────────────────────────────────────────────────── */

    const MAX_JSON_BYTES = 25 * 1024 * 1024;   /* 観測: the largest STAC /collections page seen was < 3 MB; 25 MB is a runaway, not a catalogue */
    const CALL_MS = 25000;                      /* a catalogue that has not answered in 25 s is not-answered, said as such */

    async function fetchJson(url, init, signal) {
      const ok = publicUrl(url);
      if (!ok.ok) return ok;
      const doFetch = reachingFetch(D.fetch);
      if (!doFetch) return refuse('fetch-failed', { url: ok.url, reason: 'no-fetch-in-this-runtime' });
      const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => { timedOut = true; try { ctl.abort(); } catch (_) { } }, D.timeoutMs || CALL_MS) : null;
      let timedOut = false;
      const onAbort = () => { try { if (ctl) ctl.abort(); } catch (_) { } };
      if (signal && signal.addEventListener) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
      try {
        const o = Object.assign({ headers: { Accept: 'application/geo+json, application/json' } }, init || {});
        if (ctl) o.signal = ctl.signal;
        let res;
        try { res = await doFetch(ok.url, o); }
        catch (e) {
          if (signal && signal.aborted) return refuse('cancelled');
          /* ⚠ OUR OWN CLOCK ENDING IS NOT «the network failed»: it is a slow catalogue (measured 2026-11-20: NASA CMR-STAC took 25 s without a `collections` filter) */
          if (timedOut) return refuse('timeout', { url: ok.url, ms: D.timeoutMs || CALL_MS });
          return refuse('fetch-failed', Object.assign({ url: ok.url }, await explainFetchFailure(ok.url, doFetch, e)));
        }
        if (!res || !res.ok) return refuse('http-status', Object.assign({ url: ok.url, status: res ? res.status : null }, res ? await describeResponse(ok.url, res) : {}));
        let text;
        try { text = await res.text(); } catch (e) { return refuse('fetch-failed', { url: ok.url, reason: 'body: ' + String((e && e.message) || e) }); }
        if (text.length > MAX_JSON_BYTES) return refuse('response-too-large', { url: ok.url, chars: text.length, limit: MAX_JSON_BYTES });
        try { return { ok: true, json: JSON.parse(text), url: ok.url }; }
        catch (_) { return refuse('not-json', { url: ok.url }); }
      } finally { if (timer) clearTimeout(timer); }
    }

    /* ── the catalogue registry ───────────────────────────────────────────────────────────────── */

    function catalogs() {
      return CATALOGS.concat(Array.from(added.values())).map((c) => Object.assign({}, c));
    }
    function catalogById(id) {
      const k = String(id == null ? '' : id);
      return CATALOGS.find((c) => c.id === k) || added.get(k) || null;
    }
    /* A catalogue the caller brings. ⚠ `kind` IS STATED, NOT GUESSED FROM THE ADDRESS: the same root
       can serve both standards and a wrong guess reads one as the other. */
    function add(spec) {
      const s = spec || {};
      if (KINDS.indexOf(s.kind) < 0) return refuse('catalog-kind-unknown', { kind: s.kind == null ? null : s.kind, kinds: KINDS.slice() });
      const u = publicUrl(s.url);
      if (!u.ok) return u;
      const base = u.url.replace(/\/+$/, '');
      const id = (s.id != null && String(s.id).trim()) ? String(s.id).trim() : ('user-' + new URL(base).hostname);
      if (CATALOGS.some((c) => c.id === id)) return refuse('bad-param', { param: 'id', value: id, reason: 'built-in-catalog' });
      const rec = { id: id, kind: s.kind, url: base, label: s.label ? String(s.label) : id, operator: s.operator ? String(s.operator) : null, checked: null, user: true };
      if (s.sign && SIGNING[s.sign.kind] && publicUrl(String(s.sign.token || '').replace('{collection}', 'x')).ok) rec.sign = { kind: s.sign.kind, token: String(s.sign.token) };
      added.set(id, rec);
      return { ok: true, catalog: Object.assign({}, rec) };
    }

    /* ── extents ──────────────────────────────────────────────────────────────────────────────── */

    function asBox(b) {
      if (!b) return null;
      if (Array.isArray(b) && b.length >= 4 && b.slice(0, 4).every(isNum)) return { w: b[0], s: b[1], e: b[2], n: b[3] };
      if (b && isNum(b.w) && isNum(b.s) && isNum(b.e) && isNum(b.n)) return { w: b.w, s: b.s, e: b.e, n: b.n };
      return null;
    }
    /* lon ranges as 1–2 plain intervals so a box that crosses ±180 (w > e) is handled, not mangled */
    const lonSpans = (b) => (b.w <= b.e ? [[b.w, b.e]] : [[b.w, 180], [-180, b.e]]);
    function overlapsBox(a, b) {
      if (a.n < b.s || a.s > b.n) return false;
      return lonSpans(a).some((x) => lonSpans(b).some((y) => x[0] <= y[1] && y[0] <= x[1]));
    }
    function coversBox(outer, inner) {
      if (outer.s > inner.s || outer.n < inner.n) return false;
      return lonSpans(inner).every((y) => lonSpans(outer).some((x) => x[0] <= y[0] && x[1] >= y[1]));
    }
    /* the relation of what a collection STATES to what was asked — 'unstated' when it states nothing */
    function spatialRelation(stated, asked) {
      if (!asked) return 'not-asked';
      const boxes = (Array.isArray(stated) ? stated : []).map(asBox).filter(Boolean);
      if (!boxes.length) return 'unstated';
      if (boxes.some((b) => coversBox(b, asked))) return 'covers';
      if (boxes.some((b) => overlapsBox(b, asked))) return 'overlaps';
      return 'outside';
    }
    const ms = (s) => { const t = Date.parse(s); return isNum(t) ? t : null; };
    /* ⚠ A BARE YEAR / DATE IS THE WHOLE OF IT: "2023" is [2023-01-01, 2024-01-01), as everywhere here */
    function timeSpan(t) {
      if (t == null || t === '') return null;
      const parts = String(t).split('/');
      const one = (s, end) => {
        if (s === '' || s === '..') return null;
        const y = /^(-?\d{4})$/.exec(s), ym = /^(\d{4})-(\d{2})$/.exec(s), ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (y) return end ? Date.UTC(+y[1] + 1, 0, 1) : Date.UTC(+y[1], 0, 1);
        if (ym) return end ? Date.UTC(+ym[1], +ym[2], 1) : Date.UTC(+ym[1], +ym[2] - 1, 1);
        if (ymd) return end ? Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3] + 1) : Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3]);
        return ms(s);
      };
      const a = one(parts[0], false), b = parts.length > 1 ? one(parts[1], true) : one(parts[0], true);
      if ((parts[0] !== '' && parts[0] !== '..' && a == null) || (parts.length > 1 && parts[1] !== '' && parts[1] !== '..' && b == null)) return { bad: true };
      return { from: a, to: b };
    }
    function temporalRelation(intervals, asked) {
      if (asked == null || asked === '') return 'not-asked';
      const want = timeSpan(asked);
      if (!want || want.bad) return 'unreadable';
      const list = (Array.isArray(intervals) ? intervals : []).filter((i) => Array.isArray(i));
      if (!list.length) return 'unstated';
      const spans = list.map((i) => ({ from: i[0] ? ms(i[0]) : null, to: i[1] ? ms(i[1]) : null }));
      const hit = spans.some((s) => (s.to == null || want.from == null || s.to >= want.from) && (s.from == null || want.to == null || s.from < want.to));
      return hit ? 'overlaps' : 'outside';
    }

    /* ── collections, normalised ──────────────────────────────────────────────────────────────── */

    function storageSchemes(c) {
      const sc = c && c['storage:schemes'];
      if (!sc || typeof sc !== 'object') return [];
      return Object.keys(sc).map((k) => sc[k]).filter((x) => x && typeof x === 'object' && typeof x.type === 'string');
    }

    function normaliseCollection(cat, c) {
      const ext = (c && c.extent) || {};
      const sp = ext.spatial && Array.isArray(ext.spatial.bbox) ? ext.spatial.bbox : null;
      const tm = ext.temporal && Array.isArray(ext.temporal.interval) ? ext.temporal.interval : null;
      const lic = (c && c.license != null && String(c.license) !== '') ? String(c.license) : null;
      const providers = Array.isArray(c && c.providers) ? c.providers.map((p) => p && p.name).filter(Boolean) : [];
      const licLink = Array.isArray(c && c.links) ? c.links.find((l) => l && l.rel === 'license') : null;
      return {
        ref: cat.id + '/' + c.id, catalog: cat.id, kind: cat.kind, id: String(c.id),
        title: c.title ? String(c.title) : String(c.id),
        description: c.description ? String(c.description) : '',
        keywords: Array.isArray(c.keywords) ? c.keywords.map(String) : [],
        extent: { bbox: sp, time: tm },
        rights: { license: lic, licenseUrl: licLink && licLink.href ? String(licLink.href) : null, providers: providers },
        itemType: c.itemType || null,
        /* STAC storage extension: where this collection's files live. Only the object-shaped schemes; read by signHref */
        storage: storageSchemes(c),
        /* STAC's own statement of what an item carries; absent on a plain OGC collection */
        summaries: (c && c.summaries && typeof c.summaries === 'object') ? c.summaries : null,
      };
    }

    const cache = new Map();   /* catalogue id → {at, cols, pages, complete, why} — a collection LIST changes slowly */
    const CACHE_MS = 10 * 60 * 1000;
    const MAX_PAGES = 20;      /* 観測: no registered catalogue lists more than ~3 pages of 100 at 2026-11-19; 20 is a runaway guard and says so (complete:false) */

    async function collectionsOf(cat, signal, fresh) {
      const hit = cache.get(cat.id);
      if (hit && !fresh && now() - hit.at < CACHE_MS) return Object.assign({ cached: true }, hit.res);
      const first = cat.kind === 'stac' ? cat.url + '/collections?limit=100' : cat.url + '/collections?f=json&limit=100';
      let url = first, pages = 0, cols = [], complete = true, why = null;
      while (url) {
        const r = await fetchJson(url, null, signal);
        if (!r.ok) {
          if (!pages) return { ok: false, why: r.why, detail: r.detail || null, pages: 0, collections: [] };
          complete = false; why = r.why; break;
        }
        pages++;
        const list = Array.isArray(r.json && r.json.collections) ? r.json.collections : null;
        if (!list) return { ok: false, why: 'not-json', detail: { url: url, reason: 'no-collections-member' }, pages: pages, collections: cols.map((c) => c) };
        for (const c of list) if (c && c.id != null) cols.push(normaliseCollection(cat, c));
        const next = Array.isArray(r.json.links) ? r.json.links.find((l) => l && l.rel === 'next' && l.href && (!l.method || l.method === 'GET')) : null;
        if (!next) { url = null; break; }
        if (pages >= MAX_PAGES) { complete = false; why = 'page-guard'; url = null; break; }
        url = new URL(next.href, url).href;
      }
      const res = { ok: true, collections: cols, pages: pages, complete: complete, why: why };
      cache.set(cat.id, { at: now(), res: res });
      return res;
    }

    /* ── discover() ───────────────────────────────────────────────────────────────────────────── */

    const words = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);

    /* req = {q?, bbox?, time?, catalogs?:[id], kinds?:[…], limit?, fresh?, signal?}
       → {ok, entries[], catalogs:[{id, answered, collections, pages, complete, why?}], asked}
       ⚠ `q` WORDS ARE ALL REQUIRED TO APPEAR (title, description, keywords, id): a collection that
       matches one of three words is not 「探している物」. An empty `q` is allowed and means place/time only. */
    async function discover(req) {
      const o = req || {};
      const box = (o.bbox == null) ? null : asBox(o.bbox);
      if (o.bbox != null && !box) return refuse('bad-param', { param: 'bbox', value: o.bbox });
      if (o.time != null && o.time !== '') { const t = timeSpan(o.time); if (!t || t.bad) return refuse('bad-param', { param: 'time', value: o.time }); }
      if (o.kinds != null && !(Array.isArray(o.kinds) && o.kinds.every((k) => KINDS.indexOf(k) >= 0))) return refuse('bad-param', { param: 'kinds', kinds: KINDS.slice() });
      let which = catalogs();
      if (Array.isArray(o.catalogs) && o.catalogs.length) {
        for (const id of o.catalogs) if (!catalogById(id)) return refuse('catalog-unknown', { id: String(id), catalogs: which.map((c) => c.id) });
        which = which.filter((c) => o.catalogs.map(String).indexOf(c.id) >= 0);
      }
      if (Array.isArray(o.kinds) && o.kinds.length) which = which.filter((c) => o.kinds.indexOf(c.kind) >= 0);
      const want = words(o.q);
      const limit = (isNum(o.limit) && o.limit > 0) ? Math.floor(o.limit) : 50;

      const answers = await Promise.all(which.map(async (cat) => ({ cat: cat, res: await collectionsOf(cat, o.signal || null, !!o.fresh) })));
      if (o.signal && o.signal.aborted) return refuse('cancelled');
      const entries = [], report = [];
      for (const a of answers) {
        const r = a.res;
        const row = { id: a.cat.id, kind: a.cat.kind, label: a.cat.label, answered: !!r.ok, collections: r.collections ? r.collections.length : 0, pages: r.pages || 0, complete: !!r.ok && r.complete !== false };
        if (!r.ok) { row.why = r.why; row.detail = r.detail || null; }
        else if (r.complete === false) row.why = r.why;
        report.push(row);
        if (!r.ok) continue;
        for (const c of r.collections) {
          const hay = words([c.id, c.title, c.description, c.keywords.join(' ')].join(' '));
          const hs = new Set(hay);
          if (want.length && !want.every((w) => hs.has(w) || hay.some((h) => h.startsWith(w)))) continue;
          const spatial = spatialRelation(c.extent.bbox, box);
          const temporal = temporalRelation(c.extent.time, o.time);
          if (spatial === 'outside' || temporal === 'outside') continue;
          entries.push(Object.assign({}, c, { match: { spatial: spatial, temporal: temporal }, catalogLabel: a.cat.label }));
        }
      }
      /* ordered by how much was STATED: a collection that states a covering extent outranks one that
         states none, because 「不明」 is not a match — it is merely not a refusal */
      const rank = (e) => (e.match.spatial === 'covers' ? 0 : e.match.spatial === 'overlaps' ? 1 : 2) * 3 + (e.match.temporal === 'overlaps' ? 0 : e.match.temporal === 'unstated' ? 1 : 2);
      entries.sort((a, b) => rank(a) - rank(b));
      return {
        ok: true, entries: entries.slice(0, limit), total: entries.length, truncated: entries.length > limit,
        catalogs: report, asked: { q: o.q == null ? null : String(o.q), bbox: box, time: o.time == null || o.time === '' ? null : String(o.time) },
        /* the one sentence the reader is owed about ③ */
        note: 'A match is a collection that STATES it covers the place and period; whether it holds everything that exists there is not something a catalogue can state (worldCompleteness: unproven).',
      };
    }

    /* ── refs ─────────────────────────────────────────────────────────────────────────────────── */

    function parseRef(ref) {
      const s = String(ref == null ? '' : ref).trim().replace(/^(stac|ogc|remote):/, '');
      const i = s.indexOf('/');
      if (i <= 0 || i === s.length - 1) return refuse('bad-param', { param: 'ref', value: ref == null ? null : String(ref), shape: '<catalog>/<collection>' });
      const cat = catalogById(s.slice(0, i));
      if (!cat) return refuse('catalog-unknown', { id: s.slice(0, i), catalogs: catalogs().map((c) => c.id) });
      return { ok: true, cat: cat, collection: s.slice(i + 1) };
    }

    const colUrl = (cat, id) => cat.url + '/collections/' + encodeURIComponent(id) + (cat.kind === 'stac' ? '' : '?f=json');

    /* ── inspect() ────────────────────────────────────────────────────────────────────────────── */

    const isCogType = (t) => /tiff/i.test(String(t || ''));
    function assetRow(key, a) {
      const r = resolveHref(a && a.href);
      const type = a && a.type ? String(a.type) : null;
      const bands = Array.isArray(a && a['raster:bands']) ? a['raster:bands'].map((b) => ({ data_type: b.data_type || null, unit: b.unit || null, nodata: b.nodata === undefined ? null : b.nodata, spatial_resolution: b.spatial_resolution || null })) : null;
      return {
        key: key, type: type, roles: Array.isArray(a && a.roles) ? a.roles.slice() : [], title: a && a.title ? String(a.title) : null,
        href: r.href, hrefDerivedFrom: r.derivedFrom,
        /* ⚠ `cog` IS WHAT THE MEDIA TYPE SAYS, and the reader confirms it by opening the file; a TIFF
           that is not tiled with overviews still opens, and says so in the answer to cog() */
        cog: isCogType(type) && /cloud-optimized|cog/i.test(type),
        tiff: isCogType(type), bands: bands,
        /* a SAS-signed or token-protected asset cannot be fetched anonymously; the collection says so
           by an `msft:` / `auth:` member and the address is not usable as it stands */
        needsSigning: !!(a && Object.keys(a).some((k) => /^(auth|storage):/.test(k) && /schemes|requires/.test(k) && a[k]) ) || /\bsig=|X-Amz-Signature=/i.test(String(a && a.href)),
      };
    }

    /* → {ok, collection, sample:{item|feature, assets[]|properties[]}, evidence}. ⚠ THE SAMPLE IS ONE
       ITEM: it states what an item LOOKS like, not that every item is like it. */
    async function inspect(ref, opts) {
      const p = parseRef(ref);
      if (!p.ok) return p;
      const o = opts || {};
      const box = (o.bbox == null) ? null : asBox(o.bbox);
      if (o.bbox != null && !box) return refuse('bad-param', { param: 'bbox', value: o.bbox });
      const cr = await fetchJson(colUrl(p.cat, p.collection), null, o.signal);
      if (!cr.ok) return cr.why === 'http-status' && cr.detail && cr.detail.status === 404 ? refuse('collection-unknown', { ref: p.cat.id + '/' + p.collection }) : cr;
      const col = normaliseCollection(p.cat, cr.json);
      let sample = null, sampleWhy = null;
      if (p.cat.kind === 'stac') {
        const body = { collections: [p.collection], limit: 1 };
        if (box) body.bbox = [box.w, box.s, box.e, box.n];
        const r = await fetchJson(p.cat.url + '/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json' }, body: JSON.stringify(body) }, o.signal);
        if (!r.ok) sampleWhy = r.why;
        else {
          const f = r.json && r.json.features && r.json.features[0];
          if (!f) sampleWhy = 'no-item-in-window';
          else {
            const props = f.properties || {};
            sample = {
              id: f.id, datetime: props.datetime || null, epsg: props['proj:epsg'] === undefined ? null : props['proj:epsg'], gsd: props.gsd === undefined ? null : props.gsd,
              assets: Object.keys(f.assets || {}).map((k) => assetRow(k, f.assets[k])),
              propertyNames: Object.keys(props),
            };
          }
        }
      } else {
        const q = ['f=json', 'limit=1'];
        if (box) q.push('bbox=' + [box.w, box.s, box.e, box.n].join(','));
        const r = await fetchJson(p.cat.url + '/collections/' + encodeURIComponent(p.collection) + '/items?' + q.join('&'), null, o.signal);
        if (!r.ok) sampleWhy = r.why;
        else {
          const f = r.json && r.json.features && r.json.features[0];
          if (!f) sampleWhy = 'no-feature-in-window';
          else sample = { id: f.id === undefined ? null : f.id, geometryType: f.geometry ? f.geometry.type : null, propertyNames: Object.keys(f.properties || {}) };
        }
      }
      const asked = box;
      return {
        ok: true, ref: p.cat.id + '/' + p.collection, collection: col, sample: sample, sampleWhy: sampleWhy,
        evidence: evidenceOf(col, asked, null),
        /* how to READ it — the existing doors, not a second reader */
        refs: {
          features: 'ogc:' + p.cat.url + '/collections/' + encodeURIComponent(p.collection),
          grids: sample && sample.assets ? sample.assets.filter((x) => x.cog && /^https:/.test(x.href)).map((x) => 'url:' + x.href) : [],
        },
      };
    }

    /* ② stated-or-unstated, ③ always unproven */
    function evidenceOf(col, box, time) {
      return {
        spatialExtent: spatialRelation(col.extent.bbox, box),
        temporalExtent: temporalRelation(col.extent.time, time),
        license: col.rights.license === null ? 'unstated' : 'stated',
        worldCompleteness: 'unproven',
      };
    }

    /* ── signing ──────────────────────────────────────────────────────────────────────────────── */

    /* what each SIGNING KIND means: which storage scheme of a collection it applies to, and how the scheme names its host.
       A new kind is one row here and a `sign` member on a catalogue — never a branch on a host. */
    const SIGNING = {
      'azure-sas': {
        scheme: 'ms-azure',
        /* STAC storage ext: platform "https://{account}.blob.core.windows.net", container is the first path segment */
        owns: (sch, u) => {
          const platform = String(sch.platform || '').replace('{account}', String(sch.account || ''));
          let host; try { host = new URL(platform).host; } catch (_) { return false; }
          return u.host === host && (!sch.container || u.pathname.indexOf('/' + sch.container + '/') === 0);
        },
        /* a SAS token is a query string the store appends to the address */
        apply: (href, token) => href + (href.indexOf('?') >= 0 ? '&' : '?') + String(token).replace(/^[?]/, ''),
      },
    };
    const tokens = new Map();   /* catalogue/collection → {token, expires} */
    const TOKEN_MARGIN_MS = 60 * 1000;

    /* href → {ok, href, collection, catalog, expires} | {ok:false, why:'no-signer'|'sign-failed'|…}.
       ⚠ IT IS ASKED ONLY AFTER A HOST HAS REFUSED an unsigned address (js/gis-fetch.js); an address that already carries a
       signature and was refused is a stale or wrong token, said as such, not signed again. */
    async function signHref(href, opts) {
      const o = opts || {};
      const r = publicUrl(href);
      if (!r.ok) return r;
      const u = new URL(r.url);
      if (/(^|&)(sig|X-Amz-Signature)=/i.test(u.search.slice(1))) return refuse('sign-failed', { host: u.host, reason: 'already-signed-and-refused' });
      for (const cat of catalogs()) {
        const kind = cat.sign && SIGNING[cat.sign.kind];
        if (!kind) continue;
        const cols = await collectionsOf(catalogById(cat.id), o.signal || null, false);
        if (!cols.ok) continue;
        const col = cols.collections.find((c) => c.storage.some((sch) => sch.type === kind.scheme && kind.owns(sch, u)));
        if (!col) continue;
        const key = cat.id + '/' + col.id;
        let t = tokens.get(key);
        if (!t || t.expires - TOKEN_MARGIN_MS <= now()) {
          const tr = await fetchJson(String(cat.sign.token).replace('{collection}', encodeURIComponent(col.id)), null, o.signal);
          if (!tr.ok) return refuse('sign-failed', { catalog: cat.id, collection: col.id, because: tr.why, detail: tr.detail || null });
          const tok = tr.json && tr.json.token;
          if (!tok) return refuse('sign-failed', { catalog: cat.id, collection: col.id, reason: 'no-token-in-answer' });
          const exp = ms(tr.json['msft:expiry'] || tr.json.expiry || tr.json.expires);
          t = { token: String(tok), expires: exp == null ? now() + 5 * 60 * 1000 : exp };
          tokens.set(key, t);
        }
        return { ok: true, href: kind.apply(r.url, t.token), collection: col.id, catalog: cat.id, expires: t.expires };
      }
      return refuse('no-signer', { host: u.host, reason: 'no catalogue states a signed store holding this address' });
    }

    const API = {
      catalogs, add, discover, inspect, signHref,
      publicUrl, resolveHref, refusals: () => REFUSALS.slice(), kinds: () => KINDS.slice(),
      /* what the Atlas door may ask of this module — one declaration, read by the door */
      actions: () => ['catalogs', 'add', 'discover', 'inspect'],
      /* the pure parts, published so a check can drive them without a network */
      _spatialRelation: spatialRelation, _temporalRelation: temporalRelation, _timeSpan: timeSpan,
    };
    try { const w = WIN(); if (w) w.IntMapGisRemote = API; } catch (_) { }
    return API;
  })();
}
