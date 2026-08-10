/*  IntMap · Fetching a feed through a CORS proxy  (#R212)
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
  const PROXIES = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    (u) => `https://proxy.corsfix.com/?${u}`,
    (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  ];
  const PROXY_TIMEOUT_MS = 8000;      /* one attempt's deadline */
  const PROXY_FALLBACK_MS = 6000;     /* …and the second, bounded pass */

  const fetchDeadline = (u, ms, ctl) => {
    const c = ctl || new AbortController();
    const t = setTimeout(() => { try { c.abort(); } catch (_) { /* already done */ } }, ms);
    return fetch(u, { signal: c.signal }).finally(() => clearTimeout(t));
  };
  const isFeed = (txt) => !!txt && (txt.includes('<rss') || txt.includes('<feed'));

  return async function fetchViaProxy(url) {
    const ctls = PROXIES.map(() => new AbortController());
    const attempts = PROXIES.map((make, i) => (async () => {
      const r = await fetchDeadline(make(url), PROXY_TIMEOUT_MS, ctls[i]);
      if (!r.ok) throw new Error('bad status ' + r.status);
      const txt = await r.text();
      if (!isFeed(txt)) throw new Error('not feed');
      return txt;
    })());
    try {
      const won = await Promise.any(attempts);
      ctls.forEach((c) => { try { c.abort(); } catch (_) { /* the losers are of no further use */ } });
      return won;
    } catch (_) {
      /* one bounded pass, for the case where all three rejected quickly (a transient blip) */
      for (const make of PROXIES) {
        try {
          const r = await fetchDeadline(make(url), PROXY_FALLBACK_MS);
          if (!r.ok) continue;
          const txt = await r.text();
          if (isFeed(txt)) return txt;
        } catch (__) { /* try the next one */ }
      }
      return null;
    }
  };
})();
