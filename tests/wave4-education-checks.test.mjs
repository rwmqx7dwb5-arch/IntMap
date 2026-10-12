/* ============================================================================
 *  wave4-education — CLASS SETS: a learn quest given to a class, whose students' answers reach the teacher
 * ----------------------------------------------------------------------------
 *    ① the numbers the table holds are the engine's (kinds, set lengths), the name ceiling is one number in three
 *       places, and the code's alphabet is one alphabet in the database and the page
 *    ② an answer travels raw and comes back as the answer the engine scores (a skip is null; the longitude is
 *       brought into [−180, 180]; three decimals lose less than one point)
 *    ③ the TALLY scores every hand-in with the engine it is given — over questions the engine really makes from
 *       the shipped data — and names the hardest question, the means and medians; a short hand-in is flagged
 *    ④ the CSV has one row per student and two columns per question, every field quoted
 *    ⑤ the class link round-trips (its quest is an ordinary challenge link; the code is read back)
 *    ⑥ nothing scored is stored or sent: the panel hands in its raw answers and the board scores with the panel's
 *       own questions and engine; neither module is on the start-up path, and neither publishes a global
 *    ⑦ the database: the students' two doors are the only anon doors, each says why in «ANON MAY CALL:», no table
 *       grants anon anything, and the purge's 365 days are the Privacy Policy's 365 days in both languages
 *    ⑧ Atlas: learn.class is registered, its schema's actions are the actions its run answers
 *  supabase/tests/39_class_quest_test.sql holds the database to the same behaviour.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { importModule } from './helpers/import-module.mjs';
import { parseSource } from './helpers/ast.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { makeQuestEngine, QUEST_KIND_IDS, QUEST_DATA, QUEST_MAX, SET_LENGTHS, DAILY_N, questFromSearch } from '../js/quest-engine.js';
import * as CLASS from '../js/quest-class.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const rel = (abs) => relative(ROOT, abs).replace(/\\/g, '/');
const MIG = read('supabase/migrations/20261013090000_class_quest.sql');

/* the map's geodesy, evaluated as the classic script it is — the engine the panel builds */
const W = {}; new Function('window', read('js/geodesy.js'))(W);
const G = W.IntMapGeodesy;
const engine = makeQuestEngine({ distanceKm: (a, b) => G._distKm(a, b), halfCircumferenceKm: G._HALF_CIRCUM });
const DATA = {
  gazetteer: JSON.parse(gunzipSync(readFileSync(join(ROOT, QUEST_DATA.gazetteer))).toString('utf8')),
  onThisDay: JSON.parse(read(QUEST_DATA.onThisDay)),
};

test('wave4-education ① the table holds the engine\'s numbers; the name ceiling and the code alphabet are one each', () => {
  const kinds = /kind\s+text\s+not null check \(kind in \(([^)]*)\)\)/.exec(MIG);
  assert.ok(kinds, 'class_sets.kind has no CHECK');
  assert.deepEqual(kinds[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1)).sort(), [...QUEST_KIND_IDS].sort(), 'the kinds the table takes are the engine\'s');
  const ns = /n\s+smallint\s+not null check \(n in \(([^)]*)\)\)/.exec(MIG);
  assert.ok(ns, 'class_sets.n has no CHECK');
  assert.deepEqual(ns[1].split(',').map((s) => +s.trim()), [...SET_LENGTHS], 'the lengths the table takes are the panel\'s (SET_LENGTHS)');
  assert.equal(SET_LENGTHS[0], DAILY_N, 'the shorter length is the day\'s set');
  /* the panel offers exactly SET_LENGTHS — read from the list, not written twice */
  assert.match(read('js/quest-panel.js'), /SET_LENGTHS\.map\(\(v\) => '<option value="/, 'the panel\'s «Questions per set» is SET_LENGTHS');
  /* the name: the table's CHECK, the RPC's own test and the page */
  assert.match(MIG, new RegExp('char_length\\(name\\) between 1 and ' + CLASS.CLASS_NAME_MAX + ' '), 'the table\'s name CHECK is CLASS_NAME_MAX');
  assert.match(MIG, new RegExp('char_length\\(v_name\\) > ' + CLASS.CLASS_NAME_MAX + ' then'), 'class_set_submit\'s name test is CLASS_NAME_MAX');
  /* the code: the same alphabet in the CHECK, in the generator and in the page */
  const abc = /v_abc\s+constant text := '([A-Z0-9]+)'/.exec(MIG)[1];
  assert.equal(abc.length, 32, '32 symbols, so a byte mod 32 is uniform');
  assert.equal(new Set(abc).size, 32);
  for (const c of abc) assert.ok(CLASS.CLASS_CODE_RE.test(c.repeat(8)), c + ' is drawn by the database but refused by the page');
  for (const c of 'O0I1') assert.ok(!abc.includes(c), c + ' is easily misread and must not be in the code');
  assert.match(MIG, /code ~ '\^\[A-HJ-NP-Z2-9\]\{8\}\$'/, 'the table\'s CHECK is the page\'s CLASS_CODE_RE');
  assert.equal(String(CLASS.CLASS_CODE_RE), '/^[A-HJ-NP-Z2-9]{8}$/');
});

test('wave4-education ② an answer travels raw and comes back as the answer the engine scores', () => {
  assert.deepEqual(CLASS.encodeAnswer('where', { lng: 139.69171, lat: 35.6895 }), [139.692, 35.69]);
  assert.deepEqual(CLASS.encodeAnswer('where', { lng: 200, lat: 10 }), [-160, 10], 'a map scrolled round the world reports 200° for −160°');
  assert.deepEqual(CLASS.encodeAnswer('where', { lng: -200, lat: 10 }), [160, 10]);
  assert.deepEqual(CLASS.encodeAnswer('where', { lng: 180, lat: 0 }), [180, 0]);
  assert.equal(CLASS.encodeAnswer('where', null), null, 'a skip is null');
  assert.equal(CLASS.encodeAnswer('where', { lng: 0, lat: 95 }), null);
  assert.equal(CLASS.encodeAnswer('when', { year: 1945.4 }), 1945);
  assert.equal(CLASS.encodeAnswer('when', null), null);
  assert.deepEqual(CLASS.decodeAnswer('where', [139.692, 35.69]), { lng: 139.692, lat: 35.69 });
  assert.deepEqual(CLASS.decodeAnswer('when', 1945), { year: 1945 });
  assert.equal(CLASS.decodeAnswer('when', [1, 2]), null, 'a shape of the other kind is not an answer');
  assert.equal(CLASS.decodeAnswer('where', 1945), null);
  /* three decimals: the score changes by less than one point (the claim js/quest-class.js makes) */
  const qs = engine.generate('where', 'w4edu', 5, DATA);
  for (const q of qs) {
    const a = { lng: q.at[0] + 0.0004, lat: q.at[1] - 0.0004 };
    const direct = engine.score(q, a).points, travelled = engine.score(q, CLASS.decodeAnswer('where', CLASS.encodeAnswer('where', a))).points;
    assert.ok(Math.abs(direct - travelled) <= 1, q.name.en + ': ' + direct + ' vs ' + travelled);
  }
});

test('wave4-education ③ the tally scores every hand-in with the engine, and names the hardest question', () => {
  const qs = engine.generate('where', 'w4edu', 5, DATA);
  assert.equal(qs.length, 5);
  const far = (q) => [q.at[0] > 0 ? q.at[0] - 90 : q.at[0] + 90, 0];
  const rows = [
    { id: 1, name: 'Aiko', created_at: '2026-10-13T01:00:00Z', answers: qs.map((q) => CLASS.encodeAnswer('where', { lng: q.at[0], lat: q.at[1] })) },
    { id: 2, name: 'Ben', created_at: '2026-10-13T01:01:00Z', answers: qs.map((q, i) => (i === 3 ? null : CLASS.encodeAnswer('where', { lng: q.at[0] + 1, lat: q.at[1] }))) },
    /* everyone is far away on question 5 */
    { id: 3, name: 'Chen', created_at: '2026-10-13T01:02:00Z', answers: qs.map((q, i) => CLASS.encodeAnswer('where', i === 4 ? { lng: far(q)[0], lat: far(q)[1] } : { lng: q.at[0], lat: q.at[1] + 0.5 })) },
  ];
  rows[0].answers[4] = CLASS.encodeAnswer('where', { lng: far(qs[4])[0], lat: far(qs[4])[1] });
  rows[1].answers[4] = CLASS.encodeAnswer('where', { lng: far(qs[4])[0], lat: far(qs[4])[1] });
  const T = CLASS.tally(engine, qs, rows);
  assert.equal(T.count, 3); assert.equal(T.n, 5); assert.equal(T.max, 5 * QUEST_MAX);
  /* every score is the engine's own on the decoded answer */
  for (const s of T.students) {
    const r = rows.find((x) => x.name === s.name);
    s.scores.forEach((v, i) => assert.equal(v, engine.score(qs[i], CLASS.decodeAnswer('where', r.answers[i])).points, s.name + ' Q' + (i + 1)));
    assert.equal(s.total, s.scores.reduce((a, b) => a + b, 0));
    assert.equal(s.mismatch, false);
  }
  assert.deepEqual(T.students.map((s) => s.total), T.students.map((s) => s.total).slice().sort((a, b) => b - a), 'the students are in order of total');
  assert.equal(T.hardest, 4, 'the question everyone was far from is the hardest');
  assert.equal(T.questions[3].skipped, 1, 'Ben skipped question 4');
  assert.equal(T.questions[3].answered, 2);
  assert.ok(T.questions[4].medianKm > 5000, 'the hardest question\'s median distance is the far one');
  assert.equal(T.meanTotal, Math.round(T.students.reduce((a, s) => a + s.total, 0) / 3));
  /* a hand-in made against another build of the data (another number of answers) is flagged, not padded silently */
  const short = CLASS.tally(engine, qs, [{ id: 9, name: 'Old', answers: [null, null] }]);
  assert.equal(short.students[0].mismatch, true);
  /* nobody has handed in: no hardest question, no mean — not a mean of 0 */
  const none = CLASS.tally(engine, qs, []);
  assert.equal(none.hardest, null); assert.equal(none.meanTotal, null);
  /* a year set over the real day index: the exact answers are counted, the median year is read back */
  const ws = engine.generate('when', 'w4edu', 5, DATA);
  const Y = CLASS.tally(engine, ws, [
    { id: 1, name: 'a', answers: ws.map((q) => q.year) },
    { id: 2, name: 'b', answers: ws.map((q) => q.year + 10) },
    { id: 3, name: 'c', answers: ws.map((q) => q.year + 2) },
  ]);
  Y.questions.forEach((x, i) => { assert.equal(x.exact, 1); assert.equal(x.medianOff, 2); assert.equal(x.medianYear, ws[i].year + 2); });
});

test('wave4-education ④ the CSV: one row per student, two columns per question, every field quoted', () => {
  const qs = engine.generate('where', 'w4edu', 5, DATA);
  const T = CLASS.tally(engine, qs, [{ id: 1, name: 'A "quoted", name', created_at: '2026-10-13T01:00:00Z', answers: qs.map(() => null) }]);
  for (const lang of ['en', 'jp']) {
    const csv = CLASS.classCsv(qs, T, lang);
    const lines = csv.split('\r\n').filter(Boolean);
    assert.equal(lines.length, 2);
    const cells = (l) => l.match(/"(?:[^"]|"")*"/g);
    assert.equal(cells(lines[0]).length, 3 + 2 * qs.length);
    assert.equal(cells(lines[1]).length, 3 + 2 * qs.length);
    assert.equal(cells(lines[1])[0], '"A ""quoted"", name"', 'a quote in a name is doubled');
  }
});

test('wave4-education ⑤ the class link: an ordinary challenge link with the code', () => {
  const q = CLASS.classQuery('when', 'd2026-10-13', 5, 'K7M2P9QX');
  assert.deepEqual(questFromSearch(q), { kind: 'when', seed: 'd2026-10-13', n: 5 }, 'the quest part is a challenge link');
  assert.equal(CLASS.classCodeFromSearch(q), 'K7M2P9QX');
  assert.equal(CLASS.classCodeFromSearch('?quest=when.x.5&class=k7m2p9qx'), 'K7M2P9QX', 'a code typed in lower case is the same code');
  assert.equal(CLASS.classCodeFromSearch('?quest=when.x.5&class=K7M2P9Q0'), null, '0 is not in the alphabet');
  assert.equal(CLASS.classCodeFromSearch('?quest=when.x.5'), null);
  assert.ok(CLASS.classable('where', 'abc', 10));
  assert.ok(!CLASS.classable('where', 'abc', 7), 'a length the panel does not offer');
  assert.ok(!CLASS.classable('flags', 'abc', 5));
  assert.ok(!CLASS.classable('where', 'a b', 5));
  assert.equal(CLASS.cleanName('  Aiko '), 'Aiko');
  assert.equal(CLASS.cleanName('   '), null);
  assert.equal(CLASS.cleanName('x'.repeat(CLASS.CLASS_NAME_MAX + 1)), null);
  /* src/main.js already boots the panel for any `?quest=` — the class link needs no door of its own */
  assert.match(read('src/main.js'), /\[\?&\]quest=/);
});

function staticClosure(entry) {
  const seen = new Set(), stack = [join(ROOT, entry)];
  while (stack.length) {
    let f = stack.pop();
    if (!/\.(m?js|ts)$/.test(f)) f += '.js';
    if (seen.has(f) || !existsSync(f)) continue;
    seen.add(f);
    const ast = parseSource(readFileSync(f, 'utf8'), { sourceType: 'module', orNull: true });
    if (!ast) continue;
    for (const n of ast.body) {
      const src = (n.type === 'ImportDeclaration' || ((n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source)) ? n.source.value : null;
      if (src && /^\.\.?\//.test(src)) stack.push(resolve(dirname(f), src));
    }
  }
  return new Set([...seen].map(rel));
}

test('wave4-education ⑥ nothing scored travels; the board scores with the panel\'s own questions and engine; both load on demand', () => {
  const panel = codeOnly(read('js/quest-panel.js')), board = codeOnly(read('js/quest-class-board.js')), cls = codeOnly(read('js/quest-class.js'));
  assert.match(panel, /Q\.answers\[Q\.i\] = a;/, 'the panel keeps the raw answer of every question');
  assert.match(panel, /CLASS\.encodeAnswer\(q\.kind, set\.answers\[i\]\)/, 'the hand-in is the raw answers');
  assert.doesNotMatch(cls.slice(cls.indexOf('export async function submitClassAnswers')), /points|scores/, 'no score is sent');
  for (const t of ['class_sets', 'class_set_answers']) {
    const cols = new RegExp('create table if not exists public\\.' + t + ' \\(([\\s\\S]*?)\\r?\\n\\);').exec(MIG);
    assert.ok(cols, t + ' is not created');
    assert.doesNotMatch(cols[1], /\bscores?\b|\bpoints\b/, t + ' holds a score');
  }
  assert.match(board, /import \{ questionsOf, questLink, freshSeed \} from '\.\/quest-panel\.js'/, 'the board asks the panel for the questions and the engine');
  assert.match(board, /CLASS\.tally\(cur\.engine, cur\.qs, r\.rows\)/, 'the board tallies with that engine');
  assert.match(panel, /export async function questionsOf[\s\S]{0,400}engine\.generate\(kind, String\(seed\), n, await need\(kind\)\), engine/, 'questionsOf hands out the panel\'s own engine');
  const eager = staticClosure('src/main.js');
  assert.ok(eager.has('js/app-body.js') && eager.size > 150, 'the entry graph was not read (' + eager.size + ')');
  for (const f of ['js/quest-class.js', 'js/quest-class-board.js']) assert.ok(!eager.has(f), f + ' is in the boot graph');
  assert.match(panel, /await import\('\.\/quest-class-board\.js'\)/, 'the panel opens the board by import()');
  for (const [f, src] of [['js/quest-class.js', cls], ['js/quest-class-board.js', board]]) {
    assert.doesNotMatch(src, /window\.[A-Za-z_$]+\s*=[^=]/, f + ' assigns a window global');
    assert.doesNotMatch(src, /\bsetInterval\(/, f + ' runs its own timer (the runtime\'s everyTick is the one)');
  }
  assert.match(board, /everyTick\('quest-class-board', BOARD_REFRESH_MS/, 'the board refreshes on the runtime\'s timer');
  assert.match(board, /stopTick\(tick\)/, 'and stops it');
});

test('wave4-education ⑦ the database: two anon doors, each saying why; no table opened to anon; 365 days in the policy', () => {
  const grantsAnon = [...MIG.matchAll(/grant\s+([^;]*?)\s+to\s+([^;]*);/gi)].filter((m) => /\banon\b/.test(m[2]));
  assert.deepEqual(grantsAnon.map((m) => (/on function public\.([a-z_]+)/.exec(m[1]) || [, 'TABLE:' + m[1]])[1]).sort(), ['class_set_open', 'class_set_submit'],
    'anon is granted exactly the two student doors, and no table');
  for (const fn of ['class_set_open(text)', 'class_set_submit(text, text, jsonb)']) {
    const c = new RegExp("comment on function public\\." + fn.replace(/[()]/g, '\\$&') + " is\\s+'((?:[^']|'')*)'").exec(MIG);
    assert.ok(c, fn + ' has no comment');
    assert.match(c[1], /ANON MAY CALL: \S/, fn + ' does not say why anon may call it (supabase/tests/11_definer_execute_test.sql)');
  }
  assert.match(MIG, /revoke all on table public\.class_sets from public, anon, authenticated, service_role;/);
  assert.match(MIG, /revoke all on table public\.class_set_answers from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(MIG, /grant [^;]*insert[^;]* on table public\.class_set_answers to authenticated/i, 'a hand-in is written only through class_set_submit');
  const days = /cron\.schedule\('class-sets-purge', '[^']+', 'select public\.purge_class_sets\((\d+)\)'\)/.exec(MIG);
  assert.ok(days, 'the purge is scheduled');
  const legal = read('js/legal-text.js');
  assert.ok(legal.includes('deleted ' + days[1] + ' days after the set was made'), 'the English Privacy Policy states the purge\'s days');
  assert.ok(legal.includes('セットを作ってから ' + days[1] + ' 日後に削除'), 'the Japanese Privacy Policy states the purge\'s days');
  assert.match(MIG, new RegExp("'Deleted, with every answer handed in under it, " + days[1] + ' days after the set was made'), 'the account catalogue states the same days');
  assert.match(legal, /<b>Class sets \(students\)\.<\/b>/); assert.match(legal, /<b>クラスのセット（生徒）<\/b>/);
});

test('wave4-education ⑧ Atlas: learn.class is registered, and its schema\'s actions are the actions its run answers', async () => {
  const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js');
  const CAPS = makeAtlasCapabilities({ lang: 'en' });
  assert.ok(CAPS.resolve('learn.class'), 'learn.class is not registered');
  assert.equal(CAPS.resolve('classSet').id, 'learn.class', 'the dispatch spelling resolves');
  const { default: entries } = await import('../js/atlas-cap-learn.js');
  const e = entries.find((x) => x.row[0] === 'learn.class');
  const actions = e.schema().properties.action.enum;
  const run = String(e.run);
  for (const a of actions.filter((x) => x !== 'list')) assert.ok(run.includes("act === '" + a + "'"), 'the run does not answer «' + a + '»');
  const doc = e.doc.map((d) => String(d.text)).join(' ');
  for (const a of actions) assert.ok(doc.includes('"' + a + '"'), 'the catalogue does not name «' + a + '»');
  assert.match(doc, /クラスのセット/);
});

/* ── review fixes ───────────────────────────────────────────────────────────────────────────────── */
test('wave4-education ⑨ a name a spreadsheet would run as a formula is written as text', () => {
  const qs = engine.generate('where', 'w4edu', 5, DATA);
  const names = ['=HYPERLINK("http://x","y")', '+1', '-1', '@SUM(A1)', '\tx', '\rx', 'Aiko'];
  const T = CLASS.tally(engine, qs, names.map((name, id) => ({ id, name, created_at: '2026-10-13T01:00:00Z', answers: qs.map(() => null) })));
  const rows = CLASS.classCsv(qs, T, 'en').split('\r\n').slice(1).filter(Boolean);
  const first = (l) => l.match(/^"((?:[^"]|"")*)"/)[1].replace(/""/g, '"');
  const got = new Map(rows.map((l) => [first(l).replace(/^'/, ''), first(l)]));
  for (const n of names.slice(0, -1)) assert.equal(got.get(n), "'" + n, JSON.stringify(n) + ' is not guarded');
  assert.equal(got.get('Aiko'), 'Aiko', 'an ordinary name is unchanged');
  /* numbers stay numbers: a total is not prefixed */
  assert.match(rows[0], /^"[^"]*","[^"]*","\d+"/);
});

test('wave4-education ⑩ Atlas reads a set with its own host — the board need never have been opened', () => {
  const board = codeOnly(read('js/quest-class-board.js'));
  const body = board.slice(board.indexOf('export async function readSet(code, host)'));
  assert.ok(body.length > 30, 'readSet takes the caller\'s host');
  const fn = body.slice(0, body.indexOf('\n}\n') + 2);
  assert.doesNotMatch(fn, /\bHOST\b/, 'readSet reads the board\'s own HOST, which only openBoard() sets');
  assert.match(codeOnly(read('js/atlas-cap-learn.js')), /B\.readSet\(code, HOST\)/, 'Atlas hands readSet its host');
});

test('wave4-education ⑪ hand-ins are paced by the shared bucket, and the teacher can close and clear a set in one act', async () => {
  const fn = MIG.slice(MIG.indexOf('create or replace function public.class_set_submit'), MIG.indexOf('comment on function public.class_set_submit'));
  const take = fn.indexOf("public.relay_take('class-answer', v_set.id::text,");
  assert.ok(take > 0, 'class_set_submit takes from the repository\'s one shared bucket (relay_take), keyed by the set');
  assert.ok(take > fn.indexOf("'invalid'") && take < fn.indexOf('insert into public.class_set_answers'), 'only a well-formed try takes a token, and it is taken before the row is written');
  assert.match(fn, /'error', 'busy'/);
  assert.equal([...MIG.matchAll(/create table if not exists/g)].length, 2, 'no bucket of its own: the two tables and nothing else');
  assert.ok(CLASS.classFailureText('busy', 'en') !== CLASS.classFailureText('failed', 'en'), '«busy» has its own words');
  assert.match(read('js/quest-panel.js'), /const RESENDABLE = \[[^\]]*'busy'/, 'a student told «busy» can hand in again');
  /* clearClassAnswers closes FIRST, then deletes every hand-in of the set */
  const calls = [];
  const chain = (table) => {
    const c = { op: null, table, filters: [] };
    const api = {
      update(v) { c.op = 'update:' + JSON.stringify(v); return api; },
      delete() { c.op = 'delete'; return api; },
      eq(k, v) { c.filters.push(k + '=' + v); return api; },
      select() { calls.push(c.table + ' ' + c.op + ' ' + c.filters.join('&')); return Promise.resolve({ data: c.op === 'delete' ? [{ id: 1 }, { id: 2 }] : [{ id: 'S', open: false }], error: null }); },
    };
    return api;
  };
  const r = await CLASS.clearClassAnswers({ from: chain }, 'S');
  assert.deepEqual(calls, ['class_sets update:{"open":false} id=S', 'class_set_answers delete set_id=S']);
  assert.deepEqual(r, { ok: true, closed: true, removed: 2 });
  assert.match(codeOnly(read('js/quest-class-board.js')), /CLASS\.clearClassAnswers\(HOST && HOST\.DB, s\.id\)/, 'the board offers it');
});
