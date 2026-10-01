/* ============================================================================
 *  IntMap · the Countries list under time travel — the former-state registry, the era identities,
 *  the Maddison floor, and the overlay that applies them  (js/history.js · js/time-countries.js)
 *  (consolidated from tests/r349 ③, r380 ④–⑨, r393, r410 and r425; each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  #R380 audited the reach to 1850 that #R349 opened and found the sweep half-applied — among it,
 *  Austria-Hungary and Korea listing their modern successors as sovereign countries for the whole of
 *  the newly reachable window. #R393: a row created AFTER the clock has travelled kept its present-day
 *  figures (Singapore $501B under 1860). #R410: the map's era label and the Countries list answered
 *  the same clock out of step — «Nazi Germany» at 1916 beside «German Empire». #R425: a former state
 *  hid its successors for its WHOLE lifespan — the Baltic states vanished from the list in 1938 while
 *  the map drew them.
 *
 *  ⚠ js/history.js exports its factories (module-graph); it is IMPORTED and RUN here with a stub language
 *  registry, which is the difference between asking how a table is spelled and asking what a reader is
 *  shown. js/time-countries.js is imported and run with a stub clock at its chronos.js import edge.
 *  ⚠ Where a check still reads source it says why: js/time-borders.js `tagSame` and its identity
 *  listener live inside the border layer's closure and write into a live renderer; js/countries-ui.js
 *  is the Countries tab's DOM.
 *  ⚠ Files are read through `readLF` (#R283/#R317: CRLF in the working copy, LF in the index), and
 *  scans of source go through `codeOnly()` (#R345: a scan of raw text answers «yes» to its own prose).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { clockFloor } from './helpers/hist-scale.mjs';
import { importModule } from './helpers/import-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const YMIN = clockFloor();
const DAY = 86400000;

/* js/history.js, imported with a stub language registry (#R380 ⑤ built this stub; #R410 and #R425 reused it).
   (module-graph) the factories are the module's exports and the stub is handed at its import edge —
   pickArgs() hands back the tuple itself, which is what the checks below read names out of. */
const LANG_STUB = { 'js/lang-registry.js': { IntMapLang: { pickArgs: () => function () { return Array.prototype.slice.call(arguments); } } } };
const MODULES = await importModule('js/history.js', { mocks: LANG_STUB });
const HS = MODULES;
const MOD = MODULES;

/* the Maddison module of js/history.js, whose `fetch` serves `file` — so the floor it answers before
   and after the file lands is ASKED, not read out of a declaration. (module-graph) the exported factory;
   `fetch` is the browser's global, read when load() is called, so it is lent for exactly that call. */
function maddison(file) {
  const M = MODULES.maddison();
  const load = M.load;
  M.load = () => {
    const prev = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => file });
    try { return load(); } finally { globalThis.fetch = prev; }
  };
  return M;
}

/* ══ the Maddison floor ═════════════════════════════════════════════════════════════════════ */

/* ── (#R349 ③) the historical series was extended, not rewritten ─────────────────────────────── */
test('R349 ③: Maddison reaches 1850 and every cell is a real pair', async () => {
  const j = JSON.parse(readFileSync(join(ROOT, 'data', 'maddison.json'), 'utf8'));
  const codes = Object.keys(j);
  assert.equal(codes.length, 168, 'the same 168 entities as before');
  let lo = Infinity, hi = -Infinity, pre = 0;
  for (const c of codes) {
    for (const y of Object.keys(j[c])) {
      const n = +y;
      assert.ok(Number.isInteger(n) && n >= 1850 && n <= 2018, `${c} ${y} is out of range`);
      const v = j[c][y];
      assert.ok(Array.isArray(v) && v.length === 2, `${c} ${y} is not a [gdppc, pop] pair`);
      assert.ok(v[0] != null || v[1] != null, `${c} ${y} is an empty pair — an absent year is absent, not null`);
      if (n < lo) lo = n; if (n > hi) hi = n;
      if (n < 1900) pre++;
    }
  }
  assert.equal(lo, 1850, 'the series starts at the clock floor');
  assert.equal(hi, 2018, 'and still ends where MPD2020 does');
  assert.ok(pre > 1500, `only ${pre} pre-1900 cells — the extension did not happen`);
  /* js/history.js must MEASURE that floor rather than declare one beside it. EVALUATED (was: a regex
     for `get minYear(){ return _minY; }` and the absence of `minYear:1900`): the module is handed a
     file whose smallest year is not the shipped one, and minYear must follow the FILE. */
  const M = maddison({ AAA: { 1873: [1, 1], 1990: [2, 2] } });
  await M.load();
  assert.equal(M.minYear, 1873, 'minYear is derived from the loaded file');
  const shipped = maddison(j);
  await shipped.load();
  assert.equal(shipped.minYear, lo, 'the old literal floor is gone — minYear does not answer the shipped file’s floor');
});

/* ── (#R380 ④) Maddison's floor is inside the clock's reach, and is MEASURED rather than declared ─
   ⚠ (#R604) THE TWO ARE NO LONGER ONE NUMBER, BY DESIGN: the clock reaches below 1850 because the
   SUBDIVISIONS reach there, and each subsystem reaches as far back as ITS OWN SOURCE does. What must
   still hold is that nothing DECLARES a floor the shipped file does not have. */
test('R380 ④: the shipped Maddison file starts inside the clock’s reach, and js/history.js measures it', async () => {
  const mad = JSON.parse(readFileSync(join(ROOT, 'data', 'maddison.json'), 'utf8'));
  let lo = Infinity, hi = -Infinity, rows = 0;
  for (const c of Object.keys(mad)) for (const y of Object.keys(mad[c])) { const n = +y; rows++; if (n < lo) lo = n; if (n > hi) hi = n; }
  assert.ok(rows > 15000 && Object.keys(mad).length === 168, `${rows} cells over ${Object.keys(mad).length} codes — the file is not the shipped one`);
  assert.ok(lo >= YMIN, `Maddison starts at ${lo}, before the clock's floor of ${YMIN} — unreachable data`);
  assert.equal(lo, 1850, 'the shipped Maddison file no longer starts at 1850 — every sentence that names its reach must move with it');
  /* EVALUATED (was: the literal of `let _minY=` and a regex for the measuring loop). The answer given
     BEFORE data/maddison.json lands is the FILE's floor, not the clock's — declaring the clock's
     floor here would claim GDP for year 1 — and once the file lands the floor is measured from it. */
  const M = maddison(mad);
  assert.equal(M.minYear, lo, `js/history.js answers ${M.minYear} before the file arrives, the file says ${lo}`);
  const other = maddison({ AAA: { 1901: [1, 1] } });
  await other.load();
  assert.equal(other.minYear, 1901, 'the floor is no longer measured from the file');
});

/* ══ the former-state registry, RUN ════════════════════════════════════════════════════════ */
const MODERN = ['AUT', 'HUN', 'CZE', 'SVK', 'SVN', 'HRV', 'BIH', 'KOR', 'PRK', 'JPN', 'TWN', 'IND', 'PAK', 'BGD',
  'TUR', 'SYR', 'LBN', 'IRQ', 'JOR', 'ISR', 'PSE', 'RUS', 'UKR', 'BLR', 'LTU', 'LVA', 'EST', 'MDA', 'GEO', 'ARM',
  'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK', 'FIN', 'POL', 'DEU', 'FRA', 'GBR', 'ITA', 'ESP',
  'CHN', 'PRT', 'BRA', 'IRN', 'THA', 'IDN', 'ETH', 'EGY', 'HUN'];
const fresh380 = () => { const s = {}; MODERN.forEach((c) => { s[c] = { pop: 1e6, gdp: 1, area: 1, nameEn: c, nameJp: c, sov: true }; }); return s; };

/* ── (#R380 ⑤) no country is listed before it existed, for any year the clock can reach ────────── */
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
    const stats = fresh380();
    const H = HS.histStates(stats);
    H.apply(new Date(Date.UTC(year, 6, 1)));
    assert.ok(stats[code], `${year}: ${code} is not in the list — the reader sees its successors instead`);
    for (const c of succ) assert.ok(stats[c] && stats[c]._histHidden, `${year}: ${c} is still listed as a sovereign country beside ${code}`);
  }
});

/* ── (#R380 ⑥) the chains have no seam: an empire's last day is the day before its successor's first */
test('R380 ⑥: nothing falls through the gap between one state and the next', () => {
  const H = HS.histStates(fresh380());
  const by = Object.fromEntries(H.STATES.map((S) => [S.code, S]));
  for (const [a, b] of [['AUE', 'AUH'], ['KOJ', 'KOE'], ['KOE', 'JEM'], ['EIC', 'RAJ']]) {
    assert.ok(by[a] && by[b], `${a}→${b}: one of them is missing from the registry`);
    const end = Date.parse(by[a].to + 'T00:00:00Z'), start = Date.parse(by[b].from + 'T00:00:00Z');
    assert.equal(start - end, DAY, `${a} ends ${by[a].to} and ${b} begins ${by[b].from} — that is not the next day`);
  }
  /* …and no two states alive at the same instant claim the same successor, which is what a
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

/* ── (#R380 ⑦) the map popup and the country list agree about who was there ──────────────────── */
/* ⚠ The era→article table `_ERA_WIKI` is a literal inside js/time-borders.js's closure; it is parsed
   out of the source and set against the registry, which is RUN. */
test('R380 ⑦: the era→article table and the former-state registry name the same polity', () => {
  const tb = R('js/time-borders.js');
  const tbl = tb.slice(tb.indexOf('const _ERA_WIKI'), tb.indexOf('};', tb.indexOf('const _ERA_WIKI')));
  const spanAt = (code, year) => {
    const m = new RegExp(code + ':\\[(\\[[^\\]]*\\](?:,\\[[^\\]]*\\])*)\\]').exec(tbl);
    if (!m) return null;
    for (const s of m[1].matchAll(/\[(\d{4}),(\d{4}),'([^']+)'\]/g)) if (year >= +s[1] && year <= +s[2]) return s[3];
    return null;
  };
  const H = HS.histStates(fresh380());
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

/* ── (#R380 ⑨) the rename must not erase the row it renames ──────────────────────────────────────
   #R245 turned these names into TUPLES. Both writers into countryStats went on reading `name.en` /
   `name.jp`, which on an array is undefined, and js/countries-ui.js keeps a row only `if (s.nameEn…)`
   — travelling DELETED France, the UK, China, Portugal, Brazil, Persia, Siam, the Dutch East Indies
   and Ethiopia from the list, together with every former state. */
test('R380 ⑨: travelling renames the countries in the list instead of emptying their names', () => {
  const stats = fresh380();
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
     ⚠ SPELLING, ON PURPOSE, FOR THE REACH: «every file that builds a {nameEn,nameJp} record from a
     STATES row goes through the shared reader» is a claim over every holder — including
     js/stats-compare.js `_histMini`, a DOM panel, which rendered 「—」 for all nineteen states for
     forty-nine rounds while the one-file version of this scan was green (#R429). The behaviour it
     broke is asserted by tests/r429-checks. */
  const src = codeOnly(R('js/history.js'));
  assert.ok(/window\.IntMapHistName\s*=\s*function/.test(src), 'the shared tuple reader is gone');
  assert.ok((src.match(/IntMapHistName\(/g) || []).length >= 4, 'one of the two writers stopped going through it — they can disagree again');
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

/* ══ #R410 — 歴史地図の国名は、その年のものでなければならない ══════════════════════════════════
   #R409 の実測: 1939 → 1916 と戻すと地図のラベルは «Nazi Germany» のままで、同じ画面の Countries 一覧は
   «German Empire» と出ていた。同じ時計に二つのリスナーが答えていて、歩調が合っていない: js/time-borders.js
   は 45 ms 後に描き、js/time-countries.js は 340 ms 待ってから `countryStats` をその年の名前に改名する。
   ラベルは「改名されたか（`s._histId`）」を読んでいたので、常に一手前の年を描いた。
   画面に出た文字そのものは tests/r410.spec.js（門）と tests/r410-late.spec.js（deep）がブラウザで測る。 */

/* ── ① the tables the labels now read ANSWER THE YEAR ─────────────────────────────────────────── */
test('R410 ①: IntMapHistId.at() and IntMapHistStates.activeAt() are functions of the year alone', () => {
  const HID = MOD.histId({});
  /* the three the report named, plus the two the fix's own measurement caught */
  assert.equal(HID.at('DEU', 1916).name[0], 'German Empire');
  assert.equal(HID.at('DEU', 1939).name[0], 'Nazi Germany', 'the year that was being shown at 1916');
  assert.equal(HID.at('FRA', 1916).name[0], 'French Third Republic');
  assert.equal(HID.at('ITA', 1916).name[0], 'Kingdom of Italy');
  assert.equal(HID.at('GBR', 1916).name[0], 'United Kingdom of Great Britain and Ireland',
    'the 1939 table has no GBR entry, which is how «United Kingdom» survived the move back');
  assert.equal(HID.at('ESP', 1916), null, 'Spain had no era identity in 1916 — «Spanish Republic» began in 1931');
  assert.equal(HID.at('ESP', 1939).name[0], 'Spanish Republic');

  /* the former state whose polygon still carries a successor's modern name */
  const H = MOD.histStates({});
  const at1916 = H.activeAt('1916-07-01T00:00:00Z').map((S) => S.code);
  assert.ok(at1916.includes('RUE'), `1916 should be the Russian Empire, got ${at1916.join(',')}`);
  assert.ok(at1916.includes('JEM'), 'and the Empire of Japan');
  assert.ok(H.hbRe('RUE').test('Russia'), 'the polygon named «Russia» is what RUE has to be found by');
  assert.ok(!H.hbRe('RUE').test('Germany'), 'and it must not answer for anything else');
  assert.ok(!H.activeAt('1950-07-01T00:00:00Z').map((S) => S.code).includes('RUE'), 'the empire ended in 1917');
});

const TB = codeOnly(R('js/time-borders.js'));
const TC = codeOnly(R('js/time-countries.js'));

/* ── ② every identity the list can rename is one the MAP can rename ───────────────────────────── */
/* ⚠ `ID` (js/history.js) and `MODNM` (js/time-borders.js) are both literals inside closures; their
   KEY SETS are compared, taken from the shipped files by matching braces (not a hand list). */
test('R410 ②: the label table covers every code IntMapHistId carries', () => {
  const src = codeOnly(R('js/history.js'));
  const i = src.indexOf('const ID={');
  assert.ok(i > 0, 'the identity table moved — this check cannot see it any more');
  let depth = 0, end = -1;
  for (let p = src.indexOf('{', i); p < src.length; p++) {
    if (src[p] === '{') depth++;
    else if (src[p] === '}') { depth--; if (!depth) { end = p; break; } }
  }
  assert.ok(end > i, 'unbalanced braces while reading the identity table');
  const idCodes = [...src.slice(i, end).matchAll(/\b([A-Z]{3}):\s*\[\s*\{\s*from:/g)].map((m) => m[1]);
  assert.ok(idCodes.length >= 15, `only ${idCodes.length} identities found — the scan stopped seeing the table`);

  const mm = /const MODNM=\{([^}]*)\}/.exec(TB);
  assert.ok(mm, 'the map-side name table is gone');
  const modCodes = [...mm[1].matchAll(/\b([A-Z]{3}):\s*\[/g)].map((m) => m[1]);
  assert.ok(modCodes.length >= 15, `only ${modCodes.length} codes in MODNM`);
  const missing = idCodes.filter((c) => !modCodes.includes(c));
  assert.deepEqual(missing, [], `renamed by the Countries list and NOT by the map: ${missing.join(', ')}`);
});

/* ── ③ the era name is chosen by the YEAR, not by the rename standing in countryStats ──────────── */
/* ⚠ SPELLING, ON PURPOSE: `tagSame` and `go()` are internals of the border layer's closure that
   write into a live renderer; the drawn text is measured in a browser by tests/r410.spec.js. */
test('R410 ③: tagSame is given the year and asks the table for it', () => {
  assert.ok(/function tagSame\(fc\s*,\s*year\)/.test(TB), 'tagSame no longer takes the year it is drawing');
  assert.ok(/tagSame\(fc\s*,\s*shownYear\)/.test(TB), 'apply() stopped handing it the year');
  assert.ok(/HID\.at\(code\s*,\s*_y\)/.test(TB), 'the era identity is not looked up by year any more');
  assert.deepEqual(TB.match(/_histId/g) || [], [],
    'the label is gated on the rename again — that is the defect, one listener reading another’s output');
  /* ⚠ (#R421) the claim is that `shownYear` is assigned in go()'s preamble, BEFORE the first branch,
     so no early return can leave it stale — not the spelling of the parameter. */
  const goAt = TB.indexOf('async function go(');
  assert.ok(goAt > 0, 'go() is gone from js/time-borders.js');
  const goPreamble = TB.slice(goAt, TB.indexOf('if(', goAt));
  assert.ok(/shownYear=year;/.test(goPreamble),
    'shownYear is not assigned in go()’s preamble, before the first branch');
});

/* ── ③b the former-state correspondence table the CLICK path has always used reaches the LABELS ── */
test('R410 ③b: a former state is matched to its polygon, and is asked before the plain name lookup', () => {
  /* ⚠ `HS.hbRe(` ALONE IS NOT THE CLAIM — `_eraLocName` has called it since #R129, so a check for the
     spelling stayed green through a mutation that dropped hbRe from the label path entirely. The
     claim is the collection this round built and the order it is read in.
     ⚠ SPELLING, ON PURPOSE: that order is internal to `tagSame` (see ③). */
  assert.ok(/const _former=\[\];/.test(TB), 'the active former states are not collected any more');
  assert.ok(/re=HS\.hbRe\(S\.code\);/.test(TB) && /_former\.push\(\[re,/.test(TB),
    'the collection no longer takes the polygon-name pattern from js/history.js');
  const a = TB.indexOf('function tagSame('), b = TB.indexOf('function apply(', a);
  assert.ok(a > 0 && b > a, 'tagSame cannot be read');
  const body = TB.slice(a, b);
  const iFormer = body.indexOf('for(const p of _former)');
  const iCur = body.indexOf('cur.get(');
  assert.ok(iFormer >= 0, 'the labels stopped consulting the former states');
  assert.ok(iCur >= 0, 'the plain name lookup is gone');
  assert.ok(iFormer < iCur,
    'the name lookup runs first: countryStats still HOLDS the hidden «Russia» row, so it would answer «Russia» for the polygon the list calls the Russian Empire');
});

/* ══ js/time-countries.js, RUN (#R393 built this harness) ══════════════════════════════════════
   the present-day table the boot pass builds, and the one row the idle pass adds later */
const PRESENT = {
  USA: { code: 'USA', nameEn: 'United States', gdp: 27000, gdppc: 81000, pop: 335e6, area: 9834000, density: 34, lifeExp: 79, tfr: 1.6, internet: 92, milSpend: 916, hdi: 0.93 },
  JPN: { code: 'JPN', nameEn: 'Japan', gdp: 4200, gdppc: 33800, pop: 124e6, area: 377975, density: 328, lifeExp: 84, tfr: 1.3, internet: 83, milSpend: 50, hdi: 0.92 },
};
const LATE_SGP = { code: 'SGP', nameEn: 'Singapore', gdp: 501, gdppc: 84700, pop: 5.9e6, area: 719, density: 8200, lifeExp: 83, tfr: 1.0, internet: 96, milSpend: 13, hdi: 0.95 };

/* Maddison, as far as these tests need it: a 1860 row for the USA, nothing at all for Singapore —
   which is the real shape (Maddison's SGP series does not reach 1860). */
const madStub = (minYear = 1850) => ({
  ready: () => true, load: () => Promise.resolve({}), minYear, maxYear: 2018,
  has: (c, y) => (c === 'USA' || c === 'JPN') && y >= 1850,
  gdppc: (c, y) => (c === 'USA' && y === 1860 ? 3007 : null),
  popN: (c, y) => (c === 'USA' && y === 1860 ? 31.4e6 : null),
  gdpBil: (c, y) => (c === 'USA' && y === 1860 ? 94 : null),
});

/* ⚠ THE MODULE READS `window`, `fetch` and `document` AS GLOBALS, so they are lent for the length of
   one test and handed back in `restoreGlobals()` — every caller does so in a `finally`, so no other
   test in this file sees them. Options: `when` (a mutable instant the clock reports), `hist` (stub
   registries recording what they are asked to apply) and `minYear` (the Maddison floor). */
async function boot(opts = {}) {
  const countryStats = {};
  for (const k of Object.keys(PRESENT)) countryStats[k] = { ...PRESENT[k] };
  const subs = [], events = [];
  const clock = { when: opts.when || new Date(Date.UTC(1860, 6, 1)) };
  const win = {
    IntMapTime: {
      on: (f) => subs.push(f),
      when: () => new Date(clock.when),
      year: () => clock.when.getUTCFullYear(), isLive: () => false, min: 1850,
    },
    IntMapMaddison: madStub(opts.minYear),
    fetch: () => Promise.reject(new Error('offline')),
    document: { baseURI: 'https://example.invalid/' },
    dispatchEvent: (e) => { events.push(e.type); return true; },
  };
  if (opts.hist) { win.IntMapHistStates = opts.hist.states; win.IntMapHistId = opts.hist.id; }
  const prevWin = globalThis.window, prevFetch = globalThis.fetch, prevDoc = globalThis.document;
  globalThis.window = win;
  globalThis.fetch = win.fetch;
  globalThis.document = win.document;
  const HOST = { countryDataLoaded: true };
  const CTX = { countryStats, loadCountryData: () => Promise.resolve(), renderStats: () => {}, searchVal: () => '' };
  /* (module-graph) js/time-countries.js imports the clock; the stub is handed at that import edge, and a
     fresh evaluation per boot keeps one test's subscriptions out of the next */
  const { makeTimeCountries } = await importModule('js/time-countries.js', { mocks: { 'js/chronos.js': { IntMapTime: win.IntMapTime } } });
  makeTimeCountries(HOST, CTX);
  const api = win.IntMapTimeCountries;
  const restoreGlobals = () => { globalThis.window = prevWin; globalThis.fetch = prevFetch; globalThis.document = prevDoc; };
  return { countryStats, subs, api, win, clock, events, restoreGlobals };
}
const settle = async (ms) => { await new Promise((r) => setTimeout(r, ms)); };
/* stub registries: each records the instants it was asked to apply, and how often it was cleared */
const recorder = () => {
  const log = { states: [], id: [], cleared: 0 };
  return { log, states: { apply: (w) => log.states.push(+new Date(w)), clear: () => { log.cleared++; } },
    id: { apply: (w) => log.id.push(+new Date(w)), clear: () => {} } };
};

/* ── (#R410 ④) the moment the identities land is announced, and the labels are re-read ───────── */
test('R410 ④: both ends of the identity announcement exist', async () => {
  /* EVALUATED, the list's end (was: counts of the event name in js/time-countries.js and a regex for
     repaint()'s body). Every path that changes the identities in the table — the overlay, the return
     to Now, and a year below the Maddison floor where the modern names come BACK — must announce it,
     once per repaint. */
  const { subs, api, events, restoreGlobals } = await boot();
  try {
    const said = () => events.filter((t) => t === 'intmap-hist-identity').length;
    subs[0]({ year: 1860, isLive: false, when: new Date(Date.UTC(1860, 6, 1)) });
    await settle(700);
    assert.equal(api.year(), 1860, 'the overlay did not run');
    assert.equal(said(), 1, 'the overlay changed the identities and announced it ' + said() + ' time(s), not once');
    subs[0]({ year: 1820, isLive: false });
    await settle(700);
    assert.equal(said(), 2, 'going below the Maddison floor (the modern names come back) was not announced');
    subs[0]({ year: 1860, isLive: false });
    await settle(700);
    subs[0]({ year: 2026, isLive: true });
    await settle(700);
    assert.equal(api.year(), null, 'the return to Now did not restore the table');
    assert.equal(said(), 4, 'the return to Now was not announced');
  } finally { restoreGlobals(); }
  /* the map's end. ⚠ SPELLING, ON PURPOSE: the listener lives inside the border layer's closure and
     re-tags the snapshot a live renderer is holding (see ③). */
  assert.ok(/addEventListener\('intmap-hist-identity'/.test(TB), 'js/time-borders.js stopped listening');
  const h = /addEventListener\('intmap-hist-identity',\(\)=>\{[\s\S]*?\}\);/.exec(TB);
  assert.ok(h, 'the listener body cannot be read');
  assert.ok(/tagSame\(shownFC\s*,\s*shownYear\)/.test(h[0]), 'the listener does not re-tag the snapshot on screen');
  assert.ok(/setSourceData\('imtb-src'/.test(h[0]), 'the re-tag never reaches the renderer');
  assert.ok(/if\(sig\(\)===before\) return;/.test(h[0]),
    'the guard is gone: repaint() fires twice per travel and would push a few hundred kB back for nothing');
});

/* ── (#R410 ⑤) the map applies era identities over exactly the years the list does ───────────── */
test('R410 ⑤: both files read the same floor, so neither renames a year the other does not', async () => {
  /* EVALUATED, the list's half (was: a regex for the Maddison-derived floor in js/time-countries.js):
     the SAME year is overlaid or left alone according to what IntMapMaddison.minYear says. */
  for (const [minYear, want] of [[1850, 1860], [1870, null]]) {
    const { subs, api, restoreGlobals } = await boot({ minYear });
    try {
      subs[0]({ year: 1860, isLive: false });
      await settle(700);
      assert.equal(api.year(), want, `with a Maddison floor of ${minYear}, 1860 was ${api.year() == null ? 'not ' : ''}overlaid`
        + ' — js/time-countries.js no longer derives its floor from Maddison');
    } finally { restoreGlobals(); }
  }
  /* the map's half. ⚠ SPELLING, ON PURPOSE: the border layer's use of the floor is inside its closure. */
  const FLOOR = /\(window\.IntMapMaddison&&window\.IntMapMaddison\.minYear\)\|\|1900/g;
  assert.ok((TB.match(FLOOR) || []).length >= 1,
    'js/time-borders.js declares its own floor — below the list’s floor the map would name a polity the list has un-named');
});

/* ══ #R425 — a former state hides a successor only for the years it actually held it ══════════
   The Soviet Union's lifespan opens on 1922-12-30 — seventeen years before it annexed the Baltic
   states. MEASURED on production at 1938-06 and 1939-09: the era layer drew «Latvia», «Estonia» and
   «Lithuania» while the Countries list had no row for any of them.
   ⚠ NO CHECK BELOW NAMES A COUNTRY CODE. ① and ④ walk `STATES` and its `held` windows, so a state
   added later is covered without touching this file; ② re-derives both bounds from data/cshapes.js. */
const ALL_SUCC = [...new Set(MODULES.histStates({}).STATES.flatMap((S) => S.succ))];
const fresh425 = () => Object.fromEntries(ALL_SUCC.map((c) => [c, { pop: 1e6, gdp: 1, area: 1, nameEn: c, nameJp: c, sov: true }]));
const STATES = () => MODULES.histStates({}).STATES;
const at = (iso, off = 0) => new Date(Date.parse(iso + 'T12:00:00Z') + off * DAY);
const hiddenAt = (date) => { const stats = fresh425(); MODULES.histStates(stats).apply(date); return stats; };
const inLife = (S, d) => +d >= Date.parse(S.from + 'T00:00:00Z') && +d <= Date.parse(S.to + 'T23:59:59Z');

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
  /* ⚠ CShapes end dates are INCLUSIVE (#R421 `csFC`), so a window that opens on `from` is the
     complement of a span that ENDS THE DAY BEFORE, and one that closes on `to` the complement of a span
     that RESUMES THE DAY AFTER — or the map draws a country the list refuses to list for one day. */
  const shift = (d, days) => new Date(Date.parse(d + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
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

/* ── (#R425 ③) the era labels ask the same question the list answers ──────────────────────────
   js/time-borders.js `tagSame` builds `_cov` — «successors a former state covers this year». It read
   `S.succ` entire while the list hid a narrower set. ⚠ SPELLING, ON PURPOSE, for the two call sites
   inside the border layer's closure (see R410 ③); the function they must call is asked below. */
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

/* ── (#R425 ⑤) the list answers for the DAY on the clock, not for the year it happens to be in ─
   ④'s window opens on 1940-06-02 — in the middle of a year. js/time-countries.js returned early
   whenever the YEAR had not changed, so a move inside 1940 never re-applied the registries. MEASURED
   on the built bundle before the fix: 1940-03-01 → 1940-08-01 left all three in the list, while
   reaching the same 1940-08-01 from 1937 removed them. */
test('R425 ⑤: a move inside one year still re-applies the registries the day keys', async () => {
  /* EVALUATED (was: counts of `.apply(` in the source and regexes over the same-year branch). The
     overlay is run with stub registries that record the instants they are asked to apply. */
  const H = recorder();
  const MARCH = new Date(Date.UTC(1940, 2, 1, 12)), AUGUST = new Date(Date.UTC(1940, 7, 1, 12));
  const { subs, api, clock, events, restoreGlobals } = await boot({ when: MARCH, hist: H });
  try {
    subs[0]({ year: 1940, isLive: false });
    await settle(700);
    assert.equal(api.year(), 1940, 'the overlay did not run for 1940');
    assert.deepEqual([H.log.states.at(-1), H.log.id.at(-1)], [+MARCH, +MARCH], 'the two registries were not applied for the day on the clock');
    const nS = H.log.states.length, nI = H.log.id.length, said = events.length;
    /* the same year, a different DAY — the move #R425 measured */
    clock.when = AUGUST;
    subs[0]({ year: 1940, isLive: false });
    await settle(700);
    assert.equal(H.log.states.length, nS + 1, 'the overlay still returns outright when the year is unchanged, so a window that opens mid-year is never applied');
    assert.equal(H.log.id.length, nI + 1, 'the same-year branch re-applied one registry and not the other');
    assert.deepEqual([H.log.states.at(-1), H.log.id.at(-1)], [+AUGUST, +AUGUST], 'the same-year branch applied a stale instant');
    assert.ok(events.length > said, 'the same-year re-apply changed the identities without repainting');
    /* …and the same instant again is no move at all: nothing is re-applied */
    subs[0]({ year: 1940, isLive: false });
    await settle(700);
    assert.equal(H.log.states.length, nS + 1, 'the same-year branch does not compare the instant, so it cannot tell a same-year move from no move');
  } finally { restoreGlobals(); }
  /* and returning to Now must forget the instant, or the next same-year move compares to a stale one.
     ⚠ SPELLING, ON PURPOSE: restore() also clears the overlaid year, so no path observable from
     outside reaches the stale comparison today; this guards the invariant for the path that would. */
  const tc = codeOnly(R('js/time-countries.js'));
  const rest = tc.slice(tc.indexOf('function restore('), tc.indexOf('function fetchYear('));
  assert.match(rest, /curWhen=null/, 'restore() leaves the last instant behind, so the first move after returning to Now can be skipped');
});

/* ══ #R393 — a row that arrives AFTER the clock has travelled ══════════════════════════════════
   #R380's production verification found the Countries tab at 1860 reading «1 🇸🇬 Singapore $501B» —
   its figure for TODAY. The country table loads in two passes (js/countries-ui.js — the 110 m file at
   boot, the 10 m file when the browser goes idle), and the second pass CREATES rows 3–15 s after boot,
   after a travelled year has been overlaid. Below the World Bank's 1960 floor there is no second
   overlay pass, so the row stays present-day for ever. */
test('R393 ①: a country row created after the travel does not keep its present-day figures', async () => {
  const { countryStats, subs, api, restoreGlobals } = await boot();
  try {
    assert.equal(subs.length, 1, 'the module no longer subscribes to the clock');
    /* travel to 1860 — below the World Bank floor, so there is exactly ONE overlay pass */
    subs[0]({ year: 1860, isLive: false, when: new Date(Date.UTC(1860, 6, 1)) });
    await settle(700);
    assert.equal(api.year(), 1860, 'the overlay did not run for 1860');
    assert.equal(countryStats.USA.gdp, 94, "the USA's 1860 GDP did not come from Maddison");
    assert.equal(countryStats.JPN.gdp, null, 'a country Maddison cannot answer for should read as no-data, not as today');

    /* …and NOW the idle pass adds Singapore, exactly the way js/countries-ui.js `upgrade` does */
    countryStats.SGP = { ...LATE_SGP };
    assert.equal(api.reapply(), true, 'reapply() refused while the clock was on 1860');
    assert.equal(countryStats.SGP.gdp, null, `Singapore is still carrying $${LATE_SGP.gdp}B — its figure for TODAY — under 1860`);
    assert.equal(countryStats.SGP.pop, null, "Singapore is still carrying today's population under 1860");

    /* …and going back to Now has to give the present day back — which only works if the snapshot
       was taken when the row appeared, not once and for all before it existed */
    api._restore();
    assert.equal(countryStats.SGP.gdp, LATE_SGP.gdp, 'returning to Now lost Singapore’s present-day GDP');
    assert.equal(countryStats.SGP.pop, LATE_SGP.pop, 'returning to Now lost Singapore’s present-day population');
    assert.equal(countryStats.USA.gdp, PRESENT.USA.gdp, 'returning to Now lost the USA’s present-day GDP');
  } finally { restoreGlobals(); }
});

test('R393 ②: reapply() answers false when the clock is not travelling, and touches nothing', async () => {
  const { countryStats, subs, api, restoreGlobals } = await boot();
  try {
    subs[0]({ year: 1860, isLive: false, when: new Date(Date.UTC(1860, 6, 1)) });
    await settle(700);
    api._restore();                       /* back to Now */
    countryStats.SGP = { ...LATE_SGP };
    assert.equal(api.reapply(), false, 'reapply() claimed to have re-overlaid while the clock was live');
    assert.equal(countryStats.SGP.gdp, LATE_SGP.gdp, 'reapply() changed a row while the clock was live');
  } finally { restoreGlobals(); }
});

test('R393 ③: the idle upgrade pass asks the time engine to bring its new rows into the year', async () => {
  /* ⚠ SPELLING, ON PURPOSE, FOR THE CALLER: `upgrade` is the Countries tab's idle DOM pass (it fetches
     the 10 m file and rebuilds rows), so «it calls reapply() after creating rows» is read from it. */
  const src = codeOnly(R('js/countries-ui.js'));
  const i = src.indexOf('const upgrade=');
  assert.ok(i > 0, 'the idle upgrade pass is gone or was renamed');
  const body = src.slice(i, src.indexOf('const go=', i));
  assert.ok(/added\+\+/.test(body), 'the upgrade no longer counts the rows it creates');
  assert.ok(/if\(added\)[\s\S]{0,220}IntMapTimeCountries[\s\S]{0,60}reapply\(\)/.test(body),
    'the upgrade creates rows without asking the time engine to bring them into the year on screen');
  /* and the engine really offers it (a call to a method that does not exist is a silent no-op).
     EVALUATED (was: a regex for the module's return literal). */
  const { api, restoreGlobals } = await boot();
  try { assert.equal(typeof api.reapply, 'function', 'js/time-countries.js no longer exports reapply'); }
  finally { restoreGlobals(); }
});
