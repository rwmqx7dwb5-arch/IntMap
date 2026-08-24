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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const YMIN = +/const YMIN\s*=\s*(\d{4})\s*;/.exec(R('js/chronos.js'))[1];

/* ── ① the reach is one number, and no shipped sentence names a different one ─────────────────── */
test('R380 ①: every place that TELLS a reader how far the clock reaches names the kernel’s floor', () => {
  assert.equal(YMIN, 1850, 'the kernel floor moved — this file and js/chronos.js must move together');
  const files = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'))
    .map((f) => 'js/' + f)
    .concat(readdirSync(join(ROOT, 'js', 'locales')).filter((f) => f.endsWith('.js')).map((f) => 'js/locales/' + f));
  /* the shapes a reach-claim takes in this codebase, in every language it is written in */
  const CLAIM = /(?:reaches back to|travel back to|travel|deep time,|remonte jusqu'à|回溯到|回溯至|走到现在|走到現在|zurück bis|Chronos \()\s*(\d{4})|(\d{4})\s*(?:→now|→heute|→сейчас|→ahora|年まで遡|년까지)/g;
  const bad = [], seen = [];
  for (const f of files) {
    const src = R(f);
    for (const m of src.matchAll(CLAIM)) {
      const y = +(m[1] || m[2]);
      if (!Number.isFinite(y) || y < 1500 || y > 2100) continue;
      seen.push(f + ':' + y);
      if (y !== YMIN) bad.push(f + ' → ' + y + '  «' + src.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ') + '»');
    }
  }
  /* the positive half: the scan must actually be finding the claims, or the negative proves nothing */
  assert.ok(seen.length >= 8, `the scan found only ${seen.length} reach-claims — it is not reaching the files`);
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

/* ── ④ Maddison's floor and the clock's floor are the same number, measured ───────────────────── */
test('R380 ④: the shipped Maddison file starts exactly where the clock does', () => {
  const mad = JSON.parse(readFileSync(join(ROOT, 'data', 'maddison.json'), 'utf8'));
  let lo = Infinity, hi = -Infinity, rows = 0;
  for (const c of Object.keys(mad)) for (const y of Object.keys(mad[c])) { const n = +y; rows++; if (n < lo) lo = n; if (n > hi) hi = n; }
  assert.ok(rows > 15000 && Object.keys(mad).length === 168, `${rows} cells over ${Object.keys(mad).length} codes — the file is not the shipped one`);
  assert.equal(lo, YMIN, `Maddison starts at ${lo} while the clock starts at ${YMIN}`);
  /* and js/history.js MEASURES that floor rather than declaring it (its declared value is only the
     answer given before the file lands, so it must not be lower than the file's own start) */
  const hist = R('js/history.js');
  const decl = +/let _minY\s*=\s*(\d{4})\s*;/.exec(hist)[1];
  assert.equal(decl, YMIN, `js/history.js answers ${decl} before the file arrives, the file says ${lo}`);
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
  assert.ok(/const YEARS=\[1815,1880,1900,/.test(tb), 'the snapshot list changed — the Sources page names 1815 and 1880');
  for (const lg of LANGS) {
    const src = R('js/locales/pages.' + lg + '.js');
    const i = src.indexOf('historical-basemaps (aourednik)');
    assert.ok(i > 0, `pages.${lg}.js has no historical-basemaps entry`);
    const entry = src.slice(i, src.indexOf('\n', i));
    assert.ok(entry.includes('1886'), `pages.${lg}.js does not say where CShapes stops`);
    assert.ok(entry.includes('1880') && entry.includes('1815'), `pages.${lg}.js does not name the two frames`);
    assert.ok(entry.includes('1850'), `pages.${lg}.js does not say which years are drawn with the 1880 frame`);
  }
});
