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
import { createBoardState } from './board-state.js';
import { normalise, columnsOf, rowsToFeatures, yearOf, MAX_ROWS } from './board-spec.js';
import { attachMap, followClock, bboxOf } from './board-link.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapTime } from './chronos.js';
import { parseCell, columnUses, renameInSpec, snapshotRows, diffRows, deltaText, editRefusal } from './board-edit.js';

const DB = 'intmap-board', STORE = 'boards';
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

  const el = (tag, cls, text) => { const e = doc().createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const svg = (tag, attrs) => { const e = doc().createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); return e; };

  /* a mark is a real control: it takes focus, announces itself, and toggles the row on click, Enter or Space */
  const act = (B, node, i, id) => { node.setAttribute('tabindex', '0'); node.setAttribute('role', 'button'); node.setAttribute('aria-label', L('Row ', '行 ') + (i + 1)); const go = () => B.state.toggle(i, id); node.addEventListener('click', go); node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); };

  function css() {
    const d = doc(); if (!d || d.getElementById('board-css')) return;
    const s = d.createElement('style'); s.id = 'board-css';
    s.textContent = [
      '.bd-panel{position:fixed;z-index:var(--z-window,2200);right:16px;top:calc(var(--safe-top,0px) + 64px);width:min(480px,calc(100vw - 32px));max-height:calc(100vh - 96px);display:flex;flex-direction:column;background:var(--sidebar-bg,var(--card-bg,#fff));color:var(--text-main,#111);-webkit-backdrop-filter:blur(24px) saturate(1.4);backdrop-filter:blur(24px) saturate(1.4);border:1px solid var(--glass-border,rgba(128,128,128,.28));border-radius:20px;box-shadow:var(--shadow,0 18px 60px rgba(0,0,0,.35));font:14px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;overflow:hidden}',
      '.bd-panel .bd-head{display:flex;align-items:center;gap:8px;padding:14px 16px 8px}',
      '.bd-panel .bd-title{flex:1;min-width:0;font-size:17px;font-weight:650;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.bd-panel .bd-btn{min-height:32px;padding:0 12px;border:0;border-radius:999px;background:var(--input-bg,rgba(120,120,128,.18));color:var(--text-main,#111);font:inherit;font-size:13px;cursor:pointer}',
      '.bd-panel .bd-btn.pri{background:var(--primary-color,#0a84ff);color:#fff}',
      '.bd-panel .bd-body{flex:1;overflow:auto;padding:4px 12px 12px;display:flex;flex-direction:column;gap:10px}',
      '.bd-panel .bd-card{background:var(--input-bg,rgba(120,120,128,.12));border-radius:14px;padding:10px 12px}',
      '.bd-panel .bd-sec{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-meta,#888);margin-bottom:6px}',
      '.bd-panel .bd-meta{font-size:12px;color:var(--text-meta,#888)}',
      '.bd-panel table{width:100%;border-collapse:collapse;font-size:13px}',
      '.bd-panel .bd-scroll{max-height:220px;overflow:auto;border-radius:8px}',
      '.bd-panel th{position:sticky;top:0;text-align:left;font-weight:600;background:var(--card-bg,#fff);padding:5px 6px;white-space:nowrap}',
      '.bd-panel td{padding:5px 6px;border-top:1px solid var(--glass-border,rgba(128,128,128,.2));white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}',
      '.bd-panel tr[data-i]{cursor:pointer}',
      '.bd-panel tr.sel td{background:color-mix(in srgb,var(--primary-color,#0a84ff) 22%,transparent)}',
      '.bd-panel .bd-chip{display:inline-block;margin:2px 4px 2px 0;padding:4px 10px;border-radius:999px;border:0;background:var(--input-bg,rgba(120,120,128,.18));color:inherit;font:inherit;font-size:13px;cursor:pointer}',
      '.bd-panel .bd-chip.on{background:var(--primary-color,#0a84ff);color:#fff}',
      '.bd-panel svg{width:100%;height:auto;display:block}',
      '.bd-panel .m{fill:var(--primary-color,#0a84ff);opacity:.55;cursor:pointer}',
      '.bd-panel .m.sel{opacity:1;stroke:var(--text-main,#111);stroke-width:1.5}',
      '.bd-panel .g{fill:none;stroke:var(--text-meta,#888);stroke-width:1}',
      '.bd-panel input[type=range]{width:100%;accent-color:var(--primary-color,#0a84ff)}',
      '.bd-panel .bd-btn.on{background:var(--primary-color,#0a84ff);color:#fff}',
      '.bd-panel details.bd-group>summary{cursor:pointer;list-style:none;padding:6px 2px;min-height:32px;display:flex;align-items:center}',
      '.bd-panel details.bd-group>summary::after{content:"+";margin-left:auto;font-size:16px}',
      '.bd-panel details.bd-group[open]>summary::after{content:"-"}',
      '.bd-panel details.bd-group[open]>*:not(summary){margin-bottom:8px}',
      '.bd-panel .bd-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}',
      '.bd-panel .bd-tile{background:var(--card-bg,rgba(255,255,255,.5));border-radius:12px;padding:8px 10px}',
      '.bd-panel .bd-tl{font-size:11px;color:var(--text-meta,#888)}',
      '.bd-panel .bd-tv{font-size:20px;font-weight:650;letter-spacing:-.01em}',
      '.bd-panel .bd-foot{padding:8px 16px 12px;font-size:12px;color:var(--text-meta,#888)}',
      '.bd-panel .bd-editbar{display:flex;justify-content:flex-end;margin-bottom:6px}',
      '.bd-panel .bd-edittools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}',
      '.bd-panel .bd-in,.bd-panel .bd-cell{min-height:30px;border:1px solid var(--glass-border,rgba(128,128,128,.28));border-radius:8px;background:var(--card-bg,#fff);color:inherit;font:inherit;font-size:13px;padding:0 8px}',
      '.bd-panel .bd-cell{width:100%;min-width:64px;box-sizing:border-box;border-radius:6px;min-height:26px}',
      '.bd-panel .bd-cell.bad,.bd-panel .bd-editmsg.bad{color:var(--danger,#d70015)}',
      '.bd-panel .bd-btn:disabled{opacity:.45;cursor:default}',
      '.bd-panel .bd-saved{margin:0 12px 6px}',
      '.bd-panel .bd-savedrow{display:flex;gap:6px;margin:4px 0}',
      '.bd-panel .bd-savedrow .bd-btn:first-child{flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '@media (max-width:640px){.bd-panel{left:0;right:0;top:auto;bottom:0;width:auto;max-height:62vh;border-radius:20px 20px 0 0;padding-bottom:var(--safe-bottom,0px)}}',
    ].join('\n');
    d.head.appendChild(s);
  }

  /* inline rows → the registry (so GIS ops, the map and EDITS share them). ⚠ An id left by an earlier open of the same board (a restore) is REPLACED, not reused: the saved rows are the truth, and a registry copy still holding last session's edits would answer an edit at the wrong row. The registry hands its features back as the same array, so the board reads THOSE rows from here on. Without the registry loaded (it is a lazy module) the board is read-only until B.prepare() has loaded it. */
  function registerInline(spec, feats) {
    const D = DATA(); let datasetId = null;
    if (D && D.add) {
      const want = 'board-' + spec.boardId;
      try {
        if (D.has && D.has(want)) D.remove(want);
        const r = D.add({ id: want, title: spec.title, features: feats, provenance: { kind: 'board', source: spec.source } });
        datasetId = r && r.id;
        const ds = datasetId && D.get(datasetId); if (ds) feats = ds.features();
      } catch (_) { datasetId = null; }
    }
    return { datasetId, rows: feats };
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
    let feats = rowsToFeatures(spec.data.rows, spec.data.lngField, spec.data.latField);
    /* inline rows are registered so GIS ops, the map and EDITS see what the board sees. ⚠ An id left by an earlier open of the same board (a restore) is REPLACED, not reused: the saved rows are the truth, and a registry copy that still held last session's edits would answer an edit at the wrong row. The registry hands its features back as the same array, so the board reads THOSE rows from here on. */
    const reg = registerInline(spec, feats), datasetId = reg.datasetId; feats = reg.rows;
    return { ok: true, rows: feats, datasetId };
  }

  /* ── widgets: each is {el, update(), id} and reads only the store and the rows ── */
  const cellText = (v) => (v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
  const numeric = (rows, f) => rows.map((r) => Number(r.properties && r.properties[f])).filter(Number.isFinite);

  function wTable(w, B) {
    const card = el('div', 'bd-card'), bar = el('div', 'bd-editbar'), wrap = el('div', 'bd-scroll'), tbl = el('table'), tools = el('div', 'bd-edittools'), meta = el('div', 'bd-meta'), msg = el('div', 'bd-meta bd-editmsg');
    const toggle = el('button', 'bd-btn', L('Edit', '編集')); toggle.type = 'button'; toggle.dataset.act = 'edit'; toggle.setAttribute('aria-pressed', 'false');
    bar.appendChild(toggle);
    wrap.appendChild(tbl); card.append(bar, wrap, tools, meta, msg);
    const cols = () => { const have = new Set(columnsOf(B.rows)); return (w.columns && w.columns.length ? w.columns : columnsOf(B.rows).slice(0, 6)).filter((k) => have.has(k)); };
    const say = (r, okText) => { msg.textContent = r && r.ok ? (okText || '') : (r && r.text) || ''; msg.classList.toggle('bad', !(r && r.ok)); };
    tbl.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('input')) return; const tr = e.target.closest && e.target.closest('tr[data-i]'); if (tr) B.state.toggle(Number(tr.dataset.i), w.id); });
    tbl.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } else if (e.key === 'Escape') { e.target.value = e.target.defaultValue; e.target.blur(); } return; } const tr = e.target.closest && e.target.closest('tr[data-i]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); B.state.toggle(Number(tr.dataset.i), w.id); } });
    /* a cell commits when it loses focus (Enter / tab / click away); Escape puts the old value back. The write goes through B.setCells, so the chart, the map, the metrics and Atlas all see the same row */
    tbl.addEventListener('change', (e) => {
      const inp = e.target; if (!inp || inp.tagName !== 'INPUT' || !inp.dataset.f) return;
      const r = B.setCells([{ index: Number(inp.dataset.i), field: inp.dataset.f, value: inp.value }]);
      if (!r.ok) { inp.value = inp.defaultValue; inp.classList.add('bad'); } setTimeout(update, 0); say(r, L('Saved to the data · ', 'データに反映 · ') + B.label(Number(inp.dataset.i)) + ' / ' + inp.dataset.f);
    });
    const buildTools = () => {
      tools.textContent = '';
      if (!B.editing) { tools.hidden = true; return; }
      tools.hidden = false;
      const can = B.can(), h = B.history();
      const btn = (act, text, fn, off) => { const b = el('button', 'bd-btn', text); b.type = 'button'; b.dataset.act = act; b.disabled = !!off; b.onclick = fn; return b; };
      const sel = el('select', 'bd-in'); sel.dataset.act = 'column'; sel.setAttribute('aria-label', L('Column', '列'));
      columnsOf(B.rows).forEach((k) => { const o = el('option', null, k); o.value = k; sel.appendChild(o); });
      const nm = el('input', 'bd-in'); nm.placeholder = L('New column name', '新しい列名'); nm.dataset.act = 'colname'; nm.setAttribute('aria-label', L('New column name', '新しい列名'));
      tools.append(
        btn('undo', L('Undo', '元に戻す'), () => say(B.undo(), L('Undone', '元に戻しました')), !h.undo),
        btn('redo', L('Redo', 'やり直す'), () => say(B.redo(), L('Redone', 'やり直しました')), !h.redo),
        sel, nm,
        btn('addcol', L('Add column', '列を追加'), () => say(B.addColumn(nm.value), L('Column added', '列を追加しました')), false),
        btn('rencol', L('Rename', '名前変更'), () => say(B.renameColumn(sel.value, nm.value), L('Renamed', '名前を変えました')), false),
        btn('delcol', L('Remove', '削除'), () => say(B.removeColumn(sel.value), L('Removed', '削除しました')), false));
      if (!can.ok) { say(can); }
    };
    toggle.onclick = async () => { B.editing = !B.editing; if (B.editing) await B.prepare(); update(); };
    function update() {
      const vis = B.vis(), sel = new Set(B.state.get().selection), c = cols(), ed = !!B.editing && B.can().ok;
      toggle.setAttribute('aria-pressed', B.editing ? 'true' : 'false'); toggle.classList.toggle('on', !!B.editing);
      toggle.textContent = B.editing ? L('Done', '完了') : L('Edit', '編集');
      /* rebuilt only when it is not being typed in: a repaint under the caret would eat the reader's keystrokes */
      const typing = card.contains(doc().activeElement) && doc().activeElement.tagName === 'INPUT';
      if (typing) return;
      tbl.textContent = '';
      const hr = el('tr'); c.forEach((k) => hr.appendChild(el('th', null, k))); const th = el('thead'); th.appendChild(hr); tbl.appendChild(th);
      const tb = el('tbody');
      vis.slice(0, ROW_CAP).forEach((i) => {
        const tr = el('tr', sel.has(i) ? 'sel' : ''); tr.dataset.i = i; tr.tabIndex = 0;
        c.forEach((k) => {
          const td = el('td'); const v = B.rows[i].properties[k];
          if (ed) { const inp = el('input', 'bd-cell'); inp.value = cellText(v); inp.defaultValue = inp.value; inp.dataset.i = i; inp.dataset.f = k; inp.setAttribute('aria-label', B.label(i) + ' / ' + k); td.appendChild(inp); }
          else td.textContent = cellText(v);
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      buildTools();
      meta.textContent = vis.length > ROW_CAP ? L('Showing ' + ROW_CAP + ' of ' + vis.length + ' rows', vis.length + ' 行中 ' + ROW_CAP + ' 行を表示') : vis.length + L(' rows', ' 行');
    }
    return { el: card, update };
  }

  function wChart(w, B) {
    const card = el('div', 'bd-card'), host = el('div'), meta = el('div', 'bd-meta');
    card.append(host, meta);
    return { el: card, update() {
      const sel = new Set(B.state.get().selection);
      let pts = B.vis().map((i) => ({ i, x: B.rows[i].properties[w.x], y: Number(B.rows[i].properties[w.y]) })).filter((p) => Number.isFinite(p.y));
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
        shown.forEach((p) => { const c = svg('circle', { cx: X(p.n), cy: Y(p.y), r: sel.has(p.i) ? 6 : 4, class: 'm' + (sel.has(p.i) ? ' sel' : '') }); act(B, c, p.i, w.id); const t = svg('title'); t.textContent = p.x + ': ' + p.y; c.appendChild(t); s.appendChild(c); });
      } else {
        const bw = (W - pad - 12) / shown.length;
        shown.forEach((p, k) => { const y0 = Y(0), y1 = Y(p.y); const r = svg('rect', { x: pad + k * bw + 1, y: Math.min(y0, y1), width: Math.max(2, bw - 2), height: Math.max(1, Math.abs(y1 - y0)), rx: 3, class: 'm' + (sel.has(p.i) ? ' sel' : '') }); act(B, r, p.i, w.id); const t = svg('title'); t.textContent = cellText(p.x) + ': ' + p.y; r.appendChild(t); s.appendChild(r); });
      }
      const top = svg('text', { x: 4, y: 12, 'font-size': 10, fill: 'currentColor' }); top.textContent = String(hi); s.appendChild(top);
      host.appendChild(s);
      meta.textContent = (w.title ? w.title + ' · ' : '') + w.y + (w.chart === 'line' ? ' ~ ' + w.x : ' / ' + w.x) + (total > shown.length ? L(' · top ' + shown.length + ' of ' + total, ' · 上位 ' + shown.length + ' / ' + total) : '');
    } };
  }

  function wFilter(w, B) {
    const card = el('div', 'bd-card'), body = el('div'), meta = el('div', 'bd-meta');
    card.append(body, meta);
    let built = false;
    const build = () => {
      body.textContent = ''; built = true;
      if (w.control === 'category') {
        const vals = [...new Set(B.rows.map((r) => r.properties[w.field]).filter((v) => v != null && v !== '').map(String))].slice(0, 24);
        vals.forEach((v) => { const b = el('button', 'bd-chip', v); b.type = 'button'; b.onclick = () => { const f = B.state.get().filters[w.id]; const set = new Set((f && f.values) || []); set.has(v) ? set.delete(v) : set.add(v); B.state.setFilter(w.id, set.size ? { field: w.field, values: [...set] } : null); }; body.appendChild(b); });
      } else {
        const ns = numeric(B.rows, w.field), lo = Math.min(...ns), hi = Math.max(...ns);
        const a = el('input'), b = el('input'); [a, b].forEach((x) => { x.type = 'range'; x.min = lo; x.max = hi; x.step = (hi - lo) / 100 || 1; });
        const f0 = B.state.get().filters[w.id]; a.value = f0 && f0.min != null ? f0.min : lo; b.value = f0 && f0.max != null ? f0.max : hi;
        const go = () => { const mn = Math.min(Number(a.value), Number(b.value)), mx = Math.max(Number(a.value), Number(b.value)); B.state.setFilter(w.id, (mn <= lo && mx >= hi) ? null : { field: w.field, min: mn, max: mx }, w.id); lab(); };
        const lab = () => { meta.textContent = w.field + ': ' + Math.min(Number(a.value), Number(b.value)) + ' – ' + Math.max(Number(a.value), Number(b.value)); };
        a.oninput = b.oninput = go; body.append(a, b); lab();
      }
    };
    return { el: card, update(source) {
      if (!built) build();
      if (w.control === 'category') { const f = B.state.get().filters[w.id], on = new Set((f && f.values) || []); body.querySelectorAll('.bd-chip').forEach((c) => c.classList.toggle('on', on.has(c.textContent))); meta.textContent = w.field + (on.size ? ': ' + [...on].join(', ') : L(': all', ': すべて')); }
      else if (source !== w.id) { build(); }
    } };
  }

  function wMap(w, B) {
    const card = el('div', 'bd-card'), host = el('div'), bar = el('div'), meta = el('div', 'bd-meta');
    const draw = el('button', 'bd-btn', L('Show these rows on the map', '行を地図に表示')); draw.type = 'button';
    const link = el('button', 'bd-btn pri', L('Link to the main map', 'メインの地図と連動')); link.type = 'button';
    link.setAttribute('aria-pressed', 'false');
    bar.append(link, draw); bar.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px';
    card.append(host, bar, meta);
    /* the two-way link to IntMap's own map (js/board-link.js): rows drawn there with the selection highlighted, a click there selects here */
    const setLink = (on) => {
      if (on) { const r = B.attach(); if (!r.attached) { meta.textContent = L('Could not link the main map: ', 'メインの地図と連動できませんでした: ') + r.why; return; } B.mapLink.fit(); }
      else B.detach();
      link.setAttribute('aria-pressed', on ? 'true' : 'false');
      link.textContent = on ? L('Linked to the main map', 'メインの地図と連動中') : L('Link to the main map', 'メインの地図と連動');
      link.classList.toggle('on', on);
    };
    link.onclick = () => setLink(!B.mapLink);
    B.onMapLink = (on) => setLink(on);
    draw.onclick = async () => {
      try { await window.IntMapLazy.need('gisCore'); const r = window.IntMapGis && B.datasetId && window.IntMapGis.draw(B.datasetId); meta.textContent = (r && r.ok) ? L('Drawn on the main map.', '地図に描きました。') : L('Could not draw on the main map: ', '地図に描けませんでした: ') + ((r && r.why) || 'unavailable'); } catch (e) { meta.textContent = L('Could not draw on the main map.', '地図に描けませんでした。'); }
    };
    return { el: card, update() {
      const vis = B.vis().filter((i) => B.rows[i].geometry), sel = new Set(B.state.get().selection);
      host.textContent = '';
      const bb = bboxOf(B.rows, vis);
      if (!bb) { meta.textContent = L('No row has a location to draw.', '位置を持つ行がありません。'); draw.hidden = true; return; }
      draw.hidden = !B.datasetId;
      const W = 440, H = 220, p = 14, dx = (bb.x1 - bb.x0) || 1, dy = (bb.y1 - bb.y0) || 1, k = Math.min((W - 2 * p) / dx, (H - 2 * p) / dy);
      const X = (x) => p + (x - bb.x0) * k, Y = (y) => H - p - (y - bb.y0) * k;
      const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': w.title || L('Map of the rows', '行の地図') });
      s.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, rx: 10, fill: 'color-mix(in srgb,var(--text-main,#111) 5%,transparent)' }));
      vis.slice(0, 2000).forEach((i) => {
        const g = B.rows[i].geometry, isSel = sel.has(i);
        if (g.type === 'Point') { const c = svg('circle', { cx: X(g.coordinates[0]), cy: Y(g.coordinates[1]), r: isSel ? 7 : 5, class: 'm' + (isSel ? ' sel' : '') }); act(B, c, i, w.id); s.appendChild(c); }
        else { const rings = []; const col = (c) => { if (typeof c[0] === 'number') return; if (typeof c[0][0] === 'number') rings.push(c); else c.forEach(col); }; col(g.coordinates);
          rings.forEach((r) => { const q = svg('polyline', { points: r.map((c) => X(c[0]) + ',' + Y(c[1])).join(' '), class: 'g m' + (isSel ? ' sel' : ''), style: 'fill:' + (g.type.includes('Polygon') ? 'var(--primary-color,#0a84ff)' : 'none') + ';fill-opacity:' + (isSel ? .5 : .18) }); act(B, q, i, w.id); s.appendChild(q); }); }
      });
      host.appendChild(s);
      meta.textContent = vis.length + (B.mapLink ? L(' located rows · linked to the main map: click a shape on either map', ' 件 · メインの地図と連動中。どちらの地図でも図形をクリックできます') : L(' located rows (plain outline; “Link to the main map” draws them on the real map)', ' 件を表示(簡易表示。「メインの地図と連動」で本物の地図に描きます)'));
    } };
  }

  function wEvidence(w, B) {
    const card = el('div', 'bd-card'), t = el('div'), pick = el('div'), meta = el('div', 'bd-meta');
    card.append(t, pick, meta);
    return { el: card, update() {
      t.textContent = L('Board data source: ', 'ボードのデータの出典: ') + B.spec.source;
      /* what the reader pointed at, on ANY element or the real map: its own fields, so the ground for the highlighted rows is read here without opening the table */
      const sel = B.state.get().selection.filter((i) => B.rows[i]);
      pick.textContent = '';
      sel.slice(0, 5).forEach((i) => { const p = B.rows[i].properties || {}, d = el('div', 'bd-meta'); d.style.cssText = 'color:var(--text-main,#111);margin-top:4px'; d.textContent = Object.keys(p).slice(0, 6).map((k) => k + ': ' + cellText(p[k])).join(' · '); pick.appendChild(d); });
      if (sel.length > 5) pick.appendChild(el('div', 'bd-meta', L('and ' + (sel.length - 5) + ' more selected', '他に ' + (sel.length - 5) + ' 件を選択中')));
      const fs = Object.values(B.state.get().filters), n = B.vis().length, tm = B.state.get().time;
      meta.textContent = (B.datasetId ? L('Dataset ', 'データセット ') + B.datasetId + ' · ' : '') + n + '/' + B.rows.length + L(' rows pass ', ' 行が通過 / 条件 ') + (fs.length + (tm ? 1 : 0)) + L(' filter(s)', ' 件');
    } };
  }

  function wTime(w, B) {
    /* the board's face of the master clock: the rows shown follow IntMapTime (js/board-link.js followClock keeps the two in step both ways) */
    const card = el('div', 'bd-card'), lab = el('div'), r = el('input'), meta = el('div', 'bd-meta');
    const ys = B.rows.map((row) => B.yearOf(row)).filter((y) => y != null), lo = Math.min(...ys), hi = Math.max(...ys);
    r.type = 'range'; r.min = lo; r.max = hi; r.step = 1;
    const cur0 = B.state.get().time; r.value = cur0 ? Math.min(hi, Math.max(lo, cur0.year)) : hi;
    card.append(lab, r, meta);
    const show = () => { lab.textContent = (w.title || L('Time', '時間')) + ': ' + r.value + (w.mode === 'at' ? '' : L(' and earlier', ' 以前')); };
    r.oninput = () => { show(); B.state.setTime({ year: Number(r.value), mode: w.mode }, w.id); };
    r.onchange = r.oninput;
    show();
    meta.textContent = L('Moves the main clock too, and follows it.', 'メインの時計も動き、時計に追従します。');
    if (!Number.isFinite(lo)) { meta.textContent = L('No row has a year.', '年を持つ行がありません。'); r.disabled = true; }
    return { el: card, update(source) { const t = B.state.get().time; if (t && source !== w.id) { r.value = Math.min(hi, Math.max(lo, t.year)); show(); } } };
  }

  function wParam(w, B) {
    const card = el('div', 'bd-card'), lab = el('div'), r = el('input'), meta = el('div', 'bd-meta');
    r.type = 'range'; r.min = w.min; r.max = w.max; r.step = w.step; r.value = B.state.get().params[w.id] != null ? B.state.get().params[w.id] : (w.value != null ? w.value : w.min);
    card.append(lab, r, meta);
    const show = () => { lab.textContent = (w.title || w.key) + ': ' + r.value; };
    r.oninput = show;
    r.onchange = async () => {
      B.state.setParam(w.id, r.value, w.id);
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
  /* headline figures computed FROM THE VISIBLE ROWS (or the selected ones), so a filter, a selection or the clock moving updates them */
  function wMetrics(w, B) {
    const card = el('div', 'bd-card'), grid = el('div', 'bd-tiles'), meta = el('div', 'bd-meta');
    card.append(grid, meta);
    return { el: card, update() {
      const v = B.vis(), sel = new Set(B.state.get().selection), picked = v.filter((i) => sel.has(i)), idx = picked.length ? picked : v, f = nfmt();
      grid.textContent = '';
      w.items.forEach((m) => {
        const x = aggregate(B.rows, idx, m), t = el('div', 'bd-tile');
        t.append(el('div', 'bd-tl', m.label), el('div', 'bd-tv', x == null ? '—' : f.format(x) + (m.unit ? ' ' + m.unit : '')));
        grid.appendChild(t);
      });
      const tm = B.state.get().time;
      meta.textContent = (picked.length ? L('Over the ' + picked.length + ' selected row(s)', '選択した ' + picked.length + ' 行について') : L('Over ' + v.length + ' visible row(s)', '表示中の ' + v.length + ' 行について'))
        + (tm && B.yearOf ? L(' · as of ' + tm.year, ' · ' + tm.year + ' 年時点') : '');
    } };
  }

  /* the real-world objects a session has surfaced, handed in as rows by js/atlas-cap-board.js (this file never imports them): grouped by type, one chip each */
  function wObjects(w, B) {
    const card = el('div', 'bd-card'), wrap = el('div', 'bd-scroll'), meta = el('div', 'bd-meta');
    card.append(wrap, meta);
    wrap.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button[data-i]'); if (b) B.state.toggle(Number(b.dataset.i), w.id); });
    return { el: card, update() {
      const v = B.vis(), sel = new Set(B.state.get().selection), by = new Map();
      v.forEach((i) => { const t = String(B.rows[i].properties[w.typeField] || '—'); if (!by.has(t)) by.set(t, []); by.get(t).push(i); });
      wrap.textContent = '';
      by.forEach((list, t) => {
        wrap.appendChild(el('div', 'bd-sec', t + ' · ' + list.length));
        list.slice(0, ROW_CAP).forEach((i) => { const p = B.rows[i].properties, rel = Number(p.related); const b = el('button', 'bd-chip' + (sel.has(i) ? ' on' : ''), cellText(p[w.nameField]) + (Number.isFinite(rel) && rel > 0 ? ' · ' + rel : '')); b.type = 'button'; b.dataset.i = i; wrap.appendChild(b); });
      });
      meta.textContent = v.length + L(' objects', ' 件のオブジェクト') + (B.rows.some((r) => r.properties.related != null) ? L(' · the number is how many others they relate to', ' · 数字は関連する他のオブジェクトの数') : '');
    } };
  }

  const MAKERS = { metrics: wMetrics, objects: wObjects, table: wTable, chart: wChart, filter: wFilter, map: wMap, evidence: wEvidence, param: wParam, time: wTime };

  /* ── open / close ────────────────────────────────────────────────────── */
  /* MANY BOARDS AT ONCE. On a desktop a reader works several windows side by side (a ranking beside the
     result of a GIS step); each open board is its own instance with its own store and rows, and they stack
     with an offset. `cur` is only the front-most, for the single-board callers (state(), save()). */
  const boards = new Map();
  let cur = null;
  let zTop = 0;
  const narrow = () => { try { return window.matchMedia('(max-width:640px)').matches; } catch (_) { return false; } };

  function closeOne(B) {
    if (!B) return;
    try { B.off.forEach((f) => f()); } catch (_) { /* unsubscribing twice is harmless */ }
    try { B.detach(); } catch (_) { /* the map link may never have been attached */ }
    if (B.root && B.root.parentNode) B.root.parentNode.removeChild(B.root);
    boards.delete(B.id);
    if (cur === B) cur = [...boards.values()].pop() || null;
  }
  function close(id) { if (id) closeOne(boards.get(id)); else [...boards.values()].forEach(closeOne); }

  function refresh(B, source) {
    if (!B || !boards.has(B.id)) return;
    B.widgets.forEach((w) => { try { w.update(source); } catch (e) { /* one widget failing must not blank the others */ } });
    const st = B.state.get();
    B.foot.textContent = B.vis().length + '/' + B.rows.length + L(' rows · ', ' 行 · ') + st.selection.length + L(' selected', ' 件選択')
      + (B.progress ? L(' · partial result', ' · 途中経過') + (B.progress.fraction != null ? ' ' + Math.round(B.progress.fraction * 100) + '%' : '') : '')
      + (B.capped ? L(' · capped at ' + MAX_ROWS + ' rows', ' · ' + MAX_ROWS + ' 行で打ち切り') : '');
  }

  function dragByHead(root, head) {
    head.style.cursor = 'grab'; head.style.touchAction = 'none';
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest && e.target.closest('button')) return;
      const r = root.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mv = (m) => { root.style.left = Math.max(0, m.clientX - dx) + 'px'; root.style.top = Math.max(0, m.clientY - dy) + 'px'; root.style.right = 'auto'; };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  }

  /** open(rawSpec, {id, state, keep}) → {ok, id, widgets, issues?}   The spec is checked against the data's real columns first.
   *  An open board with the same id is replaced; others stay open unless `keep` is false. */
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
    if (boards.has(boardId)) closeOne(boards.get(boardId));
    if (opts.keep === false || narrow()) close();   /* a phone has room for one sheet over the conversation */
    css();
    const spec = res.spec; spec.boardId = boardId;
    const root = el('div', 'bd-panel'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', spec.title); root.dataset.boardId = boardId;
    const head = el('div', 'bd-head'), title = el('div', 'bd-title', spec.title), save = el('button', 'bd-btn pri', L('Save', '保存')), x = el('button', 'bd-btn', '×');
    const redo = el('button', 'bd-btn', L('Ask Atlas to redo', 'Atlas で再分析')), saved = el('button', 'bd-btn', L('Saved workspaces', '保存済み'));
    save.type = x.type = redo.type = saved.type = 'button'; x.setAttribute('aria-label', L('Close', '閉じる'));
    redo.dataset.act = 'reanalyze'; saved.dataset.act = 'saved';
    head.append(title, saved, redo, save, x);
    const body = el('div', 'bd-body'), foot = el('div', 'bd-foot');
    root.append(head, body, foot);
    const timeField = spec.data.timeField || null;
    const B = { id: boardId, spec, rows: got.rows, datasetId: got.datasetId, state: createBoardState(opts.state), root, foot, widgets: [], off: [], mapLink: null, onMapLink: null,
      base: Array.isArray(opts.base) ? opts.base : snapshotRows(got.rows), rn: { undo: Array.isArray(opts.renames) ? opts.renames.slice() : [], redo: [] }, editMsg: '',
      yearOf: timeField ? (row) => yearOf(row && row.properties ? row.properties[timeField] : undefined) : null,
      vis() { return B.state.visible(B.rows, B.yearOf); },
      /* the link to IntMap's real map (js/board-link.js). Attaching is a reader action (the map widget's button) or the spec's `link:true`; both end here */
      attach() { if (B.mapLink) return { attached: true }; const r = attachMap(B, { GE: IntMapGeoEngine }); if (r.attached) { B.mapLink = r; refresh(B); } return r; },
      detach() { if (B.mapLink) { B.mapLink.detach(); B.mapLink = null; refresh(B); } } };
    /* ── EDITING. The writes are IntMapData's (js/gis-datasets.js: each batch checked whole, each undoable, dependents marked stale);
       this is the board's side of them. The same methods answer the reader's table and Atlas's `board.edit` capability, so there is one way to edit. ── */
        const refuse = (why, detail) => ({ ok: false, why, detail, text: editRefusal(why, detail, L) });
    const done = (r) => (r && r.ok ? r : refuse(r && r.why, r && r.detail));
    const dsApi = () => { const D = DATA(); return D && B.datasetId && D.editable ? D : null; };
    /* the registry is a lazy module: load it, and register this board's inline rows if it was opened before it arrived */
    B.prepare = async () => {
      if (dsApi()) return { ok: true };
      try { await window.IntMapLazy.need('gisCore'); } catch (_) { return refuse('no-dataset'); }
      if (!B.datasetId && B.spec.data.rows) { const g = registerInline({ ...B.spec, boardId: B.id }, B.rows); if (g.datasetId) { B.datasetId = g.datasetId; B.rows = g.rows; B.subscribeData(); refresh(B); } }
      return dsApi() ? { ok: true } : refuse('no-dataset');
    };
    B.can = () => { const D = dsApi(); if (!D) return refuse('no-dataset'); const r = D.editable(B.datasetId); return r.ok ? { ok: true } : refuse(r.why, r.detail); };
    B.label = (i) => { const p = (B.rows[i] && B.rows[i].properties) || {}; const k = ['name', 'title', 'label', 'id', 'country', 'ref'].find((c) => p[c] != null && p[c] !== ''); return k ? String(p[k]) : '#' + (i + 1); };
    B.cellsOf = (field) => B.rows.map((r) => (r.properties || {})[field]);
    /** setCells([{index, field, value}]) — a typed string is read by the column's own type (a number column takes a number, or the edit is refused) */
    B.setCells = (edits) => {
      const D = dsApi(); if (!D) return refuse('no-dataset');
      const plan = [];
      for (const e of edits || []) {
        const v = typeof e.value === 'string' ? parseCell(e.value, B.cellsOf(e.field)) : { ok: true, value: e.value };
        if (!v.ok) return refuse(v.why, { value: v.value, field: e.field });
        plan.push({ index: e.index, field: e.field, value: v.value });
      }
      const r = D.editValues(B.datasetId, plan);
      if (r.ok && plan.some((p) => B.spec.widgets.some((w) => w.kind === 'filter' && w.field === p.field))) B.rebuild();
      return done(r);
    };
    const reflect = (fn) => { const r = fn(); if (r && r.ok) B.rebuild(); return done(r); };
    B.addColumn = (name, value) => { const D = dsApi(); if (!D) return refuse('no-dataset'); return reflect(() => { const r = D.addField(B.datasetId, String(name || '').trim(), value == null ? null : value); if (r.ok) B.spec.widgets.forEach((w) => { if (w.kind === 'table' && w.columns && w.columns.length && w.columns.length < 12) w.columns.push(r.field && r.field.name || String(name).trim()); }); return r; }); };
    B.renameColumn = (from, to) => {
      const D = dsApi(); if (!D) return refuse('no-dataset');
      to = String(to || '').trim();
      return reflect(() => {
        const r = D.renameField(B.datasetId, from, to);
        if (r.ok) { B.carry(from, to); B.rn.undo.push({ from, to }); B.rn.redo.length = 0; }
        return r;
      });
    };
    /* a rename carries the widgets and the filters that read the column; undo/redo of a rename carries them back */
    B.carry = (from, to) => {
      const ns = renameInSpec(B.spec, from, to);
      Object.assign(B.spec.data, ns.data); B.spec.widgets.forEach((w, i) => Object.assign(w, ns.widgets[i]));
      const fs = B.state.get().filters; Object.keys(fs).forEach((k) => { if (fs[k].field === from) B.state.setFilter(k, { ...fs[k], field: to }, 'edit'); });
    };
    B.removeColumn = (name) => {
      const D = dsApi(); if (!D) return refuse('no-dataset');
      const uses = columnUses(B.spec, name); if (uses.length) return refuse('column-in-use', { field: name, uses });
      return reflect(() => D.removeField(B.datasetId, name));
    };
    B.undo = () => B.step('undo'); B.redo = () => B.step('redo');
    B.step = (dir) => {
      const D = dsApi(); if (!D) return refuse('no-dataset');
      return reflect(() => {
        const r = D[dir](B.datasetId);
        if (r.ok && r.applied === 'rename-field') {
          const from = dir === 'undo' ? B.rn.undo : B.rn.redo, to = dir === 'undo' ? B.rn.redo : B.rn.undo, m = from.pop();
          if (m) { dir === 'undo' ? B.carry(m.to, m.from) : B.carry(m.from, m.to); to.push(m); }
        }
        return r;
      });
    };
    B.history = () => { const D = DATA(); const h = D && D.history && B.datasetId ? D.history(B.datasetId) : null; return h ? { undo: h.undo, redo: h.redo } : { undo: 0, redo: 0 }; };
    /** what differs from the rows the board was opened with, plus filters/time/selection: the thing Atlas continues from */
    B.delta = () => diffRows(B.base, B.rows, B.rn.undo);
    B.deltaText = () => deltaText({ delta: B.delta(), state: B.state.get(), title: spec.title, label: B.label, L });
    let lastSec = null, group = body;
    const secName = (s) => L(s, ({ Map: '地図', Data: 'データ', Analysis: '分析', Time: '時間', Objects: 'オブジェクト', Evidence: '根拠', Execution: '実行' })[s] || s);
    /* on a phone the conversation stays the main thing: sections are folded, and only the first (the data) is open; the reader opens the rest as they need them */
    const fold = narrow();
    function build() {
      lastSec = null; group = body;
      spec.widgets.forEach((w) => {
        const made = MAKERS[w.kind](w, B);
        if (w.section !== lastSec) {
          lastSec = w.section;
          if (fold) { group = el('details', 'bd-group'); group.appendChild(el('summary', 'bd-sec', secName(w.section))); if (!body.firstChild) group.open = true; body.appendChild(group); }
          else { group = body; body.appendChild(el('div', 'bd-sec', secName(w.section))); }
        }
        if (w.title && w.kind !== 'chart') made.el.insertBefore(el('div', 'bd-meta', w.title), made.el.firstChild);
        group.appendChild(made.el); B.widgets.push(made);
      });
    }
    /* a column was added / renamed: widgets that cache their controls (a filter's chips, a range's bounds) are drawn again from the spec */
    B.rebuild = () => { body.textContent = ''; B.widgets = []; build(); refresh(B); };
    build();
    B.off.push(B.state.subscribe((e) => refresh(B, e.source)));
    /* a time widget makes the board follow the master clock and lead it */
    const tw = spec.widgets.find((w) => w.kind === 'time');
    if (tw) {
      if (!B.state.get().time) B.state.setTime({ year: IntMapTime.year(), mode: tw.mode }, 'link');
      B.off.push(followClock(B, { Time: IntMapTime }));
    }
    B.subscribeData = () => { const D = DATA(); if (D && D.subscribe && B.datasetId) B.off.push(D.subscribe((what, ds) => {
      if (!boards.has(B.id) || !ds || ds.id !== B.datasetId || what === 'remove') return;
      try { B.rows = ds.features(); } catch (_) { return; }
      refresh(B); if (B.mapLink) B.mapLink.repaint();
    })); };
    B.subscribeData();
    x.onclick = () => closeOne(B);
    /* "redo the analysis": what the reader changed here is handed to Atlas as one message, and Atlas continues from it — the loop edit → re-analyse needs no retyping */
    B.reanalyze = async () => {
      const text = B.deltaText();
      try { const A = window.IntMapAtlas; if (!A) return { ok: false, why: 'atlas-unavailable', text }; await A.ensure(); await A.call('open'); A.call('run', text); return { ok: true, text }; }
      catch (e) { return { ok: false, why: 'atlas-unavailable', text }; }
    };
    redo.onclick = async () => { const r = await B.reanalyze(); redo.textContent = r.ok ? L('Sent to Atlas', 'Atlas に送りました') : L('Atlas is not available', 'Atlas を開けません'); setTimeout(() => { redo.textContent = L('Ask Atlas to redo', 'Atlas で再分析'); }, 1800); };
    saved.onclick = async () => {
      const old = root.querySelector('.bd-saved'); if (old) { old.remove(); return; }
      const l = await list(), pop = el('div', 'bd-saved bd-card'); pop.dataset.saved = 'list';
      if (!l.ok || !l.boards.length) pop.appendChild(el('div', 'bd-meta', l.ok ? L('No saved workspaces yet.', '保存済みのワークスペースはまだありません。') : L('Saved workspaces are unavailable here.', 'ここでは保存済みを読めません。')));
      else l.boards.forEach((b) => {
        const row = el('div', 'bd-savedrow'), open1 = el('button', 'bd-btn', b.title), del = el('button', 'bd-btn', L('Delete', '削除'));
        open1.type = del.type = 'button'; open1.dataset.id = b.id; del.dataset.id = b.id; open1.title = new Date(b.savedAt).toLocaleString(IntMapLang.locale(HOST.lang, 'en-GB'));
        open1.onclick = async () => { pop.remove(); await restore(b.id); };
        del.onclick = async () => { await remove(b.id); row.remove(); };
        row.append(open1, del); pop.appendChild(row);
      });
      root.insertBefore(pop, body);
    };
    save.onclick = async () => { const r = await saveOne(B); save.textContent = r.ok ? L('Board saved', 'ボードを保存しました') : L('Not saved', '保存できません'); setTimeout(() => { save.textContent = L('Save', '保存'); }, 1800); };
    /* a window per board on a desktop: offset so they don't hide each other, raised on press, moved by the title */
    const n = boards.size;
    if (!fold) { root.style.right = (16 + n * 28) + 'px'; root.style.top = 'calc(var(--safe-top,0px) + ' + (64 + n * 28) + 'px)'; dragByHead(root, head); }
    root.addEventListener('pointerdown', () => { if (cur !== B) { cur = B; root.style.zIndex = String(2200 + (++zTop)); } }, true);
    doc().body.appendChild(root);
    boards.set(boardId, B); cur = B;
    if (spec.widgets.some((w) => (w.kind === 'map' && w.link) || w.kind === 'objects')) { const r = B.attach(); if (r.attached && B.onMapLink) B.onMapLink(true); }
    refresh(B);
    return { ok: true, id: boardId, title: spec.title, widgets: spec.widgets.map((w) => ({ id: w.id, kind: w.kind, section: w.section })), rows: B.rows.length };
  }

  async function saveOne(B) {
    if (!B) return { ok: false, why: 'no-board-open' };
    /* an inline board saves the rows it HOLDS now (a job's partial rows included), bounded by MAX_ROWS */
    const spec = B.spec.data.rows ? { ...B.spec, data: { ...B.spec.data, rows: B.rows.slice(0, MAX_ROWS).map((r) => ({ ...r.properties })) } } : B.spec;
    const rec = { id: B.id, title: B.spec.title, spec, state: B.state.snapshot(), base: B.base, renames: B.rn.undo, savedAt: Date.now() };
    try { await tx('readwrite', (s) => s.put(rec)); return { ok: true, id: B.id }; } catch (e) { return { ok: false, why: 'storage-unavailable', detail: { message: e && e.message } }; }
  }
  const saveCurrent = () => saveOne(cur);

  /* A board declared inside an answer (ui.compose `board` block) is STAGED here — checked by the same gate — and the card's button opens it by key, so the spec never lives in markup. Bounded: the oldest staged spec is dropped past 12, a card for it then says it expired. */
  const staged = new Map();
  function stage(raw) {
    const r = normalise(raw, null); if (!r.ok) return null;
    const key = 'st' + Date.now().toString(36) + staged.size; staged.set(key, raw);
    if (staged.size > 12) staged.delete(staged.keys().next().value);
    return key;
  }
  function openStaged(key) { const raw = staged.get(key); return raw ? open(raw, { id: 'bd-' + key }) : { ok: false, why: 'expired' }; }
  /** feed({rows, done?, progress?, replace?}) — the receiving end of a long job's partial results. Rows are appended to the front INLINE
   *  board (a dataset-backed board changes through window.IntMapData, which the board already hears); until a chunk says `done` the
   *  footer reads "partial result" with the job's fraction (0..1). Rows past MAX_ROWS are not kept, and the footer says so. */
  function feed(chunk, id) {
    const B = id ? boards.get(id) : cur;
    if (!B) return { ok: false, why: 'no-board-open' };
    if (B.spec.data.dataset) return { ok: false, why: 'dataset-board-updates-through-IntMapData' };
    if (!chunk || !Array.isArray(chunk.rows)) return { ok: false, why: 'rows-required' };
    const add = rowsToFeatures(chunk.rows.filter((r) => r && typeof r === 'object' && !Array.isArray(r)), B.spec.data.lngField, B.spec.data.latField);
    let rows = chunk.replace ? add : B.rows.concat(add);
    B.capped = rows.length > MAX_ROWS; if (B.capped) rows = rows.slice(0, MAX_ROWS);
    B.rows = rows;
    const f = Number(chunk.progress);
    B.progress = chunk.done ? null : { fraction: Number.isFinite(f) ? Math.min(1, Math.max(0, f)) : null };
    refresh(B, 'feed'); if (B.mapLink) B.mapLink.repaint();
    return { ok: true, rows: B.rows.length, done: !!chunk.done, capped: !!B.capped };
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
    return open({ title: rec.spec.title, source: rec.spec.source, data: rec.spec.data, widgets: rec.spec.widgets }, { id: rec.id, state: rec.state, base: rec.base, renames: rec.renames });
  }
  async function remove(id) { try { await tx('readwrite', (s) => s.delete(id)); return { ok: true }; } catch (e) { return { ok: false, why: 'storage-unavailable' }; } }

  return { open, feed, api: (id) => { const B = id ? boards.get(id) : cur; return B ? { prepare: B.prepare, can: B.can, setCells: B.setCells, addColumn: B.addColumn, renameColumn: B.renameColumn, removeColumn: B.removeColumn, undo: B.undo, redo: B.redo, delta: B.delta, deltaText: B.deltaText, reanalyze: B.reanalyze, history: B.history, rows: () => B.rows, setFilter: (wid, f) => B.state.setFilter(wid, f, 'api'), spec: () => B.spec, id: B.id } : null; }, rows: (id) => { const B = id ? boards.get(id) : cur; return B ? B.rows : []; }, stage, openStaged, close, save: saveCurrent, list, restore, remove, state: (id) => { const B = id ? boards.get(id) : cur; return B ? B.state : null; }, isOpen: () => boards.size > 0, ids: () => [...boards.keys()] };
}
