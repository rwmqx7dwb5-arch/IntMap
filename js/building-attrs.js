// @ts-check
/* ============================================================================
 *  IntMap · js/building-attrs.js — WHAT A PICKED 3D BUILDING SAYS ABOUT ITSELF
 * ----------------------------------------------------------------------------
 *  The 3D city layer opens three datasets (js/world-3d-sources.js, js/plateau-cities.js). Each carries the
 *  attributes of its buildings in its own tiles, under its own names. This file turns "the properties of the
 *  Cesium3DTileFeature that was clicked" into one list: a title, the height, and rows keyed by what they are (use,
 *  year, storeys…) — and keeps EVERY property it did not name under "all attributes", so nothing the dataset states is
 *  hidden. The WORDS shown for a key are js/building-info.js's (en + jp through the language helper); this file holds data.
 *
 *  THE FIELD NAMES BELOW WERE READ OFF THE DATASETS' OWN TILES, NOT ASSUMED (2026-11-24, dev-notes/2026-11-24-atlas-render-
 *  observer-bldg-attrs.md §2): 3D BAG's glb carries EXT_structural_metadata with `oorspronkelijkbouwjaar`, `b3_bouwlagen`,
 *  `b3_h_nok`, `b3_h_maaiveld`, `status`, `identificatie`; Re:Earth Buildings' carries `height`, `min_height`, `num_floors`,
 *  `roof_shape`, `subtype`, `class`, `name`, `height_method`, `gers_id`, `source_height`; PLATEAU's b3dm batch table carries
 *  `gml:name`, `bldg:measuredHeight`, `bldg:usage`, `bldg:class`, `bldg:storeysAboveGround`, `bldg:yearOfConstruction` (when the
 *  city recorded it), `bldg:address`, `uro:*`. EXPIRES when a dataset renames a field: a field that is not there simply
 *  does not get a row (nothing is guessed), and the raw list still shows what the tile does carry.
 *
 *  ⚠ A VALUE IS SHOWN ONLY IF THE DATASET STATES IT. Re:Earth's `height` is "resolved via height_method" — so the headline
 *  carries HOW it was set next to the number, instead of presenting a default as a measurement (historical-verification.md
 *  §2-3: a filled field is not a stated one). 3D BAG states a ridge height and a ground height, never a "building height":
 *  the headline is their difference and says so. The values a source wrote (PLATEAU's Japanese usage classes, Dutch status
 *  codes) are carried as the source wrote them (CONSTITUTION §7).
 * ==========================================================================*/
import { WORLD_3D_SOURCES, worldTilesetId } from './world-3d-sources.js';
import { plateauTilesetId } from './plateau-cities.js';

/** @typedef {{key:string,value:string}} Row */
/** @typedef {{value:string,note?:{code:'ridge-derived'|'height-method',arg?:string}}} Headline */
/** @typedef {{dataset:string,datasetName:string,credit:string,licence:string,licenceUrl:string,title:string,headline:Headline|null,rows:Row[],all:[string,string][]}} Described */

const NODATA = (/** @type {any} */ v) => v === undefined || v === null || v === '' || (typeof v === 'number' && !isFinite(v)) || v === ' ' || v === 3.4028234663852886e+38 || v === 2147483647 || v === 127;

/** @param {any} v @param {number} [d] */
const metres = (v, d = 1) => (typeof v === 'number' && isFinite(v)) ? (Math.round(v * 10 ** d) / 10 ** d) + ' m' : null;
/** @param {any} v */
const int = (v) => { const n = Number(v); return isFinite(n) && n > 0 ? String(Math.round(n)) : null; };
/** @param {any} v */
const text = (v) => (NODATA(v) ? null : String(v).trim() || null);
/** a calendar year a building could really have been built in */
const year = (/** @type {any} */ v) => { const n = Number(v); return isFinite(n) && n >= 1000 && n <= 2100 ? String(Math.round(n)) : null; };

/** Per dataset: which property feeds which row (`[key, read]`; read → null means no row). */
const FIELDS = {
  plateau: {
    title: (/** @type {any} */ p) => text(p['gml:name']) || text(p['bldg:address']),
    height: (/** @type {any} */ p) => { const h = metres(p['bldg:measuredHeight']); return h ? { value: h } : null; },
    rows: [
      ['usage', (/** @type {any} */ p) => text(p['bldg:usage'])],
      ['class', (/** @type {any} */ p) => text(p['bldg:class'])],
      ['year', (/** @type {any} */ p) => year(p['bldg:yearOfConstruction'])],
      ['floorsAbove', (/** @type {any} */ p) => int(p['bldg:storeysAboveGround'])],
      ['floorsBelow', (/** @type {any} */ p) => int(p['bldg:storeysBelowGround'])],
      ['fireproof', (/** @type {any} */ p) => text(p['uro:BuildingDetailAttribute_uro:fireproofStructureType'])],
      ['zone', (/** @type {any} */ p) => text(p['uro:BuildingDetailAttribute_uro:districtsAndZonesType'])],
      ['address', (/** @type {any} */ p) => text(p['bldg:address'])],
      ['id', (/** @type {any} */ p) => text(p['uro:BuildingIDAttribute_uro:buildingID']) || text(p['gml:id'])],
    ],
  },
  '3dbag': {
    title: () => null,
    height: (/** @type {any} */ p) => { const n = Number(p.b3_h_nok), g = Number(p.b3_h_maaiveld); return (!NODATA(p.b3_h_nok) && !NODATA(p.b3_h_maaiveld) && isFinite(n) && isFinite(g) && n >= g) ? { value: metres(n - g), note: { code: 'ridge-derived' } } : null; },
    rows: [
      ['year', (/** @type {any} */ p) => year(p.oorspronkelijkbouwjaar)],
      ['floors', (/** @type {any} */ p) => (NODATA(p.b3_bouwlagen) ? null : int(p.b3_bouwlagen))],
      ['roof', (/** @type {any} */ p) => text(p.b3_dak_type)],
      ['status', (/** @type {any} */ p) => text(p.status)],
      ['id', (/** @type {any} */ p) => text(p.identificatie)],
    ],
  },
  'reearth-buildings': {
    title: (/** @type {any} */ p) => text(p.name),
    height: (/** @type {any} */ p) => { if (NODATA(p.height)) return null; const m = text(p.height_method); return { value: metres(Number(p.height)), ...(m ? { note: { code: 'height-method', arg: m } } : {}) }; },
    rows: [
      ['type', (/** @type {any} */ p) => [text(p.subtype), text(p.class)].filter((x, i, a) => x && a.indexOf(x) === i).join(' / ') || null],
      ['floors', (/** @type {any} */ p) => int(p.num_floors)],
      ['roof', (/** @type {any} */ p) => text(p.roof_shape)],
      ['raised', (/** @type {any} */ p) => (Number(p.min_height) > 0 ? metres(Number(p.min_height)) : null)],
      ['sourceHeight', (/** @type {any} */ p) => (NODATA(p.source_height) || !Number(p.source_height) ? null : metres(Number(p.source_height)))],
      ['id', (/** @type {any} */ p) => text(p.gers_id)],
    ],
  },
};

/** which dataset a tileset id belongs to: 'plateau' | a WORLD_3D_SOURCES id | null */
export function datasetOfTileset(/** @type {string} */ tilesetId) {
  const id = String(tilesetId || '');
  const w = WORLD_3D_SOURCES.find((s) => worldTilesetId(s.id) === id);
  if (w) return w.id;
  return id.startsWith(plateauTilesetId('')) ? 'plateau' : null;
}

const PLATEAU_CREDIT = { name: 'PLATEAU (MLIT Japan)', credit: '3D city model: PLATEAU, Ministry of Land, Infrastructure, Transport and Tourism (MLIT)', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/' };

/** @param {any} v */
function show(v) { if (v === undefined || v === null) return ''; if (typeof v === 'object') { try { return JSON.stringify(v); } catch (_) { return ''; } } return String(v); }

/**
 * @param {string} tilesetId the engine's id of the tileset the feature belongs to
 * @param {Record<string, any>} props every property the picked feature carries
 * @returns {Described|null} null when the tileset is not one of the building datasets
 */
export function describeBuilding(tilesetId, props) {
  const ds = datasetOfTileset(tilesetId); if (!ds) return null;
  const p = props || {}; const spec = /** @type {any} */ (FIELDS)[ds]; if (!spec) return null;
  const src = ds === 'plateau' ? PLATEAU_CREDIT : (() => { const s = WORLD_3D_SOURCES.find((x) => x.id === ds); return s ? { name: s.name, credit: s.credit, licence: s.licence, licenceUrl: s.licenceUrl } : PLATEAU_CREDIT; })();
  /** @type {Row[]} */ const rows = [];
  for (const [key, get] of spec.rows) { let v = null; try { v = get(p); } catch (_) { v = null; } if (v) rows.push({ key, value: v }); }
  /** @type {Headline|null} */ let headline = null; try { headline = spec.height(p); } catch (_) { headline = null; }
  let title = null; try { title = spec.title(p); } catch (_) { title = null; }
  const skip = (/** @type {string} */ k) => k === 'attributes' || k.startsWith('_') || k === 'feature_id';
  /** @type {[string,string][]} */ const all = Object.keys(p).filter((k) => !skip(k) && !NODATA(p[k])).sort().map((k) => /** @type {[string,string]} */ ([k, show(p[k])])).filter((e) => e[1] !== '' && e[1].length < 400);
  return { dataset: ds, datasetName: src.name, credit: src.credit, licence: src.licence, licenceUrl: src.licenceUrl, title: title || '', headline, rows, all };
}
