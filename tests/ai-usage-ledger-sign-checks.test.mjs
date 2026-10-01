/* ============================================================================
 *  ai-usage-ledger-sign — a day's AI allowance counter never goes below zero, and a refund never
 *  gives back more than was charged
 * ----------------------------------------------------------------------------
 *  THE DEFECT THIS FILE STATES (production, read-only, 2026-10-01): public.ai_usage held 25 rows on
 *  24 days with a NEGATIVE count (min −99,999,938). A negative count is an allowance of
 *  `limit − count` uses, so −10⁸ lifted that day's limit. No RPC wrote them — pg_stat_statements held
 *  49 cell edits from Supabase Studio's table editor, run as the table owner, which no grant binds.
 *  The invariant lived in the writers' arithmetic, not on the column.
 *
 *  WHO PROVES WHAT:
 *    · supabase/tests/17_ai_counters_never_negative_test.sql proves the COLUMN against a real
 *      database: every `count` column in public has a lower bound (over the catalogue), the owner
 *      role cannot write a negative one, and refund_ai_turn gives back at most what one turn charged,
 *      to the day it was charged on.
 *    · THIS file proves the CALLER of those RPCs, evaluated (ai-proxy runs under Node's type
 *      stripping with Deno.serve captured and fetch stubbed; nothing is read as text): across every
 *      way a request ends, the proxy asks for at most as many refunds as it was charged for, names
 *      the turn that was charged (so the database can find the day it was charged on), never asks on
 *      a continuation or on an answered turn, and never touches the ledger for the developer.
 *      And _shared/ai-ledger.js, evaluated: it never hands the ledger a negative number.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = join(ROOT, 'supabase/functions');
const L = await import(pathToFileURL(join(FN, '_shared/ai-ledger.js')).href);
const P = await import(pathToFileURL(join(FN, '_shared/ai-provider.js')).href);
const SUPA = 'https://sb.test';
const USER = { id: '00000000-0000-4000-8000-0000000000a1', aud: 'authenticated', role: 'authenticated', email: 'sign@example.test' };

/* routes: [method or '*', regex source, reply] — reply { status, json } */
function runEdge(requests, o) {
  const url = pathToFileURL(join(FN, 'ai-proxy', 'index.ts')).href;
  const src = `
    const ENV = ${JSON.stringify(o.env || {})};
    globalThis.Deno = { env: { get: (k) => ENV[k] || "" }, serve: (h) => { globalThis.__h = h; } };
    const routes = ${JSON.stringify(o.routes || [])}.map(([m, re, r]) => [m, new RegExp(re), r]);
    const hosts = ${JSON.stringify(P.PROVIDER_HOSTS)};
    globalThis.__calls = [];
    globalThis.fetch = async (u, init) => {
      const s = String(u && u.url ? u.url : u);
      const method = String((init && init.method) || (u && u.method) || "GET").toUpperCase();
      let body = null; try { body = init && init.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
      globalThis.__calls.push({ url: s, provider: hosts.includes(new URL(s).hostname), body });
      if (/\\/rest\\/v1\\/rpc\\/relay_take$/.test(s)) return new Response(JSON.stringify([{ allowed: true, remaining: 9 }]), { status: 200, headers: { "content-type": "application/json" } });
      const hit = routes.find(([m, re]) => (m === "*" || m === method) && re.test(s));
      const r = hit ? hit[2] : { status: 404, json: { message: "no route" } };
      return new Response(JSON.stringify(r.json === undefined ? {} : r.json), { status: r.status || 200, headers: { "content-type": "application/json" } });
    };
    await import(${JSON.stringify(url)});
    const out = [];
    for (const q of ${JSON.stringify(requests)}) {
      const before = globalThis.__calls.length;
      let status = 0, json = null;
      try {
        const r = await globalThis.__h(new Request("https://fn.test/", { method: "POST", headers: q.headers || {}, body: JSON.stringify(q.body || {}) }));
        status = r.status; try { json = await r.json(); } catch (_) { json = null; }
      } catch (e) { status = -1; json = { thrown: String(e && e.message || e) }; }
      out.push({ status, json, calls: globalThis.__calls.slice(before) });
    }
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  `;
  const raw = execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', src],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(raw);
}
const rpc = (calls, name) => calls.filter((c) => c.url.endsWith('/rest/v1/rpc/' + name)).map((c) => c.body);

const ENV = { SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'svc', AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-stub' };
const OPENAI = 'api\\.openai\\.com/v1/responses';
/* the three ways the provider can end a request: an answer, an answer of the wrong shape (billed, then
   refused by the proxy — analysis_structured has a server-owned schema), and a refusal at the door */
const ENDINGS = {
  answered: { task: 'free_text', json: { model: 'gpt-x', status: 'completed', output_text: '{"ok":true}', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }],
    usage: { input_tokens: 100, output_tokens: 10 } } },
  wrong_shape: { task: 'analysis_structured', json: { model: 'gpt-x', status: 'completed', output_text: 'not json', output: [{ type: 'message', content: [{ type: 'output_text', text: 'not json' }] }],
    usage: { input_tokens: 100, output_tokens: 10 } } },
  provider_down: { task: 'free_text', status: 500, json: { error: { message: 'x' } } },
};
/* what the ledger answers the first call of the request: a fresh turn (charged) or a continuation of
   a turn already paid for (not charged) */
const OPENINGS = {
  fresh: { allowed: true, used: 1, charged: true, calls: 1, reason: '' },
  continuation: { allowed: true, used: 1, charged: false, calls: 2, reason: '' },
};
const routesFor = (opening, ending) => [
  ['*', '/auth/v1/user$', { json: USER }],
  ['*', '/rest/v1/profiles', { json: [] }],
  ['*', '/rest/v1/rpc/consume_ai_turn$', { json: [opening] }],
  ['*', '/rest/v1/rpc/(refund|settle)_ai_turn$', { json: null }],
  ['*', '/rest/v1/rpc/record_ai_usage$', { json: null }],
  ['*', OPENAI, ending],
];
const ask = (turn, task) => ({
  headers: { authorization: 'Bearer good', 'content-type': 'application/json', ...(turn ? { 'x-intmap-turn': turn } : {}) },
  body: { task, prompt: 'hello' },
});

test('ai-usage-ledger-sign ① ai-proxy, evaluated: refunds never outnumber charges, and each names the turn that was charged', () => {
  for (const [oName, opening] of Object.entries(OPENINGS)) {
    for (const [eName, ending] of Object.entries(ENDINGS)) {
      for (const turn of ['turn-sign', '']) {
        const at = `${oName} × ${eName} × ${turn ? 'keyed turn' : 'no turn key'}`;
        const [r] = runEdge([ask(turn, ending.task)], { env: ENV, routes: routesFor(opening, ending) });
        assert.notEqual(r.status, -1, at + ': the function threw ' + JSON.stringify(r.json));
        const consumed = rpc(r.calls, 'consume_ai_turn');
        const refunds = rpc(r.calls, 'refund_ai_turn');
        const charges = consumed.length && opening.charged ? consumed.length : 0;
        assert.equal(consumed.length, 1, at + ': charged through the ledger once');
        assert.equal(consumed[0].p_turn, turn, at + ': with the turn key the reader sent');
        assert.ok(refunds.length <= charges, `${at}: ${refunds.length} refund(s) for ${charges} charge(s)`);
        for (const b of refunds) {
          assert.equal(b.p_user, USER.id, at + ': the refund goes to the account that was charged');
          assert.equal(b.p_turn, consumed[0].p_turn, at + ': and names the charged turn, so the ledger returns it to the day it was charged on');
        }
        assert.deepEqual(rpc(r.calls, 'refund_ai_usage'), [], at + ': never the date-blind refund directly');
        if (eName === 'answered') {
          assert.equal(r.status, 200, at + ': ' + JSON.stringify(r.json));
          assert.deepEqual(refunds, [], at + ': an answered request gives nothing back');
          if (turn) assert.equal(rpc(r.calls, 'settle_ai_turn').length, 1, at + ': the answered turn is settled, so no later failure can refund it');
        } else if (opening.charged) {
          assert.equal(refunds.length, 1, at + ': a charged request that produced no answer gives the use back, once');
        }
      }
    }
  }
});

test('ai-usage-ledger-sign ② ai-proxy, evaluated: the developer, who consumes no use, is never refunded one', () => {
  for (const [eName, ending] of Object.entries(ENDINGS)) {
    const [r] = runEdge([ask('turn-dev', ending.task)], { env: { ...ENV, DEV_USER_IDS: 'someone-else, ' + USER.id.toUpperCase() }, routes: routesFor(OPENINGS.fresh, ending) });
    assert.notEqual(r.status, -1, eName + ': the function threw ' + JSON.stringify(r.json));
    assert.deepEqual(rpc(r.calls, 'consume_ai_turn'), [], eName + ': the developer is not charged');
    assert.deepEqual(rpc(r.calls, 'refund_ai_turn'), [], eName + ': so nothing is refunded — a refund without a charge would drive the counter below what was spent');
    assert.deepEqual(rpc(r.calls, 'refund_ai_usage'), [], eName);
  }
});

/* a db whose rpc() records every call (supabase-js shape: resolves { data, error }) */
function recordingDb() {
  const calls = [];
  return { calls, rpc: async (name, args) => { calls.push({ name, args }); return { data: null, error: null }; } };
}

test('ai-usage-ledger-sign ③ _shared/ai-ledger.js, evaluated: the ledger is never handed a negative number, and a refund names its turn', async () => {
  const db = recordingDb();
  const acct = { id: USER.id, plan: 'free', isDev: false, limit: L.PLAN_LIMITS.free };
  assert.equal(await L.refundTurn(db, acct, 'turn-x'), true);
  assert.deepEqual(db.calls, [{ name: 'refund_ai_turn', args: { p_user: USER.id, p_turn: 'turn-x' } }], 'one refund, through the turn — never refund_ai_usage');
  const dev = recordingDb();
  assert.equal(await L.refundTurn(dev, { ...acct, isDev: true }, 'turn-x'), false);
  assert.equal(await L.settleTurn(dev, { ...acct, isDev: true }, 'turn-x'), false);
  assert.deepEqual(dev.calls, [], 'the developer\'s turns are neither refunded nor settled — they were never charged');

  /* every numeric argument of the cost writer is a non-negative integer, whatever the meter says */
  for (const total of [{ calls: -3, unmetered: -1, input: -10, cached_read: -1e9, cache_write: -0.5, output: -7 },
                       { calls: 2.9, unmetered: 'x', input: NaN, cached_read: Infinity * -1, cache_write: null, output: undefined }]) {
    const a = L.usageArgs(USER.id, 't', total);
    for (const [k, v] of Object.entries(a)) {
      if (k === 'p_user' || k === 'p_turn') continue;
      assert.ok(Number.isInteger(v) && v >= 0, `${k} = ${v} from ${JSON.stringify(total)}`);
    }
  }
  /* PLAN_LIMITS — the numbers the ledger compares count against — are positive integers: a limit
     of 0 or below would refuse everyone, and only a non-negative count makes `count < limit` mean
     «uses left». */
  for (const [plan, n] of Object.entries(L.PLAN_LIMITS)) assert.ok(Number.isInteger(n) && n > 0, plan + ' = ' + n);
});
