/* The nightly history could read no night because `gh api …/logs` refuses a response with terminal
   escape sequences (Playwright's colour codes are in every CI log) unless given --allow-escape-sequences.
   These checks hold: ① the flag is sent after, and only after, gh's own refusal; ② a different failure is
   returned untouched (no second call); ③ a summary wrapped in colour codes still parses. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readJobLog, parseSummary } from '../scripts/deep-history.mjs';

const REFUSAL = 'the response contains terminal escape sequences; pass --allow-escape-sequences to output it anyway';

test('① the flag follows gh\'s refusal', async () => {
  const calls = [];
  const ghFn = async (args) => { calls.push(args); return args.includes('--allow-escape-sequences') ? { ok: true, out: 'log' } : { ok: false, why: REFUSAL }; };
  const r = await readJobLog(7, () => 5000, ghFn);
  assert.deepEqual(r, { ok: true, out: 'log' });
  assert.equal(calls.length, 2);
  assert.ok(!calls[0].includes('--allow-escape-sequences'));
});

test('② another failure is not retried', async () => {
  let n = 0;
  const r = await readJobLog(7, () => 5000, async () => { n++; return { ok: false, why: 'HTTP 404' }; });
  assert.equal(n, 1);
  assert.equal(r.ok, false);
});

test('③ a summary in colour codes parses', () => {
  const log = ['2026-11-18T00:00:00.1Z \u001b[31m  1 failed\u001b[39m',
    '2026-11-18T00:00:00.2Z \u001b[31m    [chromium] › tests/a.spec.js:10:5 › the title\u001b[39m',
    '2026-11-18T00:00:00.3Z   3 passed (1m)'].join('\n');
  assert.deepEqual(parseSummary(log).failed.length, 1);
});

/* CodeQL js/redos #269 (js/opening-hours.js): `\s*,?\s*` inside a `+` splits a whitespace run two ways.
   The rewrite `\s*(?:,\s*)?` accepts the same strings — held here against the old pattern on random input. */
test('④ the weekday-selector pattern is unambiguous and accepts what it accepted', () => {
  const OLD = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)(?=\s|$)/;
  const NEW = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*(?:,\s*)?)+)(?=\s|$)/;
  const atoms = ['Mo', 'Fr', 'PH', '-', 'Su', ' ', '  ', '\t', ',', ' , ', '10:00', 'x'];
  let seed = 7; const rnd = (n) => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  for (let k = 0; k < 4000; k++) {
    let s = ''; for (let i = rnd(9); i >= 0; i--) s += atoms[rnd(atoms.length)];
    assert.equal((OLD.exec(s) || [])[0], (NEW.exec(s) || [])[0], JSON.stringify(s));
  }
  const worst = 'Mo' + ' ,'.repeat(5000) + '  '.repeat(5000) + 'x';
  const t = Date.now(); NEW.test(worst);
  assert.ok(Date.now() - t < 200, 'linear on a long run');
});
