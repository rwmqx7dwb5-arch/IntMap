/* ============================================================================
 *  atlas-float-text-glow — the floating Atlas, MEASURED in the real page (computed styles, not spellings)
 * ----------------------------------------------------------------------------
 *  The reader's standing asks for the floating card:
 *    ① every piece of text carries a glow on its GLYPHS (text-shadow);
 *    ② no rectangle stands in for that glow — no fill, drop shadow or blurred plate on any piece of the card;
 *    ③ the reader's own message is a BUBBLE (a visible fill and edge), the panel's own, on a light map and a dark one.
 *  Every element of the card is walked, including pieces that no stylesheet rule names (a made-up tag below stands for
 *  "what is added tomorrow"), so a new part cannot dodge the rule by being new.
 * ==========================================================================*/
import { test, expect } from '@playwright/test';
import { installHermeticRouting } from './helpers/network.js';
import { seededStorageState } from './helpers/session-seed.js';

test.describe.configure({ mode: 'serial' });

let page;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: seededStorageState(), viewport: { width: 1280, height: 800 } });
  await installHermeticRouting(context);
  page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForFunction(() => { try { return !!window.__imap && window.__imap.isStyleLoaded(); } catch (_) { return false; } }, null, { timeout: 60_000 });
  await page.evaluate(async () => {
    await window.IntMapLazy.need('atlasConsole');
    const s = document.getElementById('setting-atlas-display'); s.value = 'float'; s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => { const f = document.getElementById('atlas-float'); return f && f.classList.contains('on') && f.querySelector('.atl-chat'); }, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const chat = document.querySelector('#atlas-float .atl-chat');
    const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; parent.appendChild(e); return e; };
    chat.replaceChildren();
    el('div', 'atl-b u', chat, 'What changed in Japan after 1871?');
    const md = el('div', 'atl-md', el('div', 'atl-b a', chat));
    el('h3', '', md, 'Prefectures');
    const p = el('p', '', md, 'The domains became '); el('code', 'atl-code-i', p, 'ken');
    el('li', 'atl-li', el('ul', 'atl-ul', md), 'Osaka');
    const tb = el('tbody', '', el('table', '', md)); el('th', '', el('tr', '', tb), 'Year'); el('td', '', el('tr', '', tb), '1871'); el('td', '', el('tr', '', tb), '1872');
    el('button', '', md, 'Show on map');
    const aside = el('aside', '', md); aside.id = 'atl-test-new'; el('em', '', aside, 'a part nobody wrote a rule for');
    el('div', 'atl-srcs', md.parentElement, 'Sources: Wikipedia');
  });
});
test.afterAll(async () => { await page.context().close(); });

const measure = () => page.evaluate(() => {
  const root = document.getElementById('atlas-float');
  const clear = (c) => c === 'transparent' || /^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);
  const noGlow = [], plates = []; let bubble = null;
  root.querySelectorAll('*').forEach((e) => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    const cs = getComputedStyle(e);
    if (e.matches('.atl-b.u')) { bubble = { fill: cs.backgroundImage !== 'none' || !clear(cs.backgroundColor), edge: cs.borderTopWidth !== '0px' && !clear(cs.borderTopColor), w: r.width, h: r.height }; return; }
    if (e.closest('.atl-b.u')) return;
    const text = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || e.tagName === 'INPUT' || e.tagName === 'TEXTAREA';
    if (text && cs.textShadow === 'none') noGlow.push((e.className || e.tagName) + '');
    const bad = [];
    if (cs.backgroundImage !== 'none' || !clear(cs.backgroundColor)) bad.push('fill');
    if (cs.boxShadow !== 'none') bad.push('box-shadow');
    if (cs.backdropFilter && cs.backdropFilter !== 'none') bad.push('backdrop');
    if (bad.length) plates.push((e.className || e.tagName) + ':' + bad.join('+'));
  });
  const neu = getComputedStyle(document.querySelector('#atl-test-new em')).textShadow;
  return { noGlow, plates, bubble, neu };
});

for (const theme of ['dark', 'light']) {
  test(`floating Atlas on a ${theme} map: glow on every glyph, no plate, the reader's bubble is there`, async () => {
    await page.evaluate((t) => { const s = document.getElementById('setting-theme'); s.value = t; s.dispatchEvent(new Event('change', { bubbles: true })); }, theme);
    await page.waitForTimeout(800);
    const m = await measure();
    expect(m.noGlow, 'text without a glow').toEqual([]);
    expect(m.plates, 'a fill, shadow or blurred plate behind a piece of the card').toEqual([]);
    expect(m.neu, 'a part no rule names still glows').not.toBe('none');
    expect(m.bubble, 'the reader\'s message exists').not.toBeNull();
    expect(m.bubble.fill, 'the bubble has a fill').toBe(true);
    expect(m.bubble.edge, 'the bubble has an edge').toBe(true);
  });
}
