/* ============================================================================
 *  IntMap · TODAY'S QUEST — the day's sets, the streak and where they are kept   (js/quest-daily.js)   (watch-account-product)
 * ----------------------------------------------------------------------------
 *  A reason to open IntMap again tomorrow. Every calendar day has its own set of each learn quest (js/quest-engine.js
 *  «THE DAY'S SET»: the seed `d<YYYY>-<MM>-<DD>`, DAILY_N questions; the year quest opens on what the record dates on
 *  that day of the year). This file keeps what the reader scored on each day's set and says how many days in a row
 *  they have played — the panel (js/quest-panel.js), the account sheet (js/auth-ui.js) and Atlas (`learn.daily`,
 *  js/atlas-cap-learn.js) all read it here, so the three cannot count a streak differently.
 *
 *  WHERE A RESULT IS KEPT — said to the reader in the panel, and in the Privacy Policy (js/legal-text.js §1 · §6):
 *    · always in THIS BROWSER (localStorage `intmap_quest_daily`), so a signed-out reader has a streak too;
 *    · and, signed in, in THE ACCOUNT (public.quest_daily_results — supabase/migrations/20261008090000_quest_daily.sql),
 *      so the streak is the same on the phone and the laptop. Days this browser played before signing in are added to
 *      the account the next time the summary is read while signed in.
 *  ⚠ THE FIRST FINISH OF A DAY'S SET IS ITS RESULT. Playing it again (the answers are known by then) is practice: the
 *    browser keeps the first, and the account has no UPDATE door at all — a second insert of the same day and kind is
 *    refused by its key and reported as «already», never as a failure (.agents/rules/one-pass-or-a-reason.md).
 *  ⚠ A STORE THAT COULD NOT BE READ IS NOT AN EMPTY HISTORY. The summary says whether the account was read
 *    (`account: 'ok' | 'signed_out' | <failure>`); a failure keeps the browser's days and says so, never a streak of 0.
 *  Loaded on demand (the panel, the account sheet and Atlas import() it). No window global. No emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { DAILY_N, QUEST_MAX, QUEST_KIND_IDS, parseDay, dayOf, addDays, dailyStreak } from './quest-engine.js';

const LOCAL_KEY = 'intmap_quest_daily';
/* How many calendar days this browser keeps. ⚠ §4 of .agents/rules/no-ad-hoc-hardcoding.md:
     1. observation — one day is ≤ 2 kinds × 5 numbers ≈ 60 bytes of JSON, so ten years is ≈ 0.2 MB of the ≈ 5 MB a
        browser gives an origin's localStorage (measured nothing; the arithmetic is the bound).
     2. expiry      — only if a day came to hold much more (another kind, longer sets).
     3. source      — this line; the account keeps every day (one row per day and kind, bounded by the calendar). */
const LOCAL_MAX_DAYS = 3660;
/** the days the panel's strip and Atlas show — one week */
export const RECENT_DAYS = 7;
const COLS = 'day,kind,scores,created_at';
/* PostgREST hands back at most `max_rows` rows a request (supabase/config.toml: 1000), so the account is read page
   by page until a short page — a long history is never cut at the first thousand and called complete. */
const PAGE = 1000;

/** today on the reader's calendar */
export const today = () => dayOf(new Date());

/** DAILY_N whole scores, each 0 … QUEST_MAX — the only shape a day's result has (the table's CHECKs say the same) */
export function validScores(s) {
  return Array.isArray(s) && s.length === DAILY_N && s.every((v) => Number.isInteger(v) && v >= 0 && v <= QUEST_MAX);
}
const validKind = (k) => QUEST_KIND_IDS.indexOf(k) >= 0;

/* ── this browser ─────────────────────────────────────────────────────────────────────────────── */
function readLocal() {
  try { const o = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); return o && typeof o === 'object' && o.days && typeof o.days === 'object' ? o : { v: 1, days: {} }; }
  catch (_) { return { v: 1, days: {} }; }
}
function writeLocal(o) {
  const keys = Object.keys(o.days).sort();
  keys.slice(0, Math.max(0, keys.length - LOCAL_MAX_DAYS)).forEach((k) => { delete o.days[k]; });
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(o)); return true; } catch (_) { return false; }
}
/** every day's result this browser holds → [{ day, kind, scores }] */
export function localRows() {
  const out = [], days = readLocal().days;
  Object.keys(days).forEach((day) => {
    if (!parseDay(day)) return;
    Object.keys(days[day] || {}).forEach((kind) => { const s = days[day][kind]; if (validKind(kind) && validScores(s)) out.push({ day, kind, scores: s.slice() }); });
  });
  return out;
}
/** keep a day's result in this browser — the first one stands. → 'kept' | 'already' | 'invalid' | 'no_storage' */
function keepLocal(day, kind, scores) {
  if (!parseDay(day) || !validKind(kind) || !validScores(scores)) return 'invalid';
  const o = readLocal();
  const d = o.days[day] || (o.days[day] = {});
  if (validScores(d[kind])) return 'already';
  d[kind] = scores.slice();
  return writeLocal(o) ? 'kept' : 'no_storage';
}

/* ── the account ──────────────────────────────────────────────────────────────────────────────── */
function errOf(error) {
  const c = error && error.code;
  if (c === '23505') return 'already';
  if (c === '42501') return 'sign_in';
  if (c === '23514' || c === '22023' || c === '22P02') return 'invalid';
  if (c === '42P01' || c === 'PGRST205') return 'not_deployed';
  return 'failed';
}
/** every day's result the account holds. → { ok, rows? , error? } */
export async function accountRows(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const rows = [];
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await DB.from('quest_daily_results').select(COLS).order('day', { ascending: false }).order('kind').range(from, from + PAGE - 1);
      if (error) return { ok: false, error: errOf(error) };
      (data || []).forEach((r) => { if (parseDay(r.day) && validKind(r.kind) && validScores(r.scores)) rows.push({ day: parseDay(r.day).day, kind: r.kind, scores: r.scores.slice() }); });
      if (!data || data.length < PAGE) break;
    }
  } catch (_) { return { ok: false, error: 'unavailable' }; }
  return { ok: true, rows };
}
/** add results to the account; a day and kind it already holds is «already», not a failure.
 *  → { ok, saved, already, error? } */
async function saveToAccount(DB, list) {
  if (!DB) return { ok: false, saved: 0, already: 0, error: 'unavailable' };
  const rows = (list || []).filter((r) => r && parseDay(r.day) && validKind(r.kind) && validScores(r.scores)).map((r) => ({ day: r.day, kind: r.kind, scores: r.scores.slice() }));
  let saved = 0, already = 0;
  try {
    /* one insert for the lot; if another device added one of them in between, the lot is refused by the key — then
       each row is tried on its own, so one «already» does not cost the others their place */
    if (rows.length > 1) {
      const { error } = await DB.from('quest_daily_results').insert(rows);
      if (!error) return { ok: true, saved: rows.length, already: 0 };
      if (errOf(error) !== 'already') return { ok: false, saved: 0, already: 0, error: errOf(error) };
    }
    for (const r of rows) {
      const { error } = await DB.from('quest_daily_results').insert(r);
      if (!error) saved++;
      else if (errOf(error) === 'already') already++;
      else return { ok: false, saved, already, error: errOf(error) };
    }
  } catch (_) { return { ok: false, saved, already, error: 'unavailable' }; }
  return { ok: true, saved, already };
}

/** Record a finished day's set: in this browser always, in the account when signed in.
 *  → { ok, local: 'kept'|'already'|'invalid'|'no_storage', account: 'saved'|'already'|'signed_out'|<failure> } */
export async function recordDay(host, r) {
  const local = keepLocal(r && r.day, r && r.kind, r && r.scores);
  if (local === 'invalid') return { ok: false, local, account: 'invalid' };
  if (!host || !host.user || !host.DB) return { ok: true, local, account: 'signed_out' };
  /* this browser already held the day's result (another tab finished first): that one is the result, and it reaches
     the account with the next summary — these scores are practice and are not written anywhere */
  if (local === 'already') return { ok: true, local, account: 'already' };
  const s = await saveToAccount(host.DB, [r]);
  return { ok: true, local, account: s.ok ? (s.saved ? 'saved' : 'already') : s.error };
}

/** What the reader has played, merged from the account and this browser, seen from today.
 *  `opts.sync` (default true): days only this browser holds are added to the account first.
 *  → { today, signedIn, account: 'ok'|'signed_out'|<failure>, synced, todayKinds: { kind: {scores, points, max}|null },
 *      streak: { current, best, playedToday }, recent: [{ day, played, points, kinds }], days } */
export async function dailySummary(host, opts) {
  const day = today(), signedIn = !!(host && host.user && host.DB);
  const local = localRows();
  let acct = { ok: false, error: 'signed_out', rows: [] }, synced = 0;
  if (signedIn) {
    acct = await accountRows(host.DB);
    if (acct.ok && !(opts && opts.sync === false)) {
      const have = new Set(acct.rows.map((r) => r.day + '|' + r.kind));
      const missing = local.filter((r) => !have.has(r.day + '|' + r.kind));
      if (missing.length) {
        const s = await saveToAccount(host.DB, missing);
        if (s.ok) { synced = s.saved; const again = await accountRows(host.DB); if (again.ok) acct = again; }
      }
    }
  }
  /* the account's row is the day's result wherever it holds one (it is the first finish across devices) */
  const by = new Map();
  local.forEach((r) => by.set(r.day + '|' + r.kind, r));
  if (acct.ok) acct.rows.forEach((r) => by.set(r.day + '|' + r.kind, r));
  const perDay = new Map();
  by.forEach((r) => { const k = perDay.get(r.day) || {}; k[r.kind] = r.scores; perDay.set(r.day, k); });
  const total = (s) => s.reduce((a, b) => a + b, 0);
  const todayKinds = {};
  QUEST_KIND_IDS.forEach((k) => { const s = (perDay.get(day) || {})[k]; todayKinds[k] = s ? { scores: s.slice(), points: total(s), max: DAILY_N * QUEST_MAX } : null; });
  const recent = [];
  for (let i = RECENT_DAYS - 1; i >= 0; i--) {
    const d = addDays(day, -i), k = perDay.get(d) || {};
    recent.push({ day: d, played: Object.keys(k).length > 0, points: Object.keys(k).reduce((a, x) => a + total(k[x]), 0), kinds: Object.keys(k).sort() });
  }
  return {
    today: day, signedIn, account: acct.ok ? 'ok' : (signedIn ? acct.error : 'signed_out'), synced,
    todayKinds, streak: dailyStreak(Array.from(perDay.keys()), day), recent, days: perDay.size,
  };
}

/** the reader's words for an account failure */
export function dailyFailureText(code, lang) {
  const T = IntMapLang.pick(() => lang);
  if (code === 'signed_out') return T('Kept in this browser only. Sign in to keep your streak on every device.', 'このブラウザにだけ記録しています。ログインすると、どの端末でも同じ連続記録になります。');
  if (code === 'not_deployed' || code === 'unavailable') return T('Your account’s record could not be reached; this browser’s days are shown.', 'アカウントの記録に接続できませんでした。このブラウザの記録を表示しています。');
  return T('Your account’s record could not be read; this browser’s days are shown.', 'アカウントの記録を読み込めませんでした。このブラウザの記録を表示しています。');
}
