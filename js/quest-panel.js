/* ============================================================================
 *  IntMap · LEARN QUESTS — the panel   (js/quest-panel.js)   (learn-quests)
 * ----------------------------------------------------------------------------
 *  The questions of js/quest-engine.js, asked on the map: a set of n questions (5 by default), each answered
 *  by acting on the map, each answer shown on it, then the total, the result of every question and a link
 *  that gives the whole class the same set.
 *    · where — tap the city on the map. The answer is drawn: the true place, the tapped point and the great
 *              circle between them (js/geodesy.js — the same formula that gives the kilometres).
 *    · when  — the map is put on the day and at the place of a dated event, the year hidden: every element of
 *              the page that says it prints the map's year or date ([data-prints-map-time]) is hidden by ONE class on <body>
 *              while the question is open. The answer is a year; the reveal takes the class off, so the clock
 *              itself then shows the day the record states.
 *  TODAY'S QUEST (watch-account-product): the menu opens on today's set of each kind (js/quest-engine.js «THE DAY'S SET»),
 *  the streak and the last week (js/quest-daily.js); the first finish of a day's set is recorded — in this browser,
 *  and in the account when signed in — and a replay is practice. The account sheet's «Today's quest» row
 *  (js/auth-ui.js) and Atlas (`learn.daily`) open the same menu and sets.
 *  Doors: the quiz menu (js/analysis-edu.js), Layers ▸ Tools (js/map-ui.js SIM_TOOLS), a challenge link
 *  (`?quest=<kind>.<seed>.<n>` — src/main.js, beside `?tour=`), and Atlas (`learn.quest`, js/atlas-cap-learn.js),
 *  which reads `questState()` after it acts (.agents/rules/one-pass-or-a-reason.md — the observer asks the module).
 *  ⚠ LOADED ON DEMAND: nothing on the start-up path imports this file statically. It publishes no window global
 *  (check:surface); every door reaches it by import(). The map's time and camera are put back when it closes.
 *  IntMap-authored text is en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapTime } from './chronos.js';
import { whenHost } from './host-door.js';
import { MapState } from './map-state.js';
import { loadData } from './data-door.js';
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';
import * as bus from './bus.js';
import './safe-html.js';
import * as OTD from './on-this-day.js';
import { nameItems } from './layer-manifest.js';   /* the display rows that write names — their own declaration (`names`) */
import { makeQuestEngine, QUEST_KIND_IDS, QUEST_DATA, kindTitle, kindNeeds, questQuery, questFromSearch, newSeed, SEED_RE, DAILY_N, dailySeed, isDailySet, parseDay } from './quest-engine.js';
import * as DAILY from './quest-daily.js';   /* (watch-account-product) today's quest — the day's results, the streak, where they are kept */

const GE = () => IntMapGeoEngine;
const H = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));
let HOST = null;
const lang = () => (HOST && HOST.lang) || 'en';
const t = IntMapLang.pick(() => lang());
const pick = (o) => (o ? (lang() === 'jp' ? o.jp : o.en) : '');

/* ══ THE YEAR, HIDDEN — one class on <body>, and what it hides is what SAYS it prints the time ═════════
   The first version hid a list written here (#news-timeline, #m-clock, .dl-clockrow), found by reading. Production
   (2026-10-04) showed the answer anyway: the legend «The map at 1945-03-07» (js/layer-time-kernel.js), the news
   feed of that day, and `tt=` in the address bar — three printers the list did not know. A list of printers rots
   the day a module starts printing the date. So the printer says so: an element whose text names the map's
   instant carries `data-prints-map-time` where it is made (index.html, js/layer-time-kernel.js,
   js/data-layers.js), and the class hides that attribute. The address bar is held, not hidden
   (MapState.holdAddress). `visibility` rather than `display`, so nothing around them moves. */
const BLIND_CLASS = 'im-quest-blind';
const BLIND_ATTR = 'data-prints-map-time';

/** the files the kinds name in `needs`, each read by its own reader: the gazetteer through the data door, the day
 *  index through js/on-this-day.js (that file is the index's one reader) */
const LOADERS = {
  gazetteer: () => loadData(QUEST_DATA.gazetteer),
  onThisDay: () => OTD.loadIndex(),
};
const data = {};
async function need(kind) {
  for (const k of kindNeeds(kind) || []) if (!data[k]) data[k] = await LOADERS[k]();
  return data;
}

/* the engine, with the map's own geodesy (js/geodesy.js — window.IntMapGeodesy, read at the call) */
const geodesy = () => { try { return window.IntMapGeodesy || null; } catch (_) { return null; } };
const engine = makeQuestEngine({
  distanceKm: (a, b) => { const G = geodesy(); return G && G._distKm ? G._distKm(a, b) : null; },
  get halfCircumferenceKm() { const G = geodesy(); return G ? G._HALF_CIRCUM : null; },
});

/* ══ STATE — one quest at a time ═════════════════════════════════════════════════════════════════ */
/** @type {null|{ kind:string, seed:string, n:number, qs:any[], i:number, phase:'ask'|'shown'|'done', results:any[], answer:any, newBest?:boolean,
 *   daily:null|{ day:string, practice:boolean, record?:any } }} */
let Q = null;
let panel = null, saved = null, clickOn = false, langOff = null, menuN = 5;
const SRC = 'quest-answer-src', L_LINE = 'quest-answer-line', L_PT = 'quest-answer-pt';

/** what the panel is doing now — the observer Atlas reads after it acts */
export function questState() {
  const open = !!(panel && panel.isConnected && panel.style.display !== 'none');
  if (!Q) return { open, kind: null, seed: null, n: 0, index: 0, of: 0, phase: open ? 'menu' : 'closed', points: 0, max: 0, link: '' };
  const pts = Q.results.reduce((s, r) => s + (r ? r.points : 0), 0), max = Q.results.reduce((s, r) => s + (r ? r.max : 0), 0);
  return { open, kind: Q.kind, seed: Q.seed, n: Q.n, index: Math.min(Q.i + 1, Q.qs.length), of: Q.qs.length, phase: Q.phase,
    points: pts, max, link: questLink(Q.kind, Q.seed, Q.n), blind: document.body.classList.contains(BLIND_CLASS),
    daily: Q.daily ? { day: Q.daily.day, practice: !!Q.daily.practice, record: Q.daily.record || null } : null };
}
/** the challenge link of (kind, seed, n): this page's address with the quest as its query */
export function questLink(kind, seed, n) {
  try { return location.origin + location.pathname + questQuery(kind, seed, n); } catch (_) { return questQuery(kind, seed, n); }
}
function freshSeed() {
  const w = new Uint32Array(2);
  try { crypto.getRandomValues(w); } catch (_) { w[0] = Date.now() >>> 0; w[1] = (performance.now() * 1000) >>> 0; }
  return newSeed(w[0], w[1]);
}

/* ══ PERSONAL BEST — this browser only, keyed by kind and length ═════════════════════════════════ */
const BEST_KEY = 'intmap_quest_best';
function bests() { try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch (_) { return {}; } }
function bestOf(kind, n) { const b = bests()[kind + '.' + n]; return typeof b === 'number' ? b : null; }
function keepBest(kind, n, pts) {
  const was = bestOf(kind, n);
  if (was != null && was >= pts) return false;
  try { const b = bests(); b[kind + '.' + n] = pts; localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch (_) { /* no storage: the result is still shown */ }
  return true;
}

/* ══ THE MAP — what a quest changes, and how it is put back ════════════════════════════════════════ */
function remember() {
  if (saved) return;
  let cam = null; try { cam = GE().camera.getCamera(); } catch (_) { }
  saved = { cam, when: IntMapTime.get() };
}
function putBack() {
  const s = saved; saved = null;
  if (!s) return;
  try { if (s.when) IntMapTime.set(s.when, { source: 'quest' }); else IntMapTime.setNow({ source: 'quest' }); } catch (_) { }
  try { if (s.cam && s.cam.center) GE().camera.flyTo({ center: [s.cam.center.lng, s.cam.center.lat], zoom: s.cam.zoom, bearing: s.cam.bearing, pitch: s.cam.pitch, duration: 800 }); } catch (_) { }
}
let addressRelease = null, tapRelease = null;
function blind(on) {
  try { document.body.classList.toggle(BLIND_CLASS, !!on); } catch (_) { }
  if (on && !addressRelease) { try { addressRelease = MapState.holdAddress('quest'); } catch (_) { } }
  if (!on && addressRelease) { addressRelease(); addressRelease = null; }
}
/* While a place question waits for its tap, the tap is the answer and nothing else's: the engine runs only this
   file's click handler (js/geo-engine.js holdTaps — the news dots, a volcano, a pin do not ask clickClaimed()). */
function holdTaps(on) {
  if (on && !tapRelease) { try { tapRelease = GE().events.holdTaps('quest'); } catch (_) { } }
  if (!on && tapRelease) { tapRelease(); tapRelease = null; }
}
/* A place question the map answers itself is not a question: the rows that write names (place names, feature labels,
   points of interest — each row says so, js/layers/<id>.js `names`) are switched off through the reader's own switch
   while it is open, and exactly the ones this file switched off are switched back on once the answer is shown. The
   switch, not the style: the label module redraws what its switch says, so a hidden style layer would come back. */
let unnamedIds = [];
function flip(id, on) { const cb = document.getElementById(id); if (!cb || cb.checked === on) return false;
  try { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); return true; } catch (_) { return false; } }
function unnamed(on) {
  if (on) { nameItems().forEach((id) => { if (unnamedIds.indexOf(id) < 0 && flip(id, false)) unnamedIds.push(id); }); }
  else { const ids = unnamedIds; unnamedIds = []; ids.forEach((id) => flip(id, true)); }
  return unnamedIds.slice();
}

function clearDrawing() {
  try { GE().layers.remove(L_PT); GE().layers.remove(L_LINE); GE().layers.removeSource(SRC); } catch (_) { }
}
/** the true place, the tapped point and the great circle between them, cut at the antimeridian */
function drawAnswer(at, got) {
  const G = geodesy(), feats = [];
  if (got && G) {
    const parts = G._splitLineToWindows(G._gcPoints(at, got, 96));
    feats.push({ type: 'Feature', properties: { k: 'line' }, geometry: parts.length === 1 ? { type: 'LineString', coordinates: parts[0] } : { type: 'MultiLineString', coordinates: parts } });
    feats.push({ type: 'Feature', properties: { k: 'got' }, geometry: { type: 'Point', coordinates: got } });
  }
  feats.push({ type: 'Feature', properties: { k: 'true' }, geometry: { type: 'Point', coordinates: at } });
  const fc = { type: 'FeatureCollection', features: G ? G.sanitizeFeatures(feats) : feats };
  try {
    const L = GE().layers;
    if (L.hasSource(SRC)) L.setSourceData(SRC, fc); else L.addSource(SRC, { type: 'geojson', data: fc });
    L.add({ id: L_LINE, type: 'line', source: SRC, filter: ['==', ['get', 'k'], 'line'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#007aff', 'line-width': 2.5, 'line-dasharray': [1.5, 1.5] } });
    L.add({ id: L_PT, type: 'circle', source: SRC, filter: ['!=', ['get', 'k'], 'line'],
      paint: { 'circle-radius': 7, 'circle-color': ['case', ['==', ['get', 'k'], 'true'], '#34c759', '#ff3b30'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    GE().render.claim([SRC], 'map.quest', { clear: clearDrawing });
  } catch (_) { }
  try {
    if (got) {
      let w = Math.min(at[0], got[0]), e = Math.max(at[0], got[0]);
      if (e - w > 180) { const t0 = w; w = e - 360; e = t0; }   /* the short way round */
      GE().camera.fitBounds([[w, Math.min(at[1], got[1])], [e, Math.max(at[1], got[1])]], { padding: 80, maxZoom: 7, duration: 900 });
    } else GE().camera.flyTo({ center: at, zoom: 5, duration: 900 });
  } catch (_) { }
}
function worldView() {
  try { GE().camera.fitBounds([[-170, -58], [170, 75]], { padding: 24, duration: 700 }); } catch (_) { }
}
/** the map of a `when` question: its day on the master clock, its place on the camera (js/on-this-day.js viewOf) */
function showDay(q) {
  try { IntMapTime.set(new Date(q.d), { source: 'quest' }); } catch (_) { }
  try { GE().camera.flyTo({ center: [q.view.lng, q.view.lat], zoom: q.view.zoom, bearing: 0, pitch: 0, duration: 900 }); } catch (_) { }
}

function onMapClick(e) {
  if (!Q || Q.phase !== 'ask' || Q.kind !== 'where' || !panel || panel.style.display === 'none') return;
  if (HOST && HOST.toolMode) return;   /* a measuring tool owns the tap */
  try { GE().events.claimClick(e); } catch (_) { }   /* the tap was the answer — no place-name popup under it */
  answer({ lng: e.lngLat.lng, lat: e.lngLat.lat });
}

/* ══ THE PANEL ════════════════════════════════════════════════════════════════════════════════════ */
let styled = false;
function style() {
  if (styled) return; styled = true;
  const st = document.createElement('style'); st.id = 'im-quest-css'; st.textContent = CSS; document.head.appendChild(st);
}
function ensure() {
  style();
  /* the map tap and the language are heard while the panel is open — closeQuest() lets go of both */
  if (!clickOn) { try { GE().events.on('click', onMapClick, { tapOwner: 'quest' }); clickOn = true; } catch (_) { } }
  if (!langOff) langOff = bus.on('intmap-lang', () => { if (panel && panel.style.display !== 'none') paint(); });
  if (panel && panel.isConnected) return panel;
  panel = document.createElement('div'); panel.className = 'tool-panel qst'; panel.id = 'quest-panel';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'qst-title');
  (document.getElementById('map-container') || document.body).appendChild(panel);
  return panel;
}
function header(sub) {
  return '<div class="tp-header qst-head"><span class="tp-title" id="qst-title">' + icon('graduation') + ' ' + H(t('Learn quests', '学ぶクエスト')) + '</span>'
    + '<button type="button" class="tp-close" aria-label="' + H(t('Close', '閉じる')) + '">×</button></div>' + (sub ? '<div class="qst-sub">' + sub + '</div>' : '');
}
function wire() {
  const x = panel.querySelector('.tp-close'); if (x) x.addEventListener('click', () => closeQuest());
  try { if (HOST && HOST.makeDraggable) HOST.makeDraggable(panel, panel.querySelector('.tp-header')); } catch (_) { }
}
const region = (iso2) => { try { return iso2 ? new Intl.DisplayNames([lang() === 'jp' ? 'ja' : 'en'], { type: 'region' }).of(iso2) : ''; } catch (_) { return iso2 || ''; } };
const km = (v) => (v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString(lang() === 'jp' ? 'ja-JP' : 'en-GB')) + ' km';
const BAND = () => [t('easy', 'やさしい'), t('medium', 'ふつう'), t('hard', 'むずかしい')];

function paint() {
  if (!panel) return;
  if (!Q) return paintMenu();
  if (Q.phase === 'done') return paintDone();
  return paintQuestion();
}
function paintMenu() {
  const p = ensure(); p.style.display = 'block';
  const kinds = QUEST_KIND_IDS.map((k) => {
    const b = bestOf(k, menuN);
    return '<button type="button" class="ai-test-btn qst-kind" data-kind="' + H(k) + '">' + icon(k === 'when' ? 'clock' : 'pin') + ' <span><b>' + H(kindTitle(k, lang())) + '</b>'
      + '<small>' + H(k === 'when' ? t('The map shows a day in history with the year hidden — which year is it?', '歴史のある日の地図を、年を隠して表示します。何年でしょう？')
        : t('A city is named — tap where it is on the map.', '都市の名前が出ます。地図でその場所をタップします。'))
      + (b != null ? ' · ' + H(t('best ', '自己ベスト ')) + H(b) : '') + '</small></span></button>';
  }).join('');
  p.innerHTML = header(H(t('Questions made from the map’s own data. Every answer is shown on the map.', '地図自身のデータから作る問題です。答えはどれも地図で示します。')))
    + '<div class="qst-today" id="qst-today">' + todayHTML(summary) + '</div>'
    + '<div class="qst-sec">' + H(t('Any time', 'いつでも')) + '</div>'
    + '<div class="qst-kinds">' + kinds + '</div>'
    + '<label class="qst-n">' + H(t('Questions per set', '1 回の問題数')) + ' <select id="qst-n"><option value="5">5</option><option value="10">10</option></select></label>';
  wire();
  wireToday();
  const sel = /** @type {HTMLSelectElement} */ (p.querySelector('#qst-n')); sel.value = String(menuN);
  sel.addEventListener('change', () => { menuN = +sel.value || 5; paintMenu(); });
  p.querySelectorAll('.qst-kind').forEach((b) => b.addEventListener('click', () => { startQuest({ kind: b.getAttribute('data-kind'), n: menuN }); }));
  refreshToday();
}

/* ══ TODAY'S QUEST — the menu's first block (watch-account-product) ════════════════════════════════════
   Drawn at once from what is known (the last summary, or nothing yet), then again when js/quest-daily.js has read
   this browser and the account. A summary is never invented: until it arrives the block names today and offers the
   two sets, and it says nothing about a streak. */
/** @type {any} the last js/quest-daily.js dailySummary() — null until one arrives */
let summary = null, summaryAsk = 0;
function refreshToday() {
  const ask = ++summaryAsk;
  DAILY.dailySummary(HOST).then((s) => {
    if (ask !== summaryAsk) return;   /* a newer read is on its way */
    summary = s;
    const slot = panel && panel.querySelector('#qst-today');
    if (slot && !Q) { slot.innerHTML = todayHTML(s); wireToday(); }
  }).catch(() => { /* the block keeps what it showed — the sets can still be played */ });
}
const fmt = (v) => Number(v).toLocaleString(lang() === 'jp' ? 'ja-JP' : 'en-GB');
function dayLong(day) {
  const p = parseDay(day); if (!p) return day;
  const [y] = p.day.split('-');
  return lang() === 'jp' ? y + '年' + OTD.dayWords(p.md, 'jp') : OTD.dayWords(p.md, 'en') + ' ' + y;
}
function streakWords(st) {
  if (!st) return '';
  if (st.current > 0 && st.playedToday) return t(st.current + '-day streak', '連続 ' + st.current + ' 日') + (st.best > st.current ? ' · ' + t('best ' + st.best, '最長 ' + st.best + ' 日') : '');
  if (st.current > 0) return t(st.current + '-day streak — play today for day ' + (st.current + 1), '連続 ' + st.current + ' 日 · 今日解くと ' + (st.current + 1) + ' 日目');
  return st.best > 0 ? t('Best streak ' + st.best + ' days — play today to start a new one', '最長 ' + st.best + ' 日 · 今日解くと新しい連続記録が始まります')
    : t('Play today to start a streak', '今日解くと連続記録が始まります');
}
function todayHTML(s) {
  const day = s ? s.today : DAILY.today();
  const kinds = QUEST_KIND_IDS.map((k) => {
    const done = s && s.todayKinds[k];
    const sub = done ? t('Today’s result ', '今日の記録 ') + fmt(done.points) + ' / ' + fmt(done.max) + ' · ' + t('playing again is practice', 'もう一度は練習')
      : k === 'when' ? t(DAILY_N + ' questions — first, what the record dates on this day of the year', DAILY_N + ' 問。記録に今日の日付の出来事があれば、それから')
      : t(DAILY_N + ' cities, the same for everyone today', DAILY_N + ' 都市。今日は全員が同じ問題');
    return '<button type="button" class="ai-test-btn qst-kind qst-daily' + (done ? ' done' : '') + '" data-daily="' + H(k) + '">' + icon(done ? 'check' : (k === 'when' ? 'clock' : 'pin')) + ' <span><b>'
      + H(t('Today’s ', '今日の') + kindTitle(k, lang())) + '</b><small>' + H(sub) + '</small></span></button>';
  }).join('');
  const strip = s ? '<div class="qst-week" aria-label="' + H(t('The last ' + s.recent.length + ' days: played on ' + s.recent.filter((r) => r.played).length, '最近 ' + s.recent.length + ' 日のうち ' + s.recent.filter((r) => r.played).length + ' 日')) + '">'
    + s.recent.map((r) => '<span class="qst-wd' + (r.played ? ' on' : '') + (r.day === s.today ? ' now' : '') + '" title="' + H(r.day + (r.played ? ' · ' + fmt(r.points) : '')) + '"><i></i>' + H(+r.day.slice(8)) + '</span>').join('')
    + '</div>' : '';
  const where = !s ? '' : s.account === 'ok'
    ? t('Kept in your account — the same streak on every device.', 'アカウントに記録しています。どの端末でも同じ連続記録です。') + (s.synced ? ' ' + t(s.synced + ' result(s) from this browser were added to your account.', 'このブラウザの記録 ' + s.synced + ' 件をアカウントに追加しました。') : '')
    : DAILY.dailyFailureText(s.account, lang());
  return '<div class="qst-today-h"><span>' + H(t('Today’s quest', '今日のクエスト')) + '</span><span class="qst-today-d">' + H(dayLong(day)) + '</span></div>'
    + (s ? '<div class="qst-streak">' + H(streakWords(s.streak)) + '</div>' : '')
    + strip + '<div class="qst-kinds">' + kinds + '</div>'
    + (where ? '<div class="qst-store">' + H(where) + '</div>' : '');
}
function wireToday() {
  if (!panel) return;
  panel.querySelectorAll('.qst-daily').forEach((b) => b.addEventListener('click', () => { openToday({ kind: b.getAttribute('data-daily') }); }));
}
/** the line the reader can paste anywhere: the day, the kind, the total, the streak, each question's score and the link */
function dailyShareText(st) {
  const scores = Q.results.map((r) => (r ? r.points : 0));
  const streak = summary && summary.today === Q.daily.day ? summary.streak.current : 0;
  return 'IntMap · ' + t('Today’s quest', '今日のクエスト') + ' · ' + kindTitle(Q.kind, lang()) + ' · ' + dayLong(Q.daily.day) + '\n'
    + fmt(st.points) + ' / ' + fmt(st.max) + (streak > 0 && !Q.daily.practice ? ' · ' + t(streak + '-day streak', '連続 ' + streak + ' 日') : '') + '\n'
    + scores.join(' · ') + '\n' + st.link;
}
function progress() {
  const r = Q.results, pts = r.reduce((s, x) => s + (x ? x.points : 0), 0);
  return H(kindTitle(Q.kind, lang())) + ' · ' + H(t('question ', '問題 ')) + H(Q.i + 1) + ' / ' + H(Q.qs.length) + ' · ' + H(t('score ', '得点 ')) + H(pts);
}
function paintQuestion() {
  const p = ensure(); p.style.display = 'block';
  const q = Q.qs[Q.i], res = Q.results[Q.i];
  let body = '';
  if (q.kind === 'where') {
    body += '<div class="qst-q">' + H(t('Tap this place on the map', 'この場所を地図でタップ')) + ' <span class="qst-band">' + H(BAND()[q.band]) + '</span></div>'
      + '<div class="qst-name">' + H(pick(q.name)) + (q.iso2 ? '<small>' + H(region(q.iso2)) + '</small>' : '') + '</div>';
  } else {
    body += '<div class="qst-q">' + H(t('The map is on this day. Which year?', '地図はこの日を表示しています。何年でしょう？')) + '</div>'
      + '<div class="qst-day">' + H(OTD.dayWords(q.md, lang())) + '</div>'
      + '<div class="qst-ev">' + H(pick(q.text)) + '</div>'
      + '<div class="qst-src">' + H(q.war ? pick(q.war) + ' · ' + pick(q.record) : pick(q.record)) + '</div>';
  }
  if (!res) {
    if (q.kind === 'when') {
      const mid = Math.round((q.span.from + q.span.to) / 2), y = Q.answer != null ? Q.answer : mid;
      body += '<div class="qst-year"><input type="range" id="qst-yr" min="' + H(q.span.from) + '" max="' + H(q.span.to) + '" step="1" value="' + H(y) + '" aria-label="' + H(t('Year', '年')) + '">'
        + '<input type="number" id="qst-yv" min="' + H(q.span.from) + '" max="' + H(q.span.to) + '" step="1" value="' + H(y) + '" inputmode="numeric" aria-label="' + H(t('Year', '年')) + '"></div>'
        + '<button type="button" class="ai-test-btn qst-go" id="qst-ok">' + icon('check') + ' ' + H(t('Answer', '答える')) + '</button>';
    } else body += '<div class="qst-hint">' + H(t('Move and zoom the map freely, then tap once.', '地図は自由に動かせます。決めたら 1 回タップします。')) + '</div>';
    body += '<button type="button" class="ai-test-btn" id="qst-skip">' + H(t('Skip', 'スキップ')) + '</button>';
  } else {
    const ok = res.points >= res.max * 0.9;
    body += '<div class="qst-res' + (ok ? ' good' : '') + '"><b>' + H(res.points) + '</b> / ' + H(res.max) + '<span>'
      + H(res.detail.skipped ? t('Skipped', 'スキップ')
        : res.detail.unmeasured ? t('The distance could not be measured', '距離を測れませんでした')
        : q.kind === 'where' ? t(km(res.detail.km) + ' away', km(res.detail.km) + ' ずれ')
        : res.detail.off === 0 ? t('Exactly right', 'ぴったり') : t(res.detail.off + ' years off', res.detail.off + ' 年ずれ')) + '</span></div>'
      + (q.kind === 'when' ? '<div class="qst-truth">' + H(t('The record dates it ', '記録の日付は ')) + '<b>' + H(q.d) + '</b></div>' : '<div class="qst-truth">' + H(t('Green is the place; red is your tap.', '緑が正解の場所、赤があなたのタップです。')) + '</div>')
      + '<button type="button" class="ai-test-btn qst-go" id="qst-next">' + H(Q.i + 1 < Q.qs.length ? t('Next', '次の問題') : t('See the results', '結果を見る')) + '</button>';
  }
  p.innerHTML = header(progress()) + body;
  wire();
  const ok = p.querySelector('#qst-ok'), skip = p.querySelector('#qst-skip'), nx = p.querySelector('#qst-next');
  const yr = /** @type {HTMLInputElement|null} */ (p.querySelector('#qst-yr')), yv = /** @type {HTMLInputElement|null} */ (p.querySelector('#qst-yv'));
  if (yr && yv) {
    yr.addEventListener('input', () => { yv.value = yr.value; Q.answer = +yr.value; });
    yv.addEventListener('input', () => { if (yv.checkValidity() && yv.value !== '') { yr.value = yv.value; Q.answer = +yv.value; } });
  }
  if (ok) ok.addEventListener('click', () => { if (yv && !yv.checkValidity()) { yv.reportValidity(); return; } answer({ year: +(yv ? yv.value : NaN) }); });
  if (skip) skip.addEventListener('click', () => answer(null));
  if (nx) nx.addEventListener('click', () => next());
}
function paintDone() {
  const p = ensure(); p.style.display = 'block';
  const st = questState(), best = bestOf(Q.kind, Q.n);
  const rows = Q.qs.map((q, i) => {
    const r = Q.results[i] || { points: 0, detail: { skipped: true } };
    const what = q.kind === 'where' ? pick(q.name) : q.year + ' · ' + pick(q.text);
    const how = r.detail.skipped ? t('skipped', 'スキップ') : r.detail.unmeasured ? '—' : q.kind === 'where' ? km(r.detail.km) : t(r.detail.off + ' y off', r.detail.off + ' 年ずれ');
    return '<li><span class="qst-li-t">' + H(what) + '</span><span class="qst-li-s">' + H(how) + ' · <b>' + H(r.points) + '</b></span>'
      + (q.kind === 'when' ? '<button type="button" class="qst-open" data-i="' + H(i) + '">' + H(t('Open this day', 'この日の地図')) + '</button>' : '') + '</li>';
  }).join('');
  const share = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  p.innerHTML = header(H(Q.daily ? t('Today’s ', '今日の') + kindTitle(Q.kind, lang()) + ' · ' + dayLong(Q.daily.day) : kindTitle(Q.kind, lang())))
    + '<div class="qst-total"><b>' + H(st.points) + '</b> / ' + H(st.max) + (Q.newBest ? '<span>' + H(t('New personal best', '自己ベスト更新')) + '</span>' : (best != null ? '<span>' + H(t('Best ', '自己ベスト ')) + H(best) + '</span>' : '')) + '</div>'
    + (Q.daily ? dailyDoneHTML() : '')
    + '<ol class="qst-list">' + rows + '</ol>'
    + '<div class="qst-share"><div class="qst-share-h">' + icon('link') + ' ' + H(t('Challenge link — everyone who opens it gets these same questions', '挑戦リンク——開いた人は全員この同じ問題を解きます')) + '</div>'
    + '<input type="text" readonly id="qst-link" value="' + H(st.link) + '" aria-label="' + H(t('Challenge link', '挑戦リンク')) + '">'
    + '<div class="qst-acts"><button type="button" class="ai-test-btn" id="qst-copy">' + icon('clipboard') + ' ' + H(t('Copy', 'コピー')) + '</button>'
    + (Q.daily ? '<button type="button" class="ai-test-btn" id="qst-copyres">' + icon('clipboard') + ' ' + H(t('Copy the result', '結果をコピー')) + '</button>' : '')
    + (share ? '<button type="button" class="ai-test-btn" id="qst-sharebtn">' + icon('share') + ' ' + H(t('Share…', '共有…')) + '</button>' : '') + '</div></div>'
    + '<div class="qst-acts"><button type="button" class="ai-test-btn qst-go" id="qst-again">' + H(t('New set', '新しい問題で')) + '</button>'
    + '<button type="button" class="ai-test-btn" id="qst-menu">' + H(t('Other quests', 'ほかのクエスト')) + '</button></div>';
  wire();
  const copy = p.querySelector('#qst-copy'), field = /** @type {HTMLInputElement} */ (p.querySelector('#qst-link'));
  if (copy) copy.addEventListener('click', async () => {
    let done = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(st.link); done = true; } } catch (_) { done = false; }
    /* a page that may not write the clipboard still hands the link over: selected, ready for ⌘C / long-press */
    if (!done) { try { field.focus(); field.select(); } catch (_) { } }
    copy.innerHTML = done ? icon('check') + ' ' + H(t('Copied', 'コピーしました')) : H(t('Selected — copy it', '選択しました。コピーしてください'));
  });
  const sh = p.querySelector('#qst-sharebtn');
  if (sh) sh.addEventListener('click', async () => { try { await navigator.share(Q && Q.daily ? { title: t('IntMap today’s quest', 'IntMap 今日のクエスト'), text: dailyShareText(st).replace(/\n[^\n]*$/, ''), url: st.link }
    : { title: t('IntMap learn quest', 'IntMap 学ぶクエスト') + ' · ' + kindTitle(Q.kind, lang()), url: st.link }); } catch (_) { /* the reader closed the sheet */ } });
  /* (watch-account-product) a day's set: its result as one paste — the day, the total, the streak, every score, the link */
  const res = p.querySelector('#qst-copyres');
  if (res) res.addEventListener('click', async () => {
    const text = dailyShareText(st);
    let done = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); done = true; } } catch (_) { done = false; }
    res.innerHTML = done ? icon('check') + ' ' + H(t('Copied', 'コピーしました')) : H(t('Could not copy — the link above can be copied', 'コピーできませんでした。上のリンクはコピーできます'));
  });
  const again = p.querySelector('#qst-again'); if (again) again.addEventListener('click', () => startQuest({ kind: Q.kind, n: Q.n }));
  const menu = p.querySelector('#qst-menu'); if (menu) menu.addEventListener('click', () => { endSet(); paintMenu(); });
  p.querySelectorAll('.qst-open').forEach((b) => b.addEventListener('click', async () => {
    const q = Q.qs[+b.getAttribute('data-i')];
    const idx = data.onThisDay, ev = idx ? OTD.eventsOn(idx, q.md)[q.k] : null;
    if (!ev) return;
    const lg = lang();
    closeQuest({ keepMap: true });
    try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { }
    await OTD.openEvent(ev, idx, lg);   /* the day's own share link — its date, its place, its war layer */
  }));
}

/* ══ THE FLOW ═════════════════════════════════════════════════════════════════════════════════════ */
function ask() {
  const q = Q.qs[Q.i];
  Q.phase = 'ask'; Q.answer = null;
  clearDrawing();
  if (q.kind === 'when') { unnamed(false); holdTaps(false); blind(true); showDay(q); } else { blind(false); unnamed(true); holdTaps(true); worldView(); }
  paint();
}
function answer(a) {
  if (!Q || Q.phase !== 'ask') return;
  const q = Q.qs[Q.i];
  const r = engine.score(q, a);
  Q.results[Q.i] = r; Q.phase = 'shown';
  if (q.kind === 'where') { unnamed(false); holdTaps(false); drawAnswer(q.at, a ? [a.lng, a.lat] : null); }
  else blind(false);   /* the answer is out: the clock may say the day now */
  try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { }
  paint();
}
function next() {
  if (!Q) return;
  if (Q.i + 1 < Q.qs.length) { Q.i++; ask(); return; }
  Q.phase = 'done'; blind(false);
  Q.newBest = keepBest(Q.kind, Q.n, questState().points);
  paint();
  if (Q.daily && !Q.daily.practice) recordToday(Q);
}
/* (watch-account-product) THE FIRST FINISH OF A DAY'S SET IS RECORDED — in this browser, and in the account when signed
   in (js/quest-daily.js recordDay). What the record said is shown where the result is (dailyDoneHTML), then the
   summary is read again so the streak on screen is the one the stores now hold. */
async function recordToday(set) {
  set.daily.record = { pending: true };
  const scores = set.results.map((r) => (r ? r.points : 0));
  let rec;
  try { rec = await DAILY.recordDay(HOST, { day: set.daily.day, kind: set.kind, scores }); }
  catch (_) { rec = { ok: false, local: 'invalid', account: 'failed' }; }
  set.daily.record = rec;
  /* recorded nowhere new: this day and kind already had its result (another tab, another device) — this was practice */
  if (rec.local === 'already' && rec.account !== 'saved') set.daily.practice = true;
  try { summary = await DAILY.dailySummary(HOST, { sync: false }); } catch (_) { /* the streak line waits for the next read */ }
  if (Q === set && Q.phase === 'done') paint();
}
function dailyDoneHTML() {
  const d = Q.daily, rec = d.record;
  let line;
  if (!rec || rec.pending) line = d.practice ? t('Practice — today’s result was already recorded.', '練習です（今日の記録はすでにあります）。') : t('Recording today’s result…', '今日の記録を保存しています…');
  else if (d.practice) line = t('Practice — today’s result was already recorded, so this one is not.', '練習です。今日の記録はすでにあるので、この回は記録しません。');
  else if (rec.local === 'invalid') line = t('This set could not be recorded (it did not have ' + DAILY_N + ' questions).', 'このセットは記録できませんでした（' + DAILY_N + ' 問ありませんでした）。');
  else {
    const st = summary && summary.today === d.day ? summary.streak : null;
    line = t('Recorded as today’s result.', '今日の記録に入りました。') + (st && st.current ? ' ' + t(st.current + '-day streak.', '連続 ' + st.current + ' 日。') : '');
  }
  const where = !rec || rec.pending || d.practice ? '' : rec.account === 'saved' || rec.account === 'already' ? t('Kept in your account.', 'アカウントに保存しました。')
    : rec.local === 'no_storage' && rec.account === 'signed_out' ? t('This browser would not keep it, and you are not signed in — it is shown here only.', 'このブラウザに保存できず、ログインもしていないため、ここに表示するだけです。')
    : DAILY.dailyFailureText(rec.account, lang());
  return '<div class="qst-dres' + (d.practice ? ' practice' : '') + '">' + H(line) + (where ? '<small>' + H(where) + '</small>' : '') + '</div>';
}
function endSet() { Q = null; blind(false); unnamed(false); holdTaps(false); clearDrawing(); }

/** Start a set. `o` = { kind, seed?, n? } — a new seed when none is given. Resolves with questState() once the first
 *  question is on screen, or with { ok:false, reason } when the kind is unknown or its data cannot be read. */
export async function startQuest(o) {
  o = o || {};
  const kind = String(o.kind || '');
  if (QUEST_KIND_IDS.indexOf(kind) < 0) return { ok: false, reason: 'unknown-kind', kinds: QUEST_KIND_IDS.slice() };
  const seed = o.seed != null && SEED_RE.test(String(o.seed)) ? String(o.seed) : freshSeed();
  const n = Math.max(1, Math.floor(+o.n) || 5);
  HOST = await whenHost();
  ensure(); panel.style.display = 'block';
  panel.innerHTML = header('') + '<div class="qst-hint">' + H(t('Loading the data…', 'データを読み込んでいます…')) + '</div>'; wire();
  let qs;
  try { qs = engine.generate(kind, seed, n, await need(kind)); }
  catch (e) { Q = null; panel.innerHTML = header('') + '<div class="qst-hint">' + H(t('The data for this quest could not be read — check your connection and try again.', 'このクエストのデータを読み込めませんでした。接続を確認して、もう一度お試しください。')) + '</div>'; wire();
    return { ok: false, reason: 'data', detail: String((e && e.message) || e) }; }
  if (!qs.length) { Q = null; paintMenu(); return { ok: false, reason: 'no-questions' }; }
  remember();
  /* (watch-account-product) is this today's set? — the one test (js/quest-engine.js isDailySet), whatever door opened it:
     the menu, Atlas, or a friend's link to today's set. A day and kind that already has its result is practice from the start. */
  const day = DAILY.today();
  const daily = isDailySet(kind, seed, n, day) && qs.length === DAILY_N ? { day, practice: playedToday(kind, day) } : null;
  Q = { kind, seed, n, qs, i: 0, phase: 'ask', results: [], answer: null, daily };
  ask();
  return Object.assign({ ok: true }, questState());
}
/** has `kind`'s set of `day` already got its result — in this browser, or in the account as last read? */
function playedToday(kind, day) {
  if (DAILY.localRows().some((r) => r.day === day && r.kind === kind)) return true;
  return !!(summary && summary.today === day && summary.todayKinds[kind]);
}
/** (watch-account-product) Start today's set of `o.kind` (default: the year quest) — the menu's «Today's …» buttons,
 *  the account sheet and Atlas (`learn.daily`). Resolves like startQuest(). */
export async function openToday(o) {
  const kind = String((o && o.kind) || 'when');
  return startQuest({ kind, seed: dailySeed(DAILY.today()), n: DAILY_N });
}
/** today's set's challenge link for `kind` — what a reader sends a friend so they play the same day's questions */
export function todayLink(kind) { return questLink(kind || 'when', dailySeed(DAILY.today()), DAILY_N); }
/** Open the panel: the kinds to choose from, or — given `o.kind` — a set straight away */
export async function openQuest(o) {
  if (o && o.kind) return startQuest(o);
  HOST = await whenHost();
  if (!Q) paintMenu(); else { ensure(); panel.style.display = 'block'; paint(); }
  return Object.assign({ ok: true }, questState());
}
/** Close: the year shown again, the drawing removed, the map's time and camera put back (`keepMap` — a door that
 *  is about to open another map itself — leaves the camera and clock to it) */
export function closeQuest(opts) {
  const wasOpen = questState().open;
  endSet();
  if (panel) panel.style.display = 'none';
  if (clickOn) { try { GE().events.off('click', onMapClick, { tapOwner: 'quest' }); } catch (_) { } clickOn = false; }
  if (langOff) { langOff(); langOff = null; }
  if (opts && opts.keepMap) saved = null; else putBack();
  return wasOpen;
}

/** the page was opened with `?quest=<kind>.<seed>.<n>` (src/main.js): start that set once the map is ready */
export async function bootFromUrl() {
  const want = questFromSearch(location.search);
  /* the query is spent: a reload is an ordinary start (the link is offered again at the end of the set) */
  try { const q = new URLSearchParams(location.search); q.delete('quest'); MapState.address(q.toString()); } catch (_) { /* cosmetic */ }
  if (!want) return { ok: false, reason: 'bad-link' };
  HOST = await whenHost();
  await new Promise((res) => {
    const t0 = Date.now();
    const ok = () => { try { return GE().hasRenderer() && GE().ready(); } catch (_) { return false; } };
    /* 30 s: the bound js/place-dossier.js whenMapReady waits for the same renderer at boot; the set starts either way */
    const tick = () => { if (ok() || Date.now() - t0 > 30000) res(); else setTimeout(tick, 150); };
    tick();
  });
  return startQuest(want);
}

/* ══ THE LOOK — iOS-like, on the app's own variables (css/intmap.css), injected when first drawn ══════════ */
const CSS = [
  'body.' + BLIND_CLASS + ' [' + BLIND_ATTR + ']{visibility:hidden !important;pointer-events:none !important;}',
  '#quest-panel.qst{display:none;top:70px;left:50%;right:auto;transform:translateX(-50%);z-index:calc(var(--z-sheet) - 50);width:min(360px,calc(100vw - 24px));max-height:min(74vh,640px);overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;}',
  '.qst .qst-head{display:flex;align-items:center;justify-content:space-between;cursor:move;}',
  '.qst .tp-close{width:32px;height:32px;border:none;border-radius:50%;background:var(--input-bg);color:var(--text-main);font-size:18px;line-height:1;cursor:pointer;}',
  '.qst .qst-sub{font-size:11.5px;color:var(--text-muted);margin:0 0 10px;line-height:1.45;}',
  '.qst .qst-kinds{display:flex;flex-direction:column;gap:8px;}',
  '.qst .qst-kind{display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;padding:10px 12px;min-height:56px;}',
  '.qst .qst-kind span{display:flex;flex-direction:column;gap:2px;}',
  '.qst .qst-kind small{font-size:11.5px;color:var(--text-muted);line-height:1.4;font-weight:400;}',
  '.qst .qst-n{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;font-size:12px;color:var(--text-muted);}',
  '.qst .qst-n select{padding:4px 8px;border-radius:8px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font:inherit;}',
  '.qst .qst-q{font-size:12.5px;font-weight:600;margin:2px 0 6px;display:flex;align-items:center;gap:8px;}',
  '.qst .qst-band{font-size:10.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--input-bg);color:var(--text-muted);}',
  '.qst .qst-name{font-size:20px;font-weight:800;color:var(--primary-color);margin:2px 0 10px;line-height:1.25;}',
  '.qst .qst-name small{display:block;font-size:12px;font-weight:600;color:var(--text-muted);margin-top:2px;}',
  '.qst .qst-day{font-size:13px;font-weight:700;color:var(--primary-color);}',
  '.qst .qst-ev{font-size:14px;font-weight:600;line-height:1.4;margin:4px 0 2px;}',
  '.qst .qst-src{font-size:11.5px;color:var(--text-muted);margin-bottom:10px;}',
  '.qst .qst-year{display:flex;align-items:center;gap:10px;margin:6px 0 10px;}',
  '.qst .qst-year input[type=range]{flex:1;min-width:0;accent-color:var(--primary-color);}',
  '.qst .qst-year input[type=number]{width:84px;padding:6px 8px;border-radius:10px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font:inherit;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;text-align:center;}',
  '.qst .ai-test-btn{width:100%;margin-top:6px;}',
  '.qst .qst-go{background:var(--primary-fill);color:#fff;border-color:transparent;font-weight:600;}',
  '.qst .qst-hint{font-size:12px;color:var(--text-muted);line-height:1.45;margin:4px 0 6px;}',
  '.qst .qst-res{display:flex;align-items:baseline;gap:6px;padding:10px 12px;border-radius:12px;background:rgba(255,149,0,0.10);font-variant-numeric:tabular-nums;}',
  '.qst .qst-res.good{background:rgba(52,199,89,0.12);}',
  '.qst .qst-res b{font-size:22px;}',
  '.qst .qst-res span{margin-left:auto;font-size:12.5px;font-weight:600;}',
  '.qst .qst-truth{font-size:12px;color:var(--text-muted);margin:6px 0 2px;line-height:1.45;}',
  '.qst .qst-total{display:flex;align-items:baseline;gap:6px;font-variant-numeric:tabular-nums;margin:2px 0 8px;}',
  '.qst .qst-total b{font-size:28px;font-weight:800;}',
  '.qst .qst-total span{margin-left:auto;font-size:12px;font-weight:600;color:var(--primary-color);}',
  '.qst .qst-list{margin:0 0 8px;padding:0 0 0 18px;font-size:12px;line-height:1.45;}',
  '.qst .qst-list li{margin:4px 0;}',
  '.qst .qst-li-t{display:block;font-weight:600;}',
  '.qst .qst-li-s{color:var(--text-muted);font-variant-numeric:tabular-nums;}',
  '.qst .qst-open{margin-left:6px;padding:0;border:none;background:transparent;color:var(--primary-color);font:inherit;font-size:12px;font-weight:600;cursor:pointer;}',
  '.qst .qst-share{border-top:1px solid rgba(128,128,128,0.16);padding-top:8px;margin-top:4px;}',
  '.qst .qst-share-h{font-size:12px;font-weight:600;margin-bottom:6px;line-height:1.4;}',
  '.qst #qst-link{width:100%;box-sizing:border-box;padding:6px 8px;border-radius:8px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font:inherit;font-size:11.5px;}',
  '.qst .qst-acts{display:flex;gap:8px;}',
  /* (watch-account-product) today's quest — the menu's first block and the line under a day's result */
  '.qst .qst-today{padding:10px 12px 12px;margin:0 0 10px;border-radius:14px;background:var(--input-bg);border:1px solid rgba(128,128,128,0.18);}',
  '.qst .qst-today-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:13px;font-weight:700;}',
  '.qst .qst-today-d{font-size:11.5px;font-weight:600;color:var(--text-muted);font-variant-numeric:tabular-nums;}',
  '.qst .qst-streak{font-size:12.5px;font-weight:600;color:var(--primary-color);margin:4px 0 6px;line-height:1.4;}',
  '.qst .qst-week{display:flex;justify-content:space-between;gap:4px;margin:0 0 8px;}',
  '.qst .qst-wd{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:10.5px;color:var(--text-muted);font-variant-numeric:tabular-nums;}',
  '.qst .qst-wd i{display:block;width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(128,128,128,0.45);box-sizing:border-box;}',
  '.qst .qst-wd.on i{background:var(--primary-fill);border-color:var(--primary-fill);}',
  '.qst .qst-wd.now{color:var(--text-main);font-weight:700;}',
  '.qst .qst-today .qst-kind{background:var(--card-bg);}',
  '.qst .qst-daily.done small{color:var(--primary-color);}',
  '.qst .qst-store{font-size:11px;color:var(--text-muted);line-height:1.45;margin-top:6px;}',
  '.qst .qst-sec{font-size:11.5px;font-weight:600;color:var(--text-muted);margin:2px 2px 6px;}',
  '.qst .qst-dres{font-size:12.5px;font-weight:600;line-height:1.45;padding:8px 10px;margin:0 0 8px;border-radius:10px;background:rgba(52,199,89,0.12);}',
  '.qst .qst-dres.practice{background:var(--input-bg);}',
  '.qst .qst-dres small{display:block;font-size:11.5px;font-weight:400;color:var(--text-muted);margin-top:2px;}',
  '@media (max-width:640px){#quest-panel.qst{top:auto;bottom:calc(12px + var(--safe-bottom));max-height:58dvh;}}',
].join('\n');
