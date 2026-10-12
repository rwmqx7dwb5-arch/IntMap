/* ============================================================================
 *  IntMap · js/news-edition-core.js — THE ARITHMETIC OF THE DAY'S EDITION  (wave4-news)
 * ----------------------------------------------------------------------------
 *  «Today on the map» reads the news collection (public.news_events) as ONE EDITION: the events reported during a
 *  window — the 24 hours up to the master clock's instant, or one UTC day of the archive — ranked by how many
 *  independent outlets reported them, with what is new in the window, what continues from before it, what is new
 *  since the reader last opened the edition, where it was reported from and on which topics. Measured on production
 *  (2026-10-12, anon read): the 24 hours to 17:22 UTC held 520 events (464 first reported in the window, 56
 *  continuing from before it, 83 reported by 2+ independent outlets, 42 with no place); the News list, ordered by
 *  the latest update, put the Pope's surgery (12 outlets) and the migrant boat off Djibouti (8 outlets, 139 dead)
 *  among one-outlet items, and nothing told a reader returning the next morning what had happened since.
 *
 *  ⚠ ONE RULE DECIDES WHICH EVENTS ARE IN A WINDOW: the event's reporting span — first report to latest article —
 *    overlaps it (`first_published_at < until AND last_article_at >= since`). The span is the event's own record,
 *    so the rule reads the same for today and for a day three weeks ago; `materially_updated_at` is NOT used, because
 *    a later update overwrites it and a past day would lose the events that continued through it.
 *  ⚠ ONE RULE RANKS: independent outlets, then articles, then the earlier first report, then the id — `rank()`, the
 *    same order the server is asked for (js/news-edition.js), so the first page the server returns is the top.
 *    ⚠ The counts are the event's counts TODAY: for a past day, an event that kept being reported after it ranks with
 *    the outlets it has now. The card and Atlas say so; nothing pretends to be the ranking as it stood that day.
 *  ⚠ WHAT HAS NO PLACE IS COUNTED, NOT DROPPED (the story's rule): an unplaced event is in the ranking and the counts
 *    and is said to be unplaced; a point no country contains is said to be at sea.
 *
 *  No DOM, no network, no clock of its own: node evaluates these functions on production rows
 *  (tests/wave4-news-checks.test.mjs); js/news-edition.js fetches, paints and words them.
 * ==========================================================================*/

const DAY = 86400000;

/* ⚠ EVERY NUMBER HERE SAYS WHERE IT CAME FROM AND WHAT WOULD UNMAKE IT.
   HOURS      24    an edition is a day's news: the rolling window of the live edition and the length of an archive day.
   TOP        10    the numbered list read in a minute — a choice of length, not a measurement. What it leaves out is still
                    in the edition: every event of the window is counted, drawn on the map and listed under the top.
                    Seen 2026-10-05 (619 events, 144 with 2+ outlets): the 10th had 8 independent outlets, the 11th 7.
   LIMIT      1000  rows asked for: PostgREST's max_rows (supabase/config.toml). Measured: the busiest archive day of
                    2026-09-20 … 2026-10-12 held 619 events. A window that reaches it is said to be cut («at least»).
   BACK_DAYS  7     archive days offered as chips — a week of mornings to catch up on. The collection keeps events
                    ~30 days (docs/NEWS-EVENTS.md §8); any older day is reachable by link and answers «no events».   */
export const EDITION = Object.freeze({ HOURS: 24, TOP: 10, LIMIT: 1000, BACK_DAYS: 7 });

/* The time this browser last opened the live edition — what makes «new since your last visit» (js/news-edition.js
   writes it; js/news-events.js reads it for the entry's count). One key, one spelling. */
export const SEEN_KEY = 'intmap_news_edition_seen';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** isDay('2026-10-05') — a real calendar day (2026-02-30 is not) */
export function isDay(s) {
  const m = DAY_RE.exec(String(s || '')); if (!m) return false;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return new Date(t).toISOString().slice(0, 10) === s;
}
export const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/** editionWindow(spec, nowMs) → { kind, day, sinceMs, untilMs } | null
 *    spec { day: 'YYYY-MM-DD' }  one UTC day of the archive, ending at the day's end — or at `nowMs` if the day is not
 *                                over; a day after `nowMs` is no edition (null)
 *    spec {} / { latest: true }  the HOURS up to `nowMs` (the master clock's instant: a clock set to 15 September gives
 *                                the edition as it stood then) */
export function editionWindow(spec, nowMs) {
  const s = spec || {}, now = +nowMs;
  if (!isFinite(now)) return null;
  if (s.day != null) {
    if (!isDay(s.day)) return null;
    const since = Date.parse(s.day + 'T00:00:00Z');
    if (since > now) return null;
    return { kind: 'day', day: s.day, sinceMs: since, untilMs: Math.min(since + DAY, now) };
  }
  return { kind: 'rolling', day: null, sinceMs: now - EDITION.HOURS * 3600000, untilMs: now };
}

/** backDays(nowMs, n) — the n UTC days before the day of `nowMs`, newest first (the archive chips) */
export function backDays(nowMs, n) {
  const d0 = Date.parse(dayOf(nowMs) + 'T00:00:00Z'), out = [];
  for (let i = 1; i <= (n == null ? EDITION.BACK_DAYS : n); i++) out.push(dayOf(d0 - i * DAY));
  return out;
}

/* ── the ranking ──────────────────────────────────────────────────────────────────────────────── */
const atOf = (r) => Date.parse((r && (r.first_published_at || r.first_seen_at)) || '');
const lastOf = (r) => { const t = Date.parse((r && r.last_article_at) || ''); return isFinite(t) ? t : atOf(r); };
/** rank(a, b) — the edition's order: independent outlets, articles, the earlier first report, the id */
export function rank(a, b) {
  return (b.sources - a.sources) || (b.articles - a.articles) || (a.at - b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** buildEdition(rows, { sinceMs, untilMs, seenMs, keyAt, limit, top }) — public.news_events rows read as an edition:
 *    events      every event whose reporting span overlaps the window, in rank order, each with
 *                  isNew      first reported inside the window (else it continues from `at`)
 *                  sinceSeen  first reported after `seenMs` (the reader's last visit) — only when seenMs is given
 *                  country    the country its point is in (keyAt), or null (at sea / unplaced)
 *    top         the first `top` of them, numbered
 *    counts      events · new · continuing · multiSource (2+ independent outlets) · unplaced · atSea · sinceSeen ·
 *                sinceSeenTop (how many of the top are new since the last visit)
 *    categories  [{ key, n }] most first;  countries [{ key, n }] most first
 *    cut         the server returned `limit` rows — there may be more */
export function buildEdition(rows, opts) {
  const o = opts || {};
  const since = +o.sinceMs, until = +o.untilMs;
  const seen = o.seenMs != null && isFinite(+o.seenMs) ? +o.seenMs : null;
  const keyAt = typeof o.keyAt === 'function' ? o.keyAt : null;
  const topN = o.top == null ? EDITION.TOP : Math.max(0, o.top | 0);
  const events = [];
  for (const r of rows || []) {
    const at = atOf(r); if (!r || !r.public_id || !isFinite(at)) continue;
    const last = lastOf(r);
    if (!(at < until) || !(last >= since)) continue;   /* the window rule, held here too: a row outside it is not this edition */
    const p = (r.rep_lng != null && r.rep_lat != null && isFinite(+r.rep_lng) && isFinite(+r.rep_lat)) ? [+r.rep_lng, +r.rep_lat] : null;
    events.push({ id: String(r.public_id), title: String(r.representative_title || ''), at, last, p, place: r.rep_place_name_en || '',
      cat: r.primary_category || '', sources: Math.max(1, +r.independent_source_count || 1), articles: Math.max(1, +r.article_count || 1),
      isNew: at >= since, sinceSeen: seen != null && at > seen, country: p && keyAt ? (keyAt(p[0], p[1]) || null) : null, row: r });
  }
  events.sort(rank);
  const top = events.slice(0, topN).map((e, i) => Object.assign(e, { n: i + 1 }));
  const counts = { events: events.length, new: 0, continuing: 0, multiSource: 0, unplaced: 0, atSea: 0,
    sinceSeen: seen != null ? 0 : null, sinceSeenTop: seen != null ? 0 : null };
  const cats = new Map(), ctry = new Map();
  for (const e of events) {
    if (e.isNew) counts.new++; else counts.continuing++;
    if (e.sources >= 2) counts.multiSource++;
    if (!e.p) counts.unplaced++;
    else if (keyAt && !e.country) counts.atSea++;
    if (e.sinceSeen) counts.sinceSeen++;
    if (e.cat) cats.set(e.cat, (cats.get(e.cat) || 0) + 1);
    if (e.country) ctry.set(e.country, (ctry.get(e.country) || 0) + 1);
  }
  if (seen != null) counts.sinceSeenTop = top.filter((e) => e.sinceSeen).length;
  const byN = (m) => Array.from(m, ([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : 1));
  return { sinceMs: since, untilMs: until, seenMs: seen, events, top, counts, categories: byN(cats), countries: byN(ctry),
    cut: !!(o.limit && (rows || []).length >= o.limit) };
}

/** walkOrder(edition) — the placed events of the top, in rank order: the stops of «Play the edition» */
export const walkOrder = (ed) => ((ed && ed.top) || []).filter((e) => e.p);

/* ── the address: `?edition=2026-10-05` / `?edition=latest` ─────────────────────────────────────── */
/** editionQuery(spec) → '?edition=YYYY-MM-DD' for a day, '?edition=latest' for the rolling edition (the recipient's own
    last 24 hours — what «today's news» means to whoever opens it) */
export function editionQuery(spec) {
  const s = spec || {};
  return '?edition=' + (s.day && isDay(s.day) ? s.day : 'latest');
}
/** editionFromSearch(search) → { day } | { latest: true } | null — a value that is neither a real day nor «latest» is
    not trusted (null), so a hand-edited link never opens a guessed day */
export function editionFromSearch(search) {
  let q; try { q = new URLSearchParams(String(search || '')); } catch (_) { return null; }
  if (!q.has('edition')) return null;
  const v = String(q.get('edition') || '').trim().toLowerCase();
  if (v === '' || v === 'latest' || v === 'today') return { latest: true };
  return isDay(v) ? { day: v } : null;
}

/* ── the last visit (this browser) ──────────────────────────────────────────────────────────────── */
/** readSeen(storage) → epoch ms of the last visit, or null (never opened, unreadable, or not a time) */
export function readSeen(storage) {
  try { const v = storage && storage.getItem(SEEN_KEY); const t = v == null ? NaN : +v; return isFinite(t) && t > 0 ? t : null; } catch (_) { return null; }
}
/** writeSeen(storage, ms) → true when kept. A visit never moves the mark BACKWARDS (a second tab opened on an older
    clock, a device whose clock is wrong by an hour), so «new since your last visit» cannot re-announce what was read. */
export function writeSeen(storage, ms) {
  const t = +ms; if (!isFinite(t) || t <= 0) return false;
  const prev = readSeen(storage);
  if (prev != null && prev >= t) return true;
  try { storage.setItem(SEEN_KEY, String(Math.round(t))); return true; } catch (_) { return false; }
}

/** digestLines(edition, word) — the edition as plain text lines, for a chat or a newsletter. The words are the caller's
    (`word.heading`, `word.line(e)`, `word.link`, `word.rule`), so the one rule of WHAT goes in is here. */
export function digestLines(ed, word) {
  const w = word || {};
  const out = [];
  if (w.heading) out.push(w.heading, '');
  for (const e of (ed && ed.top) || []) out.push(e.n + '. ' + (typeof w.line === 'function' ? w.line(e) : e.title));
  if (w.rule) out.push('', w.rule);
  if (w.link) out.push(w.link);
  return out;
}
