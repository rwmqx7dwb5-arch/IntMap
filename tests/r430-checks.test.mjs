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
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import * as walk from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
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

test('r430 ① the bridge carries what the prompt promises, and is cleared on the way out', () => {
  const ev = code('js/news-events.js');
  assert.ok(/open:\s*true/.test(ev), 'openDetail marks the bridge open');
  assert.ok(/body:\s*lines\.join/.test(ev), '…and carries body text');
  assert.ok(/window\._imReader\s*=\s*null/.test(ev),
    'going Back clears it — the pane is closed, so Atlas must stop claiming the user is reading it');
  const ui = code('js/news-ui.js');
  assert.ok(/btn-read[\s\S]{0,600}window\._imReader\s*=\s*\{/.test(ui),
    'the article-mode bridge hangs off the Read click, not off mere rendering');
});

/* ── ② the #R101 button stays removed, with its whole tail ─────────────────────────────── */

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
