/* ============================================================================
 *  #R410 — 歴史地図の国名は、その年のものでなければならない
 * ----------------------------------------------------------------------------
 *  #R409 の実測: 1939 → 1916 と戻すと地図のラベルは «Nazi Germany» のままで、同じ画面の
 *  Countries 一覧は «German Empire» と出ていた。初回描画では時代名がそもそも出なかった。
 *  原因は**同じ時計に二つのリスナーが答えていて、歩調が合っていない**ことである:
 *  js/time-borders.js は 45 ms 後に描き、js/time-countries.js は 340 ms 待ってから国別表・
 *  Maddison・HDI を await して `countryStats` を**その年の名前**に改名する。ラベルは
 *  「改名されたか（`s._histId`）」を読んでいたので、**常に一手前の年**を描き、
 *  そして二度と書き直されなかった。
 *
 *  ⚠ ここで測るのは**ソースの形**である。画面に出た文字そのものは
 *  `tests/r410.spec.js`（門・1939→1916）と `tests/r410-late.spec.js`（deep・属性が遅れる回）
 *  がブラウザで測る。ソースの形だけの検査は「機能が静かに無くなる」形を作る（#R402）ので、
 *  **両方ある**こと自体がこの round の主張である。
 *
 *  ⚠ 走査は必ず `codeOnly()` を通す。上の説明文にはこの検査が探す綴りが全部書いてあるので、
 *  生のファイルに当てると**自分の散文に「はい」と答える**（#R345 が名付けた形・12 回以上）。
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const TB = codeOnly(R('js/time-borders.js'));
const TC = codeOnly(R('js/time-countries.js'));

/* js/history.js is a plain script that hangs factories off `window`; running it is the difference
   between asking how the table is spelled and asking what it answers (#R380 ⑤ built this stub). */
const MOD = (() => {
  const win = { IntMapModules: {}, IntMapLang: { pickArgs: () => function () { return Array.prototype.slice.call(arguments); } } };
  new Function('window', R('js/history.js'))(win);
  return win.IntMapModules;
})();

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
  const HS = MOD.histStates({});
  const at1916 = HS.activeAt('1916-07-01T00:00:00Z').map((S) => S.code);
  assert.ok(at1916.includes('RUE'), `1916 should be the Russian Empire, got ${at1916.join(',')}`);
  assert.ok(at1916.includes('JEM'), 'and the Empire of Japan');
  assert.ok(HS.hbRe('RUE').test('Russia'), 'the polygon named «Russia» is what RUE has to be found by');
  assert.ok(!HS.hbRe('RUE').test('Germany'), 'and it must not answer for anything else');
  assert.ok(!HS.activeAt('1950-07-01T00:00:00Z').map((S) => S.code).includes('RUE'), 'the empire ended in 1917');
});

/* ── ② every identity the list can rename is one the MAP can rename ───────────────────────────── */
test('R410 ②: the label table covers every code IntMapHistId carries', () => {
  /* the ID block's own keys, taken from the shipped file by matching its braces (not a hand list) */
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
test('R410 ③: tagSame is given the year and asks the table for it', () => {
  assert.ok(/function tagSame\(fc\s*,\s*year\)/.test(TB), 'tagSame no longer takes the year it is drawing');
  assert.ok(/tagSame\(fc\s*,\s*shownYear\)/.test(TB), 'apply() stopped handing it the year');
  assert.ok(/HID\.at\(code\s*,\s*_y\)/.test(TB), 'the era identity is not looked up by year any more');
  assert.deepEqual(TB.match(/_histId/g) || [], [],
    'the label is gated on the rename again — that is the defect, one listener reading another’s output');
  /* the year is taken before any early return, because `shownY` is a SNAPSHOT key and one aourednik
     snapshot answers many years.
     ⚠ (#R421) THE CLAIM IS UNCHANGED; ONLY ITS SPELLING IS. This was
        /async function go\(year\)\{[^\n]*shownYear=year;/
     — one line, and the parameter had to be named `year`. #R421 moved the historical borders from a
     yearly sample to the CShapes validity DATES, so `go` takes the INSTANT and derives the year one
     line above the assignment; the old regex failed on a tree where the claim is perfectly true.
     A gate that pins the spelling of a line blocks the next honest edit and teaches people to delete
     it, so it now checks the thing it always meant: `shownYear` is assigned in go()'s preamble,
     BEFORE the first branch, so no early return can leave it stale. */
  const goAt = TB.indexOf('async function go(');
  assert.ok(goAt > 0, 'go() is gone from js/time-borders.js');
  const goPreamble = TB.slice(goAt, TB.indexOf('if(', goAt));
  assert.ok(/shownYear=year;/.test(goPreamble),
    'shownYear is not assigned in go()’s preamble, before the first branch');
});

/* ── ③b the former-state correspondence table the CLICK path has always used reaches the LABELS ── */
test('R410 ③b: a former state is matched to its polygon, and is asked before the plain name lookup', () => {
  /* ⚠ `HS.hbRe(` ALONE IS NOT THE CLAIM. js/time-borders.js `_eraLocName` has called it since #R129,
     so a check for the spelling is green on a tree where the LABEL path never touches it — measured:
     the first version of this test stayed green through a mutation that dropped hbRe from the label
     path entirely. The claim is the collection this round built and the order it is read in. */
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

/* ── ④ the moment the identities land is announced, and the labels are re-read ─────────────────── */
test('R410 ④: both ends of the identity announcement exist', () => {
  const dispatched = TC.match(/intmap-hist-identity/g) || [];
  assert.equal(dispatched.length, 1, 'js/time-countries.js must announce the change exactly once');
  assert.ok(/dispatchEvent\(new CustomEvent\('intmap-hist-identity'/.test(TC), 'it is not dispatched as an event');
  /* …from repaint(), which every branch calls — the overlay, the return to Now, and the years below
     the Maddison floor where the modern identities come BACK */
  const rp = /function repaint\(\)\{[\s\S]*?\n    \}/.exec(TC);
  assert.ok(rp && /intmap-hist-identity/.test(rp[0]), 'the announcement moved out of repaint(), so some branch is now silent');

  assert.ok(/addEventListener\('intmap-hist-identity'/.test(TB), 'js/time-borders.js stopped listening');
  const h = /addEventListener\('intmap-hist-identity',\(\)=>\{[\s\S]*?\}\);/.exec(TB);
  assert.ok(h, 'the listener body cannot be read');
  assert.ok(/tagSame\(shownFC\s*,\s*shownYear\)/.test(h[0]), 'the listener does not re-tag the snapshot on screen');
  assert.ok(/setSourceData\('imtb-src'/.test(h[0]), 'the re-tag never reaches the renderer');
  assert.ok(/if\(sig\(\)===before\) return;/.test(h[0]),
    'the guard is gone: repaint() fires twice per travel and would push a few hundred kB back for nothing');
});

/* ── ⑤ the map applies era identities over exactly the years the list does ─────────────────────── */
test('R410 ⑤: both files read the same floor, so neither renames a year the other does not', () => {
  const FLOOR = /\(window\.IntMapMaddison&&window\.IntMapMaddison\.minYear\)\|\|1900/g;
  assert.ok((TC.match(FLOOR) || []).length >= 1, 'js/time-countries.js no longer derives its floor from Maddison');
  assert.ok((TB.match(FLOOR) || []).length >= 1,
    'js/time-borders.js declares its own floor — below the list’s floor the map would name a polity the list has un-named');
});
