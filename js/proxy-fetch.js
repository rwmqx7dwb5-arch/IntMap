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
 *  ⚠ TWO EXPORTS, and everything else is inside the first. tests/r175-checks ③ requires that a js/
 *  module has no unexported top-level declaration AND no export nobody imports — so the constants
 *  and the helpers live in the closure rather than becoming names the rule would have to police.
 *
 *  ══ ⚠⚠⚠ (own-fetch-relay) THERE ARE NO PUBLIC PROXIES IN THIS FILE ANY MORE, AND NONE ANYWHERE ELSE ════════
 *  Everything below that measures corsproxy.io, api.allorigins.win, api.codetabs.com and
 *  proxy.corsfix.com is history: those four were raced behind our own relays until own-fetch-relay, and
 *  copied by hand into seventeen more files. They are gone because of what they were, not only
 *  because of how often they failed — every document they returned had passed through a stranger
 *  who could see which URL the reader asked for and rewrite what came back, and that included the
 *  articles and the evidence Atlas cites. What replaced them is OUR OWN relays, each an allow-list:
 *  the specialised ones in OWN_RELAYS below, and supabase/functions/fetch-relay for everything
 *  else a caller needs and cannot read directly — whose list is
 *  supabase/functions/_shared/fetch-relay-policy.js, imported here as it is there, so the page and
 *  the function cannot disagree about what is relayable (the #R803 shape).
 *  A URL no relay of ours admits goes to the host itself (when the caller allows that) and
 *  nowhere else. tests/own-fetch-relay-checks.test.mjs discovers what the callers hand this
 *  file and fails when a caller that depends on a relay names an upstream no relay admits.
 */
import { fetchRelayRule, FETCH_RELAY_FUNCTION, ARTICLE_RULE, articleUrlAllowed, looksLikeArticle, ARTICLE_MIN_BYTES } from '../supabase/functions/_shared/fetch-relay-policy.js';

export const { fetchViaProxy, ownRelayUrl } = (() => {
  /* ══ (#R214 / #R216 / own-fetch-relay) HOW THE PUBLIC PROXIES FAILED, KEPT BECAUSE IT IS WHY THEY ARE GONE ══
     「日本語版でニュースが表示されない。ずっと読み込み中。」 Measured FROM THE PAGE (#R188), the two WORLD
     feeds side by side through the public relays this file used to race:

        feed        allorigins      corsproxy.io                      codetabs
        en-US       timeout 9 s     200 · 171 KB · valid RSS · 5 ms   timeout 9 s
        ja-JP       timeout 9 s     503 · Google's "Sorry..." page    timeout 9 s

     GOOGLE served the en-US edition to that proxy's egress and refused the ja/JP one. #R214 added
     proxy.corsfix.com, verified on 127.0.0.1; from the REAL site (#R216) it answered 403
     {"corsfix_error":"domain_not_registered"} — it authorises by calling origin. ⚠ A relay that
     works is not a relay that works FOR EVERY TARGET, and a relay verified from localhost is not a
     relay verified for the site.
     #R216's answer was OUR OWN Edge Function (supabase/functions/news-relay), the same answer #R145
     gave for the Street-View tiles and #R190 for the submarine cables: fetch it server-side and hand
     it back with ACAO. Measured from production — jp 1,111 ms / 70 items, en 1,308 / 45, de 1,145 /
     70, ru 1,326 / 70, es 1,290 / 70. The public relays stayed BEHIND it until own-fetch-relay, which removed
     them (see the header): they were the only rung on which a third party read the reader's request.
     ⚠ `window.SUPABASE_URL` is read AT CALL TIME, not when this module is evaluated — src/vendor.js
     may not have run yet, and a base captured as '' would delete the relays for the whole session. */
  /* (#R533) OUR OWN RELAYS, AND THE URLS EACH ONE WILL ACTUALLY ANSWER.
     Every one of these is an allow-list on its own side rather than an open proxy, so offering one
     a URL it will refuse only spends a round trip to earn a 400. This table is therefore the
     browser-side half of a rule the function already enforces — and (own-fetch-relay) whether the two halves
     agree is no longer a promise: tests/own-fetch-relay-checks.test.mjs takes every URL the
     callers build, routes it through this table and EVALUATES the relay it lands on.
     fetch-relay's row is not a copy at all — it asks the policy file the function itself reads.

     ⚠ IT IS A TABLE BECAUSE IT STOPPED BEING ONE CASE. It was written as a single `relayable()`
     regex for news.google.com, and when the Companies tab needed the same treatment for its share
     prices the shape of the mistake was to give that tab its own private proxy ladder instead
     (js/companies.js, removed in #R533: three entries, no deadline, no race, and both of its
     public relays down at once on the live site). A second caller is not a special case; it is the
     evidence that the first one was never one either.
     ⚠ (own-fetch-relay) news-relay's row is the two SHAPES the function forwards, not the `/rss/` prefix: the
     prefix also matched `/rss/articles/…`, the redirect every Google News item links to, which the
     function refuses — so the article reader was offering it a URL it could only answer with 400.
     `ms` is the clock one attempt gets: a relay whose upstream is slow is not raced at 8 s. */
  /* (own-fetch-relay) what an attempt at a relay costs on top of that relay's own upstream deadline — the same
     three seconds #R464 put between gdelt-relay's 25 s upstream clock and OWN_RELAY_TIMEOUT_MS below.
     Declared before the table that reads it (#R545: a hoisting question is answered by the source,
     not by when somebody happens to call it). */
  const RELAY_ROUND_TRIP_MS = 3000;
  const OWN_RELAYS = [
    { fn: 'news-relay',   test: (u) => /^https:\/\/news\.google\.com\/rss\/(?:search\?|headlines\/section\/topic\/[A-Z][A-Z_]{1,31}(?:\?|$))/.test(u) },
    { fn: 'quotes-relay', test: (u) => /^https:\/\/query[12]\.finance\.yahoo\.com\/v8\/finance\/(?:spark\?|chart\/)/.test(u) },
    { fn: 'cable-geo',    test: (u) => /^https:\/\/www\.submarinecablemap\.com\/api\/v3\/(?:cable\/cable-geo|landing-point\/landing-point-geo)\.json$/.test(u) },
    { fn: 'sv-cov',       test: (u) => /^https:\/\/mts[0-3]\.google\.com\/vt\?(?=(?:[^#]*&)?lyrs=svv(?:&|$))[^#]*$/.test(u) },
    { fn: FETCH_RELAY_FUNCTION, test: (u) => !!fetchRelayRule(u), ms: (u) => { const r = fetchRelayRule(u); return r ? r.timeoutMs + RELAY_ROUND_TRIP_MS : 0; } },
  ];
  const supaBase = () => { try { return String(window.SUPABASE_URL || '').replace(/\/$/, ''); } catch (_) { return ''; } };
  /* (own-fetch-relay) `as` is the caller's: an `as:'html'` call for a URL no listed relay admits is offered
     fetch-relay's ARTICLE rule (`&as=article`) — the one rule with no host list, asked for only by
     the caller that parses an article page (js/article-reader.js). Any other `as` never reaches it. */
  const proxiesFor = (u, as) => {
    const base = supaBase();
    if (!base) return [];
    const s = String(u || '');
    const mine = OWN_RELAYS.filter((r) => r.test(s));
    if (!mine.length && as === 'html' && articleUrlAllowed(s)) {
      return [withClock((x) => `${base}/functions/v1/${FETCH_RELAY_FUNCTION}?as=article&u=${encodeURIComponent(x)}`, ARTICLE_RULE.timeoutMs + RELAY_ROUND_TRIP_MS)];
    }
    return mine.map((r) => withClock((x) => `${base}/functions/v1/${r.fn}?u=${encodeURIComponent(x)}`, r.ms ? r.ms(s) : 0));
  };
  /* a builder that carries its own attempt clock (0 = the ordinary racer's) */
  function withClock(make, ms) { make.ms = ms > 0 ? ms : 0; return make; }
  /* ══ ⚠⚠⚠ (#R464) GDELT HAS ITS OWN RELAY, AND IT IS NOT IN THE RACE ABOVE ═══════════════════════
     news-relay can ride inside `race()` because Google News answers in ~700 ms, comfortably inside
     one racer's 8 s. gdelt-relay cannot: on a cache MISS it is waiting on api.gdeltproject.org,
     whose fastest measured response of any kind is 10.7 s. Raced at 8 s it would be aborted every
     time the cache was cold — i.e. exactly when the upstream read that FILLS the cache is in
     flight — and the cache would never warm. So it is tried first, alone, with a clock sized to the
     thing it is actually waiting for.

     ⚠ AND IT IS TRIED BEFORE `direct`, WHICH IS THE OPPOSITE OF THE OTHER HOSTS. Measured from the
     live site, 18 direct attempts at GDELT: 4 succeeded (22.2%), median success 17,454 ms. Trying
     that first would spend the budget on a coin-flip before asking the cache that answers in
     ~0.6 s. Direct stays BEHIND it, unchanged in spirit from DECISIONS.md's point that a reader's
     own IP is a real second chance when our own relay is down. */
  const gdeltRelayable = (u) => /^https:\/\/api\.gdeltproject\.org\/api\/v2\/doc\/doc(\?|$)/.test(String(u || ''));
  const ownRelay = (u) => {
    const base = supaBase();
    return (base && gdeltRelayable(u)) ? `${base}/functions/v1/gdelt-relay?u=${encodeURIComponent(u)}` : '';
  };
  const PROXY_TIMEOUT_MS = 8000;      /* one attempt's deadline */
  const PROXY_FALLBACK_MS = 6000;     /* …and the second, bounded pass */
  const BUDGET_MS = 20000;            /* (#R446) …and what the WHOLE ladder may cost, end to end */
  const DIRECT_TIMEOUT_MS = 6000;     /* (#R452) the host itself, for the callers that may read it */
  /* (#R464) our own relay's, which has to cover ITS upstream deadline (25 s) plus the round trip —
     a shorter clock here would abort precisely the cold-miss reads that make the cache worth having */
  const OWN_RELAY_TIMEOUT_MS = 28000;
  /* ⚠ (#R464) …AND THE DIRECT DEADLINE IS PER HOST, BECAUSE 6 s IS A DEADLINE FOR HOSTS THAT ANSWER
     QUICKLY. Measured from the live site, 18 direct attempts at GDELT: median SUCCESS 17,454 ms,
     fastest response of any kind 10.7 s. Six seconds could not reach it even once — the direct
     attempt was structurally guaranteed to fail, and the 6.1 / 7.0 / 6.7 s in the production report
     are this deadline firing rather than anything about GDELT. The knowledge lives here, in the one
     module that already knows which hosts have their own relay, so no caller has to carry it. */
  const GDELT_DIRECT_MS = 18000;
  const directMsFor = (u) => (gdeltRelayable(u) ? GDELT_DIRECT_MS : DIRECT_TIMEOUT_MS);

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
  /* (own-fetch-relay) the predicate lives in the policy file, because fetch-relay's article rule applies the
     SAME test before it hands a page back — one definition, two readers. */
  const HTML_MIN_BYTES = ARTICLE_MIN_BYTES;
  const isHTML = looksLikeArticle;   /* its floor is HTML_MIN_BYTES, the same number */
  /* (#R452) …and the same question once more for the callers that want DATA rather than a document:
     a relay's error envelope is JSON-shaped prose or HTML, and must not be handed back as the JSON
     the caller asked for. Parsing is the only honest test of «is this JSON», and these bodies are
     kilobytes. */
  const isJSON = (txt) => { try { const v = JSON.parse(txt); return !!v && typeof v === 'object'; } catch (_) { return false; } };
  /* (own-fetch-relay) …and for the one caller whose document is neither: CelesTrak's element sets are plain
     text (js/satellites-live.js parses them, and refuses what does not parse). Before own-fetch-relay the
     error pages this acceptor could not tell apart came from the public relays, which answered 200
     with their own apologies; every rung that is left is ours or the host's, and both answer a
     failure with a status, which fetchDeadline already refuses. */
  const isText = (txt) => typeof txt === 'string' && txt.length > 0;
  const ACCEPT = { feed: isFeed, html: isHTML, json: isJSON, text: isText };

  /* fetchViaProxy(url, opts) -> the document as TEXT, or null
   *
   *   opts.as        'feed' (default) | 'html' | 'json' | 'text' — what counts as an answer rather
   *                  than an error page
   *   opts.budgetMs  what the whole ladder may cost, end to end (default 20 s)
   *   opts.direct    try the host ITSELF, before our relays (#R452) — for hosts a browser may read.
   *                  (own-fetch-relay) For a host no relay of ours admits, this is the ONLY rung: without it
   *                  such a URL answers null with reason 'refused' at once.
   *                  ⚠ (#R464) THE NOTE THAT USED TO BE HERE — 「A CORS refusal costs nothing: it
   *                  rejects before a byte moves」 — IS TRUE OF A REJECTED PRE-FLIGHT AND FALSE OF
   *                  GDELT. Its 429 is a real response that takes 10.7-15.8 s to arrive and merely
   *                  carries no ACAO, so the browser waits out the entire round trip before
   *                  refusing to show it. A refusal that costs twelve seconds is not free, and
   *                  sizing a deadline as though it were is what made this path unusable.
   *                  The direct deadline is therefore per-HOST (see directMsFor), not one number.
   *   opts.signal    the caller's AbortSignal — Stop, or a superseding turn (#R452)
   *   opts.note      ⚠⚠⚠ (#R769) AN OBJECT THE CALLER OWNS, INTO WHICH THIS LADDER WRITES WHY IT
   *                  RETURNED WHAT IT RETURNED. Optional, and nothing that does not pass one is
   *                  affected — the return value is unchanged.
   *
   *                  IT EXISTS BECAUSE `null` WAS ANSWERING TWO DIFFERENT QUESTIONS. Measured in
   *                  production 2026-09-17: every rung of the GDELT ladder refused — our own relay
   *                  502, the host itself a CORS refusal, and all four public proxies dead (401
   *                  'API key required', 403 'domain_not_registered', 408, abort) — and the reader
   *                  was shown nothing at all, because js/atlas-sources.js cannot tell 「every
   *                  source refused」 from 「the sources answered and there was no news」 when both
   *                  arrive as `null`. One of those is a fault in IntMap's plumbing and the other
   *                  is a fact about the world, and a reader is owed the difference (#R763 drew the
   *                  same line on the GIS side).
   *                  Fields: `reason` — 'ok' | 'aborted' | 'no-budget' | 'refused' — and `via`,
   *                  the rung that answered.
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
  async function fetchViaProxy(url, opts) {
    const o = opts || {};
    /* ⚠ (#R769) the note is written at EVERY exit, including the early ones — a verdict that is
       only recorded on the paths somebody remembered is not a verdict. */
    /* ⚠ AND A STOP IS NEVER REPORTED AS A REFUSAL. `left()` returns 0 once the caller's signal
       fires and every in-flight attempt rejects, so the two failing exits below are reached by BOTH
       「nobody would answer」 and 「the reader pressed Stop」 — and calling the second one 'refused'
       would put IntMap's plumbing on trial for something the reader did. The signal is the
       authority on that, so it is asked at the exit rather than tracked on the way down. */
    const okDoc = ACCEPT[o.as] || isFeed;
    /* (own-fetch-relay) the relays this URL may use, once — and a caller that names no budget gets one long
       enough for the slowest of them: a 20 s default in front of a relay whose own upstream is given
       20 s (www.imf.org routinely takes ten) would cut that relay off before its rule's clock ran. */
    const relays = proxiesFor(url, o.as);
    const budget = (o.budgetMs > 0) ? o.budgetMs : Math.max(BUDGET_MS, ...relays.map((m) => m.ms || 0));
    const t0 = Date.now();
    const outer = o.signal || null;
    const outerAborted = () => { try { return !!(outer && outer.aborted); } catch (_) { return false; } };
    const left = () => ((outer && outer.aborted) ? 0 : budget - (Date.now() - t0));
    /* ⚠ DECLARED AFTER WHAT IT READS, not before. It happens to be called only later, so the
       temporal dead zone would not have fired today — and that is exactly the shape #R545 recorded
       (a hoisting question answered by 「when does anyone call it」 rather than by the source). */
    const say = (reason, via) => {
      const r = (reason !== 'ok' && outerAborted()) ? 'aborted' : reason;
      try { if (o.note && typeof o.note === 'object') { o.note.reason = r; o.note.via = via || ''; } } catch (_) { /* the caller's object is theirs */ }
      return null;
    };

    if (outer && outer.aborted) return say('aborted');
    /* ⚠ (#R452) EVERY attempt this call makes is registered here — the direct one, the racers and
       the fallback pass alike — so the caller's Stop reaches whichever of them is in flight. A
       signal that only cancels the attempt someone remembered to wire it to is not a Stop. */
    const ctlsAll = [];
    const relayAbort = () => { ctlsAll.forEach((c) => { try { c.abort(); } catch (_) { /* already done */ } }); };
    if (outer) { try { outer.addEventListener('abort', relayAbort); } catch (_) { /* no listener support */ } }
    const mk = () => { const c = new AbortController(); ctlsAll.push(c); return c; };

    try {
      /* (#R464) our own relay, for the hosts that have one that cannot be raced */
      const own = ownRelay(url);
      if (own) {
        try {
          const txt = await fetchDeadline(own, Math.min(OWN_RELAY_TIMEOUT_MS, left()), mk());
          if (okDoc(txt)) { say('ok', 'own-relay'); return txt; }
        } catch (_) { /* ours is cold, refused or down — the reader's own IP is the next chance */ }
      }
      /* (#R452) the host itself, when the caller says a browser is allowed to read it */
      if (o.direct && left() > 0) {
        try {
          const txt = await fetchDeadline(url, Math.min(directMsFor(url), left()), mk());
          if (okDoc(txt)) { say('ok', 'direct'); return txt; }
        } catch (_) { /* CORS, a status, or the clock — the relays are next either way */ }
      }
      if (left() <= 0) return say('no-budget');
      const won = await race(relays, url, okDoc, left, mk);
      return (won === null) ? say('refused') : (say('ok', 'proxy'), won);
    } finally {
      if (outer) { try { outer.removeEventListener('abort', relayAbort); } catch (_) { /* nothing to remove */ } }
    }
  }

  /* ownRelayUrl(url) -> the URL of OUR relay that admits `url`, or '' (own-fetch-relay)
     For the callers that cannot take text back: an <img> that is drawn onto a canvas
     (js/street-view.js) and a Response that is kept in the Cache API (js/data-layers.js). They ask
     the same table the ladder above races, so no file keeps a relay URL of its own — the copies
     that did are how eighteen files came to name the same four strangers. gdelt-relay first, as in
     the ladder. */
  function ownRelayUrl(url, as) {
    const own = ownRelay(url);
    if (own) return own;
    const mine = proxiesFor(url, as);
    return mine.length ? mine[0](String(url || '')) : '';
  }

  return { fetchViaProxy, ownRelayUrl };

  /* the race, and the one bounded pass behind it */
  async function race(PROXIES, url, okDoc, left, mk) {
    /* (own-fetch-relay) nothing of ours admits this URL, and there is no one else to ask */
    if (!PROXIES.length) return null;
    const ctls = PROXIES.map(() => mk());
    const attempts = PROXIES.map((make, i) => (async () => {
      /* ⚠ each racer still has its own clock, which is what #R212 put here; what is new is that the
         clock cannot outlast the budget the CALLER named, or a 3 s budget would still sit through an
         8 s attempt. (own-fetch-relay) A relay whose upstream is slow carries its own clock (make.ms). */
      const txt = await fetchDeadline(make(url), Math.min(make.ms || PROXY_TIMEOUT_MS, left()), ctls[i]);
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
          const txt = await fetchDeadline(make(url), Math.min(make.ms || PROXY_FALLBACK_MS, left()), mk());
          if (okDoc(txt)) return txt;
        } catch (__) { /* try the next one */ }
      }
      return null;
    }
  }
})();
