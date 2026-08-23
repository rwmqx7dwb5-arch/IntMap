/* ============================================================================
 *  IntMap · #R378 — source-level checks
 * ----------------------------------------------------------------------------
 *  「Chronosポップアップに、年/日付/時刻の下に置くのではなく外に、直接年月日時選ぶとこ作って。
 *    （よくあるUI。独自UIを作らなくてよい。）」
 *
 *  ⚠ THE PROPERTY IS 「OUTSIDE」, AND «THE ELEMENT EXISTS» IS NOT IT. A datetime field added as a
 *  fourth mode, or shown only in one tab, would satisfy every check that merely finds it in the
 *  markup — and it is exactly the shape the instruction rules out. So the assertions here are about
 *  where the control is NOT: not inside `#ntl-modes`, never named by `applyMode`, and written on the
 *  common path of `refreshUI` rather than inside one of its three branches.
 *
 *  ⚠ AND «IT IS THE BROWSER'S OWN CONTROL» IS ASSERTED AS A TYPE, NOT AS A LOOK. 「独自UIを作らなく
 *  てよい」 — `type="datetime-local"` is the whole of it; a hand-rolled set of <select>s would pass a
 *  check that only looked for three number fields.
 *
 *  ⚠ EVERY SOURCE READ GOES THROUGH `readLF()` (#R283) and every code assertion through `codeOnly()`
 *  (#R345, scripts/code-only.mjs): this project's comments QUOTE the spellings they discuss, so a
 *  check that greps the raw file can be answered by the prose above rather than by the code — which
 *  has now happened eleven times.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const code = (p) => codeOnly(read(p));

/* the body of a named function declaration, brace-counted — so «applyMode never mentions it» is a
   statement about that function and not about whatever happens to follow it in the file */
function fnBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, `function ${name} not found`);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(j, k + 1); }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

/* ══════════════════════════════════════════════════════════════════════════
   ① the control exists, it is the platform's own, and it is NOT one of the tabs
   ═══════════════════════════════════════════════════════════════════════ */
test('R378 ① the direct picker is a native datetime-local, outside the Year/Date/Time tab strip', () => {
  const html = read('index.html');

  assert.match(html, /<input type="datetime-local" id="ntl-jump"/,
    '「独自UIを作らなくてよい」 — the year/month/day/hour picker is not the browser’s own control');
  assert.match(html, /<label class="ntl-jumprow" for="ntl-jump">/,
    'the row is a <label for>, so the text beside the field focuses it without a second aria string');

  /* ⚠ NOT INSIDE THE TAB STRIP. `#ntl-modes` is the three buttons; a fourth control in there would
     be 「年/日付/時刻の下」 in the most literal sense available. */
  const modes = /<div class="ntl-modes"[\s\S]*?<\/div>/.exec(html);
  assert.ok(modes && !/ntl-jump/.test(modes[0]), 'the picker is inside the tab strip');

  /* …and it stands in the panel's ALWAYS-VISIBLE band — above `#ntl-date` and `#ntl-time`, the two
     inputs that really are owned by a tab */
  const at = (s) => html.indexOf(s);
  assert.ok(at('id="ntl-jump"') > at('id="ntl-zone"'), 'the picker does not sit with the other panel-wide row');
  assert.ok(at('id="ntl-jump"') < at('id="ntl-date"'), 'the picker sits below the tab-scoped inputs');

  /* ⚠ AND THE TAB-SCOPED INPUTS ARE STILL TAB-SCOPED. 「外に」 is answered by adding a row that no
     tab owns, NOT by making every row always-visible — that would be a different panel. */
  const js = code('js/news-timeline.js');
  const am = fnBody(js, 'applyMode');
  assert.match(am, /datePicker\.style\.display=\(m==='date'\)/, 'the Date tab stopped owning its own picker');
  assert.match(am, /timePicker\.style\.display=\(m==='time'\)/, 'the Time tab stopped owning its own picker');
});

/* ══════════════════════════════════════════════════════════════════════════
   ② no mode decides whether it is there, and no branch decides whether it is current
   ═══════════════════════════════════════════════════════════════════════ */
test('R378 ② applyMode never names the picker, and refreshUI writes it on the path every mode takes', () => {
  const js = code('js/news-timeline.js');

  /* ⚠ THE STRUCTURAL FORM OF 「タブの下ではなく外に」: the function that switches tabs cannot so
     much as mention this control. If it ever does, the row has acquired an owner. */
  assert.ok(!/jumpEl/.test(fnBody(js, 'applyMode')),
    'applyMode names the direct picker — it has become a tab-scoped control');

  /* refreshUI has three branches (time / live / a chosen past instant). The picker is written after
     them, beside buildZones(), which is the only place that runs whatever the mode is. */
  const ru = fnBody(js, 'refreshUI');
  assert.match(ru, /buildZones\(\);\s*if\(jumpEl\)\{ const lo=/,
    'the picker is not written on the common path — some mode decides whether it is current');
  assert.equal((ru.match(/jumpEl\.value=/g) || []).length, 1, 'more than one place writes the field');

  /* the reader typing a year walks the value through instants the kernel clamps; a control reset
     under the caret cannot be typed into at all */
  assert.match(ru, /document\.activeElement!==jumpEl/, 'the field is rewritten while it has focus');
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ the two halves a native control cannot know: which zone, and which instants
   ═══════════════════════════════════════════════════════════════════════ */
test('R378 ③ the wall clock it shows is the zone the reader chose, and its bounds are the kernel’s and the model’s', () => {
  const js = code('js/news-timeline.js');

  /* ⚠ `datetime-local` carries NO zone. #R289's whole point is that this panel prints and reads an
     instant in the zone the reader picked, so both directions go through that pair — a bare
     `new Date(value)` here would mean 「the device's 14:30」 whatever the selector says. */
  assert.match(js, /function jumpValue\(d\)\{ const f=zFields\(d\);/, 'the field is printed without the chosen zone');
  assert.match(js, /function jumpParse\([\s\S]*?zInstant\(\{Y:Y,/, 'the field is read back without the chosen zone');
  assert.ok(!/new Date\(jumpEl\.value/.test(js), 'the value is parsed as a device-local string');

  /* the floor is the kernel's and is read live — #R349 removed four copies of `1900` from this file
     for exactly this reason, and a fifth copy would be the same defect */
  assert.match(js, /const floorMs=\(\)=>Date\.UTC\(YMIN\(\),0,1\)/, 'the floor is not the kernel’s');
  assert.match(js, /if\(Y<YMIN\(\)\) return new Date\(floorMs\(\)\)/,
    'a year still being typed ("0019") is not clamped — `new Date(19,…)` is 1919, a real wrong instant');

  /* ⚠ ONE STATEMENT OF THE FORWARD REACH. The date picker names days and this one names hours; if
     each computed its own ceiling the panel could offer two different futures. */
  assert.match(js, /function fcMaxMs\(\)\{/, 'the reach is not stated as an instant');
  assert.match(js, /function fcMaxISO\(\)\{ return ymdISO\(new Date\(fcMaxMs\(\)\)\); \}/,
    'the day form of the reach is a second statement of it rather than a derivation');
  assert.equal((js.match(/fcMs\(n-1\)/g) || []).length, 1, '「the model’s last valid time」 is computed in more than one place');
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ what it does to the clock: one write per burst, and it may name a future instant
   ═══════════════════════════════════════════════════════════════════════ */
test('R378 ④ the picker writes the master clock, debounced, and is allowed to reach the future its own max offers', () => {
  const js = code('js/news-timeline.js');

  /* it writes the ONE clock, like every other input in this panel — no second time state */
  assert.match(js, /function jumpCommit\(\)\{[\s\S]*?window\.IntMapTime\.set\(/, 'the picker does not write the master clock');
  assert.match(js, /Math\.min\(d\.getTime\(\),fcMaxMs\(\)\)/, 'the picker is not clamped to the reach it advertises');

  /* ⚠ WITHOUT `allowFuture` THE KERNEL TURNS ANY FUTURE INSTANT INTO LIVE (js/chronos.js), so a
     control whose `max` reaches the model's last hour would answer 「now」 for every hour past this
     one — silently, which is the shape #R268 and #R290 each had to remove. */
  assert.match(js, /window\.IntMapTime\.set\(new Date\(Math\.min\(d\.getTime\(\),fcMaxMs\(\)\)\),\{allowFuture:true,source:'ui'\}\)/,
    'the picker cannot reach the future its own max offers');

  /* a native date field edited from the keyboard emits a COMPLETE value per keystroke, so 1990
     arrives as 0001 / 0019 / 0199 / 1990 — one write per burst, not four */
  assert.match(js, /jumpTimer=setTimeout\(jumpCommit,320\)/, 'the write is not debounced');
  assert.match(js, /jumpEl\.addEventListener\('input',jumpQueue\)/, 'keyboard edits do not reach the clock');
  assert.match(js, /jumpEl\.addEventListener\('change',jumpQueue\)/, 'picker choices do not reach the clock');
  assert.match(js, /jumpEl\.addEventListener\('blur'/, 'leaving the field never reconciles it with the clock');
  assert.match(js, /if\(!jumpEl\.value\)\{ window\.IntMapTime\.setNow/, 'clearing the field does not return to live');
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ the row's one word is in all nine languages, and the native calendar follows the theme
   ═══════════════════════════════════════════════════════════════════════ */
test('R378 ⑤ the label is a nine-language string and the field is styled for both themes', () => {
  const js = code('js/news-timeline.js');
  assert.match(js, /jumpLbl\.textContent=L5\('Date & time','日時','Datum & Zeit','Дата и время','Fecha y hora'\)/,
    'the label is not a five-argument L5 call — the other four languages resolve through the inline tables');
  for (const f of ['fr', 'ko', 'zh', 'zh-hans']) {
    assert.match(read(`js/locales/ui.${f}.js`), /"Date & time":\s*"[^"]+"/, `ui.${f}.js does not carry the label`);
  }

  const css = read('css/intmap.css');
  assert.match(css, /\.ntl-jumprow\{/, 'the row is not styled');
  assert.match(css, /\.ntl-jump\{/, 'the field is not styled');
  /* ⚠ THE CALENDAR IS THE BROWSER'S, AND IT PAINTS ITSELF FROM `color-scheme`. Without this the
     native popup is a white sheet hanging off a dark panel — the same rule .ntl-date already has. */
  assert.match(css, /\[data-theme="dark"\] \.ntl-jump\{ color-scheme:dark; \}/,
    'the native calendar does not follow the dark theme');
  assert.match(css, /@media\(max-width:768px\)[\s\S]*?\.ntl-jump\{ font-size:11px/,
    'the compact body has no size for the field');
});
