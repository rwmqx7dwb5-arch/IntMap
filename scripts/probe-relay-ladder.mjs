#!/usr/bin/env node
/*  IntMap · Do OUR relays still carry what the page sends them?  (#R769, re-aimed in own-fetch-relay)
 *
 *  ══ WHAT THIS WATCHED, AND WHY IT HAD TO BE RE-AIMED ══════════════════════════════════════════
 *  #R769 wrote this to watch the ladder of PUBLIC CORS relays js/proxy-fetch.js fell down when a host
 *  would not answer a browser. Measured 2026-09-17 against https://example.com/, all four rungs
 *  failed (520 after 13.0 s, 401 «a valid API key is required», 403 «domain_not_registered», 522 after
 *  19.8 s) — the ladder had been gone for an unknown time. own-fetch-relay removed that ladder: every rung is now
 *  one of THIS project's Edge Functions. Asked the old question («what does example.com go through?»)
 *  the module now answers «nothing» — example.com is on no relay's list — and the old verdict for an
 *  empty ladder was `dead`, so the scheduled job would have opened its issue every six hours about a
 *  ladder that no longer exists. The question is re-aimed rather than the job removed: the black box
 *  every reader still depends on is our own relays, and nobody else watches them from outside.
 *
 *  ══ WHERE THE QUESTIONS COME FROM (no second list of relays) ══════════════════════════════════
 *    · fetch-relay: every rule in supabase/functions/_shared/fetch-relay-policy.js carries a `probe`
 *      — one concrete URL the rule admits — and the article rule carries one too. Read from the
 *      module, not copied.
 *    · the specialised relays (news-relay, quotes-relay, cable-geo, sv-cov, gdelt-relay): one target
 *      each in OWN_RELAY_PROBES below — the URLs they exist for.
 *  WHICH relay a target goes to is never written here: it is asked of js/proxy-fetch.js's
 *  `ownRelayUrl` (the page's own router), evaluated. tests/own-fetch-relay-checks.test.mjs runs
 *  `--list` offline and fails if a relay the page routes to has no target here, or if a target is
 *  routed nowhere — so a new relay cannot join the page without joining this probe.
 *
 *  ══ VERDICTS ═══════════════════════════════════════════════════════════════════════════════════
 *    ok        every target came back through our relay
 *    degraded  some did — an upstream having a bad hour (IMF is slow, CelesTrak goes dark) is
 *              ordinary weather and is NOT an alarm; the table in the log is the time series
 *    dead      none did — that is our relays being down (a Supabase outage, a bad deploy), exit 1
 *    none      no target could be routed at all: this build has nothing to probe. Exit 0 and NO
 *              issue — it is a fact about the code, which tests/own-fetch-relay-checks catches, not about the network.
 *
 *  ⚠ THIS SCRIPT GOES OUT TO THE NETWORK, so it is not part of `npm test`. Its scheduled reader is
 *  the `ladder` job in .github/workflows/uptime.yml. Prose: docs/MONITORING.md §1c.
 *
 *  Usage:
 *    node scripts/probe-relay-ladder.mjs
 *    node scripts/probe-relay-ladder.mjs --list          # the targets and the relay each goes to; no network
 *    node scripts/probe-relay-ladder.mjs --json
 *    node scripts/probe-relay-ladder.mjs --supabase-url https://<ref>.supabase.co --origin https://…
 */
import { readFileSync } from 'node:fs';

const ARGV = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = ARGV.indexOf(name);
  return (i >= 0 && ARGV[i + 1] != null) ? ARGV[i + 1] : dflt;
};
const AS_JSON = ARGV.includes('--json');
const LIST = ARGV.includes('--list');
/* ⚠ THE ORIGIN IS PART OF THE REQUEST (#R216): a relay verified from the wrong origin once shipped.
   The probe introduces itself as the deployed site. */
const ORIGIN = arg('--origin', 'https://rwmqx7dwb5-arch.github.io');
/* The project the page talks to is the one src/vendor.js names — read from there, not retyped. */
function vendorSupabaseUrl() {
  try {
    const src = readFileSync(new URL('../src/vendor.js', import.meta.url), 'utf8');
    const m = /window\.SUPABASE_URL\s*=\s*'([^']+)'/.exec(src);
    return m ? m[1] : '';
  } catch (_) { return ''; }
}
const SUPABASE_URL = arg('--supabase-url', vendorSupabaseUrl());
/* longer than any rule's own upstream clock (the slowest is 20 s) plus the round trip */
const PROBE_TIMEOUT_MS = 30000;

/* one target per specialised relay — the URL it exists for (see the header) */
const OWN_RELAY_PROBES = [
  { url: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en', expect: /xml|rss|text\/plain/i },   /* news-relay answers text/plain (measured 2026-09-25) */
  { url: 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d', expect: /json/i },
  { url: 'https://www.submarinecablemap.com/api/v3/landing-point/landing-point-geo.json', expect: /json/i },
  { url: 'https://mts0.google.com/vt?hl=en&src=api&x=7&y=3&z=3&lyrs=svv&style=40,18', expect: /^image\//i },
  { url: 'https://api.gdeltproject.org/api/v2/doc/doc?query=%22Japan%22&mode=artlist&maxrecords=1&format=json&timespan=1d', expect: /json/i },
];

/* ── 1. the targets, and the relay the page's own router sends each one to ──────────────────── */
async function discover() {
  if (!globalThis.window) globalThis.window = {};
  globalThis.window.SUPABASE_URL = SUPABASE_URL;
  const pf = await import(new URL('../js/proxy-fetch.js', import.meta.url).href);
  const policy = await import(new URL('../supabase/functions/_shared/fetch-relay-policy.js', import.meta.url).href);
  const targets = [
    ...policy.FETCH_RELAY_RULES.map((r) => ({ url: r.probe, as: undefined, expect: r.type, rule: r.id })),
    { url: policy.ARTICLE_RULE.probe, as: 'html', expect: policy.ARTICLE_RULE.type, rule: policy.ARTICLE_RULE.id },
    ...OWN_RELAY_PROBES.map((t) => ({ ...t, as: undefined, rule: '' })),
  ];
  return targets.map((t) => {
    const relayUrl = t.url ? pf.ownRelayUrl(t.url, t.as) : '';
    const m = /\/functions\/v1\/([a-z0-9-]+)\?/.exec(relayUrl);
    return { ...t, relay: m ? m[1] : '', relayUrl };
  });
}

/* ── 2. ask our relay for each target ─────────────────────────────────────────────────────────── */
async function probe(t) {
  const t0 = Date.now();
  try {
    const headers = ORIGIN ? { Origin: ORIGIN, Referer: `${ORIGIN.replace(/\/$/, '')}/IntMap/` } : {};
    const res = await fetch(t.relayUrl, { headers, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    const ct = res.headers.get('content-type') || '';
    let bytes = 0; let snippet = '';
    try { const buf = new Uint8Array(await res.arrayBuffer()); bytes = buf.length; snippet = snip(new TextDecoder().decode(buf.slice(0, 400))); } catch (_) { /* body unreadable */ }
    /* «Alive» is not «HTTP 200»: the relay's own refusal is JSON with a status, and #R446 measured the
       cost of taking an envelope for the document. Alive = 2xx, a body, and the type the target is. */
    const alive = res.ok && bytes > 0 && (!t.expect || t.expect.test(ct));
    return { ...t, status: res.status, ms: Date.now() - t0, bytes, contentType: ct, alive, snippet, error: null };
  } catch (e) {
    return { ...t, status: null, ms: Date.now() - t0, bytes: 0, contentType: '', alive: false, snippet: '', error: String((e && e.message) || e) };
  }
}

const snip = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);
const pad = (s, n) => { s = String(s); return s + ' '.repeat(Math.max(0, n - s.length)); };
const host = (u) => { try { return new URL(u).host; } catch (_) { return String(u).slice(0, 40); } };

async function main() {
  const all = await discover();
  const routed = all.filter((t) => t.relay);
  if (LIST) {
    console.log(JSON.stringify(all.map(({ url, as, relay, rule }) => ({ url, as: as || null, relay, rule })), null, 2));
    return;
  }
  console.log(`supabase : ${SUPABASE_URL || '(none)'}`);
  console.log(`origin   : ${ORIGIN || '(none)'}`);
  const unrouted = all.filter((t) => !t.relay);
  if (unrouted.length) console.log(`⚠ not routed to any relay of ours: ${unrouted.map((t) => t.url).join(', ')}`);
  if (!routed.length) {
    console.log('No target is routed to a relay of ours — this build has nothing to probe (a code fact,');
    console.log('not a network one: tests/own-fetch-relay-checks catches it).');
    console.log('RESULT none 0/0');
    return;
  }
  console.log(`targets  : ${routed.length}, each sent where js/proxy-fetch.js sends it`);
  console.log('');
  /* one at a time: each relay's own latency is the measurement */
  const rows = [];
  for (const t of routed) rows.push(await probe(t));
  console.log(`${pad('#', 3)}${pad('relay', 14)}${pad('upstream', 28)}${pad('status', 8)}${pad('ms', 8)}${pad('bytes', 10)}alive`);
  rows.forEach((r, i) => console.log(`${pad(i + 1, 3)}${pad(r.relay, 14)}${pad(host(r.url), 28)}${pad(r.status ?? '—', 8)}${pad(r.ms, 8)}${pad(r.bytes, 10)}${r.alive ? 'yes' : 'no'}`));
  console.log('');
  rows.forEach((r, i) => { if (!r.alive) console.log(`${i + 1}. ${r.relayUrl}\n   ${r.error ? `error: ${r.error}` : `${r.contentType} · ${r.snippet || '(empty)'}`}`); });

  const alive = rows.filter((r) => r.alive).length;
  const verdict = alive === rows.length ? 'ok' : (alive > 0 ? 'degraded' : 'dead');
  if (verdict === 'dead') {
    console.log('⚠ NO relay of ours carried its target. That is our relays being down, not an upstream\'s');
    console.log('  bad hour. See docs/MONITORING.md §1c.');
  } else if (verdict === 'degraded') {
    console.log('Some targets did not come back — an upstream having a bad hour is not an alarm.');
  }
  if (AS_JSON) {
    console.log(JSON.stringify({ measuredAt: new Date().toISOString(), origin: ORIGIN, supabase: SUPABASE_URL,
      verdict, alive, total: rows.length, rungs: rows.map(({ expect, ...r }) => r) }, null, 2));
  }
  console.log(`RESULT ${verdict} ${alive}/${rows.length}`);
  process.exitCode = (verdict === 'dead') ? 1 : 0;
}

main().catch((e) => {
  /* the probe itself broke — neither our relays nor an upstream; say so rather than `dead` */
  console.error(String((e && e.stack) || e));
  console.log('RESULT error 0/0');
  process.exitCode = 2;
});
