/* ============================================================================
 *  js/atlas-console.js — what the reader is shown: reply headers, chips, menus, keys
 * ----------------------------------------------------------------------------
 *  The analyse reply opening with the prose (#R279), eight UI reports in one round (#R313), and one
 *  English key never carrying two meanings (#R370).
 *
 *  Consolidated from the round files named in each section banner below. Every test keeps the title
 *  it had there (untagged titles now carry the round they came from, #R<N>), and every section keeps
 *  its own history comment: why the check exists and what was measured. Each section is its own
 *  block, so its helpers stay its own; what every section shared (the repository root) is declared
 *  once below the imports.
 *
 *  Checks that used to READ a file for a spelling and can be RUN were rewritten to run the shipped
 *  code; the ones that still read say, in one line, why running is not possible (「read, not run: …」).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLF } from '../scripts/eol.mjs';
import { execFileSync } from 'node:child_process';

/* the repository root, shared by every section below (each used to derive its own) */
const ROOT = fileURLToPath(new URL('../', import.meta.url));

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r279-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · #R279 source checks
 * ----------------------------------------------------------------------------
 *  「いちいち Atlas の回答に、「🧭 統合分析」ってつけなくていいです」
 *
 *  Every integrated-analysis reply opened with a bold line that said «Integrated analysis» — on an
 *  answer that IS the integrated analysis. It carried no information the reader did not already
 *  have: the same three words, the same compass, on every single reply. It is gone; the prose is
 *  now the first thing in the reply.
 *
 *  ⚠ ASSERTIONS ARE ABOUT THE PROPERTY, NOT A LITERAL — the shape checked here is «the first thing
 *  assigned to the analyze reply's html is the prose», which survives restyling of that div.
 *  ⚠ COMMENTS ARE STRIPPED BEFORE ANY SEARCH. This round's own source comment quotes the removed
 *  label, so a check that read the raw file would fail on the sentence explaining the fix
 *  (「自分の検査が自分のコメントに当たる」, fourteen times now).
 *  ⚠ §① RUNS THE SAME PREDICATE ON A SYNTHETIC FILE CARRYING THE OLD SHAPE, so green here means
 *  «looked and found nothing», not «looked at nothing» (#R274 ③).
 * ==========================================================================*/

const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
const ATLAS = () => codeOnly(read('js/atlas-console.js'));

/* The analyze reply is built by appending to `html`; what OPENS it is whatever sits between the
   declaration and the call that renders the model's prose. Returns that opening text, or null when
   the reply is not built this way at all (which is itself a failure). */
const analyzeOpener = (src) => {
  /* ⚠ (#R350) THE BODY MARKER MOVED AND THE REQUIREMENT DID NOT. The analyse reply renders a
     STRUCTURE now — `renderAnswer(_env,_reg,…)` where it used to be `mdMini(String(txt).trim())` —
     and what #R279 asks is about whatever sits BEFORE that body, which is still nothing but the
     prose div. Both markers are recognised so ① can go on showing the check red against the old
     shape, which is the half that makes ② mean anything. */
  let body = src.indexOf('renderAnswer(_env,_reg,');
  if (body < 0) body = src.indexOf('mdMini(String(txt).trim())');
  if (body < 0) return null;
  const decl = src.lastIndexOf('let html=', body);
  if (decl < 0) return null;
  return src.slice(decl, body);
};

/* ── ① THE CHECK CAN GO RED ────────────────────────────────────────────────────────────────── */
const OLD_SHAPE = [
  "          let html='<div style=\"font-weight:600;margin:2px 0 5px;\">\uD83E\uDDED '+L('Integrated analysis','\u7d71\u5408\u5206\u6790','Integrierte Analyse')+'</div>';",
  "          html+='<div style=\"font-size:14px;line-height:1.68;\">'+mdMini(String(txt).trim())+'</div>';",
].join('\n');

test('R279 (1) the predicate names the old header when it is there', () => {
  const opener = analyzeOpener(OLD_SHAPE);
  assert.ok(opener, 'the synthetic old shape is still recognised as an analyze reply');
  assert.ok(/L\(/.test(opener), 'the old shape opens with a translated label — this is what regressing looks like');
});

/* ── ② AND THE REAL FILE OPENS WITH THE ANSWER ─────────────────────────────────────────────── */
test('R279 (2) the analyze reply opens with the prose, not with a label', () => {
  /* read, not run: the analyse reply is assembled inside the Atlas kernel (js/atlas-console.js), a
     closure over the whole HOST that only a browser can build; (1) proves the predicate can go red. */
  const opener = analyzeOpener(ATLAS());
  assert.ok(opener, 'the analyze reply still renders the model prose through mdMini');
  assert.ok(!/L\(/.test(opener), `the reply opens with a translated label again: ${opener}`);
  assert.ok(!/font-weight:600/.test(opener), `the reply opens with a heading again: ${opener}`);
  /* (#R494) the prose div is `class="atl-md"` now. It was an inline `style="font-size:14px;…"` that
     five call sites had to keep re-spelling identically — and the mobile size rule in
     js/atlas-styles.js matched it by that spelling, so the styling held only by agreement. */
  assert.match(opener, /class="atl-md"/, 'the prose div is the first thing in the reply');
});

test('R279 (3) the label itself is gone from the shipped console', () => {
  /* read, not run: the claim is an absence from the kernel's source (see (2)). */
  assert.ok(!/Integrated analysis/.test(ATLAS()), 'the «Integrated analysis» heading string is no longer emitted');
});

/* ── ③ AND NOTHING ELSE WAS TAKEN OUT ──────────────────────────────────────────────────────────
   The instruction was about ONE label. The other reply headers, and the compass that belongs to
   routing rather than to analysis, are untouched — a deletion that ran wide would show up here. */
test('R279 (4) the other reply headers are untouched', () => {
  /* read, not run: the kernel again (see (2)); the claim is that the other headers are still in its
     source. */
  const src = ATLAS();
  for (const kept of ['custom evaluation layer', 'related indicators (all countries)', 'Optimized order']) {
    assert.ok(src.includes(kept), `${kept} is still rendered`);
  }
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r313-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
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

const read = (p) => readLF(resolve(ROOT, p));
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ══════════════════════════════════════════════════════════════════════════
   ① the wind legend's particle switch
   ═══════════════════════════════════════════════════════════════════════ */
test('R313 ① the particle switch is one published function, and the legend / Atlas dispatch / Atlas inline toggle all go through it', () => {
  /* read, not run: the switch is wired across js/weather.js, the legend and the kernel — all
     browser-only DOM and map code; the claim is that every path names the one function. */
  const wx = code('js/weather.js');
  /* (#R318) the action catalogue moved to js/atlas-catalog-text.js and SYS() composes from it.
     The question below is unchanged; the read follows the answer to where it lives now. */
  const at = code('js/atlas-console.js') + '\n' + code('js/atlas-catalog-text.js');

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
  /* ⚠ (#R337) the condition moved INTO a named predicate, because there is now a second way the
     streaks can be wanted (the temperature legend — see tests/r337-checks ①). #R313's property is
     unchanged and is asserted where it now lives: the wind LAYER still draws its streaks only when
     both of ITS switches are on. */
  assert.match(apply, /if\(streaksWanted\(\)\)/, 'one predicate decides whether streaks are drawn');
  const wanted = wx.slice(wx.indexOf('function streaksWanted'), wx.indexOf('const PARTS_KEY'));
  assert.match(wanted, /on\s*&&\s*partsOn/, 'it draws only when the LAYER and the PARTICLES are both on');
  assert.match(apply, /cancelAnimationFrame/, 'and it stops the frame loop, not just the canvas');
  assert.match(apply, /display\s*=\s*'none'/, 'and hides the canvas');

  /* ⚠ start() must not re-show the canvas behind the switch's back */
  const start = wx.slice(wx.indexOf('function start()'), wx.indexOf('function _applyParts'));
  assert.ok(!/cv\.style\.display\s*=\s*'block'/.test(start),
    'start() does not force the canvas visible — _applyParts owns that decision');
  assert.match(start, /_applyParts\(\)/, 'start() defers to it');

  /* AGENTS.md §3-3: a feature reaches Atlas in the SAME change — catalogue, dispatch and controls */
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
  /* read, not run: the pool lives inside the examples factory, and the i18n gate reads L('literal', …)
     spellings — the form of the source IS what that gate can see. */
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
  /* read, not run: the picker is built and removed by the kernel's DOM code, which only a browser can
     drive. */
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

  /* the ids in the table are ids the app really uses, not ids somebody typed.
     ⚠ (#R337) 「NATO membersレイヤーをオンにしたら、自動的にNATOに行くように。」 added a fourth. The
     list is UPDATED rather than loosened: the point of this assertion is that the exception stays a
     NAMED set the constitution can enumerate, so it has to go red when the set changes.
     ⚠ (#R588) …and a fifth, for a layer that holds ONE polity at a time (national elections). It is
     also the first entry to need a SECOND door: `arrive()` answers 「the layer was switched on」 and
     is once per session, while `goTo()` answers 「the reader picked a different country inside the
     layer」 and fires every time — because a selector that says Japan over a map of Germany is a
     selector that lies. Both doors live in js/layer-home.js, which is the whole point of the file,
     and both are reachable only for a checkbox in this same set. */
  const ids = [...home.matchAll(/HOMES\['([^']+)'\]/g)].map((m) => m[1]);
  assert.deepEqual(ids.sort(), ['beta-dl-ukrfront', 'dl-elect', 'dl-eu', 'dl-nato', 'dl-uselect']);
  assert.match(home, /function goTo\(/, 'the second door is in the same file as the first');
  assert.doesNotMatch(code('js/elections.js'), /camera\.fitBounds|flyTo|jumpTo|easeTo/,
    'js/elections.js does not carry its own frame either');
  /* ⚠ (#R588) THE FILES ARE DISCOVERED, NOT LISTED. This was four hand-written paths, and the
     fifth layer to join the table owns its row in a file none of them named — so a correct entry
     was reported as 「an id somebody typed」. A list of places to look is the shape
     `.agents/rules/no-ad-hoc-hardcoding.md` §2.4 forbids: it silently fails the next thing added.
     The question is 「does some file in js/ actually create this checkbox」, so every file in js/
     is asked. */
  const jsFiles = readdirSync(resolve(ROOT, 'js')).filter((f) => f.endsWith('.js'));
  assert.ok(jsFiles.length > 50, 'js/ was actually read');
  for (const id of ids) {
    const used = jsFiles.some((f) => code('js/' + f).includes("'" + id + "'") || read('js/' + f).includes('"' + id + '"'));
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
  /* (#R337) NATO is framed the same way, from the collection the layer paints */
  assert.match(home, /IntMapNatoFC/, 'NATO is framed from the collection the layer paints');
  assert.match(code('js/data-layers.js'), /window\.IntMapNatoFC\s*=/, 'and that collection is published too');
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
  /* read, not run: markup (index.html), stylesheet (css/intmap.css) and a DOM module — the claim is
     about how the three are wired, which needs a page. */
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
  /* read, not run: js/app-body.js is the shell, which boots only in a browser. */
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
  /* read, not run: the indicator and its selectors are DOM and CSS in three files; the claim is that
     every selector names the one indicator. */
  /* ⚠ (#R723) THE INDICATOR MOVED TO js/atlas-progress.js AND THIS SET MOVED WITH IT. Reading only
     js/atlas-console.js would have let the assertions below pass BY DELETION — the shimmer, the marker
     and the guard would each be 「not found, therefore not violated」. What each one states is a fact
     about the indicator, not about a file, so the universe is the two files that now hold it. */
  const at = code('js/atlas-console.js') + '\n' + code('js/atlas-progress.js');
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
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  from tests/r370-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R370 — one English key cannot carry two meanings
 * ----------------------------------------------------------------------------
 *  「js/locales/ui.{fr,ko,zh,zh-hans}.js の `inline:` 表は英語原文をキーにするので、
 *    異なる意味の3か所が同じ行を共有している。」
 *
 *  `js/lang-registry.js` `pick()` gives en / ja / de / ru / es the POSITIONAL
 *  arguments and everything after them `inline[code][arguments[0]]` — ONE row per
 *  English string. So the positional five cannot collide and the inline four
 *  cannot avoid it: `'Clear'` was one row over five meanings and ten sites, and
 *  fr / ko / zh-Hant / zh-Hans printed «erase» for a clear sky and for clean air.
 *
 *  ⚠ EVERY ASSERTION HERE IS ABOUT SHIPPED SOURCE, not about the audit's opinion
 *  of it. ① and ② run the instrument; ③ proves the instrument can still SEE a
 *  collision (a detector that has quietly stopped detecting reports zero and looks
 *  exactly like success — #R347's rule that a negative check needs a line that can
 *  make it red); ④ pins each rename at its site so reverting one is red here; and
 *  ⑤ pins the three incidental defects that were fixed in the same pass.
 * ==========================================================================*/

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const audit = (...a) => JSON.parse(execFileSync(process.execPath,
  [path.join(ROOT, 'scripts', 'i18n-key-collision-audit.mjs'), '--json', ...a],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));

/* ── ① no English key carries two meanings unless a reader has said it may ──────────────────── */
test('#R370 ① every colliding English key is judged benign, explicitly', () => {
  const j = audit();
  assert.equal(j.unlisted.length, 0,
    'English key(s) carrying more than one meaning and not in BENIGN — one inline row cannot serve '
    + 'both, so fr/ko/zh-Hant/zh-Hans are wrong at one of the sites: '
    + j.unlisted.map((u) => `${JSON.stringify(u.en)} (${u.meanings.join(' / ')})`).join(', '));
});

/* ── ② …and the allowlist is not carrying entries that stopped asserting anything ───────────── */
test('#R370 ② no stale BENIGN entry', () => {
  const j = audit();
  assert.equal(j.stale.length, 0,
    'BENIGN entr(ies) that no longer collide — delete them, or the allowlist becomes a place a real '
    + 'collision can hide: ' + j.stale.join(', '));
});

/* ── ③ ⚠ THE DETECTOR STILL DETECTS ────────────────────────────────────────────────────────────
   ① and ② are both satisfied by an instrument that has stopped looking — a broken walker returns
   no hits, `unlisted` is empty, `stale` is empty, and the gate is green for the one reason that
   means nothing. So assert that it still FINDS the benign duplicates it is supposed to tolerate,
   and that `'Clear'` is still one of them (three meanings survive: 消去 / クリア / 解除 — the two
   that were wrong, 快晴 and 清浄, moved to their own keys in ④). */
test('#R370 ③ the detector still finds the duplicates it tolerates', () => {
  const j = audit();
  assert.ok(j.total >= 150, `only ${j.total} colliding keys found — the walker has probably stopped seeing call sites`);
  assert.ok(j.keys >= 4000, `only ${j.keys} English keys found — the walker has probably stopped seeing call sites`);
  assert.equal(j.listed, j.total, 'listed + unlisted must account for every collision');
});

/* ── ④ each rename is pinned at its site ───────────────────────────────────────────────────────
   The English key is ALSO what English readers see, so these are user-visible strings, not
   internal identifiers. Reverting any one of them puts two meanings back on one row. */
const RENAMES = [
  ['js/widget-defs-data.js', `L('Clear sky', '快晴'`, `L('Clear', '快晴'`],
  ['js/data-layers.js', `'Clean air','清浄'`, `'Clear','清浄'`],
  ['js/data-layers.js', `'Turn all off','すべて解除'`, `'Clear all','すべて解除'`],
  ['js/widget-defs-markets.js', `L('Economy fee', '低速'`, `L('Economy', '低速'`],
  ['js/satellite-detail.js', `L('Elevation angle','仰角'`, `L('Elevation','仰角'`],
  ['js/atlas-console.js', `L('Source term','放出量'`, `L('Source','放出量'`],
  ['js/aircraft-detail.js', `L('Signal source','信号種別'`, `L('Source','信号種別'`],
  ['js/osm-facilities.js', `LA('Wind power','風力'`, `LA('Wind','風力'`],
  ['js/world-packs.js', `LA('Wind power','風力'`, `LA('Wind','風力'`],
  ['js/space.js', `L('total eclipse','皆既'`, `L('total','皆既'`],
  ['js/widget-defs-data.js', `L('Max', '最高'`, `L('High', '最高'`],
  ['js/widget-defs-data.js', `L('Min', '最低'`, `L('Low', '最低'`],
  ['js/atlas-console.js', `L('Max','最高'`, `L('High','最高'`],
  ['js/atlas-console.js', `L('Min','最低'`, `L('Low','最低'`],
  ['js/widget-defs-time.js', `L('Days elapsed', '経過日'`, `L('Day', '経過日'`],
  ['js/osm-facilities.js', `L('Emergency room','救急'`, `L('Emergency','救急'`],
  ['js/aircraft-detail.js', `L('Aircraft type','機種'`, `L('Aircraft','機種'`],
  ['js/drone-nav.js', `L('Highest altitude','最高高度'`, `L('Highest point','最高高度'`],
  ['js/satellite-detail.js', `L('Max elevation','最大仰角'`, `L('Highest point','最大仰角'`],
  ['js/world-packs.js', `L('Metric','指標'`, `L('Measure','指標'`],
  ['js/map-extras.js', `"Runway use","種別"`, `"Use","種別"`],
  ['js/viewshed.js', `L('Sample spacing','間隔'`, `L('samples','間隔'`],
  ['js/viewshed.js', `L('Sample points','点'`, `L('points','点'`],
  ['js/data-layers.js', `'Time window','期間'`, `'Window','期間'`],
  ['js/volcano-intel.js', `L('Announcement','発表内容'`, `L('Warning','発表内容'`],
  ['js/countries-ui.js', `TR('Neighbours','隣接'`, `TR('Borders','隣接'`],
  ['js/map-tools.js', `OL('Shape','図形'`, `OL('Drawing','図形'`],
  ['js/seismic.js', `L('Place it','置く'`, `L('Place','置く'`],
  ['js/sims.js', `SN('Selected day','この日'`, `SN('Today','この日'`],
  ['js/widget-defs-map.js', `L('watchlist', 'ウォッチ'`, `L('watch', 'ウォッチ'`],
  ['js/atlas-console.js', `L('map points','地点'`, `L('points','地点'`],
];
test('#R370 ④ every R370 rename is present, and the key it replaced is gone from that site', () => {
  /* read, not run: the claim is which English KEY each call site spells — the key is the text itself
     (the locale tables are keyed by it). */
  for (const [file, want, gone] of RENAMES) {
    const src = read(file);
    assert.ok(src.includes(want), `${file}: expected ${want}…) — the R370 rename was reverted`);
    assert.ok(!src.includes(gone), `${file}: ${gone}…) is back — that key now carries two meanings again`);
  }
});

/* ── ⑤ the three defects that were not collisions ──────────────────────────────────────────── */
test('#R370 ⑤ no Japanese argument is the English word, and the dead `ago` helper is gone', () => {
  /* read, not run: the same: the arguments of L() are the text the i18n gate reads. */
  const wp = read('js/world-packs.js');
  assert.ok(wp.includes(`L('Moderate','中程度'`), "world-packs.js: the Japanese for 'Moderate' is the English word again");
  assert.ok(!wp.includes(`L('Moderate','Moderate'`), "world-packs.js: L('Moderate','Moderate',…) is back");
  assert.ok(wp.includes(`L('Extreme','極端（最も深刻）'`), "world-packs.js: the Japanese for 'Extreme' has English mixed back in");
  assert.ok(!wp.includes(`'Extreme（最も深刻）'`), "world-packs.js: 'Extreme（最も深刻）' is back");

  /* `rel` was declared and never called — its ML('ago','','','','') never rendered, so there was
     nothing to translate. The only `rel` left in the file must be the rel="noopener" attribute. */
  const mon = read('js/monitors.js');
  assert.ok(!mon.includes(`ML('ago'`), 'monitors.js: the dead `rel` helper with the empty translations is back');
  /* …and the Russian branch beside it, which printed «мин назад» with no number at all */
  assert.ok(!mon.includes(`'мин назад',Math.round(diff/60)+' min'`),
    'monitors.js: the Russian relative time is missing its number again');
});

/* ── ⑤b ⚠⚠ WHEN A MEANING LEAVES, THE ROW IT WAS TRANSLATED FOR STAYS ─────────────────────────
   Moving the outlier to its own key fixes the outlier. It does NOT fix the key it left behind,
   whose row may have been written for the meaning that just departed — and if only one site now
   remains, the collision audit cannot see it, because one site is not a collision.
   `'Emergency'` was exactly that: two sites (救急 the hospital ER, 緊急（最高階級）the top class of
   the alert ladder) and a row that said «emergency room». The ER moved to `'Emergency room'`, and
   the alert ladder was left calling its most severe class «Urgences / 응급 / 急診» — a hospital
   department. The four rows must stay on the ALERT sense, and distinct from the three steps below
   them (Advisory < Warning < Danger < Emergency). */
test('#R370 ⑤b the alert ladder is four distinct steps, and its top is not a hospital department', () => {
  const ER = { fr: 'Urgences', ko: '응급', zh: '急診', 'zh-hans': '急诊' };
  for (const code of ['fr', 'ko', 'zh', 'zh-hans']) {
    const src = read(`js/locales/ui.${code}.js`);
    const row = (k) => (src.match(new RegExp(`["']${k}["']\\s*:\\s*"([^"]*)"`)) || [])[1];
    const steps = ['Advisory', 'Warning', 'Danger', 'Emergency'].map(row);
    assert.ok(steps.every(Boolean), `ui.${code}.js: the alert ladder is missing a row — ${steps.join(' / ')}`);
    assert.notEqual(row('Emergency'), ER[code],
      `ui.${code}.js: 'Emergency' is back to the hospital-ER word, but its only call site is the TOP CLASS of the alert ladder (js/world-packs.js NORM_NAME)`);
    assert.equal(new Set(steps).size, 4,
      `ui.${code}.js: the four alert steps collapse to ${new Set(steps).size} distinct words — ${steps.join(' / ')}`);
  }
});

/* ── ⑥ the surface is actually RUN ─────────────────────────────────────────────────────────────
   #R301: a check that no list names never executes, and is therefore not a weaker check — it is
   not a check. #R529 retired the hand-maintained list, so the i18n gate is the registry that
   remains — and a surface the gate does not run is still not a check. */
test('#R370 ⑥ the collision surface is wired into the one i18n gate', () => {
  /* read, not run: the claim is that the gate script runs and fails on the surface — a fact about
     scripts/i18n-audit.mjs's text (①–③ run the surface itself). */
  const gate = read('scripts/i18n-audit.mjs');
  assert.ok(gate.includes(`run('i18n-key-collision-audit.mjs')`),
    'scripts/i18n-audit.mjs no longer runs the key-collision surface — `npm run check:i18n` would not see it');
  assert.ok(/collide\.unlisted\.length\)\s*problems\.push/.test(gate),
    'scripts/i18n-audit.mjs runs the surface but no longer FAILS on it');
  assert.ok(/collide\.stale\.length\)\s*problems\.push/.test(gate),
    'scripts/i18n-audit.mjs no longer fails on a stale BENIGN entry — the ratchet is one-directional');
});
}
