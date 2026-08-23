/* ============================================================================
 *  IntMap · subcables — WHERE THE ROUTES COME FROM
 * ----------------------------------------------------------------------------
 *  Every source is fetched once into .cache/subcables/raw/ and read from there
 *  afterwards, so a rebuild is reproducible from an archived download rather
 *  than from whatever the endpoints happen to serve today (the brief's §20).
 *  `--refresh` re-downloads.
 *
 *  ── WHAT WAS INVESTIGATED, AND WHAT SURVIVED ──────────────────────────────
 *  The brief's §5 asks for the sources to be found by looking, not by name, and
 *  for each to be checked for what it actually contains. Measured, 2026-08-23:
 *
 *  KEPT — official, per-cable named, real surveyed positions
 *    noaa-mc      NOAA Office for Coastal Management, Marine Cadastre
 *                 "Submarine Cables". 2,816 corridor POLYGONS in US waters
 *                 (61 m median width); 385 carry a `cableSystem` name across
 *                 197 systems. Their medial axis is the route (see geo.mjs).
 *                 US Government work — not subject to copyright.
 *    emodnet-bsh  EMODnet Human Activities / BSH (Germany). 28 named data
 *                 cables, 341 vertices each. CC-BY 4.0.
 *    emodnet-rws  EMODnet Human Activities / Rijkswaterstaat (Netherlands).
 *                 98 + 37 named cables with owner and both trace ends, and a
 *                 `kabelsoort` that separates Telecom from Elektra. CC-BY 4.0.
 *    emodnet-mt   EMODnet Human Activities / Malta. 6 named cables. CC-BY 4.0.
 *    emodnet-sig  EMODnet Human Activities / SIG. 60 named cables. CC-BY 4.0.
 *    acma         ACMA / Geoscience Australia, "Australia's Submarine
 *                 Telecommunication Cable locations 2021". 16 named POLYLINES.
 *                 CC-BY 4.0, © Commonwealth of Australia (ACMA).
 *
 *  REJECTED — each for a measured reason, not a guess
 *    NOAA ENC `Cable_Submarine_line`   1,472 features, and a query for
 *        `OBJNAM IS NOT NULL AND OBJNAM <> ''` returns 0. Nothing in it can be
 *        attributed to a cable, and §6 forbids joining a line to a cable because
 *        it happens to be nearby.
 *    OpenStreetMap `man_made=submarine_cable`   194 ways, 2,372 vertices in
 *        total (mean 12.2), 21 named — and those 21 are 2-to-9-vertex straight
 *        lines plus power interconnectors. Nothing here is a laid telecom route,
 *        so nothing is gained and ODbL share-alike is not incurred.
 *    EMODnet SHOM (France)   603 + 142 features carrying only `catcbl` and an
 *        INSPIRE id — no name, same problem as the ENC lines.
 *    EMODnet NVE (Norway)    918 features, `objekttype: EL_Sjøkabel` with a kV
 *        rating: the power grid, not telecoms.
 *    EMODnet BSH continental-shelf planned   89 features, `featuretyp:
 *        High_Voltage_Cables` — wind-farm export cables.
 *    EMODnet CICA   29 features named "CABLES DE TELEFONO ABANDONADOS".
 *    EMODnet UK fibre   30 features named e.g. "OTTER POWER CABLE P1" — fibre
 *        between oil platforms, not a cable system.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readGpkg } from './gpkg.mjs';
import { CACHE_DIR } from './seafloor.mjs';

const RAW = path.join(CACHE_DIR, 'raw');
const UA = 'IntMap/build-subcables (+https://github.com/rwmqx7dwb5-arch/IntMap)';

export const LICENCES = {
  telegeography: { name: 'TeleGeography Submarine Cable Map', url: 'https://www.submarinecablemap.com/', licence: 'Public API, CC BY-SA 4.0 (submarinecablemap.com)', use: 'inventory, names, metadata, landing points, connection topology' },
  'noaa-mc': { name: 'NOAA Office for Coastal Management — Marine Cadastre "Submarine Cables"', url: 'https://marinecadastre.gov/', licence: 'US Government work — not subject to copyright (17 U.S.C. §105)', use: 'surveyed route corridors in US waters' },
  'emodnet-bsh': { name: 'EMODnet Human Activities — BSH (Germany) data cables', url: 'https://emodnet.ec.europa.eu/en/human-activities', licence: 'CC BY 4.0', use: 'surveyed routes in German waters' },
  'emodnet-rws': { name: 'EMODnet Human Activities — Rijkswaterstaat (Netherlands) cables', url: 'https://emodnet.ec.europa.eu/en/human-activities', licence: 'CC BY 4.0', use: 'surveyed routes in Dutch waters' },
  'emodnet-mt': { name: 'EMODnet Human Activities — Malta cables', url: 'https://emodnet.ec.europa.eu/en/human-activities', licence: 'CC BY 4.0', use: 'surveyed routes around Malta' },
  'emodnet-sig': { name: 'EMODnet Human Activities — SIG cables', url: 'https://emodnet.ec.europa.eu/en/human-activities', licence: 'CC BY 4.0', use: 'surveyed routes' },
  acma: { name: "ACMA / Geoscience Australia — Australia's Submarine Telecommunication Cable locations 2021", url: 'https://www.arcgis.com/home/item.html?id=bc1e7fb37fca40faa5dafbc8a5a4dc3c', licence: 'CC BY 4.0 — © Commonwealth of Australia (Australian Communications and Media Authority) 2021', use: 'surveyed routes in Australian waters' },
  terrarium: { name: 'AWS Terrain Tiles (terrarium) — ETOPO1 bathymetry, SRTM/GMTED/NED topography', url: 'https://registry.opendata.aws/terrain-tiles/', licence: 'Open data (see registry) — attributed in js/reference-data.js', use: 'sea-floor depth, roughness and land mask for route reconstruction' },
};

/* ── the cache ─────────────────────────────────────────────────────────────── */
function cachePath(name) { return path.join(RAW, name); }
export function haveCached(name) { return fs.existsSync(cachePath(name)); }

export async function cachedFetch(name, url, { refresh = false, binary = false, log = () => {} } = {}) {
  fs.mkdirSync(RAW, { recursive: true });
  const f = cachePath(name);
  if (!refresh && fs.existsSync(f)) return binary ? fs.readFileSync(f) : fs.readFileSync(f, 'utf8');
  log('  ↓ ' + name);
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: binary ? '*/*' : 'application/json' } });
  if (!r.ok) throw new Error(name + ': HTTP ' + r.status + ' ' + url);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(f, buf);
  return binary ? buf : buf.toString('utf8');
}
export async function cachedJSON(name, url, opts) { return JSON.parse(await cachedFetch(name, url, opts)); }

/* ══ TELEGEOGRAPHY ═══════════════════════════════════════════════════════════
   The INVENTORY: which cables exist, what they are called, where they land, who
   owns them, when they entered service, how long they are — and, from the
   schematic geometry, WHICH LANDING POINTS ARE JOINED TO WHICH. The brief's §8
   allows exactly that use and forbids the other one: none of the schematic
   geometry becomes route geometry, and none of it constrains the reconstruction
   beyond naming the two ends of each leg. */
const TG = 'https://www.submarinecablemap.com/api/v3';

export async function loadTeleGeography(opts = {}) {
  const geo = await cachedJSON('tg-cable-geo.json', TG + '/cable/cable-geo.json', opts);
  const lpGeo = await cachedJSON('tg-landing-point-geo.json', TG + '/landing-point/landing-point-geo.json', opts);
  const all = await cachedJSON('tg-cable-all.json', TG + '/cable/all.json', opts);

  /* per-cable detail: 724 small documents, fetched politely and kept */
  const detailFile = path.join(RAW, 'tg-cable-details.json.gz');
  let details;
  if (!opts.refresh && fs.existsSync(detailFile)) {
    details = JSON.parse(zlib.gunzipSync(fs.readFileSync(detailFile)).toString('utf8'));
  } else {
    opts.log && opts.log('  ↓ tg cable details ×' + all.length);
    details = {};
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
      for (;;) {
        const k = next++; if (k >= all.length) return;
        const id = all[k].id;
        for (let a = 0; a < 3; a++) {
          try {
            const r = await fetch(TG + '/cable/' + encodeURIComponent(id) + '.json', { headers: { 'user-agent': UA } });
            if (r.ok) { details[id] = await r.json(); break; }
          } catch { /* retry */ }
          await new Promise(res => setTimeout(res, 400 * (a + 1)));
        }
        if (++done % 100 === 0) opts.log && opts.log('    ' + done + '/' + all.length);
      }
    }));
    fs.writeFileSync(detailFile, zlib.gzipSync(Buffer.from(JSON.stringify(details)), { level: 9 }));
  }
  return { geo, lpGeo, all, details };
}

/* ══ NOAA · MARINE CADASTRE ══════════════════════════════════════════════════ */
export async function loadNOAA(opts = {}) {
  const zip = await cachedFetch('SubmarineCable.zip', 'https://marinecadastre.gov/downloads/data/mc/SubmarineCable.zip', { ...opts, binary: true });
  const gpkg = path.join(RAW, 'SubmarineCable.gpkg');
  if (opts.refresh || !fs.existsSync(gpkg)) fs.writeFileSync(gpkg, unzipSingle(zip));
  return readGpkg(gpkg);
}

/* one-entry zip, deflate or stored — no dependency for one file */
function unzipSingle(b) {
  let i = b.length - 22;
  while (i > 0 && b.readUInt32LE(i) !== 0x06054b50) i--;
  if (i <= 0) throw new Error('not a zip');
  const cd = b.readUInt32LE(i + 16);
  const lho = b.readUInt32LE(cd + 42), method = b.readUInt16LE(cd + 10);
  const csize = b.readUInt32LE(cd + 20);
  const lnlen = b.readUInt16LE(lho + 26), lelen = b.readUInt16LE(lho + 28);
  const data = b.subarray(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
  return method === 0 ? data : zlib.inflateRawSync(data);
}

/* ══ EMODNET HUMAN ACTIVITIES (WFS) ══════════════════════════════════════════ */
const EMODNET_WFS = 'https://ows.emodnet-humanactivities.eu/wfs?service=WFS&version=2.0.0&request=GetFeature&outputFormat=application/json&srsName=EPSG:4326&typeNames=emodnet:';
export const EMODNET_LAYERS = [
  { layer: 'bshcontiscables', src: 'emodnet-bsh', name: p => p.name_, keep: p => p.featuretyp === 'Data Cables' || /FiberOptic/i.test(p.featurespe || '') },
  { layer: 'rijkscables', src: 'emodnet-rws', name: p => p.naam, owner: p => p.eigenaar, keep: p => p.kabelsoort === 'Telecom' },
  { layer: 'pcablesrijks', src: 'emodnet-rws', name: p => p.naam, owner: p => p.eigenaar, keep: p => p.kabelsoort === 'Telecom' },
  { layer: 'maltacables', src: 'emodnet-mt', name: p => p.name, keep: () => true },
  { layer: 'sigcables', src: 'emodnet-sig', name: p => p.name, keep: () => true },
];

export async function loadEMODnet(opts = {}) {
  const out = [];
  for (const L of EMODNET_LAYERS) {
    const j = await cachedJSON('emodnet-' + L.layer + '.json', EMODNET_WFS + L.layer, opts);
    for (const f of j.features || []) {
      const p = f.properties || {};
      if (!L.keep(p)) continue;
      const nm = (L.name(p) || '').trim();
      if (!nm) continue;
      out.push({ src: L.src, layer: L.layer, name: nm, owner: L.owner ? (L.owner(p) || '') : '', props: p, geometry: f.geometry });
    }
  }
  return out;
}

/* ══ ACMA / GEOSCIENCE AUSTRALIA ═════════════════════════════════════════════ */
const ACMA = 'https://services1.arcgis.com/wfNKYeHsOyaFyPw3/arcgis/rest/services/Australias_Submarine_Telecommunication_Cable_locations_2021/FeatureServer/0/query?where=1%3D1&outFields=*&f=geojson&outSR=4326&resultRecordCount=2000';

export async function loadACMA(opts = {}) {
  const j = await cachedJSON('acma-cables.json', ACMA, opts);
  return (j.features || []).filter(f => f.geometry).map(f => ({
    src: 'acma', layer: 'acma', name: String(f.properties.CABLE || '').replace(/\s+/g, ' ').trim(),
    abbrev: String(f.properties.ABBREV || '').trim(), owner: '', props: f.properties, geometry: f.geometry,
  })).filter(f => f.name);
}
