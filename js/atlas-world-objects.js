/* ============================================================================
 *  IntMap · ATLAS — THE REAL-WORLD OBJECTS A SESSION HAS SURFACED, AND HOW THEY RELATE  (world-objects)
 * ----------------------------------------------------------------------------
 *  「この地震について」 — one earthquake, and what is tied to it: where it is, what stands within
 *  reach, which articles report it. Until now each capability that touched it answered in its own
 *  shape (a USGS feature, a pin record, a news item, a company row) and the answer ended there, so
 *  following from one to the next meant asking again from a bare name.
 *
 *  The SHAPE is `worldObject()` in js/atlas-geo-object.js (a place record plus type, ref, bounds, time,
 *  articleIds, evidenceIds, sources, links). This file is the other half:
 *
 *    ADAPTERS    fromUsgs / fromNewsEvent / fromNewsArticle / fromFacility / fromCity / fromVolcano /
 *                fromCompany / fromPlaceProfile — each one READS the record its capability already holds
 *                and writes it down as a world object. They compute nothing and decide nothing; a field
 *                the record does not state stays empty (no clock floor, no pseudo-coordinate).
 *    THE INDEX   `register()` keeps every object a capability surfaced this session, by `ref`, so a later
 *                «that earthquake» is a lookup, not a second geocode.
 *    RELATION    `relation(a, b)` says WHY two objects belong together, and `related(subject)` lists them.
 *
 *  ══ WHY THREE REASONS, AND NOT A SCORE ═════════════════════════════════════════════════════════
 *    linked       an edge one of them states (`links`), or an article / evidence id they share. A fact.
 *    near         both are placed and within `km`, or one lies inside the other's `bounds`.
 *    concurrent   both carry a time and their intervals are within `hours` of each other.
 *  Two things are related when they are `linked`, or `near` AND (`concurrent` OR one of them has no time —
 *  a power plant is not «at» any hour, so it is judged by place alone). ⚠ TIME ALONE IS NEVER A RELATION:
 *  two things that happened the same afternoon on opposite sides of the planet have nothing to do with
 *  each other. The reasons are RETURNED with each result, so Atlas and the card say why instead of
 *  presenting a ranking nobody can check.
 *
 *  ⚠ THE DEFAULTS ARE NOT NEW NUMBERS (.agents/rules/no-ad-hoc-hardcoding.md §4):
 *    km 300     observed: `research.impact`'s own default radius (js/atlas-cap-research.js, `kmR`), the
 *               distance within which it already draws facilities and cities around an event.
 *               Expires if that default changes — this one is the same number on purpose.
 *    hours 72   observed: the window the news store keeps and clusters over (docs/NEWS-EVENTS.md —
 *               «72 時間»), i.e. the longest an article and an event can both still be on the map.
 *  A caller that knows better passes its own; nothing here caps what Atlas may ask for.
 *
 *  Pure: no DOM, no globals, no network. `makeAtlasWorldObjects({geo})` takes the shape module as a
 *  dependency (the node checks hand it the real one); the module-level `worldObjects` is the ONE
 *  instance every capability and card shares — an ES-module singleton, deliberately not a `window`
 *  global (check:surface).
 * ==========================================================================*/
import { makeAtlasGeoObject } from './atlas-geo-object.js';

export const RELATED_DEFAULTS = { km: 300, hours: 72 };

export function makeAtlasWorldObjects(deps) {
  return (function () {
    deps = deps || {};
    var geo = deps.geo || makeAtlasGeoObject();
    var HOUR = 3600000;
    var EARTH_KM = 6371;   /* the mean radius js/atlas-console.js's `_havKm` also uses */

    var num = function (v) { return (v == null || v === '' || typeof v === 'boolean' || !isFinite(Number(v))) ? null : Number(v); };
    var str = function (v, n) { return String(v == null ? '' : v).slice(0, n || 200); };
    var arr = function (v) { return Array.isArray(v) ? v : []; };

    /** great-circle distance in km, or null when either end is not placed */
    function distanceKm(a, b) {
      if (!geo.placed(a) || !geo.placed(b)) return null;
      var r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
      var h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin(dLng / 2), 2);
      return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    function inside(pt, bounds) {
      return !!(geo.placed(pt) && bounds && pt.lng >= bounds[0] && pt.lng <= bounds[2] && pt.lat >= bounds[1] && pt.lat <= bounds[3]);
    }

    /** hours between two time intervals (0 when they overlap), or null when either has no time */
    function gapHours(a, b) {
      if (!a || !a.time || !b || !b.time) return null;
      var gap = Math.max(a.time.atMs - b.time.endMs, b.time.atMs - a.time.endMs, 0);
      return gap / HOUR;
    }

    /* A short, stable id from a name and a rounded position, for records whose source gives no id
       (an OSM pin carries a name and a point). Rounded to ~1 m so the same pin re-surfaced by a second
       run keeps its ref — and therefore keeps the edges that point at it. */
    function slug(name, lng, lat) {
      var n = String(name || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 48);
      return (n || 'unnamed') + '@' + (+lng).toFixed(5) + ',' + (+lat).toFixed(5);
    }

    /* ── ADAPTERS ───────────────────────────────────────────────────────────────────────────────── */

    /** a USGS GeoJSON feature (the feed `research.impact` already fetches) */
    function fromUsgs(f, opts) {
      if (!f || typeof f !== 'object') return null;
      var p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
      var id = str(f.id || p.code || '', 80); if (!id) return null;
      var mag = num(p.mag), depth = num(c[2]);
      return geo.worldObject({
        type: 'earthquake', kind: 'earthquake', id: id,
        name: str(p.place || 'earthquake', 160), lng: c[0], lat: c[1], provenance: 'feed_coordinate',
        atMs: num(p.time), facts: Object.assign({}, mag != null ? { magnitude: mag } : null, depth != null ? { depthKm: depth } : null, p.tsunami ? { tsunami: true } : null),
        sources: [{ name: 'USGS', url: /^https?:/i.test(String(p.url || '')) ? p.url : '' }],
        links: arr(opts && opts.links),
      });
    }

    /** a news item carrying a server-built `_event` (js/news-events.js) */
    function fromNewsEvent(it) {
      var e = it && it._event; if (!e) return null;
      var id = str(e.publicId || e.id || '', 80); if (!id) return null;
      var an = it.analysis || {};
      /* `analysis.loc` is only a position when the pin builder says so: it also holds a pseudo-coordinate
         for an item whose subject could not be resolved (mapped === false). A pseudo-coordinate is not where it happened. */
      var loc = (an.mapped !== false && Array.isArray(an.subjectLoc || an.loc)) ? (an.subjectLoc || an.loc) : null;
      var members = arr(e.members);
      return geo.worldObject({
        type: 'news_event', kind: str(e.category || 'news event', 60), id: id,
        name: str(e.titleShown || e.title || it.title || '', 160), lng: loc && loc[0], lat: loc && loc[1], provenance: 'event_location',
        country: '', summary: str(it.desc || '', 400),
        atMs: geo.timeMs(e.firstAt), endMs: geo.timeMs(e.lastAt),
        articleIds: members.map(function (m) { return m && m.id; }),
        sources: arr(e.outlets).slice(0, 6).map(function (n) { return { name: n }; }),
        facts: Object.assign({}, e.articleCount != null ? { articles: +e.articleCount } : null, e.sourceCount != null ? { outlets: +e.sourceCount } : null, e.place ? { place: String(e.place) } : null),
      });
    }

    /** a `news_events` database row (js/news-events.js `columns()`) — what the company-event join returns */
    function fromEventRow(row, opts) {
      if (!row || !(row.public_id || row.id)) return null;
      var has = isFinite(num(row.rep_lng)) && isFinite(num(row.rep_lat)) && num(row.rep_lng) != null && num(row.rep_lat) != null;
      return geo.worldObject({
        type: 'news_event', kind: str(row.primary_category || 'news event', 60), id: str(row.public_id || row.id, 80), name: str(row.representative_title, 160),
        lng: has ? row.rep_lng : null, lat: has ? row.rep_lat : null, provenance: 'event_location',
        atMs: geo.timeMs(row.first_published_at), endMs: geo.timeMs(row.last_article_at),
        articleIds: row.representative_article_id ? [row.representative_article_id] : [],
        facts: Object.assign({}, row.article_count != null ? { articles: +row.article_count } : null, row.independent_source_count != null ? { outlets: +row.independent_source_count } : null,
          row.rep_place_name_en ? { place: String(row.rep_place_name_en) } : null, opts && opts.facts),
        links: arr(opts && opts.links),
      });
    }

    /** a group `groupNewsEvents()` (js/news-cluster.js) built from articles: {g:[{it}], outlets, cx, cy, pname} */
    function fromNewsGroup(e) {
      var members = arr(e && e.g).map(function (x) { return x && x.it; }).filter(Boolean);
      if (!members.length || !isFinite(+e.cx) || !isFinite(+e.cy)) return null;
      var times = members.map(function (m) { return geo.timeMs(m.pubDate); }).filter(function (t) { return t != null; });
      var ids = members.map(function (m) { var a = fromNewsArticle(m); return a ? a.id : ''; });
      return geo.worldObject({
        type: 'news_event', kind: 'news event', id: slug(members[0].title, e.cx, e.cy), name: str(members[0].title, 160),
        lng: e.cx, lat: e.cy, provenance: 'event_location',
        atMs: times.length ? Math.min.apply(null, times) : null, endMs: times.length ? Math.max.apply(null, times) : null,
        articleIds: ids, sources: arr(e.outlets).slice(0, 6).map(function (n) { return { name: n }; }),
        facts: Object.assign({ articles: members.length, outlets: arr(e.outlets).length }, e.pname ? { place: String(e.pname) } : null),
      });
    }

    /** a loaded article (article-mode news item) */
    function fromNewsArticle(it) {
      if (!it || it._event || !it.title) return null;
      var an = it.analysis || {};
      var loc = (an.mapped !== false && Array.isArray(an.loc)) ? an.loc : null;
      var url = /^https?:/i.test(String(it.link || '')) ? String(it.link) : '';
      var id = str(it.id || url, 120); if (!id) return null;
      return geo.worldObject({
        type: 'article', kind: 'article', id: id, name: str(it.title, 160),
        lng: loc && loc[0], lat: loc && loc[1], provenance: 'event_location', summary: str(it.desc || '', 400),
        atMs: geo.timeMs(it.pubDate), articleIds: [id],
        sources: [{ name: str(it.publisher || it.source || '', 80), url: url }],
      });
    }

    /** an OpenStreetMap facility pin as `research.impact` builds it: {lng,lat,name,_k,_d} */
    function fromFacility(p, opts) {
      if (!p || !isFinite(+p.lng) || !isFinite(+p.lat)) return null;
      var kind = str(p._k || p.kind || 'facility', 60), name = str(p.name || kind, 160);
      return geo.worldObject({
        type: 'facility', kind: kind, id: str(p.id || slug(name, p.lng, p.lat), 120), name: name,
        lng: p.lng, lat: p.lat, provenance: 'feed_coordinate',
        sources: [{ name: 'OpenStreetMap', licence: 'ODbL' }],
        links: arr(opts && opts.links), facts: p._d != null ? { distanceKm: Math.round(+p._d) } : null,
      });
    }

    /** an OSM city/town with a population tag */
    function fromCity(c, opts) {
      if (!c || !isFinite(+c.lng) || !isFinite(+c.lat)) return null;
      var name = str(c.name || '', 160);
      return geo.worldObject({
        type: 'city', kind: 'city', id: str(c.id || slug(name, c.lng, c.lat), 120), name: name,
        lng: c.lng, lat: c.lat, provenance: 'feed_coordinate',
        sources: [{ name: 'OpenStreetMap', licence: 'ODbL' }],
        links: arr(opts && opts.links), facts: Object.assign({}, c.pop != null ? { population: +c.pop } : null, c._d != null ? { distanceKm: Math.round(+c._d) } : null),
      });
    }

    /** `IntMapVolcano.record(vn)` — js/volcano-intel.js */
    function fromVolcano(rec) {
      if (!rec || rec.v == null || !Array.isArray(rec.lngLat)) return null;
      var st = rec.status || {};
      return geo.worldObject({
        type: 'volcano', kind: str(rec.type || 'volcano', 60), id: 'gvp-' + rec.v, name: str(rec.name, 160),
        country: str(rec.country || '', 90), lng: rec.lngLat[0], lat: rec.lngLat[1], provenance: 'feed_coordinate',
        summary: str(rec.summary || '', 400),
        /* the last eruption is a YEAR — kept as a fact, not turned into a timestamp the catalogue never gave */
        facts: Object.assign({}, rec.elevation != null ? { elevationM: +rec.elevation } : null, rec.lastEruption != null ? { lastEruptionYear: +rec.lastEruption } : null,
          rec.maxVei != null ? { maxVei: +rec.maxVei } : null, rec.eruptions != null ? { eruptions: +rec.eruptions } : null, st.label ? { alertLevel: str(st.label, 80) } : null),
        sources: [{ name: 'Smithsonian GVP' }].concat(st.source ? [{ name: str(st.source, 80) }] : []),
      });
    }

    /** a company-atlas row and, when its profile is loaded, the headquarters site */
    function fromCompany(row, hq) {
      if (!row || !row.id) return null;
      var has = hq && isFinite(+hq.lon) && isFinite(+hq.lat);
      return geo.worldObject({
        type: 'company', kind: 'company', id: str(row.id, 80), name: str(row.n || row.name || row.id, 160),
        country: str(row.cc || row.country || '', 90), lng: has ? hq.lon : null, lat: has ? hq.lat : null, provenance: 'feed_coordinate',
        sources: [{ name: 'IntMap company atlas' }],
      });
    }

    /** a place the reader or Atlas NAMED: {lng,lat,name}. `provenance` only when the caller knows it — undeclared stays the centroid class. */
    function fromPlace(p, provenance) {
      if (!p || !isFinite(+p.lng) || !isFinite(+p.lat)) return null;
      var name = str(p.name || '', 160);
      return geo.worldObject({ type: 'place', kind: str(p.kind || 'place', 60), id: slug(name, p.lng, p.lat), name: name, country: str(p.country || '', 90),
        lng: p.lng, lat: p.lat, provenance: provenance, bounds: p.bounds });
    }

    /** the record `placeProfile()` returns (js/place-dossier.js) */
    function fromPlaceProfile(prof, provenance) {
      if (!prof || !prof.at || !isFinite(+prof.at.lng) || !isFinite(+prof.at.lat)) return null;
      var pl = prof.place, name = (pl && pl.status === 'ok' && pl.name) || prof.asked || prof.at.text || '';
      var c = prof.country && prof.country.status === 'ok' ? prof.country : null;
      return geo.worldObject({
        type: 'place_profile', kind: 'point', id: slug('', prof.at.lng, prof.at.lat), name: str(name, 160),
        country: c ? c.name : '', lng: prof.at.lng, lat: prof.at.lat,
        /* the caller states how the point was known (a click, a gazetteer hit); undeclared stays the weakest point class */
        provenance: provenance,
        sources: [pl && pl.source ? { name: pl.source.publisher, licence: pl.source.licence } : null].filter(Boolean),
      });
    }

    /* ── RELATION ───────────────────────────────────────────────────────────────────────────────── */

    /**
     * relation(a, b, opts) — null when the two are unrelated, else { why:[…], distanceKm, gapHours }.
     * `opts.km` / `opts.hours` replace the defaults; a non-finite value falls back to the default
     * (a NaN radius would otherwise relate nothing, silently).
     */
    function relation(a, b, opts) {
      if (!a || !b || (a.ref && a.ref === b.ref)) return null;
      opts = opts || {};
      var km = (num(opts.km) != null && opts.km >= 0) ? +opts.km : RELATED_DEFAULTS.km;
      var hours = (num(opts.hours) != null && opts.hours >= 0) ? +opts.hours : RELATED_DEFAULTS.hours;
      var why = [];
      var linked = arr(a.links).some(function (l) { return l.ref === b.ref; }) || arr(b.links).some(function (l) { return l.ref === a.ref; });
      var shareIds = function (x, y) { return arr(x).some(function (i) { return arr(y).indexOf(i) >= 0; }); };
      if (linked || shareIds(a.articleIds, b.articleIds) || shareIds(a.evidenceIds, b.evidenceIds)) why.push('linked');
      var d = distanceKm(a, b);
      var near = (d != null && d <= km) || inside(a, b.bounds) || inside(b, a.bounds);
      var gap = gapHours(a, b);
      var concurrent = gap != null && gap <= hours;
      if (near) why.push('near');
      if (concurrent) why.push('concurrent');
      var timeless = !a.time || !b.time;
      var related = why.indexOf('linked') >= 0 || (near && (concurrent || timeless));
      return related ? { why: why, distanceKm: d == null ? null : Math.round(d * 10) / 10, gapHours: gap == null ? null : Math.round(gap * 10) / 10 } : null;
    }

    /* ── THE INDEX ──────────────────────────────────────────────────────────────────────────────── */

    var byRef = Object.create(null);

    function merge(old, nu) {
      /* the stronger provenance wins (a feed coordinate is not replaced by a centroid); ids and edges accumulate */
      var keep = geo.rank(nu) < geo.rank(old) ? nu : old, other = keep === nu ? old : nu;
      var out = Object.assign({}, other, keep);
      var union = function (x, y, key) { var seen = Object.create(null), res = []; arr(x).concat(arr(y)).forEach(function (v) { var k = key ? key(v) : v; if (!seen[k]) { seen[k] = 1; res.push(v); } }); return res; };
      out.articleIds = union(old.articleIds, nu.articleIds);
      out.evidenceIds = union(old.evidenceIds, nu.evidenceIds);
      out.links = union(old.links, nu.links, function (l) { return l.rel + '>' + l.ref; });
      out.sources = union(old.sources, nu.sources, function (s) { return s.name + '|' + s.url; });
      out.facts = Object.assign({}, old.facts, nu.facts);
      out.time = nu.time || old.time; out.bounds = nu.bounds || old.bounds;
      return out;
    }

    /** register(objects) — returns the objects as stored (merged with what the session already held). */
    function register(list) {
      var out = [];
      arr(Array.isArray(list) ? list : [list]).forEach(function (o) {
        if (!geo.isWorldObject(o) || !o.ref) return;
        byRef[o.ref] = byRef[o.ref] ? merge(byRef[o.ref], o) : o;
        out.push(byRef[o.ref]);
      });
      return out;
    }

    function all() { return Object.keys(byRef).map(function (k) { return byRef[k]; }); }
    function clear() { byRef = Object.create(null); }

    /**
     * find(query) — a ref, an id, or a name, in that order. ⚠ A NAME MATCHES BY THE SAME RULE the rest of
     * Atlas uses for «the same words» (geo.normName), exact first and then containment, so «Kahramanmaraş»
     * finds «14 km SSW of Kahramanmaraş» — and an ambiguous name returns the MOST RECENT object of the
     * strongest provenance rather than an arbitrary first one. `opts.type` narrows to one type.
     */
    function find(query, opts) {
      var q = str(query, 160).trim(); if (!q) return null;
      var type = opts && opts.type;
      var pool = all().filter(function (o) { return !type || o.type === type; });
      var hit = byRef[q] && (!type || byRef[q].type === type) ? byRef[q] : null;
      if (hit) return hit;
      hit = pool.filter(function (o) { return o.id === q; })[0];
      if (hit) return hit;
      var n = geo.normName(q); if (!n) return null;
      var exact = pool.filter(function (o) { return geo.normName(o.name) === n; });
      var cand = exact.length ? exact : (n.length >= 3 ? pool.filter(function (o) { var m = geo.normName(o.name); return m.indexOf(n) >= 0 || n.indexOf(m) >= 0 && m.length >= 3; }) : []);
      cand.sort(function (x, y) { return (geo.rank(x) - geo.rank(y)) || (((y.time && y.time.atMs) || 0) - ((x.time && x.time.atMs) || 0)); });
      return cand[0] || null;
    }

    /**
     * related(subject, opts) — everything the session knows that belongs with `subject`.
     *   opts.km, opts.hours   the radius and window (defaults above)
     *   opts.types            narrow the RESULT to these types
     *   opts.extra            more candidates that are not in the index (the loaded news, a live feed) —
     *                         they are judged by the same rule and are NOT stored
     * Ordered: linked first, then nearer, then closer in time. ⚠ NO LIMIT IS APPLIED HERE (CONSTITUTION §5):
     * `opts.limit` is the caller's, for a card that has room for n rows — and the total is always returned.
     */
    function related(subject, opts) {
      opts = opts || {};
      var s = typeof subject === 'string' ? find(subject) : subject;
      if (!s || !geo.isWorldObject(s)) return { subject: null, items: [], total: 0 };
      var types = arr(opts.types).map(String);
      var seen = Object.create(null); seen[s.ref] = 1;
      var pool = all().concat(arr(opts.extra).filter(function (o) { return geo.isWorldObject(o); }));
      var items = [];
      pool.forEach(function (o) {
        if (o.ref && seen[o.ref]) return; if (o.ref) seen[o.ref] = 1;
        if (types.length && types.indexOf(o.type) < 0) return;
        var r = relation(s, o, opts); if (!r) return;
        items.push({ object: o, why: r.why, distanceKm: r.distanceKm, gapHours: r.gapHours });
      });
      var big = 1e12;
      items.sort(function (x, y) {
        return ((y.why.indexOf('linked') >= 0) - (x.why.indexOf('linked') >= 0))
          || ((x.distanceKm == null ? big : x.distanceKm) - (y.distanceKm == null ? big : y.distanceKm))
          || ((x.gapHours == null ? big : x.gapHours) - (y.gapHours == null ? big : y.gapHours));
      });
      var total = items.length, lim = num(opts.limit);
      return { subject: s, items: (lim != null && lim >= 0) ? items.slice(0, Math.floor(lim)) : items, total: total };
    }

    /** The candidates the loaded news contributes: events when the feed is in event mode, articles otherwise. */
    function fromLoadedNews(items) {
      return arr(items).map(function (it) { return it && it._event ? fromNewsEvent(it) : fromNewsArticle(it); }).filter(Boolean);
    }

    /**
     * relatedGroups(res, {L, perType}) — the rows of a `related()` result as DATA, grouped by type, each with WHY it belongs
     * ('near + same time'). The ONE grouping and the ONE wording: the Atlas answer (research.related) renders it as a
     * string, the card's «Related» section through the markup tag — neither can describe the same result differently.
     * `perType` is how many rows a group shows before «more» (a card's room); nothing is dropped from `count`.
     */
    function relatedGroups(res, o) {
      o = o || {}; var L = o.L || function (en) { return en; }, per = o.perType || 5;
      var WHY = { linked: L('linked', '直接の結び付き'), near: L('near', '近い'), concurrent: L('around the same time', '同時期') };
      var by = {}, order = [];
      arr(res && res.items).forEach(function (x) { var t = x.object.type; if (!by[t]) { by[t] = []; order.push(t); } by[t].push(x); });
      return order.map(function (t) {
        return { type: t, count: by[t].length, more: Math.max(0, by[t].length - per), items: by[t].slice(0, per).map(function (x) {
          return { name: x.object.name || x.object.ref, ref: x.object.ref, why: x.why.map(function (w) { return WHY[w] || w; }).join(' + '),
            distanceKm: x.distanceKm == null ? null : Math.round(x.distanceKm), gapHours: x.gapHours == null ? null : Math.round(x.gapHours) };
        }) };
      });
    }

    /** relatedGroups() as one escaped string — for a reply, where the caller supplies the escaper */
    function relatedHtml(res, o) {
      o = o || {}; var esc = o.esc || function (x) { return String(x); };
      var groups = relatedGroups(res, o), h = '';
      groups.forEach(function (g) {
        h += '<div style="font-size:12px;margin:5px 0 1px;"><b>' + esc(g.type) + '</b>: ' + g.count + '</div>';
        g.items.forEach(function (x) {
          h += '<div style="font-size:11.5px;line-height:1.5;padding-left:8px;">' + esc(x.name) + ' <span style="color:var(--text-muted);">'
            + esc(x.why + (x.distanceKm != null ? ' · ' + x.distanceKm + ' km' : '') + (x.gapHours != null ? ' · ' + x.gapHours + ' h' : '')) + '</span></div>';
        });
        if (g.more) h += '<div style="font-size:10.5px;color:var(--text-muted);padding-left:8px;">… +' + g.more + '</div>';
      });
      var by = {}; groups.forEach(function (g) { by[g.type] = g; });
      return { html: h, byType: by };
    }

    /** A compact, serialisable view for a tool result Atlas reads (no prose, no HTML). */
    function brief(o) {
      if (!o) return null;
      return { ref: o.ref, type: o.type, kind: o.kind, name: o.name, country: o.country || undefined,
        lng: o.lng, lat: o.lat, provenance: o.provenance, bounds: o.bounds || undefined,
        at: o.time ? new Date(o.time.atMs).toISOString() : undefined, endAt: (o.time && o.time.endMs !== o.time.atMs) ? new Date(o.time.endMs).toISOString() : undefined,
        articleIds: o.articleIds.length ? o.articleIds : undefined, evidenceIds: o.evidenceIds.length ? o.evidenceIds : undefined,
        sources: o.sources.length ? o.sources : undefined, links: o.links.length ? o.links : undefined,
        facts: Object.keys(o.facts || {}).length ? o.facts : undefined };
    }

    return { RELATED_DEFAULTS: RELATED_DEFAULTS, all: all, brief: brief, clear: clear, distanceKm: distanceKm, find: find,
      fromCity: fromCity, fromCompany: fromCompany, fromFacility: fromFacility, fromLoadedNews: fromLoadedNews, fromNewsArticle: fromNewsArticle,
      fromEventRow: fromEventRow, fromNewsEvent: fromNewsEvent, fromNewsGroup: fromNewsGroup, fromPlace: fromPlace, fromPlaceProfile: fromPlaceProfile, fromUsgs: fromUsgs, fromVolcano: fromVolcano,
      gapHours: gapHours, register: register, relatedGroups: relatedGroups, relatedHtml: relatedHtml, related: related, relation: relation };
  })();
}

/** the ONE instance every capability and card shares — see the header on why it is a module singleton */
export const worldObjects = makeAtlasWorldObjects();
