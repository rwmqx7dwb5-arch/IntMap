/* ============================================================================
 *  IntMap · MAP CORRECTIONS — «this is wrong, here», and the answer coming back   (community-next)
 * ----------------------------------------------------------------------------
 *  A reader who knows a place is the one instrument that can check what a gate cannot: whether a name,
 *  a border, a date a historical unit is drawn for, a layer's value or a position is TRUE
 *  (.agents/rules/historical-verification.md §1 — 「門が測れるのは形式、測れないのは主張」). Before this
 *  file the reader had the feedback stars and the bug reporter; neither carried the point, the year or
 *  the layer, and neither ever answered. This module is the reader's half of a loop:
 *
 *    ① THE CARD (openCorrection) — opened from the place profile (js/place-dossier.js), the map's
 *       right-click menu (js/tool-panel.js) and Atlas (corrections.report, js/atlas-cap-corrections.js).
 *       It attaches what the reader cannot be asked to type: the point, the camera's zoom, the map state
 *       as the share fragment (MapState.hash — layers, year, comparison and all, so the operator opens
 *       EXACTLY what the reader saw) and the clock's year when the map is historical. The reader chooses
 *       what kind of error, which layer, writes what is wrong and may give a source.
 *    ② THE SEND — reader-reports (kind 'correction'), the same Edge Function, buckets and origin rule as
 *       the feedback form; the rule a draft must pass is _shared/correction-shape.js checkCorrection, run
 *       HERE first so a refusal is said before the network. 201 carries a RECEIPT (43 random characters):
 *       kept on this device (localStorage `intmap_corrections`) — the database holds only its sha256.
 *    ③ THE ANSWER (readReports / openMine) — the operator's status, reply and fix reference, read back by
 *       receipt (public.map_correction_status — no account needed) and, for a signed-in reader, by account
 *       (public.my_map_corrections — every device). Settings ▸ «My map reports», Atlas corrections.mine.
 *    ④ THE NOTICE (checkForNews) — a reader who has an unanswered report is told, once, when it is answered:
 *       at most one read per CHECK_EVERY_MS, only when the device holds an open receipt. A reader who never
 *       reported pays one localStorage read at boot and nothing else (js/app-body.js).
 *    ⑤ THE PUBLIC LOG (publicLog) — what the operator published (corrections.html, Atlas corrections.log).
 *
 *  ⚠ NOTHING HERE DECIDES WHO MAY READ WHAT. The database does: a receipt reads only its own row; the
 *  account reads only its own; the public log holds only rows an admin published, with the admin's words.
 *  ⚠ TEXT ONLY: every value from the database or the reader goes into the DOM as textContent; a fix
 *  reference is a link only when it is http(s).
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7).
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { iconNode } from './icons.js';
import { MapState } from './map-state.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';
import * as bus from './bus.js';
import { CORRECTION, READER_STATUS, CORRECTION_LIMITS, checkCorrection, receiptHash, RECEIPT_RE, MAX_RECEIPTS_PER_READ, YEAR_RANGE } from '../supabase/functions/_shared/correction-shape.js';

/* ── the device's receipts ─────────────────────────────────────────────────────────────────────── */
export const STORE_KEY = 'intmap_corrections';
/* How often a device that holds an OPEN receipt asks whether it was answered. ESTIMATE: the operator answers
   in days, not minutes (map_corrections_summary reports the median once there is one); twice a day says an
   answer the same day it is given without a read on every visit. Expires when that median is under a day. */
export const CHECK_EVERY_MS = 12 * 3600 * 1000;
/* How long a send may take before it counts as not sent — the same derivation js/feedback.js states for the
   same function (its own bounds: Auth 5 s, two limiter takes, the insert 5 s, plus the round trip). */
const SEND_DEADLINE_MS = 20000;
const OPEN = new Set(CORRECTION.open);

/** the store as a value: { v:1, items:[{ receipt, hash, at, what, place, lng, lat, year, seen }], checkedAt } */
export function loadStore(storage) {
  try {
    const s = JSON.parse((storage || globalThis.localStorage).getItem(STORE_KEY) || 'null');
    if (s && s.v === 1 && Array.isArray(s.items)) return { v: 1, items: s.items.filter((i) => i && RECEIPT_RE.test(String(i.receipt || ''))), checkedAt: +s.checkedAt || 0 };
  } catch (_) { /* unreadable storage is an empty one */ }
  return { v: 1, items: [], checkedAt: 0 };
}
export function saveStore(store, storage) {
  try { (storage || globalThis.localStorage).setItem(STORE_KEY, JSON.stringify(store)); return true; } catch (_) { return false; }
}
/** the store with one more receipt (the newest first) */
export function rememberReceipt(store, entry) {
  const items = [entry].concat((store.items || []).filter((i) => i.receipt !== entry.receipt));
  return { v: 1, items, checkedAt: store.checkedAt || 0 };
}
/** does this device hold a report it has not yet seen answered? (the boot reads only this) */
export function hasOpenReceipt(store) { return (store.items || []).some((i) => !i.seen || OPEN.has(i.seen)); }

/**
 * mergeReports(items, rows) — the device's receipts and the database's rows as ONE list.
 * `rows` are what map_correction_status / my_map_corrections return (each with receipt_hash). A device entry
 * whose hash came back is that row; one whose hash did not come back is said to be GONE (deleted on request,
 * purged, or never stored) — not silently dropped, and not shown as «new». Account rows the device did not
 * send (another device) are listed too. Newest first.
 */
export function mergeReports(items, rows) {
  const byHash = new Map((rows || []).map((r) => [r.receipt_hash, r]));
  const out = [], used = new Set();
  (items || []).forEach((i) => {
    const r = i.hash ? byHash.get(i.hash) : null;
    if (r) { used.add(r.receipt_hash); out.push(Object.assign({}, r, { local: i })); }
    else out.push({ receipt_hash: i.hash || null, id: null, created_at: i.at, kind: i.what, status: 'gone', place_label: i.place || null, lng: i.lng, lat: i.lat, year: i.year == null ? null : i.year, local: i });
  });
  (rows || []).forEach((r) => { if (!used.has(r.receipt_hash)) out.push(Object.assign({}, r, { local: null })); });
  return out.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}
/** the reports whose status moved since the device last saw them (the notice says these, once) */
export function newsSince(reports) {
  return (reports || []).filter((r) => r.local && r.status !== 'gone' && r.local.seen !== r.status && !OPEN.has(r.status));
}
/** the store with every report's status marked as seen */
export function markSeen(store, reports, now) {
  const seen = new Map((reports || []).filter((r) => r.local).map((r) => [r.local.receipt, r.status]));
  return { v: 1, items: (store.items || []).map((i) => (seen.has(i.receipt) ? Object.assign({}, i, { seen: seen.get(i.receipt) }) : i)), checkedAt: now || Date.now() };
}

/* ── words (en + jp) ───────────────────────────────────────────────────────────────────────────── */
export function words(lang) {
  const L = IntMapLang.pick(() => lang);
  return {
    L,
    kind: {
      name: L('A name is wrong or missing', '名前が違う・無い'),
      boundary: L('A border or shape is wrong', '境界・形が違う'),
      date: L('Shown for the wrong years', '存在した年が違う'),
      value: L('A layer\'s value is wrong', 'レイヤーの値が違う'),
      position: L('Something is in the wrong place', '位置がずれている'),
      missing: L('Something is missing', 'あるべきものが無い'),
      other: L('Something else is wrong', 'その他の誤り'),
    },
    status: {
      new: L('Received', '受付済み'),
      confirmed: L('Confirmed — a fix is on the way', '誤りと確認・修正予定'),
      fixed: L('Fixed', '修正済み'),
      not_an_error: L('Checked — the map is right', '確認の結果、誤りではありません'),
      duplicate: L('Already reported', '既に報告済み'),
      cannot_fix: L('Confirmed — cannot be fixed yet', '誤りと確認・今は直せません'),
      closed: L('Closed — no further action', '対応を終了'),
      gone: L('No longer on record', '記録がありません'),
    },
  };
}

/* ── ① the draft: what the card attaches by itself ────────────────────────────────────────────── */
/** the map's own state at this moment — the point the reader picked plus the view it was seen in */
export function mapContext() {
  let view = null, time = null, hash = '';
  try { view = MapState.read('view') || null; } catch (_) { view = null; }
  try { time = MapState.read('time') || null; } catch (_) { time = null; }
  try { hash = MapState.hash() || ''; } catch (_) { hash = ''; }
  const year = (time && Number.isInteger(time.year) && time.year >= YEAR_RANGE.min && time.year <= YEAR_RANGE.max) ? time.year : null;
  /* a fragment longer than the table takes is left out rather than cut (a cut fragment restores a different map); the point
     and the year still travel, and the operator opens the point */
  const link = (hash && hash.length <= CORRECTION_LIMITS.mapLink) ? hash : null;
  const at = (time && time.at) ? String(time.at).slice(0, CORRECTION_LIMITS.mapTime) : null;
  return { zoom: view && isFinite(+view.zoom) ? Math.min(24, Math.max(0, +view.zoom)) : null, mapLink: link, year, mapTime: at };
}
/** the layers the reader may name: what is on (the reading register's own ids and labels), the base map, and «not sure» */
export function layerChoices(lang, profile) {
  const { L } = words(lang);
  const out = [], seen = new Set();
  const add = (id, label) => { if (!id || seen.has(id)) return; seen.add(id); out.push({ id: String(id), label: String(label || id) }); };
  /* from the place profile when the card was opened from it — the rows the reader just read */
  const rows = profile && profile.layers && Array.isArray(profile.layers.rows) ? profile.layers.rows : null;
  if (rows) rows.forEach((r) => add(r.id, r.label));
  else {
    const LY = (typeof window !== 'undefined') ? window.IntMapLayers : null;
    let active = []; try { active = (LY && typeof LY.active === 'function') ? (LY.active() || []) : []; } catch (_) { active = []; }
    active.forEach((id) => { if (id === 'elevation') return; let st = {}; try { st = LY.state(id) || {}; } catch (_) { st = {}; } add(id, st.label || id); });
  }
  add('basemap', L('Base map (place names, roads, coastlines)', '基図（地名・道路・海岸線）'));
  return out;
}
/** the body reader-reports takes — the draft plus what the map attaches */
export function buildBody(draft, ctx) {
  const c = ctx || {};
  return {
    kind: 'correction', what: draft.what, lng: +c.lng, lat: +c.lat,
    zoom: c.zoom == null ? null : +c.zoom, year: c.year == null ? null : c.year, mapTime: c.mapTime || null, mapLink: c.mapLink || null,
    layerId: draft.layerId || null, layerLabel: draft.layerLabel || null, placeLabel: c.placeLabel || null, country: c.country || null,
    message: draft.message, evidence: draft.evidence || null, lang: c.lang || null,
  };
}

/* ── ② the send ────────────────────────────────────────────────────────────────────────────────── */
/** → { ok:true, receipt } | { ok:false, error:'invalid'|'rate_limit'|'unavailable'|'network', field? } */
export async function sendCorrection(HOST, body) {
  const chk = checkCorrection(body);
  if (!chk.ok) return { ok: false, error: 'invalid', field: chk.field };
  const base = String((typeof window !== 'undefined' && window.SUPABASE_URL) || '').replace(/\/$/, '');
  if (!base) return { ok: false, error: 'unavailable' };
  const headers = { 'content-type': 'application/json' };
  try { if (HOST.user && HOST.DB && HOST.DB.auth) { const r = await HOST.DB.auth.getSession(); const t = r && r.data && r.data.session && r.data.session.access_token; if (t) headers.authorization = 'Bearer ' + t; } } catch (_) { /* sent as anonymous */ }
  let res;
  try {
    res = await fetch(base + '/functions/v1/reader-reports', { method: 'POST', headers, credentials: 'omit',
      signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(SEND_DEADLINE_MS) : undefined, body: JSON.stringify(body) });
  } catch (_) { return { ok: false, error: 'network' }; }
  if (res.status === 201) {
    let j = null; try { j = await res.json(); } catch (_) { j = null; }
    if (j && RECEIPT_RE.test(String(j.receipt || ''))) return { ok: true, receipt: j.receipt };
    return { ok: false, error: 'unavailable' };   /* stored but no receipt came back: said, never invented */
  }
  if (res.status === 429) return { ok: false, error: 'rate_limit' };
  if (res.status === 400 || res.status === 413) return { ok: false, error: 'invalid' };
  return { ok: false, error: 'unavailable' };
}

/* ── ③ the answer ──────────────────────────────────────────────────────────────────────────────── */
/** → { ok:true, reports, store } | { ok:false, error } — the device's receipts and (signed in) the account's rows */
export async function readReports(HOST, storage) {
  let store = loadStore(storage);
  /* a hash missing from an older entry is computed once and kept */
  let changed = false;
  for (const i of store.items) if (!i.hash) { i.hash = await receiptHash(i.receipt); changed = true; }
  if (changed) saveStore(store, storage);
  const DB = HOST && HOST.DB;
  if (!DB || typeof DB.rpc !== 'function') return { ok: false, error: 'no-backend' };
  const rows = [];
  try {
    for (let k = 0; k < store.items.length; k += MAX_RECEIPTS_PER_READ) {
      const page = store.items.slice(k, k + MAX_RECEIPTS_PER_READ).map((i) => i.receipt);
      const r = await DB.rpc('map_correction_status', { p_receipts: page });
      if (r.error) return { ok: false, error: 'read-failed' };
      (r.data || []).forEach((x) => rows.push(x));
    }
    if (HOST.user) {
      const m = await DB.rpc('my_map_corrections');
      if (!m.error) (m.data || []).forEach((x) => { if (!rows.some((y) => y.receipt_hash === x.receipt_hash)) rows.push(x); });
    }
  } catch (_) { return { ok: false, error: 'read-failed' }; }
  return { ok: true, reports: mergeReports(store.items, rows), store };
}

/** ④ once in a while, a reader with an open report is told it was answered */
export async function checkForNews(HOST, opts) {
  const o = opts || {}, storage = o.storage;
  const store = loadStore(storage);
  if (!store.items.length || !hasOpenReceipt(store)) return { checked: false, reason: 'nothing-open' };
  const now = o.now || Date.now();
  if (!o.force && now - (store.checkedAt || 0) < CHECK_EVERY_MS) return { checked: false, reason: 'checked-recently' };
  const got = await readReports(HOST, storage);
  if (!got.ok) return { checked: false, reason: got.error };
  const fresh = newsSince(got.reports);
  saveStore(markSeen(loadStore(storage), got.reports, now), storage);
  if (fresh.length && typeof HOST.imToast === 'function') {
    const { L, status } = words(HOST.lang);
    const r = fresh[0];
    try {
      HOST.imToast(fresh.length === 1
        ? L('Your map report was answered: ', '地図の誤り報告に回答がありました: ') + status[r.status] + (r.place_label ? ' — ' + r.place_label : '') + L(' (Settings ▸ My map reports)', '（設定 ▸ 地図の誤り報告）')
        : L(fresh.length + ' of your map reports were answered (Settings ▸ My map reports)', '地図の誤り報告 ' + fresh.length + ' 件に回答がありました（設定 ▸ 地図の誤り報告）'));
    } catch (_) { /* the list still says it */ }
  }
  return { checked: true, answered: fresh.length };
}

/** ⑤ the public log → { ok, rows, summary } */
export async function publicLog(HOST, limit) {
  const DB = HOST && HOST.DB;
  if (!DB || typeof DB.rpc !== 'function') return { ok: false, error: 'no-backend' };
  try {
    const [a, b] = await Promise.all([DB.rpc('public_map_corrections', { p_limit: limit || 100 }), DB.rpc('map_corrections_summary')]);
    if (a.error || b.error) return { ok: false, error: 'read-failed' };
    return { ok: true, rows: a.data || [], summary: b.data || null };
  } catch (_) { return { ok: false, error: 'read-failed' }; }
}

/* ── the DOM ───────────────────────────────────────────────────────────────────────────────────── */
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
function withIcon(name, text) { const s = el('span'); try { s.appendChild(iconNode(name)); } catch (_) { /* text alone */ } s.appendChild(document.createTextNode(' ' + text)); return s; }
function fmtLL(HOST, lng, lat) { try { return HOST.fmtLL(lng, lat); } catch (_) { return (+lat).toFixed(5) + ', ' + (+lng).toFixed(5); } }
function yearText(y, L) { if (y == null) return ''; return y < 0 ? L(-y + ' BC', '紀元前' + (-y) + '年') : L(String(y), y + '年'); }
function dateText(iso, lang) { try { return new Date(iso).toLocaleDateString(IntMapLang.locale(lang, 'en'), { year: 'numeric', month: 'short', day: 'numeric' }); } catch (_) { return String(iso || '').slice(0, 10); } }
function httpUrl(u) { return /^https?:\/\/[^\s]+$/i.test(String(u || '')) ? String(u) : null; }

function card(HOST, id, titleText) {
  let c = document.getElementById(id);
  if (!c) {
    c = el('div', 'country-popup mc-popup'); c.id = id; c.setAttribute('role', 'dialog');
    const x = el('button', 'country-popup-close', '×'); x.type = 'button';
    x.addEventListener('click', () => { c.style.display = 'none'; });
    const head = el('div', 'country-popup-header'); head.appendChild(el('h3'));
    c.appendChild(x); c.appendChild(head); c.appendChild(el('div', 'mc-body'));
    (document.getElementById('map-container') || document.body).appendChild(c);
    try { HOST.makeDraggable(c, head); } catch (_) { /* a fixed card still reads */ }
    c.addEventListener('mousedown', () => { try { HOST.bringToFront(c); } catch (_) { /* order is cosmetic */ } });
  }
  const { L } = words(HOST.lang);
  const x = c.querySelector('.country-popup-close'); x.title = L('Close', '閉じる'); x.setAttribute('aria-label', L('Close', '閉じる'));
  const h = c.querySelector('h3'); h.textContent = ''; h.appendChild(withIcon('flag', titleText)); c.setAttribute('aria-label', titleText);
  c.style.display = 'block';
  if (c.dataset.placed !== '1') {
    c.dataset.placed = '1';
    const mc = document.getElementById('map-container');
    /* the list opens a step down and left of the report card, so the two can be read side by side */
    const off = id === 'mc-mine' ? 36 : 0;
    if (mc) { const r = mc.getBoundingClientRect(); c.style.left = Math.max(12, r.width - 384 - off) + 'px'; c.style.top = (84 + off) + 'px'; }
  }
  try { HOST.bringToFront(c); } catch (_) { /* order is cosmetic */ }
  try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { /* no sheet */ }
  const body = c.querySelector('.mc-body'); body.textContent = '';
  return body;
}

/**
 * openCorrection(HOST, { lng, lat, placeLabel?, country?, profile?, what?, layerId?, message? })
 * The card. `profile` is the place profile's record when opened from it (its layer rows become the choices);
 * `what` / `layerId` / `message` pre-fill it (Atlas drafts; the READER sends). Returns the card's body element.
 */
export function openCorrection(HOST, at) {
  const lng = +(at && at.lng), lat = +(at && at.lat);
  if (!isFinite(lng) || !isFinite(lat)) return null;
  const lang = HOST.lang, W = words(lang), L = W.L;
  /* a country code that is not one the table takes (Natural Earth's own ids include lower-case and longer forms) is left out,
     never allowed to make the whole report refused — the operator reads the country from the point */
  const cc = String(at.country || '').toUpperCase();
  const ctx = Object.assign({ lng, lat, placeLabel: (at.placeLabel ? String(at.placeLabel).slice(0, CORRECTION_LIMITS.placeLabel) : null),
    country: /^[A-Z0-9-]{2,8}$/.test(cc) ? cc : null, lang: lang === 'jp' ? 'jp' : 'en' }, mapContext());
  const body = card(HOST, 'mc-popup', L('Report a map error', '地図の誤りを報告'));

  /* where and when — attached, shown, not typed */
  const where = el('div', 'mc-where');
  where.appendChild(el('div', 'mc-place', ctx.placeLabel || fmtLL(HOST, lng, lat)));
  const meta = [ctx.placeLabel ? fmtLL(HOST, lng, lat) : null, ctx.year != null ? L('Map year: ', '地図の年: ') + yearText(ctx.year, L) : L('Map: today', '地図: 現在')].filter(Boolean).join(' · ');
  where.appendChild(el('div', 'mc-meta', meta));
  body.appendChild(where);

  const form = el('form', 'mc-form'); form.noValidate = true; form.setAttribute('data-effect', 'outward');   /* sends the report to IntMap's server (scripts/data-effects.mjs) */
  const field = (labelText, input, hint) => { const f = el('label', 'mc-field'); f.appendChild(el('span', 'mc-label', labelText)); f.appendChild(input); if (hint) f.appendChild(hint); form.appendChild(f); return input; };
  const kind = el('select'); kind.name = 'what';
  CORRECTION.kinds.forEach((k) => { const o = el('option', null, W.kind[k]); o.value = k; kind.appendChild(o); });
  kind.value = (at.what && CORRECTION.kinds.includes(at.what)) ? at.what : (ctx.year != null ? 'date' : 'name');
  field(L('What is wrong', '何が違うか'), kind);
  const layer = el('select'); layer.name = 'layer';
  const choices = layerChoices(lang, at.profile);
  choices.forEach((c) => { const o = el('option', null, c.label); o.value = c.id; layer.appendChild(o); });
  const unsure = el('option', null, L('Not sure / not a layer', 'わからない・レイヤーではない')); unsure.value = ''; layer.appendChild(unsure);
  layer.value = (at.layerId && choices.some((c) => c.id === at.layerId)) ? at.layerId : (choices.length > 1 ? choices[0].id : '');
  field(L('Where on the map', '地図のどこか'), layer);
  const msg = el('textarea'); msg.name = 'message'; msg.rows = 4; msg.maxLength = CORRECTION_LIMITS.message;
  msg.placeholder = ctx.year != null
    ? L('e.g. This province did not exist yet in this year — it was created in 1871.', '例: この年にはまだこの県はありません（1871年の設置）。')
    : L('e.g. The town is called … ; the border runs along the river, not the ridge.', '例: この町の名前は…です。境界は尾根ではなく川に沿っています。');
  if (at.message) msg.value = String(at.message).slice(0, CORRECTION_LIMITS.message);
  const count = el('span', 'mc-count');
  const recount = () => { count.textContent = (CORRECTION_LIMITS.message - msg.value.length) + L(' characters left', ' 文字まで'); };
  msg.addEventListener('input', recount); recount();
  field(L('What should it be?', '正しくはどうか'), msg, count);
  const ev = el('input'); ev.name = 'evidence'; ev.type = 'url'; ev.maxLength = CORRECTION_LIMITS.evidence; ev.placeholder = 'https://';
  field(L('Source (optional)', '出典（任意）'), ev);
  form.appendChild(el('p', 'mc-note', L('Sent with your report: this point, the map view as you see it now (layers and year) and your words. No e-mail is needed: a receipt is kept on this device and the answer appears in Settings ▸ My map reports.',
    '報告と一緒に送るもの: この地点、いまの地図の表示（レイヤーと年）、あなたの文章。メールアドレスは不要です。受付番号をこの端末に保存し、回答は「設定 ▸ 地図の誤り報告」に表示されます。')));
  const row = el('div', 'pd-actions');
  const send = el('button', 'primary'); send.type = 'submit'; send.appendChild(withIcon('check', L('Send report', '報告を送る')));
  const mine = el('button'); mine.type = 'button'; mine.setAttribute('data-effect', 'none'); mine.appendChild(withIcon('clipboard', L('My map reports', '地図の誤り報告')));
  mine.addEventListener('click', () => { openMine(HOST); });
  row.appendChild(send); row.appendChild(mine); form.appendChild(row);
  const status = el('p', 'mc-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); form.appendChild(status);
  body.appendChild(form);

  const FIELD = { what: kind, message: msg, evidence: ev, layerId: layer };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pick = choices.find((c) => c.id === layer.value) || null;
    const draft = { what: kind.value, layerId: pick ? pick.id : null, layerLabel: pick ? pick.label : null, message: msg.value, evidence: ev.value.trim() || null };
    const b = buildBody(draft, ctx);
    const chk = checkCorrection(b);
    [msg, ev, kind, layer].forEach((x) => x.removeAttribute('aria-invalid'));
    if (!chk.ok) {
      const bad = FIELD[chk.field]; if (bad) { bad.setAttribute('aria-invalid', 'true'); try { bad.focus(); } catch (_) { /* focus is a courtesy */ } }
      status.textContent = chk.field === 'message' ? L('Please say what is wrong.', '何が違うかを書いてください。')
        : chk.field === 'evidence' ? L('The source must be a web address starting with http:// or https://.', '出典は http:// か https:// で始まるアドレスにしてください。')
          : L('This report cannot be sent as it is (' + chk.field + ').', 'この内容では送れません（' + chk.field + '）。');
      status.className = 'mc-status is-bad'; return;
    }
    send.disabled = true; status.className = 'mc-status'; status.textContent = L('Sending…', '送信中…');
    const r = await sendCorrection(HOST, b);
    send.disabled = false;
    if (r.ok) {
      saveStore(rememberReceipt(loadStore(), { receipt: r.receipt, hash: await receiptHash(r.receipt), at: new Date().toISOString(), what: b.what, place: b.placeLabel || fmtLL(HOST, lng, lat), lng, lat, year: b.year, seen: 'new' }));
      form.querySelectorAll('select,textarea,input').forEach((x) => { x.disabled = true; }); send.disabled = true;
      status.className = 'mc-status is-ok';
      status.textContent = L('Sent — thank you. The answer will appear in Settings ▸ My map reports (the receipt is kept on this device).', '送信しました。ありがとうございます。回答は「設定 ▸ 地図の誤り報告」に表示されます（受付番号はこの端末に保存しました）。');
    } else {
      status.className = 'mc-status is-bad';
      status.textContent = r.error === 'rate_limit' ? L('Too many reports from here just now — please try again in a while. Your text is kept.', '短い時間に多くの報告がありました。しばらくしてからもう一度送ってください（文章は残っています）。')
        : r.error === 'invalid' ? L('The report was refused as malformed. Your text is kept.', '報告の形式が受け付けられませんでした（文章は残っています）。')
          : L('Not sent — the server could not be reached. Your text is kept; please try again.', '送信できませんでした（サーバーに届きません）。文章は残っています。もう一度お試しください。');
    }
  });
  try { msg.focus(); } catch (_) { /* focus is a courtesy */ }
  return body;
}

/** the reader's reports and their answers — Settings ▸ My map reports, the card's second button */
export async function openMine(HOST) {
  const lang = HOST.lang, W = words(lang), L = W.L;
  const body = card(HOST, 'mc-mine', L('My map reports', '地図の誤り報告'));
  const info = el('p', 'mc-note', L('Reading…', '読み込み中…')); body.appendChild(info);
  const got = await readReports(HOST);
  info.textContent = '';
  if (!got.ok) { info.textContent = L('The answers could not be read just now (', '回答を読み込めませんでした（') + got.error + L('). Your receipts are still on this device.', '）。受付番号はこの端末に残っています。'); return { ok: false, error: got.error }; }
  const reps = got.reports;
  if (!reps.length) {
    info.textContent = L('You have not reported anything from this device or account yet. To report: right-click (long-press) the map ▸ Report a map error here, or the Place profile card.', 'この端末・アカウントからの報告はまだありません。報告するには、地図を右クリック（長押し）▸「ここの誤りを報告」、または地点プロファイルのカードから。');
    return { ok: true, reports: [] };
  }
  info.textContent = L(reps.length + ' report(s). The operator\'s answer appears under each.', reps.length + ' 件。運営者の回答が各報告の下に表示されます。');
  const list = el('ul', 'mc-list');
  reps.forEach((r) => {
    const li = el('li', 'mc-item');
    const top = el('div', 'mc-item-top');
    top.appendChild(el('span', 'mc-chip is-' + String(r.status || 'new').replace(/[^a-z_]/g, ''), W.status[r.status] || r.status));
    top.appendChild(el('span', 'mc-meta', [W.kind[r.kind] || r.kind, r.year != null ? yearText(r.year, L) : null, dateText(r.created_at, lang)].filter(Boolean).join(' · ')));
    li.appendChild(top);
    li.appendChild(el('div', 'mc-place', r.place_label || fmtLL(HOST, r.lng, r.lat)));
    if (r.layer_label) li.appendChild(el('div', 'mc-meta', r.layer_label));
    if (r.message) li.appendChild(el('div', 'mc-msg', r.message));
    if (r.reply) { const rp = el('div', 'mc-reply'); rp.appendChild(el('b', null, L('Answer: ', '回答: '))); rp.appendChild(document.createTextNode(r.reply)); li.appendChild(rp); }
    const fx = httpUrl(r.fixed_ref);
    if (fx) { const a = el('a', 'mc-link', L('What was changed', '変更内容')); a.href = fx; a.target = '_blank'; a.rel = 'noopener'; li.appendChild(a); }
    else if (r.fixed_ref) li.appendChild(el('div', 'mc-meta', r.fixed_ref));
    const acts = el('div', 'mc-item-acts');
    const show = el('button', null, L('Show on the map', '地図で見る')); show.type = 'button';
    show.addEventListener('click', () => {
      /* the view it was reported in — a hash navigation is a full restore of that state (js/map-ui.js hashchange) */
      if (r.map_link && /^#v=/.test(r.map_link)) { try { location.hash = r.map_link; } catch (_) { /* below */ } return; }
      try { IntMapGeoEngine.camera.flyTo({ center: [r.lng, r.lat], zoom: 9, speed: 1.2 }); } catch (_) { /* no renderer yet */ }
    });
    acts.appendChild(show);
    if (r.local) {
      const forget = el('button', null, L('Forget on this device', 'この端末から消す')); forget.type = 'button';
      forget.addEventListener('click', () => { const s = loadStore(); s.items = s.items.filter((i) => i.receipt !== r.local.receipt); saveStore(s); li.remove(); });
      acts.appendChild(forget);
    }
    li.appendChild(acts);
    list.appendChild(li);
  });
  body.appendChild(list);
  const pub = el('a', 'mc-link', L('Published corrections', '公開された訂正の記録')); pub.href = (lang === 'jp' ? './ja/' : './') + 'corrections.html'; pub.target = '_blank'; pub.rel = 'noopener';
  body.appendChild(pub);
  saveStore(markSeen(loadStore(), reps, Date.now()));
  return { ok: true, reports: reps };
}
