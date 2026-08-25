/* ============================================================================
 *  IntMap · Atlas — what a turn's evidence gathering may cost  (#R448)
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ THE CLOCKS A TURN NEEDS SO THAT IT ALWAYS ENDS.
 *
 *  Reported from production: 「記事を開いた状態で Atlas に訊くと、Searching のまま2分待っても
 *  返らない」, and eventually the renderer itself stopped responding. `ai-proxy` answered 200 both
 *  times (5.1 s, 33.3 s) — nothing was wrong with the model, the account or the transport. What
 *  never came back was the EVIDENCE, and the reason is that there was no deadline anywhere between
 *  「Atlas chose a tool」 and 「the network answered」:
 *
 *      js/atlas-agent.js        `out = await execute(call)`   — unbounded, and the calls in one
 *                                                               step are awaited one after another
 *      js/atlas-toolsurface.js  `res = await runAction(…)`    — unbounded
 *      js/atlas-console.js      `await Promise.all(jobs)`     — waits for the SLOWEST source
 *      _fetchJSON / _fetchText   three relays × 9 s, WALKED   — and the 9 s stopped at the headers
 *      js/atlas-geo-resolve.js  geocode() / _nomExtent()      — Nominatim, no signal at all
 *      js/atlas-verify.js       _atlGeocodeStrict()           — ×24 in a file, just before drawing
 *
 *  Every ceiling Atlas had counted something — steps, tool calls, malformed replies. None of them
 *  measured TIME, so a turn's length was the sum of whatever the network felt like doing.
 *
 *  ⚠ THESE NUMBERS TAKE NOTHING FROM ATLAS (CONSTITUTION.md §5): no source is dropped, no tool is
 *  withheld, no count is lowered. What changes is that a source which has not answered by the
 *  deadline is reported as 「取得不可」 — the honest `missing` list this pipeline has always shown
 *  the reader — instead of holding the whole turn open behind it. A turn that ends saying what it
 *  could not reach is worth more than a turn that never ends.
 *
 *  ⚠ THE OTHER TWO CLOCKS LIVE IN js/atlas-agent.js — `toolTimeoutMs` (one tool call) and
 *  `turnBudgetMs` (the whole turn) — because that is the layer that owns the loop. Naming them here
 *  as well would be two homes for one number, and the day they disagreed the wrong one would win.
 *
 *  ⚠ This file exists because js/atlas-console.js is under a SHRINK-ONLY line ceiling (tests/r199 ⑤,
 *  tests/r318 ⑨b, tests/r419 ⑨d). The rule #R199 wrote is that a subject moves OUT, never that the
 *  ceiling moves up — so the clocks, the bounded gather and the evidence fetcher live here.
 * ==========================================================================*/
import { fetchViaProxy } from './proxy-fetch.js';   /* the app's ONE relay ladder */

export const ATLAS_BUDGETS = {
  EVIDENCE_BUDGET_MS: 14000,   /* ONE external evidence fetch, relay ladder included */
  GATHER_BUDGET_MS: 32000,     /* the whole `jobs` gather for one analyze call */
  WEB_BUDGET_MS: 20000,        /* the GDELT ladder inside that gather (Google News runs beside it) */
};

/* newTurnController(prev) -> the AbortController for the turn that is starting
 *
 * ⚠⚠⚠ A SECOND QUESTION REPLACES THE FIRST, IT DOES NOT JOIN IT. `_runGen` already made the older
 * turn's results be DISCARDED, but js/atlas-console.js used to overwrite `_abortCtl` WITHOUT
 * aborting it — so work whose answer nobody would ever see ran to completion. Measured on the live
 * site: an already-superseded ai-proxy call ran 12.6 s more and returned 200; a superseded turn
 * issued a NEW external fetch 3.7 s after being replaced; calls were still going out 280 s after
 * the reader's last message, with the send button showing idle and no stage dot on screen.
 * ⚠ The Stop button always did this and cancels in ~3 ms (measured). What was missing was the same
 * thing on the path a waiting reader actually takes, which is asking again rather than stopping. */
export function newTurnController(prev) {
  try { if (prev && prev.abort) prev.abort(); } catch (_) { /* already finished */ }
  try { return (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (_) { return null; }
}

/* settleWithin(jobs, ms) -> how many were STILL IN FLIGHT when the budget ran out
 *
 * ⚠ A DATASET THAT DID NOT ARRIVE IN TIME IS STILL A DATASET THAT DID NOT ARRIVE, and this pipeline
 * has never silently pretended otherwise — the `missing` list is printed to the reader. `jobs` is a
 * list of promises whose whole purpose is to fill `got.*`; one that has not settled has filled
 * nothing, so this returns the count and the caller says so in the same 「取得不可」 line every other
 * absent dataset appears in. */
export function settleWithin(jobs, ms) {
  return new Promise((res) => {
    const n = jobs.length;
    if (!n) return res(0);
    let done = 0;
    const tm = setTimeout(() => res(n - done), ms);
    jobs.forEach((p) => { Promise.resolve(p).catch(() => {}).then(() => { done++; if (done >= n) { clearTimeout(tm); res(0); } }); });
  });
}

/* the reader-facing line for the ones that did not arrive — nine languages, like every other
   string the analyze footer prints */
export function lateNote(n, ms) {
  let L = null;
  try { L = window.IntMapLang.pick(); } catch (_) { L = null; }
  const en = '{n} source(s) did not answer within {s}s';
  const s = L
    ? L(en, '{n}件の取得先が{s}秒以内に応答しなかった', '{n} Quelle(n) antworteten nicht innerhalb von {s}s',
      '{n} источник(ов) не ответили за {s}с', '{n} fuente(s) no respondieron en {s}s')
    : en;
  return String(s).replace('{n}', n).replace('{s}', Math.round(ms / 1000));
}

/* makeFetchJSON(turnSignal) -> async (url, budgetMs) -> parsed JSON | null
 *
 * ⚠⚠⚠ EVERY EVIDENCE FETCH ATLAS MAKES CAME THROUGH HERE, AND NOTHING BOUNDED IT. This was the
 * second private copy of the pre-#R212 relay ladder: three relays walked one after another at 9 s
 * each, with the deadline cleared as soon as the HEADERS arrived — so `r.json()` on a stalled body
 * was outside every clock the function appeared to have. `analyze` fires half a dozen of these,
 * `runTurn` may run 32 tool calls, and each tool call is awaited on its own line, so one relay
 * having a bad afternoon was enough for a turn never to come back.
 *
 * ⚠ `direct: true` because these hosts (GDELT, USGS, IMF, Wikipedia REST) DO send ACAO when they
 * answer at all. The browser-visible 「CORS 拒否」 on api.gdeltproject.org is its 429, which carries
 * no ACAO header — and that refusal costs nothing, because it rejects before a byte moves.
 *
 * ⚠⚠ THE TURN'S OWN Stop REACHES THE NETWORK THROUGH `turnSignal`. Atlas builds an AbortController
 * for every turn and hands it to the model call and to the executor; the evidence fetches — the
 * slowest thing in the turn by an order of magnitude — never saw it. So 停止 changed the bubble and
 * nothing else, and asking the question a second time did not REPLACE the first attempt, it ADDED
 * to it. It is a thunk rather than a signal because the controller is installed when a turn starts,
 * and a value captured at wiring time would belong to no turn at all. */
export function makeFetchJSON(turnSignal) {
  return async function _fetchJSON(url, budgetMs) {
    /* (#R276) …except Open-Meteo: CORS-open and rate-limited, so it goes through the app's ONE
       guarded client (js/wx-source.js), which owns its cache, its dedupe and its 429 breaker. */
    try { if (window.IntMapWx && window.IntMapWx.isOpenMeteo(url)) return await window.IntMapWx.guardedJSON(url, 300000); } catch (_) { /* fall through to the ladder */ }
    const txt = await fetchViaProxy(url, {
      as: 'json', direct: true,
      budgetMs: (budgetMs || ATLAS_BUDGETS.EVIDENCE_BUDGET_MS),
      signal: (typeof turnSignal === 'function') ? turnSignal() : undefined,
    });
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (_) { return null; }
  };
}
