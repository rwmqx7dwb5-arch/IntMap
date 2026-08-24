/* ============================================================================
 *  IntMap · ATLAS — ONE OPERATION, ONE BLOCK IN THE REPLY  (#R441)
 * ----------------------------------------------------------------------------
 *  「経路を聞いたらいくつも出てきてしまう。6つぐらい出てきた。おかしいバグ。」
 *
 *  The screenshot shows ONE question — 「ここから大阪駅まで電車で行きたい。」 — and the SAME five
 *  itineraries listed twice inside the same reply: 「5件の候補 — タップで地図に表示」, five cards,
 *  the Transitous/MOTIS footnote, and then 「5件の候補 — タップで地図に表示」 and the five cards
 *  again. Same departure, same arrival, same transfers, same selected card.
 *
 *  ══ WHY THE EXISTING GUARD DID NOT CATCH IT ══════════════════════════════════════════════════
 *  A turn may run a tool more than once — that is Atlas's to decide (CONSTITUTION.md §5), and the
 *  loop in js/atlas-agent.js gives it up to 32 calls across 8 steps. What is NOT Atlas's to decide
 *  is how many times the reader is shown the same result, and js/atlas-console.js already had two
 *  guards for that:
 *
 *      · `_atlGoalKey` — de-dupe by GOAL, but it answered '' for everything except the fourteen
 *        answer/report types, so every operational action was kept unconditionally; and
 *      · «drop any exact-duplicate html fragment» — a STRING comparison of the rendered HTML.
 *
 *  The string comparison is what routing defeats. js/routing.js stamps every computed route set
 *  with a fresh id — `_rsNew()` is `'rs' + (++_rsSeq)` — and js/routing-cards.js writes that id
 *  into every card as `data-rset` so a tap on an OLD message still selects within ITS OWN set
 *  (#R291). Two runs of the same journey therefore produce two HTML fragments that differ in
 *  exactly one place: `data-rset="rs1"` vs `data-rset="rs2"`. Byte-unequal, so `seen[h]` never
 *  fires, so both are appended. The guard was reading the RENDERING when the thing that repeated
 *  was the OPERATION.
 *
 *  ══ WHAT THIS MODULE DECIDES ═════════════════════════════════════════════════════════════════
 *  One slot per goal, where a goal is now named two ways instead of one:
 *
 *      · an ANSWER family — unchanged from #R159: the topic, so a repair REPLACES the failure it
 *        is repairing. A tie keeps the FIRST, because the answer already on the page stays.
 *      · a REPEATED OPERATION — the action's type and its arguments, or the identity the result
 *        declared for itself (`meta.resultKey`). A tie keeps the LATEST, because the app kept the
 *        latest: the map is holding the route the last run drew, and the cards the reader can tap
 *        should be that run's.
 *
 *  ⚠ `meta.resultKey` EXISTS BECAUSE THE ARGUMENTS ARE NOT ALWAYS THE SAME WORDS. 「ここから」 and
 *  the coordinates `my_location` just returned are the same starting point spelled two ways, and a
 *  turn that looks the reader up and then routes may well use one on one step and the other on the
 *  next. A case that knows what it RESOLVED can say so, and then the two runs collapse on what
 *  they actually did rather than on how they were asked.
 *
 *  ⚠ THIS TAKES NOTHING FROM ATLAS. It does not cap the loop, refuse a call, or decide whether a
 *  second route is worth computing — every tool call still runs, and the map still ends up with
 *  what the last one drew. What changes is that the reader is shown one route once, which is what
 *  the app actually did.
 *
 *  ⚠ NO DOM, NO NETWORK, NO GLOBALS — `norm` is injected — so tests/r441-checks.test.mjs drives
 *  THIS module, the one the browser runs, with no browser. That is the js/atlas-turn-continuity.js
 *  pattern, and it is also why the subject is its own file: js/atlas-console.js has a shrink-only
 *  line ceiling (tests/r318-checks.test.mjs ⓑ).
 * ==========================================================================*/

export function makeAtlasTurnResults(deps) {
  return (function () {
    deps = deps || {};
    /* js/atlas-console.js's `_lnorm`, handed in rather than copied: one spelling of "the same
       words" for the whole console. The fallback exists only for a caller that has none. */
    const norm = (typeof deps.norm === 'function')
      ? deps.norm
      : (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();

    /* The families whose results are ANSWERS about a topic — #R159's list, unchanged. */
    const ANSWER_TYPES = {
      mapReport: 1, newsMap: 1, reportMap: 1, researchMap: 1, research_map: 1, situationMap: 1,
      historicalMap: 1, historical: 1, powerMap: 1, allianceMap: 1, analyze: 1, research: 1,
      synthesize: 1, brief: 1,
    };

    /* An argument that is absent, blank or empty says nothing about the operation, so it must not
       change its identity: `{from,to}` and `{from,to,via:[]}` are one journey asked twice. */
    function isEmpty(v) {
      if (v === undefined || v === null) return true;
      if (typeof v === 'string') return !v.trim();
      if (Array.isArray(v)) return !v.length;
      if (typeof v === 'object') return !Object.keys(v).length;
      return false;
    }

    /* A stable rendering of one argument value. Object keys are sorted, so two calls that spelled
       the same options in a different order are still the same call. Strings go through `norm`,
       because 「大阪駅」 and 「 大阪駅 」 are the same destination. */
    function stable(v) {
      if (v === undefined || v === null) return 'null';
      if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
      if (typeof v === 'object') {
        const ks = Object.keys(v).filter((k) => v[k] !== undefined).sort();
        return '{' + ks.map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
      }
      if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
      if (typeof v === 'string') return JSON.stringify(norm(v));
      return JSON.stringify(v);
    }

    /**
     * answerKey(act) — #R159's goal key, unchanged: '' unless this is an answer about a topic.
     * `__goalKey` still wins outright, because a repair answer inherits the goal it is fixing.
     */
    function answerKey(act) {
      if (!act || !act.type) return '';
      if (act.__goalKey) return String(act.__goalKey);
      if (!ANSWER_TYPES[act.type]) return '';
      let topic = '';
      try {
        topic = norm(String(act.topic || act.question || act.query || act.place
          || act.region || act.location || act.era || ''));
      } catch (_) { topic = ''; }
      return 'answer:' + topic;
    }

    /**
     * opKey(act, res) — the identity of an OPERATION: what it did, not how it rendered.
     *
     * The result's own `meta.resultKey` wins when a case declared one, because a case knows what
     * it resolved and the arguments only know what it was asked. Otherwise: the action type plus
     * every argument that carries meaning, sorted. Internal fields (`__result`, `__meta`, `__exec`,
     * `__status`, `__goalKey`) are the console's bookkeeping and are not part of the request.
     */
    function opKey(act, res) {
      if (!act || !act.type) return '';
      let rk = '';
      try { rk = String((res && res.meta && res.meta.resultKey) || ''); } catch (_) { rk = ''; }
      if (rk) return 'op:' + rk;
      const ks = Object.keys(act)
        .filter((k) => k !== 'type' && k.slice(0, 2) !== '__' && !isEmpty(act[k]))
        .sort();
      return 'op:' + String(act.type) + ':' + ks.map((k) => k + '=' + stable(act[k])).join('&');
    }

    /** score(res) — #R159's ranking of two results for the same goal, unchanged. */
    function score(res) {
      const m = (res && res.meta) || {};
      let s = 0;
      if (res && res.ok) s += 2;
      if (m.userGoalSatisfied) s += 5;
      const prod = Array.isArray(m.produced) ? m.produced : [];
      if (prod.indexOf('explanation') >= 0) s += 2;
      if (prod.indexOf('map') >= 0) s += 1;
      if (m.partial || m.unverified) s -= 2;
      return s;
    }

    /**
     * keep(results) -> [result] — the list the reply is built from, in the order it was produced.
     *
     * Every result whose goal is not shared with another keeps its place. Results that share one
     * collapse into the slot the first of them took, so the reading order never jumps.
     */
    function keep(results) {
      const list = Array.isArray(results) ? results : [];
      const slot = Object.create(null);
      const out = [];
      list.forEach((res) => {
        if (!res) return;
        const ak = answerKey(res.act);
        const key = ak || opKey(res.act, res);
        if (!key) { out.push(res); return; }
        if (!(key in slot)) { slot[key] = out.length; out.push(res); return; }
        const i = slot[key];
        /* ANSWER: the best wins and a tie keeps the answer already written (#R159's repair).
           OPERATION: an equal re-run wins, because it is the one the app is still holding — but a
           re-run that FAILED never displaces a run that succeeded. */
        if (ak ? (score(res) > score(out[i])) : (score(res) >= score(out[i]))) out[i] = res;
      });
      return out;
    }

    const API = { ANSWER_TYPES, answerKey, opKey, score, keep };
    try { window.IntMapAtlasTurnResults = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
