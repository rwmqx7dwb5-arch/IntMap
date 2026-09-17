#!/usr/bin/env node
/*  IntMap · Is the CORS relay ladder still a ladder?  (#R769)
 *
 *  js/proxy-fetch.js falls down a list of public CORS relays when a host will not answer a browser
 *  directly. That list was written in #R212, extended in #R214/#R216, and NOBODY HAS MEASURED IT
 *  SINCE. Measured 2026-09-17 against a target that is beyond suspicion (https://example.com/),
 *  all four rungs failed: 520 after 13.0 s, 401 «a valid API key is required» (the free tier ended),
 *  403 «domain_not_registered», and 522 after 19.8 s. None of that is about the feeds the ladder is
 *  asked to fetch — the ladder itself was gone, and every caller was paying the full budget to be
 *  told `null`. A list of endpoints is a photograph of the day it was written; this script is the
 *  thing that takes a new photograph.
 *
 *  ══ WHY THIS SCRIPT DOES NOT CONTAIN THE LIST ══════════════════════════════════════════════════
 *  Writing the four URLs out here would be a second copy of the rung list, and a copy goes stale in
 *  exactly the way the original did: a rung added, removed or re-spelled in js/proxy-fetch.js would
 *  leave this probe green while measuring endpoints the product no longer uses (#R488 — a check that
 *  pins spelling keeps a dead rule green). Reading the source with a regexp is the same mistake one
 *  layer in: the rungs are FUNCTIONS, one of them takes the URL raw and the others encode it, and
 *  the order matters (#R505 — a check that reads source cannot see evaluation).
 *
 *  So the ladder is DISCOVERED BY RUNNING IT: `globalThis.fetch` is replaced with a stub that
 *  records the URL it was handed and then rejects, `fetchViaProxy` is called once, and because every
 *  rung fails the call walks the whole ladder to the bottom. What comes back is the ordered list of
 *  URLs THIS BUILD ACTUALLY REQUESTS. Then the stub is removed and those exact URLs are fetched for
 *  real.
 *
 *  ══ WHY ONE DEAD RUNG IS NOT AN ALARM ══════════════════════════════════════════════════════════
 *  A ladder exists because rungs break; a free relay going down, rate-limiting an egress or moving
 *  behind an API key is the ordinary weather this list was built to survive, and paging a human for
 *  it would train everyone to ignore the page. The failure worth knowing about is the one measured
 *  above: ALL of them down at once, which is the ladder having quietly stopped being a ladder. Hence
 *  exit 0 while at least one rung answers, exit 1 only when none does.
 *
 *  ⚠ THIS SCRIPT GOES OUT TO THE NETWORK, so it is not part of `npm test` and is not named
 *  *.test.mjs. Its scheduled reader is the `ladder` job in .github/workflows/uptime.yml, whose run
 *  log is the time series. Prose: docs/MONITORING.md §1c.
 *
 *  Usage:
 *    node scripts/probe-relay-ladder.mjs
 *    node scripts/probe-relay-ladder.mjs --target https://example.com/ --needle 'Example Domain'
 *    node scripts/probe-relay-ladder.mjs --origin https://rwmqx7dwb5-arch.github.io
 *    node scripts/probe-relay-ladder.mjs --json
 */

const ARGV = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = ARGV.indexOf(name);
  return (i >= 0 && ARGV[i + 1] != null) ? ARGV[i + 1] : dflt;
};

/* The default target is chosen for the property the probe needs: a page whose availability is not
   in question, whose body is stable, and which carries a string nothing else would carry. If it
   ever stops being that, --target / --needle replace it without editing this file. */
const TARGET = arg('--target', 'https://example.com/');
const NEEDLE = arg('--needle', 'Example Domain');
const AS_JSON = ARGV.includes('--json');
/* ⚠ THE ORIGIN IS PART OF THE REQUEST (#R216). corsfix authorises by CALLING ORIGIN, so a probe
   that sends none gets `invalid_origin` — measured here, 400 in 287 ms — while the live site gets
   `domain_not_registered`, 403. Both are failures, but only one of them is the failure a reader
   experiences, and #R216 is the round where a relay verified from the wrong origin shipped. The
   probe therefore introduces itself as the deployed site. */
const ORIGIN = arg('--origin', 'https://rwmqx7dwb5-arch.github.io');
/* Longer than js/proxy-fetch.js's own 8 s racer deadline on purpose: the product gives up at 8 s,
   but "answered in 13 s" and "did not answer at all" are different facts about a rung and this
   script is here to tell them apart. */
const PROBE_TIMEOUT_MS = 25000;

/* ── 1. discover the ladder by evaluating it ──────────────────────────────────────────────────── */
async function discoverLadder(target) {
  /* fetchViaProxy reads `window.SUPABASE_URL` AT CALL TIME (see the module's own note) and answers
     '' for anything it cannot read, so the shim only has to exist. Empty means «no own relay», which
     is also what the module concludes for any URL outside news-relay / quotes-relay / gdelt-relay —
     i.e. the public rungs are what a general target reaches either way. */
  if (!globalThis.window) globalThis.window = {};
  if (globalThis.window.SUPABASE_URL == null) globalThis.window.SUPABASE_URL = '';

  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    seen.push(String(u && u.url ? u.url : u));
    /* Rejecting is what makes the walk complete: a rung that "succeeds" would end the ladder and
       hide every rung below it. */
    throw new Error('probe: recording only');
  };
  try {
    const mod = await import(new URL('../js/proxy-fetch.js', import.meta.url).href);
    /* `as:'html'` and a budget large enough that nothing is skipped for lack of time — the stub
       rejects immediately, so no wall clock is actually spent here. */
    await mod.fetchViaProxy(target, { as: 'html', budgetMs: 60000 });
  } finally {
    globalThis.fetch = realFetch;
  }

  /* The ladder is tried twice (the race, then the bounded second pass), so the same rung appears
     more than once. Order of FIRST appearance is the ladder's order. */
  const out = [];
  for (const u of seen) if (!out.includes(u)) out.push(u);
  return out;
}

/* ── 2. fetch each discovered URL for real ────────────────────────────────────────────────────── */
async function probe(url) {
  const t0 = Date.now();
  try {
    const headers = ORIGIN ? { Origin: ORIGIN, Referer: `${ORIGIN.replace(/\/$/, '')}/IntMap/` } : {};
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), redirect: 'follow' });
    let body = '';
    try { body = await res.text(); } catch (e) { body = ''; }
    const ms = Date.now() - t0;
    /* «Alive» is not «HTTP 200». A relay's own error envelope arrives with a status and a body, and
       #R446 measured the cost of treating one as the document: what makes a rung alive is that the
       TARGET's content came back through it. */
    const carried = body.includes(NEEDLE);
    return {
      url, status: res.status, ms, bytes: body.length, alive: res.ok && carried,
      snippet: snip(body), error: null,
    };
  } catch (e) {
    return {
      url, status: null, ms: Date.now() - t0, bytes: 0, alive: false,
      snippet: '', error: String((e && e.message) || e),
    };
  }
}

const snip = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);
const host = (u) => { try { return new URL(u).host; } catch (_) { return u.slice(0, 40); } };
const pad = (s, n) => { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); };

/* ── 3. report ────────────────────────────────────────────────────────────────────────────────── */
async function main() {
  const urls = await discoverLadder(TARGET);
  if (!urls.length) {
    /* Not «all rungs are down» — «the ladder could not be evaluated», which is a different failure
       and must not be reported as the network's fault. */
    console.log(`target : ${TARGET}`);
    console.log('⚠ js/proxy-fetch.js requested no URL at all — the ladder could not be discovered.');
    console.log('RESULT dead 0/0');
    process.exitCode = 1;
    return;
  }

  console.log(`target   : ${TARGET}`);
  console.log(`needle   : ${NEEDLE}`);
  console.log(`origin   : ${ORIGIN || '(none)'}`);
  console.log(`discovered: ${urls.length} rung(s), by evaluating js/proxy-fetch.js`);
  console.log('');

  /* One at a time: the point is each rung's own latency, and running them together would have them
     competing for the same egress — which is what the product's race does and what makes its
     timings unusable as a measurement of a single relay. */
  const rows = [];
  for (const u of urls) rows.push(await probe(u));

  console.log(`${pad('#', 3)}${pad('relay', 26)}${pad('status', 8)}${pad('ms', 8)}${pad('bytes', 9)}alive`);
  rows.forEach((r, i) => {
    console.log(`${pad(i + 1, 3)}${pad(host(r.url), 26)}${pad(r.status ?? '—', 8)}${pad(r.ms, 8)}${pad(r.bytes, 9)}${r.alive ? 'yes' : 'no'}`);
  });
  console.log('');
  rows.forEach((r, i) => {
    console.log(`${i + 1}. ${r.url}`);
    console.log(`   ${r.error ? `error: ${r.error}` : `body: ${r.snippet || '(empty)'}`}`);
  });

  const alive = rows.filter((r) => r.alive).length;
  const verdict = alive === rows.length ? 'ok' : (alive > 0 ? 'degraded' : 'dead');
  console.log('');
  if (verdict === 'dead') {
    console.log('⚠ EVERY rung failed. The ladder is not a ladder — js/proxy-fetch.js can only spend');
    console.log('  its whole budget and answer null. See docs/MONITORING.md §1c.');
  } else if (verdict === 'degraded') {
    console.log('A dead rung is ordinary weather — the ladder exists because rungs break. Not an alarm.');
  }
  if (AS_JSON) {
    console.log(JSON.stringify({
      measuredAt: new Date().toISOString(), target: TARGET, needle: NEEDLE, origin: ORIGIN,
      verdict, alive, total: rows.length, rungs: rows,
    }, null, 2));
  }
  console.log(`RESULT ${verdict} ${alive}/${rows.length}`);
  process.exitCode = (verdict === 'dead') ? 1 : 0;
}

main().catch((e) => {
  console.error(String((e && e.stack) || e));
  console.log('RESULT dead 0/0');
  process.exitCode = 1;
});
