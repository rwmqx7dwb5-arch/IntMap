/* ============================================================================
 *  IntMap · ONE DOOR FOR THE SHIPPED DATA — window.IntMapDataDoor  (data-one-door)
 * ----------------------------------------------------------------------------
 *  The files under data/ are read by more than one module, and before this file each reader
 *  opened its own copy. MEASURED on the tree this was written against:
 *    · data/admin1-world.json.gz (2.38 MB gzipped, 7.51 MB of JSON) — fetched, un-gzipped and
 *      parsed by js/world-packs.js `worldAdm1()` AND by js/atlas-admin1.js `rawLoad()`, two
 *      Promises that knew nothing of each other (js/net-health-live.js's header counted them);
 *    · data/volcanoes_gvp.json — js/beta-overlays.js `volcLoad()`, the same file's `featuresOf()`,
 *      and js/compare.js: three reads;
 *    · data/whc-sites.json — `whsLoad()` and `featuresOf()`, and `featuresOf` never looked at the
 *      loading flag, so two calls in flight at once fetched the document twice;
 *    · the gzip inflate and the JSON.parse of every compressed file ran on the UI thread —
 *      data/gazetteer-world.json.gz (13.28 MB of JSON) the largest of them.
 *
 *  `load(url, { as, cache })` is the one reader now:
 *
 *  ── ONE PROMISE PER FILE ─────────────────────────────────────────────────────────────────────
 *  The key is the URL RESOLVED against the page (so 'data/x' and its absolute spelling are one
 *  file) plus the shape asked for (`as`: 'json' | 'text' | 'arrayBuffer'). Every call made while a
 *  read is in flight gets THAT read's promise. A call made after it settled gets the SAME value
 *  back without a request, as long as somebody still holds that value.
 *  ⚠ …AND ONLY THAT LONG, WHICH IS DELIBERATE. The settled value is held through a WeakRef. The
 *  readers keep what they need (js/gazetteer.js converts the 13 MB document into its own rows and
 *  drops the document; js/atlas-admin1.js builds an index that points into it); a door that kept a
 *  strong reference would pin the raw document beside every reader's derived copy for the life of
 *  the tab. When nobody holds it any more, the next `load()` reads it again — the HTTP cache's
 *  business, not a second in-memory store's. A string (`as:'text'`) cannot be a WeakRef target and
 *  is kept as it is.
 *  ⚠ THE VALUE IS SHARED. Every caller of one file gets the same object; a reader that writes onto
 *  it writes for everyone. The one writer today is js/beta-overlays.js `volcApplyStatus`, which puts
 *  an observatory's status on each volcano's properties — it already shared that object between the
 *  layer and `featuresOf`, and js/compare.js hands the same object to its own map source, which
 *  copies it at `addSource` and has no paint rule that reads the field.
 *
 *  ── A FAILURE IS NOT KEPT ────────────────────────────────────────────────────────────────────
 *  A rejected read is dropped from the table the moment it rejects, so the NEXT call reads again —
 *  after an observed failure and only then (.agents/rules/one-pass-or-a-reason.md §5). Nothing here
 *  retries on its own: the caller that asks again is the one that decided to.
 *  Every rejection carries `reason`, the vocabulary js/fetch-deadline.js already speaks, so a caller
 *  can tell 「nothing arrived」 from 「the host said no」 from 「what arrived is not the file」:
 *    'timeout'     the host went silent for longer than its clock (js/proxy-fetch.js clockFor)
 *    'network'     the request was refused before an answer
 *    'http'        an answer that is not 2xx — `status` says which
 *    'parse'       an answer that is not the document: a truncated gzip, JSON that does not parse
 *    'unsupported' the body is gzip and this runtime has no DecompressionStream
 *    'worker'      the inflate thread died under the read (the next call runs it on the page)
 *
 *  ── THE CLOCK IS js/fetch-deadline.js's, WITH ITS IDLE MODE ───────────────────────────────────
 *  `readWithin(url, clockFor(url), init, { idle: true, bytes: true })`: the deadline bounds the
 *  longest SILENCE, not the length of the download, so a slow line delivering 5 MB is not a stall
 *  and a connection that stops is — at any size. Before this file none of these reads had a clock.
 *
 *  ── GZIP IS DECIDED FROM THE BYTES, AND THE INFLATE RUNS ON ANOTHER THREAD ────────────────────
 *  The gzip magic number decides, not the file name (the rule js/gazetteer.js and js/coastline.js
 *  already followed: a host that labels `.gz` with Content-Encoding has inflated it already).
 *  A gzip body is handed to a Worker — TRANSFERRED, so the hand-over copies nothing — which inflates
 *  it, parses it and posts the result back. An uncompressed body is decoded and parsed on the page.
 *  ⚠ THE RESULT COMES BACK BY STRUCTURED CLONE, AND THAT IS NOT FREE. MEASURED (Playwright Chromium,
 *  median of 3 fresh pages, long tasks on the page thread while one file is read, 2026-09-29):
 *
 *                                         page path            worker path
 *     4× CPU throttle (a phone's budget)  sum / longest (ms)   sum / longest (ms)
 *     gazetteer-world.json.gz  5.29 MB    550 / 361            254 / 254
 *     admin1-world.json.gz     2.38 MB    286 / 185            142 / 142
 *     gazetteer-phone.json.gz  0.56 MB     52 /  52              0 /   0
 *     slab2.bin.gz (bytes)     0.97 MB     67 /  67              0 /   0
 *     whc-detail.en.json.gz    0.31 MB      0 /   0              0 /   0
 *     coastline.json.gz        0.26 MB      0 /   0              0 /   0
 *     unthrottled desktop: gazetteer-world 117 / 117 → 52 / 52; everything else 0 → 0.
 *
 *  What remains on the worker path for the two big files is the clone's DESERIALISATION — the
 *  objects have to be built on the thread that uses them, and no worker can do that part. Handing
 *  back the TEXT and parsing it here instead was measured too and was worse (gazetteer-world
 *  314 / 314, admin1 158 / 158), so objects it is. Binary results are transferred back and cost
 *  nothing to receive.
 *  ⚠ THE BAND WHERE IT DOES NOT HELP: at or below ~0.35 MB of gzip (whc-detail, coastline) neither
 *  path produced a long task; the worker added 7–14 ms of latency unthrottled (spawn + two
 *  hand-overs) and none measurable at 4× (whc-detail 32 → 26 ms, coastline 37 → 34 ms end to end).
 *  They still go to the worker — one path, no threshold to keep true — because the cost is latency
 *  on a read nobody is waiting on frame by frame, not blocking. Uncompressed JSON is NOT sent:
 *  whc-sites.json (0.62 MB) and volcanoes_gvp.json (0.30 MB) produced no long task on the page and
 *  +16–22 ms end to end through a worker (unthrottled).
 *  ⚠ LAPSES if an uncompressed data file of several MB is ever shipped (it would then want the
 *  worker too — measure it first), or if a browser starts inflating DecompressionStream off-thread on
 *  its own. This table is the canonical copy; DECISIONS.md states the decision and points here, and
 *  the measurement run is in dev-notes/2026-09-29-data-one-door.md.
 *
 *  ⚠ THE JOB IS ONE FUNCTION WITH TWO CALLERS. `inflate()` below is what the page runs when there is
 *  no Worker (a runtime without one, a CSP that refuses it, a thread that died), and its own source
 *  text — `inflate.toString()` — is what the Worker is built from. There is no second copy that could
 *  disagree with it; tests/data-one-door-checks.test.mjs runs that text on a real second thread and
 *  compares its answer with the page path's.
 *  ⚠ A BLOB WORKER, NOT `new URL('./x.js', import.meta.url)`: that form is the bundler's and a js/
 *  module may not write it (js/gis-worker.js records why). index.html allows `worker-src blob:`.
 *  ⚠ THE THREAD IS GIVEN BACK WHEN IT IS IDLE. It is spawned on the first compressed read and
 *  terminated when the last job in it has answered, so a session that has finished reading holds no
 *  thread and no heap for it.
 * ==========================================================================*/
import { readWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';

/* The job. SELF-CONTAINED ON PURPOSE: its source text is what the worker evaluates, so it may reach
   nothing but the platform's own globals — a name borrowed from this module would not be in the
   text. `kind` is 'json' | 'text' | 'arrayBuffer'. */
async function inflate(bytes, kind) {
  let b = new Uint8Array(bytes);
  if (b.length > 1 && b[0] === 0x1f && b[1] === 0x8b) {
    if (typeof DecompressionStream !== 'function') {
      const e = new Error('DecompressionStream unavailable'); e.reason = 'unsupported'; throw e;
    }
    b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  }
  if (kind === 'arrayBuffer') return (b.byteOffset === 0 && b.byteLength === b.buffer.byteLength) ? b.buffer : b.slice().buffer;
  const text = new TextDecoder().decode(b);
  if (kind === 'text') return text;
  return JSON.parse(text);
}

/* The worker's whole program: the job's own text, and the message loop around it. `var job = (…)`
   rather than calling the function by its name, because a minifier renames a declaration and the
   text would then define a name nothing calls. */
function workerSource() {
  return '"use strict";\nvar job = (' + inflate.toString() + ');\n' +
    'self.onmessage = function (e) {\n' +
    '  var m = e.data || {};\n' +
    '  job(m.bytes, m.kind).then(function (v) {\n' +
    '    self.postMessage({ id: m.id, ok: true, value: v }, (v instanceof ArrayBuffer) ? [v] : []);\n' +
    '  }, function (err) {\n' +
    '    self.postMessage({ id: m.id, ok: false, reason: (err && err.reason) || "parse", message: String((err && err.message) || err) });\n' +
    '  });\n' +
    '};\n';
}

const failed = (e, reason, extra) => {
  const err = (e && typeof e === 'object') ? e : new Error(String(e));
  try { if (!err.reason) err.reason = reason; if (extra) Object.assign(err, extra); } catch (_) { /* a frozen error keeps its shape */ }
  return err;
};

/* makeDataDoor(deps) — one door. The app uses the single instance at the bottom of this file; a test
   builds its own so that its counts start from zero.
     deps.spawn()  -> a Worker-shaped object or null   (default: a Blob worker from workerSource())
     deps.base()   -> the URL relative paths resolve against (default: the document's) */
export function makeDataDoor(deps) {
  const d = deps || {};
  const entries = new Map();
  const counts = { reads: 0, shared: 0, reused: 0, worker: 0, page: 0 };

  const base = () => {
    if (typeof d.base === 'function') return d.base();
    try { return (window.IM_HOST && window.IM_HOST.base) || document.baseURI; } catch (_) { return undefined; }
  };
  const resolve = (url) => { try { const b = base(); return b ? new URL(String(url), b).toString() : String(url); } catch (_) { return String(url); } };

  /* ── the thread ── */
  let w = null, broken = false, seq = 0;
  const jobs = new Map();
  const defaultSpawn = () => {
    if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    const u = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
    try { return new Worker(u); } finally { try { URL.revokeObjectURL(u); } catch (_) { /* nothing to revoke */ } }
  };
  function settleAll(reason, message) {
    jobs.forEach((j) => { try { j.rej(failed(new Error(message), reason)); } catch (_) { /* nobody listening */ } });
    jobs.clear();
  }
  function retire() { const it = w; w = null; if (it) { try { it.terminate(); } catch (_) { /* already gone */ } } }
  function thread() {
    if (w || broken) return w;
    try { w = (typeof d.spawn === 'function' ? d.spawn : defaultSpawn)(); } catch (_) { w = null; }
    if (!w) { broken = true; return null; }
    const it = w;
    it.onmessage = (ev) => {
      const m = (ev && ev.data) || {};
      const j = jobs.get(m.id); if (!j) return;
      jobs.delete(m.id);
      if (m.ok) j.res(m.value);
      else j.rej(failed(new Error(m.message || 'inflate failed'), m.reason || 'parse'));
      if (!jobs.size && w === it) retire();
    };
    /* a thread that dies does not take the reads with it: they reject as 'worker', the door drops
       them, and the next call runs on the page — a different path, after an observed failure */
    it.onerror = () => { broken = true; if (w === it) retire(); settleAll('worker', 'inflate worker died'); };
    it.onmessageerror = it.onerror;
    return w;
  }
  function onThread(bytes, kind) {
    const it = thread();
    if (!it) return null;
    const id = ++seq;
    const p = new Promise((res, rej) => { jobs.set(id, { res, rej }); });
    try { it.postMessage({ id, bytes, kind }, [bytes]); }
    catch (_) { jobs.delete(id); broken = true; if (!jobs.size) retire(); return null; }
    counts.worker++;
    return p;
  }

  async function readOnce(abs, kind, opts) {
    const init = (opts && opts.cache) ? { cache: opts.cache } : undefined;
    let r;
    try { r = await readWithin(abs, clockFor(abs), init, { idle: true, bytes: true }); }
    catch (e) { throw failed(e, 'network', { url: abs }); }
    if (!r.ok) throw failed(new Error('http ' + r.status + ' ' + abs), 'http', { status: r.status, url: abs });
    const head = new Uint8Array(r.bytes, 0, Math.min(2, r.bytes.byteLength));
    if (head.length === 2 && head[0] === 0x1f && head[1] === 0x8b) {
      const p = onThread(r.bytes, kind);
      if (p) return p.catch((e) => { throw failed(e, 'parse', { url: abs }); });
    }
    counts.page++;
    try { return await inflate(r.bytes, kind); }
    catch (e) { throw failed(e, 'parse', { url: abs }); }
  }

  const weakable = (v) => typeof WeakRef === 'function' && v !== null && (typeof v === 'object' || typeof v === 'function');

  /** load(url, { as, cache }) -> Promise<value>. One read per file, shared by every caller. */
  function load(url, opts) {
    const kind = (opts && opts.as) || 'json';
    if (kind !== 'json' && kind !== 'text' && kind !== 'arrayBuffer') return Promise.reject(failed(new Error('unknown shape ' + kind), 'parse'));
    const abs = resolve(url);
    const key = kind + ' ' + abs;
    const e = entries.get(key);
    if (e) {
      if (e.p) { counts.shared++; return e.p; }
      const v = e.weak ? e.ref.deref() : e.ref;
      if (v !== undefined) { counts.reused++; return Promise.resolve(v); }
      entries.delete(key);
    }
    counts.reads++;
    const p = readOnce(abs, kind, opts).then((v) => {
      const weak = weakable(v);
      entries.set(key, { p: null, ref: weak ? new WeakRef(v) : v, weak });
      return v;
    }, (err) => { entries.delete(key); throw err; });
    entries.set(key, { p, ref: null, weak: false });
    return p;
  }

  return {
    load,
    /* what this door has done, for a check and for the console — never a decision input */
    counts: () => Object.assign({ inFlight: jobs.size, thread: !!w }, counts),
    workerSource,
    inflate,
  };
}

/* ── the one instance ──────────────────────────────────────────────────────────────────────────
   Modules import `loadData` (the door's `load`); classic-script files (js/gazetteer.js is evaluated by `new Function` in its
   node harnesses, so an `import` line is not open to it) reach the same instance through
   window.IntMapDataDoor. One table either way. */
const door = makeDataDoor();
export const loadData = door.load;
try { if (typeof window !== 'undefined') window.IntMapDataDoor = { load: door.load, counts: door.counts }; } catch (_) { /* no window in a node check */ }
