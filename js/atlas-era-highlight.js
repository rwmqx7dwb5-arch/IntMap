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
  return { eraGeomsFor, ensureEraHlLayers };
}
