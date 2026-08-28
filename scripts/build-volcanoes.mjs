#!/usr/bin/env node
/* ============================================================================
 *  build-volcanoes.mjs — data/volcanoes_gvp.json + data/volcano-detail.json.gz  (#R353)
 * ----------------------------------------------------------------------------
 *  「現在はGVPの完新世火山1,215座を全部入れてありますが、視覚上の主要分類は「1950年以降」
 *   「1500年以降」「古い／不明」です。ここは恐ろしく深くできます。」
 *
 *  ── WHAT THE OLD FILE COULD NOT ANSWER ─────────────────────────────────────────────────────
 *  The shipped layer carried SIX properties per volcano — name, country, type, elevation, last
 *  eruption year, region — and no GVP volcano number. Without the number there is no join key, so
 *  every question in the request («その火山の全噴火履歴」「VEI」「マグマ組成」「周辺人口」) was
 *  unanswerable from the bundled data no matter what UI was put on top of it. The three colours
 *  were not a design choice about depth; they were the whole of what the file knew.
 *
 *  ── WHAT IS ACTUALLY PUBLISHED, MEASURED THIS ROUND ────────────────────────────────────────
 *  The GVP WFS at webservices.volcano.si.edu serves six feature types. Four are usable and two
 *  are not, and BOTH facts are load-bearing:
 *
 *    Smithsonian_VOTW_Holocene_Volcanoes   1,214  ← name, type, landform, ROCK TYPE, tectonic
 *                                                   setting, epoch, evidence, summary, photo
 *    Smithsonian_VOTW_Holocene_Eruptions  11,089  ← VEI, start/end date, evidence method,
 *                                                   confirmed-vs-uncertain  (the eruption history)
 *    E3WebApp_HoloceneVolcanoes            1,214  ← population within 5 / 10 / 30 / 100 km
 *    E3WebApp_Eruptions1960                2,248    (a subset of the eruption list — not used)
 *    Smithsonian_VOTW_Pleistocene_Volcanoes 1,452   (out of scope: this layer is Holocene)
 *    E3WebApp_Emissions                    BROKEN  ← `Invalid object name 'vrf.Emission'` from the
 *                                                   upstream database, every request, both WFS
 *                                                   versions. It is still ADVERTISED in
 *                                                   DescribeFeatureType, which is why it looked
 *                                                   like an SO2 source until it was actually
 *                                                   called. Satellite SO2 comes from NASA GIBS
 *                                                   instead — see js/volcano-intel.js.
 *
 *  ⚠ 1,215 → 1,214. The bundled file held 1,215 features; the upstream catalog now holds 1,214.
 *  The count is NOT hardcoded anywhere after this round — the legend, the docs check and the tests
 *  all read it from the file, because a number that is written down in six places is a number that
 *  will disagree with itself the next time the Smithsonian revises the catalog.
 *
 *  ── WHY TWO FILES ──────────────────────────────────────────────────────────────────────────
 *  data/volcanoes_gvp.json is fetched when the LAYER is switched on: it must stay small, so it
 *  carries only what the map itself draws or filters by (including the join key and the three new
 *  numbers the colour modes need — max VEI, eruption count, population within 30 km).
 *  data/volcano-detail.json.gz is fetched when the first volcano PANEL is opened: the full eruption
 *  history, the geological summary, the photo and the four population radii. A reader who never
 *  opens a volcano never pays for it, and a reader who opens one pays once for all of them.
 *
 *  Source & licence: Smithsonian Institution, Global Volcanism Program — Volcanoes of the World.
 *  Attribution required; declared in js/reference-data.js and sources.html like every bundled set.
 *
 *  Usage:  node scripts/build-volcanoes.mjs [--cache <dir>] [--offline]
 *          --cache   keep the raw WFS answers so a rebuild does not re-download 13 MB
 *          --offline build from --cache only; fail if anything is missing
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const CACHE = argOf('--cache', '');
const OFFLINE = args.includes('--offline');

const OUT_LAYER  = path.join(ROOT, 'data', 'volcanoes_gvp.json');
const OUT_DETAIL = path.join(ROOT, 'data', 'volcano-detail.json.gz');

const WFS = 'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows';
const TYPES = {
  volcanoes:   'GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes',
  eruptions:   'GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions',
  e3:          'GVP-VOTW:E3WebApp_HoloceneVolcanoes',
  pleistocene: 'GVP-VOTW:Smithsonian_VOTW_Pleistocene_Volcanoes',
};
const ATTRIBUTION = 'Smithsonian Institution, Global Volcanism Program — Volcanoes of the World';

/* ⚠⚠⚠ (#R432) THE CATALOG IS NOT «THE HOLOCENE LIST» ANY MORE, AND THE REASON IS A JOIN THAT FAILED.
   js/volcano-intel.js reads `volcano/getMonitoredVolcanoes` (#R395) so the map can say «an
   observatory looked and calls this normal» instead of «nobody publishes anything». Measured
   2026-08-25: 70 monitored rows, and FIVE of them name a volcano this catalog could not draw —
   Yellowstone, Long Valley, Coso Volcanic Field, Isanotski Peaks and Korovin. The first four are
   real GVP volcanoes filed under the PLEISTOCENE catalog (their youngest known eruption predates
   the Holocene), so the Holocene layer alone can never hold them; the status was fetched every
   session and then thrown away, because `volcApplyStatus` writes onto features and there was no
   feature. A volcano the United States Geological Survey publishes a current alert level for
   belongs on a volcano map — so the bundled catalog is Holocene PLUS whatever an observatory is
   speaking about, and that second set is DERIVED from the live feed here rather than listed by
   hand. (Korovin is the fifth and is not a GVP number at all — see USGS_TO_GVP below.) */
const HANS_MONITORED = 'https://volcanoes.usgs.gov/hans-public/api/volcano/getMonitoredVolcanoes';

/* ── fetch ────────────────────────────────────────────────────────────────────────────────── */
async function wfs(typeName, key) {
  const cached = CACHE ? path.join(CACHE, key + '.json') : '';
  if (cached && fs.existsSync(cached)) {
    const doc = JSON.parse(fs.readFileSync(cached, 'utf8'));
    console.log(`  ${key}: ${doc.features.length.toLocaleString()} features (cache)`);
    return doc;
  }
  if (OFFLINE) throw new Error(`--offline but ${key} is not in --cache`);
  const url = `${WFS}?service=WFS&version=1.0.0&request=GetFeature&outputFormat=application/json`
            + `&maxFeatures=30000&typeName=${encodeURIComponent(typeName)}`;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
  const text = await r.text();
  /* ⚠ GeoServer answers a FAILED query with 200 and an XML ServiceExceptionReport. E3WebApp_Emissions
     does exactly this, so "it parsed as JSON" is the only check that distinguishes a live feature
     type from an advertised-but-dead one. */
  if (text.trimStart().startsWith('<')) {
    const m = /<(?:ows:)?(?:ServiceException|ExceptionText)[^>]*>([\s\S]*?)</.exec(text);
    throw new Error(`${key}: upstream exception — ${(m ? m[1] : text.slice(0, 200)).trim()}`);
  }
  const doc = JSON.parse(text);
  if (!doc || !Array.isArray(doc.features)) throw new Error(`${key}: not a FeatureCollection`);
  if (doc.features.length !== doc.totalFeatures) {
    throw new Error(`${key}: paged — got ${doc.features.length} of ${doc.totalFeatures}; raise maxFeatures`);
  }
  console.log(`  ${key}: ${doc.features.length.toLocaleString()} features (fetched)`);
  if (cached) { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(cached, text); }
  return doc;
}

/* the USGS feed is plain JSON, not WFS, and it caches under the same --cache/--offline rules */
async function hans(url, key) {
  const cached = CACHE ? path.join(CACHE, key + '.json') : '';
  if (cached && fs.existsSync(cached)) {
    const doc = JSON.parse(fs.readFileSync(cached, 'utf8'));
    console.log(`  ${key}: ${doc.length.toLocaleString()} rows (cache)`);
    return doc;
  }
  if (OFFLINE) throw new Error(`--offline but ${key} is not in --cache`);
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`${key}: HTTP ${r.status}`);
  const text = await r.text();
  const doc = JSON.parse(text);
  if (!Array.isArray(doc)) throw new Error(`${key}: not an array`);
  console.log(`  ${key}: ${doc.length.toLocaleString()} rows (fetched)`);
  if (cached) { fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(cached, text); }
  return doc;
}

/* ⚠ THE CORRESPONDENCE IS NOT WRITTEN TWICE. js/volcano-intel.js holds USGS_TO_GVP because the
   RUNNING map needs it — a status has to land on the right dot — and this build needs the same
   answer to know which monitored numbers are already covered. It is read out of that file rather
   than copied, so the two can never drift apart (AGENTS.md §9). */
function usgsToGvp() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'volcano-intel.js'), 'utf8');
  const m = /const\s+USGS_TO_GVP\s*=\s*\{([\s\S]*?)\}/.exec(src);
  if (!m) throw new Error('js/volcano-intel.js: USGS_TO_GVP not found — the correspondence moved or was renamed');
  const map = new Map();
  for (const pair of m[1].matchAll(/(\d+)\s*:\s*(\d+)/g)) map.set(+pair[1], +pair[2]);
  if (!map.size) throw new Error('js/volcano-intel.js: USGS_TO_GVP parsed empty');
  return map;
}

/* ── a stable index into a vocabulary, so the files carry small integers and one word list ──── */
function vocabulary() {
  const list = [], index = new Map();
  return {
    id(value) {
      const v = (value == null || value === 'None' || value === 'No Data (checked)') ? null : String(value);
      if (v === null) return null;
      if (!index.has(v)) { index.set(v, list.length); list.push(v); }
      return index.get(v);
    },
    list,
  };
}

/* ── GVP date parts → one comparable number, keeping the parts the record actually has ───────
   A GVP eruption may be dated to the year, the month or the day, and about a quarter of the rows
   carry no VEI at all. Nothing here invents a missing part: month and day stay 0 when GVP wrote 0,
   and the UI says 「年のみ」 rather than pretending to 1 January.

   ⚠ THE COUNTERS IN THIS LOOP COUNT THE UPSTREAM, NOT THE FILE. Every eruption row GVP publishes
   lands in `hist`, but only the volcanoes in the Holocene volcano catalog get a `detail[vn]`, so
   the rows of a volcano number that has eruptions and no catalog entry are never written. The two
   numbers differ, they always have, and #R440 found the difference stated as if it were the file:
   what the file holds is counted below, in the loop that writes it. */
const num = (x) => (x == null || x === '' ? null : (Number.isFinite(+x) ? +x : null));

async function main() {
  console.log('GVP Volcanoes of the World → data/');
  const [V, E, P, PL, MON] = [
    await wfs(TYPES.volcanoes, 'volcanoes'),
    await wfs(TYPES.eruptions, 'eruptions'),
    await wfs(TYPES.e3, 'population'),
    await wfs(TYPES.pleistocene, 'pleistocene'),
    await hans(HANS_MONITORED, 'usgs-monitored'),
  ];

  /* population by volcano number */
  const pop = new Map();
  for (const f of P.features) {
    const p = f.properties;
    pop.set(p.VolcanoNumber, [num(p.Within_5km), num(p.Within_10km), num(p.Within_30km), num(p.Within_100km)]);
  }

  /* eruption history by volcano number, newest first */
  const evidence = vocabulary();
  const hist = new Map();
  let veiKnown = 0;
  for (const f of E.features) {
    const p = f.properties;
    const vn = p.Volcano_Number;
    const vei = num(p.ExplosivityIndexMax);
    if (vei != null) veiKnown++;
    /* [eruptionNumber, startYear, startMonth, startDay, endYear, endMonth, endDay,
        VEI, veiModifier, confirmed(1)/uncertain(0), evidenceMethodIndex, yearUncertainty] */
    const row = [
      p.Eruption_Number,
      num(p.StartDateYear), num(p.StartDateMonth) || 0, num(p.StartDateDay) || 0,
      num(p.EndDateYear), num(p.EndDateMonth) || 0, num(p.EndDateDay) || 0,
      vei, p.ExplosivityIndexModifier || null,
      p.Activity_Type === 'Confirmed Eruption' ? 1 : 0,
      evidence.id(p.StartEvidenceMethod),
      num(p.StartDateYearUncertainty) || 0,
    ];
    if (!hist.has(vn)) hist.set(vn, []);
    hist.get(vn).push(row);
  }
  for (const rows of hist.values()) rows.sort((a, b) => (b[1] ?? -1e9) - (a[1] ?? -1e9));

  /* ── the layer file ──────────────────────────────────────────────────────────────────────── */
  const rocks = vocabulary(), settings = vocabulary(), types = vocabulary();
  const landforms = vocabulary(), epochs = vocabulary(), evidenceCat = vocabulary();
  const features = [], detail = {};
  let withHistory = 0, withPop = 0;
  /* what is actually WRITTEN, accumulated by the loop that writes it (#R440) */
  let wroteEruptions = 0, wroteVei = 0;

  for (const f of V.features) {
    const p = f.properties;
    const vn = p.Volcano_Number;
    const rows = hist.get(vn) || [];
    if (rows.length) withHistory++;
    const confirmed = rows.filter((r) => r[9] === 1);
    const veis = rows.map((r) => r[7]).filter((v) => v != null);
    wroteEruptions += rows.length;
    wroteVei += veis.length;
    const maxVei = veis.length ? Math.max(...veis) : null;
    const pp = pop.get(vn) || [null, null, null, null];
    if (pp[2] != null) withPop++;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [round(p.Longitude, 4), round(p.Latitude, 4)] },
      properties: {
        n: p.Volcano_Name,
        c: p.Country,
        t: p.Primary_Volcano_Type,
        e: num(p.Elevation),
        y: num(p.Last_Eruption_Year),
        r: p.Region,
        v: vn,                              /* (#R353) the join key — everything below hangs off it */
        k: rocks.id(p.Major_Rock_Type),     /* magma composition */
        s: settings.id(p.Tectonic_Setting), /* tectonic setting */
        x: maxVei,                          /* largest VEI in the Holocene record */
        q: confirmed.length,                /* confirmed eruptions */
        p: pp[2],                           /* people within 30 km */
      },
    });
    types.id(p.Primary_Volcano_Type);

    const photo = /GVP-\d+/.exec(p.Primary_Photo_Link || '');
    detail[vn] = {
      sub: p.Subregion || null,
      lf: landforms.id(p.Volcanic_Landform),
      ep: epochs.id(p.Geologic_Epoch),
      ev: evidenceCat.id(p.Evidence_Category),
      g: p.Geological_Summary || null,
      p: pp,
      ph: photo ? [photo[0], p.Primary_Photo_Caption || null, p.Primary_Photo_Credit || null] : null,
      er: rows,
    };
  }
  /* ── the volcanoes an observatory is speaking about that the Holocene list cannot hold ─────── */
  const holocene = new Set(V.features.map((f) => +f.properties.Volcano_Number));
  const reconcile = usgsToGvp();
  const pleistocene = new Map(PL.features.map((f) => [+f.properties.Volcano_Number, f]));
  const monitored = new Set();
  let bulletins = 0;
  for (const r of MON) {
    /* ⚠ A ROW THAT NAMES NO VOLCANO IS NOT A VOLCANO. The feed carries the observatory-wide
       bulletins in the same array — «Alaskan Volcanoes» (AVO) and «Cascade Range» (CVO) — and both
       answer vnum: null. Same guard as js/volcano-intel.js. */
    const raw = num(r.vnum);
    if (raw == null) { bulletins++; continue; }
    const vn = reconcile.get(raw) ?? raw;
    if (!holocene.has(vn)) monitored.add(vn);
  }
  const added = [];
  for (const vn of [...monitored].sort((a, b) => a - b)) {
    const f = pleistocene.get(vn);
    /* ⚠ LOUD, NOT SILENT. Dropping it here would put the map back where #R432 found it: a status
       fetched every session and thrown away because there is no dot to write it onto. If GVP has
       the number under neither catalog it is not a GVP number — add it to USGS_TO_GVP in
       js/volcano-intel.js with the measurement that justifies the pairing. */
    if (!f) throw new Error(`USGS monitors ${vn} and GVP holds it in neither catalog — `
                          + `reconcile it in js/volcano-intel.js USGS_TO_GVP`);
    const p = f.properties;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [round(p.Longitude, 4), round(p.Latitude, 4)] },
      properties: {
        n: p.Volcano_Name, c: p.Country, t: p.Primary_Volcano_Type, e: num(p.Elevation),
        /* ⚠ the Pleistocene feature type publishes NINE of the Holocene one's nineteen fields: no
           last-eruption year, no rock type, no tectonic setting, no evidence category, no photo —
           and the eruption list and the population layer are both Holocene-only. Every one of those
           is null rather than guessed, and the card already renders each of them as absent. */
        y: null, r: p.Region, v: vn, k: null, s: null, x: null, q: 0, p: null,
      },
    });
    types.id(p.Primary_Volcano_Type);
    detail[vn] = {
      sub: p.Subregion || null,
      lf: landforms.id(p.Volcanic_Landform),
      ep: epochs.id(p.Geologic_Epoch),
      ev: null,
      g: p.Geological_Summary || null,
      p: [null, null, null, null],
      ph: null,
      er: [],
    };
    added.push(`${vn} ${p.Volcano_Name}`);
  }

  features.sort((a, b) => a.properties.v - b.properties.v);

  const layer = {
    type: 'FeatureCollection',
    v: 2,
    built: new Date().toISOString().slice(0, 10),
    attribution: ATTRIBUTION,
    /* ⚠ (#R432) THE COMPOSITION IS IN THE FILE, NOT IN A LABEL. #R353 took the count out of the row
       label because 「全1,215座」 was still there after the catalog became 1,214; the same lesson
       applies to the word «Holocene», which is now true of all but `features.length - holocene` of
       them. The legend reads both numbers from here. */
    holocene: V.features.length,
    rocks: rocks.list,
    settings: settings.list,
    features,
  };
  fs.writeFileSync(OUT_LAYER, JSON.stringify(layer));

  const detailDoc = {
    v: 2,
    built: layer.built,
    attribution: ATTRIBUTION,
    /* (#R440) the file states its own size, so nothing downstream has to count it — or, worse,
       quote a number measured somewhere else. tests/r353-checks ② walks every row and demands
       these two agree with the walk. */
    eruptions: wroteEruptions,
    eruptionsWithVei: wroteVei,
    vocab: {
      evidence: evidence.list, landform: landforms.list,
      epoch: epochs.list, evidenceCat: evidenceCat.list,
      rocks: rocks.list, settings: settings.list,
    },
    volcanoes: detail,
  };
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(detailDoc)), { level: 9 });
  fs.writeFileSync(OUT_DETAIL, gz);

  /* ── what did NOT get written, and why (#R440) ────────────────────────────────────────────
     A volcano number can have eruption rows and no entry in the Holocene volcano catalog, and the
     loop above only writes the catalog. Those rows are dropped — correctly, since there is nothing
     to hang them off — but from #R353 until #R440 the completion line below printed
     `E.features.length` and called it «wrote … eruptions», and six shipped languages and four
     documents copied that number as the size of the file. Print the two separately, name the gap. */
  const catalogued = new Set(features.map((f) => f.properties.v));
  let orphanVolcanoes = 0, orphanRows = 0;
  for (const [vn, rows] of hist) if (!catalogued.has(vn)) { orphanVolcanoes++; orphanRows += rows.length; }

  const layerBytes = fs.statSync(OUT_LAYER).size;
  console.log(`\nwrote data/volcanoes_gvp.json  — ${features.length.toLocaleString()} volcanoes, `
            + `${(layerBytes / 1024).toFixed(0)} kB`);
  console.log(`wrote data/volcano-detail.json.gz — ${wroteEruptions.toLocaleString()} eruptions `
            + `(${wroteVei.toLocaleString()} with VEI), ${(gz.length / 1024).toFixed(0)} kB gzipped`);
  console.log(`  of the ${E.features.length.toLocaleString()} rows GVP published `
            + `(${veiKnown.toLocaleString()} with VEI); ${orphanRows.toLocaleString()} were dropped, `
            + `belonging to ${orphanVolcanoes.toLocaleString()} volcano numbers the Holocene catalog does not list`);
  console.log(`  ${V.features.length.toLocaleString()} from the Holocene catalog`);
  console.log(`  ${added.length} monitored by an observatory and held by GVP under the Pleistocene`
            + (added.length ? `: ${added.join(", ")}` : ""));
  console.log(`  ${MON.length} monitored rows read, ${bulletins} of them observatory-wide bulletins with no volcano number`);
  console.log(`  ${withHistory.toLocaleString()} volcanoes have a dated eruption record`);
  console.log(`  ${withPop.toLocaleString()} volcanoes have population figures`);
  console.log(`  rock types ${rocks.list.length} · tectonic settings ${settings.list.length} · `
            + `volcano types ${types.list.length} · evidence methods ${evidence.list.length}`);
}

function round(x, n) { const m = 10 ** n; return Math.round(+x * m) / m; }

main().catch((e) => { console.error('build-volcanoes failed:', e.message); process.exit(1); });
