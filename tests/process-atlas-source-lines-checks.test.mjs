/* ============================================================================
 *  IntMap · Atlas: the load-bearing lines of the attach, typography, sources and executor contract
 * ----------------------------------------------------------------------------
 *  ⚠ These are source-level pins over the shipped app text (index.html + css + js, tests/app-source.mjs).
 *  They live inside browser closures (the console, the dispatch, the CSS), so a Node test cannot
 *  evaluate them; the browser specs exercise the behaviour, these hold the lines it rests on.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r158 #1 #2 #4 #5
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { appSource } from './app-source.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R158 — was tests/r158-checks.test.mjs #1 #2 #4 #5
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
// R158 source-level regression checks (deterministic, no browser).
// One batch across 10 items: Atlas/Terra execution authority, flight-sim camera teleport, sea water-fill removal,
// satellite quality + grey-tile suppression, Atlas typography + sources, +-attach with files, Companies hover month/day,
// sidebar flicker. Literal-substring assertions guard the exact load-bearing lines against silent regressions.

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const has = (s) => html.includes(s);
const ok = (s, msg) => assert.ok(has(s), msg || ('missing: ' + s.slice(0, 80)));
const gone = (s, msg) => assert.ok(!has(s), msg || ('should be removed: ' + s.slice(0, 80)));

test('R158 #4 Atlas attach button is "+" and accepts non-image (text) files', () => {
  ok("L('Attach a file (image, PDF, document or text)','ファイルを添付（画像・PDF・文書・テキスト）", 'button says what it now takes (5 languages; the other 4 come from the inline tables)');
  ok('let _atlFiles=[];', 'pending non-image file attachments');
  /* (#R232) moved to js/atlas-attach.js with the rest of the attachment subject (js/atlas-console.js
     has a line ceiling). The property is that ONE classifier decides image / text / unsupported. */
  /* (#R540) ONE CLASSIFIER IS STILL THE PROPERTY — it is no longer a list of 75 extensions but a
     question asked of the bytes, so the name changed. What must NOT come back is a second one:
     js/atlas-console.js decides nothing about what a file is, it only asks. tests/r540 ② evaluates
     the classifier itself on real bytes rather than reading either name (#R505). */
  ok('export const ATL_FILE = (function () {', 'one classifier decides image / doc / text / unsupported');
  gone('export function atlFileKind', 'the extension-list classifier is gone, not shadowed by a second one, not shadowed by a second classifier');
  /* ⚠ (#R540) THE ATTACHED TEXT REACHES THE MODEL THROUGH ITS OWN CHANNEL, NOT THROUGH THE PROMPT.
     #R158 concatenated it into `prompt`, which ai-proxy slices at MAX_PROMPT — so the assertion below
     was true of a path that silently threw the content away. The block is built server-side now, once,
     for all three providers. */
  ok('files:_atts.files,docs:_atts.docs', 'the attachments travel as their own channels');
  ok('if(Array.isArray(opts.files)&&opts.files.length) body.files=opts.files;', 'js/ai-core.js puts them on the wire');
  gone("fi.type='file'; fi.accept='image/*'; fi.multiple=true;", 'the image-only picker restriction is removed');
  ok('function fire(){ const v=inEl.value.trim(); const imgs=_atlImgs.slice(); const files=_atlFiles.slice();', 'files are sent with the message');
});

test('R158 #1 → R159 Atlas typography — no bold, no ## divider; body 14px + mobile lift; still monochrome', () => {
  gone('border-top:1.5px solid rgba(128,128,128,.34)', 'R159 removed the ## hairline divider ("区切りの横線はいらない")');
  /* (#R494) the reply body is a NAMED class now. It was an inline style five call sites in
     js/atlas-console.js had to keep re-spelling, and the mobile rule below matched it by that
     spelling — so the lift held only while all five agreed on the characters. */
  ok(".atl-md{font-size:14px;line-height:1.62;}", 'desktop reply body is 14px (R494 line-height 1.68 → 1.62)');
  ok(".atl-b.a .atl-md{font-size:15.5px !important;}", 'mobile still lifts the (now 14px) body');
  gone('<div style="font-size:14px;line-height:1.68;">', 'the inline-style wrapper it used to be sniffed by is gone');
  // still monochrome — every heading keeps --text-main (R154 "色分け廃止" preserved) — R159 also drops the bold weight
  ok('.atl-h{font-weight:600;color:var(--text-main);', 'headings are semibold (R159 no bold), still --text-main');
});

test('R158 #2 Atlas sources — informational answers gather sources (use:[web] forces the search)', () => {
  ok("const analysisWebMode=(freshness.critical||(use&&use.indexOf('web')>=0))?'required':'auto';", 'an explicit use:[web] forces a live search → citations');
  /* ⚠ (#R406) THE PROPERTY IS THE SAME AND THE THING THAT DECIDES IT IS NOT A REGEX ANY MORE.
     #R158's mechanism was `const informational=q.length>=8 && !SOCIAL.test(q) && (TIMEVAR.test(q)||
     INFO.test(q));` — an answer-only plan on a sentence matching those patterns was re-run as
     analyze, and «(routed to live analysis for sources)» recorded the substitution. #R406 deleted
     the override and the regexes with it (they were the same `[?？]` character class that decided
     「セーヌ川の長さは・」 was not a question). What gathers the sources now is Atlas choosing the
     research tool, which is offered on EVERY turn with the description that says when to reach for
     it — so the question 'can an informational answer get sources' is answered by that tool being
     present, not by a pattern having matched. The «recorded honestly» assertion is deleted with the
     re-route it described: there is no substitution left to record. */
  ok("{ name: 'research', cap: 'research.analyze', desc: 'Answer a question from live sources with citations.",
    'the sourced-analysis tool is offered every turn (js/atlas-toolsurface.js CORE), so Atlas can reach for it');
});

test('R158 #5 Terra is the decision-maker, IntMap the faithful executor', () => {
  // no code-side auto-correction of a wrong identifier
  gone('if(!code&&t.name){ try{ const c=resolveCountrySync(t.name); if(c&&c.code&&valid.has', 'resolveCountrySync auto-rescue removed');
  ok('unresolved.push({name:t.name||\'\', iso3:gi, reason:', 'a wrong/blank identifier is reported as unresolved (not rescued, not dropped)');
  ok('availableIdentifiers:available})', 'a deterministic candidate identifier is REPORTED, not applied');
  // the mechanical structured execution result (the work order contract)
  ok("status:(gUnresolved.length?'partial_or_failed':'ok')", 'structured status');
  ok('renderState:{painted:!!painted, features:(features!=null?features:0), verified:!!verified}', 'observed render state');
  ok("capabilities:{ identifierScheme:'ISO 3166-1 alpha-3', validIdentifierCount:_hlValidCodeSet().size }", 'observed capabilities');
  // fed back to Terra; Terra decides
  ok('if(r&&r.exec) a.__exec=r.exec;', 'runActions captures the execution result');
  /* ⚠ (#R406) THE PROPERTY THIS TEST NAMES IS STRONGER NOW, SO THE THREE LINES BELOW MOVED RATHER
     THAN LEFT. #R158 fed the structured result back by appending a prose block («EXECUTION RESULT —
     IntMap executed your action and OBSERVED …», «re-issue the SAME action type with the corrected
     identifier(s)») to a SECOND planner call, and only when a partial failure had seeded a repair
     list. In #R406 every tool result goes back to Atlas as the tool's own mechanical record, on
     every step, whether it succeeded or not — and the candidates IntMap merely OBSERVED travel with
     it untouched. IntMap still corrects nothing: the correction is a call Atlas re-issues. */
  ok('exec:(rec.act&&rec.act.__exec)||null', 'the turn hands the dispatch’s structured execution result back (js/atlas-console.js _runOne)');
  ok('out.observed = JSON.parse(JSON.stringify(res.exec));', 'and what IntMap observed reaches Atlas verbatim, not summarised (js/atlas-toolsurface.js mechanical)');
  ok('Re-issue the SAME call with the arguments corrected.', 'a rejected call is handed to the model to correct — IntMap never substitutes for it');
});
}
