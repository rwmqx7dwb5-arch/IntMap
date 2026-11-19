/* ============================================================================
 *  IntMap · js/plateau-cities.js — the PLATEAU 3D city-model datasets the globe can stream
 * ----------------------------------------------------------------------------
 *  PLATEAU (Japan's Ministry of Land, Infrastructure, Transport and Tourism) publishes real
 *  building models — roofs, walls, textures — as OGC 3D Tiles through its data-catalogue API.
 *  This is what the engine's `tiles3d` capability (js/cesium-engine.js addTileset) streams; the
 *  OpenFreeMap extrusion (flat-roofed prisms from footprint + height) is the fallback everywhere
 *  else, and says nothing about roofs.
 *
 *  WHICH CITIES. Not a hand list: data/plateau-cities.json is DERIVED by scripts/build-plateau-cities.mjs from
 *  the catalogue's `latest_datasets` (every city/ward with building 3D Tiles — 448 units at the 2026-11-20
 *  measurement), each unit's best LOD<=2 variant, its extent (read from the tileset's own root region) and its
 *  geoid height. Adding a city to PLATEAU adds it here by rerunning that script; nothing is enumerated by hand.
 *  Only the units near the camera are streamed (`plateauUnitsNear`) — hundreds of tilesets are never all open.
 *  EXPIRES when MLIT renames the `-latest` aliases or retires a dataset — the layer then shows that tileset's error
 *  through `tilesetInfo(id).error` instead of drawing nothing silently.
 *
 *  HEIGHTS. PLATEAU 3D Tiles state heights above the ellipsoid; the globe's ground is sea-level. Each unit carries its
 *  own `geoid` (GSI's calculator, JGEOID2011, at the unit's centre; Tokyo ≈ 36.8 m, Osaka ≈ 38 m, Sapporo ≈ 30 m, ...)
 *  and the engine is told `heightOffset = -geoid`. A single national number would float or bury every city but one
 *  (Tokyo's buildings floated ~37 m before the correction: dev-notes/2026-11-19-plateau-render-quality.md).
 * ==========================================================================*/

import { jsonWithin } from './fetch-deadline.js';

/** @typedef {{code:string,name:string,pref:string,lod:number,tex:boolean,alias:string,bbox:number[],geoid:number,bytes:number}} PlateauUnit */

/** the id each dataset is registered under in the engine */
export const plateauTilesetId = (/** @type {string|number} */ code) => 'plateau-bldg-' + code;

/** @param {PlateauUnit} u */
export function plateauTilesetUrl(u) {
  /* the host is a literal on purpose: scripts/outbound-hosts.mjs reads literals, and an assembled host would be a request the privacy ledger never learns about. The tilesets themselves point at assets.cms.plateau.reearth.io (MLIT's asset store) — disclosed beside it. */
  return `https://api.plateauview.mlit.go.jp/datacatalog/3dtiles/${u.alias}/tileset.json`;
}

/** the engine spec for one unit: its tileset URL and ITS OWN geoid correction */
export function plateauSpec(/** @type {PlateauUnit} */ u) {
  return { id: plateauTilesetId(u.code), spec: { url: plateauTilesetUrl(u), heightOffset: -u.geoid } };
}

/** @type {Promise<PlateauUnit[]>|null} */
let _registry = null;
/** the derived registry, fetched once, on first use (the layer is off by default, so nothing is read until it is switched on) */
export function loadPlateauRegistry(url = 'data/plateau-cities.json') {
  if (!_registry) /* a same-origin static file of ~90 kB: 25 s is the engine-wide read budget (js/fetch-deadline.js), not a measurement */
  _registry = jsonWithin(url, 25000).then((j) => j.units).catch((e) => { _registry = null; throw e; });
  return _registry;
}

/** great-circle-ish distance in km from a point to a lng/lat box (0 when inside); equirectangular is exact enough at the tens of km this is used at */
export function distanceToBoxKm(lng, lat, /** @type {number[]} */ bbox) {
  const [w, s, e, n] = bbox, dLat = lat < s ? s - lat : lat > n ? lat - n : 0, dLng0 = lng < w ? w - lng : lng > e ? lng - e : 0;
  const dLng = Math.min(dLng0, 360 - dLng0), k = 111.195;
  return Math.hypot(dLat * k, dLng * k * Math.cos(lat * Math.PI / 180));
}

/** below this zoom a building is sub-pixel: nothing is streamed (measured by eye 2026-11-20: roofs read from ~z11, blocks from ~z9) */
export const PLATEAU_MIN_ZOOM = 9;
/** the most tilesets open at once (23 wards were open at once before and the engine held 503 MB: js/cesium-engine.js _governTilesets) */
export const PLATEAU_MAX_OPEN = 32;

/** the km around the camera whose units are wanted: about one screen's width of ground, floored and capped */
export function plateauRadiusKm(zoom, lat) {
  const screenKm = 40075 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom);
  return Math.max(12, Math.min(60, screenKm));
}

/**
 * Which units should be open for a camera: those whose extent lies within the radius, nearest first, at most
 * PLATEAU_MAX_OPEN. `open` (ids already open) get a 1.5x hysteresis so a unit at the edge does not flicker.
 * @param {PlateauUnit[]} units @param {{lng:number,lat:number,zoom:number}} cam @param {Set<string>} [open] codes
 * @returns {PlateauUnit[]}
 */
export function plateauUnitsNear(units, cam, open) {
  if (!(cam.zoom >= PLATEAU_MIN_ZOOM)) return [];
  const r = plateauRadiusKm(cam.zoom, cam.lat), out = [];
  for (const u of units) {
    const d = distanceToBoxKm(cam.lng, cam.lat, u.bbox);
    if (d <= (open && open.has(u.code) ? r * 1.5 : r)) out.push({ u, d });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, PLATEAU_MAX_OPEN).map((x) => x.u);
}
