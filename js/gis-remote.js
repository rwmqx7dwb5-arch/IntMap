/* ============================================================================
 *  IntMap · DATA THAT IS NOT IN THE APP — window.IntMapGisRemote
 * ----------------------------------------------------------------------------
 *  Everything the GIS kernel could acquire was something this app already knew about: a layer of the
 *  map, a file somebody dropped in. js/gis-atlas.js `catalogue()` lists THOSE, so a planner asked for
 *  「2023 年のベトナム北部の、利用できる最高解像度の標高と洪水リスクを探して」 had no way to ask the one
 *  question that comes first — 「そういうデータは、世界のどこに在るか」 — and js/gis-geotiff.js's
 *  readUrl() (HTTP range reads of a Cloud-Optimised GeoTIFF) had no caller at all.
 *
 *  ⚠ THIS FILE DISCOVERS; IT READS NO VALUES. It signs an address when a catalogue states how (signHref), reads the FIRST KILOBYTE of a
 *  file to learn whether an anonymous reader may take it (probeAsset), and acquire() chooses what to read and records where it stopped
 *  in the ledger (js/gis-pipeline.js) — but the reading itself is the door's (D.readGrid / D.readFeatures → js/gis-atlas.js resolveRef).
 *  search() / items() ask by resolution, cloud, licence and held datasets (js/gis-catalog-search.js is the pure part). Reading what a collection holds is already a door of
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
import { explainFetchFailure, describeResponse, looksLikeAPage } from './gis-http.js';
import { toRecord, localRecord, searchRecords } from './gis-catalog-search.js';

export function makeGisRemote(deps) {
  return (function () {
    const D = deps || {};
    const WIN = () => { try { return (typeof window !== 'undefined' && window) || null; } catch (_) { return null; } };
    const pick = (k, g) => (D[k] !== undefined ? D[k] : (WIN() && WIN()[g]) || null);
    const now = () => (typeof D.now === 'function' ? D.now() : Date.now());
    /* the ledger of what stage each thing reached (js/gis-pipeline.js) — handed in, so the door and the readers share ONE */
    const PIPE = () => D.pipeline || null;

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
        /* STAC item_assets: what an item of this collection will carry, stated before any item is read (resolution can live here) */
        itemAssets: (c && c.item_assets && typeof c.item_assets === 'object') ? c.item_assets : null,
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
      const t0 = now();
      while (url) {
        const r = await fetchJson(url, null, signal);
        if (!r.ok) {
          if (!pages) return { ok: false, why: r.why, detail: r.detail || null, pages: 0, collections: [], ms: now() - t0 };
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
      const res = { ok: true, collections: cols, pages: pages, complete: complete, why: why, ms: now() - t0 };
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
        if (isNum(r.ms)) row.ms = r.ms;
        if (!r.ok) { row.why = r.why; row.detail = r.detail || null; if (PIPE()) row.kind_of_silence = PIPE().classify(r.why, r.detail).kind; }
        if (PIPE() && !r.cached) PIPE().noteCatalog(a.cat.id, row);
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
          entries.push(Object.assign({}, c, { match: { spatial: spatial, temporal: temporal }, catalogLabel: a.cat.label }));        }
      }
      /* ordered by how much was STATED: a collection that states a covering extent outranks one that
         states none, because 「不明」 is not a match — it is merely not a refusal */
      const rank = (e) => (e.match.spatial === 'covers' ? 0 : e.match.spatial === 'overlaps' ? 1 : 2) * 3 + (e.match.temporal === 'overlaps' ? 0 : e.match.temporal === 'unstated' ? 1 : 2);
      entries.sort((a, b) => rank(a) - rank(b));
      /* what a reader is SHOWN was stated by a catalogue — a lead, recorded as exactly that and nothing further */
      if (PIPE()) for (const e of entries.slice(0, limit)) PIPE().record(e.ref, 'discovered', { status: 'ok', say: 'stated by ' + e.catalog, facts: e.match });
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

    /* ── access: may an anonymous reader take THIS file? ──────────────────────────────────────────────
       A catalogue's statement that a file exists says nothing about whether it can be read. The one honest test is to read
       its first kilobyte, through the same road every reader uses (direct → relay → signed), and classify what came back.
       → {ok:true, status, kind} | {ok:false, why, detail} where `why`/`detail` are the codes js/gis-pipeline.js classify() reads.
       ⚠ A 200 that is a PAGE (text/html) is a sign-in screen, not the file (observed: USGS landsatlook → ERS login). */
    async function probeAsset(href, opts) {
      const o = opts || {};
      const ok = publicUrl(resolveHref(href).href);
      if (!ok.ok) return ok;
      const doFetch = reachingFetch(D.fetch);
      if (!doFetch) return refuse('fetch-failed', { url: ok.url, reason: 'no-fetch-in-this-runtime' });
      const ctl = (typeof AbortController === 'function') ? new AbortController() : null;
      let timedOut = false;
      const timer = ctl ? setTimeout(() => { timedOut = true; try { ctl.abort(); } catch (_) { } }, D.timeoutMs || CALL_MS) : null;
      try {
        let res;
        try { res = await doFetch(ok.url, { headers: { Range: 'bytes=0-1023' }, signal: ctl ? ctl.signal : undefined }); }
        catch (e) {
          if (timedOut) return refuse('timeout', { url: ok.url, ms: D.timeoutMs || CALL_MS });
          return refuse('fetch-failed', Object.assign({ url: ok.url }, await explainFetchFailure(ok.url, doFetch, e)));
        }
        if (!res || !res.ok) return refuse('http-status', Object.assign({ url: ok.url, status: res ? res.status : null }, res ? await describeResponse(ok.url, res) : {}));
        if (looksLikeAPage(res)) return refuse('http-status', Object.assign({ url: ok.url, status: res.status, reason: 'a page was returned where a file was asked for' }, await describeResponse(ok.url, res)));
        let bytes = null;
        try { bytes = typeof res.arrayBuffer === 'function' ? (await res.arrayBuffer()).byteLength : null; } catch (_) { }
        return { ok: true, status: res.status, partial: res.status === 206, bytes: bytes, url: ok.url };
      } finally { if (timer) clearTimeout(timer); }
    }

    /* ── items: which FILES of a STAC collection cover a place and a period ──────────────────────────
       The collection-level answer says a collection covers a region; the item-level one says which scenes, when, how fine,
       how cloudy. `POST /search` (STAC API core). ⚠ ONE PAGE, SAID SO: `continues` is whether the server offered a next link,
       not a guess; a window that matches more than `limit` items is not a window with `limit` items. */
    async function items(ref, opts) {
      const p = parseRef(ref);
      if (!p.ok) return p;
      if (p.cat.kind !== 'stac') return refuse('bad-param', { param: 'ref', reason: 'item search is a STAC API operation; this catalogue is ' + p.cat.kind });
      const o = opts || {};
      const box = (o.bbox == null) ? null : asBox(o.bbox);
      if (o.bbox != null && !box) return refuse('bad-param', { param: 'bbox', value: o.bbox });
      if (o.time != null && o.time !== '') { const t = timeSpan(o.time); if (!t || t.bad) return refuse('bad-param', { param: 'time', value: o.time }); }
      const limit = (isNum(o.limit) && o.limit > 0) ? Math.min(Math.floor(o.limit), 100) : 10;
      const body = { collections: [p.collection], limit: limit };
      if (box) {
        /* a window across ±180 is TWO boxes to a server that wants w<e: STAC's `bbox` allows w>e (spec §bbox) but servers differ, so we ask the standard way
           and say how many sides were asked */
        body.bbox = [box.w, box.s, box.e, box.n];
      }
      if (o.time != null && o.time !== '') {
        const t = timeSpan(o.time);
        const iso = (m) => (m == null ? '..' : new Date(m).toISOString());
        body.datetime = iso(t.from) + '/' + iso(t.to == null ? null : t.to - 1);
      }
      const r = await fetchJson(p.cat.url + '/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json' }, body: JSON.stringify(body) }, o.signal);
      if (!r.ok) return r;
      const feats = Array.isArray(r.json && r.json.features) ? r.json.features : [];
      let rows = feats.map((f) => {
        const pr = f.properties || {};
        const assets = Object.keys(f.assets || {}).map((k) => assetRow(k, f.assets[k]));
        return {
          id: f.id, datetime: pr.datetime || (pr.start_datetime ? pr.start_datetime + '/' + (pr.end_datetime || '..') : null),
          gsd: pr.gsd === undefined ? null : pr.gsd, cloud: pr['eo:cloud_cover'] === undefined ? null : pr['eo:cloud_cover'],
          epsg: pr['proj:epsg'] === undefined ? null : pr['proj:epsg'], bbox: Array.isArray(f.bbox) ? f.bbox.slice(0, 4) : null, assets: assets,
        };
      });
      const beforeCloud = rows.length;
      if (isNum(o.maxCloud)) rows = rows.filter((x) => x.cloud == null || x.cloud <= o.maxCloud);
      const droppedByCloud = beforeCloud - rows.length;
      const next = Array.isArray(r.json.links) ? r.json.links.find((l) => l && l.rel === 'next') : null;
      return {
        ok: true, ref: p.cat.id + '/' + p.collection, items: rows, returned: feats.length, droppedByCloud: droppedByCloud,
        matched: r.json && r.json.numberMatched != null ? r.json.numberMatched : (r.json && r.json.context && r.json.context.matched != null ? r.json.context.matched : null),
        continues: !!next, asked: { bbox: box, time: o.time == null || o.time === '' ? null : String(o.time), limit: limit, maxCloud: isNum(o.maxCloud) ? o.maxCloud : null },
      };
    }

    /* ── search(): one question across the content, place, period, resolution and stated quality of every dataset ──
       req = {q, bbox, time, maxGsd, minGsd, maxCloud, licensed, kinds, origins, strict, catalogs, limit, local[], items:true}
       The catalogues are asked as discover() asks them (same cache, same «did not answer» report); the datasets this session
       HOLDS (`local`, or D.data.list()) join the same list, so «what do I already have and what could I get» is one question. */
    async function search(req) {
      const o = req || {};
      const box = (o.bbox == null) ? null : asBox(o.bbox);
      if (o.bbox != null && !box) return refuse('bad-param', { param: 'bbox', value: o.bbox });
      if (o.time != null && o.time !== '') { const t = timeSpan(o.time); if (!t || t.bad) return refuse('bad-param', { param: 'time', value: o.time }); }
      for (const k of ['maxGsd', 'minGsd', 'maxCloud']) if (o[k] != null && !(isNum(o[k]) && o[k] >= 0)) return refuse('bad-param', { param: k, value: o[k] });
      if (o.kinds != null && !(Array.isArray(o.kinds) && o.kinds.every((k) => KINDS.indexOf(k) >= 0))) return refuse('bad-param', { param: 'kinds', kinds: KINDS.slice() });
      let which = catalogs();
      if (Array.isArray(o.catalogs) && o.catalogs.length) {
        for (const id of o.catalogs) if (!catalogById(id)) return refuse('catalog-unknown', { id: String(id), catalogs: which.map((c) => c.id) });
        which = which.filter((c) => o.catalogs.map(String).indexOf(c.id) >= 0);
      }
      const askCatalogues = !(Array.isArray(o.origins) && o.origins.length && o.origins.indexOf('catalogue') < 0);
      const answers = askCatalogues ? await Promise.all(which.map(async (cat) => ({ cat: cat, res: await collectionsOf(cat, o.signal || null, !!o.fresh) }))) : [];
      if (o.signal && o.signal.aborted) return refuse('cancelled');
      const recs = [], report = [];
      for (const a of answers) {
        const r = a.res;
        const row = { id: a.cat.id, kind: a.cat.kind, label: a.cat.label, answered: !!r.ok, collections: r.collections ? r.collections.length : 0, pages: r.pages || 0, complete: !!r.ok && r.complete !== false };
        if (isNum(r.ms)) row.ms = r.ms;
        if (!r.ok) { row.why = r.why; row.detail = r.detail || null; if (PIPE()) row.kind_of_silence = PIPE().classify(r.why, r.detail).kind; }
        else if (r.complete === false) row.why = r.why;
        report.push(row);
        if (PIPE() && !r.cached) PIPE().noteCatalog(a.cat.id, row);
        if (r.ok) for (const c of r.collections) recs.push(toRecord(c, a.cat));
      }
      let held = [];
      try { held = Array.isArray(o.local) ? o.local : (D.data && typeof D.data.list === 'function' ? D.data.list() : []); } catch (_) { held = []; }
      for (const ds of held) { try { if (ds && ds.id != null) recs.push(localRecord(ds)); } catch (_) { } }
      const res = searchRecords(recs, { q: o.q, bbox: box, time: o.time, maxGsd: o.maxGsd, minGsd: o.minGsd, maxCloud: o.maxCloud, licensed: !!o.licensed, kinds: o.kinds, origins: o.origins, strict: !!o.strict },
        { spatial: spatialRelation, temporal: temporalRelation });
      const limit = (isNum(o.limit) && o.limit > 0) ? Math.floor(o.limit) : 25;
      const shown = res.entries.slice(0, limit);
      if (PIPE()) for (const e of shown) if (e.origin === 'catalogue') PIPE().record(e.ref, 'discovered', { status: 'ok', say: 'stated by ' + e.catalog, facts: e.match });
      let itemsOf = null;
      if (o.items && shown.length) {
        /* the item-level look at the best few: which scenes, when, how fine — one STAC search each, and each says if it did not answer */
        const top = shown.filter((e) => e.origin === 'catalogue' && e.kind === 'stac').slice(0, 3);
        itemsOf = await Promise.all(top.map(async (e) => { const r = await items(e.ref, { bbox: box, time: o.time, maxCloud: o.maxCloud, limit: 5, signal: o.signal || null }); return r.ok ? r : { ok: false, ref: e.ref, why: r.why, detail: r.detail || null }; }));
      }
      return {
        ok: true, entries: shown, total: res.total, truncated: res.total > shown.length, facets: res.facets, dropped: res.dropped,
        catalogs: report, items: itemsOf,
        asked: { q: o.q == null ? null : String(o.q), bbox: box, time: o.time == null || o.time === '' ? null : String(o.time), maxGsd: o.maxGsd == null ? null : o.maxGsd, minGsd: o.minGsd == null ? null : o.minGsd, maxCloud: o.maxCloud == null ? null : o.maxCloud, licensed: !!o.licensed, strict: !!o.strict },
        note: 'Every filter is judged on what the record STATES; a record that states nothing for a filter is kept and marked unstated (strict:true drops it). A catalogue listed as not answering is not «nothing there». `stated` counts the facts a record gives about itself, not the quality of the data.',
      };
    }

    /* ── acquire(): one reference, taken through every stage, each stage's outcome in the ledger ───────
       discovered (the catalogue states it) → access (the first kilobyte of the file is readable anonymously) → fetched
       (the window came back, all or part) → inspected (the values were looked at) → dataset. Reading is done by the
       door that already reads (D.readGrid / D.readFeatures → js/gis-atlas.js resolveRef); this function chooses WHAT to read
       from what the collection states and records WHERE it stopped. A stage that did not hold is returned as the state — not
       as an error — because «where it stopped» is the answer the planner asked for.
       ⚠ A WINDOW ACROSS ±180 is read as two windows, each from the item the catalogue holds for that side, each its own dataset
       (not mosaicked: two files are two datasets); the parent says `partial` for exactly the side that did not come. */
    async function acquire(ref, opts) {
      const P = PIPE();
      if (!P) return refuse('bad-param', { param: 'pipeline', reason: 'no ledger was handed to this module' });
      const o = opts || {};
      const p = parseRef(ref);
      if (!p.ok) return p;
      const key = p.cat.id + '/' + p.collection;
      const box = asBox(o.bbox);
      if (!box) return refuse('bad-param', { param: 'bbox', reason: 'acquire reads a window; state it (bounds:[w,s,e,n])' });
      const ins = await inspect(ref, { bbox: box, signal: o.signal || null });
      if (!ins.ok) { P.recordFailure(key, 'discovered', ins.why, ins.detail); return { ok: true, ref: key, state: P.verdict(key), datasets: [], parts: [] }; }
      P.record(key, 'discovered', { status: 'ok', say: 'the catalogue states this collection (' + p.cat.id + ')' });

      /* features: the collection IS the dataset (OGC API – Features, or a STAC collection read as items) */
      if (p.cat.kind !== 'stac') {
        if (typeof D.readFeatures !== 'function') return refuse('bad-param', { param: 'readFeatures', reason: 'no reader was handed to this module' });
        const url = String(ins.refs.features).replace(/^ogc:/, '');
        const r = await D.readFeatures(url, { bounds: [box.w, box.s, box.e, box.n], limit: o.limit, time: o.time });
        const k = 'ogc:' + url;
        if (!P.verdict(k).known) { if (!r.ok) P.recordFailure(k, 'fetched', r.why, r.detail); }
        P.combine(key, [{ key: k, label: 'features' }]);
        return { ok: true, ref: key, state: P.verdict(key), datasets: r.ok && r.id ? [r.id] : [], parts: [{ label: 'features', ref: k }] };
      }

      if (typeof D.readGrid !== 'function') return refuse('bad-param', { param: 'readGrid', reason: 'no reader was handed to this module' });
      if (!(isNum(o.width) && isNum(o.height) && o.width >= 1 && o.height >= 1)) return refuse('bad-param', { param: 'width/height', reason: 'a grid is read at a resolution the caller states' });
      const sides = P.splitAtAntimeridian(box);
      const windows = sides ? [{ label: 'east of the date line', box: sides[0] }, { label: 'west of the date line', box: sides[1] }] : [{ label: 'window', box: box }];
      const spanTotal = windows.reduce((t, w) => t + (w.box.e - w.box.w), 0) || 1;
      const partKeys = [], ids = [], parts = [];
      for (const w of windows) {
        const part = { label: w.label, bounds: [w.box.w, w.box.s, w.box.e, w.box.n] };
        parts.push(part);
        /* which FILE holds this side: ask the catalogue for an item over THIS box */
        const it = await items(ref, { bbox: w.box, time: o.time, limit: 5, signal: o.signal || null });
        const synth = key + '#' + w.label.replace(/\s+/g, '-');
        if (!it.ok) { P.recordFailure(synth, 'fetched', it.why, it.detail); part.ref = synth; partKeys.push({ key: synth, label: w.label }); continue; }
        /* ⚠ A SERVER MAY ANSWER A BOX THAT ONLY TOUCHES A TILE'S EDGE (measured 2026-11-20: asking the east side of the date line returned the tile that starts at -180). An item is a candidate for this part only if ITS OWN bbox overlaps the part. */
        const here = it.items.filter((x) => { const b = x.bbox && asBox(x.bbox); return !b || overlapsBox(b, w.box); });
        const pick = here.map((x) => ({ item: x, asset: o.asset ? x.assets.find((a) => a.key === o.asset) : x.assets.find((a) => a.cog && /^https:/.test(a.href)) })).find((x) => x.asset);
        if (!pick) {
          P.record(synth, 'access', { status: 'ok', say: 'the catalogue answered' });
          P.record(synth, 'fetched', { status: 'failed', why: here.length ? 'no-readable-asset' : 'no-item-in-window', say: here.length ? 'items exist here but none carries a Cloud-Optimised GeoTIFF asset (' + Array.from(new Set(here.flatMap((x) => x.assets.map((a) => a.type || '?')))).join(', ') + ')' : 'the catalogue holds no item for this part of the window — that is this catalogue, not «nothing exists»' });
          part.ref = synth; partKeys.push({ key: synth, label: w.label }); continue;
        }
        part.item = pick.item.id; part.asset = pick.asset.key;
        const url = pick.asset.href, uk = 'url:' + url;
        part.ref = uk; partKeys.push({ key: uk, label: w.label });
        P.record(uk, 'discovered', { status: 'ok', say: 'an asset of ' + key + ' (item ' + pick.item.id + ')' });
        /* may an anonymous reader take it? asked of the file itself, in the host's words */
        const pr = await probeAsset(url, { signal: o.signal || null });
        if (!pr.ok) {
          const c = P.classify(pr.why, pr.detail);
          P.record(uk, 'access', { status: c.status === 'failed' ? 'failed' : c.status, why: pr.why, kind: c.kind, say: c.say, detail: pr.detail || null, facts: { retryable: c.retryable } });
          continue;
        }
        const width = Math.max(1, Math.round(o.width * (w.box.e - w.box.w) / spanTotal));
        const r = await D.readGrid(url, { bounds: [w.box.w, w.box.s, w.box.e, w.box.n], width: width, height: Math.floor(o.height), band: o.band, signal: o.signal || null });
        if (r && r.ok && r.id) { ids.push(r.id); part.id = r.id; }
      }
      P.combine(key, partKeys);
      /* a parent that is `partial` because of the date line says exactly which side, and that two files are two datasets */
      return { ok: true, ref: key, state: P.verdict(key), datasets: ids, parts: parts.map((x) => Object.assign({}, x, { state: x.ref ? P.verdict(x.ref) : null })), acrossAntimeridian: !!sides };
    }

    const API = {
      catalogs, add, discover, inspect, signHref, search, items, probeAsset, acquire,
      publicUrl, resolveHref, refusals: () => REFUSALS.slice(), kinds: () => KINDS.slice(),
      /* what the Atlas door may ask of this module — one declaration, read by the door */
      actions: () => ['catalogs', 'add', 'discover', 'inspect', 'search', 'items', 'acquire'],
      /* the pure parts, published so a check can drive them without a network */
      _spatialRelation: spatialRelation, _temporalRelation: temporalRelation, _timeSpan: timeSpan,
    };
    try { const w = WIN(); if (w) w.IntMapGisRemote = API; } catch (_) { }
    return API;
  })();
}
