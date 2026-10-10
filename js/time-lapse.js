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
 *  ⚠ (timelapse-video-export) A FRAME CAN HAVE A SINK. `startLapse({ …, sink })` hands every drawn frame to
 *  `sink.frame(state)` and waits for it instead of the dwell — js/map-recorder.js films it and holds it for its own
 *  1/fps of recorded time — and `sink.end(reason)` hears how the run ended. Only drawn frames reach it (the three
 *  conditions above), so a recording has no blank and no half-drawn instant. The export row beside the lapse
 *  (index.html #ntl-rec) is mounted here and fetches the recorder only when it is opened (`openRecorder`).
 *  ⚠ (time-index-unify) A RUN CAN BE A LIST OF INSTANTS. A forecast model publishes its valid times unevenly (hourly,
 *  then every three, then every six hours), and two players used to step them, each with its own timer: the weather
 *  legend's (js/wx-ecmwf.js `play`, the model's own index every 700 ms) and the Chronos panel's forecast transport
 *  (js/news-timeline.js `fcPlay`, the clock every 900 ms) — both could run at once, one moving the model behind the
 *  clock's back. Both are now THIS player: `startLapse({ instants, at, loop, owner })` plays the clock through exactly
 *  the instants given (each set with `allowFuture`, since a forecast is ahead of now), frame by drawn frame like any
 *  lapse, and `owner` names who started it ('forecast:<model id>') so each view can say whether it is ITS run that is
 *  playing (`lapseOwner`). One page, one player: starting one run ends the other.
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';

/** the units a frame steps by — the Chronos panel's three tabs (year / date / time) */
const UNITS = Object.freeze(['year', 'day', 'hour']);
/* the rates offered, in frames per second. The slowest is also the rate a reader who asked the system for
   reduced motion is held to. A rate is a ceiling: a frame is never shorter than the map takes to draw it. */
const RATES = Object.freeze([0.5, 1, 2, 4]);

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
  frames: 0, /** @type {number|null} */ total: null, /** @type {string|null} */ ended: null,
  /** @type {{at:string, entered:{id:string,name:string}[], left:{id:string,name:string}[]}[]} */ changes: [],
};
/** (time-index-unify) the instants of a list run (ms, ascending) and who started the run — null for a stepped run
    @type {number[]|null} */
let list = null;
/** @type {string|null} */
let owner = null;
/** @type {Map<string,{name:string,drawn:boolean}>|null} */
let lastDrawn = null;
let runToken = 0;
/** the frame sink of this run (js/map-recorder.js) — null when the lapse is only played on screen
    @type {{frame:(s:any)=>Promise<boolean>, end:(reason:string)=>void}|null} */
let sink = null;
let ownWrite = false;
/** @type {Set<(s:any)=>void>} */
const subs = new Set();
const emit = () => { const s = lapseState(); subs.forEach((f) => { try { f(s); } catch (_) { /* a reader */ } }); };

/** the next instant after `ms` by the player's step, or null past the end */
/** how many instants the run from st.from to its end holds — what a recording's progress counts against */
function countFrames() {
  if (list) return list.length;
  if (st.from == null) return null;
  const end = st.to == null ? Date.now() : st.to;
  if (st.unit === 'year') {
    const a = new Date(st.from).getUTCFullYear(), b = new Date(end).getUTCFullYear();
    let n = Math.floor((b - a) / st.step) + 1;
    while (n > 1 && yearInstant(a + (n - 1) * st.step) > end) n--;
    return n;
  }
  return Math.floor((end - st.from) / (st.step * (st.unit === 'day' ? DAY : HOUR))) + 1;
}
function nextAfter(ms) {
  if (list) { for (const t of list) if (t > ms) return t; return null; }
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
    if (list) IntMapTime.set(new Date(ms), { source: 'lapse', allowFuture: true });   /* a listed instant is set as given — a forecast's is ahead of now */
    else if (ms >= Date.now()) IntMapTime.setNow({ source: 'lapse' });
    else if (st.unit === 'year') IntMapTime.setYear(new Date(ms).getUTCFullYear(), { source: 'lapse' });
    else IntMapTime.set(new Date(ms), { source: 'lapse' });
  } finally { ownWrite = false; }
}
const frame = () => new Promise((r) => { try { requestAnimationFrame(() => r(true)); } catch (_) { setTimeout(() => r(true), 16); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/** has the map drawn the instant on the clock? true / false — or null where nobody can be asked.
    (sales-next) Exported as `mapDrawn`: the classroom worksheet (js/tour-worksheet.js) pictures each step of a tour only
    once the map has drawn it, by THIS reading — a second «is it drawn» would drift from the one the lapse holds frames to. */
export async function mapDrawn() { return drawnNow(); }
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
    if (sink) {
      /* a recording: the sink films the frame and holds it for its own time — no screen dwell on top of it */
      const k = sink; let ok = false;
      try { ok = (await k.frame(lapseState())) !== false; } catch (_) { ok = false; }
      if (!alive()) return;
      if (!ok) { stopLapse('record-failed'); return; }
    } else {
      const rate = reducedMotion() ? RATES[0] : st.fps;
      await sleep(1000 / rate - (Date.now() - t0));
      if (!alive()) return;
    }
    const n = nextAfter(IntMapTime.when().getTime());
    if (n == null) {
      if (st.loop && !sink && st.from != null) { lastDrawn = null; st.changes = []; put(st.from); continue; }
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

/** start({ from, to?, unit?, step?, fps?, loop?, sink? }) — from/to: a year (number) or an ISO date/instant; to omitted = the
    present. Starts at `from` unless the clock already stands inside the range (a recording always starts at `from`,
    and does not loop). → lapseState() */
export function startLapse(o) {
  o = o || {};
  /* (time-index-unify) a list of instants — the clock is played through exactly these (header) */
  if (Array.isArray(o.instants)) {
    const L = [...new Set(o.instants.map(Number).filter((x) => isFinite(x)))].sort((a, b) => a - b);
    if (!L.length) return Object.assign(lapseState(), { error: 'no-start' });
    if (sink) { const k = sink; sink = null; try { k.end('replaced'); } catch (_) { /* the recorder */ } }
    list = L; owner = o.owner ? String(o.owner) : null;
    st.unit = 'hour'; st.step = 1; st.from = L[0]; st.to = L[L.length - 1];
    if (o.fps != null && RATES.indexOf(+o.fps) >= 0) st.fps = +o.fps;
    if (o.loop != null) st.loop = !!o.loop;
    st.ended = null; st.changes = []; st.frames = 0; lastDrawn = null; st.total = L.length;
    st.playing = true; const token = ++runToken;
    /* start where the caller stands (the nearest listed instant), else at the first */
    const at = o.at != null && isFinite(+o.at) ? L.reduce((b, t) => (Math.abs(t - +o.at) < Math.abs(b - +o.at) ? t : b), L[0]) : L[0];
    if (IntMapTime.isLive() || IntMapTime.when().getTime() !== at) put(at);
    run(token);
    emit();
    return lapseState();
  }
  list = null; owner = o.owner ? String(o.owner) : null;
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
  /* a run that replaces a recording ends that recording first — it hears why */
  if (sink) { const k = sink; sink = null; try { k.end('replaced'); } catch (_) { /* the recorder */ } }
  sink = o.sink && typeof o.sink.frame === 'function' ? o.sink : null;
  st.ended = null; st.changes = []; st.frames = 0; lastDrawn = null; st.total = countFrames();
  st.playing = true; const token = ++runToken;
  if (sink || cur == null || cur < st.from || cur >= end) put(st.from);
  run(token);
  emit();
  return lapseState();
}
/** stop(reason?) — the clock stays where the lapse left it */
export function stopLapse(reason) {
  if (!st.playing) return lapseState();
  st.playing = false; st.waiting = false; st.ended = reason || 'stopped'; runToken++;
  const k = sink; sink = null;
  if (k) { try { k.end(st.ended); } catch (_) { /* the recorder */ } }
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
    frames: st.frames, total: st.total, recording: !!sink, ended: st.ended, changes: st.changes.slice(),
    owner, instants: list ? list.length : null,
  };
}
/** (time-index-unify) who started the run that is playing — 'forecast:<model id>' for a forecast — or null when nothing plays */
export function lapseOwner() { return st.playing ? owner : null; }
/** the rates a run may be played at, frames per second (the panel's speed buttons) */
export const LAPSE_RATES = RATES;
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
  /** @type {{f:HTMLInputElement, to:HTMLInputElement, stp:HTMLInputElement}|null} */
  let form = null;
  const t = IntMapLang.pick(() => host.lang());
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
    form = { f: f.inp, to: to.inp, stp };
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
      const s = readForm();
      if (s.error) { f.inp.focus(); paintStatus(t('Give a start', '開始を入れてください')); return; }
      const res = startLapse({ from: s.from, to: s.to, unit: s.unit, step: s.step });
      if (res.error === 'empty-range') paintStatus(t('The end is before the start', '終了が開始より前です'));
    };
    paint(lapseState());
  }
  /* the range as the reader set it in the fields — what Play starts and what the export row records */
  function readForm() {
    if (!form) return { error: 'no-start' };
    const read = (inp) => (inp.value === '' ? null : st.unit === 'year' ? Math.round(+inp.value) : st.unit === 'day' ? inp.value : new Date(inp.value).toISOString());
    const from = read(form.f);
    if (from == null) return { error: 'no-start' };
    return { from, to: read(form.to), unit: st.unit, step: Math.round(+form.stp.value) || 1, fps: st.fps };
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
    if (s.recording) line = t('Recording', '録画中') + ' · ' + line;
    if (last) {
      if (last.entered.length) line += (line ? ' · ' : '') + t('Began to be drawn at ', '描き始め ') + last.at + ': ' + names(last.entered);
      if (last.left.length) line += (line ? ' · ' : '') + t('Stopped being drawn at ', '描かれなくなった ') + last.at + ': ' + names(last.left);
    }
    if (line !== lastPainted) { paintStatus(line); lastPainted = line; }
  }
  /* the export row (index.html #ntl-rec): one button until it is opened — the recorder is fetched then */
  const recEl = d.getElementById('ntl-rec');
  recHost = { lang: host.lang, settings: readForm };
  function buildRec() {
    if (!recEl || recMount) return;
    recEl.replaceChildren(); recEl.hidden = false;
    const b = /** @type {HTMLButtonElement} */ (node('button', 'ntl-rec-open', t('Export video or image', '動画・画像に書き出す')));
    b.type = 'button'; b.id = 'ntl-rec-open';
    b.onclick = () => { openRecorder(); };
    recEl.appendChild(b);
  }
  build();
  buildRec();
  onLapse(paint);
  mounted();
  return {
    /** the panel's tab moved — the lapse's unit follows it while nothing is playing */
    panelMode(m) { if (st.playing) return; const u = unitOfMode(m); if (u !== st.unit) { st.unit = /** @type {any} */ (u); st.from = null; st.to = null; build(); } },
    relabel() { build(); buildRec(); if (recMount) recMount.then((r) => { if (r && r.ui) r.ui.relabel(); }); },
  };
}

/* ══ THE EXPORT ROW'S RECORDER — fetched on first use (js/map-recorder.js) ═══════════════════════════════════ */
/** @type {{lang:()=>string, settings:()=>any}|null} */
let recHost = null;
/** @type {Promise<{M:any, ui:any}|null>|null} */
let recMount = null;
/** @type {()=>void} */
let mounted = () => {};
const whenMounted = new Promise((r) => { mounted = () => r(true); });
/** openRecorder() → Promise<the recorder module | null> — mounts the export row's recorder into #ntl-rec (once). Waits
    for the panel to have mounted the lapse (Atlas may open the panel and ask in the same breath); null when there is
    no panel to put it in. */
export async function openRecorder() {
  if (!recHost) await Promise.race([whenMounted, sleep(15000)]);
  const d = D(); const el = d && d.getElementById('ntl-rec');
  if (!el || !recHost) return null;
  const host = recHost;
  if (!recMount) recMount = import('./map-recorder.js').then((M) => ({ M, ui: M.mountRecorder(el, host) })).catch(() => { recMount = null; return null; });
  const r = await recMount;
  return r ? r.M : null;
}
