/* ============================================================================
 *  IntMap · THE CLASSROOM MODE — a tour played on the map, full screen   (js/tour-player.js)
 * ----------------------------------------------------------------------------
 *  「教員が登録なしで 1 コマを回せるツアー」 (classroom-tours). The declarations are js/tours.js; this is
 *  the player. A tour runs in the CLASSROOM MODE: everything but the map, its legends and its credits
 *  is put away, and a panel at the foot of the screen shows the step's title, the sentences for the
 *  teacher to read out and the question for the class, in type large enough for a projector. Next /
 *  Previous move through the steps — with the buttons, the arrow keys, Space, Page Up / Page Down (what
 *  a presentation clicker sends) — and Esc leaves.
 *
 *  ── WHO LOADS THIS FILE (none of them at a normal start-up) ─────────────────────────────────
 *    · src/main.js, when the page was opened with `?tour=<id>` (js/tours.js tourFromSearch), and when
 *      the Settings entry #btn-tours is pressed;
 *    · Atlas's `panel.tour` (js/atlas-cap-panel.js), inside the lazy Atlas kernel.
 *
 *  ── HOW A STEP IS OPENED: THE SHARE LINK'S OWN RESTORE, AND NOTHING ELSE ─────────────────────
 *  A step is a share link (js/tours.js — the app's own encoding, captured from the app). Opening it is
 *  what pasting it does: the address takes the link and `IntMapBookmark.restore({shared:true})`
 *  (js/map-ui.js) applies the whole state it names — camera, projection, base map, layers on AND off,
 *  the clock (a link with no instant is «now»), compare, the simulators. There is no second restorer
 *  here to drift from that one. The query keeps `?tour=<id>&step=<n>`, so the address bar is always a
 *  link to this step of this tour (js/map-ui.js save() keeps the query when it rewrites the fragment).
 *  ⚠ The step is reported «shown» only once the map SAYS so: the clock and the layer boxes are read
 *  back against the link's own `tt` and `l` (`settled`, below) — the same reading Atlas's
 *  `panel.showcase` makes — never assumed from the call having returned.
 *
 *  ── A TOUR ATLAS ASSEMBLES ───────────────────────────────────────────────────────────────────
 *  `addStep` takes the map AS IT IS NOW (`IntMapBookmark.link()` — the same encoder) with a title,
 *  the words and a question, onto a temporary tour kept for this tab (sessionStorage), which plays in
 *  the same mode. Atlas sets the map up with its own capabilities and then records it; it never
 *  writes a link.
 *
 *  ── A TOUR A READER WROTE: `?tour=custom&t=…` (tour-builder) ─────────────────────────────────
 *  js/tour-builder.js writes a tour into its own address (js/tours.js encodeCustomTour); this player
 *  reads it back (`tourFor('custom')`, from `opts.t` or the page's query) and plays it in THIS mode —
 *  the same panel, keys and read-back as a declared tour, nothing copied. Each step's fragment is written
 *  again by the map's codec before it reaches the address bar. The list of tours offers «Make your own
 *  tour», and a written (or Atlas-assembled) tour that is playing offers «Edit this tour».
 *
 *  ── THE WORKSHEET (sales-next) ───────────────────────────────────────────────────────────────
 *  The panel's printer button (and Atlas's `panel.tourWorksheet`) hands the tour that is playing to
 *  js/tour-worksheet.js, which walks its steps through THIS player (`go`, the same read-back) and puts
 *  each step's map on paper. `playingTour()` is what it reads: the words as the reader's language has them.
 *
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7).
 *  ⚠ No `window` global is published: the readers import this file by name.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { TOURS, tourById, tourSteps, tourQuery, tourFromSearch, CUSTOM_TOUR_ID, decodeCustomTour, GUIDE_TOUR_ID, guideTour } from './tours.js';
import { MapState } from './map-state.js';   /* the map's state and the address bar's one door (js/map-state.js) */
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the encoder every string below is written with */
import { icon } from './icons.js';

/* the reader's language, as the app holds it (js/i18n.js) */
function lang() { try { return window.IntMapI18N.lang(); } catch (_) { return 'en'; } }
const t = (en, jp) => IntMapLang.t(lang(), en, jp);
/** a text that is an LA(en, jp) tuple (a declared tour) or a plain string (a tour Atlas assembled) */
const txt = (v) => (Array.isArray(v) ? IntMapLang.t(lang(), v[0], v[1]) : String(v == null ? '' : v));
const H = (s) => globalThis.IntMapSafe.html(s);
/* the share link's writer and restorer (js/map-ui.js) — published on window once the map has booted, exported by nobody */
const BM = () => window.IntMapBookmark || null;

/* ══ THE CLASSROOM MODE'S STYLESHEET — a list of what STAYS, as js/embed-mode.js's is ═══════════
   Kept: the map (with the renderer's credit line inside it), the legends (.data-legend / .koppen-legend
   — js/data-layers.js discoverLegends()'s «a legend»), the app's credit bar (#map-credit), the app's one
   notice (#ai-toast — js/notify.js: a layer that could not load still says so) and this file's panel. Everything else is hidden by NOT being on that list, so a panel added next year is hidden in
   the classroom without anyone remembering to say so. ⚠ The credits stay on purpose and may not be
   trimmed: the data's licences require them wherever it is drawn (a projector included). Lives here,
   not in css/intmap.css, so a normal start-up never parses it. */
export const CLASSROOM_CSS = [
  'html[data-classroom] body > *:not(.operation-room):not(#im-tour):not(#im-tour-picker):not(#im-worksheet):not(#ai-toast){display:none !important;}',
  'html[data-classroom] .operation-room > *:not(.map-column){display:none !important;}',
  'html[data-classroom] .map-column > *:not(.map-container):not(#map-credit){display:none !important;}',
  'html[data-classroom] .map-container > *:not(#map):not(.data-legend):not(.koppen-legend){display:none !important;}',
  'html[data-classroom]{--peek-h:0px;--sheet-cover:0px;}',
  'html[data-classroom] .operation-room,html[data-classroom] .map-column{height:100dvh !important;}',
  'html[data-classroom] .map-column{width:100% !important;margin:0 !important;display:flex !important;flex-direction:column !important;}',
  'html[data-classroom] .map-column > .map-container{position:relative !important;inset:auto !important;width:100% !important;height:auto !important;flex:1 1 auto !important;min-height:0 !important;}',
  /* the panel: the foot of the screen, above the map's overlays and below anything modal (css/intmap.css --z-*) */
  '#im-tour{position:fixed;left:50%;bottom:calc(var(--credit-h,23px) + 14px);transform:translateX(-50%);z-index:var(--z-front);width:min(1100px,calc(100vw - 28px));box-sizing:border-box;padding:18px 22px 16px;border-radius:22px;background:color-mix(in srgb,var(--card-bg) 94%,transparent);color:var(--text-main);border:1px solid var(--glass-border,rgba(128,128,128,0.2));box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);font-size:clamp(15px,0.9vw + 9px,26px);line-height:1.45;}',
  '#im-tour .imt-top{display:flex;align-items:center;gap:10px;font-size:0.68em;color:var(--text-muted);font-weight:600;letter-spacing:0.01em;}',
  '#im-tour .imt-top .imt-tour{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
  '#im-tour .imt-when{flex:0 0 auto;padding:2px 9px;border-radius:999px;background:var(--input-bg);color:var(--text-main);font-variant-numeric:tabular-nums;}',
  '#im-tour h2{margin:6px 0 4px;font-size:1.32em;line-height:1.2;font-weight:700;letter-spacing:-0.01em;}',
  '#im-tour .imt-say{margin:0;}',
  '#im-tour .imt-ask{margin:12px 0 0;padding:10px 14px;border-radius:14px;background:color-mix(in srgb,var(--primary-color) 12%,transparent);}',
  '#im-tour .imt-ask b{display:block;font-size:0.68em;color:var(--primary-color);letter-spacing:0.02em;}',
  '#im-tour .imt-nav{display:flex;align-items:center;gap:10px;margin-top:14px;font-size:0.72em;}',
  '#im-tour .imt-dots{flex:1 1 auto;display:flex;gap:7px;align-items:center;justify-content:center;flex-wrap:wrap;}',
  '#im-tour .imt-dot{width:11px;height:11px;padding:0;border:none;border-radius:50%;background:rgba(128,128,128,0.35);cursor:pointer;}',
  '#im-tour .imt-dot[aria-current="step"]{background:var(--primary-fill);transform:scale(1.25);}',
  '#im-tour button.imt-b{min-height:44px;padding:0 18px;border-radius:12px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font:inherit;font-weight:600;cursor:pointer;}',
  '#im-tour button.imt-b.imt-next{background:var(--primary-fill);border-color:transparent;color:#fff;}',
  '#im-tour button.imt-b:disabled{opacity:0.4;cursor:default;}',
  '#im-tour button.imt-b:focus-visible,#im-tour .imt-dot:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px;}',
  '#im-tour .imt-tools{flex:0 0 auto;display:flex;gap:4px;margin:-6px -8px -6px 0;}',
  '#im-tour .imt-tools button{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:none;border-radius:10px;background:transparent;color:var(--text-muted);font-size:17px;cursor:pointer;}',
  '#im-tour .imt-tools button:hover{background:var(--input-bg);color:var(--text-main);}',
  '#im-tour.imt-folded .imt-body{display:none;}',
  '#im-tour .imt-keys{margin-top:8px;font-size:0.58em;color:var(--text-muted);text-align:center;}',
  '#im-tour .imt-wait{opacity:0.55;}',
  /* the picker: a modal list of the tours */
  '#im-tour-picker{position:fixed;inset:0;z-index:var(--z-modal);display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);}',
  '#im-tour-picker .imtp-scrim{position:absolute;inset:0;}',
  '#im-tour-picker .imtp-box{position:relative;width:min(560px,calc(100vw - 28px));max-height:calc(100dvh - 40px);overflow:auto;box-sizing:border-box;padding:22px;border-radius:22px;background:var(--card-bg);color:var(--text-main);box-shadow:var(--shadow);}',
  '#im-tour-picker h2{margin:0 0 4px;font-size:20px;}',
  '#im-tour-picker .imtp-sub{margin:0 0 14px;font-size:13px;color:var(--text-muted);}',
  '#im-tour-picker button.imtp-t{display:block;width:100%;text-align:left;margin:0 0 10px;padding:12px 14px;border-radius:14px;border:1px solid rgba(128,128,128,0.22);background:var(--input-bg);color:var(--text-main);font:inherit;cursor:pointer;}',
  '#im-tour-picker button.imtp-t:hover{border-color:var(--primary-color);}',
  '#im-tour-picker .imtp-t b{display:block;font-size:15px;}',
  '#im-tour-picker .imtp-t span{display:block;font-size:12.5px;color:var(--text-muted);margin-top:2px;}',
  '#im-tour-picker button.imtp-make{border-style:dashed;background:transparent;}',
  '#im-tour-picker .imtp-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:6px;font-size:13px;}',
  '#im-tour-picker .imtp-close{min-height:40px;padding:0 16px;border-radius:12px;border:none;background:var(--primary-fill);color:#fff;font:inherit;font-weight:600;cursor:pointer;}',
  '@media (max-width:640px){#im-tour{padding:14px 14px 12px;border-radius:18px;bottom:calc(var(--credit-h,23px) + 8px);}#im-tour .imt-keys{display:none;}}',
].join('\n');

let styled = false;
function style() {
  if (styled) return; styled = true;
  const st = document.createElement('style'); st.id = 'im-tour-css'; st.textContent = CLASSROOM_CSS; document.head.appendChild(st);
}

/* ══ THE STATE OF THE PLAYER ════════════════════════════════════════════════════════════════════ */
const TEMP_KEY = 'intmap_tour_temp';   /* sessionStorage: the tour Atlas assembled in this tab */
/** @type {{ id: string, title: any, steps: any[], temp: boolean } | null} */ let playing = null;
let at = 0;                 /* index into playing.steps */
let before = null;          /* the address the reader had before an in-app start — returned to on exit */
let panel = null, keysOn = false, clockOn = false;

function readTemp() { try { const v = JSON.parse(sessionStorage.getItem(TEMP_KEY) || 'null'); return v && Array.isArray(v.steps) ? v : null; } catch (_) { return null; } }
function writeTemp(v) { try { if (v) sessionStorage.setItem(TEMP_KEY, JSON.stringify(v)); else sessionStorage.removeItem(TEMP_KEY); } catch (_) { } }

/* (tour-builder) a step's fragment written again by the map's codec — '' when it names no map (js/tours.js decodeCustomTour) */
const canon = MapState.canonical;   /* (map-document-unify) the one rule, js/map-state.js */

/** a tour by id — a declared one, 'atlas' (the one assembled in this tab) or 'custom' (a tour a reader wrote,
    carried by its own address: `t` from `opts`, else from the page's query) — in the player's shape */
async function tourFor(id, opts) {
  const k = String(id || '').toLowerCase();
  if (k === 'atlas') {
    const v = readTemp(); if (!v || !v.steps.length) return null;
    return { id: 'atlas', title: v.title || t('Tour from Atlas', 'Atlas が作ったツアー'), steps: v.steps, temp: true, t: '' };
  }
  if (k === GUIDE_TOUR_ID) {   /* (guide-unify) Settings ▸ Tutorial: the examples marked `guide`, as a tour (js/tours.js guideTour) */
    const g = guideTour(); if (!g.steps.length) return null;
    return { id: g.id, title: g.title, steps: g.steps, temp: false, t: '' };
  }
  if (k === CUSTOM_TOUR_ID) {
    const tt = (opts && opts.t) || ((tourFromSearch(location.search) || {}).t) || '';
    const v = await decodeCustomTour(tt, canon); if (!v) return null;
    return { id: CUSTOM_TOUR_ID, title: v.title || t('Untitled tour', '無題のツアー'), steps: v.steps, temp: false, custom: true, t: tt };
  }
  const d = tourById(id); if (!d) return null;
  return { id: d.id, title: d.title, steps: tourSteps(d), temp: false, t: '' };
}

/* ══ WHAT A LINK ASKS FOR, AND WHETHER THE MAP NOW SAYS IT ═══════════════════════════════════════
   Read from the link itself — `tt` (or none: «now») and `l` — so a step Atlas recorded is held to its
   link exactly as a declared one is. → { at, layers } */
export function wantOf(hash) {
  const q = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  const tt = q.get('tt');
  return { at: tt ? decodeURIComponent(tt) : null, layers: (q.get('l') || '').split(',').filter(Boolean) };
}
function holds(want) {
  try {
    const st = IntMapTime.state();
    const timeOk = want.at == null ? !!st.isLive : (!st.isLive && st.iso === want.at);
    const off = want.layers.filter((id) => { const cb = /** @type {HTMLInputElement|null} */ (document.getElementById(id)); return !(cb && cb.checked); });
    return { timeOk, off };
  } catch (_) { return { timeOk: false, off: want.layers.slice() }; }
}
/* The restore applies the layer boxes at +700 / +1800 / +3200 ms and the clock at +900 (js/map-ui.js
   restore()); 6 s is its last pass plus room for a busy page — the same bound Atlas's panel.showcase
   waits. It returns the moment the map agrees: a bound, not a sleep. */
const SETTLE_MS = 6000;
async function settled(hash) {
  const want = wantOf(hash); let m = holds(want); const t0 = Date.now();
  while (!(m.timeOk && !m.off.length) && Date.now() - t0 < SETTLE_MS) { await new Promise((r) => setTimeout(r, 250)); m = holds(want); }
  return { ok: m.timeOk && !m.off.length, timeOk: m.timeOk, off: m.off };
}

/* the share link's restorer — it exists once js/map-ui.js has booted the map */
async function bookmark() {
  const t0 = Date.now();
  while (!(BM() && BM().restore) && Date.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 200));
  return BM();
}

/* ══ OPENING A STEP ══════════════════════════════════════════════════════════════════════════════ */
let gen = 0;   /* a newer step supersedes the read-back of an older one (Next pressed twice quickly) */
async function show(i, opts) {
  if (!playing) return { ok: false, reason: 'no-tour' };
  const n = Math.max(0, Math.min(playing.steps.length - 1, i | 0));
  at = n; const st = playing.steps[n]; const my = ++gen;
  paint(true);
  if (!st || !st.hash) { paint(false); return { ok: false, reason: 'no-link' }; }
  const B = await bookmark(); if (!B) { paint(false); return { ok: false, reason: 'no-map' }; }
  if (my !== gen) return { ok: false, reason: 'superseded' };
  /* the address becomes the step's link — the query (a page field, not map state) names the tour and the step,
     the fragment is the map. A page opened on a tour's own address already carries the step's link, and the
     boot restore is applying it (MapState.carriesState): it is not applied a second time. */
  const already = !!(opts && opts.fromBoot) && MapState.carriesState();
  MapState.address(tourQuery(playing.id, n + 1, playing.t), st.hash);
  if (!already) { try { B.restore({ shared: true }); } catch (e) { paint(false); return { ok: false, reason: String(e && e.message || e) }; } }
  const r = await settled(st.hash);
  if (my === gen) paint(false);
  return { ...r, step: n + 1, of: playing.steps.length };
}

/* ══ THE PANEL ═══════════════════════════════════════════════════════════════════════════════════ */
function instantText() {
  try {
    if (IntMapTime.isLive()) return t('Today', '今日');
    const d = IntMapTime.get(); if (!d) return '';
    const HS = window.IntMapHistScale;   /* js/hist-scale.js dateText owns the era rule below year 1 */
    return HS && HS.dateText ? HS.dateText(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), IntMapLang.htmlTag(lang())) : IntMapTime.iso();
  } catch (_) { return ''; }
}
function paint(waiting) {
  if (!playing || !panel) return;
  const st = playing.steps[at] || {}; const N = playing.steps.length;
  const dots = playing.steps.map((_, k) => '<button type="button" class="imt-dot" data-imt-go="' + k + '" aria-label="' + H(t('Step ', 'ステップ ') + (k + 1)) + '"' + (k === at ? ' aria-current="step"' : '') + '></button>').join('');
  const tools = '<span class="imt-tools">'
      /* (tour-builder) a tour a reader wrote, or the one Atlas assembled, can be opened in the tour builder */
      + (playing.custom || playing.temp ? '<button type="button" data-imt="edit" title="' + H(t('Edit this tour', 'このツアーを編集')) + '" aria-label="' + H(t('Edit this tour', 'このツアーを編集')) + '">' + icon('pencil', { size: 17 }) + '</button>' : '')
      /* (sales-next) the tour on paper: each step's map, its question and lines to answer on (js/tour-worksheet.js) */
      + '<button type="button" data-imt="sheet" title="' + H(t('Printable worksheet', '印刷用ワークシート')) + '" aria-label="' + H(t('Printable worksheet', '印刷用ワークシート')) + '">' + icon('printer', { size: 17 }) + '</button>'
      + '<button type="button" data-imt="fold" title="' + H(t('Hide the text (T)', '文を隠す（T）')) + '" aria-label="' + H(t('Hide the text', '文を隠す')) + '">' + (panel.classList.contains('imt-folded') ? '▴' : '▾') + '</button>'
      + '<button type="button" data-imt="full" title="' + H(t('Full screen (F)', '全画面（F）')) + '" aria-label="' + H(t('Full screen', '全画面')) + '">⛶</button>'
      + '<button type="button" data-imt="exit" title="' + H(t('Leave the tour (Esc)', 'ツアーを終える（Esc）')) + '" aria-label="' + H(t('Leave the tour', 'ツアーを終える')) + '">×</button></span>';
  panel.innerHTML = '<div class="imt-top"><span class="imt-tour">' + H(txt(playing.title)) + ' · ' + H(t('Step ', 'ステップ ') + (at + 1) + ' / ' + N) + '</span><span class="imt-when">' + H(instantText()) + '</span>' + tools + '</div>'
    + '<div class="imt-body' + (waiting ? ' imt-wait' : '') + '">'
      + (st.title ? '<h2>' + H(txt(st.title)) + '</h2>' : '')
      + (st.say ? '<p class="imt-say">' + H(txt(st.say)) + '</p>' : '')
      + (st.ask ? '<p class="imt-ask"><b>' + H(t('Question for class', '授業での問い')) + '</b>' + H(txt(st.ask)) + '</p>' : '')
    + '</div>'
    + '<div class="imt-nav"><button type="button" class="imt-b" data-imt="prev"' + (at <= 0 ? ' disabled' : '') + '>← ' + H(t('Previous', '前へ')) + '</button>'
      + '<span class="imt-dots">' + dots + '</span>'
      + (at < N - 1 ? '<button type="button" class="imt-b imt-next" data-imt="next">' + H(t('Next', '次へ')) + ' →</button>'
        : '<button type="button" class="imt-b imt-next" data-imt="exit">' + H(t('Finish', '終わる')) + '</button>') + '</div>'
    + '<div class="imt-keys">' + H(t('← → or Space to move · F full screen · T hide the text · Esc to leave', '← → またはスペースで移動 · F 全画面 · T 文を隠す · Esc で終了')) + '</div>';
  panel.setAttribute('aria-label', txt(playing.title));
}
function onPanelClick(e) {
  const b = e.target && e.target.closest ? e.target.closest('[data-imt],[data-imt-go]') : null; if (!b) return;
  const go = b.getAttribute('data-imt-go'); if (go != null) { show(+go); return; }
  const a = b.getAttribute('data-imt');
  if (a === 'next') next(); else if (a === 'prev') prev(); else if (a === 'exit') exit();
  else if (a === 'fold') fold(); else if (a === 'full') fullscreen();
  else if (a === 'edit') editInBuilder();
  else if (a === 'sheet') import('./tour-worksheet.js').then((m) => m.makeWorksheet()).catch(() => { });
}
/* (tour-builder) leave the classroom mode and hand the tour that was playing to the builder, step by step
   (its links and words exactly as they were played) — the builder asks before it replaces a draft */
function editInBuilder() {
  if (!playing) return;
  const tour = { title: txt(playing.title), steps: playing.steps.map((s) => ({ title: txt(s.title), say: txt(s.say), ask: txt(s.ask), hash: s.hash || null })) };
  exit();
  import('./tour-builder.js').then((m) => m.openBuilder({ load: tour })).catch(() => { });
}
function fold() { if (!panel) return; panel.classList.toggle('imt-folded'); paint(false); }
function fullscreen() {
  try {
    if (document.fullscreenElement) { document.exitFullscreen(); return; }
    const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen().catch(() => { });
  } catch (_) { }
}
/* the keys a presentation clicker and a keyboard send. Captured before the app's own shortcuts, and only
   while a tour is playing; a key typed into a field is left alone. */
function onKey(e) {
  if (!playing) return;
  /* (sales-next) the worksheet's preview is open over the tour: its keys (Esc closes it) are its own */
  if (document.documentElement.hasAttribute('data-worksheet')) return;
  const tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName || ''))) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key; let did = true;
  if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) next();
  else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) prev();
  else if (k === 'Home') show(0);
  else if (k === 'End') show(playing.steps.length - 1);
  else if (k === 'Escape') { if (document.fullscreenElement) did = false; else exit(); }
  else if (k === 'f' || k === 'F') fullscreen();
  else if (k === 't' || k === 'T') fold();
  else did = false;
  if (did) { e.preventDefault(); e.stopPropagation(); }
}

function mount() {
  style();
  document.documentElement.setAttribute('data-classroom', '1');
  if (!panel) {
    panel = document.createElement('section'); panel.id = 'im-tour'; panel.setAttribute('role', 'region');
    panel.addEventListener('click', onPanelClick);
    document.body.appendChild(panel);
  }
  if (!keysOn) { keysOn = true; window.addEventListener('keydown', onKey, true); }
  if (!clockOn) { clockOn = true; try { IntMapTime.on(() => { if (playing) { const w = panel && panel.querySelector('.imt-when'); if (w) w.textContent = instantText(); } }); } catch (_) { } }
  try { window.dispatchEvent(new Event('resize')); } catch (_) { }   /* the map column changed size: the renderer re-measures */
}

/* ══ THE PUBLIC FACE ═════════════════════════════════════════════════════════════════════════════ */
/** start a tour (a declared id, 'atlas', or 'custom' — whose text is `opts.t` or the page's own `t`) at step n
    (from 1). → the step's read-back */
export async function startTour(id, n, opts) {
  const tour = await tourFor(id, opts); if (!tour) return { ok: false, reason: String(id || '').toLowerCase() === CUSTOM_TOUR_ID ? 'unreadable-tour' : 'unknown-tour' };
  if (!tour.steps.length) return { ok: false, reason: 'no-steps' };
  if (!playing && !(opts && opts.fromBoot)) { try { before = MapState.link() || null; } catch (_) { before = null; } }
  playing = tour;
  closePicker();
  try { const x = document.getElementById('settings-close-x'); const m = document.getElementById('settings-modal'); if (x && m && getComputedStyle(m).display !== 'none') x.click(); } catch (_) { }
  mount();
  const r = await show(Math.max(1, Math.round(+n || 1)) - 1, opts);
  try { const b = panel && /** @type {HTMLElement|null} */ (panel.querySelector('.imt-nav .imt-next')); if (b) b.focus({ preventScroll: true }); } catch (_) { }
  return r;
}
export function next() { if (!playing) return Promise.resolve({ ok: false, reason: 'no-tour' }); return at < playing.steps.length - 1 ? show(at + 1) : Promise.resolve({ ok: true, step: at + 1, of: playing.steps.length, last: true }); }
export function prev() { if (!playing) return Promise.resolve({ ok: false, reason: 'no-tour' }); return at > 0 ? show(at - 1) : Promise.resolve({ ok: true, step: 1, of: playing.steps.length, first: true }); }
export function go(n) { if (!playing) return Promise.resolve({ ok: false, reason: 'no-tour' }); return show(Math.round(+n || 1) - 1); }
/** leave the classroom mode; a tour started inside the app returns the map to where the reader was */
export function exit() {
  if (!playing) return false;
  playing = null; gen++;
  document.documentElement.removeAttribute('data-classroom');
  if (panel) { panel.remove(); panel = null; }
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (_) { }
  const back = before; before = null;
  try {
    if (back) { MapState.address('', back.slice(back.indexOf('#'))); BM().restore({ shared: true }); }
    else MapState.address('', null);
  } catch (_) { }
  try { window.dispatchEvent(new Event('resize')); } catch (_) { }
  return true;
}
/** what is playing → { id, title, step, of, temp } or null */
export function status() {
  if (!playing) return null;
  const st = playing.steps[at] || {};
  return { id: playing.id, title: txt(playing.title), step: at + 1, of: playing.steps.length, temp: playing.temp, custom: !!playing.custom, stepTitle: st.title ? txt(st.title) : '', ask: st.ask ? txt(st.ask) : '' };
}

/** (sales-next) the tour that is playing, its words in the reader's language — what js/tour-worksheet.js puts on paper.
    `curriculum` is a declared tour's own keys (js/tours.js); a written or assembled tour has none. → object or null */
export function playingTour() {
  if (!playing) return null;
  const d = !playing.temp && !playing.custom ? tourById(playing.id) : null;
  return { id: playing.id, title: txt(playing.title), custom: !!playing.custom, temp: !!playing.temp, t: playing.t || '',
    curriculum: (d && d.curriculum) ? d.curriculum.slice() : [], step: at + 1,
    steps: playing.steps.map((x) => ({ title: x.title ? txt(x.title) : '', say: x.say ? txt(x.say) : '', ask: x.ask ? txt(x.ask) : '', linked: !!x.hash })) };
}

/* ── the tour Atlas assembles: the map as it is now, with words ── */
export function addStep(o) {
  o = o || {};
  if (!BM()) return { ok: false, reason: 'no-map' };
  const hash = MapState.hash(); if (!MapState.carries(hash)) return { ok: false, reason: 'no-link' };
  const v = readTemp() || { title: '', steps: [] };
  if (o.tourTitle) v.title = String(o.tourTitle);
  v.steps.push({ key: 'atlas-' + (v.steps.length + 1), title: String(o.title || ''), say: String(o.say || ''), ask: String(o.ask || ''), hash });
  writeTemp(v);
  return { ok: true, count: v.steps.length, hash };
}
/* (tour-builder) js/tour-builder.js reads the language, escapes and reaches the map through these — the player's own
   edges to the globals — rather than opening a second edge to each (scripts/global-surface.mjs counts them) */
export function readerLang() { return lang(); }
export function escapeHtml(s) { return H(s); }
export function mapReady() { const B = BM(); return !!(B && B.restore); }
/** put one fragment the codec wrote on the map: the address takes it and the share link's own restore applies it */
export function openLink(hash) {
  const B = BM(); if (!B || !B.restore) return { ok: false, reason: 'no-map' };
  MapState.address(null, hash);
  try { B.restore({ shared: true }); } catch (e) { return { ok: false, reason: String(e && e.message || e) }; }
  return { ok: true };
}
export function tempTour() { return readTemp(); }
export function clearTemp() { writeTemp(null); if (playing && playing.temp) exit(); return true; }
export function declaredTours() { return TOURS; }

/* ══ THE PICKER — the Settings entry's list of tours ═════════════════════════════════════════════ */
function closePicker() { const p = document.getElementById('im-tour-picker'); if (p) p.remove(); }
export function openPicker() {
  style(); closePicker();
  const v = readTemp();
  /* (guide-unify) the first choice: the first look at IntMap, made from the example maps (js/tours.js guideTour) — not a lesson, so not in TOURS */
  const g = guideTour();
  const guideRow = g.steps.length ? '<button type="button" class="imtp-t" data-imtp="' + H(g.id) + '"><b>' + H(txt(g.title)) + '</b><span>' + H(t('A short tour of example maps, one question each · ' + g.steps.length + ' steps', '例の地図をめぐる短いツアーです。各段に問いが付きます · ' + g.steps.length + ' ステップ')) + '</span></button>' : '';
  const rows = guideRow + TOURS.map((d) => '<button type="button" class="imtp-t" data-imtp="' + H(d.id) + '"><b>' + H(txt(d.title)) + '</b><span>' + H(txt(d.blurb)) + ' · ' + H(t(d.steps.length + ' steps', d.steps.length + ' ステップ')) + '</span></button>').join('')
    + (v && v.steps.length ? '<button type="button" class="imtp-t" data-imtp="atlas"><b>' + H(v.title || t('Tour from Atlas', 'Atlas が作ったツアー')) + '</b><span>' + H(t(v.steps.length + ' steps, made in this tab', 'このタブで作った ' + v.steps.length + ' ステップ')) + '</span></button>' : '')
    /* (tour-builder) the way to a tour of one's own: the builder, which keeps its draft in this browser */
    + '<button type="button" class="imtp-t imtp-make" data-imtp-make="1"><b>' + H(t('Make your own tour', '自分のツアーを作る')) + '</b><span>'
      + H(t('Add the map as it is now as a step, write what to say, and share the tour as a link. No account needed.', 'いまの地図をステップとして加え、語りと問いを書いて、ツアーをリンクで共有します。アカウントは要りません。')) + '</span></button>';
  const box = document.createElement('div'); box.id = 'im-tour-picker'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t('Classroom tours', '授業ツアー'));
  /* the scrim behind the list closes it on a click; it is presentational (aria-hidden) — its keyboard
     equivalents are Esc and the Close button (scripts/keyboard-reach.mjs's rule) */
  box.innerHTML = '<div class="imtp-scrim" aria-hidden="true"></div><div class="imtp-box"><h2>' + H(t('Classroom tours', '授業ツアー')) + '</h2>'
    + '<p class="imtp-sub">' + H(t('A lesson as a sequence of maps, with words to read out and a question for the class. Full screen, for a projector; no account needed.', '地図を順にたどる授業の進行表です。読み上げる文と生徒への問いが付き、プロジェクター向けの全画面で進みます。アカウントは要りません。')) + '</p>'
    + rows + '<div class="imtp-foot"><span>' + H(t('← → or Space to move · Esc to leave', '← → またはスペースで移動 · Esc で終了')) + '</span><button type="button" class="imtp-close">' + H(t('Close', '閉じる')) + '</button></div></div>';
  box.querySelector('.imtp-scrim').addEventListener('click', closePicker);
  box.querySelector('.imtp-close').addEventListener('click', closePicker);
  box.querySelectorAll('button[data-imtp]').forEach((b) => b.addEventListener('click', () => { startTour(b.getAttribute('data-imtp'), 1); }));
  box.querySelectorAll('button[data-imtp-make]').forEach((b) => b.addEventListener('click', () => { closePicker(); import('./tour-builder.js').then((m) => m.openBuilder()).catch(() => { }); }));
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePicker(); } });
  document.body.appendChild(box);
  try { /** @type {HTMLElement} */ (box.querySelector('.imtp-t')).focus(); } catch (_) { }
  return true;
}

/* ══ `?tour=<id>&step=<n>` ═══════════════════════════════════════════════════════════════════════ */
export function bootFromUrl() {
  const q = tourFromSearch(location.search); if (!q) return Promise.resolve(null);
  /* a tour this build does not have is not a silent nothing: the reader is shown the tours there are */
  /* a written tour (`?tour=custom&t=…`) whose text cannot be read is the same: the list, not a blank screen */
  const go2 = async () => ((await tourFor(q.id, { t: q.t })) ? startTour(q.id, q.step, { fromBoot: true, t: q.t }) : (openPicker(), { ok: false, reason: 'unknown-tour' }));
  if (document.readyState === 'loading') return new Promise((r) => document.addEventListener('DOMContentLoaded', () => r(go2()), { once: true }));
  return go2();
}
