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
import { linkState, relatedState, checkClaims, stateLabel } from './relation-evidence.js';   /* confirmed / inferred / unconfirmed, and what backs each */
import { haversineKm } from '../supabase/functions/_shared/great-circle.js';   /* the one great-circle distance (page and server) */

export const RELATED_DEFAULTS = { km: 300, hours: 72 };

export function makeAtlasWorldObjects(deps) {
  return (function () {
    deps = deps || {};
    var geo = deps.geo || makeAtlasGeoObject();
    var HOUR = 3600000;

    var num = function (v) { return (v == null || v === '' || typeof v === 'boolean' || !isFinite(Number(v))) ? null : Number(v); };
    var str = function (v, n) { return String(v == null ? '' : v).slice(0, n || 200); };
    var arr = function (v) { return Array.isArray(v) ? v : []; };

    /** great-circle distance in km, or null when either end is not placed */
    function distanceKm(a, b) {
      if (!geo.placed(a) || !geo.placed(b)) return null;
      return haversineKm(a.lng, a.lat, b.lng, b.lat);
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

    /* ── IDENTITY OF A RECORD'S OWN SOURCE ──────────────────────────────────────────────────────────
       A source that HAS an id for the thing must have it carried: an OSM element has `node/123`, a Wikidata item `Q123`.
       The ref is built from that id when there is one — the same thing re-surfaced by a second search, with a renamed
       label or a refined coordinate, then keeps its ref and the edges that point at it. Only a record whose source gave NO
       id falls back to name+position (`slug`), and that ref is honestly the weaker kind. */
    function extIdsOf(p) {
      var ids = {};
      if (p && p.osm) ids.osm = p.osm;
      if (p && (p.wd || p.wikidata)) ids.wikidata = p.wd || p.wikidata;
      if (p && p.geonames) ids.geonames = p.geonames;
      return geo.cleanExtIds(ids);
    }
    /** the id a record's own identifiers give it, or '' */
    function stableId(ids) {
      if (ids.osm) return 'osm-' + ids.osm.replace('/', '-');
      if (ids.wikidata) return 'wd-' + ids.wikidata;
      if (ids.geonames) return 'gn-' + ids.geonames;
      return '';
    }
    function extSources(ids, fallback) {
      var out = [];
      if (ids.osm) out.push({ name: 'OpenStreetMap', url: 'https://www.openstreetmap.org/' + ids.osm, licence: 'ODbL' });
      if (ids.wikidata) out.push({ name: 'Wikidata', url: 'https://www.wikidata.org/wiki/' + ids.wikidata, licence: 'CC0' });
      return out.length ? out : [fallback];
    }

    /** a bare year / ISO date a source gave for an opening or closing, as ms — never a clock floor, null when not stated */
    function dateMs(v) {
      if (v == null || v === '') return null;
      if (typeof v === 'number') return (v >= 1000 && v <= 3000 && Math.floor(v) === v) ? Date.parse(String(v) + '-01-01T00:00:00Z') : null;
      var s = String(v).trim();
      return /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s) ? Date.parse(s.length === 4 ? s + '-01-01T00:00:00Z' : (s.length === 7 ? s + '-01T00:00:00Z' : s + 'T00:00:00Z')) : null;
    }

    /** an OpenStreetMap facility pin as `research.impact` builds it: {lng,lat,name,_k,_d,osm?,wd?} — or a Wikidata one ({wd, kind:'Wikidata'}) */
    function fromFacility(p, opts) {
      if (!p || !isFinite(+p.lng) || !isFinite(+p.lat)) return null;
      var kind = str(p._k || p.kind || 'facility', 60), name = str(p.name || kind, 160);
      var ids = extIdsOf(p);
      var fromWd = !p.osm && p.kind === 'Wikidata';
      return geo.worldObject({
        type: 'facility', kind: kind, id: str(p.id || stableId(ids) || slug(name, p.lng, p.lat), 120), name: name,
        lng: p.lng, lat: p.lat, provenance: 'feed_coordinate', ids: ids,
        sources: extSources(ids, fromWd ? { name: 'Wikidata', licence: 'CC0' } : { name: 'OpenStreetMap', licence: 'ODbL' }),
        links: arr(opts && opts.links), facts: p._d != null ? { distanceKm: Math.round(+p._d) } : null,
      });
    }

    /** an OSM city/town with a population tag */
    function fromCity(c, opts) {
      if (!c || !isFinite(+c.lng) || !isFinite(+c.lat)) return null;
      var name = str(c.name || '', 160), ids = extIdsOf(c);
      return geo.worldObject({
        type: 'city', kind: 'city', id: str(c.id || stableId(ids) || slug(name, c.lng, c.lat), 120), name: name,
        lng: c.lng, lat: c.lat, provenance: 'feed_coordinate', ids: ids,
        sources: extSources(ids, { name: 'OpenStreetMap', licence: 'ODbL' }),
        links: arr(opts && opts.links), facts: Object.assign({}, c.pop != null ? { population: +c.pop } : null, c._d != null ? { distanceKm: Math.round(+c._d) } : null),
      });
    }

    /** a feature of a loaded GIS dataset (a `userRows` row of js/atlas-query.js). Only a feature the dataset NAMES carries an
        identifier of its own; a row number is a position in this load, not an identity, and the object says so (`idStable`). */
    function fromDatasetRow(row, dataset) {
      if (!row || !isFinite(+row.lng) || !isFinite(+row.lat)) return null;
      var named = row._fid != null && row._fid !== '';
      var dsId = str((dataset && dataset.id) || String(row.id || '').split(':')[0], 60);
      var id = named ? dsId + ':' + str(row._fid, 60) : str(row.id, 120);
      if (!id) return null;
      return geo.worldObject({
        type: 'dataset_feature', kind: dsId, id: id, name: str(row.name, 160),
        lng: row.lng, lat: row.lat, provenance: row._derivedPoint ? 'resolved_place_centroid' : 'feed_coordinate',
        bounds: row._bbox && row._bbox[0] !== row._bbox[2] ? row._bbox : null,
        ids: named ? { dataset: id } : null, facts: { idStable: named },
        sources: [{ name: str((dataset && dataset.title) || dsId, 80) }],
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
      var ids = { company: row.id }; if (row.wd) ids.wikidata = row.wd;
      return geo.worldObject({
        type: 'company', kind: 'company', id: str(row.id, 80), name: str(row.n || row.name || row.id, 160),
        country: str(row.cc || row.country || '', 90), lng: has ? hq.lon : null, lat: has ? hq.lat : null,
        /* the profile states HOW it knew the site: `exact` (the statement's own coordinate) or `city` (the place item's — the
           headquarters CITY, not the building). A city point is an area standing in for a spot, so it stays the centroid class. */
        provenance: has ? sitePrecision(hq) : undefined, ids: ids,
        sources: extSources(geo.cleanExtIds({ wikidata: row.wd }), { name: 'IntMap company atlas' }),
      });
    }

    /** `exact` → a published coordinate; anything else a profile says (`city`, …) → the representative point of an area. A site that states
        no precision keeps the profile's historical default (exact), because that is what the builder writes when it has the statement. */
    function sitePrecision(site) {
      var p = site && site.precision;
      return (!p || p === 'exact') ? 'feed_coordinate' : 'resolved_place_centroid';
    }

    /**
     * a company profile (js/company-data.js `profile()`) as ONE company and its SITES — each site a facility object tied to the company by
     * `operated_by`, carrying its own id, the precision of its point and, when the profile states them, the years it opened and closed
     * (the tie holds for that span only). Reads what the profile states; a site without coordinates is still a site (position unknown).
     */
    function fromCompanyProfile(row, prof) {
      var company = fromCompany(row, prof && prof._hq);
      if (!company) return { company: null, sites: [] };
      var sites = arr(prof && prof.facilities).map(function (f) {
        if (!f || !f.id) return null;
        var has = isFinite(+f.lon) && isFinite(+f.lat) && f.lon != null && f.lat != null;
        var from = dateMs(f.opened), to = dateMs(f.closed);
        var osm = /^osm-(node|way|relation)-(\d+)$/.exec(String(f.id));
        return geo.worldObject({
          type: 'facility', kind: str(f.type || f.group || 'site', 60), id: str(f.id, 120), name: str(f.name || f.id, 160),
          country: str(f.cc || '', 90), lng: has ? f.lon : null, lat: has ? f.lat : null, provenance: has ? sitePrecision(f) : undefined,
          ids: osm ? { osm: osm[1] + '/' + osm[2] } : null,
          validity: { fromMs: from, toMs: to },
          facts: Object.assign({}, f.group ? { group: str(f.group, 24) } : null, f.status ? { status: str(f.status, 24) } : null, f.role ? { role: str(f.role, 60) } : null, f.precision ? { precision: str(f.precision, 16) } : null),
          sources: [{ name: 'IntMap company atlas' }],
          links: [{ rel: 'operated_by', ref: company.ref, fromMs: from, toMs: to, confidence: 'high', source: 'IntMap company atlas' }],
        });
      }).filter(Boolean);
      return { company: company, sites: sites };
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
    /** is a span `{fromMs,toMs}` (either end may be absent) in force at `atMs`? No `atMs` asked → everything is. */
    function activeAt(span, atMs) {
      if (atMs == null || !span) return true;
      return (span.fromMs == null || span.fromMs <= atMs) && (span.toMs == null || atMs <= span.toMs);
    }
    function atOf(opts) { return opts && opts.atMs != null && num(opts.atMs) != null ? +opts.atMs : null; }

    /** the edges between a and b as the READER of `a` would name them: a's own links to b, and b's links to a read backwards */
    function edgesBetween(a, b, atMs) {
      var ca = canon(a.ref), cb = canon(b.ref), out = [];
      arr(a.links).forEach(function (l) { if (canon(l.ref) === cb && activeAt(l, atMs)) out.push({ rel: l.rel, link: l }); });
      arr(b.links).forEach(function (l) { if (canon(l.ref) === ca && activeAt(l, atMs)) out.push({ rel: geo.inverseRel(l.rel), link: l }); });
      return out;
    }

    function relation(a, b, opts) {
      if (!a || !b || (a.ref && (a.ref === b.ref || canon(a.ref) === canon(b.ref)))) return null;
      opts = opts || {};
      var at = atOf(opts);
      /* asked «as of» a moment: a thing that was not yet (or no longer) in force then is not related to anything then */
      if (at != null && (!activeAt(a.validity, at) || !activeAt(b.validity, at))) return null;
      var km = (num(opts.km) != null && opts.km >= 0) ? +opts.km : RELATED_DEFAULTS.km;
      var hours = (num(opts.hours) != null && opts.hours >= 0) ? +opts.hours : RELATED_DEFAULTS.hours;
      var why = [];
      var edges = edgesBetween(a, b, at);
      var linked = edges.length > 0;
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
      if (!related) return null;
      var res = { why: why, distanceKm: d == null ? null : Math.round(d * 10) / 10, gapHours: gap == null ? null : Math.round(gap * 10) / 10 };
      var rs = relatedState(edges, why, { km: km, hours: hours, sharedRecord: !linked && (shareIds(a.articleIds, b.articleIds) || shareIds(a.evidenceIds, b.evidenceIds)) });
      res.state = rs.state; res.grounds = rs.grounds;
      var names = edges.map(function (e) { return e.rel; }).filter(function (r, i, x) { return x.indexOf(r) === i; });
      if (names.length) res.rels = names;
      return res;
    }

    /* ── THE INDEX ──────────────────────────────────────────────────────────────────────────────── */

    var byRef = Object.create(null);
    var byExt = Object.create(null);      /* 'scheme:value' → the canonical ref that holds it */
    var alias = Object.create(null);      /* a ref that was folded into another → the ref it became */
    var clashes = [];                     /* identifier disagreements the index refused to resolve by itself */

    /** the ref an object is stored under — follows the aliases left by identity merges */
    function canon(ref) { var r = ref, n = 0; while (alias[r] && n++ < 16) r = alias[r]; return r; }
    function extKeys(o) { var ids = o.ids || {}; return Object.keys(ids).map(function (k) { return k + ':' + ids[k]; }); }
    var unionBy = function (x, y, key) { var seen = Object.create(null), res = []; arr(x).concat(arr(y)).forEach(function (v) { var k = key ? key(v) : v; if (!seen[k]) { seen[k] = 1; res.push(v); } }); return res; };
    var linkKey = function (l) { return l.rel + '>' + l.ref + '>' + (l.fromMs == null ? '' : l.fromMs) + '>' + (l.toMs == null ? '' : l.toMs); };
    var claimKey = function (c) { return [c.key, c.value, c.unit || '', c.fromMs == null ? '' : c.fromMs, c.toMs == null ? '' : c.toMs, c.source || ''].join('|'); };

    function merge(old, nu) {
      /* the stronger provenance wins (a feed coordinate is not replaced by a centroid); ids and edges accumulate */
      var keep = geo.rank(nu) < geo.rank(old) ? nu : old, other = keep === nu ? old : nu;
      var out = Object.assign({}, other, keep);
      /* a record folded in under ANOTHER ref (same external id) leaves the stored ref, id and type alone — and remembers the ref it had */
      if (nu.ref !== old.ref) { out.ref = old.ref; out.id = old.id; out.type = old.type; }
      out.aliases = unionBy(old.aliases, nu.ref !== old.ref ? [nu.ref].concat(arr(nu.aliases)) : nu.aliases);
      out.articleIds = unionBy(old.articleIds, nu.articleIds);
      out.evidenceIds = unionBy(old.evidenceIds, nu.evidenceIds);
      out.links = unionBy(old.links, nu.links, linkKey);
      out.sources = unionBy(old.sources, nu.sources, function (s) { return s.name + '|' + s.url; });
      out.facts = Object.assign({}, old.facts, nu.facts);
      /* the id a source already stated is not overwritten by a later one: the first wins, and a disagreement is recorded, not hidden */
      out.ids = Object.assign({}, nu.ids, old.ids);
      Object.keys(nu.ids || {}).forEach(function (k) { if (old.ids && old.ids[k] && old.ids[k] !== nu.ids[k]) clashes.push({ ref: old.ref, scheme: k, kept: old.ids[k], dropped: nu.ids[k] }); });
      out.validity = nu.validity || old.validity || null;
      /* two sources' numbers for one key stay side by side — which one is right is for the reader of the claims, not the merge */
      out.claims = unionBy(old.claims, nu.claims, claimKey);
      out.time = nu.time || old.time; out.bounds = nu.bounds || old.bounds;
      return out;
    }

    function indexExt(o) { extKeys(o).forEach(function (k) { if (!byExt[k]) byExt[k] = o.ref; }); }

    /** the other ends' ids that DISAGREE with this object's on a scheme both state (`wikidata:Q1` vs `wikidata:Q2`) */
    function idConflict(a, b) {
      return Object.keys(a.ids || {}).some(function (k) { return b.ids && b.ids[k] && b.ids[k] !== a.ids[k]; });
    }

    /** two records standing for the same thing that the index could not fold together are tied by a typed edge, never silently kept apart */
    function tie(a, b, rel, note) {
      var link = { rel: rel, ref: b.ref, confidence: 'low', source: note };
      var back = { rel: rel, ref: a.ref, confidence: 'low', source: note };
      if (!byRef[a.ref].links.some(function (l) { return l.rel === rel && l.ref === b.ref; })) byRef[a.ref] = Object.assign({}, byRef[a.ref], { links: byRef[a.ref].links.concat([link]) });
      if (!byRef[b.ref].links.some(function (l) { return l.rel === rel && l.ref === a.ref; })) byRef[b.ref] = Object.assign({}, byRef[b.ref], { links: byRef[b.ref].links.concat([back]) });
    }

    /**
     * register(objects) — returns the objects as stored (merged with what the session already held).
     *
     * ══ IDENTITY ══ Two records are THE SAME OBJECT when they state the same external identifier (`ids`: an OSM element, a
     * Wikidata item, a GeoNames id, a company id, a dataset feature). That is what the sources asserted, so it is the only
     * thing the index folds on. The folded record's ref becomes an alias, and every edge that named it still reaches the object.
     *   · same name, same place, no shared id        → NOT merged (see `identity().candidates`) — a port and its terminal sit on one spot
     *   · same id but a DIFFERENT value on another scheme (`wikidata:Q1` here, `Q2` there) → NOT merged; tied `conflicting_identity`
     *   · same id but a different TYPE (a facility and a city both claiming Q5) → NOT merged; tied `candidate_match`
     * An object that carries two ids which each belong to a different stored object BRIDGES them: it is the evidence they are one.
     */
    function register(list) {
      var out = [];
      arr(Array.isArray(list) ? list : [list]).forEach(function (o) {
        if (!geo.isWorldObject(o) || !o.ref) return;
        var self = canon(o.ref);
        var hits = [];
        extKeys(o).forEach(function (k) { var r = byExt[k] && canon(byExt[k]); if (r && byRef[r] && hits.indexOf(r) < 0) hits.push(r); });
        /* the new record bridges stored ones that carry its other ids: it is the evidence they are one */
        var bridge = function (into) {
          hits.forEach(function (r) {
            var b = byRef[r]; if (!b || r === into || b.type !== byRef[into].type || idConflict(b, byRef[into])) return;
            alias[b.ref] = into; byRef[into] = merge(byRef[into], b); delete byRef[r];
          });
        };
        if (byRef[self]) {                       /* the same ref (or an alias of it) is already held */
          byRef[self] = merge(byRef[self], o); bridge(self); indexExt(byRef[self]); out.push(byRef[self]); return;
        }
        var target = hits.length ? byRef[hits[0]] : null;
        if (target && target.type === o.type && !idConflict(o, target)) {
          alias[o.ref] = target.ref;
          byRef[target.ref] = merge(target, o); bridge(target.ref);
          indexExt(byRef[target.ref]); out.push(byRef[target.ref]); return;
        }
        byRef[o.ref] = o; indexExt(o);
        if (target) tie(o, target, target.type !== o.type ? 'candidate_match' : 'conflicting_identity', target.type !== o.type ? 'same identifier, different type' : 'same identifier scheme, different value');
        out.push(byRef[o.ref]);
      });
      return out;
    }

    function all() { return Object.keys(byRef).map(function (k) { return byRef[k]; }); }
    function clear() { byRef = Object.create(null); byExt = Object.create(null); alias = Object.create(null); clashes = []; }

    /** `wikidata:Q123` / `osm:node/5` — an external identifier written as a query — to the object that holds it, or null */
    function byIdentifier(q) {
      var m = /^([A-Za-z][A-Za-z0-9_]*):(.+)$/.exec(q); if (!m) return null;
      var ids = geo.cleanExtIds((function () { var x = {}; x[m[1]] = m[2]; return x; })()), k = Object.keys(ids)[0];
      if (!k) return null;
      var r = byExt[k + ':' + ids[k]]; r = r && canon(r);
      return (r && byRef[r]) || null;
    }

    /**
     * assert(fromRef, rel, toRef, meta) — write ONE typed tie onto the object that states it. `meta` may carry `fromMs`/`toMs` (when it held),
     * `confidence`, `evidenceIds`, `source`. Returns the stored object, or null when `fromRef` is not held. Idempotent: the same edge (same
     * relation, target and period) is stored once; the same relation over a DIFFERENT period is a second, separate tie.
     */
    function assertLink(fromRef, rel, toRef, meta) {
      var o = byRef[canon(String(fromRef || ''))]; if (!o || !rel || !toRef) return null;
      var l = geo.cleanLink(Object.assign({}, meta, { rel: rel, ref: String(toRef) }));
      if (!l.rel || !l.ref) return null;
      byRef[o.ref] = Object.assign({}, o, { links: unionBy(o.links, [l], linkKey) });
      return byRef[o.ref];
    }

    /** assertClaim(ref, claim) — add a number WITH its basis (value, unit, period, source) without replacing what another source said */
    function assertClaim(ref, claim) {
      var o = byRef[canon(String(ref || ''))], c = geo.cleanClaim(claim); if (!o || !c) return null;
      byRef[o.ref] = Object.assign({}, o, { claims: unionBy(o.claims, [c], claimKey) });
      return byRef[o.ref];
    }

    /**
     * claimConflicts(o) — keys for which the object holds more than one VALUE over periods that overlap (or that state none), each with the
     * values and who gave them. A unit mismatch is reported as such: 300 000 TEU and 3 Mt are not a disagreement, they are not comparable yet.
     */
    function claimConflicts(o) {
      var by = Object.create(null);
      arr(o && o.claims).forEach(function (c) { (by[c.key] = by[c.key] || []).push(c); });
      var overlap = function (a, b) { return (a.fromMs == null || b.toMs == null || a.fromMs <= b.toMs) && (b.fromMs == null || a.toMs == null || b.fromMs <= a.toMs); };
      return Object.keys(by).map(function (k) {
        var cs = by[k], diff = false, units = false;
        for (var i = 0; i < cs.length; i++) for (var j = i + 1; j < cs.length; j++) {
          if (!overlap(cs[i], cs[j]) || cs[i].value === cs[j].value) continue;
          if ((cs[i].unit || '') !== (cs[j].unit || '')) units = true; else diff = true;
        }
        return (diff || units) ? { key: k, values: cs, unitMismatch: units && !diff ? true : undefined } : null;
      }).filter(Boolean);
    }

    /**
     * candidates(o, opts) — other held objects that LOOK like the same thing (same normalised name, within `km`) yet share no identifier and
     * so were NOT folded. These are leads for a reader or a later source, not facts. ⚠ 0.5 km is an ESTIMATE, not a measurement: it is the
     * order of an OSM way's centre against a Wikidata point for one large site; it expires when a measurement of real duplicates replaces it,
     * and the caller passes its own.
     */
    var CANDIDATE_KM = 0.5;
    function candidates(o, opts) {
      if (!o) return [];
      var km = (opts && num(opts.km) != null && opts.km >= 0) ? +opts.km : CANDIDATE_KM, n = geo.normName(o.name), me = canon(o.ref);
      if (!n || !geo.placed(o)) return [];
      return all().filter(function (x) { return canon(x.ref) !== me && geo.normName(x.name) === n && distanceKm(o, x) != null && distanceKm(o, x) <= km && !idShared(o, x); })
        .map(function (x) { return { object: x, distanceKm: Math.round(distanceKm(o, x) * 1000) / 1000, why: 'same name, close by, no shared identifier' }; });
    }
    function idShared(a, b) { return extKeys(a).some(function (k) { return extKeys(b).indexOf(k) >= 0; }); }

    /** identity(refOrObject) — what the index knows about WHO this object is: its stored ref, the refs folded into it, every external id, the look-alikes it did not fold, the disagreements it refused to settle */
    function identity(q, opts) {
      var o = typeof q === 'string' ? find(q) : q; if (!o) return null;
      var held = byRef[canon(o.ref)] || o;
      var ties = arr(held.links).filter(function (l) { return l.rel === 'conflicting_identity' || l.rel === 'candidate_match'; });
      return { ref: held.ref, aliases: arr(held.aliases), ids: held.ids || {}, candidates: candidates(held, opts).map(function (c) { return { ref: c.object.ref, name: c.object.name, distanceKm: c.distanceKm }; }),
        conflicts: ties.map(function (l) { return { rel: l.rel, ref: l.ref, note: l.source }; }).concat(clashes.filter(function (c) { return c.ref === held.ref; })) };
    }

    /**
     * find(query) — a ref, an external identifier, an id, or a name, in that order. ⚠ A NAME MATCHES BY THE SAME RULE the rest of
     * Atlas uses for «the same words» (geo.normName), exact first and then containment, so «Kahramanmaraş»
     * finds «14 km SSW of Kahramanmaraş» — and an ambiguous name returns the MOST RECENT object of the
     * strongest provenance rather than an arbitrary first one. `opts.type` narrows to one type.
     */
    function find(query, opts) {
      var q = str(query, 160).trim(); if (!q) return null;
      var type = opts && opts.type;
      var externalOnly = opts && opts.externalId;
      var c0 = externalOnly ? null : byRef[canon(q)];
      if (c0 && (!type || c0.type === type)) return c0;
      var hit = byIdentifier(q);
      if (hit && (!type || hit.type === type)) return hit;
      if (externalOnly) return null;
      var pool = all().filter(function (o) { return !type || o.type === type; });
      hit = pool.filter(function (o) { return o.id === q; })[0];
      if (hit) return hit;
      var n = geo.normName(q); if (!n) return null;
      var exact = pool.filter(function (o) { return geo.normName(o.name) === n; });
      var cand = exact.length ? exact : (n.length >= 3 ? pool.filter(function (o) { var m = geo.normName(o.name); return m.indexOf(n) >= 0 || n.indexOf(m) >= 0 && m.length >= 3; }) : []);
      cand.sort(function (x, y) { return (geo.rank(x) - geo.rank(y)) || (((y.time && y.time.atMs) || 0) - ((x.time && x.time.atMs) || 0)); });
      return cand[0] || null;
    }

    /**
     * traverse(start, opts) — walk typed edges outward from one object, breadth-first, and say HOW each object was reached.
     *   opts.rels      only follow edges with these names, AS READ FROM THE OBJECT BEING LEFT (`operates`, `contains`, `operated_by` …)
     *   opts.depth     how many edges to follow (default 1; no ceiling — the caller states what it wants)
     *   opts.atMs      only edges and objects in force at that moment (a tie or an object with a stated period outside it is skipped)
     *   opts.extra     candidates not in the index, read with the same rule and not stored
     * Returns { subject, nodes:[{ object|null, ref, depth, path:[{from, rel, to}] }] } — `object` is null for a ref that is named by an edge but
     * not held (still reported: the edge is a fact even when its far end was never surfaced).
     */
    /* a chain of ties is only as sure as its weakest tie: confirmed › inferred › unconfirmed */
    function pathState(path) {
      var rank = { confirmed: 3, inferred: 2, unconfirmed: 1 }, worst = 'confirmed';
      arr(path).forEach(function (p) { if (rank[p.state] < rank[worst]) worst = p.state; });
      return worst;
    }

    function traverse(start, opts) {
      opts = opts || {};
      var s = typeof start === 'string' ? find(start) : start;
      if (!s || !geo.isWorldObject(s)) return { subject: null, nodes: [] };
      var at = atOf(opts), depth = (num(opts.depth) != null && opts.depth >= 1) ? Math.floor(opts.depth) : 1;
      var rels = arr(opts.rels).map(String);
      var held = Object.create(null);
      all().concat(arr(opts.extra).filter(function (o) { return geo.isWorldObject(o); })).forEach(function (o) { var r = canon(o.ref); if (!held[r]) held[r] = o; });
      var adj = Object.create(null);
      Object.keys(held).forEach(function (r) {
        arr(held[r].links).forEach(function (l) {
          if (!activeAt(l, at)) return;
          var a = canon(held[r].ref), b = canon(l.ref);
          var ls = linkState(l).state;
          (adj[a] = adj[a] || []).push({ rel: l.rel, to: b, state: ls });
          (adj[b] = adj[b] || []).push({ rel: geo.inverseRel(l.rel), to: a, state: ls });
        });
      });
      var root = canon(s.ref), seen = Object.create(null); seen[root] = 1;
      var frontier = [{ ref: root, path: [] }], nodes = [];
      for (var d = 1; d <= depth && frontier.length; d++) {
        var next = [];
        frontier.forEach(function (f) {
          arr(adj[f.ref]).forEach(function (e) {
            if (rels.length && rels.indexOf(e.rel) < 0) return;
            if (seen[e.to]) return;
            var o = held[e.to] || byRef[e.to] || null;
            if (o && at != null && !activeAt(o.validity, at)) return;
            seen[e.to] = 1;
            var path = f.path.concat([{ from: f.ref, rel: e.rel, to: e.to, state: e.state }]);
            nodes.push({ object: o, ref: e.to, depth: d, path: path });
            next.push({ ref: e.to, path: path });
          });
        });
        frontier = next;
      }
      return { subject: s, nodes: nodes };
    }

    /**
     * related(subject, opts) — everything the session knows that belongs with `subject`.
     *   opts.km, opts.hours   the radius and window (defaults above)
     *   opts.types            narrow the RESULT to these types
     *   opts.extra            more candidates that are not in the index (the loaded news, a live feed) —
     *                         they are judged by the same rule and are NOT stored
     *   opts.atMs             as of this moment: ties and objects outside their stated period drop out
     *   opts.rels, opts.depth follow TYPED edges only (and, with depth > 1, through intermediate objects): «what does this port CONTAIN, and
     *                         who OPERATES that». Proximity is not consulted in this mode — a named relation is a statement, not a guess.
     * Ordered: linked first, then nearer, then closer in time. ⚠ NO LIMIT IS APPLIED HERE (CONSTITUTION §5):
     * `opts.limit` is the caller's, for a card that has room for n rows — and the total is always returned.
     */
    function related(subject, opts) {
      opts = opts || {};
      var s = typeof subject === 'string' ? find(subject) : subject;
      if (!s || !geo.isWorldObject(s)) return { subject: null, items: [], total: 0 };
      var types = arr(opts.types).map(String);
      var big = 1e12, items = [];
      var graph = arr(opts.rels).length > 0 || (num(opts.depth) != null && opts.depth > 1);
      if (graph) {
        traverse(s, opts).nodes.forEach(function (n) {
          if (!n.object || (types.length && types.indexOf(n.object.type) < 0)) return;
          var d = distanceKm(s, n.object), g = gapHours(s, n.object);
          items.push({ object: n.object, why: ['linked'], rels: n.path.map(function (p) { return p.rel; }), depth: n.depth, state: pathState(n.path), grounds: n.path.map(function (p) { return { kind: 'tie', rel: p.rel, state: p.state }; }),
            distanceKm: d == null ? null : Math.round(d * 10) / 10, gapHours: g == null ? null : Math.round(g * 10) / 10 });
        });
        items.sort(function (x, y) { return (x.depth - y.depth) || ((x.distanceKm == null ? big : x.distanceKm) - (y.distanceKm == null ? big : y.distanceKm)); });
      } else {
        var seen = Object.create(null); seen[canon(s.ref)] = 1;
        var pool = all().concat(arr(opts.extra).filter(function (o) { return geo.isWorldObject(o); }));
        pool.forEach(function (o) {
          var c = o.ref && canon(o.ref);
          if (c && seen[c]) return; if (c) seen[c] = 1;
          if (types.length && types.indexOf(o.type) < 0) return;
          var r = relation(s, o, opts); if (!r) return;
          items.push({ object: o, why: r.why, rels: r.rels, distanceKm: r.distanceKm, gapHours: r.gapHours, state: r.state, grounds: r.grounds });
        });
        items.sort(function (x, y) {
          return ((y.why.indexOf('linked') >= 0) - (x.why.indexOf('linked') >= 0))
            || ((x.distanceKm == null ? big : x.distanceKm) - (y.distanceKm == null ? big : y.distanceKm))
            || ((x.gapHours == null ? big : x.gapHours) - (y.gapHours == null ? big : y.gapHours));
        });
      }
      var total = items.length, lim = num(opts.limit);
      return { subject: s, items: (lim != null && lim >= 0) ? items.slice(0, Math.floor(lim)) : items, total: total };
    }

    /**
     * checkRelations(subject, claims) — is each {rel, ref} the answer is about to state about `subject` RECORDED? Reads the subject's own links and the
     * links the other held objects keep to it (read backwards). A claim with no record comes back `unconfirmed` + `recorded:false`; nothing is added.
     */
    function checkRelations(subject, claims) {
      var s = typeof subject === 'string' ? find(subject) : subject;
      if (!s) return arr(claims).map(function (q) { return { rel: String(q && q.rel || ''), ref: q && q.ref, recorded: false, state: 'unconfirmed', why: 'the object is not held' }; });
      var me = canon(s.ref), incoming = [];
      all().forEach(function (o) { arr(o.links).forEach(function (l) { if (canon(l.ref) === me) incoming.push({ from: o.ref, link: l }); }); });
      return checkClaims(s.ref, arr(s.links), incoming, claims, geo.inverseRel, canon);
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
          /* a typed tie says WHICH: «linked (operated_by)», and across several hops «linked (contains › operated_by)» */
          return { name: x.object.name || x.object.ref, ref: x.object.ref, why: x.why.map(function (w) { return (WHY[w] || w) + (w === 'linked' && arr(x.rels).length ? ' (' + x.rels.join(' › ') + ')' : ''); }).join(' + '),
            distanceKm: x.distanceKm == null ? null : Math.round(x.distanceKm), gapHours: x.gapHours == null ? null : Math.round(x.gapHours),
            state: x.state || 'unconfirmed', grounds: arr(x.grounds) };
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
            + esc(x.why + ' · ' + stateLabel(x.state, o.L || function (en) { return en; }) + (x.distanceKm != null ? ' · ' + x.distanceKm + ' km' : '') + (x.gapHours != null ? ' · ' + x.gapHours + ' h' : '')) + '</span></div>';
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
        sources: o.sources.length ? o.sources : undefined, links: o.links.length ? o.links.map(function (l) { var s = linkState(l); return Object.assign({}, l, { state: s.state, stateWhy: s.why }); }) : undefined,
        facts: Object.keys(o.facts || {}).length ? o.facts : undefined,
        ids: Object.keys(o.ids || {}).length ? o.ids : undefined, aliases: arr(o.aliases).length ? o.aliases : undefined,
        validFrom: o.validity && o.validity.fromMs != null ? new Date(o.validity.fromMs).toISOString().slice(0, 10) : undefined,
        validTo: o.validity && o.validity.toMs != null ? new Date(o.validity.toMs).toISOString().slice(0, 10) : undefined,
        claims: arr(o.claims).length ? o.claims : undefined };
    }

    return { RELATED_DEFAULTS: RELATED_DEFAULTS, CANDIDATE_KM: CANDIDATE_KM, all: all, assertClaim: assertClaim, assertLink: assertLink, brief: brief, candidates: candidates,
      canon: canon, claimConflicts: claimConflicts, clear: clear, distanceKm: distanceKm, find: find, identity: identity, traverse: traverse,
      fromCity: fromCity, fromCompany: fromCompany, fromCompanyProfile: fromCompanyProfile, fromDatasetRow: fromDatasetRow, fromFacility: fromFacility, fromLoadedNews: fromLoadedNews, fromNewsArticle: fromNewsArticle,
      fromEventRow: fromEventRow, fromNewsEvent: fromNewsEvent, fromNewsGroup: fromNewsGroup, fromPlace: fromPlace, fromPlaceProfile: fromPlaceProfile, fromUsgs: fromUsgs, fromVolcano: fromVolcano,
      gapHours: gapHours, checkRelations: checkRelations, register: register, relatedGroups: relatedGroups, relatedHtml: relatedHtml, related: related, relation: relation };
  })();
}

/** the ONE instance every capability and card shares — see the header on why it is a module singleton */
export const worldObjects = makeAtlasWorldObjects();
