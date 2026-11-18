/* ============================================================================
 *  IntMap · «the line the reader clicked, drawn lit»  (layer-click-polish)
 * ----------------------------------------------------------------------------
 *  A card or popup that talks about ONE line on the map (a border's «where this line comes from», a submarine
 *  cable's popup) must say which line. This is the one place that draws it: the clicked feature's geometry goes
 *  into a single GeoJSON source and is drawn above everything as a wide soft glow and a thin core, through the
 *  engine's own layers API (MapLibre and Cesium alike). There is ONE highlight on the map, so a second click
 *  moves it and two can never be left standing; `owner` lets a card clear only what it set itself.
 *
 *  ⚠ THE DRAWN FEATURES ARE ONLY THE VIEWPORT'S PIECES. A vector tile cuts a line at tile edges, so one cable or
 *  border comes back as several features. `collectSame` gathers every rendered piece with the clicked piece's
 *  identity: an explicit property (`key`, e.g. the cable `id`), else the feature's own id, else its property set
 *  (pieces of one tile line carry equal properties). A line that no identity can join is drawn as the one piece.
 *  The colours are a design choice (iOS system blue / cyan), not a measurement; they lapse only if the look changes.
 * ==========================================================================*/

const SRC = 'src-feature-hl', GLOW = 'lyr-feature-hl-glow', CORE = 'lyr-feature-hl';
const EMPTY = { type: 'FeatureCollection', features: [] };

/** the identity a feature's pieces share: «p:<value>» for an explicit property, «i:<id>» for a feature id, «s:<json>» for its properties */
export function identityOf(f, key) {
  if (!f) return null;
  const p = f.properties || {};
  if (key && p[key] != null) return 'p:' + String(p[key]);
  if (f.id != null) return 'i:' + String(f.id);
  const ks = Object.keys(p).sort();
  if (!ks.length) return null;
  return 's:' + JSON.stringify(ks.map((k) => [k, p[k]]));
}

/** Every line-shaped feature of `pool` that is a piece of `seed`, as one FeatureCollection (the seed always included). */
export function collectSame(seed, pool, key) {
  const out = [];
  const isLine = (f) => !!(f && f.geometry && /LineString|Polygon/.test(f.geometry.type));
  if (!isLine(seed)) return { type: 'FeatureCollection', features: [] };
  const id = identityOf(seed, key), seen = new Set();
  const push = (f) => { const g = JSON.stringify(f.geometry); if (seen.has(g)) return; seen.add(g); out.push({ type: 'Feature', properties: {}, geometry: f.geometry }); };
  push(seed);
  if (id != null) for (const f of pool || []) if (isLine(f) && identityOf(f, key) === id) push(f);
  return { type: 'FeatureCollection', features: out };
}

/** The whole features of a source that are the clicked line (same identity) — the seed itself is a clipping and is not added. */
export function wholeLegs(seed, features, key) {
  const id = identityOf(seed, key);
  const isLine = (f) => !!(f && f.geometry && /LineString|Polygon/.test(f.geometry.type));
  if (id == null) return { type: 'FeatureCollection', features: [] };
  return { type: 'FeatureCollection', features: (features || []).filter((f) => isLine(f) && identityOf(f, key) === id).map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })) };
}

let _owner = null;

function _ensure(GE) {
  const L = GE().layers;
  if (!L.hasSource(SRC)) L.addSource(SRC, { type: 'geojson', data: EMPTY });
  if (!L.has(GLOW)) L.add({ id: GLOW, type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#64d2ff', 'line-width': 10, 'line-opacity': 0.45, 'line-blur': 4 } });
  if (!L.has(CORE)) L.add({ id: CORE, type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0a84ff', 'line-width': 3.5, 'line-opacity': 1 } });
  /* above anything added since the last click */
  try { if (L.move) { L.move(GLOW); L.move(CORE); } } catch (_) { /* order is cosmetic */ }
}

/**
 * Light the clicked line. `seed` is the clicked feature, `hits` the features already returned for the click, `layerIds`
 * the layers the piece may live in (the viewport is asked for the rest of the line there). Replaces any highlight.
 * Returns the number of pieces drawn (0 = nothing to draw; never throws).
 */
export function highlight(GE, owner, seed, { hits = [], layerIds = null, key = null } = {}) {
  try {
    if (!GE().hasRenderer()) return 0;
    /* ⚠ A GEOJSON SOURCE HOLDS THE WHOLE LINE; THE VIEWPORT HOLDS TILE CLIPPINGS OF IT. MEASURED 2026-11-18 on the
       built site (globe, z3): clicking Havfrue/AEC-2 lit 4 rendered pieces and stopped mid-Atlantic, while the
       source carries the cable as 7 whole legs with the same `id`. So the features of the line's own source are
       asked first; the rendered pieces are the answer only for a source that cannot be read (vector tiles). */
    try {
      const srcs = new Set();
      if (seed && seed.source) srcs.add(seed.source);
      for (const id of (layerIds || [])) { try { const l = GE().layers.get(id); if (l && l.source) srcs.add(l.source); } catch (_) { /* gone */ } }
      const whole = [];
      for (const s of srcs) { const d = GE().layers.sourceData && GE().layers.sourceData(s); if (d && Array.isArray(d.features)) whole.push(...d.features); }
      const legs = wholeLegs(seed, whole, key);
      if (legs.features.length) { _ensure(GE); GE().layers.setSourceData(SRC, legs); _owner = owner; return legs.features.length; }
    } catch (_) { /* fall through to the rendered pieces */ }
    let pool = hits;
    /* only layers that exist now — maplibre's query throws on an unknown id, which would drop the other pieces */
    const L = GE().layers, exists = (id) => { try { return typeof L.get !== 'function' || !!L.get(id); } catch (_) { return false; } };
    const ids = (layerIds || (seed && seed.layer && seed.layer.id ? [seed.layer.id] : [])).filter(exists);
    if (ids && ids.length) { try { pool = pool.concat(GE().coords.queryRenderedFeatures(undefined, { layers: ids }) || []); } catch (_) { /* the hits alone */ } }
    const fc = collectSame(seed, pool, key);
    if (!fc.features.length) { clearHighlight(GE); return 0; }
    _ensure(GE);
    GE().layers.setSourceData(SRC, fc);
    _owner = owner;
    return fc.features.length;
  } catch (_) { return 0; }
}

/** Remove the highlight — when `owner` is given, only if that owner set the one standing (idempotent). */
export function clearHighlight(GE, owner) {
  if (owner != null && _owner !== owner) return;
  _owner = null;
  try { if (GE().layers.hasSource(SRC)) GE().layers.setSourceData(SRC, EMPTY); } catch (_) { /* style gone */ }
}

/** the owner standing now (for tests and callers that must know) */
export function currentOwner() { return _owner; }
