/* The build-tooling advisory gate (scripts/audit-gate.mjs): an exception is dated, and nothing else is let through. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, advisories, LEDGER_PATH } from '../scripts/audit-gate.mjs';

const adv = (ghsa, name, severity) => ({ source: 1, name, severity, title: 't', url: 'https://github.com/advisories/' + ghsa, range: '*' });
const report = (...v) => ({ vulnerabilities: Object.fromEntries(v.map(([pkg, via]) => [pkg, { via }])) });
const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));

test('① a package that only DEPENDS on a vulnerable one adds no advisory of its own', () => {
  const r = report(['picomatch', [adv('GHSA-a', 'picomatch', 'high')]], ['fdir', ['picomatch']], ['vite', ['fdir', 'tinyglobby']]);
  assert.deepEqual(advisories(r).map((a) => a.ghsa), ['GHSA-a']);
});
test('② an unlisted high advisory is OPEN; the listed one is excused only before its expiry day', () => {
  const r = report(['picomatch', [adv('GHSA-fc5q-39xc-vjpf', 'picomatch', 'high'), adv('GHSA-new', 'other', 'critical')]]);
  const now = evaluate(r, ledger, '2026-11-18');
  assert.deepEqual(now.open.map((a) => a.ghsa), ['GHSA-new']);
  assert.deepEqual(now.excused.map((a) => a.ghsa), ['GHSA-fc5q-39xc-vjpf']);
  const late = evaluate(report(['picomatch', [adv('GHSA-fc5q-39xc-vjpf', 'picomatch', 'high')]]), ledger, ledger[0].expires);
  assert.equal(late.expired.length, 1, 'on the expiry day the loan is called in');
  assert.equal(late.excused.length, 0);
});
test('③ below the level is not counted; the level is not an exception', () => {
  assert.deepEqual(evaluate(report(['x', [adv('GHSA-m', 'x', 'moderate')]]), [], '2026-11-18').open, []);
});
test('④ every ledger row says why, when it was measured, and when it ends — and ends within 60 days', () => {
  for (const e of ledger) {
    assert.match(e.ghsa, /^GHSA-/);
    assert.ok(e.reason && e.reason.length > 40, e.ghsa + ': a reason');
    assert.match(e.measured, /^\d{4}-\d\d-\d\d$/);
    assert.match(e.expires, /^\d{4}-\d\d-\d\d$/);
    assert.ok((Date.parse(e.expires) - Date.parse(e.measured)) / 864e5 <= 60, e.ghsa + ': an exception is a loan, not a fact');
  }
});
test('⑤ the workflow runs the gate for tooling and still runs the plain every-severity audit for what ships', () => {
  const y = readFileSync(new URL('../.github/workflows/security.yml', import.meta.url), 'utf8');
  assert.match(y, /npm audit --package-lock-only --omit=dev --audit-level=low/);
  assert.match(y, /run: node scripts\/audit-gate\.mjs/);
  assert.doesNotMatch(y, /npm audit --package-lock-only --audit-level=high/);
});
