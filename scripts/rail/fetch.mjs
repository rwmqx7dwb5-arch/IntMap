/* ============================================================================
 *  IntMap · WORLD RAILWAYS — the download (#R388)
 * ----------------------------------------------------------------------------
 *  Sweeps OpenStreetMap for every running railway line on the planet and caches
 *  one JSON file per grid cell. `scripts/rail/build.mjs` turns that cache into
 *  the shipped shards; nothing downloads at build time, so a rebuild is free.
 *
 *  ══ WHY THIS EXISTS ═════════════════════════════════════════════════════════
 *  The layer it replaces did not read a single track's gauge. `_rail_convert.py`
 *  took Natural Earth's geometry, found which country each line's MIDPOINT fell
 *  in, and painted the whole line with that country's predominant gauge. MEASURED
 *  against OSM: that painted all 169 standard-gauge ways of the Spanish AVE
 *  network as 1668 mm Iberian, and all 249 of India's 762 mm lines as 1676 mm.
 *  The label said "by gauge" and the data had never seen a gauge.
 *
 *  ══ THREE THINGS THIS FILE LEARNED BY MEASURING ═════════════════════════════
 *
 *  ⚠ THE TRANSPORT IS curl, NOT fetch — the same finding scripts/companies/osm.mjs
 *    made and for the same reason: undici stops reaching overpass-api.de while
 *    curl against the same URL in the same second returns 200. fetch stays as the
 *    fallback so this still runs on a machine with no curl.
 *
 *  ⚠ THE GRID ADAPTS, IT IS NOT CHOSEN. A cell over the Sahara answers in a
 *    second; the same cell over the Ruhr times out. Guessing a cell size that
 *    suits both is guessing wrong twice, so a cell that times out SPLITS INTO
 *    FOUR and each quarter is asked again. ⚠ AND THE START SIZE IS NOT FREE: the
 *    first run began at 30° and MEASURED 2 cells in 8 minutes, because a 30° cell
 *    over Europe spends the FULL server timeout before it can be known to be too
 *    big, and then so do three of its four quarters. 10° start, 0.625° floor.
 *
 *  ⚠ "TOO BUSY" AND "TOO BIG" LOOK THE SAME AND ARE NOT. Overpass answers both
 *    with 200 and an XML error page. `Dispatcher_Client…too busy` means come back
 *    later — splitting the cell makes MORE load and still fails. `Query timed out`
 *    / `Query run out of memory` means the cell is too big — waiting never helps.
 *    Reading the message is the whole difference between converging and looping.
 *
 *  Usage
 *    node scripts/rail/fetch.mjs                  sweep the world (resumable)
 *    node scripts/rail/fetch.mjs --bbox s,w,n,e   one region only
 *    node scripts/rail/fetch.mjs --stats          report the cache, download nothing
 * ==========================================================================*/
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* The cache lives OUTSIDE the repository: it is ~2 GB of upstream responses and
   an input to the build, not a product of it. `data/railways/` is the product. */
export const CACHE_DIR = process.env.INTMAP_RAIL_CACHE
  || join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'intmap-rail-cache');

/* ══ ⚠⚠⚠ AN INSTANCE THAT ANSWERS IS NOT AN INSTANCE THAT HAS THE PLANET ══════
   The first complete sweep returned 540 cells, 505 of them "empty", zero splits,
   177,602 ways — for a planet that has 2,816,264 `railway=rail` ways. Nothing
   errored. Nothing timed out. Two thirds of the world came back as a valid,
   well-formed, 200 OK, EMPTY RESULT SET, and the cache filed every one of them
   as a legitimately empty cell.

   The cause: `overpass.osm.ch` is the SWISS instance. It holds Switzerland and
   answers every other bbox with `{"elements":[]}`. It HAD been probed — with a
   bbox in GENEVA, which it of course has, so the probe proved only that the
   server was up. MEASURED afterwards with one query in four regions: India 0,
   Brazil 0, Germany 0, Japan 0 — against maps.mail.ru's 183 / 1,063 / 5,650 /
   12,686 for the identical question.

   So the gate below is not a health check, it is a COVERAGE check: a bbox that
   MUST be populated, and any instance that calls it empty is rejected. A 502 is
   loud and costs one retry. A regional instance quietly reporting that Germany
   has no railways is the expensive one, and the only thing that catches it is
   asking a question whose answer you already know. */
const CANDIDATES = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.monicz.dev/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];
/* The Ruhr, one degree square. MEASURED 5,650 running `railway=rail` ways — a
   number no planet instance can honestly report as zero. */
export const PROBE_BODY = '[out:json][timeout:90];way["railway"="rail"][!service](50,8,51,9);out ids;';
export const PROBE_MIN = 2000;
export let ENDPOINTS = [];

export async function electEndpoints(log = () => {}) {
  const verdicts = await Promise.all(CANDIDATES.map(async (ep) => {
    const host = new URL(ep).hostname;
    let text;
    try { text = await post(ep, PROBE_BODY, 100000); }
    catch (e) { return [ep, host, 'unreachable (' + String(e).slice(0, 44) + ')', false]; }
    if (classifyError(text) !== 'ok') return [ep, host, 'error page', false];
    let n;
    try { n = JSON.parse(text).elements.length; } catch (_) { return [ep, host, 'unparseable', false]; }
    if (n < PROBE_MIN) return [ep, host, 'answered ' + n + ' of ~5650 — NOT A PLANET INSTANCE', false];
    return [ep, host, n + ' ways', true];
  }));
  for (const [, host, why, ok] of verdicts) log(`    ${ok ? '✓' : '✗'} ${host} — ${why}`);
  ENDPOINTS = verdicts.filter((v) => v[3]).map((v) => v[0]);
  if (!ENDPOINTS.length) throw new Error('no Overpass instance passed the coverage probe — refusing to sweep');
  return ENDPOINTS;
}
const UA = 'IntMap-rail-pipeline/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap; intmapofficial@gmail.com)';
/* overpass-api.de publishes "Rate limit: 2" at /api/status, and scripts/companies/osm.mjs
   measured a third in flight being refused at the socket. That limit is PER SERVER, so
   the pool is TWO PER ENDPOINT: each worker starts on its own instance and steps to the
   next one on every retry. Six unpinned workers would be six on whichever instance
   answered first, which is the limit violation wearing a hat. */
const PER_ENDPOINT = 2;
/* how many times a refused cell is put back before it is called lost, and how long the whole pool
   waits each time. Long, because the thing being waited on is a public instance's recovery. */
const MAX_REQUEUE = 6;
const COOLOFF_S = 120;
const START_DEG = 10;      /* first pass cell size */
const MIN_DEG = 0.625;     /* 10 / 2^4 — below this a cell is a city, not a region */

/* ── the tags we keep ──────────────────────────────────────────────────────
   Overpass `out geom` returns every tag a way carries; MEASURED on Iberia that
   is 72% of the payload and we use a fifth of it. `convert` projects the way to
   just these before it is serialised. ⚠ A tag absent here can never appear in
   the product — adding a colour axis later means sweeping the planet again, so
   the list is generous.

   ⚠ AND THE KEYS ARE ONE LETTER BECAUSE `convert` EMITS THE ABSENT ONES. A tag
   the way does not carry comes back as `""`, not as nothing: MEASURED on a Swiss
   cell, 31% of the file was the NAMES of tags that were not there. One-letter
   keys make that 12%. The mapping is here and only here, and build.mjs imports
   it — two copies of it would be two things to get out of step. */
export const KEEP = {
  a: 'railway', b: 'gauge', c: 'gauge:1', d: 'gauge:2',
  e: 'electrified', f: 'voltage', g: 'frequency',
  h: 'maxspeed', i: 'tracks', j: 'usage',
  k: 'highspeed', l: 'railway:traffic_mode', m: 'passenger_lines',
  n: 'name', o: 'name:en', p: 'ref', q: 'operator',
  r: 'operator:short', s: 'operator:wikidata', t: 'owner',
  u: 'network', v: 'start_date', w: 'tunnel', x: 'bridge',
  y: 'wikidata', z: 'construction', A: 'construction:railway',
  B: 'railway:preserved', C: 'railway:etcs', D: 'loading_gauge', E: 'axle_load',
  F: 'layer', G: 'railway:track_ref',
};

/* ⚠ THE LINE CLASSES ARE A DECISION, NOT A DEFAULT. `service` ways (yards,
   sidings, spurs, crossovers) are 36% of `railway=rail` and are not routes —
   drawing them makes every junction a blob. They are excluded at the SERVER so
   they are never downloaded.
   `construction` rides along at +2% of the sweep (MEASURED 42,750 ways planet-
   wide) because the cache is an input, not a product: what ships is decided in
   build.mjs, and re-deciding must never mean sweeping the planet twice. */
export const CLASSES = 'rail|narrow_gauge|light_rail|subway|tram|construction';

function convertClause() {
  const parts = ['::id=id()', '::geom=geom()'];
  for (const [out, tag] of Object.entries(KEEP)) parts.push(`${out}=t["${tag}"]`);
  return 'convert item ' + parts.join(',') + ';';
}

export function queryFor([s, w, n, e]) {
  return `[out:json][timeout:240];way["railway"~"^(${CLASSES})$"][!service]`
    + `(${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)});`
    + convertClause() + 'out geom;';
}

/* ── transport ─────────────────────────────────────────────────────────── */
let curlOk = null;
function curlPost(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const args = ['-s', '-m', String(Math.ceil(timeoutMs / 1000)), '-A', UA,
      '--data-urlencode', 'data=' + body, url];
    let p;
    try { p = spawn('curl', args, { windowsHide: true }); }
    catch (err) { reject(err); return; }
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) { reject(new Error('curl exit ' + code + ' ' + err.slice(0, 160))); return; }
      resolve(out);
    });
  });
}

export async function post(url, body, timeoutMs) {
  if (curlOk !== false) {
    try { const t = await curlPost(url, body, timeoutMs); curlOk = true; return t; }
    catch (e) { if (/ENOENT|exit 127/.test(String(e))) curlOk = false; else throw e; }
  }
  const ctl = AbortSignal.timeout(timeoutMs);
  const r = await fetch(url, {
    method: 'POST', signal: ctl, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(body),
  });
  return r.text();
}

/* ⚠ Overpass answers BOTH failures with 200 and an XML page. Splitting a cell
   that was refused for load makes more load; waiting on a cell that is genuinely
   too big never converges. The message is the only thing that separates them. */
export function classifyError(text) {
  /* ⚠ A PARSE ERROR IS PERMANENT AND MUST BE LOUD. This class was missing, and the station sweep
     spent its whole run "retrying" a query the server had already rejected as ill-formed: MEASURED,
     an invalid `convert item ::geom=center()` came back as an OSM3S error page reading «parse error:
     center(...) must have one or more arguments», which matched none of the patterns below and fell
     through to the transient default. A classifier whose default is "try again" turns a programming
     mistake into an infinite loop that looks exactly like an overloaded server. */
  if (/parse error|static error|Unknown type|encoding error/i.test(text)) return 'bad-query';
  if (/too busy|Dispatcher_Client|rate_limited|Too Many Requests/i.test(text)) return 'busy';
  if (/run out of memory|Query timed out|timed out/i.test(text)) return 'too-big';
  if (/^\s*[[{]/.test(text)) return 'ok';
  return 'busy';   /* an unfamiliar error page is treated as transient, never as a reason to split */
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cellKey = ([s, w, n, e]) => `${s.toFixed(4)}_${w.toFixed(4)}_${n.toFixed(4)}_${e.toFixed(4)}`.replace(/-/g, 'm');

async function fetchCell(box, log, home = 0) {
  const body = queryFor(box);
  let busyStreak = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    /* start home, step to the next instance on every retry — a dead mirror costs
       one attempt, not the whole backoff ladder */
    const ep = ENDPOINTS[(home + attempt) % ENDPOINTS.length];
    let text;
    try { text = await post(ep, body, 270000); }
    catch (e) { busyStreak++; await sleep(Math.min(60000, 4000 * busyStreak)); continue; }
    const cls = classifyError(text);
    /* a query the server cannot parse will never parse — say so and stop, do not retry a bug */
    if (cls === 'bad-query') throw new Error('Overpass rejected the query as ill-formed:\n' + text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').slice(0, 400));
    if (cls === 'ok') {
      try { return { ok: true, json: JSON.parse(text) }; }
      catch (_) { return { ok: false, reason: 'too-big' }; }
    }
    if (cls === 'too-big') return { ok: false, reason: 'too-big' };
    busyStreak++;
    log(`    busy (${new URL(ep).hostname}) — waiting ${Math.min(60, 4 * busyStreak)}s`);
    await sleep(Math.min(60000, 4000 * busyStreak));
  }
  return { ok: false, reason: 'busy' };
}

function split([s, w, n, e]) {
  const my = (s + n) / 2, mx = (w + e) / 2;
  return [[s, w, my, mx], [s, mx, my, e], [my, w, n, mx], [my, mx, n, e]];
}

/* ── the sweep ─────────────────────────────────────────────────────────── */
export function worldCells(deg = START_DEG) {
  const out = [];
  /* ⚠ 84°N / 60°S is not tidy-mindedness: Web Mercator itself stops at 85.05°,
     and the southernmost railway in OSM is on the Antarctic coast at ~78°S but
     is a `service` way. Sweeping the empty caps costs 24 requests that answer 0. */
  for (let s = -60; s < 84; s += deg) {
    for (let w = -180; w < 180; w += deg) {
      out.push([s, w, Math.min(84, s + deg), Math.min(180, w + deg)]);
    }
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
  mkdirSync(CACHE_DIR, { recursive: true });

  if (argv.includes('--stats')) {
    const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
    let bytes = 0, ways = 0;
    for (const f of files) {
      bytes += statSync(join(CACHE_DIR, f)).size;
      try { ways += JSON.parse(readFileSync(join(CACHE_DIR, f), 'utf8')).elements.length; } catch (_) {}
    }
    console.log(`cache ${CACHE_DIR}\n  cells ${files.length}  ways ${ways}  bytes ${(bytes / 1e6).toFixed(1)} MB`);
    return;
  }

  const log = (...a) => console.log(...a);
  const only = arg('--bbox', '');
  let queue = only ? [only.split(',').map(Number)] : worldCells();

  log('electing Overpass instances (coverage probe: the Ruhr must not be empty) …');
  await electEndpoints(log);
  log('  using ' + ENDPOINTS.length + ' instance(s) × ' + PER_ENDPOINT + ' in flight');
  log(`IntMap rail sweep · ${queue.length} cells at ${START_DEG}° · cache ${CACHE_DIR}`);

  let done = 0, empty = 0, ways = 0, splits = 0, failed = [];
  const requeued = new Map();
  let attempts = 0;
  const t0 = Date.now();

  async function worker(slot) {
    for (;;) {
      const box = queue.shift();
      if (!box) return;
      attempts++;
      const key = cellKey(box);
      const path = join(CACHE_DIR, key + '.json');
      if (existsSync(path)) {
        try { ways += JSON.parse(readFileSync(path, 'utf8')).elements.length; done++; continue; } catch (_) {}
      }
      const deg = box[2] - box[0];
      const r = await fetchCell(box, log, slot % ENDPOINTS.length);
      if (!r.ok) {
        if (r.reason === 'too-big' && deg > MIN_DEG) { queue.push(...split(box)); splits++; continue; }
        /* ══ ⚠⚠⚠ A CELL THAT WAS REFUSED IS NOT A CELL THAT WAS ANSWERED ══════════════════════
           The first long run lost 34 cells this way. maps.mail.ru — by then the only instance the
           coverage probe would elect — started refusing the 10° queries while still answering the
           1° probe, and every cell that reached the end of its retry ladder was written off. The
           sweep reported "done" and the world simply had a hole in it, in the one direction
           (Central Asia, 40–50°N) nobody would look at twice.
           So a refusal is a DELAY, not an answer: the cell goes to the back of the queue, the pool
           pauses long enough for the instance to recover, and the instances are re-elected. Only
           after MAX_REQUEUE rounds of that is a cell called lost — loudly. */
        const tries = (requeued.get(key) || 0) + 1;
        if (tries <= MAX_REQUEUE) {
          requeued.set(key, tries);
          queue.push(box);
          log(`  … ${key} refused (${r.reason}) — requeued ${tries}/${MAX_REQUEUE}, cooling off ${COOLOFF_S}s`);
          try { await electEndpoints(() => {}); } catch (_) { /* keep what we have */ }
          await sleep(COOLOFF_S * 1000);
          continue;
        }
        failed.push(box.join(','));
        log(`  ✗ ${key} ${r.reason} — GIVEN UP after ${MAX_REQUEUE} requeues`);
        continue;
      }
      const n = r.json.elements.length;
      ways += n; done++;
      if (n === 0) empty++;
      writeFileSync(path, JSON.stringify(r.json));
      /* ⚠ THE ELECTION IS NOT ONCE, AND IT CANNOT BE COUNTED IN SUCCESSES. overpass-api.de was
         timing out when the first run started, so the sweep went out with ONE instance; when that
         one began refusing, `done` stopped advancing and the re-election — keyed on `done` —
         never fired again. A recovery check that only runs while things are going well is not a
         recovery check. It is keyed on ATTEMPTS now, and the requeue path above re-elects too. */
      if (attempts % 60 === 0) {
        const had = ENDPOINTS.length;
        try { await electEndpoints(() => {}); } catch (_) { /* keep what we have */ }
        if (ENDPOINTS.length !== had) log(`  instances ${had} → ${ENDPOINTS.length}`);
      }
      if (done % 10 === 0 || n > 20000) {
        const mins = ((Date.now() - t0) / 60000).toFixed(1);
        log(`  ${done} cells (${empty} empty, ${splits} splits) · ${ways} ways · ${mins} min · queue ${queue.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: PER_ENDPOINT * ENDPOINTS.length }, (_, i) => worker(i)));
  log(`\ndone · ${done} cells · ${ways} ways · ${splits} splits · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  if (failed.length) log(`⚠ ${failed.length} cells never answered:\n  ` + failed.join('\n  '));
}

/* ⚠ `process.argv[1]` is UNDEFINED under `node -e "import(…)"`, and this guard read
   `.replace` off it — so merely importing this module to check that it parses threw
   a TypeError that looked like a syntax problem in the file. Importers (stations.mjs,
   build.mjs) must be able to load it without running the sweep OR crashing. */
if (import.meta.url === 'file:///' + String(process.argv[1] || '').replace(/\\/g, '/')) main();
