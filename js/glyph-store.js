/* ============================================================================
 *  IntMap · THE GLYPHS THIS DEVICE HAS ALREADY DRAWN — kept between sessions  (mobile-map-speed)
 * ----------------------------------------------------------------------------
 *  「スマホ版で地図が遅すぎる」. The renderer draws every CJK place-name character itself (TinySDF: a canvas
 *  fillText, a read-back and a distance transform), and it starts from nothing in every session. MEASURED
 *  2026-11-17 on production (390×844, DPR 3, CPU ×4): six places in Japan, Korea and China drew 2,381 glyphs at
 *  4.22 ms each — 10.0 s of main thread, in bursts on exactly the frames where the reader zooms into a new place.
 *  The same reader opening the map again tomorrow paid all of it again for the same characters.
 *
 *  This keeps what was drawn: one record per (font string, language, canvas size, buffer, radius, cutoff,
 *  character) → the signed-distance bitmap and its metrics, in IndexedDB. js/geo-engine.js asks before it draws
 *  and keeps what it drew — and keeps ONLY a glyph drawn while its own face was loaded (`document.fonts.check`),
 *  so the fallback's shapes are never written down. Everything here is batched: one transaction per task for the
 *  reads and one for the writes, however many tiles asked at once.
 *
 *  ⚠ HOW LONG A RECORD IS TRUE. The bitmap is a function of the font FILE, and the file is chosen by the Google
 *  Fonts stylesheet, which names a versioned file (…/notosansjp/v57/…) and says how long that naming holds:
 *  `Cache-Control: private, max-age=86400` (read 2026-11-17 from the css2 URL js/map-typography.js requests). So a
 *  record is used for KEEP_MS = that max-age and drawn again after it — the same day the stylesheet itself would
 *  be re-read. Invalid if the stylesheet's max-age changes; this is the only reader of the number. Stale records
 *  are deleted on the first idle after the store opens, so the store holds at most one day of drawing.
 *  ⚠ NO STORE, NO CHANGE. A private window, a blocked or full IndexedDB, or a browser without it answers «not
 *  kept» to every read and drops every write: the renderer draws exactly as it did before this file existed.
 * ==========================================================================*/
const DB = 'intmap-glyphs', STORE = 'g';
const KEEP_MS = 86400 * 1000;

let _db = null;
function open() {
  if (_db) return _db;
  _db = new Promise((res) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) { res(null); return; }
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(STORE); } catch (_) { } };
      rq.onsuccess = () => { const db = rq.result; res(db); prune(db); };
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
    } catch (_) { res(null); }
  });
  return _db;
}
/* the records past KEEP_MS go, once per session, when the page is idle — never on a frame */
function prune(db) {
  const go = () => {
    try {
      const now = Date.now(), tx = db.transaction(STORE, 'readwrite'), cur = tx.objectStore(STORE).openCursor();
      cur.onsuccess = () => { const c = cur.result; if (!c) return; try { if (!(now - (c.value && c.value.t) < KEEP_MS)) c.delete(); } catch (_) { } c.continue(); };
    } catch (_) { }
  };
  try { if (typeof requestIdleCallback === 'function') requestIdleCallback(go); else setTimeout(go, 0); } catch (_) { }
}

let _gets = null, _puts = null;
/** the kept record for this key, or null — { id, w, h, d:Uint8Array, m:metrics, t } */
export function readGlyph(key) {
  return new Promise((res) => {
    if (!_gets) { _gets = []; setTimeout(flushGets, 0); }
    _gets.push([key, res]);
  });
}
async function flushGets() {
  const q = _gets; _gets = null;
  const db = await open();
  if (!db) { for (const [, r] of q) r(null); return; }
  try {
    const st = db.transaction(STORE, 'readonly').objectStore(STORE), now = Date.now();
    for (const [k, r] of q) {
      const rq = st.get(k);
      rq.onsuccess = () => { const v = rq.result; r(v && now - v.t < KEEP_MS ? v : null); };
      rq.onerror = () => r(null);
    }
  } catch (_) { for (const [, r] of q) r(null); }
}
/** keep a glyph drawn in its own face */
export function keepGlyph(key, rec) {
  if (!_puts) { _puts = []; setTimeout(flushPuts, 0); }
  _puts.push([key, rec]);
}
async function flushPuts() {
  const q = _puts; _puts = null;
  const db = await open();
  if (!db) return;
  try { const st = db.transaction(STORE, 'readwrite').objectStore(STORE); for (const [k, v] of q) st.put(v, k); } catch (_) { }
}
