/* ============================================================================
 *  edge-spend-and-models — one model table, one door to a paid provider, one ceiling per function
 * ----------------------------------------------------------------------------
 *  THE DEFECTS THIS FILE STATES (so that the next variant of each fails here too):
 *
 *  ① The default model of each provider was spelled in five functions and had drifted (ai-proxy
 *     gemini-3.5-flash, the four background jobs gemini-2.0-flash; claude-3-5-haiku-latest everywhere).
 *     ⇒ No function under supabase/functions spells a model id in code; the ids live in
 *       _shared/ai-provider.js, and every function that calls a chat model reads the table.
 *  ② Three private copies of «fetch a provider under a deadline», and three bare fetches with no byte
 *     ceiling. ⇒ In every function that reads a provider key, no fetch-like call is aimed at a
 *     provider host; the door (_shared/ai-provider.js providerFetch) is evaluated: without a ceiling,
 *     with the bucket refusing, and with the database silent, NOTHING reaches the provider.
 *  ③ monitor-run put the provider's error body into monitor_runs.error_detail (its owner reads it).
 *     ⇒ providerFail carries a status and a length and has no argument a body could travel through,
 *       and no function concatenates a `.text()` into an error it builds.
 *  ④ No function holding a paid key except atlas-embed had a project-wide ceiling, and atlas-embed's
 *     could be emptied by one account. ⇒ Every function that reads a `*_API_KEY` is evaluated and
 *     must export a ceiling named after itself; a scheduled one's arithmetic is held to the cron
 *     migration; ai-proxy and atlas-embed are run with the bucket refusing and must not reach the
 *     provider; atlas-embed takes the caller's day share before the project's.
 *  ⑤ ai-proxy's Anthropic paths attached web search and never said whether it ran, so switching the
 *     provider switched off the page's «external content was read» mark. ⇒ Evaluated, both paths.
 *  ⑥ ai-proxy/index.gemini-backup.ts was an unwired earlier version with none of the bounds (since
 *     removed). ⇒ Every
 *     code file in a function directory is reached from its index.ts, or says it is not deployed.
 *
 *  Runner: an Edge Function is evaluated in a child process with Deno.serve captured and fetch stubbed
 *  (the shape of tests/own-fetch-relay-checks.test.mjs); ai-proxy is TypeScript and runs under
 *  Node's type stripping. Nothing here reads a function as text to decide what it DOES — the text is
 *  read only to decide what it SPELLS (a model id, a host, a body in an error).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { parse } from 'acorn';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = join(ROOT, 'supabase/functions');
const SUPA = 'https://sb.test';
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const P = await import(pathToFileURL(join(FN, '_shared/ai-provider.js')).href);

/* ── source, as a parser sees it ────────────────────────────────────────────────────────────── */
/* The program with its comments blanked (a comment may narrate an old id or an old bug), and its
   relative imports. A .ts file is type-stripped first — Node's own stripper, positions preserved. */
function program(file) {
  let src = read(file);
  if (file.endsWith('.ts')) src = stripTypeScriptTypes(src, { mode: 'strip' });
  const comments = [];
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', onComment: comments });
  let code = src;
  for (const c of comments.sort((a, b) => b.start - a.start)) code = code.slice(0, c.start) + ' '.repeat(c.end - c.start) + code.slice(c.end);
  const imports = [];
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if ((n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source) imports.push(n.source.value);
    if (n.type === 'ImportExpression' && n.source && n.source.type === 'Literal') imports.push(n.source.value);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object' && k !== 'loc') walk(v);
    }
  };
  walk(ast);
  return { code, imports: imports.filter((s) => s.startsWith('.')) };
}

/* Every function directory, and the files its entrypoint reaches (its own and _shared's). */
const FUNCTIONS = readdirSync(FN).filter((d) => d !== '_shared' && statSync(join(FN, d)).isDirectory() && existsSync(join(FN, d, 'index.ts'))).sort();
function reach(fn) {
  const seen = new Set();
  const go = (file) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    for (const s of program(file).imports) go(resolve(dirname(file), s));
  };
  go(join(FN, fn, 'index.ts'));
  return [...seen];
}
const REACH = new Map(FUNCTIONS.map((f) => [f, reach(f)]));
const CODE = new Map(FUNCTIONS.map((f) => [f, REACH.get(f).map((x) => program(x).code).join('\n')]));

/* the functions that read a provider key — discovered from what they read, not listed */
const KEYED = FUNCTIONS.filter((f) => /Deno\.env\.get\(\s*["'`][A-Z0-9_]*_API_KEY["'`]\s*\)/.test(CODE.get(f)));
/* …and of those, the ones that call a CHAT model (an embeddings-only function has no chat default) */
const CHAT = KEYED.filter((f) => /\/v1\/responses|\/v1\/messages|:generateContent/.test(CODE.get(f)));

/* ── the runner ─────────────────────────────────────────────────────────────────────────────── */
/* `routes` is [[regex source, reply]] matched in order; a reply is { status, json } or
   { status, text }. A relay_take reply is chosen by `take` (null = the database does not answer). */
function runEdge(fn, requests, o) {
  const url = pathToFileURL(join(FN, fn, 'index.ts')).href;
  const src = `
    const ENV = ${JSON.stringify(o.env || {})};
    globalThis.Deno = { env: { get: (k) => ENV[k] || "" }, serve: (h) => { globalThis.__h = h; } };
    const routes = ${JSON.stringify(o.routes || [])}.map(([re, r]) => [new RegExp(re), r]);
    const take = ${JSON.stringify(o.take === undefined ? [{ allowed: true, remaining: 9 }] : o.take)};
    const hosts = ${JSON.stringify(P.PROVIDER_HOSTS)};
    globalThis.__calls = [];
    globalThis.fetch = async (u, init) => {
      const s = String(u && u.url ? u.url : u);
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
      const provider = hosts.includes(new URL(s).hostname);
      globalThis.__calls.push({ url: s, provider, scope: body && body.p_scope, cost: body && body.p_cost, body: provider ? body : null });
      if (/\\/rest\\/v1\\/rpc\\/relay_take$/.test(s)) {
        return new Response(JSON.stringify(take), { status: take ? 200 : 503, headers: { "content-type": "application/json" } });
      }
      const hit = routes.find(([re]) => re.test(s));
      const r = hit ? hit[1] : { status: 404, json: { message: "no route" } };
      const text = r.text !== undefined ? r.text : JSON.stringify(r.json === undefined ? {} : r.json);
      return new Response(text, { status: r.status || 200, headers: { "content-type": "application/json" } });
    };
    const mod = await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(requests)}) {
      const before = globalThis.__calls.length;
      let status = 0, json = null;
      try {
        const r = await globalThis.__h(new Request("https://fn.test/" + (q.path || ""), { method: q.method || "POST", headers: q.headers || {}, body: q.body === undefined ? undefined : JSON.stringify(q.body) }));
        status = r.status; try { json = await r.json(); } catch (_) { json = null; }
      } catch (e) { status = -1; json = { thrown: String(e && e.message || e) }; }
      out.push({ status, json, calls: globalThis.__calls.slice(before) });
    }
    const s = mod.SPEND || null;
    process.stdout.write(JSON.stringify({ out, spend: s && { fn: s.ceiling.fn, scope: s.ceiling.scope, perDay: s.ceiling.perDay, schedule: s.schedule, perUserPerDay: s.perUserPerDay } }));
    process.exit(0);
  `;
  const raw = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(raw);
}

/* ══ ① the model table ═══════════════════════════════════════════════════════════════════════ */
test('edge-spend-and-models ① one model table, and every chat caller reads it', () => {
  assert.ok(CHAT.length >= 5, 'the discovery sees the chat callers: ' + CHAT.join(', '));
  const T = P.PROVIDER_DEFAULT_MODEL;
  assert.deepEqual(Object.keys(T).sort(), ['anthropic', 'gemini', 'openai']);
  assert.equal(T.openai, P.OPENAI_DEFAULT_MODEL, 'the OpenAI row IS the constant, not a second spelling of it');
  assert.ok(Object.isFrozen(T), 'the table cannot be edited by a caller at run time');
  assert.equal(new Set([P.OPENAI_DEFAULT_MODEL, ...P.FALLBACK_CHAIN]).size, P.FALLBACK_CHAIN.length + 1, 'the fallback chain repeats a model, or the default');
  assert.equal(P.OPENAI_LAST_RESORT_MODEL, P.FALLBACK_CHAIN[P.FALLBACK_CHAIN.length - 1]);

  for (const f of CHAT) assert.match(CODE.get(f), /\bPROVIDER_DEFAULT_MODEL\b/, f + ' calls a chat model without reading the shared default table');
  assert.deepEqual(modelIdsSpelled(), [], 'a model id is spelled in a function instead of in _shared/ai-provider.js');
});

/* A model id as a string in CODE (comments blanked). The one exception is not an id someone runs:
   ai-proxy's WITHDRAWN_MODELS names a model the picker must not OFFER (tests/r736 ④ owns it). */
const MODEL_ID = /["'`]((?:gpt|o\d|claude|gemini)-[A-Za-z0-9.:-]+)["'`]/g;
function modelIdsSpelled(codeOf = (f) => CODE.get(f)) {
  const found = [];
  for (const f of FUNCTIONS) {
    const shared = REACH.get(f).filter((x) => x.endsWith(join('_shared', 'ai-provider.js')));
    const own = codeOf(f).replace(/const WITHDRAWN_MODELS = new Set\(\[[^\]]*\]\)/, '');
    const table = shared.length ? program(shared[0]).code : '';
    for (const m of own.matchAll(MODEL_ID)) if (!table.includes(m[0])) found.push(f + ': ' + m[1]);
  }
  return found;
}

test('edge-spend-and-models ① the literal ban is not vacuous — an id written back into a function is found', () => {
  const back = (f) => f === 'monitor-run' ? CODE.get(f) + '\nconst m = "gemini-2.0-flash";' : CODE.get(f);
  assert.deepEqual(modelIdsSpelled(back), ['monitor-run: gemini-2.0-flash']);
});

/* ══ ② the door ═════════════════════════════════════════════════════════════════════════════ */
const FETCHLIKE = ['fetch', 'fetchBounded', 'fetchGuarded', 'followRedirects'];
function bareProviderCalls(code) {
  const out = [];
  const hosts = P.PROVIDER_HOSTS.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp('\\b(' + FETCHLIKE.join('|') + ')\\s*\\(\\s*["\'`]https://(' + hosts + ')', 'g');
  for (const m of code.matchAll(re)) out.push(m[1] + '(' + m[2] + ')');
  return out;
}

test('edge-spend-and-models ② no function that holds a provider key reaches a provider except through the door', () => {
  assert.ok(KEYED.length >= 6, 'the discovery sees the keyed functions: ' + KEYED.join(', '));
  const problems = [];
  for (const f of KEYED) {
    const code = CODE.get(f);
    for (const c of bareProviderCalls(code)) problems.push(f + ': ' + c);
    if (!/\bproviderFetch\s*\(/.test(code)) problems.push(f + ': never calls providerFetch');
  }
  assert.deepEqual(problems, []);
  /* …and the rule sees the form it forbids */
  assert.deepEqual(bareProviderCalls('const r = await fetch("https://api.openai.com/v1/responses", {});'), ['fetch(api.openai.com)']);
});

test('edge-spend-and-models ② the door: no ceiling, a refusing bucket, a silent database — nothing is sent', async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  let take = [{ allowed: true, remaining: 5 }];
  globalThis.fetch = async (u, init) => {
    const s = String(u);
    calls.push({ s, body: init && init.body ? String(init.body) : '' });
    if (s.endsWith('/rest/v1/rpc/relay_take')) return new Response(JSON.stringify(take), { status: take ? 200 : 503 });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const env = (k) => ({ SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: 'svc' })[k] || '';
  const provider = () => calls.filter((c) => new URL(c.s).hostname === 'api.openai.com');
  const code = async (p) => { try { await p; return 'sent'; } catch (e) { assert.ok(e instanceof P.ProviderFail); return e.code; } };
  try {
    const C = P.spendCeiling({ fn: 'unit-fn', perDay: 50, env });
    assert.equal(C.scope, 'unit-fn:global:day');

    assert.equal(await code(P.providerFetch('https://api.openai.com/v1/responses', { method: 'POST' }, {})), 'no_ceiling');
    assert.equal(await code(P.providerFetch('https://api.openai.com/v1/responses', { method: 'POST' }, { receipt: { scope: 'forged' } })), 'no_ceiling', 'a look-alike receipt is not one');
    assert.equal(await code(P.providerFetch('https://example.com/', {}, { ceiling: C })), 'not_a_provider', 'the door is not a general fetch');
    assert.equal(provider().length, 0);

    take = [{ allowed: false, remaining: 0 }];
    assert.equal(await code(P.providerFetch('https://api.openai.com/v1/responses', { method: 'POST' }, { ceiling: C })), 'spend_ceiling');
    take = null;
    assert.equal(await code(P.providerFetch('https://api.openai.com/v1/responses', { method: 'POST' }, { ceiling: C })), 'limiter_unavailable', 'it fails CLOSED');
    assert.equal(provider().length, 0, 'nothing reached the provider while the ceiling said no or said nothing');
    const noEnv = P.spendCeiling({ fn: 'unit-fn', perDay: 50, env: () => '' });
    assert.equal(await code(P.providerFetch('https://api.openai.com/v1/responses', {}, { ceiling: noEnv })), 'limiter_unavailable', 'a function with no database is not a function with no ceiling');

    take = [{ allowed: true, remaining: 49 }];
    calls.length = 0;
    const r = await P.providerFetch('https://api.openai.com/v1/responses', { method: 'POST' }, { ceiling: C, cost: 3 });
    assert.equal(r.status, 200);
    assert.deepEqual(calls.map((c) => new URL(c.s).hostname), ['sb.test', 'api.openai.com'], 'the bucket is asked first, then the provider');
    const asked = JSON.parse(calls[0].body);
    assert.deepEqual([asked.p_scope, asked.p_key, asked.p_capacity, asked.p_cost], ['unit-fn:global:day', '*', 50, 3]);

    /* a receipt the ceiling minted pays for the requests of the operation it was taken for */
    const t = await C.take(4);
    assert.ok(t.ok && t.receipt);
    calls.length = 0;
    assert.equal((await P.providerFetch('https://api.openai.com/v1/embeddings', {}, { receipt: t.receipt })).status, 200);
    assert.deepEqual(calls.map((c) => new URL(c.s).hostname), ['api.openai.com'], 'a receipt is not charged twice');

    /* the environment may move a function's number, and only to a positive integer */
    assert.equal(P.spendCeiling({ fn: 'ai-proxy', perDay: 7, env: (k) => (k === 'AI_PROXY_GLOBAL_PER_DAY' ? '9000' : '') }).perDay, 9000);
    assert.equal(P.spendCeiling({ fn: 'ai-proxy', perDay: 7, env: () => 'lots' }).perDay, 7);
  } finally { globalThis.fetch = realFetch; }
});

/* ══ ③ a failure carries a status and a length ═══════════════════════════════════════════════ */
const BODY_IN_ERROR = [
  /new Error\([^;]*\.text\(\)/,
  /\b(error|message|detail|error_detail|lastError)\s*[:=][^;,]*\.text\(\)/,
  /\+\s*\(?\s*(await\s+)?[\w.$]+\.text\(\)/,
];
function bodyInError(code) {
  return code.split('\n').filter((l) => !/bodyLength\(/.test(l) && BODY_IN_ERROR.some((re) => re.test(l)));
}

test('edge-spend-and-models ③ providerFail has no way to carry a body, and no function puts one in an error', async () => {
  const secret = 'org-SECRETORG project proj_ABC "prompt": "the reader\'s question"';
  const n = await P.bodyLength(new Response(secret, { status: 403 }));
  assert.equal(n, secret.length);
  const e = P.providerFail(403, n);
  assert.ok(e instanceof P.ProviderFail);
  assert.deepEqual([e.code, e.status, e.bodyLen], ['http', 403, secret.length]);
  assert.ok(!JSON.stringify({ ...e, message: e.message }).includes('SECRETORG'), 'the failure names no part of the body');
  assert.equal(P.providerFail.length, 2, 'two arguments: a status and a length');

  const offenders = [];
  for (const f of FUNCTIONS) for (const l of bodyInError(CODE.get(f))) offenders.push(f + ': ' + l.trim().slice(0, 140));
  assert.deepEqual(offenders, []);
  /* the forms it forbids, exactly as monitor-run and news-ingest wrote them before this round */
  assert.equal(bodyInError('    if (!r.ok) throw new Error("openai " + r.status + " " + (await r.text().catch(() => "")).slice(0, 200));').length, 1);
  assert.equal(bodyInError('    if (!r.ok) return { status: r.status, error: (await r.text().catch(() => "")).slice(0, 300) };').length, 1);
  assert.equal(bodyInError('    if (!r.ok) throw providerFail(r.status, await bodyLength(r));').length, 0);
});

/* ══ ④ every keyed function has a project-wide ceiling, and the scheduled ones agree with pg_cron ═ */
/* The cron jobs as the migrations leave them: the LAST migration that schedules a job name wins. */
function cronJobs() {
  const dir = join(ROOT, 'supabase/migrations');
  const jobs = new Map();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const sql = read(join(dir, f));
    for (const m of sql.matchAll(/cron\.schedule\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*\$cmd\$([\s\S]*?)\$cmd\$/g)) {
      const target = (/functions(?:\/v1)?\/([a-z0-9-]+)'/.exec(m[3]) || /\/([a-z0-9-]+)'\s*,/.exec(m[3]) || [])[1] || '';
      const stages = (/"stages"\s*:\s*\[([^\]]*)\]/.exec(m[3]) || [])[1];
      jobs.set(m[1], { target, runsPerDay: runsPerDay(m[2]), stages: stages === undefined ? null : [...stages.matchAll(/"([a-z]+)"/g)].map((x) => x[1]), migration: f });
    }
  }
  return jobs;
}
/* Minute and hour fields only — every schedule this project has. Anything else is refused rather
   than guessed, so a new shape of schedule fails here instead of being counted wrong. */
function runsPerDay(expr) {
  const [mi, h, dom, mon, dow] = expr.trim().split(/\s+/);
  assert.ok(dom === '*' && mon === '*' && dow === '*', 'a schedule this check cannot count: ' + expr);
  const field = (v, n) => v === '*' ? n : /^\*\/(\d+)$/.test(v) ? Math.ceil(n / +v.slice(2)) : /^\d+(,\d+)*$/.test(v) ? v.split(',').length : NaN;
  const r = field(mi, 60) * field(h, 24);
  assert.ok(Number.isFinite(r), 'a schedule this check cannot count: ' + expr);
  return r;
}

test('edge-spend-and-models ④ every function that reads a provider key exports a project-wide ceiling named after itself', () => {
  const jobs = cronJobs();
  assert.ok(jobs.size >= 4, 'the cron migration is read: ' + [...jobs.keys()].join(', '));
  const problems = [];
  for (const f of KEYED) {
    const { spend } = runEdge(f, [], { env: {} });
    if (!spend) { problems.push(f + ': exports no SPEND — it has no ceiling this test can see'); continue; }
    if (spend.fn !== f || spend.scope !== f + ':global:day') problems.push(`${f}: its ceiling is named ${spend.scope}`);
    if (!(spend.perDay >= 1)) problems.push(`${f}: perDay ${spend.perDay}`);
    /* the schedule it declares is the schedule pg_cron runs — both directions */
    const mine = [...jobs.entries()].filter(([, j]) => j.target === f).map(([name]) => name).sort();
    const declared = (spend.schedule || []).map((s) => s.job).sort();
    if (JSON.stringify(mine) !== JSON.stringify(declared)) problems.push(`${f}: pg_cron runs [${mine}] but the ceiling was computed from [${declared}]`);
    for (const s of spend.schedule || []) {
      const j = jobs.get(s.job);
      if (!j) continue;
      if (j.runsPerDay !== s.runsPerDay) problems.push(`${f}: ${s.job} runs ${j.runsPerDay} times a day (${j.migration}); the ceiling assumes ${s.runsPerDay}`);
      if (s.stages && JSON.stringify(s.stages) !== JSON.stringify(j.stages)) problems.push(`${f}: ${s.job} runs stages [${j.stages}]; the ceiling assumes [${s.stages}]`);
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('edge-spend-and-models ④ the schedule count is not vacuous — a job run more often is caught', () => {
  assert.equal(runsPerDay('*/20 * * * *'), 72);
  assert.equal(runsPerDay('13 * * * *'), 24);
  assert.equal(runsPerDay('*/10 * * * *'), 144);
  assert.equal(runsPerDay('* * * * *'), 1440);
  assert.throws(() => runsPerDay('0 9 * * 1'), /cannot count/);
});

/* ai-proxy, run: a signed-in reader with quota left meets an empty project bucket */
const USER = { id: '00000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'r@example.test', created_at: '2026-01-01T00:00:00Z' };   /* GoTrue always returns created_at; without it the account reads as new (ai-quota-fairness) */
const PROXY_ENV = { SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant-stub' };
const PROXY_DB = [
  ['/auth/v1/user$', { json: USER }],
  ['/rest/v1/profiles', { json: [] }],
  ['/rest/v1/rpc/consume_ai_turn$', { json: [{ allowed: true, used: 1, charged: true, calls: 1 }] }],
  ['/rest/v1/rpc/(refund|settle)_ai_turn$', { json: [{ ok: true }] }],
];
const ask = (body) => ({ headers: { authorization: 'Bearer good', 'content-type': 'application/json', 'x-intmap-turn': 't-1' }, body });

test('edge-spend-and-models ④ ai-proxy: an empty project bucket or a silent limiter sends nothing, and the reader is refunded', () => {
  const [full, silent] = [[{ allowed: false, remaining: 0 }], null].map((take) =>
    runEdge('ai-proxy', [ask({ task: 'free_text', prompt: 'hello' })], { env: PROXY_ENV, routes: PROXY_DB, take }).out[0]);

  for (const o of [full, silent]) {
    assert.deepEqual(o.calls.filter((c) => c.provider).map((c) => c.url), [], 'the provider was asked: ' + JSON.stringify(o.json));
    assert.ok(o.calls.some((c) => c.scope === 'ai-proxy:global:day'), 'the project bucket was asked');
    assert.ok(o.calls.some((c) => /refund_ai_turn$/.test(c.url)), 'the charged use is given back');
    assert.notEqual(o.status, 429, '429 is the reader\'s own quota (ai-proxy header), never a provider-side refusal');
  }
  assert.equal(full.json.error, 'provider_quota');
  assert.equal(full.json.meta.ceiling, 'project_day');
  assert.equal(full.json.retryable, false);
  assert.equal(silent.json.error, 'provider_unavailable');

  /* …and the bucket saying yes is what lets the same request through */
  const ok = runEdge('ai-proxy', [ask({ task: 'free_text', prompt: 'hello' })], {
    env: PROXY_ENV, routes: [...PROXY_DB, ['api\\.anthropic\\.com/v1/messages', { json: { model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn', content: [{ type: 'text', text: 'hi' }] } }]],
  }).out[0];
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const order = ok.calls.map((c) => c.scope || (c.provider ? 'provider' : ''));
  assert.ok(order.indexOf('ai-proxy:global:day') >= 0 && order.indexOf('ai-proxy:global:day') < order.indexOf('provider'), 'taken before the request: ' + order.join(' '));
});

test('edge-spend-and-models ④ atlas-embed: the caller\'s day share is taken before the project\'s, and refusing it sends nothing', () => {
  const routes = [
    ['/auth/v1/user$', { json: { id: 'u1' } }],
    ['/rpc/atlas_capability_catalog_size$', { json: 3 }],
    ['/rpc/atlas_capability_similarity$', { json: [] }],
  ];
  const env = { SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', OPENAI_API_KEY: 'sk-stub' };
  const q = { headers: { authorization: 'Bearer good', 'content-type': 'application/json' }, body: { op: 'search', catalog: 'a'.repeat(64), q: 'here' } };
  const { out, spend } = runEdge('atlas-embed', [q], { env, routes, take: [{ allowed: false, remaining: 0 }] });
  assert.equal(out[0].status, 429);
  assert.deepEqual(out[0].calls.filter((c) => c.provider), [], 'nothing reached OpenAI');
  /* the per-minute bucket refused first here (it is asked first); the order of the DAY buckets is
     read from a run where the minute says yes and only the day buckets are consulted after it */
  const scopes = runEdge('atlas-embed', [q], { env, routes: [...routes, ['api\\.openai\\.com/v1/embeddings', { json: { data: [{ index: 0, embedding: new Array(1536).fill(0.01) }] } }]] })
    .out[0].calls.map((c) => c.scope).filter(Boolean);
  assert.deepEqual(scopes, ['atlas-embed:user', 'atlas-embed:user:day', 'atlas-embed:global:day']);
  /* the share is the project's day over the same estimate routing-relay divides by */
  assert.ok(spend.perUserPerDay >= 1 && spend.perUserPerDay < spend.perDay, `share ${spend.perUserPerDay} of ${spend.perDay}`);
  assert.ok(spend.perUserPerDay * 10 <= spend.perDay, 'one account can spend at most a tenth of the day');
});

/* ══ ⑤ Anthropic says whether it searched ═════════════════════════════════════════════════════ */
test('edge-spend-and-models ⑤ ai-proxy on Anthropic reports webUsed / webSearches / citations on both paths', () => {
  const searched = {
    model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 1 } },
    content: [
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'x' } },
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://news.example/a', title: 'A' }] },
      { type: 'text', text: 'Answer.', citations: [{ type: 'web_search_result_location', url: 'https://news.example/a?utm=1', title: 'A', cited_text: 'x' }] },
    ],
  };
  const plain = { model: 'claude-haiku-4-5-20251001', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Answer.' }] };
  const turn = { task: 'atlas_turn', protocol: 2, webMode: 'auto', input: [{ type: 'message', role: 'user', content: 'what happened today' }], tools: [] };
  const free = { task: 'free_text', webMode: 'auto', prompt: 'what happened today' };
  for (const body of [turn, free]) {
    const [a] = runEdge('ai-proxy', [ask(body)], { env: PROXY_ENV, routes: [...PROXY_DB, ['api\\.anthropic\\.com/v1/messages', { json: searched }]] }).out;
    assert.equal(a.status, 200, JSON.stringify(a.json));
    const sent = a.calls.find((c) => c.provider).body;
    assert.ok((sent.tools || []).some((t) => t.type === 'web_search_20250305'), 'the search tool was attached');
    assert.equal(a.json.meta.webAttached, true, body.task);
    assert.equal(a.json.meta.webUsed, true, body.task + ': a search that ran is reported as run');
    assert.equal(a.json.meta.webSearches, 1);
    assert.deepEqual(a.json.citations.map((c) => c.url), ['https://news.example/a?utm=1']);

    const [b] = runEdge('ai-proxy', [ask(body)], { env: PROXY_ENV, routes: [...PROXY_DB, ['api\\.anthropic\\.com/v1/messages', { json: plain }]] }).out;
    assert.equal(b.json.meta.webAttached, true);
    assert.equal(b.json.meta.webUsed, false, body.task + ': attached is not searched');
    assert.equal(b.json.meta.webSearches, 0);
  }
});

/* ══ ⑥ a file an entrypoint does not reach says it is not deployed ═════════════════════════════ */
test('edge-spend-and-models ⑥ every code file in a function directory is deployed, or says it is not', () => {
  const NOT_DEPLOYED = /^\/\/ ⚠ NOT DEPLOYED \(/;
  const problems = [];
  let marked = 0;
  for (const f of FUNCTIONS) {
    const reached = new Set(REACH.get(f).map((x) => relative(FN, x).split(sep).join('/')));
    for (const file of readdirSync(join(FN, f)).filter((x) => /\.(ts|js|mjs)$/.test(x))) {
      const rel = f + '/' + file;
      if (reached.has(rel)) continue;
      const head = read(join(FN, f, file));
      if (NOT_DEPLOYED.test(head)) { marked++; continue; }
      problems.push(rel + ' is reached from nothing and does not say it is not deployed');
    }
  }
  assert.deepEqual(problems, []);
  /* the graph is real: ai-proxy reaches the door, monitor-run its logic, atlas-embed its core */
  assert.ok(REACH.get('ai-proxy').some((x) => x.endsWith('ai-provider.js')));
  assert.ok(REACH.get('monitor-run').some((x) => x.endsWith('logic.mjs')));
  assert.ok(REACH.get('atlas-embed').some((x) => x.endsWith('core.js')));
});
