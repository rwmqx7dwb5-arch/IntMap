/* ============================================================================
 *  IntMap · js/command-palette.js — ONE FIELD FOR EVERYTHING THE APP CAN BE ASKED  (Ctrl/⌘+K)
 * ----------------------------------------------------------------------------
 *  IntMap has 170-odd layers on fourteen shelves, a strip of tools at the foot of the Layers panel, five sidebar
 *  tabs, a kernel of commands, the places on the device, 533 companies, sixteen example maps and the classroom
 *  tours — and until now every one of them had its own door, in its own panel, which a reader had to know to open.
 *  Seven comments in this repository already spoke of «the command palette» as one of the ways in (the seismic and
 *  pandemic simulators, the company atlas, the sidebar…); none existed. This is it.
 *
 *  ── WHAT IS IN IT — DISCOVERED, NEVER LISTED (.agents/rules/no-ad-hoc-hardcoding.md §2-4) ──────────────────────
 *    action    every kernel command (window.IntMapOS) that something already NAMES for a reader (`nameCommand` below):
 *              a control bound to it — its meta `btn`, a control that names it with `data-os-act`, or a row that
 *              carries it as `data-act` (the Layers panel's tool rows, js/map-ui.js SIM_TOOLS) — named by that control
 *              in the reader's language, or the reader-facing `title` ([en, jp]) its meta declares, even before its
 *              control is drawn. Each is also found by the spellings the capability registry gives the same id
 *              (window.IntMapCapabilities — «radiation», «fallout», «plume» for the plume simulator), and run through
 *              the kernel (`exec`, source 'palette'). Every control of the app's toolbars (ACTION_SURFACES below) is
 *              offered too, pressed. A command nothing names is refused, with the reason `nameCommand` gives: its only
 *              names are its id and a developer's label, neither in the reader's language — Atlas is the door for
 *              those, and Atlas is the last row.
 *    layer     every row of the Layers registry (#layer-dropdown), named as the panel names it (js/layer-row-label.js,
 *              the reading Atlas uses), with its state; choosing it switches it — the same `change` the row fires.
 *              The rows the reader asked never to be shown as rows (window.IntMapHiddenLayerRows) are not offered.
 *    place     localFuzzyPlaces — the countries, capitals and gazetteer the search box answers from on the device,
 *              flown to by the search's own `goToLocal` (no second flight). The full search is one more row.
 *    company   the company atlas index (js/company-data.js, fetched the first time two letters are typed), opened
 *              through the kernel's `company.open` — the same door Atlas and the Companies tab use.
 *    example   the example maps and classroom tours (js/showcase-gallery.js `galleryItems`, opened by its
 *              `openShowcase` / `startTour`).
 *    when      (where-when-search) a line that names an instant — 「京都 1600」, «Berlin May 1945», «1914» — read by
 *              js/where-when.js (the one reading the search field and Atlas use), fetched the first time a line carries a
 *              digit; its «place · instant» rows lead the list, and choosing one flies there through the search's own
 *              `goToLocal` and sets the master clock. What the reading cannot do is said above the rows.
 *    atlas     whatever was typed, handed to Atlas — always the last row, and what Ctrl/⌘+K does inside the field.
 *
 *  ── ORDER ─────────────────────────────────────────────────────────────────────────────────────────────────────
 *  `scoreText` measures how much of the query a name agrees with (whole, start, word start, inside, every word),
 *  the same agreement for every kind; a row the reader chose recently comes first among equals (its key is kept,
 *  never its name, so a language change does not orphan it). Nothing is weighted by kind except a tie.
 *
 *  ── WHAT IT IS NOT ────────────────────────────────────────────────────────────────────────────────────────────
 *  Not a second registry: every row is read from the thing that owns it at the moment the palette is drawn, and
 *  every choice runs that owner's own path. Nothing here knows a layer id, a command id or a company.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';
import { isDisplay } from './layer-manifest.js';
import { layerRowLabel, registryBoxes } from './layer-row-label.js';
import './safe-html.js';

/* ══ THE AGREEMENT OF A NAME WITH WHAT WAS TYPED (pure — tests/ux-next-checks.test.mjs) ════════════════════════ */
/** fold for comparison: compatibility forms, case, and the Latin accents (not the Japanese voicing marks) */
export function fold(s) {
  return String(s == null ? '' : s).normalize('NFKC').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').trim();
}
const WORDS = /[^\p{L}\p{N}]+/u;
/** 0..100: how much of the query `q` this text agrees with — 0 when it does not contain it at all */
export function scoreText(q, text) {
  const a = fold(q), t = fold(text);
  if (!a || !t) return 0;
  if (t === a) return 100;
  if (t.startsWith(a)) return 90;
  const words = t.split(WORDS).filter(Boolean);
  if (words.some((w) => w.startsWith(a))) return 80;
  if (t.includes(a)) return 66;
  /* several words typed: each must be in the text — «rail japan» finds «Railways (Japan)» */
  const qs = a.split(WORDS).filter(Boolean);
  if (qs.length > 1 && qs.every((x) => t.includes(x))) return 50 + (qs.every((x) => words.some((w) => w.startsWith(x))) ? 10 : 0);
  return 0;
}
/** an entry's score: its best name (the title, then the extra terms it is also known by, a little lower) */
export function scoreEntry(q, e) {
  let best = scoreText(q, e.title);
  for (const term of e.terms || []) best = Math.max(best, scoreText(q, term) - 6);
  return best;
}
/** the entries that agree with `q`, best first; ties go to what the reader chose recently, then to the shorter name */
export function rankEntries(q, entries, recent) {
  const rec = Array.isArray(recent) ? recent : [];
  return entries.map((e) => ({ e, s: scoreEntry(q, e), r: rec.indexOf(e.key) }))
    .filter((x) => x.s > 0)
    .sort((x, y) => (y.s + (y.r >= 0 ? 8 - Math.min(y.r, 7) : 0)) - (x.s + (x.r >= 0 ? 8 - Math.min(x.r, 7) : 0))
      || String(x.e.title).length - String(y.e.title).length)
    .map((x) => x.e);
}

/* ══ THE READER'S LANGUAGE ═══════════════════════════════════════════════════════════════════════════════════ */
let HOST = null;
const lang = () => { try { return (HOST && HOST.lang) || window.IntMapI18N.lang(); } catch (_) { return 'en'; } };
const t = (en, jp) => IntMapLang.t(lang(), en, jp);
const txt = (v) => (Array.isArray(v) ? IntMapLang.t(lang(), v[0], v[1]) : String(v == null ? '' : v));
const H = (s) => globalThis.IntMapSafe.html(s);

/* ══ THE SOURCES ═════════════════════════════════════════════════════════════════════════════════════════════ */
const nameOf = (el) => String((el && (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent)) || '').replace(/\s+/g, ' ').trim();
/* The app's toolbars, whose every button is an action by construction: the map's control column (view, base, grid,
   measure, share, layers, compass), the sidebar's tabs, the Layers panel's tools strip and the tool buttons. Named
   as surfaces, not as buttons — a control added to any of them is offered without an edit here. */
const ACTION_SURFACES = ['.map-controls-top button[id]', '.control-panel button[id]', '#layer-tools button', 'button[id^="btn-tool-"]'];

/* ══ WHAT A KERNEL COMMAND IS CALLED, FOR A READER — OR WHY IT HAS NO NAME (wave2-prod-fixes) ══════════════════════
   MEASURED on production (cb3a391): «radiation» and «plume» found no plume simulator, and the palette held none of
   sim.radiation, sim.terrainWater, sim.ashPlume, sim.los, sim.reach, sim.sun, sim.nightSky, sim.drone. Each is a row of
   the Layers panel's tool list with a name and a hint in the reader's language (js/map-ui.js SIM_TOOLS), registered in
   the kernel beside that row — but the row carries its command as `data-act`, its meta has no `btn` and no `title`, and
   the palette asked only those two. The names existed; the palette was not reading the place they were written.
   So a command is named from what already names it, in this order, and the capability registry's spellings for the same
   id (column 1 the dispatch spelling, column 2 its aliases — js/atlas-capabilities.js «THE TABLE») are added to what it
   is found by. Nothing is listed here: a new control, a new tool row or a new capability row is read the same way. */
/**
 * @param {string} id   the kernel command
 * @param {{meta?:any, control?:{title?:string, sub?:string, terms?:string[]}|null, cap?:{legacy?:string, aliases?:string[]}|null,
 *          txt?:(v:any)=>string}} src  what names it: the control bound to it (already read), its meta, its capability row
 * @returns {{title:string, sub:string, terms:string[], from:string, refused?:undefined}|{refused:string}}
 */
export function nameCommand(id, src) {
  const s = src || {}, m = s.meta || {}, c = s.control || null, cap = s.cap || null;
  const capTerms = cap ? [cap.legacy || ''].concat(Array.isArray(cap.aliases) ? cap.aliases : []) : [];
  const terms = [m.label || '', id].concat(capTerms, (c && c.terms) || []).map((x) => String(x || '').trim()).filter(Boolean);
  if (c && c.title) return { title: c.title, sub: c.sub || '', terms, from: 'control' };
  if (Array.isArray(m.title) && m.title.length) return { title: (s.txt || ((v) => String(v[0])))(m.title), sub: '', terms, from: 'title' };
  /* the meta's `label` is a developer's English line («Command palette · open (params.query)», «layer.on {id}») and the id
     is a key — offering either would show a reader a name nobody wrote for a reader, in one language */
  return { refused: 'no control names it and its meta declares no reader-facing title — its only names are its id and a developer label' };
}
/* a control that carries a command: what a reader sees it called — its accessible name when it states one (aria-label,
   title); else, for a row with a heading (the tool rows: a bold name over a hint), the heading, described by the hint;
   else its text. */
function controlName(el) {
  if (!el || el.disabled || el.hidden) return null;
  const stated = el.getAttribute('aria-label') || el.getAttribute('title');
  const head = !stated && el.querySelector ? el.querySelector('b, strong, h1, h2, h3, h4') : null;
  const title = head ? String(head.textContent || '').replace(/\s+/g, ' ').trim() : nameOf(el);
  if (!title) return null;
  let sub = '';
  if (head) { const all = nameOf(el); sub = all.startsWith(title) ? all.slice(title.length).replace(/›\s*$/, '').trim() : ''; }
  const terms = [el.id || '', el.getAttribute('data-nm') || ''].filter(Boolean);
  return { title, sub, terms };
}
function capOf(id) { try { const C = window.IntMapCapabilities; return (C && C.resolve) ? C.resolve(id) : null; } catch (_) { return null; } }
function actionEntries() {
  const out = [], seen = new Set();
  const OS = window.IntMapOS;
  const exec = (id) => () => OS.exec(id, { source: 'palette' });
  const offer = (id, el) => {
    if (out.some((e) => e.key === 'cmd:' + id) || (el && seen.has(el))) return;
    const control = el ? controlName(el) : null;
    if (el && !control) return;
    const n = nameCommand(id, { meta: OS.meta(id) || {}, control, cap: capOf(id), txt });
    if (n.refused !== undefined) return;
    if (el) seen.add(el);
    out.push({ key: 'cmd:' + id, kind: 'action', title: n.title, sub: n.sub || t('Action', '操作'), terms: n.terms, run: exec(id) });
  };
  try {
    if (OS && OS.list) OS.list().forEach((id) => { const m = OS.meta(id) || {}; if (m.btn) offer(id, document.getElementById(m.btn)); });
    /* a control that names its command: `data-os-act`, or `data-act` when (and only when) the value IS a kernel command —
       `data-act` is also a module-local switch elsewhere («play», «toggle»), which the kernel does not hold */
    for (const attr of ['data-os-act', 'data-act']) {
      document.querySelectorAll('[' + attr + ']').forEach((el) => { const id = el.getAttribute(attr); if (OS && OS.has && OS.has(id)) offer(id, el); });
    }
    /* a command that declares a reader-facing TITLE ([en, jp] in its meta) is offered by that title even while no control
       bound to it is on screen — the control may live in a panel that has not been drawn yet */
    if (OS && OS.list) OS.list().forEach((id) => offer(id, null));
  } catch (_) { }
  const push = (el, key, run, terms) => {
    if (!el || seen.has(el) || el.disabled || el.hidden) return;
    const title = nameOf(el); if (!title) return;
    seen.add(el);
    out.push({ key, kind: 'action', title, sub: t('Action', '操作'), terms: (terms || []).concat([el.id || '']).filter(Boolean), run });
  };
  for (const sel of ACTION_SURFACES) {
    try { document.querySelectorAll(sel).forEach((el) => push(el, 'el:' + (el.id || nameOf(el)), () => el.click())); } catch (_) { }
  }
  return out;
}
function layerEntries() {
  const hidden = new Set(Array.isArray(window.IntMapHiddenLayerRows) ? window.IntMapHiddenLayerRows : []);
  const out = [], titles = new Set();
  for (const cb of registryBoxes()) {
    if (!cb.id || hidden.has(cb.id)) continue;
    const title = layerRowLabel(cb); if (!title || titles.has(fold(title))) continue;
    titles.add(fold(title));
    const disp = isDisplay(cb.id);
    out.push({
      key: 'layer:' + cb.id, kind: 'layer', title, on: !!cb.checked, terms: [cb.id],
      sub: (disp ? t('Map display', '基本表示') : t('Layer', 'レイヤー')) + ' · ' + (cb.checked ? t('On', 'オン') : t('Off', 'オフ')),
      run: () => { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); return { on: cb.checked }; },
    });
  }
  return out;
}
function placeEntries(q) {
  if (!HOST || fold(q).length < 2) return [];
  let rows = [];
  try { rows = (HOST.localFuzzyPlaces(q) || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8); } catch (_) { rows = []; }
  const PF = window.IntMapPlaceFraming;
  const kindWord = (k) => { try { const N = PF.classNames(), c = PF.placeClass(null, k); return (c && N[c]) ? IntMapLang.pick(lang).arr(N[c]) : ''; } catch (_) { return ''; } };
  /* the device answered: every one of these agrees with what was typed by ITS rules (the search's own), so it is
     given the score that agreement earned there, folded onto this scale (localFuzzyPlaces scores up to ~100) */
  return rows.map((l) => ({
    key: 'place:' + l.name + '@' + (+l.lng).toFixed(3) + ',' + (+l.lat).toFixed(3), kind: 'place', title: l.name,
    sub: [t('Place', '地名'), kindWord(l.kind)].filter(Boolean).join(' · '), terms: l.names || [], fixed: Math.max(40, Math.min(96, +l.score || 0)),
    run: () => HOST.goToLocalPlace(l),
  }));
}
let _co = null, _coP = null;
function companyEntries(q) {
  const D = window.IntMapCompanyData;
  if (!_co || !D || fold(q).length < 2) return [];
  const jp = lang() === 'jp';
  return D.search(q, 6).map((c) => ({
    key: 'company:' + c.id, kind: 'company', title: (jp && c.loc && c.loc.ja) ? c.loc.ja + ' (' + c.n + ')' : c.n,
    sub: [t('Company', '企業'), [c.hqc, c.cc].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
    terms: [c.n, c.ln, c.tk].concat(Object.values(c.loc || {})).filter(Boolean),
    run: () => window.IntMapOS.exec('company.open', { source: 'palette', params: { company: c.id } }),
  }));
}
function wantCompanies(rerender) {
  if (_co || _coP) return;
  try {
    _coP = window.IntMapLazy.need('companyData').then(() => window.IntMapCompanyData.index()).then((ix) => { _co = ix; rerender(); }, () => { _coP = null; });
  } catch (_) { _coP = null; }
}
let _gal = null;
function exampleEntries() {
  if (!_gal) return [];
  const out = [];
  try {
    const g = _gal.galleryItems();
    g.sections.forEach((sec) => sec.items.forEach((it) => out.push({ key: 'example:' + it.id, kind: 'example', title: txt(it.title), sub: t('Example map', '作例') + ' · ' + txt(sec.title), terms: [txt(it.blurb)], run: () => _gal.openShowcase(it.id) })));
    g.tours.forEach((it) => out.push({ key: 'tour:' + it.id, kind: 'tour', title: txt(it.title), sub: t('Classroom tour', '授業ツアー') + ' · ' + t(it.steps + ' steps', it.steps + 'ステップ'), terms: [txt(it.blurb)], run: () => _gal.startTour(it.id) }));
  } catch (_) { }
  return out;
}
/* ══ (where-when-search) A PLACE AND AN INSTANT — js/where-when.js `interpret`, asked once per line and language ══ */
let _ww = null, _wwP = null, _wwNote = null;
const _wwRows = new Map();
function wantWhen(q, rerender) {
  if (!/\d|元\s*年/.test(q)) return;
  if (!_ww) { if (!_wwP) _wwP = import('./where-when.js').then((m) => { _ww = m; rerender(); }, () => { _wwP = null; }); return; }
  const key = lang() + '|' + q;
  if (_wwRows.has(key)) return;
  if (_wwRows.size > 40) _wwRows.clear();
  _wwRows.set(key, null);
  _ww.interpret(q, { local: (x) => (HOST && HOST.localFuzzyPlaces ? HOST.localFuzzyPlaces(x) : []), lang: lang() })
    .then((r) => { _wwRows.set(key, r); rerender(); }, () => { _wwRows.delete(key); });
}
function whenEntries(q) {
  const r = _wwRows.get(lang() + '|' + q);
  _wwNote = r ? r.note : null;
  if (!r || !r.parsed.when) return [];
  return r.rows.map((w) => ({
    key: w.key, kind: 'when', title: w.title, sub: w.sub,
    run: () => { if (!w.timeOnly && HOST && HOST.goToLocalPlace) HOST.goToLocalPlace({ name: w.name, lng: w.lng, lat: w.lat, kind: w.kind, bbox: w.bbox }); return _ww.applyWhen(r.parsed.when, { source: 'palette' }); },
  }));
}
function atlasEntry(q) {
  return {
    key: 'atlas', kind: 'atlas', title: q ? t('Ask Atlas: ', 'Atlas に聞く: ') + '“' + q + '”' : t('Open Atlas', 'Atlas を開く'),
    sub: t('Atlas · Ctrl/⌘+K again', 'Atlas · もう一度 Ctrl/⌘+K'),
    run: () => askAtlas(q),
  };
}
function askAtlas(q) {
  const A = window.IntMapAtlas;
  if (!A) return null;
  return A.ensure().then((C) => { if (!C) return null; try { if (C.open) C.open(); } catch (_) { } if (q && C.run) return C.run(q); return true; });
}

/* ══ RECENT CHOICES — keys, not names ════════════════════════════════════════════════════════════════════════ */
const RECENT = 'intmap_palette_recent';
const recent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : []; } catch (_) { return []; } };
const remember = (key) => { if (!key || key === 'atlas') return; try { localStorage.setItem(RECENT, JSON.stringify([key].concat(recent().filter((k) => k !== key)).slice(0, 8))); } catch (_) { } };

/* ══ WHAT THE LIST HOLDS FOR A QUERY ═════════════════════════════════════════════════════════════════════════ */
/** → the rows for `q`, in order (≤ 40), always ending with Atlas */
function rowsFor(q) {
  const query = String(q || '');
  const all = actionEntries().concat(layerEntries(), exampleEntries());
  const rec = recent();
  if (!fold(query)) {
    _wwNote = null;
    /* the empty field: what the reader chose recently, then the example maps — a place to start */
    const byKey = new Map(all.map((e) => [e.key, e]));
    const top = rec.map((k) => byKey.get(k)).filter(Boolean).map((e) => Object.assign({ recent: true }, e));
    const ex = all.filter((e) => e.kind === 'example' && !top.some((x) => x.key === e.key)).slice(0, 6);
    return top.concat(ex, [atlasEntry('')]);
  }
  const when = whenEntries(query.trim());   /* (where-when-search) the interpretation leads — the reader asked for an instant */
  const ranked = rankEntries(query, all.concat(companyEntries(query)), rec);
  /* places carry the agreement the device's own search measured; they are merged by that number */
  const places = placeEntries(query).filter((p) => !ranked.some((r) => r.kind === 'place' && r.key === p.key));
  const merged = ranked.slice();
  places.forEach((p) => { const at = merged.findIndex((e) => scoreEntry(query, e) < p.fixed); if (at < 0) merged.push(p); else merged.splice(at, 0, p); });
  const out = when.concat(merged.slice(0, Math.max(0, 39 - when.length)));
  out.push({ key: 'search:' + query, kind: 'search', title: t('Search places for ', '地名を検索: ') + '“' + query + '”', sub: t('Place search', '地名検索'), run: () => searchPlaces(query) });
  out.push(atlasEntry(query));
  return out;
}
/* the full search — the search field's own Enter, so its geocoders, its card and its framing are the ones used */
function searchPlaces(q) {
  const inp = /** @type {HTMLInputElement|null} */ (document.getElementById('ms-input'));
  if (!inp) return false;
  inp.value = q; inp.dispatchEvent(new Event('input', { bubbles: true }));
  try { inp.focus(); } catch (_) { }
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  return true;
}

/* ══ THE SURFACE ═════════════════════════════════════════════════════════════════════════════════════════════ */
const KIND_ICON = { when: 'clock', action: 'bolt', layer: 'layers', place: 'pin', company: 'city', example: 'image', tour: 'graduation', atlas: 'sparkle', search: 'search' };
let box = null, dlg = null, rows = [], active = 0;

function closePalette() { if (dlg) { const d = dlg; dlg = null; try { d.close('api'); } catch (_) { } } else if (box) { try { box.remove(); } catch (_) { } } box = null; }
function isOpen() { return !!(box && box.isConnected); }

/**
 * Open the palette (or bring it back with a new query).
 * @param {object} host  IM_HOST — the reader's language, localFuzzyPlaces and goToLocalPlace
 * @param {{query?:string}} [opts]
 * @returns {Promise<{ok:boolean, query:string, rows:{kind:string,title:string}[]}>}
 */
export async function openPalette(host, opts) {
  if (host) HOST = host;
  const q0 = String((opts && opts.query) || '');
  style();
  if (!_gal) { try { _gal = await import('./showcase-gallery.js'); } catch (_) { _gal = null; } }
  if (isOpen()) { const inp = /** @type {HTMLInputElement} */ (box.querySelector('#cp-input')); inp.value = q0; inp.focus(); render(); return report(); }
  box = document.createElement('div'); box.id = 'im-palette';
  box.innerHTML = '<div class="cp-scrim" aria-hidden="true"></div>'
    + '<div class="cp-box" role="dialog" aria-labelledby="cp-h">'
    + '<h2 id="cp-h" class="cp-vh">' + H(t('Command palette', 'コマンドパレット')) + '</h2>'
    + '<div class="cp-field">' + icon('search', { size: 18 }) + '<input id="cp-input" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="cp-list" aria-autocomplete="list" placeholder="'
    + H(t('Search actions, layers, places, companies, examples — or ask Atlas', '操作・レイヤー・地名・企業・作例を検索、または Atlas に質問')) + '"><kbd class="cp-esc">Esc</kbd></div>'
    + '<div id="cp-list" class="cp-list" role="listbox" aria-label="' + H(t('Results', '結果')) + '"></div>'
    + '<div class="cp-foot"><span><kbd>↑</kbd><kbd>↓</kbd> ' + H(t('move', '移動')) + '</span><span><kbd>Enter</kbd> ' + H(t('open', '開く')) + '</span><span><kbd>Ctrl/⌘</kbd><kbd>K</kbd> ' + H(t('ask Atlas', 'Atlas に聞く')) + '</span></div>'
    + '</div>';
  const inp = /** @type {HTMLInputElement} */ (box.querySelector('#cp-input'));
  inp.value = q0;
  const D = window.IntMapDialog;
  const onClose = () => { dlg = null; try { box && box.remove(); } catch (_) { } box = null; };
  if (D && D.open) dlg = D.open(box, { panel: box.querySelector('.cp-box'), labelledby: 'cp-h', backdrop: box.querySelector('.cp-scrim'), close: onClose, initialFocus: inp });
  else { document.body.appendChild(box); box.querySelector('.cp-scrim').addEventListener('click', closePalette); }
  inp.addEventListener('input', () => { active = 0; render(); });
  inp.addEventListener('keydown', onKey);
  box.querySelector('#cp-list').addEventListener('click', (e) => { const el = /** @type {Element} */ (e.target).closest('.cp-row'); if (el) choose(+el.getAttribute('data-i')); });
  box.querySelector('#cp-list').addEventListener('mousemove', (e) => { const el = /** @type {Element} */ (e.target).closest('.cp-row'); if (el && +el.getAttribute('data-i') !== active) { active = +el.getAttribute('data-i'); paintActive(); } });
  try { inp.focus(); } catch (_) { }
  active = 0; render();
  return report();
}
function report() { return { ok: isOpen(), query: box ? /** @type {HTMLInputElement} */ (box.querySelector('#cp-input')).value : '', rows: rows.map((r) => ({ kind: r.kind, title: r.title })) }; }
function onKey(e) {
  if (e.isComposing || e.keyCode === 229) return;
  const k = e.key;
  if ((e.ctrlKey || e.metaKey) && (k === 'k' || k === 'K')) { e.preventDefault(); e.stopPropagation(); const q = /** @type {HTMLInputElement} */ (e.currentTarget).value.trim(); closePalette(); remember('atlas'); askAtlas(q); return; }
  if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); if (!rows.length) return; active = k === 'ArrowDown' ? (active + 1) % rows.length : (active <= 0 ? rows.length - 1 : active - 1); paintActive(); return; }
  if (k === 'Enter') { e.preventDefault(); choose(active); }
}
function render() {
  if (!box) return;
  const q = /** @type {HTMLInputElement} */ (box.querySelector('#cp-input')).value;
  if (fold(q).length >= 2) wantCompanies(() => { if (isOpen()) render(); });   /* the index arrives once; the list is drawn again with it */
  wantWhen(q.trim(), () => { if (isOpen()) render(); });   /* (where-when-search) the reading arrives once per line; drawn again with it */
  rows = rowsFor(q);
  if (active >= rows.length) active = 0;
  const list = box.querySelector('#cp-list');
  let lastRecent = false;
  list.innerHTML = (_wwNote ? '<div class="cp-note" role="note">' + H(_wwNote) + '</div>' : '') + rows.map((r, i) => {
    const head = (r.recent && !lastRecent) ? '<div class="cp-sec">' + H(t('Recent', '最近使ったもの')) + '</div>' : ((!r.recent && lastRecent) ? '<div class="cp-sec">' + H(t('Example maps', '作例')) + '</div>' : '');
    lastRecent = !!r.recent;
    return head + '<div class="cp-row' + (r.kind === 'atlas' ? ' cp-atlas' : '') + '" role="option" id="cp-o' + i + '" data-i="' + i + '" data-kind="' + H(r.kind) + '">'
      + '<span class="cp-ic">' + icon(KIND_ICON[r.kind] || 'dot', { size: 16 }) + '</span>'
      + '<span class="cp-t">' + H(r.title) + '</span>'
      + (r.kind === 'layer' ? '<span class="cp-sw' + (r.on ? ' on' : '') + '" aria-hidden="true"></span>' : '')
      + '<span class="cp-s">' + H(r.sub || '') + '</span></div>';
  }).join('');
  paintActive();
}
function paintActive() {
  if (!box) return;
  const inp = box.querySelector('#cp-input');
  box.querySelectorAll('.cp-row').forEach((el) => { const on = +el.getAttribute('data-i') === active; el.classList.toggle('on', on); el.setAttribute('aria-selected', on ? 'true' : 'false'); if (on) { try { el.scrollIntoView({ block: 'nearest' }); } catch (_) { } } });
  if (rows[active]) inp.setAttribute('aria-activedescendant', 'cp-o' + active); else inp.removeAttribute('aria-activedescendant');
}
function choose(i) {
  const r = rows[i]; if (!r) return;
  closePalette();
  remember(r.key);
  try { const v = r.run(); if (v && typeof v.catch === 'function') v.catch(() => { }); } catch (_) { }
}

/* ══ THE LOOK — the app's own variables (css/intmap.css), iOS-like, injected when first drawn ═════════════════ */
let styled = false;
function style() {
  if (styled) return; styled = true;
  const st = document.createElement('style'); st.id = 'im-palette-css'; st.textContent = PALETTE_CSS; document.head.appendChild(st);
}
const PALETTE_CSS = [
  '#im-palette{position:fixed;inset:0;z-index:var(--z-modal);display:flex;align-items:flex-start;justify-content:center;padding-top:min(14vh,120px);}',
  '#im-palette .cp-scrim{position:absolute;inset:0;background:rgba(0,0,0,0.28);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);}',
  '#im-palette .cp-box{position:relative;display:flex;flex-direction:column;width:min(640px,calc(100vw - 32px));max-height:min(560px,calc(100dvh - 120px));border-radius:18px;background:var(--card-bg);color:var(--text-main);box-shadow:var(--shadow);border:1px solid rgba(128,128,128,0.18);overflow:hidden;}',
  '#im-palette .cp-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:0;}',
  '#im-palette .cp-field{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(128,128,128,0.16);color:var(--text-muted);}',
  '#im-palette .cp-field input{flex:1;min-width:0;border:none;outline:none;background:transparent;color:var(--text-main);font:inherit;font-size:17px;}',
  '#im-palette kbd{display:inline-block;min-width:18px;padding:1px 5px;border-radius:5px;border:1px solid rgba(128,128,128,0.3);background:var(--input-bg);font:600 11px ui-monospace,monospace;color:var(--text-muted);text-align:center;margin-right:2px;}',
  '#im-palette .cp-list{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:6px;}',
  '#im-palette .cp-sec{padding:8px 10px 4px;font-size:11.5px;font-weight:600;color:var(--text-muted);letter-spacing:0.02em;}',
  '#im-palette .cp-row{display:flex;align-items:center;gap:10px;min-height:40px;padding:6px 10px;border-radius:10px;cursor:pointer;}',
  '#im-palette .cp-row.on{background:var(--primary-fill);color:#fff;}',
  '#im-palette .cp-row.on .cp-s,#im-palette .cp-row.on .cp-ic{color:rgba(255,255,255,0.85);}',
  '#im-palette .cp-ic{flex:0 0 auto;display:inline-flex;color:var(--text-muted);}',
  '#im-palette .cp-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;}',
  '#im-palette .cp-s{flex:0 1 auto;max-width:42%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--text-muted);}',
  '#im-palette .cp-sw{flex:0 0 auto;width:26px;height:16px;border-radius:999px;background:rgba(128,128,128,0.35);position:relative;}',
  '#im-palette .cp-sw::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .12s ease;}',
  '#im-palette .cp-sw.on{background:#34c759;}',
  '#im-palette .cp-sw.on::after{left:12px;}',
  '#im-palette .cp-atlas .cp-t{font-weight:600;}',
  '#im-palette .cp-note{margin:4px 6px 6px;padding:8px 10px;border-radius:10px;background:var(--input-bg);font-size:12px;line-height:1.45;color:var(--text-muted);}',
  '#im-palette .cp-row[data-kind="when"] .cp-t{font-weight:600;}',
  '#im-palette .cp-foot{display:flex;gap:16px;padding:8px 14px;border-top:1px solid rgba(128,128,128,0.16);font-size:11.5px;color:var(--text-muted);}',
  '@media (max-width:640px){#im-palette{padding-top:calc(var(--safe-top, 0px) + 8px);}#im-palette .cp-box{width:calc(100vw - 16px);max-height:calc(100dvh - 24px);}#im-palette .cp-foot{display:none;}#im-palette .cp-s{display:none;}}',
  '@media (prefers-reduced-motion:reduce){#im-palette .cp-sw::after{transition:none;}}',
].join('\n');
