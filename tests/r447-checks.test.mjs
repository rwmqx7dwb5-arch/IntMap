/* ============================================================================
 *  R447 — 「使っていないのに使い切ったと言われて、リロードすると直る」
 * ----------------------------------------------------------------------------
 *  Observed in production on 2026-08-25 (build R441, signed in): Atlas answered
 *  「本日の無料AI使用回数に達しました。」 with NOT ONE network request made, while
 *  public.ai_usage for that account read `count: 0` at the same moment. A reload cured it.
 *
 *  ══ WHAT THE NUMBER WAS ═════════════════════════════════════════════════════════════════════
 *  js/ai-core.js kept a MIRROR of the server's counter, and one branch wrote a number the server
 *  had never sent: any 429 whose body it could not read became `used = the daily limit`. ai-proxy
 *  answers 429 in exactly two places and BOTH carry `used`, and neither can even occur at count 0
 *  (`limit` needs a row already AT the limit; `turn_calls` needs a turn whose first call charged,
 *  so ≥ 1) — so the 429 came from in front of the function and the number was invented here.
 *
 *  Then nothing could take it back: the only re-sync was a login or opening Settings, so all three
 *  pre-gates (aiGate, askAI, js/atlas-console.js) refused every later question WITHOUT ASKING
 *  ANYONE. The server never got to disagree. Reloading built a new object; that was the whole cure.
 *
 *  ⚠ These checks are BEHAVIOURAL — the module is instantiated and driven, not grepped. The defect
 *  was a value written at runtime, and a spelling check would have passed on every line of it.
 *
 *    ① an unattributed 429 must not write the counter, must not name the daily limit,
 *       and must not silence the NEXT question   ← the reproduction
 *    ② ai-proxy's own two 429s are still believed, and still told apart (#R318 regression)
 *    ③ a stale-high mirror is re-read from public.ai_usage before anybody is refused
 *       — the cure that used to be a reload
 *    ④ the client-side quota rule has ONE spelling
 *    ⑤ the 429 body is kept, so the next unattributable 429 IS attributable
 *    ⑥ the server half: both 429s carry `used`, and nothing else in ai-proxy answers 429
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

/* ══ THE APP'S OWN AI CORE, RUNNING ═══════════════════════════════════════════════════════════
   js/ai-core.js is a plain script that hangs a factory on window — the same way index.html loads
   it. `new Function` is how the other check files run these (a bare `export` would break them:
   see #R443). Nothing here is a stub of the code under test: only the browser around it. */
function harness({ serverCount = 0, respond, user = { id: '613271ce-0000-4000-8000-000000000000' } } = {}) {
  const calls = [];
  const win = {
    IntMapModules: {},
    INTMAP_AI_PROXY: { url: 'https://vpekfwdpurzejrrmacac.supabase.co/functions/v1/ai-proxy' },
    SUPABASE_ANON_KEY: 'anon-key',
  };
  win.window = win;
  const localStorage = {
    _m: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
    setItem(k, v) { this._m[k] = String(v); },
  };
  /* ⚠ NOT localhost — aiDev() treats a local origin as the developer and lifts the gate entirely,
     which would make every one of these checks pass on nothing. */
  const location = { protocol: 'https:', hostname: 'rwmqx7dwb5-arch.github.io' };
  const document = {
    getElementById() { return null; },
    createElement() { return { classList: { add() {}, remove() {} }, style: {}, addEventListener() {}, querySelector() { return null; } }; },
    body: { appendChild() {} },
  };
  const usage = { reads: 0 };
  const row = () => ({ select() { return this; }, eq() { return this; }, async maybeSingle() { usage.reads++; return { data: { count: serverCount } }; } });
  win.sb = { auth: { async getSession() { return { data: { session: { access_token: 'jwt' } } }; } }, from() { return row(); } };
  const fetchStub = async (url, opts) => { calls.push({ url, opts }); return respond(url, opts); };

  const load = (p) => new Function('window', 'document', 'location', 'localStorage', 'navigator', 'fetch', read(p))
    (win, document, location, localStorage, {}, fetchStub);
  load('js/lang-registry.js');
  load('js/ai-core.js');

  const aiUsage = { date: '', used: 0, limit: 10 };
  const HOST = {
    lang: 'jp', user, aiUsage, AI_FREE_DAILY: 10, aiButtonSyncers: [],
    openAuthModal() {}, t(k) { return k; },
  };
  return { IM: win.IntMapModules.aiCore(HOST), HOST, aiUsage, calls, usage, win };
}

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, async json() { return JSON.parse(body); }, async text() { return body; } });
const askFails = async (IM, q) => { try { await IM.askAI(q || 'x', '', [], { task: 'atlas_turn', turnId: 't' + q }); return ''; } catch (e) { return e.message; } };

const LIMIT_JA = '本日の無料AI使用回数に達しました。';

/* ══ ① THE REPRODUCTION ══════════════════════════════════════════════════════════════════════ */

test('R447 ①a: a 429 IntMap did not write must not spend the reader’s day', async () => {
  /* what a rate limit in front of the Edge Function looks like: a 429 with no JSON at all */
  const h = harness({ serverCount: 0, respond: async () => res(429, '<html><head><title>429 Too Many Requests</title></head></html>') });

  const first = await askFails(h.IM, 'a');
  assert.notEqual(first, LIMIT_JA,
    'an unattributed 429 must not be reported as the daily free-use limit — that is the sentence the reader saw with count 0');
  assert.ok(/混雑|busy/.test(first), `the reader must be told the service is busy, got: ${first}`);

  assert.equal(h.aiUsage.used, 0, 'the counter mirrors public.ai_usage — a 429 that carried no number must leave it alone');
  assert.equal(h.IM.aiUsesLeft(), 10, 'and the day must still be whole');
});

test('R447 ①b: …and it must not silence the NEXT question', async () => {
  const h = harness({ serverCount: 0, respond: async () => res(429, 'Too Many Requests') });
  await askFails(h.IM, 'a');
  const before = h.calls.length;
  const second = await askFails(h.IM, 'b');
  assert.equal(h.calls.length - before, 1,
    'the next question was refused with ZERO network requests — the client had decided on its own that the day was over');
  assert.notEqual(second, LIMIT_JA, 'and it must still not be reported as the daily limit');
  assert.equal(h.IM.aiGate(), true, 'the click-time gate must be open — the server never said it was closed');
});

/* ══ ② ai-proxy's OWN TWO 429s ═══════════════════════════════════════════════════════════════ */

test('R447 ②a: the daily-limit 429 is still believed, exactly', async () => {
  const h = harness({ serverCount: 10, respond: async () => res(429, JSON.stringify({ error: 'limit', used: 10, limit: 10 })) });
  assert.equal(await askFails(h.IM, 'a'), LIMIT_JA, 'a real limit 429 must still read as the daily limit');
  assert.equal(h.aiUsage.used, 10, 'and the number the server sent is the number the client keeps');
});

test('R447 ②b: the turn_calls 429 is not a bill the reader owes (#R318)', async () => {
  const h = harness({ serverCount: 3, respond: async () => res(429, JSON.stringify({ error: 'turn_calls', used: 3, limit: 10, calls: 13 })) });
  const msg = await askFails(h.IM, 'a');
  assert.notEqual(msg, LIMIT_JA, 'a stuck repair loop must never read as "you are out of uses"');
  assert.ok(/試行が多く|too many tries/.test(msg), `got: ${msg}`);
  assert.equal(h.aiUsage.used, 3, 'and it carries the true count — this 429 is NOT what pinned the page');
  assert.equal(h.IM.aiUsesLeft(), 7, 'seven uses were left and seven uses must be left');
});

/* ══ ③ THE CURE THAT USED TO BE A RELOAD ═════════════════════════════════════════════════════ */

test('R447 ③a: a stale-high mirror is re-read from the row before anybody is refused', async () => {
  const h = harness({ serverCount: 2, respond: async () => res(200, JSON.stringify({ text: 'ok', used: 3, limit: 10 })) });
  /* whatever put it there — a stale copy, a refunded use, a day boundary — the client believes
     it has nothing left while public.ai_usage says 2 of 10. */
  h.aiUsage.date = h.IM.aiToday(); h.aiUsage.used = 10;
  assert.equal(h.IM.aiUsesLeft(), 0, 'precondition: the mirror says the day is over');

  const out = await h.IM.askAI('a', '', [], { task: 'atlas_turn', turnId: 't1' });
  assert.equal(out, 'ok', 'the question must go through — the authority is the row, not the mirror');
  assert.ok(h.usage.reads >= 1, 'and it must have actually asked public.ai_usage');
  assert.equal(h.calls.length, 1, 'exactly one AI request was sent');
});

test('R447 ③b: the synchronous click gate refuses once, then repairs itself', async () => {
  const h = harness({ serverCount: 2, respond: async () => res(200, JSON.stringify({ text: 'ok', used: 3, limit: 10 })) });
  h.aiUsage.date = h.IM.aiToday(); h.aiUsage.used = 10;
  assert.equal(h.IM.aiGate(), false, 'aiGate() is called from click handlers and stays synchronous');
  await settle();
  assert.equal(h.aiUsage.used, 2, 'but it asked the row in the background, so the next click is answered from the server’s number');
  assert.equal(h.IM.aiGate(), true);
});

test('R447 ③c: a genuine limit survives the re-read', async () => {
  const h = harness({ serverCount: 10, respond: async () => res(200, JSON.stringify({ text: 'ok', used: 10, limit: 10 })) });
  h.aiUsage.date = h.IM.aiToday(); h.aiUsage.used = 10;
  assert.equal(await askFails(h.IM, 'a'), LIMIT_JA, 'when the row agrees, the reader is still told the truth');
  assert.equal(h.calls.length, 0, 'and no use is spent finding that out');
});

/* ══ ④ ONE SPELLING OF THE RULE ══════════════════════════════════════════════════════════════ */

test('R447 ④: no file carries its own copy of the quota rule', () => {
  const core = codeOnly(read('js/ai-core.js'));
  assert.match(core, /function aiOverQuota\(\)/, 'the rule must be named once');
  assert.match(core, /async function aiQuotaBlocked\(\)/, 'and the asking form must exist');
  /* the invented number, by its shape: `aiUsage.used = <the limit>` */
  assert.doesNotMatch(core, /aiUsage\.used\s*=\s*aiDailyLimit\(\)/,
    'the counter must never be set to the limit by the client — that is the phantom');

  const atlas = codeOnly(read('js/atlas-console.js'));
  assert.match(atlas, /await aiQuotaBlocked\(\)/, 'js/atlas-console.js must ask through the one answer');
  assert.doesNotMatch(atlas, /aiUsesLeft\(\)\s*<=\s*0/,
    'js/atlas-console.js must not re-derive the gate — that private copy is what refused a turn with no request sent');

  /* and the module really does export it, wired the way every other one is (#R169) */
  assert.match(read('js/ai-core.js'), /aiParseJSON, aiQuotaBlocked, aiReady/, 'aiQuotaBlocked must be exported');
  assert.match(read('js/app-body.js'), /function aiQuotaBlocked\(\)\{ return IM_AI\.aiQuotaBlocked\.apply\(this,arguments\); \}/,
    'the app shell must hold the hoisted forwarding shim');
  assert.match(read('js/app-body.js'), /get aiQuotaBlocked\(\)\{ return aiQuotaBlocked; \}/, 'and IM_HOST must expose it');
});

/* ══ ⑤ THE BODY IS KEPT ══════════════════════════════════════════════════════════════════════ */

test('R447 ⑤: the 429 that could not be attributed leaves something to attribute it by', async () => {
  const h = harness({ serverCount: 0, respond: async () => res(429, 'rate limit exceeded') });
  await askFails(h.IM, 'a');
  const rec = h.win._aiLast429;
  assert.ok(rec, 'nothing was recorded — this round began with "we do not know which 429 arrived"');
  assert.equal(rec.attributed, false, 'and it must say plainly that IntMap did not write it');
  assert.equal(rec.error, null);
  assert.match(rec.body, /rate limit exceeded/, 'the body must be kept, not discarded by a failed r.json()');

  const g = harness({ serverCount: 4, respond: async () => res(429, JSON.stringify({ error: 'turn_calls', used: 4, limit: 10, calls: 13 })) });
  await askFails(g.IM, 'a');
  assert.equal(g.win._aiLast429.attributed, true);
  assert.equal(g.win._aiLast429.error, 'turn_calls');
  assert.equal(g.win._aiLast429.used, 4);
});

/* ══ ⑥ THE SERVER HALF — what the client's attribution rests on ══════════════════════════════ */

test('R447 ⑥: ai-proxy answers 429 in exactly two places, and both carry `used`', () => {
  const proxy = read('supabase/functions/ai-proxy/index.ts');
  const src = codeOnly(proxy);
  const four29 = [...src.matchAll(/return json\(\s*(\{[^}]*\})\s*,\s*429\s*\)/g)].map((m) => m[1]);
  assert.equal(four29.length, 2, `ai-proxy returns ${four29.length} 429s — the client tells its own quota from a platform rate limit by the body, so a third shape must be declared here`);
  four29.forEach((body) => {
    assert.match(body, /\bused\b/, `a 429 without \`used\` is unattributable to the client: ${body}`);
    assert.match(body, /error: "(limit|turn_calls)"/, `and it must name itself: ${body}`);
  });
  assert.match(src, /const TURN_MAX_CALLS = \d+;/, 'the turn ceiling is what makes the second 429 possible');

  /* …and neither of them can happen while the row reads 0, which is what proved the production
     429 came from somewhere else. `limit` needs a row already at the limit; `turn_calls` reads the
     real count out of ai_usage rather than reporting the limit. */
  const mig = read('supabase/migrations/20260823090000_ai_turn_quota.sql');
  assert.match(mig, /return query select coalesce\(v_count, 0\), false, false, v_calls, 'turn_calls'::text;/,
    'the turn_calls branch must report the ACTUAL count — reporting the limit here would make the client’s attribution wrong');
  assert.match(read('supabase/migrations/20260718090000_baseline.sql'), /do update set count = u\.count \+ 1\s*\r?\n\s*where u\.count < p_limit/,
    'the daily 429 is only reachable with a row already at the limit');
});
