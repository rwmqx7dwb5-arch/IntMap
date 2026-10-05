/* ==========================================================================
 * scripts/histrecon/atoms/ne-admin1.mjs   (hist-reconstruction · atom set «ne-admin1@<sha>»)
 *
 * ATOMS = Natural Earth 10m admin-1 states/provinces at FULL precision, pinned to one commit of
 * nvkelso/natural-earth-vector so the same dossier always assembles the same bytes.
 *
 * ⚠ The shipped data/admin1-world.json.gz is the SAME source simplified at 0.01° and keyed by ISO 3166-2,
 *   and ISO codes are not unique inside it (measured 2026-10-05: Madagascar's 22 regions carry 6 codes,
 *   Ireland's counties repeat IE-D…). A dossier names an atom by NE's own `adm1_code`, which is unique
 *   (4,596 features, 0 repeats on the pinned commit).
 *
 * Licence: Natural Earth — public domain ("No permission is needed to use Natural Earth", naturalearthdata.com/about/terms-of-use).
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const SHA = 'ca96624a56bd078437bca8184e78163e5039ad19';
export const SET = 'ne-admin1@ca96624';
export const SOURCE = {
  publisher: 'Natural Earth',
  title: 'Admin 1 – States, Provinces (1:10m), natural-earth-vector commit ' + SHA.slice(0, 7),
  url: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/',
  licence: 'Public domain',
  licenceUrl: 'https://www.naturalearthdata.com/about/terms-of-use/',
};
const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/' + SHA + '/geojson/ne_10m_admin_1_states_provinces.geojson';

export function cacheDir() {
  const d = process.env.INTMAP_HISTRECON_CACHE || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'intmap-histrecon-cache');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

let _fc = null;
async function collection() {
  if (_fc) return _fc;
  const file = path.join(cacheDir(), 'ne_10m_admin1-' + SHA.slice(0, 7) + '.geojson');
  if (!fs.existsSync(file)) {
    const legacy = path.join(cacheDir(), 'ne_10m_admin1.geojson');
    const legacySha = path.join(cacheDir(), 'ne_10m_admin1.sha');
    if (fs.existsSync(legacy) && fs.existsSync(legacySha) && fs.readFileSync(legacySha, 'utf8').trim() === SHA) fs.copyFileSync(legacy, file);
    else {
      const r = await fetch(URL);
      if (!r.ok) throw new Error('Natural Earth ' + r.status + ' ' + URL);
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
  }
  _fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  return _fc;
}

/** { [ISO3 adm0_a3]: [{id, iso, name, name_en, name_ja, type, region, wikidata, hasc}] } — what a dossier may name */
export async function catalogue() {
  const fc = await collection();
  const out = {};
  for (const f of fc.features) {
    const p = f.properties;
    (out[p.adm0_a3] ||= []).push({ id: p.adm1_code, iso: p.iso_3166_2, name: p.name, name_en: p.name_en, name_ja: p.name_ja || null,
      type: p.type_en, region: p.region || null, wikidata: p.wikidataid || null, hasc: p.code_hasc || null });
  }
  return out;
}

/** Map adm1_code → MultiPolygon coordinates (full precision, as published) */
export async function geometries() {
  const fc = await collection();
  const out = new Map();
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    out.set(f.properties.adm1_code, g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
  }
  return out;
}
