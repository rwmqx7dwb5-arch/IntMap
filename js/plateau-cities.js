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
 *  HEIGHTS. PLATEAU 3D Tiles state heights above the ellipsoid; nothing here applies a geoid
 *  offset. If a measurement shows buildings floating or sunk against the terrain, the correction
 *  belongs in `heightOffset` below with the measurement that justified it — not as a guess.
 * ==========================================================================*/
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
  return PLATEAU_CITY_CODES.map((code) => ({ id: plateauTilesetId(code), spec: { url: plateauTilesetUrl(code) } }));
}
