/* ============================================================================
 *  IntMap · Atlas capabilities — the `learn.*` namespace   (js/atlas-cap-learn.js)   (learn-quests)
 * ----------------------------------------------------------------------------
 *  One entry per capability, and everything about it in the one place (the shape is js/atlas-caps.js's).
 *
 *  learn.quest — the LEARN QUESTS (js/quest-panel.js over js/quest-engine.js): questions made from the map's own
 *  data, answered on the map. Atlas can start a set (`kind`, `n`, `seed`), read where the reader is in it, hand
 *  back the challenge link that gives a whole class the same questions, or close it.
 *  ⚠ THE VERDICT IS THE MODULE'S OWN STATE, READ AFTER THE CALL (.agents/rules/one-pass-or-a-reason.md §4):
 *  questState() says whether the panel is open, which kind, which seed, which question — so a start that put
 *  the first question on screen is reported as done, and a start whose data could not be read is reported as
 *  that failure, never as «nothing changed». Atlas does not answer the questions for the reader.
 * ==========================================================================*/
import { str, int, one } from './atlas-caps.js';

export default [
  {
    row: ['learn.quest',                'quest',          'learnQuest,geoQuest,questLink,challengeLink,quizSet',         'panel',   'none',    'panel.quest,map.quest,camera,time', 'panel',        'session', 'none',   '',         ''],
    doc: [
      { in: 'learn.quest', text: 'LEARN QUESTS (学ぶクエスト — questions made from the map\'s own data, answered on the map): {"type":"quest","action"?:"start"|"link"|"state"|"close","kind"?:"where"|"when","n"?:int,"seed"?:str}. kind "where" (場所当て) names a city and the reader taps it on the map, scored by the distance; kind "when" (年代当て) puts the map on a day in history with the year hidden and the reader answers the year. start opens a set of n questions (default 5) — give "seed" to reproduce a set exactly; without one a new set is made. link returns the CHALLENGE LINK (挑戦リンク) of the set (or of kind+seed+n): everyone who opens it gets the same questions — for 「クラス全員に同じ問題を」「場所当てクイズを出して」「年代当てを10問」「挑戦リンクをちょうだい」, "quiz me on where cities are", "give my class the same questions". Do not answer the questions for the reader. ' },
    ],
    schema: () => ({ type: 'object', properties: { action: one('start', 'link', 'state', 'close'), kind: str(), n: int(1, null), seed: str() } }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn;
      const P = await import('./quest-panel.js');
      const E = await import('./quest-engine.js');
      const act = String(a.action || (a.kind ? 'start' : 'state')).trim();
      const said = (s) => {
        if (!s || !s.open) return note(esc(L('The learn-quest panel is closed.', '学ぶクエストのパネルは閉じています。')));
        if (!s.kind) return note(esc(L('The learn-quest panel is open on the choice of quests.', '学ぶクエストのパネルが、クエストの選択画面で開いています。')));
        return '<div style="font-weight:600;margin:2px 0;">' + esc(E.kindTitle(s.kind, L('en', 'jp'))) + ' · ' + esc(L('question ', '問題 ')) + s.index + ' / ' + s.of + '</div>'
          + note(esc(L('Score so far', 'ここまでの得点') + ': ' + s.points + ' / ' + s.max + ' · seed ' + s.seed + (s.blind ? ' · ' + L('the year is hidden on screen', '画面の年は隠しています') : '')))
          + '<div style="font-size:12px;margin:2px 0;word-break:break-all;">' + esc(L('Challenge link', '挑戦リンク')) + ': ' + esc(s.link) + '</div>';
      };
      const meta = (s) => ({ quest: { open: !!s.open, kind: s.kind, seed: s.seed, n: s.n, index: s.index, of: s.of, phase: s.phase, link: s.link || '' } });
      if (act === 'close') {
        const was = P.closeQuest(), s = P.questState();
        return R(!s.open, note('✓ ' + esc(was ? L('Closed the learn quest; the map\'s time and view are put back', '学ぶクエストを閉じ、地図の時刻と視点を戻しました') : L('No learn quest was open', '学ぶクエストは開いていませんでした'))), { meta: meta(s) });
      }
      if (act === 'state') { const s = P.questState(); return R(true, said(s), { meta: meta(s) }); }
      if (act === 'link') {
        const cur = P.questState();
        const kind = a.kind ? String(a.kind) : cur.kind, seed = a.seed ? String(a.seed) : cur.seed, n = a.n || cur.n || 5;
        if (!kind || E.QUEST_KIND_IDS.indexOf(kind) < 0) return R(false, warn(esc(L('Name the quest — kind', 'クエストの種類（kind）を指定してください') + ': ' + E.QUEST_KIND_IDS.join(', '))), { meta: { code: 'needs_input' } });
        if (!seed || !E.SEED_RE.test(seed)) return R(false, warn(esc(L('A link needs the set\'s seed — start a set first, or give "seed" (letters, digits, _ and -).', 'リンクには問題セットの seed が要ります。先にセットを始めるか、seed（英数字・_・-）を指定してください。'))), { meta: { code: 'needs_input' } });
        const link = P.questLink(kind, seed, n);
        return R(true, '<div style="font-weight:600;margin:2px 0;">' + esc(L('Challenge link', '挑戦リンク')) + '</div><div style="font-size:12px;word-break:break-all;">' + esc(link) + '</div>'
          + note(esc(L('Everyone who opens it gets the same ' + n + ' questions of ', '開いた人は全員、同じ ' + n + ' 問の') + E.kindTitle(kind, L('en', 'jp')) + L('.', 'を解きます。'))), { meta: { quest: { kind, seed, n, link } } });
      }
      /* start */
      const r = await P.startQuest({ kind: a.kind, n: a.n, seed: a.seed });
      const s = P.questState();
      if (!r || r.ok === false) {
        const why = r && r.reason === 'unknown-kind' ? L('No quest is called', 'この名前のクエストはありません') + ' «' + String(a.kind || '') + '» — ' + E.QUEST_KIND_IDS.join(', ')
          : r && r.reason === 'data' ? L('The quest\'s data could not be read', 'クエストのデータを読み込めませんでした') + (r.detail ? ' (' + r.detail + ')' : '')
          : L('No questions could be made from the data', 'データから問題を作れませんでした');
        return R(false, warn(esc(why)), { meta: Object.assign({ code: r && r.reason === 'unknown-kind' ? 'needs_input' : 'unavailable' }, meta(s)) });
      }
      /* the verdict is what the panel says now: open, on question 1 of this kind and seed */
      const ok = s.open && s.kind === String(a.kind) && s.index === 1;
      return R(ok, (ok ? note('✓ ' + esc(L('The set is on screen — the reader answers on the map', 'セットを表示しました。読者が地図で答えます'))) : warn(esc(L('The set did not open', 'セットが開きませんでした')))) + said(s), { meta: meta(s) });
    },
  },
];
