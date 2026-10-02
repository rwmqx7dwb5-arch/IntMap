/* ============================================================================
 *  IntMap · THE GALLERY — the example maps and the classroom tours, inside the app   (js/showcase-gallery.js)
 * ----------------------------------------------------------------------------
 *  (showcase-gallery) The example maps (js/showcase.js) and the classroom tours (js/tours.js) could be
 *  reached only from about.html and teachers.html: the app itself had no door to them, and a first visit's
 *  only show of what IntMap can do was the automatic layer tour (js/onboarding.js). This file is the door,
 *  in two places a reader already goes — and NOTHING opens it by itself (the first-visit welcome card was
 *  withdrawn at the reader's request, #R104; a gallery that appeared unasked would be that card again):
 *    · the EMPTY state of the place search: focus the field with nothing typed and a row of cards is under
 *      it (`showInResults`) — on a phone that is the sheet, which the field has just raised;
 *    · «See all» there, any element marked `data-im-gallery`, and Atlas's `panel.gallery`, which open the
 *      whole gallery (`openGallery`): every example under its subject's heading, then the tours.
 *  A card is a picture, a title and one line, and ONE TAP opens it: an example through `openShowcase` —
 *  the share link's own restore, the path a pasted link takes (js/map-ui.js IntMapBookmark.restore) — and a
 *  tour through js/tour-player.js startTour, the classroom mode the teacher page's link opens.
 *
 *  ══ NOTHING HERE IS A LIST ═══════════════════════════════════════════════════════════════════════
 *  The cards are DERIVED (`galleryItems`): every example js/showcase.js shows that has a captured link and
 *  a thumbnail, grouped by its `topic` under js/showcase.js TOPICS, and every tour of js/tours.js with the
 *  thumbnail of its first example step. A new example or tour is in the gallery the day it is declared and
 *  captured; a withheld one is not (it would open differently from its picture).
 *
 *  ══ ONE OPENER ═══════════════════════════════════════════════════════════════════════════════════
 *  `openShowcase` is also what Atlas's `panel.showcase` runs (js/atlas-cap-panel.js), so a card and Atlas
 *  open an example the same way and read it back the same way: it is reported open only once the clock
 *  and the layer boxes say what the example declares.
 *
 *  ⚠ LOADED ON DEMAND: js/search-geocode.js imports this the first time the empty field is focused (or a
 *  `data-im-gallery` control is pressed); Atlas imports it inside its own lazy kernel. A start-up that
 *  never reaches for it downloads none of it, and the thumbnails are fetched only as their cards are drawn.
 *  ⚠ IntMap-authored text is en + jp (CONSTITUTION.md §7). No emoji: the marks are js/icons.js line icons.
 * ==========================================================================*/

import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';
import { SHOWCASE, CAPTURED, TOPICS, showcaseById, showcaseLink } from './showcase.js';
import { TOURS, tourSteps } from './tours.js';
import { MapState } from './map-state.js';   /* the address bar's one door (js/map-state.js) */
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';   /* «an answer is on the map» — the phone's sheet comes down */
import { icon } from './icons.js';
import './safe-html.js';   /* publishes globalThis.IntMapSafe — the encoder every string below is written with */

/* the reader's language, as the app holds it (js/i18n.js) — the reading js/tour-player.js makes */
function lang() { try { return window.IntMapI18N.lang(); } catch (_) { return 'en'; } }
const t = (en, jp) => IntMapLang.t(lang(), en, jp);
const txt = (v) => (Array.isArray(v) ? IntMapLang.t(lang(), v[0], v[1]) : String(v == null ? '' : v));
const H = (s) => globalThis.IntMapSafe.html(s);

/* ══ WHAT IS IN IT — derived, never listed ═══════════════════════════════════════════════════════ */
/** → { sections: [{ topic, title, items }], tours: [item] }. An item is
 *  { kind: 'example'|'tour', id, title, blurb, thumb, steps? } (title / blurb are LA(en, jp) tuples). */
export function galleryItems() {
  const examples = SHOWCASE.filter((s) => { const c = CAPTURED[s.id]; return !!(c && c.thumb && showcaseLink(s.id)); })
    .map((s) => ({ kind: 'example', id: s.id, topic: s.topic, title: s.title, blurb: s.blurb, thumb: CAPTURED[s.id].thumb }));
  const sections = Object.keys(TOPICS).map((topic) => ({ topic, title: TOPICS[topic], items: examples.filter((x) => x.topic === topic) }))
    .filter((sec) => sec.items.length);
  const tours = TOURS.map((tour) => {
    const steps = tourSteps(tour);
    const first = steps.find((st) => st.example && CAPTURED[st.example] && CAPTURED[st.example].thumb);
    return first ? { kind: 'tour', id: tour.id, title: tour.title, blurb: tour.blurb, thumb: CAPTURED[first.example].thumb, steps: steps.length } : null;
  }).filter(Boolean);
  return { sections, tours };
}

/* ══ OPENING ONE ═════════════════════════════════════════════════════════════════════════════════ */
/** Put the map into an example through the share link's own restore, and read it back.
 *  → { ok, timeOk, off, reason?, example } — ok only when the clock and every declared layer say so. */
export async function openShowcase(id) {
  const s = showcaseById(id);
  if (!s) return { ok: false, reason: 'unknown-example', timeOk: false, off: [], example: null };
  const href = showcaseLink(s.id);
  if (!href) return { ok: false, reason: 'no-link', timeOk: false, off: s.layers.slice(), example: s };
  const BM = window.IntMapBookmark;
  if (!BM) return { ok: false, reason: 'no-map', timeOk: false, off: s.layers.slice(), example: s };
  try {
    MapState.address(null, href.slice(href.indexOf('#')));
    BM.restore({ shared: true });
    /* a link with no `tt` leaves the clock where it is (restore() sets it only when the link names one), so a
       «now» example returns the clock to now itself — the example's intent is the present */
    if (s.at == null) IntMapTime.setNow({ source: 'ui' });
  } catch (e) { return { ok: false, reason: String((e && e.message) || e), timeOk: false, off: s.layers.slice(), example: s }; }
  /* the restore applies the clock at +900 ms and the layer boxes at +700 / +1800 / +3200 ms (js/map-ui.js
     restore()); 6 s is its last pass plus room for a busy page. It returns the moment both agree — the wait is
     a bound, not a sleep — and a changed restore schedule is what invalidates the number. */
  const met = () => {
    try {
      const st = IntMapTime.state();
      const timeOk = s.at == null ? !!st.isLive : (!st.isLive && st.iso === s.at);
      const off = s.layers.filter((lid) => { const cb = /** @type {HTMLInputElement|null} */ (document.getElementById(lid)); return !(cb && cb.checked); });
      return { timeOk, off };
    } catch (_) { return { timeOk: false, off: s.layers.slice() }; }
  };
  let m = met(); const t0 = Date.now();
  while (!(m.timeOk && !m.off.length) && Date.now() - t0 < 6000) { await new Promise((r) => setTimeout(r, 250)); m = met(); }
  return { ok: m.timeOk && !m.off.length, timeOk: m.timeOk, off: m.off, example: s };
}

/** start a classroom tour at its first step (js/tour-player.js — loaded when it is reached for) */
export async function startTour(id) {
  const P = await import('./tour-player.js');
  return P.startTour(id, 1);
}

/* a card was chosen: the search is over (its list closes, the phone's keyboard goes, the sheet comes down —
   the map is the answer, MAP_ANSWER_EVENT 'card'), the gallery closes, and the one thing is opened */
function choose(kind, id) {
  try { const res = document.getElementById('ms-results'); if (res && res.querySelector('.sg-strip')) { res.style.display = 'none'; res.innerHTML = ''; } } catch (_) { }
  try { const inp = document.getElementById('ms-input'); if (inp && document.activeElement === inp) inp.blur(); } catch (_) { }
  closeGallery();
  if (kind === 'tour') return startTour(id);
  try { window.dispatchEvent(new CustomEvent(MAP_ANSWER_EVENT, { detail: { kind: 'card' } })); } catch (_) { }
  return openShowcase(id);
}

/* ══ THE CARDS ═══════════════════════════════════════════════════════════════════════════════════ */
function cardHTML(it) {
  const badge = it.kind === 'tour'
    ? '<span class="sg-badge">' + icon('graduation', { size: 12 }) + ' ' + H(t('Tour · ' + it.steps + ' steps', 'ツアー · ' + it.steps + 'ステップ')) + '</span>' : '';
  return '<button type="button" class="sg-card" data-sg-kind="' + H(it.kind) + '" data-sg-id="' + H(it.id) + '">'
    + '<span class="sg-pic"><img src="' + globalThis.IntMapSafe.url(new URL(it.thumb, location.href).href) + '" alt="" width="480" height="252" loading="lazy" decoding="async">' + badge + '</span>'
    + '<span class="sg-t">' + H(txt(it.title)) + '</span>'
    + '<span class="sg-b">' + H(txt(it.blurb)) + '</span></button>';
}
function wireCards(root) {
  root.querySelectorAll('button.sg-card').forEach((b) => b.addEventListener('click', () => { choose(b.getAttribute('data-sg-kind'), b.getAttribute('data-sg-id')); }));
}

/* ══ THE SEARCH FIELD'S EMPTY STATE ══════════════════════════════════════════════════════════════
   Drawn into the search's own result list (#ms-results), which the field already shows and hides, and which
   on a phone fills the sheet the field has raised (css/intmap.css #m-search-slot). It is drawn only while the
   field is EMPTY and focused — js/search-geocode.js asks for it then, and the first letter typed replaces it
   with the place candidates. One row, examples then tours, scrolled sideways; «See all» opens the gallery. */
export function showInResults(res) {
  if (!res) return false;
  style();
  const g = galleryItems();
  const items = g.sections.flatMap((sec) => sec.items).concat(g.tours);
  if (!items.length) return false;
  res.innerHTML = '<div class="sg-strip" role="group" aria-label="' + H(t('Example maps and tours', '作例とツアー')) + '">'
    + '<div class="sg-strip-h"><span>' + H(t('Example maps', '作例')) + '</span>'
    + '<button type="button" class="sg-all">' + H(t('See all', 'すべて見る')) + '</button></div>'
    + '<div class="sg-row">' + items.map(cardHTML).join('') + '</div></div>';
  wireCards(res);
  const all = res.querySelector('.sg-all');
  if (all) all.addEventListener('click', () => { res.style.display = 'none'; res.innerHTML = ''; openGallery(); });
  res.style.display = 'block';
  return true;
}
/** the empty state is showing in this list */
export const showingIn = (res) => !!(res && res.querySelector('.sg-strip'));

/* ══ THE WHOLE GALLERY ═══════════════════════════════════════════════════════════════════════════
   A dialog of the app's one contract (js/dialog.js IntMapDialog.open — a name, Esc, the Tab trap, focus
   returned), centred on a large screen and a sheet from the foot on a phone. */
let dlg = null;
function closeGallery() { if (dlg) { const h = dlg; dlg = null; try { h.close('api'); } catch (_) { } } const el = document.getElementById('im-gallery'); if (el) el.remove(); }
/** open the gallery; `section: 'tours'` scrolls to the tours. → { ok, examples, tours } */
export function openGallery(opts) {
  style(); closeGallery();
  const g = galleryItems();
  const n = g.sections.reduce((a, sec) => a + sec.items.length, 0);
  const box = document.createElement('div'); box.id = 'im-gallery';
  box.innerHTML = '<div class="sg-scrim" aria-hidden="true"></div>'
    + '<div class="sg-box"><div class="sg-head"><h2 id="sg-title">' + H(t('Example maps', '作例')) + '</h2>'
    + '<button type="button" class="sg-x" aria-label="' + H(t('Close', '閉じる')) + '">' + icon('close', { size: 18 }) + '</button></div>'
    + '<p class="sg-sub">' + H(t('Each picture is a screenshot of IntMap. One tap opens the same view, date and layers.', '写真はすべて IntMap の画面です。タップすると、同じ視点・日付・レイヤーで地図が開きます。')) + '</p>'
    + g.sections.map((sec) => '<section class="sg-sec" data-sg-topic="' + H(sec.topic) + '"><h3>' + H(txt(sec.title)) + '</h3><div class="sg-grid">' + sec.items.map(cardHTML).join('') + '</div></section>').join('')
    + (g.tours.length ? '<section class="sg-sec" id="sg-tours" data-sg-topic="tours"><h3>' + H(t('Classroom tours', '授業ツアー')) + '</h3>'
      + '<p class="sg-sub">' + H(t('A lesson as a sequence of maps, full screen for a projector, with words to read out and a question for the class.', '地図を順にたどる授業の進行表。プロジェクター向けの全画面で、読み上げる文と生徒への問いが付きます。')) + '</p>'
      + '<div class="sg-grid">' + g.tours.map(cardHTML).join('') + '</div></section>' : '')
    + '</div>';
  wireCards(box);
  const panel = /** @type {HTMLElement} */ (box.querySelector('.sg-box'));
  const close = () => { dlg = null; try { box.remove(); } catch (_) { } };
  box.querySelector('.sg-x').addEventListener('click', () => { if (dlg) dlg.close('button'); else close(); });
  const D = window.IntMapDialog;
  if (D && D.open) dlg = D.open(box, { panel, labelledby: 'sg-title', backdrop: box.querySelector('.sg-scrim'), close });
  else {
    document.body.appendChild(box);
    box.querySelector('.sg-scrim').addEventListener('click', close);
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  }
  try {
    if (opts && opts.section === 'tours') { const tt = box.querySelector('#sg-tours'); if (tt) tt.scrollIntoView({ block: 'start' }); }
    /** @type {HTMLElement} */ (box.querySelector('.sg-card')).focus({ preventScroll: !!(opts && opts.section) });
  } catch (_) { }
  return { ok: !!box.isConnected, examples: n, tours: g.tours.length };
}

/* ══ THE LOOK — iOS-like cards on the app's own variables (css/intmap.css), injected when first drawn ══ */
let styled = false;
function style() {
  if (styled) return; styled = true;
  const st = document.createElement('style'); st.id = 'im-gallery-css'; st.textContent = GALLERY_CSS; document.head.appendChild(st);
}
export const GALLERY_CSS = [
  /* the card, shared by the strip and the gallery */
  '.sg-card{display:flex;flex-direction:column;gap:3px;min-width:0;padding:0 0 10px;border:1px solid rgba(128,128,128,0.18);border-radius:14px;overflow:hidden;background:var(--input-bg);color:var(--text-main);font:inherit;text-align:left;cursor:pointer;transition:transform .12s ease,border-color .12s ease;}',
  '.sg-card:hover{border-color:var(--primary-color);}',
  '.sg-card:active{transform:scale(0.98);}',
  '.sg-card:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px;}',
  '.sg-pic{position:relative;display:block;aspect-ratio:480/252;background:rgba(128,128,128,0.12);}',
  '.sg-pic img{display:block;width:100%;height:100%;object-fit:cover;}',
  '.sg-badge{position:absolute;left:8px;bottom:8px;display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:rgba(0,0,0,0.62);color:#fff;font-size:11px;font-weight:600;line-height:1.3;}',
  '.sg-t{display:block;padding:6px 10px 0;font-size:13.5px;font-weight:600;line-height:1.3;}',
  '.sg-b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;padding:0 10px;font-size:12px;line-height:1.35;color:var(--text-muted);}',
  /* the empty state of the search */
  '.sg-strip{padding:10px 10px 12px;}',
  '.sg-strip-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 2px 8px;font-size:12px;font-weight:600;color:var(--text-muted);letter-spacing:0.01em;}',
  '.sg-all{min-height:32px;padding:0 10px;border:none;border-radius:999px;background:transparent;color:var(--primary-color);font:inherit;font-weight:600;cursor:pointer;}',
  '.sg-row{display:flex;gap:10px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding-bottom:4px;-webkit-overflow-scrolling:touch;}',
  '.sg-row .sg-card{flex:0 0 172px;scroll-snap-align:start;}',
  /* the whole gallery */
  '#im-gallery{position:fixed;inset:0;z-index:var(--z-modal);display:flex;align-items:center;justify-content:center;}',
  '#im-gallery .sg-scrim{position:absolute;inset:0;background:rgba(0,0,0,0.35);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}',
  '#im-gallery .sg-box{position:relative;width:min(980px,calc(100vw - 32px));max-height:calc(100dvh - 48px);overflow:auto;overscroll-behavior:contain;box-sizing:border-box;padding:20px 22px 24px;border-radius:22px;background:var(--card-bg);color:var(--text-main);box-shadow:var(--shadow);}',
  '#im-gallery .sg-head{position:sticky;top:-20px;z-index:calc(var(--z-inset) + 1);display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-20px -22px 0;padding:16px 22px 8px;background:var(--card-bg);}',
  '#im-gallery h2{margin:0;font-size:22px;font-weight:700;letter-spacing:-0.01em;}',
  '#im-gallery .sg-x{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:none;border-radius:50%;background:var(--input-bg);color:var(--text-main);cursor:pointer;}',
  '#im-gallery .sg-sub{margin:4px 0 14px;font-size:13px;color:var(--text-muted);}',
  '#im-gallery .sg-sec{margin-top:18px;}',
  '#im-gallery .sg-sec h3{margin:0 0 10px;font-size:16px;font-weight:700;}',
  '#im-gallery .sg-sec .sg-sub{margin-top:-4px;}',
  '#im-gallery .sg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;}',
  /* a phone: a sheet from the foot of the screen, two cards to a row */
  '@media (max-width:640px){'
    + '#im-gallery{align-items:flex-end;}'
    + '#im-gallery .sg-box{width:100vw;max-height:92dvh;border-radius:20px 20px 0 0;padding:18px 14px calc(18px + var(--safe-bottom));}'
    + '#im-gallery .sg-head{margin:-18px -14px 0;padding:14px 14px 8px;top:-18px;}'
    + '#im-gallery .sg-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}'
    + '.sg-row .sg-card{flex-basis:150px;}'
    + '}',
  '@media (prefers-reduced-motion:reduce){.sg-card{transition:none;}.sg-card:active{transform:none;}}',
].join('\n');
