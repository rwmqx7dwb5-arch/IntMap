/* ============================================================================
 *  IntMap · the source cards under an Atlas answer — which links survive, and which are shown
 * ----------------------------------------------------------------------------
 *  Consolidated from tests/r152-checks.test.mjs #4, tests/r153-checks.test.mjs #6 and
 *  tests/r154-checks.test.mjs #4. From their headers:
 * ==========================================================================*/
//   #4  Atlas sources — broadened bad-host blocklist + relevance gate on gathered links + honest relabel
//   #6  Atlas sources — one _atlCleanUrl filter used by linkCards AND inline evidence links; relevance runs AFTER host-clean
//       (never blanks when real sources exist); the planner `answer` path now renders web-verified sources
//   #4  Atlas sources — undecodable Google-News redirects are KEPT (labelled by publisher), not dropped to zero ("出展が全くない")
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
/* ⚠ WHY THESE READ THE SOURCE. `_atlCleanUrl`, `_atlRelevantCards` and `linkCards` are closures inside the
   Atlas console, reachable only through a whole answer turn in the browser; what is pinned is the
   order of the host clean and the relevance gate, and the aggregator branch. */
test('R152 #4 Atlas sources — broadened blocklist (not medium/substack), relevance gate, honest relabel', () => {
  /* spelling kept — the link cleaner and relevance gate are closures inside the Atlas console, reachable only through a whole answer turn */
  assert.match(html, /const _SNS_RE=\/[^\n]*blogspot\\\.\[a-z\.\]\+/, 'blog platforms added to the bad-host blocklist');
  assert.match(html, /note\\\.com\|fc2\\\.com/, 'note.com / fc2 added');
  assert.ok(!/medium\\\.com/.test(html.slice(html.indexOf('const _SNS_RE='), html.indexOf('const _SNS_RE=') + 900)), 'medium NOT banned (can be legit journalism)');
  /* (#R232) the gate gained a `topic` argument — pin that it EXISTS and that the analyze bucket runs
     through it, not how many parameters it happens to take this round. */
  assert.match(html, /function _atlRelevantCards\(cards, refText(?:, topic)?\)\{/, 'relevance gate exists');
  /* ⚠ (#R350) THE ANALYZE 「その他」 BUCKET NO LONGER EXISTS, ON PURPOSE. #R152/#R153/#R159 built a
     never-zero fallback that showed the articles IntMap had gathered when the model cited none, so a
     reply was never source-less. #R350's instruction forbids it in exactly those words — 「citation
     がない回答へ無関係な関連記事を付ける」 — and replaces it with something stronger: a primary claim
     with no evidence id now FAILS the answer audit, so an answer that has evidence must cite it
     rather than have unrelated articles stapled underneath. The relevance gate itself is unchanged
     and still guards the brief's own source cards, which is what is asserted here. */
  assert.match(html, /linkCards\(srcSink,txtB,/, 'the brief still relevance-filters its gathered source cards');
  assert.ok(!/L\('Other gathered articles'/.test(html), 'the 「その他の収集記事」 pile is back');
});

test('R153 #6 Atlas sources — one cleaner, relevance-after-host-clean, answer path shows sources', () => {
  /* spelling kept — the link cleaner and relevance gate are closures inside the Atlas console, reachable only through a whole answer turn */
  assert.match(html, /function _atlCleanUrl\(u\)\{/, 'single URL cleaner (decode aggregator + drop SNS)');
  /* (#R232) the ARGUMENT LIST was never the property being protected — the gate gained a `topic`
     parameter this round. What has to stay true is that linkCards accepts something to judge
     relevance against and applies it AFTER the host clean. */
  assert.match(html, /function linkCards\(list, refText(?:, topic)?\)\{/, 'linkCards takes a reference to judge relevance against');
  assert.match(html, /if\(refText(?:\|\|topic)?\) clean=_atlRelevantCards\(clean, refText(?:, topic)?\)/, 'relevance runs on the HOST-CLEANED set (never blanks to only-SNS)');
  assert.match(html, /const pu=_atlCleanUrl\(p\.url\)/, 'mapReport inline evidence link is cleaned');
  assert.match(html, /const eu=_atlCleanUrl\(latest\.it\.link\)/, 'events inline evidence link is cleaned');
  assert.match(html, /const sc=linkCards\(_acit\.map/, 'the planner `answer` path now renders web-verified sources (was zero)');
  /* ⚠ (#R232) THIS LINE PINNED THE DEFECT ITSELF. The old cross-script rule was an unconditional
     `return true`, which is exactly how Japanese headlines about El Capitan survived an English brief
     on Okayama (「まったく関係のない記事を貼るな」). Cross-script safety is still required — it is now
     the FALLBACK, and it needs two independent shared tokens rather than none. */
  assert.match(html, /cross-script: TWO tokens/, 'relevance is cross-script safe via a two-token fallback, not an unconditional keep');
});

test('R154 #4 Atlas sources — undecodable aggregator kept, labelled by publisher', () => {
  /* spelling kept — the link cleaner and relevance gate are closures inside the Atlas console, reachable only through a whole answer turn */
  assert.match(html, /if\(_isAggUrl\(u\)\)\{ const dec=_decGNewsUrl\(u\); if\(dec\) u=dec; else agg=true; \}/, 'undecodable Google-News redirect flagged agg (not dropped)');
  assert.match(html, /if\(agg\) return \{url:u, host:'news\.google\.com', agg:true\};/, 'aggregator kept with agg flag');
  assert.match(html, /const dom=\(c\.agg&&c\.src\)\?c\.src:c\.host;/, 'card domain line shows the publisher for aggregator links');
  assert.match(html, /clean\.push\(\{url:cu\.url, host:cu\.host, agg:!!cu\.agg, src:String\(it\.src\|\|''\)/, 'linkCards carries src + agg');
});
