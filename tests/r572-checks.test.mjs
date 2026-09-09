/* ============================================================================
 *  #R572 — 「スマホでズームやホバーが遅い。操作によってはブラウザが落ちる」
 * ----------------------------------------------------------------------------
 *  The DEM tile cache had a number and no ceiling. Three doors, all in the control flow:
 *
 *    ① the trim skipped every 'loading' entry and NOTHING bounded how many requests were
 *       outstanding, so a build that asks for 480 tiles registered 480 entries the trim was
 *       forbidden to touch — and 480 Image objects, responses and decodes at once.
 *    ② the completion path never trimmed, so what arrived stayed resident after the build that
 *       wanted it was over.
 *    ③ the trim ran BEFORE the insert, so the steady state was the ceiling plus one.
 *
 *  ⚠ THESE CHECKS RUN THE SHIPPED MODULE. js/map-readout.js's factory is EXECUTED in a vm against
 *  a fake Image and a fake canvas that the test fires by hand, so the questions asked here are the
 *  ones the report asks — how many entries survive a burst, how many requests exist at the peak,
 *  what an answer that outlived its entry does — rather than whether a line still spells `trim`.
 *  Reading the source cannot see an ordering (#R505), and this defect WAS an ordering.
 *
 *  ⑨ and ⑩ are the two facts that are about wiring rather than behaviour: that the pin ceiling and
 *  the intensity field's tile budgets are the same number (they are in two files, so a check has to
 *  hold them together), and that the field passes ITS OWN lease token — read off the shipped source
 *  with acorn, because a fixture that binds its own token cannot tell you what js/seismic.js binds
 *  (#R552).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import * as acorn from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));

/* ── the rig: the real js/map-readout.js, a fake Image, a fake 256×256 decode ───────────────── */
function demRig({ browseCap = 140, leaseCap = 608, holdLong = false } = {}) {
  const imgs = [];
  const longTimers = [];
  class FakeImage {
    constructor() { this.onload = null; this.onerror = null; this._src = ''; imgs.push(this); }
    set src(v) { this._src = v; }
    get src() { return this._src; }
  }
  /* every pixel decodes to 0 m: (128*256 + 0 + 0/256) − 32768 === 0, alpha 255 → no voids */
  const px = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = 128; px[i + 3] = 255; }
  const ctx = { clearRect() {}, drawImage() {}, getImageData: () => ({ data: px }) };
  const g = {
    Image: FakeImage, Math, Date, JSON, Promise, isFinite, parseInt, parseFloat,
    Float32Array, Uint8ClampedArray, Map, Set, Array, Object, String, Number,
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
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
                querySelector: () => null, getElementById: () => null },
  };
  g.window = g;
  vm.createContext(g);
  vm.runInContext(R('js/map-readout.js'), g, { filename: 'map-readout.js' });
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
  return { api, HOST, imgs, flush, drain, fireLong };
}

/* a spread of distinct tiles at one zoom: n distinct lng at one lat is n distinct tile columns */
let leaseSeq = 0;
const spread = (n, z = 12) => {
  const step = 360 / Math.pow(2, z);        /* one tile of longitude at this zoom */
  const out = [];
  for (let i = 0; i < n; i++) out.push([-179 + i * step, 35]);
  return out;
};

/* ── ① A BURST CANNOT REGISTER MORE REQUESTS THAN THE STORE ALLOWS OUTSTANDING ─────────────── */
test('① 480 tiles asked for at once are 24 requests, not 480', () => {
  const { api, imgs, HOST } = demRig();
  spread(480).forEach(p => api.demElevAt(p[0], p[1], null, 12));
  /* ⚠ THE PEAK, MEASURED WITHOUT ASKING THE STORE ANYTHING. Counting the Image objects the module
     actually constructed is a question the pre-#R572 code answers too — and it answered 480. */
  assert.equal(imgs.length, 24,
    'one Image per OUTSTANDING request (4 DEM hosts × 6 HTTP/1.1 connections), not one per requested tile');
  const st = api.demStoreStats();
  assert.equal(st.maxInflight, 24, 'four DEM hosts × six HTTP/1.1 connections');
  assert.ok(st.inflight <= st.maxInflight);
  assert.ok(st.entries <= HOST._DEM_CACHE_MAX + st.maxInflight,
    'entries must be bounded by the browsing ceiling plus what is in flight, got ' + st.entries);
});

/* ── ② …AND WHAT LANDS AFTERWARDS IS TRIMMED. The report's test A. ─────────────────────────── */
test('② after 480 unpinned tiles have all landed, the cache is back inside its ceiling', () => {
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
  /* ⚠ …AND THE SAME FACT MEASURED THROUGH THE PUBLIC DOOR, so the question is one the pre-#R572
     code answers too: a tile still in the cache answers demElevAt immediately, an evicted one does
     not. Before this round all 480 answered — 120 MiB of Float32Array against a ceiling of 140.
     ⚠ this probe re-admits what it does not find, so it must come after the counters are read. */
  const answering = pts.reduce((n, p) => n + (api.demElevAt(p[0], p[1], null, 12) != null ? 1 : 0), 0);
  assert.ok(answering <= HOST._DEM_CACHE_MAX,
    'tiles that landed after the trim last ran must not stay resident; ' + answering + ' of 480 still answer');
});

/* ── ③ THE CEILING IS THE CEILING, NOT THE CEILING PLUS ONE. The report's test C. ──────────── */
test('③ inserting one past the ceiling, one at a time, does not settle at ceiling+1', () => {
  const { api, drain } = demRig({ browseCap: 8, leaseCap: 0 });
  const pts = spread(9);
  pts.forEach(p => { api.demElevAt(p[0], p[1], null, 12); drain(); });
  assert.ok(api.demStoreStats().entries <= 8,
    'the trim must run AFTER the insert; got ' + api.demStoreStats().entries + ' for a ceiling of 8');
});

/* ── ④ A LEASE RELEASED MID-FLIGHT DOES NOT LEAVE ITS TILES BEHIND. The report's test B. ───── */
test('④ tiles that land after their lease was released are trimmed, not kept', async () => {
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
test('⑤ a tile dropped while in flight is discarded when it lands', () => {
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
test('⑥ two leases on one tile: releasing one keeps it pinned', () => {
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
test('⑦ a lease cannot pin past _DEM_LEASE_MAX', () => {
  const { api } = demRig({ browseCap: 140, leaseCap: 3 });
  const t = 'lease-'+(++leaseSeq);
  api.warmDEMTiles(spread(10), 12, 1, null, t);
  const st = api.demStoreStats();
  assert.equal(st.held, 3, 'the pin stops at the ceiling; got ' + st.held);
  assert.ok(st.refusedPin >= 7, 'and it says how many it refused');
});

/* ── ⑧ EVERY warmDEMTiles TAKES A LEASE, AND CLOSES ITS OWN ───────────────────────────────── */
test('⑧ a warm-up with no hold pins for its own duration and releases itself', async () => {
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
test('⑨ _DEM_LEASE_MAX is exactly what one intensity field pins', () => {
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
test('⑩ every held warm-up in the intensity field carries the build’s lease', () => {
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
test('⑪ a phone that never reported its memory takes the smaller tile budget', () => {
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
  assert.equal(make(true, false, undefined), 640, 'WebKit reports nothing — every iPhone took 1024 before #R572');
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
test('⑫ a request that never settles gives its slot back', () => {
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
