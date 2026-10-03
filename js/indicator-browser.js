/* ============================================================================
 *  IntMap · js/indicator-browser.js — EVERY COUNTRY INDICATOR, ONE LAYER  (map-layer-system)
 * ----------------------------------------------------------------------------
 *  The country statistics on the Layers panel were sixty-odd rows: the World Bank family (js/wb-layers.js),
 *  five more World Bank rows in js/layer-packs.js, and the country-table choropleths (GDP per capita,
 *  population density, HDI, democracy, fertility, defence spending) — filed over eleven shelves, three of the
 *  World Bank series twice under two names. To compare two countries on a quantity the reader had to know
 *  which shelf it had been filed on, and which of two same-named rows followed the clock.
 *
 *  This is that whole family as ONE layer (`bx-wbind`): the indicator is chosen inside it, by search and by
 *  subject, and the map paints exactly one at a time.
 *
 *  ⚠ NOTHING HERE IS A SECOND CATALOGUE. What exists is read from where it already lives:
 *    · the World Bank series this row can paint — js/wb-layers.js `indicators()` (its own table; a two-way
 *      row gives one entry per way);
 *    · which other rows measure the same series, and which rows measure something this reader does not paint
 *      — the `measures` of every declaration in js/layer-manifest.js (scripts/lib/indicator-series.mjs holds
 *      each claim to the code that paints the row);
 *    · the subject of an indicator — the SHELF its own row stands on (js/layers/<id>.js `shelf`), named by the
 *      panel's own heading;
 *    · a row's name — the row itself (its label on the panel), so the browser and the panel say the same words.
 *  ⚠ TWO KINDS OF ENTRY, SAID APART. A `series` entry is painted by this row (js/wb-layers.js `choroOn`, the
 *  painter of the row it stands for: same years, ramp, legend, hover). A `row` entry is a quantity this reader
 *  does not paint — the country table's GDP per capita joins Maddison and the World Bank and follows the clock
 *  through js/time-countries.js — so choosing it switches THAT row on (and off again when another is chosen),
 *  and the picker says which row is drawing it. One choropleth is on the map either way.
 *  ⚠ ONE SERIES, ONE ENTRY. A series two rows measure is offered once; the entry names the other row
 *  («also on the panel as …») rather than listing the same numbers twice.
 * ==========================================================================*/
import { LAYERS, layerDeclaration } from './layer-manifest.js';
import { IntMapLang } from './lang-registry.js';

const STORE = 'intmap.indicator';   /* the reader's last choice on this device */

/* the stylesheet, injected the first time the module draws — not on the start-up path (css/intmap.css is) */
const CSS = `.ind-pick{ margin:6px 0 2px; display:flex; flex-direction:column; gap:6px; }
.ind-now{ display:flex; flex-direction:column; align-items:flex-start; gap:1px; width:100%; text-align:left; padding:8px 10px; border-radius:10px; border:1px solid var(--glass-border,rgba(128,128,128,0.25)); background:var(--input-bg); color:var(--text-main); cursor:pointer; font:inherit; }
.ind-now-t{ font-size:13px; font-weight:650; line-height:1.25; }
.ind-now-s{ font-size:10.5px; color:var(--text-muted); font-variant-numeric:tabular-nums; }
.ind-note{ font-size:10px; color:var(--text-muted); line-height:1.4; }
.ind-q{ width:100%; box-sizing:border-box; padding:7px 10px; border-radius:9px; border:1px solid var(--glass-border,rgba(128,128,128,0.25)); background:var(--input-bg); color:var(--text-main); font-size:12.5px; }
.ind-subj{ display:flex; gap:5px; overflow-x:auto; scrollbar-width:none; padding-bottom:1px; }
.ind-subj::-webkit-scrollbar{ display:none; }
.ind-chip{ flex:none; border:1px solid var(--glass-border,rgba(128,128,128,0.3)); background:var(--input-bg); color:var(--text-main); border-radius:999px; padding:4px 9px; font-size:10.5px; font-weight:600; cursor:pointer; white-space:nowrap; }
.ind-chip.on{ background:var(--primary-fill); color:#fff; border-color:transparent; }
.ind-count{ font-size:10px; color:var(--text-muted); }
.ind-list{ max-height:220px; overflow-y:auto; overscroll-behavior:contain; border-radius:10px; border:1px solid var(--glass-border,rgba(128,128,128,0.2)); }
.ind-item{ display:flex; flex-direction:column; align-items:flex-start; gap:1px; width:100%; text-align:left; padding:6px 10px; border:0; border-bottom:1px solid var(--glass-border,rgba(128,128,128,0.14)); background:transparent; color:var(--text-main); cursor:pointer; font:inherit; }
.ind-item:last-child{ border-bottom:0; }
.ind-item.on{ background:color-mix(in srgb, var(--primary-fill) 16%, transparent); }
.ind-item-t{ font-size:12px; font-weight:600; line-height:1.3; }
.ind-item-s{ font-size:10px; color:var(--text-muted); }
.ind-empty{ padding:10px; font-size:11px; color:var(--text-muted); }
@media (pointer:coarse){ .ind-now,.ind-item{ min-height:44px; justify-content:center; } .ind-chip{ padding:7px 11px; } .ind-q{ font-size:16px; } }`;
function ensureStyle() { if (typeof document === 'undefined' || !document.head || document.getElementById('indicator-browser-css')) return; const st = document.createElement('style'); st.id = 'indicator-browser-css'; st.textContent = CSS; document.head.appendChild(st); }

/** @param {any} host  what js/wb-layers.js hands over (see `indBrowser` there) */
export function makeIndicatorBrowser(host) {
  const t = (en, jp) => IntMapLang.t(host.lang(), en, jp);
  const esc = (s) => globalThis.IntMapSafe.html(String(s == null ? '' : s));   /* the app's one escaper (js/safe-html.js) */
  const shelfOf = (rowId) => { const l = LAYERS.find((x) => x.id === rowId); return l ? l.shelf : null; };
  const shelfName = (key) => { try { const k = IntMapLang.keyed(host.lang()); return (k && k[key]) || key; } catch (_) { return key; } };
  const rowLabel = (rowId) => {
    try {
      const cb = document.getElementById(rowId); const lab = cb && (cb.closest('label') || cb.closest('.lyr-row'));
      if (!lab) return rowId;
      const sp = lab.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .bx-name, .geo-label');
      return ((sp ? sp.textContent : lab.textContent) || '').replace(/\s+/g, ' ').trim() || rowId;
    } catch (_) { return rowId; }
  };
  /* every declaration that says what it measures, by series */
  const measured = () => {
    const by = new Map();
    for (const l of LAYERS) { const d = layerDeclaration(l.id); for (const c of (d && d.measures) || []) { if (!by.has(c)) by.set(c, []); by.get(c).push(l.id); } }
    return by;
  };

  /** the catalogue, built from the three places above every time it is asked (a row added tomorrow is in it) */
  function catalogue() {
    const by = measured(), out = [], covered = new Set();
    for (const e of host.entries()) {
      const series = 'worldbank:' + e.key;
      covered.add(series);
      const also = (by.get(series) || []).filter((id) => id !== e.row);
      out.push({ id: e.id, kind: 'series', code: e.key, n: e.n, unit: e.unit, row: e.row, shelf: shelfOf(e.row), also, series });
    }
    /* the rows whose series this row does not paint — each once, by its row */
    const rows = new Map();
    for (const [series, ids] of by) {
      if (covered.has(series)) continue;
      for (const id of ids) if (!rows.has(id)) rows.set(id, series);
    }
    for (const [id, series] of rows) out.push({ id: 'row:' + id, kind: 'row', code: series.replace(/^[a-z]+:/, ''), row: id, shelf: shelfOf(id), also: [], series });
    return out;
  }
  const nameOf = (e) => (e.kind === 'series' ? host.name(e.n) : rowLabel(e.row));
  /* every spelling a reader may type: the reader's language, English, Japanese, the series code, the subject */
  const hay = (e) => {
    const parts = [nameOf(e), e.code, shelfName(e.shelf)];
    if (e.kind === 'series' && Array.isArray(e.n)) parts.push(e.n[0], e.n[1]);
    for (const id of e.also) parts.push(rowLabel(id));
    return parts.filter(Boolean).join(' \u0001 ').toLowerCase();
  };

  /**
   * Entries ranked against a query. A word at the start of the name is the strongest; a word anywhere
   * in a name next; then the code and the subject. An empty query is the catalogue in panel order.
   * @param {string} q @param {string|null} [shelf]
   */
  function search(q, shelf) {
    const all = catalogue().filter((e) => !shelf || e.shelf === shelf);
    const qq = String(q || '').trim().toLowerCase();
    if (!qq) return all.sort(byPanel);
    const words = qq.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const e of all) {
      const nm = nameOf(e).toLowerCase(), h = hay(e);
      let s = 0;
      if (nm === qq) s = 100;
      else if (nm.startsWith(qq)) s = 85;
      else if (h.includes(qq)) s = 60;
      else if (words.every((w) => h.includes(w))) s = 45;
      if (s) scored.push({ e, s });
    }
    return scored.sort((a, b) => b.s - a.s || byPanel(a.e, b.e)).map((x) => x.e);
  }
  const ORDER = new Map(LAYERS.map((l, i) => [l.id, i]));
  const byPanel = (a, b) => (ORDER.get(a.row) ?? 1e9) - (ORDER.get(b.row) ?? 1e9) || String(a.id).localeCompare(String(b.id));

  /* ── state ── */
  let el = null, open = false, delegated = null, shelfSel = null, query = '', listOpen = false;
  const rowBox = (id) => { const cb = document.getElementById(id); return (cb && cb.matches && cb.matches('input[type=checkbox]')) ? cb : null; };
  const setRow = (id, on) => { const cb = rowBox(id); if (cb && cb.checked !== on) { cb.checked = on; cb.dispatchEvent(new Event('change', { bubbles: true })); } return !!cb; };
  function releaseDelegate() { if (delegated) { setRow(delegated, false); delegated = null; } }

  /**
   * Put one indicator on the map. Returns the entry, or null when there is no such indicator.
   * @param {string} id
   */
  function select(id) {
    const e = catalogue().find((x) => x.id === id || x.row === id || (x.kind === 'row' && x.id === 'row:' + id));
    if (!e) return null;
    /* chosen from outside the row (Atlas, a link): the row is switched on first, and its opening finds this choice made */
    if (!open) { open = true; el = host.legend(); setRow('bx-wbind', true); }
    if (e.kind === 'series') {
      releaseDelegate(); if (host.delegated) host.delegated(null);
      host.paint(e.id);
    } else {
      host.clear();
      if (delegated !== e.row) { releaseDelegate(); if (setRow(e.row, true)) delegated = e.row; }
      if (host.delegated) host.delegated(delegated);
    }
    try { localStorage.setItem(STORE, e.id); } catch (_) { /* private mode: the choice lives for the session */ }
    listOpen = false;
    render();
    return e;
  }
  const current = () => {
    if (delegated) return catalogue().find((x) => x.kind === 'row' && x.row === delegated) || null;
    const c = host.current(); return c ? (catalogue().find((x) => x.id === c) || null) : null;
  };

  function openBrowser() {
    open = true;
    el = host.legend();
    const want = host.wanted();
    if (want && select(want)) return;
    if (current()) { render(); return; }   /* already chosen — by select() switching the row on */
    let first = null;
    try { first = localStorage.getItem(STORE); } catch (_) { first = null; }
    if (first && catalogue().some((x) => x.id === first)) select(first);
    else { listOpen = true; render(); }
  }
  function closed() { open = false; releaseDelegate(); listOpen = false; }

  /* ── the picker, inside the row's own legend ── */
  function render() {
    if (!open) return;
    ensureStyle();
    if (!el || !el.isConnected) el = host.legend();
    if (!el) return;
    let box = el.querySelector('.ind-pick');
    if (!box) {
      box = document.createElement('div'); box.className = 'ind-pick';
      const hd = el.querySelector('h4'); if (hd && hd.nextSibling) el.insertBefore(box, hd.nextSibling); else el.appendChild(box);
      box.addEventListener('click', onClick); box.addEventListener('input', onInput);
    }
    const cur = current();
    const curName = cur ? nameOf(cur) : t('Choose an indicator', '指標を選んでください');
    const sub = cur ? [shelfName(cur.shelf), cur.code].filter(Boolean).join(' · ') : t('Search, or pick a subject', '検索するか、分野を選んでください');
    let h = '<button type="button" class="ind-now" data-act="toggle" aria-expanded="' + listOpen + '"><span class="ind-now-t">' + esc(curName) + '</span><span class="ind-now-s">' + esc(sub) + '</span></button>';
    if (cur && cur.also.length) h += '<div class="ind-note">' + esc(t('Also on the panel as ', 'パネルでは次の行でもあります: ')) + esc(cur.also.map(rowLabel).join(t(', ', '、'))) + '</div>';
    if (cur && cur.kind === 'row') h += '<div class="ind-note">' + esc(t('Drawn by its own row, which joins this figure across the years: ', 'この数値は年を通して扱う専用の行が描いています: ')) + esc(rowLabel(cur.row)) + '</div>';
    if (listOpen) {
      const shelves = [...new Set(catalogue().map((e) => e.shelf).filter(Boolean))].sort((a, b) => (shelfIndex(a) - shelfIndex(b)));
      h += '<input type="search" class="ind-q" placeholder="' + esc(t('Search indicators', '指標を検索')) + '" aria-label="' + esc(t('Search indicators', '指標を検索')) + '" value="' + esc(query) + '">';
      h += '<div class="ind-subj" role="group" aria-label="' + esc(t('Subject', '分野')) + '"><button type="button" class="ind-chip' + (shelfSel ? '' : ' on') + '" data-shelf="">' + esc(t('All', 'すべて')) + '</button>'
        + shelves.map((s) => '<button type="button" class="ind-chip' + (shelfSel === s ? ' on' : '') + '" data-shelf="' + esc(s) + '">' + esc(shelfName(s)) + '</button>').join('') + '</div>';
      const hits = search(query, shelfSel);
      h += '<div class="ind-count">' + esc(hits.length + t(' indicators', ' 件')) + '</div><div class="ind-list" role="listbox">'
        + hits.map((e) => '<button type="button" role="option" class="ind-item' + (cur && cur.id === e.id ? ' on' : '') + '" aria-selected="' + !!(cur && cur.id === e.id) + '" data-id="' + esc(e.id) + '"><span class="ind-item-t">' + esc(nameOf(e)) + '</span><span class="ind-item-s">' + esc([shelfName(e.shelf), e.code].filter(Boolean).join(' · ')) + '</span></button>').join('')
        + (hits.length ? '' : '<div class="ind-empty">' + esc(t('No indicator matches', '該当する指標はありません')) + '</div>') + '</div>';
    }
    box.innerHTML = h;
    try { if (window._tileLegends) window._tileLegends(); } catch (_) { /* the legend tiles itself on its next change */ }
  }
  const SHELF_ORDER = [...new Set(LAYERS.map((l) => l.shelf))];
  const shelfIndex = (s) => { const i = SHELF_ORDER.indexOf(s); return i < 0 ? 1e9 : i; };
  function onClick(ev) {
    const b = ev.target && ev.target.closest && ev.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'toggle') { listOpen = !listOpen; render(); if (listOpen) focusQ(); return; }
    if (b.hasAttribute('data-shelf')) { shelfSel = b.getAttribute('data-shelf') || null; render(); return; }
    if (b.dataset.id) select(b.dataset.id);
  }
  function focusQ() { try { const q = el && el.querySelector('.ind-q'); if (q && !(window.IntMapDevice && window.IntMapDevice.compact && window.IntMapDevice.compact())) q.focus(); } catch (_) { /* nothing to focus */ } }
  function onInput(ev) {
    if (!ev.target || !ev.target.classList || !ev.target.classList.contains('ind-q')) return;
    query = ev.target.value;
    const pos = ev.target.selectionStart;
    render();
    try { const q = el.querySelector('.ind-q'); q.focus(); q.setSelectionRange(pos, pos); } catch (_) { /* restored on the next keystroke */ }
  }
  try { window.addEventListener('intmap-lang', () => { try { render(); } catch (_) { /* next open */ } }); } catch (_) { /* no window: headless */ }

  /**
   * What the map shows for an indicator, from the series itself — the year painted, how many countries reported
   * it, and the highest and lowest. For a `row` entry this reader does not hold the numbers (its row does).
   * @param {string} [id] the entry; default the current one @param {number} [n] how many at each end
   */
  async function facts(id, n) {
    const e = id ? catalogue().find((x) => x.id === id) : current();
    if (!e) return null;
    const base = { id: e.id, kind: e.kind, name: nameOf(e), code: e.code, subject: shelfName(e.shelf), row: e.row, also: e.also.map((r) => ({ id: r, name: rowLabel(r) })) };
    if (e.kind !== 'series') return base;
    let S = null; try { S = await host.series(e.code.split('+').length > 1 ? e.code.split('+') : e.code); } catch (_) { S = null; }
    if (!S) return Object.assign(base, { year: null, reporting: 0, top: [], bottom: [], unit: e.unit || '' });
    const year = host.yearOf(e.code.split('+').length > 1 ? e.code.split('+') : e.code) || S.best;
    const row = S.by[year] || {};
    const vals = Object.keys(row).filter((k) => k.length === 3).map((iso) => ({ iso, name: host.countryName(iso), v: row[iso] })).filter((x) => x.v != null && isFinite(x.v));
    vals.sort((a, b) => b.v - a.v);
    const k = Math.max(1, Math.min(10, n || 5));
    return Object.assign(base, { year: year || null, years: [S.years[0], S.years[S.years.length - 1]], reporting: vals.length, unit: e.unit || '', top: vals.slice(0, k), bottom: vals.slice(-k).reverse() });
  }

  /** an indicator's facts as Atlas's answer (js/atlas-cap-layers.js `layers.indicator`) — beside the browser, out of Atlas's chunk */
  function atlasHtml(f, note) {
    const fmt = (v) => { const x = Math.abs(v); return (x >= 100 ? Math.round(v).toLocaleString() : String(Math.round(v * 100) / 100)) + (f.unit || ''); };
    let h = note('✓ ' + t('Country indicators', '国別指標') + ': ') + '<b>' + esc(f.name) + '</b> · ' + esc(f.code);
    if (f.also && f.also.length) h += '<div>' + esc(t('The same series is also on the panel as ', '同じ系列はパネルでは次の行でもあります: ')) + esc(f.also.map((x) => x.name).join(t(', ', '、'))) + '</div>';
    if (f.kind === 'row') return (h + '<div>' + esc(t('Drawn by its own row: ', '専用の行が描いています: ')) + esc(f.name) + '</div>');
    if (!f.reporting) return (h + '<div>' + esc(t('The World Bank reports no country for this year', 'この年について世界銀行はどの国の値も公表していません')) + (f.year ? ' (' + esc(f.year) + ')' : '') + '</div>');
    h += '<div>' + esc(t('Year on the map: ', '地図の年: ')) + esc(f.year) + ' · ' + f.reporting + esc(t(' countries reporting', 'か国が報告')) + (f.years ? ' · ' + esc(t('series ', '系列 ')) + esc(f.years[0] + '–' + f.years[1]) : '') + '</div>';
    h += '<div>' + esc(t('Highest: ', '高い順: ')) + f.top.map((x) => esc(x.name) + ' ' + esc(fmt(x.v))).join(' · ') + '</div>';
    h += '<div>' + esc(t('Lowest: ', '低い順: ')) + f.bottom.map((x) => esc(x.name) + ' ' + esc(fmt(x.v))).join(' · ') + '</div>';
    return h;
  }

  return {
    open: openBrowser, closed, select, search: (q, shelf) => search(q, shelf).map((e) => ({ id: e.id, kind: e.kind, name: nameOf(e), code: e.code, subject: shelfName(e.shelf), row: e.row })),
    catalogue: () => catalogue().map((e) => ({ id: e.id, kind: e.kind, name: nameOf(e), code: e.code, series: e.series, subject: e.shelf, row: e.row, also: e.also.slice() })),
    current: () => { const c = current(); return c ? { id: c.id, kind: c.kind, name: nameOf(c), code: c.code, row: c.row } : null; },
    facts, atlasHtml, state: () => ({ open, current: (current() || {}).id || null, delegated }),
  };
}
