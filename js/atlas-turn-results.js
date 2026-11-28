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
 *  ⚠ NO DOM, NO NETWORK, NO GLOBALS — `norm` is injected — so tests/atlas-console-observers-checks.test.mjs (#R441) drives
 *  THIS module, the one the browser runs, with no browser. That is the js/atlas-turn-continuity.js
 *  pattern, and it is also why the subject is its own file: js/atlas-console.js has a shrink-only
 *  line ceiling (tests/atlas-capabilities-checks.test.mjs (#R318) ⓑ).
 * ==========================================================================*/

import { makeAtlasCapabilities } from './atlas-capabilities.js';   /* (atlas-one-declaration) the table of spellings, when none is injected */

let _ownRegistry = null;
function ownRegistry() { return _ownRegistry || (_ownRegistry = makeAtlasCapabilities({}, { publish: false })); }

/* ── the one marker a tool's SENTENCE carries (see `forReader` below for why) ─────────────────────────────────────
   A comment pair, not a class: it survives any HTML a caller builds around it, it renders nothing, and it is split with no
   DOM — so the node checks run the same code the browser does. */
const P_OPEN = '<!--atl:p-->', P_CLOSE = '<!--/atl:p-->';
export function proseMark(h) { return P_OPEN + h + P_CLOSE; }
export function plainText(h) {
  /* ONE pass, each match replaced by a SPACE: a removal that joined its neighbours could rebuild a `<!--` (CodeQL js/incomplete-multi-character-sanitization) */
  return String(h == null ? '' : h).replace(/<!--[\s\S]*?-->|<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
/* {rest, prose}: the HTML with every marked sentence taken out, and those sentences. An unclosed marker keeps its text in `rest` — nothing is dropped by a malformed fragment. */
export function proseSplit(html) {
  const s = String(html == null ? '' : html), re = /<!--(\/?)atl:p-->/g;
  let rest = '', last = 0, start = 0, depth = 0, m; const prose = [];
  while ((m = re.exec(s))) {
    if (m[1] === '') { if (depth === 0) { rest += s.slice(last, m.index); last = m.index; start = re.lastIndex; } depth++; }
    else if (depth > 0) { depth--; if (depth === 0) { prose.push(s.slice(start, m.index)); last = re.lastIndex; } }
  }
  return { rest: rest + s.slice(last), prose };
}

export function makeAtlasTurnResults(deps) {
  return (function () {
    deps = deps || {};
    /* js/atlas-console.js's `_lnorm`, handed in rather than copied: one spelling of "the same
       words" for the whole console. The fallback exists only for a caller that has none. */
    const norm = (typeof deps.norm === 'function')
      ? deps.norm
      : (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();

    /* The families whose results are ANSWERS about a topic — #R159's list, by CAPABILITY. (atlas-one-declaration) It
       used to be the 14 spellings of these five written out again; every spelling now reaches its row through the
       registry (`ofSpelling`), so an alias added to a row is an answer family here without a second edit.
       The registry is INJECTED (`deps.capabilities`, the app's own); a caller with none gets a private, unpublished
       copy of the same table (js/atlas-capabilities.js `{ publish: false }`) — this module still reads no global. */
    const CAPS = (deps.capabilities && typeof deps.capabilities.ofSpelling === 'function')
      ? deps.capabilities : ownRegistry();
    /* (atlas-capability-single-source) WHICH capabilities are answer families is declared in each one's entry
       (`policy: { answer: true }`, js/atlas-cap-research.js) and read here through the registry (`isAnswer`) — it was
       the five ids written out a second time in this file. */
    const ANSWER_CAPS = CAPS.all().filter(function (c) { return c && c.isAnswer; }).map(function (c) { return c.id; });
    const ANSWER_TYPES = {};
    ANSWER_CAPS.forEach(function (id) { const c = CAPS.resolve(id); if (c) c.aliases.forEach(function (a) { if (CAPS.ofSpelling(a) === c) ANSWER_TYPES[a] = 1; }); });

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
       because 「大阪駅」 and 「 大阪駅 」 are the same destination.

       ⚠⚠⚠ (#R742) AN EMPTY FIELD CARRIES NO REQUEST AT ANY DEPTH, AND FOR ONE ROUND IT ONLY DID AT
       THE TOP. `callKey` and `opKey` drop empty arguments before they build a key, so `map_view`
       with `{place:'Kazakhstan'}` and with `{place:'Kazakhstan', zoom:''}` are the same call — but
       the dropping happened in THEIR loops, not here, so one level down it did not happen at all.
       Only the ten CORE tools carry their real arguments at the top level; the other ~120
       capabilities are reached through `run_capability`, whose arguments are `{id, args:{…}}` —
       so for all of them the rule was inert. Measured on production 2026-09-15 with the shipped
       `IntMapAtlasTurnResults.callKey`:

           map_view        {place:'Kazakhstan'}                    vs +{zoom:''}   → SAME key
           run_capability  {id:'map.pin', args:{place:'36.5585, 21.1286'}} vs +{title:''} → DIFFERENT

       `map.pin` alone declares eight free-text fields (js/atlas-schemas.js), so one blank title was
       a new call. The turn that asked for the deepest point of the Mediterranean drew the SAME pin
       at the SAME coordinates seven times — 22 steps, 2m14s, six duplicate objects — and every
       outcome said `ok`. The repeat guard in js/atlas-agent.js could not save it either: it counts
       a step only when EVERY call in it was a reuse, and none of them ever was.

       So the rule belongs to the VALUE, not to the caller's loop: a key is built from the fields
       that carry a request, however deep they sit (.agents/rules/no-ad-hoc-hardcoding.md §3). */
    function stable(v) {
      if (v === undefined || v === null) return 'null';
      if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
      if (typeof v === 'object') {
        const ks = Object.keys(v).filter((k) => k.slice(0, 2) !== '__' && !isEmpty(v[k])).sort();
        return '{' + ks.map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
      }
      if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
      if (typeof v === 'string') return JSON.stringify(isWords(v) ? norm(v) : v.trim());
      return JSON.stringify(v);
    }
    /* ⚠⚠ A STRING IS FOLDED ONLY WHEN IT IS WORDS. `norm` lowercases and collapses spaces, which is right for a place a person typed (「大阪駅」 =
       「 大阪駅 」, `Osaka` = `osaka`) and WRONG for anything that is read by a machine: Python's `A=19` and `a=7` are two programs, `/Tmp/X` and
       `/tmp/x` two paths, `ID_1` and `id_1` two identifiers. Folded, the second call returned the first call's answer — 19 for both, the second
       never run. The test is the SHAPE of the value (letters, digits, spaces and the punctuation of a name), not the field it sits in, so a
       capability added tomorrow whose argument is code is kept verbatim without anyone listing it (no-ad-hoc-hardcoding §2 ④). Anything that
       carries `= ( ) { } [ ] ; : / \ < > _ $ # @ % ^ & * + | ~` or a line break is not words. */
    function isWords(v) { return /^[\p{L}\p{M}\p{N} 	.,'’·\-]*$/u.test(v); }

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

    /**
     * callKey(name, args) -> string — the identity of ONE TOOL CALL, in the same terms `opKey` uses
     * for one action: the name plus every argument that carries meaning, sorted and normalised.
     *
     * ⚠ (#R489) IT EXISTS BECAUSE THE DE-DUPE ABOVE RUNS TOO LATE TO SAVE THE WORK. `keep()` decides
     * what the reader is SHOWN; by the time it runs, four identical research passes have already
     * been executed, each having spent its own web searches, its own model call and its own
     * geocoding — and, in the reported transcript, each having reached a different conclusion,
     * because they searched at different moments over a window nobody had fixed. js/atlas-agent.js
     * asks this before it runs a call, so a call the turn has ALREADY MADE returns what it returned.
     *
     * ⚠ IT IS NOT A CAP, AND NOT A REFUSAL (CONSTITUTION.md §5). Atlas may call whatever it likes as
     * often as it likes; the loop's budget is untouched, no plan is rewritten and no action is
     * rejected. What changes is that asking the identical question twice costs one answer instead of
     * two — and only when the first one SUCCEEDED, because a failure is exactly the case where
     * trying again is the right thing to do.
     */
    function callKey(name, args) {
      const nm = String(name == null ? '' : name).trim();
      if (!nm) return '';
      const a = (args && typeof args === 'object' && !Array.isArray(args)) ? args : {};
      const ks = Object.keys(a).filter((k) => k.slice(0, 2) !== '__' && !isEmpty(a[k])).sort();
      return 'call:' + nm + ':' + ks.map((k) => k + '=' + stable(a[k])).join('&');
    }

    /**
     * revisionOf(res) — the artifact this result is a revision of, and which revision it is.
     *
     * ⚠⚠⚠ (#R551) A REVISIONED ARTEFACT IS NOT RANKED, IT IS SUCCEEDED. `score()` decides between
     * two results for one goal by how good each looks, and for an artefact the app is HOLDING that
     * is the wrong question: the map is showing revision 2, so a reply that shows revision 1 —
     * because revision 1 happened to place more, or because revision 2 admitted to a gap and lost
     * two points for `meta.partial` — describes markers that are not there. The reader's copy has
     * to be the one the app kept. Only a result that DECLARES an artefact and a revision gets this
     * rule; everything else keeps #R441's ranking exactly as it was.
     */
    function revisionOf(res) {
      const art = res && res.meta && res.meta.artifact;
      if (!art || !art.id) return null;
      const n = Number(art.revision);
      return isFinite(n) ? { id: String(art.id), revision: n } : null;
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

    /* ══ (atlas-answer-integrity) A RESULT THAT SAYS WHAT IT IS ABOUT IS SUCCEEDED BY A LATER ONE ABOUT THE SAME THING ══
       Measured on production 2026-11-17: a life-expectancy ranking was corrected inside its own turn — from bundled
       undated figures to the World Bank's — and the reply kept BOTH, because `opKey` saw two different calls (another
       `n`, another argument) and the old ranking had nothing that said it answered the same question. Atlas's prose
       then told the reader to use the new table rather than the old one: the reader was handed IntMap's job.
       A result that knows its subject says so — `meta.subject` (the quantity: the World Bank series, or the country
       table's field — js/atlas-metrics.js `metricResult`, js/indicator-browser.js `atlasMeta`) and `meta.facet` (which
       statement about it: a top ranking, a bottom ranking, a map). One subject and facet is one slot, and the slot
       holds the result the app is now showing: the LATER one — unless the later one failed (a failure never displaces
       an answer), or both state the year their data is for and the later one's is OLDER (a newer measurement is the
       better answer to the same question, whichever was fetched last). Nothing is refused or capped: every call ran,
       and the map holds what the last one drew. */
    function subjectKey(res) {
      const m = res && res.meta;
      if (!m || !m.subject) return '';
      return 'subject:' + String(m.subject) + '#' + String(m.facet || '');
    }
    function dataYear(res) {
      const ys = String((res && res.meta && res.meta.dataYear) || '').match(/\d{3,4}/g);
      return ys ? Math.max.apply(null, ys.map(Number)) : NaN;
    }
    function supersedes(later, earlier) {
      if (!earlier) return true;
      if (later && later.ok === false && earlier.ok !== false) return false;
      const a = dataYear(later), b = dataYear(earlier);
      if (isFinite(a) && isFinite(b) && a !== b) return a > b;
      return true;
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
        const sk = ak ? '' : subjectKey(res);
        const key = ak || sk || opKey(res.act, res);
        if (!key) { out.push(res); return; }
        if (!(key in slot)) { slot[key] = out.length; out.push(res); return; }
        const i = slot[key];
        if (sk) { if (supersedes(res, out[i])) out[i] = res; return; }
        /* ANSWER: the best wins and a tie keeps the answer already written (#R159's repair).
           OPERATION: an equal re-run wins, because it is the one the app is still holding — but a
           re-run that FAILED never displaces a run that succeeded. */
        /* (#R551) two revisions of one artefact: the later one is what the app is holding. */
        const rv = revisionOf(res), rv0 = revisionOf(out[i]);
        if (!ak && rv && rv0 && rv.id === rv0.id) { if (rv.revision >= rv0.revision) out[i] = res; return; }
        if (ak ? (score(res) > score(out[i])) : (score(res) >= score(out[i]))) out[i] = res;
      });
      return out;
    }

    /**
     * present(kept, text) -> [{ res, fold }] — the editing step between the results and the reply (atlas-answer-integrity).
     *
     * Atlas's words are written after every result, so a result whose content the words already carry is a second copy
     * of the answer: the reader asked one question and saw the ranking in the prose, again as a block, and again as the
     * map layer's 「Highest」 line. A result that states its subject and a one-line `meta.brief` is FOLDED — its line
     * shows, the block opens on a press (nothing is deleted: the data, the map and the sources are all still there) — when
     *   · it is a RANKING and the words name at least half of the places it ranks (compared in `norm`'s terms), or
     *   · it is any OTHER statement about a subject (a map shaded by it) and Atlas has written its answer — what the map
     *     changed to is then one line, and the words carry the conclusion.
     * A result with no subject, a failure, or a reply with no words yet is shown as it always was.
     */
    function present(kept, text) {
      const words = norm(String(text == null ? '' : text));
      return (Array.isArray(kept) ? kept : []).map((res) => {
        const m = res && res.ok !== false && res.meta;
        if (!m || !m.subject || !m.brief || !words) return { res, fold: false };
        if (!/^ranking/.test(String(m.facet || ''))) return { res, fold: true };
        const names = (Array.isArray(m.rows) ? m.rows : []).map((n) => norm(String(n || ''))).filter(Boolean);
        const named = names.filter((n) => words.indexOf(n) >= 0).length;
        return { res, fold: names.length > 0 && named * 2 >= names.length };
      });
    }

    /* ══ WHO WRITES THE SENTENCES THE READER READS ══════════════════════════════════════════════════════════
       A tool's `html` is read by TWO readers: the reader's screen, and — as `text`, the same words with the tags taken off
       (js/atlas-toolsurface.js `mechanical`) — Atlas. Atlas then writes its answer FROM those sentences, so a sentence a tool
       wrote for the reader (a note, a warning) reached the reader twice: once as Atlas's own words and once verbatim under
       them. Measured in the report that named this: 「地図上で調べたい地点をタップしてください」 in the answer and
       「到達時刻には地点が必要です。地名を指定するか、先に地図をタップしてください。」 under it, and 「移動先: 東京都千代田区」
       for a map that had just moved there.
       WHAT IS DECIDED, FOR EVERY TOOL AND NOT ONE: once Atlas has written its final answer, the SENTENCES a tool wrote
       (`proseMark` — js/atlas-console.js `note` / `warn`, the one place every one of them is made) are Atlas's to say, not the
       tool's to repeat; what stays is what the reader USES — cards, links, charts, controls, the map toggle, the sources.
       A new tool needs no declaration to get this: the default is that its prose is material, its artifacts are shown.
       ⚠ NOTHING IS HIDDEN THAT ATLAS DID NOT HAVE IN FRONT OF IT. A result is stripped only when it succeeded cleanly
       (no partial / unverified / unobserved status — those are facts the reader is owed) and its whole text fits what Atlas
       was handed (`modelTextMax`: the rest was cut off for Atlas, so the reader is not denied it). Failures are not
       stripped here: `unfinished` names them in the reader's words, and the answer's own unmet-goal line (atlas-completion)
       still states what the turn declared and did not produce. */
    function forReader(res, modelTextMax) {
      const h = (res && res.html) || '';
      if (!h || !res || res.ok === false) return h;
      const m = res.meta || {};
      if (m.partial || m.unverified || (m.status && m.status !== 'completed')) return h;
      if (plainText(h).length > (modelTextMax > 0 ? modelTextMax : 2000)) return h;
      const split = proseSplit(h);
      if (!split.prose.length) return h;
      const bare = split.rest.replace(/<!--[\s\S]*?-->/g, ' ');
      const visual = /<(img|svg|canvas|button|input|select|textarea|video|audio|iframe|a|table|details)\b/i.test(bare);
      return (visual || /[\p{L}\p{N}]/u.test(plainText(bare))) ? split.rest : '';
    }
    /* Has Atlas WRITTEN its answer? `completion` is what js/atlas-agent.js states of the turn: 'none' (no text), 'partial' (text, and goals it declared
       that were not produced — which the reply names itself), 'unobserved' (the goal could not be verified), 'complete'. Only 'none' — and a `say` that was written BEFORE the tools ran (no completion yet) —
       leaves the reader without Atlas's words, so only there do the tools' sentences stay. (⚠ this read `'answered'` at first, which is a `stopped` value, never a
       `completion`: the feature was inert in production until a real reply showed the sentences still under the answer.) */
    function written(say, completion) { return !!say && (completion === 'complete' || completion === 'partial' || completion === 'unobserved'); }
    /* what a FAILED result says, in the words it already wrote for the reader — never the action's internal name */
    function unfinished(res) {
      const h = (res && res.html) || '';
      const split = proseSplit(h);
      let lines = split.prose.map(plainText).filter(Boolean);
      if (!lines.length) { const t = plainText(split.rest); if (t) lines = [t]; }
      return lines;
    }

    const API = { ANSWER_TYPES, answerKey, opKey, callKey, revisionOf, score, keep, subjectKey, present, forReader, unfinished, written };
    try { window.IntMapAtlasTurnResults = API; } catch (_) { /* non-browser (the node checks) */ }
    return API;
  })();
}
