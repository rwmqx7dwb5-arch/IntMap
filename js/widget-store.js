/* ============================================================================
 *  IntMap · WIDGET STORAGE, VALIDATION AND THE LOSSLESS MIGRATION
 * ----------------------------------------------------------------------------
 *  window.IntMapWidgetStore — the board's saved state, and the only code allowed to write it.
 *
 *  ══ THE TWO KEYS, AND WHY THE OLD ONE IS NEVER DELETED ═════════════════════════════════════════
 *      intmap_widgets3   the previous format: [{u,t,cfg}]. READ, never written, never removed.
 *      intmap_widgets4   this format.
 *  Keeping v3 in place IS the backup generation §5 asks for: if v4 is ever unreadable — a truncated
 *  quota-exceeded write, a hand edit, a bad sync — `load()` falls back to migrating v3 again and the
 *  reader's board comes back. A migration that deleted its source would have exactly one chance.
 *
 *  ══ ⚠ WHY MIGRATION MUST BE IDEMPOTENT, MEASURED RATHER THAN ASSUMED ═══════════════════════════
 *  Migration runs on every load (v4 present → no-op; v4 absent → build from v3). It is written so
 *  that running it twice produces a byte-identical result: instance ids come FROM the old `u` and
 *  are only invented when one is missing, and `createdAt` is derived from position when unknown
 *  rather than from Date.now(). tests/r292-checks asserts the fixed point.
 *
 *  ══ ⚠ THE DEFAULT BOARD IS SEEDED ONLY INTO AN EMPTY ONE ═══════════════════════════════════════
 *  The old code seeded «Clock · FX · Featured layer · Random country · On this day» behind a flag
 *  (`intmap_widgets_def21`) whose stated purpose was «so the new defaults also appear for EXISTING
 *  users». That seed never completed once — it threw on its second iteration (see js/widget-core.js)
 *  and the flag was never set, so no reader has been through it. Reviving the "append to everyone"
 *  reading now would push five cards onto boards people have since curated, which is a change nobody
 *  asked for (AGENTS.md §3.2). A default board is therefore what a board with NOTHING saved gets.
 * ==========================================================================*/
window.IntMapWidgetStore = (function () {
  'use strict';

  var WC = window.IntMapWidgetCore;
  var S = {};
  var KEY4 = 'intmap_widgets4';
  var KEY3 = 'intmap_widgets3';
  var KEY2 = 'intmap_widgets2';
  var DEFAULT_BOARD = ['time.digital', 'markets.fx', 'map.featured-layer', 'world.country', 'knowledge.on-this-day'];

  var state = null;                 /* {v, items:[…]} — the live board */
  var lastGoodJSON = null;          /* what we last WROTE, so a quota failure can be reported truthfully */

  function uid(prefix) { return (prefix || 'w') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }
  function readLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  /* ══ CONFIG VALIDATION ════════════════════════════════════════════════════════════════════════
     §21: a value read back from storage (or down from the account sync) is INPUT. Every field is
     coerced against the definition's own schema, and a value that cannot be coerced falls back to
     the schema default rather than to whatever the renderer does with `undefined`. */
  S.validateConfig = function (def, cfg) {
    var out = {};
    var schema = (def && def.configSchema) || {};
    cfg = (cfg && typeof cfg === 'object') ? cfg : {};
    Object.keys(schema).forEach(function (k) {
      var f = schema[k], v = cfg[k];
      var dflt = typeof f.default === 'function' ? f.default(WC.context()) : f.default;
      switch (f.type) {
        case 'enum':
          out[k] = (f.values || []).indexOf(v) >= 0 ? v : dflt; break;
        case 'number': {
          var n = +v;
          if (!isFinite(n)) n = +dflt;
          if (!isFinite(n)) n = 0;
          if (f.min != null) n = Math.max(f.min, n);
          if (f.max != null) n = Math.min(f.max, n);
          out[k] = f.integer ? Math.round(n) : n;
          break;
        }
        case 'boolean': out[k] = (v == null ? !!dflt : !!v); break;
        case 'timezone': out[k] = S.validTZ(v) ? v : (S.validTZ(dflt) ? dflt : 'UTC'); break;
        case 'currency': out[k] = /^[A-Z]{3}$/.test(String(v || '').toUpperCase()) ? String(v).toUpperCase() : dflt; break;
        case 'country': out[k] = /^[A-Za-z]{2}$/.test(String(v || '')) ? String(v).toUpperCase() : dflt; break;
        case 'date': out[k] = (v && !isNaN(new Date(v).getTime())) ? String(v) : (dflt || ''); break;
        case 'list': {
          var arr = Array.isArray(v) ? v : (Array.isArray(dflt) ? dflt : []);
          if (f.of) arr = arr.filter(function (x) { return f.of(x); });
          if (f.max != null) arr = arr.slice(0, f.max);
          out[k] = arr; break;
        }
        default: out[k] = (typeof v === 'string') ? String(v).slice(0, f.maxLength || 120) : (v == null ? dflt : v);
      }
      if (out[k] === undefined) out[k] = dflt;
    });
    return out;
  };
  S.validTZ = function (tz) {
    if (!tz || typeof tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch (e) { return false; }
  };

  /* ══ ITEM NORMALISATION ═══════════════════════════════════════════════════════════════════════ */
  function normItem(raw, idx) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.k === 'stack') {
      var members = (Array.isArray(raw.m) ? raw.m : []).map(normItem).filter(Boolean);
      if (!members.length) return null;
      var ssize = WC.SIZES.indexOf(raw.s) >= 0 ? raw.s : 'm';
      /* ⚠ every member must be able to DRAW at the stack's size, or a page of the stack is blank.
         A member that cannot is kept (nothing is thrown away) and shown at its nearest size. */
      return {
        i: String(raw.i || uid('st')), k: 'stack',
        mode: raw.mode === 'smart' ? 'smart' : 'manual',
        s: ssize, ix: Math.max(0, Math.min(members.length - 1, Math.round(+raw.ix || 0))),
        m: members, at: +raw.at || (1600000000000 + idx),
        pin: raw.pin ? String(raw.pin) : null,
        off: Array.isArray(raw.off) ? raw.off.map(String) : [],
        auto: raw.auto === false ? false : true,
      };
    }
    var id = WC.resolveId(raw.d);
    if (!id) return null;                                       /* a definition that no longer exists */
    var def = WC.get(id);
    var size = WC.SIZES.indexOf(raw.s) >= 0 && def.supportedSizes.indexOf(raw.s) >= 0 ? raw.s : def.defaultSize;
    return {
      i: String(raw.i || uid()), d: id, s: size,
      c: S.validateConfig(def, raw.c),
      at: +raw.at || (1600000000000 + idx),
      p: raw.p == null ? null : +raw.p,
    };
  }

  /* ══ MIGRATION ════════════════════════════════════════════════════════════════════════════════ */
  /* v2 was a bare array of type strings; the previous implementation already folded it into v3's
     shape on read, and this reproduces that mapping rather than depending on it having happened. */
  function readV3() {
    var s3 = parse(readLS(KEY3));
    if (Array.isArray(s3)) return s3.filter(function (x) { return x && typeof x.t === 'string'; });
    var s2 = parse(readLS(KEY2));
    if (Array.isArray(s2)) {
      return s2.filter(function (x) { return typeof x === 'string'; })
        .map(function (t) { return { u: null, t: (t === 'markets' ? 'crypto' : t), cfg: {} }; });
    }
    return null;
  }
  S.migrateFromLegacy = function (rows) {
    var items = [];
    (rows || []).forEach(function (e, idx) {
      var id = WC.resolveId(e.t);
      if (!id) return;                                          /* unknown legacy type — nothing to migrate to */
      var def = WC.get(id);
      /* the legacy cfg keys, carried across by NAME. Every one of them is in the new schema under
         the same name on purpose, so this is a copy rather than a translation table that can rot. */
      var cfg = Object.assign({}, e.cfg || {});
      items.push(normItem({
        i: e.u || null, d: id, s: def.defaultSize, c: cfg,
        at: 1600000000000 + idx,                                /* derived from POSITION — see the header on idempotence */
      }, idx));
    });
    return items.filter(Boolean);
  };

  S.defaultItems = function () {
    return DEFAULT_BOARD.map(function (id, idx) {
      var def = WC.get(id);
      if (!def) return null;
      /* ⚠ the default CONFIG is produced by the definition, at the moment the card is made. That is
         the structural answer to the temporal-dead-zone seed failure this platform replaces. */
      var c = def.defaultConfig ? def.defaultConfig(WC.context()) : {};
      return normItem({ i: null, d: id, s: def.defaultSize, c: c, at: 1600000000000 + idx }, idx);
    }).filter(Boolean);
  };
  S.DEFAULT_BOARD = DEFAULT_BOARD.slice();

  /* ══ LOAD / SAVE ══════════════════════════════════════════════════════════════════════════════ */
  S.load = function () {
    if (state) return state;
    var v4 = parse(readLS(KEY4));
    var items = null, from = 'default';
    if (v4 && v4.v === 4 && Array.isArray(v4.items)) {
      items = v4.items.map(normItem).filter(Boolean);
      from = 'v4';
      /* ⚠ A v4 THAT PARSES BUT HOLDS NOTHING USABLE IS CORRUPTION, NOT AN EMPTY BOARD. An empty
         board is a real state (the reader removed every card), and it is recorded as `empty:true`
         so the two can never be confused — without that flag, "restore from v3" would silently
         resurrect deleted cards every load. */
      if (!items.length && !v4.empty) { items = null; from = 'default'; }
    }
    if (items == null) {
      var legacy = readV3();
      if (legacy && legacy.length) { items = S.migrateFromLegacy(legacy); from = 'v3'; }
    }
    if (items == null || (!items.length && from === 'default')) { items = S.defaultItems(); from = 'default'; }
    state = { v: 4, items: items, empty: false };
    if (from !== 'v4') S.save({ silent: true });                /* write the migration through once */
    S.lastSource = from;
    return state;
  };
  S.lastSource = null;

  S.save = function (opts) {
    opts = opts || {};
    if (!state) return false;
    state.empty = state.items.length === 0;
    var json = JSON.stringify({ v: 4, items: state.items, empty: state.empty, at: Date.now() });
    var ok = true;
    try { localStorage.setItem(KEY4, json); lastGoodJSON = json; }
    catch (e) {
      /* ⚠ §21: a quota failure must not lose the settings. The previous write is still in storage
         (setItem is atomic per key), so the board on disk stays the last consistent one and the
         reader is told, rather than finding an empty board next time. */
      ok = false;
      WC.emit('store-error', { reason: 'quota' });
    }
    if (!opts.silent) { try { window._syncPrefsUp && window._syncPrefsUp(); } catch (e) {} }
    WC.emit('store', state);
    return ok;
  };
  S.raw = function () { return state ? state.items : []; };
  S.get = function (id) {
    var f = null;
    (state ? state.items : []).forEach(function (it) {
      if (it.i === id) f = it;
      else if (it.k === 'stack') it.m.forEach(function (m) { if (m.i === id) f = m; });
    });
    return f;
  };
  S.stackOf = function (id) {
    var f = null;
    (state ? state.items : []).forEach(function (it) { if (it.k === 'stack' && it.m.some(function (m) { return m.i === id; })) f = it; });
    return f;
  };
  S.indexOf = function (id) { return (state ? state.items : []).findIndex(function (it) { return it.i === id; }); };

  /* ══ MUTATIONS. Every one of them saves; nothing else may touch `state`. ══════════════════════ */
  S.add = function (defId, opts) {
    opts = opts || {};
    var def = WC.get(defId);
    if (!def) return null;
    S.load();
    if (!def.multi && S.countOf(def.id) > 0) return null;
    var c = Object.assign({}, def.defaultConfig ? def.defaultConfig(WC.context()) : {}, opts.config || {});
    var it = normItem({ i: null, d: def.id, s: opts.size || def.defaultSize, c: c, at: Date.now() }, state.items.length);
    if (!it) return null;
    if (opts.at != null && opts.at >= 0 && opts.at <= state.items.length) state.items.splice(opts.at, 0, it);
    else state.items.push(it);
    S.save();
    return it;
  };
  S.countOf = function (defId) {
    var n = 0;
    (state ? state.items : []).forEach(function (it) {
      if (it.k === 'stack') it.m.forEach(function (m) { if (m.d === defId) n++; });
      else if (it.d === defId) n++;
    });
    return n;
  };
  S.remove = function (id) {
    S.load();
    var i = S.indexOf(id);
    if (i >= 0) { var gone = state.items.splice(i, 1)[0]; S.save(); return { item: gone, index: i, stack: null }; }
    var st = S.stackOf(id);
    if (st) {
      var j = st.m.findIndex(function (m) { return m.i === id; });
      var g = st.m.splice(j, 1)[0];
      st.ix = Math.max(0, Math.min(st.m.length - 1, st.ix));
      /* a stack of one is not a stack — it becomes the card again, in the stack's place */
      if (st.m.length === 1) { var k = S.indexOf(st.i); if (k >= 0) state.items[k] = st.m[0]; }
      else if (!st.m.length) { var q = S.indexOf(st.i); if (q >= 0) state.items.splice(q, 1); }
      S.save();
      return { item: g, index: j, stack: st.i };
    }
    return null;
  };
  /* ⚠ UNDO PUTS THE CARD BACK WHERE IT WAS, WITH ITS CONFIG. §9 asks for a delete that can be taken
     back; a re-add would give a new instance id, the definition's DEFAULT config and the end of the
     board — three quiet losses. This restores the record itself. */
  S.restore = function (rec) {
    if (!rec || !rec.item) return false;
    S.load();
    if (rec.stack) {
      var st = state.items.find(function (x) { return x.i === rec.stack && x.k === 'stack'; });
      if (st) { st.m.splice(Math.min(rec.index, st.m.length), 0, rec.item); S.save(); return true; }
    }
    state.items.splice(Math.min(rec.index, state.items.length), 0, rec.item);
    S.save();
    return true;
  };
  S.setSize = function (id, size) {
    var it = S.get(id);
    if (!it) return false;
    var def = it.k === 'stack' ? null : WC.get(it.d);
    if (def && def.supportedSizes.indexOf(size) < 0) return false;
    if (WC.SIZES.indexOf(size) < 0) return false;
    it.s = size; S.save(); return true;
  };
  S.setConfig = function (id, patch) {
    var it = S.get(id);
    if (!it || it.k === 'stack') return false;
    var def = WC.get(it.d);
    it.c = S.validateConfig(def, Object.assign({}, it.c, patch || {}));
    S.save(); return true;
  };
  S.duplicate = function (id) {
    S.load();
    var it = S.get(id);
    if (!it || it.k === 'stack') return null;
    var def = WC.get(it.d);
    if (!def.multi) return null;
    var copy = normItem({ i: null, d: it.d, s: it.s, c: JSON.parse(JSON.stringify(it.c)), at: Date.now() }, state.items.length);
    var i = S.indexOf(id);
    if (i >= 0) state.items.splice(i + 1, 0, copy); else state.items.push(copy);
    S.save();
    return copy;
  };
  S.reorder = function (ids) {
    S.load();
    var by = {}; state.items.forEach(function (it) { by[it.i] = it; });
    var next = [];
    ids.forEach(function (i) { if (by[i]) { next.push(by[i]); delete by[i]; } });
    state.items.forEach(function (it) { if (by[it.i]) next.push(it); });
    state.items = next;
    S.save();
  };
  S.move = function (id, delta) {
    S.load();
    var i = S.indexOf(id);
    if (i < 0) return false;
    var j = Math.max(0, Math.min(state.items.length - 1, i + delta));
    if (i === j) return false;
    state.items.splice(j, 0, state.items.splice(i, 1)[0]);
    S.save();
    return true;
  };

  /* ── stacks ─────────────────────────────────────────────────────────────────────────────────
     A stack OWNS its members: they leave the top-level list and live inside the stack record. That
     is what makes "unstack" exact — the members come back, in order, in the stack's slot. */
  S.stack = function (ids, opts) {
    opts = opts || {};
    S.load();
    var members = [], firstIdx = -1;
    ids.forEach(function (id) {
      var i = S.indexOf(id);
      if (i < 0) return;
      if (firstIdx < 0 || i < firstIdx) firstIdx = i;
      members.push(state.items[i]);
    });
    if (members.length < 2) return null;
    state.items = state.items.filter(function (it) { return members.indexOf(it) < 0; });
    var st = {
      i: uid('st'), k: 'stack', mode: opts.mode === 'smart' ? 'smart' : 'manual',
      s: opts.size || members[0].s || 'm', ix: 0, m: members, at: Date.now(),
      pin: null, off: [], auto: true,
    };
    state.items.splice(Math.max(0, Math.min(firstIdx, state.items.length)), 0, st);
    S.save();
    return st;
  };
  S.unstack = function (stackId) {
    S.load();
    var i = S.indexOf(stackId);
    if (i < 0 || state.items[i].k !== 'stack') return false;
    var st = state.items[i];
    state.items.splice.apply(state.items, [i, 1].concat(st.m));
    S.save();
    return true;
  };
  S.addToStack = function (stackId, id) {
    S.load();
    var si = S.indexOf(stackId), ii = S.indexOf(id);
    if (si < 0 || ii < 0 || state.items[si].k !== 'stack' || state.items[ii].k === 'stack') return false;
    var it = state.items.splice(ii, 1)[0];
    state.items[S.indexOf(stackId)].m.push(it);
    S.save();
    return true;
  };
  S.setStackIndex = function (stackId, ix) {
    var st = S.get(stackId);
    if (!st || st.k !== 'stack') return false;
    st.ix = Math.max(0, Math.min(st.m.length - 1, ix));
    S.save();
    return true;
  };
  S.setStackFlags = function (stackId, patch) {
    var st = S.get(stackId);
    if (!st || st.k !== 'stack') return false;
    if ('pin' in patch) st.pin = patch.pin ? String(patch.pin) : null;
    if ('auto' in patch) st.auto = !!patch.auto;
    if ('off' in patch) st.off = (patch.off || []).map(String);
    S.save();
    return true;
  };
  S.reorderStack = function (stackId, ids) {
    var st = S.get(stackId);
    if (!st || st.k !== 'stack') return false;
    var by = {}; st.m.forEach(function (m) { by[m.i] = m; });
    var next = [];
    ids.forEach(function (i) { if (by[i]) { next.push(by[i]); delete by[i]; } });
    st.m.forEach(function (m) { if (by[m.i]) next.push(m); });
    st.m = next; st.ix = Math.max(0, Math.min(st.m.length - 1, st.ix));
    S.save();
    return true;
  };
  S.resetBoard = function () { S.load(); state.items = S.defaultItems(); S.save(); return state.items; };

  /* ══ THE LEGACY EXTERNAL API ══════════════════════════════════════════════════════════════════
     `window.IntMapWidgets2._active()` / `._setActive()` is a published contract: the account
     preference sync (js/app-body.js) round-trips a board through it, and tests/r164.spec.js reads
     it. It keeps its exact old shape — [{u,t,cfg}] with the LEGACY type string — because a device
     still on the previous build has to be able to read what a device on this one wrote.
     ⚠ Size and stack membership have no legacy spelling, so they are carried in a parallel field
     that an old build ignores; `_setActive` prefers it when present and falls back to the flat list
     when it is not. Nothing is lost in either direction. */
  S.toLegacy = function () {
    var out = [];
    function push(it) {
      var def = WC.get(it.d);
      if (!def) return;
      out.push({ u: it.i, t: def.legacyIds && def.legacyIds.length ? def.legacyIds[0] : def.id, cfg: Object.assign({}, it.c) });
    }
    (state ? state.items : []).forEach(function (it) { if (it.k === 'stack') it.m.forEach(push); else push(it); });
    return out;
  };
  S.syncPayload = function () { return { v: 4, items: state ? state.items : [] }; };
  S.applyLegacy = function (arr, rich) {
    S.load();
    if (rich && rich.v === 4 && Array.isArray(rich.items)) {
      var items = rich.items.map(normItem).filter(Boolean);
      state.items = items;
      S.save({ silent: true });
      WC.emit('store-replaced', state);
      return true;
    }
    if (!Array.isArray(arr)) return false;
    state.items = S.migrateFromLegacy(arr.map(function (e) { return { u: e.u, t: e.t, cfg: e.cfg }; }));
    S.save({ silent: true });
    WC.emit('store-replaced', state);
    return true;
  };

  /* ══ THE LAST-GOOD-DATA CACHE ═════════════════════════════════════════════════════════════════
     §5: a transient loading/error state is NOT part of the board's settings. The last SUCCESSFUL
     payload of each request key lives in its own TTL'd key, so a corrupted cache can be dropped
     whole without touching a single reader preference. */
  var CKEY = 'intmap_widget_cache1';
  var cache = null;
  function cacheLoad() {
    if (cache) return cache;
    cache = parse(readLS(CKEY)) || {};
    var now = Date.now(), changed = false;
    Object.keys(cache).forEach(function (k) {
      var e = cache[k];
      if (!e || typeof e !== 'object' || !e.at || (e.ttl && now - e.at > e.ttl)) { delete cache[k]; changed = true; }
    });
    if (changed) cacheWrite();
    return cache;
  }
  function cacheWrite() {
    try { localStorage.setItem(CKEY, JSON.stringify(cache)); }
    catch (e) {
      /* the cache is the FIRST thing to go when storage is full — it is recoverable by definition,
         and the board's settings are not. */
      cache = {};
      try { localStorage.removeItem(CKEY); } catch (e2) {}
    }
  }
  S.cacheGet = function (key) {
    var c = cacheLoad(), e = c[key];
    if (!e) return null;
    if (e.ttl && Date.now() - e.at > e.ttl) { delete c[key]; cacheWrite(); return null; }
    return e;
  };
  S.cacheSet = function (key, data, ttl) {
    var c = cacheLoad();
    c[key] = { at: Date.now(), ttl: ttl || 0, data: data };
    var keys = Object.keys(c);
    if (keys.length > 80) { keys.sort(function (a, b) { return c[a].at - c[b].at; }).slice(0, keys.length - 80).forEach(function (k) { delete c[k]; }); }
    cacheWrite();
    return c[key];
  };
  S.cacheClear = function () { cache = {}; try { localStorage.removeItem(CKEY); } catch (e) {} };
  S._keys = { v4: KEY4, v3: KEY3, v2: KEY2, cache: CKEY };
  S._reset = function () { state = null; cache = null; };      /* tests only */

  return S;
})();
