/* ============================================================================
 *  IntMap · THE PHONE SHEET'S HOME — what a first pull of the sheet shows   (js/start-home.js · wave4-ux-mobile)
 * ----------------------------------------------------------------------------
 *  MEASURED before this file (390 × 844, a first visit, the built app): the two gestures a newcomer makes first are
 *  «pull the sheet up» and «tap the field». The field already led somewhere — «Here, now», «Photo's place», the day's
 *  map and the example maps (js/search-geocode.js). The pull led to the desktop header and the default widget board:
 *  a clock, a USD/EUR rate, a «Featured layer» and a country card. Nothing on it said what IntMap is for — today's
 *  world live, and any year of the past — so the promise of about.html and of the installed app's own description was
 *  one wrong guess away on the most natural iOS gesture there is.
 *
 *  So, on a phone, the sheet's home (the state with no tab chosen) opens with the starts, and the board follows:
 *    · «Live now» — a switch per live layer (below), one tap shows it and lowers the sheet onto the map — first,
 *      because it is the one start that needs nothing from the reader (no position, no choice of year);
 *    · «Where you are» — js/here-entry.js entryRow, the same two rows the field's empty state holds;
 *    · the day's map and the example maps / classroom tours — js/showcase-gallery.js showInResults, the field's own
 *      strip, opened by the same `choose` (a card is an answer on the map: the sheet comes down);
 *    · «IntMap on your Home Screen» — the install entry of Settings (js/installable-app.js), offered only where the
 *      browser can act on it (a held prompt) or where the one sentence says how (iOS Safari). An installed app sees nothing.
 *
 *  ══ NOTHING OPENS ITSELF ══════════════════════════════════════════════════════════════════════════════════════
 *  The first-visit welcome card was withdrawn at the reader's request (#R104) and a first visit is the whole map
 *  (dev-notes/2026-10-03-first-impression.md). This is not that card: it is drawn INSIDE the sheet, below its head, and
 *  this file is not even fetched until the reader raises the sheet above its lowest stop (js/mobile-ui.js setDetent).
 *  At `min` the sheet is the search row, exactly as before.
 *
 *  ══ «LIVE NOW» IS DERIVED, NEVER LISTED (`liveStarts`) ══════════════════════════════════════════════════════════
 *  A layer is a live start when three owners say so: its time declaration says it describes NOW (js/layer-time-decl.js
 *  `kind:'live'`), the layer panel shows it unfolded (js/layer-manifest.js — not `rest`, not the beta shelf, not hidden)
 *  and the panel has built its row (js/map-ui.js IntMapLayerSidebar.rows — the name is the one its tile shows).
 *  A new live layer, or one the panel unfolds, is here the day it is declared. The switch is the row's own checkbox,
 *  turned through the OS command every other door uses (`layer.on` / `layer.off`); its state is re-read whenever the
 *  map state store says the toggles moved (js/map-state.js) or a row's request is reported (js/layer-state.js — a refused
 *  layer unticks its own box), so Atlas, a legend's ×, a shared link or a refusal cannot leave a stale switch behind.
 *
 *  ══ WHERE IT LIVES ═══════════════════════════════════════════════════════════════════════════════════════════
 *  `.m-home` is the home's one scroller: the starts, then #widget-board LENT into it (the board keeps its owner,
 *  its id, its render and its show/hide — js/widgets.js writes `display` on the board, and css shows `.m-home` only
 *  while the board is shown, i.e. while no tab is chosen). Widening the window hands the board back (`unmountStart`).
 *  IntMap-authored strings are en + jp (CONSTITUTION.md §7). No emoji: the live mark is a CSS dot.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { LAYERS, BETA, HIDDEN } from './layer-manifest.js';
import { TIME } from './layer-time-decl.js';
import { MapState } from './map-state.js';
import { layerState } from './layer-state.js';   /* what became of a row's request — a refused layer unticks its own box */
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';   /* «an answer is on the map» — the phone's sheet comes down */
import * as bus from './bus.js';
import { installState, promptInstall, onInstallChange } from './installable-app.js';
import { entryRow } from './here-entry.js';
import './safe-html.js';

const lang = () => { try { return window.IntMapI18N.lang(); } catch (_) { return 'en'; } };
const t = IntMapLang.pick(() => lang());
const H = (s) => globalThis.IntMapSafe.html(s);

/* ══ THE PURE HALF ══════════════════════════════════════════════════════════════════════════════════════════════ */
/**
 * The live starts, in the panel's order.
 * @param {ReadonlyArray<{id:string, shelf:string, kind?:string, rest?:boolean}>} layers  js/layer-manifest.js LAYERS
 * @param {Readonly<Record<string,{kind:string}>>} time  js/layer-time-decl.js TIME
 * @param {ReadonlyArray<{id:string, name:string}>} rows  the panel's built rows (IntMapLayerSidebar.rows())
 * @returns {{id:string, name:string}[]}
 */
export function liveStarts(layers, time, rows) {
  const name = new Map((rows || []).map((r) => [r.id, r.name]));
  return (layers || []).filter((l) => l.shelf !== BETA && l.shelf !== HIDDEN && !l.rest && l.kind !== 'display'
    && time[l.id] && time[l.id].kind === 'live' && name.get(l.id))
    .map((l) => ({ id: l.id, name: /** @type {string} */ (name.get(l.id)) }));
}

/* ══ THE DOOR TO THE ROWS AND THE COMMANDS ═══════════════════════════════════════════════════════════════════════ */
const panelRows = () => { try { const S = window.IntMapLayerSidebar; return (S && S.rows) ? S.rows() : []; } catch (_) { return []; } };
const boxOf = (id) => { const cb = /** @type {HTMLInputElement|null} */ (document.getElementById(id)); return cb && cb.type === 'checkbox' ? cb : null; };
function turn(id, on) {
  try { const OS = window.IntMapOS; if (OS && OS.exec) return OS.exec(on ? 'layer.on' : 'layer.off', { source: 'ui', params: { id } }); } catch (_) { /* below */ }
  return { ok: false };
}

/* ══ THE STYLE — iOS grouped content, the gallery strip's own type scale ══════════════════════════════════════════ */
const CSS = [
  '.m-home{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}',
  /* the board's owner hides it while a tab is chosen; the home goes with it (the owner\'s display is the one answer) */
  '.m-home:has(> #widget-board[style*="display: none"]), .m-home:not(:has(> #widget-board)){display:none;}',
  '.m-home > #widget-board{flex:0 0 auto;overflow:visible;margin-right:0;padding-right:0;}',
  '.sh-start{display:flex;flex-direction:column;gap:18px;padding:2px 0 20px;}',
  '.sh-start .hn-entry{padding:0;}',
  '.sh-start .sg-strip{padding:0;}',
  '.sh-start .otd-slot:empty{display:none;}',
  /* the strip's own text buttons are drawn for a pointer; in the sheet every target answers a finger at 44 px (docs/architecture/09-mobile.md §9.2) */
  '.sh-start .sg-all,.sh-start .otd-all{min-height:44px;}',
  '.sh-h{display:flex;align-items:center;gap:7px;margin:0 2px 8px;font-size:12px;font-weight:600;color:var(--text-muted);letter-spacing:0.01em;}',
  '.sh-dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:#ff3b30;box-shadow:0 0 0 3px rgba(255,59,48,0.18);}',
  '.sh-live-row{display:flex;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding:0 0 4px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}',
  '.sh-live-row::-webkit-scrollbar{display:none;}',
  '.sh-chip{flex:0 0 auto;scroll-snap-align:start;display:inline-flex;align-items:center;min-height:44px;max-width:15.5em;padding:0 15px;border:1px solid rgba(128,128,128,0.2);border-radius:22px;background:var(--input-bg);color:var(--text-main);font:inherit;font-size:13.5px;font-weight:600;line-height:1.2;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}',
  '.sh-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
  '.sh-chip[aria-pressed="true"]{background:var(--primary-fill);border-color:var(--primary-color);color:#fff;}',
  '.sh-chip:active{transform:scale(0.97);}',
  '.sh-chip:focus-visible,.sh-inst button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px;}',
  '.sh-inst{display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid rgba(128,128,128,0.18);border-radius:14px;background:var(--input-bg);}',
  '.sh-inst b{font-size:14px;font-weight:650;line-height:1.25;}',
  '.sh-inst p{margin:0;font-size:12.5px;line-height:1.4;color:var(--text-muted);}',
  '.sh-inst button{align-self:flex-start;min-height:44px;padding:0 18px;border:none;border-radius:22px;background:var(--primary-fill);color:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer;}',
].join('\n');
let styled = false;
function style() { if (styled) return; styled = true; const st = document.createElement('style'); st.id = 'im-start-home-css'; st.textContent = CSS; document.head.appendChild(st); }

/* ══ THE SECTIONS ═══════════════════════════════════════════════════════════════════════════════════════════════ */
function drawLive(box) {
  const starts = liveStarts(LAYERS, TIME, panelRows());
  if (!starts.length) { box.hidden = true; box.innerHTML = ''; return false; }
  box.hidden = false;
  box.innerHTML = '<div class="sh-h" id="sh-live-h"><span class="sh-dot" aria-hidden="true"></span>' + H(t('Live now', 'いまの地球')) + '</div>'
    + '<div class="sh-live-row" role="group" aria-labelledby="sh-live-h">'
    + starts.map((s) => '<button type="button" class="sh-chip" data-sh-live="' + H(s.id) + '" aria-pressed="false"><span>' + H(s.name) + '</span></button>').join('')
    + '</div>';
  syncLive(box);
  return true;
}
/** every switch says what its checkbox says */
function syncLive(box) {
  box.querySelectorAll('[data-sh-live]').forEach((b) => { const cb = boxOf(b.getAttribute('data-sh-live') || ''); b.setAttribute('aria-pressed', cb && cb.checked ? 'true' : 'false'); });
}
function drawInstall(box) {
  const st = installState();
  if (st !== 'prompt' && st !== 'ios') { box.hidden = true; box.innerHTML = ''; return false; }
  box.hidden = false;
  box.innerHTML = '<div class="sh-inst" role="group" aria-labelledby="sh-inst-t"><b id="sh-inst-t">' + H(t('IntMap on your Home Screen', 'ホーム画面に IntMap を')) + '</b>'
    + '<p>' + H(t('Opens full screen, without the browser around the map.', 'ブラウザの枠なしで、地図が全画面で開きます。')) + '</p>'
    + (st === 'prompt'
      ? '<button type="button" data-sh-install>' + H(IntMapLang.keyedText(null, 'installAppBtn', 'Add IntMap as an app')) + '</button>'
      : '<p>' + H(IntMapLang.keyedText(null, 'installAppIos', 'To add IntMap to your Home Screen, tap Share in Safari, then “Add to Home Screen”.')) + '</p>')
    + '</div>';
  return true;
}

/* ══ MOUNT / UNMOUNT ═════════════════════════════════════════════════════════════════════════════════════════════ */
let home = null, board = null, boardHome = null, offs = [];
/** where the home sits: before the board's own place, or (no board yet) before the news feed */
function adoptBoard() {
  const b = document.getElementById('widget-board');
  if (!home || !b || b.parentElement === home) return;
  if (!boardHome && b.parentNode) { boardHome = document.createComment('widget-board home'); b.parentNode.insertBefore(boardHome, b); }
  board = b; home.appendChild(b);
}
function render() {
  if (!home) return;
  const start = /** @type {HTMLElement} */ (home.querySelector('.sh-start'));
  start.replaceChildren();
  const live = document.createElement('section'); live.className = 'sh-live'; start.appendChild(live); drawLive(live);
  start.appendChild(entryRow(null));
  const gal = document.createElement('div'); gal.className = 'sh-gallery'; start.appendChild(gal);
  /* «See all» opens the gallery over the home and leaves the strip where it is (the default empties the search's list) */
  /* fetched when the home is drawn, never with it: the gallery is its own chunk (tests/showcase-gallery-checks ② — nothing imports it
     statically), and the strip fills in when it arrives */
  import('./showcase-gallery.js').then((G) => { if (gal.isConnected) G.showInResults(gal, () => {}); }).catch(() => { /* no strip; the rest of the home stands */ });
  const inst = document.createElement('section'); inst.className = 'sh-install'; start.appendChild(inst); drawInstall(inst);
}

/**
 * Put the home into the phone sheet (idempotent). → the home element, or null where there is nothing to put it in.
 * @param {HTMLElement} sidebar  #sidebar (the sheet)
 */
export function mountStart(sidebar) {
  if (!sidebar) return null;
  if (home && home.isConnected) { adoptBoard(); return home; }
  style();
  home = document.createElement('div');
  home.className = 'm-home'; home.setAttribute('role', 'region'); home.setAttribute('aria-label', t('Start', 'はじめる'));
  const start = document.createElement('div'); start.className = 'sh-start'; home.appendChild(start);
  const b = document.getElementById('widget-board');
  const at = (b && b.parentElement === sidebar) ? b : document.getElementById('live-news-feed');
  if (at && at.parentElement === sidebar) sidebar.insertBefore(home, at); else sidebar.appendChild(home);
  adoptBoard();
  render();
  /* the switches follow the store; the words follow the language; the install row follows what the browser offers */
  const follow = () => { const live = home && home.querySelector('.sh-live'); if (live) { if (!live.querySelector('[data-sh-live]')) drawLive(live); else syncLive(live); } };
  offs.push(MapState.on((e) => { if (e.key === 'toggles') follow(); }));
  /* ⚠ A REFUSED LAYER UNTICKS ITS OWN BOX WITHOUT A change EVENT (measured: the radar row when its host refuses —
     js/layer-pkg-radar.js), so the store never hears it; the row's failure record does, and is told here too. */
  /* …after the reporter has finished its turn: it reports first and unticks the box on the next line */
  offs.push(layerState.on(() => { Promise.resolve().then(follow); }));
  offs.push(bus.on('intmap-lang', () => render()));
  offs.push(onInstallChange(() => { const inst = home && home.querySelector('.sh-install'); if (inst) drawInstall(inst); }));
  home.addEventListener('click', (e) => {
    const el = /** @type {Element} */ (e.target);
    const chip = el && el.closest ? el.closest('[data-sh-live]') : null;
    if (chip) {
      const id = chip.getAttribute('data-sh-live') || ''; const cb = boxOf(id); if (!cb) return;
      const on = !cb.checked;
      const r = turn(id, on);
      if (r && r.ok === false) return;
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      /* a layer switched on is an answer on the map — the sheet comes down onto it; switching one off is not */
      if (on) { try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { /* no sheet */ } }
      return;
    }
    if (el && el.closest && el.closest('[data-sh-install]')) promptInstall();
  });
  return home;
}

/** a re-raise: the board may have been rebuilt, rows may have arrived, a switch may have moved while the sheet was down */
export function refreshStart() {
  if (!home || !home.isConnected) return;
  adoptBoard();
  const live = home.querySelector('.sh-live');
  if (live) { if (!live.querySelector('[data-sh-live]')) drawLive(live); else syncLive(live); }
}

/** the window widened: the board goes back to its own place and the home leaves */
export function unmountStart() {
  offs.splice(0).forEach((off) => { try { if (typeof off === 'function') off(); } catch (_) { /* gone */ } });
  if (board && boardHome && boardHome.parentNode) boardHome.parentNode.insertBefore(board, boardHome);
  if (boardHome) boardHome.remove();
  if (home) home.remove();
  home = null; board = null; boardHome = null;
}
