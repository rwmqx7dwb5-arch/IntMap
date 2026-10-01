// @ts-check
/* ============================================================================
 *  IntMap · js/time-lapse.js — THE CLOCK PLAYED FORWARD, ONE DRAWN FRAME AT A TIME  (time-compare-lapse)
 * ----------------------------------------------------------------------------
 *  The Chronos panel could set an instant and the forecast transport (js/news-timeline.js `fcPlay`) could
 *  step a model's valid times — nothing could PLAY the clock through years, days or hours. This is that
 *  player: it moves the main map's clock (js/chronos.js) from a start to an end by a step, in the reader's
 *  unit, and it is the clock that everything follows — the borders, the subdivisions, every layer's
 *  «does the source state this instant» (js/layer-time-kernel.js) — so what the reader watches is the map
 *  at each instant, layers beginning and ending to be stated as the instants pass.
 *
 *  ⚠ A FRAME IS NOT A TIMER TICK. The next instant is set only when the map has DRAWN the current one:
 *    ① the layer-time kernel has judged this instant (`lastSettled()` names it) — a layer whose source stops
 *      stating the instant has been withdrawn, one that starts has been delivered;
 *    ② the renderer has every tile it asked for (`IntMapGeoEngine.ready()`, MapLibre's style `loaded()`,
 *      which is false while any source still has tiles in flight);
 *    ③ the border record on screen is the one that answers this instant (js/time-borders.js
 *      `collectionAt` against `current()`), when that can be asked;
 *  and only then the frame's dwell (the reader's speed) starts. So one frame is ever in flight: a slow tile
 *  makes the lapse slower, never makes it skip or queue instants (.agents/rules/one-pass-or-a-reason.md —
 *  the observer must not call an unfinished draw finished). «Could not be asked» is not «not drawn»: a
 *  check with nobody to answer it does not hold the frame.
 *  ⚠ THE READER CAN ALWAYS STOP IT, AND A HAND ON THE CLOCK DOES. Any change to the clock that the player
 *  did not make (the slider, a link, Atlas) pauses it — two writers of one clock is how the forecast
 *  transport ended up with «one interval, one writer» (#R293).
 *  ⚠ prefers-reduced-motion: the player still plays (it is the reader who pressed Play), at the slowest
 *  rate it offers, and says so. Nothing starts on its own.
 *
 *  The UI is mounted into the Chronos panel by js/news-timeline.js the first time the panel opens
 *  (`mountLapse`); Atlas drives the same player (js/atlas-cap-time.js `time.lapse`) and reads `lapseState()`.
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';

/** the units a frame steps by — the Chronos panel's three tabs (year / date / time) */
export const UNITS = Object.freeze(['year', 'day', 'hour']);
/* the rates offered, in frames per second. The slowest is also the rate a reader who asked the system for
   reduced motion is held to. A rate is a ceiling: a frame is never shorter than the map takes to draw it. */
export const RATES = Object.freeze([0.5, 1, 2, 4]);

const W = () => (typeof window !== 'undefined' ? /** @type {any} */ (window) : null);
const D = () => (typeof document !== 'undefined' ? document : null);
const HS = () => { try { return W().IntMapHistScale; } catch (_) { return null; } };
const reducedMotion = () => { try { return !!(W().matchMedia && W().matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };

/* the instant `y` stands for on this clock: the year convention js/chronos.js `setYear` uses (mid-June noon UTC) */
function yearInstant(y) {
  try { const H = HS(); if (H && H.utcAt) return H.utcAt(y, 5, 15, 12, 0, 0).getTime(); } catch (_) { /* below */ }
  const t = new Date(0); t.setUTCFullYear(y, 5, 15); t.setUTCHours(12, 0, 0, 0); return t.getTime();
}
const DAY = 86400000, HOUR = 3600000;

/* ══ THE PLAYER — one per page: there is one main clock ═══════════════════════════════════════════════ */
const st = {
  playing: false, waiting: false,
  unit: /** @type {'year'|'day'|'hour'} */ ('year'), step: 1, fps: 1, loop: false,
  /** @type {number|null} */ from: null,   /* ms */
  /** @type {number|null} */ to: null,     /* ms; null = the present */
  frames: 0, /** @type {string|null} */ ended: null,
  /** @type {{at:string, entered:{id:string,name:string}[], left:{id:string,name:string}[]}[]} */ changes: [],
};
/** @type {Map<string,{name:string,drawn:boolean}>|null} */
let lastDrawn = null;
let runToken = 0;
let ownWrite = false;
/** @type {Set<(s:any)=>void>} */
const subs = new Set();
const emit = () => { const s = lapseState(); subs.forEach((f) => { try { f(s); } catch (_) { /* a reader */ } }); };

/** the next instant after `ms` by the player's step, or null past the end */
function nextAfter(ms) {
  let n;
  if (st.unit === 'year') { const y = new Date(ms).getUTCFullYear() + st.step; n = yearInstant(y); }
  else n = ms + st.step * (st.unit === 'day' ? DAY : HOUR);
  const end = st.to == null ? Date.now() : st.to;
  return n > end ? null : n;
}
/** put the clock at `ms` — the year convention by setYear, any other instant by set; the present as «now» */
function put(ms) {
  ownWrite = true;
  try {
    if (ms >= Date.now()) IntMapTime.setNow({ source: 'lapse' });
    else if (st.unit === 'year') IntMapTime.setYear(new Date(ms).getUTCFullYear(), { source: 'lapse' });
    else IntMapTime.set(new Date(ms), { source: 'lapse' });
  } finally { ownWrite = false; }
}
const frame = () => new Promise((r) => { try { requestAnimationFrame(() => r(true)); } catch (_) { setTimeout(() => r(true), 16); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** has the map drawn the instant on the clock? true / false — or null where nobody can be asked */
async function drawnNow() {
  const at = IntMapTime.when().getTime(), live = IntMapTime.isLive();
  /* ① the kernel judged this instant (only once its table is loaded — before that it holds nothing) */
  let judged = null;
  try {
    const LT = W().IntMapLayerTime;
    /* off the present the kernel loads its table and THEN judges: not loaded yet is «not judged yet», not «nobody to ask» */
    if (LT && LT.loaded()) { const s = LT.lastSettled(); judged = !!s && (live ? s.live : (!s.live && Date.parse(s.when) === at)); }
    else if (LT && !live) judged = false;
  } catch (_) { judged = null; }
  /* ② every tile the renderer asked for is in */
  let tiles = null;
  try { const E = IntMapGeoEngine; if (E && E.hasRenderer()) tiles = !!E.ready(); } catch (_) { tiles = null; }
  /* ③ the border record on screen is this instant's */
  let borders = null;
  try {
    const TB = W().IntMapTimeBorders;
    const r = await TB.collectionAt(new Date(at), { live });
    borders = r && r.modern ? !TB.active() : (r ? TB.current() === r.key : null);
  } catch (_) { borders = null; }
  return judged !== false && tiles !== false && borders !== false;
}
async function run(token) {
  const alive = () => st.playing && token === runToken;
  while (alive()) {
    const t0 = Date.now();
    st.waiting = true; emit();
    /* the frame is drawn before it is held on screen — polled once per animation frame, so a hidden tab
       (no frames) pauses the lapse rather than racing through instants nobody sees */
    await frame(); await frame();
    while (alive() && !(await drawnNow())) await frame();
    if (!alive()) return;
    st.waiting = false; st.frames++;
    await noteChanges();
    emit();
    const rate = reducedMotion() ? RATES[0] : st.fps;
    await sleep(1000 / rate - (Date.now() - t0));
    if (!alive()) return;
    const n = nextAfter(IntMapTime.when().getTime());
    if (n == null) {
      if (st.loop && st.from != null) { lastDrawn = null; st.changes = []; put(st.from); continue; }
      stopLapse('end'); return;
    }
    put(n);
  }
}
/* which ticked layers are drawn at this instant, against the frame before — «began to be stated» /
   «stopped being stated» (the kernel's own answers, with the row's own name) */
async function noteChanges() {
  try {
    const LT = W().IntMapLayerTime; if (!LT) return;
    const c = await LT.coverage(null, { on: true }); if (!c) return;
    const now = new Map();
    ['stated', 'carried', 'unknown'].forEach((k) => (c[k] || []).forEach((r) => now.set(r.id, { name: r.name, drawn: true })));
    (c.unstated || []).forEach((r) => now.set(r.id, { name: r.name, drawn: false }));
    if (lastDrawn) {
      const entered = [], left = [];
      now.forEach((v, id) => { const p = lastDrawn.get(id); if (p && p.drawn !== v.drawn) (v.drawn ? entered : left).push({ id, name: v.name }); });
      if (entered.length || left.length) st.changes.push({ at: IntMapTime.iso(), entered, left });
    }
    lastDrawn = now;
  } catch (_) { /* nothing to compare */ }
}

/** start({ from, to?, unit?, step?, fps?, loop? }) — from/to: a year (number) or an ISO date/instant; to omitted = the
    present. Starts at `from` unless the clock already stands inside the range. → lapseState() */
export function startLapse(o) {
  o = o || {};
  if (o.unit && UNITS.indexOf(o.unit) >= 0) st.unit = o.unit;
  if (o.step != null && Math.round(+o.step) >= 1) st.step = Math.round(+o.step);
  if (o.fps != null && RATES.indexOf(+o.fps) >= 0) st.fps = +o.fps;
  if (o.loop != null) st.loop = !!o.loop;
  const ms = (v, end) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number' || /^[+-]?\d{1,6}$/.test(String(v).trim())) { const y = Math.round(+v); return end && y >= new Date().getUTCFullYear() ? null : yearInstant(y); }
    const t = Date.parse(String(v)); return isFinite(t) ? t : null;
  };
  if (o.from !== undefined) st.from = ms(o.from, false);
  if (o.to !== undefined) st.to = ms(o.to, true);
  if (st.from == null) return Object.assign(lapseState(), { error: 'no-start' });
  if (st.to != null && st.to <= st.from) return Object.assign(lapseState(), { error: 'empty-range' });
  const floor = yearInstant(IntMapTime.min);
  if (st.from < floor) st.from = floor;
  const cur = IntMapTime.isLive() ? null : IntMapTime.when().getTime();
  const end = st.to == null ? Date.now() : st.to;
  st.ended = null; st.changes = []; st.frames = 0; lastDrawn = null;
  st.playing = true; const token = ++runToken;
  if (cur == null || cur < st.from || cur >= end) put(st.from);
  run(token);
  emit();
  return lapseState();
}
/** stop(reason?) — the clock stays where the lapse left it */
export function stopLapse(reason) {
  if (!st.playing) return lapseState();
  st.playing = false; st.waiting = false; st.ended = reason || 'stopped'; runToken++;
  emit();
  return lapseState();
}
/** what the player is doing — Atlas's state, its observer, the panel and the specs read this */
export function lapseState() {
  const iso = (ms) => (ms == null ? null : (HS() && HS().ymd ? HS().ymd(new Date(ms)) : new Date(ms).toISOString().slice(0, 10)));
  return {
    playing: st.playing, waiting: st.waiting, unit: st.unit, step: st.step, fps: st.fps,
    rate: reducedMotion() ? RATES[0] : st.fps, reducedMotion: reducedMotion(), loop: st.loop,
    from: iso(st.from), to: st.to == null ? null : iso(st.to), at: IntMapTime.isLive() ? null : IntMapTime.iso(),
    frames: st.frames, ended: st.ended, changes: st.changes.slice(),
  };
}
/** onLapse(fn) — fn(state) on every change; returns the unsubscribe */
export function onLapse(fn) { if (typeof fn !== 'function') return () => {}; subs.add(fn); return () => { subs.delete(fn); }; }
/* a hand on the clock pauses the player — the player is one writer, not the only one */
IntMapTime.on((e) => { if (st.playing && !ownWrite && e && e.source !== 'lapse') stopLapse('clock-moved'); });

/* ══ THE PANEL ROW — mounted into js/news-timeline.js's Chronos panel ═════════════════════════════════════ */
/**
 * @param {HTMLElement} el   the container (index.html #ntl-lapse)
 * @param {{ lang: () => string, mode: () => string }} host  the panel's language and its active tab
 */
export function mountLapse(el, host) {
  const d = D(); if (!el || !d) return null;
  const t = (en, jp) => IntMapLang.t(host.lang(), en, jp);
  const unitOfMode = (m) => (m === 'date' ? 'day' : m === 'time' ? 'hour' : 'year');
  if (!st.playing) st.unit = unitOfMode(host.mode());
  const node = (tag, cls, text) => { const n = d.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  /* the field type is the unit's: a year is a number, a day a date, an hour a local date-time */
  const fieldType = () => (st.unit === 'year' ? 'number' : st.unit === 'day' ? 'date' : 'datetime-local');
  const pad = (n) => String(n).padStart(2, '0');
  const fieldValue = (ms) => {
    if (ms == null) return '';
    const x = new Date(ms);
    if (st.unit === 'year') return String(x.getUTCFullYear());
    if (st.unit === 'day') return x.toISOString().slice(0, 10);
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()) + 'T' + pad(x.getHours()) + ':' + pad(x.getMinutes());
  };
  let lastPainted = '';
  function build() {
    el.replaceChildren();
    el.hidden = false;
    const head = node('div', 'ntl-lapse-head');
    const play = /** @type {HTMLButtonElement} */ (node('button', 'ntl-lapse-play'));
    play.type = 'button'; play.id = 'ntl-lapse-play';
    head.append(play, node('span', 'ntl-lapse-title', t('Time-lapse', 'タイムラプス')));
    const units = node('span', 'ntl-modes');
    UNITS.forEach((u) => {
      const b = /** @type {HTMLButtonElement} */ (node('button', 'ntl-mode' + (u === st.unit ? ' on' : ''), u === 'year' ? t('Years', '年') : u === 'day' ? t('Days', '日') : t('Hours', '時間')));
      b.type = 'button'; b.dataset.unit = u; b.disabled = st.playing;
      b.onclick = () => { if (st.playing) return; st.unit = /** @type {any} */ (u); st.from = null; st.to = null; build(); };
      units.appendChild(b);
    });
    head.appendChild(units);
    const range = node('div', 'ntl-lapse-row');
    const mk = (id, label, ms) => {
      const lb = node('label', 'ntl-lapse-f'); const sp = node('span', '', label);
      const inp = /** @type {HTMLInputElement} */ (node('input', 'ntl-lapse-in'));
      inp.id = id; inp.type = fieldType(); inp.value = fieldValue(ms);
      if (st.unit === 'year') { inp.step = '1'; inp.inputMode = 'numeric'; }
      lb.append(sp, inp); return { lb, inp };
    };
    const startMs = st.from != null ? st.from : (IntMapTime.isLive() ? null : IntMapTime.when().getTime());
    const f = mk('ntl-lapse-from', t('From', '開始'), startMs);
    const to = mk('ntl-lapse-to', t('To', '終了'), st.to);
    to.inp.placeholder = t('Now', '現在');
    const stp = /** @type {HTMLInputElement} */ (node('input', 'ntl-lapse-in ntl-lapse-step'));
    stp.type = 'number'; stp.min = '1'; stp.step = '1'; stp.value = String(st.step); stp.id = 'ntl-lapse-step';
    const sl = node('label', 'ntl-lapse-f'); sl.append(node('span', '', t('Step', '刻み')), stp);
    range.append(f.lb, to.lb, sl);
    const opts = node('div', 'ntl-lapse-row');
    const rates = node('span', 'ntl-modes'); rates.setAttribute('role', 'group'); rates.setAttribute('aria-label', t('Speed', '速度'));
    const rm = reducedMotion();
    RATES.forEach((r) => {
      const b = /** @type {HTMLButtonElement} */ (node('button', 'ntl-mode' + (r === st.fps ? ' on' : ''), (r < 1 ? '½' : String(r)) + '×'));
      b.type = 'button'; b.dataset.fps = String(r);
      b.title = t(r + ' frame(s) per second at most', '最大 毎秒 ' + r + ' コマ');
      b.disabled = rm && r !== RATES[0];
      b.onclick = () => { st.fps = r; rates.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); emit(); };
      rates.appendChild(b);
    });
    const loopL = node('label', 'ntl-lapse-loop');
    const loop = /** @type {HTMLInputElement} */ (node('input')); loop.type = 'checkbox'; loop.checked = st.loop; loop.id = 'ntl-lapse-loop';
    loop.onchange = () => { st.loop = loop.checked; emit(); };
    loopL.append(loop, node('span', '', t('Loop', 'ループ')));
    opts.append(node('span', 'ntl-lapse-k', t('Speed', '速度')), rates, loopL);
    const status = node('div', 'ntl-lapse-status'); status.id = 'ntl-lapse-status'; status.setAttribute('aria-live', 'polite');
    el.append(head, range, opts, status);
    if (rm) el.appendChild(node('div', 'ntl-lapse-note', t('Reduced motion is on in your system settings: the lapse plays at its slowest speed.', 'システム設定で「視差効果を減らす」が有効なため、最も遅い速度で再生します。')));
    play.onclick = () => {
      if (st.playing) { stopLapse('stopped'); return; }
      const read = (inp) => (inp.value === '' ? null : st.unit === 'year' ? Math.round(+inp.value) : st.unit === 'day' ? inp.value : new Date(inp.value).toISOString());
      const from = read(f.inp);
      if (from == null) { f.inp.focus(); paintStatus(t('Give a start', '開始を入れてください')); return; }
      const res = startLapse({ from, to: read(to.inp), unit: st.unit, step: Math.round(+stp.value) || 1 });
      if (res.error === 'empty-range') paintStatus(t('The end is before the start', '終了が開始より前です'));
    };
    paint(lapseState());
  }
  function paintStatus(s) { const n = el.querySelector('#ntl-lapse-status'); if (n) n.textContent = s; }
  function paint(s) {
    const play = /** @type {HTMLButtonElement|null} */ (el.querySelector('#ntl-lapse-play'));
    if (play) {
      play.classList.toggle('on', s.playing);
      const lbl = s.playing ? t('Pause the time-lapse', 'タイムラプスを一時停止') : t('Play the time-lapse', 'タイムラプスを再生');
      /* the glyph is drawn by css/intmap.css (.ntl-lapse-play / .on) — the transport's shapes, a triangle and two
         bars — so no markup is written here; the words are the label */
      play.title = lbl; play.setAttribute('aria-label', lbl);
    }
    el.querySelectorAll('[data-unit]').forEach((b) => { /** @type {HTMLButtonElement} */ (b).disabled = s.playing; });
    const last = s.changes.length ? s.changes[s.changes.length - 1] : null;
    const names = (rs) => rs.map((r) => r.name).join(t(', ', '、'));
    let line = '';
    if (s.playing && s.waiting) line = t('Waiting for the map to draw ', '地図の描画を待っています ') + (s.at || t('now', '現在'));
    else if (s.playing) line = (s.at || t('Now', '現在'));
    else if (s.ended === 'end') line = t('Reached the end', '終了時点に達しました');
    else if (s.ended === 'clock-moved') line = t('Paused — the clock was moved', '一時停止——時計が操作されました');
    if (last) {
      if (last.entered.length) line += (line ? ' · ' : '') + t('Began to be drawn at ', '描き始め ') + last.at + ': ' + names(last.entered);
      if (last.left.length) line += (line ? ' · ' : '') + t('Stopped being drawn at ', '描かれなくなった ') + last.at + ': ' + names(last.left);
    }
    if (line !== lastPainted) { paintStatus(line); lastPainted = line; }
  }
  build();
  onLapse(paint);
  return {
    /** the panel's tab moved — the lapse's unit follows it while nothing is playing */
    panelMode(m) { if (st.playing) return; const u = unitOfMode(m); if (u !== st.unit) { st.unit = /** @type {any} */ (u); st.from = null; st.to = null; build(); } },
    relabel() { build(); },
  };
}
