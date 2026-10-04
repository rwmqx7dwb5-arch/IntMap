/* ============================================================================
 *  supporter-funnel — where support goes, when it is mentioned, and the one plan table
 * ----------------------------------------------------------------------------
 *  ① every value that differs by plan is a column of supabase/functions/_shared/plans.js, and the
 *    reader that cannot import it (the page's AI_FREE_DAILY) says the same numbers, and ai-proxy imports it — measured, not restated;
 *  ② nothing is sold: no plan other than free is `offered`, and the free numbers are the ones in force;
 *  ③ public.operating_stats() returns aggregates only, never sums the refund-skewed `count`, and states
 *    in its comment why anon may call it;
 *  ④ the offer card's rules (js/supporter.js), evaluated: once per day at the limit, once ever as a
 *    thank-you, asleep after it is closed;
 *  ⑤ the month line never calls a request an answer, and «could not be read» is not zero;
 *  ⑥ js/ai-core.js raises the limit signal where the reader is told, and not for turn_calls or glosses;
 *  ⑦ Atlas reaches it: `operatingCosts` is a registry row, has a run, and the planner is told about it.
 * ==========================================================================*/
import { aiProxySource } from './helpers/ai-proxy-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* a device-local store, as the page has it */
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const P = await import('../supabase/functions/_shared/plans.js');
const L = await import('../supabase/functions/_shared/ai-ledger.js');
const S = await import('../js/supporter.js');

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────────── */
test('① PLAN_LIMITS is the plan table\'s aiTurnsPerDay column, not a second table', () => {
  assert.deepEqual({ ...L.PLAN_LIMITS }, { ...P.planColumn('aiTurnsPerDay') });
  assert.equal(L.DEFAULT_PLAN, P.DEFAULT_PLAN);
  assert.doesNotMatch(rd('supabase/functions/_shared/ai-ledger.js'), /PLAN_LIMITS\s*=\s*Object\.freeze\(\s*\{/,
    'ai-ledger.js spells the plan numbers again — they belong to _shared/plans.js');
});

test('① ai-proxy\'s gloss allowance is the plan table\'s aiGlossPerDay column, imported', () => {
  /* ai-proxy is Deno TypeScript node does not evaluate here; what is asserted is that it holds no numbers of
     its own — the column it reads is evaluated through planColumn() above and below */
  const src = aiProxySource();
  assert.match(src, /import \{[^}]*\bplanColumn\b[^}]*\} from "\.\.\/_shared\/plans\.js";/, 'ai-proxy does not import the plan table');
  assert.match(src, /const GLOSS_PLAN_LIMITS[^=]*=\s*planColumn\("aiGlossPerDay"\);/, 'GLOSS_PLAN_LIMITS is not read from the plan table');
  assert.doesNotMatch(src, /GLOSS_PLAN_LIMITS[^=\n]*=\s*\{/, 'ai-proxy spells a gloss table of its own again');
  assert.ok(Object.values(P.planColumn('aiGlossPerDay')).every((n) => Number.isInteger(n) && n > 0));
});

test('① no plan column outlives its reader: the SQL plan copy (monitor_limit) is dropped and the table has no `monitors`', () => {
  /* (monitors-retire) The area monitors were the only reader of a per-plan monitor count, held here to the
     SQL monitor_limit() body. The feature is retired, so what is asserted is that BOTH halves left together:
     the last migration (by file order) that names the function drops it, and no plan row still carries a
     number nothing reads. Discovered, not named — a later migration that recreates it fails this. */
  const files = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  let last = null;
  for (const f of files) {
    const sql = rd('supabase/migrations/' + f);
    if (/create or replace function public\.monitor_limit\(/.test(sql)) last = 'create';
    if (/drop function if exists public\.monitor_limit\(/.test(sql)) last = 'drop';
  }
  assert.equal(last, 'drop', 'monitor_limit() is still defined by the migrations in force');
  for (const [name, row] of Object.entries(P.PLANS)) assert.ok(!('monitors' in row), `plan ${name} still carries a monitors column`);
});

test('① the page\'s pre-answer allowance is the free plan\'s', () => {
  const m = rd('js/app-body.js').match(/const AI_FREE_DAILY\s*=\s*(\d+)/);
  assert.ok(m);
  assert.equal(Number(m[1]), P.PLANS.free.aiTurnsPerDay);
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────────── */
test('② nothing is sold: only the default plan is offered', () => {
  /* ⚠ the free NUMBERS are not frozen here — ① holds every reader to the table, so moving a number is one
     edit in plans.js. What this round promised is that no plan can be obtained except the default one;
     the day a paid plan is approved, this assertion is the one to change, with PRODUCT.md §2.4. */
  for (const [name, row] of Object.entries(P.PLANS)) assert.equal(row.offered, name === P.DEFAULT_PLAN, `plan ${name} offered=${row.offered}`);
  assert.equal(P.planOf('no-such-plan'), P.PLANS.free, 'an unknown plan name must never read as more than free');
  assert.equal(S.allowance().paidPlanOffered, false);
  assert.throws(() => P.planColumn('nope'));
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('③ operating_stats(): aggregates only, never `count`, anon allowed with a stated reason, STABLE', () => {
  const f = readdirSync(join(ROOT, 'supabase/migrations')).find((x) => x.endsWith('_operating_stats.sql'));
  assert.ok(f, 'the operating_stats migration is missing');
  const sql = rd('supabase/migrations/' + f);
  const body = sql.match(/create or replace function public\.operating_stats\(\)[\s\S]*?\$\$([\s\S]*?)\$\$/)[1];
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /\bstable\b/, 'PostgREST answers GET only for a STABLE/IMMUTABLE function — the page reads it with GET');
  assert.doesNotMatch(body, /\bcount\)|\(m\.count|u\.count|\.count\b/, 'operating_stats sums ai_usage.count — that is the refund-skewed allowance, not a number of answers');
  assert.doesNotMatch(body, /user_id/, 'operating_stats must not return or group by an account');
  assert.match(sql, /comment on function public\.operating_stats\(\) is[\s\S]*ANON MAY CALL: \S/);
  assert.match(sql, /grant\s+execute on function public\.operating_stats\(\) to anon, authenticated, service_role/);
  assert.match(rd('js/supporter.js'), /rpc\('operating_stats',\s*\{\},\s*\{\s*get:\s*true\s*\}\)/, 'the page must read it with GET (a read-only transaction)');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('④ the offer rules: thanks once after N different days, limit once a day, asleep after closing', () => {
  mem.clear();
  const day = 86400000, t0 = Date.UTC(2026, 9, 1, 12);
  for (let i = 0; i < S.OFFER.thanksAfterDays - 1; i++) S.recordVisitDay(t0 + i * day);
  S.recordVisitDay(t0 + (S.OFFER.thanksAfterDays - 2) * day + 3600000);   // a second visit the same day is not a day
  assert.equal(S.offerAllowed('thanks', t0 + 7 * day), false, 'the thank-you appeared before enough different days');
  S.recordVisitDay(t0 + (S.OFFER.thanksAfterDays - 1) * day);
  assert.equal(S.offerAllowed('thanks', t0 + 7 * day), true);
  /* shown once → never again */
  const st = JSON.parse(mem.get('intmap.supporter.v1')); st.thanksShown = t0; localStorage.setItem('intmap.supporter.v1', JSON.stringify(st));
  assert.equal(S.offerAllowed('thanks', t0 + 400 * day), false, 'the thank-you is once ever');
  /* the limit card: once per day */
  assert.equal(S.offerAllowed('limit', t0), true);
  const st2 = JSON.parse(mem.get('intmap.supporter.v1')); st2.limitDay = new Date(t0).getFullYear() + '-' + (new Date(t0).getMonth() + 1) + '-' + new Date(t0).getDate();
  localStorage.setItem('intmap.supporter.v1', JSON.stringify(st2));
  assert.equal(S.offerAllowed('limit', t0), false, 'the limit card appeared twice in one day');
  assert.equal(S.offerAllowed('limit', t0 + day), true);
  /* asleep */
  const st3 = JSON.parse(mem.get('intmap.supporter.v1')); st3.sleepUntil = t0 + S.OFFER.snoozeDays * day; localStorage.setItem('intmap.supporter.v1', JSON.stringify(st3));
  assert.equal(S.offerAllowed('limit', t0 + 2 * day), false, 'an offer appeared while asleep');
  assert.equal(S.offerAllowed('limit', t0 + (S.OFFER.snoozeDays + 1) * day), true);
  assert.equal(S.offerAllowed('anything-else', t0), false);
  assert.ok(S.OFFER.afterSupportDays >= S.OFFER.snoozeDays, 'following an offer must not bring the next one sooner than closing it');
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('⑤ the month line: unreadable is not zero, nothing recorded is said, requests are not answers', () => {
  assert.equal(S.monthLine({ ok: false }), 'supMonthUnavail');
  assert.equal(S.monthLine({ ok: true, stats: { metered_since: null, provider_calls: 0 } }), 'supMonthNone');
  assert.equal(S.monthLine({ ok: true, stats: { metered_since: '2026-10-01', provider_calls: 0 } }), 'supMonthNone');
  assert.equal(S.monthLine({ ok: true, stats: { metered_since: '2026-10-01', provider_calls: 10, input_tokens: 1, output_tokens: 2, month: '2026-10' } }), 'supMonthBody');
  for (const lang of ['en', 'jp']) {
    const src = rd(`js/locales/ui.${lang}.js`);
    for (const key of ['supMonthBody', 'supAtlasBody', 'supRestBody', 'supOfferLimitBody']) {
      const m = src.match(new RegExp(key + ':"([^"]*)"'));
      assert.ok(m, `${lang} has no ${key}`);
      if (key === 'supMonthBody') {
        for (const ph of ['{calls}', '{tin}', '{tout}', '{since}', '{month}']) assert.ok(m[1].includes(ph), `${lang} ${key} drops ${ph}`);
        assert.doesNotMatch(m[1], /answer|回答/, `${lang} ${key} calls a request an answer`);
      }
    }
  }
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('⑥ ai-core raises intmap:ai-limit where the reader is told, never for turn_calls or the gloss lane', () => {
  const src = rd('js/ai-core.js');
  assert.match(src, /function aiLimitReached\(\)\{[^}]*dispatchEvent\(new CustomEvent\('intmap:ai-limit'\)\)/);
  assert.match(src, /aiToast\(aiLimitMsg\(\)\);\s*\}catch\(_\)\{\}\s*aiLimitReached\(\);\s*return false;/, 'the click-time gate');
  assert.match(src, /if\(j\.error==='turn_calls'\) throw new Error\(aiTurnCallsMsg\(\)\);\s*aiLimitReached\(\);/, 'ai-proxy\'s 429 «limit», after turn_calls has left');
  assert.doesNotMatch(src, /gloss_limit[^\n]*aiLimitReached/, 'the gloss lane is not the question allowance');
  assert.match(rd('js/supporter.js'), /addEventListener\('intmap:ai-limit'/);
});

/* ── ⑦ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('⑦ Atlas reaches it: operatingCosts is a row with a run, and the planner is told', async () => {
  const caps = (await import('../js/atlas-cap-panel.js')).default;
  const e = caps.find((c) => c.row[0] === 'panel.operatingCosts');
  assert.ok(e, 'no panel.operatingCosts capability');
  assert.equal(e.row[1], 'operatingCosts');
  assert.equal(typeof e.run, 'function');
  assert.ok(caps.find((c) => c.row[0] === 'panel.donate'), 'panel.donate is gone');
  assert.match(rd('js/atlas-capabilities.js'), /\["panel\.operatingCosts","operatingCosts"/, 'the generated rows were not rewritten (node scripts/atlas-caps.mjs --write)');
  /* (atlas-capability-single-source) the prose moved into the entries — read the catalogue the planner is given */
  const C = await (await import('./helpers/atlas-kernel.mjs')).catalogue();
  assert.match(C.text(['panel.operatingCosts']), /\{"type":"operatingCosts"\}/);
  assert.ok(C.blocks().some((b) => b.ids.includes('panel.donate') && b.ids.includes('panel.operatingCosts')), 'documented in the same block as panel.donate');
});

test('the two Stripe links are declared once, in supporter.js, and are AGENTS.md\'s', () => {
  const agents = rd('AGENTS.md');
  assert.ok(agents.includes(S.STRIPE_DONATE.en) && agents.includes(S.STRIPE_DONATE.jp));
  const body = rd('js/app-body.js');
  assert.match(body, /window\.INTMAP_STRIPE_URL_EN = STRIPE_DONATE\.en;/);
  assert.match(body, /window\.INTMAP_STRIPE_URL_JP = STRIPE_DONATE\.jp;/);
  /* the hosts of the URLs app-body.js spells — compared as hosts, not searched for as a substring */
  const hosts = [...body.matchAll(/https?:\/\/[^\s'"`)]+/g)].map((m) => { try { return new URL(m[0]).host; } catch (_) { return ''; } });
  assert.ok(!hosts.some((h) => h === 'donate.stripe.com'), 'app-body.js spells a Stripe link again');
  assert.match(body, /window\.stripeDonateURL = \(\)=> \(currentLang==='jp' \? window\.INTMAP_STRIPE_URL_JP : window\.INTMAP_STRIPE_URL_EN\);/);
});

/* ── the scanner's rule for a read-only rpc (scripts/data-effects.mjs rpcIsRead) ─────────────────
   Evaluated on parsed calls, both ways: a GET/HEAD rpc is a read, everything else that is an rpc is
   still a write — so the exemption cannot quietly widen into «rpc is never a write». */
test('data-effects: .rpc(…, …, { get: true }) is a read; every other rpc is still a write', async () => {
  const acorn = await import('acorn');
  const { writeOf, rpcIsRead } = await import('../scripts/data-effects.mjs');
  const call = (src) => acorn.parse(src, { ecmaVersion: 'latest' }).body[0].expression;
  const cases = [
    ["db.rpc('operating_stats', {}, { get: true })", null],
    ["db.rpc('f', { a: 1 }, { get: true })", null],
    ["db.rpc('f', {}, { head: true })", null],
    ["db.rpc('f', { a: { b: 1 } }, { head: true })", 'rpc'],        // supabase-js sends that one as POST
    ["db.rpc('operating_stats')", 'rpc'],                             // the name earns nothing
    ["db.rpc('f', {}, { get: false })", 'rpc'],
    ["db.rpc('f', {}, opts)", 'rpc'],                                 // not visible to the parser → not a read
    ["db.rpc('f', {}, { get: flag })", 'rpc'],
    ["db.rpc('f', {}, { ['get']: true })", 'rpc'],
    ["db.rpc('f', {}, { count: 'exact' })", 'rpc'],
  ];
  for (const [src, want] of cases) assert.equal(writeOf(call(src)), want, src);
  assert.equal(rpcIsRead(call("db.from('t').insert({})")), false);
  /* and the narrower walk of tests/atlas-outward-effects-checks.test.mjs uses the same predicate */
  assert.match(rd('tests/atlas-outward-effects-checks.test.mjs'), /import \{ rpcIsRead \} from '\.\.\/scripts\/data-effects\.mjs'/);
});
