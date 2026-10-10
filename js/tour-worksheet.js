/* ============================================================================
 *  IntMap · THE CLASSROOM WORKSHEET — a tour on paper   (js/tour-worksheet.js)
 * ----------------------------------------------------------------------------
 *  「授業で即使える営業資産」 (sales-next, 2026-10-03). A classroom tour (js/tours.js, played by
 *  js/tour-player.js) is a lesson on a projector. What a class works on at its desks is paper: each step's
 *  map, the question asked about it, and room to write the answer. Before this file the only way to get
 *  that was to screenshot every step by hand and paste them into a word processor — the map without its
 *  legend, and without the credits its data's licences require.
 *
 *  WHAT IT DOES. `makeWorksheet()` walks the tour that is playing through the player itself (`go(n)` —
 *  the share link's own restore and the player's read-back), waits until the map has DRAWN each step by
 *  the reading the time-lapse holds its frames to (js/time-lapse.js `mapDrawn`), and pictures it with the
 *  map postcard (js/map-recorder.js `postcard` — the same picture, legends and burned-in credits as the
 *  share panel's Image tab; there is no second compositor). Then it returns the map to the step the
 *  teacher was on and opens a print preview:
 *    · the STUDENT sheet — the tour's title, the curriculum unit it is declared for, a line for the class /
 *      number / name, and for every step its title, the date the map shows, the map, the question and
 *      lines to answer on;
 *    · the TEACHER sheet — the same, with what to read out, and for a declared tour the short address that
 *      opens each step (`index.html?tour=<id>&step=<n>` — the player restores a step from that alone).
 *  Every credit any step's picture carries is also listed in text at the foot (the pictures carry them too).
 *  Print is the browser's own (`window.print()` — paper or PDF); nothing is uploaded and nothing is stored.
 *
 *  ⚠ A STEP THAT WAS NOT DRAWN IS NOT PICTURED. A hidden tab draws nothing (the postcard says `not-drawn`),
 *  and a step whose map did not finish drawing within DRAW_WAIT_MS is not pictured half-drawn: the sheet
 *  says, in its place, that the map could not be pictured, and the result names the step. «Not observed»
 *  is not «failed» and is not «done» (.agents/rules/one-pass-or-a-reason.md §5).
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7). The tour's own words are the tour's.
 *  ⚠ No `window` global is published: the player and Atlas import this file by name.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';
import { CURRICULUM } from './showcase.js';
import { tourQuery } from './tours.js';
import { playingTour, go, status, readerLang } from './tour-player.js';
import { iconNode } from './icons.js';

const lang = () => { try { return readerLang(); } catch (_) { return 'en'; } };
const T = IntMapLang.pick(() => lang());
const LA = /** @type {(...a: string[]) => string[]} */ (IntMapLang.pickArgs());   /* the tuple helper js/tours.js uses */

/* How long one step may take to be drawn before the sheet says it could not be pictured.
   ESTIMATE (2026-10-03, not a measurement of a slow network): the slowest step of the declared tours is a
   historical date, which loads the border bundles and the tiles of a zoom-3 view of a continent; on a
   school network that is seconds, not tens of seconds. 30 s leaves an order of magnitude. Invalid if a
   declared step is ever measured to need longer — then this says «could not be pictured» about a step that
   would have drawn, which the sheet makes visible (the step is named), not silent. */
export const DRAW_WAIT_MS = 30000;
/* how often «has it drawn?» is asked — a timer, not an animation frame, so a hidden tab ends the wait at
   the bound instead of never (the postcard then reports the hidden tab itself) */
const POLL_MS = 250;
/* lines to answer on under each question — what one A4 step leaves room for under a 1200×630 map at the
   sheet's width (two steps to a page with the header). A layout choice, held here and nowhere else. */
export const ANSWER_LINES = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** wait until the map has drawn what is on the clock (js/time-lapse.js mapDrawn) → true, or false at the bound */
async function drawn(TL, bound) {
  const t0 = Date.now();
  for (;;) {
    let ok = false; try { ok = !!(await TL.mapDrawn()); } catch (_) { ok = false; }
    if (ok) return true;
    if (Date.now() - t0 >= bound) return false;
    await sleep(POLL_MS);
  }
}

/* ══ THE SHEET AS DATA — pure, so it can be held by a test without a browser ═════════════════════════════
   tour: playingTour() · shots: one per step { ok, url, w, h, instant, credits, error } · o: { teacher, lang,
   site: { name, link }, base: the page's directory URL, made: Date }  → the model the DOM is built from. */
export function sheetModel(tour, shots, o) {
  o = o || {};
  const L = o.lang || 'en'; const t = IntMapLang.pick(() => L);
  const units = (tour.curriculum || []).map((k) => CURRICULUM[k]).filter(Boolean)
    .map((c) => IntMapLang.t(L, c.subject[0], c.subject[1]) + ' — ' + IntMapLang.t(L, c.item[0], c.item[1]));
  const credits = [];
  (shots || []).forEach((s) => { ((s && s.credits) || []).forEach((c) => { const k = String(c || '').trim(); if (k && credits.indexOf(k) < 0) credits.push(k); }); });
  /* a declared tour's step opens from its short address alone (js/tour-player.js — the player restores the step);
     a written or assembled tour has no short address, so none is printed */
  const declared = !tour.custom && !tour.temp;
  const steps = (tour.steps || []).map((st, i) => {
    const sh = (shots || [])[i] || {};
    return {
      n: i + 1, title: st.title || t('Step ', 'ステップ ') + (i + 1), instant: sh.instant || '',
      image: sh.ok && sh.url ? { url: sh.url, w: sh.w, h: sh.h } : null,
      imageError: sh.ok ? '' : (sh.error || 'not-drawn'),
      ask: st.ask || '', say: o.teacher ? (st.say || '') : '',
      link: o.teacher && declared && o.base ? o.base + 'index.html' + tourQuery(tour.id, i + 1) : '',
    };
  });
  const made = o.made instanceof Date ? o.made : new Date();
  return {
    teacher: !!o.teacher, lang: L, title: tour.title || t('Classroom tour', '授業ツアー'), units, steps, credits,
    site: (o.site && o.site.name) || '', siteLink: (o.site && o.site.link) || '',
    made: made.getFullYear() + '-' + String(made.getMonth() + 1).padStart(2, '0') + '-' + String(made.getDate()).padStart(2, '0'),
    pictured: steps.filter((s) => s.image).length,
  };
}

/* ══ PICTURING THE STEPS ═══════════════════════════════════════════════════════════════════════════════ */
let running = null;   /* one worksheet at a time: a second press while the first walks the tour is the same run */
/** @type {{ tour: any, shots: any[] } | null} */ let last = null;

/**
 * makeWorksheet({ teacher? }) → Promise<{ ok, reason?, title, steps, pictured, missing: [{ step, error }], credits }>
 * Pictures every step of the tour that is playing and opens the print preview. `reason`: 'no-tour', 'cancelled'
 * (the tour was left while it was being pictured), 'unavailable' (the recorder could not be loaded).
 */
export function makeWorksheet(o) {
  if (running) return running;
  running = run(o || {}).finally(() => { running = null; });
  return running;
}
/* the postcard and the lapse's drawn reading — fetched when a worksheet is made, never at start-up */
async function recorder() {
  try { const R = await import('./map-recorder.js'); const TL = await import('./time-lapse.js'); return { R, TL }; } catch (_) { return null; }
}
async function run(o) {
  const tour = playingTour();
  if (!tour) return { ok: false, reason: 'no-tour' };
  const mods = await recorder(); if (!mods) return { ok: false, reason: 'unavailable', title: tour.title };
  const { R, TL } = mods;
  const back = tour.step, N = tour.steps.length, shots = [];
  progress(0, N);
  for (let i = 0; i < N; i++) {
    progress(i + 1, N);
    const r = await go(i + 1);
    if (!status()) { progress(-1, N); release(shots); return { ok: false, reason: 'cancelled', title: tour.title }; }
    if (r && r.reason === 'no-link') { shots.push({ ok: false, error: 'no-link' }); continue; }
    if (!(await drawn(TL, DRAW_WAIT_MS))) { shots.push({ ok: false, error: 'not-drawn-in-time' }); continue; }
    let pc = null; try { pc = await R.postcard({ size: 'card', lang: lang() }); } catch (_) { pc = null; }
    if (!pc || !pc.ok) { shots.push({ ok: false, error: (pc && pc.error) || 'encoder' }); continue; }
    /* the postcard keeps only its LAST object URL alive (it revokes the one before); the sheet keeps its own */
    shots.push({ ok: true, url: URL.createObjectURL(pc.blob), w: pc.w, h: pc.h, instant: pc.instant, credits: pc.credits, applied: !!(r && r.ok) });
  }
  if (status()) await go(back);
  progress(-1, N);
  if (last) release(last.shots);
  last = { tour, shots };
  open(!!o.teacher);
  const missing = shots.map((s, i) => (s.ok ? null : { step: i + 1, error: s.error })).filter(Boolean);
  const m = sheetModel(tour, shots, { lang: lang() });
  return { ok: true, title: tour.title, steps: N, pictured: m.pictured, missing, credits: m.credits,
    unapplied: shots.map((s, i) => (s.ok && !s.applied ? i + 1 : null)).filter(Boolean) };
}
function release(shots) { (shots || []).forEach((s) => { if (s && s.url) { try { URL.revokeObjectURL(s.url); } catch (_) { /* gone */ } } }); }

/* ══ THE PREVIEW AND THE PAGE — built with the DOM (text is text, a picture's address is an object URL we made) ══ */
const CSS = [
  /* the progress chip while the steps are pictured: the map stays in view (it is what is being pictured) */
  '#im-worksheet-progress{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:var(--z-modal);padding:9px 16px;border-radius:999px;background:color-mix(in srgb,var(--card-bg) 94%,transparent);color:var(--text-main);box-shadow:var(--shadow);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);font-size:13px;font-weight:600;}',
  '#im-worksheet{position:fixed;inset:0;z-index:var(--z-modal);overflow:auto;background:rgba(30,30,34,0.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);}',
  '#im-worksheet .imw-bar{position:sticky;top:0;z-index:calc(var(--z-inset) + 1);display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 18px;background:color-mix(in srgb,var(--card-bg) 94%,transparent);color:var(--text-main);box-shadow:0 1px 0 rgba(128,128,128,0.2);backdrop-filter:saturate(180%) blur(22px);-webkit-backdrop-filter:saturate(180%) blur(22px);}',
  '#im-worksheet .imw-bar h2{margin:0;font-size:16px;flex:1 1 auto;min-width:0;}',
  '#im-worksheet .imw-seg{display:flex;gap:2px;padding:2px;border-radius:10px;background:var(--input-bg);}',
  '#im-worksheet .imw-seg button{min-height:34px;padding:0 14px;border:none;border-radius:8px;background:none;color:var(--text-muted);font:inherit;font-size:13px;font-weight:600;cursor:pointer;}',
  '#im-worksheet .imw-seg button[aria-pressed="true"]{background:var(--popup-bg);color:var(--text-main);box-shadow:0 1px 3px rgba(0,0,0,0.12);}',
  '#im-worksheet .imw-b{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;border-radius:12px;border:1px solid rgba(128,128,128,0.25);background:var(--input-bg);color:var(--text-main);font:inherit;font-size:14px;font-weight:600;cursor:pointer;}',
  '#im-worksheet .imw-b.imw-print{background:var(--primary-fill);border-color:transparent;color:#fff;}',
  '#im-worksheet .imw-b:focus-visible,#im-worksheet .imw-seg button:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px;}',
  '#im-worksheet .imw-status{width:100%;font-size:12px;color:var(--text-muted);}',
  /* the paper: always black on white, whatever the app's theme — it is what the printer gets */
  '#im-worksheet .imw-paper{box-sizing:border-box;width:min(210mm,calc(100vw - 24px));margin:18px auto 40px;padding:14mm 13mm;background:#fff;color:#111;border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,0.35);font:13px/1.5 system-ui,-apple-system,"Hiragino Sans","Yu Gothic UI","Noto Sans JP",sans-serif;}',
  '#im-worksheet .imw-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:10px;}',
  '#im-worksheet .imw-head h1{margin:0;font-size:19px;line-height:1.25;}',
  '#im-worksheet .imw-kind{flex:0 0 auto;font-size:11px;font-weight:700;border:1.5px solid #111;border-radius:4px;padding:1px 7px;}',
  '#im-worksheet .imw-unit{margin:2px 0 0;font-size:11.5px;color:#444;}',
  '#im-worksheet .imw-who{display:flex;gap:18px;margin:6px 0 12px;font-size:12.5px;}',
  '#im-worksheet .imw-who span{flex:1 1 0;border-bottom:1px solid #111;padding-bottom:2px;white-space:nowrap;}',
  '#im-worksheet .imw-who span.imw-name{flex:3 1 0;}',
  '#im-worksheet .imw-step{break-inside:avoid;page-break-inside:avoid;margin:0 0 14px;}',
  '#im-worksheet .imw-step h3{margin:0 0 4px;font-size:14.5px;display:flex;gap:8px;align-items:baseline;}',
  '#im-worksheet .imw-step h3 small{font-size:11.5px;font-weight:500;color:#555;}',
  '#im-worksheet .imw-step img{display:block;width:100%;height:auto;border:1px solid #bbb;border-radius:3px;}',
  '#im-worksheet .imw-miss{display:flex;align-items:center;justify-content:center;aspect-ratio:1200/630;border:1.5px dashed #999;border-radius:3px;color:#555;font-size:12.5px;padding:12px;text-align:center;}',
  '#im-worksheet .imw-say{margin:6px 0 0;font-size:12px;color:#333;border-left:3px solid #999;padding-left:8px;}',
  '#im-worksheet .imw-link{margin:3px 0 0;font-size:10.5px;color:#555;word-break:break-all;}',
  '#im-worksheet .imw-ask{margin:7px 0 0;font-weight:600;}',
  '#im-worksheet .imw-ask b{font-size:11px;margin-right:6px;border:1px solid #111;border-radius:3px;padding:0 5px;}',
  '#im-worksheet .imw-lines{margin-top:2px;}',
  '#im-worksheet .imw-lines div{height:8.5mm;border-bottom:1px solid #999;}',
  '#im-worksheet .imw-foot{margin-top:10px;padding-top:6px;border-top:1px solid #999;font-size:9.5px;color:#444;}',
  '@media print{',
  '  html[data-worksheet],html[data-worksheet] body{height:auto !important;overflow:visible !important;background:#fff !important;}',
  '  html[data-worksheet] body > *:not(#im-worksheet){display:none !important;}',
  '  html[data-worksheet] #im-worksheet{position:static !important;display:block !important;overflow:visible !important;background:#fff !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}',
  '  html[data-worksheet] #im-worksheet .imw-bar{display:none !important;}',
  '  html[data-worksheet] #im-worksheet .imw-paper{width:auto;margin:0;padding:0;box-shadow:none;border-radius:0;}',
  '  @page{size:A4;margin:12mm;}',
  '}',
].join('\n');
let styled = false;
function style() { if (styled) return; styled = true; const st = document.createElement('style'); st.id = 'im-worksheet-css'; st.textContent = CSS; document.head.appendChild(st); }

function progress(k, N) {
  style();
  let el = document.getElementById('im-worksheet-progress');
  if (k < 0) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'im-worksheet-progress'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.textContent = k === 0 ? T('Preparing the worksheet…', 'ワークシートを準備しています…')
    : T('Picturing step ' + k + ' of ' + N + ' for the worksheet…', 'ワークシート用にステップ ' + k + ' / ' + N + ' を撮っています…');
}

const node = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = String(text); return n; };
const MISS = {
  'not-drawn': LA('The map could not be pictured — keep this tab in front and make the worksheet again.', '地図を撮れませんでした——このタブを前面にして、もう一度ワークシートを作ってください。'),
  'not-drawn-in-time': LA('The map had not finished drawing, so it was not pictured. Make the worksheet again.', '地図の描画が終わらなかったため、撮っていません。もう一度ワークシートを作ってください。'),
  'no-link': LA('This step names no map.', 'このステップには地図がありません。'),
  busy: LA('A time-lapse is being recorded; the map was not pictured.', 'タイムラプスの録画中のため、地図を撮っていません。'),
};

/** the page, from the model */
function buildPaper(m) {
  const t = IntMapLang.pick(() => m.lang);
  const paper = node('article', 'imw-paper'); paper.setAttribute('lang', IntMapLang.htmlTag(m.lang));
  const head = node('header', 'imw-head'); const hl = node('div');
  hl.appendChild(node('h1', null, m.title));
  m.units.forEach((u) => hl.appendChild(node('p', 'imw-unit', t('Curriculum (Japan, upper secondary): ', '学習指導要領（高等学校 地理歴史）: ') + u)));
  head.append(hl, node('span', 'imw-kind', m.teacher ? t('Teacher', '教員用') : t('Student', '生徒用')));
  paper.appendChild(head);
  if (!m.teacher) {
    const who = node('div', 'imw-who');
    who.append(node('span', null, t('Class', '組')), node('span', null, t('No.', '番号')), node('span', 'imw-name', t('Name', '氏名')));
    paper.appendChild(who);
  }
  m.steps.forEach((s) => {
    const sec = node('section', 'imw-step');
    const h = node('h3', null, s.n + '. ' + s.title); if (s.instant) h.appendChild(node('small', null, s.instant)); sec.appendChild(h);
    if (s.image) { const img = /** @type {HTMLImageElement} */ (node('img')); img.src = s.image.url; img.width = s.image.w; img.height = s.image.h; img.alt = t('Map: ', '地図: ') + s.title + (s.instant ? ' (' + s.instant + ')' : ''); sec.appendChild(img); }
    else { const k = MISS[s.imageError] || MISS['not-drawn']; sec.appendChild(node('div', 'imw-miss', IntMapLang.t(m.lang, ...k))); }
    if (s.say) sec.appendChild(node('p', 'imw-say', s.say));
    if (s.link) sec.appendChild(node('p', 'imw-link', t('Open this step: ', 'このステップを開く: ') + s.link));
    const ask = node('p', 'imw-ask'); ask.appendChild(node('b', null, s.ask ? t('Question', '問い') : t('Notes', 'メモ')));
    ask.appendChild(document.createTextNode(s.ask || t('What do you notice on this map?', 'この地図から気づいたことを書きましょう。')));
    sec.appendChild(ask);
    const lines = node('div', 'imw-lines'); for (let i = 0; i < ANSWER_LINES; i++) lines.appendChild(node('div')); sec.appendChild(lines);
    paper.appendChild(sec);
  });
  const foot = node('footer', 'imw-foot');
  foot.appendChild(node('div', null, t('Map data: ', '地図データの出典: ') + (m.credits.length ? m.credits.join(' · ') : t('as printed on each map', '各地図に記載'))));
  foot.appendChild(node('div', null, t('Made with ', '作成: ') + (m.site || 'IntMap') + (m.siteLink ? ' — ' + m.siteLink : '') + ' · ' + m.made));
  paper.appendChild(foot);
  return paper;
}

let docTitle = null;
function close() {
  const el = document.getElementById('im-worksheet'); if (el) el.remove();
  document.documentElement.removeAttribute('data-worksheet');
  window.removeEventListener('afterprint', afterPrint);
}
function afterPrint() { if (docTitle != null) { document.title = docTitle; docTitle = null; } }

/** open (or re-open, as the other sheet) the print preview of the last worksheet made */
function open(teacher) {
  if (!last) return false;
  style(); close();
  let site = { name: '', link: '' };
  /* the page's own name and address, as the postcard prints them (js/map-recorder.js siteBrand) */
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  import('./map-recorder.js').then((R) => { try { site = R.siteBrand(); } catch (_) { /* unnamed */ } paint(); }).catch(paint);
  const box = node('div'); box.id = 'im-worksheet'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', T('Printable worksheet', '印刷用ワークシート'));
  const bar = node('div', 'imw-bar');
  const h = node('h2', null, T('Printable worksheet', '印刷用ワークシート'));
  const seg = node('div', 'imw-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', T('Which sheet', 'シートの種類'));
  const bS = /** @type {HTMLButtonElement} */ (node('button', null, T('Student', '生徒用'))); bS.type = 'button';
  const bT = /** @type {HTMLButtonElement} */ (node('button', null, T('Teacher', '教員用'))); bT.type = 'button';
  seg.append(bS, bT);
  const pr = /** @type {HTMLButtonElement} */ (node('button', 'imw-b imw-print')); pr.type = 'button'; pr.dataset.imw = 'print';
  pr.append(iconNode('printer', { size: 17 }), ' ' + T('Print', '印刷'));
  const cl = /** @type {HTMLButtonElement} */ (node('button', 'imw-b', T('Close', '閉じる'))); cl.type = 'button'; cl.dataset.imw = 'close';
  const st = node('div', 'imw-status'); st.setAttribute('aria-live', 'polite');
  bar.append(h, seg, pr, cl, st);
  box.appendChild(bar);
  let mode = !!teacher, paper = null;
  function paint() {
    const m = sheetModel(last.tour, last.shots, { teacher: mode, lang: lang(), site, base });
    const p = buildPaper(m); if (paper) paper.replaceWith(p); else box.appendChild(p); paper = p;
    bS.setAttribute('aria-pressed', String(!mode)); bT.setAttribute('aria-pressed', String(mode));
    const miss = m.steps.filter((s) => !s.image).map((s) => s.n);
    st.textContent = T(m.pictured + ' of ' + m.steps.length + ' maps pictured', m.steps.length + ' 枚中 ' + m.pictured + ' 枚の地図を撮りました')
      + (miss.length ? ' · ' + T('not pictured: step ', '撮れなかったステップ: ') + miss.join(', ') : '')
      + ' · ' + T('A4 portrait; choose «Save as PDF» in the print dialog to keep a file.', 'A4 縦。ファイルに残すには印刷画面で「PDF に保存」を選びます。');
  }
  bS.onclick = () => { mode = false; paint(); };
  bT.onclick = () => { mode = true; paint(); };
  cl.onclick = close;
  pr.onclick = () => {
    docTitle = document.title;
    document.title = last.tour.title + ' — ' + (mode ? T('teacher worksheet', '教員用ワークシート') : T('worksheet', 'ワークシート'));
    window.addEventListener('afterprint', afterPrint, { once: true });
    try { window.print(); } catch (_) { afterPrint(); }
  };
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } }, true);
  document.body.appendChild(box);
  document.documentElement.setAttribute('data-worksheet', '1');
  paint();
  try { pr.focus({ preventScroll: true }); } catch (_) { }
  return true;
}
