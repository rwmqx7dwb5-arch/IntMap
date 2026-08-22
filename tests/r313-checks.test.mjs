/* ============================================================================
 *  IntMap · #R313 — source-level checks
 * ----------------------------------------------------------------------------
 *  Eight reports in one message:
 *    ①「風レイヤーの凡例に、パーティクルをオンオフできるトグルを付けて。」
 *    ②「Atlasにはプリセットの送信文が用意されていますが、それは今地図で見ている地域に応じて
 *        用意して変えるようにして。（追記：いや、汎用文でごまかすな。）」
 *    ③「Atlas, ユーザーに選択肢から選んでの回答求めるUIがあると思いますが、ユーザーが回答したら、
 *        そのUIは消してください。…きいた文章とユーザーの回答自体はそのままでいいけど、選択する
 *        ためのUIはいらない」
 *    ④「レイヤーカテゴリの見出しをもっと大きく目立つ感じにしろ。」
 *    ⑤「EU membersレイヤーをオンにしたら、自動的にEUに行くように。」
 *      →「いや、それを言ったらアメリカ大統領選挙もですよね？EUも、ウクライナも、両方自動で行くように。」
 *    ⑥「ChronosのTimeの時刻表示してるところに、日付も書くように。」
 *    ⑦「MeasureとShareは、もう一方を開いているときに、もう一方をおしたら、これまで開いてたものが
 *        消えて、新しくクリックした方が展開されるように。」
 *    ⑧「AtlasのThinkingとかSearchingとかのUI、ChatGPTと同じグラフィックにしてください。」
 *
 *  ⚠ EVERY ASSERTION BELOW IS A RELATION BETWEEN TWO PLACES IN THE REPOSITORY, NOT A SPELLING.
 *  Twenty-five rounds running, a legitimate change has been turned red by a check that pinned a
 *  literal. So ① asks 「do the legend switch, Atlas's dispatch and Atlas's inline toggle all call the
 *  SAME published function」, ② asks 「is the pool bigger than the four constants it replaced, and
 *  does the redraw key name every fact the pool reads」, ⑤ asks 「is the set of layers allowed to
 *  move the camera the same set the constitution claims」, and ⑧ asks the cancel-scan and the
 *  placeholder builder about each other. None can be satisfied by copying a number into this file.
 *
 *  ⚠ AND EVERY READ GOES THROUGH `code()`. This project's comments QUOTE the spellings they
 *  replaced — #R313's own notes name the bouncing-dot class it removed — so a check that greps the
 *  raw file proves nothing. That mistake has been made eight times; it was made once more while
 *  writing this file, and caught by the assertion below.
 *
 *  ⚠ AND EVERY READ GOES THROUGH `readLF()` (#R283, scripts/eol.mjs). Line endings belong to
 *  the CHECKOUT, not to the file: js/layer-home.js is `i/lf w/crlf`, so ⑤'s lift-out pattern
 *  `/function bboxOfFC[\s\S]*?\n  \}\n/` — which demands a BARE line break after the closing
 *  brace — could not match on a Windows working copy and could not fail on Linux: red here,
 *  green in CI, for a reason that has nothing to do with the camera. Third time this defect has
 *  been paid for; the fix is the READER, never the pattern. tests/r283-checks ② names this file.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readLF(resolve(ROOT, p));
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══════════════════════════════════════════════════════════════════════════
   ① the wind legend's particle switch
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 ① the particle switch is one published function, and the legend / Atlas dispatch / Atlas inline toggle all go through it', () => {
  const wx = code('js/weather.js');
  const at = code('js/atlas-console.js');

  /* the module publishes exactly one door in and one door out */
  assert.match(wx, /particles\s*:\s*partsAreOn/, 'window.Wind publishes a particle READ');
  assert.match(wx, /setParticles\s*:\s*setParts/, 'window.Wind publishes a particle WRITE');

  /* the legend box does not hold the state — it reports to the module */
  assert.match(wx, /id="wind-parts-sw"/, 'the legend body builds the switch');
  assert.match(wx, /wind-parts-sw'\s*\);?\s*[\s\S]{0,120}?setParts\(\s*psw\.checked\s*\)/,
    'and its change handler calls the module, rather than flipping a local flag');

  /* ⚠ THE REAL QUESTION: is the animation gated on BOTH switches? A canvas hidden while the frame
     loop keeps running is not "off" — the reader asked for the work to stop. */
  const apply = wx.slice(wx.indexOf('function _applyParts'), wx.indexOf('function partsAreOn'));
  assert.ok(apply.length > 40, '_applyParts exists');
  assert.match(apply, /on\s*&&\s*partsOn/, 'it draws only when the LAYER and the PARTICLES are both on');
  assert.match(apply, /cancelAnimationFrame/, 'and it stops the frame loop, not just the canvas');
  assert.match(apply, /display\s*=\s*'none'/, 'and hides the canvas');

  /* ⚠ start() must not re-show the canvas behind the switch's back */
  const start = wx.slice(wx.indexOf('function start()'), wx.indexOf('function _applyParts'));
  assert.ok(!/cv\.style\.display\s*=\s*'block'/.test(start),
    'start() does not force the canvas visible — _applyParts owns that decision');
  assert.match(start, /_applyParts\(\)/, 'start() defers to it');

  /* CLAUDE.md §3-3: a feature reaches Atlas in the SAME change — catalogue, dispatch and controls */
  assert.match(at, /case\s*'windParticles'/, 'Atlas can dispatch it');
  assert.match(at, /windParticles[\s\S]{0,400}?window\.Wind[\s\S]{0,40}?setParticles/,
    'and the dispatch calls the SAME published function the legend does');
  assert.match(at, /"type"\s*:\s*"windParticles"/, 'and the planner is told the capability exists');
  assert.match(at, /windParticles\s*:\s*\{\s*lbl\s*:/, 'and a reply can carry the switch inline');
});

/* ══════════════════════════════════════════════════════════════════════════
   ② the Atlas starter chips are chosen by facts, not filled in from four templates
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 ② the chips are a fact-gated pool, every candidate is reachable by the i18n gate, and the redraw key names every fact the pool reads', () => {
  const ex = code('js/atlas-examples.js');

  /* ⚠ THE COMPLAINT WAS 「汎用文でごまかすな」 — four sentences with a name substituted in. The test
     of that is not the wording, it is whether the SET of questions can differ between two regions.
     It can only differ if there are more candidates than slots, and if each carries a predicate. */
  const cands = ex.match(/\{\s*k\s*:\s*'[^']+'\s*,\s*w\s*:/g) || [];
  assert.ok(cands.length >= 20,
    'the pool is far larger than the four chips it fills (' + cands.length + ' candidates)');

  /* every candidate is gated on something. A candidate with no predicate is a constant again. */
  const withOn = ex.match(/\{\s*k\s*:\s*'[^']+'\s*,\s*w\s*:\s*\d+\s*,\s*on\s*:/g) || [];
  assert.equal(withOn.length, cands.length,
    'every candidate carries an `on` predicate — none of them is unconditional-by-omission');

  /* at least half the predicates must read MEASURED data rather than "does a country exist here",
     or the pool would be four templates again wearing a longer coat */
  const measured = (ex.match(/on\s*:\s*\(f\)\s*=>\s*f\.st\s*&&\s*(hi|lo)\(/g) || []).length
                 + (ex.match(/on\s*:\s*\(f\)\s*=>\s*f\.st\s*&&\s*f\.has\(/g) || []).length;
  assert.ok(measured >= 10,
    'most candidates are gated on a rank in countryStats or on a layer the reader switched on (' + measured + ')');

  /* ⚠ #R309's OWN DEFECT, RE-ASSERTED: scripts/i18n-report.mjs drops any L() whose first argument is
     not a string literal, so a chip built from an array reads English in four languages while the
     gate reports 100 %. Every candidate's text must therefore be an L( 'literal', … ). */
  const texts = ex.match(/t\s*:\s*\(\)\s*=>\s*L\(/g) || [];
  assert.equal(texts.length, cands.length, 'every candidate produces its text through a plain L() call');
  assert.ok(!/L\(\s*\[/.test(ex), 'and no L() is handed an ARRAY (the shape #R309 removed)');

  /* the ranks come from the table, not from thresholds typed here — and they exclude the
     non-sovereign features js/countries-ui.js flags, or a shoal could outrank a country */
  assert.match(ex, /sov\s*!==\s*false/, 'ranking is over sovereign states only');

  /* ⚠ THE GUARD HAS TO KNOW EVERYTHING THE POOL READS. #R309's key was country+language; a pool
     that also reads the layer set and the clock would keep yesterday's chips after a layer toggle. */
  const key = ex.slice(ex.indexOf('function exKey'), ex.indexOf('function renderExamples'));
  assert.match(key, /HOST\.lang/, 'the redraw key names the language');
  assert.match(key, /f\.code/, '…the country');
  assert.match(key, /f\.live|f\.year/, '…where Chronos is');
  assert.match(key, /layers/, '…and which layers are on');

  /* and those two extra facts have to actually reach the redraw */
  const wire = ex.slice(ex.indexOf('function _wireExampleCamera'));
  assert.match(wire, /IntMapTime[\s\S]{0,40}\.on\(/, 'a Chronos move redraws the chips');
  assert.match(wire, /addEventListener\('change'/, 'and so does a layer toggle');
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ the choice UI disappears once it has been answered — the question does not
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 ③ all three ways of answering remove the picker, and only the picker', () => {
  const at = code('js/atlas-console.js');

  /* the picker is wrapped where it is built … */
  assert.match(at, /class="atl-choice-ui"/, 'the chips + free-text box are wrapped as one node');
  /* … and the question is written BEFORE that wrapper opens, so removing the wrapper cannot take it */
  const qAt = at.indexOf("Which one?");
  const wrapAt = at.indexOf('class="atl-choice-ui"');
  assert.ok(qAt > -1 && wrapAt > -1 && qAt < wrapAt,
    'the question text is emitted before the wrapper opens — 「きいた文章…はそのままでいい」');

  /* one remover, and every door calls it */
  assert.match(at, /function _choiceAnswered\(el\)\s*\{[\s\S]{0,200}?atl-choice-ui[\s\S]{0,60}?remove\(\)/,
    'there is exactly one function that takes the picker away, and it removes rather than disables');
  const doors = at.match(/_choiceAnswered\(/g) || [];
  assert.ok(doors.length >= 4,
    'the definition plus all three answer paths (chip / send button / Enter) call it (' + doors.length + ')');

  for (const door of ['atl-choice\'', 'atl-choice-go', 'atl-choice-in']) {
    const i = at.indexOf(door);
    assert.ok(i > -1, door + ' is still a live selector');
  }
  /* ⚠ each handler reaches the remover BEFORE it sends the answer. The check is a window around the
     handler's own selector rather than "a line containing both": the selector and the branch that
     uses it sit on different lines here, so a line-shaped test would be measuring where the source
     happens to break rather than what it does. */
  for (const [sel, what] of [["closest('.atl-choice')", 'the chip handler'],
                             ["closest('.atl-choice-go')", 'the send-button handler'],
                             ["closest('.atl-choice-in')", 'the Enter handler']]) {
    const i = at.indexOf(sel);
    assert.ok(i > -1, what + ' exists');
    const win = at.slice(i, i + 460);
    const rm = win.indexOf('_choiceAnswered');
    const go = win.indexOf('run(');
    assert.ok(rm > -1, what + ' removes the picker');
    assert.ok(go > -1 && rm < go, what + ' removes it before sending the answer');
  }
});

/* ══════════════════════════════════════════════════════════════════════════
   ④ the layer category headings read as titles, on both surfaces
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 ④ both copies of the section heading moved together, and the phone is not left behind', () => {
  const ui = read('js/map-ui.js');           /* the CSS lives inside a JS string here */
  const css = read('css/intmap.css');

  const desk = /#layer-sidebar-r \.lst-sech\{([^}]*)\}/.exec(ui);
  assert.ok(desk, 'the desktop rule exists');
  const phone = /\.m-sheet \.lsr-mount \.lst-sech\{([^}]*)\}/.exec(css.replace(/\s*\n\s*/g, ''));
  assert.ok(phone, 'the phone rule exists');

  const sizeOf = (s) => { const m = /font-size:\s*([\d.]+)px/.exec(s); return m ? parseFloat(m[1]) : NaN; };
  const weightOf = (s) => { const m = /font-weight:\s*(\d+)/.exec(s); return m ? parseInt(m[1], 10) : NaN; };

  /* ⚠ THE ASSERTION IS 「BIGGER AND HEAVIER THAN #R108 LEFT THEM」, NOT 「EQUALS 17」. #R108's own
     comment said 「slightly larger, not bold」 and 13.5/500 is the state the reader rejected. */
  assert.ok(sizeOf(desk[1]) > 13.5, 'the desktop heading grew past what #R108 set (' + sizeOf(desk[1]) + 'px)');
  assert.ok(sizeOf(phone[1]) > 13.5, 'and so did the phone sheet (' + sizeOf(phone[1]) + 'px)');
  assert.ok(weightOf(desk[1]) >= 700, 'the desktop heading is bold now');
  assert.equal(weightOf(phone[1]), weightOf(desk[1]), 'the two surfaces agree about weight');

  /* the phone sheet is 24 px narrower, so it may be one step smaller — but never larger */
  assert.ok(sizeOf(phone[1]) <= sizeOf(desk[1]),
    'the phone heading is not larger than the desktop one');

  /* the chevron and the count pill sit beside a TITLE now, so they had to scale with it */
  const chevD = /#layer-sidebar-r \.lst-sech \.lst-chev\{([^}]*)\}/.exec(ui);
  assert.ok(chevD && parseFloat(/width:\s*([\d.]+)px/.exec(chevD[1])[1]) > 7,
    'the chevron grew with the heading it sits next to');
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑤ the layers allowed to move the camera are one table, and the constitution says so
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 ⑤ exactly one file moves the camera on a layer toggle, and it is the file the constitution names', () => {
  assert.ok(existsSync(resolve(ROOT, 'js/layer-home.js')), 'the table exists');
  const home = code('js/layer-home.js');
  const con = read('CONSTITUTION.md');

  /* the constitution no longer states a rule the code breaks — it names the exception and its file */
  assert.match(con, /js\/layer-home\.js/, 'CONSTITUTION §3 names the one file that holds the exception');
  assert.match(con, /1px/, 'and still says every other layer must not move the view');

  /* ⚠ THE PREVIOUS STATE OF THE WORLD: js/us-elections.js carried a bare fitBounds, which is the copy
     a fourth layer would have become a fifth of. The check is that no layer file has its own. */
  for (const f of ['js/us-elections.js', 'js/beta-overlays.js', 'js/data-layers.js']) {
    const src = code(f);
    assert.ok(!/camera\.fitBounds\(\s*\[\[/.test(src),
      f + ' does not carry its own hard-coded frame — it asks IntMapLayerHome');
    assert.match(src, /IntMapLayerHome[\s\S]{0,40}arrive\(/, f + ' goes through the one table');
  }

  /* the three ids in the table are ids the app really uses, not ids somebody typed */
  const ids = [...home.matchAll(/HOMES\['([^']+)'\]/g)].map((m) => m[1]);
  assert.deepEqual(ids.sort(), ['beta-dl-ukrfront', 'dl-eu', 'dl-uselect']);
  const previews = read('js/layer-previews.js');
  for (const id of ids) {
    const used = previews.includes("'" + id + "'")
      || code('js/data-layers.js').includes(id)
      || code('js/beta-overlays.js').includes(id)
      || code('js/us-elections.js').includes(id);
    assert.ok(used, id + ' is a checkbox id the app actually has');
  }

  /* ⚠ ONCE PER SESSION, AND NOT ON A RESTORE. Both halves have to be real: the flag, and the mark
     the session restore leaves behind — and the two files must agree on the mark's spelling. */
  assert.match(home, /flown\[cbId\]/, 'it flies once per session');
  const mark = /__imRestored/;
  assert.match(home, mark, 'and it looks for the restore mark');
  assert.match(code('js/session-tabs.js'), mark,
    'which js/session-tabs.js actually sets — the same spelling, or the guard is decorative');

  /* the EU frame is measured from the layer's own geometry, and the module that paints it publishes it */
  assert.match(home, /IntMapEuFC/, 'EU is framed from the collection the layer paints');
  assert.match(code('js/data-layers.js'), /window\.IntMapEuFC\s*=/, 'and that collection is published');
  assert.match(code('js/beta-overlays.js'), /window\.IntMapUkrFrontFC\s*=/, 'as is the frontline collection');

  /* it has to be imported, or none of the above runs */
  assert.match(read('src/main.js'), /js\/layer-home\.js/, 'and the module is imported');

  /* ⚠⚠ MEASURED IN THE BROWSER, AND WRONG THE FIRST TIME. `IntMapEuFC()` returns 28 features for 27
     members: Natural Earth carries France as TWO features under the same code, and the second one is
     Clipperton Island (109.22 W, 10.30 N). Picking the biggest polygon per FEATURE still let that
     one-polygon feature through, and the EU frame came out [[-109.23,10.28],[33.70,70.08]] — a view
     of the eastern Pacific. The pick has to be per COUNTRY CODE. This runs the shipped function over
     exactly that shape rather than trusting the comment beside it. */
  /* ⚠ (#R313 追記) `\n  }\n` DID NOT SURVIVE A CRLF CHECKOUT. This passed on the worktree that wrote
     the file with LF and went red the moment git handed the same file back with CRLF — #R283's defect
     exactly, and it would have been green in CI and red on Windows for ever. Line endings are not part
     of the property being asserted, so the pattern must not care about them. */
  const fnSrc = /function bboxOfFC[\s\S]*?\r?\n {2}\}\r?\n/.exec(read('js/layer-home.js'));
  assert.ok(fnSrc, 'bboxOfFC is a named function this test can lift out');
  const bboxOfFC = new Function('return (' + fnSrc[0].replace('function bboxOfFC', 'function') + ')')();
  const ring = (w, s2, e, n) => [[[w, s2], [e, s2], [e, n], [w, n], [w, s2]]];
  const fc = { features: [
    { id: 'FRA', properties: { __code: 'FRA' }, geometry: { type: 'MultiPolygon', coordinates: [ring(-5, 42, 8, 51)] } },
    { id: 'FRA', properties: { __code: 'FRA' }, geometry: { type: 'Polygon', coordinates: ring(-109.25, 10.27, -109.19, 10.32) } },
    { id: 'FIN', properties: { __code: 'FIN' }, geometry: { type: 'MultiPolygon', coordinates: [ring(20, 59, 31, 70)] } },
  ] };
  const framed = bboxOfFC(fc, true);
  assert.ok(framed[0][0] > -20, 'the EU frame does not reach the eastern Pacific (west = ' + framed[0][0] + ')');
  assert.ok(framed[0][1] > 30, 'nor down to the tropics (south = ' + framed[0][1] + ')');
  assert.deepEqual(bboxOfFC(fc, false)[0], [-109.25, 10.27],
    'and without the flag it still reports the true extent — the grouping is a CHOICE, not a bug fix that hides data');
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑥ Chronos' Time tab names the day as well as the hour
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 ⑥ the date is a second element, formatted by the same function the Date tab uses', () => {
  const ntl = code('js/news-timeline.js');
  const html = read('index.html');
  const css = read('css/intmap.css');

  assert.match(html, /id="ntl-bigdate"/, 'the markup carries a date line');
  assert.match(html, /class="ntl-valcol"/, 'inside a column beside the "back to now" button');
  assert.match(css, /\.ntl-bigdate\{/, 'and it is styled');
  assert.match(css, /\.ntl-bigdate:empty\{\s*display:none/, 'and takes no room when empty');

  /* ⚠ #ntl-bigval STAYS THE TIME ALONE. tests/smoke.spec.js reads that element to prove the panel
     prints the instant it was set to; folding the date into it would have broken that proof, and
     the 26 px box has `text-overflow:ellipsis`, so it would have TRUNCATED rather than wrapped. */
  const timeBranch = ntl.slice(ntl.indexOf("if(mode==='time')"), ntl.indexOf('else if(e.isLive)'));
  assert.match(timeBranch, /bigval\.textContent\s*=\s*_hm\(w\)/, 'the big value is still HH:MM only');
  assert.match(timeBranch, /bigdate\.textContent\s*=\s*_dateText\(w\)/,
    'and the date goes to its own element, through the SAME formatter the Date tab uses');

  /* one formatter, so the two tabs cannot name different days for one instant */
  const dt = ntl.slice(ntl.indexOf('function _dateText'), ntl.indexOf('function _dateText') + 400);
  assert.match(dt, /zFields\(/, '_dateText resolves the day in the zone the reader chose');

  /* Year and Date modes do not carry a second line — they already ARE the date */
  const rest = ntl.slice(ntl.indexOf('else if(e.isLive)'));
  assert.ok((rest.match(/bigdate\.textContent\s*=\s*''/g) || []).length >= 2,
    'both non-time branches clear it');

  /* the smoke test that reads #ntl-bigval is still asking for the time ALONE — which is the whole
     reason the date went into a second element instead of being appended to this one */
  const smoke = read('tests/smoke.spec.js');
  assert.match(smoke, /getElementById\('ntl-bigval'\)/, 'the smoke test still reads that element');
  assert.match(smoke, /r\.shown[^\n]*toBe\('14:30'\)/,
    'and still proves it is exactly the time it was set to');
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑦ Measure and Share are one choice
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 ⑦ opening one menu closes the other, and one function knows the set', () => {
  const ab = code('js/app-body.js');

  assert.match(ab, /window\._closeMapMenus\s*=\s*function\(except\)/, 'one function owns the set');
  const set = ab.slice(ab.indexOf('window._closeMapMenus'), ab.indexOf('window._closeMapMenus') + 420);
  assert.match(set, /_closeMeasureMenu/, 'and it knows about Measure');
  assert.match(set, /_closeShareMenu/, 'and about Share');

  /* ⚠ BOTH TRIGGERS MUST GO THROUGH IT. Two private "close the other one" lines would drift the
     moment a third menu is added — which is the shape this repo has paid for before. */
  const calls = ab.match(/_closeMapMenus\('(measure|share)'\)/g) || [];
  assert.deepEqual(calls.sort(), ["_closeMapMenus('measure')", "_closeMapMenus('share')"],
    'each trigger calls it, naming itself as the one to keep open');

  /* the reason it was needed: both triggers stop propagation, so neither reaches the other's
     document-level click-away listener. If that ever stops being true this test should be revisited. */
  assert.ok((ab.match(/e\.stopPropagation\(\);\s*window\._closeMapMenus/g) || []).length === 2,
    'and it is called on the same click that stops propagating');
});

/* ══════════════════════════════════════════════════════════════════════════
   ⑧ the progress indicator is ChatGPT's shimmer
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 ⑧ one indicator, shimmering the label itself, and every selector that means "still working" names it', () => {
  const at = code('js/atlas-console.js');
  /* ⚠ the panel's stylesheet is js/atlas-styles.js since this round — the kernel's line ceiling is
     never raised, so a subject left instead. The RULES are asked of that file; the MARKUP and the
     selectors that scan for a working bubble are asked of the kernel. */
  const css = code('js/atlas-styles.js');

  /* the old graphic is gone from the CODE. ⚠ read through code(): #R313's own comments name it. */
  assert.ok(!/atl-dots/.test(at + css), 'no live reference to the bouncing-dot element remains');
  assert.ok(!/atlDot\b/.test(at + css), 'nor to its keyframes');

  /* the technique measured on chatgpt.com: a gradient clipped to the glyphs, swept by an animation */
  assert.match(css, /#atlas-panel \.atl-stage\{/, 'the stage label has its own rule');
  for (const part of ['background-clip:text', '-webkit-text-fill-color:transparent',
                      'background-size:50% 200%', 'animation:atlShimmer']) {
    assert.ok(css.includes(part), 'the shimmer keeps ' + part);
  }
  assert.match(css, /@keyframes atlShimmer\{0%\{background-position:-100% 0;\}100%\{background-position:250% 0;\}\}/,
    'and the sweep runs the same span the measured stylesheet uses');

  /* ⚠ THE BAND MOVES TOWARD THE PAGE, NOT AWAY FROM IT — which is why it needs a per-theme value.
     One literal in both themes would be a highlight, a different effect using the same technique. */
  assert.match(css, /#atlas-panel\{--atl-shimmer-band:/, 'a light-theme band');
  assert.match(css, /\[data-theme="dark"\] #atlas-panel\{--atl-shimmer-band:/, 'and a dark-theme band');
  assert.notEqual(
    /#atlas-panel\{--atl-shimmer-band:([^;}]+)/.exec(css)[1],
    /\[data-theme="dark"\] #atlas-panel\{--atl-shimmer-band:([^;}]+)/.exec(css)[1],
    'and they are not the same colour');

  /* a transparent text-fill with no animation is an invisible word */
  assert.match(css, /prefers-reduced-motion:reduce\)\{#atlas-panel \.atl-stage\{[^}]*animation:none[^}]*text-fill-color:currentColor/,
    'reduced motion stops the sweep AND gives the glyphs their colour back');

  /* ⚠ THE MARKER AND THE SCAN MUST BE THE SAME SPELLING. The cancel pass looks for bubbles that are
     still working; it used to look for the dot element that stageDots emitted. */
  const emitted = /class="(atl-stage)"/.exec(at);
  assert.ok(emitted, 'stageDots emits a marker class');
  const scans = at.match(/\.atl-b\.a \.([a-z-]+)/g) || [];
  assert.ok(scans.length >= 2, 'the cancel pass runs in both places it used to');
  scans.forEach((s) => assert.ok(s.endsWith(emitted[1]), s + ' names the class stageDots emits'));

  /* setStage must test for the same marker, or a late stage change would clobber a finished reply */
  assert.match(at, /function setStage\([^)]*\)\s*\{[\s\S]{0,160}?querySelector\('\.atl-stage'\)/,
    'setStage is still a no-op once real content has replaced the placeholder');

  /* ⚠ AND NO PLACEHOLDER IS EMITTED WITHOUT A WORD. Six call sites used to inline a bare dot span
     with no label — the same indicator wearing no name — so leaving them would have kept two
     graphics for one state, which is the thing being removed. They go through stageDots() now,
     which is why it has many callers. The check counts callers rather than forbidding
     `bubble('a','<…')` outright: two of those are finished CONTENT, not placeholders. */
  const callers = (at.match(/stageDots\(/g) || []).length;
  assert.ok(callers >= 9,
    'every pending bubble is built by stageDots(), so there is one indicator in the app (' + callers + ' uses)');
});
