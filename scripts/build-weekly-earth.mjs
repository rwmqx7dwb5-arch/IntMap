#!/usr/bin/env node
/* ============================================================================
 *  IntMap · build-weekly-earth — THIS WEEK ON EARTH, an archive of ISO weeks   (weekly-earth)
 * ----------------------------------------------------------------------------
 *  「今週の地球」: a public digest of each week's large natural events, a page per week, a feed to subscribe to, an
 *  archive that grows by one week every week. This writes data/weekly-earth.json from two public upstreams:
 *
 *    USGS FDSN event service    every earthquake of magnitude ≥ MIN_MAGNITUDE in the period, one request
 *                               (https://earthquake.usgs.gov/fdsnws/event/1/ — public domain, already credited in
 *                               js/reference-data.js as «USGS Earthquake Hazards Program»)
 *    NASA EONET v3              every natural event EONET tracks with an observation in the period, one request
 *                               (https://eonet.gsfc.nasa.gov/api/v3/ — NASA, U.S. Government work)
 *
 *  ⚠ AN ARCHIVE, NOT A WINDOW. A week already in the file is KEPT AS IT IS — the page a reader bookmarked last
 *  month says what it said — except a week that is still PROVISIONAL (below). New weeks are added at the front.
 *  The first run, with no file, fills ARCHIVE_DEPTH weeks back; every later run adds only the weeks that have ended
 *  since. Nothing here deletes a week.
 *
 *  ⚠ PROVISIONAL WEEKS ARE ASKED AGAIN, ONCE THEY HAVE SETTLED. USGS reviews a magnitude after it first publishes
 *  it, and EONET adds an event when its source reports it, so a week fetched the day after it ended is the first
 *  draft of that week. A week is `provisional` while it was fetched less than SETTLE_DAYS after it ended; the next
 *  run after that asks for it again and then it is settled for good.
 *
 *  ⚠ THE UPSTREAMS' ANSWERS ARE CHECKED BEFORE A BYTE IS WRITTEN (scripts/lib/upstream.mjs): a non-200, a body that
 *  is not JSON, a USGS answer whose own `metadata.count` disagrees with the features it carries, an EONET answer
 *  without its `events` array or with an event missing its id, category or dated observations — each throws, and
 *  the file on disk is left as it was. A failed upstream never ends as a SHORTER archive.
 *
 *  ⚠ WHAT IS NOT KEPT, AND WHY (each written into the file as `rule`, so a page can say it):
 *    · an earthquake below MIN_MAGNITUDE — USGS lists tens of thousands a year;
 *    · a wildfire whose stated burned area is below WILDFIRE_MIN_HA — see the constant; the week COUNTS them
 *      (`fewer.wildfires`) so a page says how many it leaves out;
 *    · the position of an event EONET gives only as a polygon — see `placeOf`; the event is listed, not placed.
 *
 *  Usage:
 *      node scripts/build-weekly-earth.mjs              add the weeks that have ended (the unattended refresh runs this)
 *      node scripts/build-weekly-earth.mjs --check      exit 1 if the committed file is not an archive this reader understands (no network)
 *      node scripts/build-weekly-earth.mjs --stats      count what the file holds (no network)
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fetchChecked } from './lib/upstream.mjs';
import { weekOf, weekFromSlug, lastEndedWeek, INDEX_PATH } from '../js/weekly-earth.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = INDEX_PATH;

export const USGS_QUERY = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
export const USGS_EVENT_PAGE = 'https://earthquake.usgs.gov/earthquakes/eventpage/';
export const EONET_EVENTS = 'https://eonet.gsfc.nasa.gov/api/v3/events';

/* (#729) provenance as a value — read by js/data-governance.js read(); npm run check:datagov holds it against data/
   and js/reference-data.js. ⚠ Only what the upstreams state. */
export const GOVERNANCE = {
  'data/weekly-earth.json': {
    publisher: 'U.S. Geological Survey — Earthquake Hazards Program (FDSN event service); NASA — EONET, the Earth Observatory Natural Event Tracker',
    url: EONET_EVENTS,
    /* USGS: «USGS-authored or produced data and information are considered to be in the U.S. public domain»
       (usgs.gov/information-policies-and-instructions/copyrights-and-credits). NASA: works of the U.S. Government
       are not subject to copyright in the U.S., and NASA asks to be acknowledged as the source — which every page,
       feed entry and Atlas answer built from this file does, together with the originating source EONET names
       for each event (GDACS, IRWIN, JTWC, NOAA NHC, U.S. National Ice Center, Smithsonian GVP …) and a link to it. */
    licence: 'U.S. public domain (USGS) · U.S. Government work, not subject to copyright (NASA EONET)',
    licenceUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    attribution: true,
    paidBy: 'NASA EONET — Earth Observatory Natural Event Tracker',
    cadence: 'P7D',
    cadenceBasis: {
      observed: 'the archive\'s unit is a closed ISO week (Monday 00:00 UTC to Monday 00:00 UTC); both upstreams publish continuously, but a new week exists to be added once every seven days, and a provisional week is asked again on the next run',
      expires: 'if the archive\'s unit stops being the ISO week',
      canon: 'scripts/build-weekly-earth.mjs GOVERNANCE',
    },
    /* (upstream-liveness) on the unattended refresh roster — scripts/data-refresh.mjs */
    autoRefresh: 'two requests (one USGS FDSN query, one NASA EONET query), no key; both answers are checked by scripts/lib/upstream.mjs and validated (USGS\'s own count, EONET\'s event shape) before anything is written, existing weeks are kept, and a failure throws with the file left as it was',
    /* the validator every write passes and `--check` runs: ISO weeks, newest first, every item inside its week and above the floor */
    schema: 'scripts/build-weekly-earth.mjs problems()',
    /* ⚠ NO FILE-LEVEL retrievedAt / generatedAt / asOf, ON PURPOSE: each is a fact about ONE WEEK (its `fetched`, its
       `from`/`to`), and an archive's weeks were asked on different days. A top-level date would also make check:datagov
       date the bundle in-band while scripts/data-refresh.mjs dates its roster by git — the disagreement that file warns of. */
    builtBy: 'scripts/build-weekly-earth.mjs',
  },
};

/* ── what is kept ──────────────────────────────────────────────────────────────────────────────────
   ⚠ MIN_MAGNITUDE — the level the product request named (2026-10-04). OBSERVATION: USGS's catalogue for 2025-09-29 …
   2026-10-04 holds 488 events of M ≥ 5.5, about nine a week — a list a reader reads whole. EXPIRES: if the pages are
   to answer «every felt quake». CANON: this constant (written into the file as rule.minMagnitude, which the pages and
   Atlas state). */
export const MIN_MAGNITUDE = 5.5;
/* ⚠ WILDFIRE_MIN_HA — OBSERVATION (2026-10-04, EONET status=all over 2025-09-29 … 2026-10-04): 8,609 wildfire events,
   6,768 from GDACS (area in hectares, median 5,842 ha — GDACS reports almost nothing below ~5,000 ha) and 1,841
   from IRWIN (area in acres, median 1,186 acres). Kept whole, one week held up to 497 wildfires and the page was a
   list nobody reads; with the floor at 10,000 ha (100 km²), measured on the first build (52 weeks, 2025-W40 …
   2026-W39): 666 wildfire entries kept and 7,932 counted and left out, the busiest week 45 — the fires a reader
   could find on a satellite image. The file was then 569 kB (74 kB gzip), read only when a door asks for it. EXPIRES: if EONET's sources change what they report,
   or if a page is meant to list every reported fire. CANON: this constant (rule.wildfireMinHectares in the file).
   A fire whose area EONET does not state is KEPT — «not stated» is not «small». */
export const WILDFIRE_MIN_HA = 10000;
const ACRE_HA = 0.40468564224;   /* the international acre, exactly */
/* ⚠ SETTLE_DAYS — ESTIMATE, not measured per event: USGS states that a magnitude is revised as review proceeds, and
   EONET's sources report with a lag of a day or more. Seven days is one refresh period (the cadence below), so a
   week is asked again exactly once by the next scheduled run. EXPIRES: if the refresh period changes. CANON: here. */
export const SETTLE_DAYS = 7;
/* ⚠ ARCHIVE_DEPTH — how far back the FIRST run fills: a year of weeks, the period the request was made for. Later
   runs add weeks at the front and never trim. CANON: here. */
export const ARCHIVE_DEPTH = 52;
const DAY = 86400000;
const SCHEMA_VERSION = 1;

/* ══ THE PURE HALF — every judgement, evaluated by tests/weekly-earth-checks.test.mjs without a network ══════════ */

/** a USGS FDSN GeoJSON answer → true, or the reason it is not the answer that was asked for */
export function validateUsgs(body) {
  if (!body || body.type !== 'FeatureCollection' || !Array.isArray(body.features)) return 'not a GeoJSON FeatureCollection';
  if (!body.metadata || typeof body.metadata.count !== 'number') return 'no metadata.count';
  if (body.metadata.count !== body.features.length) return 'metadata.count ' + body.metadata.count + ' but ' + body.features.length + ' features (a truncated answer)';
  for (const f of body.features) {
    const p = f && f.properties, c = f && f.geometry && f.geometry.coordinates;
    if (!f.id || !p || typeof p.mag !== 'number' || typeof p.time !== 'number' || !Array.isArray(c) || c.length < 3) return 'an event lacks its id, magnitude, time or coordinates (' + (f && f.id) + ')';
  }
  return true;
}
/** an EONET v3 events answer → true, or the reason */
export function validateEonet(body) {
  if (!body || !Array.isArray(body.events)) return 'no events array';
  for (const e of body.events) {
    if (!e || !e.id || !e.title || !Array.isArray(e.categories) || !e.categories.length || !Array.isArray(e.geometry) || !e.geometry.length) return 'an event lacks its id, title, category or observations (' + (e && e.id) + ')';
    if (e.geometry.some((g) => !g || isNaN(Date.parse(g.date)))) return 'an observation of ' + e.id + ' has no date';
  }
  return true;
}

/** one USGS feature → the archive's record of it */
export function quakeRecord(f) {
  const p = f.properties, c = f.geometry.coordinates;
  const r = { id: f.id, t: new Date(p.time).toISOString(), m: p.mag, mt: p.magType || null, p: (p.place || '').trim() || null,
    at: [+c[0].toFixed(4), +c[1].toFixed(4), +(+c[2]).toFixed(1)] };
  if (p.type && p.type !== 'earthquake') r.ty = p.type;   /* USGS also lists explosions; said, not hidden */
  if (p.tsunami) r.ts = 1;
  if (p.alert) r.al = p.alert;
  return r;
}

/* ⚠ placeOf — ONLY A POINT PLACES AN EVENT. EONET's polygons (GDACS's flood outlines) are written in BOTH axis
   orders: measured 2026-10-04, of 180 flood polygons 46 have a first coordinate that can only be [lat, lng]
   (|x| ≤ 90, |y| > 90) and the rest are ambiguous or [lng, lat]. Guessing the order would put a flood in Thailand
   into the Indian Ocean, so a polygon-only event is listed with its dates and source and NOT placed. */
const placeOf = (obs) => {
  const pts = obs.filter((g) => g.type === 'Point' && Array.isArray(g.coordinates) && isFinite(g.coordinates[0]) && isFinite(g.coordinates[1]));
  const g = pts[pts.length - 1];
  return g ? [+(+g.coordinates[0]).toFixed(4), +(+g.coordinates[1]).toFixed(4)] : null;
};
const hectares = (g) => (g.magnitudeValue == null ? null : g.magnitudeUnit === 'acres' ? g.magnitudeValue * ACRE_HA : g.magnitudeUnit === 'hectare' ? g.magnitudeValue : null);

/** the EONET events with an observation inside [from, to) → { events, fewer } as a week stores them */
export function eventsIn(eonetEvents, from, to) {
  const a = Date.parse(from + 'T00:00:00Z'), b = Date.parse(to + 'T00:00:00Z');
  const out = [], fewer = {};
  for (const e of eonetEvents) {
    const obs = e.geometry.filter((g) => { const t = Date.parse(g.date); return t >= a && t < b; }).sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
    if (!obs.length) continue;
    const cat = e.categories[0];
    const withMag = obs.filter((g) => g.magnitudeValue != null);
    if (cat.id === 'wildfires') {
      const area = Math.max(-1, ...obs.map(hectares).filter((v) => v != null));
      if (area >= 0 && area < WILDFIRE_MIN_HA) { fewer.wildfires = (fewer.wildfires || 0) + 1; continue; }
    }
    const top = withMag.sort((x, y) => y.magnitudeValue - x.magnitudeValue)[0] || null;
    out.push({ id: e.id, cat: cat.id, title: String(e.title).trim(),
      d0: obs[0].date, d1: obs[obs.length - 1].date, at: placeOf(obs),
      mag: top ? top.magnitudeValue : null, unit: top ? top.magnitudeUnit || null : null,
      src: (e.sources || []).filter((s) => s && s.id && /^https?:\/\//.test(String(s.url || ''))).map((s) => ({ id: s.id, url: s.url })) });
  }
  /* by category (EONET's id), then the stated magnitude, largest first, then the title — the order a page lists them in */
  out.sort((x, y) => (x.cat < y.cat ? -1 : x.cat > y.cat ? 1 : (y.mag == null ? -1 : y.mag) - (x.mag == null ? -1 : x.mag) || (x.title < y.title ? -1 : x.title > y.title ? 1 : 0)));
  return { events: out, fewer };
}

/** one week, assembled from the two answers; `fetched` is the day it was asked (YYYY-MM-DD) */
export function weekRecord(w, quakeFeatures, eonetEvents, fetched) {
  const a = Date.parse(w.from + 'T00:00:00Z'), b = Date.parse(w.to + 'T00:00:00Z');
  const quakes = quakeFeatures.filter((f) => f.properties.mag >= MIN_MAGNITUDE && f.properties.time >= a && f.properties.time < b).map(quakeRecord)
    .sort((x, y) => y.m - x.m || (x.t < y.t ? -1 : 1));
  const { events, fewer } = eventsIn(eonetEvents, w.from, w.to);
  return { w: w.slug, from: w.from, to: w.to, fetched, provisional: Date.parse(fetched + 'T00:00:00Z') < b + SETTLE_DAYS * DAY, quakes, events, fewer };
}

/** which weeks a run must (re)fetch: those that have ended and are missing (back to ARCHIVE_DEPTH on a first run), and the provisional ones */
export function weeksToFetch(prev, now, depth = ARCHIVE_DEPTH) {
  const newest = lastEndedWeek(now);
  const have = new Map((prev && prev.weeks || []).map((x) => [x.w, x]));
  const out = [];
  /* back to the newest week the archive holds — or `depth` weeks on a first run */
  const newestKept = prev && prev.weeks && prev.weeks.length ? prev.weeks[0].w : null;
  let w = newest;
  for (let k = 0; k < (newestKept ? 100000 : depth) && w; k++) {
    if (newestKept && w.slug === newestKept) break;
    out.push(w);
    w = weekOf(Date.parse(w.from + 'T00:00:00Z') - DAY);
  }
  for (const x of have.values()) if (x.provisional) out.push(weekFromSlug(x.w));
  return out.filter(Boolean).sort((p, q) => (p.from < q.from ? -1 : 1));
}

/** EONET's own title of every category the answer used — carried once in the file (`categories`), not on every event */
export const categoriesOf = (eonetEvents, prev) => {
  const out = Object.assign({}, prev && prev.categories);
  for (const e of eonetEvents) for (const c of e.categories) if (c && c.id && !out[c.id]) out[c.id] = String(c.title || c.id);
  return Object.fromEntries(Object.entries(out).sort());
};

/** the archive after a run: the previous weeks kept, the fetched ones put in (replacing a provisional one), newest first */
export function merge(prev, fresh, categories) {
  const by = new Map((prev && prev.weeks || []).map((x) => [x.w, x]));
  for (const x of fresh) {
    const old = by.get(x.w);
    if (old && !old.provisional) continue;   /* a settled week is never rewritten */
    by.set(x.w, x);
  }
  return {
    v: SCHEMA_VERSION,
    builtBy: 'scripts/build-weekly-earth.mjs',
    sources: {
      usgs: { name: 'USGS Earthquake Hazards Program', query: USGS_QUERY, eventPage: USGS_EVENT_PAGE, licence: 'U.S. public domain', licenceUrl: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits' },
      eonet: { name: 'NASA EONET — Earth Observatory Natural Event Tracker', api: EONET_EVENTS, eventApi: EONET_EVENTS + '/', licence: 'U.S. Government work, not subject to copyright; NASA asks to be acknowledged', licenceUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/' },
    },
    categories: categories || (prev && prev.categories) || {},
    rule: { minMagnitude: MIN_MAGNITUDE, wildfireMinHectares: WILDFIRE_MIN_HA, settleDays: SETTLE_DAYS, week: 'ISO 8601, Monday 00:00 UTC to Monday 00:00 UTC' },
    weeks: [...by.values()].sort((p, q) => (p.from < q.from ? 1 : -1)),
  };
}

/** the archive is one this reader understands → [] or the problems */
export function problems(idx) {
  const bad = [];
  if (!idx || idx.v !== SCHEMA_VERSION) bad.push('schema v' + (idx && idx.v) + ' ≠ v' + SCHEMA_VERSION);
  if (!idx || !Array.isArray(idx.weeks) || !idx.weeks.length) { bad.push('no weeks'); return bad; }
  const seen = new Set();
  idx.weeks.forEach((x, i) => {
    const w = weekFromSlug(x.w);
    if (!w || w.from !== x.from || w.to !== x.to) bad.push(x.w + ' is not the ISO week its dates say');
    if (seen.has(x.w)) bad.push(x.w + ' twice'); seen.add(x.w);
    if (i && idx.weeks[i - 1].from <= x.from) bad.push(x.w + ' is out of order (newest first)');
    if (!Array.isArray(x.quakes) || !Array.isArray(x.events)) bad.push(x.w + ' lacks its lists');
    else {
      for (const q of x.quakes) if (!(q.m >= idx.rule.minMagnitude) || q.t < x.from || q.t >= x.to) bad.push(x.w + ' holds ' + q.id + ', which is not an M ' + idx.rule.minMagnitude + '+ quake of that week');
      for (const e of x.events) if (!e.d0 || e.d0 < x.from || e.d1 >= x.to) bad.push(x.w + ' holds ' + e.id + ' outside the week');
    }
  });
  return bad;
}

/* ══ THE NETWORK HALF ═════════════════════════════════════════════════════════════════════════════════ */
export async function fetchPeriod(from, to, opt = {}) {
  const usgsUrl = USGS_QUERY + '?' + new URLSearchParams({ format: 'geojson', starttime: from, endtime: to, minmagnitude: String(MIN_MAGNITUDE), orderby: 'time' });
  const eonetUrl = EONET_EVENTS + '?' + new URLSearchParams({ status: 'all', start: from, end: to });
  /* EONET answered a year's query in about 50 s on 2026-10-04 (9,334 events); the limit leaves room for a slow day */
  const [usgs, eonet] = await Promise.all([
    fetchChecked(usgsUrl, { headers: { accept: 'application/json' } }, { validate: validateUsgs, attempts: 3, timeoutMs: 120000, fetchImpl: opt.fetchImpl, backoffMs: opt.backoffMs, log: opt.log }),
    fetchChecked(eonetUrl, { headers: { accept: 'application/json' } }, { validate: validateEonet, attempts: 3, timeoutMs: 240000, fetchImpl: opt.fetchImpl, backoffMs: opt.backoffMs, log: opt.log }),
  ]);
  return { quakes: usgs.features, events: eonet.events };
}

/** one run: the archive as it should be after asking the upstreams (nothing written here) */
export async function build(prev, now = new Date(), opt = {}) {
  const want = weeksToFetch(prev, now, opt.depth);
  if (!want.length) return { idx: prev, fetched: [] };
  const from = want[0].from, to = want[want.length - 1].to;
  const { quakes, events } = await fetchPeriod(from, to, opt);
  const fetched = new Date(now).toISOString().slice(0, 10);
  const fresh = want.map((w) => weekRecord(w, quakes, events, fetched));
  return { idx: merge(prev, fresh, categoriesOf(events, prev)), fetched: fresh.map((x) => x.w) };
}

const readPrev = () => (existsSync(join(ROOT, OUT)) ? JSON.parse(readFileSync(join(ROOT, OUT), 'utf8')) : null);
function stats(idx) {
  const q = idx.weeks.reduce((n, x) => n + x.quakes.length, 0), e = idx.weeks.reduce((n, x) => n + x.events.length, 0);
  const f = idx.weeks.reduce((n, x) => n + ((x.fewer && x.fewer.wildfires) || 0), 0);
  return idx.weeks.length + ' weeks (' + idx.weeks[idx.weeks.length - 1].w + ' … ' + idx.weeks[0].w + '), ' + q + ' earthquakes, ' + e + ' EONET events, '
    + f + ' smaller wildfires counted and left out, ' + idx.weeks.filter((x) => x.provisional).length + ' provisional';
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  if (process.argv.includes('--check') || process.argv.includes('--stats')) {
    /* ⚠ no network: a gate that depends on USGS or NASA being up fails for a reason that is not the commit's */
    const idx = readPrev();
    if (!idx) { console.error('weekly-earth: ' + OUT + ' is missing — run node scripts/build-weekly-earth.mjs'); process.exit(1); }
    const bad = problems(idx);
    if (bad.length) { console.error('weekly-earth: ' + bad.slice(0, 12).join('; ')); process.exit(1); }
    console.log('weekly-earth ok — ' + stats(idx));
    process.exit(0);
  }
  const prev = readPrev();
  const t0 = Date.now();
  const { idx, fetched } = await build(prev, new Date());
  if (!fetched.length) { console.log('weekly-earth: nothing to add — ' + stats(prev)); process.exit(0); }
  const bad = problems(idx);
  if (bad.length) throw new Error('weekly-earth: the assembled archive is not valid, nothing written — ' + bad.slice(0, 8).join('; '));
  const body = JSON.stringify(idx) + '\n';
  writeFileSync(join(ROOT, OUT), body);
  console.log('weekly-earth: asked for ' + fetched.length + ' week(s) in ' + Math.round((Date.now() - t0) / 1000) + ' s; wrote ' + OUT + ' (' + body.length + ' bytes) — ' + stats(idx));
}
