/* ============================================================================
 *  IntMap · CLASS RESULTS — a learn quest whose answers reach the teacher   (js/quest-class.js)   (wave4-education)
 * ----------------------------------------------------------------------------
 *  A challenge link gives a whole class the same questions; until now each student's answers stayed on their own
 *  device, so the teacher learned nothing from the set. A CLASS SET is the same link with a class code
 *  (`?quest=<kind>.<seed>.<n>&class=<code>`): a signed-in teacher makes one, the students open it with no account and
 *  type the name the teacher asks for, and their answers reach the teacher's board (js/quest-class-board.js).
 *
 *  This file is the part with no DOM: the link, the shape an answer travels in, the doors to the database
 *  (public.class_sets / public.class_set_answers — supabase/migrations/20261013090000_class_quest.sql) and the TALLY.
 *  ⚠ NO SCORE TRAVELS. The student's panel sends the raw answers; the board re-makes the questions from (kind, seed, n)
 *    and scores every answer with the one scoring rule the student's panel used (js/quest-engine.js — `engine.score`,
 *    handed in to tally()). A score sent by the student would be a second copy nobody could check.
 *  ⚠ THE FIRST HAND-IN UNDER A NAME STANDS — the database answers «name_taken» to a second one, and that is reported as
 *    what it is (.agents/rules/one-pass-or-a-reason.md), never as a failure to retry.
 *  Loaded on demand (the quest panel, the board and Atlas import() it). No window global. IntMap-authored text is
 *  en + jp (CONSTITUTION.md §7). No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { QUEST_KIND_IDS, SET_LENGTHS, SEED_RE, QUEST_MAX, questQuery } from './quest-engine.js';

/** the code a class link carries — the database draws it (32 symbols without 0/O/1/I, eight of them) */
export const CLASS_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;
/* The longest name a student may hand in under. ⚠ §4 of .agents/rules/no-ad-hoc-hardcoding.md:
     1. observation — a choice of display, not a measurement: a first name and an initial, or a class number, fits one
        row of the board on a phone.
     2. expiry      — if teachers ask for full names (which the board deliberately does not suggest).
     3. source      — this line; the table's CHECK and class_set_submit() hold the same 24, and
                      tests/wave4-education-checks.test.mjs holds the three together. */
export const CLASS_NAME_MAX = 24;
const TITLE_MAX = 80;   /* the table's CHECK on class_sets.title — the same test holds it */

/* ══ THE LINK ═════════════════════════════════════════════════════════════════════════════════════ */
/** `?…&class=<code>` read back → the code (upper-cased), or null */
export function classCodeFromSearch(search) {
  let q; try { q = new URLSearchParams(String(search || '')); } catch (_) { return null; }
  const v = String(q.get('class') || '').trim().toUpperCase();
  return CLASS_CODE_RE.test(v) ? v : null;
}
/** the query of a class set: the challenge link's own three, and the class code */
export function classQuery(kind, seed, n, code) { return questQuery(kind, seed, n) + '&class=' + encodeURIComponent(code); }
/** is (kind, seed, n) a quest a class set can be made of? — the table's CHECKs, said once in JavaScript */
export function classable(kind, seed, n) {
  return QUEST_KIND_IDS.indexOf(kind) >= 0 && SEED_RE.test(String(seed || '')) && String(seed).length <= 40 && SET_LENGTHS.indexOf(+n) >= 0;
}
/** a name as it will be kept (trimmed), or null when it cannot be */
export function cleanName(s) {
  const v = String(s == null ? '' : s).trim();
  return v.length >= 1 && v.length <= CLASS_NAME_MAX ? v : null;
}

/* ══ THE SHAPE AN ANSWER TRAVELS IN ═════════════════════════════════════════════════════════════════
   where — the tapped point as [lng, lat], three decimals (about 100 m: the score of a place question changes by
           less than one point over 100 m — 1000^(−0.1/20015) ≈ 0.99997 — so nothing the board shows is lost) and
           the longitude brought into [−180, 180] (a map scrolled round the world reports 200° for −160°);
   when  — the year, a whole number;
   a skip — null. */
const r3 = (v) => Math.round(v * 1000) / 1000;
const wrapLng = (lng) => { const w = ((lng + 180) % 360 + 360) % 360 - 180; return w === -180 && lng > 0 ? 180 : w; };
export function encodeAnswer(kind, a) {
  if (!a) return null;
  if (kind === 'where') {
    const lng = +a.lng, lat = +a.lat;
    return isFinite(lng) && isFinite(lat) && lat >= -90 && lat <= 90 ? [r3(wrapLng(lng)), r3(lat)] : null;
  }
  if (kind === 'when') { const y = Math.round(+a.year); return isFinite(y) ? y : null; }
  return null;
}
/** the stored shape back to the answer js/quest-engine.js scores ({ lng, lat } / { year } / null) */
export function decodeAnswer(kind, v) {
  if (v == null) return null;
  if (kind === 'where') return Array.isArray(v) && v.length === 2 && isFinite(+v[0]) && isFinite(+v[1]) ? { lng: +v[0], lat: +v[1] } : null;
  if (kind === 'when') return typeof v === 'number' && isFinite(v) ? { year: v } : null;
  return null;
}

/* ══ THE TALLY — every hand-in scored by the engine, and what the class did on each question ═══════════════
   `engine` is js/quest-engine.js makeQuestEngine(...) (the panel's own — js/quest-panel.js questionsOf), `qs` the
   questions it made for the set, `rows` the hand-ins [{ id, name, answers, created_at }].
   A hand-in made against a different build of the data could hold a different number of answers than `qs` has
   questions: it is scored on the questions both have, and flagged `mismatch` — never padded with zeros silently. */
const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function tally(engine, qs, rows) {
  const n = qs.length, students = [];
  (rows || []).forEach((r) => {
    const ans = Array.isArray(r.answers) ? r.answers : [];
    const results = qs.map((q, i) => engine.score(q, decodeAnswer(q.kind, ans[i])));
    const scores = results.map((x) => x.points);
    students.push({ id: r.id, name: String(r.name || ''), at: r.created_at || null, answers: ans.slice(0, n), results, scores,
      total: scores.reduce((a, b) => a + b, 0), mismatch: ans.length !== n });
  });
  students.sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name));
  const questions = qs.map((q, i) => {
    const rs = students.map((s) => s.results[i]);
    const answered = rs.filter((x) => !x.detail.skipped && !x.detail.unmeasured);
    const pts = rs.map((x) => x.points);
    const out = { i, kind: q.kind, answered: answered.length, skipped: rs.length - answered.length,
      mean: rs.length ? Math.round(pts.reduce((a, b) => a + b, 0) / rs.length) : null, best: rs.length ? Math.max.apply(null, pts) : null };
    if (q.kind === 'where') out.medianKm = median(answered.map((x) => x.detail.km));
    else { out.medianOff = median(answered.map((x) => x.detail.off)); out.exact = answered.filter((x) => x.detail.off === 0).length;
      out.medianYear = median(students.map((s) => decodeAnswer('when', s.answers[i])).filter(Boolean).map((a) => a.year)); }
    return out;
  });
  /* the question the class found hardest: the lowest mean — the one to go back over. None while nobody has handed in. */
  let hardest = null;
  questions.forEach((x) => { if (x.mean != null && (hardest == null || x.mean < questions[hardest].mean)) hardest = x.i; });
  const totals = students.map((s) => s.total);
  return { n, max: n * QUEST_MAX, count: students.length, students, questions, hardest,
    meanTotal: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null, medianTotal: median(totals) };
}

/** what a question is, in a line (the board's rows, the CSV header and Atlas read the same words) */
export function questionLabel(q, lang) {
  const jp = lang === 'jp';
  if (q.kind === 'where') return (jp ? q.name.jp : q.name.en) || q.name.en;
  return (jp ? q.text.jp : q.text.en) + ' (' + q.d + ')';
}

/* A cell a spreadsheet would read as a formula — a student typed «=HYPERLINK(…)» as their name — is kept as text: a value
   that begins with = + - @, a tab or a carriage return gets a leading apostrophe (OWASP «CSV injection»). Numbers are ours
   and are written as numbers; only text is guarded, so a negative longitude in an answer cell is text and is guarded too. */
function csvText(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
/** The tally as CSV (RFC 4180: comma-separated, every field quoted, CRLF) — one row per student: the name, when they
 *  handed in, the total, then for each question its points and what they answered (km away / years off / skipped). */
export function classCsv(qs, T, lang) {
  const L = IntMapLang.pick(() => lang);
  const q = (v) => '"' + csvText(v).replace(/"/g, '""') + '"';
  const head = [L('Name', '名前'), L('Handed in (UTC)', '提出（UTC）'), L('Total', '合計') + ' / ' + T.max];
  qs.forEach((x, i) => { head.push('Q' + (i + 1) + ' ' + L('points scored', '得点') + ' — ' + questionLabel(x, lang)); head.push('Q' + (i + 1) + ' ' + L('answer', '答え')); });
  const lines = [head.map(q).join(',')];
  T.students.forEach((s) => {
    const row = [s.name, s.at ? String(s.at).replace('T', ' ').slice(0, 19) : '', s.total];
    s.results.forEach((r, i) => {
      row.push(r.points);
      const a = decodeAnswer(qs[i].kind, s.answers[i]);
      row.push(!a ? L('skipped', 'スキップ') : qs[i].kind === 'where' ? (r.detail.km != null ? Math.round(r.detail.km) + ' km · ' : '') + a.lat + ', ' + a.lng
        : a.year + (r.detail.off != null ? ' (' + (r.detail.off === 0 ? L('exact', 'ぴったり') : r.detail.off + L(' y off', ' 年ずれ')) + ')' : ''));
    });
    lines.push(row.map(q).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

/* ══ THE DOORS ═══════════════════════════════════════════════════════════════════════════════════ */
function errOf(error) {
  const c = error && error.code;
  if (c === '42501') return 'sign_in';
  if (c === '54000') return 'rate_limited';
  if (c === '23514' || c === '22023' || c === '22P02') return 'invalid';
  if (c === '42P01' || c === 'PGRST205' || c === 'PGRST202') return 'not_deployed';
  return 'failed';
}
const SET_COLS = 'id,code,kind,seed,n,title,open,created_at';

/** A signed-in teacher makes a class set of (kind, seed, n). → { ok, set? , error? } */
export async function createClassSet(DB, o) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const kind = String(o && o.kind || ''), seed = String(o && o.seed || ''), n = Math.floor(+(o && o.n));
  if (!classable(kind, seed, n)) return { ok: false, error: 'invalid' };
  const title = String(o && o.title || '').trim().slice(0, TITLE_MAX) || null;
  try {
    const { data, error } = await DB.from('class_sets').insert({ kind, seed, n, title }).select(SET_COLS).single();
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, set: Object.assign({ answered: 0 }, data) };
  } catch (_) { return { ok: false, error: 'unavailable' }; }
}
/** The teacher's sets, newest first, each with how many have handed in. → { ok, sets?, error? } */
export async function listClassSets(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.from('class_sets').select(SET_COLS + ',class_set_answers(count)').order('created_at', { ascending: false });
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, sets: (data || []).map((s) => { const c = s.class_set_answers && s.class_set_answers[0]; const o = Object.assign({}, s, { answered: c ? +c.count || 0 : 0 }); delete o.class_set_answers; return o; }) };
  } catch (_) { return { ok: false, error: 'unavailable' }; }
}
/** Every hand-in of one of the teacher's sets (at most 400 — the table's own ceiling, under PostgREST's 1000 a page). */
export async function classAnswers(DB, setId) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.from('class_set_answers').select('id,name,answers,created_at').eq('set_id', setId).order('created_at', { ascending: true });
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, rows: data || [] };
  } catch (_) { return { ok: false, error: 'unavailable' }; }
}
/** Open or close a set for hand-ins. → { ok, open?, error? } — judged by the row the database hands back */
export async function setClassOpen(DB, setId, open) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.from('class_sets').update({ open: !!open }).eq('id', setId).select('id,open');
    if (error) return { ok: false, error: errOf(error) };
    if (!data || !data.length) return { ok: false, error: 'not_found' };
    return { ok: true, open: !!data[0].open };
  } catch (_) { return { ok: false, error: 'unavailable' }; }
}
/** Delete a whole set (its hand-ins go with it) or one hand-in. → { ok, removed, error? } */
export async function deleteClassSet(DB, setId) { return del(DB, 'class_sets', setId); }
export async function deleteClassAnswer(DB, answerId) { return del(DB, 'class_set_answers', answerId); }
/** Close a set and delete every hand-in under it (someone filled it, or took classmates' names): closed FIRST, so nothing
 *  arrives between the two. → { ok, closed, removed, error? } */
export async function clearClassAnswers(DB, setId) {
  const c = await setClassOpen(DB, setId, false);
  if (!c.ok) return { ok: false, closed: false, removed: 0, error: c.error };
  if (!DB) return { ok: false, closed: true, removed: 0, error: 'unavailable' };
  try {
    const { data, error } = await DB.from('class_set_answers').delete().eq('set_id', setId).select('id');
    if (error) return { ok: false, closed: true, removed: 0, error: errOf(error) };
    return { ok: true, closed: true, removed: (data || []).length };
  } catch (_) { return { ok: false, closed: true, removed: 0, error: 'unavailable' }; }
}
async function del(DB, table, id) {
  if (!DB) return { ok: false, removed: 0, error: 'unavailable' };
  try {
    const { data, error } = await DB.from(table).delete().eq('id', id).select('id');
    if (error) return { ok: false, removed: 0, error: errOf(error) };
    return { ok: true, removed: (data || []).length };
  } catch (_) { return { ok: false, removed: 0, error: 'unavailable' }; }
}
/** A student's link opened: what the set is. → { ok, code, kind, seed, n, title, open, answered } | { ok:false, error } */
export async function openClassSet(DB, code) {
  if (!DB) return { ok: false, error: 'unavailable' };
  if (!CLASS_CODE_RE.test(String(code || ''))) return { ok: false, error: 'not_found' };
  try {
    const { data, error } = await DB.rpc('class_set_open', { p_code: code });
    if (error) return { ok: false, error: errOf(error) };
    return data && data.ok === true ? data : { ok: false, error: (data && data.error) || 'failed' };
  } catch (_) { return { ok: false, error: 'unavailable' }; }
}
/** A student hands in. `answers` are already in the travelling shape (encodeAnswer). → { ok, answered? , error? } */
export async function submitClassAnswers(DB, code, name, answers) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const nm = cleanName(name);
  if (!nm) return { ok: false, error: 'invalid_name' };
  try {
    const { data, error } = await DB.rpc('class_set_submit', { p_code: code, p_name: nm, p_answers: answers });
    if (error) return { ok: false, error: errOf(error) };
    return data && data.ok === true ? { ok: true, answered: +data.answered || 0 } : { ok: false, error: (data && data.error) || 'failed' };
  } catch (_) { return { ok: false, error: 'unavailable' }; }
}

/** the reader's words for every answer a door can give that is not «done» */
export function classFailureText(code, lang) {
  const T = IntMapLang.pick(() => lang);
  switch (code) {
    case 'sign_in': return T('Sign in to make a class set — the answers are kept for you in your account.', 'クラス用のセットを作るにはログインしてください。答えはあなたのアカウントに届きます。');
    case 'rate_limited': return T('You have made many class sets today. Try again tomorrow, or reuse one you made.', '今日はたくさんのセットを作りました。明日もう一度試すか、作ったセットを使い回してください。');
    case 'not_found': return T('This class set was not found — it may have been deleted. You can still play the questions.', 'このクラスのセットが見つかりません（削除された可能性があります）。問題を解くことはできます。');
    case 'closed': return T('Your teacher has closed this set, so answers are no longer sent. You can still play it.', '先生がこのセットを締め切ったため、答えはもう送られません。問題を解くことはできます。');
    case 'name_taken': return T('Someone has already handed in under this name for this set. If that was not you, use a different name.', 'このセットには、この名前ですでに提出があります。あなたでなければ、別の名前にしてください。');
    case 'invalid_name': return T('Type a name of 1 to ' + CLASS_NAME_MAX + ' characters.', '名前を 1〜' + CLASS_NAME_MAX + ' 文字で入力してください。');
    case 'busy': return T('Many answers are arriving for this set right now. Wait a minute, then hand in again.', 'このセットにいま提出が集中しています。1 分ほど待ってから、もう一度提出してください。');
    case 'full': return T('This set has taken as many answers as it can.', 'このセットは受け付けられる数の答えに達しました。');
    case 'invalid': return T('These answers do not fit this set, so they were not sent.', 'この答えはセットに合わないため、送られませんでした。');
    case 'not_deployed': case 'unavailable': return T('The class results could not be reached. Check the connection and try again.', 'クラスの結果に接続できませんでした。接続を確認して、もう一度お試しください。');
    default: return T('The class results could not be read or written.', 'クラスの結果を読み書きできませんでした。');
  }
}
