/* ============================================================================
 *  #R429 — the comparison panel's own name for a former state
 * ----------------------------------------------------------------------------
 *  #R380 found that the former-state NAME is a tuple — `IntMapLang.pickArgs()` returns
 *  `Array.prototype.slice.call(arguments)`, so a row's `name` is `['Soviet Union','ソビエト連邦',…]`
 *  and `name.en` / `name.jp` are both `undefined` — and it fixed the two writers in js/history.js
 *  by routing them through ONE shared reader, `window.IntMapHistName`.
 *
 *  It did not reach the third one. js/stats-compare.js `_histMini` builds the SAME
 *  `{code,nameEn,nameJp,flag}` record out of a raw `IntMapHistStates.STATES` row, and it read
 *  `S.name.en` / `S.name.jp`. That record is what `_cs()` falls back to whenever `countryStats`
 *  is not currently carrying the state — which is every time the reader comes back to Now
 *  (js/time-countries.js `restore()` deletes the entry while the clock subscriber re-renders the
 *  open panel 380 ms later), stands at a year the state does not span, or restores a session.
 *  `cName()` (js/app-body.js) answers `undefined || undefined || '—'`, so the panel labelled the
 *  state 「—」 in five places: the chip row, the bar labels, the per-indicator table header, the
 *  year-matrix header and the cross-table legend.
 *
 *  REPRODUCED in a local build before the fix — Countries at 1960 → tick Soviet Union + United
 *  States → Show comparison → drag the year slider back to the present:
 *      chip 「—×」 · bar 「— —」 · table header 「—」   (the flag survived; only the name died)
 *
 *  ⚠ THESE CHECKS RUN THE SHIPPED CODE. `_histEntry`, `_histMini` and `_cs` are lifted out of
 *  js/stats-compare.js and `cName` out of js/app-body.js, through `codeOnly` so this file's own
 *  prose — which necessarily spells the defect — can never be what a check matches (#R345).
 *  ⚠ The structural half of this round lives in tests/r380-checks ⑨, which #R429 widened from
 *  «js/history.js» to «every file that can reach a STATES row»: a scan aimed at one file is
 *  exactly why this reader went forty-nine rounds unnoticed.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = (p) => readLF(join(ROOT, p));

/* js/history.js as the browser runs it: the tuple maker is the real one, so the rows carry real arrays. */
function histStates() {
  const win = { IntMapModules: {}, IntMapLang: { pickArgs: () => function () { return Array.prototype.slice.call(arguments); } } };
  new Function('window', R('js/history.js'))(win);
  assert.equal(typeof win.IntMapHistName, 'function', 'the shared tuple reader is gone from js/history.js');
  return { win, HS: win.IntMapModules.histStates({}) };
}

/* Lift a top-level `function name(...){…}` out of a file, comments already stripped. */
function lift(code, sig, where) {
  const i = code.indexOf(sig);
  assert.ok(i >= 0, `${sig} is gone from ${where}`);
  let depth = 0;
  for (let k = code.indexOf('{', i); k < code.length; k++) {
    if (code[k] === '{') depth++;
    else if (code[k] === '}' && !--depth) return code.slice(i, k + 1);
  }
  assert.fail(`${sig} never closes in ${where}`);
}

/* ── ① the panel's fallback record carries the state's real name, in both slots ────────────────── */
test('R429 ①: the compare panel names a former state instead of writing 「—」 over it', () => {
  const { win, HS } = histStates();
  const CODE = codeOnly(R('js/stats-compare.js'));
  const mini = new Function('window', '_histEntry',
    'return (' + lift(CODE, 'function _histMini(cd){', 'js/stats-compare.js') + ');',
  )(Object.assign(win, { IntMapHistStates: HS }), (cd) => (HS.STATES || []).find((S) => S.code === cd) || null);

  assert.ok(HS.STATES.length >= 19, `only ${HS.STATES.length} former states — the fixture stopped being the real table`);
  assert.ok(HS.STATES.every((S) => Array.isArray(S.name)), 'a row stopped carrying a tuple — this check would pass for the wrong reason');

  for (const S of HS.STATES) {
    const m = mini(S.code);
    assert.ok(m, `${S.code} has no fallback record at all`);
    assert.equal(m.nameEn, win.IntMapHistName(S.name, 0), `${S.code} lost its English name — the panel renders 「—」`);
    assert.equal(m.nameJp, win.IntMapHistName(S.name, 1), `${S.code} lost its Japanese name — the panel renders 「—」`);
    assert.ok(m.nameEn && m.nameJp, `${S.code}: nameEn=${m.nameEn} nameJp=${m.nameJp}`);
    assert.ok(Array.isArray(m.name), `${S.code} dropped the tuple — a per-language reader downstream falls to English`);
    assert.equal(m.flag, S.flag, `${S.code} lost its flag`);
  }
  assert.equal(mini('SUN').nameEn, 'Soviet Union');
  assert.equal(mini('SUN').nameJp, 'ソビエト連邦');
  assert.equal(mini('ZZZ'), null, 'a code that is not a former state must still resolve to null');
});

/* ── ② …and the symptom itself: what cName() prints for a state countryStats has dropped ──────── */
test('R429 ②: back at Now, with the entry gone from countryStats, the label is still the state', () => {
  const { win, HS } = histStates();
  const CODE = codeOnly(R('js/stats-compare.js'));
  /* the two shipped lines that produce the label, wired to an EMPTY countryStats — which is exactly
     what js/time-countries.js restore() leaves behind while the panel re-renders 380 ms later */
  const csSrc = /const _cs=\(cd\)=>[^\n;]+;/.exec(CODE);
  assert.ok(csSrc, 'the _cs fallback is gone from js/stats-compare.js');
  const cs = new Function('window', 'countryStats', '_histEntry',
    lift(CODE, 'function _histMini(cd){', 'js/stats-compare.js') + '\n' + csSrc[0] + '\nreturn _cs;',
  )(Object.assign(win, { IntMapHistStates: HS }), {}, (cd) => (HS.STATES || []).find((S) => S.code === cd) || null);

  /* the shipped renderer for a country's name, in the reader's language */
  const BODY = codeOnly(R('js/app-body.js'));
  const cnSrc = /const cName=\(s,f\)=>\{[\s\S]*?\n  \};/.exec(BODY);
  assert.ok(cnSrc, 'cName is gone or was reshaped in js/app-body.js');
  const cName = (lang) => new Function('currentLang', 'window', cnSrc[0] + '\nreturn cName;')(lang, {});

  for (const S of HS.STATES) {
    for (const lang of ['en', 'jp', 'de']) {
      const label = cName(lang)(cs(S.code));
      assert.notEqual(label, '—', `${S.code} still renders as 「—」 in ${lang} — chip, bars, both table headers and the legend`);
      assert.ok(label && label !== S.code, `${S.code} in ${lang} rendered as ${JSON.stringify(label)}`);
    }
  }
  assert.equal(cName('en')(cs('SUN')), 'Soviet Union');
  assert.equal(cName('jp')(cs('SUN')), 'ソビエト連邦');
  assert.equal(cName('de')(cs('SUN')), 'Soviet Union', 'a language with no slot in the record falls to English, as it does for a live country');
});
