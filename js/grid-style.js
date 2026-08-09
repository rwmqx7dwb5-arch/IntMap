/*  IntMap · Graticule style layers  (#R210)
 *
 *  The eight style layers the graticule draws with, lifted out of js/app-body.js's style literal.
 *
 *  ⚠ WHY A NAMED EXPORT AND NOT `IM_READOUT.gridLayerSpecs()`:
 *  js/map-readout.js owns the graticule GEOMETRY (buildGridFeatures), so that is where these
 *  belong by subject — but `const IM_READOUT = window.IntMapModules.mapReadout(IM_HOST)` is
 *  ~300 lines BELOW the style literal in js/app-body.js's factory body, and the style literal
 *  runs at instantiate time. Reaching for it there is a temporal-dead-zone reference, which in
 *  this project means the whole boot is lost with one ReferenceError (#R200 §1, measured). An
 *  ES import is initialised before any of the module body runs, so calling this at style-build
 *  time cannot be early. Same shape as js/lazy-modules.js (#R209).
 *
 *  ⚠ THE FEATURE `kind` VALUES ARE A CONTRACT with js/map-readout.js's buildGridFeatures():
 *  'major' | 'minor' | 'equator' | 'prime' | 'tropic' | 'cross'. `grid-lines` is everything that
 *  is NOT one of the named singles, so any new named kind must also be excluded there or it will
 *  be painted twice — once as itself and once as a plain graticule line.
 */
export function gridLayerSpecs() {
  const sz = (v) => window.IntMapLabelScale.sub(v);
  /* (#R210) WHITE, not blue ("グリッド線の色は青ではなく白に"). `grid-lines-casing` is a dark,
     wider, low-opacity stroke UNDER the white one — without it a white line over the LIGHT
     basemap is white-on-white, so the casing is what makes "white" mean visible in both themes
     instead of only over dark imagery. */
  const notSingle = ['all', ['==', '$type', 'LineString'],
    ['!=', 'kind', 'equator'], ['!=', 'kind', 'prime'], ['!=', 'kind', 'tropic']];
  const byRank = (major, minor) => ['case', ['==', ['get', 'kind'], 'major'], major, minor];
  return [
    { id: 'grid-lines-casing', type: 'line', source: 'grid-source', filter: notSingle,
      paint: { 'line-color': '#000000', 'line-opacity': byRank(0.30, 0.18), 'line-width': byRank(3.2, 2.2) } },
    { id: 'grid-lines', type: 'line', source: 'grid-source', filter: notSingle,
      paint: { 'line-color': '#ffffff', 'line-opacity': byRank(0.92, 0.60), 'line-width': byRank(1.6, 1.0) } },
    { id: 'grid-equator', type: 'line', source: 'grid-source', filter: ['==', 'kind', 'equator'],
      paint: { 'line-color': '#ff3b30', 'line-opacity': 0.95, 'line-width': 2.0 } },
    { id: 'grid-prime', type: 'line', source: 'grid-source', filter: ['==', 'kind', 'prime'],
      paint: { 'line-color': '#ff9500', 'line-opacity': 0.85, 'line-width': 1.6 } },
    /* (#R210) The tropics, in the requested 山吹色. Dashed so they read as a derived line
       (where the sun stands overhead at solstice) rather than a measured boundary. */
    { id: 'grid-tropic', type: 'line', source: 'grid-source', filter: ['==', 'kind', 'tropic'],
      paint: { 'line-color': '#f4b740', 'line-opacity': 0.92, 'line-width': 1.5, 'line-dasharray': [4, 3] } },
    { id: 'grid-tropic-label', type: 'symbol', source: 'grid-source', filter: ['==', 'kind', 'tropic'],
      layout: { 'text-field': ['get', 'label'], 'text-size': sz(0.85), 'text-font': ['literal', ['Noto Sans Regular']],
        'symbol-placement': 'line', 'symbol-spacing': 420, 'text-letter-spacing': 0.04 },
      paint: { 'text-color': '#f4b740', 'text-halo-color': 'rgba(0,0,0,0.65)', 'text-halo-width': 1.3 } },
    /* (#R210) Labels follow the lines to white-on-dark-halo — a blue numeral beside a white
       line was the last piece of the old palette still showing. */
    { id: 'grid-labels', type: 'symbol', source: 'grid-source',
      filter: ['all', ['==', '$type', 'Point'], ['!=', 'kind', 'cross']],
      layout: { 'text-field': ['get', 'label'], 'text-size': sz(0.9), 'text-font': ['literal', ['Noto Sans Regular']],
        'text-allow-overlap': false, 'text-ignore-placement': false, 'symbol-placement': 'point' },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.75)', 'text-halo-width': 1.8 } },
    { id: 'grid-labels-cross', type: 'symbol', source: 'grid-source',
      filter: ['all', ['==', '$type', 'Point'], ['==', 'kind', 'cross']],
      layout: { 'text-field': ['get', 'label'], 'text-size': sz(0.78), 'text-font': ['literal', ['Noto Sans Regular']],
        'text-allow-overlap': false, 'text-offset': [0.6, -0.6] },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.70)', 'text-halo-width': 1.5 } },
  ];
}
