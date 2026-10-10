/* ============================================================================
 *  IntMap · THE TOUR BUILDER — a teacher writes a classroom tour of their own   (js/tour-builder.js)
 * ----------------------------------------------------------------------------
 *  (tour-builder) The classroom tours of js/tours.js are three, written by us. A teacher who wants
 *  THEIR lesson had no way to make one. This panel is that way: set the map up — camera, base map,
 *  layers, date, comparison, simulators, everything a share link carries — and press «Add this map»;
 *  write the step's title, the words to read out and a question for the class; reorder, replace,
 *  delete; preview it in the classroom mode; share it as a link.
 *
 *  ── A STEP IS THE MAP'S OWN LINK ───────────────────────────────────────────────────────────────
 *  A step is recorded with `MapState.hash()` (js/map-state.js) — the codec that writes the address bar
 *  and every share link — exactly as Atlas's `panel.tour addStep` records one (js/tour-player.js). There
 *  is no second encoder of the map's state here, and the player opens a step through the share link's
 *  own restore.
 *
 *  ── THE TOUR IS KEPT IN ITS ADDRESS, NOT ON A SERVER ───────────────────────────────────────────
 *  The shared form is `?tour=custom&t=<the tour>&step=1#<step 1's map>` (js/tours.js — the codec, the
 *  server's measured limit TOUR_REQUEST_LIMIT, and the link). Anyone who opens it gets the same tour in
 *  the same player as the declared tours (js/tour-player.js startTour('custom')). While the author writes,
 *  the draft is kept in this browser (localStorage `intmap_tour_draft`) so a reload does not lose it.
 *  The panel says how much of the address the tour uses, warns BEFORE the next step would not fit, and
 *  will not hand out a link the hosted site would refuse.
 *
 *  ── WHO LOADS THIS FILE (none of them at a normal start-up) ─────────────────────────────────
 *    · the tour list of js/tour-player.js («Make your own tour») and its «Edit this tour»;
 *    · Atlas's `panel.tourBuilder` (js/atlas-cap-panel.js).
 *
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7). ⚠ No `window` global is published.
 * ==========================================================================*/

import { MapState } from './map-state.js';
import { CUSTOM_TOUR_ID, TOUR_REQUEST_LIMIT, encodeCustomTour, customTourLink, tourQuery } from './tours.js';
import { icon } from './icons.js';
import * as bus from './bus.js';   /* (map-document-unify) the Library is asked for through the declared event */
import { fromTourDraft, hasMap } from './map-doc.js';   /* (map-document-unify) the draft as the one map document the account keeps */
/* the player's reading of the language, its HTML encoder and its way to the map (js/tour-player.js) */
import { IntMapLang } from './lang-registry.js';
import { readerLang, escapeHtml, mapReady, openLink, startTour } from './tour-player.js';
const t = IntMapLang.pick(() => readerLang());
const H = (s) => escapeHtml(s);

/* ══ THE DRAFT — this browser's copy of the tour being written ════════════════════════════════════ */
const DRAFT_KEY = 'intmap_tour_draft';
let uid = 0;
const newId = () => 's' + Date.now().toString(36) + '-' + (++uid);
const str = (v) => String(v == null ? '' : v);
/* read after the helpers it uses exist (a reload's draft was lost to their temporal dead zone — tests/tour-builder-checks ③) */
/** @type {{ title: string, steps: { id: string, title: string, say: string, ask: string, hash: (string|null) }[] }} */
let draft = readDraft();

function readDraft() {
  try {
    const v = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (v && Array.isArray(v.steps)) return { title: str(v.title), steps: v.steps.filter(Boolean).map((s) => ({ id: newId(), title: str(s.title), say: str(s.say), ask: str(s.ask), hash: s.hash ? str(s.hash) : null })) };
  } catch (_) { }
  return { title: '', steps: [] };
}
function writeDraft() {
  try {
    if (!draft.steps.length && !draft.title) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: draft.title, steps: draft.steps.map((s) => ({ title: s.title, say: s.say, ask: s.ask, hash: s.hash })) }));
  } catch (_) { /* private mode / storage full: the draft still lives in this page */ }
}
const hasText = (s) => !!(s.title || s.say || s.ask);
const sameTour = (a, b) => JSON.stringify([a.title, a.steps.map((s) => [s.title, s.say, s.ask, s.hash])]) === JSON.stringify([b.title, b.steps.map((s) => [s.title, s.say, s.ask, s.hash])]);

/* ══ THE MAP AS IT IS NOW — the codec's own fragment, or the reason there is none ═══════════════ */
function mapNow() {
  if (!mapReady()) return { ok: false, reason: 'no-map' };
  const hash = MapState.hash();
  return MapState.carries(hash) ? { ok: true, hash } : { ok: false, reason: 'no-link' };
}

/* ══ HOW MUCH OF THE ADDRESS THE TOUR USES ═══════════════════════════════════════════════════════
   What the server receives is the path and the query (js/tours.js TOUR_REQUEST_LIMIT — measured). The step
   number is counted at its largest (the player writes `step=<n>` into the address as it moves), and «the next
   step may not fit» is said when the room left is less than the room an average step of THIS tour takes — the
   tour's own measure, not a percentage picked here. */
async function measure() {
  const tt = await encodeCustomTour(draft);
  const n = Math.max(1, draft.steps.length);
  let path = '/'; try { path = location.pathname; } catch (_) { }
  const bytes = new TextEncoder().encode(path + tourQuery(CUSTOM_TOUR_ID, n, tt)).length;
  const per = draft.steps.length ? Math.ceil(tt.length / draft.steps.length) : 0;
  const level = bytes > TOUR_REQUEST_LIMIT ? 'over' : (per && bytes + per > TOUR_REQUEST_LIMIT ? 'near' : 'ok');
  return { t: tt, bytes, limit: TOUR_REQUEST_LIMIT, perStep: per, level };
}

/** the share link of the draft → { ok, url, bytes, limit, level, reason? } */
export async function shareLink() {
  if (!draft.steps.length) return { ok: false, reason: 'no-steps' };
  const m = await measure();
  if (m.level === 'over') return { ok: false, reason: 'too-long', bytes: m.bytes, limit: m.limit, level: m.level };
  const base = MapState.pageLink('', '') || './index.html';   /* (map-document-unify) the one link assembly */
  const first = draft.steps.find((s) => s.hash);
  return { ok: true, url: customTourLink(base, m.t, first === draft.steps[0] ? first.hash : ''), bytes: m.bytes, limit: m.limit, level: m.level };
}

/* ══ EDITING — each returns what it did, and the panel (if open) is drawn again ════════════════ */
function changed(structural) { writeDraft(); if (panel) { if (structural) render(); else scheduleMeter(); } }
const inRange = (i) => Number.isInteger(i) && i >= 0 && i < draft.steps.length;
const idx = (n) => Math.round(+n) - 1;   /* the public face counts steps from 1, as the player does */

/** record the map as it is now as a new step (at the end, or after step `after`) */
export async function addCurrent(o) {
  o = o || {};
  if (o.after != null && !inRange(idx(o.after))) return { ok: false, reason: 'no-step' };   /* a place that is not a step is not «the end» */
  const m = mapNow(); if (!m.ok) return m;
  const step = { id: newId(), title: str(o.title), say: str(o.say), ask: str(o.ask), hash: m.hash };
  const at = o.after != null ? idx(o.after) + 1 : draft.steps.length;
  draft.steps.splice(at, 0, step);
  if (o.tourTitle != null) draft.title = str(o.tourTitle);
  changed(true);
  return { ok: true, step: at + 1, count: draft.steps.length, hash: m.hash, budget: await measure() };
}
/** step n takes the map as it is now (its words stay) */
export async function replaceStep(n) {
  const i = idx(n); if (!inRange(i)) return { ok: false, reason: 'no-step' };
  const m = mapNow(); if (!m.ok) return m;
  draft.steps[i].hash = m.hash; changed(true);
  return { ok: true, step: i + 1, hash: m.hash, budget: await measure() };
}
export function removeStep(n) {
  const i = idx(n); if (!inRange(i)) return { ok: false, reason: 'no-step' };
  draft.steps.splice(i, 1); changed(true);
  return { ok: true, count: draft.steps.length };
}
/** move step n to position `to` (both from 1) */
export function moveStep(n, to) {
  const i = idx(n); if (!inRange(i)) return { ok: false, reason: 'no-step' };
  const j = Math.max(0, Math.min(draft.steps.length - 1, idx(to)));
  const [s] = draft.steps.splice(i, 1); draft.steps.splice(j, 0, s); changed(true);
  return { ok: true, step: j + 1, count: draft.steps.length };
}
/** set step n's words — only the fields given */
export function editStep(n, o) {
  const i = idx(n); if (!inRange(i)) return { ok: false, reason: 'no-step' };
  o = o || {}; const s = draft.steps[i];
  ['title', 'say', 'ask'].forEach((k) => { if (o[k] != null) s[k] = str(o[k]); });
  changed(true);
  return { ok: true, step: i + 1 };
}
export function setTitle(v) { draft.title = str(v); changed(true); return { ok: true }; }
export function clearDraft() { draft = { title: '', steps: [] }; changed(true); return { ok: true }; }
/** the draft as plain data (steps from 1) */
export function getDraft() { return { title: draft.title, steps: draft.steps.map((s, i) => ({ step: i + 1, title: s.title, say: s.say, ask: s.ask, hash: s.hash })) }; }

/** (map-document-unify) keep the draft in the account: the Library (js/my-places.js, opened by the app's account owner
    through js/bus.js 'intmap-open-library') saves it as a tour document — the same door every saved map takes */
function saveToAccount() {
  const doc = fromTourDraft(getDraft(), 'tour-draft');
  if (!doc) return { ok: false, reason: 'no-steps' };
  if (!hasMap(doc)) return { ok: false, reason: 'no-link' };
  bus.emit('intmap-open-library', { doc });
  return { ok: true, steps: doc.steps.length };
}
/** show step n's map on the map (the share link's own restore — the path a pasted link takes) */
export function showStep(n) {
  const i = idx(n); if (!inRange(i)) return { ok: false, reason: 'no-step' };
  const s = draft.steps[i]; if (!s.hash) return { ok: false, reason: 'no-link' };
  const r = openLink(s.hash); return r.ok ? { ok: true, step: i + 1 } : r;
}
/** play the draft in the classroom mode from step n — the same player and the same address a shared link opens */
export async function preview(n) {
  if (!draft.steps.length) return { ok: false, reason: 'no-steps' };
  const m = await measure();
  return startTour(CUSTOM_TOUR_ID, Math.max(1, Math.round(+n || 1)), { t: m.t });
}

/* ══ THE PANEL ═══════════════════════════════════════════════════════════════════════════════════ */
const CSS = [
  '#im-tour-builder{position:fixed;top:14px;right:14px;z-index:var(--z-front);width:min(400px,calc(100vw - 28px));max-height:calc(100dvh - var(--credit-h,23px) - 28px);display:flex;flex-direction:column;box-sizing:border-box;border-radius:22px;background:color-mix(in srgb,var(--card-bg) 94%,transparent);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);font-size:14px;line-height:1.4;}',
  '#im-tour-builder .tb-head{display:flex;align-items:center;gap:8px;padding:14px 12px 8px 18px;}',
  '#im-tour-builder .tb-head h2{flex:1 1 auto;margin:0;font-size:17px;font-weight:700;letter-spacing:-0.01em;}',
  '#im-tour-builder .tb-icon{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:none;border-radius:10px;background:transparent;color:var(--text-muted);cursor:pointer;}',
  '#im-tour-builder .tb-icon:hover{background:var(--input-bg);color:var(--text-main);}',
  '#im-tour-builder .tb-icon:disabled{opacity:0.35;cursor:default;background:transparent;}',
  '#im-tour-builder .tb-icon.tb-danger:hover{color:#ff3b30;}',
  '#im-tour-builder .tb-up svg{transform:rotate(90deg);}#im-tour-builder .tb-down svg{transform:rotate(-90deg);}',
  '#im-tour-builder .tb-body{flex:1 1 auto;min-height:0;overflow:auto;padding:0 14px 6px;-webkit-overflow-scrolling:touch;}',
  '#im-tour-builder.tb-folded .tb-body,#im-tour-builder.tb-folded .tb-foot{display:none;}',
  '#im-tour-builder input,#im-tour-builder textarea{width:100%;box-sizing:border-box;border:1px solid rgba(128,128,128,0.22);border-radius:10px;background:var(--input-bg);color:var(--text-main);font:inherit;padding:8px 10px;}',
  '#im-tour-builder input:focus,#im-tour-builder textarea:focus{outline:2px solid var(--primary-color);outline-offset:-1px;}',
  '#im-tour-builder textarea{resize:vertical;min-height:52px;margin-top:6px;}',
  '#im-tour-builder .tb-name{font-weight:600;font-size:15px;}',
  '#im-tour-builder .tb-hint{margin:8px 2px 10px;font-size:12.5px;color:var(--text-muted);}',
  '#im-tour-builder ol{list-style:none;margin:0;padding:0;}',
  '#im-tour-builder li{margin:0 0 10px;padding:10px;border-radius:16px;background:color-mix(in srgb,var(--input-bg) 60%,transparent);border:1px solid rgba(128,128,128,0.16);}',
  '#im-tour-builder li.tb-cur{border-color:var(--primary-color);}',
  '#im-tour-builder .tb-row{display:flex;align-items:center;gap:8px;}',
  '#im-tour-builder .tb-n{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:var(--primary-fill);color:#fff;font-size:12px;font-weight:700;}',
  '#im-tour-builder .tb-acts{display:flex;align-items:center;gap:2px;margin-top:6px;}',
  '#im-tour-builder .tb-acts .tb-sp{flex:1 1 auto;}',
  '#im-tour-builder .tb-nomap{margin-top:6px;font-size:12px;color:#ff9500;}',
  '#im-tour-builder button.tb-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font:inherit;font-weight:600;cursor:pointer;}',
  '#im-tour-builder button.tb-btn.tb-primary{background:var(--primary-fill);border-color:transparent;color:#fff;}',
  '#im-tour-builder button.tb-btn:disabled{opacity:0.4;cursor:default;}',
  '#im-tour-builder button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px;}',
  '#im-tour-builder .tb-add{width:100%;margin:2px 0 8px;}',
  '#im-tour-builder .tb-foot{padding:10px 14px 14px;border-top:1px solid rgba(128,128,128,0.16);}',
  '#im-tour-builder .tb-meter{height:5px;border-radius:999px;background:rgba(128,128,128,0.2);overflow:hidden;}',
  '#im-tour-builder .tb-meter i{display:block;height:100%;background:#34c759;border-radius:inherit;}',
  '#im-tour-builder .tb-meter[data-level="near"] i{background:#ff9500;}#im-tour-builder .tb-meter[data-level="over"] i{background:#ff3b30;}',
  '#im-tour-builder .tb-size{margin:6px 0 10px;font-size:12px;color:var(--text-muted);}',
  '#im-tour-builder .tb-size[data-level="near"]{color:#ff9500;}#im-tour-builder .tb-size[data-level="over"]{color:#ff3b30;}',
  '#im-tour-builder .tb-bar{display:flex;flex-wrap:wrap;gap:8px;}',
  '#im-tour-builder .tb-bar .tb-btn{flex:1 1 auto;}',
  '#im-tour-builder .tb-said{min-height:1.2em;margin-top:8px;font-size:12.5px;color:var(--text-muted);word-break:break-all;}',
  '#im-tour-builder .tb-said input{margin-top:6px;font-size:12px;}',
  '#im-tour-builder .tb-clear{background:none;border:none;color:var(--text-muted);font:inherit;font-size:12.5px;cursor:pointer;padding:6px 2px 0;text-decoration:underline;}',
  '@media (max-width:640px){#im-tour-builder{top:auto;left:8px;right:8px;bottom:calc(var(--credit-h,23px) + 8px);width:auto;max-height:62dvh;border-radius:20px;}}',
].join('\n');
let styled = false;
function style() { if (styled) return; styled = true; const st = document.createElement('style'); st.id = 'im-tour-builder-css'; st.textContent = CSS; document.head.appendChild(st); }

/* `said`: the panel's last message — plain text, and the link to copy when the clipboard refused it */
let panel = null, cur = -1, meterTimer = 0, said = { text: '', url: '' };

function stepHtml(s, i, N) {
  const n = i + 1;
  const b = (act, ic, label, extra, dis) => '<button type="button" class="tb-icon' + (extra ? ' ' + extra : '') + '" data-tb="' + act + '" data-i="' + i + '" title="' + H(label) + '" aria-label="' + H(label + ' — ' + t('step ', 'ステップ ') + n) + '"' + (dis ? ' disabled' : '') + '>' + icon(ic, { size: 18 }) + '</button>';
  return '<li data-i="' + i + '"' + (i === cur ? ' class="tb-cur"' : '') + '>'
    + '<div class="tb-row"><span class="tb-n">' + n + '</span><input type="text" data-tb-f="title" data-i="' + i + '" value="' + H(s.title) + '" placeholder="' + H(t('Step title', 'ステップの題')) + '" aria-label="' + H(t('Title of step ', 'ステップの題 ') + n) + '"></div>'
    + '<textarea rows="2" data-tb-f="say" data-i="' + i + '" placeholder="' + H(t('What to say about this map', 'この地図について話すこと')) + '" aria-label="' + H(t('What to say, step ' + n, '話すこと（ステップ ' + n + '）')) + '">' + H(s.say) + '</textarea>'
    + '<textarea rows="1" data-tb-f="ask" data-i="' + i + '" placeholder="' + H(t('A question for the class (optional)', '授業での問い（任意）')) + '" aria-label="' + H(t('Question for the class, step ' + n, '授業での問い（ステップ ' + n + '）')) + '">' + H(s.ask) + '</textarea>'
    + (s.hash ? '' : '<div class="tb-nomap">' + H(t('This step has no map. Set the map up and press «Use this map».', 'このステップには地図がありません。地図を整えて「いまの地図にする」を押してください。')) + '</div>')
    + '<div class="tb-acts">'
      + b('show', 'eye', t('Show this step on the map', 'この地図を表示'), '', !s.hash)
      + b('replace', 'reset', t('Use this map', 'いまの地図にする'))
      + b('preview', 'play', t('Preview from this step', 'このステップから再生'))
      + '<span class="tb-sp"></span>'
      + b('up', 'chevronL', t('Move up', '上へ'), 'tb-up', i === 0)
      + b('down', 'chevronL', t('Move down', '下へ'), 'tb-down', i === N - 1)
      + b('remove', 'trash', t('Delete', '削除'), 'tb-danger')
    + '</div></li>';
}

function render() {
  if (!panel) return;
  const N = draft.steps.length;
  const folded = panel.classList.contains('tb-folded');
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  panel.innerHTML = '<div class="tb-head"><h2 id="im-tour-builder-h">' + H(t('Make a tour', 'ツアーを作る')) + '</h2>'
      + '<button type="button" class="tb-icon" data-tb="fold" aria-expanded="' + (folded ? 'false' : 'true') + '" title="' + H(folded ? t('Show', '開く') : t('Fold', 'たたむ')) + '" aria-label="' + H(folded ? t('Show the tour builder', 'ツアー作成を開く') : t('Fold the tour builder', 'ツアー作成をたたむ')) + '"><span style="display:inline-flex;transform:rotate(' + (folded ? '90' : '-90') + 'deg)">' + icon('chevronL', { size: 18 }) + '</span></button>'
      + '<button type="button" class="tb-icon" data-tb="close" title="' + H(t('Close', '閉じる')) + '" aria-label="' + H(t('Close the tour builder', 'ツアー作成を閉じる')) + '">' + icon('close', { size: 18 }) + '</button></div>'
    + '<div class="tb-body">'
      + '<input type="text" class="tb-name" data-tb-f="tour" value="' + H(draft.title) + '" placeholder="' + H(t('Tour title', 'ツアーの題')) + '" aria-label="' + H(t('Tour title', 'ツアーの題')) + '">'
      + '<p class="tb-hint">' + H(N ? t('Each step is the map exactly as it was when you added it: place, date, layers and comparison.', '各ステップは、追加したときの地図そのもの（場所・日付・レイヤー・比較）です。')
        : t('Set the map up for the first step — place, date, layers — then add it. The tour is kept in this browser until you share it as a link.', '最初のステップの地図（場所・日付・レイヤー）を整えてから追加します。ツアーはリンクで共有するまで、このブラウザに保存されます。')) + '</p>'
      + '<ol>' + draft.steps.map((s, i) => stepHtml(s, i, N)).join('') + '</ol>'
      + '<button type="button" class="tb-btn tb-primary tb-add" data-tb="add">' + icon('map', { size: 18 }) + H(t('Add this map as a step', 'いまの地図をステップに追加')) + '</button>'
    + '</div>'
    + '<div class="tb-foot">'
      + '<div class="tb-meter" data-level="ok" aria-hidden="true"><i style="width:0%"></i></div>'
      + '<div class="tb-size" data-level="ok" role="status"></div>'
      + '<div class="tb-bar">'
        + '<button type="button" class="tb-btn" data-tb="preview" data-i="0"' + (N ? '' : ' disabled') + '>' + icon('play', { size: 16 }) + H(t('Preview', 'プレビュー')) + '</button>'
        + '<button type="button" class="tb-btn" data-tb="copy"' + (N ? '' : ' disabled') + '>' + icon('link', { size: 16 }) + H(t('Copy link', 'リンクをコピー')) + '</button>'
        + (canShare ? '<button type="button" class="tb-btn" data-tb="share"' + (N ? '' : ' disabled') + '>' + icon('share', { size: 16 }) + H(t('Share', '共有')) + '</button>' : '')
        /* (map-document-unify) into the account: the Library keeps the tour on every device, files it in a collection and publishes it */
        + '<button type="button" class="tb-btn" data-tb="account" data-effect="private"' + (N ? '' : ' disabled') + '>' + icon('save', { size: 16 }) + H(t('Save to account', 'アカウントに保存')) + '</button>'
      + '</div>'
      + '<div class="tb-said" aria-live="polite">' + saidHtml() + '</div>'
      + (N || draft.title ? '<button type="button" class="tb-clear" data-tb="clear">' + H(t('Start over (delete this draft)', '最初からやり直す（下書きを削除）')) + '</button>' : '')
    + '</div>';
  scheduleMeter(0);
}

function scheduleMeter(ms) {
  clearTimeout(meterTimer);
  meterTimer = setTimeout(async () => {
    if (!panel) return;
    const m = await measure();
    const bar = panel.querySelector('.tb-meter'), txt = panel.querySelector('.tb-size'); if (!bar || !txt) return;
    const level = draft.steps.length ? m.level : 'ok';
    bar.setAttribute('data-level', level); txt.setAttribute('data-level', level);
    /** @type {HTMLElement} */ (bar.firstElementChild).style.width = Math.min(100, Math.round(m.bytes / m.limit * 100)) + '%';
    const kb = (x) => (x / 1024).toFixed(1);
    const head = t('Link length: ', 'リンクの長さ: ') + kb(m.bytes) + ' / ' + kb(m.limit) + ' KB';
    txt.textContent = level === 'over' ? head + ' — ' + t('too long to open on IntMap\'s site. Shorten the words or remove a step.', 'IntMap のサイトで開けない長さです。文を短くするか、ステップを減らしてください。')
      : level === 'near' ? head + ' — ' + t('one more step may not fit.', 'あと 1 ステップ入らないかもしれません。')
      : head;
    panel.querySelectorAll('[data-tb="copy"],[data-tb="share"]').forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = !draft.steps.length || level === 'over'; });
  }, ms == null ? 250 : ms);
}

function saidHtml() { return H(said.text) + (said.url ? '<input type="text" readonly value="' + H(said.url) + '" aria-label="' + H(t('Tour link', 'ツアーのリンク')) + '">' : ''); }
function say(text, url) { said = { text: str(text), url: str(url) }; const el = panel && panel.querySelector('.tb-said'); if (el) el.innerHTML = saidHtml(); }
const reasonText = (r) => ({
  'no-map': t('The map has not finished loading yet.', '地図の読み込みがまだ終わっていません。'),
  'no-link': t('This map cannot be written as a link.', 'この地図はリンクにできません。'),
  'too-long': t('The tour is too long for a link.', 'ツアーがリンクには長すぎます。'),
  'no-steps': t('Add a step first.', '先にステップを追加してください。'),
}[r && r.reason] || str(r && r.reason));

async function copyLink() {
  const r = await shareLink(); if (!r.ok) { say(reasonText(r)); return r; }
  let copied = false;
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(r.url); copied = true; } } catch (_) { copied = false; }
  /* a page that may not write the clipboard still hands the link over: selected, ready for ⌘C / long-press */
  if (copied) say(t('Link copied. Anyone who opens it gets this tour.', 'リンクをコピーしました。開いた人は誰でもこのツアーを見られます。'));
  else say(t('Copy this link:', 'このリンクをコピーしてください:'), r.url);
  if (!copied) { const inp = panel && /** @type {HTMLInputElement|null} */ (panel.querySelector('.tb-said input')); if (inp) { inp.focus(); inp.select(); } }
  return { ...r, copied };
}
async function nativeShare() {
  const r = await shareLink(); if (!r.ok) { say(reasonText(r)); return; }
  try { await navigator.share({ title: draft.title || t('Classroom tour', '授業ツアー'), url: r.url }); }
  catch (e) { if (!(e && e.name === 'AbortError')) await copyLink(); }
}

async function onClick(e) {
  const b = e.target && e.target.closest ? e.target.closest('[data-tb]') : null; if (!b || b.disabled) return;
  const a = b.getAttribute('data-tb'); const i = +(b.getAttribute('data-i') || 0); const n = i + 1;
  if (a === 'close') { closeBuilder(); return; }
  if (a === 'fold') { panel.classList.toggle('tb-folded'); render(); return; }
  if (a === 'add') { const r = await addCurrent({}); if (!r.ok) say(reasonText(r)); else { cur = r.step - 1; say(''); render(); focusStep(cur); } return; }
  if (a === 'replace') { const r = await replaceStep(n); say(r.ok ? t('Step ' + n + ' now shows the map as it is.', 'ステップ ' + n + ' をいまの地図にしました。') : reasonText(r)); return; }
  if (a === 'show') { cur = i; const r = showStep(n); render(); if (!r.ok) say(reasonText(r)); return; }
  if (a === 'preview') { const r = await preview(n); if (r && r.ok === false && r.reason) say(reasonText(r)); return; }
  if (a === 'up' || a === 'down') { const r = moveStep(n, a === 'up' ? n - 1 : n + 1); if (r.ok) { cur = r.step - 1; render(); const nb = panel.querySelector('li[data-i="' + cur + '"] [data-tb="' + a + '"]:not([disabled])'); if (nb) /** @type {HTMLElement} */ (nb).focus(); } return; }
  if (a === 'remove') {
    const s = draft.steps[i]; if (!s) return;
    if (hasText(s) && !window.confirm(t('Delete step ' + n + '? Its words will be lost.', 'ステップ ' + n + ' を削除しますか？ 書いた文は失われます。'))) return;
    removeStep(n); cur = -1; return;
  }
  if (a === 'copy') { await copyLink(); return; }
  if (a === 'account') { const r = saveToAccount(); if (!r.ok) say(reasonText(r)); return; }
  if (a === 'share') { await nativeShare(); return; }
  if (a === 'clear') { if (window.confirm(t('Delete this draft tour? This cannot be undone.', 'この下書きのツアーを削除しますか？ 元に戻せません。'))) { cur = -1; said = { text: '', url: '' }; clearDraft(); } }
}
function onInput(e) {
  const el = e.target; const f = el && el.getAttribute && el.getAttribute('data-tb-f'); if (!f) return;
  if (f === 'tour') draft.title = el.value;
  else { const s = draft.steps[+el.getAttribute('data-i')]; if (s) s[f] = el.value; }
  changed(false);
}
function onKey(e) { if (e.key === 'Escape' && !(e.target && e.target.closest && e.target.closest('.tb-said'))) { e.stopPropagation(); closeBuilder(); } }
function focusStep(i) { try { const el = panel.querySelector('li[data-i="' + i + '"] input'); if (el) { /** @type {HTMLElement} */ (el).focus({ preventScroll: false }); el.scrollIntoView({ block: 'nearest' }); } } catch (_) { } }

/* ══ THE PUBLIC FACE ═════════════════════════════════════════════════════════════════════════════ */
/** open the panel. `opts.load` — a tour ({ title, steps: [{ title, say, ask, hash }] }) to edit: it becomes the
    draft, after the author agrees when it would replace a different draft with steps in it (`opts.replace`
    true skips the question — Atlas asks in words first). → { ok, loaded, steps } */
export function openBuilder(opts) {
  opts = opts || {};
  let loaded = false;
  if (opts.load) {
    const inc = { title: str(opts.load.title), steps: (opts.load.steps || []).map((s) => ({ id: newId(), title: str(s.title), say: str(s.say), ask: str(s.ask), hash: s.hash ? str(s.hash) : null })) };
    const ok = !draft.steps.length || sameTour(draft, inc) || opts.replace
      || window.confirm(t('Replace the tour you are writing (' + draft.steps.length + ' steps) with this one?', '作成中のツアー（' + draft.steps.length + ' ステップ）をこのツアーで置き換えますか？'));
    if (ok) { draft = inc; loaded = true; cur = -1; writeDraft(); }
  }
  style();
  if (!panel) {
    panel = document.createElement('section'); panel.id = 'im-tour-builder';
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', 'im-tour-builder-h');
    panel.addEventListener('click', onClick); panel.addEventListener('input', onInput); panel.addEventListener('keydown', onKey);
    document.body.appendChild(panel);
  }
  panel.classList.remove('tb-folded');
  render();
  try { const f = /** @type {HTMLElement|null} */ (panel.querySelector(draft.title ? '[data-tb="add"]' : '.tb-name')); if (f) f.focus({ preventScroll: true }); } catch (_) { }
  return { ok: true, loaded, steps: draft.steps.length };
}
function closeBuilder() { clearTimeout(meterTimer); if (panel) { panel.remove(); panel = null; } said = { text: '', url: '' }; return true; }
export function isOpen() { return !!panel; }
