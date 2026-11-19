/* ============================================================================
 *  IntMap · js/plateau-cities.js — the PLATEAU 3D city-model datasets the globe can stream
 * ----------------------------------------------------------------------------
 *  PLATEAU (Japan's Ministry of Land, Infrastructure, Transport and Tourism) publishes real
 *  building models — roofs, walls, textures — as OGC 3D Tiles through its data-catalogue API.
 *  This is what the engine's `tiles3d` capability (js/cesium-engine.js addTileset) streams; the
 *  OpenFreeMap extrusion (flat-roofed prisms from footprint + height) is the fallback everywhere
 *  else, and says nothing about roofs.
 *
 *  WHERE THE NUMBERS COME FROM. Measured 2026-11-19 against the catalogue's own listing
 *  (api.plateauview.mlit.go.jp/datacatalog/plateau-datasets): every one of the 23 special wards of
 *  Tokyo (JIS city codes 13101–13123) has a `bldg` 3D Tiles dataset with LOD2 and textures, each at
 *  `<code>-bldg-lod2-texture-latest/tileset.json`, answering with `access-control-allow-origin: *`.
 *  The catalogue lists 306 cities with building 3D Tiles; adding one is adding its JIS code here.
 *  EXPIRES when MLIT renames the `-latest` alias or retires a ward's dataset — the layer then shows
 *  that tileset's error through `tilesetInfo(id).error` instead of drawing nothing silently.
 *
 *  HEIGHTS. PLATEAU 3D Tiles state heights above the ellipsoid; the globe's ground is sea-level.
 *  PLATEAU_HEIGHT_OFFSET_M below carries the measurement and the correction.
 * ==========================================================================*/
/** Metres added to PLATEAU's ellipsoidal heights so they meet the globe's ground, which is mean-sea-level.
 *  MEASURED 2026-11-19 (tests/plateau-render-quality-profile.spec.js, Chiyoda): the lowest point of building tiles sits at
 *  37.3–40.1 m above the ellipsoid, while the terrain surface (AWS Terrarium = sea-level heights, handed to Cesium as if
 *  ellipsoidal) and the no-terrain globe both sit at about 0–3 m — buildings floated ~37 m. 36.7 m is Tokyo's geoid
 *  undulation (JGEOID2011 ≈ 36.7 m, EGM96 ≈ 36.8 m; it varies < 0.5 m across the 23 wards).
 *  EXPIRES when the terrain source becomes ellipsoidal, or when a ward set outside Tokyo is added (its undulation differs:
 *  make this a per-city lookup then). Source of truth for the number: this constant. */
export const PLATEAU_HEIGHT_OFFSET_M = -36.7;

/** JIS X 0402 codes of the cities whose building models are streamed (Tokyo's 23 special wards). */
export const PLATEAU_CITY_CODES = Object.freeze(Array.from({ length: 23 }, (_, i) => 13101 + i));

/** @param {number} code */
export function plateauTilesetUrl(code) {
  /* the host is a literal on purpose: scripts/outbound-hosts.mjs reads literals, and an assembled host would be a request the privacy ledger never learns about. The tilesets themselves point at assets.cms.plateau.reearth.io (MLIT's asset store) — disclosed beside it. */
  return `https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/${code}-bldg-lod2-texture-latest/tileset.json`;
}

/** the id each dataset is registered under in the engine */
export const plateauTilesetId = (/** @type {number} */ code) => 'plateau-bldg-' + code;

/** the engine specs for every dataset: one call per city, in order */
export function plateauSpecs() {
  return PLATEAU_CITY_CODES.map((code) => ({ id: plateauTilesetId(code), spec: { url: plateauTilesetUrl(code), heightOffset: PLATEAU_HEIGHT_OFFSET_M } }));
}
