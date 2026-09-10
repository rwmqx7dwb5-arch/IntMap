/* ============================================================================
 *  R679 · Chronos reaches before the common era — the arithmetic, EVALUATED
 * ----------------------------------------------------------------------------
 *  「Chronosの歴史的地名、境界線coverageを、できる限りすべてを最高レベル品質と精度で
 *    網羅するように。私はあなたにいつの時代までかをここで制限することもしません。」
 *
 *  ⚠ EVERY CHECK HERE RUNS THE CODE. #R505's rule, and this round is the third in
 *  a row in which a check that READ SOURCE for the clock's floor stopped matching
 *  and took its whole file down at import (#R604 ⑨b, and again here in r380/r349/
 *  r518). The floor now arrives through tests/helpers/hist-scale.mjs, which
 *  evaluates its owner, so a floor that moves again breaks nothing in tests/.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { histScale, clockFloor } from './helpers/hist-scale.mjs';
import { eraBundle } from './helpers/hist-eras.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const HS = histScale();
const FLOOR = clockFloor();
const NOW = 2026;

/* the nine languages, with the BCP-47 tag js/lang-registry.js answers for each.
   ⚠ NOT A SECOND TABLE — read from the registry itself, so a language added there
   is swept here without an edit. */
function langTags() {
  const codes = JSON.parse(/IntMapLangCodes\s*=\s*(\[[^\]]*\])/.exec(R('js/locales/_langs.js'))[1]);
  const rows = {};
  const re = /\{\s*code:\s*'([^']+)'[^}]*?html:\s*'([^']+)'/g;
  const src = R('js/lang-registry.js');
  let m;
  while ((m = re.exec(src))) rows[m[1]] = m[2];
  const out = {};
  for (const c of codes) out[c] = rows[c] || c;
  return out;
}

/* ── ① the floor is below the common era, and the clock can actually stand there ── */
test('R679 ①: the clock reaches before the common era, and the instant it lands on is that year', () => {
  assert.ok(FLOOR < 1, `the floor is not before the common era: ${FLOOR}`);
  /* ⚠ THE HALF SOURCE CANNOT SHOW. #R604's whole lesson was that `YMIN = 1` and
     «the clock is in year 1» are different claims — Date.UTC turned one into 1901.
     So construct the instant and read the year back off it. */
  for (const y of [FLOOR, -122999, -10000, -322, -1, 0, 1, 99, 1850, NOW]) {
    if (y < FLOOR) continue;
    const d = HS.utcAt(y, 5, 15, 12, 0, 0);
    assert.ok(!Number.isNaN(+d), `year ${y} is not a constructible instant`);
    assert.equal(d.getUTCFullYear(), y, `utcAt(${y}) landed in ${d.getUTCFullYear()}`);
  }
});

/* ── ② the calendar date of an instant, for years toISOString writes with a sign ── */
test('R679 ②: ymd is a date at every year the clock can reach — toISOString().slice(0,10) is not', () => {
  /* the defect, stated as the thing it produced: ten characters with no day in them */
  const d = HS.utcAt(-322, 0, 1);
  assert.equal(d.toISOString().slice(0, 10), '-000322-01', 'the trap this exists for has changed shape — re-read the comment');
  assert.equal(HS.ymd(d), '-000322-01-01');
  assert.equal(HS.ymd(HS.utcAt(-122999, 5, 15)), '-122999-06-15');
  assert.equal(HS.ymd(HS.utcAt(1, 0, 1)), '0001-01-01');
  assert.equal(HS.ymd(HS.utcAt(2026, 11, 31)), '2026-12-31');
  /* ⚠ IT MUST ROUND-TRIP. The output is ECMA's own extended form precisely so that
     a reader of it (a feed URL, a filename, a parser) gets back the instant that
     was meant, instead of a plausible date in the wrong millennium. */
  for (const y of [-122999, -322, -1, 0, 1, 99, 1850, 2026]) {
    const s = HS.ymd(HS.utcAt(y, 5, 15));
    assert.equal(new Date(s + 'T00:00:00Z').getUTCFullYear(), y, `${s} does not parse back to ${y}`);
  }
});

/* ── ③ both copies of that rule are gone ─────────────────────────────────────── */
test('R679 ③: nothing outside its owner truncates an ISO year to ten characters for a clock instant', () => {
  for (const f of ['js/chronos.js', 'js/app-body.js']) {
    const src = R(f);
    const m = src.match(/(?:function|const) ymdISO[\s\S]{0,500}/);
    assert.ok(m, `${f} no longer has a ymdISO to check — has it moved?`);
    assert.match(m[0], /IntMapHistScale/, `${f} holds its own copy of the date rule instead of reading the owner`);
  }
  /* the kernel's fallback body is allowed (a page without hist-scale), the truncation is not */
  /* ⚠ COMMENTS BLANKED FIRST (#R628): the sentence that EXPLAINS this defect names it
     verbatim, and a scan that cannot tell prose from code reports the explanation as the bug. */
  assert.doesNotMatch(codeOnly(R('js/chronos.js')), /toISOString\(\)\.slice\(0,\s*10\)/,
    'js/chronos.js still truncates an ISO year');
});

/* ── ④ astronomical ⇄ era, and ICU agrees ────────────────────────────────────── */
test('R679 ④: the era conversion is one function, invertible, and matches ICU', () => {
  assert.deepEqual(HS.era(-322), { bce: true, n: 323 });
  assert.deepEqual(HS.era(0), { bce: true, n: 1 });
  assert.deepEqual(HS.era(1), { bce: false, n: 1 });
  for (let y = -6000; y <= 2100; y++) {
    const e = HS.era(y);
    assert.ok(e.n > 0, `era(${y}) produced a non-positive display number`);
    assert.equal(HS.fromEra(e.n, e.bce), y, `era/fromEra do not invert at ${y}`);
  }
  /* ⚠ AN INDEPENDENT WITNESS. ICU does the BC/AD arithmetic itself from the same
     astronomical instant, so if our offset were wrong these would disagree. */
  for (const [y, want] of [[-322, '323'], [0, '1'], [-1, '2']]) {
    const t = new Intl.DateTimeFormat('en', { era: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(HS.utcAt(y, 5, 15, 12));
    assert.ok(t.startsWith(want + ' '), `ICU reads astronomical ${y} as «${t}», we say ${HS.era(y).n} BC`);
  }
});

/* ── ⑤ the year, in nine languages, with the era word where that language puts it ── */
test('R679 ⑤: every shipped language gets a real era word below year 1, and a bare year above it', () => {
  const tags = langTags();
  const codes = Object.keys(tags);
  assert.ok(codes.length >= 9, `the registry lists ${codes.length} languages, expected the shipped nine`);
  const seen = new Set();
  for (const c of codes) {
    const bce = HS.yearText(-322, tags[c], c === 'jp' ? '年' : null);
    /* the failure this guards is a raw astronomical year reaching the reader — «−322年».
       A hyphen INSIDE an era word is not that (fr writes «av. J.-C.»), so what is forbidden
       is a SIGN IN FRONT OF A NUMBER, not the character. */
    assert.ok(bce && !/(^|[\s(])[-\u2212]\d/.test(bce), `${c}: a signed year reached the reader as «${bce}»`);
    assert.match(bce, /323/, `${c}: «${bce}» does not name the year 323`);
    /* the era word is what makes it a year — a bare «323» would be the AD one */
    assert.ok(bce.replace(/[\d\s]/g, '').length > 0, `${c}: «${bce}» carries no era word`);
    seen.add(bce);
    /* above year 1 nothing changes, because nothing about it was broken */
    assert.equal(HS.yearText(1500, tags[c], c === 'jp' ? '年' : null), c === 'jp' ? '1500年' : '1500');
  }
  /* ⚠ NINE LANGUAGES, NOT ONE STRING NINE TIMES (#R244's shape). Latin-script
     languages legitimately share nothing here, and zh vs zh-hans must differ —
     a bare `zh` handed to ICU resolves to Simplified, which is the call-site bug
     the registry's `html` tag exists to prevent. */
  assert.ok(seen.size >= 6, `nine languages produced only ${seen.size} distinct era labels`);
  assert.notEqual(HS.yearText(-322, tags['zh']), HS.yearText(-322, tags['zh-hans']),
    'Traditional and Simplified Chinese got the same era word — the tag lost its script');
});

/* ── ⑥ the rail: reach was added without taking precision away ────────────────── */
test('R679 ⑥: the deep band is a levy on the whole rail, not a reallocation of the old one', () => {
  const R1 = HS.rail;
  const P = (y) => R1.toPos(y, FLOOR, NOW);
  const bands = { deep: P(1) - P(FLOOR), early: P(1500) - P(1), mid: P(1850) - P(1500), modern: P(NOW) - P(1850) };
  /* what #R604 shipped, measured on its own floor, is the thing that must not shrink
     DISPROPORTIONATELY: the three bands above year 1 keep their RELATIVE shares. */
  const keep = R1.POS - bands.deep;
  assert.ok(Math.abs(bands.early / keep - 0.25) < 0.01, `AD 1-1500 lost its quarter: ${bands.early}/${keep}`);
  assert.ok(Math.abs(bands.mid / keep - 0.25) < 0.01, `1500-1850 lost its quarter: ${bands.mid}/${keep}`);
  assert.ok(Math.abs(bands.modern / keep - 0.5) < 0.01, `1850-now lost its half: ${bands.modern}/${keep}`);
  assert.ok(bands.deep > 0, 'the pre-common-era band has no rail at all');
  assert.ok(bands.deep <= R1.POS * 0.15, `the deep band took ${bands.deep} of ${R1.POS} — that is a reallocation`);
});

test('R679 ⑥b: the rail is monotone and invertible across the whole reach', () => {
  const R1 = HS.rail;
  let prev = -Infinity;
  for (let p = 0; p <= R1.POS; p++) {
    const y = R1.toYear(p, FLOOR, NOW);
    assert.ok(y >= prev, `the rail runs backwards at position ${p}`);
    prev = y;
    assert.ok(y >= FLOOR && y <= NOW, `position ${p} names ${y}, outside the reach`);
    /* the thumb must not walk when the reader lets go */
    assert.ok(Math.abs(R1.toPos(y, FLOOR, NOW) - p) <= 3, `position ${p} does not come back (${R1.toPos(y, FLOOR, NOW)})`);
  }
});

/* ── ⑦ THE PROPERTY THIS ROUND IS ABOUT: every era the record has is reachable ── */
test('R679 ⑦: every era snapshot the map can answer with has a slider position that selects it', () => {
  /* ⚠ THIS IS THE COVERAGE CLAIM ITSELF, AND IT IS THE ONE THAT CAN QUIETLY FAIL.
     A rail can be smooth, monotone and beautifully even and still leave a snapshot
     with no position that lands nearer to it than to its neighbours — the map would
     then hold a world no reader can ask for, which is indistinguishable from not
     having it. So the years come from the shipped list, not from this file. */
  const YEARS = eraBundle().snaps.map((s) => s.y).sort((a, b) => a - b);
  assert.ok(YEARS.length >= 53, `the era record shrank to ${YEARS.length} snapshots`);
  assert.ok(YEARS.filter((y) => y < 1).length >= 17,
    'the record lost its pre-common-era snapshots — that is the whole of this round');
  const nearest = (y) => YEARS.reduce((b, s) => (Math.abs(s - y) < Math.abs(b - y) ? s : b), YEARS[0]);
  const reach = new Set();
  for (let p = 0; p <= HS.rail.POS; p++) reach.add(nearest(HS.rail.toYear(p, FLOOR, NOW)));
  const missing = YEARS.filter((y) => !reach.has(y));
  assert.deepEqual(missing, [], `no slider position selects these snapshots: ${missing.join(', ')}`);
});

/* ── ⑧ the ruler is derived, and it labels the deep band ─────────────────────── */
test('R679 ⑧: the ruler’s marks come from the rail, not from a written list', () => {
  const t = HS.niceTicks(FLOOR, NOW, 64);
  assert.ok(t.length > 12, `the ruler produced ${t.length} marks`);
  assert.ok(t.every((y, i) => i === 0 || y > t[i - 1]), 'the marks are not strictly increasing');
  assert.ok(t.every((y) => y >= FLOOR && y <= NOW), 'a mark falls outside the reach');
  assert.ok(t.some((y) => y < 1), 'the pre-common-era band has no mark at all');
  /* ⚠ ROUNDED IN THE NUMBER THE READER SEES. Rounding the astronomical year gives
     «6 BC» for −5 and «5001 BC» for −5000; measured, before it shipped. */
  for (const y of t) {
    if (y === FLOOR || y === NOW) continue;   /* the ends of the rail, not derived marks */
    const n = HS.era(y).n;
    if (n < 10) continue;
    /* every derived mark is a multiple of a 1-2-5 step, so «a multiple of five» is the property
       that holds without this check recomputing the rail's local density a second time. */
    assert.equal(n % 5, 0, `«${HS.yearText(y, 'en')}» is not a number a person would read`);
  }
  /* the panel must not hold a list of years any more */
  const ntl = R('js/news-timeline.js');
  assert.doesNotMatch(ntl, /want=\[1,500,1000,1250/, 'the written tick list came back to js/news-timeline.js');
  assert.match(ntl, /niceTicks\(/, 'the panel no longer derives its ruler from the rail');
});

/* ── ⑨ the native date control states its own limit instead of faking one ────── */
test('R679 ⑨: the datetime-local control clamps to the lowest year HTML can express, not the kernel’s floor', () => {
  const ntl = R('js/news-timeline.js');
  assert.match(ntl, /const jumpMinYear=\(\)=>Math\.max\(1,YMIN\(\)\)/,
    'the jump control must derive its floor from the kernel rather than name a year');
  assert.match(ntl, /if\(Y<jumpMinYear\(\)\) return new Date\(jumpFloorMs\(\)\)/,
    'a half-typed year must become the control’s floor, not the kernel’s');
  assert.match(ntl, /jumpValue\(new Date\(jumpFloorMs\(\)\)\)/,
    'the control’s min attribute must be a string HTML can parse');
  /* HTML's date grammar has no sign — so the attribute this produces has none */
  assert.equal(Math.max(1, FLOOR), 1, 'the control’s floor is no longer year 1 — re-read the comment');
});

/* ── ⑩ a degraded deep year is blank, not two thousand years wrong ──────────── */
test('R679 ⑩: with no era bundle, a year before the common era is answered by nothing', () => {
  /* ⚠ THE DEFECT THIS GUARDS IS #R604's, ONE FLOOR DOWN. The remote fallback can only ask for
     snapshots whose upstream file name is a plain decimal year, so its list starts at 100 — and
     `nearest(-322, thatList)` answers 100. Drawing the Roman world of AD 100 under the label
     «323 BC» is the same act as #R604's Congress of Vienna drawn as 1500, and lowering the floor
     is what made this path reachable. Measured in the source, because the branch is a refusal:
     there is nothing on screen to query. */
  const tb = R('js/time-borders.js');
  assert.match(tb, /if\(!_erd&&year<1\)\{[\s\S]{0,220}?return;\s*\}/,
    'js/time-borders.js no longer refuses a pre-common-era year it cannot source');
  /* …and the fallback path itself must not reach for a file name it cannot spell */
  assert.match(tb, /if\(year<1\) return null;/,
    'the remote fallback must not try to fetch a pre-common-era snapshot by decimal name');
  /* the fallback list is upstream's decimal-named files, and its oldest is AD 100 — if that ever
     changes, the refusal above is measuring the wrong thing */
  const m = /const YEARS=(\[[\s\S]*?\]);/.exec(tb);
  assert.ok(m, 'js/time-borders.js no longer declares the fallback list');
  const YEARS = JSON.parse(m[1].replace(/\s+/g, ''));
  assert.ok(YEARS.every((y) => y >= 1), 'the fallback list gained a year it cannot name a file for');
});
