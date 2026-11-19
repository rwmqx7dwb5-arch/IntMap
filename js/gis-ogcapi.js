/* ============================================================================
 *  IntMap · FEATURES AT A URL — window.IntMapGisOgcApi   (js/gis-ogcapi.js)
 * ----------------------------------------------------------------------------
 *  The vector twin of js/gis-cog.js. Until this file a vector dataset could arrive only from a file
 *  the reader held or from a layer the map already drew; a government's or an open-data portal's
 *  feature service — which is what OGC API – Features (OGC 17-069r4, the successor to WFS) is —
 *  could be looked at in a browser and not analysed.
 *
 *  ⚠ WHAT IT DOES: GET <collection>/items?f=json&bbox=…&limit=…, follow the server's own
 *  `rel=next` link, and hand back GeoJSON features plus a `coverage` that says whether the server
 *  said anything more follows. It registers nothing (js/gis-atlas.js does).
 *  ⚠ NO CAP IS INVENTED HERE. Without a stated `limit` one page is read — the server's own page size —
 *  and the next link is handed back as `next`; with one, pages are read until that many arrived (the
 *  last page may overshoot, which is reported rather than cut: cutting would make `next` skip rows).
 *  ⚠ `completeness: 'all'` IS THE SERVER'S STATEMENT, NOT A GUESS: no next link on the last page
 *  (and, when the server counts, numberMatched equal to what arrived). Anything else is 'partial'
 *  with a reason, and the cursor — which is the next link itself — travels as `next`.
 *  ⚠ A CURSOR IS A URL THE CALLER SENT BACK, AND A CALLER MAY BE WRONG OR HOSTILE: it is followed only
 *  when it is https and on the SAME ORIGIN as the collection it belongs to, so a cursor cannot be a
 *  way to make the page fetch an address the reader never named. A server whose next link repeats
 *  itself is stopped (`ogc-next-loop`); a next link on another origin is refused (`ogc-next-elsewhere`).
 *  ⚠ TIME: `datetime` is part of the Core of OGC API – Features (Part 1), so `time` is sent on
 *  `/items` as it is on a STAC search.
 *  ⚠ ATTRIBUTE CONDITIONS (`filter`, CQL2 text) ARE SENT ONLY WHEN THE SERVER STATES THEM: the API's
 *  /conformance is read first, and a server that does not list a Features-filter class and CQL2 text is
 *  REFUSED BY NAME (`ogc-filter-not-declared`) — a condition the server silently ignores comes back as a
 *  complete-looking answer to a different question. Column selection is still not sent (named by
 *  js/gis-atlas.js).
 *  ⚠ STAC `method:'POST'`: the search body carries bbox / datetime / limit / collections / ids /
 *  intersects / query / filter. A POST next link is followed inside the call (its own `body`, merged when
 *  the server says `merge`), but it cannot be a cursor — a cursor is a URL — so a POST read that stops with
 *  more to come says `post-next-not-resumable` and `next` is null. Signed assets (a token the reader
 *  holds for a provider) are NOT handled: that needs a credential this page does not keep.
 *  ⚠ CRS: the default of the standard is CRS84 (lon/lat), which is what the dataset is registered as.
 * ==========================================================================*/

export function makeGisOgcApi() {
  const bad = (why, detail) => (detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail });
  const isNum = (v) => typeof v === 'number' && isFinite(v);

  function httpsUrl(s) {
    let u;
    try { u = new URL(String(s)); } catch (_) { return bad('url-invalid', { url: String(s).slice(0, 200) }); }
    if (u.protocol !== 'https:') return bad('url-not-https', { protocol: u.protocol });
    if (u.username || u.password) return bad('url-has-credentials', { host: u.host });
    return { ok: true, url: u };
  }

  /* the collection's /items address from whatever the caller gave: …/collections/x or …/collections/x/items */
  function itemsUrl(u) {
    const x = new URL(u.href);
    x.hash = '';
    x.pathname = x.pathname.replace(/\/+$/, '');
    if (!/\/items$/.test(x.pathname)) x.pathname += '/items';
    return x;
  }

  /* conformance classes that state "this server evaluates a CQL2 text filter on /items" (Features Part 3
     names the class features-filter / filter; CQL2 itself names cql2-text). Both must be stated. */
  const hasClass = (list, re) => list.some((c) => typeof c === 'string' && re.test(c));
  async function filterDeclared(items, o) {
    const root = new URL(items.href);
    root.search = '';
    const at = root.pathname.indexOf('/collections/');
    root.pathname = (at >= 0 ? root.pathname.slice(0, at) : root.pathname.replace(/\/[^/]*$/, '')) + '/conformance';
    const doFetch = (typeof o.fetch === 'function') ? o.fetch : ((typeof fetch === 'function') ? fetch : null);
    if (!doFetch) return false;
    try {
      const res = await doFetch(root.href, { headers: { Accept: 'application/json' } });
      if (!res || res.status < 200 || res.status > 299) return false;
      const j = await res.json();
      const list = (j && Array.isArray(j.conformsTo)) ? j.conformsTo : [];
      return hasClass(list, /ogcapi-features-3\/[^/]+\/conf\/(features-)?filter$/) && hasClass(list, /cql2\/[^/]+\/conf\/cql2-text$/);
    } catch (_) { return false; }
  }

  async function getJson(href, o, post) {
    const doFetch = (typeof o.fetch === 'function') ? o.fetch : ((typeof fetch === 'function') ? fetch : null);
    if (!doFetch) return bad('fetch-failed', { url: href, reason: 'no-fetch-in-this-runtime' });
    const init = { headers: { Accept: 'application/geo+json, application/json;q=0.9' } };
    if (post) {
      init.method = 'POST';
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(post);
    }
    if (o.signal) init.signal = o.signal;
    let res;
    try { res = await doFetch(href, init); }
    catch (e) { return bad('fetch-failed', { url: href, reason: String((e && e.message) || e) }); }
    if (!res || res.status < 200 || res.status > 299) return bad('http-status', { url: href, status: res ? res.status : null });
    let j;
    try { j = await res.json(); } catch (_) { return bad('ogc-not-json', { url: href }); }
    if (!j || typeof j !== 'object' || j.type !== 'FeatureCollection' || !Array.isArray(j.features)) {
      return bad('ogc-not-features', { url: href, got: (j && typeof j === 'object' && j.type) ? String(j.type) : typeof j });
    }
    return { ok: true, json: j };
  }

  const nextLink = (j) => (Array.isArray(j.links) ? j.links.find((x) => x && x.rel === 'next' && typeof x.href === 'string') : null) || null;

  /* readItems(url, {bounds?:[w,s,e,n], limit?:int, cursor?:string, fetch?, signal?})
       → { ok:true, features, next, coverage } | { ok:false, why, detail } */
  async function readItems(url, o) {
    const q = o || {};
    const base = httpsUrl(url);
    if (!base.ok) return base;
    /* `search`: a STAC item-search endpoint (…/search), which is addressed as it stands and takes `datetime` */
    const items = q.search ? new URL(base.url.href) : itemsUrl(base.url);
    if (q.limit != null && !(Number.isInteger(q.limit) && q.limit > 0)) return bad('bad-param', { param: 'limit', value: q.limit });
    const b = q.bounds;
    if (b != null && (!Array.isArray(b) || b.length < 4 || !b.slice(0, 4).every(isNum) || !(b[2] > b[0]) || !(b[3] > b[1]))) return bad('bad-param', { param: 'bounds', value: b });

    const post = !!q.search && q.method === 'POST';
    if (q.method != null && q.method !== 'GET' && q.method !== 'POST') return bad('bad-param', { param: 'method', value: q.method });
    if (q.method === 'POST' && !q.search) return bad('bad-param', { param: 'method', value: 'POST', reason: 'post-is-for-stac-search' });
    if (q.filter != null && (typeof q.filter !== 'string' || !q.filter.trim())) return bad('bad-param', { param: 'filter', value: q.filter });
    if (post && q.cursor != null && q.cursor !== '') return bad('cursor-not-recognised', { reason: 'post-search-has-no-url-cursor' });
    const hasTime = q.time != null && q.time !== '';
    let body = null;
    let href;
    if (q.cursor != null && q.cursor !== '') {
      const c = httpsUrl(q.cursor);
      if (!c.ok || c.url.origin !== items.origin) return bad('cursor-not-recognised', { reason: 'cursor-of-another-origin' });
      href = c.url.href;
    } else {
      if (!q.search) items.searchParams.set('f', 'json');
      if (b) items.searchParams.set('bbox', b.slice(0, 4).join(','));
      if (q.limit != null) items.searchParams.set('limit', String(q.limit));
      if (post) {
        body = {};
        if (b) body.bbox = b.slice(0, 4);
        if (q.limit != null) body.limit = q.limit;
        if (hasTime) body.datetime = String(q.time);
        if (Array.isArray(q.collections)) body.collections = q.collections.map(String);
        if (Array.isArray(q.ids)) body.ids = q.ids.map(String);
        if (q.intersects && typeof q.intersects === 'object') body.intersects = q.intersects;
        if (q.query && typeof q.query === 'object') body.query = q.query;
        if (q.filter != null) { body.filter = q.filter; body['filter-lang'] = 'cql2-text'; }
        href = items.href;
      } else {
        if (hasTime) items.searchParams.set('datetime', String(q.time));
        if (q.filter != null) {
          if (!q.search && !(await filterDeclared(items, q))) return bad('ogc-filter-not-declared', { url: items.href, needs: 'features-filter + cql2-text in /conformance' });
          items.searchParams.set('filter', q.filter);
          items.searchParams.set('filter-lang', 'cql2-text');
        }
        href = items.href;
      }
    }

    const features = [];
    const seen = new Set();
    let pages = 0, matched = null, next = null;
    let postNext = false;
    for (;;) {
      const key = href + (body ? '#' + JSON.stringify(body) : '');
      if (seen.has(key)) return bad('ogc-next-loop', { url: href, pages: pages });
      seen.add(key);
      const r = await getJson(href, q, body);
      if (!r.ok) return r;
      pages++;
      for (const f of r.json.features) features.push(f);
      if (isNum(r.json.numberMatched)) matched = r.json.numberMatched;
      const nl = nextLink(r.json);
      next = nl ? nl.href : null;
      if (next) {
        const nu = httpsUrl(next);
        if (!nu.ok || nu.url.origin !== items.origin) return bad('ogc-next-elsewhere', { next: String(next).slice(0, 200), expected: items.origin });
        next = nu.url.href;
      }
      const nextIsPost = !!(post && nl && String(nl.method || '').toUpperCase() === 'POST');
      /* a limit was stated: keep reading until that many have arrived; none stated: one page */
      if (!next || q.limit == null || features.length >= q.limit) {
        /* a POST next link carries its own body, so it cannot travel as a URL cursor */
        if (next && nextIsPost) postNext = true;
        break;
      }
      if (nextIsPost) {
        body = (nl.merge && nl.body && typeof nl.body === 'object') ? Object.assign({}, body, nl.body) : ((nl.body && typeof nl.body === 'object') ? nl.body : body);
      } else body = null;
      href = next;
    }

    /* a STAC item keeps what a reader wants OUTSIDE `properties` — its id, its collection and above all
       its ASSETS (the files). Put them where a dataset's columns are, one `asset:<key>` column per file, so
       the address of a COG is a value the next step can read (`url:` takes it) and not something lost on
       the way in. Nothing is invented: an asset without an href is skipped. */
    if (q.search) {
      for (const f of features) {
        if (!f || typeof f !== 'object') continue;
        const pr = Object.assign({}, f.properties || {});
        if (f.id != null) pr.stac_id = String(f.id);
        if (f.collection != null) pr.stac_collection = String(f.collection);
        const as = (f.assets && typeof f.assets === 'object') ? f.assets : {};
        for (const k of Object.keys(as)) if (as[k] && typeof as[k].href === 'string') pr['asset:' + k] = as[k].href;
        f.properties = pr;
      }
    }

    const more = next != null;
    if (postNext) next = null;
    /* numberMatched counts the WHOLE result, so it is comparable with what arrived only when this call
       started at the beginning — a page reached by a cursor is a part, and is not 'short' for being one */
    const fromStart = !(q.cursor != null && q.cursor !== '');
    const short = (fromStart && !more && matched != null && matched !== features.length);
    const reasons = [];
    if (more) reasons.push('server-has-a-next-page');
    if (postNext) reasons.push('post-next-not-resumable');
    if (short) reasons.push('server-counts-more-than-arrived');
    /* ⚠ A PAGE REACHED BY A CURSOR IS A PART OF THE RESULT EVEN WHEN IT IS THE LAST: the dataset holds this
       page, not the collection, so it is never 'all' — `continues:false` is what says nothing follows it */
    if (!fromStart) reasons.push('page-reached-by-cursor');
    return {
      ok: true, features: features, next: more ? next : null,
      coverage: {
        completeness: reasons.length ? 'partial' : 'all',
        reason: reasons.length ? reasons.join(',') : 'server-stated-no-next-page',
        requested: b ? b.slice(0, 4) : null, served: b ? b.slice(0, 4) : null,
        count: features.length, numberMatched: matched, pages: pages, continues: more,
        asOf: null,
      },
    };
  }

  /* the acquisition fields this source can honour — the others are refused by name by the caller */
  const supports = ['bounds', 'limit', 'cursor', 'time'];
  const supportsSearch = supports.slice();
  return { readItems, supports, supportsSearch };
}
