/* ============================================================================
 *  Runs ONE build of the ai-proxy Edge Function in THIS node process and prints what it did with a
 *  list of requests — for tests/atlas-core-split-checks.test.mjs, which runs it as a child process
 *  once per case (module state such as the isolate's ceilings is per isolate, as it is deployed).
 *
 *  Deno.serve is captured and fetch is stubbed; nothing of the function under test is replaced.
 *  Configuration arrives as JSON in the file AIPC_CFG_FILE names (a file, because one case's body is
 *  larger than Linux allows a single environment string to be):
 *    entry      file URL of the build's entry point (the function's index.ts, or a photograph of it)
 *    env        the function's environment
 *    requests   [{ method, headers, body, user, ageDays, rpc: { name: answer | [answers…] }, provider: [answers…] }]
 *               user     what /auth/v1/user answers (null → 401, as the auth server does)
 *               ageDays  the account's age — created_at is computed from it, so the newcomer cohort
 *                        (_shared/ai-ledger.js cohortOf, which reads the clock) is the same every run
 *               rpc      the database's answers, overriding the defaults below; a list is consumed in order
 *               provider the providers' answers, consumed one per provider request, in order:
 *                        { status, json } | { sse: [[event, data]...] }
 *  Output (stdout, JSON): per request { status, headers, body, calls, logs } — `calls` is every fetch
 *  the function made for that request, in order, with method, url, headers and body.
 * ==========================================================================*/
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(process.env.AIPC_CFG_FILE, 'utf8'));
const HOSTS = ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com'];
globalThis.Deno = { env: { get: (k) => (cfg.env || {})[k] ?? undefined }, serve: (h) => { globalThis.__h = h; } };

const DEFAULT_RPC = {
  relay_take: [{ allowed: true, remaining: 9 }],
  consume_ai_turn: [{ allowed: true, used: 1, charged: true, calls: 1 }],
  consume_ai_gloss: [{ allowed: true, used: 1 }],
  refund_ai_turn: [{ ok: true }], settle_ai_turn: [{ ok: true }], refund_ai_gloss: null,
  record_ai_usage: null,
  peek_ai_answer: [], claim_ai_answer: [{ outcome: 'claimed', attempts: 1, status: 0, body: null, after_state: '' }],
  beat_ai_answer: null, finish_ai_answer: null,
};
const respond = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
const sseBody = (events) => new Response(events.map(([e, d]) => 'event: ' + e + '\ndata: ' + JSON.stringify(d) + '\n\n').join(''),
  { status: 200, headers: { 'content-type': 'text/event-stream' } });

/* A body is recorded whole while it is small; a large one (an attachment, a too-large turn) by its
   length and digest, which still tells two builds apart byte for byte. */
const BODY_KEEP = 4096;
const recordBody = (text) => {
  if (text == null) return null;
  const s = String(text);
  if (s.length <= BODY_KEEP) { try { return JSON.parse(s); } catch (_) { return s; } }
  return { length: s.length, sha256: createHash('sha256').update(s).digest('hex'), head: s.slice(0, 200) };
};
/* The one value the function draws from the clock: Gemini's call ids ("g" + Date.now base 36 + "_" + i). */
const unclock = (s) => s.replace(/"g[0-9a-z]{6,}_(\d+)"/g, '"g<clock>_$1"');
const headersOf = (h) => Object.fromEntries([...new Headers(h || {}).entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

let req = null;   /* the request being served */
let calls = [];
let logs = [];
const providerN = { n: 0 };
const rpcN = {};
console.error = (...a) => { logs.push(unclock(a.map(String).join(' '))); };

globalThis.fetch = async (u, init = {}) => {
  const url = String(u && u.url ? u.url : u);
  const body = init.body == null ? null : typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body);
  calls.push({ method: String(init.method || 'GET'), url, headers: headersOf(init.headers), body: recordBody(body == null ? null : unclock(body)) });
  const host = new URL(url).hostname;
  if (HOSTS.includes(host)) {
    const list = req.provider || [];
    const r = list[Math.min(providerN.n, list.length - 1)] || { status: 404, json: {} };
    providerN.n++;
    return r.sse ? sseBody(r.sse) : respond(r.json === undefined ? {} : r.json, r.status || 200);
  }
  if (/\/auth\/v1\/user$/.test(url)) {
    if (!req.user) return respond({ code: 401, msg: 'invalid JWT' }, 401);
    return respond({ ...req.user, created_at: new Date(Date.now() - (req.ageDays ?? 400) * 86400000).toISOString() });
  }
  if (/\/rest\/v1\/profiles/.test(url)) return respond(req.profile ?? null);
  const rpc = (/\/rest\/v1\/rpc\/([a-z_]+)$/.exec(url) || [])[1];
  if (rpc) {
    const over = req.rpc && Object.prototype.hasOwnProperty.call(req.rpc, rpc) ? req.rpc[rpc] : undefined;
    let a = over !== undefined ? over : DEFAULT_RPC[rpc];
    if (over !== undefined && over && over.seq) { rpcN[rpc] = (rpcN[rpc] || 0); a = over.seq[Math.min(rpcN[rpc]++, over.seq.length - 1)]; }
    if (a && a.error) return respond({ message: a.error, code: 'P0001' }, 400);
    return respond(a === undefined ? null : a);
  }
  return respond({ message: 'no route' }, 404);
};

await import(cfg.entry);

const out = [];
for (const q of cfg.requests || []) {
  req = q; calls = []; logs = []; providerN.n = 0;
  for (const k of Object.keys(rpcN)) delete rpcN[k];
  const init = { method: q.method || 'POST', headers: q.headers || {} };
  if (init.method !== 'GET' && init.method !== 'HEAD' && q.body !== undefined) init.body = typeof q.body === 'string' ? q.body : JSON.stringify(q.body);
  const r = await globalThis.__h(new Request('https://fn.test/functions/v1/ai-proxy', init));
  const text = await r.text();
  /* what is still running after the answer left (EdgeRuntime has no waitUntil here) is given a turn */
  await new Promise((res) => setTimeout(res, 20));
  out.push({ status: r.status, headers: headersOf(r.headers), body: recordBody(unclock(text)), calls, logs });
}
process.stdout.write(JSON.stringify(out));
process.exit(0);
