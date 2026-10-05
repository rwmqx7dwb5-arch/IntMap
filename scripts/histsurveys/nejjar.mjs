#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HARVESTER — Nejjar (Oxford), georeferenced Ottoman / French-Mandate administrative maps
 *  (Harvard Dataverse). FIRST-LEVEL units only.
 * ----------------------------------------------------------------------------
 *  DATASETS (all three: author Nejjar, Oxford; Dataverse release 2024-01-16)
 *   · doi:10.7910/DVN/YOHIFN  «Palestine administrative boundaries 1896»   (Cuinet's map, 1896)
 *       layers vilayets_1896 (7 polygons), sanjak_1896, kaza_1896. ONLY vilayets_1896 is first level.
 *   · doi:10.7910/DVN/ZDC06B  «Syria and Lebanon administrative boundaries 1926» (Bureau Topographique de
 *       l'Armée française du Levant, 1926)
 *       layers state_borders (4 polygons) — the Mandate's first-level States; sandjak_and_district, kaza,
 *       western_limit_of_nomadic_zone are NOT harvested (second level / a line).
 *   · doi:10.7910/DVN/W8E24J  «Palestine administrative boundaries 1843» (Hughes' map, 1843) is NOT
 *       HARVESTED. Its only layer, districts_1843, holds 30 polygons named el-Kharnub, Belad Besharah,
 *       Safed, Nabulus, Yafa, el-Kuds, Ghuzzeh, Jaulan, el-Lejah, el-Belka … — the Ottoman districts
 *       (nahiye / kaza level, below the sanjak and the eyalet). The map states no eyalet or sanjak
 *       outline, so there is no first-level unit in it, and drawing districts as provinces would say
 *       what the publisher does not.
 *
 *  LICENCE EVIDENCE (Dataverse API, checked 2026-10-05, same answer for all three DOIs):
 *   GET https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/<id>
 *     data.latestVersion.license = { "name": "CC0 1.0", "uri": "http://creativecommons.org/publicdomain/zero/1.0",
 *       "rightsIdentifier": "CC0-1.0" } ; versionState RELEASED ; termsOfUse empty.
 *   fetchRaw() re-reads that field for the two harvested DOIs and refuses to cache if it is no longer
 *   CC0 1.0 (the licence is a value, not an assumption).
 *
 *  CRS: vilayets_1896 and state_borders carry EPSG:3857 (WGS 84 / Pseudo-Mercator, metres) → converted
 *  with webMercatorToWgs84 from scripts/lib/elections-geo.mjs. harvest() throws if a .prj is neither
 *  Web Mercator nor geographic WGS84.
 *
 *  WHAT THE PUBLISHER STATES / DOES NOT STATE
 *   · Each layer is one dated map («Year: 1896», «Year: 1926» in mena_historic_shapefiles_2.0.pdf, the
 *     documentation shipped on every dataset). There is no per-unit date: the start is that year, YEAR
 *     precision; the end is DERIVED as the next 1 January (endDerived, endBasis says so). The unit is
 *     stated for that year only.
 *   · sovereign: no ISO 3166 / CShapes code exists for either state, so these are plain labels, not
 *     codes:  'OTTOMAN' (the Ottoman Empire, 1896) and 'FRA-MANDATE' (the French Mandate for Syria and
 *     the Lebanon, 1926; France held the Mandate, the States are its divisions, not parts of France).
 *   · Labels are the publisher's own French text, verbatim, in names.fr (the 1926 ones are capitals:
 *     «ETAT DU GRAND LIBAN»). en is IntMap's reading.
 *
 *  ⚠ CLIPPING — IS THE OUTLINE THE UNIT'S? (measured 2026-10-05; the publisher says «Eastern borders show
 *  the extent of the underlying raster file and are arbitrary» for 1896, and «Some eastern, northern and
 *  southern borders are arbitrary» for 1843). The dataset covers Palestine, not the Empire.
 *   Test, derived from the layer rather than a list of names: a unit is CLIPPED when its outline has a
 *   straight edge longer than 10× the layer's median edge. A traced political border is generalised to a
 *   steady vertex spacing; a map neat-line is one straight run. Measured on vilayets_1896 (median edge
 *   ≈0.02°): Damas 5.81° (the raster's east edge, 37.397,35.516 → 37.21,29.713, plus a flat south edge at
 *   29.71), Alep 0.51° (north edge at 35.94) and 0.41° (east edge at 37.40), Hedjaz 0.84° and 0.77°
 *   (south edge at 29.43); every other unit's longest edge is ≤ 0.06°.  state_borders: see below.
 *   The test is applied ONLY where the publisher states the arbitrary edge (vilayets_1896; the 1926
 *   documentation states none and its sheet covers the whole Mandate). state_borders has long edges too —
 *   Syria 2.36° (39.80,34.01 → 37.71,32.93, the desert line toward Transjordan/Iraq), Djebel Druze 0.91°
 *   (37.64,32.89 → 36.83,32.47) — but those are treaty / administrative lines, not neat-lines; edge
 *   length alone cannot tell the two, so the publisher's note decides and they are NOT clipped.
 *   admits() excludes the clipped with reason «clipped to the study area — the outline is not the unit's».
 *   · NOT detectable by edge length — Vilayet de Beyrouth (id 4): the 1896 vilayet of Beirut was two
 *     separate pieces (Acre/Nablus coast in the south, Tripoli/Latakia in the north) either side of the
 *     Mount Lebanon Mutasarrifate. The publisher drew both but «left some labels undefined»: the
 *     southern piece (id 2, 32.02–33.65°N) has no name, the northern (id 4) is named. Drawing id 4
 *     alone is half a vilayet under the whole's name, so it is excluded by id with that reason
 *     (KNOWN_PART below — a single stated case; it can go the day the publisher names id 2, which
 *     harvest() checks: it fails loudly if id 2 ever gets a name).
 *   · Admitted: Mutessariflik de Jerusalem (id 1) and Mutessariflik du Liban (id 3), both closed
 *     outlines with no neat-line edge; the four 1926 States.
 * ==========================================================================*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readShp, readDbf, webMercatorToWgs84 } from '../lib/elections-geo.mjs';

export const SOURCE = {
  key: 'nejjar',
  publisher: 'Nejjar (University of Oxford), via Harvard Dataverse',
  title: 'Palestine administrative boundaries 1896; Syria and Lebanon administrative boundaries 1926',
  url: 'https://doi.org/10.7910/DVN/YOHIFN',
  download: 'https://dataverse.harvard.edu/api/access/datafile/',
  licence: 'CC0 1.0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  licenceStatedAt: 'https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/YOHIFN (and doi:10.7910/DVN/ZDC06B): latestVersion.license.name = "CC0 1.0"',
  citation: 'Nejjar. Palestine administrative boundaries 1896 (doi:10.7910/DVN/YOHIFN) and Syria and Lebanon administrative boundaries 1926 (doi:10.7910/DVN/ZDC06B). Harvard Dataverse, 2024. After Cuinet, Syrie, Liban et Palestine (1896), and Bureau Topographique de l\'Armee francaise du Levant, Carte de Syrie et du Liban (1926).',
};

const CACHE = path.join(os.tmpdir(), 'intmap-histsurveys-cache', 'nejjar');
/* Dataverse file ids (from the dataset JSON, 2026-10-05) */
const FILES = {
  'vilayets_1896.shp': 8106228, 'vilayets_1896.dbf': 8106238, 'vilayets_1896.prj': 8106237,
  'state_borders.shp': 8106265, 'state_borders.dbf': 8106262, 'state_borders.prj': 8106256,
};
const DOIS = ['YOHIFN', 'ZDC06B'];

/* the single stated case that edge length cannot see (see header): a named half of a two-piece vilayet */
const KNOWN_PART = { layer: 'vilayets_1896', id: 4, partnerId: 2 };

const LAYERS = [
  { stem: 'vilayets_1896', year: 1896, sovereign: 'OTTOMAN', clipStated: true },
  { stem: 'state_borders', year: 1926, sovereign: 'FRA-MANDATE', clipStated: false },
];

const EN = {
  'Mutessariflik de Jerusalem': 'Mutasarrifate of Jerusalem',
  'Mutessariflik du Liban': 'Mutasarrifate of Mount Lebanon',
  'Vilayet de Beyrouth': 'Vilayet of Beirut',
  "Vilayet d'Alep": 'Vilayet of Aleppo',
  "Vilayet de l'Hedjaz": 'Vilayet of the Hejaz',
  'Vilayet Damas': 'Vilayet of Damascus (Syria)',
  'ETAT DU GRAND LIBAN': 'State of Greater Lebanon',
  'ETAT DES ALAOUITES': 'Alawite State',
  'ETAT DU DJEBEL DRUZE': 'State of Jabal Druze',
  'ETAT DE SYRIE': 'State of Syria',
};

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('nejjar HTTP ' + r.status + ' ' + url);
  return r.json();
}

export async function fetchRaw() {
  fs.mkdirSync(CACHE, { recursive: true });
  const stamp = path.join(CACHE, 'licence.json');
  if (Object.keys(FILES).every((f) => fs.existsSync(path.join(CACHE, f))) && fs.existsSync(stamp)) return CACHE;
  const lic = {};
  for (const d of DOIS) {
    const j = await getJson('https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/' + d);
    const l = j.data.latestVersion.license;
    if (!l || l.name !== 'CC0 1.0') throw new Error('nejjar ' + d + ' licence is no longer CC0 1.0: ' + JSON.stringify(l));
    lic[d] = l.name;
  }
  for (const [name, id] of Object.entries(FILES)) {
    const res = await fetch('https://dataverse.harvard.edu/api/access/datafile/' + id, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error('nejjar download ' + res.status + ' ' + name);
    fs.writeFileSync(path.join(CACHE, name + '.part'), Buffer.from(await res.arrayBuffer()));
    fs.renameSync(path.join(CACHE, name + '.part'), path.join(CACHE, name));
  }
  fs.writeFileSync(stamp, JSON.stringify({ checked: new Date().toISOString().slice(0, 10), licence: lic }));
  return CACHE;
}

const r4 = (n) => Math.round(n * 1e4) / 1e4;
function ringClean(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [r4(x), r4(y)];
    const q = out[out.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push([out[0][0], out[0][1]]);
  return out.length >= 4 ? out : null;
}
function toMulti(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map((poly) => poly.map(ringClean).filter(Boolean)).filter((poly) => poly.length);
}
const edges = (coords) => {
  const out = [];
  for (const poly of coords) for (const ring of poly) for (let i = 1; i < ring.length; i++) out.push(Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
  return out;
};
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

export async function harvest() {
  if (!fs.existsSync(path.join(CACHE, 'licence.json'))) throw new Error('nejjar cache missing — run with --fetch first');
  const units = [], dropped = [];
  for (const L of LAYERS) {
    const prj = fs.readFileSync(path.join(CACHE, L.stem + '.prj'), 'latin1');
    const mercator = /Mercator_Auxiliary_Sphere|Pseudo-Mercator/i.test(prj);
    if (!mercator && (/PROJCS/i.test(prj) || !/WGS_1984/i.test(prj))) throw new Error('nejjar ' + L.stem + ' .prj is neither Web Mercator nor geographic WGS84: ' + prj.slice(0, 120));
    const geoms = readShp(fs.readFileSync(path.join(CACHE, L.stem + '.shp')));
    const rows = readDbf(fs.readFileSync(path.join(CACHE, L.stem + '.dbf')), 'utf8');
    if (geoms.length !== rows.length) throw new Error('nejjar ' + L.stem + ' shp/dbf disagree');
    const built = [];
    rows.forEach((r, i) => {
      const key = 'nejjar:' + L.stem + ':' + r.id;
      const name = String(r.name || '').trim();
      if (!name) { dropped.push({ id: key, name: null, reason: 'no name — the publisher left this label undefined (pdf: «Some labels are ambiguous and are left undefined»)' }); return; }
      if (!geoms[i]) { dropped.push({ id: key, name, reason: 'no geometry' }); return; }
      const g = geoms[i];
      const conv = (poly) => poly.map((ring) => ring.map((c) => (mercator ? webMercatorToWgs84(c) : c)));
      const coords = toMulti({ type: g.type, coordinates: g.type === 'Polygon' ? conv(g.coordinates) : g.coordinates.map(conv) });
      if (!coords.length) { dropped.push({ id: key, name, reason: 'geometry empty after rounding' }); return; }
      built.push({ r, key, name, coords });
    });
    /* the layer's own steady vertex spacing; a neat-line is a run far longer than that */
    const med = median(built.flatMap((b) => edges(b.coords)));
    for (const b of built) {
      const longest = Math.max(...edges(b.coords));
      const clipped = L.clipStated && longest > 10 * med;
      const part = L.stem === KNOWN_PART.layer && b.r.id === KNOWN_PART.id;
      if (part) {
        const sib = rows.find((x) => x.id === KNOWN_PART.partnerId);
        if (sib && String(sib.name || '').trim()) throw new Error('nejjar: the publisher has now named id ' + KNOWN_PART.partnerId + ' — KNOWN_PART no longer needed, re-assess');
      }
      const kind = L.stem === 'state_borders' ? 'state' : /^Mutessariflik/.test(b.name) ? 'mutasarrifate' : 'vilayet';
      units.push({
        id: b.key,
        name: b.name,
        names: EN[b.name] ? { fr: b.name, en: EN[b.name] } : { fr: b.name },
        start: L.year + '-01-01', startPrecision: 'year',
        end: (L.year + 1) + '-01-01', endPrecision: 'year',
        endDerived: true,
        endBasis: 'a single-year snapshot: the publisher states these units for ' + L.year + ' only',
        sovereign: L.sovereign,
        kind,
        coords: b.coords,
        clipped: clipped || undefined,
        clipNote: (clipped || !L.clipStated) ? 'longest edge ' + longest.toFixed(2) + ' deg = ' + (longest / med).toFixed(0) + 'x the layer median edge (' + med.toFixed(3) + ')' : undefined,
        partOfTwo: part || undefined,
      });
    }
  }
  return { source: SOURCE, units, dropped };
}

/* first-level and whole: drop the clipped and the named half of a two-piece unit (see header) */
export function admits(u) {
  if (u.clipped) return "clipped to the study area — the outline is not the unit's";
  if (u.partOfTwo) return "one of two pieces of the Vilayet of Beirut; the other is unlabelled upstream — the outline is not the unit's";
  return true;
}

/* ── CLI ── */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--fetch')) console.log('cached:', await fetchRaw());
  if (args.includes('--summary')) {
    const { units, dropped } = await harvest();
    const count = (a, f) => a.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
    const verts = units.reduce((n, u) => n + u.coords.reduce((a, poly) => a + poly.reduce((b, ring) => b + ring.length, 0), 0), 0);
    console.log('units:', units.length);
    console.log('dropped:', dropped.length, JSON.stringify(count(dropped, (d) => d.reason)));
    console.log('kinds:', JSON.stringify(count(units, (u) => u.kind)));
    console.log('sovereign:', JSON.stringify(count(units, (u) => u.sovereign)));
    console.log('admitted:', units.filter((u) => admits(u) === true).length, ' excluded:', JSON.stringify(count(units.filter((u) => admits(u) !== true), (u) => admits(u))));
    console.log('total vertices:', verts);
    console.log('units:');
    for (const u of units) console.log('  ', u.id, '|', u.name, '|', u.start, '→', u.end, '|', u.kind, '|', u.sovereign, '|', admits(u) === true ? 'ADMIT' : 'EXCLUDE', u.clipNote || '');
    for (const d of dropped) console.log('  dropped', d.id, '|', d.reason);
  }
}
