// R494 runtime tests — the Atlas reply is laid out by the browser now, so the claims that matter are
// MEASURED in one.
//
// ⚠ WHY THIS SPEC EXISTS AT ALL. #R232's defect was that a heading was spaced twice: the heading rule
// and the paragraph rule each emitted air, 2.05em + 1.5em, and nothing in the code could see the sum.
// Its fix was a post-pass that deleted the spacer element afterwards, and its test asserted the TEXT
// OF THAT POST-PASS — which proves a regex is present, not that the gap is right. #R494 removed both
// the spacer and the post-pass: the gap is now a paragraph's bottom margin against a heading's top
// margin, and adjacent margins COLLAPSE. That is a browser behaviour, so this is the only instrument
// that can confirm it, and it does so by reading pixels off the live DOM.
//
//   #1 the gap above a heading is ONE margin, not the sum of two
//   #2 nested and ordered lists produce real list boxes with real markers
//   #3 the Wrap toggle actually changes how the code block wraps
//   #4 the overflow chip reveals the sources the six-card row could not hold
//   #5 nothing threw
import { test, expect } from '@playwright/test';
import { installHermeticRouting, collectPageDiagnostics } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

const CRITICAL = ['IntMapConsole', 'IntMapAtlasDebug'];
test.describe.configure({ mode: 'serial' });

let page, diag;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState() });
  await installHermeticRouting(context);
  page = await context.newPage();
  diag = collectPageDiagnostics(page);
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction((g) => g.every((k) => typeof window[k] !== 'undefined'), CRITICAL, { timeout: 45_000 });
  /* the Atlas stylesheet is injected when the panel is first built — open it the way a user does */
  await page.evaluate(() => { try { window.IntMapOS.exec('tab.atlas', { source: 'test' }); } catch (_) { /* the panel may already be up */ } });
  await page.waitForFunction(() => [...document.styleSheets].some((sh) => {
    try { return [...sh.cssRules].some((r) => r.selectorText === '.atl-p'); } catch (_) { return false; }
  }), null, { timeout: 20_000 });
});
test.afterAll(async () => { await page?.context()?.close(); });

/* ⚠ THE HOST GOES INSIDE #atlas-panel, NOT ON <body>. Several of the rules under test — the source
   row, its overflow chip, the bubble's own line-breaking — are scoped to `#atlas-panel` in
   js/atlas-styles.js, so a host parked on the body would be measured without them and would report
   whatever the UA stylesheet happens to do. Mount it where a reply actually lives. */
/** Render markdown into a laid-out host inside the Atlas reply column. */
/* ⚠ …AND IT IS TWO ELEMENTS, BECAUSE THE APP'S IS. The Atlas bubble (`.atl-b.a`, 13.5px) is the
   PARENT of the reply body (`.atl-md`, 14px); flattening them into one element would silently
   measure the reply at the bubble's size, because `#atlas-panel .atl-b` outranks `.atl-md`. */
const render = (md) => page.evaluate((src) => {
  const old = document.getElementById('r494-bubble'); if (old) old.remove();
  const bubble = document.createElement('div');
  bubble.id = 'r494-bubble';
  bubble.className = 'atl-b a';
  bubble.style.cssText = 'position:absolute;left:-9999px;top:0;width:380px;';
  const host = document.createElement('div');
  host.id = 'r494-host';
  host.className = 'atl-md';
  bubble.appendChild(host);
  (document.querySelector('#atlas-panel .atl-chat') || document.body).appendChild(bubble);
  host.innerHTML = window.IntMapAtlasDebug.mdMini(src);
  return host.innerHTML.length;
}, md);

test('#1 the gap above a heading is ONE margin, not two added together', async () => {
  await render('本文の段落がここにあります。\n\n## 見出し\n\n次の段落です。\n\n三つめの段落です。');
  const m = await page.evaluate(() => {
    const host = document.getElementById('r494-host');
    const ps = [...host.querySelectorAll('.atl-p')];
    const h = host.querySelector('h2.atl-h2');
    const box = (el) => el.getBoundingClientRect();
    const gapBefore = box(h).top - box(ps[0]).bottom;
    /* the rhythm between two ordinary paragraphs, for comparison */
    const gapBody = box(ps[2]).top - box(ps[1]).bottom;
    const cs = getComputedStyle(h);
    return {
      gapBefore, gapBody,
      headingTopMargin: parseFloat(cs.marginTop),
      paraBottomMargin: parseFloat(getComputedStyle(ps[0]).marginBottom),
      isRealHeading: h.tagName === 'H2',
      spacers: host.querySelectorAll('.atl-gap, div[style*="height:1.5em"]').length,
    };
  });
  expect(m.isRealHeading).toBe(true);
  expect(m.spacers).toBe(0);
  /* ⚠ THE ASSERTION IS `max`, NOT `sum`. Before #R494 the gap was the heading's margin PLUS a 1.5em
     spacer element; if margins were not collapsing it would be ~ the sum, and this would fail. */
  const expected = Math.max(m.headingTopMargin, m.paraBottomMargin);
  expect(m.gapBefore).toBeGreaterThan(expected - 2);
  expect(m.gapBefore).toBeLessThan(expected + 2);
  expect(m.gapBefore).toBeLessThan(m.headingTopMargin + m.paraBottomMargin - 2);
  /* and the ordinary paragraph-to-paragraph rhythm is exactly #R158's 1.5em, unchanged */
  expect(Math.abs(m.gapBody - m.paraBottomMargin)).toBeLessThan(1.5);
  expect(m.paraBottomMargin).toBeGreaterThan(19);   /* 1.5em of the 14px reply body */
});

test('#2 nested and ordered lists are real list boxes with real markers', async () => {
  await render('1. 一つめ\n2. 二つめ\n   - 入れ子\n   - もうひとつ\n3. 三つめ\n');
  const m = await page.evaluate(() => {
    const host = document.getElementById('r494-host');
    const ol = host.querySelector('ol.atl-ol');
    const sub = host.querySelector('li.atl-li ul.atl-ul');
    const box = (el) => el.getBoundingClientRect();
    return {
      ol: !!ol, listStyle: ol ? getComputedStyle(ol).listStyleType : null,
      subNested: !!sub, subStyle: sub ? getComputedStyle(sub).listStyleType : null,
      /* the sub-list must actually be indented past its parent item's text */
      indent: sub ? box(sub.querySelector('li')).left - box(ol.querySelector('li')).left : 0,
      /* a tight list must not be one screen tall — the old div-per-bullet had no notion of tight */
      height: ol ? box(ol).height : 0,
    };
  });
  expect(m.ol).toBe(true);
  expect(m.listStyle).toBe('decimal');
  expect(m.subNested).toBe(true);
  expect(m.subStyle).toBe('circle');
  expect(m.indent).toBeGreaterThan(8);
  expect(m.height).toBeLessThan(220);
});

test('#3 the Wrap toggle changes how the code block wraps', async () => {
  await render('```json\n{"a":1,"b":"' + 'x'.repeat(120) + '"}\n```');
  const before = await page.evaluate(() => {
    const pre = document.getElementById('r494-host').querySelector('.atl-codeblock');
    return { ws: getComputedStyle(pre).whiteSpace, scroll: pre.scrollWidth > pre.clientWidth + 1, h: pre.clientHeight };
  });
  expect(before.ws).toBe('pre');
  expect(before.scroll).toBe(true);

  /* ⚠ `.click()` IN THE PAGE, NOT page.click(). The host is parked off-screen so it can be laid
     out without disturbing the panel, and Playwright's click is a real pointer event that cannot
     reach it. `HTMLElement.click()` still dispatches a BUBBLING click, which is what the
     document-level handler in js/atlas-reply.js listens for — the mechanism under test. */
  await page.evaluate(() => document.querySelector('#r494-host .atl-codewrapbtn').click());
  const after = await page.evaluate(() => {
    const pre = document.getElementById('r494-host').querySelector('.atl-codeblock');
    return { ws: getComputedStyle(pre).whiteSpace, scroll: pre.scrollWidth > pre.clientWidth + 1, h: pre.clientHeight };
  });
  expect(after.ws).toBe('pre-wrap');
  expect(after.scroll).toBe(false);
  expect(after.h).toBeGreaterThan(before.h);

  /* and the highlighter coloured it without becoming markup */
  const tokens = await page.evaluate(() =>
    document.getElementById('r494-host').querySelectorAll('.atl-codeblock .hl-a, .atl-codeblock .hl-n').length);
  expect(tokens).toBeGreaterThan(0);
});

test('#4 the overflow chip reveals the sources the row could not hold', async () => {
  await page.evaluate(() => {
    const old = document.getElementById('r494-src'); if (old) old.remove();
    const host = document.createElement('div');
    host.id = 'r494-src';
    host.style.cssText = 'position:absolute;left:-9999px;top:0;width:380px;';
    (document.querySelector('#atlas-panel .atl-chat') || document.body).appendChild(host);
    const list = Array.from({ length: 9 }, (_, i) => ({ url: 'https://example' + i + '.org/a', title: 'Article ' + i, src: 'Example ' + i }));
    host.innerHTML = window.IntMapAtlasDebug.linkCards(list);
  });
  const before = await page.evaluate(() => ({
    visible: [...document.querySelectorAll('#r494-src .atl-lc')].filter((a) => a.getClientRects().length).length,
    chip: document.querySelector('#r494-src .atl-lc-more')?.textContent,
  }));
  expect(before.visible).toBe(6);
  expect(before.chip).toBe('+3');
  await page.evaluate(() => document.querySelector('#r494-src .atl-lc-more').click());
  const after = await page.evaluate(() => ({
    visible: [...document.querySelectorAll('#r494-src .atl-lc')].filter((a) => a.getClientRects().length).length,
    chip: !!document.querySelector('#r494-src .atl-lc-more'),
  }));
  expect(after.visible).toBe(9);
  expect(after.chip).toBe(false);
});

test('#5 nothing threw', async () => {
  expect(diag.pageErrors, diag.pageErrors.join('\n')).toEqual([]);
});
