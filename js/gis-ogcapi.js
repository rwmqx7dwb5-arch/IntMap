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
 *  ⚠ NOT SUPPORTED, AND SAID SO BY NAME (js/gis-atlas.js): attribute conditions, column selection and
 *  time are not sent — a condition the server silently ignores comes back as a complete-looking
 *  answer to a different question. 消せる条件: OGC API – Features Part 3 (CQL2) `filter` and
 *  `datetime`, once a server that states them in its conformance classes is the thing being read.
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

  async function getJson(href, o) {
    const doFetch = (typeof o.fetch === 'function') ? o.fetch : ((typeof fetch === 'function') ? fetch : null);
    if (!doFetch) return bad('fetch-failed', { url: href, reason: 'no-fetch-in-this-runtime' });
    const init = { headers: { Accept: 'application/geo+json, application/json;q=0.9' } };
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

  const nextOf = (j) => {
    const l = Array.isArray(j.links) ? j.links.find((x) => x && x.rel === 'next' && typeof x.href === 'string') : null;
    return l ? l.href : null;
  };

  /* readItems(url, {bounds?:[w,s,e,n], limit?:int, cursor?:string, fetch?, signal?})
       → { ok:true, features, next, coverage } | { ok:false, why, detail } */
  async function readItems(url, o) {
    const q = o || {};
    const base = httpsUrl(url);
    if (!base.ok) return base;
    const items = itemsUrl(base.url);
    if (q.limit != null && !(Number.isInteger(q.limit) && q.limit > 0)) return bad('bad-param', { param: 'limit', value: q.limit });
    const b = q.bounds;
    if (b != null && (!Array.isArray(b) || b.length < 4 || !b.slice(0, 4).every(isNum) || !(b[2] > b[0]) || !(b[3] > b[1]))) return bad('bad-param', { param: 'bounds', value: b });

    let href;
    if (q.cursor != null && q.cursor !== '') {
      const c = httpsUrl(q.cursor);
      if (!c.ok || c.url.origin !== items.origin) return bad('cursor-not-recognised', { reason: 'cursor-of-another-origin' });
      href = c.url.href;
    } else {
      items.searchParams.set('f', 'json');
      if (b) items.searchParams.set('bbox', b.slice(0, 4).join(','));
      if (q.limit != null) items.searchParams.set('limit', String(q.limit));
      href = items.href;
    }

    const features = [];
    const seen = new Set();
    let pages = 0, matched = null, next = null;
    for (;;) {
      if (seen.has(href)) return bad('ogc-next-loop', { url: href, pages: pages });
      seen.add(href);
      const r = await getJson(href, q);
      if (!r.ok) return r;
      pages++;
      for (const f of r.json.features) features.push(f);
      if (isNum(r.json.numberMatched)) matched = r.json.numberMatched;
      next = nextOf(r.json);
      if (next) {
        const nu = httpsUrl(next);
        if (!nu.ok || nu.url.origin !== items.origin) return bad('ogc-next-elsewhere', { next: String(next).slice(0, 200), expected: items.origin });
        next = nu.url.href;
      }
      /* a limit was stated: keep reading until that many have arrived; none stated: one page */
      if (!next || q.limit == null || features.length >= q.limit) break;
      href = next;
    }

    const more = next != null;
    /* numberMatched counts the WHOLE result, so it is comparable with what arrived only when this call
       started at the beginning — a page reached by a cursor is a part, and is not 'short' for being one */
    const fromStart = !(q.cursor != null && q.cursor !== '');
    const short = (fromStart && !more && matched != null && matched !== features.length);
    const reasons = [];
    if (more) reasons.push('server-has-a-next-page');
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
  const supports = ['bounds', 'limit', 'cursor'];
  return { readItems, supports };
}
