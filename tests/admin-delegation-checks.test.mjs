/* The admin «Delegation» panel (js/admin-delegation.js): the render function is EVALUATED with fixtures (full, null
 * percentiles, empty, error, hostile strings) and the page is wired to the RPC contract. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('js/admin-delegation.js', 'utf8');
const win = {};
vm.runInNewContext(SRC, { window: win, Promise, isFinite, Number, String, Math, Array, parseInt });
const D = win.IntMapAdminDelegation;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const FULL = {
  days: [
    { day: '2026-11-18', children: 10, ok: 6, failed: 1, refused: 2, p50_ms: 840, p90_ms: 2400, cost_usd: 0.0123 },
    { day: '2026-11-19', children: 4, ok: 4, failed: 0, refused: 0, p50_ms: null, p90_ms: null, cost_usd: 0 },
  ],
  codes: [{ code: 'child_limit', n: 2 }, { code: 'provider_timeout', n: 5 }],
  roots: { turns: 7, p50_ms: 12000, p90_ms: null, cost_usd: 1.5 },
};

test('model: newest day first, totals, unobserved derived, codes by count', () => {
  const m = D.model(FULL);
  assert.deepEqual(m.rows.map((r) => r.day), ['2026-11-19', '2026-11-18']);
  assert.equal(m.total.children, 14);
  assert.equal(m.total.unobserved, 1);            /* 10 - 6 - 1 - 2 */
  assert.ok(Math.abs(m.total.cost - 0.0123) < 1e-9);
  assert.equal(m.codes[0].code, 'provider_timeout');
  assert.equal(m.rows[0].p50, null);              /* null stays null, never 0 */
});

test('html: day table, bar, total, codes and root row are drawn; null percentiles are dashes', () => {
  const h = D.html(FULL, null, esc);
  for (const s of ['2026-11-18', 'Total', 'provider_timeout', 'Root turns', '840 ms', '2.40 s', '12.0 s', '$0.0123', '$1.50', 'role="img"'])
    assert.ok(h.includes(s), s);
  assert.ok(h.includes('–'), 'a null percentile prints a dash');
  assert.ok(!/NaN|undefined|null/.test(h));
});

test('html: empty and error never fake data', () => {
  for (const e of [null, undefined, {}, { days: [], codes: [], roots: null }, { days: [], codes: [], roots: { turns: 0, p50_ms: null, p90_ms: null, cost_usd: 0 } }])
    assert.match(D.html(e, null, esc), /No delegated calls recorded/);
  const err = D.html(FULL, { message: 'permission denied <x>' }, esc);
  assert.match(err, /permission denied &lt;x&gt;/);
  assert.ok(!err.includes('2026-11-18'), 'an error shows the error, not data');
});

test('html: every value is escaped', () => {
  const h = D.html({ days: [{ day: '<b>', children: 1, ok: 1, failed: 0, refused: 0, p50_ms: 1, p90_ms: 1, cost_usd: 0 }], codes: [{ code: '<img onerror=1>', n: 1 }] }, null, esc);
  assert.ok(!h.includes('<img') && !h.includes('<b>'));
});

test('load: calls the RPC with a clamped integer range; an RPC error or throw is shown', async () => {
  const calls = [];
  const sb = { rpc: async (n, a) => { calls.push([n, a]); return { data: FULL, error: null }; } };
  assert.match(await D.load(sb, '99', esc), /Total/);
  await D.load(sb, '0', esc); await D.load(sb, '7', esc);
  assert.deepEqual(calls.map((c) => c[0]), Array(3).fill('delegation_overview'));
  assert.deepEqual(calls.map((c) => c[1].p_days), [30, 7, 7]);
  assert.match(await D.load({ rpc: async () => ({ data: null, error: { message: 'boom' } }) }, 7, esc), /boom/);
  assert.match(await D.load({ rpc: () => { throw new Error('thrown'); } }, 7, esc), /thrown/);
});

test('admin.html: the tab, range selector and loader are wired to the panel', () => {
  const page = readFileSync('admin.html', 'utf8');
  assert.match(page, /data-tab="deleg"/);
  assert.match(page, /id="tab-deleg"/);
  assert.match(page, /<script src="\.\/js\/admin-delegation\.js"><\/script>/);
  for (const d of D.RANGES) assert.match(page, new RegExp('<option value="' + d + '"'));
  assert.match(page, /IntMapAdminDelegation\.load\(sb,/);
});
