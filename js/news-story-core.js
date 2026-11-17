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
 *  ⚠ THE WORDS ARE CUT BY THE SERVER ONLY (public.news_title_terms). This file never cuts a headline into the words
 *    a story is MATCHED on: it passes back the spellings news_story_terms returned, so there is one matching rule,
 *    not two. Where it COMPARES headlines with each other (the centre of an event, the lineage below) it uses the
 *    one grouper's tokeniser (supabase/functions/_shared/news-cluster.js tokenise — stems, stop words), the same
 *    rule that decided which articles are one event; it is never used to ask the server for rows.
 *
 *  ⚠⚠⚠ A SUBJECT IS NOT A THREAD (measured 2026-11-17, production, 16,891 events in 60 days). «Follow this story»
 *    from «Trump, Xi, Putin to hold historic meeting in China: White House» suggested «white + house»: the pair
 *    with the highest PMI, because the two words are one NAME. The story it opened held 45 events — the CNN
 *    ban, the ballroom, the Halloween flyover — and 1 of them was the summit. Two faults, two rules:
 *      1. A pair made only of NAMES says who or where, not what happened («white + house», «huang + jensen»).
 *         It is offered after the pairs that carry a word of what happened, never before them.
 *      2. The words must hold the event's CENTRE: a word most of the event's own headlines share (more than half
 *         of the distinct headlines of its articles). «white» and «house» are in 4 of 11; «putin» in 10,
 *         «meeting» in 9. A choice with no centre word is offered after those with one.
 *    And when the words still name a subject rather than a thread (they hold more than ALONE_MAX events), the
 *    story keeps only the events that FOLLOW from the one it was opened from (`lineage`, below): «putin» holds
 *    82 events; the 13 reachable from the summit's announcement are the summit.
 *  ⚠ WHAT HAS NO PLACE IS COUNTED, NOT DROPPED — an event with no point is in the timeline and the list
 *    and is said to be unplaced; a point no country contains is said to be at sea.
 *
 *  No DOM, no network, no clock of its own: node evaluates these functions on production data
 *  (tests/news-next-checks.test.mjs); js/news-story.js fetches, paints and words them.
 * ==========================================================================*/

import { km } from './news-intel-core.js';
import { tokenise, DEFAULTS } from '../supabase/functions/_shared/news-cluster.js';   /* the one grouper's tokeniser and its reporting window */

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
                     story that reaches it is said to be cut («at least»), never shown as complete.
   CENTRE_SHARE 0.5  a word is the event's centre when MORE than half of the distinct headlines of its articles have it
                     (a majority, not a tuned number). Measured 2026-11-17 on the summit (11 distinct headlines): putin
                     10, meeting 9, trump 11, china 6 — white 4, house 4. With fewer than 2 distinct headlines there is
                     no majority to read and every word of the one headline is central.
   LINK_SHARED 2     two events are one step of a thread when their headlines share at least two words besides the
                     story's own. Measured 2026-11-17 (production, from the summit's announcement): with ONE shared word
                     «white + house» walked through «trump» to four White House stories (Hassett, the judges, ICE, the
                     Democrats' inquiry) and «huang + jensen» kept 27 of 61; with two, the summit alone, and the 13 of
                     the resignation-to-return thread; «putin» keeps 13 of 82, joined by «trump + summit», «trump +
                     meet», «yalta + summit». Re-measure if headlines get shorter (two-word overlaps become rarer).
   LINK_GAP_H  = news-cluster DEFAULTS.timeWindowH (48 h): how long one happening keeps being reported is the step a
                     thread may take between two reports — one number, read from the grouper, not copied. A thread with
                     a silence longer than that is two threads (the summit's 9 November announcement and its 12 November
                     coverage are measured three days apart: they are not joined). */
export const STORY = Object.freeze({ MIN_EVENTS: 3, MAX_SHARE: 0.05, ALONE_MAX: 30, NAME_SHARE: 0.5, NAME_MIN_OCC: 2, SPAN_DAYS: 60, LIMIT: 400, MAX_TERMS: 6,
  CENTRE_SHARE: 0.5, LINK_SHARED: 2, LINK_GAP_H: DEFAULTS.timeWindowH });

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

/* a server word in the grouper's form (stemmed; a stop word has none) — how a word of the story is compared with headlines */
const stemOf = (t) => { const s = tokenise(String(t || '')); return s.size ? s.values().next().value : null; };
const distinct = (titles) => Array.from(new Set((titles || []).map((x) => String(x || '').trim()).filter(Boolean)));

/** centreOf(titles) → Set of the grouper's tokens that MORE than CENTRE_SHARE of the distinct headlines share, or null
 *  when there are fewer than two distinct headlines (no majority to read: every word of the one headline is central) */
export function centreOf(titles) {
  const ts = distinct(titles);
  if (ts.length < 2) return null;
  const n = new Map();
  for (const t of ts) for (const k of tokenise(t)) n.set(k, (n.get(k) || 0) + 1);
  return new Set([...n].filter(([, c]) => c > ts.length * STORY.CENTRE_SHARE).map(([k]) => k));
}

/** suggest(stats, { centre }) → { pick, choices, chips }
 *   chips    every word of the headline another event also has (df ≥ 2), names first, the rarest first
 *   choices  the threads worth offering, best first:
 *              1. a name that is a thread by itself (MIN_EVENTS ≤ df ≤ ALONE_MAX), the rarest first
 *              2. pairs of words that hold ≥ MIN_EVENTS events together, at least one a name and at least one NOT a
 *                 name, by PMI × ln(1 + n)
 *                 — or two words that are BOTH the event's centre (`centre`), named or not: «cheating + glasses» is the
 *                 thread of the AI-glasses exam scandal although neither word is a name (measured 2026-11-18, production
 *                 seed «South Korea cheating scandal»: the centre was south, korea, cheat, glasse, exam, and with only
 *                 name-holding pairs allowed the pick was «korea + south», 49 events of everything South Korean)
 *              3. pairs made only of names (who / where — «white + house»), by the same score
 *              4. broader names (df > ALONE_MAX), the rarest first
 *            and, when the event's `centre` is given (centreOf the headlines of its articles), the choices holding MORE
 *            centre words come first (`centre`: how many; in the order above among equals); a choice holding none is
 *            offered, never picked over one that holds the centre (`central`). Measured 2026-11-17: «huang + potential»
 *            (3 events, 1 centre word) came before «huang + jensen» (61, 2) — three reports of one day, against the
 *            resignation-to-return thread that `lineage` reads from the 61 (13 events).
 *            ⚠ A CHOICE WHOSE WORDS ONLY SPELL A PLACE IS NEVER PICKED (`place`). «south + korea», «white + house» name where
 *            a story happens, not what happens: they hold every report from there. Which words spell a place is asked of
 *            `opts.placeName(terms)` — js/news-story.js hands in the news geocoder (it is true when the words, in some
 *            order, ARE the located place's own name; «xi + putin» locates to Russia and is not a place). Such a choice is
 *            still offered as a chip; with nothing else, the pick is null. It is asked of pairs of names and of broad names
 *            (df > ALONE_MAX) only: a rare name by itself («shenzhen», «kerch») is a thread by the ALONE_MAX measurement, and
 *            ruling it out picked «thursday» for the Shenzhen summit (weekdays are capitalised too).
 *   pick     the first choice that is not a place, or null — «no thread» is an answer (a headline with no name, or names
 *            nobody else used) */
export function suggest(stats, opts) {
  const S = stats || { n: 0, terms: [], pairs: [] };
  const centre = (opts && opts.centre instanceof Set) ? opts.centre : null;
  const placeName = (opts && typeof opts.placeName === 'function') ? opts.placeName : null;
  const inCentre = (x) => !!centre && centre.has(stemOf(x.t));
  const N = Math.max(1, S.n);
  const by = new Map(S.terms.map((x) => [x.t, x]));
  const cap = Math.max(2, N * STORY.MAX_SHARE);
  const usable = (x) => !!x && x.df >= STORY.MIN_EVENTS && x.df <= cap;
  const pairs = [], names = [];
  for (const [a, b, n] of S.pairs) {
    const A = by.get(a), B = by.get(b);
    if (!usable(A) || !usable(B) || n < STORY.MIN_EVENTS) continue;
    if (!isName(A) && !isName(B) && !(inCentre(A) && inCentre(B))) continue;
    const pmi = Math.log((n * N) / (A.df * B.df));
    if (!(pmi > 0)) continue;   /* together no more often than apart: two words, not a thread */
    const both = isName(A) && isName(B);
    (both ? names : pairs).push({ terms: [a, b], n, kind: both ? 'names' : 'pair', score: pmi * Math.log(1 + n) });
  }
  const byScore = (x, y) => y.score - x.score || y.n - x.n || (x.terms.join(' ') < y.terms.join(' ') ? -1 : 1);
  pairs.sort(byScore); names.sort(byScore);
  const singles = S.terms.filter((x) => usable(x) && isName(x))
    .map((x) => ({ terms: [x.t], n: x.df, kind: 'name', score: Math.log(N / x.df) }))
    .sort((x, y) => x.n - y.n || (x.terms[0] < y.terms[0] ? -1 : 1));
  const alone = singles.filter((x) => x.n <= STORY.ALONE_MAX), broad = singles.filter((x) => x.n > STORY.ALONE_MAX);
  let choices = alone.concat(pairs, names, broad);
  for (const c of choices) {
    c.centre = centre ? c.terms.filter((t) => centre.has(stemOf(t))).length : 0;
    c.central = !centre || c.centre > 0;
    let pl = false; if (placeName && (c.kind === 'names' || (c.kind === 'name' && c.n > STORY.ALONE_MAX))) { try { pl = !!placeName(c.terms); } catch (_) { pl = false; } }
    c.place = pl;
  }
  /* the more of the centre a choice holds, the earlier (a stable sort: the order above holds among equals) */
  if (centre) choices = choices.map((c, i) => [c, i]).sort((x, y) => y[0].centre - x[0].centre || x[1] - y[1]).map((x) => x[0]);
  const chips = S.terms.filter((x) => x.df >= 2)
    .map((x) => ({ t: x.t, df: x.df, name: isName(x), common: x.df > cap, central: !centre || centre.has(stemOf(x.t)) }))
    .sort((x, y) => (y.name - x.name) || (x.common - y.common) || (x.df - y.df) || (x.t < y.t ? -1 : 1));
  return { pick: choices.find((c) => !c.place) || null, choices, chips };
}

/* ── the lineage: which of the events naming the words FOLLOW from the event the story was opened from ──── */
const titlesOf = (r) => distinct([r && r.representative_title].concat(((r && r.news_event_articles) || [])
  .map((l) => l && l.news_articles && l.news_articles.title)));
const atMs = (r) => Date.parse((r && (r.first_published_at || r.first_seen_at || r.last_article_at)) || '');

/** lineage(rows, { seed, terms }) → { rows, applied, naming, dropped, links }
 *  rows      the events of the story: when `applied`, only those reachable from the seed event
 *  applied   false when the words are a thread by themselves (≤ ALONE_MAX events — the measured rule `suggest` uses
 *            for a name), when the seed is not among the rows (opened from words, a link or Atlas), or when it has
 *            nothing to compare (no headline words besides the story's own)
 *  naming    every event the words hold (what the server returned)
 *  links     public_id → { from, shared } — the earlier-reached event and the words the two headlines share
 *  A STEP of the thread joins two events reported at most LINK_GAP_H apart whose headlines (the event's own and
 *  its articles') share at least LINK_SHARED of the grouper's words BESIDES the story's words — those every row
 *  has by construction, so they are no evidence. The step must also land on an event holding a word of the seed's
 *  centre (besides the story's words), so the thread cannot walk off through two words the seed never had (measured
 *  2026-11-17: without it «putin» kept 18 of 82 — the step «welcome + european» from Albanese's welcome of the summit
 *  led into the Ukraine peace talks; with it, 13, all the summit).
 *  ⚠ «Follows from» is about the words of headlines and the time between them — never a judgement that one event
 *    caused or continued another; the card says which words joined each step. */
export function lineage(rows, opts) {
  const all = (rows || []).filter((r) => r && r.public_id);
  const o = opts || {};
  const off = { rows: all, applied: false, naming: all.length, dropped: 0, links: new Map() };
  const seedRow = o.seed ? all.find((r) => r.public_id === o.seed) : null;
  if (!seedRow || all.length <= STORY.ALONE_MAX) return off;
  const story = new Set((o.terms || []).map(stemOf).filter(Boolean));
  const words = (r) => { const s = new Set(); for (const t of titlesOf(r)) for (const k of tokenise(t)) if (!story.has(k)) s.add(k); return s; };
  const ev = all.map((r) => ({ r, id: r.public_id, at: atMs(r), w: words(r) }));
  const seed = ev.find((e) => e.id === o.seed);
  const centre = centreOf(titlesOf(seedRow)) || seed.w;
  const anchor = new Set([...centre].filter((k) => !story.has(k)));
  if (!seed.w.size || !Number.isFinite(seed.at)) return off;
  const gap = STORY.LINK_GAP_H * 3600e3;
  const links = new Map([[seed.id, { from: null, shared: [] }]]);
  const queue = [seed];
  while (queue.length) {
    const a = queue.shift();
    for (const b of ev) {
      if (links.has(b.id) || !Number.isFinite(b.at) || Math.abs(a.at - b.at) > gap) continue;
      const shared = [...a.w].filter((k) => b.w.has(k));
      if (shared.length < STORY.LINK_SHARED) continue;
      if (anchor.size && ![...b.w].some((k) => anchor.has(k))) continue;
      links.set(b.id, { from: a.id, shared });
      queue.push(b);
    }
  }
  const kept = all.filter((r) => links.has(r.public_id));
  return { rows: kept, applied: true, naming: all.length, dropped: all.length - kept.length, links };
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
