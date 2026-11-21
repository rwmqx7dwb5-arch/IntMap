// @ts-check
/* ============================================================================
 *  IntMap · js/world-3d-sources.js — the 3D building tilesets BEYOND Japan's PLATEAU (js/plateau-cities.js)
 * ----------------------------------------------------------------------------
 *  Order of preference where a place is covered more than once (`quality`): PLATEAU (textured LOD2, Japan) >
 *  3D BAG (LoD2.2 from the national cadastre, the Netherlands) > Re:Earth Buildings (worldwide extrusions from Overture
 *  + OpenStreetMap). The OpenFreeMap footprint extrusion of the "3D buildings (cities)" layer stays the fallback when
 *  none of these is reachable. A better dataset's extent is cut out of a worse one (engine `placeTileset` excludeBoxes),
 *  so two sets never paint the same street.
 *
 *  LICENCES (checked 2026-11-20; IntMap is commercial, so share-alike is fine and non-commercial is not — see the
 *  commercial-licence memory): Re:Earth Buildings and its inputs OSM / Overture: ODbL 1.0 (credit required; the tileset
 *  carries it in asset.copyright). 3D BAG: CC BY 4.0, credit required, "volume of usage is not limited, but this may
 *  change" (docs.3dbag.nl/en/delivery/webservices). Neither needs a key or account.
 *  RELIABILITY. Re:Earth states "best-effort community service with no SLA" and asks for a mirror before production
 *  traffic. The layer therefore degrades to the footprint extrusion instead of showing an error, and the load is
 *  bounded: one worldwide tileset opened only from `minZoom`, under the device's shared tile budget (js/tileset-budget.js).
 *
 *  HEIGHTS. Both state ellipsoidal heights; the globe's ground is a sea-level DEM, so each is set down by the local geoid
 *  undulation N (js/geoid.js) at the camera. Measured against rendered tiles: dev-notes/2026-11-20-world-3d-buildings.md.
 *
 *  ADDING A SOURCE is one row here (id, url, extent, quality, licence, credit) plus its outbound host in
 *  scripts/outbound-hosts.json; the selection, geoid, exclusion and budget are shared.
 * ==========================================================================*/
import { distanceToBoxKm } from './plateau-cities.js';

/** @typedef {{id:string,name:string,url:string,bbox:number[],minZoom:number,quality:number,licence:string,licenceUrl:string,credit:string,provider:string}} World3dSource */

/** @type {World3dSource[]} */
export const WORLD_3D_SOURCES = [
  { id: 'reearth-buildings', name: 'Re:Earth Buildings', url: 'https://buildings.reearth.land/tileset.json',
    bbox: [-180, -85, 180, 85], minZoom: 12, quality: 1, provider: 'Eukarya Inc. (Re:Earth)',
    licence: 'ODbL 1.0', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    credit: 'Buildings: Re:Earth Buildings, © OpenStreetMap contributors, Overture Maps Foundation (ODbL)' },
  { id: '3dbag', name: '3D BAG', url: 'https://data.3dbag.nl/v20250903/cesium3dtiles/lod22/tileset.json',
    bbox: [3.2, 50.7, 7.3, 53.6], minZoom: 10, quality: 2, provider: '3DBAG (TU Delft 3D geoinformation and 3DGI)',
    licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    credit: '3D BAG — 3dbag.nl (TU Delft, 3DGI), CC BY 4.0' },
];

export const worldTilesetId = (/** @type {string} */ id) => 'world3d-' + id;

/** the km around the camera within which a dataset is wanted: the same "about one screen of ground" rule as the PLATEAU units */
function radiusKm(zoom, lat) { return Math.max(12, Math.min(60, 40075 * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom))); }

/**
 * Which worldwide/national sources a camera wants open. A source opens from its `minZoom` while the camera is within its
 * extent (or the radius of it), and `open` ids get a 1.5x hysteresis.
 * @param {World3dSource[]} sources @param {{lng:number,lat:number,zoom:number}} cam @param {Set<string>} [open]
 */
export function worldSourcesNear(sources, cam, open) {
  const r = radiusKm(cam.zoom, cam.lat);
  return sources.filter((s) => cam.zoom >= s.minZoom && distanceToBoxKm(cam.lng, cam.lat, s.bbox) <= (open && open.has(s.id) ? r * 1.5 : r));
}

/**
 * The lng/lat boxes a source must NOT draw inside: the extents of every open dataset of higher quality. `betterBoxes` are
 * `{quality, bbox}` for what is open (PLATEAU units carry quality 3).
 * @param {number} quality @param {{quality:number,bbox:number[]}[]} betterBoxes @returns {number[][]}
 */
export function excludeBoxesFor(quality, betterBoxes) {
  return betterBoxes.filter((b) => b.quality > quality).map((b) => b.bbox);
}

/** the quality a PLATEAU unit carries in the ordering above */
export const PLATEAU_QUALITY = 3;
