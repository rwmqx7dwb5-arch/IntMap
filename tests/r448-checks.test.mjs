/* ============================================================================
 *  R448 — A TURN THAT ALWAYS ENDS
 * ----------------------------------------------------------------------------
 *  Reported from production (build R430 / R433, measured 2026-08-24): open a News event's detail
 *  through `.ev-sources`, ask Atlas 「この出来事について詳しく」, and the bubble stays on 「Searching」
 *  for more than two minutes before the renderer itself stops responding — taking other tabs on the
 *  same origin with it. `ai-proxy` answered 200 both times (5.1 s and 33.3 s), so nothing was wrong
 *  with the model, the account or the transport. What never came back was the EVIDENCE.
 *
 *  ⚠⚠⚠ THE DEFECT WAS THE ABSENCE OF A CLOCK, NOT THE PRESENCE OF A LOOP. There is no runaway
 *  recursion and no unbounded retry anywhere in that path; every ceiling the loop had counted
 *  something (steps, calls, malformed replies) and NONE of them measured time. Between 「Atlas chose
 *  a tool」 and 「the answer is drawn」 the awaits with no deadline of any kind were:
 *
 *      js/atlas-agent.js        await execute(call)              — and one step may carry eight
 *      js/atlas-toolsurface.js  await runAction(built.action)
 *      js/atlas-console.js      await Promise.all(jobs)          — waits for the SLOWEST source
 *      js/atlas-console.js      _fetchJSON — 3 proxies × 9 s, WALKED, clock cleared at the headers
 *      js/atlas-sources.js      _fetchText — the same ladder again
 *      js/atlas-geo-resolve.js  geocode() / _nomExtent()         — Nominatim, no signal at all
 *      js/atlas-verify.js       _atlGeocodeStrict()              — Nominatim, ×24 in a file, and
 *                                                                  the LAST await before drawing
 *
 *  Every test below drives the real module, not a copy of it.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeAtlasAgent } from '../js/atlas-agent.js';
import { fetchViaProxy } from '../js/proxy-fetch.js';
import { jsonWithin } from '../js/fetch-deadline.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* ⚠ (#R345, fourteen rounds of it) A COMMENT THAT DESCRIBES THE DEFECT IS NOT THE DEFECT. Every
   file touched this round explains in prose what it used to do, so a check for 「the old ladder is
   gone」 read against the raw text would be satisfied by the note saying it is gone. */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const AGENT = makeAtlasAgent();

/* A body that begins and then stalls — a 200 whose bytes never finish arriving. This is what
   api.allorigins.win did on the live site (headers in ~8.7 s, body later or never), and it is the
   ONE shape the old `clearTimeout`-on-headers pattern could not survive. A real Response rejects
   `.text()` when its signal aborts; so does this one, and if the caller has stopped arming the
   signal across the body read, nothing here ever settles — which is the failure being tested. */
function stallingFetch() {
  const calls = [];
  return Object.assign(async (url, init) => {
    calls.push(String(url));
    const signal = init && init.signal;
    return {
      ok: true, status: 200,
      text: () => new Promise((_res, rej) => {
        if (!signal) return;                                  /* unbounded on purpose: the test races it */
        if (signal.aborted) return rej(new Error('AbortError'));
        signal.addEventListener('abort', () => rej(new Error('AbortError')));
      }),
    };
  }, { calls });
}
/* the test's own backstop, so a regression FAILS instead of hanging the suite */
const orHang = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res('HUNG'), ms))]);

/* ── ① a body that never finishes is still bounded ─────────────────────────────────────────────── */
test('R448 ①: fetchViaProxy keeps the clock armed until the body is READ, not until the headers land', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stallingFetch();
  try {
    const t0 = Date.now();
    const out = await orHang(fetchViaProxy('https://news.google.com/rss/search?q=x', { budgetMs: 1500 }), 12000);
    assert.notEqual(out, 'HUNG', 'a proxy that answers 200 and then stalls mid-body must not hold the call open');
    assert.equal(out, null, 'nothing was fetched, so nothing is what the caller is told');
    assert.ok(Date.now() - t0 < 9000, 'the whole ladder must finish inside the budget it was given, not per-attempt');
  } finally { globalThis.fetch = real; }
});

test('R448 ①b: jsonWithin rejects on its deadline rather than waiting out a stalled body', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = stallingFetch();
  try {
    const out = await orHang(jsonWithin('https://nominatim.openstreetmap.org/search?q=x', 300)
      .then(() => 'RESOLVED', () => 'REJECTED'), 8000);
    assert.equal(out, 'REJECTED', 'the deadline must reach the caller as a failure, the way a refusal does');
  } finally { globalThis.fetch = real; }
});

/* ── ② a tool that never returns no longer takes the turn with it ──────────────────────────────── */
test('R448 ②: a tool that never settles is reported to Atlas, and the turn goes on', async () => {
  const replies = [
    { text: '', toolCalls: [{ id: 't0', name: 'web_search', arguments: { query: 'news' } }] },
    { text: 'ここまでで分かったことを答えます。', toolCalls: [] },
  ];
  let i = 0;
  const model = async () => replies[Math.min(i++, replies.length - 1)];
  const out = await orHang(AGENT.runTurn({
    model,
    tools: { web_search: { name: 'web_search', description: 'x', parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1 } } } } },
    execute: () => new Promise(() => { /* the network that never answers */ }),
    messages: [{ role: 'user', content: 'この出来事について詳しく' }],
    limits: { toolTimeoutMs: 60 },
  }), 8000);
  assert.notEqual(out, 'HUNG', 'the turn must not inherit the tool’s silence');
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].ok, false);
  assert.equal(out.results[0].error, 'tool_timeout', 'and Atlas is TOLD what happened, rather than the loop deciding for it');
  assert.equal(out.text, 'ここまでで分かったことを答えます。', 'the reader still gets a sentence');
});

/* ── ③ …and neither does a turn that has simply run long ───────────────────────────────────────── */
test('R448 ③: past the turn budget the loop stops calling tools and writes the answer', async () => {
  /* an injected clock — the loop reads `opts.now`, so this asserts the real branch with no sleeping */
  let t = 0;
  const now = () => (t += 100);
  const model = async (req) => (req.final
    ? { text: '取得できなかったものを添えて答えます。', toolCalls: [] }
    : { text: '', toolCalls: [{ id: 't0', name: 'web_search', arguments: { query: 'news' } }] });
  const out = await orHang(AGENT.runTurn({
    model, now,
    tools: { web_search: { name: 'web_search', description: 'x', parameters: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1 } } } } },
    execute: async () => ({ ok: true }),
    messages: [{ role: 'user', content: 'この出来事について詳しく' }],
    limits: { turnBudgetMs: 250 },
  }), 8000);
  assert.notEqual(out, 'HUNG');
  assert.equal(out.stopped, 'time_budget');
  assert.ok(out.text, 'a turn that ran out of clock still answers — that is the whole point of the clock');
  assert.ok(out.calls >= 1, 'and it is not a turn that was prevented from doing anything');
});

test('R448 ③b: the two clocks are LIMITS, and limits are technical — none of them is a smaller world', () => {
  assert.equal(AGENT.LIMITS.maxSteps, 8, 'no ceiling Atlas already had may be lowered by this round');
  assert.equal(AGENT.LIMITS.maxToolCalls, 32);
  assert.equal(AGENT.LIMITS.maxPerStep, 8);
  /* ⚠ MEASURED, NOT PICKED. One ordinary turn about an open news article took 191 s on the live
     site (four ai-proxy calls: 8.1 / 51.2 / 48.9 / 17.2 s), the slowest single call was 73.2 s, and
     ONE working `analyze` can cost ~200 s (2 model calls + a 32 s gather + a 20 s pinning pass).
     A deadline under those cuts turns that were about to succeed — the defect, re-introduced as a
     limit, which is exactly what CONSTITUTION.md §5 forbids. */
  assert.ok(AGENT.LIMITS.toolTimeoutMs >= 210000, 'a tool deadline this tight would cut a working analyze');
  assert.ok(AGENT.LIMITS.turnBudgetMs >= 400000, 'and this one would cut a turn that was about to answer');
});

/* ── ④ Atlas stopped keeping private copies of the relay ladder ────────────────────────────────── */
test('R448 ④: Atlas fetches evidence through the app’s ONE relay ladder', () => {
  for (const f of ['js/atlas-console.js', 'js/atlas-sources.js', 'js/atlas-deadlines.js']) {
    const s = code(f);
    assert.ok(!/PROX\s*=\s*\[\s*x\s*=>\s*x\s*,/.test(s), `${f} still carries its own sequential proxy ladder`);
    assert.ok(!/corsproxy\.io/.test(s), `${f} names a public relay directly instead of going through js/proxy-fetch.js`);
  }
  for (const f of ['js/atlas-sources.js', 'js/atlas-deadlines.js']) {
    assert.match(code(f), /fetchViaProxy\(/, `${f} must reach the relays through the one module that clocks them`);
  }
  /* …and the module it now uses is the one that puts OUR Edge Function first (#R216) */
  assert.match(read('js/proxy-fetch.js'), /news-relay\?u=/);
});

/* ── ⑤ every await between the tool call and the drawing has a deadline ────────────────────────── */
test('R448 ⑤: no Atlas path awaits Nominatim without a clock', () => {
  for (const f of ['js/atlas-verify.js', 'js/atlas-geo-resolve.js']) {
    const s = code(f);
    assert.ok(!/fetch\(\s*['"`]https:\/\/nominatim/.test(s), `${f} still calls Nominatim with a bare fetch`);
    assert.match(s, /jsonWithin\(\s*['"`]https:\/\/nominatim/, `${f} must go through the deadline helper`);
  }
  /* the mapping self-check awaits up to 24 of them one after another — the PASS needs the budget */
  assert.match(code('js/atlas-verify.js'), /PINPASS_BUDGET_MS/, 'the pinning pass has no budget');
});

/* ── ⑥ Stop reaches the network, and a superseding turn does not stack on top of the old one ───── */
test('R448 ⑥: an aborted turn stops fetching, instead of running its relay ladder out', async () => {
  const real = globalThis.fetch;
  const stub = stallingFetch();
  globalThis.fetch = stub;
  const ctl = new AbortController();
  try {
    const p = fetchViaProxy('https://news.google.com/rss/search?q=x', { budgetMs: 60000, signal: ctl.signal });
    await new Promise((r) => setTimeout(r, 80));
    const opened = stub.calls.length;
    assert.ok(opened > 0, 'the racer never started, so this proves nothing');
    ctl.abort();
    const out = await orHang(p, 4000);
    assert.notEqual(out, 'HUNG', 'Stop must not leave the ladder running its full budget');
    assert.equal(out, null);
    await new Promise((r) => setTimeout(r, 120));
    assert.equal(stub.calls.length, opened, 'a cancelled call must not open further relay attempts');
  } finally { globalThis.fetch = real; ctl.abort(); }
});

test('R448 ⑥c: asking a second question ABORTS the first turn instead of joining it', () => {
  const s = code('js/atlas-console.js');
  /* the run() path installs a fresh controller — and must cancel the one it is replacing. Measured
     on the live site before this line existed: a superseded ai-proxy call ran 12.6 s more and
     returned 200, a superseded turn issued a NEW external fetch 3.7 s after being replaced, and
     calls were still going out 280 s after the reader's last message with the button idle. */
  assert.match(s, /_abortCtl=newTurnController\(_abortCtl\)/, 'a new turn still replaces the old AbortController without aborting it');
  assert.ok(!/_abortCtl=\(typeof AbortController/.test(s), 'the un-aborting replacement is still in the file');
  assert.match(code('js/atlas-deadlines.js'), /export function newTurnController\(prev\)[\s\S]{0,200}prev\.abort\(\)/,
    'newTurnController must actually cancel the controller it replaces');
  /* …and the Stop button's own path is unchanged */
  assert.match(s, /function _stopRun\(\)[\s\S]{0,160}_abortCtl\.abort\(\)/, 'Stop must still abort');
});

test('R448 ⑥b: Atlas hands its turn signal to the evidence fetches, not only to the model call', () => {
  /* ⚠ the signal is a THUNK read at call time — one captured when the module was wired would belong
     to no turn at all, because `run()` installs the controller when a turn starts */
  const s = code('js/atlas-console.js');
  assert.match(s, /turnSignal\s*=\s*\(\)\s*=>[\s\S]{0,90}_abortCtl\.signal/, 'there is no way for a fetch to see the turn’s controller');
  assert.match(s, /makeFetchJSON\(turnSignal\)/, 'the JSON evidence fetcher is not given the thunk');
  assert.match(code('js/atlas-deadlines.js'), /signal:\s*\(typeof turnSignal === 'function'\) \? turnSignal\(\)/,
    'the JSON evidence ladder still cannot be stopped');
  assert.match(code('js/atlas-sources.js'), /signal:\(CTX\.turnSignal/, 'the Google-News ladder still cannot be stopped');
});

test('R448 ⑤b: the evidence gather is bounded, and says how many sources did not arrive', () => {
  const s = code('js/atlas-console.js');
  assert.ok(!/await\s+Promise\.all\(jobs\)/.test(s), 'the gather still waits for the slowest source with no ceiling');
  assert.match(s, /settleWithin\(jobs,\s*GATHER_BUDGET_MS\)/, 'the gather is not bounded');
  assert.match(s, /missing\.push\(lateNote\(/, 'a source that did not arrive in time must be named, not silently dropped');
  /* …and the gather reports the count rather than swallowing it */
  assert.match(code('js/atlas-deadlines.js'), /res\(n - done\)/, 'settleWithin must say HOW MANY were still in flight');
});
