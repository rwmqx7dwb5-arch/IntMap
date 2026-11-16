#!/usr/bin/env node
/* ============================================================================
 *  IntMap · build-aftershock-regimes — THE PRIOR OF AN AFTERSHOCK FORECAST   (wave4-science)
 *  → data/aftershock-regimes.json.gz
 * ----------------------------------------------------------------------------
 *  An aftershock forecast in the first hours after a mainshock has almost no aftershocks of its own to learn from, so
 *  it starts from what sequences in the SAME TECTONIC SETTING did before. The USGS operational aftershock forecasting
 *  code (OpenSHA OAF, github.com/opensha/opensha-oaf, CC0 1.0 — a U.S. Government work) ships exactly that:
 *
 *    GenericRJ_ParametersFetch.json   per tectonic regime, the generic Reasenberg–Jones parameters of Page et al.
 *                                     (2016, BSSA 106:2290): the a-value's mean and spread, p, c, b — and five
 *                                     California regions that override the global regime inside their polygons
 *    MagCompPage_ParametersFetch.json per network region, the catalogue's completeness magnitude and the Page et al.
 *                                     time-dependent incompleteness after a mainshock (F, G, H), and the
 *                                     Wells & Coppersmith search-radius rule
 *    TectonicRegimeTable.dat          the García et al. (2012) global seismotectonic regionalization (the 15 STREC
 *                                     regimes) on a 0.05° grid, run-length encoded per row of latitude
 *
 *  This copies them, and only them, into one file js/aftershock-core.js reads. Nothing is re-derived, smoothed or
 *  coarsened: the 0.05° grid is the table's own grain, and every run boundary is kept.
 *
 *  ⚠ PINNED TO A COMMIT. The three files are read from one commit of the upstream repository (UPSTREAM_SHA), so the
 *    bundle is reproducible byte for byte; the files themselves were last changed upstream on 2021-05-15 (observed
 *    2026-10-13 through the GitHub commits API). `--latest` resolves the default branch's head instead and prints it.
 *  ⚠ THE UPSTREAM'S OWN COUNTS ARE CHECKED. The regime table begins with the number of grid points in each of the
 *    15 regimes; the decoded runs must reproduce them exactly, and every one of the 3601 × 7201 points must be
 *    covered — or nothing is written.
 *
 *  Encoding of a row (`rows[i]`, latitude −90 + 0.05·i): runs left to right from longitude −180; each run is an
 *  UPPER-CASE letter (the regime: 'A' = regimes[0] …) followed, except for the first run, by its first column in
 *  lower-case base 36. An empty string is the previous row repeated.
 *
 *      node scripts/build-aftershock-regimes.mjs            fetch the pinned commit, write the bundle
 *      node scripts/build-aftershock-regimes.mjs --latest   the same from the default branch's head
 *      node scripts/build-aftershock-regimes.mjs --check    decode the committed bundle and check it (no network)
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_REL = 'data/aftershock-regimes.json.gz';
const OUT = join(ROOT, OUT_REL);
const REPO = 'opensha/opensha-oaf';
/* the commit read (observed 2026-10-13 as the head of the default branch). Unmade when the upstream changes one of the three
   files; `--latest` reads the new head and the builder's own checks run on what it brings. */
const UPSTREAM_SHA = '5fb2bf2b43b6e8c0c6f4d3f3a9eca1aaa67ba443';
const DIR = 'src/main/resources/org/opensha/oaf/rj/';
const FILES = { generic: 'GenericRJ_ParametersFetch.json', magComp: 'MagCompPage_ParametersFetch.json', table: 'TectonicRegimeTable.dat' };

/* ⚠ (#729) 出自は値である。npm run check:datagov がこの宣言と束の実体・js/reference-data.js の DATA_SOURCES を突き合わせる。 */
export const GOVERNANCE = {
  [OUT_REL]: {
    publisher: 'U.S. Geological Survey — Operational Aftershock Forecasting (OpenSHA OAF)',
    url: 'https://github.com/' + REPO,
    /* the repository's LICENSE is the CC0 1.0 Universal dedication (read 2026-10-13; GitHub reports spdx CC0-1.0) */
    licence: 'CC0-1.0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    /* CC0 asks for nothing; the card and the method page name the source and the papers all the same */
    attribution: false,
    cadence: 'static',
    cadenceBasis: {
      observed: 'the three parameter files were last changed upstream on 2021-05-15 (GitHub commits API, read 2026-10-13); the bundle is pinned to one commit',
      expires: 'if USGS revises the generic parameters, the completeness rules or the regime table in the OAF repository',
      canon: 'this record (the only builder that reads the OAF parameter files)',
    },
    builtBy: 'scripts/build-aftershock-regimes.mjs',
  },
};
const G = GOVERNANCE[OUT_REL];

const LAT_N = 3601, LON_N = 7201, STEP = 0.05;
/* TectonicRegimeTable.java's own order (strec_name[]), and the García names OAFTectonicRegime maps each one to */
const STREC = ['ACR (deep)', 'ACR (hot spot)', 'ACR (oceanic boundary)', 'ACR (shallow)', 'ACR deep (above slab)',
  'ACR oceanic boundary (above slab)', 'ACR shallow (above slab)', 'SCR (above slab)', 'SCR (generic)', 'SOR (above slab)',
  'SOR (generic)', 'SZ (generic)', 'SZ (inland/back-arc)', 'SZ (on-shore)', 'SZ (outer-trench)'];
const GARCIA = ['ANSR-DEEPCON', 'ANSR-HOTSPOT', 'ANSR-OCEANBD', 'ANSR-SHALCON', 'ANSR-ABSLDEC', 'ANSR-ABSLOCB', 'ANSR-ABSLSHC',
  'SCR-ABVSLAB', 'SCR-GENERIC', 'SOR-ABVSLAB', 'SOR-GENERIC', 'SZ-GENERIC', 'SZ-INLBACK', 'SZ-ONSHORE', 'SZ-OUTERTR'];
const LETTER = (i) => String.fromCharCode(65 + i);

/** decode the run-length rows back to the grid's runs: [[col, regimeIndex], …] per row (shared with --check) */
export function decodeRows(rows) {
  const out = []; let prev = null;
  for (const s of rows) {
    if (s === '') { out.push(prev); continue; }
    const runs = []; const re = /([A-Z])([0-9a-z]*)/g; let m;
    while ((m = re.exec(s))) runs.push([m[2] === '' ? 0 : parseInt(m[2], 36), m[1].charCodeAt(0) - 65]);
    out.push(runs); prev = runs;
  }
  return out;
}
function countsOf(decoded) {
  const n = new Array(STREC.length).fill(0);
  for (const runs of decoded) for (let i = 0; i < runs.length; i++) n[runs[i][1]] += (i + 1 < runs.length ? runs[i + 1][0] : LON_N) - runs[i][0];
  return n;
}

async function get(name, sha) {
  const url = 'https://raw.githubusercontent.com/' + REPO + '/' + sha + '/' + DIR + name;
  const r = await fetch(url);
  if (!r.ok) throw new Error(name + ': HTTP ' + r.status);
  return r.text();
}
async function headSha() {
  const r = await fetch('https://api.github.com/repos/' + REPO + '/commits/master', { headers: { accept: 'application/vnd.github+json', 'user-agent': 'IntMap-build/1.0' } });
  if (!r.ok) throw new Error('GitHub commits API: HTTP ' + r.status);
  return (await r.json()).sha;
}

/** the regime table: 15 counts, then per row of latitude its run count, the runs' first columns and their regimes */
function parseTable(text) {
  const t = text.split(/\s+/).filter(Boolean).map(Number);
  if (t.some((v) => !Number.isInteger(v))) throw new Error('regime table: a token that is not an integer');
  const counts = t.slice(0, STREC.length); let i = STREC.length;
  const rows = [];
  for (let r = 0; r < LAT_N; r++) {
    const g = t[i++];
    if (!(g >= 1 && g <= LON_N)) throw new Error('regime table: row ' + r + ' has ' + g + ' runs');
    const cols = t.slice(i, i + g); i += g;
    const idx = t.slice(i, i + g); i += g;
    if (cols[0] !== 0) throw new Error('regime table: row ' + r + ' does not start at column 0');
    for (let k = 0; k < g; k++) {
      if (!(idx[k] >= 0 && idx[k] < STREC.length)) throw new Error('regime table: row ' + r + ' names regime ' + idx[k]);
      if (k && !(cols[k] > cols[k - 1] && cols[k] < LON_N)) throw new Error('regime table: row ' + r + ' columns out of order');
    }
    rows.push(cols.map((c, k) => [c, idx[k]]));
  }
  if (i !== t.length) throw new Error('regime table: ' + (t.length - i) + ' tokens after the last row');
  return { counts, rows };
}
function encodeRows(rows) {
  const out = []; let prev = '';
  for (const runs of rows) {
    const s = runs.map(([c, k], j) => LETTER(k) + (j ? c.toString(36) : '')).join('');
    out.push(s === prev ? '' : s); prev = s;
  }
  return out;
}
const poly = (r) => r.region.vertex_list.map((v) => [v.lon, v.lat]);

function problems(b) {
  const bad = [];
  if (!b || b.v !== 1) return ['not a v1 bundle'];
  if (b.regimes.length !== STREC.length) bad.push('regimes: ' + b.regimes.length);
  if (b.rows.length !== LAT_N) bad.push('rows: ' + b.rows.length);
  const dec = decodeRows(b.rows);
  if (dec[0] == null) bad.push('row 0 repeats a row that does not exist');
  const n = countsOf(dec);
  if (n.join() !== b.counts.join()) bad.push('decoded counts ' + n.join() + ' ≠ the table\'s own ' + b.counts.join());
  if (n.reduce((s, v) => s + v, 0) !== LAT_N * LON_N) bad.push('the runs do not cover the grid');
  for (const r of b.regimes) if (!b.params[r.garcia]) bad.push('no generic parameters for ' + r.garcia);
  for (const r of b.paramRegions) if (!b.params[r.regime]) bad.push('no generic parameters for the region ' + r.regime);
  if (!b.magComp.WORLD) bad.push('no WORLD completeness');
  for (const r of b.magCompRegions) if (!b.magComp[r.regime]) bad.push('no completeness for the region ' + r.regime);
  return bad;
}

async function build() {
  const latest = process.argv.includes('--latest');
  const sha = latest ? await headSha() : UPSTREAM_SHA;
  if (latest) console.log('default branch head: ' + sha);
  const [gTxt, mTxt, tTxt] = await Promise.all([get(FILES.generic, sha), get(FILES.magComp, sha), get(FILES.table, sha)]);
  const gen = JSON.parse(gTxt), mc = JSON.parse(mTxt), tab = parseTable(tTxt);
  const params = {};
  for (const r of gen.regimes) {
    const p = r.params;
    params[r.regime] = { aMean: p.aValue_mean, aSigma: p.aValue_sigma, aSigma0: p.aValue_sigma0, aSigma1: p.aValue_sigma1,
      p: p.pValue, c: p.cValue, b: p.bValue, aMin: p.aValue_min, aMax: p.aValue_max, aDelta: p.aValue_delta };
  }
  const magComp = {};
  for (const r of mc.regimes) {
    const p = r.params, f = p.magCompFn;
    magComp[r.regime] = { magCat: p.magCat, F: f.capF, G: f.capG, H: f.capH, magSample: p.magSample.mag, magCentroid: p.magCentroid.mag,
      radiusMult: p.radiusSample.radiusMult, radiusMin: p.radiusSample.radiusMin, radiusMax: p.radiusSample.radiusMax,
      centroidMult: p.radiusCentroid.radiusMult, centroidMin: p.radiusCentroid.radiusMin, centroidMax: p.radiusCentroid.radiusMax };
  }
  const bundle = {
    v: 1,
    title: 'Aftershock forecast prior — USGS generic Reasenberg–Jones parameters, catalogue completeness and the García et al. (2012) tectonic regimes',
    publisher: G.publisher, url: G.url, licence: G.licence, licenceUrl: G.licenceUrl, attribution: G.attribution,
    src: 'OpenSHA OAF (U.S. Geological Survey), ' + DIR + '{' + Object.values(FILES).join(',') + '} at commit ' + sha + ' — CC0 1.0',
    credit: 'USGS Operational Aftershock Forecasting (OpenSHA OAF, CC0): generic parameters of Page et al. (2016, BSSA 106:2290); tectonic regimes of García et al. (2012, BSSA 102:185).',
    commit: sha,
    builtBy: G.builtBy,
    grid: { latMin: -90, lonMin: -180, step: STEP, rows: LAT_N, cols: LON_N },
    regimes: STREC.map((s, i) => ({ strec: s, garcia: GARCIA[i] })),
    counts: tab.counts,
    params,
    /* the order is the upstream's: OAF returns the FIRST region that contains the point (OAFParameterSet.getRegion) */
    paramRegions: gen.regions.map((r) => ({ regime: r.regime, poly: poly(r) })),
    magComp,
    magCompRegions: mc.regions.map((r) => ({ regime: r.regime, poly: poly(r) })),
    rows: encodeRows(tab.rows),
  };
  const bad = problems(bundle);
  if (bad.length) throw new Error('not written: ' + bad.join('; '));
  const json = JSON.stringify(bundle);
  /* mtime 0 in the gzip header (zlib writes none) — the same input gives the same bytes */
  writeFileSync(OUT, gzipSync(Buffer.from(json), { level: 9 }));
  console.log(OUT_REL + ': ' + json.length + ' bytes of JSON, ' + tab.rows.reduce((s, r) => s + r.length, 0) + ' runs, ' + Object.keys(params).length + ' regimes with parameters');
}

if (process.argv.includes('--check')) {
  const b = JSON.parse(gunzipSync(readFileSync(OUT)).toString('utf8'));
  const bad = problems(b);
  if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
  console.log(OUT_REL + ' ok — ' + b.rows.length + ' rows, commit ' + b.commit);
} else if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  build().catch((e) => { console.error(e.message || e); process.exit(1); });
}
