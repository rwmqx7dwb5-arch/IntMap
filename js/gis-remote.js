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
import { toRecord, localRecord, searchRecords, resolutionRelation, modalitiesOf, isNonCommercial, MODALITIES,
  asBox, boundsOf, splitBox, hasArea, intersectBox, subtractBox, extentIntersections, spatialRelation, ms, timeSpan, temporalRelation } from './gis-catalog-search.js';

let acquisitionSeq = 0;

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

    const collectionUrl = (cat, id) => cat.url + '/collections/' + encodeURIComponent(id);

    /* ── inspect() ────────────────────────────────────────────────────────────────────────────── */

    const isCogType = (t) => /tiff/i.test(String(t || ''));
    function assetRow(key, a) {
      const r = resolveHref(a && a.href);
      const type = a && a.type ? String(a.type) : null;
      const metadata = a?.bands || a?.['raster:bands'];
      const bands = Array.isArray(metadata) ? metadata.map((b) => ({ data_type: b?.data_type || null, unit: b?.unit || null, nodata: b?.nodata ?? null, spatial_resolution: b?.gsd ?? b?.['raster:spatial_resolution'] ?? b?.spatial_resolution ?? null })) : null;
      return {
        key: key, type: type, roles: Array.isArray(a && a.roles) ? a.roles.slice() : [], title: a && a.title ? String(a.title) : null,
        href: r.href, hrefDerivedFrom: r.derivedFrom,
        /* ⚠ `cog` IS WHAT THE MEDIA TYPE SAYS, and the reader confirms it by opening the file; a TIFF
           that is not tiled with overviews still opens, and says so in the answer to cog() */
        cog: isCogType(type) && /cloud-optimized|cog/i.test(type),
        tiff: isCogType(type), bands: bands, gsd: isNum(a?.gsd) && a.gsd > 0 ? a.gsd : null,
        /* a SAS-signed or token-protected asset cannot be fetched anonymously; the collection says so
           by an `msft:` / `auth:` member and the address is not usable as it stands */
        needsSigning: !!(a && Object.keys(a).some((k) => /^(auth|storage):/.test(k) && /schemes|requires/.test(k) && a[k]) ) || /\bsig=|X-Amz-Signature=/i.test(String(a && a.href)),
      };
    }

    async function collectionOf(p, signal) {
      const url = collectionUrl(p.cat, p.collection);
      const r = await fetchJson(url + (p.cat.kind === 'stac' ? '' : '?f=json'), null, signal);
      return !r.ok && r.why === 'http-status' && r.detail?.status === 404
        ? refuse('collection-unknown', { ref: p.cat.id + '/' + p.collection })
        : r;
    }

    /* → {ok, collection, sample:{item|feature, assets[]|properties[]}, evidence}. ⚠ THE SAMPLE IS ONE
       ITEM: it states what an item LOOKS like, not that every item is like it. */
    async function inspect(ref, opts) {
      const p = parseRef(ref);
      if (!p.ok) return p;
      const o = opts || {};
      const box = (o.bbox == null) ? null : asBox(o.bbox);
      if (o.bbox != null && !box) return refuse('bad-param', { param: 'bbox', value: o.bbox });
      const cr = await collectionOf(p, o.signal);
      if (!cr.ok) return cr;
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
          features: 'ogc:' + collectionUrl(p.cat, p.collection),
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
      const timer = ctl ? setTimeout(() => { timedOut = true; ctl.abort(); }, D.timeoutMs || CALL_MS) : null;
      const signal = ctl && o.signal ? AbortSignal.any([ctl.signal, o.signal]) : ctl?.signal || o.signal;
      try {
        let res;
        try { res = await doFetch(ok.url, { headers: { Range: 'bytes=0-1023' }, signal }); }
        catch (e) {
          if (o.signal?.aborted) return refuse('cancelled');
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
    /* the numbers an item states about how much of it is unusable, VERBATIM under the item's own names (cloud is its own field).
       Read by the property NAME the STAC community uses for a defect share — nodata / degraded / saturated / defective — so a
       new mission's item is read without a new branch. → {<property name>: number} or null (NOT STATED, which is not «perfect») */
    function qualityOf(pr) {
      const q = {};
      for (const k of Object.keys(pr || {})) if (isNum(pr[k]) && /(nodata|no_data|degraded|saturated|defective)/i.test(k)) q[k] = pr[k];
      return Object.keys(q).length ? q : null;
    }
    const itemCloud = (value) => isNum(value) && value >= 0 && value <= 100 ? value : null;
    const cloudMatch = (value, ceiling) => ceiling == null ? 'not-asked' : value == null ? 'unstated' : value <= ceiling ? 'meets' : 'misses';

    async function items(ref, opts) {
      const p = parseRef(ref);
      if (!p.ok) return p;
      if (p.cat.kind !== 'stac') return refuse('bad-param', { param: 'ref', reason: 'item search is a STAC API operation; this catalogue is ' + p.cat.kind });
      const o = opts || {};
      const request = itemRequest(p, o);
      if (!request.ok) return request;
      const r = await itemPage(o, request);
      if (!r.ok) return r;
      const { next, ...page } = r;
      return { ...page, ref: p.cat.id + '/' + p.collection,
        asked: { bbox: request.box, time: o.time == null || o.time === '' ? null : String(o.time), limit: request.body.limit, maxCloud: isNum(o.maxCloud) ? o.maxCloud : null } };
    }

    function itemRequest(p, o) {
      const box = (o.bbox == null) ? null : asBox(o.bbox);
      if (o.bbox != null && !box) return refuse('bad-param', { param: 'bbox', value: o.bbox });
      const limit = (isNum(o.limit) && o.limit > 0) ? Math.min(Math.floor(o.limit), 100) : 10;
      const body = { collections: [p.collection], limit };
      if (box) body.bbox = boundsOf(box);
      if (o.time != null && o.time !== '') {
        const t = timeSpan(o.time);
        if (!t || t.bad) return refuse('bad-param', { param: 'time', value: o.time });
        const iso = (m) => (m == null ? '..' : new Date(m).toISOString());
        body.datetime = t.from === t.to && t.from != null ? iso(t.from) : iso(t.from) + '/' + iso(t.to == null ? null : t.to - 1);
      }
      return { ok: true, url: p.cat.url + '/search', method: 'POST', box, body };
    }

    function nextItemRequest(first, current, next) {
      if (!next?.href) return null;
      let url;
      try { url = new URL(next.href, current.url); } catch (_) { return refuse('bad-param', { param: 'STAC next link' }); }
      const method = String(next.method || 'GET').toUpperCase();
      if (url.origin !== new URL(first.url).origin || !['GET', 'POST'].includes(method)) return refuse('bad-param', { param: 'STAC next link', reason: 'different origin or unsupported method' });
      return {
        ok: true, url: url.href, method,
        headers: Object.assign({}, next.merge ? first.headers : null, next.headers),
        body: method === 'POST' ? Object.assign({}, next.merge ? first.body : null, next.body) : undefined,
      };
    }

    async function itemPage(o, request) {
      const headers = Object.assign({ 'Content-Type': 'application/json', Accept: 'application/geo+json' }, request.headers);
      const init = { method: request.method, headers, ...(request.method === 'POST' ? { body: JSON.stringify(request.body) } : {}) };
      const r = await fetchJson(request.url, init, o.signal);
      if (!r.ok) return r;
      const feats = Array.isArray(r.json && r.json.features) ? r.json.features : [];
      let rows = feats.map((f) => {
        const pr = f.properties || {};
        const bbox = asBox(f.bbox);
        const assets = Object.keys(f.assets || {}).map((k) => assetRow(k, f.assets[k]));
        return {
          id: f.id, datetime: pr.datetime || (pr.start_datetime ? pr.start_datetime + '/' + (pr.end_datetime || '..') : null),
          gsd: pr.gsd === undefined ? null : pr.gsd, cloud: itemCloud(pr['eo:cloud_cover']),
          epsg: pr['proj:epsg'] === undefined ? null : pr['proj:epsg'], bbox: bbox ? boundsOf(bbox) : null, assets: assets,
          platform: pr.platform == null ? null : String(pr.platform), instruments: Array.isArray(pr.instruments) ? pr.instruments.map(String) : null,
          /* STAC SAR extension: what a radar scene IS (mode, polarisations, orbit direction) — null when the item states none */
          sar: pr['sar:instrument_mode'] === undefined && pr['sar:polarizations'] === undefined ? null
            : { mode: pr['sar:instrument_mode'] === undefined ? null : pr['sar:instrument_mode'], polarizations: pr['sar:polarizations'] || null, direction: pr['sat:orbit_state'] || null },
          quality: qualityOf(pr),
        };
      });
      const beforeCloud = rows.length;
      if (isNum(o.maxCloud)) rows = rows.filter((x) => {
        const match = cloudMatch(x.cloud, o.maxCloud);
        return match === 'meets' || (match === 'unstated' && !o.strict);
      });
      const droppedByCloud = beforeCloud - rows.length;
      const next = Array.isArray(r.json.links) ? r.json.links.find((l) => l && l.rel === 'next') : null;
      return {
        ok: true, items: rows, returned: feats.length, droppedByCloud: droppedByCloud,
        matched: r.json && r.json.numberMatched != null ? r.json.numberMatched : (r.json && r.json.context && r.json.context.matched != null ? r.json.context.matched : null),
        continues: !!next, next,
      };
    }

    async function* itemPages(o, first) {
      let request = first, pages = 0;
      const visited = new Set();
      while (request && !o.signal?.aborted) {
        if (!request.ok) { yield request; return; }
        const signature = JSON.stringify([request.method, request.url, request.body, request.headers]);
        if (visited.has(signature) || pages >= MAX_PAGES) {
          yield refuse('item-pages-incomplete', { pages, reason: visited.has(signature) ? 'repeated-next-link' : 'page-guard' });
          return;
        }
        visited.add(signature);
        const page = await itemPage(o, request);
        yield page;
        if (!page.ok) return;
        pages++;
        request = nextItemRequest(first, request, page.next);
      }
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
      /* until:'ready' — start from the FIRST candidate whose data was actually read and found usable, while the other catalogues keep answering.
         The usability test is acquire() on REAL data (window read, values inspected: not empty, not all nodata), never the catalogue's own text. */
      const early = o.until === 'ready';
      if (early) {
        if (!box) return refuse('bad-param', { param: 'bbox', reason: 'until:"ready" reads data for a window; state it (bounds:[w,s,e,n])' });
        if (!(isNum(o.width) && isNum(o.height) && o.width >= 1 && o.height >= 1)) return refuse('bad-param', { param: 'width/height', reason: 'until:"ready" reads a grid at a resolution the caller states' });
      }
      const answers = [];
      let fire = null;          /* early mode: resolves the caller's wait with the first usable candidate */
      const tried = new Set(), acquisitionAttempts = [];
      const compose = () => {
        const recs = [], report = [];
        for (const a of answers) {
          const r = a.res;
          const row = { id: a.cat.id, kind: a.cat.kind, label: a.cat.label, answered: !!r.ok, collections: r.collections ? r.collections.length : 0, pages: r.pages || 0, complete: !!r.ok && r.complete !== false };
          if (isNum(r.ms)) row.ms = r.ms;
          if (!r.ok) { row.why = r.why; row.detail = r.detail || null; if (PIPE()) row.kind_of_silence = PIPE().classify(r.why, r.detail).kind; }
          else if (r.complete === false) row.why = r.why;
          report.push(row);
          if (r.ok) for (const c of r.collections) recs.push(toRecord(c, a.cat));
        }
        let held = [];
        try { held = Array.isArray(o.local) ? o.local : (D.data && typeof D.data.list === 'function' ? D.data.list() : []); } catch (_) { held = []; }
        for (const ds of held) { try { if (ds && ds.id != null) recs.push(localRecord(ds, D.raster, D.geometry)); } catch (_) { } }
        const query = { q: o.q, bbox: box, time: o.time, maxGsd: o.maxGsd, minGsd: o.minGsd, maxCloud: o.maxCloud, licensed: !!o.licensed, kinds: o.kinds, origins: o.origins, strict: !!o.strict };
        const relations = { spatial: spatialRelation, temporal: temporalRelation, intersections: extentIntersections };
        const res = searchRecords(recs, query, relations);
        /* An absent collection summary cannot rule out a qualifying scene. The read still applies strict filters. */
        const acquirable = early && o.strict ? searchRecords(recs, { ...query, strict: false }, relations).entries : res.entries;
        return { res, report, acquirable };
      };
      /* A catalogue answered: try what it says covers the window. Whether it meets the request is decided on the items and their actual reads. */
      const tryArrived = async () => {
        if (!fire || fire.done) return;
        const cands = compose().acquirable.filter((e) => e.origin === 'catalogue' && e.kind === 'stac' && e.match.spatial === 'covers' && !tried.has(e.ref)).slice(0, 2);
        for (const e of cands) {
          if (fire.done) return;
          if (tried.has(e.ref)) continue;
          tried.add(e.ref);
          let r = null;
          try { r = await acquire(e.ref, { ...o, bbox: box }, true); } catch (_) { r = null; }
          if (r?.datasets?.length) acquisitionAttempts.push(r);
          if (fire.done) return;
          if (r && r.ok && r.state && r.state.analysis === 'ready' && r.datasets && r.datasets.length) { fire.done = true; fire.resolve({ entry: e, acquired: r }); return; }
        }
      };
      const arrivals = askCatalogues ? which.map((cat) => collectionsOf(cat, o.signal || null, !!o.fresh).then(async (res) => {
        answers.push({ cat: cat, res: res });
        if (early) await tryArrived();
        return res;
      })) : [];
      const finish = async () => {
        await Promise.all(arrivals);
        if (o.signal && o.signal.aborted) return refuse('cancelled');
        const composed = compose(), res = composed.res, report = composed.report;
        if (PIPE()) for (const row of report) { const a = answers.find((x) => x.cat.id === row.id); if (a && !a.res.cached) PIPE().noteCatalog(row.id, row); }
        const limit = (isNum(o.limit) && o.limit > 0) ? Math.floor(o.limit) : 25;
        const shown = res.entries.slice(0, limit);
        if (PIPE()) for (const e of shown) if (e.origin === 'catalogue') PIPE().record(e.ref, 'discovered', { status: 'ok', say: 'stated by ' + e.catalog, facts: e.match });
        let itemsOf = null;
        if (o.items && shown.length) {
          /* the item-level look at the best few: which scenes, when, how fine — one STAC search each, and each says if it did not answer */
          const top = shown.filter((e) => e.origin === 'catalogue' && e.kind === 'stac').slice(0, 3);
          itemsOf = await Promise.all(top.map(async (e) => { const r = await items(e.ref, { bbox: box, time: o.time, maxCloud: o.maxCloud, strict: o.strict, limit: 5, signal: o.signal || null }); return r.ok ? r : { ok: false, ref: e.ref, why: r.why, detail: r.detail || null }; }));
        }
        return {
          ok: true, entries: shown, total: res.total, truncated: res.total > shown.length, facets: res.facets, dropped: res.dropped,
          catalogs: report, items: itemsOf, ...(early ? { acquisitionAttempts: acquisitionAttempts.slice() } : {}),
          asked: { q: o.q == null ? null : String(o.q), bbox: box, time: o.time == null || o.time === '' ? null : String(o.time), maxGsd: o.maxGsd == null ? null : o.maxGsd, minGsd: o.minGsd == null ? null : o.minGsd, maxCloud: o.maxCloud == null ? null : o.maxCloud, licensed: !!o.licensed, strict: !!o.strict },
          note: 'Every filter is judged on what the record STATES; a record that states nothing for a filter is kept and marked unstated (strict:true drops it). A catalogue listed as not answering is not «nothing there». `stated` counts the facts a record gives about itself, not the quality of the data.',
        };
      };
      if (!early) return finish();
      /* early mode: the full search keeps running under a handle; the caller may start now and ask for the rest later (follow) */
      const full = finish();
      const handle = 'search-' + (++followSeq);
      follows.set(handle, full);
      const first = new Promise((resolve) => { fire = { done: false, resolve: resolve }; });
      const hit = await Promise.race([first, full.then(() => { if (!fire.done) { fire.done = true; fire.resolve(null); } return first; })]);
      if (!hit) return full;     /* nothing usable arrived early: the finished search is the answer */
      const pendingIds = which.filter((c) => !answers.some((x) => x.cat.id === c.id)).map((c) => c.id);
      const first_ = { ref: hit.entry.ref, title: hit.entry.title, catalog: hit.entry.catalog, match: hit.entry.match, state: hit.acquired.state, datasets: hit.acquired.datasets, datasetsCreated: hit.acquired.datasetsCreated, parts: hit.acquired.parts, coverage: hit.acquired.coverage, acrossAntimeridian: !!hit.acquired.acrossAntimeridian };
      return {
        ok: true, early: first_, follow: handle, stillAsking: pendingIds, entries: [hit.entry], total: null, truncated: true, catalogs: compose().report, items: null,
        note: 'EARLY RESULT: this candidate states it covers the window and its data was READ and inspected (analysis: ready) while ' + pendingIds.length + ' catalogue(s) were still answering. It is one usable candidate, not the best one: ask search with follow:"' + handle + '" for the finished list (other catalogues may hold finer or newer data) and choose.',
      };
    }

    /* the finished list of an early search, by the handle it returned; the search never stopped, so this only waits for the remainder */
    const follows = new Map();
    let followSeq = 0;
    async function follow(handle) {
      const f = follows.get(String(handle));
      if (!f) return refuse('bad-param', { param: 'follow', reason: 'no search with this handle in this session', handles: Array.from(follows.keys()) });
      return f;
    }

    /* ── scenes(): 「この場所・この時期に、どんな衛星画像・SAR・LiDAR・標高が在るか」 — ACROSS collections and catalogues ──────────
       discover() says which COLLECTIONS state they cover a place; items() lists the scenes of ONE collection. A reader asking
       for imagery has neither question — they ask by KIND of observation. This takes the collections of that kind (read from
       STAC's own members by js/gis-catalog-search.js modalitiesOf — never from a host) that state they cover the place and
       period, asks each for its scenes (the same items() call, so the same one-page honesty), and answers per kind with:
         · each scene's date, cloud, stated unusable shares, resolution, platform / radar mode, and its collection's licence VERBATIM + link;
         · `refs` to read it — the existing doors (`url:<COG>` → js/gis-cog.js, `ogc:` → js/gis-ogcapi.js), so change analysis
           and models take a scene without a second reader;
         · `none`, said outright. THREE DIFFERENT NONES, never one: no collection of this kind states the place / a collection
           states it but holds no scene in the period (and what it holds at other times) / a catalogue did not answer (= 訊けなかった).
       ⚠ Every «none» is «none in the catalogues asked» — worldCompleteness is 'unproven', as everywhere in this file.
       ⚠ A DEM is not a time series: the period is NOT applied to `dem` (an elevation model has one epoch); `periodApplied` says so.
       ⚠ Collections whose licence states NON-COMMERCIAL use are listed in `excluded` with the reason and are not searched.
       req = {bbox, time?, modality?: 'optical'|'sar'|'dem'|'lidar' | [..], maxCloud?, catalogs?, perModality?, limit?, signal?} */
    const PER_MODALITY = 6;      /* 観測 2026-11-24: Planetary Computer holds up to 9 collections of one kind (3dep-lidar-*); each is one POST, so 4 kinds × 6 = 24 requests. Said in `collectionsNotAsked`, never silent. 失効条件: a catalogue that rate-limits below this. */
    async function scenes(req) {
      const o = req || {};
      const box = asBox(o.bbox);
      if (!box) return refuse('bad-param', { param: 'bbox', reason: 'scenes answers for a place; state it (bounds:[w,s,e,n])' });
      if (o.time != null && o.time !== '') { const t = timeSpan(o.time); if (!t || t.bad) return refuse('bad-param', { param: 'time', value: o.time }); }
      if (o.maxCloud != null && !(isNum(o.maxCloud) && o.maxCloud >= 0)) return refuse('bad-param', { param: 'maxCloud', value: o.maxCloud });
      const asked = o.modality == null || o.modality === '' ? MODALITIES.slice() : [].concat(o.modality).map(String);
      for (const m of asked) if (MODALITIES.indexOf(m) < 0) return refuse('bad-param', { param: 'modality', value: m, modalities: MODALITIES.slice() });
      let which = catalogs().filter((c) => c.kind === 'stac');
      if (Array.isArray(o.catalogs) && o.catalogs.length) {
        for (const id of o.catalogs) if (!catalogById(id)) return refuse('catalog-unknown', { id: String(id), catalogs: catalogs().map((c) => c.id) });
        which = which.filter((c) => o.catalogs.map(String).indexOf(c.id) >= 0);
      }
      const perMod = (isNum(o.perModality) && o.perModality > 0) ? Math.floor(o.perModality) : PER_MODALITY;
      const limit = (isNum(o.limit) && o.limit > 0) ? Math.min(Math.floor(o.limit), 50) : 10;
      const answers = await Promise.all(which.map(async (cat) => ({ cat: cat, res: await collectionsOf(cat, o.signal || null, !!o.fresh) })));
      if (o.signal && o.signal.aborted) return refuse('cancelled');
      const report = answers.map((a) => {
        const r = a.res, row = { id: a.cat.id, answered: !!r.ok, collections: r.collections ? r.collections.length : 0, complete: !!r.ok && r.complete !== false };
        if (!r.ok) { row.why = r.why; row.detail = r.detail || null; }
        return row;
      });
      const silent = report.filter((r) => !r.answered);
      const recs = [];
      for (const a of answers) if (a.res.ok) for (const c of a.res.collections) recs.push(toRecord(c, a.cat));
      const excluded = [];
      let unclassified = 0;
      const byKind = {};
      for (const m of asked) byKind[m] = [];
      for (const rec of recs) {
        const kinds = modalitiesOf(rec);
        if (!kinds.length) { unclassified++; continue; }
        const mine = kinds.filter((k) => asked.indexOf(k) >= 0);
        if (!mine.length) continue;
        if (isNonCommercial(rec.rights && rec.rights.license)) { excluded.push({ ref: rec.ref, license: rec.rights.license, why: 'non-commercial licence: IntMap offers its data to every visitor' }); continue; }
        const spatial = spatialRelation(rec.extent && rec.extent.bbox, box);
        if (spatial === 'outside') continue;
        for (const k of mine) {
          const temporal = temporalRelation(rec.extent && rec.extent.time, k === 'dem' ? null : o.time);
          if (temporal === 'outside') continue;
          byKind[k].push({ rec: rec, spatial: spatial, temporal: temporal });
        }
      }
      const rank = (e) => (e.spatial === 'covers' ? 0 : e.spatial === 'overlaps' ? 1 : 2) * 3 + (e.temporal === 'overlaps' ? 0 : e.temporal === 'unstated' ? 1 : 2);
      const out = {};
      for (const m of asked) {
        /* finer STATED resolution first (a collection that states none is last, not first): of 800 collections the ones a reader means are the 10–30 m scenes */
        const fine = (e) => (e.rec.resolution ? e.rec.resolution.min : Infinity);
        const cands = byKind[m].sort((x, y) => rank(x) - rank(y) || fine(x) - fine(y) || String(x.rec.ref).localeCompare(String(y.rec.ref)));
        /* round-robin ACROSS catalogues: the same mission is often in three of them, and the first six by resolution would all be one catalogue's copies */
        const use = [], lanes = new Map();
        for (const c of cands) { if (!lanes.has(c.rec.catalog)) lanes.set(c.rec.catalog, []); lanes.get(c.rec.catalog).push(c); }
        for (let i = 0; use.length < perMod && use.length < cands.length; i++) for (const l of lanes.values()) if (i < l.length && use.length < perMod) use.push(l[i]);
        const periodApplied = m !== 'dem' && o.time != null && o.time !== '';
        const lookups = await Promise.all(use.map(async (c) => {
          const opts = { bbox: box, time: periodApplied ? o.time : null, maxCloud: m === 'optical' ? o.maxCloud : null, limit, signal: o.signal || null };
          const p = parseRef(c.rec.ref);
          let r = p.ok ? refuse('cancelled') : p;
          if (p.ok) for await (const page of itemPages(opts, itemRequest(p, opts))) {
            if (!page.ok) {
              r = r.pages ? { ...r, incomplete: page.why } : page;
              break;
            }
            r = { ...page, pages: (r.pages || 0) + 1, items: [...(r.items || []), ...page.items].slice(0, limit),
              droppedByCloud: (r.droppedByCloud || 0) + page.droppedByCloud };
            if (r.items.length >= limit) break;
          }
          let other = null;
          if (r.ok && !r.items.length && !r.droppedByCloud && periodApplied) {
            const w = await items(c.rec.ref, { bbox: box, limit: 3, signal: o.signal || null });
            other = w.ok ? { scenes: w.items.length, datetimes: w.items.map((x) => x.datetime).filter(Boolean) } : { answered: false, why: w.why };
          }
          return { c: c, r: r, other: other };
        }));
        const list = [], collections = [];
        for (const { c, r, other } of lookups) {
          const ref = c.rec.ref, lic = c.rec.rights || {};
          const row = { ref: ref, title: c.rec.title, catalog: c.rec.catalog, spatial: c.spatial, license: lic.license == null ? null : lic.license, licenseUrl: lic.licenseUrl || null };
          if (!r.ok) { row.answered = false; row.why = r.why; row.detail = r.detail || null; collections.push(row); continue; }
          row.answered = true; row.scenes = r.items.length; row.matched = r.matched; row.continues = r.continues; row.pages = r.pages; row.incomplete = r.incomplete; row.droppedByCloud = r.droppedByCloud;
          if (other) row.atOtherTimes = other;
          collections.push(row);
          for (const it of r.items) {
            list.push({
              id: it.id, collection: ref, datetime: it.datetime, cloud: it.cloud, quality: it.quality, gsd: it.gsd == null ? (c.rec.resolution ? c.rec.resolution.min : null) : it.gsd,
              platform: it.platform, instruments: it.instruments, sar: it.sar, bbox: it.bbox, license: row.license, licenseUrl: row.licenseUrl,
              refs: { grids: it.assets.filter((x) => x.cog && /^https:/.test(x.href)).map((x) => 'url:' + x.href), collection: 'ogc:' + c.rec.ref },
              assets: it.assets.map((x) => x.key),
            });
          }
        }
        const stamp = (x) => { const t = Date.parse(String(x.datetime || '').split('/')[0]); return isNum(t) ? t : -Infinity; };
        list.sort((x, y) => stamp(y) - stamp(x));
        const unanswered = collections.filter((c) => c.answered === false);
        let none = null;
        if (!list.length) {
          if (!cands.length) none = { kind: 'no-collection', say: 'No collection in the catalogues asked states that it holds ' + m + ' data for this place' + (periodApplied ? ' and period' : '') + '.' + (silent.length ? ' ' + silent.map((c) => c.id).join(', ') + ' did not answer, which is 「訊けなかった」, not 「無い」.' : ' This is these catalogues, not a statement about the world.') };
          else if (unanswered.length === collections.length) none = { kind: 'not-answered', say: 'The collections that state this place did not answer (' + unanswered.map((c) => c.ref + ': ' + c.why).join('; ') + '). That is 「訊けなかった」, not 「無い」.' };
          else if (collections.some((c) => c.continues || c.incomplete || !c.answered) || cands.length > use.length) none = { kind: 'search-incomplete', say: 'No matching scene in the catalogue pages examined; some collections or pages were not verified.' };
          else none = { kind: 'no-scene', say: 'The collections that state this place hold no scene' + (periodApplied ? ' in the period' : '') + (o.maxCloud != null && m === 'optical' ? ' at or under ' + o.maxCloud + '% cloud' : '') + '. ' + (collections.some((c) => c.droppedByCloud) ? collections.reduce((t, c) => t + (c.droppedByCloud || 0), 0) + ' scene(s) of the first page were cloudier (droppedByCloud). ' : '') + (collections.some((c) => c.atOtherTimes && c.atOtherTimes.scenes) ? 'They hold scenes at other times (atOtherTimes).' : 'The first page showed none at any time.') + ' This is these catalogues, not a statement about the world.' + (unanswered.length ? ' ' + unanswered.map((c) => c.ref).join(', ') + ' did not answer.' : '') };
        }
        out[m] = { modality: m, periodApplied: periodApplied, found: list.length, scenes: list, collections: collections, collectionsNotAsked: Math.max(0, cands.length - use.length), none: none };
      }
      return {
        ok: true, asked: { bbox: box, time: o.time == null || o.time === '' ? null : String(o.time), modality: asked, maxCloud: isNum(o.maxCloud) ? o.maxCloud : null, perModality: perMod, limit: limit },
        result: out, catalogs: report, excluded: excluded, unclassified: unclassified, worldCompleteness: 'unproven',
        note: 'Dates, cloud and licences are what each catalogue STATES for the scene and collection, verbatim. «proprietary» is STAC for «the terms are at the licence link» — read them. `continues` means more pages were offered; a partial search does not establish absence.',
      };
    }

    /* ── acquire(): one reference, taken through every stage, each stage's outcome in the ledger ───────
       discovered (the catalogue states it) → access (the first kilobyte of the file is readable anonymously) → fetched
       (the window came back, all or part) → inspected (the values were looked at) → dataset. Reading is done by the
       door that already reads (D.readGrid / D.readFeatures → js/gis-atlas.js resolveRef); this function chooses WHAT to read
       from what the collection states and records WHERE it stopped. A stage that did not hold is returned as the state — not
       as an error — because «where it stopped» is the answer the planner asked for.
       Tile footprints plan the reads. Only the reader's served bounds and inspected data can clear a gap. */
    const sineLat = (lat) => Math.sin(lat * Math.PI / 180);
    const boxArea = (b) => (b.e - b.w) * (sineLat(b.n) - sineLat(b.s));
    async function acquire(ref, opts, collectionKnown) {
      const P = PIPE();
      if (!P) return refuse('bad-param', { param: 'pipeline', reason: 'no ledger was handed to this module' });
      const o = opts || {};
      const p = parseRef(ref);
      if (!p.ok) return p;
      const key = p.cat.id + '/' + p.collection;
      const box = asBox(o.bbox);
      if (!box) return refuse('bad-param', { param: 'bbox', reason: 'acquire reads a window; state it (bounds:[w,s,e,n])' });
      for (const k of ['maxGsd', 'minGsd', 'maxCloud']) if (o[k] != null && !(isNum(o[k]) && o[k] >= 0)) return refuse('bad-param', { param: k, value: o[k] });
      const collection = collectionKnown ? { ok: true } : await collectionOf(p, o.signal);
      if (!collection.ok) { P.recordFailure(key, 'discovered', collection.why, collection.detail); return { ok: true, ref: key, state: P.verdict(key), datasets: [], parts: [] }; }
      P.record(key, 'discovered', { status: 'ok', say: 'the catalogue states this collection (' + p.cat.id + ')' });

      /* features: the collection IS the dataset (OGC API – Features, or a STAC collection read as items) */
      if (p.cat.kind !== 'stac') {
        if (typeof D.readFeatures !== 'function') return refuse('bad-param', { param: 'readFeatures', reason: 'no reader was handed to this module' });
        const url = collectionUrl(p.cat, p.collection);
        const r = await D.readFeatures(url, { bounds: [box.w, box.s, box.e, box.n], limit: o.limit, time: o.time });
        const k = 'ogc:' + url;
        if (!P.verdict(k).known) { if (!r.ok) P.recordFailure(k, 'fetched', r.why, r.detail); }
        P.combine(key, [{ key: k, label: 'features' }]);
        return { ok: true, ref: key, state: P.verdict(key), datasets: r.ok && r.id ? [r.id] : [], datasetsCreated: r.ok && r.id && r.version != null ? [{ id: r.id, version: r.version }] : [], parts: [{ label: 'features', ref: k }] };
      }

      if (typeof D.readGrid !== 'function') return refuse('bad-param', { param: 'readGrid', reason: 'no reader was handed to this module' });
      if (!(isNum(o.width) && isNum(o.height) && o.width >= 1 && o.height >= 1)) return refuse('bad-param', { param: 'width/height', reason: 'a grid is read at a resolution the caller states' });
      if (!hasArea(box) && box.w <= box.e) return refuse('bad-param', { param: 'bbox', reason: 'a raster window needs positive area' });
      const sides = P.splitAtAntimeridian(box);
      const windows = sides ? [{ label: 'east of the date line', box: sides[0] }, { label: 'west of the date line', box: sides[1] }] : [{ label: 'window', box: box }];
      const spanTotal = windows.reduce((t, w) => t + (w.box.e - w.box.w), 0) || 1;
      const area = windows.reduce((sum, w) => sum + boxArea(w.box), 0);
      if (!(area > 0)) return refuse('bad-param', { param: 'bbox', reason: 'a raster window needs positive area' });
      const scope = key + '#read-' + (++acquisitionSeq);
      let partSeq = 0;
      const newPart = (label, window) => {
        const ledgerKey = scope + '/' + (++partSeq);
        P.record(ledgerKey, 'discovered', { status: 'ok', say: 'a part of ' + key });
        return { label, bounds: boundsOf(window), ref: ledgerKey, ledgerKey };
      };
      const readPart = async (label, window, item, asset, matches) => {
        const part = newPart(label, window);
        const url = asset.href, uk = 'url:' + url;
        const { ledgerKey } = part;
        Object.assign(part, { item: item.id, asset: asset.key, ref: uk, datetime: item.datetime, cloud: item.cloud, gsd: matches.gsd, sceneGsd: item.gsd, matches: { cloud: matches.cloud, resolution: matches.resolution, temporal: matches.temporal } });
        /* may an anonymous reader take it? asked of the file itself, in the host's words */
        const pr = await probeAsset(url, { signal: o.signal || null });
        if (!pr.ok) {
          P.recordFailure(ledgerKey, 'access', pr.why, pr.detail);
          return part;
        }
        const width = Math.max(1, Math.round(o.width * (window.e - window.w) / spanTotal));
        const height = Math.max(1, Math.round(o.height * (window.n - window.s) / (box.n - box.s)));
        const observation = { collection: key, item: item.id, asset: asset.key, datetime: item.datetime, cloud: item.cloud, gsd: matches.gsd };
        const r = await D.readGrid(url, { bounds: part.bounds, width, height, band: o.band, signal: o.signal || null, ledgerKey, observation });
        if (P.verdict(ledgerKey).stages.access.status === 'pending') {
          /* Existing readers can still write the URL's record. Snapshot that read under this window's key. */
          const stages = P.verdict(uk).stages;
          const sameRead = r?.ok && r.id ? stages.dataset.facts?.id === r.id : false;
          if (sameRead || !r?.ok) for (const stage of P.STAGES) {
            if (stage !== 'discovered' && stages[stage].status !== 'pending') P.record(ledgerKey, stage, stages[stage]);
          }
        }
        if (!r?.ok && P.verdict(ledgerKey).stages.fetched.status === 'pending') P.readFailed(ledgerKey, r?.why || 'no-window-read', r?.detail);
        const state = P.verdict(ledgerKey);
        const coverage = r?.ok && r.id ? D.data?.get?.(r.id)?.provenance?.coverage : null;
        const file = asBox(coverage?.served);
        /* A reader that reported the request fully fetched has attested the whole requested rectangle. A partial
           fetch needs its served bounds to locate the gap. A file read with no usable values covers no analysis area. */
        const usable = r?.ok && r.id && state.analysis !== 'not-ready';
        const served = usable && (file ? intersectBox(window, file) : state.stages.fetched.status === 'ok' ? window : null);
        if (usable) { part.id = r.id; part.version = r.version; }
        part.servedBounds = served && hasArea(served) ? boundsOf(served) : null;
        part.coverageFraction = part.servedBounds ? boxArea(served) / area : 0;
        part.validPixelFraction = state.stages.inspected.facts?.finiteFraction ?? null;
        part.readResolution = coverage?.resolution || null;
        return part;
      };
      const readWindow = async ({ label, box: window }) => {
        let gaps = [window];
        const parts = [];
        const first = itemRequest(p, { ...o, bbox: window, limit: 5 });
        let stop = null, droppedByCloud = 0, pages = 0, intersecting = 0, candidates = 0;
        const rejected = { time: 0, resolution: 0, assets: 0 };
        const fallback = [];
        const toCandidates = (item) => {
          const tile = asBox(item.bbox);
          const footprints = tile ? extentIntersections([tile], window).map(asBox).filter(hasArea) : [window];
          if (!footprints.length) return [];
          intersecting++;
          const assets = o.asset ? item.assets.filter((a) => a.key === o.asset) : item.assets.filter((a) => a.cog && /^https:/.test(a.href));
          if (!assets.length) { rejected.assets++; return []; }
          const statedTime = item.datetime?.split('/') || [];
          const temporal = temporalRelation(statedTime.length && Number.isFinite(ms(statedTime[0]))
            && (statedTime.length === 1 || statedTime[1] === '..' || Number.isFinite(ms(statedTime[1])))
            ? [[statedTime[0], statedTime.length === 1 ? statedTime[0] : statedTime[1]]] : [], o.time);
          if (temporal === 'outside' || (temporal === 'unstated' && o.strict)) { rejected.time++; return []; }
          const cloud = cloudMatch(item.cloud, o.maxCloud);
          return assets.flatMap((asset) => {
            const bandGsd = asset.bands?.[o.band?.index ?? 0]?.spatial_resolution;
            const rawGsd = bandGsd ?? asset.gsd;
            const gsd = isNum(rawGsd) && rawGsd > 0 ? rawGsd : null;
            const resolution = resolutionRelation(gsd == null ? null : { min: gsd, max: gsd }, o);
            if (resolution === 'misses' || (resolution === 'unstated' && o.strict)) { rejected.resolution++; return []; }
            return footprints.map((footprint) => ({ item, asset, footprint, matches: { cloud, resolution, temporal, gsd } }));
          });
        };
        const readCandidate = async (c) => {
          if (o.signal?.aborted || !gaps.some((gap) => { const hit = intersectBox(gap, c.footprint); return hit && hasArea(hit); })) return;
          const part = await readPart(label, c.footprint, c.item, c.asset, c.matches);
          parts.push(part);
          if (part.servedBounds) gaps = gaps.flatMap((g) => subtractBox(g, asBox(part.servedBounds)));
        };
        /* Prefer observations that verify the requested limits; an unknown value is an explicit fallback. */
        const unknowns = ({ matches }) => Object.values(matches).filter((m) => m === 'unstated').length;
        const triedParts = new Set();
        for await (const page of itemPages(o, first)) {
          if (!page.ok) { stop = page; break; }
          pages++;
          droppedByCloud += page.droppedByCloud;
          for (const c of page.items.flatMap(toCandidates)) {
            const partKey = JSON.stringify([c.item.id, c.asset.href, boundsOf(c.footprint)]);
            if (triedParts.has(partKey)) continue;
            triedParts.add(partKey);
            candidates++;
            if (unknowns(c)) fallback.push(c);
            else await readCandidate(c);
          }
          if (!gaps.length) break;
        }
        fallback.sort((a, b) => unknowns(a) - unknowns(b));
        for (const c of fallback) await readCandidate(c);
        if (o.signal?.aborted) stop = refuse('cancelled');
        if (gaps.length && (!parts.length || parts.some((p) => p.id))) {
          for (const gap of gaps) {
            const part = newPart(label, gap);
            if (stop) P.recordFailure(part.ledgerKey, 'fetched', stop.why, stop.detail);
            else {
              P.record(part.ledgerKey, 'access', { status: 'ok', say: 'the catalogue answered' });
              const why = candidates ? 'window-not-covered'
                : rejected.time || rejected.resolution ? 'no-item-meets-conditions'
                  : intersecting ? 'no-readable-asset' : droppedByCloud ? 'no-item-meets-cloud' : 'no-item-in-window';
              P.recordFailure(part.ledgerKey, 'fetched', why, { bounds: part.bounds, pages, droppedByCloud, rejected });
            }
            parts.push(part);
          }
        }
        return { parts, gaps };
      };
      const results = await Promise.all(windows.filter(({ box: w }) => hasArea(w)).map(readWindow));
      const parts = results.flatMap((r) => r.parts).map(({ ledgerKey, ...p }) => ({ ...p, state: P.verdict(ledgerKey) }));
      const missing = results.flatMap((r) => r.gaps);
      const datasets = parts.flatMap((p) => p.id ? [p.id] : []);
      const counted = datasets.length ? parts.filter((p) => p.id || p.ref === p.state.ref) : parts;
      const coverage = {
        completeness: missing.length ? (datasets.length ? 'partial' : 'none') : 'all',
        fraction: Math.max(0, Math.min(1, 1 - missing.reduce((sum, b) => sum + boxArea(b), 0) / area)),
        areaBasis: 'spherical', servedBounds: parts.flatMap((p) => p.servedBounds ? [p.servedBounds] : []), missingBounds: missing.map(boundsOf),
      };
      P.combine(key, counted.map((p) => ({ key: p.state.ref, label: p.label })));
      if (!missing.length && counted.some((p) => Object.values(p.matches || {}).includes('unstated'))) {
        const state = P.verdict(key);
        P.record(key, 'dataset', { ...state.stages.dataset, status: 'partial', say: 'some observations do not state a requested acquisition condition' });
      }
      const datasetsCreated = parts.filter((p) => p.id && p.version != null).map(({ id, version }) => ({ id, version }));
      return { ok: true, ref: key, state: P.verdict(key), datasets, datasetsCreated, parts, coverage, acrossAntimeridian: !!sides };
    }

    const API = {
      catalogs, add, discover, inspect, signHref, search, follow, items, scenes, probeAsset, acquire,
      publicUrl, resolveHref, refusals: () => REFUSALS.slice(), kinds: () => KINDS.slice(),
      /* what the Atlas door may ask of this module — one declaration, read by the door */
      actions: () => ['catalogs', 'add', 'discover', 'inspect', 'search', 'follow', 'items', 'scenes', 'acquire'],
      /* the pure parts, published so a check can drive them without a network */
      _spatialRelation: spatialRelation, _temporalRelation: temporalRelation, _timeSpan: timeSpan,
    };
    try { const w = WIN(); if (w) w.IntMapGisRemote = API; } catch (_) { }
    return API;
  })();
}
