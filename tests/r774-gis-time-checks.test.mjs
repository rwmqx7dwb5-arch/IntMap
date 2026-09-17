/* ============================================================================
 *  #R774 · 時刻は「形」ではなく「暦」で受ける
 * ----------------------------------------------------------------------------
 *  THE DEFECT, RESTATED AS THE DEFECT ([[intmap-restate-the-defect-not-the-fix]]):
 *
 *      js/gis-datasets.js asDate() decided what a date was by LOOKING AT ITS SHAPE and then handing
 *      the string to Date.parse. ECMA-262's ISO parsing carries an out-of-range day instead of
 *      refusing it, so a cell saying a day that never existed was accepted AS A DIFFERENT, REAL DAY:
 *
 *          2026-02-30  →  2026-03-02        2026-02-29 (common year)  →  2026-03-01
 *          2026-04-31  →  2026-05-01
 *
 *      Nothing said so. The column typed as `date`, the row sorted between the 1st and the 3rd of
 *      March, and a reader asking 「2月のもの」 got a row that says February and is filed in March.
 *
 *      And declareTime()'s `constant` branch read `start` and `end` and NEVER COMPARED THEM, so
 *      「2026-09-17 から 2020-01-01 まで」 was accepted as the dataset's own statement about itself.
 *      Every window query over it answers empty, and the reader cannot tell whether the fault is in
 *      the data or in the question.
 *
 *  ⚠ WHAT IS MEASURED HERE IS THE CALENDAR, not the spelling of the fix. The expected values are
 *  facts about the Gregorian calendar (2026 is a common year, April has 30 days, 2024 is a leap
 *  year); none of them is a number this file once saw printed.
 *
 *  ⚠ AND THE YEAR RULE IS MEASURED ALONGSIDE, because it is the rule most easily broken by a stricter
 *  date reader: docs/GIS-CORE.md §1.5 states 「裸の年はその年 1 年」 and a dataset of 1889s depends on
 *  it. A check that only tightened would pass over a regression that made 1889 mean one millisecond.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeGisDatasets } from '../js/gis-datasets.js';

globalThis.window = globalThis;
const DATA = makeGisDatasets();

let seq = 0;
const fresh = (spec) => DATA.add(Object.assign({ id: 'r774-t-' + (++seq) }, spec));
const pt = (x, y, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: props || {} });

/* The witness for an epoch: the calendar date it lands on, in UTC, written out here rather than
   asked of the module that produced it. */
const utcDate = (ms) => {
  const d = new Date(ms);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
};

/* ══ ① 存在しない暦日は、別の日に化けずに拒まれる ════════════════════════════════════════ */

test('R774 ① asDate refuses a day the calendar does not have, instead of rolling it over', () => {
  /* ⚠ THE FIRST THREE ARE THE MEASURED DEFECT. Before #R774 each answered a real instant two, one
     and one day later than the cell claimed. */
  assert.equal(DATA.asDate('2026-02-30'), null, 'February 30th was accepted (it used to become 3/2)');
  assert.equal(DATA.asDate('2026-02-29'), null, '2026 is a common year — 2/29 was accepted (it used to become 3/1)');
  assert.equal(DATA.asDate('2026-04-31'), null, 'April has 30 days — 4/31 was accepted (it used to become 5/1)');
  assert.equal(DATA.asDate('2026-06-31'), null, 'June has 30 days');
  assert.equal(DATA.asDate('2026-11-31'), null, 'November has 30 days');

  /* month and day outside the calendar at all — refused before and refused now, asserted so that a
     rewrite of the reader cannot open them by accident */
  assert.equal(DATA.asDate('2026-13-01'), null);
  assert.equal(DATA.asDate('2026-00-10'), null);
  assert.equal(DATA.asDate('2026-01-00'), null);
  assert.equal(DATA.asDate('2026-01-32'), null);
});

test('R774 ① the days that DO exist are untouched, leap year included', () => {
  assert.deepEqual(utcDate(DATA.asDate('2026-02-28')), [2026, 2, 28]);
  /* 2024 is divisible by 4 and not by 100: a leap year, so the 29th exists. ⚠ A month-length table
     written by hand is what would have got this wrong; the reader round-trips through the engine's
     own calendar, which already knows. */
  assert.deepEqual(utcDate(DATA.asDate('2024-02-29')), [2024, 2, 29]);
  /* 2000 is divisible by 400 — a leap year. 1900 is divisible by 100 and not 400 — it is not. */
  assert.deepEqual(utcDate(DATA.asDate('2000-02-29')), [2000, 2, 29]);
  assert.equal(DATA.asDate('1900-02-29'), null, '1900 was not a leap year');
  assert.deepEqual(utcDate(DATA.asDate('2026-12-31')), [2026, 12, 31]);
  assert.deepEqual(utcDate(DATA.asDate('2026-01-01')), [2026, 1, 1]);

  /* a Date object and a year-month prefix still read, and a non-date still does not */
  assert.equal(DATA.asDate(new Date(Date.UTC(2026, 4, 6))), Date.UTC(2026, 4, 6));
  assert.deepEqual(utcDate(DATA.asDate('2026-02')), [2026, 2, 1]);
  assert.equal(DATA.asDate('東京'), null);
  assert.equal(DATA.asDate('03/04/2020'), null, 'a locale-dependent spelling is still refused');
});

test('R774 ① the same verdict with a time and with a zone — the calendar is asked about the DAY', () => {
  assert.equal(DATA.asDate('2026-02-30T00:00'), null);
  assert.equal(DATA.asDate('2026-02-30T12:34:56Z'), null);
  assert.equal(DATA.asDate('2026-02-30 00:00'), null);
  assert.equal(DATA.asDate('2026-02-30T00:00+09:00'), null);

  /* ⚠ AND THE ZONE STILL MOVES THE INSTANT. The day is checked as the LOCAL day the cell names, so a
     legal date near midnight in a positive offset must NOT be refused merely because it lands on the
     previous day in UTC — a verdict that depended on the offset would be a different rule. */
  const t = DATA.asDate('2026-03-01T00:00+09:00');
  assert.notEqual(t, null, 'a legal date was refused because UTC puts it on another day');
  assert.deepEqual(utcDate(t), [2026, 2, 28], 'the zone stopped being applied to the instant');
  const z = DATA.asDate('2026-02-28T23:00-05:00');
  assert.notEqual(z, null);
  assert.deepEqual(utcDate(z), [2026, 3, 1]);

  /* a time that is not a time is still refused */
  assert.equal(DATA.asDate('2026-02-28T99:99'), null);
});

test('R774 ① a column of impossible days types as text, not as a date column', () => {
  /* The consequence a reader sees: typeColumn asks asDate, so before this the column was `date` and
     two of its three rows were filed on days nobody wrote down. */
  const rec = fresh({
    title: 'impossible', features: [
      pt(0, 0, { when: '2026-02-30' }), pt(1, 1, { when: '2026-04-31' }), pt(2, 2, { when: '2026-01-15' }),
    ],
  });
  const col = rec.fields.find((f) => f.name === 'when');
  assert.equal(col.type, 'text', 'a column with two impossible days still calls itself a date column');

  const good = fresh({
    title: 'possible', features: [pt(0, 0, { when: '2026-02-28' }), pt(1, 1, { when: '2024-02-29' })],
  });
  assert.equal(good.fields.find((f) => f.name === 'when').type, 'date');
});

/* ══ ② 裸の年は、その年 1 年のまま ═══════════════════════════════════════════════════════ */

test('R774 ② a bare year is still the WHOLE year (docs/GIS-CORE.md §1.5), and BC years still work', () => {
  const y = DATA.momentOf('1889');
  assert.equal(y.year, 1889);
  assert.deepEqual(utcDate(y.start), [1889, 1, 1]);
  assert.deepEqual(utcDate(y.end), [1889, 12, 31]);
  assert.ok(y.end - y.start > 364 * 24 * 3600 * 1000, 'the year collapsed to an instant');

  /* the same year spelled with ISO padding is the same year — not one millisecond */
  const p = DATA.momentOf('0005');
  assert.equal(p.year, 5);
  assert.deepEqual(utcDate(p.start), [5, 1, 1]);
  /* ⚠ AND NOT 1905: Date.UTC would map a year below 100 into the twentieth century (#R602). */
  assert.notEqual(new Date(p.start).getUTCFullYear(), 1905);

  const bc = DATA.momentOf(-200);
  assert.equal(bc.year, -200);
  assert.deepEqual(utcDate(bc.start), [-200, 1, 1]);

  /* a stated day is still a single instant, as before */
  const d = DATA.momentOf('1889-07-14');
  assert.equal(d.start, d.end);
  assert.deepEqual(utcDate(d.start), [1889, 7, 14]);
  /* and a day that does not exist is not a moment at all */
  assert.equal(DATA.momentOf('1889-02-30'), null);
});

/* ══ ③ 逆転した期間は、名前を持って拒まれる ═════════════════════════════════════════════ */

test('R774 ③ a constant period that ends before it begins is refused by name', () => {
  const rec = fresh({
    title: 'reversed', features: [pt(0, 0, {})],
    time: { kind: 'constant', start: '2026-09-17', end: '2020-01-01' },
  });
  assert.equal(rec.time, null, 'a period that ends before it begins was carried as the dataset’s own statement');
  assert.equal(rec.timeRefused.why, 'time-constant-reversed');
  /* the detail echoes what the reader stated, so the panel can show which two values disagree */
  assert.equal(rec.timeRefused.detail.start, '2026-09-17');
  assert.equal(rec.timeRefused.detail.end, '2020-01-01');

  /* the same statement made in years, which take a whole year each — the comparison must be of the
     resulting span and not of the spelling */
  const yrs = fresh({ title: 'reversed-years', features: [pt(0, 0, {})], time: { kind: 'constant', start: 2020, end: 1999 } });
  assert.equal(yrs.timeRefused.why, 'time-constant-reversed');
});

test('R774 ③ the periods that are not reversed still pass, including the ones that touch', () => {
  const fwd = fresh({ title: 'fwd', features: [pt(0, 0, {})], time: { kind: 'constant', start: '2020-01-01', end: '2026-09-17' } });
  assert.equal(fwd.timeRefused, null, JSON.stringify(fwd.timeRefused));
  assert.deepEqual(utcDate(fwd.time.start), [2020, 1, 1]);
  assert.deepEqual(utcDate(fwd.time.end), [2026, 9, 17]);

  /* ⚠ ONE INSTANT IS NOT A REVERSAL. start === end is a legal period of zero length and a very
     common one (a grid produced at a moment), so the comparison is `>` and not `>=`. */
  const one = fresh({ title: 'one', features: [pt(0, 0, {})], time: { kind: 'constant', start: '2026-09-17', end: '2026-09-17' } });
  assert.equal(one.timeRefused, null);
  assert.equal(one.time.start, one.time.end);

  /* a single bare year is a whole year, so its start precedes its end — a naive comparison that
     paired start-of-start with start-of-end would have been fine here, but one that paired
     end-with-start would refuse every year. */
  const yr = fresh({ title: 'yr', features: [pt(0, 0, {})], time: { kind: 'constant', start: 2020, end: 2020 } });
  assert.equal(yr.timeRefused, null);
  assert.deepEqual(utcDate(yr.time.start), [2020, 1, 1]);
  assert.deepEqual(utcDate(yr.time.end), [2020, 12, 31]);

  /* an open end is still open, and nothing to compare is nothing to refuse */
  const open = fresh({ title: 'open', features: [pt(0, 0, {})], time: { kind: 'constant', start: '2020-01-01' } });
  assert.equal(open.timeRefused, null);
  assert.deepEqual(utcDate(open.time.start), [2020, 1, 1]);

  /* ⚠ AND THE DECLARATION IS STILL IDEMPOTENT (#R759): re-declaring a record's own normalised
     `time` — a pair of epoch milliseconds — must not now trip the reversal rule. */
  const again = fresh({ title: 'again', features: [pt(0, 0, {})], time: { kind: 'constant', start: fwd.time.start, end: fwd.time.end } });
  assert.equal(again.timeRefused, null, JSON.stringify(again.timeRefused));
  assert.equal(again.time.start, fwd.time.start);
  assert.equal(again.time.end, fwd.time.end);
});

/* ══ ④ 行ごとの逆転は、数えられて、既にある規則に渡される ═══════════════════════════════ */

test('R774 ④ a reversed interval row does not count as readable, and the count travels', () => {
  /* ⚠ NO SECOND POLICY. The branch already decided what to do with a row that does not read: keep
     the axis, carry the count, refuse only when NOTHING read. A reversed row is the same kind of
     fact, so it is counted out of `readable` and the existing rule decides. */
  const rec = fresh({
    title: 'spans', features: [
      pt(0, 0, { from: '2020-01-01', to: '2021-01-01' }),
      pt(1, 1, { from: '2026-01-01', to: '2020-01-01' }),
      pt(2, 2, { from: '2022-01-01', to: '2023-01-01' }),
    ],
    time: { kind: 'interval', startField: 'from', endField: 'to' },
  });
  assert.equal(rec.timeRefused, null, JSON.stringify(rec.timeRefused));
  assert.equal(rec.time.stated, 3);
  assert.equal(rec.time.readable, 2, 'the reversed row was counted as readable');
  assert.equal(rec.time.reversed, 1, 'the count a reader would need is not in the record');

  /* a column where EVERY stated row is reversed reads not at all, so the existing rule refuses the
     whole declaration — and it refuses it with the code that already has a sentence */
  const all = fresh({
    title: 'all-reversed', features: [
      pt(0, 0, { from: '2026-01-01', to: '2020-01-01' }),
      pt(1, 1, { from: '2030-01-01', to: '2029-01-01' }),
    ],
    time: { kind: 'interval', startField: 'from', endField: 'to' },
  });
  assert.equal(all.time, null);
  assert.equal(all.timeRefused.why, 'time-unreadable');
  assert.equal(all.timeRefused.detail.reversed, 2);
});

test('R774 ④ intervals that are not reversed are unchanged, open ends included', () => {
  const rec = fresh({
    title: 'ok-spans', features: [
      pt(0, 0, { from: '2020-01-01', to: '2021-01-01' }),
      pt(1, 1, { from: '2021-01-01', to: '2021-01-01' }),   /* one instant is not a reversal */
      pt(2, 2, { from: '2022-01-01' }),                      /* an open end is not a reversal */
      pt(3, 3, { to: '2019-01-01' }),                        /* nor is an open start */
    ],
    time: { kind: 'interval', startField: 'from', endField: 'to' },
  });
  assert.equal(rec.timeRefused, null, JSON.stringify(rec.timeRefused));
  assert.equal(rec.time.stated, 4);
  assert.equal(rec.time.readable, 4);
  assert.equal(rec.time.reversed, 0);

  /* ⚠ A BARE YEAR PAIR IS NOT REVERSED WHEN IT IS THE SAME YEAR. 2020→2020 is start-of-2020 to
     end-of-2020; a comparison that read the end of the start against the start of the end would
     have called it reversed and thrown away a very ordinary axis. */
  const years = fresh({
    title: 'year-spans', features: [pt(0, 0, { from: '2020', to: '2020' }), pt(1, 1, { from: 1889, to: 1890 })],
    time: { kind: 'interval', startField: 'from', endField: 'to' },
  });
  assert.equal(years.timeRefused, null, JSON.stringify(years.timeRefused));
  assert.equal(years.time.reversed, 0);
  assert.equal(years.time.readable, 2);

  /* an `instant` axis has no pair to reverse, and is left exactly as it was */
  const inst = fresh({
    title: 'inst', features: [pt(0, 0, { when: '2020-05-06' }), pt(1, 1, { when: 'いつか' })],
    time: { kind: 'instant', field: 'when' },
  });
  assert.equal(inst.timeRefused, null);
  assert.equal(inst.time.readable, 1);
  assert.equal(inst.time.stated, 2);
  assert.equal('reversed' in inst.time, false, 'a single-column axis grew a count about pairs');
});

/* ══ ⑤ 拒否のコードは宣言されている ═══════════════════════════════════════════════════════ */

test('R774 ⑤ the new refusal is DECLARED, not just spelled at the one place that raises it', () => {
  /* tests/r729-gis-core-checks ④ reads REFUSALS to decide which codes must have a sentence in
     js/gis-panel.js. A code raised without being declared would be invisible to that gate — which is
     the shape [[intmap-gate-universe-is-declared-gates]] records: a gate sees the population it was
     given, so a code outside the declaration reaches a reader with no sentence and nothing objects. */
  const src = readFileSync(new URL('../js/gis-datasets.js', import.meta.url), 'utf8');
  const decl = /const REFUSALS = \[([^\]]*)\]/.exec(src);
  assert.ok(decl, 'js/gis-datasets.js no longer declares its refusal codes');
  const codes = Array.from(decl[1].matchAll(/'([a-z0-9-]+)'/g)).map((m) => m[1]);
  assert.ok(codes.includes('time-constant-reversed'), 'the reversed-period refusal is not in REFUSALS');
  /* and it is actually raised — a declaration nothing raises is the opposite defect */
  assert.match(src, /no\('time-constant-reversed'/);
});
