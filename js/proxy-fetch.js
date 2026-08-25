/*  IntMap · Fetching a document through a CORS proxy  (#R212)
 *
 *  Lifted out of js/app-body.js, which is at its #R200 line ceiling and whose subject is not
 *  «how to get an RSS document from a host that sends no ACAO header».
 *
 *  ══ A RACE WITH NO CLOCK IS NOT A RACE ═════════════════════════════════════════════════════════
 *  「ニュースが表示されるまでが遅い。ずっと読み込み中。」 MEASURED on a real load of this build:
 *  corsproxy.io answered in 4 ms with a valid 203 KB feed, api.allorigins.win took 19.5 s and
 *  api.codetabs.com 20.0 s — and neither was ever given up on. `Promise.any` resolves on the first
 *  SUCCESS, so a good day was fine; the bad day is what the report describes. When the fast proxy is
 *  the one that fails, the race waits ~20 s for the slow two, and the sequential fallback then re-ran
 *  ALL THREE with no timeout either (a measured 35.5 s for one of them). Minutes of 「読み込み中」,
 *  with the sockets held the whole time — a phone has six per host, and #R201 measured what queued
 *  connections do to the imagery.
 *
 *  So: every attempt carries a deadline, the losers are ABORTED the moment one wins, and the
 *  fallback is one bounded pass. WHICH proxies are used is unchanged; they are simply given a clock.
 *
 *  ⚠ ONE EXPORT, and everything else is inside it. tests/r175-checks ③ requires that a js/ module has
 *  no unexported top-level declaration AND no export nobody imports — so the constants and the two
 *  helpers live in the closure rather than becoming five names the rule would have to police.
 */
export const fetchViaProxy = (() => {
  /* ══ (#R214) WHY THERE IS A FOURTH ONE, AND WHY IT IS THE ODD ONE OUT ═══════════════════════════
     「日本語版でニュースが表示されない。ずっと読み込み中。」 Measured FROM THE PAGE (#R188), same
     build, same second, the two WORLD feeds side by side through the three proxies above:

        feed        allorigins      corsproxy.io                      codetabs
        en-US       timeout 9 s     200 · 171 KB · valid RSS · 5 ms   timeout 9 s
        ja-JP       timeout 9 s     503 · Google's "Sorry..." page    timeout 9 s

     So it was never the app's Japanese path: GOOGLE serves the en-US edition to that proxy's egress
     and refuses the ja/JP one — its bot interstitial, byte-identical (2,041 B) for WORLD, BUSINESS,
     the plain feed and search. With the only reachable proxy blocked for that ONE locale, the race
     had nothing left to win with, and a Japanese reader waited out the full ~40 s of deadlines to be
     told it failed. ⚠ A proxy that works is not a proxy that works FOR EVERY TARGET.

     proxy.corsfix.com answers all five editions with real RSS and the right locale in the titles
     (jp 238 ms / en 537 / de 857 / ru 742 / es 1,277 ms, measured in that order on this build).
     ⚠ IT TAKES THE URL RAW. Handed an encodeURIComponent'd one it returns 400 with a 247-byte body —
     which is why this list is a list of FUNCTIONS and not a list of prefixes. */
  /* ══ ⚠⚠ (#R216) …AND THE FOURTH ONE WAS VERIFIED ON THE WRONG ORIGIN ═══════════════════════════
     Reported a third time, word for word. #R214's table above was taken on `http://127.0.0.1`.
     Re-measured from the REAL site (`https://rwmqx7dwb5-arch.github.io`), same build, same second:

        proxy.corsfix.com  → 403  {"corsfix_error":"domain_not_registered"}   255 ms
        corsproxy.io       → 503  Google's "Sorry…" page (ja-JP only)         8.1 s
        api.allorigins.win → timeout                                          >20 s
        api.codetabs.com   → timeout                                          >20 s

     corsfix authorises by CALLING ORIGIN — localhost is allowed by default and a deployed domain
     has to be registered with them — so the one relay that could read Japanese worked in
     development and was refused in production. Every Japanese reader of the live site waited out
     the full ~40 s of deadlines and was told it failed. ⚠ A relay verified from localhost is not a
     relay verified for the site; the origin is part of the request.

     The first entry is now OUR OWN Edge Function (supabase/functions/news-relay), the same answer
     #R145 gave for the Street-View tiles and #R190 for the submarine cables: fetch it server-side,
     where browser CORS does not apply, and hand it back with ACAO. Measured from production —
     jp 1,111 ms / 70 items, en 1,308 / 45, de 1,145 / 70, ru 1,326 / 70, es 1,290 / 70. The four
     public relays stay BEHIND it: a cold function or a Supabase outage still falls back to exactly
     the behaviour this file had before.
     ⚠ `window.SUPABASE_URL` is read AT CALL TIME, not when this module is evaluated — src/vendor.js
     may not have run yet, and a base captured as '' would delete the relay for the whole session. */
  const PUBLIC_PROXIES = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    (u) => `https://proxy.corsfix.com/?${u}`,
    (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  ];
  /* the relay only forwards news.google.com/rss/… (it is an allow-list, not an open proxy), so it
     is offered only for the URLs it will actually answer */
  const relayable = (u) => /^https:\/\/news\.google\.com\/rss\//.test(String(u || ''));
  const proxiesFor = (u) => {
    let base = '';
    try { base = String(window.SUPABASE_URL || '').replace(/\/$/, ''); } catch (_) { base = ''; }
    return (base && relayable(u))
      ? [(x) => `${base}/functions/v1/news-relay?u=${encodeURIComponent(x)}`, ...PUBLIC_PROXIES]
      : PUBLIC_PROXIES;
  };
  const PROXY_TIMEOUT_MS = 8000;      /* one attempt's deadline */
  const PROXY_FALLBACK_MS = 6000;     /* …and the second, bounded pass */
  const BUDGET_MS = 20000;            /* (#R446) …and what the WHOLE ladder may cost, end to end */
  const DIRECT_TIMEOUT_MS = 6000;     /* (#R452) the host itself, for the callers that may read it */

  /* ⚠⚠⚠ (#R452) THE CLOCK HAS TO COVER THE BODY, AND IT DID NOT. `clearTimeout` ran in a `.finally`
     on the `fetch` promise — i.e. THE MOMENT THE HEADERS ARRIVED — so a relay that answered 200 and
     then stalled halfway through the body had nothing left to abort it. Measured on the live site:
     api.allorigins.win returns its headers for a Google News feed in ~8.7 s (the deadline is 8 s)
     and its body some time after that; every millisecond of the read was outside the deadline that
     was supposed to bound this call. The read is now INSIDE the clock, which is why this helper
     hands back the TEXT rather than a Response nobody is holding a timer for. */
  const fetchDeadline = (u, ms, ctl) => {
    const c = ctl || new AbortController();
    const t = setTimeout(() => { try { c.abort(); } catch (_) { /* already done */ } }, ms);
    return fetch(u, { signal: c.signal })
      .then((r) => { if (!r.ok) throw new Error('bad status ' + r.status); return r.text(); })
      .finally(() => clearTimeout(t));
  };
  const isFeed = (txt) => !!txt && (txt.includes('<rss') || txt.includes('<feed'));

  /* ══ ⚠⚠⚠ (#R446) THE ONLY ANSWER THIS FILE ACCEPTED WAS A FEED, AND ONE CALLER ASKS FOR A PAGE ══
     js/article-reader.js's second strategy hands `item.link` — a news ARTICLE's URL — to this
     function and parses the result as HTML. An article page contains neither `<rss` nor `<feed`, so
     `isFeed` refused it; Strategy 2 could not succeed, it could only take twenty seconds to fail.

     MEASURED from the live site (https://rwmqx7dwb5-arch.github.io, 2026-08-25), the two article
     URLs on the front page that day, through this exact ladder:

        corsfix       403                                                    986 ms / 320 ms
        corsproxy.io  200 · text/html · 217,509 B (dw.com)   → «not feed»   3,362 ms
        corsproxy.io  200 · text/html · 198,238 B (aljazeera) → «not feed»  1,087 ms
        allorigins    aborted at its 8 s deadline
        codetabs      aborted at its 8 s deadline
        …then the bounded pass fetched the SAME page again (8 ms / 21 ms, from the HTTP cache) and
        rejected it a second time.
        TOTAL 20,313 ms and 20,355 ms — and `null` both times.

     The article arrived, twice, and was thrown away, twice.

     ⚠⚠ AND THE FIX IS NOT «ACCEPT WHATEVER CAME BACK». #R216 made news-relay answer 502 for
     Google's HTML interstitial on the grounds that 「an interstitial is not a feed」; the same rule
     holds one layer out. A relay's own error page IS HTML, and a reader that draws somebody else's
     error message as the article body is worse than a reader that says it could not fetch one —
     #R446 measured that exact failure happening already, in the reader's FIRST strategy.
     So `as:'html'` accepts an HTML DOCUMENT THAT IS NOT A STUB, and nothing else:

       · it declares itself HTML (`<!doctype html` / `<html`) — which is also what rules out the
         relays' JSON error envelopes, measured at 314 B of `{"corsfix_error":…}`;
       · it is at least HTML_MIN_BYTES long — measured, the relay and interstitial bodies are
         314 B, 2,041 B (#R216's Google 「Sorry…」 page) and 7,594 B, and the two real articles were
         198,238 B and 217,509 B;
       · it carries the markup the caller actually reads — a `<p>` or a description meta. A document
         with neither cannot yield a single block, so accepting it would hand back an "answer" that
         is empty by construction.

     ⚠ WHAT THIS DOES NOT CLAIM. «Is there an ARTICLE in this page» is the caller's question, and
     the caller already asks it: js/article-reader.js requires two paragraphs of >40 characters
     before it calls the extract a body, and falls back to the page-embed mode when it cannot. This
     predicate answers only 「is this a page, or is it the relay apologising」. The non-2xx shapes
     never reach it at all — measured, every relay failure above came with 403 / 404 / 530. */
  const HTML_MIN_BYTES = 4096;
  const isHTML = (txt) => {
    if (!txt || txt.length < HTML_MIN_BYTES) return false;
    if (!/<!doctype\s+html|<html[\s>]/i.test(txt)) return false;
    return /<p[\s>]/i.test(txt) || /<meta[^>]+(?:og:description|name=["']description)/i.test(txt);
  };
  /* (#R452) …and the same question once more for the callers that want DATA rather than a document:
     a relay's error envelope is JSON-shaped prose or HTML, and must not be handed back as the JSON
     the caller asked for. Parsing is the only honest test of «is this JSON», and these bodies are
     kilobytes. */
  const isJSON = (txt) => { try { const v = JSON.parse(txt); return !!v && typeof v === 'object'; } catch (_) { return false; } };
  const ACCEPT = { feed: isFeed, html: isHTML, json: isJSON };

  /* fetchViaProxy(url, opts) -> the document as TEXT, or null
   *
   *   opts.as        'feed' (default) | 'html' | 'json'  — what counts as an answer rather than an
   *                  error page
   *   opts.budgetMs  what the whole ladder may cost, end to end (default 20 s)
   *   opts.direct    try the host ITSELF first, before the relays (#R452) — for hosts a browser may
   *                  read. A CORS refusal costs nothing: it rejects before a byte moves.
   *   opts.signal    the caller's AbortSignal — Stop, or a superseding turn (#R452)
   *
   * ⚠⚠ (#R452) `opts.signal` IS NOT DECORATION. Atlas builds an AbortController for every turn and
   * hands it to the model call and to the executor, but the EVIDENCE fetches never saw it — so
   * asking a second question did not REPLACE the first attempt, it ADDED to it: measured on the
   * live site, a superseded call ran 12.6 s more and returned 200, and requests were still going
   * out 280 s after the reader's last message.
   *
   * ⚠⚠ (#R446) THE BUDGET IS WHY THE READER PANE CAN STOP SAYING 「読み込み中」. Before it, this
   * function's floor was 「one 8 s race, then up to four 6 s retries」 — a measured 20.3 s to answer
   * `null`, on top of the 12 s Strategy 1 had already spent. A caller that names a budget now finds
   * out, inside it, whether it got a document. */
  return async function fetchViaProxy(url, opts) {
    const o = opts || {};
    const okDoc = ACCEPT[o.as] || isFeed;
    const budget = (o.budgetMs > 0) ? o.budgetMs : BUDGET_MS;
    const t0 = Date.now();
    const outer = o.signal || null;
    const left = () => ((outer && outer.aborted) ? 0 : budget - (Date.now() - t0));

    if (outer && outer.aborted) return null;
    /* ⚠ (#R452) EVERY attempt this call makes is registered here — the direct one, the racers and
       the fallback pass alike — so the caller's Stop reaches whichever of them is in flight. A
       signal that only cancels the attempt someone remembered to wire it to is not a Stop. */
    const ctlsAll = [];
    const relayAbort = () => { ctlsAll.forEach((c) => { try { c.abort(); } catch (_) { /* already done */ } }); };
    if (outer) { try { outer.addEventListener('abort', relayAbort); } catch (_) { /* no listener support */ } }
    const mk = () => { const c = new AbortController(); ctlsAll.push(c); return c; };

    try {
      /* (#R452) the host itself, when the caller says a browser is allowed to read it */
      if (o.direct) {
        try {
          const txt = await fetchDeadline(url, Math.min(DIRECT_TIMEOUT_MS, left()), mk());
          if (okDoc(txt)) return txt;
        } catch (_) { /* CORS, a status, or the clock — the relays are next either way */ }
      }
      if (left() <= 0) return null;
      return await race(proxiesFor(url), url, okDoc, left, mk);
    } finally {
      if (outer) { try { outer.removeEventListener('abort', relayAbort); } catch (_) { /* nothing to remove */ } }
    }
  };

  /* the race, and the one bounded pass behind it */
  async function race(PROXIES, url, okDoc, left, mk) {
    const ctls = PROXIES.map(() => mk());
    const attempts = PROXIES.map((make, i) => (async () => {
      /* ⚠ each racer still has its own clock, which is what #R212 put here; what is new is that the
         clock cannot outlast the budget the CALLER named, or a 3 s budget would still sit through an
         8 s attempt. */
      const txt = await fetchDeadline(make(url), Math.min(PROXY_TIMEOUT_MS, left()), ctls[i]);
      if (!okDoc(txt)) throw new Error('not the document that was asked for');
      return txt;
    })());
    try {
      const won = await Promise.any(attempts);
      ctls.forEach((c) => { try { c.abort(); } catch (_) { /* the losers are of no further use */ } });
      return won;
    } catch (_) {
      /* one bounded pass, for the case where all three rejected quickly (a transient blip) —
         and only for as long as the budget this call was given still has room in it */
      for (const make of PROXIES) {
        if (left() <= 0) break;
        try {
          const txt = await fetchDeadline(make(url), Math.min(PROXY_FALLBACK_MS, left()), mk());
          if (okDoc(txt)) return txt;
        } catch (__) { /* try the next one */ }
      }
      return null;
    }
  }
})();
