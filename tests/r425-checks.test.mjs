/* ============================================================================
 *  #R425 — a former state hides a successor only for the years it actually held it
 * ----------------------------------------------------------------------------
 *  `js/history.js` `histStates` aggregates a vanished polity's modern territories into one row and
 *  hides those territories from the Countries list. It hid them for the state's WHOLE lifespan, and
 *  the Soviet Union's lifespan opens on 1922-12-30 — seventeen years before it annexed the Baltic
 *  states. MEASURED on production at 1938-06 and 1939-09 (builds R415/R416): the era layer drew
 *  «Latvia», «Estonia» and «Lithuania» with `_same=1` and `_modName` set — the LABEL path judged all
 *  three present-day countries under their own names — while the Countries list had no row for any of
 *  them. #R380 had already stated the rule one level up («each era bound is the polity's OWN start
 *  date, not the window's»); it was never carried down to the successors.
 *
 *  ⚠ NO CHECK BELOW NAMES A COUNTRY CODE. ① and ④ walk `STATES` and its `held` windows, so a state
 *  added later is covered without touching this file — the defect #R380 ⑤ describes is a hand-written
 *  list of twenty codes that was green because it was a list. ② re-derives both bounds from
 *  data/cshapes.js, the border source the MAP reads, so a hand-picked date cannot pass.
 *  ⚠ Files are read through `readLF` (#R283/#R317: CRLF in the working copy, LF in the index).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));

/* the shipped module, run — not its spelling read (same stub as tests/r380-checks / r410-checks) */
const MODULES = (() => {
  const win = { IntMapModules: {}, IntMapLang: { pickArgs: () => function () { return Array.prototype.slice.call(arguments); } } };
  new Function('window', R('js/history.js'))(win);
  return win.IntMapModules;
})();
/* every code the registry can ever hide, taken FROM the registry */
const ALL_SUCC = [...new Set(MODULES.histStates({}).STATES.flatMap((S) => S.succ))];
const fresh = () => Object.fromEntries(ALL_SUCC.map((c) => [c, { pop: 1e6, gdp: 1, area: 1, nameEn: c, nameJp: c, sov: true }]));
const STATES = () => MODULES.histStates({}).STATES;

const DAY = 86400000;
const at = (iso, off = 0) => new Date(Date.parse(iso + 'T12:00:00Z') + off * DAY);
const hiddenAt = (date) => { const stats = fresh(); MODULES.histStates(stats).apply(date); return stats; };
const inLife = (S, d) => +d >= Date.parse(S.from + 'T00:00:00Z') && +d <= Date.parse(S.to + 'T23:59:59Z');

/* ── ① the hiding follows the table's own windows, at every bound the table declares ──────────── */
test('R425 ①: a successor is hidden for exactly the days its state declares it held', () => {
  let bounds = 0, plain = 0;
  for (const S of STATES()) {
    for (const c of S.succ) {
      const w = (S.held || {})[c];
      if (!w) {
        /* no window = held for the whole lifespan, which is what every other row means */
        const mid = new Date((Date.parse(S.from + 'T00:00:00Z') + Date.parse(S.to + 'T23:59:59Z')) / 2);
        assert.ok(hiddenAt(mid)[c]._histHidden, `${S.code}: ${c} has no window, so it must be hidden mid-lifespan`);
        plain++; continue;
      }
      const [from, to] = [w[0] || S.from, w[1] || S.to];
      /* inside the window it is the state's; outside it is its own country again */
      assert.ok(hiddenAt(at(from))[c]._histHidden, `${S.code}: ${c} must be hidden on ${from}, the day the window opens`);
      assert.ok(hiddenAt(at(to))[c]._histHidden, `${S.code}: ${c} must still be hidden on ${to}, the last day of the window`);
      const before = at(from, -1), after = at(to, 1);
      if (inLife(S, before)) assert.ok(!hiddenAt(before)[c]._histHidden, `${S.code}: ${c} is still struck off the list on ${from} minus a day — the window is not being read`);
      if (inLife(S, after)) assert.ok(!hiddenAt(after)[c]._histHidden, `${S.code}: ${c} is still struck off the list on ${to} plus a day — the window is not being read`);
      bounds++;
    }
  }
  /* the positive half: a walk that found no windows would be green for the same reason a clean tree is */
  assert.ok(bounds >= 3, `the walk found only ${bounds} declared windows — it is not reading the table`);
  assert.ok(plain >= 50, `the walk found only ${plain} window-less successors — it is not reading the table`);
});

/* ── ② …and both bounds are dates data/cshapes.js agrees with, not dates somebody typed ───────── */
test('R425 ②: every declared window is bounded by the same transition the map draws', () => {
  const g = { window: {} };
  new Function('window', readFileSync(join(ROOT, 'data/cshapes.js'), 'utf8'))(g.window);
  const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  /* every CShapes polity's spans, in order */
  const spans = new Map();
  for (const f of g.window.__CSHAPES.feats) {
    const k = f[0]; if (!spans.has(k)) spans.set(k, []);
    spans.get(k).push([iso(f[2], f[3], f[4]), iso(f[5], f[6], f[7])]);
  }
  for (const a of spans.values()) a.sort((x, y) => (x[0] < y[0] ? -1 : 1));
  /* ⚠ CShapes end dates are INCLUSIVE (#R421 `csFC`), so a window that opens on `from` is the complement of
     a span that ENDS THE DAY BEFORE, and one that closes on `to` is the complement of a span that RESUMES THE
     DAY AFTER. Matching `from` to the span end itself would accept a window that is a day wide of the borders
     the map draws — one day on which the map draws a country the list refuses to list. */
  const shift = (iso, days) => new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
  const matching = (from, to) => [...spans.entries()].filter(([, a]) => {
    const i = a.findIndex((s) => s[1] === shift(from, -1));
    return i >= 0 && a[i + 1] && a[i + 1][0] === shift(to, 1) && !a.some((s) => s[0] > from && s[1] < to);
  }).map(([k]) => k);

  const want = new Map();   /* "from|to" → how many successors declare it */
  for (const S of STATES()) for (const c of Object.keys(S.held || {})) {
    const w = S.held[c], k = (w[0] || S.from) + '|' + (w[1] || S.to);
    want.set(k, (want.get(k) || 0) + 1);
  }
  assert.ok(want.size >= 1, 'no window is declared anywhere — this check is asserting nothing');
  for (const [k, n] of want) {
    const [from, to] = k.split('|');
    const got = matching(from, to);
    assert.ok(got.length >= n,
      `${n} successor(s) claim the window ${from}→${to}, but data/cshapes.js shows only ${got.length} polit${got.length === 1 ? 'y' : 'ies'} `
      + `(${got.join(', ') || 'none'}) leaving on ${from} and returning on ${to} — the dates are not the map's`);
  }
});

/* ── ③ the era labels ask the same question the list answers ──────────────────────────────────
   js/time-borders.js `tagSame` builds `_cov` — «successors a former state covers this year» — to stop
   an era rename landing on top of an absorbed country. It read `S.succ` entire while the list hid a
   narrower set, which is the two-readers-of-one-fact shape #R410 spent a round on. */
test('R425 ③: the map’s coverage set is the registry’s own succAt(), not a second reading of succ', () => {
  const tb = codeOnly(R('js/time-borders.js'));
  const i = tb.indexOf('const _cov=new Set();');
  assert.ok(i > 0, 'the coverage set is gone from js/time-borders.js — this check no longer points at anything');
  const line = tb.slice(i, tb.indexOf('\n', tb.indexOf('\n', i) + 1));
  assert.match(line, /succAt\(/, 'the label path is building its coverage set from something other than histStates.succAt()');
  assert.ok(MODULES.histStates({}).succAt, 'histStates does not export succAt() — js/time-borders.js is calling a function that is not there');
  /* and the click resolver, which picks the state that absorbed a hidden country, asks the same thing */
  assert.match(tb.slice(tb.indexOf('else if(bestHid)'), tb.indexOf('else if(bestHid)') + 400), /succAt\(/,
    'resolveHist still scans succ entire, so it can name a state that did not hold that ground on the day being drawn');
});

/* ── ④ the reported years, with the countries taken from the table ────────────────────────────── */
test('R425 ④: at 1938 and 1939 the list contains the states the map was already drawing', () => {
  const windowed = [];
  for (const S of STATES()) for (const c of Object.keys(S.held || {})) windowed.push([S, c, S.held[c]]);
  assert.ok(windowed.length >= 3, 'nothing declares a window — the reported case is not covered');
  for (const iso of ['1938-06-01', '1939-09-01']) {
    const stats = hiddenAt(at(iso));
    for (const [S, c, w] of windowed) {
      if (Date.parse(iso) >= Date.parse((w[0] || S.from))) continue;   /* the state already held it by then */
      assert.ok(!stats[c]._histHidden, `${iso}: ${c} has no Countries row, and the era layer draws it under its own modern name`);
      assert.ok(stats[S.code], `${iso}: ${S.code} lost its own row`);
    }
  }
  /* …and the years it really was absorbed are unchanged: the state, and none of them */
  for (const iso of ['1940-08-01', '1941-06-01']) {
    const stats = hiddenAt(at(iso));
    for (const [S, c, w] of windowed) {
      if (Date.parse(iso) < Date.parse((w[0] || S.from))) continue;
      assert.ok(stats[c]._histHidden, `${iso}: ${c} is listed as a sovereign country inside the window ${S.code} declares`);
      assert.ok(stats[S.code], `${iso}: ${S.code} is not in the list — the reader sees nothing where it was`);
    }
  }
});

/* ── ⑤ the list answers for the DAY on the clock, not for the year it happens to be in ─────────
   Every lifespan in the registry is a real date, and ④'s window opens on 1940-06-02 — in the middle
   of a year. js/time-countries.js drives the overlay off the clock and returned early whenever the
   YEAR had not changed, so a move inside 1940 never re-applied the registries. MEASURED on the built
   bundle before the fix: 1940-03-01 → 1940-08-01 left all three in the list, while reaching the same
   1940-08-01 from 1937 removed them. A reader who arrives at a date by a different route must not get
   a different world, which is #R410's lesson one subsystem over. */
test('R425 ⑤: a move inside one year still re-applies the registries the day keys', () => {
  const tc = codeOnly(R('js/time-countries.js'));
  /* the day-dependent half lives in exactly one function… */
  const applies = [...tc.matchAll(/IntMapHist(?:States|Id)\.apply\(/g)].length;
  assert.equal(applies, 2, `the two registries are applied from ${applies} places, not 2 — one function must own the day-dependent half`);
  const fn = tc.slice(tc.indexOf('function applyHist('), tc.indexOf('function repaint('));
  assert.ok(fn.includes('IntMapHistStates.apply(') && fn.includes('IntMapHistId.apply('),
    'applyHist() is not the function that applies them — the day-dependent half is somewhere else again');
  /* …and the same-year branch calls it instead of returning outright */
  const i = tc.indexOf('if(y===curYear)');
  assert.ok(i > 0, 'the same-year short-circuit is gone from js/time-countries.js — this check no longer points at anything');
  const branch = tc.slice(i, i + 260);
  assert.doesNotMatch(branch, /^if\(y===curYear\)\s*return;/,
    'the overlay still returns outright when the year is unchanged, so a window that opens mid-year is never applied');
  assert.match(branch, /curWhen/, 'the same-year branch does not compare the instant, so it cannot tell a same-year move from no move');
  assert.match(branch, /applyHist\(\)/, 'the same-year branch does not re-apply the registries');
  /* and returning to Now must forget the instant, or the next same-year move compares to a stale one */
  const rest = tc.slice(tc.indexOf('function restore('), tc.indexOf('function fetchYear('));
  assert.match(rest, /curWhen=null/, 'restore() leaves the last instant behind, so the first move after returning to Now can be skipped');
});
