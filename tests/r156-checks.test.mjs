// R156 source-level regression checks (deterministic, no browser).
// Guards the R156 "Atlas unified vision / math-rendering / geo-determination overhaul":
//   #1 KaTeX loaded (pinned CDN, already CSP-allowed) + math renderer with a graceful raw-LaTeX fallback
//   #2 Unified Markdown+LaTeX renderer: fenced code (Copy btn, escaped), $…$/$$…$$/\(…\)/\[…\] math, GFM tables, inline code — all placeholder-protected
//   #3 Content-class SPINE + code-side geo gate (_atlContentClass / _atlShouldMap / _pinReplyPlaces early-return)
//   #4 EXACT-rational deterministic verification (_atlVerifyChecks: matmul/equal over BigInt fractions)
//   #5 Dedicated vision pipeline (_atlVisionTurn / _visionSYS) — image bypasses the map-oriented planner; neutral default prompt; hi-fi encode; detail:high
//   #6 Send/Stop button = accent (idle keeps the previous white/black)
//   #7 ai-proxy: vision_read task (JSON + budget + reasoning) + input_image detail:high
//   #8 IntMapAtlasDebug exposes the new spine for hermetic tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appSource } from './app-source.mjs';

const root = new URL('../', import.meta.url);
const html = appSource(root);   /* (#R162) index.html + css/intmap.css + js/*.js */
const aiproxy = readFileSync(new URL('supabase/functions/ai-proxy/index.ts', root), 'utf8');

test('R156 #1 KaTeX is loaded (pinned CDN) + math renderer with graceful fallback', () => {
  assert.match(html, /<link rel="stylesheet" href="https:\/\/cdn\.jsdelivr\.net\/npm\/katex@0\.16\.11\/dist\/katex\.min\.css"/, 'KaTeX CSS pinned on jsDelivr (already in the CSP script-src allowlist)');
  assert.match(html, /<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/katex@0\.16\.11\/dist\/katex\.min\.js"/, 'KaTeX JS pinned + deferred');
  assert.match(html, /function _atlKatex\(tex, display\)\{/, 'math renderer helper');
  assert.match(html, /window\.katex && typeof window\.katex\.renderToString==='function'/, 'feature-detects KaTeX before using it');
  assert.match(html, /renderToString\(tex,\{displayMode:!!display,throwOnError:false/, 'throwOnError:false — one bad formula never breaks the reply');
  assert.match(html, /atl-math-raw"'\+attr\+'><code>'\+esc\(tex\)/, 'KaTeX-unavailable/broken → escaped raw LaTeX fallback (data-tex carried for late upgrade)');
  assert.match(html, /function _atlTypesetMath\(root\)\{/, 'late-load upgrade of raw fallbacks');
});

test('R156 #2 unified renderer: code blocks, math, tables, inline code — placeholder-protected', () => {
  // mdMini pulls code/math/tables into PUA placeholders BEFORE esc + the markdown pass, then restores
  assert.match(html, /function mdMini\(s\)\{ s=String\(s\|\|''\); const B=\[\], I=\[\];/, 'mdMini rebuilt as the unified renderer');
  assert.match(html, /s=s\.replace\(\/```\(\[\\w\+#\.\\-\]\*\)\[ \\t\]\*\\r\?\\n\?\(\[\\s\\S\]\*\?\)```\/g,\(m,lang,code\)=>pB\(_atlCodeBlock\(code,lang\)\)\);/, 'fenced code protected first');
  assert.match(html, /s=s\.replace\(\/\\\$\\\$\(\[\\s\\S\]\+\?\)\\\$\\\$\/g,\(m,t\)=>pB\(_atlKatex\(t,true\)\)\);/, 'display math $$…$$ protected');
  assert.match(html, /s=s\.replace\(\/\\\\\\\(\(\[\\s\\S\]\+\?\)\\\\\\\)\/g,\(m,t\)=>pI\(_atlKatex\(t,false\)\)\);/, 'inline math \\(…\\) protected');
  assert.match(html, /function _atlCodeBlock\(code, lang\)\{/, 'code-block builder');
  assert.match(html, /class="atl-codecopy" type="button" data-cid="'\+id\+'">'\+esc\(L\('Copy'/, 'code block has a localized Copy button');
  assert.match(html, /<code id="'\+id\+'">'\+esc\(code\)\+'<\/code>/, 'code is HTML-escaped (never executed)');
  assert.match(html, /function _atlBuildTable\(header, sep, body\)\{/, 'GFM table builder');
  assert.match(html, /class="atl-tablewrap"><table class="atl-md-table">/, 'tables render into a scrollable wrapper');
  assert.match(html, /'`\(\[\^`\\n\]\+\)`'|`\(\[\^`\\n\]\+\)`/, 'sanity: inline-code source present');
  // the EXISTING R154/R155 heading/bullet/paragraph HTML is preserved verbatim
  assert.match(html, /\.replace\(\/\^##\\s\*\(\.\+\)\$\/gm,'<div style="font-weight:600;color:var\(--text-main\);margin:2\.05em 0 \.62em;font-size:1\.56em/, 'R159 "## " heading style (semibold, no divider, still --text-main)');
  assert.match(html, /\.replace\(\/\\\*\\\*\(\[\^\*\]\+\)\\\*\\\*\/g,'\$1'\)/, 'R159 inline **bold** stripped to plain (no bold in Atlas replies)');
  // interactive wiring at document level (works in panel + sidebar tab + workspace)
  assert.match(html, /if\(!window\.__atlRenderWired\)\{ window\.__atlRenderWired=true;/, 'one-time document-level wiring for the Copy button');
  assert.match(html, /\.atl-codeblock\{margin:0;padding:10px 12px;overflow-x:auto;/, 'code block scrolls horizontally (mobile)');
  assert.match(html, /\.atl-math-b\{margin:\.55em 0;overflow-x:auto;/, 'display math scrolls horizontally (mobile)');
});

test('R156 #3 content-class spine + code-side geo gate', () => {
  assert.match(html, /function _atlContentClass\(x\)\{/, 'content-class normalizer');
  assert.match(html, /if\(\/\(math\|equation\|formula\|algebra\|calculus\|matrix/, 'math class detected');
  assert.match(html, /function _atlShouldMap\(cls\)\{ const c=_atlContentClass\(cls\); return c==='geographic'\|\|c===''; \}/, 'only geographic (or unclassified) maps — every explicit non-geo class blocks mapping');
  // _pinReplyPlaces refuses to run for a non-geographic class — no extraction, no note
  assert.match(html, /if\(ctx\.contentClass && !_atlShouldMap\(ctx\.contentClass\)\) return '';/, '_pinReplyPlaces early-returns for a non-geo class (Problem/Thus/Let U can never be geocoded)');
  // the answer dispatch + vision turn gate mapping on the SAME class
  assert.match(html, /if\(_atlShouldMap\(_acls\)\) _ah\+=await _pinReplyPlaces\(a\.places\|\|\[\],\{text:String\(a\.text\|\|''\),citations:_acit,contentClass:_acls\}\);/, 'answer dispatch gates mapping on the class');
});

test('R156 #4 exact-rational deterministic verification', () => {
  assert.match(html, /function _atlGcd\(a,b\)\{/, 'BigInt gcd');
  assert.match(html, /function _atlRat\(n,d\)\{/, 'exact rational (BigInt fraction) constructor');
  assert.match(html, /function _atlMatMul\(A,B\)\{/, 'rational matrix multiply');
  assert.match(html, /function _atlVerifyChecks\(checks\)\{ const out=\{ran:0,passed:0,failed:\[\]\};/, 'deterministic check runner');
  assert.match(html, /if\(\/\(matmul\|matrixproduct\|matrixmultiply\|verifyinverse\|verifysystem\|productequals\)\/\.test\(type\)\)\{/, 'matmul check (V·P = U) supported');
  assert.match(html, /function _atlChecksNoteHtml\(v\)\{/, 'honest self-check note (verified / did-not-match)');
  // exact fraction parsing (1/22 etc.) — never a rounded decimal
  assert.match(html, /m=s\.match\(\/\^\(\[\+-\]\?\\d\+\)\\\/\(\[\+-\]\?\\d\+\)\$\/\); if\(m\) return _atlRat\(BigInt\(m\[1\]\),BigInt\(m\[2\]\)\);/, 'parses "a/b" exact fractions');
});

test('R156 #5 dedicated vision pipeline (image bypasses the map-oriented planner)', () => {
  assert.match(html, /async function _atlVisionTurn\(ai, q, imgs, gen\)\{/, 'dedicated vision turn');
  assert.match(html, /function _visionSYS\(\)\{/, 'vision system prompt (classify → transcribe → solve → verify → map-only-if-geo)');
  assert.match(html, /task:'vision_read',effortHint:'high',imageDetail:'high'/, 'vision call: vision_read task + high effort + detail:high');
  // run() routes images to the vision turn, NOT the generic planner
  assert.match(html, /if\(imgs\.length\)\{ const aiv=bubble\('a',stageDots\('read'\)\); try\{ await _atlVisionTurn\(aiv,q\+_fileBlock,imgs,gen\);/, 'run() routes an attached image to the vision pipeline (R158: file text rides along)');
  // ONE image re-examination round when a deterministic check fails
  assert.match(html, /\[SELF-CHECK FAILED\] Your emitted check\(s\) did NOT hold/, 'failed check triggers an image re-examination round');
  // neutral default prompt (no forced mapping)
  assert.ok(!/Describe and analyze this image, and map any real places/.test(html), 'the old forced-mapping default image prompt is gone');
  assert.match(html, /Read and analyze this image\. If it is a document, a maths\/science problem/, 'neutral default image prompt (classify first, map only if geographic)');
  // the vision prompt STRICTLY forbids places for non-geographic content
  assert.match(html, /NEVER turn a word like "Problem", "Thus", "Let", "Figure", "Theorem" or a person/, 'vision prompt forbids non-geo place fabrication');
});

test('R156 #6 send/stop button = accent (idle keeps the previous white/black)', () => {
  assert.match(html, /#atlas-panel \.atl-go\{flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:1px solid transparent;background:var\(--primary-color\);color:#fff;/, 'base (active) button = accent fill + white icon');
  assert.match(html, /#atlas-panel \.atl-go\.idle\{background:#fff;box-shadow:0 1px 4px rgba\(0,0,0,0\.12\);color:#111;/, 'idle (empty input) keeps the previous white bg + black ↑');
  assert.match(html, /#atlas-panel \.atl-go\.busy\{background:var\(--primary-color\);box-shadow:0 2px 8px rgba\(0,0,0,0\.2\);color:#fff;/, 'Stop (busy) button = accent fill + white square');
});

test('R156 #7 ai-proxy: vision_read task + input_image detail:high', () => {
  assert.match(aiproxy, /vision_read: 3000,/, 'vision_read output budget');
  assert.match(aiproxy, /vision_read: "medium",/, 'vision_read reasoning (effortHint:"high" bumps it)');
  assert.match(aiproxy, /new Set\(\["map_report", "json_extract", "geo_verify", "geo_resolve", "research_map", "vision_read"\]\)/, 'vision_read returns strict JSON');
  assert.match(aiproxy, /imageDetail = "auto", _isFallback = false/, 'callOpenAI takes an imageDetail param');
  assert.match(aiproxy, /content\.push\(\{ type: "input_image", image_url: `data:\$\{ip\.mime\};base64,\$\{ip\.b64\}`, detail: _detail \}\);/, 'input_image carries the detail flag');
  assert.match(aiproxy, /const imageDetail = \(payload\.imageDetail === "high" \|\| payload\.imageDetail === "low"\) \? payload\.imageDetail : "auto";/, 'server clamps imageDetail to a safe set');
  assert.match(aiproxy, /task === "atlas_plan" \|\| task === "analysis" \|\| task === "vision_read"\)\) effort = "high"/, 'vision_read may think at "high" via effortHint');
});

test('R156 #8 IntMapAtlasDebug exposes the new spine', () => {
  for (const fn of ['contentClass:function', 'shouldMap:function', 'verifyChecks:function', 'checksNote:function', 'parseRat:function', 'visionSys:function']) {
    assert.ok(html.includes(fn), `IntMapAtlasDebug.${fn.split(':')[0]} exposed`);
  }
});
