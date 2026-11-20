/* ============================================================================
 *  IntMap · THE BOARD — an operable screen built from a declaration   (js/board.js)
 * ----------------------------------------------------------------------------
 *  window.IntMapBoard. Atlas answers a question by DECLARING a board (js/board-spec.js: table, chart,
 *  filter, map, evidence, param over one dataset); this draws it from DOM it builds itself — no
 *  author-supplied HTML ever reaches the page — and wires every widget to ONE store
 *  (js/board-state.js). The reader's hand-made board is the same call with a spec they wrote, so Atlas's
 *  boards and theirs share the state, the save format and the panel.
 *
 *  ⚠ ONE ELEMENT CHANGES THE OTHERS THROUGH THE STORE, NEVER DIRECTLY. A table row, a chart mark and a map
 *  point all call `state.toggle(row)`; a filter calls `state.setFilter`. Each widget's `update()` reads
 *  the store, so a widget added tomorrow is linked on arrival.
 *
 *  ⚠ THE BOARD SHARES THE REAL MAP AND THE REAL CLOCK, NOT COPIES OF THEM. A selection that has a place moves the
 *  main map (camera.flyTo for one place, fitBounds for several); a board with a map or objects widget draws its
 *  dataset on the main map once when it opens. The `time` widget moves IntMapTime (js/chronos.js) and the board only
 *  MIRRORS the clock's broadcast into its store (state.setTime), so the table, chart, metrics and map all answer
 *  "as of" the same instant the rest of the product shows. The small SVG in the map widget is a locator, not a map.
 *  ⚠ A LONG JOB'S PARTIAL RESULT ARRIVES THROUGH feed(): rows appended to an open inline board, the footer says
 *  "partial" with the job's fraction until a chunk says `done` (the durable-jobs work calls it).
 *
 *  ⚠ A PARAMETER RE-RUNS ONLY WHAT DEPENDS ON IT. The `param` widget does not recompute anything: it
 *  hands the new number to window.IntMapGisProject.setParams(dataset, {key}) — which re-runs that op and
 *  everything made from it, upstream first, and leaves a failed chain marked `stale` — and then simply
 *  re-reads the dataset when window.IntMapData says it changed. Nothing here knows how a buffer is made.
 *
 *  SAVED: the spec (with its inline rows, bounded by MAX_ROWS) and the store's snapshot — selection,
 *  filters, params — in IndexedDB `intmap-board`. NOT saved: the dataset a spec merely NAMES (that is
 *  js/gis-project.js's, saved as a recipe), the camera and the clock (js/session-tabs.js's): one fact,
 *  one place. Where the store is unavailable the answer is `{ok:false, why:'storage-unavailable'}`.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapTime } from './chronos.js';   /* the master clock and the real map's engine are imported from their owners, not read off window */
import { IntMapGeoEngine } from './geo-engine.js';
import { createBoardState } from './board-state.js';
import { normalise, columnsOf, rowsToFeatures, MAX_ROWS } from './board-spec.js';

const DB = 'intmap-board', STORE = 'boards';
const SVGNS = 'http://www.w3.org/2000/svg';
const ROW_CAP = 200;      /* table rows DRAWN at once; the footer states the real count, so nothing is silently dropped */
const BAR_CAP = 40;       /* chart marks drawn; likewise stated */

export function board(HOST) {
  HOST = HOST || {};
  const L = IntMapLang.pick(() => { try { return HOST.lang; } catch (_) { return 'en'; } });
  const doc = () => (typeof document !== 'undefined' ? document : null);
  const DATA = () => { try { return window.IntMapData || null; } catch (_) { return null; } };
  const PROJ = () => { try { return window.IntMapGisProject || null; } catch (_) { return null; } };

  /* ── persistence ─────────────────────────────────────────────────────── */
  const idb = () => new Promise((res, rej) => {
    try {
      if (typeof indexedDB === 'undefined') return rej(new Error('no-indexeddb'));
      const q = indexedDB.open(DB, 1);
      q.onupgradeneeded = () => { q.result.createObjectStore(STORE, { keyPath: 'id' }); };
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error || new Error('open-failed'));
    } catch (e) { rej(e); }
  });
  const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); t.oncomplete = () => { db.close(); res(r && r.result); }; t.onerror = t.onabort = () => { db.close(); rej(t.error || new Error('tx-failed')); }; }); };

  /* ── the one open board ──────────────────────────────────────────────── */
  let cur = null;     /* {id, spec, state, rows[], datasetId, root, widgets[], off[], timeOf, mapLinked, progress} */
  const visibleNow = () => cur.state.visible(cur.rows, cur.timeOf);
  const CLOCK = () => IntMapTime || null;
  const GEO = () => IntMapGeoEngine || null;

  const el = (tag, cls, text) => { const e = doc().createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const svg = (tag, attrs) => { const e = doc().createElementNS(SVGNS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };

  /* a mark is a real control: it takes focus, announces itself, and toggles the row on click, Enter or Space */
  const act = (node, i, id) => { node.setAttribute('tabindex', '0'); node.setAttribute('role', 'button'); node.setAttribute('aria-label', L('Row ', '行 ') + (i + 1)); const go = () => cur.state.toggle(i, id); node.addEventListener('click', go); node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); };

  function css() {
    const d = doc(); if (!d || d.getElementById('board-css')) return;
    const s = d.createElement('style'); s.id = 'board-css';
    s.textContent = [
      '#board-panel{position:fixed;z-index:var(--z-window,2200);right:16px;top:calc(var(--safe-top,0px) + 64px);width:min(480px,calc(100vw - 32px));max-height:calc(100vh - 96px);display:flex;flex-direction:column;background:var(--sidebar-bg,var(--card-bg,#fff));color:var(--text-main,#111);-webkit-backdrop-filter:blur(24px) saturate(1.4);backdrop-filter:blur(24px) saturate(1.4);border:1px solid var(--glass-border,rgba(128,128,128,.28));border-radius:20px;box-shadow:var(--shadow,0 18px 60px rgba(0,0,0,.35));font:14px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;overflow:hidden}',
      '#board-panel .bd-head{display:flex;align-items:center;gap:8px;padding:14px 16px 8px}',
      '#board-panel .bd-title{flex:1;min-width:0;font-size:17px;font-weight:650;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#board-panel .bd-btn{min-height:32px;padding:0 12px;border:0;border-radius:999px;background:var(--input-bg,rgba(120,120,128,.18));color:var(--text-main,#111);font:inherit;font-size:13px;cursor:pointer}',
      '#board-panel .bd-btn.pri{background:var(--primary-color,#0a84ff);color:#fff}',
      '#board-panel .bd-body{flex:1;overflow:auto;padding:4px 12px 12px;display:flex;flex-direction:column;gap:10px}',
      '#board-panel .bd-card{background:var(--input-bg,rgba(120,120,128,.12));border-radius:14px;padding:10px 12px}',
      '#board-panel .bd-sec{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-meta,#888);margin-bottom:6px}',
      '#board-panel .bd-meta{font-size:12px;color:var(--text-meta,#888)}',
      '#board-panel table{width:100%;border-collapse:collapse;font-size:13px}',
      '#board-panel .bd-scroll{max-height:220px;overflow:auto;border-radius:8px}',
      '#board-panel th{position:sticky;top:0;text-align:left;font-weight:600;background:var(--card-bg,#fff);padding:5px 6px;white-space:nowrap}',
      '#board-panel td{padding:5px 6px;border-top:1px solid var(--glass-border,rgba(128,128,128,.2));white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}',
      '#board-panel tr[data-i]{cursor:pointer}',
      '#board-panel tr.sel td{background:color-mix(in srgb,var(--primary-color,#0a84ff) 22%,transparent)}',
      '#board-panel .bd-chip{display:inline-block;margin:2px 4px 2px 0;padding:4px 10px;border-radius:999px;border:0;background:var(--input-bg,rgba(120,120,128,.18));color:inherit;font:inherit;font-size:13px;cursor:pointer}',
      '#board-panel .bd-chip.on{background:var(--primary-color,#0a84ff);color:#fff}',
      '#board-panel svg{width:100%;height:auto;display:block}',
      '#board-panel .m{fill:var(--primary-color,#0a84ff);opacity:.55;cursor:pointer}',
      '#board-panel .m.sel{opacity:1;stroke:var(--text-main,#111);stroke-width:1.5}',
      '#board-panel .g{fill:none;stroke:var(--text-meta,#888);stroke-width:1}',
      '#board-panel input[type=range]{width:100%;accent-color:var(--primary-color,#0a84ff)}',
      '#board-panel .bd-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}',
      '#board-panel .bd-tile{background:var(--card-bg,rgba(255,255,255,.5));border-radius:12px;padding:8px 10px}',
      '#board-panel .bd-tl{font-size:11px;color:var(--text-meta,#888)}',
      '#board-panel .bd-tv{font-size:20px;font-weight:650;letter-spacing:-.02em;font-variant-numeric:tabular-nums}',
      '#board-panel .bd-foot{padding:8px 16px 12px;font-size:12px;color:var(--text-meta,#888)}',
      '@media (max-width:640px){#board-panel{left:0;right:0;top:auto;bottom:0;width:auto;max-height:78vh;border-radius:20px 20px 0 0;padding-bottom:var(--safe-bottom,0px)}}',
    ].join('\n');
    d.head.appendChild(s);
  }

  /* ── data ────────────────────────────────────────────────────────────── */
  function loadRows(spec) {
    const D = DATA();
    if (spec.data.dataset) {
      const ds = D && D.get && D.get(spec.data.dataset);
      if (!ds) return { ok: false, why: 'dataset-missing', detail: { dataset: spec.data.dataset } };
      let feats; try { feats = ds.features(); } catch (e) { return { ok: false, why: (e && e.why) || 'dataset-unreadable' }; }
      return { ok: true, rows: feats, datasetId: ds.id };
    }
    const feats = rowsToFeatures(spec.data.rows, spec.data.lngField, spec.data.latField);
    /* inline rows are registered so GIS ops and the map see what the board sees; an id already taken by an earlier open of the same board is reused, not re-added */
    let datasetId = null;
    if (D && D.add) {
      const want = 'board-' + spec.boardId;
      try { if (D.has && D.has(want)) datasetId = want; else { const r = D.add({ id: want, title: spec.title, features: feats, provenance: { kind: 'board', source: spec.source } }); datasetId = r && r.id; } } catch (_) { datasetId = null; }
    }
    return { ok: true, rows: feats, datasetId };
  }

  function bboxOf(rows, idx) {
    let x0 = 180, x1 = -180, y0 = 90, y1 = -90, n = 0;
    const walk = (c) => { if (typeof c[0] === 'number') { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; n++; } else c.forEach(walk); };
    idx.forEach((i) => { const g = rows[i].geometry; if (g && g.coordinates) walk(g.coordinates); });
    return n ? { x0, x1, y0, y1 } : null;
  }


  /* ── the real map ───────────────────────────────────────────────────── */
  let flyT = 0;
  function mapFocus() {
    clearTimeout(flyT);
    flyT = setTimeout(() => {
      if (!cur || !cur.mapLinked) return;
      const G = GEO(); if (!G || !G.hasRenderer || !G.hasRenderer()) return;
      const idx = cur.state.get().selection; if (!idx.length) return;
      const b = bboxOf(cur.rows, idx); if (!b) return;
      try {
        if (b.x0 === b.x1 && b.y0 === b.y1) G.camera.flyTo({ center: [b.x0, b.y0], zoom: Math.max(G.camera.getZoom ? G.camera.getZoom() : 2, 6), duration: 900 });
        else G.camera.fitBounds([[b.x0, b.y0], [b.x1, b.y1]], { padding: 80, maxZoom: 9, duration: 900 });
      } catch (_) { /* a camera that cannot move leaves the board working */ }
    }, 120);
  }
  async function drawOnMap() {
    if (!cur || !cur.datasetId) return { ok: false, why: 'no-dataset' };
    try { await window.IntMapLazy.need('gisCore'); return (window.IntMapGis && window.IntMapGis.draw(cur.datasetId)) || { ok: false, why: 'unavailable' }; } catch (e) { return { ok: false, why: 'unavailable' }; }
  }

  /* ── widgets: each is {el, update(), id} and reads only the store and the rows ── */
  const cellText = (v) => (v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
  const numeric = (rows, f) => rows.map((r) => Number(r.properties && r.properties[f])).filter(Number.isFinite);

  function wTable(w) {
    const card = el('div', 'bd-card'), wrap = el('div', 'bd-scroll'), tbl = el('table'), meta = el('div', 'bd-meta');
    wrap.appendChild(tbl); card.append(wrap, meta);
    const cols = () => (w.columns && w.columns.length ? w.columns : columnsOf(cur.rows).slice(0, 6));
    tbl.addEventListener('click', (e) => { const tr = e.target.closest && e.target.closest('tr[data-i]'); if (tr) cur.state.toggle(Number(tr.dataset.i), w.id); });
    tbl.addEventListener('keydown', (e) => { const tr = e.target.closest && e.target.closest('tr[data-i]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cur.state.toggle(Number(tr.dataset.i), w.id); } });
    return { el: card, update() {
      const vis = visibleNow(), sel = new Set(cur.state.get().selection), c = cols();
      tbl.textContent = '';
      const hr = el('tr'); c.forEach((k) => hr.appendChild(el('th', null, k))); const th = el('thead'); th.appendChild(hr); tbl.appendChild(th);
      const tb = el('tbody');
      vis.slice(0, ROW_CAP).forEach((i) => { const tr = el('tr', sel.has(i) ? 'sel' : ''); tr.dataset.i = i; tr.tabIndex = 0; c.forEach((k) => tr.appendChild(el('td', null, cellText(cur.rows[i].properties[k])))); tb.appendChild(tr); });
      tbl.appendChild(tb);
      meta.textContent = vis.length > ROW_CAP ? L('Showing ' + ROW_CAP + ' of ' + vis.length + ' rows', vis.length + ' 行中 ' + ROW_CAP + ' 行を表示') : vis.length + L(' rows', ' 行');
    } };
  }

  function wChart(w) {
    const card = el('div', 'bd-card'), host = el('div'), meta = el('div', 'bd-meta');
    card.append(host, meta);
    return { el: card, update() {
      const sel = new Set(cur.state.get().selection);
      let pts = visibleNow().map((i) => ({ i, x: cur.rows[i].properties[w.x], y: Number(cur.rows[i].properties[w.y]) })).filter((p) => Number.isFinite(p.y));
      host.textContent = '';
      if (!pts.length) { meta.textContent = L('No numeric values to plot for ' + w.y + '.', w.y + ' に描ける数値がありません。'); return; }
      const total = pts.length;
      if (w.chart === 'line') { pts = pts.map((p) => ({ ...p, n: Number(p.x) })).filter((p) => Number.isFinite(p.n)).sort((a, b) => a.n - b.n); }
      else pts.sort((a, b) => b.y - a.y);
      const shown = pts.slice(0, BAR_CAP), W = 440, H = 170, pad = 28;
      const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': w.title || (w.y + ' / ' + w.x) });
      const hi = Math.max(...shown.map((p) => p.y), 0), lo = Math.min(...shown.map((p) => p.y), 0), span = (hi - lo) || 1;
      const Y = (v) => H - pad - ((v - lo) / span) * (H - pad * 2);
      s.appendChild(svg('line', { x1: pad, x2: W - 6, y1: Y(0), y2: Y(0), class: 'g' }));
      if (w.chart === 'line') {
        const xs = shown.map((p) => p.n), xlo = Math.min(...xs), xsp = (Math.max(...xs) - xlo) || 1, X = (v) => pad + ((v - xlo) / xsp) * (W - pad - 12);
        s.appendChild(svg('polyline', { points: shown.map((p) => X(p.n) + ',' + Y(p.y)).join(' '), class: 'g', style: 'stroke:var(--primary-color,#0a84ff);stroke-width:2' }));
        shown.forEach((p) => { const c = svg('circle', { cx: X(p.n), cy: Y(p.y), r: sel.has(p.i) ? 6 : 4, class: 'm' + (sel.has(p.i) ? ' sel' : '') }); act(c, p.i, w.id); const t = svg('title'); t.textContent = p.x + ': ' + p.y; c.appendChild(t); s.appendChild(c); });
      } else {
        const bw = (W - pad - 12) / shown.length;
        shown.forEach((p, k) => { const y0 = Y(0), y1 = Y(p.y); const r = svg('rect', { x: pad + k * bw + 1, y: Math.min(y0, y1), width: Math.max(2, bw - 2), height: Math.max(1, Math.abs(y1 - y0)), rx: 3, class: 'm' + (sel.has(p.i) ? ' sel' : '') }); act(r, p.i, w.id); const t = svg('title'); t.textContent = cellText(p.x) + ': ' + p.y; r.appendChild(t); s.appendChild(r); });
      }
      const top = svg('text', { x: 4, y: 12, 'font-size': 10, fill: 'currentColor' }); top.textContent = String(hi); s.appendChild(top);
      host.appendChild(s);
      meta.textContent = (w.title ? w.title + ' · ' : '') + w.y + (w.chart === 'line' ? ' ~ ' + w.x : ' / ' + w.x) + (total > shown.length ? L(' · top ' + shown.length + ' of ' + total, ' · 上位 ' + shown.length + ' / ' + total) : '');
    } };
  }

  function wFilter(w) {
    const card = el('div', 'bd-card'), body = el('div'), meta = el('div', 'bd-meta');
    card.append(body, meta);
    let built = false;
    const build = () => {
      body.textContent = ''; built = true;
      if (w.control === 'category') {
        const vals = [...new Set(cur.rows.map((r) => r.properties[w.field]).filter((v) => v != null && v !== '').map(String))].slice(0, 24);
        vals.forEach((v) => { const b = el('button', 'bd-chip', v); b.type = 'button'; b.onclick = () => { const f = cur.state.get().filters[w.id]; const set = new Set((f && f.values) || []); set.has(v) ? set.delete(v) : set.add(v); cur.state.setFilter(w.id, set.size ? { field: w.field, values: [...set] } : null); }; body.appendChild(b); });
      } else {
        const ns = numeric(cur.rows, w.field), lo = Math.min(...ns), hi = Math.max(...ns);
        const a = el('input'), b = el('input'); [a, b].forEach((x) => { x.type = 'range'; x.min = lo; x.max = hi; x.step = (hi - lo) / 100 || 1; });
        const f0 = cur.state.get().filters[w.id]; a.value = f0 && f0.min != null ? f0.min : lo; b.value = f0 && f0.max != null ? f0.max : hi;
        const go = () => { const mn = Math.min(Number(a.value), Number(b.value)), mx = Math.max(Number(a.value), Number(b.value)); cur.state.setFilter(w.id, (mn <= lo && mx >= hi) ? null : { field: w.field, min: mn, max: mx }, w.id); lab(); };
        const lab = () => { meta.textContent = w.field + ': ' + Math.min(Number(a.value), Number(b.value)) + ' – ' + Math.max(Number(a.value), Number(b.value)); };
        a.oninput = b.oninput = go; body.append(a, b); lab();
      }
    };
    return { el: card, update(source) {
      if (!built) build();
      if (w.control === 'category') { const f = cur.state.get().filters[w.id], on = new Set((f && f.values) || []); body.querySelectorAll('.bd-chip').forEach((c) => c.classList.toggle('on', on.has(c.textContent))); meta.textContent = w.field + (on.size ? ': ' + [...on].join(', ') : L(': all', ': すべて')); }
      else if (source !== w.id) { build(); }
    } };
  }

  function wMap(w) {
    const card = el('div', 'bd-card'), host = el('div'), bar = el('div'), meta = el('div', 'bd-meta');
    const draw = el('button', 'bd-btn', L('Show these rows on the map', '行を地図に表示')); draw.type = 'button';
    bar.appendChild(draw); card.append(host, bar, meta);
    draw.onclick = async () => {
      const r = await drawOnMap(); meta.textContent = (r && r.ok) ? L('Drawn on the main map.', '地図に描きました。') : L('Could not draw on the main map: ', '地図に描けませんでした: ') + ((r && r.why) || 'unavailable');
    };
    return { el: card, update() {
      const vis = visibleNow().filter((i) => cur.rows[i].geometry), sel = new Set(cur.state.get().selection);
      host.textContent = '';
      const bb = bboxOf(cur.rows, vis);
      if (!bb) { meta.textContent = L('No row has a location to draw.', '位置を持つ行がありません。'); draw.hidden = true; return; }
      draw.hidden = !cur.datasetId;
      const W = 440, H = 220, p = 14, dx = (bb.x1 - bb.x0) || 1, dy = (bb.y1 - bb.y0) || 1, k = Math.min((W - 2 * p) / dx, (H - 2 * p) / dy);
      const X = (x) => p + (x - bb.x0) * k, Y = (y) => H - p - (y - bb.y0) * k;
      const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': w.title || L('Map of the rows', '行の地図') });
      s.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, rx: 10, fill: 'color-mix(in srgb,var(--text-main,#111) 5%,transparent)' }));
      vis.slice(0, 2000).forEach((i) => {
        const g = cur.rows[i].geometry, isSel = sel.has(i);
        if (g.type === 'Point') { const c = svg('circle', { cx: X(g.coordinates[0]), cy: Y(g.coordinates[1]), r: isSel ? 7 : 5, class: 'm' + (isSel ? ' sel' : '') }); act(c, i, w.id); s.appendChild(c); }
        else { const rings = []; const col = (c) => { if (typeof c[0] === 'number') return; if (typeof c[0][0] === 'number') rings.push(c); else c.forEach(col); }; col(g.coordinates);
          rings.forEach((r) => { const q = svg('polyline', { points: r.map((c) => X(c[0]) + ',' + Y(c[1])).join(' '), class: 'g m' + (isSel ? ' sel' : ''), style: 'fill:' + (g.type.includes('Polygon') ? 'var(--primary-color,#0a84ff)' : 'none') + ';fill-opacity:' + (isSel ? .5 : .18) }); act(q, i, w.id); s.appendChild(q); }); }
      });
      host.appendChild(s);
      meta.textContent = vis.length + L(' located rows (a locator; selecting a row moves the main map)', ' 件を表示(位置の目安。選ぶと本物の地図が動きます)');
    } };
  }

  function wEvidence(w) {
    const card = el('div', 'bd-card'), t = el('div'), meta = el('div', 'bd-meta');
    card.append(t, meta);
    return { el: card, update() {
      t.textContent = L('Board data source: ', 'ボードのデータの出典: ') + cur.spec.source;
      const fs = Object.values(cur.state.get().filters), n = visibleNow().length;
      meta.textContent = (cur.datasetId ? L('Dataset ', 'データセット ') + cur.datasetId + ' · ' : '') + n + '/' + cur.rows.length + L(' rows pass ', ' 行が通過 / 条件 ') + fs.length + L(' filter(s)', ' 件');
    } };
  }

  function wParam(w) {
    const card = el('div', 'bd-card'), lab = el('div'), r = el('input'), meta = el('div', 'bd-meta');
    r.type = 'range'; r.min = w.min; r.max = w.max; r.step = w.step; r.value = cur.state.get().params[w.id] != null ? cur.state.get().params[w.id] : (w.value != null ? w.value : w.min);
    card.append(lab, r, meta);
    const show = () => { lab.textContent = (w.title || w.key) + ': ' + r.value; };
    r.oninput = show;
    r.onchange = async () => {
      cur.state.setParam(w.id, r.value, w.id);
      const P = PROJ(); meta.textContent = '';
      if (!P || !P.setParams) { meta.textContent = L('Recalculation is unavailable here.', 'ここでは再計算できません。'); return; }
      meta.textContent = L('Recalculating…', '再計算中…');
      let res; try { res = await P.setParams(w.dataset, { [w.key]: Number(r.value) }); } catch (e) { res = { ok: false, why: 'op-failed' }; }
      meta.textContent = res && res.ok ? L('Recalculated ' + ((res.rebuilt && res.rebuilt.length) || 0) + ' dataset(s) that depend on it.', '依存する ' + ((res.rebuilt && res.rebuilt.length) || 0) + ' 件を再計算しました。') : L('Not recalculated: ', '再計算できませんでした: ') + ((res && res.why) || 'unknown');
    };
    show();
    return { el: card, update() {} };
  }

  const nfmt = () => { try { return new Intl.NumberFormat(IntMapLang.locale(HOST.lang, 'en-GB'), { maximumFractionDigits: 2 }); } catch (_) { return { format: String }; } };
  function aggregate(rows, idx, m) {
    if (m.agg === 'count') return idx.length;
    const ns = idx.map((i) => Number(rows[i].properties[m.field])).filter(Number.isFinite);
    if (!ns.length) return null;
    return m.agg === 'sum' ? ns.reduce((a, b) => a + b, 0) : m.agg === 'mean' ? ns.reduce((a, b) => a + b, 0) / ns.length : m.agg === 'min' ? Math.min(...ns) : Math.max(...ns);
  }
  function wMetrics(w) {
    const card = el('div', 'bd-card'), grid = el('div', 'bd-tiles'), meta = el('div', 'bd-meta');
    card.append(grid, meta);
    return { el: card, update() {
      const v = visibleNow(), sel = new Set(cur.state.get().selection), picked = v.filter((i) => sel.has(i)), idx = picked.length ? picked : v, f = nfmt();
      grid.textContent = '';
      w.items.forEach((m) => {
        const x = aggregate(cur.rows, idx, m), t = el('div', 'bd-tile');
        t.append(el('div', 'bd-tl', m.label), el('div', 'bd-tv', x == null ? '—' : f.format(x) + (m.unit ? ' ' + m.unit : '')));
        grid.appendChild(t);
      });
      const t = cur.state.getTime();
      meta.textContent = (picked.length ? L('Over the ' + picked.length + ' selected row(s)', '選択した ' + picked.length + ' 行について') : L('Over ' + v.length + ' visible row(s)', '表示中の ' + v.length + ' 行について'))
        + (t != null && cur.timeOf ? L(' · as of ' + new Date(t).toISOString().slice(0, 10), ' · ' + new Date(t).toISOString().slice(0, 10) + ' 時点') : '');
    } };
  }

  function wTime(w) {
    const card = el('div', 'bd-card'), lab = el('div', 'bd-tv'), r = el('input'), bar = el('div'), live = el('button', 'bd-btn', L('Back to now', '現在に戻す')), meta = el('div', 'bd-meta');
    r.type = 'range'; live.type = 'button'; bar.appendChild(live); card.append(lab, r, bar, meta);
    const C = CLOCK(), top = new Date().getFullYear();
    if (!C || !C.setYear) { r.disabled = live.disabled = true; lab.textContent = L('The clock is unavailable here.', 'ここでは時計を操作できません。'); return { el: card, update() {} }; }
    r.min = C.min != null ? C.min : 1; r.max = top; r.step = 1; r.setAttribute('aria-label', L('Year', '年'));
    r.oninput = () => { lab.textContent = r.value; };
    r.onchange = () => C.setYear(Number(r.value), { source: 'board' });   /* the clock broadcasts; this board hears it like every other subscriber */
    live.onclick = () => C.setNow({ source: 'board' });
    return { el: card, update() {
      const live0 = C.isLive && C.isLive();
      r.value = live0 ? top : C.year(); lab.textContent = live0 ? L('Now', '現在') : C.iso();
      const n = visibleNow().length; meta.textContent = L(n + ' of ' + cur.rows.length + ' rows exist as of this moment', cur.rows.length + ' 行中 ' + n + ' 行がこの時点で存在');
    } };
  }

  function wObjects(w) {
    const card = el('div', 'bd-card'), wrap = el('div', 'bd-scroll'), meta = el('div', 'bd-meta');
    card.append(wrap, meta);
    wrap.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button[data-i]'); if (b) cur.state.toggle(Number(b.dataset.i), w.id); });
    return { el: card, update() {
      const v = visibleNow(), sel = new Set(cur.state.get().selection), by = new Map();
      v.forEach((i) => { const t = String(cur.rows[i].properties[w.typeField] || '—'); if (!by.has(t)) by.set(t, []); by.get(t).push(i); });
      wrap.textContent = '';
      by.forEach((list, t) => {
        wrap.appendChild(el('div', 'bd-sec', t + ' · ' + list.length));
        list.slice(0, ROW_CAP).forEach((i) => { const p = cur.rows[i].properties, rel = Number(p.related); const b = el('button', 'bd-chip' + (sel.has(i) ? ' on' : ''), cellText(p[w.nameField]) + (Number.isFinite(rel) && rel > 0 ? ' · ' + rel : '')); b.type = 'button'; b.dataset.i = i; wrap.appendChild(b); });
      });
      meta.textContent = v.length + L(' objects', ' 件のオブジェクト') + (cur.rows.some((r) => r.properties.related != null) ? L(' · the number is how many others they relate to', ' · 数字は関連する他のオブジェクトの数') : '');
    } };
  }

  const MAKERS = { metrics: wMetrics, time: wTime, objects: wObjects, table: wTable, chart: wChart, filter: wFilter, map: wMap, evidence: wEvidence, param: wParam };

  /* ── open / close ────────────────────────────────────────────────────── */
  function close() {
    if (!cur) return;
    try { cur.off.forEach((f) => f()); } catch (_) { /* unsubscribing twice is harmless */ }
    if (cur.root && cur.root.parentNode) cur.root.parentNode.removeChild(cur.root);
    cur = null;
  }

  function refresh(source) { if (!cur) return; cur.widgets.forEach((w) => { try { w.update(source); } catch (e) { /* one widget failing must not blank the others */ } }); cur.foot.textContent = visibleNow().length + '/' + cur.rows.length + L(' rows · ', ' 行 · ') + cur.state.get().selection.length + L(' selected', ' 件選択') + (cur.progress ? L(' · partial result', ' · 途中経過') + (cur.progress.fraction != null ? ' ' + Math.round(cur.progress.fraction * 100) + '%' : '') : '') + (cur.capped ? L(' · capped at ' + MAX_ROWS + ' rows', ' · ' + MAX_ROWS + ' 行で打ち切り') : ''); }

  /** open(rawSpec, {id, state}) → {ok, id, widgets, issues?}   The spec is checked against the data's real columns first. */
  function open(raw, opts) {
    opts = opts || {};
    if (!doc()) return { ok: false, why: 'no-document' };
    const first = normalise(raw, null);   /* structure only: the columns are not known until the data is */
    if (!first.ok) return { ok: false, why: 'spec-refused', issues: first.issues };
    const boardId = opts.id || ('b' + Date.now().toString(36));
    const got = loadRows({ ...first.spec, boardId });
    if (!got.ok) return { ok: false, why: got.why, detail: got.detail };
    const res = normalise(raw, columnsOf(got.rows));
    if (!res.ok) return { ok: false, why: 'spec-refused', issues: res.issues };
    close(); css();
    const spec = res.spec; spec.boardId = boardId;
    const root = el('div'); root.id = 'board-panel'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', spec.title);
    const head = el('div', 'bd-head'), title = el('div', 'bd-title', spec.title), save = el('button', 'bd-btn pri', L('Save', '保存')), x = el('button', 'bd-btn', '×');
    save.type = x.type = 'button'; x.setAttribute('aria-label', L('Close', '閉じる'));
    head.append(title, save, x);
    const body = el('div', 'bd-body'), foot = el('div', 'bd-foot');
    root.append(head, body, foot);
    cur = { id: boardId, spec, rows: got.rows, datasetId: got.datasetId, state: createBoardState(opts.state), root, foot, widgets: [], off: [] };
    let lastSec = null;
    spec.widgets.forEach((w) => {
      const made = MAKERS[w.kind](w);
      if (w.section !== lastSec) { body.appendChild(el('div', 'bd-sec', L(w.section, ({ Map: '地図', Data: 'データ', Analysis: '分析', Time: '時間', Objects: 'オブジェクト', Evidence: '根拠', Execution: '実行' })[w.section] || w.section))); lastSec = w.section; }
      if (w.title && w.kind !== 'chart') made.el.insertBefore(el('div', 'bd-meta', w.title), made.el.firstChild);
      body.appendChild(made.el); cur.widgets.push(made);
    });
    const tf = spec.data.timeField;
    if (tf) {
      /* the dataset registry's own reader of a moment (a year is a year, a date is its day) when it is loaded; else a plain date parse */
      cur.timeOf = (r) => { const v = r.properties && r.properties[tf]; if (v == null || v === '') return null; const D0 = DATA(), m = D0 && D0.momentOf && D0.momentOf(v); if (m && Number.isFinite(m.start)) return m.start; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };
      const C = CLOCK(); if (C && C.on && C.nowMs) { cur.state.setTime(C.nowMs(), 'clock'); cur.off.push(C.on((e) => { if (cur) cur.state.setTime(e && e.when ? e.when.getTime() : C.nowMs(), 'clock'); })); }
    }
    cur.mapLinked = spec.widgets.some((w) => w.kind === 'map' || w.kind === 'objects');
    cur.off.push(cur.state.subscribe((e) => { refresh(e.source); if (e.what === 'selection') mapFocus(); }));
    const D = DATA();
    if (D && D.subscribe && cur.datasetId) cur.off.push(D.subscribe((what, ds) => {
      if (!cur || !ds || ds.id !== cur.datasetId || what === 'remove') return;
      try { cur.rows = ds.features(); } catch (_) { return; } refresh();
    }));
    x.onclick = close;
    save.onclick = async () => { const r = await saveCurrent(); save.textContent = r.ok ? L('Board saved', 'ボードを保存しました') : L('Not saved', '保存できません'); setTimeout(() => { save.textContent = L('Save', '保存'); }, 1800); };
    doc().body.appendChild(root);
    refresh();
    if (cur.mapLinked && cur.datasetId && !opts.noMap) drawOnMap();   /* a map-linked board shows its rows on the real map; the widget's button redraws */
    return { ok: true, id: boardId, title: spec.title, widgets: spec.widgets.map((w) => ({ id: w.id, kind: w.kind, section: w.section })), rows: cur.rows.length };
  }

  async function saveCurrent() {
    if (!cur) return { ok: false, why: 'no-board-open' };
    /* an inline board saves the rows it HOLDS now (a job's partial rows included), bounded by MAX_ROWS */
    const spec = cur.spec.data.rows ? { ...cur.spec, data: { ...cur.spec.data, rows: cur.rows.slice(0, MAX_ROWS).map((r) => ({ ...r.properties })) } } : cur.spec;
    const rec = { id: cur.id, title: cur.spec.title, spec, state: cur.state.snapshot(), savedAt: Date.now() };
    try { await tx('readwrite', (s) => s.put(rec)); return { ok: true, id: cur.id }; } catch (e) { return { ok: false, why: 'storage-unavailable', detail: { message: e && e.message } }; }
  }
  async function list() {
    try { const all = await tx('readonly', (s) => s.getAll()); return { ok: true, boards: (all || []).map((r) => ({ id: r.id, title: r.title, savedAt: r.savedAt })).sort((a, b) => b.savedAt - a.savedAt) }; } catch (e) { return { ok: false, why: 'storage-unavailable' }; }
  }
  /** restore(id|title) — an empty name restores the latest */
  async function restore(name) {
    const l = await list(); if (!l.ok) return l;
    const q = String(name || '').toLowerCase();
    const hit = q ? l.boards.find((b) => b.id === name || b.title.toLowerCase() === q) || l.boards.find((b) => b.title.toLowerCase().includes(q)) : l.boards[0];
    if (!hit) return { ok: false, why: 'not-found', boards: l.boards };
    let rec; try { rec = await tx('readonly', (s) => s.get(hit.id)); } catch (e) { return { ok: false, why: 'storage-unavailable' }; }
    if (!rec) return { ok: false, why: 'not-found' };
    return open({ title: rec.spec.title, source: rec.spec.source, data: rec.spec.data, widgets: rec.spec.widgets }, { id: rec.id, state: rec.state });
  }
  /** feed({rows, done?, progress?, replace?}) — the receiving end of a long job's partial results. Rows are appended to an open INLINE
   *  board (a dataset-backed board changes through window.IntMapData, which the board already hears); until a chunk says `done` the
   *  footer reads "partial result" with the job's fraction (0..1). Rows past MAX_ROWS are not kept, and the footer says so. */
  function feed(chunk) {
    if (!cur) return { ok: false, why: 'no-board-open' };
    if (cur.spec.data.dataset) return { ok: false, why: 'dataset-board-updates-through-IntMapData' };
    if (!chunk || !Array.isArray(chunk.rows)) return { ok: false, why: 'rows-required' };
    const add = rowsToFeatures(chunk.rows.filter((r) => r && typeof r === 'object' && !Array.isArray(r)), cur.spec.data.lngField, cur.spec.data.latField);
    let rows = chunk.replace ? add : cur.rows.concat(add);
    cur.capped = rows.length > MAX_ROWS; if (cur.capped) rows = rows.slice(0, MAX_ROWS);
    cur.rows = rows;
    const f = Number(chunk.progress);
    cur.progress = chunk.done ? null : { fraction: Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : null };
    refresh('feed');
    return { ok: true, rows: cur.rows.length, done: !!chunk.done, capped: !!cur.capped };
  }
  async function remove(id) { try { await tx('readwrite', (s) => s.delete(id)); return { ok: true }; } catch (e) { return { ok: false, why: 'storage-unavailable' }; } }

  return { open, close, feed, rows: () => (cur ? cur.rows : []), save: saveCurrent, list, restore, remove, state: () => (cur ? cur.state : null), isOpen: () => !!cur };
}
