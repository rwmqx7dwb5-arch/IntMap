/* ============================================================================
 *  #R698 — the two things that only started lying when the stepper reached BC
 * ----------------------------------------------------------------------------
 *  #R695 put the era sheets in the border stepper's list, which is what made 123000 BC reachable
 *  from a control rather than only from a drag. Production verification then found two defects
 *  that could not exist while the list stopped at 1689, and both are the shape #R602 named:
 *  a rule that is right for every year the caller can reach starts lying the moment the floor
 *  moves, and nothing goes red.
 *
 *    ① `year:'numeric'` DROPS THE ERA. 3000 BC and AD 3000 formatted to the SAME STRING, so the
 *       stepper stood on 3000 BC and said 「3000年1月1日」.
 *    ② `changeAt` read `shownY`, which `go()` assigns only after `await fetchFC(...)`, while the
 *       panel that draws the label is a synchronous clock subscriber. The label therefore named
 *       the PREVIOUS sheet and never caught up.
 *
 *  ⚠ BOTH ARE MEASURED HERE BY EVALUATING (#R505), not by reading the source for a spelling
 *  (#R488) — ② in particular is about ORDER, which no amount of source-reading can see.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timeBorders } from '../scripts/histeras/time-borders.mjs';
import { histScale } from './helpers/hist-scale.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── ① the era word ─────────────────────────────────────────────────────────
   The formatter lives inside js/news-timeline.js's module closure, so what is measured here is
   the RULE it now follows, against the platform this app hands the job to. If Intl ever stopped
   distinguishing the two eras, the app could not say it either — and this would say so. */
test('① a date before year 1 does not format to the same string as one after it', () => {
  /* ⚠⚠⚠ THE RULE IS EVALUATED, NOT GREPPED. The first version of this check asked whether
     js/news-timeline.js's source contained the word «era» — and when the one line that asks for it
     was deleted, the check stayed GREEN, because the word also appears in the comment explaining
     why it is there. #R488, committed by the check written to prevent it. The formatter lived
     inside a DOM closure where nothing could evaluate it (#R575), so the rule was moved to the
     owner of this arithmetic — js/hist-scale.js, beside `yearText`, which asks the platform the
     same question for a bare year — and the owner is RUN here. */
  const HS = histScale();
  assert.equal(typeof HS.dateText, 'function', 'js/hist-scale.js publishes no whole-date formatter');
  for (const tag of ['ja', 'en', 'de', 'ru', 'ko', 'zh-Hant', 'fr', 'es']) {
    const bc = HS.dateText(-2999, 1, 1, tag), ad = HS.dateText(3000, 1, 1, tag);
    assert.notEqual(bc, ad, tag + ': 3000 BC and AD 3000 format identically — ' + bc);
    /* ⚠ AND IT IS NOT PRINTED AS A NEGATIVE NUMBER. «−322» is what #R679 found the bare year
       doing; the test for it is a MINUS IN FRONT OF DIGITS, not the presence of a hyphen — French
       says «1 janv. 3000 av. J.-C.», which is correct and full of hyphens. */
    assert.doesNotMatch(bc, /(^|[\s(])[-−]\d/, tag + ': a year before 1 is printed as a negative number — ' + bc);
  }
  /* ⚠ AND THE ERA IS NOT ASKED FOR WHEN THERE IS NOTHING TO SAY. Requesting it unconditionally
     prints 「西暦1990年10月2日」 and «Oct 2, 1990 AD» on every ordinary date. */
  assert.ok(!/西暦/.test(HS.dateText(1990, 10, 2, 'ja')), 'an ordinary date gained an era word');
  assert.ok(!/\bAD\b/.test(HS.dateText(1990, 10, 2, 'en')), 'an ordinary date gained an era word');
  /* ⚠ AND A YEAR UNDER 100 IS THAT YEAR, not 1900 + it (#R602's trap, reachable here now). */
  assert.match(HS.dateText(99, 1, 1, 'en'), /\b99\b/, 'year 99 is being written as 1999');
  /* the caller must READ the owner rather than keep a second copy of the rule */
  const src = readFileSync(join(ROOT, 'js', 'news-timeline.js'), 'utf8');
  const body = src.slice(src.indexOf('function _dateText'), src.indexOf('function _dateText') + 400);
  /* ⚠ `/dateText\(/` WAS NOT ENOUGH, and finding that out is the whole reason this was broken on
     purpose before it was kept: the slice STARTS at `function _dateText`, so the function's own
     name matched and the check passed with the owner ripped out. It has to name the call. */
  assert.match(body, /HS\(\)\.dateText\(/, '_dateText no longer reads the owner (js/hist-scale.js)');
  /* ⚠ THE bare `d.toLocaleDateString()` IN THE catch IS NOT A SECOND COPY — it takes no options at
     all, so it states nothing about eras or year placement; it is the «the owner did not evaluate»
     last resort. What must not come back is a formatter that decides those things here. */
  assert.doesNotMatch(body, /toLocaleDateString\([^)]/, '_dateText formats the date itself again — the rule would have two owners');
  assert.doesNotMatch(body, /Intl\.DateTimeFormat/, '_dateText formats the date itself again — the rule would have two owners');
});

/* ── ② the label names the sheet the reader asked for, not the one before it ───────────────── */
test('② changeAt answers from the date, not from what has already been drawn', async () => {
  const { api, window: w } = timeBorders({ lang: 'jp', year: 500 });
  const HS = w.IntMapHistScale;
  /* the era bundle, published the way the <script> tag publishes it — nothing here fetches */
  w.__HISTERAS = { rings: [], snaps: [{ y: -122999 }, { y: -2999 }, { y: 500 }, { y: 600 }, { y: 1650 }] };
  const ymd = (d) => (d ? HS.ymd(d) : null);

  /* ⚠ NOTHING HAS BEEN DRAWN AT ALL — `go()` has never run, so `shownY` is null. The old rule
     returned null here and, once anything HAD been drawn, returned that instead. */
  assert.equal(ymd(await api.changeAt(HS.utcAt(-2999, 5, 15, 12))), '-002999-01-01',
    'the label must name the sheet for the instant it was asked about');
  assert.equal(ymd(await api.changeAt(HS.utcAt(500, 5, 15, 12))), '0500-01-01');
  assert.equal(ymd(await api.changeAt(HS.utcAt(1600, 5, 15, 12))), '1650-01-01',
    'the sheet is chosen by the same nearest() go() uses — 1600 is closer to 1650 than to 500');
  /* ⚠ AND ASKING TWICE IN A ROW, IN THE ORDER A READER TRAVELS, MUST NOT SHOW THE FIRST ANSWER
     THE SECOND TIME. That is exactly what production saw. */
  const seen = [];
  for (const y of [1600, 500, -2999, 600]) seen.push(ymd(await api.changeAt(HS.utcAt(y, 5, 15, 12))));
  assert.deepEqual(seen, ['1650-01-01', '0500-01-01', '-002999-01-01', '0600-01-01'],
    'the label lags a step behind the reader');

  /* ⚠ THE DAY-EXACT WINDOW IS UNTOUCHED, and asking it needs its own record on `window` — this
     harness has no `<script>` tag, so `hbLoad()` would never settle and the test would hang
     rather than fail (measured). A minimal record is published the same way the era one is. */
  w.__HISTB = { window: [1689, 1885], rings: [], feats: [[{ en: 'Y' }, null, 1689, 1, 1, 1885, 12, 31, []]] };
  assert.equal(ymd(await api.changeAt(HS.utcAt(1750, 5, 15, 12))), '1689-01-01',
    'the day-exact branch must still answer from the record and the date');
});
