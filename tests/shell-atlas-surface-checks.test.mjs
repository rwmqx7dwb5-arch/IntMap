/* ============================================================================
 *  shell-atlas-surface-checks — Atlas-facing surfaces outside the kernel — bubbles, chips, replies, withdrawn routes
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r231-checks.test.mjs
 *  tests/r296-checks.test.mjs
 *  tests/r302-checks.test.mjs
 *  tests/r309-checks.test.mjs
 *  tests/r483-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly, codeOnly as code, codeOnly as noComments } from '../scripts/code-only.mjs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { capsSource } from './helpers/atlas-kernel.mjs';   /* (atlas-capability-modules) what each capability does lives in js/atlas-cap-<namespace>.js now — the kernel is both */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ═══════════════════════ #R231 · from r231-checks.test.mjs ═══════════════════════ */
/* (#R231 — the round's own account of why these checks exist heads its other half, in tests/shell-i18n-locales-checks.test.mjs) */
{
/* ⚠⚠ A NEGATIVE CHECK MUST READ CODE, NOT PROSE — and this file proved it on its first run. Five of
   the assertions below failed against a correct tree because the thing they were looking for is
   quoted in the COMMENT that explains its removal: `#0a0a0c`, the magnifier, `monitors:'tab.monitors'`
   and `{timeout:2000}` are all named in the note that says they are gone. #R208 and #R229 hit exactly
   this ("a check whose regex matches its own comment"), so the rule is now a helper: strip comments,
   then match syntax. */
const noJs = (p) => codeOnly(read(p));
                       /* whole-line // comments */
const noHtml = (p) => codeOnly(read(p), { lang: 'html' });

/* ── ⑤ Monitors is withdrawn, and every route with it — and then removed outright ──────────────── */
/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R231 Monitors: the tab and all four routes to it are closed', () => {
  assert.ok(!/id="btn-monitors"/.test(noHtml('index.html')), 'no tab button');
  const tabs = read('js/session-tabs.js');
  assert.ok(!/IntMapOS\.register\('tab\.monitors'/.test(noJs('js/session-tabs.js')), 'the command is not registered');
  assert.ok(!/monitors:'tab\.monitors'/.test(noJs('js/session-tabs.js')), 'a saved session cannot restore it');
  assert.ok(!/getElementById\('btn-monitors'\)/.test(noJs('js/session-tabs.js')), 'nothing wires the missing button');
  const ws = read('js/workspace.js');
  assert.ok(!/\{id:'monitors',/.test(noJs('js/workspace.js')), 'no workspace window');
  assert.ok(!/monitors:flo\(/.test(noJs('js/workspace.js')), 'and no default rect for one');
  const atlas = (read('js/atlas-console.js') + '\n' + capsSource());
  assert.ok(!/\+'AREA MONITORS \(saved SERVER-SIDE/.test(atlas), 'the planner is not offered the action');
  /* (monitors-retire) 一旦撤去 became a removal (approved 2026-10-04): the module, its feed, the runner and
     the dispatch entry that only answered FEATURE_WITHDRAWN are gone, so nothing a route could reach is left. */
  assert.doesNotMatch(atlas, /'system\.monitor'/, 'the withdrawn dispatch entry is gone with the feature');
  assert.ok(!existsSync(join(ROOT, 'js/monitors.js')), 'the module is removed');
  assert.ok(!existsSync(join(ROOT, 'supabase/functions/monitor-run')), 'and so is its server runner');
  assert.doesNotMatch(read('index.html'), /id="monitors-feed"/, 'and its content area');
});

/* ── ⑨ Atlas: an attached picture is not a speech bubble ────────────────────────────────────── */
/* spelling kept: stylesheet rule (js/atlas-styles.js) — Node has no cascade or layout to evaluate it in. */
test('R231 Atlas: the image row is its own element, the text keeps the bubble', () => {
  const src = (read('js/atlas-console.js') + '\n' + capsSource());
  assert.match(src, /if\(imgs\.length\) bubble\('u','<div class="atl-imgrow-in">/, 'images get their own row');
  assert.match(src, /classList\.add\('atl-imgrow'\)/, 'marked so the bubble styling comes off');
  assert.match(src, /if\(q\|\|files\.length\) bubble\('u',/, 'and no empty bubble when there is no text');
  /* ⚠ (#R313) THE RULES LIVE IN js/atlas-styles.js NOW — the kernel's line ceiling is never raised,
     so the panel's whole stylesheet left as one subject. The markup is still the kernel's; only the
     rules moved, so the two halves of this test now read the two files. The «crop is gone» half asks
     BOTH, or it would pass by looking where the CSS no longer is. */
  assert.match(read('js/atlas-styles.js'), /\.atl-b\.u\.atl-imgrow\{background:none;box-shadow:none;padding:0/, 'no fill, no shadow, no padding');
  assert.ok(!/object-fit:cover;border-radius:8px/.test((noJs('js/atlas-console.js') + '\n' + capsSource()) + noJs('js/atlas-styles.js')), 'the 74 px square crop is gone');
});

/* ── ⑩ the AI research reply does not open by naming the place ──────────────────────────────── */
test('R231 AI research: the leading place-name line is asked against AND removed', () => {
  /* (country-analysis-unify) the research panel (js/analysis-research.js) is gone: every 「AI調査」 is Atlas's brief, whose
     reply goes through js/atlas-reply.js `dropLeadTitle` and whose prompt (js/atlas-cap-research.js research.brief) asks
     the same. The claim is unchanged — this is where the one remaining brief does it. */
  const ap = read('js/atlas-reply.js');
  /* (tests-by-topic) THE STRIP IS RUN. It is a pure function nested in the reply factory, so it is
     lifted out of the shipped file by its AST node and called — not matched line by line. */
  let node = null;
  walk.simple(acorn.parse(ap, { ecmaVersion: 'latest', sourceType: 'module' }),
    { FunctionDeclaration(n) { if (n.id && n.id.name === 'dropLeadTitle') node = n; } });
  assert.ok(node, 'the defensive strip exists');
  const drop = new Function(`return (${ap.slice(node.start, node.end)});`)();
  assert.equal(drop('**Kyiv**\n\nKyiv is the capital.', 'Kyiv'), 'Kyiv is the capital.', 'a bold line that is only the place name is dropped');
  assert.equal(drop('\n## Kyiv\nText', 'Kyiv'), 'Text', 'so is a heading that is only the place name, after leading blank lines');
  /* equality, never containment — a title that CONTAINS the name is a real title */
  assert.equal(drop('## Kyiv: a city on the Dnipro\nText', 'Kyiv'), '## Kyiv: a city on the Dnipro\nText', 'only an exact match is dropped');
  assert.equal(drop('Kyiv is the capital.', 'Kyiv'), 'Kyiv is the capital.', 'prose that starts with the name is left alone');
  /* spelling kept: that the reply is PASSED through the strip, and what the prompt tells the model, are the text of the lazy Atlas brief. */
  const brief = read('js/atlas-cap-research.js');
  assert.match(brief, /const bodyB=dropLeadTitle\(txtB,nm3\)/, 'and is applied to the reply');
  assert.match(brief, /Do NOT open with a heading or bold line that merely repeats the place name/, 'the model is told too');
  const at = (read('js/atlas-console.js') + '\n' + capsSource());
  assert.match(at, /_titleIsJustThePlace/, 'the Atlas researchMap title does the same');
  assert.match(at, /_bare\(_tt\)===_bare\(place\)/, 'by equality');
});
}

/* ═══════════════════════ #R296 · from r296-checks.test.mjs ═══════════════════════ */
/* (#R296 — the round's own account of why these checks exist heads its other half, in tests/shell-weather-packs-routing-checks.test.mjs) */
{
/* comments out, so an assertion about code cannot be satisfied by prose about code */

/* ═══ ⑩ THE ATLAS ROUTE REPLY ════════════════════════════════════════════════════════════════ */
/* spelling kept: browser script (js/atlas-console.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R296 ⑩ the route reply opens with the answer, and says one honest sentence', () => {
  const a = (read('js/atlas-console.js') + '\n' + capsSource());
  assert.match(a, /const _hdr='';/, 'the header is empty');
  assert.doesNotMatch(code(a), /_rmodes\(/, 'the mode-switch row is not built…');
  assert.doesNotMatch(code(a), /class="atl-route-modes"/, '…and its markup is not emitted');
  assert.doesNotMatch(code(a), /\.atl-route-mode\[data-rmode\]/, 'nor is there a handler for markup that cannot exist');
  assert.doesNotMatch(code(a), /#atlas-panel \.atl-route-mode\{/, 'nor CSS for it');

  /* the note keeps the CAVEAT and drops the provider name and the instruction */
  const note = /L\('Times are typical \(no live traffic\)\.','所要時間は交通状況を含まない標準値です。'/g;
  assert.equal((a.match(note) || []).length, 2, 'both provider branches say the same one sentence');
  assert.doesNotMatch(code(a), /up to 3 alternatives with lane guidance/, 'the provider blurb is gone');
  assert.doesNotMatch(code(a), /Clear it with "clear the route"/, 'and so is the instruction');
});

/* ═══ ⑪ 「Atlasはユーザーが送ったメッセージもコピーできるように」 ══════════════════════════════════
   ⚠ (#R298) THE SUBJECT MOVED FILES; THE RELATION DID NOT. The tool bar and the in-place editor are
   js/atlas-msg-tools.js now — js/atlas-console.js sits under #R199's shrink-only ceiling and the rule
   written beside it is that a feature moves out, never that the ceiling moves up. So this reads BOTH
   files and asserts the same relation ACROSS them: one copy button, built in one place, reachable
   from the kernel only by name, and attached to the reader's bubble and to Atlas's reply alike. */
/* spelling kept: stylesheet rule (js/atlas-styles.js) — Node has no cascade or layout to evaluate it in. */
test('R296 ⑪ a reader’s own message can be copied, by the same button', () => {
  const a = (read('js/atlas-console.js') + '\n' + capsSource());
  const m = read('js/atlas-msg-tools.js');
  assert.match(m, /function copyBtn\(src\)\{/, 'there is ONE copy button');
  assert.doesNotMatch(code(a), /function copyBtn\s*\(/, 'and the kernel did not keep a second copy of it');
  assert.equal(((a + m).match(/navigator\.clipboard\.writeText\(src\.innerText/g) || []).length, 1,
    'and one implementation of what 「copy」 means');
  /* the kernel reaches the one button the only way it can now: a named import the bundler resolves */
  assert.match(a, /import \{[^}]*\bmakeMsgTools\b[^}]*\} from '\.\/atlas-msg-tools\.js';/, 'the kernel imports the module');
  assert.match(code(a), /const \{ copyBtn, editBtn, msgTools \} = makeMsgTools\(\{/, 'and takes the builders from it, once');
  assert.match(a, /if\(who==='u'\)\{[\s\S]{0,200}bar\.appendChild\(copyBtn\(d\)\)/, 'a user bubble gets it');
  assert.match(m, /bar\.appendChild\(copyBtn\(aiEl\)\)/, 'and so does a reply');
  /* Retry stays on the reply only — re-running the reader's own sentence is that same Retry */
  const u = /if\(who==='u'\)\{([\s\S]{0,300})/.exec(a);
  assert.ok(u && !/Retry|再試行/.test(u[1]), 'a user bubble gets Copy and not Retry');
  /* ══ ⚠⚠⚠ (#R296 追記) THE ICON MUST CLOSE ITS OWN TAG, AND THE LABEL MUST SURVIVE IT ═══════════
     MEASURED ON PRODUCTION after this round's deploy: BOTH copy buttons — the reply's and the
     reader's — rendered as a half-drawn rectangle with NO text beside it. The cause was in the
     source above, and it was mine: `cpSvg` was pasted from a TRUNCATED console print and ended
     mid-attribute (`…<path d="M5 15V5a2 2 0 0 1 2-2h1`), so the HTML parser swallowed everything
     after it — the closing `</svg>` AND the `<span>` carrying the word 「Copy」.
     ⚠ `node --check` cannot see this: the JavaScript is valid, the HTML inside the string is not.
     ⚠ And it broke a button that ALREADY WORKED — #R72's Copy on every reply — which is precisely
     what 「余計な変更をするな」 exists to prevent. The check is about the STRING, because that is
     where the defect was, and it is cheap enough to run on every commit. */
  const cp = /const cpSvg='([^']*)';/.exec(m);
  assert.ok(cp, 'the copy icon must be findable');
  assert.match(cp[1], /^<svg[ >]/, 'it starts as an svg…');
  assert.match(cp[1], /<\/svg>$/, '…and CLOSES as one');
  assert.equal((cp[1].match(/</g) || []).length, (cp[1].match(/>/g) || []).length,
    'every tag in the icon is terminated — an unterminated one eats whatever follows it');
  assert.match(m, /b\.innerHTML=cpSvg\+'<span>'\+L\('Copy'/, 'the label follows the icon…');
  assert.match(m, /'Copiar'\)\+'<\/span>'/, '…and the span is closed');
  /* ⚠ and the auto-scroll that assumed the reply's previous sibling IS the user message still works */
  assert.match(m, /while\(ub&&ub\.classList&&ub\.classList\.contains\('atl-msgt'\)\) ub=ub\.previousElementSibling;/,
    'the scroll walk skips the copy bar it now has to step over');
  /* ⚠ and the styles travelled WITH the bar: the kernel owns the one <style>, so a rule that stayed
     behind while its markup left would be the same silent half-move this file exists to catch. */
  assert.match(m, /export const MSG_TOOLS_CSS = ''/, 'the desktop rules are the module’s');
  assert.match(m, /#atlas-panel \.atl-msgt\{display:flex;/, 'including the bar itself');
  /* ⚠ (#R313) …and the ONE <style> is assembled in js/atlas-styles.js now — the kernel's line ceiling
     is never raised, so the whole stylesheet left as one subject. The property is unchanged: the bar's
     rules are CONCATENATED into the panel's single stylesheet, never copied into it. */
  const styles = code(read('js/atlas-styles.js'));
  assert.match(styles, /\+MSG_TOOLS_CSS\b/, 'and the panel stylesheet concatenates them where they stood');
  assert.match(styles, /\+MSG_TOOLS_CSS_MOBILE\b/, 'the mobile overrides too, inside its @media block');
});
}

/* ═══════════════════════ #R302 · from r302-checks.test.mjs ═══════════════════════ */
/* (#R302 — the round's own account of why these checks exist heads its other half, in tests/shell-weather-packs-routing-checks.test.mjs) */
{
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-four times; ask the question of the text that RUNS. */

/* ── ⑭ Atlas hands over the point it resolved, instead of throwing it away ───────────────────
   `case 'sun'` geocoded the place in the sentence, flew to it, and then called `open()` with no
   argument — so the panel answered for the camera's centre, and since `flyTo` had not landed that
   centre was the view the reader had BEFORE they asked. */
/* spelling kept: browser script (js/atlas-console.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R302 ⑭ Atlas passes the coordinate it resolved, and asks when it has none', () => {
  const a = noComments((read('js/atlas-console.js') + '\n' + capsSource()));
  assert.ok(!/IntMapSun\.open\(\);/.test(a), 'the resolved place must not be dropped on the floor');
  assert.ok(!/IntMapSun\.open\(ll\|\|undefined\)/.test(a), '…nor turned back into «no argument»');
  assert.equal((a.match(/IntMapSun\.open\(\{lng:ll\.lng,lat:ll\.lat\}\)/g) || []).length, 2,
    'both sun actions open on the point they resolved');
  /* the seismic arrival times are a function of ONE coordinate and were read at the camera centre */
  assert.ok(!/IntMapSeismic\.at\(c\.lng,c\.lat\)/.test(a), 'arrival times must not be read at the centre');
  assert.match(a, /IntMapSeismic\.at\(h\.lng,h\.lat\)/, '…they are read at the point the reader named');
});
}

/* ═══════════════════════ #R309 · from r309-checks.test.mjs ═══════════════════════ */
/* (#R309 — the round's own account of why these checks exist heads its other half, in tests/shell-map-labels-checks.test.mjs) */
{
/* the comments in this project carry the reasoning, and several of them QUOTE the spellings that
   were replaced — a check that greps them proves nothing (23 rounds of exactly that) */
const code = (p) => codeOnly(read(p));

/* the body of a named function declaration, brace-balanced (#R228 / #R307) */
function fnBody(src, name) {
  /* the three shapes this repository declares a function in — a declaration, a property assignment
     and an arrow — so a check does not go red because the author picked a different one */
  let start = src.indexOf('function ' + name + '(');
  if (start < 0) { const m = new RegExp('\\b' + name + '\\s*=\\s*(?:function\\s*\\(|\\([^)]*\\)\\s*=>)').exec(src); if (m) start = m.index; }
  assert.notEqual(start, -1, 'a function called ' + name + ' exists');
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (!depth) return src.slice(open, i + 1); }
  }
  throw new Error('unbalanced braces in ' + name);
}

/* ══ ③ Atlas のプリセットは、いま見ている地域についての質問である ═══════════════════════════════
   ⚠ THE SUBJECT LIVES IN ITS OWN FILE. js/atlas-console.js is at #R199's 5,300-line ceiling and the
   ceiling is never raised, so the starter chips moved out the way #R199 / #R278 / #R298 all paid —
   which is also why this reads js/atlas-examples.js rather than the console. */
const AC = code('js/atlas-examples.js');

/* ⚠⚠ (#R313) THESE THREE NAMED `_exPlace` AND LOOKED FOR `L(` INSIDE `examples()`. #R313 replaced the
   four templates with a fact-gated POOL — the resolver is `exFacts()`, the substitution is `fill()`,
   and the chip strings live in the pool's own thunks — so all three went red on a change that made
   the feature MORE of what they were written to protect. Rewritten to ask the PROPERTIES rather than
   the identifiers: resolved from the camera, refuses to name a country from a hemisphere, one copy,
   substituted rather than sent literally, redrawn only when the answer changes, and every chip
   reachable by the translation gate. */
/* spelling kept: browser script (js/atlas-console.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ③ the starter chips are resolved from the map, not from a fixed list', () => {
  /* whatever the resolver is called, `examples()` must go through it rather than return constants */
  const ex = fnBody(AC, 'examples');
  assert.ok(/exFacts\(\)/.test(ex), 'examples() asks what is true of what is on screen');
  /* and the console reaches it through an import, not a copy */
  const con = (code('js/atlas-console.js') + '\n' + capsSource());
  assert.ok(/from '\.\/atlas-examples\.js'/.test(con), 'js/atlas-console.js imports the subject');
  assert.ok(!/function examples\(/.test(con), 'and does not keep a second copy of it');
  const place = fnBody(AC, 'exFacts');
  assert.ok(/codeAtPoint\(/.test(place), 'it uses the resolver this file already had');
  assert.ok(/camera\.getCenter\(\)/.test(place), '…at the camera centre');
  assert.ok(/getZoom\(\)/.test(place), '…and refuses to name a country when the view is a hemisphere');
  assert.ok(/2\.5/.test(place), '…which is what the zoom floor is for');
  /* the place-shaped chips must actually substitute, or they would send the literal token */
  assert.ok(/\{place\}/.test(AC), 'the place-shaped chips carry the substitution token');
  assert.ok(/replace\(\/\\\{place\\\}\/g/.test(AC), 'and it is substituted before a chip is drawn');
  assert.ok(!/\{place\}/.test(fnBody(AC, 'renderExamples')),
    'the drawing step never sees an unsubstituted token');
});

/* spelling kept: browser script (js/atlas-examples.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ③ the chips redraw when the subject changes, and only then', () => {
  const r = fnBody(AC, 'renderExamples');
  assert.ok(/exFacts\(\)/.test(r) && /_exKey/.test(r), 'the renderer compares the subject with the one it drew');
  const wire = fnBody(AC, '_wireExampleCamera');
  assert.ok(/onCamera|moveend/.test(wire), 'it is driven by the camera settling');
  assert.ok(/setTimeout/.test(wire), 'debounced rather than per-frame');
});

/* spelling kept: browser script (js/atlas-examples.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r309 ③ every chip is visible to the translation gate', () => {
  /* the old form passed ARRAYS to L(), which js/lang-registry.js only resolves positionally — so
     zh-Hant / zh-Hans / fr / ko silently read English on all four chips while check:i18n reported
     100 %, because scripts/i18n-report.mjs drops an L() whose first argument is not a Literal.
     ⚠ (#R313) the chips are a pool now, so the count is taken over the FILE — but the shape rule is
     unchanged and is what the gate can actually see. */
  assert.ok(!/L\(\s*\[/.test(AC), 'no chip is declared as an array of arrays');
  const calls = (AC.match(/\bL\(\s*'/g) || []).length;
  assert.ok(calls >= 8, 'every chip is an ordinary L() call with a literal first argument (' + calls + ')');
});
}

/* ═══════════════════════ #R483 · from r483-checks.test.mjs ═══════════════════════ */
/* (#R483 — the round's own account of why these checks exist heads its other half, in tests/shell-layer-panel-checks.test.mjs) */
{
const code = (p) => codeOnly(read(p));

/** every CSS declaration block this source spells for `sel`, comments already stripped */
function rulesFor(src, sel) {
  const out = [];
  const needle = sel + '{';
  let i = 0;
  while ((i = src.indexOf(needle, i)) >= 0) {
    const end = src.indexOf('}', i);
    if (end < 0) break;
    out.push(src.slice(i + needle.length, end));
    i = end;
  }
  return out;
}

/* ═══ ④ 吹き出しはガラスになり、白い文字はどこにも残っていない ═════════════════════════ */
/* spelling kept: stylesheet rule (js/atlas-styles.js, css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R483 ④ ユーザー吹き出しは半透明・縁あり・blur ありで、文字はテーマ色', () => {
  const a = code('js/atlas-styles.js');
  const bubble = rulesFor(a, '#atlas-panel .atl-b.u');
  assert.equal(bubble.length, 1, 'one rule paints the user bubble');
  const b = bubble[0];

  assert.match(b, /background:var\(--atlas-glass\)/, 'it is filled with the frosted-glass token');
  assert.doesNotMatch(b, /--atlas-grad/, 'and no longer with the opaque gradient the Atlas tab shares');
  assert.match(b, /color:var\(--text-main\)/, 'the text is the theme colour');
  assert.doesNotMatch(b, /color:#fff/, 'white text cannot survive a translucent fill');
  assert.match(b, /border:1px solid var\(--atlas-glass-edge\)/, 'a hairline edge — half of what reads as glass');
  assert.match(b, /inset 0 1px 0 var\(--atlas-glass-sheen\)/, 'and the inset sheen — the other half');
  assert.match(b, /(?:^|;)backdrop-filter:saturate\(var\(--glass-sat/, 'it blurs through the app-wide glass tokens');
  assert.match(b, /-webkit-backdrop-filter:saturate\(var\(--glass-sat/, 'with the -webkit- twin every real blur in this app carries');

  /* ⚠ Atlas タブの塗りは分けたまま——依頼は吹き出しについてのものだった */
  const cssSrc = codeOnly(read('css/intmap.css'), { lang: 'css' });
  assert.match(cssSrc, /--atlas-grad:linear-gradient/, 'the tab keeps its own opaque token');
});

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('R483 ④ ガラスのトークンは light と dark の両方で定義されている', () => {
  const css = codeOnly(read('css/intmap.css'), { lang: 'css' });
  const root = /:root\{([\s\S]*?)\n\s*\}/.exec(css);
  assert.ok(root, 'the light :root block parses');
  const dark = /\[data-theme="dark"\]\{([\s\S]*?)\n\s*\}/.exec(css);
  assert.ok(dark, 'the dark block parses');
  for (const tok of ['--atlas-glass', '--atlas-glass-edge', '--atlas-glass-sheen', '--atlas-glass-shadow']) {
    assert.ok(root[1].includes(tok + ':'), `${tok} has a light value`);
    /* ⚠ 片方だけだと、そのテーマで var() が空になり、縁も影も黙って消える */
    assert.ok(dark[1].includes(tok + ':'), `${tok} has a dark value too — a token defined once is a surface that breaks in one theme`);
  }
});

/* spelling kept: stylesheet rule (js/atlas-styles.js) — Node has no cascade or layout to evaluate it in. */
test('R483 ④ 吹き出しの中で白を前提にしていたものが、白のまま取り残されていない', () => {
  const a = code('js/atlas-styles.js');

  /* 画像行: 塗りを剥がすなら、縁と blur も剥がす（さもなくば写真の周りにガラス板が残る） */
  const img = rulesFor(a, '#atlas-panel .atl-b.u.atl-imgrow');
  assert.equal(img.length, 1);
  assert.match(img[0], /border:none/, 'the picture row drops the glass edge');
  assert.match(img[0], /(?:^|;)backdrop-filter:none/, 'and the blur');
  assert.match(img[0], /-webkit-backdrop-filter:none/, 'in both spellings');

  /* ファイルチップ: 白地に白文字が残っていないこと */
  const chip = rulesFor(a, '#atlas-panel .atl-b.u .atl-fchip.atl-fchip-msg');
  assert.equal(chip.length, 1, 'the in-bubble file chip still has exactly one rule');
  assert.doesNotMatch(chip[0], /color:#fff/, 'its label is no longer white');
  assert.doesNotMatch(chip[0], /background:rgba\(255,255,255/, 'and its fill is no longer a white wash');
  assert.match(chip[0], /color:var\(--text-main\)/, 'it reads the theme colour, like the bubble around it');
});
}
