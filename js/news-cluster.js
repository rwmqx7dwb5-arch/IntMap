/* ============================================================================
 *  IntMap · News → EVENTS — the ONE deterministic grouper  (#R336)
 * ----------------------------------------------------------------------------
 *  One real-world occurrence, many articles. Atlas `research.events`
 *  (js/atlas-console.js, case 'events'/'newsEvents'/'groupNews') is the caller.
 *
 *  ⚠ THERE IS EXACTLY ONE OF THESE, AND IT LIVES HERE. #R76 wrote the grouping
 *  inline inside a 58-line `case` in js/atlas-console.js, where nothing could
 *  call it: `tests/` held zero tests naming research.events / newsEvents /
 *  groupNews, so for 254 rounds the algorithm was measured by nobody. It is a
 *  module now for two reasons — js/atlas-console.js is under a shrink-only
 *  ceiling (tests/r199 ⑤), and a regression test must run THE SHIPPED CODE
 *  rather than a copy of it (tests/r336-checks.test.mjs imports this file).
 *  A future news subsystem that needs event grouping imports this; it does not
 *  write a second one.
 *
 *  ── WHAT #R76 GOT WRONG, MEASURED ON THE REAL FEED ──────────────────────────
 *  Rule was: place ≤150 km AND time ≤48 h AND Jaccard ≥0.15, RELAXED to ≥0.06
 *  when d<30 km && Δt≤24 h. On 1,641 production headlines run through the
 *  shipped locator (js/newsgeo.js), 499 of the 1,005 that place at all resolve
 *  to a COUNTRY — 92 of them stacked on the single point [-98, 39.5] "United
 *  States". For every such pair d is exactly 0, so `d<30 && Δt≤24` is true by
 *  construction and 0.06 is the only surviving gate. Two CJK bigrams matching,
 *  or one shared English word, clears 6%.
 *
 *    600 real articles, R76 constants   →  283 events, largest 36, and 60% of
 *    all joins came through the relaxed branch. That largest "event" held the
 *    Iran economic war, a 40,000-bottle eye-drops recall, a laptop fire on an
 *    American Airlines flight, US debt passing $40tn and childless Americans'
 *    retirement worries — one occurrence, allegedly.
 *
 *  ── WHAT THIS FILE DOES INSTEAD ─────────────────────────────────────────────
 *  1. The relaxation is gone. Geographic agreement is not a discount on
 *     evidence; it is one of the three things that must independently hold.
 *  2. A REPRESENTATIVE POINT IS NOT A PLACE (see isRepresentative below). Two
 *     articles docked on a country's centroid are not "in the same place",
 *     they are "filed under the same name" — so distance buys them nothing.
 *     Only two PRECISE subjects (a city, a flashpoint) get the 150 km
 *     neighbourhood; anything involving a representative point must be the
 *     SAME point, and even then still has to clear the full text bar.
 *  3. Tokens drop stopwords, and CJK bigrams drop hiragana-only glue (「する」
 *     「には」「して」…), which is the same rule expressed for Japanese.
 *     ⚠ This makes grouping BETTER, not merely stricter: noise inflates the
 *     UNION of the Jaccard, so removing it RAISES similarity for stories that
 *     really are the same one. Measured — the Swedish school sword attack goes
 *     from two fragments (8+1) to one event of 9.
 *  4. The bar is SIM = 0.30 for every pair.
 *  5. Grouping reads the SUBJECT location, never the pin. In Publisher pin mode
 *     js/app-body.js applyPinMode() rewrites analysis.loc to the newsroom's HQ,
 *     which would have made every CNN story one Atlanta occurrence. What an
 *     event IS must not depend on a display toggle.
 *
 *    Same 600 articles →  503 events, largest 9, and the largest IS one event
 *    (nine reports of the Swedish school sword attack). Largest cluster of
 *    "United States" country-level articles: 36 → 4 (four outlets on US debt
 *    passing $40 trillion). The 150 real news events the app loads at a time
 *    (js/news-feed.js caps the feed at 150) go from 77 events / largest 18 to
 *    128 events / largest 5.
 *
 *  ⚠ NO NETWORK, NO CLOCK, NO RANDOMNESS. The caller supplies "hours ago" so
 *  the same input always yields the same events — that is what lets a test
 *  assert on a fixture. Same discipline as js/newsgeo.js.
 * ==========================================================================*/
/*  ⚠ WHY A FACTORY AND NOT BARE `export const`s. tests/r175 ③ forbids an UNEXPORTED top-level
 *  declaration in any js/ module (a classic script's top-level const is a global) AND fails any
 *  export that no js/ module imports by name (dead code). The three private tables below are
 *  neither exportable nor deletable, and the helpers below them are imported only by the test —
 *  so everything lives inside the factory, which is the shape the other split-out modules use
 *  (makeAtlasReply, makeAtlasGeoResolve, …). One call, one closure, no globals.
 *
 *      const { groupNewsEvents } = makeNewsCluster();
 */
export function makeNewsCluster() {

  /* The three thresholds, in one place, named. tests/r336-checks reads them. */
  const EVENT_RULES = {
    KM: 150,        /* two PRECISE subjects this close may be the same occurrence */
    SAME_KM: 1,     /* …but a representative point is only ever the SAME point   */
    HOURS: 48,      /* reports of one occurrence arrive inside this window       */
    SIM: 0.30       /* Jaccard over headline tokens — #R76 used 0.15, and 0.06   */
  };                /*  through a relaxation that country-level pairs always met */

  /* Subject kinds that name an ACTUAL SPOT on the ground. js/news-context.js
     _NG_KIND maps the locator's kinds onto these: city|region|country|flashpoint.
     Everything not listed here is a stand-in for something larger (a country, an
     admin region) or for nothing at all (the deterministic scatter given to a
     story we could not place, and the publisher HQ shown in Publisher pin mode). */
  const PRECISE_KIND = { city: 1, flashpoint: 1 };

  /* (#R336) English/German/Spanish/French/Russian function words and news
     furniture. Words shorter than 3 characters are already dropped, which is why
     "the/and/for" carry their weight here but "of/in/on/at" need not appear. */
  const STOPWORDS = new Set(('the,and,for,are,but,not,you,all,any,can,had,her,was,our,out,day,get,has,him,his,how,its,new,now,old,see,two,way,who,did,she,use,say,says,said,will,with,from,that,this,have,they,been,were,what,when,where,which,after,before,over,into,about,than,then,them,their,there,these,those,more,most,some,such,only,other,could,would,should,first,last,next,news,report,reports,live,update,updates,latest,video,watch,here,amid,against,among,during,while,under,between,across,per,via,your,'
    + 'der,die,das,und,ist,von,mit,den,dem,des,ein,eine,einen,einem,eines,auf,aus,als,auch,bei,bis,für,ich,sie,wir,ihr,nach,nicht,noch,nur,oder,sich,sind,über,vor,war,wie,wird,zum,zur,zwischen,gegen,ohne,'
    + 'los,las,una,uno,por,con,del,que,para,como,más,pero,este,esta,estos,estas,sus,sobre,entre,desde,hasta,tras,según,cuando,donde,'
    + 'les,une,dans,pour,sur,avec,est,sont,par,aux,leur,plus,mais,sans,sous,chez,vers,'
    + 'как,что,это,для,при,она,они,был,была,было,были,есть,или,так,еще,уже,его,ему,над,под,про,без,год,года,после,перед,между,через,против,около,чем,кто,где,когда').split(','));

  /* A CJK bigram made only of hiragana (and the long vowel mark) is grammar, not
     identity — 「する」「した」「して」「には」「から」. Kanji, katakana and hangul
     bigrams carry the names, so they stay. This is the Japanese half of STOPWORDS,
     written as a rule rather than a list so it cannot go stale. */
  const HIRAGANA_GLUE = /^[ぁ-ゖー]{2}$/;

  /**
   * Headline → the token set the similarity is computed over.
   * @param {string} title
   * @returns {Set<string>}
   */
  function newsTokens(title) {
    const s = String(title || '');
    const keep = (x) => x.length >= 3 && !STOPWORDS.has(x);
    let w;
    try { w = s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(keep); }
    catch (_) { w = s.toLowerCase().split(/[^a-z0-9]+/).filter(keep); }
    /* CJK writes no spaces, so character bigrams stand in for words. */
    (s.match(/[一-鿿぀-ヿ가-힯]{2,}/g) || []).forEach((seq) => {
      for (let i = 0; i < seq.length - 1; i++) {
        const b = seq.slice(i, i + 2);
        if (!HIRAGANA_GLUE.test(b)) w.push(b);
      }
    });
    return new Set(w);
  }

  /** Jaccard over two token sets. @returns {number} 0…1 */
  function newsSimilarity(A, B) {
    let inter = 0;
    A.forEach((x) => { if (B.has(x)) inter++; });
    const u = A.size + B.size - inter;
    return u ? inter / u : 0;
  }

  /**
   * What an article is ABOUT, as a point plus how much that point means.
   *
   * ⚠ Reads analysis.subjectLoc / analysis.subjectType FIRST. js/app-body.js
   * applyPinMode() overwrites analysis.loc with the publisher's HQ in Publisher
   * pin mode and with a deterministic scatter point when nothing resolved; both
   * are display decisions and neither says where the story happened. The subject
   * fields survive both, so an event stays the same event whichever pin the map
   * is showing. Saved-article snapshots (js/news-ui.js snapAnalysis) keep only
   * loc/ptype/mapped, so those are the fallback — and there `mapped === true` is
   * exactly the record's own claim that the pin IS the subject.
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

  /**
   * TRUE when the point stands for something bigger than itself.
   * A country's representative point ([-98, 39.5] for the United States,
   * [104, 35] for China) is where the gazetteer docks every story it could only
   * narrow down to that country. Ninety-two unrelated stories sharing it is the
   * normal case, not evidence that they are one occurrence.
   * @param {{precise:boolean}} subj
   */
  function isRepresentative(subj) { return !subj || !subj.precise; }

  /** Great-circle km between two [lng, lat] pairs. */
  function kmBetween(a, b) {
    const R = 6371, d2r = Math.PI / 180;
    const dLa = (b[1] - a[1]) * d2r, dLo = (b[0] - a[0]) * d2r;
    const h = Math.sin(dLa / 2) ** 2
      + Math.cos(a[1] * d2r) * Math.cos(b[1] * d2r) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /**
   * Do these two articles agree on WHERE, given what each of their points means?
   * ⚠ This is the fix for the reported breakage. `d === 0` between two country
   * centroids is not proximity; it is two labels matching. It therefore earns the
   * pair nothing beyond the right to be compared on text at the full bar.
   */
  function sameArea(a, b) {
    const d = kmBetween(a.loc, b.loc);
    if (isRepresentative(a) || isRepresentative(b)) return d <= EVENT_RULES.SAME_KM;
    return d <= EVENT_RULES.KM;
  }

  /**
   * Group loaded articles into EVENTS.
   *
   * @param {object[]} items   feed items — { title, publisher, pubDate, analysis }
   * @param {object}   opt
   * @param {function} opt.agoH        (pubDate) → hours ago, or null when unknown
   * @param {number}   [opt.fallbackH] hours to assume when agoH returns null
   * @param {number}   [opt.max]       hard cap on articles compared (pairs are O(n²))
   * @returns {object[]} events, biggest first, each
   *   { g:[{it,loc,h,subj}] newest-first, outlets:string[], cx, cy, newest, oldest, pname }
   */
  function groupNewsEvents(items, opt) {
    const o = opt || {};
    const agoH = typeof o.agoH === 'function' ? o.agoH : () => null;
    const fallbackH = isFinite(+o.fallbackH) ? +o.fallbackH : 96;
    const max = isFinite(+o.max) ? +o.max : 600;

    const arr = [];
    (items || []).slice(0, max).forEach((it) => {
      if (!it || !it.title) return;
      const subj = newsSubject(it.analysis);
      if (!subj) return;
      const h = agoH(it.pubDate);
      arr.push({ it: it, loc: subj.loc, subj: subj, h: (h != null ? h : fallbackH), tk: newsTokens(it.title) });
    });

    /* union-find over the pairs that agree on place AND time AND wording */
    const par = arr.map((_, i) => i);
    const find = (i) => par[i] === i ? i : (par[i] = find(par[i]));
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (!sameArea(arr[i].subj, arr[j].subj)) continue;
        if (Math.abs(arr[i].h - arr[j].h) > EVENT_RULES.HOURS) continue;
        if (newsSimilarity(arr[i].tk, arr[j].tk) < EVENT_RULES.SIM) continue;
        par[find(i)] = find(j);
      }
    }

    const cl = {};
    arr.forEach((x, i) => { const r = find(i); (cl[r] = cl[r] || []).push(x); });
    const evs = Object.keys(cl).map((k) => {
      const g = cl[k].slice().sort((x, y) => x.h - y.h);   /* newest (fewest hours ago) first */
      const outlets = [];
      g.forEach((x) => { const p = (x.it && x.it.publisher) || '?'; if (outlets.indexOf(p) < 0) outlets.push(p); });
      const cx = g.reduce((s, x) => s + x.loc[0], 0) / g.length;
      const cy = g.reduce((s, x) => s + x.loc[1], 0) / g.length;
      return { g: g, outlets: outlets, cx: cx, cy: cy, newest: g[0].h, oldest: g[g.length - 1].h,
        pname: (g[0].it.analysis && g[0].it.analysis.name) || '' };
    });
    evs.sort((x, y) => (y.g.length - x.g.length) || (x.newest - y.newest));
    return evs;
  }

  return { EVENT_RULES, newsTokens, newsSimilarity, newsSubject, isRepresentative, kmBetween, sameArea, groupNewsEvents };
}
