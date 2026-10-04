/* ============================================================================
 *  IntMap · js/news-story-core.js — THE ARITHMETIC OF A NEWS STORY  (news-story)
 * ----------------------------------------------------------------------------
 *  A news EVENT (docs/NEWS-EVENTS.md) is one happening as the outlets reported it inside ~48 hours; the
 *  follow-ups on later days are OTHER events. Measured on production (2026-10-03, 18,786 active events):
 *  75% of events hold one article and the span from first report to latest article is 0 h at the median,
 *  17 h at the 90th percentile — «the AfD wins the Saxony-Anhalt election» is 8 events from 6 to 21 September.
 *  A STORY is those events read as one thread: every event whose HEADLINE NAMES THE SAME WORDS, in time
 *  order, on the map and on a timeline that can be played day by day.
 *
 *  ⚠ A STORY IS A STATED QUERY, NOT A JUDGEMENT. «Headlines naming “AfD” and “victory”» is what the reader
 *    is shown and can change; IntMap never says two events ARE the same story. The words are chosen by
 *    `suggest()` from counts the server returns (public.news_story_terms) — no word list, no stop list:
 *    a word is a NAME when the headlines written in sentence case capitalise it mid-sentence (measured
 *    over the window), and a pair of words is preferred by how much more often they appear together than
 *    apart (pointwise mutual information), weighted by how many events they hold together.
 *  ⚠ THE WORDS ARE CUT BY THE SERVER ONLY (public.news_title_terms). This file never splits a headline: it
 *    passes back the spellings news_story_terms returned, so there is one matching rule, not two.
 *  ⚠ WHAT HAS NO PLACE IS COUNTED, NOT DROPPED — an event with no point is in the timeline and the list
 *    and is said to be unplaced; a point no country contains is said to be at sea.
 *
 *  No DOM, no network, no clock of its own: node evaluates these functions on production data
 *  (tests/news-next-checks.test.mjs); js/news-story.js fetches, paints and words them.
 * ==========================================================================*/

import { km } from './news-intel-core.js';

const DAY = 86400000;

/* ⚠ EVERY NUMBER HERE WAS MEASURED, AND SAYS WHAT WOULD UNMAKE IT.
   MIN_EVENTS  3     a thread of two is a pair, not a story; with 3 the measured picks (dev-notes/2026-10-03-news-next.md
                     §1, 14 production seeds) hold 3–23 events each. Re-measure if the news retention (30 days) changes.
   MAX_SHARE   0.05  a word in more than 5% of the window's headlines (says, after, new, Trump at 6.6%) names no thread:
                     at 0.05 the pairs the server computes stay under ~70 per headline (24 words max). The server is asked
                     with this value (news_story_terms p_max_share) — one number, sent, not copied.
   NAME_SHARE  0.5   «capitalised mid-sentence at least half the time» — measured: afd 30/30, german 40/40, putin 0.97,
                     state 34/140 (= 0.24, «State Department» vs «state election»), during 0. Invalid if headlines
                     stop being English (the rule reads Latin capital letters).
   NAME_MIN_OCC 2    one capitalised occurrence is a sentence start after a colon as often as a name.
   ALONE_MAX   30    a name in at most 30 of the window's events (one a day over the 30-day news retention) is a thread by itself;
                     a broader one (iran 548, ukraine 294) is narrowed by a second word. Measured on the 25 seeds of the
                     dev-note: «nino» alone holds the 19 El Niño reports, while the best pair «could + nino» kept 5 of them.
                     Re-derive if the retention changes.
   SPAN_DAYS   60    the window a story is read over, inside the server's 62-day limit (news_story, news_pulse).
   LIMIT       400   rows asked for; the widest single-name thread measured (india, 361 events in 44 days) fits. A
                     story that reaches it is said to be cut («at least»), never shown as complete. */
export const STORY = Object.freeze({ MIN_EVENTS: 3, MAX_SHARE: 0.05, ALONE_MAX: 30, NAME_SHARE: 0.5, NAME_MIN_OCC: 2, SPAN_DAYS: 60, LIMIT: 400, MAX_TERMS: 6 });

/* a word as the server spells it: lower case, letters and digits, 3–40 characters (public.news_title_terms) */
const TERM_RE = /^[\p{Ll}\p{Lo}\p{N}]{3,40}$/u;
export const isTerm = (t) => typeof t === 'string' && TERM_RE.test(t);

/** decodeTerms(json) — public.news_story_terms' answer, checked: { n, terms:[{t, df, cap, occ}], pairs:[[a, b, n]] } */
export function decodeTerms(j) {
  const o = (j && typeof j === 'object') ? j : {};
  const terms = (Array.isArray(o.terms) ? o.terms : [])
    .filter((x) => x && isTerm(x.t))
    .map((x) => ({ t: x.t, df: Math.max(0, +x.df || 0), cap: Math.max(0, +x.cap || 0), occ: Math.max(0, +x.occ || 0) }));
  const pairs = (Array.isArray(o.pairs) ? o.pairs : [])
    .filter((p) => Array.isArray(p) && isTerm(p[0]) && isTerm(p[1]) && +p[2] > 0)
    .map((p) => [p[0], p[1], +p[2]]);
  return { n: Math.max(0, +o.n || 0), terms, pairs, since: o.since || null, until: o.until || null };
}

/** isName(term) — capitalised mid-sentence in sentence-case headlines at least NAME_SHARE of the time */
const isName = (x) => !!x && x.occ >= STORY.NAME_MIN_OCC && x.cap / x.occ >= STORY.NAME_SHARE;

/** suggest(stats) → { pick, choices, chips }
 *   chips    every word of the headline another event also has (df ≥ 2), names first, the rarest first
 *   choices  the threads worth offering, best first:
 *              1. a name that is a thread by itself (MIN_EVENTS ≤ df ≤ ALONE_MAX), the rarest first
 *              2. pairs of words that hold ≥ MIN_EVENTS events together, at least one a name, by PMI × ln(1 + n)
 *              3. broader names (df > ALONE_MAX), the rarest first
 *   pick     choices[0], or null — «no thread» is an answer (a headline with no name, or names nobody else used) */
export function suggest(stats) {
  const S = stats || { n: 0, terms: [], pairs: [] };
  const N = Math.max(1, S.n);
  const by = new Map(S.terms.map((x) => [x.t, x]));
  const cap = Math.max(2, N * STORY.MAX_SHARE);
  const usable = (x) => !!x && x.df >= STORY.MIN_EVENTS && x.df <= cap;
  const pairs = [];
  for (const [a, b, n] of S.pairs) {
    const A = by.get(a), B = by.get(b);
    if (!usable(A) || !usable(B) || n < STORY.MIN_EVENTS) continue;
    if (!isName(A) && !isName(B)) continue;
    const pmi = Math.log((n * N) / (A.df * B.df));
    if (!(pmi > 0)) continue;   /* together no more often than apart: two words, not a thread */
    pairs.push({ terms: [a, b], n, kind: 'pair', score: pmi * Math.log(1 + n) });
  }
  pairs.sort((x, y) => y.score - x.score || y.n - x.n || (x.terms.join(' ') < y.terms.join(' ') ? -1 : 1));
  const singles = S.terms.filter((x) => usable(x) && isName(x))
    .map((x) => ({ terms: [x.t], n: x.df, kind: 'name', score: Math.log(N / x.df) }))
    .sort((x, y) => x.n - y.n || (x.terms[0] < y.terms[0] ? -1 : 1));
  const alone = singles.filter((x) => x.n <= STORY.ALONE_MAX), broad = singles.filter((x) => x.n > STORY.ALONE_MAX);
  const choices = alone.concat(pairs, broad);
  const chips = S.terms.filter((x) => x.df >= 2)
    .map((x) => ({ t: x.t, df: x.df, name: isName(x), common: x.df > cap }))
    .sort((x, y) => (y.name - x.name) || (x.common - y.common) || (x.df - y.df) || (x.t < y.t ? -1 : 1));
  return { pick: choices[0] || null, choices, chips };
}

/* ── the story itself ─────────────────────────────────────────────────────────────────────────── */
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const atOf = (r) => Date.parse(r.first_published_at || r.first_seen_at || r.last_article_at || '');

/** buildStory(rows, { keyAt, nameOf, limit }) — the events of one story (public.news_story rows), read as a thread:
 *    events   in the order they were first reported
 *    days     every UTC day from the first to the last, each with its events (a quiet day is a 0, not a gap)
 *    places   each representative point, the day it was first reached, and its country (keyAt) — or «at sea»
 *    spread   per day, cumulatively: places, countries, the farthest any report was from the first placed one
 *    edges    each newly reached place joined to the NEAREST place already reached — how the coverage spread
 *             across the map. ⚠ A line says «this place was reported after that one, and that one is the nearest
 *             earlier place», never «this caused that».
 *    cut      true when the server returned `limit` rows (there may be more) */
export function buildStory(rows, opts) {
  const o = opts || {};
  const keyAt = typeof o.keyAt === 'function' ? o.keyAt : () => null;
  const evs = (rows || []).filter((r) => r && r.public_id && isFinite(atOf(r))).map((r) => ({
    id: r.public_id, title: String(r.representative_title || ''), at: atOf(r),
    last: Date.parse(r.last_article_at || '') || atOf(r),
    p: (r.rep_lng != null && r.rep_lat != null && isFinite(+r.rep_lng) && isFinite(+r.rep_lat)) ? [+r.rep_lng, +r.rep_lat] : null,
    place: r.rep_place_name_en || '', cat: r.primary_category || '', sources: +r.independent_source_count || 1, articles: +r.article_count || 1, row: r,
  })).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const out = { events: evs, days: [], places: [], spread: [], edges: [], countries: [], cut: !!(o.limit && (rows || []).length >= o.limit),
    unplaced: 0, atSea: 0, multiSource: 0, firstAt: null, lastAt: null, origin: null, peak: null, farthestKm: 0 };
  if (!evs.length) return out;
  out.firstAt = evs[0].at; out.lastAt = evs.reduce((m, e) => Math.max(m, e.at), evs[0].at);
  const d0 = Date.parse(dayOf(out.firstAt) + 'T00:00:00Z'), d1 = Date.parse(dayOf(out.lastAt) + 'T00:00:00Z');
  const byDay = new Map();
  for (let t = d0; t <= d1; t += DAY) { const d = { day: dayOf(t), t, events: [] }; out.days.push(d); byDay.set(d.day, d); }
  const placeBy = new Map(), countrySeen = new Set();
  for (const e of evs) {
    byDay.get(dayOf(e.at)).events.push(e);
    if (e.sources >= 2) out.multiSource++;
    if (!e.p) { out.unplaced++; continue; }
    const k = e.p[0] + ',' + e.p[1];
    let P = placeBy.get(k);
    if (!P) {
      const ck = keyAt(e.p[0], e.p[1]) || null;
      P = { p: e.p, name: e.place, firstAt: e.at, day: dayOf(e.at), country: ck, n: 0 };
      if (out.places.length) {
        let best = out.places[0], bd = Infinity;
        for (const q of out.places) { const d = km(q.p, P.p); if (d < bd) { bd = d; best = q; } }
        if (bd >= 1) out.edges.push({ from: best.p, to: P.p, km: bd, day: P.day, fromName: best.name, toName: P.name });
      } else out.origin = P;
      out.places.push(P); placeBy.set(k, P);
      if (ck && !countrySeen.has(ck)) { countrySeen.add(ck); out.countries.push({ key: ck, day: P.day }); }
    }
    P.n++;
    if (!P.country) out.atSea++;
    e.country = P.country;
  }
  /* the spread, day by day — cumulative, so a playhead on day i shows everything reported up to day i */
  let places = 0, countries = 0, far = 0;
  const pi = out.places.slice(), ci = out.countries.slice();
  for (const d of out.days) {
    while (pi.length && pi[0].day <= d.day) { const P = pi.shift(); places++; if (out.origin) far = Math.max(far, km(out.origin.p, P.p)); }
    while (ci.length && ci[0].day <= d.day) { ci.shift(); countries++; }
    out.spread.push({ day: d.day, n: d.events.length, places, countries, farthestKm: Math.round(far) });
    if (!out.peak || d.events.length > out.peak.n) out.peak = { day: d.day, n: d.events.length };
  }
  out.farthestKm = Math.round(far);
  return out;
}

/** frameAt(story, i) — what the map shows with the playhead on day i: every event up to that day (`past`), the ones of
    that day (`now`), and the spread lines reached by then */
export function frameAt(story, i) {
  const S = story || { days: [], events: [], edges: [] };
  const k = Math.max(0, Math.min(S.days.length - 1, i | 0));
  const d = S.days[k]; if (!d) return { day: null, past: [], now: [], edges: [] };
  return { day: d.day, index: k, past: S.events.filter((e) => dayOf(e.at) < d.day), now: d.events.slice(), edges: S.edges.filter((x) => x.day <= d.day), spread: S.spread[k] };
}

/* ── when the server did not answer ──────────────────────────────────────────────────────────────── */
/** failureOf(error) → { kind, code } — WHY a read of the news collection failed, from what the failure itself carries
 *  (a PostgREST error's SQLSTATE / PGRST code, or the exception fetch threw). Measured 2026-10-04 on production: the
 *  story card said «could not be reached» for every failure, while the server had answered — with 57014, the anon
 *  statement timeout — in 3.1 s. A failure to answer is not a failure to connect, and neither is «no story».
 *    timeout      57014 (query_canceled: statement_timeout) — the server stopped counting
 *    denied       42501 (insufficient_privilege), PGRST301/302 (the key was refused)
 *    missing      42883 (no such function), 42P01 (no such table), PGRST202/205 (not in the API's schema cache)
 *    unavailable  class 08 (connection), 53 (insufficient resources), 57P (shutdown), PGRST000–003 (the API could not
 *                 reach its database) — the server answered, its database did not
 *    unreachable  no code and a fetch exception (TypeError «Failed to fetch» / «Load failed»), or no client —
 *                 nothing answered
 *    failed       anything else, with its code if it had one (a code-less error that is not a fetch exception is
 *                 NOT called unreachable — we do not know that it was) */
export function failureOf(error) {
  const e = error || {};
  const code = typeof e.code === 'string' ? e.code : (e.code != null ? String(e.code) : '');
  if (code === '57014') return { kind: 'timeout', code };
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302') return { kind: 'denied', code };
  if (code === '42883' || code === '42P01' || code === 'PGRST202' || code === 'PGRST205') return { kind: 'missing', code };
  if (/^(08|53|57P)/.test(code) || /^PGRST00[0-3]$/.test(code)) return { kind: 'unavailable', code };
  /* the three engines' words for «the request never got an answer» (Chromium, WebKit, Gecko, Node's undici), which
     supabase-js passes on as the message of a code-less error; and this page's own «there is no client to ask» */
  if (!code && (e.name === 'TypeError' || /Failed to fetch|Load failed|NetworkError|fetch failed|no database client/i.test(String(e.message || '')))) return { kind: 'unreachable', code: null };
  return { kind: 'failed', code: code || null };
}

/* ── the address: `?story=afd,victory` ─────────────────────────────────────────────────────────── */
/** storyQuery(terms) → '?story=a,b' (the words as the server spells them, so the link names the same thread) */
export function storyQuery(terms) {
  const ts = (terms || []).filter(isTerm).slice(0, STORY.MAX_TERMS);
  return ts.length ? '?story=' + ts.map(encodeURIComponent).join(',') : '';
}
/** storyFromSearch(search) → ['a', 'b'] or null — a word the server could not have written is dropped, not trusted */
export function storyFromSearch(search) {
  let q; try { q = new URLSearchParams(String(search || '')); } catch (_) { return null; }
  const raw = q.get('story'); if (!raw) return null;
  const ts = Array.from(new Set(raw.split(',').map((x) => String(x).normalize('NFKC').trim().toLowerCase()).filter(isTerm))).slice(0, STORY.MAX_TERMS);
  return ts.length ? ts : null;
}
