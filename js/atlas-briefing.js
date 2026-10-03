/* ============================================================================
 *  IntMap · Atlas — BRIEFINGS: AN INVESTIGATION AS A LINK   (atlas-briefing)        js/atlas-briefing.js
 * ----------------------------------------------------------------------------
 *  「Atlas を、質問に答える窓から、次の段の商品へ。」
 *
 *  The notebook (js/atlas-notebook.js) keeps what the reader asked Atlas. A briefing hands it ON: one or
 *  more notebook entries become a link, and whoever opens the link — no account, no AI call, no server —
 *  sees the map Atlas ended on, the answer beside its EVIDENCE, and when each piece of evidence was taken:
 *    · the clock the map was set to, and the layers that were on (named; a layer this build lacks is named
 *      as absent rather than guessed at);
 *    · the credit of everything the rebuilt map draws, read from the renderer after the rebuild
 *      (js/map-recorder.js drawnCredits — the rule the postcard and the video use);
 *    · each query's rows as they were found, with the moment they were found and their sources — and the
 *      rows that have coordinates DRAWN ON THE MAP as the recorded evidence, credited as such;
 *    · the web sources Atlas cited; the calls Atlas ran.
 *  From there the recipient can rebuild the map by running the recorded calls again (their decision — a
 *  call may reach a network), compare the recorded rows with today, keep the briefing in their own
 *  notebook, or ask Atlas about it (Atlas reads the open briefing: `briefing.open`).
 *
 *  Three ways in, one composer: the notebook's 「ブリーフィングで共有」, Atlas's `briefing.share` (with
 *  `thisTurn`, the answer Atlas is still writing becomes the briefing the moment the turn ends — so
 *  「調べてブリーフィングにして」 is ONE request), and the link itself (js/briefing-link.js → openPacked).
 *
 *  ⚠ NOTHING HERE DECIDES WHAT ATLAS DOES OR ADDS A LIMIT TO A TURN (CONSTITUTION.md §5). Opening a link
 *  puts back the recorded VIEW only; the recorded calls run when the recipient presses for them, and they
 *  are marked as outside content (the sender's), so a capability whose confirmation column asks when
 *  outside content is in play still asks (js/atlas-executor.js 4b).
 *  The data side — what a briefing holds, packing, validation, the link — is js/atlas-briefing-codec.js.
 * ==========================================================================*/
import { buildBriefing, packBriefing, unpackBriefing, briefingLink, LINK_LIMIT_MEASURED } from './atlas-briefing-codec.js';
import { notebookStore, restoreView } from './atlas-notebook.js';
import { normalize } from './atlas-notebook-store.js';
import { BriefingLink } from './briefing-link.js';
import { MapState } from './map-state.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { icon } from './icons.js';
import { IntMapLang } from './lang-registry.js';
import './safe-html.js';

const esc = (s) => IntMapSafe.html(s);   /* js/safe-html.js — the one output encoder (imported above for its side effect: it publishes, it does not export) */
const SRC = 'atl-brief-ev', PT = 'atl-brief-ev-pt', LB = 'atl-brief-ev-lb';

let LIVE = null;
/** the mounted briefing of this page — js/atlas-cap-briefing.js reaches it here (null until Atlas has mounted) */
export function liveBriefing() { return LIVE; }

/* the rows a section's queries found that carry a position — the evidence as it was RECORDED, never re-fetched */
export function evidencePoints(section) {
  const feats = [];
  ((section && section.results) || []).forEach((r, ri) => {
    (r.rows || []).forEach((w) => {
      if (w.lat == null || w.lng == null || !isFinite(w.lat) || !isFinite(w.lng)) return;
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [+w.lng, +w.lat] },
        properties: { name: String(w.name || w.id || ''), table: String(r.tableLabel || r.table || ''), at: +r.at || 0, r: ri } });
    });
  });
  return { type: 'FeatureCollection', features: feats };
}
/* the credit the evidence layer carries onto the map's credit line: what it is, when it was found, and the
   sources its tables name — as TEXT (a credit is read as markup by the renderer, so every value is encoded) */
export function evidenceCredit(section, lang) {
  const t = IntMapLang.pick(() => String(lang || 'en'));
  const srcs = [];
  ((section && section.results) || []).forEach((r) => (r.sources || []).forEach((s) => { const x = String(s.what || s.src || '').trim(); if (x && srcs.indexOf(x) < 0) srcs.push(x); }));
  const when = (section && section.results && section.results[0] && section.results[0].at) || (section && section.at) || 0;
  let d = ''; try { d = when ? new Date(when).toISOString().slice(0, 10) : ''; } catch (_) { d = ''; }
  return esc(t('Atlas briefing — rows as recorded', 'Atlas ブリーフィング——記録時の行') + (d ? ' ' + d : '') + (srcs.length ? ' · ' + srcs.join(', ') : ''));
}

export function makeAtlasBriefing(NOTEBOOK) {
  let D = null, panel = null, sheet = null, mode = 'read';
  let open = null;       /* { b, packed, link, index, seen: { [i]: { unresolved, missingLayers } }, credits: null|string[], pins: true, err } */
  let draft = null;      /* { items: entry[], title, withNotes, packed, link, error, status, picking, pickQ } */
  const pending = new Map();   /* turnId → { items, title } — a briefing Atlas asked for, waiting for its turn to end */
  const L = IntMapLang.pick(() => (D && D.lang ? D.lang() : 'en'));   /* the UI's language — the sheet is chrome, not a reply */
  const GE = () => IntMapGeoEngine;
  const fmtWhen = (ms) => { try { return ms ? new Date(ms).toLocaleString(IntMapLang.locale(D && D.lang ? D.lang() : 'en'), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; } catch (_) { return ''; } };
  const kb = (n) => (n >= 1024 ? (Math.round(n / 102.4) / 10) + ' kB' : n + ' B');
  const page = () => { try { return location.origin + location.pathname; } catch (_) { return ''; } };
  const here = () => ({ view: MapState.read('view') || null, base: MapState.read('base'), terrain: !!MapState.read('terrain') });

  /* ══ THE RECIPIENT'S SIDE ════════════════════════════════════════════════════════════════════════ */
  /* why a link did not open — one sentence per refusal js/atlas-briefing-codec.js names */
  const ERR = {
    'not-a-briefing': () => L('This link does not carry an IntMap briefing.', 'このリンクには IntMap のブリーフィングが入っていません。'),
    'unknown-packing': () => L('This briefing was packed by a newer IntMap than this one.', 'このブリーフィングは、この版より新しい IntMap で作られています。'),
    'newer-version': () => L('This briefing was written by a newer IntMap than this one.', 'このブリーフィングは、この版より新しい IntMap で書かれています。'),
    corrupt: () => L('This link is damaged — part of it may have been cut off when it was copied.', 'リンクが壊れています——コピーの途中で切れた可能性があります。'),
    'too-large': () => L('This briefing unpacks to more than this page will read, so it was not opened.', 'このブリーフィングは展開後の大きさが上限を超えるため、開きませんでした。'),
    'empty-briefing': () => L('This briefing holds no readable answer.', 'このブリーフィングには読める回答がありません。'),
  };
  /* a restore staged by the map-state store (the link's own camera, «now», «no data layers») is still applying for
     ~3.5 s; the briefing's view goes on after it, or the restore's late layer pass would undo it */
  const settled = () => new Promise((res) => {
    if (!MapState.restoring()) { res(); return; }
    const off = MapState.onRestore((e) => { if (e && e.phase === 'settled') { off(); res(); } });
  });
  async function openPacked(packed) {
    let b = null, err = '';
    try { b = await unpackBriefing(packed); } catch (e) { err = String((e && e.message) || e); }
    clearPins();
    open = { b, packed: b ? packed : '', link: b ? briefingLink(page(), b, packed, here()) : '', index: 0, seen: {}, credits: null, pins: true, err };
    if (b) BriefingLink.set(packed); else BriefingLink.clear();
    mode = 'read'; show();
    if (!b) return { ok: false, error: err };
    await settled();
    await showSection(0, true);
    return { ok: true, sections: b.sections.length, title: b.title };
  }
  async function showSection(i, restore) {
    if (!open || !open.b) return null;
    const n = open.b.sections.length;
    open.index = Math.max(0, Math.min(n - 1, i | 0));
    open.credits = null;
    const s = open.b.sections[open.index];
    let rv = null;
    if (restore && s.view && D && D.ASTATE) {
      try { rv = await restoreView(s.view, D.ASTATE); } catch (e) { rv = { unresolved: ['view'], missingLayers: [], error: String((e && e.message) || e) }; }
      open.seen[open.index] = rv;
    }
    drawPins();
    render();
    readCredits();
    return rv;
  }
  function close() {
    clearPins();
    if (open) BriefingLink.clear();
    open = null; hide();
  }

  /* ── the evidence on the map ──────────────────────────────────────────────────────────────── */
  function clearPins() {
    try { const L2 = GE().layers; if (L2.has(LB)) L2.remove(LB); if (L2.has(PT)) L2.remove(PT); if (L2.hasSource(SRC)) L2.removeSource(SRC); } catch (_) { }
  }
  function drawPins() {
    clearPins();
    if (!open || !open.b || !open.pins) return 0;
    const s = open.b.sections[open.index], fc = evidencePoints(s);
    if (!fc.features.length) return 0;
    try {
      const L2 = GE().layers;
      L2.addSource(SRC, { type: 'geojson', data: fc, attribution: evidenceCredit(s, D && D.lang ? D.lang() : 'en') });
      L2.add({ id: PT, type: 'circle', source: SRC, paint: { 'circle-radius': 6, 'circle-color': '#ff9f0a', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
      L2.add({ id: LB, type: 'symbol', source: SRC, minzoom: 3, layout: { 'text-field': ['get', 'name'], 'text-font': ['literal', ['Noto Sans Regular']], 'text-size': 11.5, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#ff9f0a', 'text-halo-color': 'rgba(0,0,0,0.75)', 'text-halo-width': 1.2 } });
    } catch (_) { return 0; }
    return fc.features.length;
  }
  /* the credit of what the rebuilt map DRAWS — asked of the renderer once it is idle, by the postcard's own rule */
  async function readCredits() {
    const at = open;
    try { if (D && D.waitIdle) await D.waitIdle(2500);   /* the bound the notebook's filing waits (js/atlas-notebook.js fileTurn) */ } catch (_) { }
    if (open !== at || !open) return;
    /* a layer the restore switched on may have added itself ABOVE the evidence while the map settled — the recorded
       rows go back on top (same rows, same credit), so the reader sees what the answer rests on */
    if (open.pins) drawPins();
    let list = [];
    try {
      const M = await import('./map-recorder.js');
      const extra = []; const el = document.getElementById('map-credit'); const t = el && el.textContent && el.textContent.trim(); if (t) extra.push(t);
      list = M.drawnCredits(GE().scene.getStyle(), GE().camera.getZoom(), extra);
    } catch (_) { list = null; }
    if (open !== at || !open) return;
    open.credits = list;
    if (mode === 'read') render();
  }

  /* ── acting on a section ──────────────────────────────────────────────────────────────────── */
  function rebuild(i) {
    if (!open || !open.b || !D) return null;
    const s = open.b.sections[i];
    /* the sender's calls, stamped as outside content: what reaches the executor is the sender's choice, not this reader's */
    const steps = (s.steps || []).filter((x) => x.replay && x.args && x.args.type).map((x) => Object.assign({}, x.args, { __externalContent: true }));
    hide();
    return D.runDirect(L('Rebuild from the briefing', 'ブリーフィングから再現') + ': ' + s.question.slice(0, 80),
      [{ type: 'briefingOpen', section: i + 1, only: ['time'] }].concat(steps, [{ type: 'briefingOpen', section: i + 1 }]));
  }
  async function keep(i) {
    const s = open && open.b && open.b.sections[i]; if (!s) return { ok: false };
    const S = notebookStore();
    if (await S.get(s.id)) return { ok: true, already: true, id: s.id };
    const e = normalize(Object.assign({}, s, { updatedAt: Date.now(), pinned: false, followOf: null, syncedAt: 0 }));
    if (!e) return { ok: false };
    try { await S.put(e); } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
    return { ok: true, id: s.id };
  }
  async function compare(i) {
    const k = await keep(i); if (!k.ok) return k;
    hide();
    return D.runDirect(L('Compare the briefing with now', 'ブリーフィングを今と比べる') + ': ' + open.b.sections[i].question.slice(0, 80), [{ type: 'notebookCompare', id: k.id }]);
  }

  /* ══ THE SENDER'S SIDE — the composer ═══════════════════════════════════════════════════════════ */
  async function compose(idsOrEntries, opts) {
    const o = opts || {}, S = notebookStore(), items = [];
    for (const x of [].concat(idsOrEntries || [])) {
      const e = (x && typeof x === 'object') ? normalize(x) : await S.get(String(x));
      if (e && !items.some((y) => y.id === e.id)) items.push(e);
    }
    draft = { items, title: String(o.title || ''), withNotes: false, packed: '', link: '', error: o.error || '', status: '', picking: false, pickQ: '' };
    mode = 'compose'; show();
    await regenerate();
    return { ok: !!draft.link, link: draft.link, length: draft.link.length, fits: fits(), sections: items.length, error: draft.error };
  }
  async function regenerate() {
    if (!draft) return;
    draft.packed = ''; draft.link = '';
    if (draft.items.length) {
      const b = buildBriefing(draft.items, { title: draft.title, withNotes: draft.withNotes, lang: D && D.lang ? D.lang() : '' });
      try { draft.packed = await packBriefing(b); draft.link = briefingLink(page(), b, draft.packed, here()); draft.b = b; }
      catch (e) { draft.error = L('The briefing could not be packed', 'ブリーフィングを作れませんでした') + ': ' + String((e && e.message) || e); }
    }
    render();
  }
  const fits = () => !!(draft && draft.link && draft.link.length <= LINK_LIMIT_MEASURED);
  async function copyLink() {
    if (!fits()) return false;
    try { await navigator.clipboard.writeText(draft.link); draft.status = L('Link copied', 'リンクをコピーしました'); render(); return true; }
    catch (_) { draft.status = L('Copying was refused by the browser — select the link and copy it.', 'ブラウザがコピーを拒否しました——リンクを選んでコピーしてください。'); render(); return false; }
  }
  async function shareLink() {
    if (!fits() || !navigator.share) return false;
    try { await navigator.share({ title: draft.b ? draft.b.title : 'IntMap', url: draft.link }); return true; } catch (_) { return false; }
  }
  function downloadFile() {
    try {
      const file = { format: 'intmap-atlas-notebook', v: 1, exportedAt: Date.now(), entries: draft.items.map((e) => { const c = Object.assign({}, e); delete c.syncedAt; if (!draft.withNotes) c.note = ''; return c; }) };
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = 'intmap-atlas-briefing-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (_) { } }, 1500);
      return true;
    } catch (_) { return false; }
  }

  /* ── a briefing Atlas asked for inside a turn: made when that turn is filed ─────────────────── */
  async function afterTurn(turnId, o) {
    const S = notebookStore(), items = [];
    for (const id of (o && o.ids) || []) { const e = await S.get(String(id)); if (e) items.push(e); }
    pending.set(turnId, { items, title: (o && o.title) || '' });
    NOTEBOOK.claim(turnId);
    return true;
  }
  function onFiled(e, t, why) {
    const p = t && pending.get(t.turnId); if (!p) return;
    pending.delete(t.turnId);
    if (!e) {
      const reason = why === 'not-finished' ? L('the answer did not finish', '回答が最後まで終わらなかった') : L('the answer held nothing to share', '共有できる中身がなかった');
      compose(p.items, { title: p.title, error: L('This answer could not become a briefing', 'この回答はブリーフィングにできませんでした') + ': ' + reason });
      return;
    }
    compose(p.items.concat([e]), { title: p.title });
  }

  /* ══ THE SHEET ═════════════════════════════════════════════════════════════════════════════════ */
  /* data-effect: what a press does to stored data — js/atlas-controls.js reads it before Atlas presses it (scripts/data-effects.mjs) */
  const OPEN = { none: '<button type="button" class="atl-br-act" data-effect="none"', private: '<button type="button" class="atl-br-act" data-effect="private"',
    outward: '<button type="button" class="atl-br-act" data-effect="outward"' };
  const EFFECT = { rebuild: 'none', compare: 'private', keep: 'private', copy: 'none', share: 'outward', preview: 'none', file: 'none' };
  const btn = (act, ic, label, dis) => OPEN[EFFECT[act]] + ' data-act="' + act + '"' + (dis ? ' disabled' : '') + '>' + icon(ic, { size: 16 }) + '<span>' + esc(label) + '</span></button>';

  function layerName(id) {
    try {
      const cb = document.getElementById(id); if (!cb) return id;
      /* the row's own name (js/layer-manifest.js rowHTML: the span the i18n fills) — not the whole row, which also holds its controls */
      const lab = cb.closest('label') || (cb.parentElement && cb.parentElement.querySelector('label'));
      const nm = lab && (lab.querySelector('span[data-i18n]') || lab);
      const t = nm && nm.textContent && nm.textContent.replace(/\s+/g, ' ').trim();
      return t || id;
    } catch (_) { return id; }
  }
  function sectionHtml(s, i) {
    const n = open.b.sections.length, seen = open.seen[i] || null;
    let h = '';
    if (n > 1) {
      h += '<div class="atl-br-pager" role="tablist">' + open.b.sections.map((x, k) => '<button type="button" class="atl-br-pg' + (k === i ? ' on' : '') + '" data-sec="' + k + '" role="tab" aria-selected="' + (k === i) + '">' + (k + 1) + '</button>').join('') + '</div>';
    }
    h += '<div class="atl-br-q">' + esc(s.question) + '</div><div class="atl-br-meta">' + esc(L('Investigated', '調査日時') + ' ' + fmtWhen(s.at)) + '</div>';
    const nRep = (s.steps || []).filter((x) => x.replay).length;
    h += '<div class="atl-br-acts">' + btn('rebuild', 'map', L('Rebuild map', '地図を再現'), !nRep)
      + btn('compare', 'reset', L('Compare with now', '今と比べる'), !(s.results || []).length) + btn('keep', 'save', L('Keep in my notebook', 'ノートに保存')) + '</div>';
    h += '<div class="atl-br-ans atl-md"></div>';
    if (s.note) h += '<div class="atl-br-note"><b>' + esc(L('Note from the sender', '送り手のメモ')) + '</b> ' + esc(s.note) + '</div>';
    /* ── the evidence ── */
    h += '<div class="atl-br-h">' + icon('eye', { size: 13 }) + ' ' + esc(L('Evidence, and when it was taken', '根拠と、その時刻')) + '</div><div class="atl-br-ev">';
    const v = s.view || {};
    const clock = v.time ? (v.time.live ? L('live — the world as it was when the answer was written', 'ライブ——回答を書いた時点の世界') + ' (' + fmtWhen(s.at) + ')' : fmtWhen(v.time.t)) : '—';
    h += '<div class="atl-br-row">' + icon('clock', { size: 13 }) + '<span><b>' + esc(L('Map clock', '地図の時刻')) + '</b> ' + esc(clock) + '</span></div>';
    const on = (v.layersOn || []);
    h += '<div class="atl-br-row">' + icon('layers', { size: 13 }) + '<span><b>' + esc(L('Layers on', '表示中のレイヤー')) + '</b> ' + esc(on.length ? on.map(layerName).join(', ') : L('none', 'なし')) + '</span></div>';
    if (seen && seen.missingLayers && seen.missingLayers.length) h += '<div class="atl-br-warn">' + esc(L('Not in this version of IntMap', 'この版の IntMap に無いレイヤー') + ': ' + seen.missingLayers.join(', ')) + '</div>';
    if (seen && seen.unresolved && seen.unresolved.length) h += '<div class="atl-br-warn">' + esc(L('Did not come back as recorded', '記録どおりに戻らなかったもの') + ': ' + seen.unresolved.join(', ')) + '</div>';
    h += '<div class="atl-br-row">' + icon('map', { size: 13 }) + '<span><b>' + esc(L('The map now draws', 'いまの地図が描いているもの')) + '</b> '
      + (open.credits === null ? esc(L('reading the map…', '地図を読み取り中…')) : esc((open.credits && open.credits.length) ? open.credits.join(' · ') : L('no credited source', '出典の付いたものはありません'))) + '</span></div>';
    const nPts = evidencePoints(s).features.length;
    (s.results || []).forEach((r) => {
      const cols = r.columns || [];
      h += '<details class="atl-br-tbl"' + ((s.results.length === 1) ? ' open' : '') + '><summary>' + icon('columns', { size: 13 }) + ' ' + esc((r.tableLabel || r.table) + ' — ' + r.matched + ' ' + L('matched', '件が該当')
        + (r.matched > (r.rows || []).length ? ' (' + L('kept', '保存') + ' ' + (r.rows || []).length + ')' : '') + ' · ' + L('found', '取得') + ' ' + fmtWhen(r.at)) + '</summary>';
      h += '<div class="atl-br-scroll"><table><thead><tr><th>' + esc(L('Name', '名称')) + '</th>' + cols.map((c) => '<th>' + esc(c.label + (c.unit ? ' (' + c.unit + ')' : '')) + '</th>').join('') + '</tr></thead><tbody>'
        + (r.rows || []).map((w) => '<tr><td>' + esc(w.name + (w.iso2 ? ' ' + w.iso2 : '')) + '</td>' + cols.map((c) => '<td>' + esc(w.v && w.v[c.id] != null ? w.v[c.id] : '—') + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
      if ((r.sources || []).length) h += '<div class="atl-br-meta">' + esc(L('Sources', '出典') + ': ' + r.sources.map((x) => x.what + (x.src ? ' — ' + x.src : '')).join(' · ')) + '</div>';
      if ((r.unapplied || []).length) h += '<div class="atl-br-meta">' + esc(L('Conditions the query could not apply', '問い合わせが適用できなかった条件') + ': ' + r.unapplied.join(', ')) + '</div>';
      h += '</details>';
    });
    if (nPts) {
      h += '<label class="atl-br-row atl-br-sw"><input type="checkbox" class="atl-br-pins" data-effect="none"' + (open.pins ? ' checked' : '') + '><span>' + esc(L('Show the recorded rows on the map', '記録時の行を地図に表示') + ' (' + nPts + ')') + '</span></label>';
    }
    if ((s.sources || []).length) h += '<div class="atl-br-sub">' + esc(L('Web sources Atlas cited', 'Atlas が引用したウェブの出典')) + '</div>' + s.sources.map((x) => '<a class="atl-br-src" href="' + IntMapSafe.url(x.url) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title) + '</a>').join('');
    if ((s.steps || []).length) {
      h += '<details class="atl-br-steps"><summary>' + esc(L('What Atlas ran', 'Atlas が実行した操作') + ' (' + s.steps.length + ')') + '</summary>'
        + s.steps.map((x) => '<div><code>' + esc(x.cap) + '</code> · ' + esc(x.status) + (x.replay ? '' : ' · <span class="atl-br-meta">' + esc(L('not re-run by a rebuild', '再現では実行しない')) + '</span>') + '</div>').join('') + '</details>';
    }
    if (!(s.results || []).length && !(s.sources || []).length) h += '<div class="atl-br-meta">' + esc(L('This answer cited no web source and ran no query: its evidence is the map above and the calls Atlas ran.', 'この回答はウェブの出典を引かず、問い合わせもしていません。根拠は上の地図と、Atlas が実行した操作です。')) + '</div>';
    h += '</div>';
    return h;
  }
  function readHtml() {
    if (!open) return '';
    if (!open.b) return '<div class="atl-br-err">' + esc((ERR[open.err] ? ERR[open.err]() : L('This briefing could not be opened', 'このブリーフィングを開けませんでした') + ' (' + open.err + ')')) + '</div>';
    const b = open.b;
    let h = '<div class="atl-br-banner">' + icon('sparkle', { size: 14 }) + '<span>' + esc(L('A shared Atlas briefing', '共有された Atlas ブリーフィング') + ' · ' + fmtWhen(b.at) + ' · ' + b.sections.length + ' ' + L('answers', '件の回答'))
      + '<small>' + esc(L('Atlas wrote these answers for the person who shared them. Read them beside their evidence.', 'これは共有した人のために Atlas が書いた回答です。根拠と一緒に読んでください。')) + '</small></span></div>';
    if (b.rejected) h += '<div class="atl-br-warn">' + esc(L('Parts of this briefing could not be read', '読めなかった部分があります') + ': ' + b.rejected) + '</div>';
    h += '<div class="atl-br-title">' + esc(b.title) + '</div>';
    return h + sectionHtml(b.sections[open.index], open.index);
  }
  function composeHtml() {
    const d = draft; if (!d) return '';
    let h = '';
    if (d.error) h += '<div class="atl-br-warn">' + esc(d.error) + '</div>';
    h += '<label class="atl-br-lbl">' + esc(L('Title', '題名')) + '</label><input type="text" class="atl-br-ti" data-effect="none" maxlength="140" aria-label="' + esc(L('Title', '題名')) + '" value="' + esc(d.title) + '" placeholder="' + esc(d.items[0] ? d.items[0].question.slice(0, 140) : '') + '">';
    h += '<div class="atl-br-sub">' + esc(L('Answers in this briefing', 'このブリーフィングの回答')) + '</div>';
    if (!d.items.length) h += '<div class="atl-br-meta">' + esc(L('Add at least one answer from your notebook.', 'ノートから回答を 1 件以上足してください。')) + '</div>';
    d.items.forEach((e, i) => {
      h += '<div class="atl-br-item"><span class="atl-br-n">' + (i + 1) + '</span><span class="atl-br-it">' + esc(e.title) + '<small>' + esc(fmtWhen(e.at)) + '</small></span>'
        + '<button type="button" class="atl-br-mini" data-effect="none" data-mv="' + i + ':-1" aria-label="' + esc(L('Move up', '上へ')) + '"' + (i ? '' : ' disabled') + '>' + icon('chevronL', { size: 13 }) + '</button>'
        + '<button type="button" class="atl-br-mini" data-effect="none" data-mv="' + i + ':1" aria-label="' + esc(L('Move down', '下へ')) + '"' + (i < d.items.length - 1 ? '' : ' disabled') + '>' + icon('chevronR', { size: 13 }) + '</button>'
        + '<button type="button" class="atl-br-mini" data-effect="none" data-rm="' + i + '" aria-label="' + esc(L('Remove from the briefing', 'ブリーフィングから外す')) + '">' + icon('close', { size: 13 }) + '</button></div>';
    });
    h += '<button type="button" class="atl-br-add" data-effect="none">' + icon('book', { size: 14 }) + '<span>' + esc(d.picking ? L('Close the notebook list', 'ノートの一覧を閉じる') : L('Add answers from the notebook', 'ノートから回答を足す')) + '</span></button>';
    if (d.picking) h += '<input type="search" class="atl-br-pq" data-effect="none" aria-label="' + esc(L('Search the notebook…', 'ノートを検索…')) + '" value="' + esc(d.pickQ) + '" placeholder="' + esc(L('Search the notebook…', 'ノートを検索…')) + '"><div class="atl-br-pick"></div>';
    h += '<label class="atl-br-row atl-br-sw"><input type="checkbox" class="atl-br-wn" data-effect="none"' + (d.withNotes ? ' checked' : '') + '><span>' + esc(L('Include my notes', '自分のメモも含める')) + '<small>' + esc(L('Off: your notes stay on this device.', 'オフのとき、メモはこの端末から出ません。')) + '</small></span></label>';
    if (d.link) {
      const ok = fits();
      h += '<div class="atl-br-meter' + (ok ? '' : ' bad') + '">' + esc(L('Link length', 'リンクの長さ') + ': ' + d.link.length.toLocaleString() + ' ' + L('characters', '文字') + ' (' + kb(d.link.length) + ')') + '<small>'
        + esc(ok ? L('Everything travels inside the link, after the #. Opening it sends none of it to IntMap\'s servers — but anyone who has the link can read it.', 'すべてはリンクの # の後ろに入っています。開いても IntMap のサーバーには送られません——ただし、リンクを持つ人は誰でも読めます。')
          : L('Longer than the longest address the browser measured here keeps', 'ここで実測したブラウザが保てるアドレスの長さを超えています') + ' (' + LINK_LIMIT_MEASURED.toLocaleString() + ' ' + L('characters', '文字') + ', Chromium). '
            + L('Hand on the notebook file instead, or remove an answer.', 'ノートのファイルで渡すか、回答を減らしてください。')) + '</small></div>';
      h += '<input type="text" class="atl-br-url" data-effect="none" readonly aria-label="' + esc(L('Briefing link', 'ブリーフィングのリンク')) + '" value="' + esc(ok ? d.link : '') + '">';
      h += '<div class="atl-br-acts">' + btn('copy', 'clipboard', L('Copy link', 'リンクをコピー'), !ok) + btn('share', 'share', L('Share…', '共有…'), !ok || !navigator.share)
        + btn('preview', 'eye', L('Preview', 'プレビュー'), !ok) + btn('file', 'save', L('Notebook file', 'ノートのファイル')) + '</div>';
    }
    if (d.status) h += '<div class="atl-br-meta">' + esc(d.status) + '</div>';
    return h;
  }
  async function fillPicker(body) {
    const box = body.querySelector('.atl-br-pick'); if (!box || !draft) return;
    const list = (await notebookStore().list(draft.pickQ)).filter((e) => !draft.items.some((x) => x.id === e.id)).slice(0, 40);
    box.innerHTML = list.length ? list.map((e) => '<button type="button" class="atl-br-pi" data-effect="none" data-id="' + esc(e.id) + '">' + icon('chevronR', { size: 12 }) + '<span>' + esc(e.title) + '<small>' + esc(fmtWhen(e.at)) + '</small></span></button>').join('')
      : '<div class="atl-br-meta">' + esc(L('Nothing else in the notebook matches.', 'ほかに一致する記録はありません。')) + '</div>';
  }
  function render() {
    if (!sheet || sheet.style.display === 'none') return;
    const body = sheet.querySelector('.atl-br-body'), title = sheet.querySelector('.atl-br-title-top');
    title.textContent = mode === 'compose' ? L('Share as a briefing', 'ブリーフィングで共有') : L('Atlas briefing', 'Atlas ブリーフィング');
    if (mode === 'compose') { body.innerHTML = composeHtml(); wireCompose(body); fillPicker(body); return; }
    body.innerHTML = readHtml();
    const s = open && open.b ? open.b.sections[open.index] : null;
    /* the stored answer is rendered by the reply's own markdown renderer (js/atlas-reply.js mdMini, which escapes the text it
       is given) — the same leaf the notebook's detail view has, and for the same reason */
    const ans = body.querySelector('.atl-br-ans');
    if (ans && s) { if (s.answer) { if (D && D.mdMini) ans.innerHTML = D.mdMini(s.answer); else ans.textContent = s.answer; } else ans.textContent = L('Atlas wrote no text for this answer.', 'この回答で Atlas は文章を書いていません。'); }
    body.querySelectorAll('.atl-br-pg').forEach((b) => b.addEventListener('click', () => { showSection(+b.dataset.sec, true); }));
    const pins = body.querySelector('.atl-br-pins'); if (pins) pins.addEventListener('change', () => { open.pins = pins.checked; drawPins(); });
    body.querySelectorAll('.atl-br-act').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.act, i = open.index;
      if (act === 'rebuild') rebuild(i);
      else if (act === 'compare') compare(i);
      else if (act === 'keep') { const k = await keep(i); b.querySelector('span').textContent = k.ok ? (k.already ? L('Already in your notebook', 'ノートに保存済み') : L('Kept in your notebook', 'ノートに保存しました')) : L('Could not keep it', '保存できませんでした'); b.disabled = !!k.ok; }
    }));
  }
  function wireCompose(body) {
    const d = draft;
    const ti = body.querySelector('.atl-br-ti'); if (ti) ti.addEventListener('change', () => { d.title = ti.value; regenerate(); });
    body.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', () => { const [i, dir] = b.dataset.mv.split(':').map(Number); const j = i + dir; if (j < 0 || j >= d.items.length) return; const t = d.items[i]; d.items[i] = d.items[j]; d.items[j] = t; regenerate(); }));
    body.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { d.items.splice(+b.dataset.rm, 1); regenerate(); }));
    const add = body.querySelector('.atl-br-add'); if (add) add.addEventListener('click', () => { d.picking = !d.picking; render(); });
    const pq = body.querySelector('.atl-br-pq'); if (pq) pq.addEventListener('input', () => { d.pickQ = pq.value; fillPicker(body); });
    const pick = body.querySelector('.atl-br-pick'); if (pick) pick.addEventListener('click', async (ev) => { const it = ev.target.closest && ev.target.closest('.atl-br-pi'); if (!it) return; const e = await notebookStore().get(it.dataset.id); if (e && !d.items.some((x) => x.id === e.id)) { d.items.push(e); regenerate(); } });
    const wn = body.querySelector('.atl-br-wn'); if (wn) wn.addEventListener('change', () => { d.withNotes = wn.checked; regenerate(); });
    const url = body.querySelector('.atl-br-url'); if (url) url.addEventListener('focus', () => { try { url.select(); } catch (_) { } });
    body.querySelectorAll('.atl-br-act').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'copy') copyLink();
      else if (act === 'share') shareLink();
      else if (act === 'preview') openPacked(d.packed);
      else if (act === 'file') { if (downloadFile()) { d.status = L('Notebook file saved — the other person imports it in their notebook settings.', 'ノートのファイルを保存しました——相手はノートの設定から読み込めます。'); render(); } }
    }));
  }
  function show() {
    if (!panel) return false;
    if (!sheet) {
      sheet = document.createElement('div'); sheet.className = 'atl-br'; sheet.setAttribute('role', 'dialog');
      sheet.innerHTML = '<div class="atl-br-top"><button type="button" class="atl-br-back"></button><div class="atl-br-title-top"></div><span class="atl-br-sp"></span></div><div class="atl-br-body"></div>';
      panel.appendChild(sheet);
      sheet.querySelector('.atl-br-back').addEventListener('click', () => { if (mode === 'read') close(); else { draft = null; hide(); } });
    }
    const back = sheet.querySelector('.atl-br-back');
    back.innerHTML = icon('chevronL', { size: 16 }) + '<span>' + esc(mode === 'read' ? L('Close', '閉じる') : 'Atlas') + '</span>';
    sheet.setAttribute('aria-label', mode === 'compose' ? L('Share as a briefing', 'ブリーフィングで共有') : L('Atlas briefing', 'Atlas ブリーフィング'));
    sheet.style.display = 'flex'; render(); paintStrip(); return true;
  }
  function hide() { if (sheet) sheet.style.display = 'none'; paintStrip(); }
  /* the panel's way back to an open briefing — after a rebuild, or after the reader stepped out to ask Atlas */
  let strip = null;
  function paintStrip() {
    if (!strip) return;
    const on = !!(open && open.b) && !(sheet && sheet.style.display !== 'none');
    strip.style.display = on ? 'flex' : 'none';
    if (on) strip.innerHTML = icon('sparkle', { size: 15 }) + '<span class="atl-br-strip-t">' + esc(L('Atlas briefing', 'Atlas ブリーフィング') + ' · ' + open.b.title) + '</span>' + icon('chevronR', { size: 14 });
  }
  /* the reader returns to an open briefing (after a rebuild, from the panel's strip) */
  function reopen() { if (!open) return false; mode = 'read'; return show(); }

  /* ── mounting ─────────────────────────────────────────────────────────────────────────────── */
  let mounted = false;
  function mount(p, deps) {
    D = deps || D; panel = p || panel;
    if (!panel || mounted) return API;
    mounted = true; LIVE = API;
    strip = document.createElement('button'); strip.type = 'button'; strip.className = 'atl-br-strip'; strip.style.display = 'none';
    const head = panel.querySelector('.atl-head');
    if (head && head.nextSibling) panel.insertBefore(strip, head.nextSibling); else panel.insertBefore(strip, panel.firstChild);
    strip.addEventListener('click', () => { reopen(); });
    try { NOTEBOOK.onFiled(onFiled); } catch (_) { }
    /* Atlas SEES an open briefing (its state context), so 「この根拠は確か？」 is a question it knows it can answer with briefingOpen */
    try { D.ASTATE.registerStateProvider('briefing', () => (open && open.b) ? { title: open.b.title, answers: open.b.sections.length, showing: open.index + 1,
      question: open.b.sections[open.index].question.slice(0, 300), sharedAt: open.b.at ? new Date(open.b.at).toISOString() : null } : null); } catch (_) { }
    return API;
  }

  const API = { mount, openPacked, showSection, close, reopen, compose, afterTurn, rebuild, keep, compare, copyLink,
    current: () => (open && open.b) ? { briefing: open.b, index: open.index, link: open.link, seen: open.seen, credits: open.credits } : null,
    draft: () => draft ? { items: draft.items.map((e) => e.id), title: draft.title, link: draft.link, packed: draft.packed, fits: fits() } : null };
  return API;
}

/* ⚠ NO BACK-TICKS (CONSTITUTION §2, the same rule js/atlas-styles.js states): quoted strings and `+` only. */
export const BRIEFING_CSS = ''
  + '#atlas-panel .atl-br-strip{display:flex;align-items:center;gap:7px;margin:6px 12px 0;padding:7px 11px;border:1px solid rgba(255,159,10,0.45);border-radius:12px;background:rgba(255,159,10,0.1);color:var(--text-main);font-size:12.5px;font-weight:600;cursor:pointer;text-align:left;flex:0 0 auto;}'
  + '#atlas-panel .atl-br-strip .atl-br-strip-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
  + '#atlas-panel .atl-br{position:absolute;inset:0;z-index:calc(var(--z-inset) + 31);display:none;flex-direction:column;background:var(--card-bg);color:var(--text-main);border-radius:inherit;}'
  + '#atlas-panel .atl-br-top{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(128,128,128,0.14);flex:0 0 auto;}'
  + '#atlas-panel .atl-br-back{display:flex;align-items:center;gap:2px;border:0;background:none;color:var(--accent,#0a84ff);font-size:13px;cursor:pointer;padding:4px 2px;min-height:32px;}'
  + '#atlas-panel .atl-br-title-top{flex:1;text-align:center;font-weight:650;font-size:13.5px;}#atlas-panel .atl-br-sp{width:60px;}'
  + '#atlas-panel .atl-br-body{flex:1;overflow-y:auto;padding:10px 12px 18px;-webkit-overflow-scrolling:touch;font-size:12.5px;}'
  + '#atlas-panel .atl-br-banner{display:flex;gap:8px;align-items:flex-start;background:rgba(10,132,255,0.1);border-radius:12px;padding:9px 11px;margin-bottom:10px;font-size:12px;font-weight:600;}'
  + '#atlas-panel .atl-br-banner small{display:block;font-weight:400;color:var(--text-muted);margin-top:2px;line-height:1.45;}'
  + '#atlas-panel .atl-br-title{font-size:16px;font-weight:700;line-height:1.35;margin:2px 0 8px;}'
  + '#atlas-panel .atl-br-pager{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 8px;}'
  + '#atlas-panel .atl-br-pg{min-width:32px;height:32px;border-radius:16px;border:1px solid var(--glass-border,rgba(128,128,128,0.26));background:none;color:var(--text-main);font-size:12px;cursor:pointer;}'
  + '#atlas-panel .atl-br-pg.on{background:var(--accent,#0a84ff);border-color:transparent;color:#fff;}'
  + '#atlas-panel .atl-br-q{font-size:14.5px;font-weight:650;line-height:1.4;white-space:pre-wrap;}'
  + '#atlas-panel .atl-br-meta{font-size:11px;color:var(--text-muted);margin:3px 0;line-height:1.45;}'
  + '#atlas-panel .atl-br-acts{display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:6px;margin:10px 0;}'
  + '#atlas-panel .atl-br-act{display:flex;flex-direction:column;align-items:center;gap:3px;border:0;border-radius:12px;background:var(--input-bg);color:var(--text-main);font-size:11px;padding:9px 4px;cursor:pointer;min-height:44px;}'
  + '#atlas-panel .atl-br-act[disabled]{opacity:0.38;cursor:default;}'
  + '#atlas-panel .atl-br-ans{line-height:1.6;border-top:1px solid rgba(128,128,128,0.14);padding-top:9px;margin-top:4px;}'
  + '#atlas-panel .atl-br-note{margin:8px 0;padding:8px 10px;border-radius:10px;background:var(--input-bg);line-height:1.5;}'
  + '#atlas-panel .atl-br-h{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em;margin:14px 0 6px;}'
  + '#atlas-panel .atl-br-ev{background:var(--input-bg);border-radius:12px;padding:8px 10px;}'
  + '#atlas-panel .atl-br-row{display:flex;gap:7px;align-items:flex-start;margin:5px 0;line-height:1.45;}#atlas-panel .atl-br-row svg{flex:0 0 auto;margin-top:2px;}'
  + '#atlas-panel .atl-br-sw{cursor:pointer;}#atlas-panel .atl-br-sw input{width:18px;height:18px;flex:0 0 auto;accent-color:#ff9f0a;margin:0;}#atlas-panel .atl-br-sw small{display:block;color:var(--text-muted);font-size:11px;}'
  + '#atlas-panel .atl-br-warn,#atlas-panel .atl-br-err{color:#ff9f0a;font-size:12px;margin:5px 0;line-height:1.45;}#atlas-panel .atl-br-err{padding:18px 4px;font-size:13px;}'
  + '#atlas-panel .atl-br-tbl{margin:7px 0;}#atlas-panel .atl-br-tbl summary{cursor:pointer;line-height:1.45;}'
  + '#atlas-panel .atl-br-scroll{overflow:auto;max-height:240px;margin:5px 0;}'
  + '#atlas-panel .atl-br-scroll table{border-collapse:collapse;font-size:11.5px;width:100%;}'
  + '#atlas-panel .atl-br-scroll th,#atlas-panel .atl-br-scroll td{padding:3px 8px 3px 0;border-top:1px solid rgba(128,128,128,0.14);text-align:left;white-space:nowrap;}'
  + '#atlas-panel .atl-br-scroll th{position:sticky;top:0;background:var(--input-bg);font-weight:600;}'
  + '#atlas-panel .atl-br-sub{font-size:11px;font-weight:600;color:var(--text-muted);margin:10px 0 4px;}'
  + '#atlas-panel .atl-br-src{display:block;font-size:12px;margin:3px 0;color:var(--accent,#0a84ff);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
  + '#atlas-panel .atl-br-steps{margin-top:8px;font-size:11.5px;}#atlas-panel .atl-br-steps summary{cursor:pointer;color:var(--text-muted);}'
  + '#atlas-panel .atl-br-lbl{display:block;font-size:11px;font-weight:600;color:var(--text-muted);margin:2px 0 4px;}'
  + '#atlas-panel .atl-br-ti,#atlas-panel .atl-br-pq,#atlas-panel .atl-br-url{width:100%;box-sizing:border-box;height:36px;border-radius:10px;border:1px solid var(--glass-border,rgba(128,128,128,0.26));background:var(--input-bg);color:var(--text-main);padding:0 11px;font-size:13px;outline:none;font-family:inherit;}'
  + '#atlas-panel .atl-br-url{font-size:11.5px;margin-top:6px;}'
  + '#atlas-panel .atl-br-item{display:flex;align-items:center;gap:6px;background:var(--input-bg);border-radius:12px;padding:7px 8px;margin-bottom:6px;}'
  + '#atlas-panel .atl-br-n{flex:0 0 auto;width:20px;height:20px;border-radius:10px;background:var(--accent,#0a84ff);color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;}'
  + '#atlas-panel .atl-br-it{flex:1;min-width:0;font-size:12.5px;line-height:1.35;overflow:hidden;}#atlas-panel .atl-br-it small,#atlas-panel .atl-br-pi small{display:block;font-size:10.5px;color:var(--text-muted);}'
  + '#atlas-panel .atl-br-mini{flex:0 0 auto;width:30px;height:30px;border:0;border-radius:15px;background:none;color:var(--text-main);cursor:pointer;display:flex;align-items:center;justify-content:center;}#atlas-panel .atl-br-mini[disabled]{opacity:0.3;cursor:default;}'
  + '#atlas-panel .atl-br-add{display:flex;align-items:center;gap:6px;width:100%;border:1px dashed var(--glass-border,rgba(128,128,128,0.35));background:none;color:var(--accent,#0a84ff);border-radius:12px;padding:9px 11px;font-size:12.5px;cursor:pointer;margin:2px 0 8px;min-height:40px;}'
  + '#atlas-panel .atl-br-pick{max-height:220px;overflow-y:auto;margin:6px 0 10px;}'
  + '#atlas-panel .atl-br-pi{display:flex;align-items:flex-start;gap:6px;width:100%;text-align:left;border:0;background:none;color:var(--text-main);padding:7px 4px;border-bottom:1px solid rgba(128,128,128,0.12);cursor:pointer;font-size:12.5px;}'
  + '#atlas-panel .atl-br-meter{margin:12px 0 0;font-size:12px;font-weight:600;}#atlas-panel .atl-br-meter small{display:block;font-weight:400;color:var(--text-muted);font-size:11px;line-height:1.45;margin-top:2px;}#atlas-panel .atl-br-meter.bad{color:#ff9f0a;}';
