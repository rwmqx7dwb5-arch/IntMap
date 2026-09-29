/* ============================================================================
 *  THE DEM TILE STORE — js/map-readout.js (what the seismic field and the terrain tools read)
 * ----------------------------------------------------------------------------
 *  Consolidated from the round files named in each section below; every test keeps its original
 *  title, tagged with the round that wrote it. Each section is a block so its helpers stay its own.
 *
 *  ⚠ WHY SOME OF THESE STILL READ SOURCE TEXT. The store itself is RUN (the rig below executes
 *    js/map-readout.js in a vm). The pins that remain are on js/seismic.js and js/app-body.js —
 *    callers inside page closures, whose call sites are the claim.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as acorn from 'acorn';
import { codeOnly } from '../scripts/code-only.mjs';
import { readLF } from '../scripts/eol.mjs';

/* one reader for the whole file — the CONTENT of a repository file, whatever line endings this
   checkout produced (scripts/eol.mjs, #R283). Sections that need another shape keep their own. */
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(join(ROOT, p));

/* the rig belonged to #R671; it is lifted out of that section so #R223 and #R226 below can RUN the
   store rather than read it. */
/* ── the rig: the real js/map-readout.js, a fake Image, a fake 256×256 decode ───────────────── */
function demRig({ browseCap = 140, leaseCap = 608, holdLong = false, elev = null } = {}) {
  const imgs = [], every = [];
  const longTimers = [];
  class FakeImage {
    constructor() { this.onload = null; this.onerror = null; this._src = ''; imgs.push(this); every.push(this); }
    set src(v) { this._src = v; }
    get src() { return this._src; }
  }
  /* every pixel decodes to 0 m: (128*256 + 0 + 0/256) − 32768 === 0, alpha 255 → no voids.
     (consolidation) `elev(col,row)` instead paints a terrarium tile whose pixel (col,row) decodes to
     that many whole metres — the same in every tile, so the answer at any point is known in advance. */
  const px = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0; i < px.length; i += 4) {
    const v = (elev ? elev((i >> 2) & 255, (i >> 2) >> 8) : 0) + 32768;
    px[i] = v >> 8; px[i + 1] = v & 255; px[i + 3] = 255;
  }
  const ctx = { clearRect() {}, drawImage() {}, getImageData: () => ({ data: px }) };
  /* (consolidation) what the module ALLOCATES and CALLS, counted from inside the vm: decode buffers,
     canvases, the transcendentals of the tile projection and the tile-map lookups */
  const count = { f32: 0, canvases: 0, tan: 0, get: 0 };
  class CountedF32 extends Float32Array { constructor(...a) { super(...a); if (a[0] === 65536) count.f32++; } }
  class CountedMap extends Map { get(k) { count.get++; return super.get(k); } }
  const CountedMath = Object.create(Math, { tan: { value: (x) => { count.tan++; return Math.tan(x); } } });
  const g = {
    Image: FakeImage, Math: CountedMath, Date, JSON, Promise, isFinite, parseInt, parseFloat,
    Float32Array: CountedF32, Uint8ClampedArray, Map: CountedMap, Set, Array, Object, String, Number,
    /* ⚠ the store arms two LONG timers — a failed tile expires after 4 s so the next build asks
       again, and a request that never settles gives its slot back after 45 s. Both are correct in a
       browser and both would hold node's event loop open here, so the long ones are unref'd; the
       short poll timers a warm-up runs are left alone, because a test awaits them. */
    setTimeout: (fn, ms) => {
      if (ms >= 1000) { if (holdLong) { const h = { fn, dead: false }; longTimers.push(h); return h; }
        const t = setTimeout(fn, ms); if (t && t.unref) t.unref(); return t; }
      return setTimeout(fn, ms);
    },
    clearTimeout: (t) => { if (t && typeof t === 'object' && 'dead' in t) { t.dead = true; return; } clearTimeout(t); },
    console,
    document: { createElement: (tag) => { if (tag === 'canvas') count.canvases++; return { width: 0, height: 0, getContext: () => ctx }; },
                querySelector: () => null, getElementById: () => null },
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(read('js/map-readout.js'), g, { filename: 'map-readout.js' });
  assert.ok(g.window.IntMapModules && g.window.IntMapModules.mapReadout,
    'js/map-readout.js no longer registers its factory on window.IntMapModules');
  const HOST = {
    _DEM_CACHE_MAX: browseCap, _DEM_LEASE_MAX: leaseCap,
    isMobile: () => true, elevText: (v) => String(v), lang: 'en',
  };
  const api = g.window.IntMapModules.mapReadout(HOST);
  /** fire every Image created so far; returns how many were fired */
  const flush = () => { const batch = imgs.splice(0); batch.forEach(i => { if (i.onload) i.onload(); }); return batch.length; };
  /** fire until nothing new is requested (the parent-tile chase and the pump both add work) */
  const drain = () => { let n = 0, guard = 0; while (imgs.length && guard++ < 500) n += flush(); return n; };
  /** fire the long timers the store armed (only with holdLong) — the 45 s stalled-request deadline */
  const fireLong = () => { const b = longTimers.splice(0); b.forEach(h => { if (!h.dead) h.fn(); }); return b.length; };
  return { api, HOST, imgs, every, count, flush, drain, fireLong };
}

/* a spread of distinct tiles at one zoom: n distinct lng at one lat is n distinct tile columns */
const spread = (n, z = 12) => {
  const step = 360 / Math.pow(2, z);        /* one tile of longitude at this zoom */
  const out = [];
  for (let i = 0; i < n; i++) out.push([-179 + i * step, 35]);
  return out;
};

/* ═══ from tests/r671-dem-store-checks.test.mjs (the whole file) ═══
    #R671 — 「スマホでズームやホバーが遅い。操作によってはブラウザが落ちる」
    The DEM tile cache had a number and no ceiling. Three doors, all in the control flow:

      ① the trim skipped every 'loading' entry and NOTHING bounded how many requests were
         outstanding, so a build that asks for 480 tiles registered 480 entries the trim was
         forbidden to touch — and 480 Image objects, responses and decodes at once.
      ② the completion path never trimmed, so what arrived stayed resident after the build that
         wanted it was over.
      ③ the trim ran BEFORE the insert, so the steady state was the ceiling plus one.

    ⚠ THESE CHECKS RUN THE SHIPPED MODULE. js/map-readout.js's factory is EXECUTED in a vm against
    a fake Image and a fake canvas that the test fires by hand, so the questions asked here are the
    ones the report asks — how many entries survive a burst, how many requests exist at the peak,
    what an answer that outlived its entry does — rather than whether a line still spells `trim`.
    Reading the source cannot see an ordering (#R505), and this defect WAS an ordering.

    ⑨ and ⑩ are the two facts that are about wiring rather than behaviour: that the pin ceiling and
    the intensity field's tile budgets are the same number (they are in two files, so a check has to
    hold them together), and that the field passes ITS OWN lease token — read off the shipped source
    with acorn, because a fixture that binds its own token cannot tell you what js/seismic.js binds
    (#R552). */
{
const R = read;
let leaseSeq = 0;

/* ── ① A BURST CANNOT REGISTER MORE REQUESTS THAN THE STORE ALLOWS OUTSTANDING ─────────────── */
test('#R671 ① 480 tiles asked for at once are 24 requests, not 480', () => {
  const { api, imgs, HOST } = demRig();
  spread(480).forEach(p => api.demElevAt(p[0], p[1], null, 12));
  /* ⚠ THE PEAK, MEASURED WITHOUT ASKING THE STORE ANYTHING. Counting the Image objects the module
     actually constructed is a question the pre-#R671 code answers too — and it answered 480. */
  assert.equal(imgs.length, 24,
    'one Image per OUTSTANDING request (4 DEM hosts × 6 HTTP/1.1 connections), not one per requested tile');
  const st = api.demStoreStats();
  assert.equal(st.maxInflight, 24, 'four DEM hosts × six HTTP/1.1 connections');
  assert.ok(st.inflight <= st.maxInflight);
  assert.ok(st.entries <= HOST._DEM_CACHE_MAX + st.maxInflight,
    'entries must be bounded by the browsing ceiling plus what is in flight, got ' + st.entries);
});

/* ── ② …AND WHAT LANDS AFTERWARDS IS TRIMMED. The report's test A. ─────────────────────────── */
test('#R671 ② after 480 unpinned tiles have all landed, the cache is back inside its ceiling', () => {
  const { api, drain, HOST } = demRig();
  const pts = spread(480);
  pts.forEach(p => api.demElevAt(p[0], p[1], null, 12));
  drain();
  const st = api.demStoreStats();
  assert.ok(st.entries <= HOST._DEM_CACHE_MAX,
    'the completion path must trim — got ' + st.entries + ' entries for a ceiling of ' + HOST._DEM_CACHE_MAX);
  assert.ok(st.ready <= HOST._DEM_CACHE_MAX);
  assert.equal(st.bytes, st.ready * st.tileBytes, 'bytes must be the decoded tiles and nothing else');
  assert.equal(st.tileBytes, 65536 * 4, 'a decoded tile is 256×256 Float32 — exactly 262,144 bytes');
  /* ⚠ …AND THE SAME FACT MEASURED THROUGH THE PUBLIC DOOR, so the question is one the pre-#R671
     code answers too: a tile still in the cache answers demElevAt immediately, an evicted one does
     not. Before this round all 480 answered — 120 MiB of Float32Array against a ceiling of 140.
     ⚠ this probe re-admits what it does not find, so it must come after the counters are read. */
  const answering = pts.reduce((n, p) => n + (api.demElevAt(p[0], p[1], null, 12) != null ? 1 : 0), 0);
  assert.ok(answering <= HOST._DEM_CACHE_MAX,
    'tiles that landed after the trim last ran must not stay resident; ' + answering + ' of 480 still answer');
});

/* ── ③ THE CEILING IS THE CEILING, NOT THE CEILING PLUS ONE. The report's test C. ──────────── */
test('#R671 ③ inserting one past the ceiling, one at a time, does not settle at ceiling+1', () => {
  const { api, drain } = demRig({ browseCap: 8, leaseCap: 0 });
  const pts = spread(9);
  pts.forEach(p => { api.demElevAt(p[0], p[1], null, 12); drain(); });
  assert.ok(api.demStoreStats().entries <= 8,
    'the trim must run AFTER the insert; got ' + api.demStoreStats().entries + ' for a ceiling of 8');
});

/* ── ④ A LEASE RELEASED MID-FLIGHT DOES NOT LEAVE ITS TILES BEHIND. The report's test B. ───── */
test('#R671 ④ tiles that land after their lease was released are trimmed, not kept', async () => {
  const { api, drain, HOST } = demRig({ browseCap: 20, leaseCap: 600 });
  const token = 'lease-'+(++leaseSeq);
  const warm = api.warmDEMTiles(spread(480), 12, 50, null, token);
  assert.ok(api.demStoreStats().held > 0, 'the warm-up must pin what it asked for');
  api.releaseDEMHold(token);                       /* the build is abandoned while tiles are in flight */
  assert.equal(api.demStoreStats().held, 0);
  drain();
  await warm;
  const st = api.demStoreStats();
  assert.ok(st.entries <= HOST._DEM_CACHE_MAX,
    'a released lease must not leave 480 entries resident; got ' + st.entries);
});

/* ── ⑤ AN ANSWER THAT OUTLIVED ITS ENTRY MUST NOT PUT THE DATA BACK ────────────────────────── */
test('#R671 ⑤ a tile dropped while in flight is discarded when it lands', () => {
  const { api, imgs } = demRig({ browseCap: 2, leaseCap: 50 });
  /* five tiles held by a lease: the ceiling floats to 2+5 and all five are in flight */
  const t = 'lease-'+(++leaseSeq);
  api.warmDEMTiles(spread(5), 12, 1, null, t);
  assert.equal(api.demStoreStats().loading, 5);
  assert.equal(imgs.length, 5, 'a pinned warm-up asks for what it pinned');
  /* the build is abandoned — the ceiling drops back to 2 with five requests still outstanding */
  api.releaseDEMHold(t);
  const mid = api.demStoreStats();
  assert.equal(mid.entries, 2, 'the store must come back to its ceiling; got ' + mid.entries);
  assert.equal(mid.dropped, 3, 'three entries were dropped while their requests were in flight');
  imgs.splice(0).forEach(i => i.onload());
  const st = api.demStoreStats();
  assert.equal(st.stale, 3, 'three answers arrived for entries that no longer existed');
  assert.ok(st.entries <= 2, 'and none of them put itself back; got ' + st.entries);
});

/* ── ⑥ LEASES ARE REFCOUNTED — one build's release cannot unpin another build's tiles ──────── */
test('#R671 ⑥ two leases on one tile: releasing one keeps it pinned', () => {
  const { api } = demRig({ browseCap: 1, leaseCap: 50 });
  const a = 'lease-'+(++leaseSeq), b = 'lease-'+(++leaseSeq);
  const pts = spread(4);
  api.warmDEMTiles(pts, 12, 1, null, a);
  api.warmDEMTiles(pts, 12, 1, null, b);
  const held = api.demStoreStats().held;
  assert.equal(held, 4, 'both leases pin the same four tiles');
  api.releaseDEMHold(a);
  assert.equal(api.demStoreStats().held, 4, 'lease B still holds every one of them');
  api.releaseDEMHold(b);
  assert.equal(api.demStoreStats().held, 0);
});

/* ── ⑦ THE PIN HAS A CEILING. "Exempt from the trim" without one is the same as "unbounded". ─ */
test('#R671 ⑦ a lease cannot pin past _DEM_LEASE_MAX', () => {
  const { api } = demRig({ browseCap: 140, leaseCap: 3 });
  const t = 'lease-'+(++leaseSeq);
  api.warmDEMTiles(spread(10), 12, 1, null, t);
  const st = api.demStoreStats();
  assert.equal(st.held, 3, 'the pin stops at the ceiling; got ' + st.held);
  assert.ok(st.refusedPin >= 7, 'and it says how many it refused');
});

/* ── ⑧ EVERY warmDEMTiles TAKES A LEASE, AND CLOSES ITS OWN ───────────────────────────────── */
test('#R671 ⑧ a warm-up with no hold pins for its own duration and releases itself', async () => {
  const { api, drain } = demRig({ browseCap: 4, leaseCap: 600 });
  const p = api.warmDEMTiles(spread(40), 12, 4000, null);
  assert.ok(api.demStoreStats().held > 0,
    'the six callers that never passed hold must still be protected from evicting their own tiles');
  drain();
  await p;
  const st = api.demStoreStats();
  assert.equal(st.held, 0, 'and the lease closes when the promise settles');
  assert.equal(st.leases, 0, 'no lease may outlive the call that owns it');
});

/* ── ⑨ THE PIN CEILING AND THE FIELD'S TILE BUDGETS ARE ONE NUMBER IN TWO FILES ────────────── */
test('#R671 ⑨ _DEM_LEASE_MAX is exactly what one intensity field pins', () => {
  const se = codeOnly(R('js/seismic.js'));
  const ap = codeOnly(R('js/app-body.js'));
  const main = /const TILE_BUDGET=_mob\?(\d+):(\d+);/.exec(se);
  const far = /const TILE_BUDGET_FAR=_mobF\?(\d+):(\d+);/.exec(se);
  const lease = /_DEM_LEASE_MAX=_imPhoneClass\(\)\?\((\d+)\+(\d+)\):\((\d+)\+(\d+)\);/.exec(ap);
  assert.ok(main && far, 'the intensity field must still declare both tile budgets');
  assert.ok(lease, 'js/app-body.js must still declare the pin ceiling');
  assert.equal(+lease[1] + +lease[2], +main[1] + +far[1],
    'phone: the pin ceiling must be the field’s two windows, or the field is refused tiles it needs');
  assert.equal(+lease[3] + +lease[4], +main[2] + +far[2], 'desktop: same');
});

/* ── ⑩ THE FIELD PASSES ITS OWN TOKEN — read off the shipped source, not off a fixture ─────── */
test('#R671 ⑩ every held warm-up in the intensity field carries the build’s lease', () => {
  const ast = acorn.parse(R('js/seismic.js'), { ecmaVersion: 2022, sourceType: 'module' });
  const calls = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'CallExpression') {
      const c = n.callee;
      const name = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && c.property && c.property.name);
      if (name === 'warmDEMTiles' || name === 'releaseDEMHold') calls.push({ name, args: n.arguments });
    }
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(ast);
  const warms = calls.filter(c => c.name === 'warmDEMTiles');
  const held = warms.filter(c => c.args.length >= 5);
  assert.ok(held.length >= 3, 'the field warms the far window, the main field and its retry passes');
  for (const c of held) {
    const src = JSON.stringify(c.args[4]);
    assert.ok(/"name":"fldLease"/.test(src),
      'a held warm-up must pin under THIS build’s lease, not a global flag');
  }
  const rel = calls.filter(c => c.name === 'releaseDEMHold');
  assert.ok(rel.length > 0 && rel.every(c => c.args.length === 1 && /"name":"fldLease"/.test(JSON.stringify(c.args[0]))),
    'and the release must name the same lease — releasing everything is how one build unpinned another');
});

/* ── ⑪ AN UNKNOWN deviceMemory IS NOT EVIDENCE OF HEADROOM ─────────────────────────────────── */
test('#R671 ⑪ a phone that never reported its memory takes the smaller tile budget', () => {
  const ap = R('js/app-body.js');
  const i = ap.indexOf('function _tileCacheMax()');
  assert.ok(i > 0, 'the resident-tile budget must be a function that can be evaluated');
  /* ⚠ it lives folded onto an existing line: the app shell has a line budget with no headroom
     (tests/r168 #8), so the prose is in js/map-readout.js and the code is one line here. */
  const body = ap.slice(i, ap.indexOf('\n', i));
  const make = (phone, hiDPI, dm) => {
    const fn = new Function('_imPhoneClass', '_hiDPITiles', 'navigator', body + ' return _tileCacheMax();');
    return fn(() => phone, hiDPI, { deviceMemory: dm });
  };
  assert.equal(make(true, false, undefined), 640, 'WebKit reports nothing — every iPhone took 1024 before #R671');
  assert.equal(make(true, false, 2), 640);
  assert.equal(make(true, false, 4), 640);
  assert.equal(make(true, false, 8), 1024, 'a phone that says it has room still gets it');
  assert.equal(make(false, false, undefined), 8192, 'desktop is untouched');
  assert.equal(make(false, true, undefined), 2048, '…including the @2x branch');
});

/* ── ⑫ BOUNDING THE OUTSTANDING REQUESTS INTRODUCES A WAY TO DEADLOCK, SO IT IS CLOSED ─────────
   An <img> that neither loads nor errors — a connection a phone leaves open across a network
   change — would hold one of the 24 slots for the session. Twenty-four of them and the DEM stops.
   The unbounded version could not deadlock, so this failure is one the fix itself creates and has
   to answer for. The request is not cancelled; it is DISOWNED, and ⑤'s guard discards it if it
   ever lands. */
test('#R671 ⑫ a request that never settles gives its slot back', () => {
  const { api, imgs, fireLong } = demRig({ holdLong: true });
  spread(30).forEach(p => api.demElevAt(p[0], p[1], null, 12));
  assert.equal(imgs.length, 24, '24 in flight, six waiting for a slot');
  assert.equal(api.demStoreStats().queued, 6);
  assert.equal(fireLong(), 24, 'every started request arms a deadline');
  const st = api.demStoreStats();
  assert.equal(st.timedOut, 24, 'and every stalled one is given up on');
  assert.equal(st.inflight, 6, 'the freed slots went to the tiles that were waiting');
  assert.equal(imgs.length, 30, 'which are now asked for');
});
}

/* ═══ from tests/r223-checks.test.mjs (tests #8 of 14) ═══
    #R223 — source-level checks
    ⚠ These pin RELATIONS and CONTRACTS, not values this round happened to measure (#R199/#R203:
    a test that pins my own number falls over the next time the same instruction arrives). */
{

/* ── ⑥ a cached DEM tile is elevations, not a canvas and a copy of its pixels ──────────────────── */
test('R223 ⑥ the DEM cache holds Float32 elevations and shards over the bucket aliases', () => {
  /* ⚠ (consolidation) THE STORE IS RUN, NOT READ: the rig above counts what js/map-readout.js
     allocates and records every URL it asks for. */
  const rig = demRig({ browseCap: 400 });
  const pts = spread(40, 12);
  pts.forEach((p) => rig.api.demElevAt(p[0], p[1], null, 12));
  rig.drain();
  const decoded = rig.count.f32;
  assert.ok(decoded >= 40, 'one tile = 65,536 elevations, one Float32Array per decoded tile (got ' + decoded + ' for 40 tiles)');
  assert.equal(rig.count.canvases, 1, 'one reused decode canvas for the whole app — not a canvas (and an RGBA copy) per tile');
  const snap = rig.api.demSnapshot(pts[0][0] - 0.01, 34.999, pts[39][0] + 0.01, 35.001, 12, null);
  assert.ok(snap.have >= 40 && snap.at(pts[5][0], 35) === 0, 'what the cache holds is elevations a reader can sample');
  /* the host is a function of the tile, so the HTTP cache still hits — and the tiles are spread over
     four aliases of the same public bucket */
  const urls = rig.every.map((i) => i.src).filter(Boolean);
  const hostOf = new Map();
  for (const u of urls) {
    const m = /^(https:\/\/[^/]+\/(?:elevation-tiles-prod\/)?terrarium)\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(u);
    assert.ok(m && /elevation-tiles-prod/.test(m[1]), 'not a URL on the public elevation bucket: ' + u);
    const k = m[2] + '/' + m[3] + '/' + m[4];
    if (hostOf.has(k)) assert.equal(hostOf.get(k), m[1], 'tile ' + k + ' was asked for on two hosts — the HTTP cache cannot hit');
    hostOf.set(k, m[1]);
  }
  assert.ok(new Set(hostOf.values()).size >= 4, 'four aliases of the same public bucket (got ' + new Set(hostOf.values()).size + ')');
  const again = demRig({ browseCap: 400 });
  pts.forEach((p) => again.api.demElevAt(p[0], p[1], null, 12));
  for (const i of again.every) { const k = /\/(\d+\/\d+\/\d+)\.png$/.exec(i.src)[1]; if (hostOf.has(k)) assert.ok(i.src.startsWith(hostOf.get(k)), 'the same tile went to another host on a second run'); }
  /* the tile-set filter reaches both readers or `missing` lies */
  const keepWest = (lng) => lng < pts[20][0];
  const all = rig.api.demTilePoints(pts[0][0] - 0.01, 34.999, pts[39][0] + 0.01, 35.001, 12, null).length;
  const want = rig.api.demTilePoints(pts[0][0] - 0.01, 34.999, pts[39][0] + 0.01, 35.001, 12, keepWest).length;
  const snapW = rig.api.demSnapshot(pts[0][0] - 0.01, 34.999, pts[39][0] + 0.01, 35.001, 12, keepWest);
  assert.ok(want > 0 && want < all, 'demTilePoints honours the filter (' + want + ' of ' + all + ')');
  assert.equal(snapW.want, want, 'demSnapshot counts the same filtered set, so its `missing` is about that set');
  /* (spelling kept) js/seismic.js is the field's closure — that it hands the filter to EVERY call is
     a statement about its call sites. */
  const seis = read('js/seismic.js');
  assert.equal((seis.match(/_keepTile/g) || []).length >= 5, true, 'the field passes the same filter to every call');
});
}

/* ═══ from tests/r226-checks.test.mjs (tests #3 of 5) ═══
    #R226 — the round's own contracts, checked in Node
    100 % means 100 % · a 1.0 km cell · one bilinear, prepared per row ·
    the limb was lilac because the march was coarse · progress is written when it changes. */
{

/* ── ③ ONE BILINEAR, PREPARED ONCE PER ROW ────────────────────────────────────────────────────────
   「地震と津波の計算速度は品質を下げない範囲で爆速に。」 The speed-up is only allowed if the number
   does not move, and the way to guarantee that is not to sample-test two implementations — it is to
   have one. `at()` IS the row sampler. */
test('R226 ③ the DEM snapshot has a single bilinear, and the field walks it by row', () => {
  /* ⚠ (consolidation) THE SAMPLER IS RUN, NOT READ. Every tile in the rig is a plane —
     pixel (col,row) is 4·col + 2·row metres — so a correct bilinear returns that plane EXACTLY
     between texel centres, and `at()` and the row sampler can be compared point for point. The rig
     also counts Math.tan (the Mercator y) and the tile-map lookups from inside the module.
     ⚠ (#R265) The four texels are bound to names first, because the sampler now has to ask whether
     each of them is a HOLE in the published data before blending (js/map-readout.js) — a void corner
     mixed with three real ones is what reported −7,800 m for Lake Biwa. */
  const rig = demRig({ browseCap: 400, elev: (col, row) => 4 * col + 2 * row });
  const z = 10, N = 1 << z, lat = 35.3;
  const tileW = 360 / N;
  const lngs = [];
  for (let i = 0; i < 400; i++) lngs.push(139.0 + i * (3 * tileW / 400));   /* three tiles of one row */
  lngs.forEach((lng) => rig.api.demElevAt(lng, lat, null, z));
  rig.drain();
  const snap = rig.api.demSnapshot(138.9, 35.2, 139.0 + 3 * tileW + 0.1, 35.4, z, null);
  assert.ok(snap.have >= 3, 'the rig loaded the row (' + snap.have + ' tiles)');
  const lr = lat * Math.PI / 180, yy = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * N;
  const fy = (yy - Math.floor(yy)) * 256 - 0.5;
  const tan0 = rig.count.tan, get0 = rig.count.get;
  const row = snap.rowSampler(lat);
  let checked = 0;
  for (const lng of lngs) {
    const v = row(lng);
    /* at() delegates — it does not re-implement: the same number, to the bit */
    assert.equal(snap.at(lng, lat), v, 'at() and the row sampler disagree at ' + lng);
    const xx = (lng + 180) / 360 * N, fx = (xx - Math.floor(xx)) * 256 - 0.5;
    if (fx > 0 && fx < 255 && fy > 0 && fy < 255) {
      assert.ok(Math.abs(v - (4 * fx + 2 * fy)) < 1e-3, 'the blend is not bilinear at ' + lng + ': ' + v + ' vs ' + (4 * fx + 2 * fy));
      checked++;
    }
  }
  assert.ok(checked > 300, 'the interior of the row was sampled (' + checked + ')');
  /* …its y ONCE per row, and the tile memoised across the row: the one prepared sampler above, walked
     over 400 points, must have asked the projection once and the tile map once per tile — the
     at() calls interleaved with it each prepare a row of their own, so they are counted apart */
  const tanRow = rig.count.tan - tan0 - lngs.length, getRow = rig.count.get - get0 - lngs.length;
  assert.equal(tanRow, 1, 'the row sampler evaluated the Mercator y ' + tanRow + ' times for one row');
  const cols = new Set(lngs.map((l) => Math.floor((l + 180) / 360 * N))).size;
  assert.equal(getRow, cols, 'the row sampler looked the tile up ' + getRow + ' times across ' + cols + ' tiles — once per tile it crosses');
  /* (spelling kept) js/seismic.js is the field's closure — that it asks for a row sampler and
     prepares both latitudes once is a statement about its loop, not a value it returns. */
  const s = read('js/seismic.js');
  assert.match(s, /const _rowAt=\(snap&&snap\.rowSampler\)/, 'the field asks for a row sampler');
  assert.match(s, /const _hereAt=_rowAt\(la\), _northAt=_rowAt\(Math\.max\(-85,Math\.min\(85,la\+dLatS\)\)\);/,
    'and prepares both of the row\'s latitudes once');
  assert.ok(!/demAt\(/.test(s), 'the per-sample path is gone, not merely bypassed');
});
}
