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
 *
 *  learn.class (wave4-education) — CLASS SETS: the teacher's side of a challenge link (js/quest-class.js and its board):
 *  make a set, list the sets, read a set's results, open or close it for hand-ins, open the board.
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
  /* (wave4-education) learn.class — CLASS SETS: a learn quest given to a class so the students' answers reach the teacher
     (js/quest-class.js, the board js/quest-class-board.js, public.class_sets / class_set_answers). Atlas can make a set
     (of the set on screen, or of a kind), list the teacher's sets, read one set's RESULTS — the same tally the board shows,
     scored by the engine the students' panel used — open or close a set for hand-ins, and open the board.
     ⚠ THE VERDICT IS THE DATABASE'S ROW OR THE BOARD'S STATE, READ AFTER THE CALL (.agents/rules/one-pass-or-a-reason.md §4).
     Students' names are the teacher's data: Atlas reports them to the signed-in teacher whose set it is, and nobody else
     can read them (RLS). Atlas never hands in answers for a student. */
  {
    row: ['learn.class',                'classSet',       'classQuest,classResults,classBoard,classLink,assignQuest,quizResults', 'panel', 'none', 'account.classes,panel.quest,map.quest,camera', 'panel', 'persist', 'explicit', '', ''],
    doc: [
      { in: 'learn.quest', at: 720, text: '{"type":"classSet","action"?:"list"|"create"|"results"|"open"|"close"|"board","kind"?:"where"|"when","n"?:5|10,"seed"?:str,"title"?:str,"code"?:str} = CLASS SETS (クラスのセット — a learn quest given to a class so EVERY STUDENT\'S ANSWERS REACH THE TEACHER; students open the class link with no account and type a name). Needs the teacher signed in. create makes a set — of the set on screen when no kind is given, else of kind (n 5 or 10, a new seed unless "seed") with an optional "title" — and returns the CLASS LINK to hand out; list (default) returns the teacher\'s sets with their codes and how many handed in; results (with "code") returns how the class did: how many handed in, the class mean and median, the HARDEST question, each question\'s mean and median distance / years off, and each student\'s total — for 「クラスの結果は？」「どの問題が難しかった？」「誰が提出した？」「生徒の答えを見せて」, "how did my class do?", "which question did they get wrong?"; open / close (with "code") start or stop taking answers; board opens the teacher\'s board (with "code": that set, where each place question\'s taps can be drawn on the map). Use this — not quest — whenever the reader says class, students, assign, hand in or results. Do not hand in answers for a student. ' },
    ],
    schema: () => ({ type: 'object', properties: { action: one('list', 'create', 'results', 'open', 'close', 'board'), kind: str(), n: int(1, null), seed: str(), title: str(), code: str() } }),
    async run(a, dctx, K) { const R = K.R, L = K.L, esc = K.esc, note = K.note, warn = K.warn, HOST = K.HOST;
      const P = await import('./quest-panel.js');
      const E = await import('./quest-engine.js');
      const C = await import('./quest-class.js');
      const B = await import('./quest-class-board.js');
      const lang = L('en', 'jp');
      const act = String(a.action || (a.code ? 'results' : 'list')).trim();
      const SIGN_IN = { code: 'SIGN_IN_REQUIRED', category: 'input', retryable: false, userGoalSatisfied: false, produced: [] };
      const fail = (code) => R(false, warn(esc(C.classFailureText(code, lang))), { meta: code === 'sign_in' ? SIGN_IN : { code: String(code || 'failed').toUpperCase() } });
      if (!HOST.user) {
        if (act === 'board') await P.openClassBoard();   /* the board itself offers the sign-in */
        return fail('sign_in');
      }
      const code = a.code ? String(a.code).trim().toUpperCase() : '';
      const setLine = (x) => '<div style="font-size:12px;line-height:1.6;"><b>' + esc(x.title || E.kindTitle(x.kind, lang)) + '</b> · ' + esc(E.kindTitle(x.kind, lang) + ' · ' + x.n + L(' questions', ' 問') + ' · ' + String(x.created_at || '').slice(0, 10) + ' · ' + x.answered + L(' handed in', ' 人提出') + ' · ' + (x.open ? L('taking answers', '受付中') : L('closed for answers', '締切'))) + ' <span style="opacity:.6;">[code ' + esc(x.code) + ']</span></div>';
      if (act === 'board') {
        const st = await P.openClassBoard(code ? { code } : null);
        const ok = !!(st && st.open && (!code || (st.set && st.set.code === code)));
        return R(ok, ok ? note('✓ ' + esc(L('The class board is open', 'クラスのボードを開きました') + (st.set ? ': ' + (st.set.title || E.kindTitle(st.set.kind, lang)) : ''))) : warn(esc(L('No class set has that code', 'そのコードのクラスのセットはありません') + ': ' + code)),
          { meta: { board: st } });
      }
      if (act === 'create') {
        const cur = P.questState();
        const kind = a.kind ? String(a.kind) : cur.kind;
        const seed = a.seed ? String(a.seed) : (!a.kind && cur.seed ? cur.seed : P.freshSeed());
        const n = a.n != null ? +a.n : (!a.kind && cur.n ? cur.n : E.SET_LENGTHS[0]);
        if (!kind || E.QUEST_KIND_IDS.indexOf(kind) < 0) return R(false, warn(esc(L('Name the quest — kind', 'クエストの種類（kind）を指定してください') + ': ' + E.QUEST_KIND_IDS.join(', '))), { meta: { code: 'needs_input' } });
        if (!C.classable(kind, seed, n)) return R(false, warn(esc(L('A class set has ' + E.SET_LENGTHS.join(' or ') + ' questions and a seed of letters, digits, _ and -.', 'クラスのセットの問題数は ' + E.SET_LENGTHS.join(' か ') + '、seed は英数字・_・- です。'))), { meta: { code: 'needs_input' } });
        const r = await C.createClassSet(HOST.DB, { kind, seed, n, title: a.title });
        if (!r.ok) return fail(r.error);
        const link = B.linkOf(r.set);
        return R(true, note('✓ ' + esc(L('Made the class set', 'クラスのセットを作りました'))) + setLine(r.set)
          + '<div style="font-size:12px;word-break:break-all;margin:2px 0;">' + esc(L('Class link', 'クラスのリンク')) + ': ' + esc(link) + '</div>'
          + note(esc(L('Students open it with no account and type a name; their answers come to the teacher\'s board. The set takes answers until it is closed.', '生徒はアカウントなしで開いて名前を入力します。答えは先生のボードに届きます。締め切るまで提出を受け付けます。'))),
          { meta: { classSet: { code: r.set.code, kind, seed, n, title: r.set.title || '', open: true, link } } });
      }
      if (act === 'open' || act === 'close') {
        if (!code) return R(false, warn(esc(L('Which set? Give its code (list shows them).', 'どのセットですか？ コードを指定してください（list で一覧できます）。'))), { meta: { code: 'needs_input' } });
        const l = await C.listClassSets(HOST.DB);
        if (!l.ok) return fail(l.error);
        const x = l.sets.find((y) => y.code === code);
        if (!x) return fail('not_found');
        const want = act === 'open';
        if (x.open === want) return R(true, note('✓ ' + esc(want ? L('The set already takes answers', 'このセットはすでに受付中です') : L('The set is already closed', 'このセットはすでに締め切られています'))) + setLine(x), { meta: { classSet: { code, open: x.open } } });
        const r = await C.setClassOpen(HOST.DB, x.id, want);
        if (!r.ok) return fail(r.error);
        return R(r.open === want, note('✓ ' + esc(want ? L('The set takes answers again', '提出の受付を再開しました') : L('Closed the set for answers', '提出を締め切りました'))) + setLine(Object.assign({}, x, { open: r.open })), { meta: { classSet: { code, open: r.open } } });
      }
      if (act === 'results') {
        if (!code) return R(false, warn(esc(L('Which set? Give its code (list shows them).', 'どのセットですか？ コードを指定してください（list で一覧できます）。'))), { meta: { code: 'needs_input' } });
        const r = await B.readSet(code);
        if (!r.ok) return r.error === 'data' ? R(false, warn(esc(L('The questions of this set could not be made from the map\'s data', 'このセットの問題を地図のデータから作れませんでした'))), { meta: { code: 'UNAVAILABLE' } }) : fail(r.error);
        const T = r.T;
        const qLines = T.questions.map((x) => {
          const q = r.qs[x.i];
          const how = q.kind === 'where' ? (x.medianKm != null ? L('median ' + Math.round(x.medianKm) + ' km away', '中央値 ' + Math.round(x.medianKm) + ' km ずれ') : L('no taps', 'タップなし'))
            : (x.medianOff != null ? L('median ' + x.medianOff + ' y off, exact ' + x.exact, '中央値 ' + x.medianOff + ' 年ずれ・ぴったり ' + x.exact + ' 人') : L('no answers', '答えなし'));
          return '<div style="font-size:12px;line-height:1.6;">' + (x.i + 1) + '. ' + esc(C.questionLabel(q, lang)) + ' — ' + esc(L('mean ', '平均 ') + x.mean + ' · ' + how + (x.skipped ? ' · ' + L('skipped ', 'スキップ ') + x.skipped : '')) + (x.i === T.hardest ? ' <b>' + esc(L('(hardest)', '（最難）')) + '</b>' : '') + '</div>';
        }).join('');
        const sLines = T.students.map((st) => esc(st.name) + ' ' + st.total).join(' · ');
        return R(true, setLine(r.set)
          + (T.count ? '<div style="font-size:12.5px;margin:2px 0;">' + esc(L(T.count + ' handed in · class mean ' + T.meanTotal + ' / ' + T.max + ' · median ' + T.medianTotal, T.count + ' 人提出・クラス平均 ' + T.meanTotal + ' / ' + T.max + '・中央値 ' + T.medianTotal)) + '</div>' + qLines
            + note(esc(L('Students: ', '生徒: ')) + sLines) : note(esc(L('Nobody has handed in yet.', 'まだ提出はありません。')))),
          { meta: { classResults: { code, kind: r.set.kind, n: r.set.n, open: r.set.open, count: T.count, meanTotal: T.meanTotal, medianTotal: T.medianTotal, max: T.max, hardest: T.hardest,
            questions: T.questions.map((x) => ({ i: x.i, label: C.questionLabel(r.qs[x.i], lang), mean: x.mean, answered: x.answered, skipped: x.skipped, medianKm: x.medianKm, medianOff: x.medianOff, exact: x.exact })),
            students: T.students.map((st) => ({ name: st.name, total: st.total, scores: st.scores })) } } });
      }
      /* list */
      const l = await C.listClassSets(HOST.DB);
      if (!l.ok) return fail(l.error);
      return R(true, l.sets.length ? l.sets.map(setLine).join('') : note(esc(L('No class sets yet — create one (of the set on screen, or of a kind).', 'クラスのセットはまだありません。create で作れます（表示中のセットか、種類を指定）。'))),
        { meta: { classSets: l.sets.map((x) => ({ code: x.code, kind: x.kind, n: x.n, title: x.title || '', open: x.open, answered: x.answered, created_at: x.created_at })) } });
    },
  },
];
