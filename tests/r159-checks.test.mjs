// R159 source-level regression checks (deterministic, no browser).
// Batch: (1) Atlas replies no bold + no divider lines, (2) remove the redundant "その他の収集記事" source pile,
// (3) right-sidebar smaller default width, (4) smooth sidebar open/close that never pans the map (left anchored),
// (6) news-pin band hides when its hover popup opens, (7) composite-answer integration (repair REPLACES, one
// goal-validated answer, no internal names/codes leaked). Literal-substring assertions guard the load-bearing lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const has = (s) => html.includes(s);
const ok = (s, msg) => assert.ok(has(s), msg || ('missing: ' + s.slice(0, 90)));
const gone = (s, msg) => assert.ok(!has(s), msg || ('should be removed: ' + s.slice(0, 90)));

test('R159 #1 Atlas replies carry NO bold and NO divider lines', () => {
  // inline **bold** and table-cell **bold** are stripped to plain text (mdMini + _atlCellFmt).
  // (NB: the separate non-Atlas md() renderer at ~23453 legitimately keeps <b>; scope the check to the Atlas helpers.)
  ok(".replace(/\\*\\*([^*]+)\\*\\*/g,'$1')                                                             /* (#R159) inline **bold** → plain", 'mdMini inline **bold** → plain');
  ok("function _atlCellFmt(s){ return esc(String(s==null?'':s)).replace(/\\*\\*([^*]+)\\*\\*/g,'$1');", 'table-cell **bold** → plain');
  // headings differentiate by SIZE + SPACING only — semibold 600, never the heavy 750/800 bold weight
  /* (#R232) …now carrying class="atl-h", which is what lets mdMini drop the paragraph spacer that
     lands against a heading. Weight and colour — the property these three lines exist for — stand. */
  ok('.replace(/^#{3,6}\\s*(.+)$/gm,\'<div class="atl-h" style="font-weight:600;color:var(--text-main)', '### heading is semibold, not bold');
  ok('.replace(/^##\\s*(.+)$/gm,\'<div class="atl-h" style="font-weight:600;color:var(--text-main)', '## heading is semibold, not bold');
  ok('.replace(/^#\\s*(.+)$/gm,\'<div class="atl-h" style="font-weight:600;color:var(--text-main)', '# heading is semibold, not bold');
  assert.ok(!/mdMini[\s\S]{0,4000}font-weight:(750|800)/.test(html), 'no mdMini heading keeps the heavy 750/800 bold weight');
  // the "## " section top-rule divider is removed ("区切りの横線はいらない")
  gone('padding-top:.78em;border-top:1.5px solid rgba(128,128,128,.34)', 'the ## hairline divider is gone');
  // and the repair-pass dashed divider between answer segments is gone (see #7)
  gone("border-top:1px dashed var(--glass-border,rgba(128,128,128,0.25))", 'the repair-pass dashed divider is gone');
});

test('R159 #2 redundant "その他の収集記事" source pile removed; never-zero fallback kept', () => {
  gone("L('Other gathered articles','その他の収集記事'", 'the "Other gathered articles"/その他の収集記事 label is gone');
  // the rest-links block now renders ONLY as the never-zero "Related articles" fallback when nothing was cited/verified
  /* (#R232) linkCards gained a `topic` argument — the relevance gate now judges against what the
     articles were FETCHED FOR, not only against the finished reply. The guard is unchanged. */
  /* ⚠ (#R339) THE NEVER-ZERO FALLBACK IS GONE FROM THE ANALYSE PATH, AND THE COMPLAINT IT ANSWERED
     IS ANSWERED BETTER. #R159 kept a 「Related articles」 bucket so a reply that cited nothing still
     showed something — which is, precisely, attaching articles to statements they do not support.
     #R339 forbids that and makes the opposite true instead: js/atlas-answer-audit.js fails an answer
     whose primary claims carry no evidence id, so when IntMap HAS sources the answer must cite them,
     and when it has none the honest outcome is a shorter answer rather than a pile of links. What
     survives from #R159 is the rule this test was really about — one answer per goal, no duplicate
     source piles — which is asserted above and by tests/r334-checks ⑦b. */
  gone("if(rest.length && !haveBasis){ const rc=linkCards(rest,txt,placeStr);", 'the un-cited "rest" bucket is back in the analyse reply');
  ok("class=\"atl-src-h\"", 'the source-card heading machinery is still there');
});

test('R159 #3 right sidebar default width smaller (R160 superseded: 340 → 300)', () => {
  // R160 shrank it once more ("もう少し小さく"): 380→340→300. Assert the CURRENT value so the check stays truthful.
  ok(':root{--lsr-w:min(300px,92vw);}', 'CSS default width 300');
  ok('Math.max(280,Math.min(300,', 'JS default cap 300 (floor 280 kept)');
  gone('--lsr-w:min(380px,92vw)', 'the old 380 default is gone');
  gone('--lsr-w:min(340px,92vw)', 'the old 340 default is gone');
});

test('R159 #4 → R160: LEFT sidebar keeps its mechanism AND the toggle never touches the camera', () => {
  // R160 deleted the R158/R159 per-frame-resize + edge-anchor LOOP and did NOT replace it — the toggle does nothing to
  // the camera (a stray panBy would spin the GLOBE). The left sidebar's original beside-flex mechanism is untouched.
  gone('function _sbCaptureAnchor(side){', 'the R159 per-frame anchor-capture machinery is deleted');
  gone('function _sbReanchor(){', 'the R159 per-frame reanchor machinery is deleted');
  gone('function _sbFrame(){', 'the R159 per-frame resize loop is deleted');
  ok('.sidebar{ position:relative; }', 'solid sidebar keeps its beside-flex mechanism (NOT overlaid)');
  gone('map.panBy([-dx,-dy],{duration:0}); }', 'no edge-pin panBy in the toggle (it rotated the globe)');
});

test('R159 #6 news-pin band hides when its hover popup opens', () => {
  // the news-labels (band) mousemove now sets the shared hover feature-state (band opacity → 0), like the dot handler
  ok("hovering the BAND itself must hide the band", 'band mousemove sets the hover state (band collapses)');
  ok("/* (#R159) restore the band when the pointer leaves it */", 'band mouseleave clears the hover state (band returns)');
});

test('R159 #7 composite answer — repair REPLACES, one goal-validated answer, no internal names leaked', () => {
  ok('function _atlGoalKey(act){', 'per-goal key for de-duping answers');
  ok('function _atlGoalScore(res){', 'goal-satisfaction score picks the best result');
  ok('function _atlCompose(ai){', 'the bubble is composed from recorded results, not blind concatenation');
  ok('ai.__atlResults=(ai.__atlResults||[]).concat(results);', 'each pass records its results on the bubble');
  ok('const rf=await runActions(ai, rplan.say||\'\', fresh, gen);', 'the repair pass runs into the SAME bubble (no new divider div)');
  ok('if(_pk) fresh.forEach(a2=>{ if(_ATL_ANSWER_TYPES[a2&&a2.type]&&!a2.__goalKey) a2.__goalKey=_pk; });', 'a repair answer inherits the failed goal key so it REPLACES the failure');
  gone("const div=document.createElement('div'); div.style.cssText='margin-top:7px;padding-top:7px;border-top:1px dashed", 'the appended divider div is gone');
  // the fail summary no longer leaks internal action names / arg values (e.g. mapReport "Taiwan")
  gone("'実行できなかった操作が '+fails.length+' 件あります',fails.length+' Schritt(e) nicht ausgeführt','Не выполнено шагов: '+fails.length,fails.length+' paso(s) sin completar')+(fl?(' — '+esc(fl)):'')", 'the action-label leak in the fail summary is removed');
  // behavioural: a successful repair outscores the failed original (so _atlCompose keeps the repair)
  const m = html.match(/function _atlGoalScore\(res\)\{[\s\S]*?return s; \}/);
  assert.ok(m, '_atlGoalScore extractable');
  const _atlGoalScore = eval('(' + m[0].replace('function _atlGoalScore(res)', 'function(res)') + ')');
  const original = { ok: false, meta: { produced: [] } };
  const repair = { ok: true, meta: { userGoalSatisfied: true, produced: ['explanation', 'map'] } };
  const partial = { ok: true, meta: { produced: ['explanation'], partial: true } };
  assert.ok(_atlGoalScore(repair) > _atlGoalScore(original), 'a successful repair replaces the failed original');
  assert.ok(_atlGoalScore(repair) > _atlGoalScore(partial), 'a fully-satisfied answer beats a partial one');
  assert.ok(_atlGoalScore(partial) > _atlGoalScore(original), 'even a partial success beats an outright failure');
});
