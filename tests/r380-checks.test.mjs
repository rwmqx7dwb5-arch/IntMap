/* ============================================================================
 *  #R380 — auditing the reach to 1850 that #R349 opened
 * ----------------------------------------------------------------------------
 *  #R349 lowered the clock's floor from 1900 to 1850 and stated the invariant this file now tries to
 *  break: «every subsystem reaches as far back as ITS OWN SOURCE reaches and says so where it stops»,
 *  and «each era bound is the polity's OWN start date, not the window's». The audit found the sweep
 *  half-applied in four places, all of them silent:
 *    · fifteen era rows still opened at 1900 — and the check that says they do not was a hand-written
 *      list of twenty codes, so it was green (fixed in tests/r349-checks ④, which now reads the table);
 *    · the comparison panel's own floor was a third copy of the clock's and stayed at 1900, so
 *      1850-1899 silently drew TODAY'S figures under a nineteenth-century year;
 *    · Atlas refused years below the floor with a sentence that named 1900 in all nine languages,
 *      while the guard beside it read the kernel;
 *    · Austria-Hungary and Korea listed their modern successors as sovereign countries for the whole
 *      of the newly reachable window, which is exactly the defect #R349 fixed for the Ottomans.
 *
 *  ⚠ EVERY CHECK BELOW READS THE SHIPPED ARTEFACT OR RUNS THE SHIPPED CODE. Where a check is a
 *  NEGATIVE ("nothing says 1900 any more") it is paired with a positive that proves the scan reaches
 *  the files at all — a pattern that matches nothing is green for the same reason a clean tree is.
 *  ⚠ Files are read through `readLF` (#R283/#R317: CRLF in the working copy, LF in the index).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { clockFloor } from './helpers/hist-scale.mjs';
import { eraBundle } from './helpers/hist-eras.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
/* ⚠⚠⚠ (#R679) THIS LINE THREW AT IMPORT, AGAIN, AND TOOK THE WHOLE FILE WITH IT.
   #R604 already recorded the shape: the floor moved, the regex stopped matching, `.exec()`
   returned null and every sweep in this file stopped running — on the round it existed to
   police. #R604 widened the regex to `\d{1,4}`. #R679 moved the floor BELOW ZERO and into
   js/hist-scale.js, and the same line threw for the third time.
   ⚠ SO IT DOES NOT READ SOURCE ANY MORE. The floor is obtained the way the app obtains it —
   by evaluating its owner (tests/helpers/hist-scale.mjs) — which is #R505's rule, and which
   fails LOUDLY if the owner stops publishing one instead of going quiet. */
const YMIN = clockFloor();

/* ── ① the reach is one number, and no shipped sentence names a different one ─────────────────── */
test('R380 ①: every place that TELLS a reader how far the clock reaches names the kernel’s floor', () => {
  /* ⚠ (#R604) THIS PINNED 1850 AND THE FILE STOPPED RUNNING WHEN THE FLOOR MOVED. The regex above
     wanted four digits, so `const YMIN=1;` made `.exec()` return null and the WHOLE file threw at
     import — every sweep in it, including this one, silently stopped being run on the exact round it
     was written to police. What R380 asserts is that no shipped sentence names a reach OTHER than the
     kernel's, and that claim does not have a number in it. */
  assert.ok(Number.isInteger(YMIN) && YMIN <= 1850,
    `the kernel floor is not a year, or no longer reaches what earlier rounds promised: ${YMIN}`);
  const files = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'))
    .map((f) => 'js/' + f)
    .concat(readdirSync(join(ROOT, 'js', 'locales')).filter((f) => f.endsWith('.js')).map((f) => 'js/locales/' + f))
    /* ══ ⚠⚠⚠ (#R679) THE UNIVERSE WAS THE PROGRAM, AND THE READER IS TOLD THE REACH IN PROSE ══════
       PRODUCT.md still read 「さかのぼれるのは 1850 年まで」 — false since #R604 moved the floor to
       year 1, and doubly false now. This sweep never saw it, because its universe was two readdir
       calls over js/ and js/locales/. That is the #R628 shape exactly: the file was not excluded,
       it was never in the母集合. A sentence telling a reader how far the clock goes is a claim about
       the reach whether it lives in a string literal or in a document — and the document is the one
       a reader is more likely to read.
       ⚠ DEV-NOTES IS NOT HERE, AND THAT IS THE POINT OF THAT FILE. It is the history:
       「それまでこの 36 年は 1880 年の1フレームを共有していた」 is a TRUE sentence about a past state,
       and a sweep that could not tell current spec from history would force the record to be
       falsified to stay green. docs/README.md is what says which documents are which. */
    .concat(['PRODUCT.md', 'README.md', 'Architecture.md'])
    .concat(readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f));
  /* the shapes a reach-claim takes in this codebase, in every language it is written in */
  /* WARNING (#R604) THE POSITIVE HALF COUNTED FOUR-DIGIT LITERALS, AND THE FLOOR IS NOW ONE DIGIT.
     R380's claim is «no shipped sentence tells a reader a reach OTHER than the kernel's», and its
     second assertion existed to prove the scan was actually reaching the files - otherwise an empty
     `bad` proves nothing. Both halves were written when the floor was 1850, i.e. when every correct
     sentence carried a four-digit year equal to it. At a floor of 1 that is impossible: a sentence
     naming the reach either fills it from `IntMapTime.min` at runtime (the {y} placeholder #R380
     itself introduced) or spells it in the language's own era notation. Counting literals therefore
     made the two halves contradictory - the round that lowered the floor could not pass its own
     check no matter what it wrote.
     So the scan now counts CLAIM SENTENCES, whether the year in them is a literal or a placeholder,
     and the negative half is unchanged: a literal that is not the floor is still a lie. */
  const CLAIM = /(?:reaches back to|travel back to|time travel back to|deep time,|remonte jusqu'à|回溯到|回溯至|zurück bis|Chronos \()\s*(\{y\}|\d{4})|(?:さかのぼれるのは|遡れるのは)\s*(\d{4})\s*年まで|(\d{4})\s*(?:→now|→heute|→сейчас|→ahora|年まで遡|년까지)/g;
  const bad = [], seen = [];
  for (const f of files) {
    const src = R(f);
    for (const m of src.matchAll(CLAIM)) {
      const raw = m[1] || m[2] || m[3];
      seen.push(f + ':' + raw);
      /* a claim that is FILLED from the kernel at runtime cannot be stale - that is the whole point
         of the placeholder, and R380 ② separately proves it is filled from `T.min`. */
      if (raw === '{y}') continue;
      const y = +raw;
      if (!Number.isFinite(y) || y < 1500 || y > 2100) continue;
      if (y !== YMIN) bad.push(f + ' → ' + y + '  «' + src.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ') + '»');
    }
  }
  /* the positive half: the scan must actually be finding the claims, or the negative proves nothing */
  assert.ok(seen.length >= 8, `the scan found only ${seen.length} reach-claim sentences — it is not reaching the files`);
  assert.deepEqual(bad, [], 'these still tell the reader a different floor:\n' + bad.join('\n'));
});

/* ── ② Atlas's refusal is derived, not written down ───────────────────────────────────────────── */
test('R380 ②: Atlas refuses a too-early year with the floor it actually tested against', () => {
  const src = R('js/atlas-console.js');
  const i = src.indexOf("if(y<T.min) return R(false,");
  assert.ok(i > 0, 'the deep-time guard is gone or was renamed — this check has to follow it');
  const line = src.slice(i, src.indexOf('\n', i));
  assert.ok(/\{y\}/.test(line), 'the refusal names a literal year again instead of the {y} placeholder');
  assert.ok(/replace\(\/\\\{y\\\}\/g,\s*String\(T\.min\)\)/.test(line),
    'the {y} placeholder is not filled from T.min — the sentence and the guard can disagree again');
  /* and the placeholder exists in every language the table carries */
  for (const lg of ['fr', 'ko', 'zh', 'zh-hans']) {
    assert.ok(R('js/locales/ui.' + lg + '.js').includes('"Chronos reaches back to {y}"'),
      `ui.${lg}.js has no entry for the parametrised refusal — that language falls back to English`);
  }
});

/* ── ③ the comparison panel travels as far as the clock does ──────────────────────────────────── */
test('R380 ③: the comparison panel’s time-travel floor is the kernel’s, not a copy', () => {
  const src = R('js/stats-compare.js');
  const m = /function _ttYear\(\)\{[^\n]*/.exec(src);
  assert.ok(m, '_ttYear is gone or was reshaped');
  const fn = m[0];
  assert.ok(/T\.min/.test(fn), '_ttYear does not read the kernel floor — 1850-1899 silently reads as LIVE again');
  assert.equal((fn.match(/\b19\d\d\b/g) || []).length, 0, `_ttYear still carries a hard-coded 19xx floor: ${fn}`);
});

/* ── ④ Maddison's floor is inside the clock's reach, and is MEASURED rather than declared ─────── */
/* ⚠ (#R604) THE TWO ARE NO LONGER ONE NUMBER, BY DESIGN. #R380 could assert "exactly where the clock
   does" while both said 1850. The clock now reaches year 1 because the SUBDIVISIONS reach there
   (js/chronos.js), and js/chronos.js's own contract has always been that each subsystem reaches as
   far back as ITS OWN SOURCE does and says where it stops — the kernel never clamps every reader to
   the shortest of them. Maddison stops at 1850 because Maddison stops at 1850. What must still hold,
   and is what this check was really defending, is that nothing DECLARES a floor the shipped file does
   not have. */
test('R380 ④: the shipped Maddison file starts inside the clock’s reach, and js/history.js measures it', () => {
  const mad = JSON.parse(readFileSync(join(ROOT, 'data', 'maddison.json'), 'utf8'));
  let lo = Infinity, hi = -Infinity, rows = 0;
  for (const c of Object.keys(mad)) for (const y of Object.keys(mad[c])) { const n = +y; rows++; if (n < lo) lo = n; if (n > hi) hi = n; }
  assert.ok(rows > 15000 && Object.keys(mad).length === 168, `${rows} cells over ${Object.keys(mad).length} codes — the file is not the shipped one`);
  assert.ok(lo >= YMIN, `Maddison starts at ${lo}, before the clock's floor of ${YMIN} — unreachable data`);
  assert.equal(lo, 1850, 'the shipped Maddison file no longer starts at 1850 — every sentence that names its reach must move with it');
  /* and js/history.js MEASURES that floor rather than declaring it (its declared value is only the
     answer given before the file lands, so it must not be lower than the file's own start) */
  const hist = R('js/history.js');
  const decl = +/let _minY\s*=\s*(\d{1,4})\s*;/.exec(hist)[1];
  /* ⚠ (#R604) the declared value is the answer given BEFORE data/maddison.json lands, so what it owes
     is the FILE's floor, not the clock's — those were the same number until this round. Declaring the
     clock's floor here would claim GDP for year 1. */
  assert.equal(decl, lo, `js/history.js answers ${decl} before the file arrives, the file says ${lo}`);
  assert.ok(/for\s*\(const y of Object\.keys\(data\[c\]\)\)/.test(hist), 'the floor is no longer measured from the file');
});

/* ══ the former-state registry, RUN ══════════════════════════════════════════════════════════════
   js/history.js is a plain script that hangs factories off `window`. Loading it with a stub window is
   the difference between asking how the table is spelled and asking what a reader is shown. */
const HS = (() => {
  const win = { IntMapModules: {}, IntMapLang: { pickArgs: () => function () { return Array.prototype.slice.call(arguments); } } };
  new Function('window', R('js/history.js'))(win);
  return win.IntMapModules;
})();
const MODERN = ['AUT', 'HUN', 'CZE', 'SVK', 'SVN', 'HRV', 'BIH', 'KOR', 'PRK', 'JPN', 'TWN', 'IND', 'PAK', 'BGD',
  'TUR', 'SYR', 'LBN', 'IRQ', 'JOR', 'ISR', 'PSE', 'RUS', 'UKR', 'BLR', 'LTU', 'LVA', 'EST', 'MDA', 'GEO', 'ARM',
  'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK', 'FIN', 'POL', 'DEU', 'FRA', 'GBR', 'ITA', 'ESP',
  'CHN', 'PRT', 'BRA', 'IRN', 'THA', 'IDN', 'ETH', 'EGY', 'HUN'];
const fresh = () => { const s = {}; MODERN.forEach((c) => { s[c] = { pop: 1e6, gdp: 1, area: 1, nameEn: c, nameJp: c, sov: true }; }); return s; };

/* ── ⑤ no country is listed before it existed, for any year the clock can reach ────────────────── */
test('R380 ⑤: the states that hide their modern successors cover the whole window they lived in', () => {
  const CASES = [
    /* year, the state the reader should see, and successors that must NOT be listed beside it */
    [1850, 'AUE', ['AUT', 'HUN', 'CZE', 'SVK', 'SVN', 'HRV', 'BIH']],
    [1860, 'AUE', ['AUT', 'HUN', 'CZE', 'SVK', 'SVN', 'HRV', 'BIH']],
    [1866, 'AUE', ['AUT', 'HUN', 'CZE', 'SVK', 'SVN', 'HRV', 'BIH']],
    [1875, 'AUH', ['AUT', 'HUN', 'CZE', 'SVK', 'SVN', 'HRV', 'BIH']],
    [1850, 'KOJ', ['KOR', 'PRK']],
    [1875, 'KOJ', ['KOR', 'PRK']],
    [1899, 'KOE', ['KOR', 'PRK']],
    [1905, 'KOE', ['KOR', 'PRK']],
    [1920, 'JEM', ['KOR', 'PRK']],
    [1855, 'EIC', ['IND', 'PAK', 'BGD']],
    [1875, 'OTT', ['TUR', 'SYR', 'LBN', 'IRQ', 'JOR', 'ISR', 'PSE']],
    [1875, 'RUE', ['RUS', 'UKR', 'FIN', 'POL']],
  ];
  for (const [year, code, succ] of CASES) {
    const stats = fresh();
    const H = HS.histStates(stats);
    H.apply(new Date(Date.UTC(year, 6, 1)));
    assert.ok(stats[code], `${year}: ${code} is not in the list — the reader sees its successors instead`);
    for (const c of succ) assert.ok(stats[c] && stats[c]._histHidden, `${year}: ${c} is still listed as a sovereign country beside ${code}`);
  }
});

/* ── ⑥ the chains have no seam: an empire's last day is the day before its successor's first ────── */
test('R380 ⑥: nothing falls through the gap between one state and the next', () => {
  const H = HS.histStates(fresh());
  const by = Object.fromEntries(H.STATES.map((S) => [S.code, S]));
  const DAY = 86400000;
  for (const [a, b] of [['AUE', 'AUH'], ['KOJ', 'KOE'], ['KOE', 'JEM'], ['EIC', 'RAJ']]) {
    assert.ok(by[a] && by[b], `${a}→${b}: one of them is missing from the registry`);
    const end = Date.parse(by[a].to + 'T00:00:00Z'), start = Date.parse(by[b].from + 'T00:00:00Z');
    assert.equal(start - end, DAY, `${a} ends ${by[a].to} and ${b} begins ${by[b].from} — that is not the next day`);
  }
  /* …and no two states that are alive at the same instant claim the same successor, which is what a
     copy-pasted row would do and what would make one of them silently win the countryStats slot */
  for (let y = YMIN; y <= 2020; y++) {
    const act = H.activeAt(new Date(Date.UTC(y, 6, 1)));
    const owner = new Map();
    for (const S of act) for (const c of S.succ) {
      assert.ok(!owner.has(c), `${y}: ${c} is claimed by both ${owner.get(c)} and ${S.code}`);
      owner.set(c, S.code);
    }
  }
});

/* ── ⑦ the map popup and the country list agree about who was there ───────────────────────────── */
test('R380 ⑦: the era→article table and the former-state registry name the same polity', () => {
  const tb = R('js/time-borders.js');
  const tbl = tb.slice(tb.indexOf('const _ERA_WIKI'), tb.indexOf('};', tb.indexOf('const _ERA_WIKI')));
  const spanAt = (code, year) => {
    const m = new RegExp(code + ':\\[(\\[[^\\]]*\\](?:,\\[[^\\]]*\\])*)\\]').exec(tbl);
    if (!m) return null;
    for (const s of m[1].matchAll(/\[(\d{4}),(\d{4}),'([^']+)'\]/g)) if (year >= +s[1] && year <= +s[2]) return s[3];
    return null;
  };
  const H = HS.histStates(fresh());
  const wikiAt = (year, want) => H.activeAt(new Date(Date.UTC(year, 6, 1))).find((S) => S.wiki === want);
  /* 1860: the popup already said «Austrian Empire» while the list showed seven modern countries */
  assert.equal(spanAt('AUT', 1860), 'Austrian_Empire');
  assert.equal(spanAt('HUN', 1860), 'Austrian_Empire');
  assert.ok(wikiAt(1860, 'Austrian Empire'), 'the era table says Austrian Empire in 1860 and the registry does not have one alive');
  assert.equal(spanAt('AUT', 1875), 'Austria-Hungary');
  assert.ok(wikiAt(1875, 'Austria-Hungary'), 'the two disagree about 1875');
  /* 1875: «Joseon» on the map, and one Joseon row rather than a Joseon and a North Korea */
  assert.equal(spanAt('KOR', 1875), 'Joseon');
  assert.ok(wikiAt(1875, 'Joseon'), 'the era table says Joseon in 1875 and the registry does not have one alive');
  assert.equal(spanAt('KOR', 1905), 'Korean_Empire');
  assert.ok(wikiAt(1905, 'Korean Empire'), 'the two disagree about 1905');
});

/* ── ⑨ the rename must not erase the row it renames ────────────────────────────────────────────
   #R245 turned these names into TUPLES. Both writers into countryStats went on reading `name.en` /
   `name.jp`, which on an array is undefined, and js/countries-ui.js keeps a row only `if (s.nameEn…)`.
   The whole time-travel identity feature was therefore invisible in the Countries tab: travelling
   DELETED France, the UK, China, Portugal, Brazil, Persia, Siam, the Dutch East Indies and Ethiopia
   from the list, together with every former state. This asks the shipped code, not the spelling. */
test('R380 ⑨: travelling renames the countries in the list instead of emptying their names', () => {
  const stats = fresh();
  const H = HS.histStates(stats), I = HS.histId(stats);
  const AUH = H.STATES.find((S) => S.code === 'AUH');
  const a = H.agg(AUH, 1875);
  assert.equal(a.nameEn, 'Austria-Hungary', 'the former state has no English name — renderStats drops the row');
  assert.equal(a.nameJp, 'オーストリア＝ハンガリー帝国', 'the former state has no Japanese name');
  assert.ok(Array.isArray(a.name), 'the tuple itself must still travel on `name` — the map labels resolve it per language');
  I.apply(new Date(Date.UTC(1860, 6, 1)));
  for (const [code, want] of [['FRA', 'Second French Empire'], ['CHN', 'Qing Empire'], ['GBR', 'United Kingdom of Great Britain and Ireland']]) {
    assert.equal(stats[code].nameEn, want, `${code} lost its name when the clock travelled`);
    assert.ok(stats[code].nameJp, `${code} lost its Japanese name when the clock travelled`);
  }
  I.clear();
  assert.equal(stats.FRA.nameEn, 'FRA', 'clear() did not put the modern name back');
  /* the two writers must read the tuple through ONE helper, or they drift apart again.
     ⚠ READ THE CODE, NOT THE FILE. The note above this test explains the defect by quoting the two
     expressions it hunts for, so a naive scan finds its own prose and goes red on a clean tree —
     which is what happened the first time this was written. #R345 built `codeOnly` for exactly this. */
  const src = codeOnly(R('js/history.js'));
  assert.ok(/window\.IntMapHistName\s*=\s*function/.test(src), 'the shared tuple reader is gone');
  assert.ok((src.match(/IntMapHistName\(/g) || []).length >= 4, 'one of the two writers stopped going through it — they can disagree again');
  /* ⚠ (#R429) AND THE SCAN IS THE WHOLE REACH, NOT THE ONE FILE THIS ROUND HAPPENED TO FIX. Written
     as codeOnly(R('js/history.js')) the negative below could only ever see the two writers it was aimed
     at, so js/stats-compare.js `_histMini` — which builds the SAME {code,nameEn,nameJp,flag} record out
     of a raw STATES row, and is the label the comparison panel falls back to whenever countryStats is
     not carrying the state (back at Now, at a year it does not span, on a restored session) — went on
     reading `S.name.en` and rendered the literal 「—」 for all nineteen states in five places, for
     forty-nine rounds, with this test green the whole time. Every file that can reach a STATES row is
     scanned now, and any file that BUILDS the record must go through the shared reader. The behaviour
     the defect broke is asserted in tests/r429-checks.test.mjs. */
  const HOLDERS = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)
    .filter((f) => /IntMapHistStates|\bhistStates\b/.test(codeOnly(R(f))));
  assert.ok(HOLDERS.length >= 5, `only ${HOLDERS.length} files reach the STATES rows — the scan stopped reaching`);
  for (const f of ['js/history.js', 'js/stats-compare.js']) {
    assert.ok(HOLDERS.includes(f), `${f} no longer reaches the STATES rows — the scan lost a file that BUILDS the record`);
  }
  for (const f of HOLDERS) {
    const one = codeOnly(R(f));
    assert.deepEqual(one.match(/\bname\.(?:en|jp)\b/g) || [], [], `${f} reads a former state's name tuple as an object again`);
    if (/\bnameEn\s*:/.test(one)) {
      assert.ok(/IntMapHistName\s*\(/.test(one), `${f} builds a {nameEn,nameJp} record from a STATES row without the shared reader`);
    }
  }
});

/* ── ⑧ the Sources page says what the code does below CShapes ─────────────────────────────────── */
test('R380 ⑧: the Sources page says the snapshots are the ONLY border source below 1886', () => {
  const LANGS = ['en', 'ja', 'de', 'es', 'fr', 'ru', 'ko', 'zh-hans', 'zh-hant'];
  /* the two numbers the code actually behaves by: CShapes' floor, and the single frame every year
     between the clock's floor and it resolves to (js/time-borders.js YEARS + nearest()) */
  const tb = R('js/time-borders.js');
  assert.ok(/const CS_MIN\s*=\s*1886\s*,/.test(tb), 'CShapes no longer starts at 1886 — the Sources page says it does');
  /* ⚠ (#R604) THE LIST IS NOT PINNED ANY MORE — IT IS READ, AND THE PAGE IS CHECKED AGAINST WHAT IT
     SAYS. The snapshots went from 12 to the 36 the upstream repo publishes (js/time-borders.js), so a
     regex naming two of them would have to be edited by every round that adds one, which is the same
     as asserting nothing. What the Sources page owes the reader is the SHAPE of the series and its
     two ends, and those are derived here. */
  /* ══ ⚠⚠⚠ (#R679) THIS READ THE FALLBACK LIST AND THEREFORE CHECKED NOTHING ═══════════════════
     `js/time-borders.js`'s `YEARS` is the list of file names the REMOTE path can still ask for, and
     it starts at 100 because upstream names those files with a plain decimal year. The reach is the
     era record's — data/hist-eras.js, 53 snapshots, seventeen of them before the common era, oldest
     −122999. So `OLDEST` was «100», and `entry.includes('100')` matched the prose 「100 年刻み」 /
     «hundred-year steps» in every language: the one assertion meant to prove the page states how
     far back the series goes passed UNCONDITIONALLY, and went on passing on the very round that
     took that end 123,000 years deeper. #R488/#R628's shape — a check measuring a spelling that had
     drifted off the fact it was written for.
     ⚠ It is derived from the shipped record now, and it is the number a READER sees (the era
     magnitude, 123000), not the astronomical one (−122999): a page printing «-122999» would be
     naming a year nobody writes (js/hist-scale.js `era`). */
  const HB_FLOOR = (() => { const w = {}; new Function('window', R('data/hist-borders.js'))(w); return w.__HISTB.window[0]; })();
  const ERA = eraBundle().snaps.map((x) => x.y).sort((a, b) => a - b);
  assert.ok(ERA.length >= 53 && ERA[0] < 1, `the era record lost its deep end: ${ERA[0]}`);
  const OLDEST = String(ERA[0] <= 0 ? 1 - ERA[0] : ERA[0]);
  for (const lg of LANGS) {
    const src = R('js/locales/pages.' + lg + '.js');
    const i = src.indexOf('historical-basemaps (aourednik)');
    assert.ok(i > 0, `pages.${lg}.js has no historical-basemaps entry`);
    const entry = src.slice(i, src.indexOf('\n', i));
    assert.ok(entry.includes('1886'), `pages.${lg}.js does not say where CShapes stops`);
    assert.ok(entry.includes(OLDEST), `pages.${lg}.js does not say how far back the snapshots go (${OLDEST})`);
    /* ⚠ (#R679) «1815» IS GONE, AND ITS ABSENCE IS THE POINT. That assertion dates from when the
       series had two frames below 1850 and one of them answered most of that band. There are
       fifty-three now, seventeen before the common era, and naming any single frame on the Sources
       page would tell the reader the answer is a frame rather than a series. What the page owes is
       the two ends and the shape, which the three assertions around this one measure. */
    /* ⚠ (#R688) AND THIS ONE WAS THE SAME SHAPE ONE LINE LATER. «1850» was typed here, so the round
       that took the day-exact record down to 1689 would have failed this check for telling the
       reader the truth — the #R530 form, a check that pins a fact and therefore keeps it. The floor
       is the bundle's own `window[0]`, derived at build time, so it is read from there. */
    assert.ok(entry.includes(String(HB_FLOOR)),
      `pages.${lg}.js does not say where the day-exact record starts (${HB_FLOOR})`);
  }
});
