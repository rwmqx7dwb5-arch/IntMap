#!/usr/bin/env node
/* ============================================================================
 *  scripts/upstream-liveness.mjs — ARE THE HOSTS THE READER'S BROWSER TALKS TO STILL THERE?
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-09-30, BEFORE THIS FILE: nothing in the repository asked. .github/workflows/
 *  uptime.yml probes IntMap's own site and its own relays; scripts/outbound-hosts.json lists the
 *  177 hosts the browser code can request, and for the 113 it actually requests nobody checked
 *  whether they answer. A hand run with curl that day found api.airplanes.live answering 403 and two
 *  of the three Overpass mirrors js/overpass.js falls back to (overpass.private.coffee,
 *  overpass.kumi.systems) silent for 20 s — each a layer that draws nothing, found by accident.
 *
 *  WHAT THIS DOES. Every row of scripts/outbound-hosts.json that the browser REQUESTS (a
 *  `disclosure` or a `removedBy` row) declares one representative request — `probe: { url,
 *  expect?, why? }` — and this script asks all of them, in parallel, once, and classifies each
 *  answer with scripts/lib/upstream.mjs classify() — the same judgement the data builders use:
 *
 *      alive       answered with a declared status (default: any 2xx)
 *      refused     answered and said no: a 4xx (including 429) or an undeclared status
 *      dead        no answer in time, connection refused, DNS failure, or a 5xx
 *      unobserved  THIS RUNNER could not look — no probe at all got an HTTP answer, so the
 *                  runner's network is the thing that is down, not 113 upstreams
 *
 *  ⚠ 「確認できなかった」 IS NOT 「死んでいる」 (.agents/rules/one-pass-or-a-reason.md §5). A run with
 *  no network reports 113 × unobserved and turns nothing red.
 *
 *  ⚠ A FAILED ANSWER IS ASKED ONCE MORE, AND ONLY A FAILED ONE. After the first pass every host
 *  that was not alive is asked again, later and with twice the time limit — a retry after an
 *  OBSERVED failure that is different from the first try (one-pass-or-a-reason §5). Both attempts
 *  are in the result, and a host that answered only the second time is `alive` with `recovered`.
 *
 *  ⚠ WHAT TURNS A NIGHT RED IS A CHANGE A READER CAN ACT ON, NOT A STATE. A host that has been dead
 *  for weeks is listed every night in the summary and turns nothing red: a job that is red every
 *  night is a job nobody reads (the deep tier's nightly was red eight nights in a row —
 *  dev-notes/2026-09-29-structural-audit-reform.md). And one bad night is not a change either:
 *  measured on this script's first day, overpass-api.de answered 200 in the morning and 504 twice
 *  (thirty seconds apart) in the afternoon. So each result carries, per host, how many consecutive
 *  runs it has been up or down (`streak`) and what it was before (`from`), and `--fail-on-transition`
 *  exits 1 exactly once per outage: on the run where a host that had been UP has now been DOWN for
 *  CONFIRM_RUNS runs in a row. The first bad night is reported as «failing», not red; the night it
 *  comes back is reported as «came back», not red.
 *
 *  ⚠ LINK AND DORMANT ROWS ARE NOT PROBED, BY THEIR OWN DECLARATION. A `link` row is never fetched
 *  (the reader clicks it) and a `dormant` row is behind a switch that is off, so their liveness is
 *  not a data path of IntMap's; the row already says so, and it is reported as `not requested`.
 *
 *  Run:
 *    node scripts/upstream-liveness.mjs                         measure; print the table
 *    node scripts/upstream-liveness.mjs --out r.json            … and write the result
 *    node scripts/upstream-liveness.mjs --previous p.json       … and compare with a previous result
 *        [--fail-on-transition]                                  exit 1 on alive → dead/refused
 *    node scripts/upstream-liveness.mjs --summary s.md          … and write a Markdown summary
 *    node scripts/upstream-liveness.mjs --check                 declarations only, no network
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify, VERDICTS } from './lib/upstream.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEDGER = 'scripts/outbound-hosts.json';

/* The user agent of the probe. The usage policies of Nominatim and of the Wikimedia APIs require an
   identifying agent, and WHO answers 403 to a library agent (scripts/build-who-don.mjs, measured). */
export const PROBE_AGENT = 'IntMap-upstream-liveness (+https://github.com/rwmqx7dwb5-arch/IntMap)';

/* The per-request time limit of the first pass.
   OBSERVED: 2026-09-30, 113 probes from one runner: the slowest host that answered took 15.4 s
   (gaez-services.fao.org), the next 10.9 s (www.imf.org); the two Overpass mirrors gave nothing in
   20 s. 20 s separates «slow» from «silent» with the one slow host inside it.
   EXPIRES: when a host that answers the product does so in more than 20 s — then this limit calls
   a slow host dead, and the recheck (twice this) is the first place it will show.
   CANON: this constant; the recheck doubles it. */
export const TIMEOUT_MS = 20000;
/* How long to wait before asking a failed host again. A reset or a 503 is weather, and weather that
   has not changed in a few seconds is asked about again for nothing.
   OBSERVED: not measured — the order of a CDN's short failure window. EXPIRES: if rechecks that
   come back alive cluster at the end of this wait (then it is too short). CANON: this constant. */
export const RECHECK_DELAY_MS = 30000;
/* How many probes are in flight at once. Each host is asked once, so this bounds only the runner's
   own sockets, not any upstream's load. OBSERVED: 16 at a time finished 113 probes in about 20 s
   on 2026-09-30. CANON: this constant. */
export const CONCURRENCY = 16;

/* ── declarations ──────────────────────────────────────────────────────────────────────────── */

/* A ledger host may be a pattern: `*.wikipedia.org` or `mts*.google.com`. The probe's host must be
   one the pattern names — a probe that asks a different host measures a different fact.
   Matched as text, not by building a RegExp from the pattern: the literal parts are compared
   exactly (a `.` is a dot, never "any character"), and what a `*` stands for must be host
   characters — letters, digits and hyphens, with a dot only before a non-empty label — so a `*`
   can widen a label (`mts0`) or add labels (`de.`) but never swallow a foreign suffix. */
const WILD_LABEL = /^[a-z0-9-]*$/;
const wildcardSpan = (s) => s.split('.').every((label, i) => (i === 0 || label !== '') && WILD_LABEL.test(label));
export function hostMatches(pattern, host) {
  const parts = String(pattern).toLowerCase().split('*');
  const h = String(host).toLowerCase();
  if (!h.startsWith(parts[0])) return false;
  /* parts[0..k] are matched and end at pos; next come a wildcard and parts[k + 1] */
  const rest = (k, pos) => {
    if (k === parts.length - 1) return pos === h.length;
    const lit = parts[k + 1];
    for (let end = pos; end + lit.length <= h.length; end++) {
      if (h.startsWith(lit, end) && wildcardSpan(h.slice(pos, end)) && rest(k + 1, end + lit.length)) return true;
    }
    return false;
  };
  return rest(0, parts[0].length);
}

/** Which rows are probed, with what, and what is wrong with the declarations. Pure. */
export function declared(ledger) {
  const probes = [], notRequested = [], problems = [];
  for (const r of (ledger && ledger.hosts) || []) {
    const requested = r.disclosure != null || r.removedBy != null;
    if (!requested) {
      notRequested.push({ host: r.host, why: r.link != null ? 'link — never fetched by IntMap' : r.dormant != null ? 'dormant — behind window.' + r.dormant.switch + ', which is off' : 'not requested' });
      if (r.probe) problems.push(`${LEDGER}: ${r.host} is not requested by the browser (link/dormant) and still declares a probe — its liveness is not a data path of IntMap's; remove the probe`);
      continue;
    }
    const p = r.probe;
    if (!p || typeof p !== 'object') { problems.push(`${LEDGER}: ${r.host} is requested by the browser and declares no \`probe\` — give it one representative request { url, expect? }, or { none: "<why it cannot be probed>" }`); continue; }
    if (p.none != null) {
      if (typeof p.none !== 'string' || p.none.trim().length < 12) problems.push(`${LEDGER}: ${r.host} declares \`probe.none\` without a reason`);
      else notRequested.push({ host: r.host, why: 'not probed — ' + p.none });
      continue;
    }
    let u;
    try { u = new URL(p.url); } catch { problems.push(`${LEDGER}: ${r.host} probe.url is not a URL: ${p.url}`); continue; }
    if (u.protocol !== 'https:') problems.push(`${LEDGER}: ${r.host} probe.url is not https: ${p.url}`);
    if (!hostMatches(r.host, u.hostname)) problems.push(`${LEDGER}: ${r.host} probe.url asks ${u.hostname}, which is not the host this row declares`);
    if (p.expect != null && !(Array.isArray(p.expect) && p.expect.length && p.expect.every((s) => Number.isInteger(s) && s >= 100 && s <= 599))) {
      problems.push(`${LEDGER}: ${r.host} probe.expect must be a list of HTTP statuses`);
    }
    /* ⚠ A NON-2xx EXPECTATION IS A CLAIM ABOUT THE HOST AND NEEDS ITS REASON — otherwise a probe that
       has started failing can be «fixed» by writing its failure down as the expected answer. */
    if (Array.isArray(p.expect) && p.expect.some((s) => s < 200 || s > 299) && !(typeof p.why === 'string' && p.why.trim().length >= 12)) {
      problems.push(`${LEDGER}: ${r.host} expects ${p.expect.join('/')} and does not say why a non-2xx answer means the host is up (probe.why)`);
    }
    probes.push({ host: r.host, url: p.url, expect: Array.isArray(p.expect) ? p.expect : null, why: p.why || null });
  }
  return { probes, notRequested, problems };
}

/* ── measurement ───────────────────────────────────────────────────────────────────────────── */

async function ask(probe, { fetchImpl, timeoutMs }) {
  const t0 = Date.now();
  let status = null, error = null;
  try {
    const res = await fetchImpl(probe.url, { headers: { 'user-agent': PROBE_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
    status = res.status;
    try { await res.body?.cancel(); } catch { /* nothing to release */ }
  } catch (e) { error = e; }
  return { status, error, ms: Date.now() - t0 };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

/**
 * Ask every probe; re-ask the ones that failed. Returns the result object that is written as JSON.
 * Every dependency that touches the world is injectable, so the judgement can be evaluated without
 * a network (tests/upstream-liveness-checks.test.mjs).
 */
export async function measureAll(probes, opt = {}) {
  const { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, recheckDelayMs = RECHECK_DELAY_MS,
    concurrency = CONCURRENCY, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => new Date() } = opt;
  const first = await pool(probes, concurrency, (p) => ask(p, { fetchImpl, timeoutMs }));
  /* the runner itself: did ANY probe reach ANY host? */
  let networkObserved = first.some((a) => a.status != null);
  const judge = (p, a) => classify({ status: a.status, error: a.error, expect: p.expect, networkObserved });
  const results = probes.map((p, k) => ({ p, attempts: [first[k]], c: judge(p, first[k]) }));
  const again = results.filter((r) => r.c.verdict !== 'alive' && networkObserved);
  if (again.length) {
    await sleep(recheckDelayMs);
    const second = await pool(again, concurrency, (r) => ask(r.p, { fetchImpl, timeoutMs: timeoutMs * 2 }));
    if (!networkObserved && second.some((a) => a.status != null)) networkObserved = true;
    again.forEach((r, k) => { r.attempts.push(second[k]); r.recovered = judge(r.p, second[k]).verdict === 'alive'; r.c = judge(r.p, second[k]); });
  }
  const hosts = results.map((r) => ({
    host: r.p.host, url: r.p.url, expect: r.p.expect, verdict: r.c.verdict, why: r.c.why,
    status: r.attempts[r.attempts.length - 1].status,
    ms: r.attempts[r.attempts.length - 1].ms,
    ...(r.recovered ? { recovered: 'failed the first attempt (' + judge(r.p, r.attempts[0]).why + ') and answered the second' } : {}),
    attempts: r.attempts.map((a) => ({ status: a.status, ms: a.ms, ...(a.error ? { error: classify({ error: a.error }).why } : {}) })),
  }));
  const counts = Object.fromEntries(VERDICTS.map((v) => [v, hosts.filter((h) => h.verdict === v).length]));
  return { measuredAt: now().toISOString(), networkObserved, timeoutMs, counts, hosts };
}

/* ── comparing two nights ──────────────────────────────────────────────────────────────────── */

/* How many consecutive runs a host that was up must be down before the run turns red.
   OBSERVED: 2026-09-30, overpass-api.de answered 200 at one run and 504 on both attempts of the next,
   hours apart — a public service's bad hour is common and nothing in this repository can act on it.
   Two nights in a row is the first point at which «it stopped working» is a fact about the host
   rather than about the hour. EXPIRES: if outages that matter are routinely shorter than a day
   (then this reports them late), or two-night blips turn out common (then it is too eager).
   CANON: this constant. */
export const CONFIRM_RUNS = 2;

const stateOf = (v) => (v === 'alive' ? 'up' : v === 'dead' || v === 'refused' ? 'down' : null);

/**
 * Carry each host's streak from `prev` into `cur` (mutating cur.hosts[i].streak / .from) and say
 * what changed:
 *   down      a host that was UP has now been DOWN for exactly CONFIRM_RUNS runs — the red condition
 *   failing   down for fewer runs than that (reported, not red)
 *   up        down before, alive now
 *   appeared  not in the previous result
 * `unobserved` is no state at all: it neither extends nor breaks a streak.
 */
export function transitions(prev, cur) {
  const before = new Map(((prev && prev.hosts) || []).map((h) => [h.host, h]));
  const down = [], failing = [], up = [], appeared = [];
  for (const h of (cur && cur.hosts) || []) {
    const p = before.get(h.host);
    const now = stateOf(h.verdict);
    const pState = p ? (p.state || stateOf(p.verdict)) : null;
    const pStreak = p && Number.isInteger(p.streak) ? p.streak : (pState ? 1 : 0);
    if (!p) appeared.push({ host: h.host, now: h.verdict });
    if (now == null) {                     /* unobserved: carry the previous state untouched */
      if (p) { h.state = pState; h.streak = pStreak; h.from = p.from || null; }
      continue;
    }
    if (pState === now) { h.state = now; h.streak = pStreak + 1; h.from = p.from || null; }
    else { h.state = now; h.streak = 1; h.from = pState; }
    if (now === 'down') {
      const row = { host: h.host, now: h.verdict, runs: h.streak, from: h.from, why: h.why };
      if (h.from === 'up' && h.streak === CONFIRM_RUNS) down.push(row);
      else if (h.from === 'up' && h.streak < CONFIRM_RUNS) failing.push(row);
    } else if (pState === 'down') up.push({ host: h.host, was: p.verdict, now: h.verdict });
  }
  return { down, failing, up, appeared, confirmRuns: CONFIRM_RUNS, comparedWith: prev ? prev.measuredAt || null : null };
}

/* ── reporting ─────────────────────────────────────────────────────────────────────────────── */

export function summary(result, change, decl) {
  const L = [];
  const c = result.counts;
  L.push('## Upstream liveness — ' + result.measuredAt);
  L.push('');
  L.push(`alive **${c.alive}** · refused **${c.refused}** · dead **${c.dead}** · unobserved **${c.unobserved}** · not requested ${decl ? decl.notRequested.length : '—'}`);
  if (!result.networkObserved) L.push('', '> ⚠ No probe reached any host: this runner had no network. Nothing below is a statement about the upstreams.');
  if (change) {
    L.push('', change.comparedWith ? `Compared with ${change.comparedWith}.` : 'No previous result to compare with.');
    if (change.down.length) {
      L.push('', `### Down for ${change.confirmRuns} runs in a row after being up (this is what turns the run red)`, '', '| host | now | why |', '|---|---|---|');
      for (const d of change.down) L.push(`| \`${d.host}\` | **${d.now}** | ${d.why} |`);
    }
    if (change.failing.length) {
      L.push('', `### Failing since this run (red if still down in the next ${change.confirmRuns - 1} run(s))`, '',
        change.failing.map((d) => `\`${d.host}\` ${d.now} — ${d.why}`).join('<br>'));
    }
    if (change.up.length) L.push('', '### Came back', '', change.up.map((u) => `\`${u.host}\` (${u.was} → alive)`).join(', '));
    if (change.appeared.length && change.comparedWith) L.push('', '### New in this run', '', change.appeared.map((a) => `\`${a.host}\` ${a.now}`).join(', '));
  }
  const bad = result.hosts.filter((h) => h.verdict !== 'alive');
  if (bad.length) {
    L.push('', '### Not alive in this run', '', '| host | verdict | why | runs in this state | probe |', '|---|---|---|---|---|');
    for (const h of bad) L.push(`| \`${h.host}\` | ${h.verdict} | ${h.why} | ${h.streak ?? '—'} | ${h.url} |`);
  }
  const rec = result.hosts.filter((h) => h.recovered);
  if (rec.length) L.push('', '### Answered only the second attempt', '', rec.map((h) => `\`${h.host}\``).join(', '));
  L.push('', '<sub>scripts/upstream-liveness.mjs · probes declared in scripts/outbound-hosts.json · docs/MONITORING.md</sub>');
  return L.join('\n') + '\n';
}

/* ── main ──────────────────────────────────────────────────────────────────────────────────── */

const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };
const has = (k) => process.argv.includes(k);

async function main() {
  const ledger = JSON.parse(fs.readFileSync(path.join(ROOT, LEDGER), 'utf8'));
  const decl = declared(ledger);
  for (const p of decl.problems) console.error('✖  ' + p);
  if (has('--check')) {
    console.log(`upstream-liveness --check: ${decl.probes.length} probe(s) declared, ${decl.notRequested.length} row(s) not requested or not probed, ${decl.problems.length} problem(s)`);
    process.exit(decl.problems.length ? 1 : 0);
  }
  if (!decl.probes.length) { console.error('no probe is declared — nothing was measured, and that is not «all alive»'); process.exit(2); }
  const result = await measureAll(decl.probes);
  result.notRequested = decl.notRequested;
  result.declarationProblems = decl.problems;
  let prev = null;
  const pp = arg('--previous');
  if (pp && fs.existsSync(pp)) { try { prev = JSON.parse(fs.readFileSync(pp, 'utf8')); } catch (e) { console.error('the previous result is not readable JSON — compared with nothing: ' + e.message); } }
  const change = transitions(prev, result);
  result.transitions = change;

  const w = Math.max(...result.hosts.map((h) => h.host.length));
  for (const h of [...result.hosts].sort((a, b) => VERDICTS.indexOf(b.verdict) - VERDICTS.indexOf(a.verdict) || (a.host < b.host ? -1 : 1))) {
    console.log(`${h.verdict.padEnd(10)} ${h.host.padEnd(w)}  ${String(h.status ?? '—').padStart(3)} ${String(h.ms).padStart(6)} ms  ${h.verdict === 'alive' ? (h.recovered ? '(second attempt)' : '') : h.why}`);
  }
  const c = result.counts;
  console.log(`\nalive ${c.alive} / refused ${c.refused} / dead ${c.dead} / unobserved ${c.unobserved} — ${decl.notRequested.length} row(s) not requested (link/dormant)`
    + (result.networkObserved ? '' : ' — ⚠ this runner reached no host at all'));
  if (prev) console.log(`since ${change.comparedWith}: down ${CONFIRM_RUNS} runs after being up ${change.down.length}, failing since this run ${change.failing.length}, back ${change.up.length}, new ${change.appeared.length}`
    + (change.down.length ? ' — ' + change.down.map((d) => d.host + ' ' + d.now).join(', ') : ''));

  const out = arg('--out');
  if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  const sm = arg('--summary');
  if (sm) fs.appendFileSync(sm, summary(result, prev ? change : null, decl));
  if (has('--fail-on-transition') && change.down.length) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
