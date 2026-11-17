/* security-review-nov — the holes two independent reviews found on 2026-11-17, held by running the code:
 *   ① N2 the ledger's close doors report a database error (a RESOLVED { error }) and a settle that matched no row
 *   ② N1 every class-code door goes through a per-caller token BEFORE the code is looked up, and fails closed
 *   ③ the directory goes through the shared per-caller gate; only declared arguments reach the database
 *   ④ the server's class-code rule is the browser's
 *   ⑤ the last word of the migrations: the three doors are server-only, the hold is the account's, the author
 *      name goes through display_name
 * The SQL behaviour (privileges by catalogue, the K1 race) is supabase/tests/48_security_review_nov_test.sql. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const L = await import('../supabase/functions/_shared/ai-ledger.js');
const ACCT = { id: '33333333-3333-3333-3333-333333333333', isDev: false, limit: 10 };
const dbAnswering = (answer) => ({ calls: [], async rpc(name, args) { this.calls.push({ name, args }); return typeof answer === 'function' ? answer() : answer; } });

test('security-review-nov ① N2: a resolved database error is not success, and a settle that matched nothing says so', async () => {
  const err = { data: null, error: { code: 'XX000' } };
  assert.equal(await L.refundTurn(dbAnswering(err), ACCT, 'turn-a', 'g'), 'error', 'refund: {error} resolved → error');
  assert.equal(await L.settleTurn(dbAnswering(err), ACCT, 'turn-a', 'g'), 'error', 'settle: {error} resolved → error');
  const thrown = dbAnswering(() => { throw new Error('network'); });
  assert.equal(await L.refundTurn(thrown, ACCT, 'turn-a'), 'error');
  assert.equal(await L.settleTurn(thrown, ACCT, 'turn-a'), 'error');
  assert.equal(await L.settleTurn(dbAnswering({ data: false, error: null }), ACCT, 'turn-a'), 'not_found', 'SQL false is «no row», not «settled»');
  assert.equal(await L.settleTurn(dbAnswering({ data: true, error: null }), ACCT, 'turn-a'), 'settled');
  for (const s of ['refunded', 'held', 'answered', 'not_found']) {
    assert.equal(await L.refundTurn(dbAnswering({ data: s, error: null }), ACCT, 'turn-a'), s);
  }
  assert.equal(await L.refundTurn(dbAnswering({ data: null, error: null }), ACCT, 'turn-a'), 'error', 'an answer that is not a status is not success');
  /* the generation reaches the ledger; no retry */
  const db = dbAnswering({ data: 'held', error: null });
  await L.refundTurn(db, ACCT, 'turn-a', 'gen-1');
  assert.deepEqual(db.calls, [{ name: 'refund_ai_turn', args: { p_user: ACCT.id, p_turn: 'turn-a', p_gen: 'gen-1' } }], 'one call, naming the generation');
});

/* the community-class handler, with its database and limiter handed in */
const H = await import('../supabase/functions/community-class/index.ts');
const ORIGIN = 'http://127.0.0.1:4173';   /* the local preview — _shared/client-error-shape.js originAllowed */
const req = (body, o) => new Request('https://x.test/functions/v1/community-class', {
  method: 'POST', headers: { origin: (o && o.origin) || ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
function rig(o) {
  const order = [];
  const db = { async rpc(name, args) { order.push(['rpc', name, args]); return o.rpc ? o.rpc(name, args) : { data: { ok: false, error: 'not_found' }, error: null }; } };
  const limiter = { async take(scope, key, opts) { order.push(['take', scope, opts.onUnavailable]); return o.take || { allowed: true, remaining: 1, source: 'db' }; } };
  const gate = async () => { order.push(['gate']); return o.gate || null; };
  return { order, deps: { db, limiter, gate, env: () => 'test-secret' } };
}

test('security-review-nov ② N1: every class door takes a per-caller token before the code is looked up, and fails closed', async () => {
  /* the three probes the audit named: open, and submit with an empty name (invalid_name vs not_found) */
  for (const body of [
    { op: 'class_set_open', args: { p_code: 'ABCDEFGH' } },
    { op: 'class_set_submit', args: { p_code: 'ABCDEFGH', p_name: '', p_answers: [] } },
    { op: 'class_set_submit', args: { p_code: 'abcdefgh', p_name: 'Ann', p_answers: [[1, 2]] } },
  ]) {
    const r = rig({});
    const res = await H.handle(req(body), r.deps);
    assert.equal(res.status, 200);
    assert.deepEqual(r.order.map((x) => x[0]), ['take', 'rpc'], body.op + ': the token is taken before the database is asked');
    assert.equal(r.order[0][1], 'community-class:class');
    assert.equal(r.order[0][2], 'deny', 'the class bucket fails CLOSED');
    assert.equal(r.order[1][2].p_code, 'ABCDEFGH', 'the code reaches the database as the server spells it');
  }
  /* refused: the database is never asked */
  let r = rig({ take: { allowed: false, remaining: 0, source: 'db' } });
  let res = await H.handle(req({ op: 'class_set_open', args: { p_code: 'ABCDEFGH' } }), r.deps);
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { ok: false, error: 'busy' }, 'the student is told the words they already know («busy»)');
  assert.ok(!r.order.some((x) => x[0] === 'rpc'));
  /* the limiter cannot answer: 503, never «go ahead» */
  r = rig({ take: { allowed: true, remaining: null, source: 'unavailable' } });
  res = await H.handle(req({ op: 'class_set_submit', args: { p_code: 'ABCDEFGH', p_name: '', p_answers: [] } }), r.deps);
  assert.equal(res.status, 503);
  assert.ok(!r.order.some((x) => x[0] === 'rpc'), 'an unanswered limiter is not a pass');
  /* not a code at all: not_found without a token or a database call — it says nothing about which codes exist */
  r = rig({});
  res = await H.handle(req({ op: 'class_set_open', args: { p_code: 'IIIIIIII' } }), r.deps);
  assert.deepEqual(await res.json(), { ok: false, error: 'not_found' });
  assert.deepEqual(r.order, []);
});

test('security-review-nov ③ the directory takes the shared gate; only declared arguments reach the database; other sites and verbs are refused', async () => {
  let r = rig({ rpc: () => ({ data: { ok: true, items: [] }, error: null }) });
  let res = await H.handle(req({ op: 'community_maps', args: { p_sort: 'new', p_limit: 999, p_query: 'Kyoto', evil: 'x', p_bbox: [1, 2, 3, 4] } }), r.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(r.order.map((x) => x[0]), ['gate', 'rpc']);
  assert.deepEqual(r.order[1][2], { p_query: 'Kyoto', p_sort: 'new', p_limit: 50, p_bbox: [1, 2, 3, 4] }, 'undeclared keys are dropped and the page is capped');
  r = rig({ gate: new Response('{"error":"rate_limit"}', { status: 429 }) });
  res = await H.handle(req({ op: 'community_maps', args: {} }), r.deps);
  assert.equal(res.status, 429);
  assert.ok(!r.order.some((x) => x[0] === 'rpc'));
  r = rig({});
  assert.equal((await H.handle(req({ op: 'list_community_map', args: {} }), r.deps)).status, 400, 'only the three doors');
  assert.equal((await H.handle(req({ op: 'class_set_open', args: { p_code: 'ABCDEFGH' } }, { origin: 'https://evil.example' }), r.deps)).status, 403);
  assert.equal((await H.handle(req('x'.repeat(20000)), r.deps)).status, 413, 'the body has a ceiling');
  assert.deepEqual(r.order, []);
});

test('security-review-nov ④ the server and the browser read a class code by the same rule', async () => {
  const S = await import('../supabase/functions/community-class/shape.js');
  const src = read('js/quest-class.js');
  const m = /export const CLASS_CODE_RE = (\/.+\/);/.exec(src);
  assert.ok(m, 'js/quest-class.js CLASS_CODE_RE');
  assert.equal(String(S.CLASS_CODE_RE), m[1]);
  const abc = /v_abc\s+constant text := '([A-Z0-9]+)'/.exec(read('supabase/migrations/20261116090000_class_quest.sql'))[1];
  for (const ch of abc) assert.ok(S.CLASS_CODE_RE.test(ch.repeat(8)), 'every symbol _class_code() makes is a code symbol: ' + ch);
  assert.equal(abc.length, 32);
});

/* ⑤ the migrations' last word, in file order */
const MIGS = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read('supabase/migrations/' + f)).join('\n');
test('security-review-nov ⑤ after every migration: the three doors are granted to service_role only; the hold is the account\'s; the author name goes through display_name', () => {
  for (const sig of ['community_maps(text, text, integer, text, double precision[])', 'class_set_open(text)', 'class_set_submit(text, text, jsonb)']) {
    const esc = sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const stmts = [...MIGS.matchAll(new RegExp('(grant|revoke)\\s+execute\\s+on\\s+function\\s+public\\.' + esc + '\\s+(?:to|from)\\s+([^;]+);', 'gi'))];
    const lastGrant = stmts.filter((s) => /^grant/i.test(s[1])).pop();
    assert.ok(lastGrant, sig);
    assert.doesNotMatch(lastGrant[2], /\b(anon|authenticated|public)\b/i, sig + ': its last grant names no client role');
    const lastRevoke = stmts.filter((s) => /^revoke/i.test(s[1])).pop();
    assert.match(lastRevoke[2], /public/i); assert.match(lastRevoke[2], /anon/i); assert.match(lastRevoke[2], /authenticated/i);
  }
  const held = [...MIGS.matchAll(/create or replace function public\.community_map_held[\s\S]*?\$\$([\s\S]*?)\$\$/g)].pop()[1];
  assert.doesNotMatch(held, /collection/i, 'the hold no longer narrows by collection name');
  const list = [...MIGS.matchAll(/create or replace function public\.list_community_map\([\s\S]*?\$\$([\s\S]*?)\$\$/g)].pop()[1];
  assert.match(list, /public\.display_name\(v_author, 40\)/);
});

test('security-review-nov ⑥ the browser reaches the three doors only through the Edge Function — no fallback to the closed RPC', () => {
  for (const f of ['js/community-maps.js', 'js/quest-class.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /\.rpc\(\s*'(community_maps|class_set_open|class_set_submit)'/, f);
    assert.match(s, /communityClassCall\(DB, '(community_maps|class_set_open)'/, f);
  }
  assert.doesNotMatch(read('js/community-class-door.js'), /\.rpc\(/, 'the door has no RPC fallback');
});
