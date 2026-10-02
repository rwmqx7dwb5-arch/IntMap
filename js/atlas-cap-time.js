/* ============================================================================
 *  IntMap · Atlas capabilities — the `time.*` namespace   (js/atlas-cap-time.js)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place:
 *    row     its registry row (its columns are documented at «THE TABLE» in js/atlas-capabilities.js) — the id, the dispatch
 *            spelling, the aliases, the observer, the effects that are also its conflict keys …
 *    schema  its argument schema, built fresh on every call (the builders are in js/atlas-caps.js)
 *    run     what the dispatch runs for it: `run(a, dctx, K)` — the action, the execution context, and
 *            K, the Atlas kernel's internals it needs (js/atlas-console.js builds K; a `let` there is
 *            read and written as `K.name`, so the value is always the live one).
 *  The registry rows (copied into js/atlas-capabilities.js), the dispatch and the schema table are
 *  DERIVED from these entries — `node scripts/atlas-caps.mjs --write` rewrites what is generated after
 *  an entry is added or removed, and `npm run check:capabilities` fails while they disagree.
 *  (atlas-capability-single-source) An entry also holds `doc` — its fragment of each catalogue block the planner
 *  reads (js/atlas-catalog-text.js keeps only the blocks' order and headings) — and, where it has them, `phrases`,
 *  `policy`, `goal`, `chips` and `catalogueSilent`. js/atlas-caps.js says what each one is; nothing outside the
 *  entry names them.
 * ==========================================================================*/
import { str, bool, num, int } from './atlas-caps.js';
import { IntMapTime } from './chronos.js';

export default [
  {
    row: ['time.travel',                'timeTravel',     'setTime,timeSet',                                             'time',    'time',    'time',                   'map,time',            'session', 'none',   '',         ''],
    /* Chronos: a year, a date, a number of days — or the return to live. With none of them the
       case says «give a year or date», which is what this branch list makes it stop needing to. */
    doc: [
      { in: 'tools-panels', at: 220, text: '{"type":"timeTravel","year":int} (year uses astronomical numbering: 0 is 1 BC; supported range comes from the master clock) or {"type":"timeTravel","date":"YYYY-MM-DD"} or {"type":"timeTravel","daysAgo":int}, and {"type":"timeTravel","now":true} to return to live = CHRONOS, the MASTER SPACETIME CLOCK (window.IntMapTime; the panel bottom-right is called Chronos and 「time machine」 is its old name): it moves the WHOLE map together — the news feed, the Countries statistics (real World Bank figures for that year: GDP, population, life-expectancy…), the country choropleths, historical borders (and a country highlight drawn while a past year is shown uses that year\'s polity shapes), historical city names and Pleiades settlement-name records (approximate source periods and representative points, not exact founding dates or surveyed sites), the Köppen climate era, NATO/EU accession, the day/night terminator, the live-satellite positions and — while the chosen instant is inside the forecast window — the ECMWF weather layers. Use a YEAR for history ("1990年の世界", "show the world in 1949", "rewind to 1980"); use daysAgo/date for the recent decade of news. ⚠ THE HISTORICAL BORDERS ARE DAY-EXACT, NOT YEARLY (CShapes validity dates, 1886-2019: 369 distinct border-change days). A full "date" really does draw the world as it stood on THAT DAY, so when the user asks about a treaty, a partition, an independence or a dissolution, emit the date it took effect — {"type":"timeTravel","date":"1920-10-28"} — instead of rounding to the year. A bare year lands on mid-June and shows only the world in force then, which for a dense year is a small part of the story: 1920 alone contains fourteen border-change days and five genuinely different worlds. Prefer this over Earth Replay for setting the time; ' },
    ],
    schema: () => ({ type: 'object', properties: { year: int(), date: str(), daysAgo: int(), value: num(), now: bool(), reset: bool(), live: bool() }, anyOf: [{ required: ['year'] }, { required: ['date'] }, { required: ['daysAgo'] }, { required: ['value'] }, { required: ['now'] }, { required: ['reset'] }, { required: ['live'] }] }), /* `timeTravel` */
      /* (#R94) time-travel now drives the WHOLE spacetime OS (IntMapTime): news, the Countries statistics,
         borders, the climate era, NATO/EU accession & the day/night terminator all move together. Accepts a
         year (deep time back to `IntMapTime.min` — AD 1 since #R604), an exact date, or daysAgo; "now/reset" returns everything to live. */
    async run(a, dctx, K) { const res = await travel(a, dctx, K); return withCoverage(res, K); },
  },
  {
    row: ['time.coverage',              'timeCoverage',   'layerTime,whatCanBeDrawn',                                    'time',    'none',    '',                       'explanation',         'read',    'none',   '',         ''],
    /* (world-at-time) WHAT A MAP AT ONE INSTANT CAN DRAW — for every layer, from what its source states
       (js/layer-time-decl.js through js/layer-time-kernel.js), without switching anything on or moving
       the clock. `on` limits it to the ticked layers. No instant → the clock's. */
    doc: [
      { in: 'time.coverage', text: 'WHAT A MAP AT ONE INSTANT CAN DRAW: {"type":"timeCoverage","year"?:int (astronomical: 0 is 1 BC),"date"?:"YYYY-MM-DD","on"?:bool} = for EVERY layer (or only the ticked ones with on:true), whether its source states that instant — DRAWN (the source states it), DRAWN FROM ANOTHER DATE (a series past its last year, a dated snapshot on a later day — the layer names the date it shows), or NOT DRAWN (nothing states it: a live feed in the past, a modern snapshot before its date, a record outside its years) — with the reason in words. Nothing is switched on and the clock does not move. No year/date = the instant on the clock. Use for 「1914年の地図に何が描ける？」 / 「which layers work in 1600」 / before turning layers on for a past date. When the clock is in the past, a layer that states nothing about it is NOT drawn even with its box ticked, and its row says why — {"type":"timeTravel"} reports those ticked layers in its own result.' },
    ],
    schema: () => ({ type: 'object', properties: { year: int(), date: str(), on: bool() } }),
    async run(a, dctx, K) { return coverage(a, K); },
  },
  {
    row: ['time.compare',               'timeCompare',    'compareTime,compareYear',                                     'time',    'timeView', 'panel.compare,time.compare', 'panel,time',         'session', 'none',   '',         ''],
    /* (time-compare-lapse) THE COMPARISON WINDOW AT AN INSTANT OF ITS OWN — 「1914 年 | 今日」. Opens the window if it is
       closed, and sets ITS clock (js/compare.js `setTime`) without moving the main map's: a year, a date, «now», or
       `follow:true` to move with the main map again. The picked layer is judged at that instant by the main map's
       rule, so the result says what the window draws there and why not. */
    doc: [
      { in: 'time-compare', at: 10, text: '{"type":"timeCompare","year"?:int (astronomical: 0 is 1 BC),"date"?:"YYYY-MM-DD","now"?:bool,"follow"?:bool,"layer"?:str} = open the COMPARISON WINDOW (if closed) and set ITS OWN clock, leaving the main map\'s where it is — e.g. the main map at today and the window at 1914 («1914 | 今日»). follow:true makes the window move with the main map again. "layer" picks the window\'s layer (its key, e.g. "histb" for historical borders, or its name). The window draws its layer only where the layer\'s source states the window\'s instant (the same rule as the main map), and its historical borders are the borders OF THAT INSTANT; the result says what it draws and, when it does not, why. ' },
    ],
    schema: () => ({ type: 'object', properties: { year: int(), date: str(), now: bool(), follow: bool(), layer: str() }, anyOf: [{ required: ['year'] }, { required: ['date'] }, { required: ['now'] }, { required: ['follow'] }] }),
    async run(a, dctx, K) { return compareAt(a, K); },
  },
  {
    row: ['time.lapse',                 'timeLapse',      'playTime,playYears',                                          'time',    'timeView', 'time,time.lapse',        'time',                'session', 'none',   '',         ''],
    /* (time-compare-lapse) THE CLOCK PLAYED FORWARD — js/time-lapse.js: from a start to an end (default: the present) by
       a step in years, days or hours, one DRAWN frame at a time (a frame waits for the map to draw it). `play:false`
       stops it where it is. Layers begin and stop being drawn as their sources begin and stop stating the instants.
       (timelapse-video-export) `record:true` writes the same run to a video (js/map-recorder.js) — one video frame per drawn
       instant, the year, the data credits and the IntMap link burned into every frame — in a `size` (square · landscape ·
       portrait) and a `format` (mp4 · webm, the first the browser can record when none is asked); the Chronos panel shows
       the progress and offers Save when it ends. */
    doc: [
      { in: 'time-compare', at: 20, text: '{"type":"timeLapse","from":YEAR|"YYYY-MM-DD","to"?:YEAR|"YYYY-MM-DD" (default: the present),"unit"?:"year"|"day"|"hour","step"?:int,"fps"?:0.5|1|2|4,"loop"?:bool} = PLAY the main map\'s clock from "from" to "to" by "step" units, one frame per instant, each frame held until the map has drawn it (tiles in, layers judged, borders of that instant on screen) — layers begin and stop being drawn as their sources begin and stop stating the instants; {"type":"timeLapse","play":false} stops it where it is. Add "record":true (with "size"?:"square"|"landscape"|"portrait" — 1080×1080, 1920×1080, 1080×1920 — and "format"?:"mp4"|"webm") to WRITE THE SAME RUN TO A VIDEO the reader can save and post: one video frame per drawn instant (never a half-drawn or blank one), held for 1/fps; the instant, the data credits and the IntMap link are burned into every frame; the Chronos panel opens, shows the progress and offers Save (and Share where the device can) when the run ends — a stop before the end keeps nothing. Frame the region first (move the camera), then record: 「1900〜1950年のヨーロッパのタイムラプスを動画にして」 = the camera on Europe, then {"type":"timeLapse","from":"1900","to":"1950","record":true} (from/to are strings, a year or a date); 「縦長の動画で」 = size:"portrait". Use for 「1900年から1950年まで国境の変化を再生して」 / 「比較ウィンドウを1914年にして」. The current window instant and the lapse state are in the map state.' },
    ],
    schema: () => ({ type: 'object', properties: { play: bool(), from: str(), to: str(), year: int(), toYear: int(), unit: str(), step: int(), fps: num(), loop: bool(), record: bool(), size: str(), format: str() } }),
    async run(a, dctx, K) { return lapse(a, K); },
  },
];

/* ══ (time-compare-lapse) THE TWO NEW DOORS ═════════════════════════════════════════════════════════════════
   Each result carries `meta.want` — the state the call set out to reach, in the shape the observer reads
   (js/atlas-capabilities.js `timeView`): the verdict compares it with what the app reports AFTER, so a window
   that did not move or a lapse that did not start is not called done. */
async function compareAt(a, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, esc = K.esc;
  /* ⚠ READ OFF THE WINDOW'S PUBLISHED CONTROLLER, NOT IMPORTED FROM js/compare.js: this module is in Atlas's lazy chunk,
     and a lazy chunk importing js/compare.js (eager, and itself importing modules other lazy chunks share) split three
     shared modules out of the boot chunk — eager.requests 9 → 12, measured with scripts/perf-budget.mjs. */
  const C = window.IntMapCompare;
  if (!C || typeof C.setTime !== 'function') return R(false, warn('⚠ ' + L('The comparison window is not available', '比較ウィンドウが使えません')));
  C.open();
  if (a.layer) {
    /* a layer named for the window: the picker's own option, by its key or its visible name */
    const sel = document.getElementById('cmp-layers-sel');
    const want = String(a.layer).trim().toLowerCase();
    const opt = sel ? Array.from(sel.options).find((o) => o.value && (o.value.toLowerCase() === want || o.textContent.trim().toLowerCase() === want)) : null;
    if (opt && sel.value !== opt.value) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  }
  let spec;
  if (a.follow === true) spec = { follow: true };
  else if (a.now) spec = { now: true };
  else if (a.year != null) spec = { year: Math.round(+a.year) };
  else if (a.date) spec = { date: String(a.date) };
  else return R(false, warn('⚠ ' + L('Give the window a year, a date, now, or follow:true', '年・日付・now・follow:true のいずれかを指定してください')));
  if (spec.year != null && spec.year < IntMapTime.min) return R(false, warn('⚠ ' + L('Chronos reaches back to ' + IntMapTime.min, 'Chronos は ' + IntMapTime.min + ' 年まで遡れます')));
  const s = C.setTime(spec);
  /* the picked layer is judged asynchronously (js/compare.js applyTime) — the answer waits for that verdict */
  const st = await C.judged();
  const want = { compare: { open: true, follow: !!s.follow, live: s.live, iso: s.iso } };
  let h = '<div>' + esc(L('Compare window', '比較ウィンドウ')) + ': <b>' + esc(st.label) + '</b> | ' + esc(L('main map', 'メイン地図')) + ': ' + esc(st.main.label) + '</div>';
  if (st.layer && st.verdict) h += '<div>' + esc(st.held ? L('Not drawn here', 'ここでは描いていません') : L('Drawn', '描いています')) + (st.note || st.verdict.why ? ' — ' + esc(st.note || st.verdict.why) : '') + '</div>';
  return R(true, note('✓ ') + h, { want, compare: st });
}
async function lapse(a, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, esc = K.esc;
  const TL = await import('./time-lapse.js');
  if (a.play === false) { const s = TL.stopLapse('stopped'); return R(true, note('✓ ' + L('Time-lapse stopped at ', 'タイムラプスを停止: ') + esc(s.at || L('now', '現在'))), { want: { lapse: { playing: false } }, lapse: s }); }
  const from = a.from != null && a.from !== '' ? a.from : (a.year != null ? Math.round(+a.year) : null);
  const to = a.to != null && a.to !== '' ? a.to : (a.toYear != null ? Math.round(+a.toYear) : undefined);
  if (a.record) return record(a, from, to, TL, K);
  const s = TL.startLapse({ from, to, unit: a.unit, step: a.step, fps: a.fps, loop: a.loop });
  if (s.error === 'no-start') return R(false, warn('⚠ ' + L('Give the lapse a start (a year or a date)', 'タイムラプスの開始（年か日付）を指定してください')));
  if (s.error === 'empty-range') return R(false, warn('⚠ ' + L('The end is before the start', '終了が開始より前です')));
  const unitW = s.unit === 'year' ? L('year(s)', '年') : s.unit === 'day' ? L('day(s)', '日') : L('hour(s)', '時間');
  return R(true, note('✓ ' + L('Time-lapse playing', 'タイムラプスを再生中') + ': ' + esc(s.from) + ' → ' + esc(s.to || L('now', '現在')) + ' · ' + s.step + ' ' + unitW + ' · ' + s.rate + '×' + (s.loop ? ' · ' + L('loop', 'ループ') : '') + (s.reducedMotion ? ' · ' + L('reduced motion: slowest speed', '視差効果を減らす: 最も遅い速度') : '')), { want: { lapse: { playing: true } }, lapse: s });
}

/* (timelapse-video-export) THE LAPSE WRITTEN TO A VIDEO — the recorder sits in the Chronos panel's export row (js/time-lapse.js
   `openRecorder`), which is where the reader watches the progress and saves the file, so the panel is opened first. */
async function record(a, from, to, TL, K) {
  const R = K.R, L = K.L, warn = K.warn, note = K.note, esc = K.esc;
  if (from == null) return R(false, warn('⚠ ' + L('Give the lapse a start (a year or a date)', 'タイムラプスの開始（年か日付）を指定してください')));
  try { const tl = document.getElementById('news-timeline'), tg = document.getElementById('ntl-toggle'); if (tl && tg && tl.classList.contains('collapsed')) tg.click(); } catch (_) { /* no panel: openRecorder says so */ }
  const M = await TL.openRecorder();
  if (!M) return R(false, warn('⚠ ' + L('The export row of the Chronos panel is not available', 'Chronos パネルの書き出し欄が使えません')));
  const s = M.recordLapse({ from, to, unit: a.unit, step: a.step, fps: a.fps, size: a.size, format: a.format });
  if (s.error) {
    const why = s.error === 'unsupported' ? L('this browser cannot record video', 'このブラウザは動画を録画できません')
      : s.error === 'busy' ? L('a recording is already running', '別の録画が進行中です')
        : s.error === 'empty-range' ? L('the end is before the start', '終了が開始より前です')
          : L('the lapse has no start', 'タイムラプスの開始がありません');
    return R(false, warn('⚠ ' + L('Could not record: ', '録画できません: ') + esc(why)), { recording: s });
  }
  const l = TL.lapseState();
  const unitW = l.unit === 'year' ? L('year(s)', '年') : l.unit === 'day' ? L('day(s)', '日') : L('hour(s)', '時間');
  return R(true, note('✓ ' + L('Recording the time-lapse to a video', 'タイムラプスを動画に録画中') + ': ' + esc(l.from) + ' → ' + esc(l.to || L('now', '現在')) + ' · ' + l.step + ' ' + unitW
    + ' · ' + (l.total != null ? l.total + ' ' + L('frames', 'コマ') + ' · ' : '') + s.w + '×' + s.h + ' ' + esc(String(s.ext).toUpperCase()) + ' · ' + l.fps + ' ' + L('frames/s', 'コマ/秒')
    + ' — ' + L('each frame is written once the map has drawn it; the Chronos panel shows the progress and offers Save when it ends. The year, the data credits and the IntMap link are in every frame.', '地図が描き終えたコマだけを書き込みます。進み具合は Chronos パネルに出て、終わると保存できます。年・データの出典・IntMap のリンクはすべてのコマに入ります。')),
  { want: { lapse: { playing: true } }, lapse: l, recording: s });
}

async function travel(a, dctx, K) { const L = K.L, R = K.R, note = K.note, warn = K.warn, ymdISO = K.ymdISO;
      { try{ const T=IntMapTime;
          const synced=L('the whole map (news, countries, borders, climate era) moves with it','地図全体（ニュース・国データ・国境・気候区分）が同期します','die ganze Karte bewegt sich mit','вся карта движется вместе','todo el mapa se mueve con él');
          const nowMsg=()=>R(true, note('✓ '+L('Back to now','現在に戻しました','Zurück zu jetzt','Вернулись в настоящее','Volvimos al presente')));
          if(!T){ const sl=document.getElementById('ntl-slider'); if(sl){ let v=3650,da=(a.daysAgo!=null)?Math.round(+a.daysAgo):null; if(da==null&&a.date){ const t0=Date.parse(String(a.date)); if(!isNaN(t0)) da=Math.round((Date.now()-t0)/86400000); } if(da!=null) v=Math.max(0,Math.min(3650,3650-da)); else if(a.value!=null) v=+a.value; sl.value=v; sl.dispatchEvent(new Event('input',{bubbles:true})); } return R(true, note(L('Time set','時刻を設定しました','Zeit gesetzt','Время задано','Hora establecida'))); }   /* (#R108) explained, not a bare ✓ */
          if(a.reset||a.now||a.live){ T.setNow({source:'atlas'}); return nowMsg(); }
          const curY=new Date().getFullYear();
          let y=(a.year!=null)?Math.round(+a.year):null;
          if(y==null&&typeof a.date==='string'){ const m=a.date.match(/^\s*(\d{3,4})\s*$/); if(m) y=+m[1]; }
          /* ⚠⚠ (#R380) THE GUARD READ THE KERNEL AND THE SENTENCE BESIDE IT DID NOT. `y<T.min` has always
             been the real test, but the words were the literal 1900 in all nine languages — so when #R349
             moved the floor to 1850 (and #R604 to AD 1) this refusal went on telling every reader that 1875, a year the
             next statement accepts, is out of reach. The number now comes from the same place the test does. */
          if(y!=null){ if(y>=curY){ T.setNow({source:'atlas'}); return nowMsg(); } if(y<T.min) return R(false, warn('⚠ '+L('Chronos reaches back to {y}','Chronosは{y}年まで遡れます','Bis {y} zurück','До {y} года','Hasta {y}').replace(/\{y\}/g,String(T.min)))); T.setYear(y,{source:'atlas'}); return R(true, note(y+' — '+synced)); }
          if(a.date){ const t0=Date.parse(String(a.date)); if(!isNaN(t0)){ if(t0>Date.now()){ T.setNow({source:'atlas'}); return nowMsg(); } T.set(new Date(t0),{source:'atlas'}); return R(true, note(ymdISO(new Date(t0))+' — '+synced)); } }
          if(a.daysAgo!=null){ const da=Math.round(+a.daysAgo); if(da<=0){ T.setNow({source:'atlas'}); return nowMsg(); } T.setDaysAgo(da,{source:'atlas'}); return R(true, note(ymdISO(T.when())+' — '+synced)); }
          if(a.value!=null){ T.setDaysAgo(3650-(+a.value),{source:'atlas'}); return R(true, note(ymdISO(T.when()))); }
          return R(false, warn('⚠ '+L('Give a year or date','年か日付を指定してください','Jahr/Datum angeben','Укажите год/дату','Indica un año o fecha')));
        }catch(_){ return R(false, warn('⚠ '+L('Time machine unavailable','タイムマシンが使えません','Zeitmaschine nicht verfügbar','Машина времени недоступна','Máquina del tiempo no disponible'))); } }
}

/* ══ (world-at-time) THE TWO ANSWERS ABOUT WHAT THE MAP AT AN INSTANT CAN DRAW ══════════════════════
   One reader (window.IntMapLayerTime, js/layer-time-kernel.js), two doors: `time.coverage` asks about any
   instant and any layer; `time.travel` appends, for the instant it just moved to, the TICKED layers that
   are not drawn and the ones showing another date — so Atlas learns it in the same result that moved the
   clock, not by asking again (.agents/rules/one-pass-or-a-reason.md §2 ②). */
function coverageHtml(c, K, all) {
  const L = K.L, esc = K.esc;   /* the kernel's escaper, as every capability uses it */
  const line = (r) => '<li><b>' + esc(r.name) + '</b>' + (r.why ? ' — ' + esc(r.why) : '') + '</li>';
  const names = (rows) => rows.map((r) => esc(r.name)).join(L(', ', '、'));
  let h = '';
  if (c.unstated.length) h += '<div>' + esc(L('Not drawn — no source states this date', '描けない——この日時を述べる典拠がない')) + ' (' + c.unstated.length + ')</div><ul>' + c.unstated.map(line).join('') + '</ul>';
  if (c.carried.length) h += '<div>' + esc(L('Drawn from another date', '別の時点の記録で描く')) + ' (' + c.carried.length + ')</div><ul>' + c.carried.map(line).join('') + '</ul>';
  if (all && c.stated.length) h += '<div>' + esc(L('Drawn — the source states this date', '描ける——典拠がこの日時を述べている')) + ' (' + c.stated.length + '): ' + names(c.stated) + '</div>';
  if (c.unknown.length) h += '<div>' + esc(L('Range read when the layer loads', '範囲は読み込み時に分かる')) + ' (' + c.unknown.length + '): ' + names(c.unknown) + '</div>';
  return h;
}
async function coverage(a, K) {
  const R = K.R, L = K.L, warn = K.warn, esc = K.esc;
  const LT = window.IntMapLayerTime;
  if (!LT) return R(false, warn('⚠ ' + L('The layer time table is not available', 'レイヤーの時間表が使えません')));
  let when = null;
  if (a.year != null) when = Math.round(+a.year);
  else if (a.date) when = String(a.date);
  const c = await LT.coverage(when, { on: !!a.on });
  if (!c) return R(false, warn('⚠ ' + L('Give a year or an ISO date', '年か ISO 形式の日付を指定してください')));
  const day = c.at.live ? L('now', '現在') : c.at.date.slice(0, 10);
  return R(true, '<div>' + esc(L('What the map at ' + day + ' can draw', day + ' の地図に描けるもの')) + '</div>' + coverageHtml(c, K, true), { coverage: c });
}
async function withCoverage(res, K) {
  try {
    const LT = window.IntMapLayerTime, T = IntMapTime;
    if (!res || !res.ok || !LT || !T || T.isLive()) return res;
    const c = await LT.coverage(null, { on: true });
    if (!c || (!c.unstated.length && !c.carried.length)) return res;
    return Object.assign({}, res, { html: (res.html || '') + coverageHtml(c, K, false), coverage: c });
  } catch (_) { return res; }
}
