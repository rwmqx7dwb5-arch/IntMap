/*  IntMap · The one Overpass client
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ WHY THIS IS A FILE AND NOT A COPY OF THE SAME LOOP IN EVERY CALLER.
 *
 *  Every feature that asks OpenStreetMap «what is inside this box» asks an Overpass API server, and
 *  each of them used to carry its own mirror list and its own loop over it. Two of those loops —
 *  the historical-network router (js/routing-ops.js) and the drone pre-flight's restricted-area
 *  check (js/drone-ops.js) — were the same four lines with NO CLOCK AT ALL, walking the three
 *  mirrors one after another and waiting for each one for as long as it chose to take.
 *
 *  MEASURED on the nightly deep run, 2026-09: the three mirrors answered 504 after 12 s, 102 s and
 *  93 s. A walk with no deadline therefore took 207 s to say «no», and the route search and the
 *  drone plan sat on 「読み込み中」 for that long; the specs that pin them ran out of time before
 *  they could reach the line that says «Overpass is unreachable from this runner, skip». Measured
 *  again from this machine the same week, for the Bedford–Cambridge rail corridor the router asks:
 *  overpass-api.de answered 200 with 955 KB in 6.1 s (0.95 s of it the body), overpass.kumi.systems
 *  answered 504 after 44.9 s, and overpass.private.coffee had not answered at all after 130 s.
 *  One healthy mirror answers in seconds; a sick one does not answer in minutes.
 *
 *  ══ THE CLOCK, AND WHERE ITS NUMBER COMES FROM ════════════════════════════════════════════════
 *  An Overpass query states its own time limit: `[timeout:N]` is the number of seconds the server
 *  may spend on it before it gives up and says so (Overpass QL «timeout:», default 180 when absent).
 *  That is the caller's own statement of how long this answer is worth, so it is the WHOLE budget
 *  of a call — across all mirrors, not per mirror. Walking three mirrors at N each is exactly how
 *  207 s happened: the declared minute had been multiplied by the number of servers.
 *
 *      budget  = N s + BODY_SLACK_MS            (a caller may LOWER it with `budgetMs`, never raise it)
 *      patience = budget / number of endpoints   (sequential calls; `race` makes it 0)
 *
 *  ⚠ BODY_SLACK_MS is the time the client needs after the server is done — the response body in
 *  transit. OBSERVED: 0.95 s for the 955 KB corridor above, the largest answer the app asks for
 *  (`out geom 6000`); 5 s is that with a margin for a slow link. EXPIRES if a caller starts asking
 *  for answers an order of magnitude larger. It lives here and nowhere else.
 *
 *  ══ WHAT HAPPENS WHEN A MIRROR DOES NOT ANSWER ══════════════════════════════════════════════════
 *  A mirror that has not answered within its `patience` is not abandoned — the NEXT mirror is
 *  started beside it and whichever answers first wins (the others are aborted). A mirror that fails
 *  in a way that is OBSERVED — a refusal, a non-2xx status, a body that is not JSON, a 200 whose
 *  `remark` says «runtime error» (the server timed out or ran out of memory and the elements are a
 *  fragment), or an answer the caller's `accept` rejects — hands over to the next one at once.
 *  Each of those is a different server doing the same work, not the same request made twice
 *  (.agents/rules/one-pass-or-a-reason.md §5). A slow-but-healthy first mirror still has the whole
 *  budget to finish; a dead one costs `patience`, not minutes.
 *
 *  When every endpoint has failed, or the budget is spent, the call THROWS an error whose name is
 *  `OverpassUnavailable` and whose `attempts` say what each server did. That is a different answer
 *  from an empty `elements` array: «OpenStreetMap has nothing here» and «OpenStreetMap could not be
 *  asked» must never reach the reader as the same thing (the drone planner, for one, prints
 *  「この経路は照合を行えていません」 for the second and nothing at all for the first).
 *
 *  ⚠ ONE EXPORT. The mirror list is published on it (`overpassQuery.mirrors`) because no other file
 *  may spell an Overpass endpoint — tests/nightly-deep-red-checks.test.mjs counts that from the
 *  sources, so another copy of the loop cannot come back quietly.
 */
import { jsonWithin } from './fetch-deadline.js';   /* the clock that also covers the body */

export const overpassQuery = (() => {
  /* the public OSM Overpass instances the app has always used, in the order it has always tried them */
  const MIRRORS = Object.freeze([
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ]);
  /* OpenHistoricalMap runs the same Overpass software over the historical database (one instance) */
  const OHM = Object.freeze(['https://overpass-api.openhistoricalmap.org/api/interpreter']);
  /* (own-fetch-relay) there is no public-CORS-proxy rung: it sent the whole query, as a GET, to a
     third party (corsproxy.io). Every Overpass mirror answers CORS itself. */
  const OVERPASS_DEFAULT_TIMEOUT_S = 180;   /* Overpass QL's own default for a query with no [timeout:] */
  const BODY_SLACK_MS = 5000;               /* see the header: observed 0.95 s for the largest answer */

  const declaredMs = (q) => {
    const m = /\[timeout:(\d+)\]/.exec(String(q || ''));
    return (m ? +m[1] : OVERPASS_DEFAULT_TIMEOUT_S) * 1000;
  };
  const hostOf = (u) => { try { return new URL(u).host; } catch (_) { return String(u); } };
  const reasonOf = (e) => String((e && e.message) || e || 'failed').slice(0, 120);

  /* overpassQuery(q, opt) -> the parsed Overpass JSON
   *
   *   q               an Overpass QL query, ideally starting `[out:json][timeout:N];`
   *   opt.race        start every endpoint at once (patience 0) — for callers that have always raced
   *   opt.budgetMs    a caller whose reader cannot wait the query's declared time may LOWER the budget
   *   opt.accept(j, via)  a caller-specific test of whether an answer is usable (`via` is 'mirror');
   *                   false moves to the next endpoint
   *   opt.historical  ask OpenHistoricalMap's Overpass instead of OpenStreetMap's
   *
   * THROWS `OverpassUnavailable` (with `.attempts`) when nothing usable arrived. */
  function overpassQuery(q, opt) {
    opt = opt || {};
    const body = 'data=' + encodeURIComponent(q);
    const targets = (opt.historical ? OHM : MIRRORS).map((u) => ({ url: u, via: 'mirror', init: { method: 'POST', body } }));
    const declared = declaredMs(q) + BODY_SLACK_MS;
    const budget = (+opt.budgetMs > 0) ? Math.min(+opt.budgetMs, declared) : declared;
    const patience = opt.race ? 0 : budget / targets.length;
    const accept = (typeof opt.accept === 'function') ? opt.accept : null;
    const t0 = Date.now();

    return new Promise((resolve, reject) => {
      const attempts = [], ctls = [];
      let next = 0, running = 0, settled = false, hedge = null;
      const budgetTimer = setTimeout(() => fail('budget of ' + budget + ' ms spent'), budget);
      const stop = () => {
        settled = true; clearTimeout(budgetTimer); if (hedge) clearTimeout(hedge);
        ctls.forEach((c) => { try { c && c.abort(); } catch (_) { /* already finished */ } });
      };
      function fail(why) {
        if (settled) return;
        attempts.forEach((a) => { if (!a.error && !a.ok) a.error = why; });
        stop();
        const e = new Error('Overpass did not answer — ' + (attempts.map((a) => a.host + ': ' + a.error).join('; ') || why));
        e.name = 'OverpassUnavailable'; e.attempts = attempts;
        reject(e);
      }
      function launch() {
        if (settled || next >= targets.length) return;
        const t = targets[next++];
        const c = (typeof AbortController === 'function') ? new AbortController() : null;
        ctls.push(c);
        const rec = { host: hostOf(t.url), startedMs: Date.now() - t0, error: null, ok: false };
        attempts.push(rec);
        running++;
        const left = Math.max(1, budget - (Date.now() - t0));
        jsonWithin(t.url, left, Object.assign({}, t.init, c ? { signal: c.signal } : {}))
          .then((j) => {
            if (j && /runtime error/i.test(String(j.remark || ''))) throw new Error('partial answer: ' + String(j.remark).slice(0, 80));
            if (!j || !Array.isArray(j.elements)) throw new Error('no elements in the answer');
            if (accept && !accept(j, t.via)) throw new Error('answer not usable by the caller');
            if (settled) return;
            rec.ok = true; rec.ms = Date.now() - t0;
            stop(); resolve(j);
          })
          .catch((e) => { if (!rec.ok) rec.error = settled ? (rec.error || 'aborted') : reasonOf(e); })
          .then(() => {
            running--;
            if (settled) return;
            if (next < targets.length) { launch(); return; }   /* an observed failure: the next server, now */
            if (running === 0) fail('every endpoint failed');
          });
        /* and if this one has not answered within its patience, the next one starts beside it */
        if (hedge) clearTimeout(hedge);
        hedge = (next < targets.length) ? setTimeout(launch, patience) : null;
      }
      launch();
    });
  }
  overpassQuery.mirrors = MIRRORS;
  /* the SAME function, published for the files that are shaped as classic scripts (their node checks
     evaluate them with `new Function`, where an `import` cannot parse) — js/nominatim-gate.js does
     the same for the same reason. src/main.js imports this file so the publish exists at boot. */
  try { window.IntMapOverpass = overpassQuery; } catch (_) { /* non-browser (the node checks) */ }
  return overpassQuery;
})();
