/* ============================================================================
 *  IntMap · js/layer-state.js — WHAT HAPPENED TO A LAYER'S REQUEST, KEPT  (layer-failure-state)
 * ----------------------------------------------------------------------------
 *  MEASURED (2026-09-30 audit of the tree this was written against):
 *    · js/layer-rows.js `inFlight().track` cleared its entry the same way whether the request a row
 *      started was fulfilled or rejected (`p.then(clear, clear)`) — so the moment a request failed,
 *      the only record that it had existed was gone, and the row looked exactly like a row that had
 *      drawn;
 *    · the self-heal (js/data-layers.js IntMapLayerAudit) re-fired a blank box off→on and wrote one
 *      line into a private ring — nothing a reader or Atlas could see said «this layer was repaired»
 *      or «this layer could not be drawn»;
 *    · the rows that do notice a failure said so in a toast that vanished after 4.4 s and was not
 *      announced (no live region, js/notify.js has the measurement), then unticked the box — which
 *      afterwards could not be told apart from a box the reader had switched off.
 *
 *  THIS FILE IS THE ONE OWNER OF THAT FACT. Per box id it holds one of four states:
 *      loading     — a request is in flight (the row handed it to layerInflight.track)
 *      ok          — the request settled and nobody reported a failure
 *      failed      — an ANSWER arrived and it was no: a refusal, a status, a body that is not the
 *                    data, a renderer that would not take it. OBSERVED.
 *      unobserved  — nothing arrived that could be read: the host's clock ran out
 *                    (js/fetch-deadline.js `isUnobserved`). «Could not confirm» is NOT «failed»
 *                    (.agents/rules/one-pass-or-a-reason.md §5), and the row says which.
 *      nodata      — (restored-layers-under-load) the layer HAS its data and it has nothing to state for the
 *                    moment the clock is at: each live-satellite element set speaks for days around its
 *                    epoch, and with the clock in 1914 no source states a position. Not a failure (nothing
 *                    went wrong, so no toast) and not «ok» (nothing is drawn): a neutral mark on the row,
 *                    `message` says why, and Atlas reads it here like the other three.
 *  …plus `reason` (the vocabulary js/fetch-deadline.js and js/data-door.js already speak: 'timeout',
 *  'network', 'http' with `status`, 'parse', 'unsupported', 'worker'), the message the reader was
 *  given, and when. A caller's own Stop ('aborted') is neither — the record is dropped.
 *
 *  HOW FAILURES ARRIVE — through the shared paths, not one row at a time:
 *    ① a row's request that REJECTS: every row of js/data-layers.js hands its request to
 *       js/layer-rows.js `layerInflight.track`, which hands it here (`request`). The shared readers
 *       (fetch-deadline, data-door, proxy-fetch) put `reason` on what they throw, so a rejection is
 *       classified here without the row saying anything;
 *    ② a row that CATCHES its own failure and gives up (the arms that untick the box) reports it with
 *       `report(id, err, { told })` — `told` when that arm has already put a sentence in the toast, so
 *       the reader is told once, not twice;
 *    ③ any layer module may report directly: window.IntMapLayerState.report(id, 'failed', {reason}).
 *  HOW IT LEAVES: the box's next `change` (a fresh attempt, or the reader switching it off) drops the
 *  record — nothing else does; a failed row stays marked «could not load» until someone acts on it.
 *
 *  WHO READS IT — one record, three readers:
 *    · the row: a short status after the layer's name (en + jp), and `data-im-state` on the box;
 *    · the reader who cannot see the row: ONE announcement per transition into failed / unobserved,
 *      through js/notify.js's live region — unless the row already said it (`told`);
 *    · Atlas: window.IntMapLayerState.snapshot() / get(id) / heals() — plain data, no DOM.
 *  The self-heal's repairs are recorded here too (`healed`), so «repaired» is a fact someone can read.
 * ==========================================================================*/
import { isUnobserved } from './fetch-deadline.js';
import { notify } from './notify.js';

/* how many repairs `heals()` keeps — the same bound IntMapLayerAudit.log() uses (js/data-layers.js, 60) */
const HEAL_MAX = 60;

/** classify(err) → { state, reason, status? } | null (the caller's own Stop — no state at all) */
export function classify(err) {
  if (err == null) return { state: 'failed', reason: 'unknown' };
  if (typeof err === 'string') return { state: 'failed', reason: err };
  if (err.reason === 'aborted' || (!err.reason && err.name === 'AbortError')) return null;
  if (isUnobserved(err)) return { state: 'unobserved', reason: 'timeout', retries: err.retries };
  const out = { state: 'failed', reason: String(err.reason || 'error') };
  if (err.status != null) out.status = err.status;
  return out;
}

/* the words. IntMap's own text: en + jp (CONSTITUTION.md §7) through IntMapLang.t, which falls back to English. */
function words(lang) {
  /* the registry the app loads (js/lang-registry.js); headless, English — which is what its own t() falls back to */
  const IntMapLang = (typeof window !== 'undefined' && window.IntMapLang && typeof window.IntMapLang.t === 'function')
    ? window.IntMapLang : { t: (_l, en) => en };
  return {
    badge: (st) => (st === 'failed' ? IntMapLang.t(lang, "Couldn't load", '読み込めません')
      : st === 'nodata' ? IntMapLang.t(lang, 'No data for this date', 'この日時のデータなし')
        : IntMapLang.t(lang, 'No reply', '応答なし')),
    detail: (rec) => {
      if (rec.message) return rec.message;
      switch (rec.reason) {
        case 'timeout': return IntMapLang.t(lang, 'The source did not answer in time', 'データ元の応答が時間内にありませんでした');
        case 'http': return IntMapLang.t(lang, 'The source refused the request', 'データ元が要求を拒否しました') + (rec.status ? ' (HTTP ' + rec.status + ')' : '');
        case 'network': return IntMapLang.t(lang, 'The source could not be reached', 'データ元に接続できませんでした');
        case 'parse': return IntMapLang.t(lang, 'The source sent data that could not be read', 'データ元から読み取れないデータが届きました');
        default: return IntMapLang.t(lang, 'The layer could not be drawn', 'レイヤーを描画できませんでした');
      }
    },
  };
}

/** makeLayerState({ doc, notify, lang, name }) — one owner. `lang()` the current language, `name(id)`
    the layer's display name (defaults to the row's own label). Headless (`doc` null) it only records. */
export function makeLayerState(opts) {
  const o = opts || {};
  const doc = o.doc || null;
  const say = o.notify || null;
  let lang = typeof o.lang === 'function' ? o.lang : () => {
    try { return window.IntMapLang.normalise(doc.documentElement.lang || 'en'); } catch (_) { return 'en'; }
  };
  const recs = new Map();
  const heals = [];
  const subs = new Set();

  const box = (id) => { try { return doc ? doc.getElementById(id) : null; } catch (_) { return null; } };
  const labelOf = (id) => {
    if (typeof o.name === 'function') { try { const n = o.name(id); if (n) return String(n); } catch (_) { /* fall through */ } }
    const cb = box(id);
    const row = cb && cb.closest ? (cb.closest('label') || cb.closest('.lyr-row')) : null;
    if (!row) return id;
    const sp = row.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .geo-label');
    const s = String((sp ? sp.textContent : '') || '').replace(/\s+/g, ' ').trim();
    return s || id;
  };

  /* ══ THE MARK GOES WHERE THE READER SWITCHES THE LAYER ═══════════════════════════════════════════════
     A box has up to three faces: the classic row (<label class="layer-option"> in #layer-dropdown), and the
     tile — or tile-row — js/map-ui.js builds for it in the desktop sidebar and in the phone's «Map & layers»
     sheet (`.lst-tile[data-lid="<box id>"]`, one per mounted host). On the desktop sidebar and in the phone's
     tile mode the classic row is hidden and the tile is the only face the reader sees, so a mark written on
     the row alone would be a mark nobody reads. Each face gets the same pill (`.lyr-state`) and the same
     `data-im-state`; the words are the same. */
  function faces(id, cb) {
    const out = [];
    const row = cb && cb.closest ? (cb.closest('label') || cb.parentElement) : null;
    if (row) out.push(row);
    try {
      if (doc && typeof doc.querySelectorAll === 'function') {
        const q = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(id) : String(id).replace(/["\\]/g, '\\$&');
        doc.querySelectorAll('.lst-tile[data-lid="' + q + '"]').forEach((t) => out.push(t));
      }
    } catch (_) { /* no tiles */ }
    return out;
  }
  function markFace(host, rec) {
    const st = rec ? rec.state : '';
    try { if (host.classList && host.classList.contains('lst-tile')) { if (st) host.dataset.imState = st; else delete host.dataset.imState; } } catch (_) { /* not an element */ }
    let m = host.querySelector(':scope > .lyr-state');
    if (st !== 'failed' && st !== 'unobserved' && st !== 'nodata') { if (m) m.remove(); return; }
    if (!m) { m = doc.createElement('span'); m.className = 'lyr-state'; host.appendChild(m); }
    const W = words(lang());
    m.dataset.state = st;
    m.textContent = W.badge(st);
    m.title = W.detail(rec);
    m.setAttribute('aria-label', W.badge(st) + ' — ' + W.detail(rec));
  }
  function paint(id) {
    const cb = box(id);
    const rec = recs.get(id);
    if (cb) { try { if (rec) cb.dataset.imState = rec.state; else delete cb.dataset.imState; } catch (_) { /* not an element */ } }
    for (const f of faces(id, cb)) { try { markFace(f, rec || null); } catch (_) { /* one face does not stop the others */ } }
    watchTiles();
  }
  /* The tiles are REBUILT (a search, a language change, a host mounted later), and a rebuilt tile is born
     without its mark. So while — and only while — some box carries a failure, newly added tiles are
     watched and marked; with none, nothing is observed at all. */
  let tileMo = null;
  function watchTiles() {
    let need = false;
    for (const r of recs.values()) if (r.state === 'failed' || r.state === 'unobserved' || r.state === 'nodata') { need = true; break; }
    if (!need) { if (tileMo) { tileMo.disconnect(); tileMo = null; } return; }
    if (tileMo || !doc || !doc.body || typeof MutationObserver === 'undefined') return;
    tileMo = new MutationObserver((ms) => {
      const hit = new Set();
      for (const m of ms) for (const n of m.addedNodes) {
        if (!n || n.nodeType !== 1) continue;
        const cls = String(n.className || '');
        if (cls.indexOf('lst-tile') >= 0 && n.dataset && n.dataset.lid) hit.add(n.dataset.lid);
        else if (/\bls[tr]-/.test(cls)) n.querySelectorAll('.lst-tile[data-lid]').forEach((t) => hit.add(t.dataset.lid));
      }
      for (const id of hit) if (recs.has(id)) { const cb = box(id); for (const f of faces(id, cb)) { if (f.classList && f.classList.contains('lst-tile')) { try { markFace(f, recs.get(id)); } catch (_) { /* next */ } } } }
    });
    tileMo.observe(doc.body, { childList: true, subtree: true });
  }

  function emit(id) {
    const rec = recs.get(id) || null;
    for (const f of Array.from(subs)) { try { f(id, rec ? Object.assign({}, rec) : null); } catch (_) { /* a reader does not decide the state */ } }
  }

  /** set(id, state, info) — the one writer. info: { reason, status, message, told, retries } */
  function set(id, state, info) {
    if (!id) return null;
    const i = info || {};
    const was = recs.get(id);
    if (!state) { if (!was) return null; recs.delete(id); paint(id); emit(id); return null; }
    const rec = { id, state, reason: i.reason || null, status: i.status != null ? i.status : null,
      message: i.message || null, retries: i.retries != null ? i.retries : null,
      since: (was && was.state === state) ? was.since : Date.now(), req: was ? was.req : null,
      healed: was ? was.healed : null };
    recs.set(id, rec);
    paint(id);
    const entered = !was || was.state !== state || was.reason !== rec.reason;
    if (entered) {
      emit(id);
      if ((state === 'failed' || state === 'unobserved') && !i.told && say) {
        try { say.show(labelOf(id) + ' — ' + words(lang()).detail(rec)); } catch (_) { /* the record stands without the toast */ }
      }
    }
    return rec;
  }

  /** report(id, what, info) — `what` is a state name, or an error to classify (shared-reader errors carry `reason`) */
  function report(id, what, info) {
    if (typeof what === 'string' && (what === 'ok' || what === 'loading' || what === 'failed' || what === 'unobserved' || what === 'nodata')) return set(id, what, info);
    const c = classify(what);
    if (!c) return set(id, null);
    return set(id, c.state, Object.assign({}, c, info || {}));
  }

  /** request(id, p) — js/layer-rows.js hands every tracked request here. The newest request for a box is
      the one whose outcome counts (an older one settling late does not overwrite it). */
  function request(id, p) {
    if (!id) return;
    if (!p || typeof p.then !== 'function') {
      /* answered at once — whatever was in flight is superseded; a report made during the call stands */
      const r = recs.get(id);
      if (r && r.state === 'loading') set(id, null);
      return;
    }
    const rec = set(id, 'loading');
    rec.req = p;
    const mine = () => { const r = recs.get(id); return !!(r && r.req === p); };
    p.then(() => { if (mine() && recs.get(id).state === 'loading') { const r = set(id, 'ok'); if (r) r.req = p; } },
      (e) => { if (!mine()) return; const r = report(id, e); if (r) r.req = p; });
  }

  /** healed(id, fix) — the self-heal repaired (or tried to repair) this box; kept and readable */
  function healed(id, fix) {
    const e = { id, fix: String(fix || ''), t: Date.now() };
    heals.push(e); if (heals.length > HEAL_MAX) heals.shift();
    const r = recs.get(id); if (r) r.healed = e;
    return e;
  }

  const pub = (r) => ({ id: r.id, state: r.state, reason: r.reason, status: r.status, message: r.message,
    retries: r.retries, since: r.since, label: labelOf(r.id), healed: r.healed ? Object.assign({}, r.healed) : null });

  return {
    set, report, request, healed, classify,
    get: (id) => { const r = recs.get(id); return r ? pub(r) : null; },
    /* every box with a state, for a reader with no DOM (Atlas) */
    snapshot: () => Array.from(recs.values()).map(pub),
    heals: () => heals.map((e) => Object.assign({}, e)),
    on: (f) => { subs.add(f); return () => subs.delete(f); },
    /* the current language, injected by the module that knows it (js/data-layers.js has HOST.lang) */
    useLang: (f) => { if (typeof f === 'function') { lang = f; for (const id of recs.keys()) paint(id); } },
    repaint: () => { for (const id of recs.keys()) paint(id); },
    /* the box's next change is a new attempt or the reader switching it off — either way the old
       outcome no longer describes it. Installed once on the app's document (below). */
    listen: (d) => {
      const on = (e) => {
        const cb = e.target;
        if (!cb || cb.type !== 'checkbox' || !cb.id || !recs.has(cb.id)) return;
        try { if (!(cb.closest && cb.closest('#layer-dropdown'))) return; } catch (_) { return; }
        set(cb.id, null);
      };
      d.addEventListener('change', on, true);
      return on;
    },
  };
}

/* the app's one instance */
export const layerState = makeLayerState({ doc: typeof document !== 'undefined' ? document : null, notify });
try {
  if (typeof document !== 'undefined') {
    layerState.listen(document);
    if (typeof window !== 'undefined') {
      window.addEventListener('intmap-lang', () => layerState.repaint());
      window.IntMapLayerState = {
        get: layerState.get, snapshot: layerState.snapshot, heals: layerState.heals,
        report: layerState.report, on: layerState.on,
      };
    }
  }
} catch (_) { /* headless */ }
