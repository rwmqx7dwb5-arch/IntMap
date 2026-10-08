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
  /* (watch-account-product) learn.daily — TODAY'S QUEST: the day's set of each kind (js/quest-engine.js «THE DAY'S SET»), the
     reader's streak of days and the last week, kept in this browser and the account (js/quest-daily.js). `state` reads
     the summary the panel and the account sheet read (one count of the streak); `start` opens today's set and is judged by
     the panel's own state afterwards, like learn.quest. Atlas does not answer the questions, and does not record a result —
     only the reader finishing the set does. */
  {
    row: ['learn.daily',                'dailyQuest',     'todayQuest,dailyChallenge,questStreak,dailyStreak',         'panel',   'none',    'panel.quest,map.quest,camera,time', 'panel',        'session', 'none',   '',         ''],
    doc: [
      { in: 'learn.quest', at: 1, text: '{"type":"dailyQuest","action"?:"state"|"start"|"link","kind"?:"when"|"where"} = TODAY\'S QUEST (今日のクエスト — one set of each learn quest per calendar day, the same for everyone that day; the year quest opens on events the map\'s record dates on this day of the year, where it has any). state (default) returns whether today\'s sets are done and their scores, the reader\'s STREAK (連続日数: current and best) and the last 7 days — for 「今日のクエストは？」「連続何日？」「今週何日やった？」, "what\'s my streak?", "did I do today\'s quest?". start opens today\'s set of kind (default "when"); link returns today\'s set\'s challenge link so a friend gets the same questions today. The first finish of a day is the result (kept in the browser, and in the account when signed in); playing again is practice. Use this, not quest, whenever the reader says today / daily / streak. Do not answer the questions for the reader. ' },
    ],
    schema: () => ({ type: 'object', properties: { action: one('state', 'start', 'link'), kind: str() } }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn, HOST = K.HOST;
      const P = await import('./quest-panel.js');
      const E = await import('./quest-engine.js');
      const D = await import('./quest-daily.js');
      const act = String(a.action || 'state').trim();
      const kind = a.kind ? String(a.kind) : 'when';
      if ((act === 'start' || act === 'link') && E.QUEST_KIND_IDS.indexOf(kind) < 0) {
        return R(false, warn(esc(L('No quest is called', 'この名前のクエストはありません') + ' «' + kind + '» — ' + E.QUEST_KIND_IDS.join(', '))), { meta: { code: 'needs_input' } });
      }
      if (act === 'link') {
        const link = P.todayLink(kind);
        return R(true, '<div style="font-weight:600;margin:2px 0;">' + esc(L('Today\'s ', '今日の') + E.kindTitle(kind, L('en', 'jp')) + ' · ' + L('challenge link', '挑戦リンク')) + '</div><div style="font-size:12px;word-break:break-all;">' + esc(link) + '</div>'
          + note(esc(L('Everyone who opens it today gets the same ' + E.DAILY_N + ' questions.', '今日開いた人は全員、同じ ' + E.DAILY_N + ' 問を解きます。'))), { meta: { daily: { kind, day: D.today(), link } } });
      }
      if (act === 'start') {
        const r = await P.openToday({ kind });
        const s = P.questState();
        if (!r || r.ok === false) {
          const why = r && r.reason === 'data' ? L('The quest\'s data could not be read', 'クエストのデータを読み込めませんでした') + (r.detail ? ' (' + r.detail + ')' : '') : L('No questions could be made from the data', 'データから問題を作れませんでした');
          return R(false, warn(esc(why)), { meta: { code: 'unavailable' } });
        }
        /* the verdict is what the panel says now: open, on question 1 of today's set of this kind */
        const ok = !!(s.open && s.kind === kind && s.index === 1 && s.daily && s.daily.day === D.today());
        return R(ok, ok ? note('✓ ' + esc(s.daily.practice ? L('Today\'s set is on screen — already recorded today, so this round is practice', '今日のセットを表示しました。今日の記録はすでにあるので、この回は練習です')
          : L('Today\'s set is on screen — the reader answers on the map; the first finish is today\'s result', '今日のセットを表示しました。読者が地図で答え、最初に解き終えた結果が今日の記録になります')))
          : warn(esc(L('Today\'s set did not open', '今日のセットが開きませんでした'))), { meta: { quest: { open: !!s.open, kind: s.kind, seed: s.seed, n: s.n, index: s.index, daily: s.daily } } });
      }
      /* state — the one summary (this browser and the account, merged). A read: it does not add this browser's days to the
         account (sync:false) — the panel and the account sheet do that, so this row's effects stay what its row declares */
      const s = await D.dailySummary(HOST, { sync: false });
      const lang = L('en', 'jp');
      const kinds = E.QUEST_KIND_IDS.map((k) => {
        const d = s.todayKinds[k];
        return '<div style="font-size:12.5px;margin:2px 0;">' + esc(L('Today\'s ', '今日の') + E.kindTitle(k, lang)) + ': ' + esc(d ? d.points + ' / ' + d.max + ' (' + d.scores.join(' · ') + ')' : L('not played yet', 'まだ解いていません')) + '</div>';
      }).join('');
      const st = s.streak;
      const streak = st.current > 0 ? L(st.current + '-day streak', '連続 ' + st.current + ' 日') + (st.playedToday ? '' : L(' (play today to continue it)', '（今日解くと続きます）')) : L('No streak running', '連続記録はありません');
      const week = s.recent.map((r) => r.day.slice(5) + (r.played ? ' ' + r.points : ' —')).join(' · ');
      const where = s.account === 'ok' ? L('Kept in the account (every device)', 'アカウントに記録（どの端末でも同じ）') : D.dailyFailureText(s.account, lang);
      return R(true, '<div style="font-weight:600;margin:2px 0;">' + esc(L('Today\'s quest', '今日のクエスト') + ' · ' + s.today) + '</div>' + kinds
        + '<div style="font-size:12.5px;margin:2px 0;">' + esc(streak + ' · ' + L('best streak ' + st.best + ' days', '最長 ' + st.best + ' 日')) + '</div>'
        + note(esc(L('Last 7 days: ', '最近 7 日: ') + week)) + note(esc(where)),
      { meta: { daily: { today: s.today, account: s.account, todayKinds: s.todayKinds, streak: st, recent: s.recent, days: s.days } } });
    },
  },
];
