/* ============================================================================
 *  IntMap · Atlas capabilities — the `notebook.*` namespace   (js/atlas-cap-notebook.js)   (atlas-os)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place (the shape is js/atlas-caps.js's).
 *
 *  THE INVESTIGATION NOTEBOOK, FROM ATLAS'S SIDE. js/atlas-notebook.js files every finished turn — the
 *  question, the answer, the view, the operations with their exact arguments, the rows a query found.
 *  These three capabilities are what Atlas can do with that record, so a conversation that ended last
 *  week is something it can pick up rather than something it has to be told again:
 *    notebook.list     what the reader has investigated — searched by their own words
 *    notebook.open     put the map back the way an answer left it (clock, layers, camera — read back),
 *                      and hand Atlas the answer and the exact calls that drew it, to re-issue if it wants
 *    notebook.compare  the same queries, run again now, compared ROW BY ROW with what they found then —
 *                      by code, never by a model reading two tables (docs/AREA-MONITORS.md's rule)
 *  ⚠ None of them limits a turn or chooses for Atlas (CONSTITUTION.md §5): `open` does not re-run the
 *  recorded operations itself — it returns them, and Atlas decides which to call (the reader's
 *  「地図を再現」 button runs them through runDirect, because there the reader has decided).
 * ==========================================================================*/
import { str, int, list } from './atlas-caps.js';
import { notebookStore, restoreView, keepingOn } from './atlas-notebook.js';
import { diffResults, newId, normalize, NOTEBOOK_SHOWN } from './atlas-notebook-store.js';
import { queryEngine } from './atlas-cap-data.js';

/* an entry named by id, or — when Atlas only has the reader's words — the newest one they match */
async function findEntry(a) {
  const S = notebookStore();
  const id = String(a.id || '').trim();
  if (id) { const e = await S.get(id); if (e) return { e }; }
  const q = String(a.query || a.text || (id && !/^nb-/.test(id) ? id : '') || '').trim();
  if (!q) return { e: null, why: 'needs-id' };
  const hits = await S.list(q);
  return hits.length ? { e: hits[0], also: hits.slice(1, 6) } : { e: null, why: 'no-match', q };
}
const when = (ms) => { try { return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; } catch (_) { return ''; } };
const fmtN = (v) => (typeof v === 'number' && isFinite(v)) ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : String(Math.round(v * 100) / 100)) : String(v == null ? '—' : v);

/* hidden (js/atlas-notebook-store.js NOTEBOOK_SHOWN): the three are WITHDRAWN — absent from the catalogue, the planner never offers them,
   and a call that still arrives is answered FEATURE_WITHDRAWN rather than served */
const HIDDEN = NOTEBOOK_SHOWN ? undefined : { withdrawn: { why: 'the owner hid the investigation notebook on 2026-10-04 (「機能だけ残すけど、いったんユーザーには存在せず、見えないように」) — the case exists only to answer FEATURE_WITHDRAWN. To restore: set NOTEBOOK_SHOWN to true in js/atlas-notebook-store.js, then node scripts/atlas-caps.mjs --write', proofCode: 'FEATURE_WITHDRAWN' } };
/* a withdrawn capability answers to no spoken alias (system.monitor's row is the same): the aliases return with the switch */
const ALIAS = (a) => (NOTEBOOK_SHOWN ? a : '');
const gone = (K, code) => K.R(false, K.warn(K.esc(K.L('The investigation notebook is not available.', '調査ノートは現在ご利用いただけません。'))), { meta: { code } });

export default [
  {
    row: ['notebook.list',              'notebook',       ALIAS('notebookList,investigations,pastQuestions,myInvestigations'), 'research','none',    '',                       'explanation',         'read',    'none',   '',         '', 'external'],
    policy: HIDDEN,
    doc: [
      { in: 'notebook', at: 10, text: '{"type":"notebook","query"?:str,"limit"?:int} = THE READER\'S INVESTIGATION NOTEBOOK (調査ノート) — every question they asked Atlas before, on this device (and on every device when they turned account sync on), with its date, its answer, how many map steps drew it and how many rows its queries found. Searched by the reader\'s own words (all terms must occur; newest first). Use it when they refer to something they investigated earlier — 「前に調べた」「先週の台湾の件」「この前の地震の問い合わせ」「my earlier question about…」 — instead of answering as if the conversation were new, and pass the id it returns to notebookOpen or notebookCompare. ' },
    ],
    schema: () => ({ type: 'object', properties: { query: str(), limit: int(1, 200) } }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note;
      if (!NOTEBOOK_SHOWN) return gone(K, 'FEATURE_WITHDRAWN');
      const all = await notebookStore().list(String(a.query || '').trim());
      const n = Math.max(1, Math.min(200, +a.limit || 20));
      if (!all.length) return R(true, note(esc(a.query ? L('Nothing in the investigation notebook matches', '調査ノートに一致する記録はありません') + ' «' + String(a.query) + '»' : L('The investigation notebook is empty.', '調査ノートは空です。'))), { meta: { notebook: { count: 0 } } });
      const rows = all.slice(0, n).map((e) => {
        const nRows = (e.results || []).reduce((s, r) => s + (r.matched || 0), 0), nSteps = (e.steps || []).filter((s) => s.replay).length;
        return '<li><b>' + esc(e.id) + '</b> · ' + esc(when(e.at)) + ' — ' + esc(e.title)
          + '<span style="color:var(--text-muted);"> · ' + esc(nSteps + ' ' + L('map steps', '手順') + ((e.results || []).length ? ' · ' + nRows + ' ' + L('rows', '行') : '') + (e.note ? ' · ' + L('note', 'メモ') + ': ' + e.note.slice(0, 80) : '')) + '</span></li>';
      }).join('');
      return R(true, '<div style="font-weight:600;margin:2px 0 5px;">' + esc(L('Investigation notebook', '調査ノート')) + ' · ' + all.length + '</div><ul style="margin:2px 0 4px 18px;padding:0;font-size:12px;line-height:1.55;">' + rows + '</ul>'
        + (all.length > n ? note(esc(L('Showing', '表示中') + ' ' + n + ' / ' + all.length)) : ''), { meta: { notebook: { count: all.length, shown: Math.min(n, all.length) } } });
    },
  },
  {
    row: ['notebook.open',              'notebookOpen',   ALIAS('openInvestigation,reopenInvestigation,replayInvestigation'),   'research','time',    'camera,map.layer,time',  'map,time',            'session', 'none',   '',         '', 'external'],
    policy: HIDDEN,
    doc: [
      { in: 'notebook', at: 20, text: '{"type":"notebookOpen","id":str,"only"?:["time"|"layers"|"camera",…]} = REOPEN ONE NOTEBOOK ENTRY (調査ノートを開く・地図を再現): the clock, the layers and the camera are put back exactly as that answer left them and READ BACK (a section that did not come back is named), and the result hands you that answer\'s text and THE EXACT CALLS that drew its map, as {"type":…} objects. Re-issue the ones the reader needs — they are the same calls, so they draw the same thing — or answer from the stored text; nothing is re-run for you. "query" instead of "id" opens the newest entry matching those words. ' },
    ],
    schema: () => ({ type: 'object', properties: { id: str(), query: str(), only: list(str()) } }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn;
      if (!NOTEBOOK_SHOWN) return gone(K, 'FEATURE_WITHDRAWN');
      const f = await findEntry(a);
      if (!f.e) return R(false, warn(esc(f.why === 'needs-id' ? L('Name the entry to open (its id) or the words to find it by.', '開く記録の id か、探す言葉を指定してください。') : L('No notebook entry matches', '一致する記録はありません') + ' «' + String(f.q || '') + '»')), { meta: { code: f.why === 'needs-id' ? 'needs_input' : 'not_found' } });
      const e = f.e, only = a.only ? [].concat(a.only).map(String) : null;
      let rv = { restored: [], unresolved: [], missingLayers: [], asked: [] };
      if (e.view) { try { rv = await restoreView(e.view, K.ASTATE, only); } catch (err) { return R(false, warn(esc(L('The view could not be put back', '表示を戻せませんでした') + ': ' + String((err && err.message) || err)))); } }
      const calls = (e.steps || []).filter((s) => s.replay && s.args && s.args.type).map((s) => s.args);
      let h = '<div style="font-weight:600;margin:2px 0;">' + esc(e.question) + '</div>' + note(esc(L('Investigated', '調査日時') + ' ' + when(e.at) + ' · ' + e.id));
      if (!e.view) h += note(esc(L('This entry kept no view to put back.', 'この記録には戻せる表示がありません。')));
      else if (rv.unresolved.length) h += warn(esc(L('Not put back', '戻らなかったもの') + ': ' + rv.unresolved.join(', ')));
      else h += note('✓ ' + esc(L('Put back as the answer left it', '回答時の状態に戻しました') + ': ' + (rv.asked.join(', ') || '—')));
      if (rv.missingLayers.length) h += note(esc(L('Layers this build does not have', 'この版に無いレイヤー') + ': ' + rv.missingLayers.join(', ')));
      if (!only) {
        if (calls.length) h += '<details style="font-size:11.5px;margin:4px 0;"><summary>' + esc(L('The calls that drew this answer', 'この回答の地図を描いた呼び出し') + ' (' + calls.length + ')') + '</summary><code style="white-space:pre-wrap;word-break:break-word;">' + esc(calls.map((c) => JSON.stringify(c)).join('\n')) + '</code></details>';
        if (e.answer) h += '<div style="font-size:12px;line-height:1.55;margin-top:4px;white-space:pre-wrap;">' + esc(e.answer.length > 1200 ? e.answer.slice(0, 1200) + ' …' : e.answer) + '</div>';
        if ((e.results || []).length) h += note(esc(L('Its queries found', 'この調査の問い合わせ結果') + ': ' + e.results.map((r) => (r.tableLabel || r.table) + ' ' + r.matched).join(', ') + ' — ' + L('notebookCompare runs them again now', 'notebookCompare で今と比べられます')));
        if (f.also && f.also.length) h += note(esc(L('Also matching', 'ほかに一致') + ': ' + f.also.map((x) => x.id + ' (' + x.title.slice(0, 40) + ')').join(', ')));
      }
      return R(!rv.unresolved.length, h, { meta: { notebook: { id: e.id, restored: rv.restored, unresolved: rv.unresolved, calls: calls.length } } });
    },
  },
  {
    row: ['notebook.compare',           'notebookCompare', ALIAS('compareInvestigation,whatChangedSince,recheckInvestigation'), 'research','none',    '',                       'explanation',         'read',    'none',   '',         'atlasQuery', 'external'],
    policy: HIDDEN,
    doc: [
      { in: 'notebook', at: 30, text: '{"type":"notebookCompare","id":str} = 今と比べる / WHAT CHANGED SINCE: runs every query a notebook entry made AGAIN, NOW, on the same specification, and compares the rows BY THEIR IDENTITY — rows that newly match, rows that no longer match, values that changed (with the difference) — computed by IntMap, not judged. The comparison is filed in the notebook beside the original, so the same question builds a history. Where either side matched more rows than it kept, it says that a row «gone» may only have moved below the row limit. An entry with no query rows has nothing to compare mechanically: answer its question again instead (the reader can press 「もう一度訊く」). ' },
    ],
    schema: () => ({ type: 'object', properties: { id: str(), query: str() } }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn;
      if (!NOTEBOOK_SHOWN) return gone(K, 'FEATURE_WITHDRAWN');
      const f = await findEntry(a);
      if (!f.e) return R(false, warn(esc(f.why === 'needs-id' ? L('Name the entry to compare (its id) or the words to find it by.', '比べる記録の id か、探す言葉を指定してください。') : L('No notebook entry matches', '一致する記録はありません') + ' «' + String(f.q || '') + '»')), { meta: { code: f.why === 'needs-id' ? 'needs_input' : 'not_found' } });
      const e = f.e;
      if (!(e.results || []).length) return R(true, note(esc(L('This entry has no query rows to compare. Its answer was text — ask the question again to compare it with today.', 'この記録には比べられる行がありません。回答は文章だったので、もう一度訊けば今日と比べられます。'))), { meta: { notebook: { id: e.id, compared: 0 } } });
      const Q = await queryEngine(K);
      if (!Q) return R(false, warn(esc(L('The query engine could not be loaded.', 'クエリエンジンを読み込めませんでした。'))));
      const nowResults = [], parts = [];
      let changes = 0, failed = 0;
      for (const then of e.results) {
        let res = null; try { res = await Q.run(then.spec); } catch (err) { res = { ok: false, error: String((err && err.message) || err) }; }
        const head = '<div style="font-weight:600;margin:8px 0 3px;">' + esc(then.tableLabel || then.table) + '</div>';
        if (!res || !res.ok) { failed++; parts.push(head + warn(esc(L('Could not run it again', '再実行できませんでした') + ': ' + String((res && (res.error || res.message)) || 'error')))); continue; }
        const now = Q.compact(res); nowResults.push(now);
        const d = diffResults(then, now);
        changes += d.added.length + d.removed.length + d.changed.length;
        let h = head + note(esc(when(d.thenAt) + ' → ' + when(d.nowAt) + ' · ' + L('rows matched', '該当行') + ' ' + d.matchedThen + ' → ' + d.matchedNow));
        if (!d.added.length && !d.removed.length && !d.changed.length) h += note('✓ ' + esc(L('No change in the rows kept', '保存した行に変化はありません') + ' (' + d.unchanged + ')'));
        const nameOf = (r) => esc(r.name + (r.iso2 ? ' ' + r.iso2 : ''));
        if (d.added.length) h += '<div style="font-size:12px;margin:3px 0;"><b>' + esc(L('Newly matching', '新たに該当')) + ' (' + d.added.length + ')</b>: ' + d.added.map(nameOf).join(', ') + '</div>';
        if (d.removed.length) h += '<div style="font-size:12px;margin:3px 0;"><b>' + esc(L('No longer matching', '該当しなくなった')) + ' (' + d.removed.length + ')</b>: ' + d.removed.map(nameOf).join(', ') + '</div>';
        if (d.changed.length) h += '<table class="atl-nbd-t"><tbody>' + d.changed.map((c) => c.diffs.map((x, i) => '<tr><td>' + (i ? '' : nameOf(c)) + '</td><td>' + esc(x.label) + '</td><td>' + esc(fmtN(x.then)) + ' → ' + esc(fmtN(x.now)) + (x.unit ? ' ' + esc(x.unit) : '') + '</td><td class="' + (x.delta > 0 ? 'atl-nbd-up' : (x.delta < 0 ? 'atl-nbd-down' : '')) + '">' + (x.delta != null ? esc((x.delta > 0 ? '+' : '') + fmtN(x.delta)) : '') + '</td></tr>').join('')).join('') + '</tbody></table>';
        if (d.cutThen || d.cutNow) h += note(esc(L('More rows matched than were kept, so a row listed as no longer matching may only have moved below the row limit.', '保存した行数より多くが該当していたため、「該当しなくなった」行は表示上限の下へ移っただけの可能性があります。')));
        if (!d.sameColumns) h += note(esc(L('The columns differ between the two runs; only the shared ones were compared.', '2 回の実行で列が異なるため、共通の列だけを比べました。')));
        parts.push(h);
      }
      let filed = '';
      if (nowResults.length && keepingOn()) {
        const summary = L('Compared with', '比較元') + ' ' + when(e.at) + ': ' + changes + ' ' + L('changes', '件の変化');
        const n = normalize({ id: newId(Date.now()), at: Date.now(), updatedAt: Date.now(), question: e.question, title: e.title, answer: summary, lang: e.lang, status: 'compared',
          view: e.view, steps: [], results: nowResults, sources: [], note: '', followOf: e.followOf || e.id });
        try { await notebookStore().put(n); filed = n.id; } catch (_) { filed = ''; }
      }
      const top = '<div style="font-weight:600;margin:2px 0;">' + esc(L('Compared with now', '今と比べました')) + ' — ' + esc(e.title) + '</div>'
        + note(esc(changes + ' ' + L('changes', '件の変化') + (failed ? ' · ' + failed + ' ' + L('could not be run again', '件は再実行できず') : '') + (filed ? ' · ' + L('filed in the notebook', 'ノートに記録しました') : '')));
      return R(failed < e.results.length, top + parts.join(''), { meta: { notebook: { id: e.id, compared: nowResults.length, changes, failed, filed } } });
    },
  },
];
