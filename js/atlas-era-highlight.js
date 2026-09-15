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
  function paintState(get) {
    return { now: function () {
      try {
        return { hlCountries: get.countries().size, hlEra: get.era().length, hlPolys: get.polys().length,
          hlLines: get.lines().length, choro: Object.keys(get.choro() || {}).length, choroMetric: get.metric() || '' };
      } catch (_) { return null; }   /* unreadable is not zero: `null` says the state could not be observed */
    } };
  }
  return { eraGeomsFor, ensureEraHlLayers, eraBoxFor, paintState };
}
