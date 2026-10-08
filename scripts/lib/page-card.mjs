/* ============================================================================
 *  IntMap · scripts/lib/page-card.mjs — the link cards of the year pages and the country pages (1200×630 PNG, no browser)   (marketing-growth)
 * ----------------------------------------------------------------------------
 *  A link to «The world in 1914» posted anywhere is read by its picture first. Until this file every year page and every
 *  country page named the site's one card (og-image.jpg) — a screenshot of an earlier screen whose own caption says
 *  «See the past world — 1900 to present» (docs/marketing/README.md A4) — so a post about 1453 or about Peru showed the
 *  same, out-of-date picture. Each page now gets a card of its own, drawn from what the page itself shows:
 *
 *    · drawWorldCard   the year pages (scripts/year-pages.mjs): the SAME features the page's world-map.svg draws (the
 *                      collection the map draws on 1 July of that year, js/time-borders.js collectionAt), in the SAME
 *                      projection (Equal Earth) and the same colour per name (scripts/lib/world-svg.mjs `hue`), outlines
 *                      borrowed from a sheet of another year drawn paler as the page's picture draws them — and the year
 *                      in figures, so the one picture serves both languages (the words are the page's og:title);
 *    · drawCountryCard the country pages (scripts/country-pages.mjs): the country's outline (Natural Earth admin-0, the
 *                      outline the page and the public API are about) filled, the countries around it as land, framed
 *                      on the page's own frame (js/country-extent.js homeExtent) — no words but the wordmark, because a
 *                      country's name differs by language and the card is one picture for both.
 *
 *  ⚠ THE CARD STATES NOTHING THE PAGE DOES NOT. Both draw only geometry the page already lists or links; neither adds a
 *  name, a date or a claim. The raster, the Mercator frame, the figures and the PNG writer are scripts/lib/map-card.mjs's
 *  (the «on this day» cards'); the Equal Earth rings are scripts/lib/world-svg.mjs's — nothing is copied.
 *  ⚠ SIMPLIFIED FOR DISPLAY ONLY (.agents/rules/historical-verification.md §0): rings are reduced to a third of an output
 *  pixel; the data is untouched.
 * ==========================================================================*/
import { CARD, frameFor, mercatorPainter, stamp, png, canvas, fillRings, strokeRing, downsample, CARD_COLOURS as C, CARD_SUPERSAMPLE as SS } from './map-card.mjs';
import { isMainThread, workerData } from 'node:worker_threads';
import { pixelRings, outlineRing, heightAt, FILLS, hue } from './world-svg.mjs';

export { CARD };
export const CARD_FILE = 'card.png';

const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/* the dark scheme of the page's own picture (world-svg.mjs: ocean #0c1a2b, land #3a3a3c, outlines #1c1c1e, the tints at .62
   and a borrowed outline at .3) — the same picture as the page shows a reader in dark mode, on the card's black */
const WORLD = { outside: [0, 0, 0], ocean: rgb('#0c1a2b'), land: rgb('#3a3a3c'), edge: rgb('#1c1c1e'), tint: 0.62, pale: 0.3 };
const TINTS = FILLS.map(rgb);

/**
 * The world on one date, as a year page draws it.
 * @param {{ land: object[], features: { geometry: object, name: string, pale?: boolean }[], label: string }} o
 *   `land` today's land (GeoJSON geometries — the page's own, Natural Earth 1:110m); `features` the page's features in drawing
 *   order (scripts/year-pages.mjs `drawn`); `label` the year in figures (history-pages.mjs yearWords(y, 'en'))
 * @returns {Promise<Buffer>} the PNG
 */
export async function drawWorldCard(o) {
  const W = CARD.width * SS, H = CARD.height * SS;
  const cv = canvas(W, H, WORLD.outside);
  /* the whole world as wide as the card, in the middle of its height */
  const mw = W, mh = heightAt(mw), oy = (H - mh) / 2;
  const at = (rings) => rings.map((r) => r.map(([x, y]) => [x, y + oy]));
  fillRings(cv, at([outlineRing(mw)]), WORLD.ocean);
  for (const g of o.land) { const r = pixelRings(g, mw); if (r.length) fillRings(cv, at(r), WORLD.land, 1, true); }
  for (const f of o.features) {
    const r = pixelRings(f.geometry, mw);
    if (!r.length) continue;
    const rr = at(r);
    fillRings(cv, rr, TINTS[hue(f.name)], f.pale ? WORLD.pale : WORLD.tint, true);
    for (const ring of rr) strokeRing(cv, ring, WORLD.edge, 1);
  }
  await stamp(cv, o.label, { band: 'box' });
  return png(downsample(cv, SS));
}

/* ⚠ (no-ad-hoc-hardcoding §4) observation: 2026-10-08, the 252 country cards — the Vatican's outline fills under one output
   pixel and is invisible, the smallest island states a few; a mark is drawn when the country's whole extent on the card is
   under this many output pixels (the marker's own inner dot is 13 px across, so anything smaller reads as less than it).
   lapses: if the card's size or frameFor's MIN_SPAN changes; canonical: here. */
const MARK_BELOW_PX = 12;
/** the box, in canvas pixels, of the copies of a polygon set the frame shows (null when none is in the frame) */
function pixelBox(P, polys) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const dx of P.shifts) {
    if (!P.meets(polys, dx)) continue;
    for (const poly of polys) for (const [x, y] of P.project(poly[0], dx)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x0 === Infinity ? null : [x0, y0, x1, y1];
}

/**
 * A country among its neighbours, as a country page frames it.
 * @param {{ box: number[], country: number[][][][], context: number[][][][][] }} o
 *   `box` the page's frame [w,s,e,n]; `country` the country's polygons; `context` every country's polygons (the land around it)
 * @returns {Promise<Buffer>} the PNG
 */
export async function drawCountryCard(o) {
  const cv = canvas(CARD.width * SS, CARD.height * SS, C.sea);
  const P = mercatorPainter(cv, frameFor(o.box));
  P.fillPolys(o.context, C.ground);
  P.strokePolys(o.context, C.edge, SS);
  P.fillPolys([o.country], C.war, 0.9);
  P.strokePolys([o.country], C.text, SS);
  /* a country smaller than a few pixels of the card (the Vatican, Monaco, a reef) would be filled and still not be seen —
     a card «highlighting» what nobody can find. Its place is marked instead, as the «on this day» cards mark an event. */
  const box = pixelBox(P, o.country);
  if (box && Math.max(box[2] - box[0], box[3] - box[1]) < MARK_BELOW_PX * SS) {
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    const circle = (r) => { const pts = []; for (let i = 0; i < 48; i++) { const t = i / 48 * Math.PI * 2; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return pts; };
    fillRings(cv, [circle(18 * SS)], C.war, 0.25);
    fillRings(cv, [circle(9 * SS)], C.text);
    fillRings(cv, [circle(6.5 * SS)], C.war);
  }
  await stamp(cv, '');
  return png(downsample(cv, SS));
}

/* ══ MANY CARDS — split over worker threads ══════════════════════════════════════════════════════════════════════
   A card is CPU work (measured 2026-10-08 on this machine: ≈0.5 s a year card), and the year pages have 114 of them and
   the country pages 252. The «on this day» cards split their days over child processes that each rebuild the model; a year
   page's model takes ≈50 s to build (scripts/year-pages.mjs `model`), so here the MODEL IS BUILT ONCE and each worker
   thread is handed its share of the jobs (structured clone, no file in between) plus what every job shares (`shared`).
   ⚠ (no-ad-hoc-hardcoding §4) the number of workers is the machine's (os.availableParallelism) less one for the build, at
   most 4 — the same rule and the same reason as scripts/on-this-day-pages.mjs drawCards (canonical there); under
   MIN_SPLIT jobs the start-up of a worker costs more than it saves, so they are drawn here. */
const MIN_SPLIT = 16;
/** one job → its PNG. job: { kind: 'world', file, features, label } | { kind: 'country', file, box, country } */
async function drawJob(job, shared) {
  if (job.kind === 'world') return drawWorldCard({ land: shared.land, features: job.features, label: job.label });
  if (job.kind === 'country') return drawCountryCard({ box: job.box, country: job.country, context: shared.context });
  throw new Error('page-card: no such card kind ' + job.kind);
}
async function writeJobs(jobs, dir, shared) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  for (const job of jobs) { const p = join(dir, job.file); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, await drawJob(job, shared)); }
}
/**
 * Draw every job's card into `dir` (job.file is the path from the site root).
 * @returns {Promise<string[]>} the files written
 */
export async function drawCards(jobs, dir, shared) {
  const os = await import('node:os');
  const k = Math.max(1, Math.min(4, ((os.availableParallelism && os.availableParallelism()) || 2) - 1));
  if (jobs.length < MIN_SPLIT || k === 1) { await writeJobs(jobs, dir, shared); return jobs.map((j) => j.file); }
  const { Worker } = await import('node:worker_threads');
  const shares = Array.from({ length: k }, (_, i) => jobs.filter((_, j) => j % k === i));
  await Promise.all(shares.map((share) => new Promise((ok, fail) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { pageCards: true, jobs: share, dir, shared } });
    w.on('error', fail);
    w.on('exit', (code) => (code ? fail(new Error('page-card: a worker exited with ' + code)) : ok()));
  })));
  return jobs.map((j) => j.file);
}

/* a worker thread started by drawCards draws its share and ends; imported anywhere else, this does nothing */
if (!isMainThread && workerData && workerData.pageCards) {
  const { jobs, dir, shared } = workerData;
  await writeJobs(jobs, dir, shared);
}
