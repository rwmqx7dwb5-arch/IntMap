/* ============================================================================
 *  IntMap · Atlas capabilities — the `corrections.*` namespace   (js/atlas-cap-corrections.js)
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
 *
 *  (community-next) MAP CORRECTIONS — the reader's «this is wrong, here» and the operator's answer, through the
 *  SAME doors the UI uses (js/map-corrections.js): the report card, the reader's reports read back by receipt and
 *  account, and the public log. Atlas DRAFTS a report and opens the card on the point — the READER sends it (a
 *  report is the reader's word to the operator, as a donation is the reader's click on Stripe's page). Atlas reads
 *  answers and the public log as they are; it does not restate a status the database did not return.
 *  ⚠ A POINT IS NEVER THE MAP CENTRE BY DEFAULT (CONSTITUTION.md §5): with no place and no coordinates the call
 *  asks for one.
 * ==========================================================================*/
import { str, num, lng, lat, one, noArgs } from './atlas-caps.js';
import { IntMapLang } from './lang-registry.js';
import { CORRECTION } from '../supabase/functions/_shared/correction-shape.js';

const needs = (code, extra) => ({ meta: Object.assign({ code, category: 'input', retryable: true, userGoalSatisfied: false, produced: [] }, extra || null) });

/* the lines the model reads back: every field the database returned, nothing summarised */
function reportLines(reps, W, esc, lang) {
  const L = W.L;
  return reps.map((r) => '<div style="font-size:12px;line-height:1.6;margin-bottom:4px;"><b>' + esc(W.status[r.status] || r.status) + '</b> · '
    + esc(W.kind[r.kind] || r.kind) + ' · ' + esc(r.place_label || ((+r.lat).toFixed(4) + ', ' + (+r.lng).toFixed(4)))
    + (r.year != null ? ' · ' + esc(L('map year ', '地図の年 ') + r.year) : '')
    + (r.layer_label ? ' · ' + esc(r.layer_label) : '')
    + ' · ' + esc(String(r.created_at || r.reported_on || '').slice(0, 10))
    + (r.message ? '<br><span style="opacity:.8;">' + esc(L('Reported: ', '報告: ') + r.message) + '</span>' : '')
    + (r.reply ? '<br>' + esc(L('Answer: ', '回答: ') + r.reply) : '')
    + (r.fixed_ref ? '<br><span style="opacity:.8;">' + esc(L('Change: ', '変更: ') + r.fixed_ref) + '</span>' : '')
    + '</div>').join('');
}

export default [
  {
    row: ['corrections.report',         'reportMapError', 'mapCorrection,reportMapMistake,correctTheMap,flagMapError', 'corrections', 'panel', 'panel.corrections', 'panel', 'session', 'none', 'place?', ''],
    doc: [
      { in: 'more-features', at: 300, text: '{"type":"reportMapError","place"?:str,"country"?:str,"lng"?:num,"lat"?:num,"what"?:"' + CORRECTION.kinds.join('"|"') + '","layer"?:str,"message"?:str} = REPORT A MAP ERROR / 地図の誤りを報告 — opens the correction card ON THE POINT, pre-filled with your draft: what is wrong ("name" 名前, "boundary" 境界・形, "date" the years something is drawn for — 存在した年, "value" a layer\'s value, "position" 位置, "missing" 欠落), the layer id it is on (from the layers that are on), and a draft of what it should be. The card attaches the point, the map view and, on a historical map, the year. THE READER reviews and presses Send — you do not send it. Use when the reader says something on the map is wrong: 「この地名が違う」「この国境はおかしい」「この年にはまだこの県は無い」「地図の誤りを報告したい」, "this border is wrong", "report a mistake on the map". Needs a place or coordinates; ' },
    ],
    schema: () => ({ type: 'object', properties: { place: str(), country: str(), lng: lng(), lat: lat(), what: one.apply(null, CORRECTION.kinds), layer: str(), message: str() } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST, geocode = K.geocode;
      const lang = HOST.lang, T = IntMapLang.pick(() => lang);
      let pt = null;
      if (a.lng != null && a.lat != null && isFinite(+a.lng) && isFinite(+a.lat)) pt = { lng: +a.lng, lat: +a.lat, name: a.place ? String(a.place) : null };
      else if (a.place) {
        const pp = String(a.place).trim(), pc = String(a.country || '').trim();
        const ll = await geocode(pc && pp.toLowerCase().indexOf(pc.toLowerCase()) < 0 ? pp + ', ' + pc : pp);
        if (!ll) return R(false, warn(T('Could not find that place', 'その場所が見つかりません') + ': ' + esc(a.place)), needs('PLACE_NOT_FOUND', { semanticTarget: String(a.place) }));
        pt = { lng: +ll.lng, lat: +ll.lat, name: ll.name || pp };
      }
      if (!pt) return R(false, warn(T('Where is the error? Name the place or give its coordinates.', '誤りはどこですか？ 地名か座標を指定してください。')), needs('NEEDS_INPUT'));
      const M = await import('./map-corrections.js');
      const body = M.openCorrection(HOST, { lng: pt.lng, lat: pt.lat, placeLabel: pt.name, what: a.what, layerId: a.layer, message: a.message });
      if (!body) return R(false, warn(T('The report form could not be opened.', '報告フォームを開けませんでした。')));
      return R(true, note(esc(T('The report form is open at ' + (pt.name || (pt.lat.toFixed(4) + ', ' + pt.lng.toFixed(4))) + ', with the draft filled in. Review it and press «Send report» — it is sent only when you do.',
        (pt.name || (pt.lat.toFixed(4) + ', ' + pt.lng.toFixed(4))) + ' の報告フォームを下書き入りで開きました。内容を確かめて「報告を送る」を押してください（押すまで送信されません）。'))),
        { meta: { code: 'AWAITING_READER', category: 'ok', retryable: false, userGoalSatisfied: true, produced: ['panel'] } });
    },
  },
  {
    row: ['corrections.mine',           'myMapReports',   'myCorrections,mapReportStatus,correctionStatus', 'corrections', 'none', '', 'explanation', 'read', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 310, text: '{"type":"myMapReports"} = THE READER\'S MAP ERROR REPORTS AND THE OPERATOR\'S ANSWERS / 地図の誤り報告の状況 — every correction this device sent (by its receipt, no account needed) and, when signed in, every one the account sent: what, where, which year and layer, the status (received, confirmed, fixed, checked-and-correct, already reported, cannot be fixed yet, closed), the operator\'s reply and what was changed. Use for 「私の報告はどうなった？」「地図の誤り報告の返事は？」, "what happened to my report?", "was my correction fixed?"; ' },
    ],
    schema: () => (noArgs('myMapReports')),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = IntMapLang.pick(() => lang);
      const M = await import('./map-corrections.js');
      const got = await M.readReports(HOST);
      if (!got.ok) return R(false, warn(esc(T('The answers could not be read (' + got.error + ').', '回答を読み込めませんでした（' + got.error + '）。'))));
      const W = M.words(lang);
      if (!got.reports.length) return R(true, note(esc(T('No map error reports from this device or account.', 'この端末・アカウントからの地図の誤り報告はありません。'))));
      M.saveStore(M.markSeen(M.loadStore(), got.reports, Date.now()));
      return R(true, '<div style="font-weight:600;margin:2px 0 6px;">' + esc(T('Your map reports — ' + got.reports.length, '地図の誤り報告 — ' + got.reports.length + ' 件')) + '</div>' + reportLines(got.reports, W, esc, lang));
    },
  },
  {
    row: ['corrections.log',            'mapCorrectionsLog', 'publishedCorrections,correctionsLog,whatWasFixed', 'corrections', 'none', '', 'explanation', 'read', 'none', '', ''],
    doc: [
      { in: 'more-features', at: 320, text: '{"type":"mapCorrectionsLog","limit"?:num} = THE PUBLIC LOG OF MAP CORRECTIONS / 公開された訂正の記録 — what readers reported that the operator checked and published (newest answer first: what was wrong, where, which layer and year, the operator\'s answer and the change), plus the counts (received, open, fixed, checked-and-correct, about a historical year, median days to an answer). Use for 「最近直された地図の誤りは？」「訂正の記録」「報告はどのくらい直っている？」, "what has been corrected on the map?", "how many reports were fixed?"; quote only what it returns; ' },
    ],
    schema: () => ({ type: 'object', properties: { limit: num(1, 500) } }),
    async run(a, dctx, K) { const R = K.R, note = K.note, warn = K.warn, esc = K.esc, HOST = K.HOST;
      const lang = HOST.lang, T = IntMapLang.pick(() => lang);
      const M = await import('./map-corrections.js');
      const got = await M.publicLog(HOST, a.limit ? Math.round(+a.limit) : 50);
      if (!got.ok) return R(false, warn(esc(T('The corrections log could not be read (' + got.error + ').', '訂正の記録を読み込めませんでした（' + got.error + '）。'))));
      const W = M.words(lang), s = got.summary || {};
      const head = T('Reports received: ' + (s.received || 0) + ' · open: ' + (s.open || 0) + ' · fixed: ' + (s.fixed || 0) + ' · checked and correct: ' + (s.not_an_error || 0) + ' · about a historical year: ' + (s.historical || 0)
        + (s.median_days_to_answer != null ? ' · median days to an answer: ' + s.median_days_to_answer : ''),
      '受け付けた報告: ' + (s.received || 0) + ' 件・対応中: ' + (s.open || 0) + '・修正: ' + (s.fixed || 0) + '・確認の結果誤りなし: ' + (s.not_an_error || 0) + '・歴史地図の年について: ' + (s.historical || 0)
        + (s.median_days_to_answer != null ? '・回答までの日数（中央値）: ' + s.median_days_to_answer : ''));
      if (!got.rows.length) return R(true, note(esc(head + T(' — nothing has been published yet.', ' — 公開された訂正はまだありません。'))));
      return R(true, note(esc(head)) + reportLines(got.rows, W, esc, lang));
    },
  },
];
