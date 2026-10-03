/* ============================================================================
 *  IntMap · Atlas — THE INVESTIGATION NOTEBOOK, AS DATA   (atlas-os)        js/atlas-notebook-store.js
 * ----------------------------------------------------------------------------
 *  An Atlas answer used to live exactly as long as the tab did. The question, the answer, the view it
 *  was given in, the operations that drew it and the rows a query found were all in memory — and a
 *  reload, a closed laptop or a second device threw all of it away. Asking again is not the same thing:
 *  it costs a turn, and for a question about the live world it is a DIFFERENT answer, which is exactly
 *  the thing a reader wants to see side by side with the first one.
 *
 *  This module is the notebook's data and nothing else — no DOM, no map, no network of its own:
 *    · entryFromTurn  — one finished Atlas turn, from the machine record js/atlas-state.js keeps
 *                       (question, reply, operations with their exact arguments) plus what the page
 *                       could see when it ended (the view, the query rows, the cited sources);
 *    · diffResults    — the same query answered at two moments, compared ROW BY ROW by code:
 *                       added, gone, changed values. A model is never asked whether something changed
 *                       (the design rule docs/AREA-MONITORS.md states for the same problem);
 *    · toMarkdown / toFile / fromFile — the notebook as something a reader can hand to someone else;
 *    · makeNotebookStore — the device copy (IndexedDB in the app, memory in a test);
 *    · mergeCloud / rowFromEntry / entryFromRow — the account copy (supabase/migrations/
 *                       20261003120000_atlas_notebook.sql), synchronised only when the reader turns it on.
 *  js/atlas-notebook.js is the page side (capture, the panel, replay); js/atlas-cap-notebook.js is what
 *  Atlas itself can do with it.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';

export const FORMAT = 'intmap-atlas-notebook';
export const VERSION = 1;

/* ⚠ A STEP IS REPLAYABLE WHEN THE REGISTRY SAYS IT IS A REVERSIBLE MAP CHANGE — not when a list here
   says so. js/atlas-capabilities.js column 7 ('session' → risk 'reversible-session') is the table's own
   statement that running it again changes only this session's map; 'read' rows (prose, look-ups) are
   kept as what they said, and 'persist' / 'external' rows (settings, navigation) are never re-run by a
   replay the reader did not ask Atlas for. The notebook's own capabilities are excluded so that a replay
   cannot open another replay. */
export function replayable(capabilityId, status, resolve) {
  const id = String(capabilityId || '');
  if (!id || id.indexOf('notebook.') === 0) return false;
  if (!(status === 'completed' || status === 'partial' || status === 'unobserved')) return false;
  let c = null; try { c = resolve ? resolve(id) : null; } catch (_) { c = null; }
  return !!(c && c.risk === 'reversible-session' && c.legacy);
}

/* the action object again, as the dispatch receives it: the `__` stamps the executor adds are its own
   bookkeeping (turn ids, outside-content flags) and are not part of what was asked */
export function cleanArgs(args) {
  try { return JSON.parse(JSON.stringify(args == null ? {} : args, (k, v) => String(k).slice(0, 2) === '__' ? undefined : v)); }
  catch (_) { return {}; }
}

export function newId(now) {
  const t = Math.floor(+now || Date.now()).toString(36);
  let r = ''; try { const a = new Uint8Array(6); globalThis.crypto.getRandomValues(a); r = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(''); }
  catch (_) { r = Math.random().toString(16).slice(2, 14); }
  return 'nb-' + t + '-' + r;
}

const str = (v, n) => String(v == null ? '' : v).slice(0, n);

/** one finished turn → one notebook entry. `ctx`: { view, results, sources, lang, resolve, now, followOf } */
export function entryFromTurn(turn, ctx) {
  const c = ctx || {}, t = turn || {};
  const at = +t.at || +c.now || Date.now();
  const steps = (t.operations || []).map((op) => ({
    cap: String(op.capabilityId || ''), args: cleanArgs(op.args), status: String(op.status || ''), code: op.code ? String(op.code) : '',
    replay: replayable(op.capabilityId, op.status, c.resolve),
  }));
  const question = str(t.question, 8000).trim();
  return normalize({
    v: VERSION, id: newId(c.now || at), at, updatedAt: +c.now || at,
    title: question.replace(/\s+/g, ' ').slice(0, 140), question,
    answer: str(t.reply, 64000), lang: str(c.lang, 12), status: str(t.status || 'answered', 32),
    view: c.view || null, steps, results: (c.results || []).filter((r) => r && +r.at >= at), sources: c.sources || [],
    note: '', followOf: c.followOf || null, pinned: false,
  });
}

/* ⚠ EVERY ENTRY THAT ENTERS THE NOTEBOOK PASSES HERE — the turn, a file a reader imports, a row from the
   account. A file is somebody else's data: a field of the wrong type is dropped to its empty value rather
   than carried into the panel, and an entry with no question is not an entry. */
export function normalize(e) {
  if (!e || typeof e !== 'object') return null;
  const question = str(e.question, 8000).trim();
  if (!question || !/^nb-[a-z0-9-]{4,64}$/.test(String(e.id || ''))) return null;
  const arr = (x) => Array.isArray(x) ? x : [];
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x)) ? x : null;
  return {
    v: VERSION, id: String(e.id), at: +e.at || 0, updatedAt: +e.updatedAt || +e.at || 0,
    title: str(e.title || question, 140), question, answer: str(e.answer, 64000), lang: str(e.lang, 12), status: str(e.status, 32),
    view: obj(e.view),
    steps: arr(e.steps).filter(obj).map((s) => ({ cap: str(s.cap, 80), args: obj(s.args) || {}, status: str(s.status, 24), code: str(s.code, 60), replay: !!s.replay })),
    results: arr(e.results).filter(obj).map((r) => ({
      at: +r.at || 0, key: str(r.key, 2000), spec: obj(r.spec) || {}, table: str(r.table, 80), tableLabel: str(r.tableLabel, 120),
      matched: +r.matched || 0, offered: +r.offered || 0,
      columns: arr(r.columns).filter(obj).map((c) => ({ id: str(c.id, 80), label: str(c.label, 120), unit: str(c.unit, 24) })),
      rows: arr(r.rows).filter(obj).map((w) => ({ id: str(w.id, 200), name: str(w.name, 200), iso2: str(w.iso2, 4),
        lat: (w.lat != null && isFinite(w.lat)) ? +w.lat : null, lng: (w.lng != null && isFinite(w.lng)) ? +w.lng : null, v: obj(w.v) || {} })),
      unapplied: arr(r.unapplied).map((u) => str(u, 200)), sources: arr(r.sources).filter(obj).map((s) => ({ what: str(s.what, 200), src: str(s.src, 400) })),
    })),
    sources: arr(e.sources).filter(obj).filter((s) => /^https?:\/\//i.test(String(s.url || ''))).map((s) => ({ url: str(s.url, 2000), title: str(s.title || s.url, 300) })),
    note: str(e.note, 8000), followOf: e.followOf ? str(e.followOf, 80) : null, pinned: !!e.pinned,
    syncedAt: +e.syncedAt || 0,
  };
}

/* ══ THE SAME QUESTION AT TWO MOMENTS ══════════════════════════════════════════════════════════════
   Rows are matched by the identity the query engine gave them (a GeoNames id, a USGS event id, a
   country code) — never by name, so a renamed city is CHANGED, not gone-and-added. ⚠ A query shows at
   most `limit` rows; when either side matched more than it showed, a row «gone» from the shown set may
   only have moved below the cut. The result says so (`cutThen` / `cutNow`) instead of reporting it as
   a disappearance. */
export function diffResults(then, now) {
  const A = then || { rows: [], columns: [] }, B = now || { rows: [], columns: [] };
  const byId = (rows) => { const m = new Map(); (rows || []).forEach((r) => m.set(String(r.id), r)); return m; };
  const a = byId(A.rows), b = byId(B.rows);
  const cols = (A.columns || []).filter((c) => (B.columns || []).some((d) => d.id === c.id));
  const added = [], removed = [], changed = [];
  b.forEach((r, id) => { if (!a.has(id)) added.push(r); });
  a.forEach((r, id) => {
    const r2 = b.get(id);
    if (!r2) { removed.push(r); return; }
    const diffs = [];
    if (r.name !== r2.name) diffs.push({ col: 'name', label: 'name', unit: '', then: r.name, now: r2.name });
    cols.forEach((c) => {
      const x = r.v ? r.v[c.id] : null, y = r2.v ? r2.v[c.id] : null;
      if (x == null && y == null) return;
      const nx = typeof x === 'number', ny = typeof y === 'number';
      const same = (nx && ny) ? Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x)) : String(x) === String(y);
      if (!same) diffs.push({ col: c.id, label: c.label, unit: c.unit, then: x, now: y, delta: (nx && ny) ? y - x : null });
    });
    if (diffs.length) changed.push({ id, name: r2.name || r.name, iso2: r2.iso2 || r.iso2, diffs });
  });
  return {
    table: B.table || A.table, tableLabel: B.tableLabel || A.tableLabel, thenAt: +A.at || 0, nowAt: +B.at || 0,
    matchedThen: +A.matched || 0, matchedNow: +B.matched || 0,
    cutThen: (+A.matched || 0) > (A.rows || []).length, cutNow: (+B.matched || 0) > (B.rows || []).length,
    added, removed, changed, unchanged: a.size - removed.length - changed.length,
    sameColumns: cols.length === (A.columns || []).length && cols.length === (B.columns || []).length,
  };
}

/* ══ SEARCH — the reader's words against what the notebook holds ═══════════════════════════════════
   Every whitespace-separated term must occur (case-insensitively) in the question, the answer, the
   reader's note or a result's table/row names. No stemming and no ranking model: a notebook is small
   and the reader is looking for something they wrote or read. Newest first. */
export function search(entries, q) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  const list = (entries || []).slice().sort((x, y) => (+y.pinned - +x.pinned) || (y.at - x.at));
  if (!terms.length) return list;
  return list.filter((e) => {
    const hay = [e.question, e.answer, e.note, ...(e.results || []).map((r) => r.tableLabel + ' ' + (r.rows || []).map((w) => w.name).join(' '))].join('\n').toLowerCase();
    return terms.every((t) => hay.indexOf(t) >= 0);
  });
}

/* ══ HANDING IT ON ═════════════════════════════════════════════════════════════════════════════════
   Two forms, for two readers. The .md is for a person (a report, a lesson plan, a message): the
   question, the answer, the sources, the rows and where the map was. The .json is for IntMap: the same
   entries in full, which another device or another reader can import and replay. */
const iso = (ms) => { try { return new Date(+ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; } catch (_) { return ''; } };
const mdCell = (v) => String(v == null ? '—' : v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
export function toMarkdown(entries, lang) {
  const t = IntMapLang.pick(() => String(lang || 'en'));
  const out = ['# ' + t('IntMap · Atlas investigation notebook', 'IntMap · Atlas 調査ノート'), ''];
  (entries || []).forEach((e) => {
    out.push('## ' + e.question.replace(/\n+/g, ' '), '', '*' + iso(e.at) + '*', '');
    if (e.answer) out.push(e.answer.trim(), '');
    if (e.note) out.push('> ' + t('Note by the reader', '読者のメモ') + ': ' + e.note.replace(/\n/g, '\n> '), '');
    (e.results || []).forEach((r) => {
      out.push('### ' + mdCell(r.tableLabel || r.table) + ' — ' + r.matched + ' ' + t('matched', '件が該当'), '');
      const cols = r.columns || [];
      out.push('| ' + [t('Name', '名称')].concat(cols.map((c) => c.label + (c.unit ? ' (' + c.unit + ')' : ''))).map(mdCell).join(' | ') + ' |');
      out.push('|' + ' --- |'.repeat(cols.length + 1));
      (r.rows || []).forEach((w) => out.push('| ' + [w.name + (w.iso2 ? ' ' + w.iso2 : '')].concat(cols.map((c) => w.v ? w.v[c.id] : null)).map(mdCell).join(' | ') + ' |'));
      if (r.matched > (r.rows || []).length) out.push('', t('Shown', '表示') + ': ' + (r.rows || []).length + ' / ' + r.matched);
      (r.sources || []).forEach((s) => out.push('', '- ' + mdCell(s.what) + ' — ' + mdCell(s.src)));
      out.push('');
    });
    if ((e.sources || []).length) { out.push('**' + t('Sources', '出典') + '**', ''); e.sources.forEach((s) => out.push('- [' + mdCell(s.title) + '](' + s.url + ')')); out.push(''); }
    const v = e.view || {}, cam = v.camera;
    if (cam && isFinite(cam.lat) && isFinite(cam.lng)) {
      const tm = v.time && !v.time.live && v.time.t != null ? iso(v.time.t) : t('live', 'ライブ');
      out.push(t('Map', '地図') + ': ' + (+cam.lat).toFixed(4) + ', ' + (+cam.lng).toFixed(4) + ' · z' + (+cam.zoom).toFixed(2) + ' · ' + t('time', '時刻') + ' ' + tm + ((v.layersOn || []).length ? (' · ' + t('layers', 'レイヤー') + ' ' + v.layersOn.join(', ')) : ''), '');
    }
    out.push('---', '');
  });
  return out.join('\n');
}
export function toFile(entries) {
  return { format: FORMAT, v: VERSION, exportedAt: Date.now(), entries: (entries || []).map((e) => { const c = Object.assign({}, e); delete c.syncedAt; return c; }) };
}
/** a file a reader chose → { entries, rejected }. Throws only when it is not a notebook at all. */
export function fromFile(obj) {
  if (!obj || obj.format !== FORMAT) throw new Error('not-a-notebook');
  if (+obj.v > VERSION) throw new Error('newer-version');
  const entries = [], all = Array.isArray(obj.entries) ? obj.entries : [];
  all.forEach((e) => { const n = normalize(Object.assign({}, e, { syncedAt: 0 })); if (n) entries.push(n); });
  return { entries, rejected: all.length - entries.length };
}

/* ══ THE DEVICE COPY ═══════════════════════════════════════════════════════════════════════════════
   A backend is four promises — all / put / del / clear. IndexedDB in the app (structured clone, no
   quota written here: the browser's own storage quota applies, and a refused write is REPORTED by
   put()'s rejection rather than swallowed), a Map in a test. */
export function memoryBackend() {
  const m = new Map();
  return {
    all: async () => Array.from(m.values()).map((e) => JSON.parse(JSON.stringify(e))),
    put: async (e) => { m.set(e.id, JSON.parse(JSON.stringify(e))); },
    del: async (id) => { m.delete(id); },
    clear: async () => { m.clear(); },
  };
}
export function idbBackend(idb, name) {
  const DB = name || 'intmap-atlas-notebook';
  let opening = null;
  const open = () => opening || (opening = new Promise((res, rej) => {
    const rq = idb.open(DB, 1);
    rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' }); };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => { opening = null; rej(rq.error || new Error('indexeddb-open-failed')); };
  }));
  const tx = (mode, fn) => open().then((db) => new Promise((res, rej) => {
    const t = db.transaction('entries', mode), s = t.objectStore('entries');
    let out; try { out = fn(s); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error || new Error('indexeddb-write-failed'));
    t.onabort = () => rej(t.error || new Error('indexeddb-aborted'));
  }));
  return {
    all: () => tx('readonly', (s) => s.getAll()).then((r) => r || []),
    put: (e) => tx('readwrite', (s) => { s.put(e); }),
    del: (id) => tx('readwrite', (s) => { s.delete(id); }),
    clear: () => tx('readwrite', (s) => { s.clear(); }),
  };
}

export function makeNotebookStore(backend) {
  const B = backend || memoryBackend();
  let cache = null; const subs = [];
  const emit = () => subs.slice().forEach((f) => { try { f(); } catch (_) { } });
  const load = async () => { if (cache) return cache; const all = await B.all(); cache = new Map(); (all || []).forEach((e) => { const n = normalize(e); if (n) cache.set(n.id, n); }); return cache; };
  const API = {
    async list(q) { const m = await load(); return search(Array.from(m.values()), q); },
    async get(id) { const m = await load(); const e = m.get(String(id)); return e ? JSON.parse(JSON.stringify(e)) : null; },
    async put(e) { const n = normalize(e); if (!n) throw new Error('invalid-entry'); await B.put(n); (await load()).set(n.id, n); emit(); return n; },
    async update(id, patch, o) {
      const m = await load(); const cur = m.get(String(id)); if (!cur) return null;
      const n = normalize(Object.assign({}, cur, patch, (o && o.keepTime) ? {} : { updatedAt: Date.now() })); await B.put(n); m.set(n.id, n); emit(); return n;
    },
    async remove(id) { await B.del(String(id)); (await load()).delete(String(id)); emit(); },
    async clear() { await B.clear(); cache = new Map(); emit(); },
    async count() { return (await load()).size; },
    on(fn) { if (typeof fn === 'function') subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
  };
  return API;
}

/* ══ THE ACCOUNT COPY ══════════════════════════════════════════════════════════════════════════════
   One row per entry in public.atlas_notebook_entries, owned by the reader (RLS). The columns a person
   might search on are columns; the rest rides in `payload`. `syncedAt` is the DEVICE's memory of the
   last time this entry and the account agreed — it never goes up. */
export function rowFromEntry(e, userId) {
  const p = Object.assign({}, e); ['id', 'at', 'updatedAt', 'question', 'answer', 'syncedAt'].forEach((k) => delete p[k]);
  return { user_id: userId, id: e.id, created_at: new Date(e.at).toISOString(), updated_at: new Date(e.updatedAt || e.at).toISOString(),
    question: e.question, answer: e.answer, payload: p };
}
export function entryFromRow(r) {
  if (!r) return null;
  const p = (r.payload && typeof r.payload === 'object') ? r.payload : {};
  return normalize(Object.assign({}, p, { id: r.id, at: Date.parse(r.created_at) || 0, updatedAt: Date.parse(r.updated_at) || 0, question: r.question, answer: r.answer }));
}
/* ⚠ THE RULE FOR A DELETION. Nothing is kept to say «deleted» (no tombstones): an entry this device has
   synced before (`syncedAt` > 0) that the account no longer has was deleted on another device, and goes
   here too; one that was never synced is new on this device and goes up. Otherwise the later
   `updatedAt` wins. */
export function mergeCloud(local, remote) {
  const L = new Map((local || []).map((e) => [e.id, e])), R = new Map((remote || []).map((e) => [e.id, e]));
  const toLocal = [], toRemote = [], deleteLocal = [];
  R.forEach((r, id) => { const l = L.get(id); if (!l || (r.updatedAt > l.updatedAt)) toLocal.push(r); else if (l.updatedAt > r.updatedAt) toRemote.push(l); });
  L.forEach((l, id) => { if (R.has(id)) return; if (l.syncedAt > 0) deleteLocal.push(id); else toRemote.push(l); });
  return { toLocal, toRemote, deleteLocal };
}
