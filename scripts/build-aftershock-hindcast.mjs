#!/usr/bin/env node
/* ============================================================================
 *  IntMap · build-aftershock-hindcast — HOW GOOD IS THE AFTERSHOCK FORECAST?   (wave4-science)
 *  → data/aftershock-hindcast.json
 * ----------------------------------------------------------------------------
 *  A forecast that has never been compared with what happened is a claim, not a measurement. This runs the forecast of
 *  js/aftershock-core.js — unchanged, nothing fitted — for every earthquake of M ≥ MIN_MAG in the USGS catalogue
 *  between FROM and TO, issued ISSUE_DAYS after each mainshock with only the aftershocks recorded by then, and records
 *  what the catalogue holds for the windows that followed. The card («How good is this forecast?») and Atlas read the
 *  result; the method page states it.
 *
 *  Two scores, both over the whole set:
 *    · reliability   for each window and magnitude, the MEAN forecast probability of at least one, beside the
 *                    FRACTION of sequences in which one happened — a calibrated forecast has the two equal;
 *    · coverage      how often the observed number fell inside the forecast's 95 % range, below it or above it.
 *  Only magnitudes at or above the catalogue's completeness count (js/aftershock-core.js `run` → `check`).
 *
 *  ⚠ THE SET IS CHOSEN BY A RULE, NOT BY HAND: every M ≥ MIN_MAG earthquake ComCat lists in [FROM, TO). TO is far enough
 *    in the past that every window (the longest is a year) has ended. Nothing is dropped for having gone badly.
 *  ⚠ EVERY READ IS CHECKED (the count USGS states against the features it sends) before a byte is written.
 *
 *      node scripts/build-aftershock-hindcast.mjs            fetch, run, write (≈140 catalogue reads, a few minutes)
 *      node scripts/build-aftershock-hindcast.mjs --check    the committed file is one this reader understands (no network)
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_REL = 'data/aftershock-hindcast.json';
const OUT = join(ROOT, OUT_REL);
const C = await import(pathToFileURL(join(ROOT, 'js', 'aftershock-core.js')).href);

/* the set: ten whole years of M7+ (137 earthquakes, counted 2026-10-13), the last ended more than a year before the build
   so the year window is closed for all of them. Unmade if the model changes (re-run) or if this rule is changed. */
const MIN_MAG = 7, FROM = '2015-01-01', TO = '2025-01-01', ISSUE_DAYS = 1;
const KEEP = [5, 6, 7];

export const GOVERNANCE = {
  [OUT_REL]: {
    publisher: 'U.S. Geological Survey — ANSS Comprehensive Earthquake Catalog (ComCat), run through IntMap\'s aftershock forecast',
    url: 'https://earthquake.usgs.gov/fdsnws/event/1/',
    licence: 'U.S. public domain (USGS)',
    licenceUrl: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    attribution: false,
    cadence: 'static',
    cadenceBasis: {
      observed: 'a closed set of past sequences (M' + MIN_MAG + '+ from ' + FROM + ' to ' + TO + ') whose forecast windows have all ended',
      expires: 'if js/aftershock-core.js or data/aftershock-regimes.json.gz changes, or USGS revises the catalogue entries of these sequences',
      canon: 'this record (the only builder that scores the aftershock forecast)',
    },
    builtBy: 'scripts/build-aftershock-hindcast.mjs',
  },
};
const G = GOVERNANCE[OUT_REL];

async function json(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'IntMap-build/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap)' } });
  if (!r.ok) throw new Error(url + ': HTTP ' + r.status);
  const j = await r.json();
  if (j && j.metadata && Array.isArray(j.features) && j.metadata.count != null && j.metadata.count !== j.features.length) throw new Error(url + ': USGS states ' + j.metadata.count + ' and sends ' + j.features.length);
  return j;
}

/** row(r) — one sequence as the file keeps it (also what the regression test recomputes from a fixture) */
export function row(r) {
  return {
    id: r.main.id, mag: r.main.mag, t: new Date(r.main.t).toISOString().slice(0, 19) + 'Z', place: r.main.place, regime: r.regime.regime,
    used: r.used, a: [r.posterior.mean, r.posterior.sd],
    w: r.forecast.map((w, i) => ({ key: w.key, bins: w.bins.filter((b) => b.asLarge || KEEP.includes(b.mag)).map((b) => {
      const c = r.check[i].bins && r.check[i].bins.find((x) => x.mag === b.mag && x.asLarge === b.asLarge);
      return { m: b.asLarge ? 'main' : b.mag, p: +b.probability.toFixed(4), r: [b.lo, b.median, b.hi], o: c && c.checkable ? c.observed : null };
    }) })),
  };
}
/** score(rows) — reliability and coverage per window × magnitude */
export function score(rows) {
  const out = {};
  for (const s of rows) for (const w of s.w) for (const b of w.bins) {
    if (b.o == null) continue;
    const k = w.key + ':' + b.m, z = out[k] || (out[k] = { window: w.key, mag: b.m, n: 0, meanP: 0, happened: 0, within: 0, below: 0, above: 0 });
    z.n++; z.meanP += b.p; if (b.o > 0) z.happened++;
    if (b.o < b.r[0]) z.below++; else if (b.o > b.r[2]) z.above++; else z.within++;
  }
  return Object.values(out).map((z) => Object.assign(z, { meanP: +(z.meanP / z.n).toFixed(4), happened: +(z.happened / z.n).toFixed(4) }));
}

function problems(b) {
  const bad = [];
  if (!b || b.v !== 1 || !Array.isArray(b.rows) || !Array.isArray(b.score)) return ['not a v1 hindcast'];
  if (b.rows.length !== b.set.count) bad.push('rows ' + b.rows.length + ' ≠ the set ' + b.set.count);
  const again = JSON.stringify(score(b.rows));
  if (again !== JSON.stringify(b.score)) bad.push('the score does not follow from the rows');
  return bad;
}

async function build() {
  const P = C.prepare(JSON.parse(gunzipSync(readFileSync(join(ROOT, 'data', 'aftershock-regimes.json.gz'))).toString('utf8')));
  const set = await json(C.AS.ENDPOINT + 'query?format=geojson&eventtype=earthquake&orderby=time-asc&minmagnitude=' + MIN_MAG + '&starttime=' + FROM + '&endtime=' + TO);
  const mains = set.features.map(C.normalise).filter(Boolean);
  const rows = [];
  for (const main of mains) {
    const mc = C.completenessAt(P, main.lng, main.lat);
    const reach = C.radius(mc, main.mag, 'sample') + C.radius(mc, main.mag, 'centroid');
    const issue = main.t + ISSUE_DAYS * 86400000;
    const yearEnd = C.windows(issue).slice(-1)[0].end;
    const cat = await json(C.catalogUrl('query', { lng: main.lng, lat: main.lat, radiusKm: reach, minMag: Math.min(mc.magCat, mc.magCentroid), startMs: main.t, endMs: yearEnd }));
    const ev = cat.features.map(C.normalise).filter(Boolean);
    rows.push(row(C.run(P, main, ev, issue, { now: Date.now() })));
    process.stdout.write('.');
  }
  const bundle = {
    v: 1, title: 'Aftershock forecast hindcast — every M' + MIN_MAG + '+ earthquake ' + FROM + ' to ' + TO + ', issued ' + ISSUE_DAYS + ' day after',
    publisher: G.publisher, url: G.url, licence: G.licence, licenceUrl: G.licenceUrl, attribution: G.attribution, builtBy: G.builtBy,
    src: 'USGS ANSS ComCat (FDSN event service), read ' + new Date().toISOString().slice(0, 10) + '; model js/aftershock-core.js with data/aftershock-regimes.json.gz — ComCat event data: U.S. public domain (USGS); the regimes: OpenSHA OAF, CC0 1.0',
    retrievedAt: new Date().toISOString().slice(0, 10),
    set: { minMag: MIN_MAG, from: FROM, to: TO, issueDays: ISSUE_DAYS, count: mains.length },
    score: score(rows), rows,
  };
  const bad = problems(bundle);
  if (bad.length) throw new Error('not written: ' + bad.join('; '));
  writeFileSync(OUT, JSON.stringify(bundle));
  console.log('\n' + OUT_REL + ': ' + rows.length + ' sequences');
}

if (process.argv.includes('--check')) {
  const bad = problems(JSON.parse(readFileSync(OUT, 'utf8')));
  if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
  console.log(OUT_REL + ' ok');
} else if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  build().catch((e) => { console.error(e.message || e); process.exit(1); });
}
