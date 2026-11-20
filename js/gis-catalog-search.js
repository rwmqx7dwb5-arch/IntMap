/* ============================================================================
 *  IntMap · SEARCH DATASETS BY WHAT THEY ARE — js/gis-catalog-search.js
 * ----------------------------------------------------------------------------
 *  discover() (js/gis-remote.js) answers «which collections STATE they cover this place and period and contain
 *  these words». A planner also needs the other questions a data portal answers: «at 10 m or finer», «with a
 *  licence stated», «under 20% cloud», «from the catalogue that answered», across every catalogue at once — and
 *  with the dataset this app already HOLDS in the same list, so one query finds both.
 *
 *  This file is the pure part: normalised records in, ranked records and facets out. It asks nobody anything.
 *  The reader of a catalogue is js/gis-remote.js (STAC API 1.x `/collections`, OGC API `/collections`); the
 *  item-level search that goes with it (`POST /search`, `GET …/items`) is also there.
 *
 *  ⚠⚠⚠ EVERY FACET HAS A THIRD ANSWER, AND IT IS NOT «NO». A collection that does not state its resolution is
 *  `unstated` for a resolution filter — it is neither kept as a match nor thrown away as a miss. `strict:true`
 *  asks for only the ones that STATE a match; the default keeps the unstated ones and says they are unstated
 *  (the same stance as discover(): 「不明」 is not a match, and it is not a refusal).
 *
 *  ⚠ A RANK IS NOT A QUALITY. `stated` counts how many of the facts a reader needs the record actually states
 *  (extent, period, licence, resolution, providers); it measures the record's candour, not the data's worth.
 *  Nothing here can say a dataset is good — it can say what it does and does not state.
 *
 *  Nothing here names a host or a vendor: every facet is a STAC / OGC standard member.
 * ==========================================================================*/

const isNum = (v) => typeof v === 'number' && isFinite(v);
export const words = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);

/* ── resolution (ground sample distance, metres) ──────────────────────────────────────────────────
   Stated in three places by the STAC standard, tried in order of how directly they say it:
     summaries.gsd                       [10, 20, 60] | {minimum, maximum}      (common core)
     summaries['raster:bands'][].spatial_resolution   (raster extension; metres)
     item_assets[*].gsd / ['raster:bands'][].spatial_resolution
   → {min, max, source} in metres, or null (NOT STATED — never a guess from the collection's name). */
function gsdValues(x) {
  if (isNum(x)) return [x];
  if (Array.isArray(x)) return x.filter(isNum);
  if (x && typeof x === 'object') return [x.minimum, x.maximum].filter(isNum);
  return [];
}
export function resolutionOf(col) {
  const sum = (col && col.summaries) || null;
  let vals = [], source = null;
  if (sum) {
    vals = gsdValues(sum.gsd); if (vals.length) source = 'summaries.gsd';
    if (!vals.length && Array.isArray(sum['raster:bands'])) {
      vals = [].concat(...sum['raster:bands'].map((b) => gsdValues(b && b.spatial_resolution)));
      if (vals.length) source = 'summaries.raster:bands';
    }
  }
  const ia = col && col.itemAssets;
  if (!vals.length && ia && typeof ia === 'object') {
    for (const k of Object.keys(ia)) {
      const a = ia[k] || {};
      vals = vals.concat(gsdValues(a.gsd), Array.isArray(a['raster:bands']) ? [].concat(...a['raster:bands'].map((b) => gsdValues(b && b.spatial_resolution))) : []);
    }
    if (vals.length) source = 'item_assets';
  }
  if (!vals.length) return null;
  return { min: Math.min(...vals), max: Math.max(...vals), source: source, unit: 'm' };
}

/* the range of `eo:cloud_cover` the collection states (percent), or null */
function cloudCoverOf(col) {
  const c = col && col.summaries && col.summaries['eo:cloud_cover'];
  const v = gsdValues(c);
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}

/* → the facts a reader needs, each `stated` or null — the record's CANDOUR, counted */
function statedFacts(rec) {
  const f = {
    extent: !!(rec.extent && Array.isArray(rec.extent.bbox) && rec.extent.bbox.length),
    period: !!(rec.extent && Array.isArray(rec.extent.time) && rec.extent.time.length),
    license: !!(rec.rights && rec.rights.license),
    resolution: !!rec.resolution,
    providers: !!(rec.rights && rec.rights.providers && rec.rights.providers.length),
  };
  return { facts: f, stated: Object.keys(f).filter((k) => f[k]).length, of: Object.keys(f).length };
}

/* a catalogue record (js/gis-remote.js normaliseCollection) → the searchable record */
export function toRecord(col, cat) {
  const rec = Object.assign({}, col, { origin: 'catalogue' });
  rec.resolution = resolutionOf({ summaries: col.summaries, itemAssets: col.itemAssets });
  rec.cloudCover = cloudCoverOf(col);
  rec.catalogLabel = (cat && cat.label) || col.catalog;
  return rec;
}

/* a dataset this app already holds (js/gis-datasets.js) → the same shape. ⚠ What it states about itself is what
   MEASURING it gave (grid, time, count); a hand-made vector layer states no resolution and says so (null). */
export function localRecord(ds) {
  const g = ds && ds.grid;
  const bbox = (ds && ds.provenance && Array.isArray(ds.provenance.bounds) && ds.provenance.bounds.length >= 4) ? [ds.provenance.bounds.slice(0, 4)] : null;
  const m = g && isNum(g.pixelLat) ? Math.abs(g.pixelLat) * 111320 : null;   /* 観測: 1 deg of meridian ≈ 111.32 km (js/gis-atlas.js pixelKmLat). 失効条件: an ellipsoid change */
  const t = ds && ds.time;
  const iv = t && (t.from != null || t.to != null) ? [[t.from == null ? null : String(t.from), t.to == null ? null : String(t.to)]] : null;
  const bandNames = Array.isArray(ds && ds.bands) ? ds.bands.map((b) => b && b.name).filter(Boolean) : [];
  const fieldNames = Array.isArray(ds && ds.fields) ? ds.fields.map((f) => f && f.name).filter(Boolean) : [];
  return {
    ref: 'dataset:' + ds.id, catalog: 'this-session', kind: ds.kind || 'vector', id: String(ds.id),
    title: ds.title ? String(ds.title) : String(ds.id), description: '', keywords: bandNames.concat(fieldNames),
    extent: { bbox: bbox, time: iv }, rights: { license: null, licenseUrl: null, providers: [] },
    resolution: m ? { min: m, max: m, source: 'grid.pixelLat', unit: 'm' } : null, cloudCover: null,
    origin: 'held', catalogLabel: 'Datasets held in this session', count: ds.count == null ? null : ds.count,
  };
}

/* ── the match ────────────────────────────────────────────────────────────────────────────────────── */

/* field weights: where a word is found says how much it means — a title hit is not a description hit */
const FIELD_WEIGHT = { title: 3, keywords: 2.5, id: 2, description: 1, providers: 1 };

/* → score ≥ 0 when ALL words appear (prefix allowed), else -1. Per word: the best field it hits. */
export function textScore(want, rec) {
  if (!want.length) return 0;
  const fields = {
    title: words(rec.title), keywords: words((rec.keywords || []).join(' ')), id: words(rec.id),
    description: words(rec.description), providers: words(((rec.rights && rec.rights.providers) || []).join(' ')),
  };
  let score = 0;
  for (const w of want) {
    let best = 0;
    for (const f of Object.keys(fields)) {
      const hits = fields[f];
      if (hits.indexOf(w) >= 0) best = Math.max(best, FIELD_WEIGHT[f] * 1.0);
      else if (hits.some((h) => h.startsWith(w))) best = Math.max(best, FIELD_WEIGHT[f] * 0.6);
    }
    if (!best) return -1;
    score += best;
  }
  return score;
}

/* resolution filter: {maxGsd?, minGsd?} metres. «at 10 m or finer» is maxGsd:10 (a SMALLER number is finer).
   → 'meets' | 'misses' | 'unstated' */
export function resolutionRelation(res, ask) {
  if (!ask || (ask.maxGsd == null && ask.minGsd == null)) return 'not-asked';
  if (!res) return 'unstated';
  /* a collection stating a RANGE (10…60 m) meets «10 m or finer» in part; it is 'meets' only when some stated value does */
  const okMax = ask.maxGsd == null || res.min <= ask.maxGsd;
  const okMin = ask.minGsd == null || res.max >= ask.minGsd;
  return okMax && okMin ? 'meets' : 'misses';
}

/* cloud: {maxCloud} percent → 'meets' | 'misses' | 'unstated' | 'not-asked' */
function cloudRelation(cc, ask) {
  if (ask == null) return 'not-asked';
  if (!cc) return 'unstated';
  return cc.min <= ask ? 'meets' : 'misses';
}

/* req = {q, bbox, time, maxGsd, minGsd, maxCloud, licensed, kinds, origins, strict}
   deps = {spatial(stated, askedBox), temporal(stated, askedTime)} — js/gis-remote.js's relations, passed in so
   the same verdict is used everywhere (never a second copy of the antimeridian rule).
   → {entries (ranked), total, facets, dropped:{<facet>:count}} */
export function searchRecords(records, req, dep) {
  const o = req || {};
  const want = words(o.q);
  const box = o.bbox || null;
  const out = [], dropped = { text: 0, place: 0, period: 0, resolution: 0, cloud: 0, licence: 0, kind: 0, origin: 0 };
  for (const rec of records) {
    if (Array.isArray(o.kinds) && o.kinds.length && o.kinds.indexOf(rec.kind) < 0) { dropped.kind++; continue; }
    if (Array.isArray(o.origins) && o.origins.length && o.origins.indexOf(rec.origin) < 0) { dropped.origin++; continue; }
    const ts = textScore(want, rec);
    if (ts < 0) { dropped.text++; continue; }
    const spatial = dep.spatial(rec.extent && rec.extent.bbox, box);
    const temporal = dep.temporal(rec.extent && rec.extent.time, o.time);
    if (spatial === 'outside') { dropped.place++; continue; }
    if (temporal === 'outside') { dropped.period++; continue; }
    const resolution = resolutionRelation(rec.resolution, { maxGsd: o.maxGsd, minGsd: o.minGsd });
    if (resolution === 'misses') { dropped.resolution++; continue; }
    const cloud = cloudRelation(rec.cloudCover, o.maxCloud);
    if (cloud === 'misses') { dropped.cloud++; continue; }
    const licence = rec.rights && rec.rights.license ? 'stated' : 'unstated';
    if (o.licensed && licence === 'unstated') { dropped.licence++; continue; }
    const match = { text: want.length ? 'all-words' : 'not-asked', spatial: spatial, temporal: temporal, resolution: resolution, cloud: cloud, licence: licence };
    if (o.strict) {
      const unproven = ['spatial', 'temporal', 'resolution', 'cloud'].filter((k) => match[k] === 'unstated');
      if (unproven.length) { dropped[unproven[0] === 'spatial' ? 'place' : unproven[0] === 'temporal' ? 'period' : unproven[0]]++; continue; }
    }
    const st = statedFacts(rec);
    out.push(Object.assign({}, rec, { match: match, stated: st.stated, statedOf: st.of, score: ts }));
  }
  /* order: what was ASKED and is STATED first; then text; then candour; ties by title so the order is repeatable */
  const stateRank = (e) => (e.match.spatial === 'covers' ? 0 : e.match.spatial === 'overlaps' ? 1 : 2) * 3 + (e.match.temporal === 'overlaps' ? 0 : e.match.temporal === 'unstated' ? 1 : 2);
  out.sort((a, b) => (stateRank(a) - stateRank(b)) || (b.score - a.score) || (b.stated - a.stated) || String(a.title).localeCompare(String(b.title)) || String(a.ref).localeCompare(String(b.ref)));
  const facets = { catalog: {}, kind: {}, licence: {}, resolution: {} };
  const bump = (m, k) => { m[k] = (m[k] || 0) + 1; };
  for (const e of out) {
    bump(facets.catalog, e.catalog); bump(facets.kind, e.kind);
    bump(facets.licence, e.rights && e.rights.license ? e.rights.license : 'unstated');
    /* decades of metres, so «how many are at 10 m or finer» is one look */
    const g = e.resolution ? e.resolution.min : null;
    bump(facets.resolution, g == null ? 'unstated' : g <= 1 ? '<=1m' : g <= 10 ? '<=10m' : g <= 100 ? '<=100m' : g <= 1000 ? '<=1km' : '>1km');
  }
  return { entries: out, total: out.length, facets: facets, dropped: dropped };
}
