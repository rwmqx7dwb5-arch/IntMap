/* ============================================================================
 *  IntMap · Chronos — the clock's reach, its arithmetic, and every place that tells the reader
 *  how far it goes  (js/chronos.js · js/hist-scale.js · js/news-timeline.js)
 *  (consolidated from tests/r349 ①, r380 ①–③, r604 ①②⑤⑧, r679, r698 ① and
 *   r705-chronos-city-coverage ③; each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  #R349 lowered the floor from 1900 to 1850 and stated the invariant: there is ONE floor and
 *  everything reads it. #R604 took it to year 1 and found `Date.UTC(1,0,1)` is 1901 (the ECMA-262
 *  two-digit-year rule) — a kernel that only WROTE `YMIN=1` would carry the map to 1901 under the
 *  label «1年». #R679 took it below the common era, moved the number to its owner
 *  (js/hist-scale.js `FLOOR`) and found `toISOString().slice(0,10)` is not a date there
 *  (`-000322-01`). #R698 found `year:'numeric'` drops the era, so 3000 BC and AD 3000 formatted alike.
 *
 *  ⚠ THE CHECKS EVALUATE THE OWNER (#R505). Three rounds in a row a check that READ source for the
 *  floor stopped matching when the floor moved and took its whole file down at import; the floor now
 *  arrives through tests/helpers/hist-scale.mjs, which evaluates js/hist-scale.js. Where a check still
 *  reads source it says why — js/news-timeline.js's formatter, ruler and date control, js/app-body.js
 *  and js/atlas-console.js are DOM-bound closures no node evaluation reaches.
 *  ⚠ Files are read through `readLF` (#R283/#R317) and scans go through `codeOnly()` where the
 *  explanation of a defect names the defect verbatim (#R628).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';
import { histScale, clockFloor } from './helpers/hist-scale.mjs';
import { eraBundle } from './helpers/hist-eras.mjs';
import { specFiles } from '../scripts/architecture-spec.mjs';
import { importModule } from './helpers/import-module.mjs';
import { capsSource } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));
const HS = histScale();
const FLOOR = clockFloor();
const YMIN = FLOOR;
const NOW = 2026;

/* (module-graph) js/chronos.js IMPORTED fresh against a new `window` given only what it really needs —
   the kernel is the module's export (`export const IntMapTime`), not something read back off that window.
   The window stays installed, so the kernel reads `window.IntMapHistScale` at CALL time, as in a page. */
async function chronos(preset = {}) {
  const w = Object.assign({}, preset);
  w.window = w;
  const { IntMapTime } = await importModule('js/chronos.js', { globals: { window: w, document: undefined } });
  return { w, T: IntMapTime };
}
/* an instant in any astronomical year, built without Date.UTC (whose two-digit rule is the trap) */
const instant = (y, m, d) => { const t = new Date(0); t.setUTCFullYear(y, m, d); t.setUTCHours(12, 0, 0, 0); return t; };

/* ══ the floor is one number, and everything reads it ═══════════════════════════════════════ */

test('R349 ①: the clock reaches 1850, and js/news-timeline.js has no second copy of the floor', async () => {
  /* (#R604/#R679) R349's claim was never «the number is 1850» — it was «there is ONE floor and
     everything reads it». EVALUATED (was: a regex that js/chronos.js declares no `YMIN` literal and
     names IntMapHistScale.FLOOR): the kernel is run beside two different owners and its `min` must
     be whichever the owner states, read at call time (src/main.js imports js/chronos.js BEFORE
     js/hist-scale.js, so a value captured at load would be the fallback). */
  const { w, T: clock } = await chronos({ IntMapHistScale: { FLOOR: -500 } });
  assert.equal(clock.min, -500, 'js/chronos.js must read the floor from its owner');
  w.IntMapHistScale = { FLOOR: -9000 };
  assert.equal(clock.min, -9000, 'js/chronos.js must not hold its own copy of the floor — it reads js/hist-scale.js FLOOR at call time');
  /* ⚠ (#R679) the floor is a whole year the platform can construct, and it reaches at least as far as
     R349 promised. Upstream writes ASTRONOMICAL years, which have a 0, and carries units to −3700. */
  assert.ok(Number.isInteger(FLOOR), 'the floor must be a whole year');
  assert.ok(FLOOR <= 1850, `the clock no longer reaches 1850 — R349's promise, floor is ${FLOOR}`);

  /* ⚠ SPELLING, ON PURPOSE: the panel's slider, input guard, reflect clamp and ruler are DOM handlers
     inside js/news-timeline.js's closure (#R575: nothing in node can evaluate them). */
  const ntl = R('js/news-timeline.js');
  assert.match(ntl, /const YMIN\s*=\s*\(\)\s*=>\s*\{[^}]*IntMapTime\.min/,
    'the panel must READ IntMapTime.min, not hold its own number');
  for (const re of [/slider\.min\s*=\s*'1900'/, /y\s*>=\s*1900/, /Math\.max\(1900,/, /<span>1900<\/span>/]) {
    assert.doesNotMatch(ntl, re, 'a hard-coded 1900 came back to js/news-timeline.js: ' + re);
  }
  /* index.html's attribute is only the pre-JS value, but it must not contradict the panel either:
     (#R604) in Year mode the rail carries a POSITION, not a year */
  assert.match(R('index.html'), /id="ntl-slider"[^>]*min="0"[^>]*max="1000"/,
    'the pre-JS slider attribute must be the rail, not a year');
  assert.doesNotMatch(ntl, /const YPOS\s*=\s*\d/, 'the rail length is read from js/hist-scale.js, not typed here');
});

/* ── (#R380 ①) the reach is one number, and no shipped sentence names a different one ─────────── */
test('R380 ①: every place that TELLS a reader how far the clock reaches names the kernel’s floor', () => {
  /* ⚠ (#R604) what R380 asserts is that no shipped sentence names a reach OTHER than the kernel's,
     and that claim does not have a number in it. */
  assert.ok(Number.isInteger(YMIN) && YMIN <= 1850,
    `the kernel floor is not a year, or no longer reaches what earlier rounds promised: ${YMIN}`);
  const files = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'))
    .map((f) => 'js/' + f)
    .concat(readdirSync(join(ROOT, 'js', 'locales')).filter((f) => f.endsWith('.js')).map((f) => 'js/locales/' + f))
    /* ⚠⚠⚠ (#R679) THE UNIVERSE WAS THE PROGRAM, AND THE READER IS TOLD THE REACH IN PROSE.
       PRODUCT.md still read 「さかのぼれるのは 1850 年まで」, and this sweep never saw it (#R628: the
       file was not excluded, it was never in the母集合). ⚠ DEV-NOTES IS NOT HERE: it is the history,
       and a sweep that could not tell current spec from history would force the record to be
       falsified to stay green. */
    .concat(['PRODUCT.md', 'README.md', ...specFiles(ROOT)])   /* the spec: the map and its chapters (architecture-split) */
    .concat(readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f));
  /* the shapes a reach-claim takes in this codebase, in every language it is written in.
     WARNING (#R604) the scan counts CLAIM SENTENCES, whether the year in them is a literal or the
     {y} placeholder filled from IntMapTime.min at runtime; a literal that is not the floor is a lie. */
  const CLAIM = /(?:reaches back to|travel back to|time travel back to|deep time,|remonte jusqu'à|回溯到|回溯至|zurück bis|Chronos \()\s*(\{y\}|\d{4})|(?:さかのぼれるのは|遡れるのは)\s*(\d{4})\s*年まで|(\d{4})\s*(?:→now|→heute|→сейчас|→ahora|年まで遡|년까지)/g;
  const bad = [], seen = [];
  for (const f of files) {
    const src = R(f);
    for (const m of src.matchAll(CLAIM)) {
      const raw = m[1] || m[2] || m[3];
      seen.push(f + ':' + raw);
      /* a claim FILLED from the kernel at runtime cannot be stale — R380 ② proves it is filled from T.min */
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

/* ── (#R380 ②) Atlas's refusal is derived, not written down ──────────────────────────────────── */
/* ⚠ SPELLING, ON PURPOSE: the deep-time guard is one branch of the Atlas console's command closure
   (it needs the whole console, a DOM and a model turn to reach); the claim is the shape of that line. */
test('R380 ②: Atlas refuses a too-early year with the floor it actually tested against', () => {
  const src = (R('js/atlas-console.js') + '\n' + capsSource());
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

/* ── (#R380 ③) the comparison panel travels as far as the clock does ──────────────────────────── */
test('R380 ③: the comparison panel’s time-travel floor is the kernel’s, not a copy', () => {
  /* EVALUATED (was: regexes that `_ttYear` names T.min and carries no 19xx literal). The panel's
     `_ttYear` is lifted out of js/stats-compare.js and run against a stub clock: a travelled year
     between the kernel's floor and 1900 must read as TRAVELLED, not live — 1850-1899 silently drew
     TODAY'S figures under a nineteenth-century year when this was a third copy of the floor. */
  const src = R('js/stats-compare.js');
  const m = /function _ttYear\(\)\{[^\n]*/.exec(src);
  assert.ok(m, '_ttYear is gone or was reshaped');
  /* (module-graph) the fragment reads the bare `IntMapTime` js/stats-compare.js imports — handed in by name */
  const ttYear = (T) => new Function('window', 'IntMapTime', m[0] + '\nreturn _ttYear();')({}, T);
  const clock = (year, min) => ({ isLive: () => false, year: () => year, min });
  assert.equal(ttYear(clock(1855, 1)), 1855, '_ttYear does not read the kernel floor — 1850-1899 silently reads as LIVE again');
  assert.equal(ttYear(clock(1623, -9999)), 1623, '_ttYear still carries a hard-coded floor of its own');
  assert.equal(ttYear(clock(1860, 1870)), null, 'a year below the kernel floor is not a year the panel can show');
  assert.equal(ttYear({ isLive: () => true, year: () => 2026, min: 1 }), null, 'a live clock must read as live');
});

/* ══ #R604 — does the clock reach every age (the part measurable without a browser) ═════════
   「歴史的地方区分の境界線のcoverageがくそ。全時代、全地域で完璧に網羅しろ。」 ⚠⚠⚠ everything here is
   EVALUATION (#R505): the clock is actually set and the year that comes back is read. */

/* ⚠⚠⚠ `Date.UTC(1,0,1)` IS 1901 — an implementation that only wrote `YMIN=1` satisfies `min === 1`
   while taking the map to 1901. So what is read is the year AFTER setting, not the constant. */
test('#R604 ① Chronos は西暦1年に到達する（Date.UTC の2桁年規則に落ちない）', async () => {
  const { T } = await chronos();
  assert.equal(T.min, 1, 'the kernel floor is year 1');
  for (const y of [1, 5, 50, 99, 100, 1500, 1850]) {
    T.setYear(y);
    assert.equal(T.year(), y, `setYear(${y}) landed in ${T.year()}`);
    assert.equal(T.iso().slice(0, 4), String(y).padStart(4, '0'), `iso() disagrees for ${y}`);
  }
  /* 下限より前は下限に丸められる（未来は LIVE に戻る、という既存の対称) */
  T.set(new Date('0000-06-15T00:00:00Z'));
  assert.equal(T.year(), 1, 'below the floor clamps to the floor');
  T.setNow();
  assert.equal(T.isLive(), true, 'setNow releases every subscriber');
});

/* 実測: 伊豆国 (relation 2687374) は end_date 1871-08-29、タイルの end_decdate は 1871.6589。
   閏年の扱いを間違えると1日ぶんずれ、「廃止された翌日にまだ描く」になる。 */
test('#R604 ② decYear は OHM の decdate と一致する', () => {
  /* ⚠ 上流 103,093 件に当てて選んだ規約 = 年 + (通日 − 0.5)/年の長さ（その日の**中点**）。 */
  assert.ok(Math.abs(HS.decYear(1871, 8, 29) - 1871.6589) < 1e-4,
    `decYear(1871-08-29) = ${HS.decYear(1871, 8, 29)}, upstream writes 1871.6589`);
  assert.ok(HS.decYear(1900, 1, 1) > 1900 && HS.decYear(1900, 1, 1) - 1900 < 2 / 365,
    'the first day of a year sits just inside it, at the day midpoint');
  /* 始まった当日に「まだ始まっていない」と判定されないこと —— 半日ずれの現れ方そのもの */
  const born = HS.decYear(1871, 8, 29);
  assert.ok(HS.inForce({ type: 'administrative', admin_level: 4, start_decdate: 1871.6589 }, 3, 4, born), true);
  /* 閏年: 2000-03-01 は 60/366、非閏年 1900-03-01 は 59/365 —— 同じ日付が違う値になる */
  assert.ok(HS.decYear(2000, 3, 1) - 2000 > HS.decYear(1900, 3, 1) - 1900 - 1e-9,
    'a leap year must not be measured with 365 days');
  /* 単調 —— 年内のどの2日も順序が保たれる */
  let prev = -1;
  for (let m = 1; m <= 12; m++) for (const d of [1, 15, 28]) {
    const v = HS.decYear(1600, m, d);
    assert.ok(v > prev, `decYear went backwards at 1600-${m}-${d}`);
    prev = v;
  }
});

test('#R604 ⑤ Chronos の年レールは可逆・単調で、近代に精度を残す', () => {
  const MIN = 1, MAX = 2026, POS = HS.rail.POS;
  for (const y of [1, 100, 500, 1000, 1500, 1600, 1850, 1900, 1950, 2000, 2025, MAX]) {
    const back = HS.rail.toYear(HS.rail.toPos(y, MIN, MAX), MIN, MAX);
    assert.ok(Math.abs(back - y) <= 3, `year ${y} round-tripped to ${back}`);
  }
  let prev = -Infinity;
  for (let p = 0; p <= POS; p++) {
    const y = HS.rail.toYear(p, MIN, MAX);
    assert.ok(y >= prev, `the rail ran backwards at position ${p}`);
    prev = y;
  }
  assert.equal(HS.rail.toYear(0, MIN, MAX), MIN, 'the left stop is the floor');
  assert.equal(HS.rail.toYear(POS, MIN, MAX), MAX, 'the right stop is now');
  /* ⚠ 直線レールを直した理由そのもの: 1850 以降が半分を占める */
  assert.equal(HS.rail.toPos(1850, MIN, MAX), POS / 2, '1850 sits at the middle of the rail');
  const modern = HS.rail.toYear(POS, MIN, MAX) - HS.rail.toYear(POS - 1, MIN, MAX);
  assert.ok(modern <= 1, `a step near now moves ${modern} years — the precision the linear rail lost`);
  /* 床を上げても壊れない（将来 IntMapTime.min が動いてもレールは動くだけ） */
  assert.equal(HS.rail.toYear(0, 1900, MAX), 1900, 'a floor above every breakpoint still starts at the floor');
  assert.equal(HS.rail.toYear(POS, 1900, MAX), MAX, 'and still ends at now');
});

/* ⚠⚠⚠ このラウンドで同じ罠を4か所踏んだ——カーネル・Chronos パネルの下限・直接入力が作る瞬間・時間帯
   オフセットの逆算。4つ目は入力欄の `min` 属性を 1901 と名乗らせていた。だから規則の持ち主は1つで、
   ここではその持ち主を**評価して**測る——ソースを読む検査では `Date.UTC` を書いた5か所目を見つけられない。 */
test('#R604 ⑧ utcAt は2桁年規則に落ちない（規則の持ち主は1つ）', () => {
  for (const y of [1, 5, 19, 50, 99, 100, 1850, 2026]) {
    const d = HS.utcAt(y, 0, 1, 0, 0, 0);
    assert.equal(d.getUTCFullYear(), y, `utcAt(${y}) landed in ${d.getUTCFullYear()}`);
  }
  /* 月・日・時分も落とさない（`Date.UTC` の置き換えとして使われている以上、同じ引数を取る） */
  const d = HS.utcAt(19, 2, 2, 13, 45, 0);
  assert.equal(d.toISOString(), '0019-03-02T13:45:00.000Z');
  /* そして `Date.UTC` は本当にそこが違う——この検査自身が罠を再現できることの証明 */
  assert.notEqual(new Date(Date.UTC(19, 2, 2)).getUTCFullYear(), 19,
    'Date.UTC no longer applies the two-digit-year rule — this check has lost its subject');
});

/* ══ #R679 — Chronos reaches before the common era, the arithmetic EVALUATED ══════════════════
   「Chronosの歴史的地名、境界線coverageを、できる限りすべてを最高レベル品質と精度で網羅するように。
    私はあなたにいつの時代までかをここで制限することもしません。」 */

/* the nine languages, with the BCP-47 tag js/lang-registry.js answers for each — read from the
   registry itself, so a language added there is swept here without an edit */
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

test('R679 ①: the clock reaches before the common era, and the instant it lands on is that year', () => {
  assert.ok(FLOOR < 1, `the floor is not before the common era: ${FLOOR}`);
  /* ⚠ THE HALF SOURCE CANNOT SHOW: construct the instant and read the year back off it */
  for (const y of [FLOOR, -122999, -10000, -322, -1, 0, 1, 99, 1850, NOW]) {
    if (y < FLOOR) continue;
    const d = HS.utcAt(y, 5, 15, 12, 0, 0);
    assert.ok(!Number.isNaN(+d), `year ${y} is not a constructible instant`);
    assert.equal(d.getUTCFullYear(), y, `utcAt(${y}) landed in ${d.getUTCFullYear()}`);
  }
});

test('R679 ②: ymd is a date at every year the clock can reach — toISOString().slice(0,10) is not', () => {
  /* the defect, stated as the thing it produced: ten characters with no day in them */
  const d = HS.utcAt(-322, 0, 1);
  assert.equal(d.toISOString().slice(0, 10), '-000322-01', 'the trap this exists for has changed shape — re-read the comment');
  assert.equal(HS.ymd(d), '-000322-01-01');
  assert.equal(HS.ymd(HS.utcAt(-122999, 5, 15)), '-122999-06-15');
  assert.equal(HS.ymd(HS.utcAt(1, 0, 1)), '0001-01-01');
  assert.equal(HS.ymd(HS.utcAt(2026, 11, 31)), '2026-12-31');
  /* ⚠ IT MUST ROUND-TRIP: a reader of it gets back the instant that was meant */
  for (const y of [-122999, -322, -1, 0, 1, 99, 1850, 2026]) {
    const s = HS.ymd(HS.utcAt(y, 5, 15));
    assert.equal(new Date(s + 'T00:00:00Z').getUTCFullYear(), y, `${s} does not parse back to ${y}`);
  }
});

test('R679 ③: nothing outside its owner truncates an ISO year to ten characters for a clock instant', async () => {
  /* EVALUATED for the kernel (was: regexes that js/chronos.js's ymdISO names IntMapHistScale and never
     writes `toISOString().slice(0,10)`). The clock is stood in 323 BC and asked for its date:
     with the owner present the answer IS the owner's, and on a page where the owner has not evaluated
     the kernel's own fallback body must still write a whole date, not `-000322-06`. */
  const withOwner = (await chronos({ IntMapHistScale: { FLOOR: -1000, ymd: () => 'answered-by-the-owner' } })).T;
  withOwner.set(instant(-322, 5, 15));
  assert.equal(withOwner.iso(), 'answered-by-the-owner', 'js/chronos.js holds its own copy of the date rule instead of reading the owner');
  const alone = (await chronos({ IntMapHistScale: { FLOOR: -1000 } })).T;
  alone.set(instant(-322, 5, 15));
  assert.equal(alone.iso(), '-000322-06-15', 'js/chronos.js still truncates an ISO year');
  const seen = [];
  alone.on((e) => seen.push(e.iso));
  alone.set(instant(-9, 0, 2));
  assert.equal(seen.at(-1), '-000009-01-02', 'the date broadcast to every subscriber is not a whole date');
  /* ⚠ SPELLING, ON PURPOSE, FOR THE SECOND COPY: js/app-body.js's `ymdISO` is inside the app shell's
     closure (it hands the news feed and the screenshot filename their date). */
  const m = R('js/app-body.js').match(/(?:function|const) ymdISO[\s\S]{0,500}/);
  assert.ok(m, 'js/app-body.js no longer has a ymdISO to check — has it moved?');
  assert.match(m[0], /IntMapHistScale/, 'js/app-body.js holds its own copy of the date rule instead of reading the owner');
});

test('R679 ④: the era conversion is one function, invertible, and matches ICU', () => {
  assert.deepEqual(HS.era(-322), { bce: true, n: 323 });
  assert.deepEqual(HS.era(0), { bce: true, n: 1 });
  assert.deepEqual(HS.era(1), { bce: false, n: 1 });
  for (let y = -6000; y <= 2100; y++) {
    const e = HS.era(y);
    assert.ok(e.n > 0, `era(${y}) produced a non-positive display number`);
    assert.equal(HS.fromEra(e.n, e.bce), y, `era/fromEra do not invert at ${y}`);
  }
  /* ⚠ AN INDEPENDENT WITNESS: ICU does the BC/AD arithmetic itself from the same instant */
  for (const [y, want] of [[-322, '323'], [0, '1'], [-1, '2']]) {
    const t = new Intl.DateTimeFormat('en', { era: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(HS.utcAt(y, 5, 15, 12));
    assert.ok(t.startsWith(want + ' '), `ICU reads astronomical ${y} as «${t}», we say ${HS.era(y).n} BC`);
  }
});

test('R679 ⑤: every shipped language gets a real era word below year 1, and a bare year above it', () => {
  const tags = langTags();
  const codes = Object.keys(tags);
  assert.ok(codes.length >= 9, `the registry lists ${codes.length} languages, expected the shipped nine`);
  const seen = new Set();
  for (const c of codes) {
    const bce = HS.yearText(-322, tags[c], c === 'jp' ? '年' : null);
    /* forbidden is a SIGN IN FRONT OF A NUMBER, not the character (fr writes «av. J.-C.») */
    assert.ok(bce && !/(^|[\s(])[-−]\d/.test(bce), `${c}: a signed year reached the reader as «${bce}»`);
    assert.match(bce, /323/, `${c}: «${bce}» does not name the year 323`);
    assert.ok(bce.replace(/[\d\s]/g, '').length > 0, `${c}: «${bce}» carries no era word`);
    seen.add(bce);
    /* above year 1 nothing changes, because nothing about it was broken */
    assert.equal(HS.yearText(1500, tags[c], c === 'jp' ? '年' : null), c === 'jp' ? '1500年' : '1500');
  }
  /* ⚠ NINE LANGUAGES, NOT ONE STRING NINE TIMES (#R244), and zh vs zh-hans must differ */
  assert.ok(seen.size >= 6, `nine languages produced only ${seen.size} distinct era labels`);
  assert.notEqual(HS.yearText(-322, tags['zh']), HS.yearText(-322, tags['zh-hans']),
    'Traditional and Simplified Chinese got the same era word — the tag lost its script');
});

test('R679 ⑥: the deep band is a levy on the whole rail, not a reallocation of the old one', () => {
  const R1 = HS.rail;
  const P = (y) => R1.toPos(y, FLOOR, NOW);
  const bands = { deep: P(1) - P(FLOOR), early: P(1500) - P(1), mid: P(1850) - P(1500), modern: P(NOW) - P(1850) };
  /* what #R604 shipped must not shrink DISPROPORTIONATELY: the three bands above year 1 keep their shares */
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

/* ── THE PROPERTY #R679 IS ABOUT: every era the record has is reachable ─────────────────────── */
test('R679 ⑦: every era snapshot the map can answer with has a slider position that selects it', () => {
  /* ⚠ A rail can be smooth, monotone and even and still leave a snapshot with no position that lands
     nearer to it than to its neighbours — a world no reader can ask for. The years come from the
     shipped list, not from this file. */
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

test('R679 ⑧: the ruler’s marks come from the rail, not from a written list', () => {
  const t = HS.niceTicks(FLOOR, NOW, 64);
  assert.ok(t.length > 12, `the ruler produced ${t.length} marks`);
  assert.ok(t.every((y, i) => i === 0 || y > t[i - 1]), 'the marks are not strictly increasing');
  assert.ok(t.every((y) => y >= FLOOR && y <= NOW), 'a mark falls outside the reach');
  assert.ok(t.some((y) => y < 1), 'the pre-common-era band has no mark at all');
  /* ⚠ ROUNDED IN THE NUMBER THE READER SEES («6 BC» for −5 was measured before it shipped) */
  for (const y of t) {
    if (y === FLOOR || y === NOW) continue;   /* the ends of the rail, not derived marks */
    const n = HS.era(y).n;
    if (n < 10) continue;
    assert.equal(n % 5, 0, `«${HS.yearText(y, 'en')}» is not a number a person would read`);
  }
  /* the panel must not hold a list of years any more.
     ⚠ SPELLING, ON PURPOSE: the ruler is drawn inside js/news-timeline.js's DOM closure. */
  const ntl = R('js/news-timeline.js');
  assert.doesNotMatch(ntl, /want=\[1,500,1000,1250/, 'the written tick list came back to js/news-timeline.js');
  assert.match(ntl, /niceTicks\(/, 'the panel no longer derives its ruler from the rail');
});

/* ⚠ SPELLING, ON PURPOSE: the date control's clamp and its `min` attribute are written by DOM
   handlers inside js/news-timeline.js's closure. */
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

/* ⚠ THE DEFECT THIS GUARDS IS #R604's, ONE FLOOR DOWN: the remote fallback can only ask for snapshots
   named by a plain decimal year, so `nearest(-322, thatList)` answers 100 — the Roman world of AD 100
   under the label «323 BC». ⚠ SPELLING, ON PURPOSE (as #R679 wrote it): the branch is a refusal
   inside the border layer's loader, and there is nothing on screen to query. */
test('R679 ⑩: with no era bundle, a year before the common era is answered by nothing', () => {
  const tb = R('js/time-borders.js');
  /* (time-compare-lapse) the refusal lives in the chain's own function now, `collectionAt` — it answers null (nothing),
     and `go` keeps the map border-less and retries on a null answer — so either form is the same claim */
  assert.match(tb, /if\(!_erd&&year<1\)(?:\{[\s\S]{0,220}?return;\s*\}| return null;)/,
    'js/time-borders.js no longer refuses a pre-common-era year it cannot source');
  /* …and the fallback path itself must not reach for a file name it cannot spell */
  assert.match(tb, /if\(year<1\) return null;/,
    'the remote fallback must not try to fetch a pre-common-era snapshot by decimal name');
  /* the fallback list is upstream's decimal-named files, and its oldest is AD 100 */
  const m = /const YEARS=(\[[\s\S]*?\]);/.exec(tb);
  assert.ok(m, 'js/time-borders.js no longer declares the fallback list');
  const YEARS = JSON.parse(m[1].replace(/\s+/g, ''));
  assert.ok(YEARS.every((y) => y >= 1), 'the fallback list gained a year it cannot name a file for');
});

/* ══ #R698 — the era word, once the stepper reached BC ═══════════════════════════════════════ */
test('#R698 ① a date before year 1 does not format to the same string as one after it', () => {
  /* ⚠⚠⚠ THE RULE IS EVALUATED, NOT GREPPED. The first version of this check asked whether
     js/news-timeline.js contained the word «era» — and stayed GREEN when the one line that asks for it
     was deleted, because the word also appears in the comment explaining why. The rule was moved to
     its owner (js/hist-scale.js `dateText`) and the owner is RUN here. */
  assert.equal(typeof HS.dateText, 'function', 'js/hist-scale.js publishes no whole-date formatter');
  for (const tag of ['ja', 'en', 'de', 'ru', 'ko', 'zh-Hant', 'fr', 'es']) {
    const bc = HS.dateText(-2999, 1, 1, tag), ad = HS.dateText(3000, 1, 1, tag);
    assert.notEqual(bc, ad, tag + ': 3000 BC and AD 3000 format identically — ' + bc);
    /* ⚠ AND IT IS NOT PRINTED AS A NEGATIVE NUMBER (a MINUS IN FRONT OF DIGITS, not a hyphen) */
    assert.doesNotMatch(bc, /(^|[\s(])[-−]\d/, tag + ': a year before 1 is printed as a negative number — ' + bc);
  }
  /* ⚠ AND THE ERA IS NOT ASKED FOR WHEN THERE IS NOTHING TO SAY */
  assert.ok(!/西暦/.test(HS.dateText(1990, 10, 2, 'ja')), 'an ordinary date gained an era word');
  assert.ok(!/\bAD\b/.test(HS.dateText(1990, 10, 2, 'en')), 'an ordinary date gained an era word');
  /* ⚠ AND A YEAR UNDER 100 IS THAT YEAR, not 1900 + it (#R602's trap) */
  assert.match(HS.dateText(99, 1, 1, 'en'), /\b99\b/, 'year 99 is being written as 1999');
  /* the caller must READ the owner rather than keep a second copy of the rule.
     ⚠ SPELLING, ON PURPOSE: `_dateText` lives inside js/news-timeline.js's DOM closure. It has to
     name the CALL — the slice starts at `function _dateText`, so a bare /dateText\(/ matches the
     function's own name and passed with the owner ripped out. */
  const src = readFileSync(join(ROOT, 'js', 'news-timeline.js'), 'utf8');
  const body = src.slice(src.indexOf('function _dateText'), src.indexOf('function _dateText') + 400);
  assert.match(body, /HS\(\)\.dateText\(/, '_dateText no longer reads the owner (js/hist-scale.js)');
  /* the bare `d.toLocaleDateString()` in the catch takes no options — it states nothing about eras */
  assert.doesNotMatch(body, /toLocaleDateString\([^)]/, '_dateText formats the date itself again — the rule would have two owners');
  assert.doesNotMatch(body, /Intl\.DateTimeFormat/, '_dateText formats the date itself again — the rule would have two owners');
});

/* ══ the Chronos panel's geometry (#R705) ═══════════════════════════════════════════════════
   the panel reserves the space the map's credit line occupies; the measuring function is lifted out
   of js/news-timeline.js and RUN against stubbed element boxes */
test('#R705 Chronos reserves measured attribution space and updates only changed geometry', () => {
  const code = readFileSync(join(ROOT, 'js/news-timeline.js'), 'utf8');
  const start = code.indexOf('    function measureCreditSpace(){');
  const end = code.indexOf('    function queueCreditSpace()', start);
  assert.ok(start >= 0 && end > start);
  const values = new Map(); let writes = 0;
  let creditTop = 613;
  const ctx = vm.createContext({ Math, parseFloat, creditFrame: 1,
    getComputedStyle: () => ({ paddingBottom: '8px' }),
    tl: { offsetParent: { getBoundingClientRect: () => ({ top: 0, bottom: 844 }) },
      getBoundingClientRect: () => ({ left: 62, right: 378 }),
      style: { getPropertyValue: k => values.get(k), setProperty: (k, v) => { writes++; values.set(k, v); } } },
    mapCredit: { getBoundingClientRect: () => ({ top: creditTop, bottom: creditTop + 23, left: 6, right: 276, width: 270, height: 23 }) } });
  vm.runInContext(code.slice(start, end) + '\nmeasureCreditSpace();', ctx);
  assert.equal(values.get('--ntl-credit-floor'), '239px');
  assert.equal(values.get('--ntl-available-height'), '597px');
  vm.runInContext('measureCreditSpace();', ctx);
  assert.equal(writes, 2, 'stable geometry does not trigger a resize/style feedback loop');
  creditTop = 500;
  vm.runInContext('measureCreditSpace();', ctx);
  assert.equal(values.get('--ntl-credit-floor'), '352px', 'sheet/credit motion changes the reserved space');
});
