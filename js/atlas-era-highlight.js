/* ============================================================================
 *  IntMap · Atlas — the map's year applies to areas too
 * ----------------------------------------------------------------------------
 *  While Chronos shows a past year the map draws THAT year's polities (js/time-borders.js), and a
 *  country highlight painted from the modern polygon contradicts the borders under it: asked to
 *  highlight Japan's territory in 1900, the reply lit modern Japan while the map beside it drew the
 *  Empire's borders (measured on production, 2026-09-15). The Compare view already holds this
 *  judgement (js/stats-compare.js `_paintCodes`: travelling → `IntMapTimeBorders.geomForCode`,
 *  else modern), so it is handed to the Atlas highlight here rather than written a second time.
 *
 *  A polity of that year whose recorded name carries a possessor gloss — «Taiwan (Japan)»,
 *  «Korea (Japan)» — belongs to that possessor's territory: the gloss is how the record states
 *  possession (js/time-borders.js `_CS_ERA`, `IntMapEraName.split`), so those features join the
 *  possessor's fill. Where the era record has no shape for the code, the modern polygon stands,
 *  exactly as in Compare.
 *
 *  `deps.GE` is the engine getter, `deps.resolveCountrySync` the console's own country resolver
 *  (the gloss «Japan» is resolved by the same rule as the reader's «Japan»).
 * ==========================================================================*/
export function makeEraHighlight(deps) {
  const GE = deps.GE, resolveCountrySync = deps.resolveCountrySync;
  /** The era geometries for one ISO3 code, or null when the map is at the live date / holds no shape. */
  function eraGeomsFor(code) {
    const TB = (typeof window !== 'undefined') ? window.IntMapTimeBorders : null;
    if (!(TB && TB.active && TB.active())) return null;
    const out = [];
    try { const g = TB.geomForCode && TB.geomForCode(code); if (g) out.push({ name: String(code), geo: g }); } catch (_) { /* no era shape → modern polygon below */ }
    try {
      const fc = TB.currentFC && TB.currentFC(); const EN = window.IntMapEraName;
      (fc && fc.features || []).forEach((f) => {
        const nm = String((f.properties && (f.properties.NAME || f.properties.name)) || ''); const p = EN && EN.split(nm);
        if (!p || !p.gloss || !f.geometry) return;
        const r = resolveCountrySync(p.gloss); if (r && r.code === String(code)) out.push({ name: nm, geo: f.geometry });
      });
    } catch (_) { /* the possessor pass is additive; a failure leaves the code's own shape */ }
    return out.length ? out : null;
  }
  /** The fill + line pair the era shapes are drawn into. `colors` = {fill, line} — the highlight's own. */
  function ensureEraHlLayers(colors) {
    if (GE().layers.has('nlq-era-fill')) return true;
    const before = ['ofm-country', 'ofm-city', 'ofm-other', 'tool-poly'].find((id) => { try { return !!GE().layers.has(id); } catch (_) { return false; } });
    try {
      if (!GE().layers.hasSource('nlq-era-src')) GE().layers.addSource('nlq-era-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      GE().layers.add({ id: 'nlq-era-fill', type: 'fill', source: 'nlq-era-src', paint: { 'fill-color': colors.fill, 'fill-opacity': 0.55 } }, before);
      GE().layers.add({ id: 'nlq-era-line', type: 'line', source: 'nlq-era-src', paint: { 'line-color': colors.line, 'line-width': 2, 'line-opacity': 0.95 } }, before);
      return true;
    } catch (_) { return false; }
  }
  /* ⚠ (#R736) THE FRAME GOES ROUND WHAT WAS DRAWN. While Chronos is in the past a country highlight
     paints the ERA shape above, so framing the camera on the MODERN polygon of the same code frames a
     different country — and for a code the modern record does not hold at all (`OTT`, the Ottoman
     Empire) it measured nothing and the camera did not move. */
  function eraBoxFor(code) {
    const g = eraGeomsFor(String(code)); if (!g || !g.length) return null;
    let a = 180, b = 90, c = -180, d = -90, any = false;
    const scan = (cs) => cs.forEach((x) => { if (typeof x[0] === 'number') { a = Math.min(a, x[0]); b = Math.min(b, x[1]); c = Math.max(c, x[0]); d = Math.max(d, x[1]); any = true; } else scan(x); });
    g.forEach((x) => { try { const gg = x.geo; if (gg && /Polygon$/.test(gg.type || '')) scan(gg.coordinates); } catch (_) { /* a shape that cannot be walked contributes nothing */ } });
    return any ? [a, b, c, d] : null;
  }
  /* ══ ⚠⚠⚠ (#R736) WHAT ATLAS HAS PAINTED, DECLARED BY THE THING THAT PAINTS IT ════════════════════
     js/atlas-capabilities.js `paintNow()` decides whether a map action DID anything by diffing geojson
     SOURCE feature counts. A country highlight paints with `setFeatureState` on `nlq-src` and adds no
     feature to any source; the era highlight above paints into `nlq-era-src`; `data.rank` shades by
     value with `setFeatureState({choroV})`. None of the three moves a source count, so the commonest
     map actions Atlas has came back to it as `not_rendered` EVERY TIME THEY WORKED. Measured in
     production 2026-09-15: 「世界で人口密度が最も高い10か国を地図で色分けして」 spent 10m29s and 21 calls
     alternating `highlight` and `rank`, all `not_rendered`, over a map that had been correct since the
     first pair (DEV-NOTES #R736 §1).
     ⚠ THE HAND-KEPT LIST OF SOURCE IDS WAS THE DEFECT, NOT ITS CONTENTS — #R735 paid for it once with
     `nlq-fac-src` (.agents/rules/no-ad-hoc-hardcoding.md §2.4). So the painter declares its own painted
     state and the observer reads the declaration: a surface added where it is CREATED is observed on
     the next turn, and nothing here has to be remembered elsewhere.
     ⚠ COUNTS AND NAMES, NEVER THE DRAWING — the observer needs a value that MOVES when something is
     drawn. `metric` is in because re-shading the same countries by a different measure is a change the
     counts cannot show. `get` is the live state, read at call time, never captured. */
  /* ══ ⚠⚠⚠ (#R742) A CARDINAL IS NOT AN IDENTITY — THE SAME SIX COUNTRIES AND SIX OTHER COUNTRIES
     READ EXACTLY ALIKE. The reading above is six numbers and one string, and js/atlas-capabilities.js
     decides whether a paint DID anything by diffing it. Two things follow, and both were measured on
     production 2026-09-15:
       · 「Which countries border Kazakhstan?」 painted six countries correctly and was told
         `not_rendered` three times, because a redraw of the same six moves no number; and
       · repainting six countries as six DIFFERENT countries — a real repair — moves no number either,
         so the correction reads as「nothing happened」 exactly like the failure.
     So the painted state carries WHO is painted as well as HOW MANY. The counts stay: they are the
     contract tests/r736-atlas-multiprobe.spec.js reads (0 → n), and a surface whose members have no
     name at all is still counted here even though it can put nothing in `ids`.
     ⚠ THE KEYS ARE THE SUPPLIER'S OWN. `ids.countries` is named after the `countries` closure
     js/atlas-console.js hands in, so a surface added to that supplier is named the same in this
     reading, in the painter's declaration (`meta.painted`) and in the verdict that holds one against
     the other (js/atlas-capabilities.js `PAINT_GOAL`) — nobody has to remember a second spelling. */
  const PAINTED_IDS = {
    countries: (v) => Array.from(v || []),                       /* `_hl` — a Set of ISO3 codes */
    era: (v) => (v || []).slice(),                               /* `_eraHl` — the era polities drawn, by name */
    /* ⚠⚠⚠ (#R760) A SHAPE'S IDENTITY IS ITS COURSE WHEN IT CARRIES NO CAPTION. #R747 made a redraw
       of the same line idempotent (js/atlas-console.js `_lnSame` — 「A LINE IS ITS COURSE, NOT ITS
       CAPTION」) and thereby GUARANTEED the verdict it did not fix: an idempotent redraw cannot move the
       count, so `paint.verify` fell through to its last line. Measured on production 2026-09-16,
       「Measure the great-circle distance from Reykjavik to Cape Town and draw the line」: the line was
       correct on the FIRST call, `map.drawLine` ran five times, two of them `not_rendered`, the turn
       died at its working limit and the reader never got the distance in prose at all. A caption is a
       label; the course is the thing. `key` is derived from the geometry BY THE PAINTER, so a redraw
       states the same identity and an unnamed shape stops being nameless — which is what the note above
       asks for, without inventing an index or a position. */
    polys: (v) => (v || []).map((p) => p && (p.name || p.key)),             /* `_hlPolys` — regions, sets, basins */
    lines: (v) => (v || []).map((l) => l && (l.name || l.key)),             /* `_hlLines` — rivers and tributaries */
    choro: (v) => Object.keys(v || {}),                          /* `_choroState` — the shaded countries */
    /* (#R760) the place outline js/map-tools.js `IntMapOutline` holds. It paints its own source, so
       no count in `paintNow()` moves when the SAME place is outlined again; measured on production
       2026-09-16, 「Compute the total area of the Amazon basin and show it on the map」 ran
       `map.outline` four times, two of them `not_rendered`, with the basin on the map throughout. */
    /* ⚠⚠⚠ (#R802) THE PINS WERE THE ONE PAINTED SURFACE WITH NO READING HERE. Five capabilities put
       markers on the map — every row whose expectation is `map.poi`: `map.poi`, `research.mapReport`,
       `research.situationMap`, `research.impact`, `research.events` — and none of them could be judged
       by anything but the CARDINAL in `paintNow()` (`nlq-poi-src`'s feature count), which is exactly the
       reading #R742 showed cannot tell a repaint of the same places from a repaint of different ones.
       Measured on production 2026-09-17:「1914年のヨーロッパの国境…」ran `research.situationMap` SIX
       times, alternating `ok` and `not_rendered` over pins that had been correct since the first call;
       「日本の令制国を1750年の地図に…」ran it SEVEN times in 9m16s; both died at `step_budget`, and the
       reader was told the turn had hit its working limit.
       ⚠ THE IDENTITY IS THE NAME, BECAUSE THE FEATURE id IS THE ARRAY INDEX. js/atlas-console.js
       `paintPois` numbers the features by their position in `_pois`, so a redraw renumbers them and an
       index states nothing that survives one. The name is the field every pinner fills and the only one
       a reader can say back. A pin with no name contributes nothing, exactly like an unnamed tributary
       above — and a painter holding ONLY unnamed pins must declare no `poi` surface at all, or the empty
       list would claim 「there should be no pins」 (js/atlas-capabilities.js `PAINT_GOAL`, #R747). */
    poi: (v) => (v || []).map((p) => p && p.name),                /* `_pois` — the markers, by name */
    outline: (v) => (v ? [v] : [])                                /* `IntMapOutline.current().name` */
  };
  /* sorted, de-duplicated, and WITHOUT the nameless: an unnamed tributary has no identity to state,
     and inventing one (its index, its position in the array) would make a redraw look like a change. */
  function identities(list) {
    const seen = Object.create(null), out = [];
    (list || []).forEach((x) => { const s = String(x == null ? '' : x); if (s && !seen[s]) { seen[s] = 1; out.push(s); } });
    return out.sort();
  }
  function paintState(get) {
    return { now: function () {
      try {
        const ids = {};
        /* a surface the supplier does not hold is LEFT OUT, never reported as an empty one: the
           verdict reads a missing key as「could not be observed」and refuses to claim anything. */
        Object.keys(PAINTED_IDS).forEach((k) => { if (typeof get[k] === 'function') ids[k] = identities(PAINTED_IDS[k](get[k]())); });
        return { hlCountries: get.countries().size, hlEra: get.era().length, hlPolys: get.polys().length,
          hlLines: get.lines().length, choro: Object.keys(get.choro() || {}).length, choroMetric: get.metric() || '',
          ids: ids };
      } catch (_) { return null; }   /* unreadable is not zero: `null` says the state could not be observed */
    } };
  }
  return { eraGeomsFor, ensureEraHlLayers, eraBoxFor, paintState };
}
