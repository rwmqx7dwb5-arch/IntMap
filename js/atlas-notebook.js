/* ============================================================================
 *  IntMap · Atlas — THE INVESTIGATION NOTEBOOK, ON THE PAGE   (atlas-os)          js/atlas-notebook.js
 * ----------------------------------------------------------------------------
 *  「Atlas の回答を、残り、再生でき、共有できる調査にする」
 *
 *  Every Atlas turn that finishes is filed here — the question, the answer, the view the answer ended
 *  in (camera, clock, layers), every operation Atlas ran with its exact arguments, the rows a query
 *  found and the sources it cited. From the notebook a reader can:
 *    · REPLAY it — the map is rebuilt from the recorded operations through the same dispatch Atlas used
 *      (js/atlas-console.js runDirect), then the clock, the layers and the camera are put back through
 *      the restorers undo already uses (js/atlas-state.js restoreSections), and read back;
 *    · COMPARE IT WITH NOW — the queries are run again and the rows are compared by code (added, gone,
 *      changed) — js/atlas-cap-notebook.js `notebook.compare`;
 *    · ASK IT AGAIN — the same question goes to Atlas, and the new answer is filed beside the old one;
 *    · HAND IT ON — as Markdown for a person, or as a notebook file another IntMap can import and replay;
 *    · keep it on every device, when the reader turns account sync on (supabase/migrations/
 *      20261003170000_atlas_notebook.sql — off until they do).
 *  Atlas itself reaches the same notebook (`notebook.list` / `notebook.open` / `notebook.compare`), so
 *  「先週調べた台湾の件をもう一度」 is a request it can carry out rather than a conversation it has lost.
 *
 *  ⚠ NOTHING HERE DECIDES WHAT ATLAS DOES. The notebook records what happened and puts back what it
 *  recorded; it adds no limit and no step to a turn (CONSTITUTION.md §5). A turn that is not filed —
 *  the reader turned keeping off, or the turn was cancelled — runs exactly as before.
 *  The data side (entry shape, diff, files, merge) is js/atlas-notebook-store.js.
 * ==========================================================================*/
import {
  entryFromTurn, makeNotebookStore, idbBackend, memoryBackend, toMarkdown, toFile, fromFile,
  rowFromEntry, entryFromRow, mergeCloud, diffResults,
} from './atlas-notebook-store.js';
import { icon } from './icons.js';
import { IntMapLang } from './lang-registry.js';
import './safe-html.js';

const PREF_KEY = 'intmap_atlas_notebook';
const TABLE = 'atlas_notebook_entries';
const esc = (s) => IntMapSafe.html(s);   /* js/safe-html.js — the one output encoder (imported above for its side effect: it publishes, it does not export) */

/* the reader's two switches. Keeping is ON by default — the notebook is the product, and it never leaves
   the device unless the second switch is turned on, which is OFF until the reader turns it on. */
function readPrefs() {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); return { keep: p.keep !== false, sync: p.sync === true }; }
  catch (_) { return { keep: true, sync: false }; }
}
/** is the reader keeping answers? — js/atlas-cap-notebook.js asks before it files a comparison */
export function keepingOn() { return readPrefs().keep; }
function writePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify({ keep: !!p.keep, sync: !!p.sync })); } catch (_) { } }

/* ══ THE VIEW, AS THE RESTORERS SEE IT ═════════════════════════════════════════════════════════════
   `camera` and `time` are stored as the restorers capture them. The layer section captures EVERY
   checkbox; the notebook keeps only the ones that were on (and their opacity), and rebuilds the full
   section against the page it is restored on — so a layer the reader switched on since is switched off
   again, and a layer this build does not have is named as absent instead of guessed at. */
export function captureView(ASTATE) {
  const s = ASTATE.captureSections(['camera', 'time', 'layers']);
  const on = [], op = {};
  Object.keys(s.layers || {}).forEach((id) => { const l = s.layers[id]; if (l && l.on) { on.push(id); if (l.op != null) op[id] = l.op; } });
  return { camera: s.camera || null, time: s.time || null, layersOn: on.sort(), layerOpacity: op };
}
export function wantedSections(view, ASTATE, only) {
  const want = {}, missing = [];
  const pick = (n) => !only || [].concat(only).indexOf(n) >= 0;
  if (view && view.time && pick('time')) want.time = view.time;
  if (view && view.camera && pick('camera')) want.camera = view.camera;
  if (view && Array.isArray(view.layersOn) && pick('layers')) {
    const now = ASTATE.captureSections(['layers']).layers;
    if (now) {
      const w = {};
      Object.keys(now).forEach((id) => { const on = view.layersOn.indexOf(id) >= 0; w[id] = { on, op: (on && view.layerOpacity && view.layerOpacity[id] != null) ? String(view.layerOpacity[id]) : now[id].op }; });
      view.layersOn.forEach((id) => { if (!now[id]) missing.push(id); });
      want.layers = w;
    }
  }
  return { want, missing };
}
/** put a stored view back and READ IT BACK — { restored, unresolved, missingLayers } */
export async function restoreView(view, ASTATE, only) {
  const { want, missing } = wantedSections(view, ASTATE, only);
  const r = await ASTATE.restoreSections(want);
  const now = ASTATE.captureSections(Object.keys(want));
  const unresolved = Object.keys(want).filter((n) => !(n in now) || !ASTATE.sameSection(n, want[n], now[n]));
  return { restored: r.restored, unresolved, missingLayers: missing, asked: Object.keys(want) };
}

/* ══ THE ONE NOTEBOOK OF THIS PAGE ═════════════════════════════════════════════════════════════════ */
let _store = null;
export function notebookStore() {
  if (_store) return _store;
  let backend = null;
  try { if (typeof indexedDB !== 'undefined' && indexedDB) backend = idbBackend(indexedDB); } catch (_) { backend = null; }
  _store = makeNotebookStore(backend || memoryBackend());
  return _store;
}

export function makeAtlasNotebook() {
  const store = notebookStore();
  let D = null, panel = null, sheet = null, strip = null, view = 'list', current = null, query = '';
  let buffer = [];            /* query answers announced on the kernel bus since the last filed turn */
  let reask = null;           /* { id, question } — the entry a 「もう一度訊く」 was pressed on */
  let syncState = { at: 0, ok: null, msg: '' };
  const L = IntMapLang.pick(() => (D && D.lang ? D.lang() : 'en'));   /* the UI's language — the panel is chrome, not a reply */

  /* ── filing a turn ────────────────────────────────────────────────────────────────────────── */
  /* (atlas-briefing) a turn somebody is WAITING for — js/atlas-briefing.js, when Atlas asked inside a turn for that
     turn to become a briefing. Such a turn is built into an entry even when the reader keeps nothing (the entry is
     then handed over, not stored), and every claimant is told how its turn ended, filed or not and why. */
  const claims = new Set(), filedSubs = [];
  function claim(turnId) { if (turnId != null) claims.add(turnId); }
  function onFiled(fn) { if (typeof fn === 'function') filedSubs.push(fn); return () => { const i = filedSubs.indexOf(fn); if (i >= 0) filedSubs.splice(i, 1); }; }
  const told = (e, t, why) => { filedSubs.slice().forEach((f) => { try { f(e, t, why); } catch (_) { } }); return e; };
  async function fileTurn(t) {
    const prefs = readPrefs();
    if (!t) return null;
    const claimed = claims.delete(t.turnId);
    if (!prefs.keep && !claimed) return null;
    const status = String(t.status || '');
    if (status === 'cancelled' || status === 'error' || status === 'running') return told(null, t, 'not-finished');
    if (!String(t.question || '').trim() || (!String(t.reply || '').trim() && !(t.operations || []).length)) return told(null, t, 'empty');
    /* this turn's query answers are the ones announced between its start and now — taken BEFORE the wait
       below, so a question the reader sends meanwhile cannot lend this turn its rows */
    const endAt = Date.now();
    const results = buffer.filter((r) => +r.at >= +t.at && +r.at <= endAt);
    buffer = buffer.filter((r) => +r.at > endAt);
    /* the camera may still be gliding to where the last operation sent it: the map's own idle, bounded */
    try { if (D.waitIdle) await D.waitIdle(2500); } catch (_) { }
    let v = null; try { v = captureView(D.ASTATE); } catch (_) { v = null; }
    let followOf = null;
    if (reask && String(t.question).trim() === reask.question.trim()) { followOf = reask.root; }
    reask = null;
    const e = entryFromTurn(t, { view: v, results, sources: (t.cites || []).map((c) => ({ url: c.url, title: c.title || c.url })),
      lang: D.lang ? D.lang() : '', resolve: D.resolve, now: Date.now(), followOf });
    if (!e) return told(null, t, 'empty');
    if (!prefs.keep) return told(e, t, 'not-kept');
    try { await store.put(e); } catch (err) { syncState = { at: Date.now(), ok: false, msg: L('Could not keep this answer on the device', 'この回答を端末に残せませんでした') + ': ' + String((err && err.message) || err) }; refresh(); return told(e, t, 'not-kept'); }
    if (prefs.sync) syncNow().catch(() => { });
    return told(e, t, 'filed');
  }

  /* ── the account copy ─────────────────────────────────────────────────────────────────────── */
  function account() { const H = D && D.host ? D.host() : null; return { db: H && H.DB, user: H && H.user }; }
  async function syncNow() {
    const { db, user } = account();
    if (!db || !user) { syncState = { at: Date.now(), ok: false, msg: L('Sign in to keep the notebook on every device.', 'ログインすると、ノートをどの端末でも使えます。') }; refresh(); return syncState; }
    try {
      const remote = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await db.from(TABLE).select('id,created_at,updated_at,question,answer,payload').eq('user_id', user.id).order('created_at', { ascending: true }).range(from, from + 499);
        if (error) throw error;
        (data || []).forEach((r) => { const e = entryFromRow(r); if (e) remote.push(e); });
        if (!data || data.length < 500) break;
      }
      const local = await store.list();
      const m = mergeCloud(local, remote), now = Date.now();
      for (const e of m.toLocal) {
        const synced = Object.assign({}, e, { syncedAt: now });
        if (await store.get(e.id)) await store.update(e.id, synced, { keepTime: true }); else await store.put(synced);
      }
      for (const id of m.deleteLocal) await store.remove(id);
      const failed = [];
      for (let i = 0; i < m.toRemote.length; i += 50) {
        const part = m.toRemote.slice(i, i + 50);
        const { error } = await db.from(TABLE).upsert(part.map((e) => rowFromEntry(e, user.id)), { onConflict: 'user_id,id' });
        if (error) { part.forEach((e) => failed.push({ e, why: error.message || String(error.code || 'error') })); continue; }
        for (const e of part) await store.update(e.id, { syncedAt: now }, { keepTime: true });
      }
      syncState = failed.length
        ? { at: now, ok: false, msg: L('Synced, except', '同期しました。ただし次は送れませんでした') + ': ' + failed.map((f) => '«' + f.e.title.slice(0, 40) + '» (' + f.why + ')').join(', ') }
        : { at: now, ok: true, msg: L('Synced with your account', 'アカウントと同期しました') + ' · ' + (m.toLocal.length + m.toRemote.length + m.deleteLocal.length) + ' ' + L('entries exchanged', '件をやり取り') };
    } catch (err) { syncState = { at: Date.now(), ok: false, msg: L('Sync failed', '同期できませんでした') + ': ' + String((err && err.message) || err) }; }
    refresh(); return syncState;
  }
  async function deleteAccountCopy() {
    const { db, user } = account(); if (!db || !user) return false;
    const { error } = await db.from(TABLE).delete().eq('user_id', user.id);
    if (error) { syncState = { at: Date.now(), ok: false, msg: L('Could not delete the account copy', 'アカウントのコピーを削除できませんでした') + ': ' + error.message }; refresh(); return false; }
    const p = readPrefs(); p.sync = false; writePrefs(p);
    for (const e of await store.list()) if (e.syncedAt) await store.update(e.id, { syncedAt: 0 }, { keepTime: true });
    syncState = { at: Date.now(), ok: true, msg: L('The account copy was deleted. The notebook on this device is unchanged.', 'アカウント上のコピーを削除しました。この端末のノートはそのままです。') };
    refresh(); return true;
  }
  async function removeEntry(id) {
    const e = await store.get(id); if (!e) return;
    await store.remove(id);
    const { db, user } = account();
    if (e.syncedAt && db && user) { try { await db.from(TABLE).delete().eq('user_id', user.id).eq('id', id); } catch (_) { } }
  }

  /* ── handing it on ────────────────────────────────────────────────────────────────────────── */
  function download(name, text, type) {
    try {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (_) { } }, 1500);
      return true;
    } catch (_) { return false; }
  }
  const stamp = () => new Date().toISOString().slice(0, 10);
  async function exportMd(ids) { const all = await store.list(); const list = ids ? all.filter((e) => ids.indexOf(e.id) >= 0) : all; return download('intmap-atlas-notebook-' + stamp() + '.md', toMarkdown(list, D && D.lang ? D.lang() : 'en'), 'text/markdown'); }
  async function exportFile() { return download('intmap-atlas-notebook-' + stamp() + '.json', JSON.stringify(toFile(await store.list()), null, 1), 'application/json'); }
  async function importText(text) {
    const r = fromFile(JSON.parse(text));
    const have = new Set((await store.list()).map((e) => e.id));
    let added = 0; for (const e of r.entries) { if (have.has(e.id)) continue; await store.put(e); added++; }
    return { added, skipped: r.entries.length - added, rejected: r.rejected };
  }

  /* ── acting on an entry ───────────────────────────────────────────────────────────────────── */
  function replay(e) {
    const steps = (e.steps || []).filter((s) => s.replay && s.args && s.args.type).map((s) => s.args);
    hide();
    return D.runDirect(L('Replay from the notebook', 'ノートから再現') + ': ' + e.title,
      [{ type: 'notebookOpen', id: e.id, only: ['time'] }].concat(steps, [{ type: 'notebookOpen', id: e.id }]));
  }
  function compare(e) { hide(); return D.runDirect(L('Compare with now', '今と比べる') + ': ' + e.title, [{ type: 'notebookCompare', id: e.id }]); }
  function askAgain(e) { reask = { id: e.id, root: e.followOf || e.id, question: e.question }; hide(); return D.ask(e.question); }

  /* ══ THE PANEL ═════════════════════════════════════════════════════════════════════════════════ */
  const fmtWhen = (ms) => { try { return new Date(ms).toLocaleString(IntMapLang.locale(D && D.lang ? D.lang() : 'en'), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } };
  const dayOf = (ms) => { try { return new Date(ms).toLocaleDateString(IntMapLang.locale(D && D.lang ? D.lang() : 'en'), { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }); } catch (_) { return ''; } };

  async function renderStrip() {
    if (!strip) return;
    let n = 0; try { n = await store.count(); } catch (_) { n = 0; }
    strip.innerHTML = icon('book', { size: 15 }) + '<span class="atl-nb-strip-t">' + esc(L('Investigation notebook', '調査ノート')) + '</span>'
      + (n ? '<span class="atl-nb-n">' + Number(n) + '</span>' : '') + icon('chevronR', { size: 14 });
  }
  function itemHtml(e) {
    const nSteps = (e.steps || []).filter((s) => s.replay).length, nRows = (e.results || []).reduce((a, r) => a + (r.matched || 0), 0);
    const bits = [fmtWhen(e.at)];
    if (nSteps) bits.push(nSteps + ' ' + L('map steps', '手順'));
    if ((e.results || []).length) bits.push(nRows + ' ' + L('rows', '行'));
    if (e.followOf) bits.push(L('asked again', '再質問'));
    return '<button type="button" class="atl-nb-item" data-id="' + esc(e.id) + '">'
      + '<span class="atl-nb-q">' + (e.pinned ? icon('star', { size: 12, cls: 'atl-nb-pin' }) + ' ' : '') + esc(e.title) + '</span>'
      + '<span class="atl-nb-meta">' + esc(bits.join(' · ')) + '</span></button>';
  }
  async function renderList(body) {
    const list = await store.list(query);
    let h = '<input type="search" class="atl-nb-search" placeholder="' + esc(L('Search questions, answers, places…', '問い・答え・地名を検索…')) + '" value="' + esc(query) + '">';
    if (!list.length) {
      h += '<div class="atl-nb-empty">' + esc(query ? L('Nothing in the notebook matches.', '一致する記録はありません。')
        : L('What you ask Atlas — the answer, the map it drew and the rows it found — is kept here. Open any of it later to rebuild the map, compare it with today, ask it again or hand it on.',
          'Atlas に訊いたこと——答え・描いた地図・見つけた行——がここに残ります。あとで開けば、地図を再現し、今と比べ、もう一度訊き、書き出せます。')) + '</div>';
    } else {
      let day = '';
      list.forEach((e) => { const d = e.pinned ? L('Pinned', 'ピン留め') : dayOf(e.at); if (d !== day) { day = d; h += '<div class="atl-nb-day">' + esc(d) + '</div>'; } h += itemHtml(e); });
    }
    if (!readPrefs().keep) h += '<div class="atl-nb-off">' + esc(L('Keeping is off — new answers are not being filed.', '記録はオフです——新しい回答は残りません。')) + '</div>';
    body.innerHTML = h;
    const s = body.querySelector('.atl-nb-search');
    if (s) s.addEventListener('input', () => { query = s.value; const pos = s.selectionStart; renderList(body).then(() => { const s2 = body.querySelector('.atl-nb-search'); if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (_) { } } }); });
  }
  async function renderDetail(body, id) {
    const e = await store.get(id); if (!e) { view = 'list'; return renderList(body); }
    const all = await store.list();
    const root = e.followOf || e.id;
    const chain = all.filter((x) => (x.followOf || x.id) === root).sort((a, b) => a.at - b.at);
    const nRep = (e.steps || []).filter((s) => s.replay).length;
    /* data-effect: what a press does to stored data — js/atlas-controls.js reads it before Atlas presses it (scripts/data-effects.mjs)
       — each opening is a whole literal, so the declaration is readable where the markup is written */
    const OPEN = { none: '<button type="button" class="atl-nb-act" data-effect="none"', private: '<button type="button" class="atl-nb-act" data-effect="private"',
      outward: '<button type="button" class="atl-nb-act" data-effect="outward"', destructive: '<button type="button" class="atl-nb-act" data-effect="destructive"' };
    const EFFECT = { replay: 'none', compare: 'private', ask: 'outward', md: 'none', brief: 'none', pin: 'private', del: 'destructive' };   /* brief: opens the composer — the link is made there, and handed on only by the reader's own copy or share */
    const btn = (act, ic, label, dis) => OPEN[EFFECT[act]] + ' data-act="' + act + '"' + (dis ? ' disabled' : '') + '>' + icon(ic, { size: 16 }) + '<span>' + esc(label) + '</span></button>';
    let h = '<div class="atl-nb-dq">' + esc(e.question) + '</div><div class="atl-nb-meta">' + esc(fmtWhen(e.at)) + '</div>';
    h += '<div class="atl-nb-acts">' + btn('replay', 'map', L('Rebuild map', '地図を再現'), !nRep && !e.view)
      + btn('compare', 'reset', L('Compare with now', '今と比べる'), !(e.results || []).length)
      + btn('ask', 'chat', L('Ask again', 'もう一度訊く')) + btn('md', 'share', L('Export', '書き出し'))
      + (D.share ? btn('brief', 'link', L('Share as briefing', 'ブリーフィングで共有')) : '')
      + btn('pin', 'star', e.pinned ? L('Unpin', 'ピンを外す') : L('Pin to top', 'ピン留め')) + btn('del', 'trash', L('Delete', '削除')) + '</div>';
    if (chain.length > 1) {
      h += '<div class="atl-nb-chain"><span>' + esc(L('This question in the notebook', 'この問いの記録')) + '</span>'
        + chain.map((x) => '<button type="button" class="atl-nb-cl' + (x.id === e.id ? ' on' : '') + '" data-id="' + esc(x.id) + '">' + esc(fmtWhen(x.at)) + '</button>').join('') + '</div>';
    }
    h += '<div class="atl-nb-ans atl-md">' + (e.answer ? '' : '<span class="atl-nb-meta">' + esc(L('Atlas wrote no text for this turn.', 'このターンで Atlas は文章を書いていません。')) + '</span>') + '</div>';
    (e.results || []).forEach((r) => {
      h += '<div class="atl-nb-res">' + icon('columns', { size: 13 }) + ' ' + esc((r.tableLabel || r.table) + ' — ' + r.matched + ' ' + L('matched', '件が該当')
        + (r.matched > (r.rows || []).length ? ' (' + L('kept', '保存') + ' ' + (r.rows || []).length + ')' : '')) + '</div>';
    });
    if ((e.sources || []).length) h += '<div class="atl-nb-h">' + esc(L('Sources', '出典')) + '</div>' + e.sources.map((s) => '<a class="atl-nb-src" href="' + IntMapSafe.url(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + '</a>').join('');
    h += '<div class="atl-nb-h">' + esc(L('Your note', 'メモ')) + '</div><textarea class="atl-nb-note" data-effect="private" rows="3" placeholder="' + esc(L('What you concluded, what to check next…', '結論・次に確かめること…')) + '">' + esc(e.note) + '</textarea>';
    if ((e.steps || []).length) {
      h += '<details class="atl-nb-steps"><summary>' + esc(L('What Atlas ran', 'Atlas が実行した操作') + ' (' + e.steps.length + ')') + '</summary>'
        + e.steps.map((s) => '<div class="atl-nb-step"><code>' + esc(s.cap) + '</code> · ' + esc(s.status) + (s.replay ? '' : ' · <span class="atl-nb-meta">' + esc(L('not re-run by a replay', '再現では実行しない')) + '</span>') + '</div>').join('') + '</details>';
    }
    body.innerHTML = h;
    /* the stored answer is rendered by the reply's own markdown renderer (js/atlas-reply.js mdMini, which escapes
       the text it is given) — the one leaf of this view check:static's output-taint cannot follow into another module */
    const ans = body.querySelector('.atl-nb-ans');
    if (ans && e.answer) { if (D.mdMini) ans.innerHTML = D.mdMini(e.answer); else ans.textContent = e.answer; }
    const note = body.querySelector('.atl-nb-note');
    if (note) note.addEventListener('change', () => { store.update(e.id, { note: note.value }).then(() => { if (readPrefs().sync) syncNow().catch(() => { }); }); });
    body.querySelectorAll('.atl-nb-cl').forEach((b) => b.addEventListener('click', () => { current = b.dataset.id; renderDetail(body, current); }));
    body.querySelectorAll('.atl-nb-act').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      if (act === 'replay') replay(e);
      else if (act === 'compare') compare(e);
      else if (act === 'ask') askAgain(e);
      else if (act === 'md') exportMd([e.id]);
      else if (act === 'brief') { if (D.share) D.share([e.id]); }
      else if (act === 'pin') { await store.update(e.id, { pinned: !e.pinned }); renderDetail(body, e.id); }
      else if (act === 'del') { if (!confirm(L('Delete this entry from the notebook?', 'この記録をノートから削除しますか？'))) return; await removeEntry(e.id); view = 'list'; render(); }
    }));
  }
  function renderSettings(body) {
    const p = readPrefs(), { user } = account();
    const tog = (k, label, sub, dis) => '<label class="atl-nb-row"><span><span>' + esc(label) + '</span>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><input type="checkbox" class="atl-nb-sw" data-effect="private" data-k="' + k + '"' + (p[k] ? ' checked' : '') + (dis ? ' disabled' : '') + '></label>';
    let h = '<div class="atl-nb-group">' + tog('keep', L('Keep Atlas answers on this device', 'Atlas の回答をこの端末に残す'), L('Stored in this browser only.', 'このブラウザの中だけに保存します。'))
      + tog('sync', L('Sync with my account', 'アカウントと同期'), user ? L('Your notebook is copied to your IntMap account so every device you sign in on has it. Off until you turn it on.', 'ノートを IntMap アカウントに複製し、ログインしたどの端末でも使えるようにします。オンにするまで送りません。')
        : L('Sign in to keep the notebook on every device.', 'ログインすると、ノートをどの端末でも使えます。'), !user) + '</div>';
    if (syncState.msg) h += '<div class="atl-nb-status' + (syncState.ok === false ? ' bad' : '') + '">' + esc(syncState.msg) + '</div>';
    const SET_OPEN = { none: '<button type="button" class="atl-nb-row atl-nb-btn" data-effect="none"', private: '<button type="button" class="atl-nb-row atl-nb-btn" data-effect="private"',
      destructive: '<button type="button" class="atl-nb-row atl-nb-btn danger" data-effect="destructive"' };
    const SET_EFFECT = { md: 'none', json: 'none', import: 'private', syncnow: 'private', delcloud: 'destructive', clear: 'destructive' };
    const b = (act, ic, label) => SET_OPEN[SET_EFFECT[act]] + ' data-act="' + act + '">' + icon(ic, { size: 16 }) + '<span>' + esc(label) + '</span></button>';
    h += '<div class="atl-nb-group">' + b('md', 'share', L('Export as Markdown', 'Markdown で書き出す')) + b('json', 'save', L('Export notebook file', 'ノートのファイルを書き出す'))
      + b('import', 'folder', L('Import notebook file', 'ノートのファイルを読み込む')) + '</div>';
    h += '<div class="atl-nb-group">' + (user && p.sync ? b('syncnow', 'reset', L('Sync now', '今すぐ同期')) : '') + (user ? b('delcloud', 'trash', L('Delete the account copy', 'アカウント上のコピーを削除')) : '')
      + b('clear', 'trash', L('Delete everything on this device', 'この端末のノートをすべて削除')) + '</div>';
    body.innerHTML = h;
    body.querySelectorAll('.atl-nb-sw').forEach((s) => s.addEventListener('change', () => { const q = readPrefs(); q[s.dataset.k] = s.checked; writePrefs(q); if (s.dataset.k === 'sync' && s.checked) syncNow(); else renderSettings(body); }));
    body.querySelectorAll('.atl-nb-btn').forEach((x) => x.addEventListener('click', async () => {
      const act = x.dataset.act;
      if (act === 'md') exportMd();
      else if (act === 'json') exportFile();
      else if (act === 'syncnow') syncNow();
      else if (act === 'delcloud') { if (confirm(L('Delete every notebook entry stored in your account? This device keeps its own.', 'アカウントに保存したノートをすべて削除しますか？この端末の分は残ります。'))) deleteAccountCopy(); }
      else if (act === 'clear') { if (confirm(L('Delete the whole notebook on this device?', 'この端末のノートをすべて削除しますか？'))) { await store.clear(); view = 'list'; render(); } }
      else if (act === 'import') {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json'; inp.dataset.effect = 'private';
        inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return;
          try { const r = await importText(await f.text()); syncState = { at: Date.now(), ok: true, msg: L('Imported entries', '読み込んだ記録') + ': ' + r.added + (r.skipped ? ' · ' + L('already here', '既にあるもの') + ' ' + r.skipped : '') + (r.rejected ? ' · ' + L('unreadable', '読めないもの') + ' ' + r.rejected : '') }; }
          catch (err) { syncState = { at: Date.now(), ok: false, msg: L('This is not an IntMap notebook file', 'IntMap のノートのファイルではありません') + ' (' + String((err && err.message) || err) + ')' }; }
          if (readPrefs().sync) syncNow(); else renderSettings(body); };
        inp.click();
      }
    }));
  }
  async function render() {
    if (!sheet) return;
    const body = sheet.querySelector('.atl-nb-body'), title = sheet.querySelector('.atl-nb-title'), back = sheet.querySelector('.atl-nb-back');
    title.textContent = view === 'settings' ? L('Notebook settings', 'ノートの設定') : L('Investigation notebook', '調査ノート');
    back.innerHTML = icon('chevronL', { size: 16 }) + '<span>' + esc(view === 'list' ? 'Atlas' : L('Notebook', 'ノート')) + '</span>';
    if (view === 'detail' && current) await renderDetail(body, current);
    else if (view === 'settings') renderSettings(body);
    else await renderList(body);
  }
  function refresh() { renderStrip(); if (sheet && sheet.style.display !== 'none' && view !== 'detail') render(); }
  function show(id) {
    if (!panel) return false;
    if (!sheet) {
      sheet = document.createElement('div'); sheet.className = 'atl-nb'; sheet.setAttribute('role', 'dialog');
      sheet.innerHTML = '<div class="atl-nb-top"><button type="button" class="atl-nb-back"></button><div class="atl-nb-title"></div><button type="button" class="atl-nb-more">' + icon('sliders', { size: 17 }) + '</button></div><div class="atl-nb-body"></div>';
      panel.appendChild(sheet);
      sheet.querySelector('.atl-nb-back').addEventListener('click', () => { if (view === 'list') hide(); else { view = 'list'; render(); } });
      sheet.querySelector('.atl-nb-more').addEventListener('click', () => { view = view === 'settings' ? 'list' : 'settings'; render(); });
      sheet.querySelector('.atl-nb-body').addEventListener('click', (ev) => { const it = ev.target.closest && ev.target.closest('.atl-nb-item'); if (it) { current = it.dataset.id; view = 'detail'; render(); } });
    }
    sheet.querySelector('.atl-nb-more').setAttribute('aria-label', L('Notebook settings', 'ノートの設定'));
    sheet.setAttribute('aria-label', L('Investigation notebook', '調査ノート'));
    if (id) { current = id; view = 'detail'; } else view = 'list';   /* the strip opens the notebook, not whichever entry was last read */
    sheet.style.display = 'flex'; render(); return true;
  }
  function hide() { if (sheet) sheet.style.display = 'none'; }

  /* ── mounting ─────────────────────────────────────────────────────────────────────────────── */
  let mounted = false;
  function mount(p, deps) {
    D = deps || D; panel = p || panel;
    if (!panel || mounted) return API;
    mounted = true;
    strip = document.createElement('button'); strip.type = 'button'; strip.className = 'atl-nb-strip';
    const head = panel.querySelector('.atl-head');
    if (head && head.nextSibling) panel.insertBefore(strip, head.nextSibling); else panel.insertBefore(strip, panel.firstChild);
    strip.addEventListener('click', () => show());
    try { D.ASTATE.onTurnEnd((t) => { fileTurn(Object.assign({}, t, { operations: (t.operations || []).slice() })).then(refresh, () => { }); }); } catch (_) { }
    try { window.IntMapOS.on((ev) => { if (ev && ev.kernel === 'query' && ev.phase === 'answered' && ev.result) buffer.push(ev.result); }); } catch (_) { }
    store.on(() => renderStrip());
    renderStrip();
    if (readPrefs().sync) setTimeout(() => { syncNow().catch(() => { }); }, 0);
    return API;
  }

  const API = { mount, show, hide, store, fileTurn, claim, onFiled, syncNow, exportMd, exportFile, importText, deleteAccountCopy, replay, compare, askAgain,
    captureView: () => captureView(D.ASTATE), restoreView: (v, only) => restoreView(v, D.ASTATE, only), diffResults };
  return API;
}

/* ⚠ NO BACK-TICKS (CONSTITUTION §2, the same rule js/atlas-styles.js states): quoted strings and `+` only. */
export const NOTEBOOK_CSS = ''
  + '#atlas-panel .atl-nb-strip{display:flex;align-items:center;gap:7px;margin:6px 12px 0;padding:7px 11px;border:1px solid var(--glass-border,rgba(128,128,128,0.22));border-radius:12px;background:var(--input-bg);color:var(--text-main);font-size:12.5px;font-weight:600;cursor:pointer;text-align:left;flex:0 0 auto;}'
  + '#atlas-panel .atl-nb-strip .atl-nb-strip-t{flex:1;min-width:0;}'
  + '#atlas-panel .atl-nb-n{font-size:11px;font-weight:600;color:var(--text-muted);background:rgba(128,128,128,0.14);border-radius:9px;padding:1px 7px;}'
  + '#atlas-panel .atl-nb{position:absolute;inset:0;z-index:calc(var(--z-inset) + 30);display:none;flex-direction:column;background:var(--card-bg);color:var(--text-main);border-radius:inherit;}'
  + '#atlas-panel .atl-nb-top{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(128,128,128,0.14);flex:0 0 auto;}'
  + '#atlas-panel .atl-nb-back{display:flex;align-items:center;gap:2px;border:0;background:none;color:var(--accent,#0a84ff);font-size:13px;cursor:pointer;padding:4px 2px;min-height:32px;}'
  + '#atlas-panel .atl-nb-title{flex:1;text-align:center;font-weight:650;font-size:13.5px;}'
  + '#atlas-panel .atl-nb-more{border:0;background:none;color:var(--text-main);cursor:pointer;width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;}'
  + '#atlas-panel .atl-nb-body{flex:1;overflow-y:auto;padding:10px 12px 18px;-webkit-overflow-scrolling:touch;}'
  + '#atlas-panel .atl-nb-search{width:100%;box-sizing:border-box;height:34px;border-radius:10px;border:1px solid var(--glass-border,rgba(128,128,128,0.26));background:var(--input-bg);color:var(--text-main);padding:0 11px;font-size:13px;margin-bottom:8px;outline:none;}'
  + '#atlas-panel .atl-nb-day{font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em;margin:12px 2px 5px;}'
  + '#atlas-panel .atl-nb-item{display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;border:0;background:var(--input-bg);color:var(--text-main);border-radius:12px;padding:10px 12px;margin-bottom:6px;cursor:pointer;}'
  + '#atlas-panel .atl-nb-q{font-size:13px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}'
  + '#atlas-panel .atl-nb-meta{font-size:11px;color:var(--text-muted);}'
  + '#atlas-panel .atl-nb-pin{color:#ff9f0a;vertical-align:-1px;}'
  + '#atlas-panel .atl-nb-empty,#atlas-panel .atl-nb-off{font-size:12.5px;line-height:1.6;color:var(--text-muted);padding:18px 6px;}'
  + '#atlas-panel .atl-nb-dq{font-size:15px;font-weight:650;line-height:1.4;margin:2px 0 3px;white-space:pre-wrap;}'
  + '#atlas-panel .atl-nb-acts{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0;}'
  + '#atlas-panel .atl-nb-act{display:flex;flex-direction:column;align-items:center;gap:3px;border:0;border-radius:12px;background:var(--input-bg);color:var(--text-main);font-size:11px;padding:9px 4px;cursor:pointer;min-height:44px;}'
  + '#atlas-panel .atl-nb-act[disabled]{opacity:0.38;cursor:default;}'
  + '#atlas-panel .atl-nb-chain{display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:11px;color:var(--text-muted);margin:4px 0 8px;}'
  + '#atlas-panel .atl-nb-cl{border:1px solid var(--glass-border,rgba(128,128,128,0.26));background:none;color:var(--text-main);border-radius:10px;padding:3px 9px;font-size:11px;cursor:pointer;}'
  + '#atlas-panel .atl-nb-cl.on{background:var(--accent,#0a84ff);border-color:transparent;color:#fff;}'
  + '#atlas-panel .atl-nb-ans{font-size:12.5px;line-height:1.6;border-top:1px solid rgba(128,128,128,0.14);padding-top:9px;margin-top:4px;}'
  + '#atlas-panel .atl-nb-res{font-size:12px;margin:7px 0 0;color:var(--text-main);}'
  + '#atlas-panel .atl-nb-h{font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.03em;margin:14px 0 5px;}'
  + '#atlas-panel .atl-nb-src{display:block;font-size:12px;margin:3px 0;color:var(--accent,#0a84ff);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
  + '#atlas-panel .atl-nb-note{width:100%;box-sizing:border-box;border-radius:10px;border:1px solid var(--glass-border,rgba(128,128,128,0.26));background:var(--input-bg);color:var(--text-main);padding:8px 10px;font-size:12.5px;resize:vertical;outline:none;font-family:inherit;}'
  + '#atlas-panel .atl-nb-steps{margin-top:12px;font-size:12px;}'
  + '#atlas-panel .atl-nb-steps summary{cursor:pointer;color:var(--text-muted);}'
  + '#atlas-panel .atl-nb-step{margin:4px 0 0 4px;}'
  + '#atlas-panel .atl-nb-group{background:var(--input-bg);border-radius:12px;margin:0 0 12px;overflow:hidden;}'
  + '#atlas-panel .atl-nb-row{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;box-sizing:border-box;padding:11px 13px;font-size:13px;border:0;background:none;color:var(--text-main);text-align:left;min-height:44px;}'
  + '#atlas-panel .atl-nb-row+.atl-nb-row{border-top:1px solid rgba(128,128,128,0.14);}'
  + '#atlas-panel .atl-nb-row small{display:block;font-size:11px;color:var(--text-muted);margin-top:2px;line-height:1.45;}'
  + '#atlas-panel .atl-nb-btn{justify-content:flex-start;cursor:pointer;}'
  + '#atlas-panel .atl-nb-btn.danger{color:#ff453a;}'
  + '#atlas-panel .atl-nb-sw{width:20px;height:20px;flex:0 0 auto;accent-color:#34c759;}'
  + '#atlas-panel .atl-nb-status{font-size:12px;color:var(--text-muted);margin:0 4px 12px;line-height:1.5;}'
  + '#atlas-panel .atl-nb-status.bad{color:#ff9f0a;}'
  + '#atlas-panel .atl-nbd-t{width:100%;border-collapse:collapse;font-size:12px;margin:4px 0;}'
  + '#atlas-panel .atl-nbd-t td{padding:3px 6px 3px 0;border-top:1px solid rgba(128,128,128,0.14);white-space:nowrap;}'
  + '#atlas-panel .atl-nbd-up{color:#34c759;}#atlas-panel .atl-nbd-down{color:#ff453a;}';
