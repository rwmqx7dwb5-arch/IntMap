/* ============================================================================
 *  upstream-liveness — 「上流が生きているか」と「同梱データが新しいか」を、宣言と実測で持つ
 * ----------------------------------------------------------------------------
 *  ① 分類器（scripts/lib/upstream.mjs classify）: alive / refused / dead / unobserved を、ネットワーク
 *     無しで評価する。「確認できなかった」は dead ではない
 *  ② fetchChecked: 状態・空応答・JSON・スキーマを確かめ、再試行は dead と 429 だけ
 *  ③ 死活の測定（measureAll）を偽の fetch で評価する: 失敗だけを後でもう一度訊く／runner が
 *     どこにも届かなければ全部 unobserved
 *  ④ 赤になる条件（transitions）: up だったものが CONFIRM_RUNS 回続けて down になった回だけ
 *  ⑤ probe の宣言（declared）: 欠落・別ホスト・理由の無い非 2xx 期待・link への probe を拒む
 *  ⑥ ビルダーの検証を偽の応答で評価する: 上流が答えなければ、書かずに非 0 で終わる
 *  ⑦ 鮮度の宣言の欠落を拒む（freshnessOf）: cadence 無し／根拠無し／解釈できない周期／二重宣言
 *  ⑧ 自動更新の名簿（data-refresh）: 宣言から発見し、宣言された周期で「期限」を決める
 *  記録: dev-notes/2026-09-30-upstream-liveness.md
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { classify, fetchChecked, UpstreamError } from '../scripts/lib/upstream.mjs';
import { measureAll, transitions, declared, hostMatches, CONFIRM_RUNS } from '../scripts/upstream-liveness.mjs';
import { freshnessOf, basisProblem, subjectOfPath } from '../scripts/data-governance.mjs';
import { roster, due } from '../scripts/data-refresh.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* a Response-shaped object, enough for the code under test */
const res = (status, body = '') => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => body,
  arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  body: { cancel: async () => {} },
});
const neterr = (code = 'ECONNREFUSED') => Object.assign(new TypeError('fetch failed'), { cause: { code } });

/* ── ① ─────────────────────────────────────────────────────────────────────── */
test('① the classifier: four verdicts, and a missing answer is only `dead` when the runner could look', () => {
  assert.equal(classify({ status: 200 }).verdict, 'alive');
  assert.equal(classify({ status: 204 }).verdict, 'alive');
  assert.equal(classify({ status: 404 }).verdict, 'refused');
  assert.equal(classify({ status: 403 }).verdict, 'refused');
  assert.equal(classify({ status: 429 }).verdict, 'refused', 'a rate limit is the host saying no');
  assert.equal(classify({ status: 503 }).verdict, 'dead');
  assert.equal(classify({ status: 504 }).verdict, 'dead');
  assert.equal(classify({ status: null, error: neterr() }).verdict, 'dead');
  assert.equal(classify({ status: null, error: Object.assign(new Error('x'), { name: 'TimeoutError' }) }).why, 'no response within the time limit');
  /* 「確認できなかった」は「死んでいる」ではない */
  assert.equal(classify({ status: null, error: neterr(), networkObserved: false }).verdict, 'unobserved');
  /* a declared non-2xx is the healthy answer, and a 2xx that was not declared is not */
  assert.equal(classify({ status: 401, expect: [401] }).verdict, 'alive');
  assert.equal(classify({ status: 200, expect: [401] }).verdict, 'refused');
  assert.equal(classify({ status: 404, expect: [200, 404] }).verdict, 'alive');
});

/* ── ② ─────────────────────────────────────────────────────────────────────── */
test('② fetchChecked refuses what is not an answer, and asks again only after a failure that can change', async () => {
  const quiet = () => {};
  const seq = (...rs) => { let i = 0; const calls = []; const f = async (u) => { calls.push(u); const r = rs[Math.min(i++, rs.length - 1)]; if (r instanceof Error) throw r; return r; }; f.calls = calls; return f; };
  const opt = (f, o = {}) => ({ fetchImpl: f, backoffMs: 0, log: quiet, ...o });

  assert.deepEqual(await fetchChecked('u', {}, opt(seq(res(200, '{"a":1}')))), { a: 1 });
  /* a 404 is the upstream's answer: never asked twice */
  let f = seq(res(404, 'nope'));
  await assert.rejects(fetchChecked('u', {}, opt(f, { attempts: 4 })), (e) => e instanceof UpstreamError && e.verdict === 'refused' && e.status === 404);
  assert.equal(f.calls.length, 1, 'a refusal is not retried');
  /* a 503 is weather: asked again, and the error says how many times */
  f = seq(res(503), res(503), res(503));
  await assert.rejects(fetchChecked('u', {}, opt(f, { attempts: 3 })), (e) => e.verdict === 'dead' && e.attempts === 3);
  assert.equal(f.calls.length, 3);
  /* …and a later answer is taken */
  assert.deepEqual(await fetchChecked('u', {}, opt(seq(neterr(), res(429), res(200, '[1]')), { attempts: 3 })), [1]);
  /* an empty 200, a non-JSON 200, and a JSON 200 that fails the caller's schema are all refused */
  await assert.rejects(fetchChecked('u', {}, opt(seq(res(200, '  \n')))), /empty body/);
  await assert.rejects(fetchChecked('u', {}, opt(seq(res(200, '<html>503</html>')))), /not JSON/);
  await assert.rejects(fetchChecked('u', {}, opt(seq(res(200, '{"error":"x"}')), { validate: (j) => (j.data ? true : 'no data') })), /no data/);
  /* status mode: several statuses are answers (GIBS 200 / 404), anything else is not */
  assert.equal(await fetchChecked('u', {}, opt(seq(res(404)), { as: 'status', expect: [200, 404] })), 404);
  await assert.rejects(fetchChecked('u', {}, opt(seq(res(500)), { as: 'status', expect: [200, 404] })), /dead/);
});

/* ── ③ ─────────────────────────────────────────────────────────────────────── */
test('③ measureAll asks everything once and re-asks only the failures, later and with a longer limit', async () => {
  const probes = [
    { host: 'a.example', url: 'https://a.example/', expect: null },
    { host: 'b.example', url: 'https://b.example/', expect: null },
    { host: 'c.example', url: 'https://c.example/', expect: null },
    { host: 'd.example', url: 'https://d.example/', expect: [401] },
  ];
  const seen = [];
  let pass = 1;
  const fetchImpl = async (u) => {
    seen.push(pass + ' ' + u);
    if (u.includes('a.')) return res(200);
    if (u.includes('b.')) throw neterr('ENOTFOUND');
    if (u.includes('c.')) return pass === 1 ? res(503) : res(200);
    return res(401);
  };
  let slept = 0;
  const r = await measureAll(probes, { fetchImpl, sleep: async (ms) => { slept = ms; pass = 2; }, recheckDelayMs: 123, concurrency: 2, now: () => new Date('2026-09-30T00:00:00Z') });
  const v = Object.fromEntries(r.hosts.map((h) => [h.host, h]));
  assert.equal(v['a.example'].verdict, 'alive');
  assert.equal(v['b.example'].verdict, 'dead');
  assert.equal(v['c.example'].verdict, 'alive');
  assert.match(v['c.example'].recovered, /HTTP 503/, 'the first failure is recorded');
  assert.equal(v['d.example'].verdict, 'alive', '401 is declared as the healthy answer');
  assert.equal(slept, 123);
  assert.equal(seen.filter((s) => s.startsWith('2 ')).length, 2, 'only b and c are asked again');
  assert.deepEqual(r.counts, { alive: 3, refused: 0, dead: 1, unobserved: 0 });
  assert.equal(r.networkObserved, true);

  /* a runner with no network has learnt nothing about the hosts */
  const off = await measureAll(probes, { fetchImpl: async () => { throw neterr('ENETUNREACH'); }, sleep: async () => {}, recheckDelayMs: 0 });
  assert.equal(off.networkObserved, false);
  assert.deepEqual(off.counts, { alive: 0, refused: 0, dead: 0, unobserved: 4 });
});

/* ── ④ ─────────────────────────────────────────────────────────────────────── */
test('④ red exactly once per outage: up, then down for CONFIRM_RUNS runs in a row', () => {
  assert.ok(CONFIRM_RUNS >= 2, 'one bad night is not a change');
  const night = (verdicts) => ({ measuredAt: 'x', hosts: Object.entries(verdicts).map(([host, verdict]) => ({ host, verdict, why: verdict })) });
  let prev = night({ h: 'alive', dead: 'dead' });
  transitions(null, prev);                                   /* the first night starts the streaks */
  assert.equal(prev.hosts[0].streak, 1);
  const seq = ['dead', 'dead', 'dead', 'alive', 'refused', 'alive'];
  const red = [], failing = [], up = [];
  for (const v of seq) {
    const cur = night({ h: v, dead: 'dead' });
    const t = transitions(prev, cur);
    red.push(t.down.map((d) => d.host).join());
    failing.push(t.failing.map((d) => d.host).join());
    up.push(t.up.map((d) => d.host).join());
    prev = cur;
  }
  assert.deepEqual(red, ['', 'h', '', '', '', ''], 'red on the second consecutive down night only');
  assert.deepEqual(failing, ['h', '', '', '', 'h', ''], 'the first down night is reported, not red');
  assert.deepEqual(up, ['', '', '', 'h', '', 'h']);
  /* a host that has always been dead never turns anything red */
  assert.ok(!red.join('').includes('dead'));
  /* unobserved neither extends nor breaks a streak */
  const a = night({ h: 'alive' }); transitions(null, a);
  const b = night({ h: 'dead' }); transitions(a, b);
  const c = night({ h: 'unobserved' }); const tc = transitions(b, c);
  assert.equal(tc.down.length, 0);
  assert.equal(c.hosts[0].streak, 1);
  const d = night({ h: 'dead' }); const td = transitions(c, d);
  assert.deepEqual(td.down.map((x) => x.host), ['h'], 'the outage is confirmed across the unobserved night');
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────── */
test('⑤ every requested host declares a probe of itself, and a non-2xx expectation says why', () => {
  assert.ok(hostMatches('*.wikipedia.org', 'de.wikipedia.org'));
  assert.ok(hostMatches('mts*.google.com', 'mts0.google.com'));
  assert.ok(!hostMatches('*.wikipedia.org', 'wikipedia.org.evil.example'));
  assert.ok(!hostMatches('api.example', 'api.example.org'));
  /* a `.` in a pattern is a dot, not "any character" */
  assert.ok(!hostMatches('mts*.google.com', 'mts0.googlexcom'));
  assert.ok(!hostMatches('*.wikipedia.org', 'de.wikipediaxorg'));
  assert.ok(!hostMatches('mts*.google.com', 'mts0.evil.example.google.com.evil.example'));
  const d = declared({ hosts: [
    { host: 'ok.example', disclosure: {}, probe: { url: 'https://ok.example/x' } },
    { host: 'none.example', disclosure: {} },
    { host: 'other.example', disclosure: {}, probe: { url: 'https://elsewhere.example/' } },
    { host: 'bare.example', disclosure: {}, probe: { url: 'https://bare.example/', expect: [401] } },
    { host: 'why.example', disclosure: {}, probe: { url: 'https://why.example/', expect: [401], why: 'the gateway answers 401 without the key' } },
    { host: 'link.example', link: 'a hyperlink', probe: { url: 'https://link.example/' } },
    { host: 'cannot.example', removedBy: 'x', probe: { none: 'only reachable with the reader\'s own key' } },
  ] });
  assert.deepEqual(d.probes.map((p) => p.host), ['ok.example', 'other.example', 'bare.example', 'why.example']);
  const text = d.problems.join('\n');
  assert.match(text, /none\.example is requested by the browser and declares no `probe`/);
  assert.match(text, /other\.example probe\.url asks elsewhere\.example/);
  assert.match(text, /bare\.example expects 401 and does not say why/);
  assert.match(text, /link\.example is not requested .* still declares a probe/);
  assert.ok(!/why\.example|cannot\.example|ok\.example/.test(text));

  /* and the real ledger passes, with a probe for every row the browser requests */
  const real = declared(JSON.parse(readFileSync(join(ROOT, 'scripts/outbound-hosts.json'), 'utf8')));
  assert.deepEqual(real.problems, []);
  assert.ok(real.probes.length > 100, `the requested rows were read (${real.probes.length})`);
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────── */
/* The builders run their work at module top level, so they are RUN, in a child process, with the
   global fetch replaced by one that answers what the case needs — the real builder, the real check,
   a fake upstream. Refusals (4xx, a 200 that is not the answer) are used because they are not
   retried, so each case ends in milliseconds rather than after a back-off.
   The fake answer travels as DATA (an environment variable read by a fixed module), not as code
   spliced into the module's text — no case can change what the child executes. */
const MOCK_FETCH = `const fake = JSON.parse(process.env.INTMAP_FAKE_UPSTREAM);
globalThis.fetch = async () => new Response(fake.body, { status: fake.status, headers: { 'content-type': fake.contentType } });
`;
function runWithFakeUpstream(script, fake, sentinelRel) {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-upstream-liveness-'));
  try {
    mkdirSync(join(dir, 'data'));
    const sentinel = sentinelRel ? join(dir, sentinelRel) : null;
    if (sentinel) writeFileSync(sentinel, 'SENTINEL');
    const mock = join(dir, 'mock-fetch.mjs');
    writeFileSync(mock, MOCK_FETCH);
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(mock).href, join(ROOT, script)], { cwd: dir, encoding: 'utf8', timeout: 60000, env: { ...process.env, INTMAP_FAKE_UPSTREAM: JSON.stringify(fake) } });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || ''), sentinel: sentinel ? readFileSync(sentinel, 'utf8') : null };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const R = (status, body, contentType = 'application/json') => ({ status, body, contentType });

test('⑥ a builder whose upstream does not answer writes nothing and exits non-zero', () => {
  /* SIMBAD answering an error page under 200: not JSON — refused, the bundle untouched */
  let r = runWithFakeUpstream('scripts/build-deepsky.mjs', R(200, '<VOTABLE><INFO name="QUERY_STATUS" value="ERROR"/></VOTABLE>', 'text/xml'), 'data/deep-sky.json');
  assert.notEqual(r.status, 0, r.out);
  assert.equal(r.sentinel, 'SENTINEL', 'data/deep-sky.json was not written');
  assert.match(r.out, /not JSON/);

  /* SBDB answering 200 with an empty result for a bulk sweep: a sweep that did not happen */
  r = runWithFakeUpstream('scripts/build-smallbodies.mjs', R(200, JSON.stringify({ fields: [], data: [], count: 0 })), 'data/small-bodies.json');
  assert.notEqual(r.status, 0, r.out);
  assert.equal(r.sentinel, 'SENTINEL');
  assert.match(r.out, /returned no rows/);

  /* Horizons refusing (403): no spacecraft is «SKIPPED» into a smaller fleet */
  r = runWithFakeUpstream('scripts/build-spacecraft.mjs', R(403, '{"error":"forbidden"}'), 'data/spacecraft.json');
  assert.notEqual(r.status, 0, r.out);
  assert.equal(r.sentinel, 'SENTINEL');
  assert.match(r.out, /refused: HTTP 403/);

  /* GIBS answering neither 200 nor 404: not an edge of the archive */
  const gibs = join(ROOT, 'data/gibs-range.json');
  const before = readFileSync(gibs);
  r = runWithFakeUpstream('scripts/probe-gibs-range.mjs', R(403, 'forbidden', 'text/plain'), null);
  assert.notEqual(r.status, 0, r.out);
  assert.ok(readFileSync(gibs).equals(before), 'data/gibs-range.json was not written');
});

/* ── ⑦ ─────────────────────────────────────────────────────────────────────── */
test('⑦ a bundle with no cadence, a cadence with no basis, an unparseable cadence and a second declarer are all refused', () => {
  const basis = { observed: 'measured on a fixture for this test', expires: 'when the fixture changes', canon: 'this test, and nothing else' };
  const bundle = (s) => ({ subject: s, kind: 'file', members: [s + '.json'] });
  const builder = (name, decl) => ({ subject: name, paths: Object.keys(decl), declaration: { present: true, value: decl } });
  const subjectsFor = (bs, bd) => [
    ...bs.map((b) => ({ kind: 'bundle', subject: b.subject, record: null })),
    ...bd.flatMap((b) => Object.keys(b.declaration.value).map((p) => ({ kind: 'builder', subject: b.subject + ' → ' + p, record: b.declaration.value[p], declaredFor: p, builder: b }))),
  ];
  const bs = ['data/zz-none', 'data/zz-nobasis', 'data/zz-week', 'data/zz-twice', 'data/zz-good'].map(bundle);
  const bd = [
    builder('scripts/zz-a.mjs', {
      'data/zz-none.json': { publisher: 'p' },
      'data/zz-nobasis.json': { cadence: 'P1M' },
      'data/zz-week.json': { cadence: 'P1W', cadenceBasis: basis },
      'data/zz-twice.json': { cadence: 'P1Y', cadenceBasis: basis },
      'data/zz-good.json': { cadence: 'P1Y', cadenceBasis: basis },
    }),
    builder('scripts/zz-b.mjs', { 'data/zz-twice.json': { cadence: 'P1Y', cadenceBasis: basis } }),
  ];
  const fr = freshnessOf(bs, bd, subjectsFor(bs, bd), '2026-09-30');
  const row = (s) => fr.rows.find((r) => r.subject === s);
  assert.equal(row('data/zz-none').why, 'no-cadence');
  assert.equal(row('data/zz-week').why, 'unparseable-cadence', 'P1W is outside the vocabulary: named, not «unknown»');
  assert.deepEqual(fr.unbased.map((u) => u.subject), ['scripts/zz-a.mjs → data/zz-nobasis.json']);
  assert.match(fr.conflicts.map((c) => c.subject + ' ' + c.cadences.join()).join('\n'), /data\/zz-twice declared by 2 scripts/);
  assert.equal(row('data/zz-good').why, 'no-date', 'declared and well-formed; only its date is missing, which is a note');
  assert.equal(row('data/zz-good').verdict, 'unknown');
  assert.match(row('data/zz-good').dateWhy, /no commit in this clone touched it|shallow clone/, 'an undated bundle says why, it is not called fresh');

  assert.match(basisProblem({ cadence: 'P1D' }), /no `cadenceBasis`/);
  assert.match(basisProblem({ cadence: 'P1D', cadenceBasis: { observed: 'x', expires: 'long enough text', canon: 'long enough text' } }), /does not say observed/);
  assert.equal(basisProblem({ cadence: 'static', cadenceBasis: basis }), null);
  assert.equal(subjectOfPath('data/whc-detail.{locale}.json.gz'), 'data/whc-detail');
  assert.equal(subjectOfPath('data/railways/index.json'), 'data/railways/');
});

test('⑦b the repository itself: every bundle has a cadence, and check:datagov says so', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/data-governance.mjs'), '--rule=freshness-stated'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /every one of \d+ subject\(s\) has a declared cadence/);
  assert.match(r.stdout, /every declared cadence carries its basis/);
  assert.match(r.stdout, /unknown 0|could not be dated here/, 'unknown is 0, or the note says the dates were unobservable (a shallow clone)');
});

/* ── ⑧ ─────────────────────────────────────────────────────────────────────── */
test('⑧ the refresh roster is discovered from declarations, and «due» is the declared cadence', () => {
  const list = roster([
    { subject: 'scripts/x.mjs', paths: [], declaration: { 'data/x.json': { cadence: 'P1D', autoRefresh: 'light and checked' } } },
    { subject: 'scripts/y.mjs', paths: [], declaration: { 'data/y.json': { cadence: 'P1D' } } },
    { subject: 'scripts/z.mjs', paths: [], declaration: null },
  ]);
  assert.deepEqual(list.map((e) => e.builder), ['scripts/x.mjs']);
  const now = new Date('2026-09-30T12:00:00Z');
  const at = (iso) => () => ({ at: iso, from: 'test' });
  assert.equal(due(list[0], { now, dateOf: at('2026-09-30T06:00:00Z') }).length, 0, 'six hours into a day is fresh');
  assert.equal(due(list[0], { now, dateOf: at('2026-09-29T20:00:00Z') })[0].verdict, 'aging');
  assert.equal(due(list[0], { now, dateOf: at('2026-09-28T00:00:00Z') })[0].verdict, 'stale');
  assert.equal(due(list[0], { now, dateOf: () => ({ at: null }) })[0].verdict, 'unknown', 'an undatable bundle is rebuilt, not assumed fresh');

  /* the real roster: every member is refresh-safe by check:datagov, and none is static */
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/data-governance.mjs'), '--rule=refresh-safe'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok((r.stdout.match(/is on the unattended refresh roster/g) || []).length >= 1, r.stdout);
});
