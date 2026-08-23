/* ============================================================================
 *  IntMap · Atlas research.events — the BROWSER SIDE of the one grouper  (#R340)
 * ----------------------------------------------------------------------------
 *  ⚠⚠ THE ALGORITHM IS NOT IN THIS FILE. It is
 *  `supabase/functions/_shared/news-cluster.js` (#R334), and this file imports it.
 *  Everything here is adaptation: the loaded feed's item shape in, the reply's
 *  event objects out. Nothing in between decides what counts as one event.
 *
 *  WHY THAT MATTERS. #R76 wrote the grouping inline inside a 58-line `case` in
 *  js/atlas-console.js, where nothing outside the browser could call it — and
 *  `tests/` held zero tests naming research.events / newsEvents / groupNews, so
 *  for 254 rounds the algorithm was measured by nobody. Meanwhile #R334 built the
 *  event-first pipeline with its own grouper. Two implementations of "is this the
 *  same occurrence?" is the shape this repository keeps getting hurt by, and
 *  docs/NEWS-EVENTS.md settles it: «research.events は新パイプラインへ載せ替える。
 *  第二のクラスタリング実装を残さない。» So there is one, and it is #R334's —
 *  better than what this round had first written independently: a six-step
 *  geo-class threshold ladder, a containment entry, IDF-weighted overlap, and a
 *  transitivity re-check that plain union-find does not have.
 *
 *  ⚠ NO MIRROR FILE, ON PURPOSE. js/newsgeo.js is COPIED into
 *  supabase/functions/_shared/ by scripts/sync-newsgeo.mjs because a Deno Edge
 *  Function cannot import a file outside supabase/functions/. That constraint is
 *  one-directional — the Vite bundle has no such limit — so the browser reads the
 *  shared file itself. A mirror can drift; one file cannot.
 *
 *  ── WHAT #R76 GOT WRONG, MEASURED ON THE REAL FEED ──────────────────────────
 *  Rule was: place ≤150 km AND time ≤48 h AND Jaccard ≥0.15, RELAXED to ≥0.06
 *  when d<30 km && Δt≤24 h. On 1,641 production headlines run through the shipped
 *  locator (js/newsgeo.js), 499 of the 1,005 that place at all resolve to a
 *  COUNTRY — 92 of them stacked on the single point [-98, 39.5] "United States".
 *  For every such pair d is exactly 0, so `d<30 && Δt≤24` is true by construction
 *  and 0.06 is the only surviving gate. Two CJK bigrams matching, or one shared
 *  English word, clears 6%.
 *
 *    600 real articles, R76 constants  →  283 events, largest 36, and 60% of all
 *    joins came through the relaxed branch. That largest "event" held the Iran
 *    economic war, a 40,000-bottle eye-drops recall, a laptop fire on an American
 *    Airlines flight, US debt passing $40tn and childless Americans' retirement
 *    worries — one occurrence, allegedly.
 *
 *  The shared module's answer is the opposite move: where a subject is a COUNTRY
 *  representative point the text bar goes UP, not down, because zero distance
 *  between two country centroids is not evidence of proximity — it is evidence
 *  that both stories were filed under the same name.
 *
 *  ── THE TWO THINGS THIS FILE DOES DECIDE ────────────────────────────────────
 *  1. WHICH POINT an article is at. Grouping reads the SUBJECT location, never
 *     the pin: js/app-body.js applyPinMode() rewrites analysis.loc to the
 *     newsroom's HQ in Publisher pin mode, which would have made every CNN story
 *     one Atlanta occurrence. What an event IS must not depend on a display
 *     toggle. See newsSubject() below.
 *  2. WHAT AN EVENT LOOKS LIKE in the reply — the outlets, the centroid, the
 *     first-report→latest span. Presentation, not judgement.
 *
 *  ⚠ NO NETWORK, NO CLOCK, NO RANDOMNESS. The caller supplies "hours ago", so the
 *  same input always yields the same events — that is what lets a test assert on
 *  a fixture. Same discipline as js/newsgeo.js.
 * ==========================================================================*/
import {
  DEFAULTS, clusterArticles, tokenise, jaccard, containment, geoClass, pairVerdict, kindOf,
} from '../supabase/functions/_shared/news-cluster.js';

/**
 * The browser-side adapter over the shared grouper.
 * ⚠ A factory rather than bare exports: tests/r175 ③ forbids an UNEXPORTED
 * top-level declaration in any js/ module and fails any export that no js/ module
 * imports by name. One exported factory satisfies both, and it is the shape the
 * other split-out modules use (makeAtlasReply, makeAtlasGeoResolve, …).
 */
export function makeNewsCluster() {

  /* Subject kinds that name an ACTUAL SPOT on the ground. js/news-context.js's
     _NG_KIND maps the locator's kinds onto these: city|region|country|flashpoint.
     ⚠ This table only decides `precise` for THIS file's own reporting. The geo
     class that the grouping actually uses is decided by the shared module's
     kindOf()/geoClass() from `subject_type`, so the two cannot disagree. */
  const PRECISE_KIND = { city: 1, flashpoint: 1 };

  /**
   * What an article is ABOUT, as a point plus how much that point means.
   *
   * ⚠ Reads analysis.subjectLoc / analysis.subjectType FIRST. js/app-body.js
   * applyPinMode() overwrites analysis.loc with the publisher's HQ in Publisher
   * pin mode, and with a deterministic scatter point when nothing resolved; both
   * are display decisions and neither says where the story happened. The subject
   * fields survive both. Saved-article snapshots (js/news-ui.js snapAnalysis) keep
   * only loc/ptype/mapped, so those are the fallback — and there `mapped === true`
   * is exactly the record's own claim that the pin IS the subject.
   *
   * @param {object} analysis  item.analysis
   * @returns {{loc:number[], kind:string, precise:boolean}|null}
   */
  function newsSubject(analysis) {
    const a = analysis || {};
    const sl = a.subjectLoc;
    if (sl && sl.length >= 2 && isFinite(+sl[0]) && isFinite(+sl[1])) {
      const kind = String(a.subjectType || '');
      return { loc: [+sl[0], +sl[1]], kind: kind, precise: !!PRECISE_KIND[kind] };
    }
    const l = a.loc;
    if (!l || l.length < 2 || !isFinite(+l[0]) || !isFinite(+l[1])) return null;
    const isSubject = a.mapped === true;
    const kind = isSubject ? String(a.ptype || '') : '';
    return { loc: [+l[0], +l[1]], kind: kind, precise: isSubject && !!PRECISE_KIND[kind] };
  }

  /** TRUE when the point stands for something bigger than itself — a country, a
   *  region, a newsroom, or the scatter given to a story we could not place. */
  function isRepresentative(subj) { return !subj || !subj.precise; }

  /**
   * Group loaded articles into EVENTS.
   *
   * @param {object[]} items   feed items — { title, publisher, pubDate, analysis }
   * @param {object}   opt
   * @param {function} opt.agoH        (pubDate) → hours ago, or null when unknown
   * @param {number}   [opt.fallbackH] hours to assume when agoH returns null
   * @param {number}   [opt.max]       hard cap on articles compared (pairs are O(n²))
   * @returns {object[]} events, biggest first, each
   *   { g:[{it,loc,subj,h}] newest-first, outlets:string[], cx, cy, newest, oldest, pname }
   */
  function groupNewsEvents(items, opt) {
    const o = opt || {};
    const agoH = typeof o.agoH === 'function' ? o.agoH : function () { return null; };
    const fallbackH = isFinite(+o.fallbackH) ? +o.fallbackH : 96;
    const max = isFinite(+o.max) ? +o.max : 600;

    const rows = [];
    (items || []).slice(0, max).forEach(function (it) {
      if (!it || !it.title) return;
      const subj = newsSubject(it.analysis);
      if (!subj) return;
      const h = agoH(it.pubDate);
      rows.push({ it: it, loc: subj.loc, subj: subj, h: (h != null ? h : fallbackH) });
    });

    /* ⚠ The shared module compares `published_at` as an absolute instant, and the
       caller only guarantees "hours ago". Derive the instant from that one number
       so both halves of every comparison come from the same clock — reaching for
       Date.now() here would make the same fixture group differently tomorrow. */
    const EPOCH = 4e12;   /* an arbitrary fixed instant; only DIFFERENCES are read */
    const articles = rows.map(function (r) {
      return {
        title: r.it.title,
        published_at: new Date(EPOCH - r.h * 3600e3).toISOString(),
        subject_lng: r.loc[0], subject_lat: r.loc[1],
        subject_type: r.subj.kind || null,
      };
    });

    const groups = clusterArticles(articles);   /* ← the ONE algorithm (#R334) */

    const evs = groups.map(function (idxs) {
      const g = idxs.map(function (i) { return rows[i]; }).sort(function (x, y) { return x.h - y.h; });
      const outlets = [];
      g.forEach(function (x) { const p = (x.it && x.it.publisher) || '?'; if (outlets.indexOf(p) < 0) outlets.push(p); });
      const cx = g.reduce(function (s, x) { return s + x.loc[0]; }, 0) / g.length;
      const cy = g.reduce(function (s, x) { return s + x.loc[1]; }, 0) / g.length;
      return {
        g: g, outlets: outlets, cx: cx, cy: cy, newest: g[0].h, oldest: g[g.length - 1].h,
        pname: (g[0].it.analysis && g[0].it.analysis.name) || '',
      };
    });
    evs.sort(function (x, y) { return (y.g.length - x.g.length) || (x.newest - y.newest); });
    return evs;
  }

  /* The numbers the reply quotes, READ from the shared module so the sentence
     cannot describe a threshold the code no longer applies (#R76's copy still
     said «place ≤150 km» after the rule around it had changed). */
  const thr = Object.keys(DEFAULTS.thr).map(function (k) { return DEFAULTS.thr[k]; });
  const EVENT_RULES = {
    HOURS: DEFAULTS.timeWindowH,
    KM: DEFAULTS.nearKm,
    SIM_MIN: Math.min.apply(null, thr),
    SIM_MAX: Math.max.apply(null, thr),
  };

  return {
    EVENT_RULES: EVENT_RULES, groupNewsEvents: groupNewsEvents,
    newsSubject: newsSubject, isRepresentative: isRepresentative,
    /* re-exported so tests/r340-checks measures THE SHIPPED functions, not copies */
    DEFAULTS: DEFAULTS, clusterArticles: clusterArticles, tokenise: tokenise, jaccard: jaccard,
    containment: containment, geoClass: geoClass, pairVerdict: pairVerdict, kindOf: kindOf,
  };
}
