/* ============================================================================
 *  watch-account-product — TODAY'S QUEST: the day's set, the streak, and where a result is kept
 * ----------------------------------------------------------------------------
 *    ① the seed says the day: a real calendar day round-trips, 30 February is not a day, and «today's set» has one test
 *    ② a day's year set asks first what the record dates on that day, everyone gets the same set — and a seed that is
 *       not a day still gives exactly the questions it gave before the day's set existed (old challenge links)
 *    ③ the streak: runs back from today, or from yesterday while today is still open; month ends and leap days
 *    ④ the store, RUN over a fake browser and a fake account: the first finish stands; signed out keeps the browser;
 *       signed in writes the account; «already» is not a failure; a failed account read is not an empty history;
 *       the browser's days reach the account; a history longer than one page is read whole
 *    ⑤ the table holds the engine's numbers (5 scores, 0–1000, the kinds), has no UPDATE door, explains itself in the
 *       catalogue, and its pgTAP file and the structure test name it
 *    ⑥ the doors: the panel's menu and result, the account sheet, Atlas (learn.daily), all by import(); nothing on boot
 *    ⑦ the Privacy Policy says what is kept, in both languages
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importModule } from './helpers/import-module.mjs';
import { parseSource } from './helpers/ast.mjs';
import {
  makeQuestEngine, QUEST_KIND_IDS, QUEST_MAX, DAILY_N, whenEvents, rngFor,
  dailySeed, dailyOf, parseDay, dayOf, isDailySet, addDays, dailyStreak, questFromSearch, questQuery,
} from '../js/quest-engine.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const rel = (abs) => relative(ROOT, abs).replace(/\\/g, '/');
const IDX = JSON.parse(read('data/on-this-day.json'));
const engine = makeQuestEngine({});

test('watch-account-product ① the seed says the day', () => {
  assert.equal(dailySeed('2026-10-08'), 'd2026-10-08');
  assert.deepEqual(dailyOf('d2026-10-08'), { day: '2026-10-08', md: '10-08' });
  assert.deepEqual(dailyOf('d2028-02-29'), { day: '2028-02-29', md: '02-29' }, 'a leap day is a day');
  for (const bad of ['d2026-02-29', 'd2026-02-30', 'd2026-13-01', 'd2026-10-8', 'class7b', '', null]) assert.equal(dailyOf(bad), null, String(bad) + ' is not a day');
  assert.equal(dailySeed('2026-02-30'), null);
  assert.equal(dayOf(new Date(2026, 9, 8, 23, 59)), '2026-10-08', 'the reader\'s calendar day, from the local fields');
  /* a day's set is an ordinary challenge link — the existing link reader takes it */
  assert.deepEqual(questFromSearch(questQuery('when', dailySeed('2026-10-08'), DAILY_N)), { kind: 'when', seed: 'd2026-10-08', n: DAILY_N });
  assert.ok(isDailySet('when', 'd2026-10-08', DAILY_N, '2026-10-08'));
  assert.ok(!isDailySet('when', 'd2026-10-07', DAILY_N, '2026-10-08'), 'yesterday\'s link today is a challenge, not today\'s set');
  assert.ok(!isDailySet('when', 'd2026-10-08', 10, '2026-10-08'), 'ten questions of today\'s seed is not today\'s set');
  assert.ok(!isDailySet('flags', 'd2026-10-08', DAILY_N, '2026-10-08'), 'a kind the engine does not have');
  assert.equal(DAILY_N, 5);
});

test('watch-account-product ② a day\'s year set opens on that day; a seed that is not a day is untouched', () => {
  const pool = whenEvents(IDX);
  const byMd = new Map(); pool.forEach((e) => byMd.set(e.md, (byMd.get(e.md) || 0) + 1));
  /* a day the record has several askable events on, found from the data rather than named */
  const rich = [...byMd.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.ok(rich && rich[1] >= 3, 'some day has at least three askable events (' + (rich && rich[1]) + ')');
  const day = '2027-' + rich[0];
  if (!parseDay(day)) return;   /* 02-29 has no 2027 */
  const a = engine.generate('when', dailySeed(day), DAILY_N, { onThisDay: IDX }), b = engine.generate('when', dailySeed(day), DAILY_N, { onThisDay: IDX });
  assert.equal(a.length, DAILY_N);
  assert.deepEqual(a, b, 'everyone gets the same set that day');
  const first = Math.min(DAILY_N, rich[1]);
  assert.ok(a.slice(0, first).every((q) => q.md === rich[0]), 'the first ' + first + ' questions are that day\'s');
  assert.equal(new Set(a.map((q) => q.md + '/' + q.k)).size, DAILY_N, 'no question twice');
  /* the same calendar day of another year is another set (the seed holds the year) */
  const c = engine.generate('when', dailySeed('2028-' + rich[0]), DAILY_N, { onThisDay: IDX });
  assert.notDeepEqual(a.map((q) => q.md + '/' + q.k), c.map((q) => q.md + '/' + q.k));
  /* a day with nothing to ask still gives a full set */
  const empty = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].flatMap((m) => Array.from({ length: 28 }, (_, i) => m + '-' + String(i + 1).padStart(2, '0'))).find((md) => !byMd.has(md));
  if (empty) assert.equal(engine.generate('when', dailySeed('2027-' + empty), DAILY_N, { onThisDay: IDX }).length, DAILY_N, empty + ' has no askable event and still gets a set');
  /* an old seed: the original draw, recomputed here — a partial Fisher–Yates over the pool in the generator's order */
  for (const seed of ['class7b', 'x9', 'd2026-10']) {
    const rng = rngFor('when', seed), idx = pool.map((_, i) => i), want = [];
    for (let i = 0; i < 5; i++) { const j = i + Math.floor(rng() * (idx.length - i)); [idx[i], idx[j]] = [idx[j], idx[i]]; want.push(idx[i]); }
    assert.deepEqual(engine.generate('when', seed, 5, { onThisDay: IDX }).map((q) => q.md + '/' + q.k), want.map((j) => pool[j].md + '/' + pool[j].k), seed + ': a challenge link gives the questions it always gave');
  }
});

test('watch-account-product ③ the streak', () => {
  assert.deepEqual(dailyStreak([], '2026-10-08'), { current: 0, best: 0, playedToday: false });
  assert.deepEqual(dailyStreak(['2026-10-06', '2026-10-07'], '2026-10-08'), { current: 2, best: 2, playedToday: false }, 'today still open: yesterday keeps it');
  assert.deepEqual(dailyStreak(['2026-10-06', '2026-10-07', '2026-10-08'], '2026-10-08'), { current: 3, best: 3, playedToday: true });
  assert.deepEqual(dailyStreak(['2026-10-05', '2026-10-06'], '2026-10-08'), { current: 0, best: 2, playedToday: false }, 'a missed day ends it');
  assert.deepEqual(dailyStreak(['2026-10-31', '2026-11-01', '2026-11-01', 'nonsense'], '2026-11-01'), { current: 2, best: 2, playedToday: true }, 'a month end, a duplicate, a non-day');
  assert.equal(dailyStreak(['2028-02-28', '2028-02-29', '2028-03-01'], '2028-03-01').current, 3, 'a leap day is in the run');
  assert.equal(dailyStreak(['2026-12-31', '2027-01-01'], '2027-01-01').current, 2, 'a year end');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30', 'calendar arithmetic, not clock arithmetic');
});

/* ── ④ the store, run ──────────────────────────────────────────────────────────────────────────── */
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
/** a stand-in for the account's table under its RLS: one reader, the primary key, insert-only, PostgREST's page */
function fakeDB(opts) {
  const rows = (opts && opts.rows) || [], o = opts || {};
  const calls = { insert: 0, select: 0 };
  const q = (t) => {
    const st = { t, range: null };
    const api = {
      select() { return api; }, order() { return api; },
      range(a, b) { st.range = [a, b]; calls.select++; if (o.readError) return Promise.resolve({ data: null, error: o.readError });
        const sorted = rows.slice().sort((x, y) => (x.day < y.day ? 1 : x.day > y.day ? -1 : x.kind < y.kind ? -1 : 1));
        return Promise.resolve({ data: sorted.slice(a, Math.min(b + 1, a + 1000)).map((r) => ({ ...r, created_at: 'x' })), error: null }); },
      insert(x) { calls.insert++;
        const list = Array.isArray(x) ? x : [x];
        if (list.some((r) => rows.some((h) => h.day === r.day && h.kind === r.kind) || list.filter((z) => z.day === r.day && z.kind === r.kind).length > 1)) return Promise.resolve({ error: { code: '23505' } });
        list.forEach((r) => rows.push({ day: r.day, kind: r.kind, scores: r.scores.slice() }));
        return Promise.resolve({ error: null }); },
    };
    return api;
  };
  return { from: q, rows, calls };
}

test('watch-account-product ④ the store: first finish stands, the account follows, a failure is not an empty history', async () => {
  globalThis.localStorage = fakeStorage();
  const D = await import('../js/quest-daily.js');
  const today = D.today(), y = addDays(today, -1);
  const S = [1000, 708, 1, 0, 933];
  assert.equal(D.validScores(S), true);
  for (const bad of [[1, 2, 3, 4], [1, 2, 3, 4, 5, 6], [1001, 0, 0, 0, 0], [-1, 0, 0, 0, 0], [1.5, 0, 0, 0, 0], 'x']) assert.equal(D.validScores(bad), false, JSON.stringify(bad));

  /* signed out: the browser keeps it, the account is said to be out of reach — not a failure */
  let r = await D.recordDay(null, { day: y, kind: 'when', scores: S });
  assert.deepEqual(r, { ok: true, local: 'kept', account: 'signed_out' });
  r = await D.recordDay(null, { day: y, kind: 'when', scores: [1000, 1000, 1000, 1000, 1000] });
  assert.equal(r.local, 'already', 'a replay does not replace the first finish');
  assert.deepEqual(D.localRows(), [{ day: y, kind: 'when', scores: S }]);
  let s = await D.dailySummary(null);
  assert.equal(s.account, 'signed_out');
  assert.deepEqual(s.streak, { current: 1, best: 1, playedToday: false });
  assert.equal(s.recent.length, D.RECENT_DAYS); assert.equal(s.recent[s.recent.length - 1].day, today);
  assert.equal(s.recent[s.recent.length - 2].played, true); assert.equal(s.recent[s.recent.length - 2].points, 2642);

  /* signing in: the browser's day reaches the account; today's finish is written there */
  const DB = fakeDB();
  const host = { user: { id: 'u' }, DB };
  s = await D.dailySummary(host);
  assert.equal(s.account, 'ok'); assert.equal(s.synced, 1);
  assert.deepEqual(DB.rows, [{ day: y, kind: 'when', scores: S }], 'the browser\'s day was added to the account');
  r = await D.recordDay(host, { day: today, kind: 'where', scores: [500, 500, 500, 500, 500] });
  assert.deepEqual(r, { ok: true, local: 'kept', account: 'saved' });
  s = await D.dailySummary(host);
  assert.deepEqual(s.streak, { current: 2, best: 2, playedToday: true });
  assert.equal(s.todayKinds.where.points, 2500); assert.equal(s.todayKinds.where.max, DAILY_N * QUEST_MAX); assert.equal(s.todayKinds.when, null);
  assert.equal(s.synced, 0, 'nothing to add twice');

  /* another device finished today's year set first: this browser's finish is «already», never a failure */
  DB.rows.push({ day: today, kind: 'when', scores: [9, 9, 9, 9, 9] });
  r = await D.recordDay(host, { day: today, kind: 'when', scores: S });
  assert.deepEqual(r, { ok: true, local: 'kept', account: 'already' });
  s = await D.dailySummary(host, { sync: false });
  assert.deepEqual(s.todayKinds.when.scores, [9, 9, 9, 9, 9], 'the account\'s row is the day\'s result (the first finish across devices)');

  /* the account cannot be read: the browser's days are shown and the summary says so — not a streak of 0 */
  s = await D.dailySummary({ user: { id: 'u' }, DB: fakeDB({ readError: { code: '500' } }) });
  assert.equal(s.account, 'failed');
  assert.equal(s.streak.current, 2, 'the browser still knows two days');
  assert.match(D.dailyFailureText(s.account, 'en'), /could not be read/);
  assert.notEqual(D.dailyFailureText('signed_out', 'jp'), D.dailyFailureText('signed_out', 'en'), 'en and jp');

  /* a history longer than one page is read whole */
  const many = [];
  for (let i = 0; i < 1200; i++) many.push({ day: addDays('2026-10-08', i), kind: 'when', scores: [1, 1, 1, 1, 1] });
  const big = await D.accountRows(fakeDB({ rows: many }));
  assert.equal(big.ok, true); assert.equal(big.rows.length, 1200, 'every page was read');
});

/* ── ⑤ the table ────────────────────────────────────────────────────────────────────────────────── */
test('watch-account-product ⑤ the table holds the engine\'s numbers, has no UPDATE door, and is asserted by pgTAP', () => {
  const sql = read('supabase/migrations/20261008090000_quest_daily.sql');
  assert.match(sql, new RegExp('cardinality\\(scores\\) = ' + DAILY_N + '\\b'), 'the row holds DAILY_N scores');
  assert.match(sql, new RegExp('0 <= all \\(scores\\) and ' + QUEST_MAX + ' >= all \\(scores\\)'), 'each score is 0 … QUEST_MAX');
  const kinds = /kind in \(([^)]*)\)/.exec(sql);
  assert.ok(kinds, 'the kinds are checked');
  assert.deepEqual([...kinds[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]).sort(), [...QUEST_KIND_IDS].sort(), 'the table\'s kinds are the engine\'s');
  assert.match(sql, /enable row level security/);
  assert.doesNotMatch(sql.replace(/to service_role;/g, ''), /grant[^;]*\bupdate\b[^;]*to authenticated/i, 'no UPDATE for the reader');
  assert.doesNotMatch(sql, /grant[^;]*to anon/i, 'nothing for a signed-out reader');
  assert.match(sql, /grant insert \(day, kind, scores\) on table public\.quest_daily_results to authenticated/, 'the reader writes the day, the kind and the scores — nothing else');
  assert.match(sql, /references auth\.users\(id\) on delete cascade/, 'owned through auth.users (export and deletion find it)');
  assert.match(sql, /insert into public\.account_data_catalog[\s\S]*'quest_daily_results', 'you'/, 'the catalogue explains it');
  const pg = read('supabase/tests/30_quest_daily_test.sql');
  for (const k of ['a_again', 'a_upd', 'b_sees', 'anon_sees', 'exp_b', 'del_b', 'c_future']) assert.ok(pg.includes("'" + k + "'"), 'pgTAP asserts ' + k);
  const struct = read('supabase/tests/00_structure_test.sql');
  assert.equal((struct.match(/'quest_daily_results'/g) || []).length, 2, 'the structure test names the table in both lists');
  /* the first day the table accepts is the day this file's sets began — not before the engine had them */
  assert.match(sql, /check \(day >= date '2026-10-08'\)/);
});

/* ── ⑥ the doors ────────────────────────────────────────────────────────────────────────────────── */
function staticClosure(entry) {
  const seen = new Set(); const stack = [resolve(ROOT, entry)];
  while (stack.length) {
    const f = stack.pop(); if (seen.has(f)) continue; seen.add(f);
    if (!/\.m?js$/.test(f) || !existsSync(f)) continue;
    const ast = parseSource(readFileSync(f, 'utf8'), { sourceType: 'module', orNull: true });
    if (!ast) continue;
    for (const n of ast.body) {
      const src = (n.type === 'ImportDeclaration' || ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source)) ? n.source.value : null;
      if (src && /^\.\.?\//.test(src)) stack.push(resolve(dirname(f), src));
    }
  }
  return new Set([...seen].map(rel));
}

test('watch-account-product ⑥ the doors: the menu, the result, the account sheet and Atlas — none on the boot path', async () => {
  const eager = staticClosure('src/main.js');
  assert.ok(eager.has('js/app-body.js') && eager.size > 150, 'the entry graph was not read');
  assert.ok(!eager.has('js/quest-daily.js'), 'js/quest-daily.js is in the boot graph');
  const panel = read('js/quest-panel.js');
  assert.match(panel, /import \* as DAILY from '\.\/quest-daily\.js'/);
  assert.match(panel, /export async function openToday\(/); assert.match(panel, /export function todayLink\(/);
  assert.match(panel, /'<div class="qst-today" id="qst-today">' \+ todayHTML\(summary\)/, 'the menu opens on today');
  assert.match(panel, /if \(Q\.daily && !Q\.daily\.practice\) recordToday\(Q\)/, 'the first finish is recorded');
  assert.match(panel, /isDailySet\(kind, seed, n, day\)/, 'every door (menu, Atlas, a link) is judged by the one test');
  const auth = read('js/auth-ui.js');
  assert.match(auth, /id="acct-daily"/);
  assert.match(auth, /getElementById\('acct-daily'\)\.onclick=\(\)=>\{ _acctClose\(\); import\('\.\/quest-panel\.js'\)\.then\(M=>M\.openQuest\(\)\)/, 'the account sheet opens the menu');
  assert.match(auth, /import\('\.\/quest-daily\.js'\)\.then\(M=>M\.dailySummary\(HOST\)\)/, 'the account sheet says the streak');
  /* Atlas */
  const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js');
  const CAPS = makeAtlasCapabilities({ lang: 'en' });
  assert.ok(CAPS.resolve('learn.daily'), 'learn.daily is registered');
  assert.equal(CAPS.resolve('dailyQuest').id, 'learn.daily', 'the dispatch spelling resolves');
  const { default: entries } = await import('../js/atlas-cap-learn.js');
  const e = entries.find((x) => x.row[0] === 'learn.daily');
  const doc = e.doc.map((d) => String(d.text)).join(' ');
  for (const k of QUEST_KIND_IDS) assert.ok(doc.includes('"' + k + '"'), 'the catalogue names the kind «' + k + '»');
  assert.match(doc, /今日のクエスト/); assert.match(doc, /STREAK/); assert.match(doc, /連続/);
  assert.deepEqual(Object.keys(e.schema().properties).sort(), ['action', 'kind']);
  assert.match(e.run.toString(), /dailySummary\(HOST, \{ sync: false \}\)/, 'Atlas\'s state is a read — it does not write the account');
  assert.match(e.run.toString(), /await import\('\.\/quest-panel\.js'\)/, 'Atlas reaches the panel by import()');
});

test('watch-account-product ⑦ the Privacy Policy says what is kept, in both languages', () => {
  const legal = read('js/legal-text.js');
  assert.match(legal, /今日のクエストの記録（解いた日・クエストの種類・5 問それぞれの得点/);
  assert.match(legal, /your results on Today's quest \(the day, the quest kind and the score of each of its five questions/);
  assert.match(legal, /今日のクエストの記録は、アカウントを削除するまで保持します/);
  assert.match(legal, /Today's quest results are kept until you delete your account/);
});
