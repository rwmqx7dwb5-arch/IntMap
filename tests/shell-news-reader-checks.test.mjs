/* ============================================================================
 *  shell-news-reader-checks — the news feed, the reader pane and what the news surfaces say
 * ----------------------------------------------------------------------------
 *  One subject, gathered from the round-numbered files that each held a piece of it:
 *  tests/r231-checks.test.mjs
 *  tests/r430-checks.test.mjs
 *  tests/r502-checks.test.mjs
 *  tests/r207-checks.test.mjs
 *  tests/r210-checks.test.mjs
 *  Every test keeps its original title (led by the round that wrote it), and every round's own
 *  account of WHY its checks exist is kept above them. Each round's checks sit in their own block
 *  so the helpers it wrote for itself stay its own; the file root and the plain text reader are
 *  shared below.
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

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
const noJs = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')                       /* block comments */
  .replace(/^[ \t]*\/\/.*$/gm, ' ');

/* ── ⑪ the gazetteer index yields to the gesture ────────────────────────────────────────────── */
/* spelling kept: browser script (js/news-context.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R231 performance: the world-gazetteer registration is deadline-bound and yields to the camera', () => {
  const src = read('js/news-context.js');
  assert.ok(!/SLICE=4000/.test(noJs('js/news-context.js')), 'the fixed 4,000-row slice is gone');
  assert.match(src, /deadline\.timeRemaining\(\)>SLACK/, 'the idle deadline decides how much runs');
  assert.match(src, /E\.events\.on\('movestart',\(\)=>\{ moving=true; \}\)/, 'it watches the camera');
  assert.match(src, /if\(moving\)\{ schedule\(\); return; \}/, 'and re-schedules instead of spending a gesture frame');
  /* the 2 s timeout was the part that fired INTO pinches */
  assert.ok(!/\{timeout:2000\}/.test(noJs('js/news-context.js')), 'no 2-second idle timeout left');
  assert.match(src, /\{timeout:20000\}/, 'a background index is allowed to starve on a busy page');
  const batch = src.match(/const BATCH=(\d+);/);
  assert.ok(batch && +batch[1] <= 500, 'a batch is small enough to fit inside one frame');
});
}

/* ═══════════════════════ #R430 · from r430-checks.test.mjs ═══════════════════════ */
/* ============================================================================
 *  #R430 — A BRIDGE WITH A READER AND NO LIVE WRITER
 * ----------------------------------------------------------------------------
 *  js/atlas-console.js `_selectionState()` reads `window._imReader` and turns it into `o.article`;
 *  js/atlas-state.js renders that into the sentence «OPEN NEWS ARTICLE (the user is reading this
 *  right now)» and maps 「この記事 / この出来事 / それ / 詳しく・背景・なぜ / translate this / 現地」
 *  onto it. All of that shipped in #R80 and #R118 and NONE of it ever fired.
 *
 *  ⚠⚠⚠ THE BRIDGE HAD A WRITER — IT JUST HAD NO REACHABLE ONE. `window._imReader` was assigned in
 *  exactly one place, inside `openArticleInSidebar()` (js/article-reader.js), and #R11 pointed the
 *  news card's Read button back at the publisher's own site, so nothing has called that function
 *  since. #R169 recorded the dead chain and left the decision open; a later round re-confirmed it
 *  («is dead code. Confirmed, no change.») — and neither noticed that Atlas's article context hung
 *  off it. So `o.article` was undefined from the day it was written, and Atlas answered 「この記事
 *  について詳しく」with no article in hand.
 *
 *  ⚠⚠⚠ THE VERIFICATION THAT MISSED IT INJECTED THE BRIDGE BY HAND. #R80's measurement was
 *  «`window._imReader` を投入 → `IntMapConsole.state()` に該当行が出現» — it exercised the READER
 *  and never the WRITER. A bridge is only real when someone drives onto it, so ① below asserts the
 *  writer side: the callerless chain stays callerless AND a live surface fills the same bridge.
 *
 *  #R430 fed the bridge from the two places where the user actually opens something to read — the
 *  Event detail (js/news-events.js `openDetail`, the default surface since #R386) and the article
 *  card's Read click (js/news-ui.js) — without re-wiring the in-sidebar reader, which stays exactly
 *  as dead as #R11 left it. ②–⑤ hold the same round's removals down.
 * ==========================================================================*/
{
/* comments stripped: a mention in prose is not a use (#R408) */
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/** Every production JS file, found on disk — never a list written down here (#R399). */
function everyJs(dir) {
  const out = [];
  for (const name of readdirSync(join(ROOT, dir)).sort()) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) { out.push(...everyJs(rel)); continue; }
    if (name.endsWith('.js')) out.push(rel);
  }
  return out;
}
const JS = everyJs('js');
const LOCALES = JS.filter((p) => p.startsWith('js/locales/'));
const SURFACES = [...JS, 'index.html', 'css/intmap.css'];

/* ── ① the Atlas open-article bridge has a writer that can actually run ────────────────── */

/* spelling kept: browser script (js/atlas-console.js, js/atlas-state.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r430 ① the reader side of the _imReader bridge still exists', () => {
  const atlas = code('js/atlas-console.js');
  assert.ok(/window\._imReader/.test(atlas), 'js/atlas-console.js still reads window._imReader');
  assert.ok(/o\.article\s*=/.test(atlas), '…and still builds o.article from it');
  const state = code('js/atlas-state.js');
  assert.ok(/sel\.article/.test(state), 'js/atlas-state.js still renders sel.article into the prompt');
});

test('r430 ① openArticleInSidebar is STILL callerless — the premise of this round', () => {
  const callers = [];
  for (const f of JS) {
    let ast;
    try { ast = parse(read(f), { ecmaVersion: 'latest', sourceType: 'script' }); }
    catch { try { ast = parse(read(f), { ecmaVersion: 'latest', sourceType: 'module' }); } catch { continue; } }
    walk.simple(ast, {
      CallExpression(n) {
        if (n.callee.type === 'Identifier' && n.callee.name === 'openArticleInSidebar') callers.push(f);
      },
    });
  }
  /* If this ever goes red, the in-sidebar reader was re-wired — a product decision (#R169), and the
     moment to re-read whether ① below is still the right shape. It is not a licence to delete this. */
  assert.deepEqual(callers, [],
    'nothing calls openArticleInSidebar(); if that changed, revisit the bridge in js/news-ui.js');
});

/* spelling kept: browser script (js/article-reader.js, js/news-events.js, js/news-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r430 ① a LIVE surface writes window._imReader, not only the dead reader', () => {
  const writers = JS.filter((f) => /window\._imReader\s*=\s*\{/.test(code(f)));
  assert.ok(writers.length >= 1, 'someone assigns the bridge object');
  const live = writers.filter((f) => f !== 'js/article-reader.js');
  assert.ok(live.length >= 1,
    `window._imReader is only written by the callerless reader chain (${writers.join(', ')}) — ` +
    'Atlas would see no open article. Feed it from a surface the user can actually reach.');
  /* both surfaces the user can open something from */
  assert.ok(live.includes('js/news-events.js'), 'the Event detail (the default surface) fills it');
  assert.ok(live.includes('js/news-ui.js'), 'the article card Read click fills it');
});

/* spelling kept: browser script (js/news-events.js, js/app-body.js, js/news-ui.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r430 ① the bridge carries what the prompt promises, and is cleared on the way out', () => {
  const ev = code('js/news-events.js');
  assert.ok(/open:\s*true/.test(ev), 'openDetail marks the bridge open');
  assert.ok(/body:\s*lines\.join/.test(ev), '…and carries body text');
  /* ⚠ (#R435) THE CLEAR MOVED, AND THE INVARIANT GOT WIDER RATHER THAN NARROWER. This asked
     js/news-events.js for the spelling `window._imReader = null`, which was only ever right while the
     Back button was the ONLY way the detail could close. It was not: a tab change, a background
     re-render and the article reader all close the pane too, and none of them ran that line — so
     Atlas went on claiming the reader was reading something that had left the screen. The clear now
     lives in the ONE exit, `closeReaderPane()` (js/app-body.js). Ask for the property, not the
     spelling: the detail leaves through that exit, and that exit clears the bridge. */
  assert.ok(/HOST\.closeReaderPane\(/.test(ev),
    'the Event detail no longer leaves through the one exit');
  assert.ok(/window\._imReader\s*=\s*null/.test(code('js/app-body.js')),
    'the one exit no longer clears the bridge — Atlas would go on claiming the user is reading it');
  const ui = code('js/news-ui.js');
  assert.ok(/btn-read[\s\S]{0,600}window\._imReader\s*=\s*\{/.test(ui),
    'the article-mode bridge hangs off the Read click, not off mere rendering');
});

/* ── ② the #R101 button stays removed, with its whole tail ─────────────────────────────── */

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('r430 ② "Summarize this view" is gone from every surface', () => {
  /* Removed at the user's own request in #R101 («今の表示エリアを要約ボタンはいらない», 12958ef).
     #R101 removed the element and left the function, CSS and strings null-guarded; #R430 removed
     those too. This is NOT an accidental orphan — do not "restore" it without asking. */
  for (const f of SURFACES) {
    assert.ok(!/ai-view-summary-btn/.test(code(f)), `${f} still names ai-view-summary-btn`);
  }
  for (const f of JS) assert.ok(!/aiSummarizeView/.test(code(f)), `${f} still names aiSummarizeView`);
  for (const f of LOCALES) {
    for (const k of ['aiViewSumBtn', 'aiViewSumTitle']) {
      assert.ok(!new RegExp(`\\b${k}\\b`).test(read(f)), `${relative('.', f)} still defines ${k}`);
    }
  }
});

/* spelling kept: browser script (js/tool-panel.js, js/app-body.js, js/locales/ui.en.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('r430 ② the AREA summary — a different, LIVE feature — was not followed into the grave', () => {
  const tp = code('js/tool-panel.js');
  assert.ok(/ai-summarize-btn/.test(tp), 'the measure-tool area summary button still exists');
  assert.ok(/_aiAreaSummarize/.test(tp), '…and still calls the shared summariser');
  assert.ok(/function _aiAreaSummarize/.test(code('js/app-body.js')), '…which still exists');
  const en = read('js/locales/ui.en.js');
  for (const k of ['aiSumTitle', 'aiSumNoNews']) {
    assert.ok(new RegExp(`\\b${k}\\b`).test(en), `${k} is shared with the area summary and must stay`);
  }
});

/* ── ③ no user-facing AI-locate button — CONSTITUTION §5 ───────────────────────────────── */

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('r430 ③ client-side AI news geocoding is gone, and the constitution still forbids it', () => {
  for (const f of SURFACES) {
    assert.ok(!/ai-geocode-btn/.test(code(f)), `${f} still names ai-geocode-btn`);
    assert.ok(!/aiGeocodeNews/.test(code(f)), `${f} still names aiGeocodeNews`);
  }
  for (const f of LOCALES) {
    for (const k of ['aiGeoBtnSub', 'aiGeoBtnPub', 'aiGeoBusy', 'aiGeoNone', 'aiGeoErr', 'aiGeoDone']) {
      assert.ok(!new RegExp(`\\b${k}\\b`).test(read(f)), `${relative('.', f)} still defines ${k}`);
    }
  }
  const c = read('CONSTITUTION.md');
  assert.ok(/ユーザー向けの「AIで解析」ボタンも作らない/.test(c),
    'CONSTITUTION §5 still says the frontend gets no AI-locate button — this removal follows it');
  /* the row container survives: it still holds the LIVE "Translate titles" button */
  assert.ok(/ai-geocode-row/.test(read('index.html')), '#ai-geocode-row still hosts #ai-translate-btn');
  assert.ok(/ai-translate-btn/.test(read('index.html')), '…and that button is still there');
});

/* ── ④ the confirmed CSS orphans stay deleted ──────────────────────────────────────────── */

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('r430 ④ the orphan selectors are gone from every stylesheet and every injected rule', () => {
  const gone = ['news-pin-toggle', 'nrp-note', 'nrp-close'];
  for (const f of SURFACES) {
    for (const sel of gone) assert.ok(!new RegExp(sel).test(code(f)), `${f} still names .${sel}`);
  }
  const css = read('css/intmap.css');
  /* the legacy in-sidebar reader skin that labelled itself "unused but referenced" — it was not
     referenced: nothing outside css/ has ever contained the spelling `nr-` (measured #R430). */
  assert.ok(!/(^|[\s,])\.nr-/m.test(css), 'the .nr-* legacy reader skin is gone');
  /* (?![-\w]), not \b: `.news-reader-pane` is LIVE and a word boundary sits before its hyphen. */
  assert.ok(!/(^|[\s,])\.news-reader(?![-\w])/m.test(css), '.news-reader is gone');
});

/* spelling kept: stylesheet rule (css/intmap.css) — Node has no cascade or layout to evaluate it in. */
test('r430 ④ the LIVE reader pane and its skin were NOT taken with them', () => {
  /* #R386's Event detail draws into #news-reader-pane, and the .nrp-* skin still dresses the
     article reader the product has not yet decided to delete (#R169). Over-deletion is the risk
     this test exists to catch. */
  assert.ok(/id="news-reader-pane"/.test(read('index.html')), 'the pane element survives');
  assert.ok(/news-reader-pane/.test(read('css/intmap.css')), '…and its rule survives');
  assert.ok(/news-reader-pane/.test(code('js/news-events.js')), '…and the Event detail still draws into it');
  const css = read('css/intmap.css');
  for (const sel of ['nrp-bar', 'nrp-body', 'nrp-iframe', 'nrp-title']) {
    assert.ok(new RegExp(`\\.${sel}\\b`).test(css), `.${sel} is still dressed`);
  }
});

/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('r430 ④ #news-pin-toggle was orphaned by a RENAME, not by the pin mode being retired', () => {
  /* Two separate events, and conflating them is why this skin sat unnoticed for so long:
       Round 5  — the Subject/Publisher segment moved OUT of its own labelled card
                  (`#news-pin-toggle`) into the shared `#news-filter-toggle` row. The feature was
                  untouched; only the outer card's markup went, stranding its CSS. `git log -S`
                  puts the markup removal in 4709f5d, and NOWHERE near #R416.
       #R416    — the Subject/Publisher pin mode itself was retired (the pin is now simply where
                  the story happened), which is a different removal entirely.
     #R430 deletes only the Round-5 skin. If the second line below ever goes red, #R416 was
     reverted — and that is a product decision, not a licence to resurrect this CSS. */
  const html = read('index.html');
  assert.ok(/id="news-filter-toggle"/.test(html), 'the container that absorbed the segment survives');
  assert.ok(!/pinmode-loc|pinmode-pub/.test(html), '#R416 retired the pin mode itself');
  /* and it left nothing unguarded behind — an id-less getElementById().onclick is a live crash */
  for (const f of JS) {
    assert.ok(!/getElementById\(['"]pinmode-[a-z]+['"]\)/.test(code(f)),
      `${f} still looks up a pinmode element that #R416 removed`);
  }
});
}

/* ═══════════════════════ #R502 · from r502-checks.test.mjs ═══════════════════════ */
/* (#R502 — the round's own account of why these checks exist heads its other half, in tests/shell-index-document-checks.test.mjs) */
{
/* その行に並ぶシングルクォート文字列を順に取り出す（`L(…)` の位置引数を数えるため）。 */
function quoted(line) {
  return [...line.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]);
}

/* ── AI が書いたことの表示 ──────────────────────────────────────────────────── */

const NEWS = read('js/news-events.js');
const NOTE_LINE = NEWS.split(/\r?\n/).find((l) => l.includes('ev-d-note ev-ai'));

/* spelling kept: browser script (js/locales/ui.fr.js, js/locales/ui.ko.js, js/locales/ui.zh-hans.js, …) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R502 ⑤: 統合文の注記が 9 言語すべてで AI と名乗る', () => {
  assert.ok(NOTE_LINE, 'js/news-events.js に `ev-ai` の注記が無い');
  const args = quoted(NOTE_LINE);
  /* 0 番は `<p class=…>`、末尾は `</p>`。あいだの 5 つが L() の位置引数 en/ja/de/ru/es。 */
  const [en, ja, de, ru, es] = args.slice(1, 6);
  for (const [lang, text, marker] of [
    ['en', en, /\bAI\b/], ['ja', ja, /AI/], ['de', de, /\bKI\b/], ['ru', ru, /ИИ/], ['es', es, /\bIA\b/],
  ]) {
    assert.ok(text, `${lang} の位置引数が無い`);
    assert.match(text, marker, `${lang} の注記が AI を名乗っていない: «${text}»`);
  }

  /* 位置引数を持たない 4 言語は inline table のキーで引かれる。#R492 の教訓どおり、
     **キーは英語の原文そのもの**なので、英語を書き換えたらここも同じコミットで動く。 */
  for (const [file, marker] of [
    ['js/locales/ui.fr.js', /\bIA\b/], ['js/locales/ui.ko.js', /AI/],
    ['js/locales/ui.zh-hans.js', /AI/], ['js/locales/ui.zh.js', /AI/],
  ]) {
    const line = read(file).split(/\r?\n/).find((l) => l.includes(en));
    assert.ok(line, `${file} に英語キー «${en.slice(0, 40)}…» の行が無い（英語だけ書き換えられている）`);
    const v = quoted(line)[1];
    assert.ok(v, `${file} の訳文が読めない`);
    assert.match(v, marker, `${file} の訳文が AI を名乗っていない: «${v}»`);
  }
});

/* spelling kept: browser script (js/news-events.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R502 ⑥: その注記は畳まれた <details> より前に出る', () => {
  /* 但し書きが「根拠の原文（n 件）」という畳まれた行の *下* に居ると、AI が書いた段落と
     表示のあいだに 1 行入る。要素は足していない——順番だけを固定する。 */
  const iNote = NEWS.indexOf(`html += '<p class="ev-d-note ev-ai">'`);
  const iDetails = NEWS.indexOf(`html += '<details class="ev-syn-ev"><summary>'`);
  assert.ok(iNote > 0 && iDetails > 0, '注記か <details> が見つからない');
  assert.ok(iNote < iDetails, 'AI の注記が <details> の後ろに戻っている');
});
}

/* ═══════════════════════ #R207 · from r207-checks.test.mjs ═══════════════════════ */
/* (#R207 — the round's own account of why these checks exist heads its other half, in tests/shell-panels-tools-checks.test.mjs) */
{
/* ── ⑧ the news outlet filter, and the two selectors that now match ────────────────────────────── */
/* spelling kept: page markup / inline script (index.html) — only a browser document runs it. */
test('R207 ⑧ the outlet filter defaults to "everything" and the country picker gained the language picker\'s shape', () => {
  const n = read('js/news-sources.js');
  assert.ok(/if\(!Array\.isArray\(sel\)\|\|!sel\.length\) return true;/.test(n),
    'an empty selection means every outlet — the only honest reading of "nothing ticked" for this filter');
  const s = read('js/app-body.js');
  assert.ok(/newsSources:window\.imNewsSources/.test(s), 'and it is persisted with the rest');
  /* ⚠ the core does not grow: both pickers live in the module, and app-body keeps only the question
     it has to ask — which FAILS OPEN, so a build without the module shows every outlet, not none */
  assert.ok(/return N\?N\.allows\(pub\):true/.test(s), 'the filter fails open when the module is absent');
  assert.ok(/renderCountries|commitCountries/.test(n), 'the by-country picker moved here too');
  const h = read('index.html');
  /* the invariant is that the two blocks have the SAME parts, not that they contain given text */
  for (const kind of ['newslang', 'newscountry', 'newssource']) {
    assert.ok(h.includes(`id="${kind}-dd"`), `${kind} has the dropdown`);
    assert.ok(h.includes(`id="${kind}-multi"`), `${kind} has the panel`);
    assert.ok(h.includes(`id="${kind}-hint"`), `${kind} has the hint below the control`);
  }
  assert.ok(/id="setting-newscountry"/.test(h) && /id="setting-newssource"/.test(h),
    'both new blocks lead with a mode select, like the language block');
});
}

/* ═══════════════════════ #R210 · from r210-checks.test.mjs ═══════════════════════ */
/* (#R210 — the round's own account of why these checks exist heads its other half, in tests/shell-data-layers-checks.test.mjs) */
{
const rd = read;

/* spelling kept: browser script (js/news-ui.js, js/app-body.js) — it runs against window, the DOM and the live map; the claim is what its code says or calls. */
test('R210 ④: ★ Saved is not a filter over the live feed any more', () => {
  const news = rd('js/news-ui.js');
  assert.match(news, /intmap_saved_articles/, 'a snapshot store exists');
  assert.match(news, /function publishSaved\(\)\{/, 'published from a FUNCTION — a factory body may only declare (#R168 ④)');
  assert.match(news, /merge\(feed,links\)/, 'and it can hand back what the feed no longer carries');
  const body = rd('js/app-body.js');
  assert.match(body, /window\.IntMapNewsSaved\.merge\(globalData,bookmarks\)/,
    'the saved view is built from feed + snapshot, not from the feed alone');
  /* the authority must stay where it was: the star is never inferred from the cache */
  /* ⚠ (#R386) ONE predicate now answers for both surfaces, and each half keeps its own authority:
     an ARTICLE's star is `bookmarks` (the DB row or localStorage), an EVENT's star is
     `saved_news_events` keyed by public_id. Neither is ever read out of the article SNAPSHOT — that
     is the cache, and inferring the star from the cache is what this test exists to forbid. */
  assert.match(body, /const starred=\(it\)=>it\._event \? !!\(EV\(\)&&EV\(\)\.isSaved\(it\._event\.publicId\)\) : bookmarks\.includes\(it\.link\);/,
    'membership is still decided by bookmarks / saved_news_events, never by the snapshot');
  assert.match(body, /currentMode==='saved'&&!starred\(it\)\)return false;/,
    'and the saved view filters on exactly that predicate');
  assert.match(body, /newsSurfaceMode\(\)!=='events'\)\?window\.IntMapNewsSaved\.merge/,
    'the article snapshot is never merged into an event surface');
});
}
